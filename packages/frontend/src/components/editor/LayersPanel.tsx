import { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import {
  HiOutlineEye, HiOutlineEyeOff,
  HiOutlineLockClosed, HiOutlineLockOpen,
  HiOutlineTrash, HiOutlineDuplicate,
  HiOutlineChevronUp, HiOutlineChevronDown,
  HiOutlinePlus, HiOutlineMinus,
} from 'react-icons/hi';
import toast from 'react-hot-toast';

const ELEMENT_ICONS: Record<string, string> = {
  text: '📝', image: '🖼️', shape: '⬡', table: '📋', chart: '📊',
  video: '🎬', sticker: '⭐', icon: '🔷',
};

export default function LayersPanel() {
  const {
    pages, currentPageIndex, selectedElementIds, elementNames,
    selectElement, bringForward, sendBackward, bringToFront, sendToBack,
    duplicateElements, removeElements, renameElement,
    lockElement, unlockElement, hideElement, showElement,
    groupElements, ungroupElements, setCurrentPage,
  } = useEditorStore();

  const [pagesCollapsed, setPagesCollapsed] = useState(false);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const currentPage = pages[currentPageIndex];
  const elements = currentPage?.elements || [];
  const sortedElements = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const getDisplayName = (el: typeof elements[0]) => elementNames[el.id] || el.name;

  const handleDoubleClick = (el: typeof elements[0]) => {
    setEditingId(el.id);
    setEditValue(getDisplayName(el));
  };

  const handleRenameSubmit = (id: string) => {
    if (editValue.trim()) renameElement(id, editValue.trim());
    setEditingId(null);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return; }

    const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
    const sourceIdx = sorted.findIndex((el) => el.id === draggedId);
    const targetIdx = sorted.findIndex((el) => el.id === targetId);

    if (sourceIdx < targetIdx) {
      bringForward(draggedId);
    } else {
      sendBackward(draggedId);
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => { setDraggedId(null); setDragOverId(null); };

  const handleSelect = (id: string, e: React.MouseEvent) => {
    selectElement(id, e.ctrlKey || e.metaKey);
  };

  const selectedCount = selectedElementIds.length;

  return (
    <div className="space-y-2">
      {/* Pages Section */}
      <div className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setPagesCollapsed(!pagesCollapsed)}
          className="w-full flex items-center justify-between px-2.5 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Pages ({pages.length})
          </span>
          <svg className={`w-3 h-3 text-gray-400 transition-transform ${pagesCollapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!pagesCollapsed && (
          <div className="p-1.5 flex flex-col gap-1">
            {pages.map((page, idx) => (
              <button
                key={page.id}
                onClick={() => setCurrentPage(idx)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all ${
                  idx === currentPageIndex
                    ? 'bg-canva-purple/10 ring-1 ring-canva-purple/30 dark:bg-canva-purple/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}>
                {/* Mini page thumbnail */}
                <div
                  className="w-8 h-6 rounded border border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-hidden"
                  style={{ background: page.backgroundColor || '#FFFFFF' }}>
                  {idx === currentPageIndex && (
                    <div className="w-full h-0.5" style={{ background: '#6366F1' }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs truncate font-medium ${idx === currentPageIndex ? 'text-canva-purple' : 'text-gray-700 dark:text-gray-300'}`}>
                    {page.name || `Page ${idx + 1}`}
                  </div>
                  <div className="text-[9px] text-gray-400">{page.elements.length} element{page.elements.length !== 1 ? 's' : ''}</div>
                </div>
                {idx === currentPageIndex && (
                  <div className="w-1.5 h-1.5 rounded-full bg-canva-purple flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
        <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Elements</span>
        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-1">
        <button onClick={() => { if (selectedCount === 1) bringToFront(selectedElementIds[0]); }} disabled={selectedCount !== 1}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Bring to Front">
          <HiOutlineChevronUp size={14} className="text-gray-500 dark:text-gray-400" />
        </button>
        <button onClick={() => { if (selectedCount === 1) sendToBack(selectedElementIds[0]); }} disabled={selectedCount !== 1}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Send to Back">
          <HiOutlineChevronDown size={14} className="text-gray-500 dark:text-gray-400" />
        </button>
        <button onClick={() => { if (selectedCount === 1) bringForward(selectedElementIds[0]); }} disabled={selectedCount !== 1}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Bring Forward">
          <HiOutlinePlus size={14} className="text-gray-500 dark:text-gray-400" />
        </button>
        <button onClick={() => { if (selectedCount === 1) sendBackward(selectedElementIds[0]); }} disabled={selectedCount !== 1}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Send Backward">
          <HiOutlineMinus size={14} className="text-gray-500 dark:text-gray-400" />
        </button>
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5 self-center" />
        <button onClick={() => { if (selectedCount > 0) { duplicateElements(selectedElementIds); toast.success('Duplicated'); } }} disabled={selectedCount === 0}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Duplicate">
          <HiOutlineDuplicate size={14} className="text-gray-500 dark:text-gray-400" />
        </button>
        <button onClick={() => { if (selectedCount > 0) { removeElements(selectedElementIds); toast.success('Deleted'); } }} disabled={selectedCount === 0}
          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Delete">
          <HiOutlineTrash size={14} className="text-gray-500 dark:text-gray-400 hover:text-red-500" />
        </button>
        {selectedCount >= 2 && (
          <>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5 self-center" />
            <button onClick={() => { groupElements(selectedElementIds); toast.success('Grouped'); }}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-xs text-gray-500 dark:text-gray-400" title="Group">
              Group
            </button>
          </>
        )}
        {selectedCount === 1 && elements.find(e => e.id === selectedElementIds[0])?.type === 'group' && (
          <button onClick={() => { ungroupElements(selectedElementIds[0]); toast.success('Ungrouped'); }}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-xs text-gray-500 dark:text-gray-400" title="Ungroup">
            Ungroup
          </button>
        )}
      </div>

      {/* Layer List */}
      <div className="max-h-[50vh] overflow-y-auto space-y-0.5">
        {sortedElements.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-400 dark:text-gray-500">
            No layers yet
          </div>
        ) : (
          sortedElements.map((el) => {
            const isSelected = selectedElementIds.includes(el.id);
            const isDragging = draggedId === el.id;
            const isDragOver = dragOverId === el.id && dragOverId !== draggedId;

            return (
              <div
                key={el.id}
                draggable={!el.locked}
                onDragStart={(e) => handleDragStart(e, el.id)}
                onDragOver={(e) => handleDragOver(e, el.id)}
                onDrop={(e) => handleDrop(e, el.id)}
                onDragEnd={handleDragEnd}
                onClick={(e) => handleSelect(el.id, e)}
                onDoubleClick={() => handleDoubleClick(el)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-all group ${
                  isSelected ? 'bg-canva-purple/10 dark:bg-canva-purple/20 ring-1 ring-canva-purple/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                } ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'border-t-2 border-t-canva-purple' : ''} ${el.locked ? 'opacity-60' : ''}`}
              >
                <div className="w-3 flex-shrink-0 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
                    <circle cx="1.5" cy="1.5" r="1" /><circle cx="4.5" cy="1.5" r="1" />
                    <circle cx="1.5" cy="5" r="1" /><circle cx="4.5" cy="5" r="1" />
                    <circle cx="1.5" cy="8.5" r="1" /><circle cx="4.5" cy="8.5" r="1" />
                  </svg>
                </div>
                <span className="text-sm flex-shrink-0">{ELEMENT_ICONS[el.type] || '◼️'}</span>
                <div className="flex-1 min-w-0">
                  {editingId === el.id ? (
                    <input ref={editInputRef} value={editValue} onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => handleRenameSubmit(el.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(el.id); if (e.key === 'Escape') setEditingId(null); }}
                      className="w-full px-1 py-0.5 text-xs bg-white dark:bg-gray-800 border border-canva-purple rounded focus:outline-none focus:ring-1 focus:ring-canva-purple text-gray-900 dark:text-white"
                    />
                  ) : (
                    <span className={`text-xs truncate block ${!el.visible ? 'text-gray-400 dark:text-gray-600 line-through' : ''}`}>
                      {getDisplayName(el)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); el.visible ? hideElement(el.id) : showElement(el.id); }}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title={el.visible ? 'Hide' : 'Show'}>
                    {el.visible ? <HiOutlineEye size={11} className="text-gray-400" /> : <HiOutlineEyeOff size={11} className="text-gray-400" />}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); el.locked ? unlockElement(el.id) : lockElement(el.id); }}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title={el.locked ? 'Unlock' : 'Lock'}>
                    {el.locked ? <HiOutlineLockClosed size={11} className="text-amber-500" /> : <HiOutlineLockOpen size={11} className="text-gray-400" />}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedCount > 0 && (
        <div className="text-xs text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-200 dark:border-gray-700">
          {selectedCount} selected
        </div>
      )}
    </div>
  );
}
