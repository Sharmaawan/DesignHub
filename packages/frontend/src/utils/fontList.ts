// Every font here is already loaded globally via the Google Fonts <link> in
// index.html — picking one just changes the fontFamily string Konva draws
// with, no per-font loading step needed. Keep this list in sync with that
// link tag; adding a font to one without the other means the picker offers a
// font the browser was never told to fetch.
export interface FontEntry {
  name: string;
  category: 'Sans Serif' | 'Serif' | 'Display' | 'Monospace';
}

export const FONT_LIST: FontEntry[] = [
  { name: 'Inter', category: 'Sans Serif' },
  { name: 'Plus Jakarta Sans', category: 'Sans Serif' },
  { name: 'Roboto', category: 'Sans Serif' },
  { name: 'Open Sans', category: 'Sans Serif' },
  { name: 'Lato', category: 'Sans Serif' },
  { name: 'Montserrat', category: 'Sans Serif' },
  { name: 'Poppins', category: 'Sans Serif' },
  { name: 'Nunito', category: 'Sans Serif' },
  { name: 'DM Sans', category: 'Sans Serif' },
  { name: 'Work Sans', category: 'Sans Serif' },
  { name: 'Quicksand', category: 'Sans Serif' },
  { name: 'Rubik', category: 'Sans Serif' },
  { name: 'Karla', category: 'Sans Serif' },
  { name: 'Cabin', category: 'Sans Serif' },
  { name: 'Noto Sans', category: 'Sans Serif' },
  { name: 'PT Sans', category: 'Sans Serif' },
  { name: 'Ubuntu', category: 'Sans Serif' },
  { name: 'Archivo', category: 'Sans Serif' },
  { name: 'Source Sans 3', category: 'Sans Serif' },
  { name: 'Playfair Display', category: 'Serif' },
  { name: 'Merriweather', category: 'Serif' },
  { name: 'Lora', category: 'Serif' },
  { name: 'Georgia', category: 'Serif' },
  { name: 'Crimson Text', category: 'Serif' },
  { name: 'Libre Baskerville', category: 'Serif' },
  { name: 'Noto Serif', category: 'Serif' },
  { name: 'PT Serif', category: 'Serif' },
  { name: 'Bitter', category: 'Serif' },
  { name: 'Roboto Slab', category: 'Serif' },
  { name: 'Source Serif 4', category: 'Serif' },
  { name: 'Palatino Libre', category: 'Serif' },
  { name: 'Oswald', category: 'Display' },
  { name: 'Raleway', category: 'Display' },
  { name: 'Bebas Neue', category: 'Display' },
  { name: 'Josefin Sans', category: 'Display' },
  { name: 'Courier Prime', category: 'Monospace' },
];

export const FONT_CATEGORIES: FontEntry['category'][] = ['Sans Serif', 'Serif', 'Display', 'Monospace'];

const RECENT_KEY = 'designhub-recent-fonts';
const MAX_RECENT = 5;

export function getRecentFonts(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentFont(name: string) {
  try {
    const existing = getRecentFonts().filter((f) => f !== name);
    const next = [name, ...existing].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Per-browser convenience only — a blocked/full localStorage just means
    // no "recently used" list, not a broken font picker.
  }
}
