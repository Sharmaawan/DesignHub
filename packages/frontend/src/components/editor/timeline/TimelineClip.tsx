import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../../stores/editorStore';
import { CanvasElement } from '../../../types';
import { getWaveform } from '../../../utils/audioWaveform';

const MIN_CLIP_MS = 200;
export const PX_PER_SEC = 60;
export const msToPx = (ms: number) => (ms / 1000) * PX_PER_SEC;
export const pxToMs = (px: number) => (px / PX_PER_SEC) * 1000;

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
  clip, trackClips, duration, selected, onSelect,
}: {
  clip: CanvasElement;
  trackClips: CanvasElement[];
  duration: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const updateElement = useEditorStore((s) => s.updateElement);
  const pushHistory = useEditorStore((s) => s.pushHistory);

  const dragRef = useRef<{
    mode: DragMode;
    startClientX: number;
    origStart: number;
    origEnd: number;
    origMediaStart: number;
    bounds: { leftBound: number; rightBound: number };
  } | null>(null);

  const start = clip.timelineStart ?? 0;
  const end = clip.timelineEnd ?? 0;
  const hasMediaTrim = clip.type === 'video' || clip.type === 'audio';
  const widthPx = Math.max(msToPx(end - start), 8);

  const onDragMove = (e: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaMs = pxToMs(e.clientX - drag.startClientX);

    if (drag.mode === 'move') {
      const clipDuration = drag.origEnd - drag.origStart;
      const maxStart = Math.max(drag.bounds.leftBound, drag.bounds.rightBound - clipDuration);
      const newStart = Math.max(drag.bounds.leftBound, Math.min(drag.origStart + deltaMs, maxStart));
      updateElement(clip.id, { timelineStart: newStart, timelineEnd: newStart + clipDuration });
    } else if (drag.mode === 'trim-left') {
      const newStart = Math.max(drag.bounds.leftBound, Math.min(drag.origStart + deltaMs, drag.origEnd - MIN_CLIP_MS));
      const patch: Partial<CanvasElement> = { timelineStart: newStart };
      if (hasMediaTrim) {
        const appliedMs = newStart - drag.origStart;
        patch.data = { ...clip.data, startTime: Math.max(0, drag.origMediaStart + appliedMs / 1000) } as any;
      }
      updateElement(clip.id, patch);
    } else {
      const newEnd = Math.min(drag.bounds.rightBound, Math.max(drag.origEnd + deltaMs, drag.origStart + MIN_CLIP_MS));
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
    dragRef.current = {
      mode,
      startClientX: e.clientX,
      origStart: start,
      origEnd: end,
      origMediaStart: hasMediaTrim ? ((clip.data as any).startTime || 0) : 0,
      bounds: getNeighborBounds(trackClips, clip.id, start, end, duration),
    };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  };

  return (
    <div
      onMouseDown={beginDrag('move')}
      className={`absolute top-1 bottom-1 rounded-md flex items-center text-[11px] font-medium truncate cursor-grab active:cursor-grabbing select-none transition-colors overflow-hidden ${
        selected ? 'bg-canva-purple text-white ring-2 ring-canva-purple/50 z-10' : 'bg-canva-purple/20 text-canva-purple hover:bg-canva-purple/30'
      }`}
      style={{ left: msToPx(start), width: widthPx }}
      title={elementLabel(clip)}
    >
      {clip.type === 'audio' && <WaveformCanvas src={(clip.data as any).src} widthPx={widthPx} />}
      <div onMouseDown={beginDrag('trim-left')} className="w-1.5 self-stretch flex-shrink-0 cursor-ew-resize hover:bg-white/40 relative z-10" />
      <span className="flex-1 truncate px-1 pointer-events-none relative z-10">{elementLabel(clip)}</span>
      <div onMouseDown={beginDrag('trim-right')} className="w-1.5 self-stretch flex-shrink-0 cursor-ew-resize hover:bg-white/40 relative z-10" />
    </div>
  );
}
