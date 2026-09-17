import { ReactNode } from 'react';
import ContextToolbarNew from './ContextToolbarNew';
import FloatingToolbar from './FloatingToolbar';

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
 */
export default function CanvasWorkspace({ children }: CanvasWorkspaceProps) {
  return (
    <div className="relative flex-1 overflow-hidden bg-[#F1F1F4] dark:bg-gray-950">
      {/* Main Canvas */}
      <div className="absolute inset-0 overflow-auto">
        {children}
      </div>

      {/* Floating Contextual Toolbar */}
      <FloatingToolbar />

      {/* New Context Toolbar (better version) */}
      <ContextToolbarNew />

      {/* Canvas edge guides (optional visual cue) */}
      <div className="absolute inset-0 pointer-events-none border-4 border-canva-purple/5 rounded-lg" />
    </div>
  );
}
