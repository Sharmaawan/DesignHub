import sharp from 'sharp';
import { Rect, TextRegionInput, TextRegionResult } from './types';

export interface RawImage {
  data: Buffer; // tightly packed RGB, 3 channels
  width: number;
  height: number;
}

export async function loadRawImage(absolutePath: string): Promise<RawImage> {
  // Flatten onto white first so transparent PNGs don't turn black when the alpha channel is dropped.
  const { data, info } = await sharp(absolutePath)
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export interface TextMask {
  region: TextRegionInput;
  /** Padded working box the mask/model are defined over. */
  box: Rect;
  /** 1 = pixel to be reconstructed (glyph pixels + antialiasing halo), indexed over `box`. */
  mask: Uint8Array;
  /** Background model (per-channel plane), used both as the inpaint initial guess and as a validity check. */
  plane: Plane;
  result: TextRegionResult;
}

export interface Plane {
  // channel c value at (x,y) = a[c] + b[c]*u + c2[c]*v, u=(x-cx)/w, v=(y-cy)/h
  a: number[]; b: number[]; c: number[];
  cx: number; cy: number; w: number; h: number;
}

const evalPlane = (p: Plane, ch: number, x: number, y: number) =>
  p.a[ch] + p.b[ch] * ((x - p.cx) / p.w) + p.c[ch] * ((y - p.cy) / p.h);

// Least-squares plane fit per channel with a few rounds of outlier rejection,
// so stray glyph pixels or neighboring graphics inside the sample ring don't
// drag the estimated background toward themselves.
function fitPlane(
  xs: Int32Array, ys: Int32Array, n: number, img: RawImage, cx: number, cy: number, w: number, h: number,
): { plane: Plane; rms: number; inliers: number } {
  const keep = new Uint8Array(n).fill(1);
  const plane: Plane = { a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0], cx, cy, w, h };
  let rms = 0;
  let inliers = n;
  for (let round = 0; round < 4; round++) {
    for (let ch = 0; ch < 3; ch++) {
      let s1 = 0, su = 0, sv = 0, suu = 0, suv = 0, svv = 0, sy = 0, suy = 0, svy = 0;
      for (let i = 0; i < n; i++) {
        if (!keep[i]) continue;
        const u = (xs[i] - cx) / w, v = (ys[i] - cy) / h;
        const val = img.data[(ys[i] * img.width + xs[i]) * 3 + ch];
        s1++; su += u; sv += v; suu += u * u; suv += u * v; svv += v * v; sy += val; suy += u * val; svy += v * val;
      }
      if (s1 < 6) { plane.a[ch] = sy / Math.max(1, s1); plane.b[ch] = 0; plane.c[ch] = 0; continue; }
      // Solve the 3x3 normal equations by Cramer's rule.
      const det = s1 * (suu * svv - suv * suv) - su * (su * svv - suv * sv) + sv * (su * suv - suu * sv);
      if (Math.abs(det) < 1e-9) { plane.a[ch] = sy / s1; plane.b[ch] = 0; plane.c[ch] = 0; continue; }
      const da = sy * (suu * svv - suv * suv) - su * (suy * svv - suv * svy) + sv * (suy * suv - suu * svy);
      const db = s1 * (suy * svv - suv * svy) - sy * (su * svv - suv * sv) + sv * (su * svy - suy * sv);
      const dc = s1 * (suu * svy - suy * suv) - su * (su * svy - suy * sv) + sy * (su * suv - suu * sv);
      plane.a[ch] = da / det; plane.b[ch] = db / det; plane.c[ch] = dc / det;
    }
    // Residuals -> reject outliers for the next round.
    const res = new Float32Array(n);
    let sum = 0, cnt = 0;
    for (let i = 0; i < n; i++) {
      let d2 = 0;
      for (let ch = 0; ch < 3; ch++) {
        const r = img.data[(ys[i] * img.width + xs[i]) * 3 + ch] - evalPlane(plane, ch, xs[i], ys[i]);
        d2 += r * r;
      }
      res[i] = Math.sqrt(d2);
      if (keep[i]) { sum += d2; cnt++; }
    }
    rms = Math.sqrt(sum / Math.max(1, cnt));
    const limit = Math.max(14, rms * 2.2);
    let kept = 0;
    for (let i = 0; i < n; i++) { keep[i] = res[i] <= limit ? 1 : 0; kept += keep[i]; }
    inliers = kept;
    if (kept < 6) break;
  }
  return { plane, rms, inliers };
}

