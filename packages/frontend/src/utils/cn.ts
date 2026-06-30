import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatDate(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export const CANVAS_PRESETS: Record<string, { width: number; height: number }> = {
  'Instagram Post': { width: 1080, height: 1080 },
  'Instagram Story': { width: 1080, height: 1920 },
  'Facebook Post': { width: 1200, height: 630 },
  'Twitter Post': { width: 1200, height: 675 },
  'YouTube Thumbnail': { width: 1280, height: 720 },
  'Presentation 16:9': { width: 1920, height: 1080 },
  'Presentation 4:3': { width: 1440, height: 1080 },
  'A4 Portrait': { width: 794, height: 1123 },
  'A4 Landscape': { width: 1123, height: 794 },
  'Poster': { width: 800, height: 1200 },
  'Business Card': { width: 1050, height: 600 },
  'Resume': { width: 816, height: 1056 },
  'Flyer': { width: 800, height: 1200 },
  'Logo': { width: 500, height: 500 },
  'Banner': { width: 1500, height: 500 },
};

export const FONT_FAMILIES = [
  'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
  'Courier New', 'Verdana', 'Impact', 'Comic Sans MS',
  'Trebuchet MS', 'Palatino', 'Garamond', 'Bookman',
  'Avant Garde', 'Calibri', 'Cambria', 'Futura',
  'Roboto', 'Open Sans', 'Lato', 'Montserrat',
  'Poppins', 'Raleway', 'Oswald', 'Playfair Display',
  'Merriweather', 'Source Sans 3', 'Nunito', 'Ubuntu',
  'DM Sans', 'Quicksand', 'Work Sans', 'Rubik',
  'Bebas Neue', 'Archivo', 'Bitter', 'Cabin',
  'Josefin Sans', 'Karla', 'Libre Baskerville', 'Lora',
  'Noto Sans', 'Noto Serif', 'PT Sans', 'PT Serif',
  'Roboto Slab', 'Source Serif 4', 'Crimson Text', 'Courier Prime',
];

// Which font weights are available for each font family
export const FONT_WEIGHT_MAP: Record<string, number[]> = {
  'Inter': [300, 400, 500, 600, 700, 800, 900],
  'Plus Jakarta Sans': [400, 500, 600, 700, 800],
  'Roboto': [300, 400, 500, 700, 900],
  'Open Sans': [300, 400, 500, 600, 700, 800],
  'Lato': [300, 400, 700, 900],
  'Montserrat': [300, 400, 500, 600, 700, 800, 900],
  'Poppins': [300, 400, 500, 600, 700, 800, 900],
  'Raleway': [300, 400, 500, 600, 700, 800, 900],
  'Oswald': [300, 400, 500, 600, 700],
  'Playfair Display': [400, 500, 600, 700, 800, 900],
  'Merriweather': [300, 400, 700, 900],
  'Source Sans 3': [300, 400, 500, 600, 700, 800, 900],
  'Nunito': [300, 400, 500, 600, 700, 800, 900],
  'Ubuntu': [300, 400, 500, 700],
  'DM Sans': [400, 500, 700],
  'Quicksand': [300, 400, 500, 600, 700],
  'Work Sans': [300, 400, 500, 600, 700, 800, 900],
  'Rubik': [300, 400, 500, 600, 700, 800, 900],
  'Bebas Neue': [400],
  'Archivo': [400, 500, 600, 700, 800, 900],
  'Bitter': [300, 400, 500, 600, 700, 800, 900],
  'Cabin': [400, 500, 600, 700],
  'Josefin Sans': [300, 400, 500, 600, 700],
  'Karla': [300, 400, 500, 600, 700, 800],
  'Libre Baskerville': [400, 700],
  'Lora': [400, 500, 600, 700],
  'Noto Sans': [300, 400, 500, 600, 700, 800, 900],
  'Noto Serif': [400, 700, 900],
  'PT Sans': [400, 700],
  'PT Serif': [400, 700],
  'Roboto Slab': [300, 400, 500, 600, 700, 800, 900],
  'Source Serif 4': [400, 500, 600, 700, 800, 900],
  'Crimson Text': [400, 600, 700],
  'Courier Prime': [400, 700],
  // System fonts — support common weights
  'Arial': [400, 700],
  'Helvetica': [300, 400, 700],
  'Georgia': [400, 700],
  'Times New Roman': [400, 700],
  'Courier New': [400, 700],
  'Verdana': [400, 700],
  'Impact': [400],
  'Comic Sans MS': [400, 700],
  'Trebuchet MS': [400, 700],
  'Palatino': [400, 700],
  'Garamond': [400, 700],
  'Bookman': [400, 700],
  'Avant Garde': [400, 700],
  'Calibri': [400, 700],
  'Cambria': [400, 700],
  'Futura': [400, 700],
};

export const FONT_WEIGHT_LABELS: Record<number, string> = {
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

export const COLORS_PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#D9D9D9', '#EFEFEF', '#F3F3F3', '#FFFFFF',
  '#980000', '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#4A86E8', '#0000FF', '#9900FF', '#FF00FF',
  '#E6B8AF', '#F4CCCC', '#FCE5CD', '#FFF2CC', '#D9EAD3', '#D0E0E3', '#C9DAF8', '#CFE2F3', '#D9D2E9', '#EAD1DC',
  '#DD7E6B', '#EA9999', '#F9CB9C', '#FFE599', '#B6D7A8', '#A2C4C9', '#A4C2F4', '#9FC5E8', '#B4A7D6', '#D5A6BD',
  '#CC4125', '#E06666', '#F6B26B', '#FFD966', '#93C47D', '#76A5AF', '#6D9EEB', '#6FA8DC', '#8E7CC3', '#C27BA0',
  '#A61C00', '#CC0000', '#E69138', '#F1C232', '#6AA84F', '#45818E', '#3C78D8', '#3D85C6', '#674EA7', '#A64D79',
  '#85200C', '#990000', '#B45F06', '#BF9000', '#38761D', '#134F5C', '#1155CC', '#0B5394', '#351C75', '#741B47',
  '#5B0F00', '#660000', '#783F04', '#7F6000', '#274E13', '#0C343D', '#1C4587', '#073763', '#20124D', '#4C1130',
];

export const GRADIENT_PRESETS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
  'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
  'linear-gradient(135deg, #f5576c 0%, #ff6a88 100%)',
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)',
  'linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)',
];
