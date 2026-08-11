import { useMemo, useRef, useState, useEffect } from 'react';
import { useEditorStore } from '../../../stores/editorStore';
import { timelineClock } from '../../../lib/timelineClock';
import { CanvasElement, Track } from '../../../types';
import { uploadAPI, BACKEND_ORIGIN as BACKEND } from '../../../utils/api';
import toast from 'react-hot-toast';
import {
  HiOutlinePlay, HiOutlinePause, HiOutlineStop, HiOutlinePlus, HiOutlineTrash,
  HiOutlineFilm, HiOutlineMusicNote, HiOutlineDocumentText, HiOutlineViewGrid,
} from 'react-icons/hi';
import TimelineClip, { msToPx, pxToMs } from './TimelineClip';

const DEFAULT_CLIP_MS = 3000;
const DURATION_PRESETS = [
  { label: '5s', ms: 5000 },
  { label: '10s', ms: 10000 },
  { label: '15s', ms: 15000 },
  { label: '30s', ms: 30000 },
];
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const DEFAULT_ZOOM_INDEX = 3; // 1x

const TRACK_ICON: Record<Track['type'], typeof HiOutlineFilm> = {
  video: HiOutlineFilm,
  text: HiOutlineDocumentText,
  audio: HiOutlineMusicNote,
};

