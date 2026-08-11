import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../../stores/editorStore';
import { CanvasElement } from '../../../types';
import { getWaveform } from '../../../utils/audioWaveform';
import { HiOutlineScissors, HiOutlineDuplicate, HiOutlineTrash } from 'react-icons/hi';

const MIN_CLIP_MS = 200;
export const BASE_PX_PER_SEC = 60;
// `zoom` is a multiplier on the base px/sec (1 = 100%) — threaded through from
// TimelinePanel's zoom state so the ruler, playhead, clip lanes and each clip's own
// drag math all agree on the same scale at all times.
export const msToPx = (ms: number, zoom = 1) => (ms / 1000) * BASE_PX_PER_SEC * zoom;
export const pxToMs = (px: number, zoom = 1) => (px / (BASE_PX_PER_SEC * zoom)) * 1000;

type DragMode = 'move' | 'trim-left' | 'trim-right';

// Clips on the same track can't overlap — the gap a clip is allowed to move/trim
// within is bounded by its nearest neighbors' ORIGINAL (pre-drag) edges, computed
// once at drag-start so a fast drag doesn't get confused by clips shifting mid-drag.
function getNeighborBounds(trackClips: CanvasElement[], selfId: string, origStart: number, origEnd: number, sceneDuration: number) {
  let leftBound = 0;
  let rightBound = sceneDuration > 0 ? sceneDuration : Infinity;
  for (const c of trackClips) {
    if (c.id === selfId) continue;
    const cStart = c.timelineStart ?? 0;
    const cEnd = c.timelineEnd ?? 0;
    if (cEnd <= origStart) leftBound = Math.max(leftBound, cEnd);
    if (cStart >= origEnd) rightBound = Math.min(rightBound, cStart);
  }
  return { leftBound, rightBound };
}

function elementLabel(el: CanvasElement) {
  if (el.type === 'text') return (el.data as any).content?.slice(0, 24) || 'Text';
  return el.name || el.type;
}

const SNAP_PX = 8;

// Pulls a dragged edge onto the nearest "interesting" timeline position (another
// clip's start/end, the scene boundaries, or the current playhead) whenever it's
// within a few pixels — the same snap-while-dragging feel as the canvas's own smart
// alignment guides, just projected onto one time axis instead of two spatial ones.
function snapTo(value: number, candidates: number[], zoom: number): number {
  const thresholdMs = pxToMs(SNAP_PX, zoom);
  let best = value;
  let bestDist = thresholdMs;
  for (const c of candidates) {
    const dist = Math.abs(value - c);
    if (dist < bestDist) { best = c; bestDist = dist; }
  }
  return best;
}

function WaveformCanvas({ src, widthPx }: { src: string; widthPx: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    getWaveform(src).then(({ peaks, buckets }) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const h = canvas.clientHeight;
      canvas.width = widthPx * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, widthPx, h);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const mid = h / 2;
      const barW = widthPx / buckets;
      for (let b = 0; b < buckets; b++) {
        const min = peaks[b * 2];
        const max = peaks[b * 2 + 1];
        const y1 = mid + min * mid;
        const y2 = mid + max * mid;
        ctx.fillRect(b * barW, y1, Math.max(1, barW - 0.5), Math.max(1, y2 - y1));
      }
    }).catch(() => { /* waveform is a visual nicety — silently skip on decode failure */ });
    return () => { cancelled = true; };
  }, [src, widthPx]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-70" />;
}