const clampI = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Models the background around `box` from a ring of pixels just outside it
 * (skipping `excludes`, e.g. neighboring text). `rms` is how far the ring
 * itself deviates from a smooth plane — low means flat/gradient surroundings
 * that can be reconstructed convincingly; high means texture or detail.
 */
export function modelBackgroundAround(
  img: RawImage, box: Rect, excludes: Rect[], ringWidth: number,
): { plane: Plane; rms: number } | null {
  const x0 = box.x, y0 = box.y, x1 = box.x + box.width, y1 = box.y + box.height;
  const ex0 = clampI(x0 - ringWidth, 0, img.width), ey0 = clampI(y0 - ringWidth, 0, img.height);
  const ex1 = clampI(x1 + ringWidth, 0, img.width), ey1 = clampI(y1 + ringWidth, 0, img.height);
  const inOther = (x: number, y: number) =>
    excludes.some((o) => x >= o.x - 2 && x < o.x + o.width + 2 && y >= o.y - 2 && y < o.y + o.height + 2);
  const maxRing = (ex1 - ex0) * (ey1 - ey0);
  const rxs = new Int32Array(maxRing), rys = new Int32Array(maxRing);
  let n = 0;
  for (let y = ey0; y < ey1; y++) {
    for (let x = ex0; x < ex1; x++) {
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
      if (inOther(x, y)) continue;
      rxs[n] = x; rys[n] = y; n++;
    }
  }
  if (n < 20) return null;
  const { plane, rms } = fitPlane(rxs, rys, n, img, (ex0 + ex1) / 2, (ey0 + ey1) / 2, Math.max(1, ex1 - ex0), Math.max(1, ey1 - ey0));
  return { plane, rms };
}

// Otsu's threshold over integer-binned residuals.
function otsu(hist: Uint32Array, total: number): number {
  let sumAll = 0;
  for (let i = 0; i < hist.length; i++) sumAll += i * hist[i];
  let sumB = 0, wB = 0, best = 0, bestT = 0;
  for (let t = 0; t < hist.length; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; bestT = t; }
  }
  return bestT;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const hex = (v: number[]) => '#' + v.map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('');

/**
 * Builds a per-pixel glyph mask for one OCR region — NOT the OCR rectangle
 * itself. The region's surroundings are used to model the local background
 * (a plane per color channel, so gradients are handled); pixels that deviate
 * from that model are glyph pixels. The result also validates the region:
 * text sitting on a detailed background, or a "text" box that's really a
 * graphic, is rejected so its pixels are never erased.
 */
