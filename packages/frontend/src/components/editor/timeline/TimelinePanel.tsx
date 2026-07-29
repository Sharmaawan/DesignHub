import { useMemo, useRef, useState, useEffect } from 'react';
import { useEditorStore } from '../../../stores/editorStore';
import { timelineClock } from '../../../lib/timelineClock';
import { CanvasElement, Track } from '../../../types';
import { HiOutlinePlay, HiOutlinePause, HiOutlinePlus, HiOutlineTrash, HiOutlineFilm, HiOutlineMusicNote, HiOutlineDocumentText } from 'react-icons/hi';
import TimelineClip, { msToPx, pxToMs } from './TimelineClip';

const DEFAULT_CLIP_MS = 3000;
const DURATION_PRESETS = [
  { label: '5s', ms: 5000 },
  { label: '10s', ms: 10000 },
  { label: '15s', ms: 15000 },
  { label: '30s', ms: 30000 },
];

const TRACK_ICON: Record<Track['type'], typeof HiOutlineFilm> = {
  video: HiOutlineFilm,
  text: HiOutlineDocumentText,
  audio: HiOutlineMusicNote,
};

function formatTime(ms: number) {
  const totalCentis = Math.round(ms / 10);
  const m = Math.floor(totalCentis / 6000);
  const s = Math.floor((totalCentis % 6000) / 100);
  const c = totalCentis % 100;
  return `${m}:${s.toString().padStart(2, '0')}.${c.toString().padStart(2, '0')}`;
}

function elementLabel(el: CanvasElement) {
  if (el.type === 'text') return (el.data as any).content?.slice(0, 24) || 'Text';
  return el.name || el.type;
}

export default function TimelinePanel() {
  const {
    pages, currentPageIndex, setPageDuration, addTrack, removeTrack,
    assignElementToTrack, selectElement, selectedElementIds,
    isPlaying, setIsPlaying, playheadMs,
  } = useEditorStore();

  const page = pages[currentPageIndex];
  const duration = page?.duration || 0;
  const tracks = page?.tracks || [];
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

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
    const ms = Math.max(0, Math.min(duration, pxToMs(clientX - rect.left)));
    timelineClock.seek(ms);
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

  if (!page) return null;

  return (
    <div className="h-56 bg-white dark:bg-canva-dark-surface border-t border-gray-200 dark:border-canva-dark-border flex flex-col flex-shrink-0">
      {/* Header: transport controls + time readout + duration setup */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={duration <= 0}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-canva-purple text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-canva-purple/90 transition-colors"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <HiOutlinePause size={14} /> : <HiOutlinePlay size={14} className="ml-0.5" />}
        </button>
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-24">
          {formatTime(playheadMs)} / {formatTime(duration)}
        </span>

        {duration <= 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Set scene duration:</span>
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.ms}
                onClick={() => setPageDuration(currentPageIndex, p.ms)}
                className="px-2 py-0.5 text-xs rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-canva-purple/10 hover:text-canva-purple transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">Scene {currentPageIndex + 1}</span>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Track headers */}
        <div className="w-36 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 flex flex-col overflow-y-auto">
          <div className="h-6 flex-shrink-0 border-b border-gray-100 dark:border-gray-800" />
          {tracks.map((track) => {
            const Icon = TRACK_ICON[track.type];
            return (
              <div key={track.id} className="h-12 flex-shrink-0 flex items-center justify-between gap-1 px-2 border-b border-gray-100 dark:border-gray-800 group">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon size={13} className="text-gray-400 flex-shrink-0" />
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{track.name}</span>
                </div>
                <button
                  onClick={() => removeTrack(track.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity flex-shrink-0"
                  title="Remove track"
                >
                  <HiOutlineTrash size={12} />
                </button>
              </div>
            );
          })}
          <div className="flex items-center gap-1 p-1.5">
            {(['video', 'text', 'audio'] as const).map((type) => {
              const Icon = TRACK_ICON[type];
              return (
                <button
                  key={type}
                  onClick={() => addTrack(type)}
                  title={`Add ${type} track`}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-canva-purple/10 hover:text-canva-purple transition-colors"
                >
                  <Icon size={13} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Track lanes */}
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <div style={{ width: Math.max(msToPx(duration), 400) }}>
            {/* Ruler */}
            <div
              className="h-6 relative border-b border-gray-100 dark:border-gray-800 cursor-pointer select-none"
              onMouseDown={handleTrackAreaMouseDown}
              ref={trackAreaRef}
            >
              {duration > 0 && Array.from({ length: Math.floor(duration / 1000) + 1 }).map((_, s) => (
                <div key={s} className="absolute top-0 bottom-0 border-l border-gray-100 dark:border-gray-800 text-[9px] text-gray-400 pl-1" style={{ left: msToPx(s * 1000) }}>
                  {s}s
                </div>
              ))}
              {/* Playhead */}
              {duration > 0 && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-canva-purple pointer-events-none z-10"
                  style={{ left: msToPx(Math.min(playheadMs, duration)) }}
                >
                  <div className="absolute -top-0 -left-1.5 w-3 h-3 bg-canva-purple rounded-sm" />
                </div>
              )}
            </div>

            {/* Lanes */}
            {tracks.map((track) => (
              <div
                key={track.id}
                className="h-12 relative border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/20"
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
                  />
                ))}
                {/* Playhead line continues through lanes */}
                {duration > 0 && (
                  <div className="absolute top-0 bottom-0 w-px bg-canva-purple/60 pointer-events-none" style={{ left: msToPx(Math.min(playheadMs, duration)) }} />
                )}
              </div>
            ))}

            {tracks.length === 0 && (
              <div className="p-4 text-xs text-gray-400">Add a video, text, or audio track to start building the timeline.</div>
            )}
          </div>
        </div>
      </div>

      {/* Unassigned elements — quick "add to timeline" for elements on this scene not yet on a track */}
      {unassigned.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-gray-100 dark:border-gray-800 overflow-x-auto flex-shrink-0">
          <span className="text-[11px] text-gray-400 flex-shrink-0">Not on timeline:</span>
          {unassigned.map((el) => (
            <button
              key={el.id}
              onClick={() => handleAddToTrack(el, el.type as Track['type'])}
              className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-[11px] text-gray-600 dark:text-gray-300 hover:bg-canva-purple/10 hover:text-canva-purple transition-colors"
              title={`Add "${elementLabel(el)}" to a ${el.type} track`}
            >
              <HiOutlinePlus size={10} />
              {elementLabel(el)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
