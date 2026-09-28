import { ReactNode } from 'react';

interface CanvasWorkspaceProps {
  children: ReactNode;
}

/**
 * Canvas workspace wrapper.
 *
 * Selection handles, rotation, and hover outlines are rendered by
 * EditorCanvas's own Konva Transformer — inside the same Stage/Layer that
 * the zoom/pan transform applies to, so they track the canvas correctly.
 * A DOM-based SelectionOverlay/HoverOverlay used to duplicate that UI here,
 * but it positioned itself with raw unscaled element.x/y/width/height,
 * ignoring zoom and pan — at any zoom other than 100% its box landed in the
 * wrong place (e.g. a stray line cutting across the canvas). Removed rather
 * than reimplementing the same zoom/pan math a second time.
 *
 * Per-element actions (copy, layer order, lock, hide, delete, align center,
 * set as background) used to also show as a floating toolbar hovering above
 * the current selection — but that duplicated (and, in ContextToolbarNew's
 * case, mispositioned) the right-click context menu EditorCanvas already
 * renders for exactly the same actions. Right-click is now the only way to
 * reach them, so there's one menu instead of two overlapping ones.
 */
export default function CanvasWorkspace({ children }: CanvasWorkspaceProps) {
  return (
    <div className="relative flex-1 overflow-hidden bg-[#F1F1F4] dark:bg-gray-950">
      {/* Main Canvas */}
      <div className="absolute inset-0 overflow-auto">
        {children}
      </div>

      {/* Canvas edge guides (optional visual cue) */}
      <div className="absolute inset-0 pointer-events-none border-4 border-canva-purple/5 rounded-lg" />
    </div>
  );
}
