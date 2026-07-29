import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import EditorCanvas from './EditorCanvas';
import { createTimelineClock } from '../../lib/timelineClock';
import { HiOutlineX, HiOutlineChevronLeft, HiOutlineChevronRight, HiOutlinePlay, HiOutlinePause } from 'react-icons/hi';

interface PreviewModeProps {
  open: boolean;
  onClose: () => void;
}

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PreviewMode({ open, onClose }: PreviewModeProps) {
  const pages = useEditorStore((s) => s.pages);
  const [previewIndex, setPreviewIndex] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  // Fit is computed locally and passed into EditorCanvas as an override — the canvas
  // never reads the live editor's own zoom/pan/grid/ruler state while in preview, so
  // there's nothing shared to save or restore, and no risk of preview's fit-zoom
  // leaking back into the real editor view.
  const [fit, setFit] = useState<{ zoom: number; pan: { x: number; y: number } } | null>(null);

  // Preview gets its own isolated playback clock (created once, for this component's
  // whole lifetime) instead of the live editor's — both can be mounted at once (the
  // editor canvas stays mounted underneath this overlay), and they must not fight over
  // a single shared playhead. See lib/timelineClock.ts.
  const clockRef = useRef(createTimelineClock());
  const [isScenePlaying, setIsScenePlaying] = useState(false);
  const [scenePlayheadMs, setScenePlayheadMs] = useState(0);
  const page = pages[previewIndex];
  const sceneDuration = page?.duration || 0;

  useEffect(() => {
    if (open) setPreviewIndex(useEditorStore.getState().currentPageIndex);
    else setFit(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = frameRef.current;
    if (!page || !frame) return;

    const recompute = () => {
      const { width: fw, height: fh } = frame.getBoundingClientRect();
      if (fw < 1 || fh < 1) return;
      const fitZoom = Math.min(fw / page.width, fh / page.height);
      const panX = (fw - page.width * fitZoom) / 2;
      const panY = (fh - page.height * fitZoom) / 2;
      setFit({ zoom: fitZoom, pan: { x: panX, y: panY } });
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [open, page]);

  // Drive this scene's clock: reset + autoplay whenever the previewed page changes (or
  // preview opens), and stop cleanly when preview closes. A page with no duration (a
  // plain static design) never touches the clock at all — same manual-only experience
  // as before this feature existed.
  useEffect(() => {
    const clock = clockRef.current;
    if (!open || !page) {
      clock.pause();
      return;
    }
    clock.setDuration(sceneDuration);
    clock.seek(0);
    if (sceneDuration > 0) clock.play();
    return () => clock.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, previewIndex, sceneDuration]);

  useEffect(() => {
    const clock = clockRef.current;
    const unsubUi = clock.subscribeUi((ms) => setScenePlayheadMs(ms));
    const unsubTick = clock.subscribe(() => setIsScenePlaying(clock.getIsPlaying()));
    return () => { unsubUi(); unsubTick(); };
  }, []);

  const goToPage = useCallback((index: number) => {
    setPreviewIndex((i) => Math.max(0, Math.min(pages.length - 1, index === i ? i : index)));
  }, [pages.length]);

  // At the end of an auto-playing scene: advance to the next scene (which re-triggers
  // the effect above to reset+autoplay it) or just stop on the last one.
  useEffect(() => {
    const clock = clockRef.current;
    return clock.onEnd(() => {
      setPreviewIndex((i) => (i < pages.length - 1 ? i + 1 : i));
    });
  }, [pages.length]);

  const toggleScenePlay = () => {
    const clock = clockRef.current;
    if (clock.getIsPlaying()) clock.pause();
    else clock.play();
    setIsScenePlaying(clock.getIsPlaying());
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goToPage(previewIndex + 1);
      if (e.key === 'ArrowLeft') goToPage(previewIndex - 1);
      if (e.key === ' ' && sceneDuration > 0) { e.preventDefault(); toggleScenePlay(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, previewIndex, goToPage, sceneDuration]);

  if (!open) return null;
  if (!page) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-gray-900 flex flex-col">
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-white text-sm font-medium">Preview</span>
        <span className="text-gray-400 text-xs">{previewIndex + 1} / {pages.length}</span>
        <button onClick={onClose} className="text-gray-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10" title="Close preview (Esc)">
          <HiOutlineX size={20} />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center relative overflow-hidden px-16 pb-8">
        <button
          onClick={() => goToPage(previewIndex - 1)}
          disabled={previewIndex === 0}
          className="absolute left-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed"
          title="Previous page"
        >
          <HiOutlineChevronLeft size={24} />
        </button>
        {/* pointer-events-none: reuses the real canvas renderer for pixel-accurate
            output, but nothing here should ever be clickable/draggable — this frame
            tracks its own previewIndex and its own fit zoom/pan, entirely separate
            from the live editor's state. */}
        <div ref={frameRef} className="pointer-events-none overflow-hidden" style={{ width: '80vw', height: '70vh' }}>
          {fit && (
            <EditorCanvas page={page} zoomOverride={fit.zoom} panOverride={fit.pan} hideChrome clock={clockRef.current} />
          )}
        </div>
        <button
          onClick={() => goToPage(previewIndex + 1)}
          disabled={previewIndex === pages.length - 1}
          className="absolute right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next page"
        >
          <HiOutlineChevronRight size={24} />
        </button>
      </div>

      {/* Scene transport — only shown for scenes that actually have a timeline (a
          duration set); plain static designs keep the manual-only experience above. */}
      {sceneDuration > 0 && (
        <div className="flex items-center gap-3 px-6 pb-5">
          <button
            onClick={toggleScenePlay}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-gray-900 hover:bg-gray-200 transition-colors flex-shrink-0"
            title={isScenePlaying ? 'Pause' : 'Play'}
          >
            {isScenePlaying ? <HiOutlinePause size={16} /> : <HiOutlinePlay size={16} className="ml-0.5" />}
          </button>
          <span className="text-gray-400 text-xs font-mono flex-shrink-0 w-20">
            {formatTime(scenePlayheadMs)} / {formatTime(sceneDuration)}
          </span>
          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{ width: `${Math.min(100, (scenePlayheadMs / sceneDuration) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
