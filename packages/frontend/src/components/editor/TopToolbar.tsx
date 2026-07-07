import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../stores/editorStore';
import { useProjectStore } from '../../stores/projectStore';
import {
  HiOutlineArrowLeft, HiOutlineDownload, HiOutlineShare,
  HiOutlineReply, HiOutlineRefresh, HiOutlineSearch,
  HiOutlineViewGrid, HiOutlineSun, HiOutlineMoon,
  HiOutlineSave, HiOutlineCheck, HiOutlineClock,
  HiOutlineChevronDown, HiOutlineCog, HiOutlinePencil,
  HiOutlineChevronRight, HiOutlineTemplate, HiOutlineFilm,
  HiOutlineGlobeAlt, HiOutlineEye,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { Collaborator } from '../../hooks/useCollaboration';

interface TopToolbarProps {
  onThemeToggle: () => void;
  isDark: boolean;
  onShowShortcuts: () => void;
  onOpenShare: () => void;
  onOpenExport: () => void;
  onOpenPublish: () => void;
  onOpenSettings: () => void;
  onOpenPreview: () => void;
  collaborators: Collaborator[];
}

export default function TopToolbar({ onThemeToggle, isDark, onShowShortcuts, onOpenShare, onOpenExport, onOpenPublish, onOpenSettings, onOpenPreview, collaborators }: TopToolbarProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    zoom, zoomIn, zoomOut, resetZoom, setZoom,
    undo, redo, history, historyIndex,
    showGrid, showRulers, showGuides, snapEnabled,
    toggleGrid, toggleRulers, toggleGuides, toggleSnap,
    isSaving, lastSaved, setSaving, setLastSaved,
    setCommentsOpen, setVersionsOpen, commentsOpen, versionsOpen,
    pages, currentPageIndex, sidePanelTab, setSidePanelTab,
  } = useEditorStore();
  const { projects, updateProject } = useProjectStore();
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [projectName, setProjectName] = useState('');

  const projectId = window.location.pathname.split('/').pop();
  const project = projects.find((p) => p.id === projectId);
  const currentPage = pages[currentPageIndex];

  const handleSave = () => {
    if (!projectId) return;
    setSaving(true);
    const state = useEditorStore.getState();
    updateProject(projectId, { canvasData: state.pages, name: project?.name || 'Untitled' });
    setTimeout(() => {
      setSaving(false);
      setLastSaved(new Date().toISOString());
      toast.success('Design saved!');
    }, 600);
  };

  const handleNameSave = () => {
    if (projectId && projectName.trim()) {
      updateProject(projectId, { name: projectName.trim() });
      toast.success('Renamed!');
    }
    setEditingName(false);
  };

  const handleExportCanvas = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `design-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Quick export downloaded!');
    }
  };

  return (
    <div className="h-14 bg-white dark:bg-canva-dark-surface border-b border-gray-200 dark:border-canva-dark-border flex items-center justify-between px-3 flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/')} className="toolbar-btn flex items-center gap-1.5" title="Back to dashboard">
          <HiOutlineArrowLeft size={18} />
          <span className="text-sm font-medium hidden sm:inline">Home</span>
        </button>
        <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />
        <div className="flex items-center gap-0.5">
          <button onClick={undo} disabled={historyIndex <= 0} className="toolbar-btn disabled:opacity-30 disabled:cursor-not-allowed" title="Undo (Ctrl+Z)">
            <HiOutlineReply size={16} />
          </button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} className="toolbar-btn disabled:opacity-30 disabled:cursor-not-allowed" title="Redo (Ctrl+Shift+Z)">
            <HiOutlineRefresh size={16} />
          </button>
        </div>
        <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />
        <button onClick={handleSave} className="toolbar-btn flex items-center gap-1" title="Save (Ctrl+Shift+S)">
          <HiOutlineSave size={16} />
          <span className="text-[11px] hidden md:inline">
            {isSaving ? 'Saving...' : lastSaved ? `Saved` : 'Save'}
          </span>
        </button>
      </div>

      {/* Center */}
      <div className="flex items-center gap-2">
        {editingName ? (
          <input
            autoFocus
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setEditingName(false); }}
            className="text-sm font-medium text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-canva-purple text-center min-w-[150px]"
          />
        ) : (
          <button
            onClick={() => { setProjectName(project?.name || 'Untitled Design'); setEditingName(true); }}
            className="text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-1 rounded-lg transition-colors flex items-center gap-1"
          >
            {project?.name || 'Untitled Design'}
            <HiOutlinePencil size={12} className="text-gray-400" />
          </button>
        )}
        {isSaving && <HiOutlineCheck size={14} className="text-green-500" />}
        {currentPage && (
          <span className="text-[10px] text-gray-400 hidden md:inline">
            {currentPage.width}×{currentPage.height}
          </span>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        {/* View menu */}
        <div className="relative">
          <button onClick={() => setShowViewMenu(!showViewMenu)} className="toolbar-btn flex items-center gap-1 text-xs">
            <HiOutlineViewGrid size={16} />
            <span className="hidden lg:inline">View</span>
            <HiOutlineChevronRight size={10} className={`transition-transform ${showViewMenu ? 'rotate-90' : ''}`} />
          </button>
          {showViewMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowViewMenu(false)} />
              <div className="absolute right-0 top-10 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 w-52">
                {[
                  { label: 'Show grid', active: showGrid, toggle: toggleGrid, icon: '⊞' },
                  { label: 'Show rulers', active: showRulers, toggle: toggleRulers, icon: '📏' },
                  { label: 'Show guides', active: showGuides, toggle: toggleGuides, icon: '🧲' },
                  { label: 'Snap to grid', active: snapEnabled, toggle: toggleSnap, icon: '📌' },
                ].map((item) => (
                  <button key={item.label} onClick={item.toggle} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <span className="w-5 text-center">{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.active && <HiOutlineCheck size={14} className="text-canva-purple" />}
                  </button>
                ))}
                <hr className="my-1 border-gray-100 dark:border-gray-700" />
                <button onClick={onThemeToggle} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <span className="w-5 text-center">{isDark ? '☀️' : '🌙'}</span>
                  <span className="flex-1 text-left">{isDark ? 'Light mode' : 'Dark mode'}</span>
                </button>
                <button onClick={() => { onShowShortcuts(); setShowViewMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <span className="w-5 text-center">⌨️</span>
                  <span className="flex-1 text-left">Keyboard shortcuts</span>
                </button>
                <button onClick={() => { onOpenSettings(); setShowViewMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <HiOutlineCog size={16} className="ml-0.5" />
                  <span className="flex-1 text-left">Settings</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Zoom */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg">
          <button onClick={zoomOut} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-l-lg transition-colors" title="Zoom out">
            <HiOutlineSearch size={14} className="scale-75" />
          </button>
          <div className="relative">
            <button onClick={() => setShowZoomMenu(!showZoomMenu)} className="px-2 py-1 text-[11px] font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors min-w-[44px] text-center">
              {Math.round(zoom * 100)}%
            </button>
            {showZoomMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowZoomMenu(false)} />
                <div className="absolute right-0 top-8 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1 w-32">
                  {[25, 50, 75, 100, 150, 200, 300].map((pct) => (
                    <button key={pct} onClick={() => { setZoom(pct / 100); setShowZoomMenu(false); }} className={`w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 ${Math.round(zoom * 100) === pct ? 'text-canva-purple font-medium' : ''}`}>
                      {pct}%
                    </button>
                  ))}
                  <hr className="my-1 border-gray-100 dark:border-gray-700" />
                  <button onClick={() => { resetZoom(); setShowZoomMenu(false); }} className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700/50">Fit to screen</button>
                </div>
              </>
            )}
          </div>
          <button onClick={zoomIn} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-r-lg transition-colors" title="Zoom in">
            <HiOutlineSearch size={14} />
          </button>
        </div>

        <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Comments */}
        <button onClick={() => setCommentsOpen(!commentsOpen)} className={`toolbar-btn ${commentsOpen ? 'bg-canva-purple/10 text-canva-purple' : ''}`} title="Comments">
          <HiOutlinePencil size={16} />
        </button>

        {/* Version History */}
        <button onClick={() => setVersionsOpen(!versionsOpen)} className={`toolbar-btn ${versionsOpen ? 'bg-canva-purple/10 text-canva-purple' : ''}`} title="Version history">
          <HiOutlineClock size={16} />
        </button>

        {/* Layers */}
        <button onClick={() => setSidePanelTab(sidePanelTab === 'layers' ? '' : 'layers')} className={`toolbar-btn ${sidePanelTab === 'layers' ? 'bg-canva-purple/10 text-canva-purple' : ''}`} title="Layers panel">
          <HiOutlineViewGrid size={16} />
        </button>

        {/* Transitions */}
        <button onClick={() => setSidePanelTab(sidePanelTab === 'transitions' ? '' : 'transitions')} className={`toolbar-btn ${sidePanelTab === 'transitions' ? 'bg-canva-purple/10 text-canva-purple' : ''}`} title="Page transitions">
          <HiOutlineFilm size={16} />
        </button>

        <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Collaborators avatars — real live viewers of this project, via useCollaboration */}
        <div className="flex -space-x-2 mx-1">
          <img src={user?.avatar} alt="" className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 bg-gray-200" title="You" />
          {collaborators.map((c) => (
            c.avatar
              ? <img key={c.id} src={c.avatar} alt="" className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 bg-gray-200" title={c.name} />
              : (
                <div key={c.id} style={{ backgroundColor: `${c.color}33`, color: c.color }}
                  className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-[9px] font-bold" title={c.name}>
                  {c.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
              )
          ))}
        </div>

        {/* Preview */}
        <button onClick={onOpenPreview} className="toolbar-btn flex items-center gap-1" title="Preview design">
          <HiOutlineEye size={16} />
          <span className="text-xs hidden lg:inline">Preview</span>
        </button>

        {/* Share */}
        <button onClick={onOpenShare} className="toolbar-btn flex items-center gap-1" title="Share this design">
          <HiOutlineShare size={16} />
          <span className="text-xs hidden lg:inline">Share</span>
        </button>

        {/* Quick export + Full export */}
        <button onClick={handleExportCanvas} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Quick PNG export">
          <HiOutlineDownload size={16} />
        </button>
        <button onClick={onOpenExport} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3">
          <HiOutlineDownload size={14} />
          <span className="hidden sm:inline">Export</span>
          <HiOutlineChevronDown size={10} />
        </button>
        <button onClick={onOpenPublish} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3" title="Publish to social media">
          <HiOutlineGlobeAlt size={14} />
          <span className="hidden sm:inline">Publish</span>
        </button>
      </div>
    </div>
  );
}