export default function TimelineClip({
  clip, trackClips, duration, selected, onSelect, zoom, playheadMs,
}: {
  clip: CanvasElement;
  trackClips: CanvasElement[];
  duration: number;
  selected: boolean;
  onSelect: () => void;
  zoom: number;
  playheadMs: number;
}) {
  const updateElement = useEditorStore((s) => s.updateElement);
  const pushHistory = useEditorStore((s) => s.pushHistory);
  const splitClipAtTime = useEditorStore((s) => s.splitClipAtTime);
  const duplicateClipOnTimeline = useEditorStore((s) => s.duplicateClipOnTimeline);
  const removeElements = useEditorStore((s) => s.removeElements);

  const dragRef = useRef<{
    mode: DragMode;
    startClientX: number;
    origStart: number;
    origEnd: number;
    origMediaStart: number;
    bounds: { leftBound: number; rightBound: number };
    snapCandidates: number[];
  } | null>(null);

  const start = clip.timelineStart ?? 0;
  const end = clip.timelineEnd ?? 0;
  const hasMediaTrim = clip.type === 'video' || clip.type === 'audio';
  const widthPx = Math.max(msToPx(end - start, zoom), 8);
  const canSplit = playheadMs > start + 50 && playheadMs < end - 50;

  const onDragMove = (e: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaMs = pxToMs(e.clientX - drag.startClientX, zoom);

    if (drag.mode === 'move') {
      const clipDuration = drag.origEnd - drag.origStart;
      const maxStart = Math.max(drag.bounds.leftBound, drag.bounds.rightBound - clipDuration);
      let newStart = Math.max(drag.bounds.leftBound, Math.min(drag.origStart + deltaMs, maxStart));
      // Snap either edge — whichever is closer to a candidate wins, then re-derive
      // the other edge from the snapped one so the clip's own length never changes.
      const snappedStart = snapTo(newStart, drag.snapCandidates, zoom);
      const snappedEnd = snapTo(newStart + clipDuration, drag.snapCandidates, zoom);
      if (snappedStart !== newStart) newStart = snappedStart;
      else if (snappedEnd !== newStart + clipDuration) newStart = snappedEnd - clipDuration;
      updateElement(clip.id, { timelineStart: newStart, timelineEnd: newStart + clipDuration });
    } else if (drag.mode === 'trim-left') {
      let newStart = Math.max(drag.bounds.leftBound, Math.min(drag.origStart + deltaMs, drag.origEnd - MIN_CLIP_MS));
      newStart = snapTo(newStart, drag.snapCandidates, zoom);
      const patch: Partial<CanvasElement> = { timelineStart: newStart };
      if (hasMediaTrim) {
        const appliedMs = newStart - drag.origStart;
        patch.data = { ...clip.data, startTime: Math.max(0, drag.origMediaStart + appliedMs / 1000) } as any;
      }
      updateElement(clip.id, patch);
    } else {
      let newEnd = Math.min(drag.bounds.rightBound, Math.max(drag.origEnd + deltaMs, drag.origStart + MIN_CLIP_MS));
      newEnd = snapTo(newEnd, drag.snapCandidates, zoom);
      const patch: Partial<CanvasElement> = { timelineEnd: newEnd };
      if (hasMediaTrim) {
        patch.data = { ...clip.data, endTime: drag.origMediaStart + (newEnd - drag.origStart) / 1000 } as any;
      }
      updateElement(clip.id, patch);
    }
  };

  const onDragEnd = () => {
    dragRef.current = null;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
    pushHistory();
  };

  const beginDrag = (mode: DragMode) => (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    // Snap targets: every other clip's start/end on this track, the scene's own
    // edges, and the current playhead — computed once at drag-start, same as the
    // overlap bounds below.
    const snapCandidates = [0, duration, playheadMs];
    trackClips.forEach((c) => {
      if (c.id === clip.id) return;
      snapCandidates.push(c.timelineStart ?? 0, c.timelineEnd ?? 0);
    });
    dragRef.current = {
      mode,
      startClientX: e.clientX,
      origStart: start,
      origEnd: end,
      origMediaStart: hasMediaTrim ? ((clip.data as any).startTime || 0) : 0,
      bounds: getNeighborBounds(trackClips, clip.id, start, end, duration),
      snapCandidates,
    };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  };

  return (
    <div
      onMouseDown={beginDrag('move')}
      className={`absolute top-1 bottom-1 rounded-md flex items-center text-[11px] font-medium truncate cursor-grab active:cursor-grabbing select-none transition-colors overflow-visible ${
        selected ? 'bg-canva-purple text-white ring-2 ring-canva-purple/50 z-10' : 'bg-canva-purple/20 text-canva-purple hover:bg-canva-purple/30'
      }`}
      style={{ left: msToPx(start, zoom), width: widthPx }}
      title={elementLabel(clip)}
    >
      {clip.type === 'audio' && <WaveformCanvas src={(clip.data as any).src} widthPx={widthPx} />}
      <div onMouseDown={beginDrag('trim-left')} className="w-1.5 self-stretch flex-shrink-0 cursor-ew-resize hover:bg-white/40 relative z-10" />
      <span className="flex-1 truncate px-1 pointer-events-none relative z-10">{elementLabel(clip)}</span>
      <div onMouseDown={beginDrag('trim-right')} className="w-1.5 self-stretch flex-shrink-0 cursor-ew-resize hover:bg-white/40 relative z-10" />

      {/* Split/Duplicate/Delete — a floating mini-toolbar above the clip, only once
          selected, so it never eats into a short clip's own limited width. */}
      {selected && (
        <div
          className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-1 py-0.5 z-20"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => canSplit && splitClipAtTime(clip.id, playheadMs)}
            disabled={!canSplit}
            title={canSplit ? 'Split at playhead' : 'Move the playhead inside this clip to split it'}
            className="p-1 rounded text-gray-500 dark:text-gray-400 hover:text-canva-purple hover:bg-canva-purple/10 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <HiOutlineScissors size={12} />
          </button>
          <button
            onClick={() => duplicateClipOnTimeline(clip.id)}
            title="Duplicate"
            className="p-1 rounded text-gray-500 dark:text-gray-400 hover:text-canva-purple hover:bg-canva-purple/10"
          >
            <HiOutlineDuplicate size={12} />
          </button>
          <button
            onClick={() => removeElements([clip.id])}
            title="Delete"
            className="p-1 rounded text-gray-500 dark:text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <HiOutlineTrash size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
