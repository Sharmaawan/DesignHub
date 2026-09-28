import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { removeBackground } from '../../lib/backgroundRemovalModel';
import { Rect } from './types';

// A bounding box is not a mask. This segmenter produces a real per-pixel mask
// — but the only model in this stack (u2netp) is a single-subject salient-object
// matter at 320px, not a general instance segmenter. So its output is treated
// as a *proposal* and must pass quality gates; anything that doesn't stays
// flattened in the background instead of becoming a bad cutout.

export interface SegmentationResult {
  /** 1 = object pixel, cropped to `bbox`. */
  mask: Uint8Array;
  bbox: Rect;
  /** Transparent-background PNG of just the object, exactly `bbox` sized. */
  cutoutPng: Buffer;
  metrics: { coverage: number; borderTouch: number; softness: number };
}

export interface ObjectSegmenter {
  readonly name: string;
  segment(absolutePath: string, region: Rect, imageWidth: number, imageHeight: number): Promise<SegmentationResult | { rejected: string }>;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class U2NetSegmenter implements ObjectSegmenter {
  readonly name = 'u2netp salient-object matting';

  async segment(absolutePath: string, region: Rect, imageWidth: number, imageHeight: number) {
    const grow = Math.max(6, Math.round(Math.max(region.width, region.height) * 0.08));
    const crop: Rect = {
      x: clamp(region.x - grow, 0, imageWidth - 1),
      y: clamp(region.y - grow, 0, imageHeight - 1),
      width: 0, height: 0,
    };
    crop.width = clamp(region.x + region.width + grow, crop.x + 1, imageWidth) - crop.x;
    crop.height = clamp(region.y + region.height + grow, crop.y + 1, imageHeight) - crop.y;

    const tmp = path.join(os.tmpdir(), `dh-seg-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    try {
      await sharp(absolutePath).flatten({ background: '#ffffff' }).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }).png().toFile(tmp);
      const matted = await removeBackground(tmp);
      const { data, info } = await sharp(matted).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const w = info.width, h = info.height;

      let fg = 0, soft = 0, visible = 0, borderFg = 0, borderTotal = 0;
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const a = data[(y * w + x) * 4 + 3];
          const onBorder = x === 0 || y === 0 || x === w - 1 || y === h - 1;
          if (onBorder) borderTotal++;
          if (a > 10) { visible++; if (a < 215 && a > 40) soft++; }
          if (a >= 128) { fg++; if (onBorder) borderFg++; }
          // The hole/cutout footprint uses a LOW alpha bar (not 128): the matting model is
          // coarse (320px) and gives thin features like a seal's spiky rim only faint alpha.
          // Cutting the hole at 128 left those fringes behind as visible remnants.
          if (a >= 25) {
            if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      const metrics = { coverage: fg / (w * h), borderTouch: borderFg / Math.max(1, borderTotal), softness: visible ? soft / visible : 1 };
      if (fg === 0) return { rejected: 'Segmentation found no distinct object in this region' };
      if (metrics.coverage < 0.06 || metrics.coverage > 0.92) return { rejected: `Segmentation mask covers ${(metrics.coverage * 100).toFixed(0)}% of the region — not a distinct object` };
      if (metrics.borderTouch > 0.2) return { rejected: 'Segmentation mask runs off the edge of the region — the object is not cleanly separable' };
      if (metrics.softness > 0.35) return { rejected: 'Segmentation mask is too uncertain (soft edges) to cut out cleanly' };

      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      const mask = new Uint8Array(bw * bh);
      const out = Buffer.alloc(bw * bh * 4);
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const s = ((minY + y) * w + (minX + x)) * 4;
          const d = (y * bw + x) * 4;
          const a = data[s + 3];
          mask[y * bw + x] = a >= 25 ? 1 : 0;
          out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2];
          out[d + 3] = a <= 40 ? 0 : a >= 215 ? 255 : a;
        }
      }
      const cutoutPng = await sharp(out, { raw: { width: bw, height: bh, channels: 4 } }).png().toBuffer();
      return { mask, bbox: { x: crop.x + minX, y: crop.y + minY, width: bw, height: bh }, cutoutPng, metrics };
    } finally {
      fs.promises.unlink(tmp).catch(() => {});
    }
  }
}
