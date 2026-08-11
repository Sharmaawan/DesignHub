import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { Page, VideoData, AudioData } from '../types';
import EditorCanvas from '../components/editor/EditorCanvas';
import { createTimelineClock, TimelineClock } from './timelineClock';

export type ExportResolution = '720p' | '1080p' | '4k';
export type ExportFps = 30 | 60;

export interface VideoExportProgress {
  phase: 'preparing' | 'recording' | 'transcoding';
  pct: number; // 0-100 within the current phase
}

export interface VideoExportOptions {
  resolution: ExportResolution;
  fps: ExportFps;
  onProgress?: (p: VideoExportProgress) => void;
}

// "1080p"/"720p"/"4k" map to the long edge, same convention standard video
// resolution names use — this keeps arbitrary-aspect-ratio designs (a 1080x1920
// portrait Reel is exactly as valid a "1080p" export as a 1920x1080 landscape one)
// scaling correctly regardless of orientation.
const RESOLUTION_LONG_EDGE: Record<ExportResolution, number> = {
  '720p': 1280,
  '1080p': 1920,
  '4k': 3840,
};

let ffmpegSingleton: FFmpeg | null = null;

// Loaded from a CDN the first time an export actually runs — this wasm core is
// ~25-30MB, no reason to bundle it into the app's own build and slow down every
// page load for a feature most designs never touch.
async function loadFfmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton;
  const ffmpeg = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  const ffmpegBaseURL = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm';
  // @ffmpeg/ffmpeg internally spawns its own module Worker to run the core off the
  // main thread — browsers refuse `new Worker(crossOriginURL)` outright regardless
  // of origin (confirmed: fails with a SecurityError even from a real http origin,
  // not just from opaque/blob origins), so the worker script itself must be a
  // same-origin blob: URL. But worker.js has its own relative imports
  // ("./const.js" etc.) which fail to resolve once it's served from a blob: URL
  // (blobs have no meaningful base path for relative module resolution) — that
  // failure doesn't throw, it just hangs the worker's module graph forever, which
  // is why export used to get stuck at "Encoding MP4… 0%" with no error ever
  // surfacing. Fix: rewrite worker.js's relative specifiers to absolute CDN URLs
  // before blob-ifying it — absolute cross-origin ESM imports work fine inside a
  // worker's module graph, it's only the top-level Worker(url) construction that
  // must be same-origin.
  const workerSrc = await (await fetch(`${ffmpegBaseURL}/worker.js`)).text();
  const rewrittenWorkerSrc = workerSrc.replace(
    /from\s+["'](\.\/[^"']+)["']/g,
    (_m, relPath) => `from "${ffmpegBaseURL}/${relPath.slice(2)}"`
  );
  const classWorkerURL = URL.createObjectURL(new Blob([rewrittenWorkerSrc], { type: 'text/javascript' }));
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    classWorkerURL,
  });
  ffmpegSingleton = ffmpeg;
  return ffmpeg;
}

function pickRecorderMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

// Mounts a real, isolated EditorCanvas instance off-screen (fixed position, far off
// the visible viewport rather than display:none, so Konva actually lays it out and
// draws to it) so the export can capture pixel-identical output to the live
// editor/preview without touching anything the user is currently looking at.
export function mountOffscreenCanvas(page: Page, width: number, height: number, scale: number) {
  return new Promise<{ canvas: HTMLCanvasElement; clock: TimelineClock; root: Root; container: HTMLDivElement }>((resolve, reject) => {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-100000px';
    container.style.top = '0px';
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);

    const clock = createTimelineClock();
    const root = createRoot(container);
    root.render(createElement(EditorCanvas, { page, zoomOverride: scale, panOverride: { x: 0, y: 0 }, hideChrome: true, clock }));

    let attempts = 0;
    const tryFind = () => {
      const canvas = container.querySelector('canvas');
      if (canvas) {
        resolve({ canvas: canvas as HTMLCanvasElement, clock, root, container });
        return;
      }
      attempts++;
      if (attempts > 120) {
        reject(new Error('Timed out preparing the export canvas'));
        return;
      }
      requestAnimationFrame(tryFind);
    };
    requestAnimationFrame(tryFind);
  });
}

export function canExportVideo(): boolean {
  return typeof HTMLCanvasElement !== 'undefined'
    && 'captureStream' in HTMLCanvasElement.prototype
    && typeof MediaRecorder !== 'undefined';
}