export async function generateTextMask(
  img: RawImage,
  region: TextRegionInput,
  allRegions: TextRegionInput[],
): Promise<TextMask> {
  const reject = (reason: string, box: Rect): TextMask => ({
    region, box, mask: new Uint8Array(0), plane: { a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0], cx: 0, cy: 0, w: 1, h: 1 },
    result: { id: region.id, accepted: false, reason },
  });

  const pad = 2;
  const x0 = clamp(Math.floor(region.x) - pad, 0, img.width - 1);
  const y0 = clamp(Math.floor(region.y) - pad, 0, img.height - 1);
  const x1 = clamp(Math.ceil(region.x + region.width) + pad, x0 + 1, img.width);
  const y1 = clamp(Math.ceil(region.y + region.height) + pad, y0 + 1, img.height);
  const box: Rect = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  if (box.width < 4 || box.height < 4) return reject('Region too small', box);

  const others = allRegions.filter((r) => r.id !== region.id);
  const model = modelBackgroundAround(img, box, others, Math.max(5, Math.round(box.height * 0.25)));
  if (!model) return reject('Not enough surrounding background to model', box);
  const { plane, rms } = model;
  if (rms > 24) return reject('Background behind this text is too detailed to reconstruct cleanly', box);

  // Residual of every pixel in the box against the background model.
  const bw = box.width, bh = box.height;
  const resid = new Float32Array(bw * bh);
  const hist = new Uint32Array(442);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const ax = x0 + x, ay = y0 + y;
      let d2 = 0;
      for (let ch = 0; ch < 3; ch++) {
        const r = img.data[(ay * img.width + ax) * 3 + ch] - evalPlane(plane, ch, ax, ay);
        d2 += r * r;
      }
      const d = Math.sqrt(d2);
      resid[y * bw + x] = d;
      hist[Math.min(441, Math.round(d))]++;
    }
  }
  const T = clamp(otsu(hist, bw * bh), Math.max(28, rms * 3), 140);

  // Glyph pixels can only live inside the raw OCR glyph box (plus a couple of
  // pixels of antialiasing). Anything beyond it that differs from the
  // background — a divider rule, an underline, the edge of a neighboring
  // graphic — is not part of this text and must not be erased with it.
  const c = region.core;
  const gx0 = c ? Math.floor(c.x) - 2 : -Infinity, gx1 = c ? Math.ceil(c.x + c.width) + 2 : Infinity;
  const gy0 = c ? Math.floor(c.y) - 2 : -Infinity, gy1 = c ? Math.ceil(c.y + c.height) + 2 : Infinity;

  const core = new Uint8Array(bw * bh);
  let inkCount = 0, minX = bw, minY = bh, maxX = -1, maxY = -1;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const ax = x0 + x, ay = y0 + y;
      if (ax < gx0 || ax >= gx1 || ay < gy0 || ay >= gy1) continue;
      if (resid[y * bw + x] > T) {
        core[y * bw + x] = 1; inkCount++;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const frac = inkCount / (bw * bh);
  if (frac < 0.012) return reject('No distinct text pixels found in this region', box);
  if (frac > 0.6) return reject('Region is mostly non-background — it is a graphic, not text on a background', box);

  // Grow the mask over the antialiasing halo so no ghost outline is left behind.
  const r = clamp(Math.round(box.height * 0.05), 2, 4);
  const mask = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (!core[y * bw + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= bh) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= bw) continue;
          if (dx * dx + dy * dy <= r * r + 1) mask[yy * bw + xx] = 1;
        }
      }
    }
  }

  // Ink color = median of the strongest glyph pixels (skips antialiased edge blends).
  const ds: number[] = [];
  for (let i = 0; i < core.length; i++) if (core[i]) ds.push(resid[i]);
  ds.sort((a, b) => a - b);
  const strong = ds[Math.floor(ds.length * 0.7)] ?? T;
  const chans: number[][] = [[], [], []];
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = y * bw + x;
      if (core[i] && resid[i] >= strong) {
        for (let ch = 0; ch < 3; ch++) chans[ch].push(img.data[((y0 + y) * img.width + (x0 + x)) * 3 + ch]);
      }
    }
  }
  const median = (a: number[]) => { a.sort((p, q) => p - q); return a[Math.floor(a.length / 2)] ?? 0; };
  const inkColor = hex([median(chans[0]), median(chans[1]), median(chans[2])]);

  // Cropped glyph mask for client-side font fitting.
  const iw = maxX - minX + 1, ih = maxY - minY + 1;
  const png = Buffer.alloc(iw * ih);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) png[y * iw + x] = core[(minY + y) * bw + (minX + x)] ? 255 : 0;
  const maskBuf = await sharp(png, { raw: { width: iw, height: ih, channels: 1 } }).png().toBuffer();

  return {
    region, box, mask, plane,
    result: {
      id: region.id, accepted: true,
      ink: { x: x0 + minX, y: y0 + minY, width: iw, height: ih },
      inkColor,
      maskPng: `data:image/png;base64,${maskBuf.toString('base64')}`,
    },
  };
}
