import { useEditorStore } from '../../stores/editorStore';
import { useMemo } from 'react';
import {
  HiOutlineArrowsExpand, HiOutlineRefresh,
} from 'react-icons/hi';

/**
 * Modern selection overlay with:
 * - Purple bounding box around selected element
 * - Resize handles (corners + sides)
 * - Rotation handle
 * - Move cursor indicator
 * - Multi-select visual
 */
export default function SelectionOverlay() {
  const { selectedElementIds, pages, currentPageIndex, zoom } = useEditorStore();

  const currentPage = pages[currentPageIndex];

  const selectedElements = useMemo(() => {
    if (!currentPage) return [];
    return selectedElementIds
      .map((id) => currentPage.elements.find((el) => el.id === id))
      .filter(Boolean);
  }, [selectedElementIds, currentPage]);

  if (selectedElements.length === 0) return null;

  // For single selection, show full UI with handles
  if (selectedElements.length === 1) {
    const element = selectedElements[0];
    const handleSize = 8;
    const handleOffset = handleSize / 2;

    const boxStyle = {
      left: `${element.x}px`,
      top: `${element.y}px`,
      width: `${element.width}px`,
      height: `${element.height}px`,
      transform: `rotate(${element.rotation}deg)`,
    };

    return (
      <div className="absolute pointer-events-none animate-scale-in" style={boxStyle}>
        {/* Bounding box border */}
        <div className="absolute inset-0 border-2 border-canva-purple rounded-sm pointer-events-auto shadow-lg shadow-canva-purple/20 transition-shadow" />

        {/* Corner resize handles */}
        {[
          { pos: 'top-left', cursor: 'nwse-resize', x: -handleOffset, y: -handleOffset },
          { pos: 'top-right', cursor: 'nesw-resize', x: '100%', y: -handleOffset },
          { pos: 'bottom-right', cursor: 'nwse-resize', x: '100%', y: '100%' },
          { pos: 'bottom-left', cursor: 'nesw-resize', x: -handleOffset, y: '100%' },
        ].map((handle, i) => (
          <div
            key={`corner-${i}`}
            className="absolute w-3 h-3 bg-white border-2 border-canva-purple rounded-full shadow-sm pointer-events-auto"
            style={{
              left: handle.x,
              top: handle.y,
              marginLeft: -handleOffset,
              marginTop: -handleOffset,
              cursor: handle.cursor,
            }}
          />
        ))}

        {/* Side resize handles */}
        {[
          { pos: 'top-center', cursor: 'ns-resize', x: '50%', y: -handleOffset },
          { pos: 'right-center', cursor: 'ew-resize', x: '100%', y: '50%' },
          { pos: 'bottom-center', cursor: 'ns-resize', x: '50%', y: '100%' },
          { pos: 'left-center', cursor: 'ew-resize', x: -handleOffset, y: '50%' },
        ].map((handle, i) => (
          <div
            key={`side-${i}`}
            className="absolute w-2 h-2 bg-canva-purple rounded-full shadow-sm pointer-events-auto"
            style={{
              left: handle.x,
              top: handle.y,
              marginLeft: -4,
              marginTop: -4,
              cursor: handle.cursor,
            }}
          />
        ))}

        {/* Rotation handle */}
        <div
          className="absolute w-3 h-3 bg-canva-purple rounded-full shadow-sm pointer-events-auto flex items-center justify-center"
          style={{
            left: '50%',
            top: '-30px',
            marginLeft: -6,
            cursor: 'grab',
          }}
        >
          <HiOutlineRefresh size={12} className="text-white" />
        </div>

        {/* Move cursor indicator (center) */}
        <div
          className="absolute flex items-center justify-center pointer-events-auto group"
          style={{
            left: '50%',
            top: '50%',
            marginLeft: -12,
            marginTop: -12,
            width: 24,
            height: 24,
            cursor: 'move',
          }}
        >
          <div className="w-2 h-2 bg-canva-purple rounded-full opacity-50 group-hover:opacity-100" />
        </div>

        {/* Element info (top-left corner) */}
        <div
          className="absolute bg-canva-purple text-white text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap"
          style={{
            left: 0,
            top: '-28px',
          }}
        >
          {element.width.toFixed(0)} × {element.height.toFixed(0)}
        </div>
      </div>
    );
  }

  // For multi-select, show bounding box around all elements
  if (selectedElements.length > 1) {
    const minX = Math.min(...selectedElements.map((el) => el.x));
    const minY = Math.min(...selectedElements.map((el) => el.y));
    const maxX = Math.max(...selectedElements.map((el) => el.x + el.width));
    const maxY = Math.max(...selectedElements.map((el) => el.y + el.height));

    const width = maxX - minX;
    const height = maxY - minY;

    return (
      <div
        className="absolute border-2 border-dashed border-canva-purple/60 pointer-events-none rounded-sm"
        style={{
          left: minX,
          top: minY,
          width: width,
          height: height,
        }}
      >
        {/* Multi-select label */}
        <div className="absolute bg-canva-purple text-white text-xs px-2 py-1 rounded pointer-events-none">
          {selectedElements.length} selected
        </div>
      </div>
    );
  }

  return null;
}
