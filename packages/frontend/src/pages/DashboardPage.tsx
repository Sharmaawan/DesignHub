import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useProjectStore } from '../stores/projectStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useEditorStore } from '../stores/editorStore';
import { useTeamStore } from '../stores/teamStore';
import DashboardSidebar from '../components/dashboard/DashboardSidebar';
import CreateButton from '../components/dashboard/CreateButton';
import HeroSearch from '../components/dashboard/HeroSearch';
import QuickAccessCategories from '../components/dashboard/QuickAccessCategories';
import TeamRequests from '../components/dashboard/TeamRequests';
import WhatsNew from '../components/dashboard/WhatsNew';
import RecommendedDesigns from '../components/dashboard/RecommendedDesigns';
import NotificationCenter from '../components/dashboard/NotificationCenter';
import { formatDate, CANVAS_PRESETS } from '../utils/cn';
import {
  HiOutlinePlus, HiOutlineTemplate, HiOutlineBell, HiOutlineHeart,
  HiOutlineFolder, HiOutlineDotsHorizontal, HiOutlineSearch, HiOutlineViewGrid,
  HiOutlinePencilAlt, HiOutlineTrash, HiOutlineDownload, HiOutlineShare,
} from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function DashboardPage({ initialSection }: { initialSection?: string } = {}) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { projects, templates, folders, loadTemplates, loadProjects, toggleFavorite, deleteProject, searchQuery, setSearchQuery } = useProjectStore();
  const { setProject } = useEditorStore();
  const { isOpen: notifOpen, setIsOpen: setNotifOpen, unreadCount, loadNotifications } = useNotificationStore();
  const { loadUserInvites, loadTeams } = useTeamStore();
  const { logout } = useAuthStore();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('designhub-sidebar-collapsed') === 'true';
  });
  const [activeSection, setActiveSection] = useState(initialSection || 'home');
  const [showNewDesignModal, setShowNewDesignModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ projectId: string; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    loadTemplates();
    loadProjects();
    loadNotifications();
    loadUserInvites();
    loadTeams();
  }, []);

  // Auto-logout on 401
  useEffect(() => {
    const token = localStorage.getItem('designhub-token');
    if (!token) {
      navigate('/login');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('designhub-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const handleNewDesign = (preset: any) => {
    setProject({
      id: `proj-${Date.now()}`,
      name: preset.name,
      pages: [{
        id: `page-${Date.now()}`,
        name: 'Page 1',
        elements: [],
        backgroundColor: '#FFFFFF',
        width: preset.width,
        height: preset.height,
      }],
      ownerId: user?.id || '1',
      collaborators: [],
      isFavorite: false,
      isTemplate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    toast.success(`Created ${preset.name}`);
    navigate('/editor');
    setShowNewDesignModal(false);
  };

  const handleOpenProject = (project: any) => {
    setProject(project);
    navigate(`/editor/${project.id}`);
  };

  const handleContextMenu = (e: React.MouseEvent, projectId: string) => {
    e.preventDefault();
    setContextMenu({ projectId, x: e.clientX, y: e.clientY });
  };

  const startRename = (project: any) => {
    setRenamingId(project.id);
    setRenameValue(project.name);
    setContextMenu(null);
  };

  const finishRename = (projectId: string) => {
    if (renameValue.trim()) {
      const { updateProject } = useProjectStore.getState();
      updateProject(projectId, { name: renameValue.trim() });
      toast.success('Project renamed');
    }
    setRenamingId(null);
  };

  const handleDeleteProject = (projectId: string) => {
    deleteProject(projectId);
    setContextMenu(null);
    toast.success('Project deleted');
  };

  const handleDuplicateProject = (project: any) => {
    const newProject = {
      ...project,
      id: `proj-${Date.now()}`,
      name: `${project.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { addProject } = useProjectStore.getState();
    addProject(newProject);
    setContextMenu(null);
    toast.success('Project duplicated');
  };

  const handleDownload = (project: any) => {
    const canvas = document.createElement('canvas');
    const page = project.pages?.[0];
    canvas.width = page?.width || 1080;
    canvas.height = page?.height || 1080;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = page?.backgroundColor || '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `${project.name}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
    setContextMenu(null);
    toast.success('Downloaded!');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const recentProjects = [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 6);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#111127] transition-colors">
      {/* Sidebar */}
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      {/* Main content */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-[72px]' : 'ml-[240px]'}`}>
        {/* Top header */}
        <header className="sticky top-0 z-30 bg-gray-50/80 dark:bg-[#111127]/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50">
          <div className="flex items-center justify-between px-6 h-16">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white hidden md:block">
                {getGreeting()}, {user?.name?.split(' ')[0] || 'Designer'}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <CreateButton />
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500"
              >
                <HiOutlineBell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="px-6 py-8 max-w-[1400px] mx-auto overflow-y-auto">
          {/* Hero section */}
          {activeSection === 'home' && (
            <div className="mb-10">
              <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white mb-3">
                  What will you design today?
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm md:text-base max-w-md mx-auto">
                  Start from a template, upload a file, or begin with a blank canvas
                </p>
              </div>
              <HeroSearch />
            </div>
          )}

          {/* Quick Access Categories */}
          <section className="mb-10">
            <QuickAccessCategories />
          </section>

          {/* Magic AI Studio — home only */}
          {activeSection === 'home' && (
            <section className="mb-10">
              <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#6366F1] via-[#8B5CF6] to-[#EC4899] p-px shadow-xl">
                <div className="rounded-2xl bg-white dark:bg-[#1a1a2e] px-6 py-5">
                  <div className="flex flex-col md:flex-row md:items-center gap-6">
                    {/* Left: headline */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">✨</span>
                        <h2 className="text-lg font-extrabold bg-gradient-to-r from-[#6366F1] to-[#EC4899] bg-clip-text text-transparent">
                          Magic AI Studio
                        </h2>
                        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-gradient-to-r from-[#6366F1] to-[#EC4899] text-white rounded-full">NEW</span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Generate text, design ideas, and image descriptions instantly with AI.
                      </p>
                    </div>
                    {/* Right: quick-action cards */}
                    <div className="flex gap-3 flex-wrap">
                      {[
                        { emoji: '✍️', label: 'Magic Write', desc: 'AI copywriting', color: 'from-violet-500 to-purple-600' },
                        { emoji: '🖼️', label: 'Image Ideas', desc: 'Visual concepts', color: 'from-pink-500 to-rose-600' },
                        { emoji: '💡', label: 'Design Ideas', desc: 'Inspiration', color: 'from-amber-500 to-orange-600' },
                        { emoji: '🎨', label: 'Color Palette', desc: 'AI colors', color: 'from-teal-500 to-cyan-600' },
                      ].map((action) => (
                        <button
                          key={action.label}
                          onClick={() => {
                            setProject({
                              id: `proj-${Date.now()}`,
                              name: 'AI Design',
                              pages: [{ id: `page-${Date.now()}`, name: 'Page 1', elements: [], backgroundColor: '#FFFFFF', width: 1920, height: 1080 }],
                              ownerId: user?.id || '1',
                              collaborators: [],
                              isFavorite: false,
                              isTemplate: false,
                              createdAt: new Date().toISOString(),
                              updatedAt: new Date().toISOString(),
                            });
                            navigate('/editor');
                            toast.success(`Open the AI tab in the editor sidebar`);
                          }}
                          className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all group min-w-[80px]"
                        >
                          <span className="text-2xl group-hover:scale-110 transition-transform">{action.emoji}</span>
                          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{action.label}</span>
                          <span className="text-[9px] text-gray-400">{action.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Templates section (home only) */}
          {activeSection === 'home' && (
            <section className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Trending Templates</h2>
                <button
                  onClick={() => navigate('/templates')}
                  className="text-sm font-medium text-[#7B2FBE] hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {templates.slice(0, 6).map((template) => {
                  const page = template.data?.pages?.[0];
                  const bgColor = page?.backgroundColor || '#f3f4f6';
                  return (
                    <button
                      key={template.id}
                      onClick={() => {
                        const tmplPage = template.data?.pages?.[0];
                        if (tmplPage) {
                          setProject({
                            id: `proj-${Date.now()}`,
                            name: template.name,
                            pages: [{
                              id: `page-${Date.now()}`,
                              name: 'Page 1',
                              elements: tmplPage.elements || [],
                              backgroundColor: tmplPage.backgroundColor || '#FFFFFF',
                              width: tmplPage.width || 1920,
                              height: tmplPage.height || 1080,
                            }],
                            ownerId: user?.id || '1',
                            collaborators: [],
                            isFavorite: false,
                            isTemplate: false,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                          });
                          navigate('/editor');
                        }
                      }}
                      className="group cursor-pointer text-left"
                    >
                      <div className="aspect-[4/3] rounded-xl overflow-hidden relative group-hover:ring-2 ring-[#7B2FBE] transition-all shadow-sm group-hover:shadow-lg" style={{ backgroundColor: bgColor }}>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <span className="px-3 py-1.5 bg-white dark:bg-gray-900 rounded-lg text-xs font-medium shadow-lg">Use template</span>
                        </div>
                        {template.isPro && (
                          <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-bold bg-amber-500 text-white rounded-full">PRO</span>
                        )}
                        {page?.elements?.slice(0, 3).map((el: any, i: number) => {
                          if (el.type === 'text') {
                            return (
                              <div key={i} className="absolute overflow-hidden" style={{
                                left: `${(el.x / (page.width || 1920)) * 100}%`,
                                top: `${(el.y / (page.height || 1080)) * 100}%`,
                                width: `${(el.width / (page.width || 1920)) * 100}%`,
                                fontSize: '5px', fontWeight: el.data?.fontWeight || 400,
                                color: el.data?.color || '#000', lineHeight: 1.2,
                              }}>
                                {el.data?.content}
                              </div>
                            );
                          }
                          if (el.type === 'shape') {
                            return (
                              <div key={i} className="absolute" style={{
                                left: `${(el.x / (page.width || 1920)) * 100}%`,
                                top: `${(el.y / (page.height || 1080)) * 100}%`,
                                width: `${(el.width / (page.width || 1920)) * 100}%`,
                                height: `${(el.height / (page.height || 1080)) * 100}%`,
                                backgroundColor: el.data?.fill || '#7B2FBE',
                                borderRadius: el.data?.shapeType === 'circle' ? '50%' : '2px',
                              }} />
                            );
                          }
                          return null;
                        })}
                      </div>
                      <p className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{template.name}</p>
                      <p className="text-[10px] text-gray-400">{template.category}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Recent Projects Section */}
          <section className="mb-10">
            <RecommendedDesigns />
          </section>

          {/* Two-column layout for side sections */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
            {/* Team Requests */}
            <div className="lg:col-span-1">
              <TeamRequests />
            </div>

            {/* What's New */}
            <div className="lg:col-span-2">
              <WhatsNew />
            </div>
          </div>

          {/* All Projects (when viewing projects section) */}
          {activeSection === 'projects' && (
            <section className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">All Projects</h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <HiOutlineSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search projects..."
                      className="pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white w-64"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {projects.filter((p) => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())).map((project) => {
                  const firstPage = project.pages?.[0];
                  const bgColor = firstPage?.backgroundColor || '#f3f4f6';
                  return (
                    <div
                      key={project.id}
                      className="group cursor-pointer"
                      onClick={() => handleOpenProject(project)}
                      onContextMenu={(e) => handleContextMenu(e, project.id)}
                    >
                      <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden relative group-hover:ring-2 ring-[#7B2FBE] transition-all shadow-sm">
                        <div className="w-full h-full" style={{ backgroundColor: bgColor }}>
                          {firstPage?.elements?.slice(0, 3).map((el: any, i: number) => {
                            if (el.type === 'text') {
                              return (
                                <div key={i} className="absolute overflow-hidden" style={{
                                  left: `${(el.x / (firstPage.width || 1920)) * 100}%`,
                                  top: `${(el.y / (firstPage.height || 1080)) * 100}%`,
                                  width: `${(el.width / (firstPage.width || 1920)) * 100}%`,
                                  fontSize: '4px', color: el.data?.color || '#000', lineHeight: 1.2,
                                }}>
                                  {el.data?.content}
                                </div>
                              );
                            }
                            if (el.type === 'shape') {
                              return (
                                <div key={i} className="absolute" style={{
                                  left: `${(el.x / (firstPage.width || 1920)) * 100}%`,
                                  top: `${(el.y / (firstPage.height || 1080)) * 100}%`,
                                  width: `${(el.width / (firstPage.width || 1920)) * 100}%`,
                                  height: `${(el.height / (firstPage.height || 1080)) * 100}%`,
                                  backgroundColor: el.data?.fill || '#7B2FBE',
                                }} />
                              );
                            }
                            return null;
                          })}
                        </div>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <span className="px-4 py-2 bg-white dark:bg-gray-900 rounded-lg text-sm font-medium shadow-lg">Edit</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(project.id); }}
                          className={`absolute top-2 right-2 p-1.5 rounded-full transition-all ${
                            project.isFavorite ? 'bg-red-500 text-white' : 'bg-white/80 dark:bg-gray-800/80 text-gray-400 opacity-0 group-hover:opacity-100'
                          }`}
                        >
                          <HiOutlineHeart size={12} fill={project.isFavorite ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          onClick={(e) => handleContextMenu(e, project.id)}
                          className="absolute top-2 left-2 p-1.5 rounded-full bg-white/80 dark:bg-gray-800/80 text-gray-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <HiOutlineDotsHorizontal size={12} />
                        </button>
                      </div>
                      <div className="mt-2 px-1">
                        {renamingId === project.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => finishRename(project.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') finishRename(project.id); if (e.key === 'Escape') setRenamingId(null); }}
                            className="w-full text-sm font-medium bg-white dark:bg-gray-800 border border-[#7B2FBE] rounded px-2 py-1 focus:outline-none text-gray-900 dark:text-white"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{project.name}</p>
                        )}
                        <p className="text-[11px] text-gray-400">{formatDate(project.updatedAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 w-48"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {[
              { icon: HiOutlinePencilAlt, label: 'Edit', action: () => { const p = projects.find((pr) => pr.id === contextMenu.projectId); if (p) { handleOpenProject(p); } } },
              { icon: HiOutlineTemplate, label: 'Duplicate', action: () => { const p = projects.find((pr) => pr.id === contextMenu.projectId); if (p) handleDuplicateProject(p); } },
              { icon: HiOutlineDownload, label: 'Download', action: () => { const p = projects.find((pr) => pr.id === contextMenu.projectId); if (p) handleDownload(p); } },
              { icon: HiOutlineShare, label: 'Share', action: () => { setContextMenu(null); toast('Share feature coming soon!', { icon: '🔗' }); } },
              { icon: HiOutlineHeart, label: 'Toggle favorite', action: () => { toggleFavorite(contextMenu.projectId); setContextMenu(null); } },
              { icon: HiOutlinePencilAlt, label: 'Rename', action: () => { const p = projects.find((pr) => pr.id === contextMenu.projectId); if (p) startRename(p); } },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={(e) => { e.stopPropagation(); item.action(); setContextMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <Icon size={15} /> {item.label}
                </button>
              );
            })}
            <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
            <button
              onClick={() => handleDeleteProject(contextMenu.projectId)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <HiOutlineTrash size={15} /> Delete
            </button>
          </div>
        </>
      )}

      {/* New Design Modal */}
      {showNewDesignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowNewDesignModal(false)}>
          <div className="bg-white dark:bg-[#1e1e30] rounded-2xl shadow-2xl w-[600px] max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Create new design</h3>
              <button onClick={() => setShowNewDesignModal(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">✕</button>
            </div>
            <div className="p-6 grid grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
              {Object.entries(CANVAS_PRESETS).map(([name, { width, height }]) => (
                <button
                  key={name}
                  onClick={() => handleNewDesign({ name, width, height })}
                  className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-[#7B2FBE] hover:bg-[#7B2FBE]/5 transition-all text-left group"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-[#7B2FBE]">{name}</p>
                  <p className="text-[11px] text-gray-400 mt-1">{width} × {height}px</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notification Center */}
      <NotificationCenter />
    </div>
  );
}