function formatClock(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function elementLabel(el: CanvasElement) {
  if (el.type === 'text') return (el.data as any).content?.slice(0, 24) || 'Text';
  return el.name || el.type;
}

export default function TimelinePanel() {
  const {
    pages, currentPageIndex, setPageDuration, addTrack, removeTrack,
    assignElementToTrack, selectElement, selectedElementIds, addElement, pushHistory,
    isPlaying, setIsPlaying, playheadMs,
  } = useEditorStore();

  const page = pages[currentPageIndex];
  const duration = page?.duration || 0;
  const tracks = page?.tracks || [];
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const zoom = ZOOM_STEPS[zoomIndex];
  const [customDurationInput, setCustomDurationInput] = useState('');
  const [isDragOverMedia, setIsDragOverMedia] = useState(false);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  const clipsByTrack = useMemo(() => {
    const map = new Map<string, CanvasElement[]>();
    (page?.elements || []).forEach((el) => {
      if (!el.trackId) return;
      if (!map.has(el.trackId)) map.set(el.trackId, []);
      map.get(el.trackId)!.push(el);
    });
    return map;
  }, [page?.elements]);

  const unassigned = (page?.elements || []).filter(
    (el) => !el.trackId && (el.type === 'video' || el.type === 'audio' || el.type === 'text')
  );

  // Stop playback (and the shared clock) if the user navigates away from this page
  // while it was mid-playback, so audio/video don't keep running against a scene
  // that's no longer visible.
  useEffect(() => {
    return () => { if (isPlaying) setIsPlaying(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPageIndex]);

  const seekFromClientX = (clientX: number) => {
    if (!trackAreaRef.current || duration <= 0) return;
    const rect = trackAreaRef.current.getBoundingClientRect();
    const ms = Math.max(0, Math.min(duration, pxToMs(clientX - rect.left, zoom)));
    timelineClock.seek(ms);
  };

  const handleStop = () => {
    timelineClock.pause();
    timelineClock.seek(0);
  };

  const handleSetCustomDuration = () => {
    const seconds = parseFloat(customDurationInput);
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    setPageDuration(currentPageIndex, Math.round(seconds * 1000));
    setCustomDurationInput('');
  };

  const handleTrackAreaMouseDown = (e: React.MouseEvent) => {
    setIsScrubbing(true);
    seekFromClientX(e.clientX);
  };

  useEffect(() => {
    if (!isScrubbing) return;
    const onMove = (e: MouseEvent) => seekFromClientX(e.clientX);
    const onUp = () => setIsScrubbing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScrubbing, duration]);

  const handleAddToTrack = (el: CanvasElement, type: Track['type']) => {
    const track = tracks.find((t) => t.type === type);
    const trackId = track ? track.id : addTrack(type);
    const sceneDuration = duration > 0 ? duration : 5000;
    if (duration <= 0) setPageDuration(currentPageIndex, sceneDuration);
    const existing = (page?.elements || []).filter((e) => e.trackId === trackId);
    const lastEnd = existing.reduce((max, c) => Math.max(max, c.timelineEnd ?? 0), 0);
    const clipLen = Math.min(DEFAULT_CLIP_MS, sceneDuration - lastEnd);
    if (clipLen <= 0) return; // track is already full — no room left on this scene
    assignElementToTrack(el.id, trackId, lastEnd, lastEnd + clipLen);
  };

  // Uploads a video/audio file straight onto its own new (or first matching) track,
  // reading the source's real duration first — mirrors LeftSidebar's
  // addVideoToCanvas/addAudioToCanvas, but placed directly on the timeline since
  // that's the whole point of dropping a file onto this panel specifically.
  const uploadDirectlyToTrack = async (file: File, kind: 'video' | 'audio') => {
    if (!file.type.startsWith(`${kind}/`)) {
      toast.error(`Choose ${kind === 'video' ? 'a video' : 'an audio'} file`);
      return;
    }
    const toastId = toast.loading(`Adding ${file.name}…`);
    try {
      const { data: uploaded } = await uploadAPI.upload(file);
      const url = `${BACKEND}${uploaded.url}`;
      const probe = document.createElement(kind);
      probe.preload = 'metadata';
      await new Promise<void>((resolve, reject) => {
        probe.onloadedmetadata = () => resolve();
        probe.onerror = () => reject(new Error('Could not read that file'));
        (probe as HTMLVideoElement | HTMLAudioElement).src = url;
      });
      const track = tracks.find((t) => t.type === kind) ?? { id: addTrack(kind) };
      const sceneDuration = duration > 0 ? duration : 5000;
      if (duration <= 0) setPageDuration(currentPageIndex, sceneDuration);
      const existing = (page?.elements || []).filter((e) => e.trackId === track.id);
      const timelineStart = existing.reduce((max, c) => Math.max(max, c.timelineEnd ?? 0), 0);
      const probedMs = Number.isFinite(probe.duration) ? Math.round(probe.duration * 1000) : 0;
      const timelineEnd = timelineStart + (probedMs > 0 ? probedMs : DEFAULT_CLIP_MS);
      if (sceneDuration < timelineEnd) setPageDuration(currentPageIndex, timelineEnd);

      if (kind === 'video') {
        const v = probe as HTMLVideoElement;
        const nw = v.videoWidth || 640, nh = v.videoHeight || 360;
        const w = Math.min(500, nw), h = w * (nh / nw);
        addElement({
          type: 'video', x: 100, y: 100, width: w, height: h,
          rotation: 0, opacity: 1, visible: true, locked: false, name: file.name, zIndex: 0,
          trackId: track.id, timelineStart, timelineEnd,
          data: { type: 'video', src: url, autoplay: true, loop: true, muted: true, startTime: 0, endTime: v.duration || 0 },
        });
      } else {
        addElement({
          type: 'audio' as any, x: 100, y: 100, width: 100, height: 100,
          rotation: 0, opacity: 1, visible: true, locked: false, name: file.name, zIndex: 0,
          trackId: track.id, timelineStart, timelineEnd,
          data: { type: 'audio', src: url, volume: 1, muted: false, loop: false, startTime: 0, endTime: probe.duration || 0 } as any,
        });
      }
      pushHistory();
      toast.success(`${file.name} added to the timeline`, { id: toastId });
    } catch (err: any) {
      toast.error(err?.message || `Couldn't add ${file.name}`, { id: toastId });
    }
  };

  if (!page) return null;

  return (
    <div className="h-60 bg-[#0b0b0f] border-t border-black/40 flex flex-col flex-shrink-0 text-gray-300">
      {/* Transport: large centered play control with time straddling it, Canva-style */}
      <div className="flex items-center justify-center gap-3 px-4 py-2 border-b border-white/5 flex-shrink-0 relative">
        <span className="text-xs font-mono text-white/70 tabular-nums">{formatClock(playheadMs)}</span>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={duration <= 0}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white text-black disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/90 transition-colors"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <HiOutlinePause size={16} /> : <HiOutlinePlay size={16} className="ml-0.5" />}
        </button>
        <span className="text-xs font-mono text-white/40 tabular-nums">{formatClock(duration)}</span>

        <button
          onClick={handleStop}
          disabled={duration <= 0}
          className="absolute left-4 w-7 h-7 flex items-center justify-center rounded-full text-white/50 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
          title="Stop (pause and return to start)"
        >
          <HiOutlineStop size={14} />
        </button>

        {duration <= 0 ? (
          <div className="absolute right-4 flex items-center gap-1.5">
            <span className="text-[11px] text-white/40">Set scene duration:</span>
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.ms}
                onClick={() => setPageDuration(currentPageIndex, p.ms)}
                className="px-2 py-0.5 text-xs rounded-md bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="absolute right-4 flex items-center gap-1.5">
            <input
              type="number"
              min={0.1}
              step={0.1}
              title="Set an exact scene duration"
              placeholder={(duration / 1000).toFixed(1)}
              value={customDurationInput}
              onChange={(e) => setCustomDurationInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetCustomDuration()}
              onBlur={() => customDurationInput && handleSetCustomDuration()}
              className="w-14 px-1.5 py-0.5 text-xs rounded-md border border-white/10 bg-white/5 text-white/70 focus:outline-none focus:ring-1 focus:ring-canva-purple/40"
            />
            <span className="text-[10px] text-white/40">s</span>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Track headers */}
        <div className="w-36 flex-shrink-0 border-r border-white/5 flex flex-col overflow-y-auto">
          <div className="h-6 flex-shrink-0 border-b border-white/5" />
          {tracks.map((track) => {
            const Icon = TRACK_ICON[track.type];
            return (
              <div key={track.id} className="h-12 flex-shrink-0 flex items-center justify-between gap-1 px-2 border-b border-white/5 group">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon size={13} className="text-white/40 flex-shrink-0" />
                  <span className="text-xs text-white/70 truncate">{track.name}</span>
                </div>
                <button
                  onClick={() => removeTrack(track.id)}
                  className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-opacity flex-shrink-0"
                  title="Remove track"
                >
                  <HiOutlineTrash size={12} />
                </button>
              </div>
            );
          })}
          {tracks.length > 0 && (
            <div className="flex items-center gap-1 p-1.5">
              {(['video', 'text', 'audio'] as const).map((type) => {
                const Icon = TRACK_ICON[type];
                return (
                  <button
                    key={type}
                    onClick={() => addTrack(type)}
                    title={`Add ${type} track`}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <Icon size={13} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Track lanes, or an inviting empty state matching a fresh Canva-style timeline */}
        {tracks.length === 0 ? (
          <div className="flex-1 flex flex-col gap-1.5 p-2 overflow-y-auto">
            <input ref={videoFileInputRef} type="file" accept="video/*,image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadDirectlyToTrack(f, 'video'); }} />
            <input ref={audioFileInputRef} type="file" accept="audio/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadDirectlyToTrack(f, 'audio'); }} />

            <button
              onClick={() => addTrack('text')}
              className="flex items-center gap-2.5 px-4 h-11 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left"
              title="Add a text track"
            >
              <HiOutlineViewGrid size={16} className="text-white/50" />
              <span className="text-sm text-white/70">Add elements</span>
            </button>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOverMedia(true); }}
              onDragLeave={() => setIsDragOverMedia(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOverMedia(false);
                const file = Array.from(e.dataTransfer.files)[0];
                if (!file) return;
                uploadDirectlyToTrack(file, file.type.startsWith('audio/') ? 'audio' : 'video');
              }}
              onClick={() => videoFileInputRef.current?.click()}
              className={`flex items-center gap-2.5 px-4 h-11 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
                isDragOverMedia ? 'border-canva-purple bg-canva-purple/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
              title="Drop a video/image file, or click to choose one"
            >
              <span className="w-6 h-6 flex items-center justify-center rounded-md bg-white/10 text-white/60 flex-shrink-0">
                <HiOutlinePlus size={13} />
              </span>
              <span className="text-sm text-white/70">or drag and drop media</span>
            </div>

            <button
              onClick={() => audioFileInputRef.current?.click()}
              className="flex items-center gap-2.5 px-4 h-11 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left"
              title="Upload an audio file to a new audio track"
            >
              <HiOutlineMusicNote size={16} className="text-white/50" />
              <span className="text-sm text-white/70">Add audio</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <div style={{ width: Math.max(msToPx(duration, zoom), 400) }}>
              {/* Ruler */}
              <div
                className="h-6 relative border-b border-white/5 cursor-pointer select-none"
                onMouseDown={handleTrackAreaMouseDown}
                ref={trackAreaRef}
              >
                {duration > 0 && Array.from({ length: Math.floor(duration / 1000) + 1 }).map((_, s) => (
                  <div key={s} className="absolute top-0 bottom-0 border-l border-white/5 text-[9px] text-white/30 pl-1" style={{ left: msToPx(s * 1000, zoom) }}>
                    {s}s
                  </div>
                ))}
                {/* Playhead */}
                {duration > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-canva-purple pointer-events-none z-10"
                    style={{ left: msToPx(Math.min(playheadMs, duration), zoom) }}
                  >
                    <div className="absolute -top-0 -left-1.5 w-3 h-3 bg-canva-purple rounded-sm" />
                  </div>
                )}
              </div>

              {/* Lanes */}
              {tracks.map((track) => (
                <div
                  key={track.id}
                  className="h-12 relative border-b border-white/5 bg-white/[0.02]"
                  onMouseDown={handleTrackAreaMouseDown}
                >
                  {(clipsByTrack.get(track.id) || []).map((clip) => (
                    <TimelineClip
                      key={clip.id}
                      clip={clip}
                      trackClips={clipsByTrack.get(track.id) || []}
                      duration={duration}
                      selected={selectedElementIds.includes(clip.id)}
                      onSelect={() => selectElement(clip.id)}
                      zoom={zoom}
                      playheadMs={playheadMs}
                    />
                  ))}
                  {/* Playhead line continues through lanes */}
                  {duration > 0 && (
                    <div className="absolute top-0 bottom-0 w-px bg-canva-purple/60 pointer-events-none" style={{ left: msToPx(Math.min(playheadMs, duration), zoom) }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Unassigned elements — quick "add to timeline" for elements on this scene not yet on a track */}
      {unassigned.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-white/5 overflow-x-auto flex-shrink-0">
          <span className="text-[11px] text-white/40 flex-shrink-0">Not on timeline:</span>
          {unassigned.map((el) => (
            <button
              key={el.id}
              onClick={() => handleAddToTrack(el, el.type as Track['type'])}
              className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 text-[11px] text-white/70 hover:bg-canva-purple/20 hover:text-white transition-colors"
              title={`Add "${elementLabel(el)}" to a ${el.type} track`}
            >
              <HiOutlinePlus size={10} />
              {elementLabel(el)}
            </button>
          ))}
        </div>
      )}

      {/* Bottom bar: zoom slider, Canva-style */}
      <div className="flex items-center justify-end gap-2 px-3 py-1 border-t border-white/5 flex-shrink-0">
        <input
          type="range"
          min={0}
          max={ZOOM_STEPS.length - 1}
          step={1}
          value={zoomIndex}
          onChange={(e) => setZoomIndex(Number(e.target.value))}
          className="w-24 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
          title="Timeline zoom"
        />
        <span className="text-[10px] text-white/40 w-9 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
}
