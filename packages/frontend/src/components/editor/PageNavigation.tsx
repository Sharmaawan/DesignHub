import { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { HiOutlinePlus, HiOutlineDuplicate, HiOutlineTrash } from 'react-icons/hi';

export default function PageNavigation() {
  const {
    pages, currentPageIndex, setCurrentPage, addPage, removePage, duplicatePage,
  } = useEditorStore();
  const [contextMenu, setContextMenu] = useState<{ index: number; x: number; y: number } | null>(null);

  return (
    <div className="h-28 bg-white dark:bg-canva-dark-surface border-t border-gray-200 dark:border-canva-dark-border flex flex-col flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-gray-100 dark:border-gray-800">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {pages.length} page{pages.length !== 1 ? 's' : ''} - Page {currentPageIndex + 1}
        </span>
        <button
          onClick={addPage}
          className="flex items-center gap-1 px-2 py-1 text-xs text-canva-purple hover:bg-canva-purple/10 rounded-md transition-colors font-medium"
        >
          <HiOutlinePlus size={14} />
          Add page
        </button>
      </div>

      <div className="flex-1 overflow-x-auto px-4 py-2">
        <div className="flex gap-3 h-full items-center">
          {pages.map((page, index) => (
            <div
              key={page.id}
              className={`relative flex-shrink-0 cursor-pointer group rounded-lg transition-all ${
                index === currentPageIndex
                  ? 'ring-2 ring-canva-purple shadow-md scale-105'
                  : 'ring-1 ring-gray-200 dark:ring-gray-700 hover:ring-gray-300 dark:hover:ring-gray-600'
              }`}
              onClick={() => setCurrentPage(index)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ index, x: e.clientX, y: e.clientY });
              }}
            >
              <div
                className="w-24 h-[60px] rounded-md overflow-hidden relative"
                style={{ backgroundColor: page.backgroundColor }}
              >
                {/* Mini preview */}
                {page.elements.length > 0 && (
                  <div className="absolute inset-0 p-0.5">
                    {page.elements.slice(0, 6).map((el) => (
                      <div
                        key={el.id}
                        className="absolute"
                        style={{
                          left: `${(el.x / page.width) * 100}%`,
                          top: `${(el.y / page.height) * 100}%`,
                          width: `${(el.width / page.width) * 100}%`,
                          height: `${(el.height / page.height) * 100}%`,
                          backgroundColor: el.type === 'shape' ? ((el.data as any).fill?.includes?.('gradient') ? (el.data as any).fill.match?.(/#[a-fA-F0-9]+/)?.[0] : (el.data as any).fill) : undefined,
                          opacity: el.opacity,
                          borderRadius: el.type === 'shape' ? `${Math.min((el.data as any).cornerRadius || 0, 4)}px` : undefined,
                          overflow: 'hidden',
                        }}
                      >
                        {el.type === 'text' && (
                          <span
                            className="block leading-none"
                            style={{
                              fontSize: '3px',
                              color: (el.data as any).color,
                              fontFamily: (el.data as any).fontFamily,
                              fontWeight: (el.data as any).fontWeight,
                            }}
                          >
                            {(el.data as any).content?.substring(0, 20)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="absolute -bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 text-center py-0.5 rounded-b-md">
                <span className={`text-[10px] font-medium ${index === currentPageIndex ? 'text-canva-purple' : 'text-gray-500 dark:text-gray-400'}`}>
                  {index + 1}
                </span>
              </div>

              {pages.length > 1 && (
                <button
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[8px] font-bold shadow"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (pages.length > 1) {
                      removePage(index);
                    }
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}

          <button
            onClick={addPage}
            className="flex-shrink-0 w-24 h-[60px] border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-center hover:border-canva-purple dark:hover:border-canva-purple transition-colors"
          >
            <HiOutlinePlus size={18} className="text-gray-300 dark:text-gray-600" />
          </button>
        </div>
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-xl shadow-canva-xl border border-gray-100 dark:border-gray-700 py-1 w-40"
            style={{ left: contextMenu.x, top: contextMenu.y - 100 }}
          >
            <button
              onClick={() => { duplicatePage(contextMenu.index); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <HiOutlineDuplicate size={14} /> Duplicate
            </button>
            {pages.length > 1 && (
              <button
                onClick={() => { removePage(contextMenu.index); setContextMenu(null); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <HiOutlineTrash size={14} /> Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
