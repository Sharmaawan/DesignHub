import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../../stores/notificationStore';
import {
  HiOutlineX, HiOutlineCheck, HiOutlineBell, HiOutlineTrash,
  HiOutlineChatAlt, HiOutlineShare, HiOutlineChat, HiOutlineUserGroup,
  HiOutlineDownload, HiOutlineCog,
} from 'react-icons/hi';
import { Notification } from '../../types';

const TYPE_ICONS: Record<string, any> = {
  comment: HiOutlineChatAlt,
  share: HiOutlineShare,
  mention: HiOutlineChat,
  team_invite: HiOutlineUserGroup,
  export_complete: HiOutlineDownload,
  collaboration: HiOutlineShare,
  system: HiOutlineCog,
};

const TYPE_COLORS: Record<string, string> = {
  comment: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  share: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  mention: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  team_invite: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  export_complete: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
  collaboration: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
  system: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export default function NotificationCenter() {
  const navigate = useNavigate();
  const { notifications, unreadCount, isOpen, setIsOpen, markAsRead, markAllAsRead, deleteNotification } = useNotificationStore();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleNotificationClick = (n: Notification) => {
    markAsRead(n.id);
    if (n.actionUrl) {
      navigate(n.actionUrl);
      setIsOpen(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  if (!isOpen) return null;

  return (
    <div ref={panelRef} className="fixed right-0 top-0 h-full w-[380px] bg-white dark:bg-[#1a1a2e] shadow-2xl border-l border-gray-200 dark:border-gray-800 z-50 flex flex-col animate-in slide-in-from-right">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <HiOutlineBell size={20} className="text-[#7B2FBE]" />
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Notifications</h3>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-[#7B2FBE] text-white rounded-full">{unreadCount}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllAsRead} className="text-xs text-[#7B2FBE] hover:underline font-medium">
              Mark all read
            </button>
          )}
          <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <HiOutlineX size={18} />
          </button>
        </div>
      </div>

      {/* Notifications list */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="text-center py-16">
            <HiOutlineBell size={48} className="mx-auto text-gray-200 dark:text-gray-700 mb-3" />
            <p className="text-sm text-gray-400">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] || HiOutlineBell;
              return (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`px-5 py-3.5 hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-colors cursor-pointer ${
                    !n.read ? 'bg-[#7B2FBE]/5 dark:bg-[#7B2FBE]/10' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0">
                      {n.actorAvatar ? (
                        <img src={n.actorAvatar} alt="" className="w-10 h-10 rounded-full bg-gray-200" />
                      ) : (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${TYPE_COLORS[n.type]}`}>
                          <Icon size={18} />
                        </div>
                      )}
                      <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center ${TYPE_COLORS[n.type]}`}>
                        <Icon size={10} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{n.title}</p>
                        {!n.read && <div className="w-2 h-2 rounded-full bg-[#7B2FBE] flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{formatTime(n.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      {!n.read && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
                          title="Mark as read"
                        >
                          <HiOutlineCheck size={12} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500"
                        title="Delete"
                      >
                        <HiOutlineTrash size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
        <button className="w-full py-2 text-sm font-medium text-[#7B2FBE] hover:bg-[#7B2FBE]/5 rounded-lg transition-colors">
          View all notifications
        </button>
      </div>
    </div>
  );
}
