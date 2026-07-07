import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useThemeStore } from '../../stores/themeStore';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import {
  HiOutlineHome, HiOutlineFolder, HiOutlineTemplate, HiOutlineCollection,
  HiOutlineBell, HiOutlineDotsHorizontal, HiOutlineChevronLeft, HiOutlineChevronRight,
  HiOutlineSearch, HiOutlineSun, HiOutlineMoon,
  HiOutlineLogout, HiOutlineUser, HiOutlineGlobe, HiOutlineShare,
} from 'react-icons/hi';

interface NavItem {
  id: string;
  label: string;
  icon: any;
  route?: string;
  badge?: number;
  action?: () => void;
}

interface DashboardSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export default function DashboardSidebar({ collapsed, onToggle, activeSection, onSectionChange }: DashboardSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { unreadCount, isOpen: notifOpen, setIsOpen: setNotifOpen } = useNotificationStore();
  const [showMore, setShowMore] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const navItems: NavItem[] = [
    { id: 'home', label: 'Home', icon: HiOutlineHome, route: '/' },
    { id: 'projects', label: 'Projects', icon: HiOutlineFolder, route: '/projects' },
    { id: 'templates', label: 'Templates', icon: HiOutlineTemplate, route: '/templates' },
    { id: 'brand', label: 'Brand Hub', icon: HiOutlineCollection, route: '/brand' },
    { id: 'social', label: 'Social Publishing', icon: HiOutlineShare, route: '/social' },
    { id: 'notifications', label: 'Notifications', icon: HiOutlineBell, badge: unreadCount, action: () => setNotifOpen(!notifOpen) },
  ];

  const moreItems: NavItem[] = [];

  useEffect(() => {
    const path = location.pathname;
    if (path === '/') onSectionChange('home');
    else if (path.startsWith('/projects')) onSectionChange('projects');
    else if (path.startsWith('/templates')) onSectionChange('templates');
    else if (path.startsWith('/editor')) onSectionChange('projects');
  }, [location.pathname]);

  const handleNavClick = (item: NavItem) => {
    if (item.action) {
      item.action();
      return;
    }
    if (item.route) {
      onSectionChange(item.id);
      navigate(item.route);
    }
  };

  return (
    <div
      className={`fixed left-0 top-0 h-full z-40 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1a1a2e] transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[72px]' : 'w-[240px]'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7B2FBE] to-[#4A0E8F] flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-lg">D</span>
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold text-gray-900 dark:text-white truncate">DesignHub</h1>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">Design Platform</p>
          </div>
        )}
      </div>

      {/* Search (expanded mode) */}
      {!collapsed && (
        <div className="px-3 py-3">
          <div className="relative">
            <HiOutlineSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white placeholder-gray-400"
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative ${
                isActive
                  ? 'bg-[#7B2FBE]/10 text-[#7B2FBE] dark:bg-[#7B2FBE]/20'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Icon size={20} className={`flex-shrink-0 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`absolute ${collapsed ? 'top-1 right-1' : 'right-3'} min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full`}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#7B2FBE] rounded-r-full" />
              )}
            </button>
          );
        })}

        {moreItems.length > 0 && (
          <>
            {/* More button */}
            <button
              onClick={() => setShowMore(!showMore)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all"
            >
              <HiOutlineDotsHorizontal size={20} className="flex-shrink-0" />
              {!collapsed && <span>More</span>}
            </button>

            {showMore && !collapsed && (
              <div className="ml-4 space-y-0.5">
                {moreItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all"
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-gray-100 dark:border-gray-800 p-2 space-y-1 flex-shrink-0">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all"
        >
          {theme === 'dark' ? <HiOutlineSun size={20} /> : <HiOutlineMoon size={20} />}
          {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all"
          >
            <img
              src={user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`}
              alt=""
              className="w-7 h-7 rounded-full bg-gray-200 flex-shrink-0"
            />
            {!collapsed && (
              <div className="flex-1 min-w-0 text-left">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{user?.name || 'User'}</div>
                <div className="text-[10px] text-gray-400 truncate">{user?.email}</div>
              </div>
            )}
          </button>

          {showProfileMenu && !collapsed && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 z-50">
              <button
                onClick={() => { navigate('/settings/profile'); setShowProfileMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <HiOutlineUser size={16} /> Profile Settings
              </button>
              <button
                onClick={() => { navigate('/settings/subscription'); setShowProfileMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <HiOutlineUser size={16} /> Subscription & Billing
              </button>
              <button
                onClick={() => { navigate('/settings/workspace'); setShowProfileMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <HiOutlineGlobe size={16} /> Workspace Settings
              </button>
              <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
              <button
                onClick={() => { logout(); navigate('/login'); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <HiOutlineLogout size={16} /> Log out
              </button>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
        >
          {collapsed ? <HiOutlineChevronRight size={18} /> : <HiOutlineChevronLeft size={18} />}
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </div>
  );
}
