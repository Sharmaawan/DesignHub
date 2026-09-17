import { useEditorStore } from '../../stores/editorStore';
import { useMemo } from 'react';
import {
  HiOutlineEye, HiOutlineEyeOff, HiOutlineLockClosed,
  HiOutlineLockOpen, HiOutlineTrash,
} from 'react-icons/hi';

/**
 * Compact modern layers panel
 * Shows element hierarchy with visibility and lock controls
 */
export default function LayersListCompact() {
  const {
    pages, currentPageIndex, selectedElementIds, selectElement,
    lockElement, unlockElement, hideElement, showElement,
  } = useEditorStore();

  const currentPage = pages[currentPageIndex];

  // Sort elements by zIndex for display (highest first)
  const sortedElements = useMemo(() => {
    if (!currentPage) return [];
    return [...currentPage.elements].sort((a, b) => b.zIndex - a.zIndex);
  }, [currentPage]);

  const getElementIcon = (type: string) => {
    const icons: Record<string, string> = {
      text: '🔤',
      image: '🖼️',
      shape: '⬜',
      line: '─',
      video: '▶️',
      icon: '⭐',
      background: '🎨',
    };
    return icons[type] || '📦';
  };

  return (
    <div className="space-y-1">
      {sortedElements.length === 0 ? (
        <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
          No elements on this page
        </div>
      ) : (
        sortedElements.map((element) => {
          const isSelected = selectedElementIds.includes(element.id);

          return (
            <div
              key={element.id}
              onClick={() => selectElement(element.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors group ${
                isSelected
                  ? 'bg-canva-purple/10 border border-canva-purple/30'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
              }`}
            >
              {/* Element Icon */}
              <span className="text-lg flex-shrink-0">
                {getElementIcon(element.type)}
              </span>

              {/* Element Name/Type */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {element.name || element.type}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {element.type}
                </p>
              </div>

              {/* Visibility Toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  element.visible ? hideElement(element.id) : showElement(element.id);
                }}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                title={element.visible ? 'Hide' : 'Show'}
              >
                {element.visible ? (
                  <HiOutlineEye size={16} />
                ) : (
                  <HiOutlineEyeOff size={16} />
                )}
              </button>

              {/* Lock Toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  element.locked ? unlockElement(element.id) : lockElement(element.id);
                }}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                title={element.locked ? 'Unlock' : 'Lock'}
              >
                {element.locked ? (
                  <HiOutlineLockClosed size={16} />
                ) : (
                  <HiOutlineLockOpen size={16} />
                )}
              </button>

              {/* Delete Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  hideElement(element.id);
                }}
                className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                title="Delete"
              >
                <HiOutlineTrash size={16} />
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
