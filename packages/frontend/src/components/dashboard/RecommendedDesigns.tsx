import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../../stores/projectStore';
import { useEditorStore } from '../../stores/editorStore';
import { HiOutlineHeart, HiOutlineClock, HiOutlineTrendingUp, HiOutlineUsers, HiOutlineStar, HiOutlineDotsHorizontal } from 'react-icons/hi';
import { formatDate } from '../../utils/cn';
import toast from 'react-hot-toast';

type Tab = 'recent' | 'favorites' | 'trending' | 'team' | 'suggested';

export default function RecommendedDesigns() {
  const [activeTab, setActiveTab] = useState<Tab>('recent');
  const { projects, toggleFavorite } = useProjectStore();
  const { setProject } = useEditorStore();
  const navigate = useNavigate();

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'recent', label: 'Recent', icon: HiOutlineClock },
    { id: 'favorites', label: 'Favorites', icon: HiOutlineHeart },
    { id: 'trending', label: 'Trending', icon: HiOutlineTrendingUp },
    { id: 'team', label: 'Team Designs', icon: HiOutlineUsers },
    { id: 'suggested', label: 'Suggested', icon: HiOutlineStar },
  ];

  const getProjectsForTab = () => {
    switch (activeTab) {
      case 'recent': return [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 6);
      case 'favorites': return projects.filter((p) => p.isFavorite);
      case 'trending': return projects.slice(0, 4);
      case 'team': return projects.filter((p) => p.collaborators.length > 0);
      case 'suggested': return projects.slice(0, 4);
      default: return projects.slice(0, 6);
    }
  };

  const displayProjects = getProjectsForTab();

  const handleOpenProject = (project: any) => {
    setProject(project);
    navigate(`/editor/${project.id}`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Your Designs</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto no-scrollbar pb-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-[#7B2FBE] text-white shadow-md shadow-[#7B2FBE]/30'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Project grid */}
      {displayProjects.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-[#1e1e30] rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
          <div className="text-4xl mb-3">🎨</div>
          <p className="text-sm text-gray-400 mb-2">No designs yet</p>
          <p className="text-xs text-gray-300">Create your first design to see it here</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {displayProjects.map((project) => {
            const firstPage = project.pages?.[0];
            const bgColor = firstPage?.backgroundColor || '#f3f4f6';
            const elements = firstPage?.elements || [];
            return (
              <div
                key={project.id}
                className="group cursor-pointer"
                onClick={() => handleOpenProject(project)}
              >
                <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden relative group-hover:ring-2 ring-[#7B2FBE] transition-all shadow-sm group-hover:shadow-lg">
                  {/* Mini canvas preview */}
                  <div className="w-full h-full relative" style={{ backgroundColor: bgColor }}>
                    {elements.slice(0, 5).map((el: any, i: number) => {
                      const scale = 0.06;
                      if (el.type === 'text') {
                        return (
                          <div
                            key={el.id}
                            className="absolute overflow-hidden"
                            style={{
                              left: `${el.x * scale}%`,
                              top: `${el.y * scale}%`,
                              width: `${el.width * scale}%`,
                              height: `${el.height * scale}%`,
                              fontSize: `${Math.max(4, (el.data?.fontSize || 16) * scale)}px`,
                              fontWeight: el.data?.fontWeight || 400,
                              color: el.data?.color || '#000',
                              fontFamily: el.data?.fontFamily || 'sans-serif',
                              lineHeight: 1.2,
                            }}
                          >
                            {el.data?.content}
                          </div>
                        );
                      }
                      if (el.type === 'shape') {
                        return (
                          <div
                            key={el.id}
                            className="absolute"
                            style={{
                              left: `${el.x * scale}%`,
                              top: `${el.y * scale}%`,
                              width: `${el.width * scale}%`,
                              height: `${el.height * scale}%`,
                              backgroundColor: el.data?.fill || '#7B2FBE',
                              borderRadius: el.data?.shapeType === 'circle' ? '50%' : '4px',
                            }}
                          />
                        );
                      }
                      return null;
                    })}
                  </div>

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="px-4 py-2 bg-white dark:bg-gray-900 rounded-lg text-sm font-medium text-gray-900 dark:text-white shadow-lg">
                      Edit design
                    </span>
                  </div>

                  {/* Favorite button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(project.id); }}
                    className={`absolute top-2 right-2 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all ${
                      project.isFavorite ? 'bg-red-500 text-white opacity-100' : 'bg-white/80 dark:bg-gray-800/80 text-gray-400 hover:text-red-500'
                    }`}
                  >
                    <HiOutlineHeart size={14} fill={project.isFavorite ? 'currentColor' : 'none'} />
                  </button>
                </div>
                <div className="mt-2 px-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{project.name}</p>
                  <p className="text-[11px] text-gray-400">{formatDate(project.updatedAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
