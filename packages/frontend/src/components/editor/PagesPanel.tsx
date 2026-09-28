import { useEditorStore } from '../../stores/editorStore';
import { useCallback, useRef, useState } from 'react';
import {
  HiOutlinePlus, HiOutlineTrash, HiOutlineDuplicate,
} from 'react-icons/hi';
import toast from 'react-hot-toast';

/**
 * Modern pages panel at bottom of canvas
 * Shows page thumbnails, supports page management
 */
export default function PagesPanel() {
  const {
    pages, currentPageIndex, setCurrentPage,
    addPage, removePage, duplicateElements,
  } = useEditorStore();

  const [contextMenu, setContextMenu] = useState<{ pageId: string; x: number; y: number } | null>(null);

  const handleAddPage = useCallback(() => {
    addPage();
  }, [addPage]);

  const handleDeletePage = useCallback((index: number) => {
    if (pages.length === 1) {
      toast.error('Cannot delete the last page');
      return;
    }
    removePage(index);
    setContextMenu(null);
  }, [pages.length, removePage]);

  const handleDuplicatePage = useCallback((index: number) => {
    const page = pages[index];
    if (page) {
      duplicateElements(page.elements.map((el) => el.id));
      addPage();
      toast.success('Page duplicated');
    }
    setContextMenu(null);
  }, [pages, duplicateElements, addPage]);

  return (
    <div className="h-24 bg-white dark:bg-canva-dark-surface border-t border-gray-200 dark:border-canva-dark-border flex items-center gap-2 px-4 py-3 overflow-x-auto flex-shrink-0 animate-slide-up">
      {/* Page Thumbnails */}
      {pages.map((page, index) => (
        <div
          key={page.id}
          onClick={() => setCurrentPage(index)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ pageId: page.id, x: e.clientX, y: e.clientY });
          }}
          className={`relative flex-shrink-0 group cursor-pointer transition-all ${
            index === currentPageIndex
              ? 'ring-2 ring-canva-purple rounded-lg overflow-hidden'
              : 'hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600 rounded-lg overflow-hidden'
          }`}
          title={page.name}
        >
          {/* Thumbnail */}
          <div
            className="w-20 h-16 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded flex items-center justify-center text-xs font-semibold text-gray-700 dark:text-gray-400 flex-shrink-0"
            style={{ backgroundColor: page.backgroundColor || '#FFFFFF' }}
          >
            {page.elements.length > 0 ? (
              <span className="text-gray-500 dark:text-gray-400">{page.elements.length}</span>
            ) : (
              <span className="text-gray-400">Empty</span>
            )}
          </div>

          {/* Page Label */}
          <div className="absolute bottom-0 left-0 right-0 bg-gray-900/80 text-white text-xs py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity truncate">
            {page.name}
          </div>

          {/* Active Indicator */}
          {index === currentPageIndex && (
            <div className="absolute top-1 right-1 w-2 h-2 bg-canva-purple rounded-full" />
          )}
        </div>
      ))}

      {/* Add Page Button */}
      <button
        onClick={handleAddPage}
        className="flex-shrink-0 w-20 h-16 rounded border-2 border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center hover:border-canva-purple hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-400 hover:text-canva-purple"
        title="Add page"
      >
        <HiOutlinePlus size={20} />
      </button>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 w-44 z-50"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
          >
            <button
              onClick={() => handleDuplicatePage(pages.findIndex((p) => p.id === contextMenu.pageId))}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <HiOutlineDuplicate size={16} />
              Duplicate
            </button>
            <button
              onClick={() => handleDeletePage(pages.findIndex((p) => p.id === contextMenu.pageId))}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <HiOutlineTrash size={16} />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
