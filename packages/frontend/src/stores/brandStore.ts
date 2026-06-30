import { create } from 'zustand';
import api from '../utils/api';

export interface BrandLogo {
  id: string;
  name: string;
  url: string;
  isDefault: boolean;
  createdAt: string;
}

export interface BrandColor {
  id: string;
  hex: string;
  name: string;
  createdAt: string;
}

export interface BrandFont {
  id: string;
  name: string;
  type: 'heading' | 'body' | 'accent';
  url?: string;
  isDefault: boolean;
  createdAt: string;
}

export interface BrandImage {
  id: string;
  name: string;
  url: string;
  folder?: string;
  createdAt: string;
}

interface BrandState {
  logos: BrandLogo[];
  colors: BrandColor[];
  fonts: BrandFont[];
  images: BrandImage[];
  activeTab: 'logos' | 'colors' | 'fonts' | 'templates' | 'images';
  isLoading: boolean;

  setActiveTab: (tab: BrandState['activeTab']) => void;
  loadAll: () => Promise<void>;

  addLogo: (logo: Omit<BrandLogo, 'id' | 'createdAt'>) => Promise<void>;
  removeLogo: (id: string) => Promise<void>;
  setDefaultLogo: (id: string) => Promise<void>;

  addColor: (color: Omit<BrandColor, 'id' | 'createdAt'>) => Promise<void>;
  removeColor: (id: string) => Promise<void>;

  addFont: (font: Omit<BrandFont, 'id' | 'createdAt'>) => Promise<void>;
  removeFont: (id: string) => Promise<void>;
  setDefaultFont: (id: string) => Promise<void>;

  addImage: (image: Omit<BrandImage, 'id' | 'createdAt'>) => Promise<void>;
  removeImage: (id: string) => Promise<void>;
}

export const useBrandStore = create<BrandState>((set, get) => ({
  logos: [],
  colors: [],
  fonts: [],
  images: [],
  activeTab: 'logos',
  isLoading: false,

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadAll: async () => {
    set({ isLoading: true });
    try {
      const [logosRes, colorsRes, fontsRes, assetsRes] = await Promise.all([
        api.get('/brand/logos'),
        api.get('/brand/colors'),
        api.get('/brand/fonts'),
        api.get('/brand/assets'),
      ]);
      set({
        logos: logosRes.data,
        colors: colorsRes.data,
        fonts: fontsRes.data,
        images: assetsRes.data.filter((a: any) => a.type === 'image').map((a: any) => ({
          id: a.id,
          name: a.name || 'Brand Image',
          url: a.url,
          folder: a.folder,
          createdAt: a.createdAt,
        })),
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  addLogo: async (logo) => {
    try {
      const { data } = await api.post('/brand/logos', logo);
      set((state) => ({ logos: [data, ...state.logos] }));
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to add logo');
    }
  },

  removeLogo: async (id) => {
    try {
      await api.delete(`/brand/logos/${id}`);
      set((state) => ({ logos: state.logos.filter((l) => l.id !== id) }));
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to remove logo');
    }
  },

  setDefaultLogo: async (id) => {
    try {
      await api.put(`/brand/logos/${id}/default`);
      set((state) => ({
        logos: state.logos.map((l) => ({ ...l, isDefault: l.id === id })),
      }));
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to set default');
    }
  },

  addColor: async (color) => {
    try {
      const { data } = await api.post('/brand/colors', color);
      set((state) => ({ colors: [...state.colors, data] }));
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to add color');
    }
  },

  removeColor: async (id) => {
    try {
      await api.delete(`/brand/colors/${id}`);
      set((state) => ({ colors: state.colors.filter((c) => c.id !== id) }));
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to remove color');
    }
  },

  addFont: async (font) => {
    try {
      const { data } = await api.post('/brand/fonts', font);
      set((state) => ({ fonts: [...state.fonts, data] }));
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to add font');
    }
  },

  removeFont: async (id) => {
    try {
      await api.delete(`/brand/fonts/${id}`);
      set((state) => ({ fonts: state.fonts.filter((f) => f.id !== id) }));
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to remove font');
    }
  },

  setDefaultFont: async (id) => {
    try {
      await api.put(`/brand/fonts/${id}/default`, {});
      set((state) => ({
        fonts: state.fonts.map((f) => ({ ...f, isDefault: f.id === id })),
      }));
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to set default');
    }
  },

  addImage: async (image) => {
    try {
      const { data } = await api.post('/brand/assets', { ...image, type: 'image' });
      set((state) => ({
        images: [...state.images, { id: data.id, name: data.name || image.name, url: data.url, folder: data.folder, createdAt: data.createdAt }],
      }));
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to add image');
    }
  },

  removeImage: async (id) => {
    try {
      await api.delete(`/brand/assets/${id}`);
      set((state) => ({ images: state.images.filter((i) => i.id !== id) }));
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to remove image');
    }
  },
}));
