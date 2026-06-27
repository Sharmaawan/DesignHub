import { create } from 'zustand';
import { User } from '../types';
import { authAPI } from '../utils/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: () => void;
  loginWithSocial: (provider: string) => void;
  logout: () => void;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('designhub-token'),
  isAuthenticated: !!localStorage.getItem('designhub-token'),
  isLoading: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const { data } = await authAPI.login({ email, password });
      localStorage.setItem('designhub-token', data.token);
      localStorage.setItem('designhub-user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw new Error(error.response?.data?.error || 'Login failed');
    }
  },

  register: async (name: string, email: string, password: string) => {
    set({ isLoading: true });
    try {
      const { data } = await authAPI.register({ name, email, password });
      localStorage.setItem('designhub-token', data.token);
      localStorage.setItem('designhub-user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw new Error(error.response?.data?.error || 'Registration failed');
    }
  },

  loginWithGoogle: async () => {
    try {
      const { data } = await authAPI.googleLogin({ email: 'user@gmail.com', name: 'Google User' });
      localStorage.setItem('designhub-token', data.token);
      localStorage.setItem('designhub-user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isAuthenticated: true });
    } catch {
      throw new Error('Google login failed');
    }
  },

  loginWithSocial: async (provider: string) => {
    try {
      const { data } = await authAPI.googleLogin({ email: `user@${provider}.com`, name: `${provider} User` });
      localStorage.setItem('designhub-token', data.token);
      localStorage.setItem('designhub-user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isAuthenticated: true });
    } catch {
      throw new Error(`${provider} login failed`);
    }
  },

  logout: () => {
    localStorage.removeItem('designhub-token');
    localStorage.removeItem('designhub-user');
    set({ user: null, token: null, isAuthenticated: false });
  },

  setUser: (user) => set({ user }),
  setToken: (token) => {
    localStorage.setItem('designhub-token', token);
    set({ token, isAuthenticated: true });
  },

  loadUser: async () => {
    try {
      const { data } = await authAPI.getMe();
      set({ user: data, isAuthenticated: true });
    } catch {
      localStorage.removeItem('designhub-token');
      localStorage.removeItem('designhub-user');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },
}));
