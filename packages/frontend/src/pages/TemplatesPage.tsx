import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { useEditorStore } from '../stores/editorStore';
import { useAuthStore } from '../stores/authStore';
import DashboardSidebar from '../components/dashboard/DashboardSidebar';
import CreateButton from '../components/dashboard/CreateButton';
import { HiOutlineSearch, HiOutlineBell, HiOutlineHeart } from 'react-icons/hi';
import { useNotificationStore } from '../stores/notificationStore';
import toast from 'react-hot-toast';

const CATEGORIES = [
  'All', 'Social Media', 'Presentations', 'Posters', 'Resume',
  'Certificates', 'Business Cards', 'Flyers', 'Video', 'Marketing',
];

export default function TemplatesPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { templates, loadTemplates } = useProjectStore();
  const { setProject } = useEditorStore();
  const { unreadCount, setIsOpen: setNotifOpen } = useNotificationStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('designhub-sidebar-collapsed') === 'true');
  const [activeSection, setActiveSection] = useState('templates');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { loadTemplates(); }, []);

  const filteredTemplates = templates.filter((t) => {
    const matchesCategory = selectedCategory === 'All' || t.category === selectedCategory;
    const matchesSearch = !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleUseTemplate = (template: any) => {
    const page = template.data?.pages?.[0];
    if (page) {
      setProject({
        id: `proj-${Date.now()}`,
        name: template.name,
        pages: [{
          id: `page-${Date.now()}`,
          name: 'Page 1',
          elements: page.elements || [],
          backgroundColor: page.backgroundColor || '#FFFFFF',
          width: page.width || 1920,
          height: page.height || 1080,
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
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#111127] transition-colors">
      <DashboardSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} activeSection={activeSection} onSectionChange={setActiveSection} />

      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-[72px]' : 'ml-[240px]'}`}>
        <header className="sticky top-0 z-30 bg-gray-50/80 dark:bg-[#111127]/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50">
          <div className="flex items-center justify-between px-6 h-16">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Templates</h2>
            <div className="flex items-center gap-3">
              <CreateButton />
              <button onClick={() => setNotifOpen(true)} className="relative p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500">
                <HiOutlineBell size={20} />
                {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full">{unreadCount}</span>}
              </button>
            </div>
          </div>
        </header>

        <main className="px-6 py-8 max-w-[1400px] mx-auto overflow-y-auto">
          {/* Search */}
          <div className="relative max-w-lg mb-6">
            <HiOutlineSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-11 pr-4 py-3 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white"
            />
          </div>

          {/* Categories */}
          <div className="flex gap-2 mb-8 overflow-x-auto no-scrollbar pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-[#7B2FBE] text-white shadow-md shadow-[#7B2FBE]/30'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Templates grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
            {filteredTemplates.map((template) => {
              const page = template.data?.pages?.[0];
              const bgColor = page?.backgroundColor || '#f3f4f6';
              return (
                <div key={template.id} className="group cursor-pointer" onClick={() => handleUseTemplate(template)}>
                  <div className="aspect-[4/3] rounded-xl overflow-hidden relative group-hover:ring-2 ring-[#7B2FBE] transition-all shadow-sm group-hover:shadow-lg" style={{ backgroundColor: bgColor }}>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 z-10">
                      <span className="px-4 py-2 bg-white dark:bg-gray-900 rounded-lg text-sm font-medium shadow-lg">Use template</span>
                    </div>
                    {template.isPro && (
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-bold bg-amber-500 text-white rounded-full z-10">PRO</span>
                    )}
                    {page?.elements?.slice(0, 4).map((el: any, i: number) => {
                      if (el.type === 'text') {
                        return (
                          <div key={i} className="absolute overflow-hidden" style={{
                            left: `${(el.x / (page.width || 1920)) * 100}%`, top: `${(el.y / (page.height || 1080)) * 100}%`,
                            width: `${(el.width / (page.width || 1920)) * 100}%`, fontSize: '5px', fontWeight: el.data?.fontWeight || 400,
                            color: el.data?.color || '#000', lineHeight: 1.2,
                          }}>{el.data?.content}</div>
                        );
                      }
                      if (el.type === 'shape') {
                        return (
                          <div key={i} className="absolute" style={{
                            left: `${(el.x / (page.width || 1920)) * 100}%`, top: `${(el.y / (page.height || 1080)) * 100}%`,
                            width: `${(el.width / (page.width || 1920)) * 100}%`, height: `${(el.height / (page.height || 1080)) * 100}%`,
                            backgroundColor: el.data?.fill || '#7B2FBE',
                            borderRadius: el.data?.shapeType === 'circle' ? '50%' : '2px',
                          }} />
                        );
                      }
                      return null;
                    })}
                  </div>
                  <div className="mt-2 px-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{template.name}</p>
                    <p className="text-[11px] text-gray-400">{template.category}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
