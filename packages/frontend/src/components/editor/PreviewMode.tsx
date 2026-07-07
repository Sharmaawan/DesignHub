import { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import EditorCanvas from './EditorCanvas';
import { HiOutlineX, HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';

interface PreviewModeProps {
  open: boolean;
  onClose: () => void;
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

  useEffect(() => {
    if (open) setPreviewIndex(useEditorStore.getState().currentPageIndex);
    else setFit(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const page = pages[previewIndex];
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
  }, [open, previewIndex, pages]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setPreviewIndex((i) => Math.min(pages.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setPreviewIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, pages.length]);

  if (!open) return null;
  const page = pages[previewIndex];
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
          onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
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
            <EditorCanvas page={page} zoomOverride={fit.zoom} panOverride={fit.pan} hideChrome />
          )}
        </div>
        <button
          onClick={() => setPreviewIndex((i) => Math.min(pages.length - 1, i + 1))}
          disabled={previewIndex === pages.length - 1}
          className="absolute right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next page"
        >
          <HiOutlineChevronRight size={24} />
        </button>
      </div>
    </div>
  );
}
