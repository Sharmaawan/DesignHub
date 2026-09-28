import Konva from 'konva';
import type { DesignRect } from '../api';

// OCR tells us WHAT the text says, never how it was set. To make the editable
// text look like the pixels it replaces, each candidate font/weight is rendered
// with Konva (the exact renderer the editor draws with), sized and letter-
// spaced to the original ink box, and scored by how well its glyph shapes
// overlap the original glyph mask. The best candidate wins; a poor best score
// means the text can't be matched reliably and the caller leaves it flattened.

const SANS = ['Montserrat', 'Poppins', 'Inter', 'Roboto', 'Lato', 'Open Sans', 'Raleway', 'Work Sans'];
const SERIF = ['Playfair Display', 'Merriweather', 'Lora', 'PT Serif'];
const WEIGHTS = [400, 500, 600, 700, 800];
const PAD = 40; // room around the text so glyph overhang is never clipped when measuring

export interface FitResult {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  letterSpacing: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0-1 overlap of the rendered glyphs with the original glyph mask. */
  score: number;
}

// Same weight/italic folding the editor's AnimatedTextElement uses, so what is
// measured here is what will actually be drawn.
export const konvaFontStyle = (weight: number) => (weight && weight !== 400 ? String(weight) : 'normal');

let fontsReady: Promise<void> | null = null;
function ensureFonts(): Promise<void> {
  if (!fontsReady) {
    const loads: Promise<unknown>[] = [];
    for (const f of [...SANS, ...SERIF]) for (const w of WEIGHTS) loads.push(document.fonts.load(`${w} 32px "${f}"`).catch(() => []));
    fontsReady = Promise.all(loads).then(() => document.fonts.ready).then(() => undefined);
  }
  return fontsReady;
}

interface Rendered {
  mask: Uint8Array;
  w: number;
  h: number;
  /** Ink offset from the element origin (where x,y would be placed). */
  left: number;
  top: number;
  textWidth: number;
}

function renderInk(text: string, fontFamily: string, fontWeight: number, fontSize: number, letterSpacing: number): Rendered | null {
  const probe = new Konva.Text({ text, fontFamily, fontSize, fontStyle: konvaFontStyle(fontWeight), letterSpacing, lineHeight: 1.2, wrap: 'none' });
  const textWidth = probe.width();
  const textHeight = probe.height();
  if (!isFinite(textWidth) || textWidth <= 0 || textWidth > 6000) return null;
  const W = Math.ceil(textWidth + PAD * 2), H = Math.ceil(textHeight + PAD * 2);

  const stage = new Konva.Stage({ container: document.createElement('div'), width: W, height: H });
  try {
    const layer = new Konva.Layer();
    stage.add(layer);
    layer.add(new Konva.Text({ x: PAD, y: PAD, text, fontFamily, fontSize, fontStyle: konvaFontStyle(fontWeight), letterSpacing, lineHeight: 1.2, wrap: 'none', fill: '#000' }));
    layer.draw();
    const canvas = stage.toCanvas({ pixelRatio: 1 });
    const data = canvas.getContext('2d')!.getImageData(0, 0, W, H).data;
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 127) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    if (maxX < 0) return null;
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = data[((minY + y) * W + (minX + x)) * 4 + 3] > 127 ? 1 : 0;
    return { mask, w, h, left: minX - PAD, top: minY - PAD, textWidth };
  } finally {
    stage.destroy();
  }
}

function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < h && xx >= 0 && xx < w) out[yy * w + xx] = 1;
    }
  }
  return out;
}

// Overlap of two glyph masks after stretching the rendered one onto the target
// box. Both are grown by 1px first so a sub-pixel misalignment of thin strokes
// doesn't read as a mismatch.
function overlapScore(target: Uint8Array, tw: number, th: number, r: Rendered): number {
  const a = dilate(target, tw, th);
  const resampled = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++) {
    const sy = Math.min(r.h - 1, Math.floor((y * r.h) / th));
    for (let x = 0; x < tw; x++) resampled[y * tw + x] = r.mask[sy * r.w + Math.min(r.w - 1, Math.floor((x * r.w) / tw))];
  }
  const b = dilate(resampled, tw, th);
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) inter++; if (a[i] || b[i]) union++; }
  return union ? inter / union : 0;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('mask image failed to load'));
    img.src = src;
  });
}

export async function fitTextToGlyphs(text: string, ink: DesignRect, maskPng: string): Promise<FitResult | null> {
  await ensureFonts();
  const tw = Math.max(1, Math.round(ink.width)), th = Math.max(1, Math.round(ink.height));

  const img = await loadImage(maskPng);
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, tw, th);
  const px = ctx.getImageData(0, 0, tw, th).data;
  const target = new Uint8Array(tw * th);
  for (let i = 0; i < target.length; i++) target[i] = px[i * 4] > 127 ? 1 : 0;

  const n = [...text].length;
  let best: FitResult | null = null;

  for (const family of [...SANS, ...SERIF]) {
    for (const weight of WEIGHTS) {
      // 1) size from ink height (measured the same way on both sides)
      const ref = renderInk(text, family, weight, 100, 0);
      if (!ref) continue;
      const size = Math.max(6, Math.min(600, (100 * th) / ref.h));
      // 2) letter-spacing from the remaining width difference
      const first = renderInk(text, family, weight, size, 0);
      if (!first) continue;
      let spacing = n > 1 ? (tw - first.w) / (n - 1) : 0;
      spacing = Math.max(-0.08 * size, Math.min(0.5 * size, spacing));
      const fitted = n > 1 ? renderInk(text, family, weight, size, spacing) : first;
      if (!fitted) continue;

      // Sizing was driven by height and spacing by width, but spacing is clamped. If the
      // font still can't reach the original's width, its proportions simply don't match
      // (e.g. a condensed serif logotype vs. a wide sans) — and the overlap score below
      // stretches the render onto the target box, which would hide exactly that mismatch.
      const widthRatio = fitted.w / tw;
      if (widthRatio < 0.85 || widthRatio > 1.18) continue;

      const score = overlapScore(target, tw, th, fitted);
      if (!best || score > best.score) {
        best = {
          fontFamily: family, fontWeight: weight,
          fontSize: Math.round(size * 100) / 100,
          letterSpacing: Math.round(spacing * 100) / 100,
          x: Math.round((ink.x - fitted.left) * 100) / 100,
          y: Math.round((ink.y - fitted.top) * 100) / 100,
          // Never narrower than the text itself, or the editor would wrap it onto a
          // second line — a 16px margin (not just a few px) because different
          // rendering paths (this canvas measurement, Konva's own text layout, and
          // the DOM textarea used while editing) can each measure the same font
          // fractionally differently; verified directly that an 8px margin here
          // was not always enough to keep the edit-mode textarea from wrapping.
          width: Math.ceil(fitted.textWidth) + 16,
          height: Math.ceil(size * 1.2),
          score,
        };
      }
    }
  }
  return best;
}
