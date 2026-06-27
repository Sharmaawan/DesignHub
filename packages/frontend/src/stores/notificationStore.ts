import { create } from 'zustand';
import { Notification } from '../types';
import { notificationAPI } from '../utils/api';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isOpen: boolean;
  addNotification: (n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
  setIsOpen: (open: boolean) => void;
  loadNotifications: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,

  loadNotifications: async () => {
    try {
      const { data } = await notificationAPI.list();
      const notifications: Notification[] = data.map((n: any) => ({
        id: n.id,
        userId: n.userId,
        type: n.type,
        title: n.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        message: n.message,
        read: n.isRead,
        createdAt: n.createdAt,
      }));
      set({ notifications, unreadCount: notifications.filter((n) => !n.read).length });
    } catch {
      set({ notifications: [], unreadCount: 0 });
    }
  },

  addNotification: (n) => {
    const notification: Notification = {
      ...n,
      id: Date.now().toString(),
      read: false,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },

  markAsRead: (id) => {
    notificationAPI.markRead(id).catch(() => {});
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id);
      if (!notification || notification.read) return state;
      return {
        notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        unreadCount: state.unreadCount - 1,
      };
    });
  },

  markAllAsRead: () => {
    notificationAPI.markAllRead().catch(() => {});
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  deleteNotification: (id) => {
    notificationAPI.delete(id).catch(() => {});
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id);
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: notification && !notification.read ? state.unreadCount - 1 : state.unreadCount,
      };
    });
  },

  clearAll: () => set({ notifications: [], unreadCount: 0 }),
  setIsOpen: (open) => set({ isOpen: open }),
}));
