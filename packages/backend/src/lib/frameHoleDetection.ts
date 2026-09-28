import sharp from 'sharp';

export interface FrameHole {
  shape: 'circle' | 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
}

// Downloadable "photo frame" template PNGs (borders/balloons/decorations
// around a blank spot for the user's photo) mark that spot with real alpha
// transparency. This used to also treat a large solid near-black or
// near-white region as a candidate marker — plenty of real, fully-designed
// templates have exactly that (a dark moody background, a plain light
// banner) with no photo slot intended at all, and that heuristic kept
// misreading them as one, plastering an unwanted "Add photo" frame over a
// template that was never missing anything. Real transparency doesn't have
// that failure mode: a template's own art is never actually punched full of
// holes, so alpha is the one signal that's still reliable on its own.
// Downscaling first keeps the flood fill fast (a 5000x5000 upload becomes a
// ~300px scan) without losing the hole's shape.
const DOWNSCALE_MAX = 300;

export async function detectFrameHole(absolutePath: string): Promise<FrameHole | null> {
  const meta = await sharp(absolutePath).metadata();
  const origW = meta.width || 0;
  const origH = meta.height || 0;
  if (!origW || !origH) return null;

  const scale = Math.min(1, DOWNSCALE_MAX / Math.max(origW, origH));
  const dsW = Math.max(1, Math.round(origW * scale));
  const dsH = Math.max(1, Math.round(origH * scale));

  const { data, info } = await sharp(absolutePath)
    .resize(dsW, dsH, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  // 0 = not a hole candidate, 1 = transparent.
  const kind = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3];
    if (a < 20) kind[i] = 1;
  }

  const totalArea = w * h;
  const visited = new Uint8Array(w * h);
  const stackX = new Int32Array(totalArea);
  const stackY = new Int32Array(totalArea);
  let best: { count: number; minX: number; minY: number; maxX: number; maxY: number } | null = null;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (visited[idx] || kind[idx] === 0) continue;
      const k = kind[idx];

      let sp = 0;
      stackX[sp] = x;
      stackY[sp] = y;
      sp++;
      visited[idx] = 1;
      let count = 0;
      let minX = x, minY = y, maxX = x, maxY = y;

      while (sp > 0) {
        sp--;
        const cx = stackX[sp];
        const cy = stackY[sp];
        count++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        if (cx > 0) {
          const nIdx = cy * w + (cx - 1);
          if (!visited[nIdx] && kind[nIdx] === k) { visited[nIdx] = 1; stackX[sp] = cx - 1; stackY[sp] = cy; sp++; }
        }
        if (cx < w - 1) {
          const nIdx = cy * w + (cx + 1);
          if (!visited[nIdx] && kind[nIdx] === k) { visited[nIdx] = 1; stackX[sp] = cx + 1; stackY[sp] = cy; sp++; }
        }
        if (cy > 0) {
          const nIdx = (cy - 1) * w + cx;
          if (!visited[nIdx] && kind[nIdx] === k) { visited[nIdx] = 1; stackX[sp] = cx; stackY[sp] = cy - 1; sp++; }
        }
        if (cy < h - 1) {
          const nIdx = (cy + 1) * w + cx;
          if (!visited[nIdx] && kind[nIdx] === k) { visited[nIdx] = 1; stackX[sp] = cx; stackY[sp] = cy + 1; sp++; }
        }
      }

      // A deliberate photo placeholder is a substantial, deliberately-placed
      // blank area — big enough to matter, but not so big it's actually the
      // page's own background fill. A component touching all four edges of
      // the canvas is that full-bleed background, not a hole cut into it.
      const areaFrac = count / totalArea;
      if (areaFrac < 0.03 || areaFrac > 0.65) continue;
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if ((bw * bh) / totalArea > 0.9) continue;
      const touchesAllEdges = minX === 0 && maxX === w - 1 && minY === 0 && maxY === h - 1;
      if (touchesAllEdges) continue;

      if (!best || count > best.count) {
        best = { count, minX, minY, maxX, maxY };
      }
    }
  }

  if (!best) return null;

  const bw = best.maxX - best.minX + 1;
  const bh = best.maxY - best.minY + 1;
  const boxArea = bw * bh;
  const circleArea = (Math.PI * bw * bh) / 4;
  const fillRatio = best.count / boxArea;
  const circleRatio = best.count / circleArea;
  // A circle fills ~79% of its own bounding box (pi/4) and its pixel count
  // tracks the ellipse-area formula closely; a rectangle fills close to 100%
  // of its box. Anything that doesn't clearly read as a circle defaults to
  // rectangle — a rectangular Frame is still fully usable even if the actual
  // hole was some other shape.
  const shape: 'circle' | 'rectangle' = circleRatio > 0.75 && circleRatio < 1.15 && fillRatio < 0.9 ? 'circle' : 'rectangle';

  const invScale = 1 / scale;
  return {
    shape,
    x: Math.round(best.minX * invScale),
    y: Math.round(best.minY * invScale),
    width: Math.round(bw * invScale),
    height: Math.round(bh * invScale),
  };
}
