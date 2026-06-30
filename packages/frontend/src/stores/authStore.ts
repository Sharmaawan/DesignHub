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
  loginWithGoogleCredential: (credential: string) => Promise<void>;
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

  // Google Identity Services: send the credential JWT to our backend
  loginWithGoogleCredential: async (credential: string) => {
    set({ isLoading: true });
    try {
      const { data } = await authAPI.googleLoginWithCredential(credential);
      localStorage.setItem('designhub-token', data.token);
      localStorage.setItem('designhub-user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      set({ isLoading: false });
      throw new Error(error.response?.data?.error || 'Google sign-in failed');
    }
  },

  // Legacy social login (fallback)
  loginWithSocial: (provider: string) => {
    toast(`Sign in with ${provider} coming soon`, { icon: '🔗' });
  },

  logout: () => {
    localStorage.removeItem('designhub-token');
    localStorage.removeItem('designhub-user');
    set({ user: null, token: null, isAuthenticated: false });
    // Reset Google session
    // Note: Google Identity Services doesn't provide a direct logout method
    // The token will expire naturally; local state is cleared above
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

// Import toast for loginWithSocial
import toast from 'react-hot-toast';
