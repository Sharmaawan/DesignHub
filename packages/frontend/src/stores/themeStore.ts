import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: (localStorage.getItem('theme') as Theme) || 'system',
  isDark: localStorage.getItem('theme') === 'dark' ||
    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches),

  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    const isDark = theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ theme, isDark });
  },

  toggleTheme: () => {
    const { isDark } = get();
    get().setTheme(isDark ? 'light' : 'dark');
  },
}));

// Initialize theme on load
const theme = localStorage.getItem('theme') || 'system';
const isDark = theme === 'dark' ||
  (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
if (isDark) {
  document.documentElement.classList.add('dark');
}
