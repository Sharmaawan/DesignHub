import { Page, TextData, ShapeData, IconData } from '../types';

// ===== HSV <-> hex, used by the custom saturation/value square + hue strip =====

export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

export function isPlainHexColor(value: string | undefined): value is string {
  return !!value && /^#?[0-9a-f]{6}$/i.test(value.trim()) && !value.includes('gradient');
}

// ===== Document colors: every distinct color already used somewhere in the design =====
// Walked in element order so more-recently-added elements' colors surface first —
// there's no real "recency" timestamp on colors, so element order is the closest proxy.

export function getDocumentColors(pages: Page[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const add = (value: string | undefined) => {
    if (!isPlainHexColor(value)) return;
    const hex = value!.toUpperCase();
    if (!seen.has(hex)) {
      seen.add(hex);
      ordered.push(hex);
    }
  };

  for (const page of pages) {
    add(page.backgroundColor);
    for (const el of page.elements) {
      add(el.fill);
      add(el.stroke);
      if (el.data?.type === 'text') add((el.data as TextData).color);
      if (el.data?.type === 'shape') {
        add((el.data as ShapeData).fill);
        add((el.data as ShapeData).stroke);
      }
      if (el.data?.type === 'icon') add((el.data as IconData).fill);
    }
  }
  return ordered.slice(0, 24);
}

// ===== Photo colors: dominant colors sampled from photos actually used on the page =====
// Matches real Canva's "Photo colors" swatch row in the color picker.

const photoColorCache = new Map<string, string[]>();

export function getPagePhotoSources(page: Page | undefined): string[] {
  if (!page) return [];
  const srcs = new Set<string>();
  if (page.backgroundImage) srcs.add(page.backgroundImage.src);
  for (const el of page.elements) {
    if (el.type === 'image') {
      const src = (el.data as { src?: string }).src;
      if (src) srcs.add(src);
    }
  }
  return Array.from(srcs);
}

export async function extractPhotoColors(src: string, maxColors = 6): Promise<string[]> {
  const cached = photoColorCache.get(src);
  if (cached) return cached;

  const colors = await new Promise<string[]>((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        // Downscale hard — sampling needs the color distribution, not pixel accuracy,
        // and a tiny canvas keeps this cheap even for a large source photo.
        const SIZE = 32;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve([]);
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

        // Bin into coarse RGB buckets (32 levels/channel) so near-identical pixels
        // count as the same color instead of producing hundreds of 1-pixel "colors".
        const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 128) continue;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const key = `${r >> 5}_${g >> 5}_${b >> 5}`;
          const bucket = buckets.get(key);
          if (bucket) {
            bucket.r += r; bucket.g += g; bucket.b += b; bucket.count += 1;
          } else {
            buckets.set(key, { r, g, b, count: 1 });
          }
        }
        const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
        const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
        const result = sorted.slice(0, maxColors).map((b) =>
          `#${toHex(b.r / b.count)}${toHex(b.g / b.count)}${toHex(b.b / b.count)}`.toUpperCase()
        );
        resolve(result);
      } catch {
        // CORS-tainted canvas (image host without CORS headers) — getImageData throws;
        // fail soft with no photo colors rather than breaking the whole picker.
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });

  photoColorCache.set(src, colors);
  return colors;
}