export async function exportPageAsMp4(page: Page, options: VideoExportOptions): Promise<Blob> {
  const { resolution, fps, onProgress } = options;
  if (!page.duration || page.duration <= 0) {
    throw new Error('This page has no video timeline set up yet — open the Timeline panel, add your video/audio to tracks, and set a scene duration first.');
  }
  if (!canExportVideo()) {
    throw new Error("This browser doesn't support video export (needs canvas.captureStream + MediaRecorder). Try a recent Chrome or Edge.");
  }

  onProgress?.({ phase: 'preparing', pct: 0 });

  const longEdge = RESOLUTION_LONG_EDGE[resolution];
  const rawScale = longEdge / Math.max(page.width, page.height);
  // H.264 requires even width/height — round to the nearest even pixel, then derive
  // the actual scale from that (not the raw target) so the offscreen canvas and the
  // page render at exactly the same size, with no last-pixel mismatch.
  const captureWidth = Math.max(2, Math.round((page.width * rawScale) / 2) * 2);
  const captureHeight = Math.max(2, Math.round((page.height * rawScale) / 2) * 2);
  const scale = captureWidth / page.width;

  const { canvas, clock, root, container } = await mountOffscreenCanvas(page, captureWidth, captureHeight, scale);

  let audioCtx: AudioContext | null = null;

  try {
    clock.setDuration(page.duration);
    clock.seek(0);

    // Wait for every clocked video/audio clip to actually finish loading and
    // register with the clock — each is a fresh <video>/<audio> element in this
    // isolated offscreen instance, so even a locally-hosted clip needs a moment to
    // fetch metadata and fire 'loadeddata'. A flat short delay here isn't enough:
    // proceeding before registration completes silently builds the Web Audio graph
    // with zero connected sources, which produces a "live" but permanently
    // sample-less audio track — and mixing that into the recorder's combined
    // stream causes MediaRecorder to output literally 0 bytes for the WHOLE
    // recording (video included), with no error ever surfacing.
    const expectedMediaCount = page.elements.filter((e) => e.trackId && (e.type === 'video' || e.type === 'audio')).length;
    const registrationDeadline = Date.now() + 10000;
    while (clock.getRegisteredElements().length < expectedMediaCount && Date.now() < registrationDeadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    // Give Konva a moment to actually paint the t=0 frame before we start capturing —
    // otherwise the first recorded frame or two can be blank.
    await new Promise((r) => setTimeout(r, 200));

    const videoStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(fps);

    // --- Audio: mix every registered clip's real audio output into one track ---
    audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const dest = audioCtx.createMediaStreamDestination();
    for (const { id, el } of clock.getRegisteredElements()) {
      const pageEl = page.elements.find((e) => e.id === id);
      if (!pageEl) continue;
      let muted = false;
      let volume = 1;
      if (pageEl.type === 'video') {
        // The editor mutes video by default purely so it doesn't blare while you're
        // working — that's an editing-time safety default, not a statement that the
        // exported file should be silent. Only an explicit `muted: true` on the clip
        // carries through to export.
        muted = (pageEl.data as VideoData).muted === true;
        // createMediaElementSource() taps the element's raw decoded audio, bypassing
        // its own .volume entirely — has to be applied via the gain node instead, same
        // as audio clips, or the inspector's video Volume slider would only affect the
        // live editor and silently do nothing in the exported file.
        volume = (pageEl.data as VideoData).volume ?? 1;
      } else if (pageEl.type === 'audio') {
        muted = (pageEl.data as AudioData).muted === true;
        volume = (pageEl.data as AudioData).volume ?? 1;
      }
      if (muted || volume <= 0) continue;
      try {
        const source = audioCtx.createMediaElementSource(el);
        const gain = audioCtx.createGain();
        gain.gain.value = volume;
        source.connect(gain).connect(dest);
      } catch {
        // A cross-origin clip whose host never actually sent CORS headers throws here
        // despite crossOrigin='anonymous' being set — skip just that clip's audio
        // rather than aborting the whole export over one bad source.
      }
    }

    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    const mimeType = pickRecorderMimeType();
    const recorder = new MediaRecorder(combinedStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 8_000_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const recordingDone = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      recorder.onerror = (e: any) => reject(e.error || new Error('Recording failed'));
    });

    onProgress?.({ phase: 'recording', pct: 0 });
    recorder.start(200);

    const durationMs = page.duration;
    const unsubUi = clock.subscribeUi((ms) => {
      onProgress?.({ phase: 'recording', pct: Math.min(100, Math.round((ms / durationMs) * 100)) });
    });
    clock.play();
    await new Promise<void>((resolve) => {
      const unsubEnd = clock.onEnd(() => { unsubEnd(); resolve(); });
    });
    unsubUi();
    recorder.stop();
    const webmBlob = await recordingDone;
    onProgress?.({ phase: 'recording', pct: 100 });

    // --- Transcode the captured WebM into true H.264 + AAC MP4 ---
    onProgress?.({ phase: 'transcoding', pct: 0 });
    const ffmpeg = await loadFfmpeg();
    const handleFfmpegProgress = ({ progress }: { progress: number }) => {
      onProgress?.({ phase: 'transcoding', pct: Math.max(0, Math.min(100, Math.round(progress * 100))) });
    };
    ffmpeg.on('progress', handleFfmpegProgress);
    try {
      await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));
      await ffmpeg.exec([
        '-i', 'input.webm',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k',
        '-r', String(fps),
        'output.mp4',
      ]);
      const data = await ffmpeg.readFile('output.mp4');
      await ffmpeg.deleteFile('input.webm');
      await ffmpeg.deleteFile('output.mp4');
      onProgress?.({ phase: 'transcoding', pct: 100 });
      // ffmpeg.wasm's Uint8Array is always ArrayBuffer-backed at runtime (this build
      // never uses SharedArrayBuffer) — the cast just works around TS's overly broad
      // ArrayBufferLike typing for readFile's return value.
      return new Blob([data as any], { type: 'video/mp4' });
    } finally {
      ffmpeg.off('progress', handleFfmpegProgress);
    }
  } finally {
    clock.pause();
    if (audioCtx) audioCtx.close().catch(() => {});
    root.unmount();
    container.remove();
  }
}
