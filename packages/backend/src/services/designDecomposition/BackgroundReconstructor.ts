import sharp from 'sharp';
import { RawImage, modelBackgroundAround } from './MaskGenerator';
import { inpaintRegion } from './LocalInpainter';
import { Rect } from './types';

// Every way of filling a hole sits behind this one interface, so the
// orchestrator doesn't care whether pixels came from local diffusion or an AI
// image-edit model, and a different provider can be added without touching it.
export interface ImageReconstructionProvider {
  readonly name: string;
  /** Fills every pixel where holeMask===1 in `img` (mutated in place). Throws if it cannot. */
  reconstruct(img: RawImage, holeMask: Uint8Array): Promise<void>;
}

export function maskBounds(mask: Uint8Array, width: number, height: number): Rect | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Free, instant, deterministic — good for flat and gradient surroundings. */
export class LocalInpaintProvider implements ImageReconstructionProvider {
  readonly name = 'local-diffusion';
  async reconstruct(img: RawImage, holeMask: Uint8Array): Promise<void> {
    const b = maskBounds(holeMask, img.width, img.height);
    if (!b) return;
    const sub = new Uint8Array(b.width * b.height);
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) sub[y * b.width + x] = holeMask[(b.y + y) * img.width + (b.x + x)];
    const model = modelBackgroundAround(img, b, [], Math.max(8, Math.round(Math.max(b.width, b.height) * 0.1)));
    inpaintRegion(img, b, sub, model?.plane);
  }
}

// gpt-image-1 only accepts fixed canvas sizes, so the real image is letterboxed
// into the closest one, edited, then cropped back out.
const EDIT_SIZES: [number, number][] = [[1024, 1024], [1024, 1536], [1536, 1024]];

/**
 * Real generative inpainting via OpenAI's masked image edit. Costs money and
 * seconds per call, so it is only ever used for holes the local provider can't
 * fill convincingly (busy surroundings behind an extracted object) — never for
 * plain text on flat/gradient color. To avoid degrading the rest of the image
 * (the model regenerates the whole canvas), only the pixels inside the hole —
 * grown slightly for blending — are copied back; everything else stays as the
 * original pixels.
 */
export class OpenAIInpaintProvider implements ImageReconstructionProvider {
  readonly name = 'openai-gpt-image-1';
  constructor(private apiKey: string) {}

  async reconstruct(img: RawImage, holeMask: Uint8Array): Promise<void> {
    const ratio = img.width / img.height;
    let [editW, editH] = EDIT_SIZES[0];
    let bestDiff = Infinity;
    for (const [w, h] of EDIT_SIZES) { const d = Math.abs(w / h - ratio); if (d < bestDiff) { bestDiff = d; [editW, editH] = [w, h]; } }
    const scale = Math.min(editW / img.width, editH / img.height);
    const fitW = Math.round(img.width * scale), fitH = Math.round(img.height * scale);
    const offX = Math.round((editW - fitW) / 2), offY = Math.round((editH - fitH) / 2);

    const letterboxed = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } })
      .resize(fitW, fitH, { fit: 'fill' })
      .extend({ top: offY, bottom: editH - fitH - offY, left: offX, right: editW - fitW - offX, background: '#ffffff' })
      .png().toBuffer();

    // Mask: alpha 0 = regenerate. Built at edit size from the full-res hole mask.
    const maskRaw = Buffer.alloc(editW * editH * 4, 255);
    for (let y = 0; y < fitH; y++) {
      const sy = Math.min(img.height - 1, Math.floor(y / scale));
      for (let x = 0; x < fitW; x++) {
        const sx = Math.min(img.width - 1, Math.floor(x / scale));
        if (holeMask[sy * img.width + sx]) maskRaw[((y + offY) * editW + (x + offX)) * 4 + 3] = 0;
      }
    }
    const maskPng = await sharp(maskRaw, { raw: { width: editW, height: editH, channels: 4 } }).png().toBuffer();

    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('image', new Blob([new Uint8Array(letterboxed)], { type: 'image/png' }), 'source.png');
    form.append('mask', new Blob([new Uint8Array(maskPng)], { type: 'image/png' }), 'mask.png');
    form.append('prompt', 'Fill in the transparent masked areas so they seamlessly continue the surrounding background — matching colors, gradients, textures, lighting and patterns exactly. Do not add any text, logos, objects, or new graphics in the filled areas.');
    form.append('n', '1');
    form.append('size', `${editW}x${editH}`);

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}` }, body: form,
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `OpenAI image edit failed (${res.status})`);
    }
    const data: any = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI returned no image data');

    const { data: edited } = await sharp(Buffer.from(b64, 'base64'))
      .extract({ left: offX, top: offY, width: fitW, height: fitH })
      .resize(img.width, img.height, { fit: 'fill' })
      .removeAlpha().raw().toBuffer({ resolveWithObject: true });

    // Copy back only hole pixels (+ a 3px feather ring) from the generated result.
    const grow = 3;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        let hit = false;
        for (let dy = -grow; dy <= grow && !hit; dy += grow) {
          for (let dx = -grow; dx <= grow && !hit; dx += grow) {
            const yy = y + dy, xx = x + dx;
            if (yy >= 0 && xx >= 0 && yy < img.height && xx < img.width && holeMask[yy * img.width + xx]) hit = true;
          }
        }
        if (hit) {
          const p = (y * img.width + x) * 3;
          img.data[p] = edited[p]; img.data[p + 1] = edited[p + 1]; img.data[p + 2] = edited[p + 2];
        }
      }
    }
  }
}
