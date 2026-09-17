import { useEditorStore } from '../../stores/editorStore';
import {
  HiOutlineDuplicate, HiOutlineLockClosed, HiOutlineLockOpen,
  HiOutlineEye, HiOutlineEyeOff, HiOutlineTrash,
  HiOutlineArrowUp, HiOutlineArrowDown,
} from 'react-icons/hi';

/**
 * Modern floating toolbar that appears near selected elements
 * Shows context-appropriate actions based on element type
 */
export default function ContextToolbarNew() {
  const {
    selectedElementIds, pages, currentPageIndex,
    duplicateElements, lockElement, unlockElement,
    hideElement, showElement, bringForward, sendBackward,
  } = useEditorStore();

  if (selectedElementIds.length === 0) return null;

  const currentPage = pages[currentPageIndex];
  const selectedElement = currentPage?.elements.find((el) => el.id === selectedElementIds[0]);

  if (!selectedElement) return null;

  // Get screen position for floating toolbar (approximate, near element)
  const toolbarX = Math.min(selectedElement.x + 100, window.innerWidth - 300);
  const toolbarY = Math.max(selectedElement.y - 60, 60);

  return (
    <div
      className="absolute bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2 flex items-center gap-1 z-40"
      style={{
        left: `${toolbarX}px`,
        top: `${toolbarY}px`,
        pointerEvents: 'auto',
      }}
    >
      {/* Duplicate */}
      <button
        onClick={() => {
          duplicateElements(selectedElementIds);
        }}
        className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
        title="Duplicate (Ctrl+D)"
      >
        <HiOutlineDuplicate size={16} />
      </button>

      {/* Lock/Unlock */}
      {selectedElement.locked ? (
        <button
          onClick={() => unlockElement(selectedElement.id)}
          className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
          title="Unlock"
        >
          <HiOutlineLockClosed size={16} />
        </button>
      ) : (
        <button
          onClick={() => lockElement(selectedElement.id)}
          className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
          title="Lock"
        >
          <HiOutlineLockOpen size={16} />
        </button>
      )}

      {/* Show/Hide */}
      {selectedElement.visible ? (
        <button
          onClick={() => hideElement(selectedElement.id)}
          className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
          title="Hide"
        >
          <HiOutlineEye size={16} />
        </button>
      ) : (
        <button
          onClick={() => showElement(selectedElement.id)}
          className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
          title="Show"
        >
          <HiOutlineEyeOff size={16} />
        </button>
      )}

      <div className="border-l border-gray-200 dark:border-gray-700 h-6" />

      {/* Bring Forward / Send Backward */}
      <button
        onClick={() => bringForward(selectedElement.id)}
        className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
        title="Bring forward"
      >
        <HiOutlineArrowUp size={16} />
      </button>

      <button
        onClick={() => sendBackward(selectedElement.id)}
        className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
        title="Send backward"
      >
        <HiOutlineArrowDown size={16} />
      </button>

      <div className="border-l border-gray-200 dark:border-gray-700 h-6" />

      {/* Delete */}
      <button
        onClick={() => hideElement(selectedElement.id)}
        className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
        title="Delete"
      >
        <HiOutlineTrash size={16} />
      </button>

    </div>
  );
}
