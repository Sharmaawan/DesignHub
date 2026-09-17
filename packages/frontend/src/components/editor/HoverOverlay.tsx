import { useState, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';

/**
 * Shows subtle purple outline when hovering over elements
 * Helps users identify clickable objects on the canvas
 */
export default function HoverOverlay() {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { pages, currentPageIndex, selectedElementIds } = useEditorStore();

  const currentPage = pages[currentPageIndex];
  const hoveredElement = hoveredId
    ? currentPage?.elements.find((el) => el.id === hoveredId)
    : null;

  const isSelected = hoveredId && selectedElementIds.includes(hoveredId);

  if (!hoveredElement || isSelected) return null;

  return (
    <div
      className="absolute border-2 border-canva-purple/40 rounded-sm pointer-events-none transition-all duration-75"
      style={{
        left: `${hoveredElement.x}px`,
        top: `${hoveredElement.y}px`,
        width: `${hoveredElement.width}px`,
        height: `${hoveredElement.height}px`,
        transform: `rotate(${hoveredElement.rotation}deg)`,
        boxShadow: '0 0 0 1px rgba(123, 47, 190, 0.2)',
      }}
    >
      {/* Element name tooltip on hover */}
      <div className="absolute bg-gray-900 text-white text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap left-0 top-0 -translate-y-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {hoveredElement.name || hoveredElement.type}
      </div>
    </div>
  );
}
