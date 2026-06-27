import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditorStore } from '../stores/editorStore';
import { useProjectStore } from '../stores/projectStore';
import { useThemeStore } from '../stores/themeStore';
import LeftSidebar from '../components/editor/LeftSidebar';
import TopToolbar from '../components/editor/TopToolbar';
import RightSidebar from '../components/editor/RightSidebar';
import EditorCanvas from '../components/editor/EditorCanvas';
import PageNavigation from '../components/editor/PageNavigation';
import CommentsPanel from '../components/editor/CommentsPanel';
import VersionHistory from '../components/editor/VersionHistory';
import FloatingToolbar from '../components/editor/FloatingToolbar';
import SettingsModal from '../components/editor/SettingsModal';
import ShareModal from '../components/editor/ShareModal';
import ExportModal from '../components/editor/ExportModal';
import toast from 'react-hot-toast';

export default function EditorPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useThemeStore();
  const {
    pages, currentPageIndex, selectedElementIds, zoom, isSaving, lastSaved,
    setProject, setZoom, zoomIn, zoomOut, undo, redo, copy, paste, cut,
    pushHistory, setSaving, setLastSaved, removeElements, selectAll, deselectAll,
    setCommentsOpen, setVersionsOpen, commentsOpen, versionsOpen,
    addPage, deselectAll: deselect,
  } = useEditorStore();
  const { projects, updateProject, loadProjects } = useProjectStore();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => { loadProjects(); }, []);

  useEffect(() => {
    if (projectId) {
      const project = projects.find((p) => p.id === projectId);
      if (project) setProject(project);
    }
  }, [projectId, projects, setProject]);

  // Autosave
  useEffect(() => {
    autosaveTimerRef.current = setInterval(() => {
      if (projectId) {
        const state = useEditorStore.getState();
        if (state.pages.length > 0) {
          setSaving(true);
          setTimeout(() => {
            updateProject(projectId, { pages: state.pages, name: state.project?.name || 'Untitled' });
            setSaving(false);
            setLastSaved(new Date().toISOString());
          }, 500);
        }
      }
    }, 30000);
    return () => clearInterval(autosaveTimerRef.current);
  }, [projectId, updateProject, setSaving, setLastSaved]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    const state = useEditorStore.getState();

    // Don't intercept when typing in inputs
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (state.isEditing) return;

    if (isCtrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if (isCtrl && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
    if (isCtrl && e.key === 'y') { e.preventDefault(); redo(); }
    if (isCtrl && e.key === 'c') { copy(); }
    if (isCtrl && e.key === 'v') { paste(); }
    if (isCtrl && e.key === 'x') { cut(); }
    if (isCtrl && e.key === 'a') { e.preventDefault(); selectAll(); }
    if (isCtrl && e.key === 'd') { e.preventDefault(); if (state.selectedElementIds.length) useEditorStore.getState().duplicateElements(state.selectedElementIds); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedElementIds.length > 0) {
      e.preventDefault();
      removeElements(state.selectedElementIds);
    }
    if (e.key === 'Escape') { deselectAll(); }
    if (isCtrl && e.key === '=') { e.preventDefault(); zoomIn(); }
    if (isCtrl && e.key === '-') { e.preventDefault(); zoomOut(); }
    if (isCtrl && e.key === '0') { e.preventDefault(); setZoom(1); }
    if (isCtrl && e.shiftKey && (e.key === 'S' || e.key === 's')) {
      e.preventDefault();
      if (projectId) {
        setSaving(true);
        updateProject(projectId, { pages: state.pages });
        setTimeout(() => { setSaving(false); setLastSaved(new Date().toISOString()); toast.success('Saved!'); }, 500);
      }
    }
  }, [undo, redo, copy, paste, cut, removeElements, selectAll, deselectAll, zoomIn, zoomOut, setZoom, projectId, setSaving, setLastSaved, updateProject]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const currentPage = pages[currentPageIndex];

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-canva-dark-bg overflow-hidden">
      <TopToolbar
        onThemeToggle={toggleTheme}
        isDark={isDark}
        onShowShortcuts={() => setShowShortcuts(true)}
        onOpenShare={() => setShowShare(true)}
        onOpenExport={() => setShowExport(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <LeftSidebar />

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Canvas Area */}
          <div className="flex-1 relative overflow-hidden bg-gray-200/50 dark:bg-gray-900/50">
            {currentPage && <EditorCanvas page={currentPage} />}
            <FloatingToolbar />
          </div>

          {/* Page Navigation */}
          <PageNavigation />
        </div>

        <RightSidebar />
        {commentsOpen && <CommentsPanel />}
        {versionsOpen && <VersionHistory />}
      </div>

      {/* Status Bar */}
      <div className="h-7 bg-white dark:bg-canva-dark-surface border-t border-gray-200 dark:border-canva-dark-border flex items-center justify-between px-4 text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span>{pages.length} page{pages.length !== 1 ? 's' : ''}</span>
          <span>{currentPage?.elements.length || 0} element{(currentPage?.elements.length || 0) !== 1 ? 's' : ''}</span>
          {selectedElementIds.length > 0 && <span className="text-canva-purple font-medium">{selectedElementIds.length} selected</span>}
        </div>
        <div className="flex items-center gap-4">
          {isSaving && <span className="text-canva-purple flex items-center gap-1"><span className="w-1.5 h-1.5 bg-canva-purple rounded-full animate-pulse" /> Saving...</span>}
          {!isSaving && lastSaved && <span>Saved {new Date(lastSaved).toLocaleTimeString()}</span>}
          <span>{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* Modals */}
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
      <ShareModal open={showShare} onClose={() => setShowShare(false)} />
      <ExportModal open={showExport} onClose={() => setShowExport(false)} />

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-display font-bold text-gray-900 dark:text-white">Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcuts(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">×</button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-1 max-h-[60vh] overflow-y-auto">
              {[
                ['Ctrl+Z', 'Undo'],
                ['Ctrl+Shift+Z', 'Redo'],
                ['Ctrl+C', 'Copy'],
                ['Ctrl+V', 'Paste'],
                ['Ctrl+X', 'Cut'],
                ['Ctrl+D', 'Duplicate'],
                ['Ctrl+A', 'Select All'],
                ['Delete', 'Delete Selected'],
                ['Ctrl++', 'Zoom In'],
                ['Ctrl+-', 'Zoom Out'],
                ['Ctrl+0', 'Reset Zoom'],
                ['Ctrl+Shift+S', 'Save'],
                ['Esc', 'Deselect'],
                ['Double-click', 'Edit text'],
                ['Scroll wheel', 'Zoom'],
              ].map(([key, action]) => (
                <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{action}</span>
                  <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
