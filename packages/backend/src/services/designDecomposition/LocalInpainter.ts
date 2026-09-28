import { Rect } from './types';
import { RawImage, Plane } from './MaskGenerator';

// Local (no-AI, no-cost) background reconstruction. Masked pixels are filled
// with the harmonic interpolation of the surrounding known pixels — the smooth
// surface that continues the colors/gradients on every side of the hole. That
// is exactly what a removed text stroke needs on flat or gradient backgrounds.
// It cannot invent texture: on a detailed photo it would smear, which is why
// callers gate on background complexity (see MaskGenerator / DesignDecomposer)
// and leave such regions flattened rather than calling this.

function diffuse(
  chans: Float32Array[], known: Uint8Array, w: number, h: number, idx: Int32Array, iterations: number,
) {
  const n = idx.length;
  for (let it = 0; it < iterations; it++) {
    let maxDelta = 0;
    for (let k = 0; k < n; k++) {
      const p = idx[k];
      const x = p % w, y = (p / w) | 0;
      const l = x > 0 ? p - 1 : p, r = x < w - 1 ? p + 1 : p;
      const u = y > 0 ? p - w : p, d = y < h - 1 ? p + w : p;
      for (let c = 0; c < 3; c++) {
        const ch = chans[c];
        const nv = (ch[l] + ch[r] + ch[u] + ch[d]) * 0.25;
        const delta = Math.abs(nv - ch[p]);
        if (delta > maxDelta) maxDelta = delta;
        ch[p] = nv;
      }
    }
    if (maxDelta < 0.05) break;
  }
  void known;
}

/**
 * Reconstructs the masked pixels of `region` in `img` (mutated in place).
 * `mask` is indexed over `region` (row-major). Large holes are solved on a
 * coarse grid first and refined, so convergence doesn't depend on hole size.
 */
export function inpaintRegion(img: RawImage, region: Rect, mask: Uint8Array, plane?: Plane): void {
  const margin = 8;
  const cx0 = Math.max(0, region.x - margin), cy0 = Math.max(0, region.y - margin);
  const cx1 = Math.min(img.width, region.x + region.width + margin);
  const cy1 = Math.min(img.height, region.y + region.height + margin);
  const w = cx1 - cx0, h = cy1 - cy0;

  const chans = [new Float32Array(w * h), new Float32Array(w * h), new Float32Array(w * h)];
  const known = new Uint8Array(w * h).fill(1);
  const holeList: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ax = cx0 + x, ay = cy0 + y;
      const p = y * w + x;
      for (let c = 0; c < 3; c++) chans[c][p] = img.data[(ay * img.width + ax) * 3 + c];
      const mx = ax - region.x, my = ay - region.y;
      if (mx >= 0 && my >= 0 && mx < region.width && my < region.height && mask[my * region.width + mx]) {
        known[p] = 0;
        holeList.push(p);
      }
    }
  }
  if (holeList.length === 0) return;
  const idx = Int32Array.from(holeList);

  // Initial guess: the background plane where available (so big holes converge
  // toward the right gradient), otherwise the local mean of known pixels.
  if (plane) {
    for (const p of holeList) {
      const ax = cx0 + (p % w), ay = cy0 + ((p / w) | 0);
      for (let c = 0; c < 3; c++) {
        chans[c][p] = plane.a[c] + plane.b[c] * ((ax - plane.cx) / plane.w) + plane.c[c] * ((ay - plane.cy) / plane.h);
      }
    }
  } else {
    let sum = [0, 0, 0], cnt = 0;
    for (let p = 0; p < w * h; p++) if (known[p]) { sum[0] += chans[0][p]; sum[1] += chans[1][p]; sum[2] += chans[2][p]; cnt++; }
    for (const p of holeList) for (let c = 0; c < 3; c++) chans[c][p] = sum[c] / Math.max(1, cnt);
  }

  diffuse(chans, known, w, h, idx, 400);

  for (const p of holeList) {
    const ax = cx0 + (p % w), ay = cy0 + ((p / w) | 0);
    for (let c = 0; c < 3; c++) img.data[(ay * img.width + ax) * 3 + c] = Math.max(0, Math.min(255, Math.round(chans[c][p])));
  }
}

/** Same as inpaintRegion but for a full-image-sized mask (used for extracted-object holes). */
export function inpaintMask(img: RawImage, fullMask: Uint8Array, bounds: Rect): void {
  const sub = new Uint8Array(bounds.width * bounds.height);
  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      sub[y * bounds.width + x] = fullMask[(bounds.y + y) * img.width + (bounds.x + x)];
    }
  }
  inpaintRegion(img, bounds, sub);
}
