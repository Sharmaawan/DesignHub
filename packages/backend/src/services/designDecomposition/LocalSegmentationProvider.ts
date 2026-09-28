import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { DetectedRegion, ObjectType, Rect } from './types';
import { segmentImage, RawWorkerMask, LocalWorkerUnavailableError } from './pythonWorker';
import { SegmentationResult, ObjectSegmenter } from './ObjectSegmenter';

// Fully local region proposal + segmentation, using FastSAM's automatic mask
// generation (see pythonWorker.ts / python-worker/server.py) instead of a
// cloud vision API. FastSAM finds candidates and masks in one pass — there's
// no separate "where might something be" step feeding a "what are its exact
// pixels" step the way VisionProvider + ObjectSegmenter is structured for
// the cloud path. What THIS module does is the equivalent of that missing
// first step: turn FastSAM's raw output (dozens to low hundreds of
// candidate masks on a busy design, most of them noise, duplicates, or too
// small to matter) into a short list of genuinely meaningful ones, using
// only generic, measurable properties of each mask — never a name, a
// template, or a fixed layout. Every threshold below is a property any mask
// on any image can be checked against: size, shape regularity, distance
// from the edge, overlap with other candidates, overlap with known text.

// FastSAM's own imgsz — the model letterboxes/resizes its input to this
// regardless of the source image's real resolution, so feeding it anything
// bigger buys zero extra detection detail. What it does buy, at real cost,
// is retina_masks upsampling every candidate mask back to the FULL working
// resolution afterward — measured directly on this machine (2-core CPU, no
// GPU): at 1024 that upsample step dominates runtime (9-17s of a total
// 11-20s run on a 1080x1350 image); dropping to 768 cut the same call to
// ~4.2s, and 640 to ~2.8s, both losing only the lowest-confidence/smallest
// raw candidates (178 -> 115 -> 99 on that same image) — noise-level masks
// this pipeline's own area/solidity filters would have discarded anyway,
// not meaningfully-sized real objects. 768 is the middle of that curve:
// most of the 640 speedup, less of its lost recall. Shrinking to this size
// ourselves before inference, then scaling the (much cheaper to resize)
// small mask crops back up only for the handful of candidates that survive
// filtering, skips the wasted upsample-then-effectively-discard round trip
// a full-resolution source image would otherwise force.
const MAX_SEG_DIMENSION = 768;
const MIN_AREA_FRACTION = 0.003; // below this a mask is background clutter (a single decorative star, a stray highlight)
const MAX_AREA_FRACTION = 0.45; // above this it's reading as the background/page itself, not a discrete object
const MIN_SOLIDITY = 0.25; // mask-pixel-count / bbox-area — filters scattered, non-coherent "masks" that don't read as one object
const DEDUPE_IOU = 0.5;
const MAX_CANDIDATES = 14; // caps how many proposals ever reach the pipeline — matches "meaningful layers, not maximum element count"
const TEXT_OVERLAP_REJECT = 0.6; // a candidate mostly covering a known text line is that text, not a separate graphic

function bboxToRect([x, y, w, h]: [number, number, number, number]): Rect {
  return { x, y, width: w, height: h };
}

function iou(a: Rect, b: Rect): number {
  const l = Math.max(a.x, b.x), t = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width), bt = Math.min(a.y + a.height, b.y + b.height);
  if (r <= l || bt <= t) return 0;
  const inter = (r - l) * (bt - t);
  return inter / (a.width * a.height + b.width * b.height - inter);
}
function overlapFractionOf(a: Rect, b: Rect): number {
  const l = Math.max(a.x, b.x), t = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width), bt = Math.min(a.y + a.height, b.y + b.height);
  if (r <= l || bt <= t) return 0;
  return ((r - l) * (bt - t)) / (a.width * a.height);
}

/**
 * Type assignment is an honest heuristic, not a claim of semantic
 * understanding a pixel-mask model doesn't have — FastSAM outputs "this is
 * a coherent visual region," not "this is a logo." These are the same kind
 * of purely geometric signals a human skimming a design uses at a glance:
 * small + near a corner/edge often reads as a brand mark; small + very
 * round/regular often reads as a badge or icon; large + roughly centered
 * reads as a hero image or major decorative graphic. Anything not fitting
 * a specific pattern is reported as "decorative" rather than guessed at
 * more specifically than the evidence supports.
 */
function classifyType(rect: Rect, solidity: number, imageWidth: number, imageHeight: number): ObjectType {
  const cx = (rect.x + rect.width / 2) / imageWidth;
  const cy = (rect.y + rect.height / 2) / imageHeight;
  const areaFrac = (rect.width * rect.height) / (imageWidth * imageHeight);
  const aspect = rect.width / rect.height;
  const nearCorner = (cx < 0.22 || cx > 0.78) && cy < 0.22;
  const roughlySquare = aspect > 0.6 && aspect < 1.67;

  if (nearCorner && areaFrac < 0.05) return 'logo';
  if (areaFrac < 0.02 && roughlySquare && solidity > 0.55) return 'icon';
  if (areaFrac < 0.06 && roughlySquare && solidity > 0.45) return 'badge';
  if (areaFrac > 0.12 && roughlySquare) return 'photo';
  return 'decorative';
}

export interface LocalProposal {
  region: DetectedRegion;
  mask: Uint8Array; // cropped to region bbox, row-major, 1 = object pixel
  cutoutPng: Buffer;
}

// Text regions aren't known yet at proposal time (this can run concurrently
// with OCR — see DesignDecomposer.ts) — text-overlap rejection happens
// afterward, once OCR has finished, via rejectProposalsOverlappingText below.
export async function proposeLocalRegions(
  absolutePath: string, imageWidth: number, imageHeight: number,
): Promise<{ proposals: LocalProposal[]; error?: string }> {
  const scale = Math.min(1, MAX_SEG_DIMENSION / Math.max(imageWidth, imageHeight));
  let segPath = absolutePath;
  let tempPath: string | null = null;
  if (scale < 1) {
    tempPath = path.join(os.tmpdir(), `designhub-seg-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
    await sharp(absolutePath)
      .resize(Math.round(imageWidth * scale), Math.round(imageHeight * scale), { fit: 'fill' })
      .png()
      .toFile(tempPath);
    segPath = tempPath;
  }

  let result;
  try {
    // Forwarding these lets the worker discard obviously-useless candidates
    // (wrong size, edge-touching, scattered) BEFORE PNG-encoding and
    // shipping them over HTTP — see server.py for why that transport cost
    // otherwise dwarfs the model's own compute time.
    result = await segmentImage(segPath, {
      imgsz: MAX_SEG_DIMENSION,
      minAreaFrac: MIN_AREA_FRACTION,
      maxAreaFrac: MAX_AREA_FRACTION,
      minSolidity: MIN_SOLIDITY,
    });
  } catch (err: any) {
    if (tempPath) fs.unlink(tempPath, () => {});
    return { proposals: [], error: err instanceof LocalWorkerUnavailableError ? err.message : `Local segmentation failed: ${err?.message || 'unknown error'}` };
  }
  if (tempPath) fs.unlink(tempPath, () => {});

  const totalArea = imageWidth * imageHeight;
  // solidity (on-pixels / bbox-area) is a ratio, unaffected by uniform
  // resizing — computed here straight off the small working-resolution mask
  // PNG the worker already returned, with no resize at all. Scoring every
  // raw candidate (a busy poster can return 100+) against a full sharp
  // decode+resize was the single biggest remaining cost in this pipeline —
  // that expensive upscale-to-original-resolution step now happens only
  // once, below, for the handful of candidates that actually survive to
  // become a LocalProposal.
  interface Scored { raw: RawWorkerMask; rect: Rect; solidity: number; areaFrac: number }
  const scored: Scored[] = [];

  for (const raw of result.masks) {
    // raw.bbox/raw.maskPng are in the (possibly downscaled) working image's
    // pixel space — everything downstream (area checks, edge checks, the
    // final cutout) needs the ORIGINAL image's coordinates instead.
    const workingRect = bboxToRect(raw.bbox);
    const rect: Rect = scale < 1
      ? {
          x: Math.round(workingRect.x / scale), y: Math.round(workingRect.y / scale),
          width: Math.round(workingRect.width / scale), height: Math.round(workingRect.height / scale),
        }
      : workingRect;
    const areaFrac = (rect.width * rect.height) / totalArea;
    if (areaFrac < MIN_AREA_FRACTION || areaFrac > MAX_AREA_FRACTION) continue;
    if (rect.x <= 0 || rect.y <= 0 || rect.x + rect.width >= imageWidth || rect.y + rect.height >= imageHeight) continue; // touches the canvas edge — background/bleed, not a discrete object

    const decoded = await sharp(Buffer.from(raw.maskPng, 'base64')).raw().toBuffer({ resolveWithObject: true });
    const w = decoded.info.width, h = decoded.info.height;
    const px = decoded.data;
    let on = 0;
    for (let i = 0; i < w * h; i++) if (px[i] > 127) on++;
    const solidity = on / (w * h);
    if (solidity < MIN_SOLIDITY) continue;

    scored.push({ raw, rect, solidity, areaFrac });
  }

  // Rank by a blend of the model's own confidence and shape coherence, then
  // greedily dedupe near-identical/heavily-overlapping proposals — FastSAM
  // routinely proposes several overlapping masks for the same real object.
  scored.sort((a, b) => (b.raw.score * b.solidity) - (a.raw.score * a.solidity));
  const kept: Scored[] = [];
  for (const s of scored) {
    if (kept.length >= MAX_CANDIDATES) break;
    if (kept.some((k) => iou(k.rect, s.rect) > DEDUPE_IOU)) continue;
    kept.push(s);
  }

  const proposals: LocalProposal[] = [];
  for (let i = 0; i < kept.length; i++) {
    const s = kept[i];
    const type = classifyType(s.rect, s.solidity, imageWidth, imageHeight);
    // Confidence reported downstream blends detection score with shape
    // coherence — a high-confidence-but-scattered mask shouldn't pass the
    // same bar as a high-confidence, clearly-one-object mask.
    const confidence = Math.max(0, Math.min(1, s.raw.score * (0.5 + 0.5 * s.solidity)));

    // The only point this candidate's mask is upscaled to the original
    // image's resolution — deferred to here (only ~14 candidates ever
    // reach this point) rather than during scoring above (100+ candidates).
    let maskBuf: Buffer = Buffer.from(s.raw.maskPng, 'base64');
    if (scale < 1) maskBuf = await sharp(maskBuf).resize(s.rect.width, s.rect.height).png().toBuffer();
    const decoded = await sharp(maskBuf).raw().toBuffer({ resolveWithObject: true });
    const w = decoded.info.width, h = decoded.info.height;
    const px = decoded.data;
    const maskPixels = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) maskPixels[p] = px[p] > 127 ? 1 : 0;

    const cutout = Buffer.alloc(w * h * 4);
    const srcCrop = await sharp(absolutePath).extract({ left: s.rect.x, top: s.rect.y, width: w, height: h }).ensureAlpha().raw().toBuffer();
    for (let p = 0; p < w * h; p++) {
      cutout[p * 4] = srcCrop[p * 4]; cutout[p * 4 + 1] = srcCrop[p * 4 + 1]; cutout[p * 4 + 2] = srcCrop[p * 4 + 2];
      cutout[p * 4 + 3] = maskPixels[p] ? 255 : 0;
    }
    const cutoutPng = await sharp(cutout, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();

    proposals.push({
      region: { id: `local-${i}`, type, description: `${type} (locally detected, ${Math.round(confidence * 100)}% confidence)`, confidence, ...s.rect },
      mask: maskPixels,
      cutoutPng,
    });
  }

  return { proposals };
}

/** A candidate mostly covering a known text line is that text, not a separate graphic — applied once OCR (running concurrently with proposeLocalRegions) has finished. */
export function rejectProposalsOverlappingText(proposals: LocalProposal[], textRegions: Rect[]): LocalProposal[] {
  return proposals.filter((p) => textRegions.every((t) => overlapFractionOf(p.region, t) <= TEXT_OVERLAP_REJECT));
}

/** Adapts pre-computed local proposals to the existing ObjectSegmenter interface, so analyzeDesign's per-region segmentation loop needs no changes to use either source. */
export class LocalPrecomputedSegmenter implements ObjectSegmenter {
  readonly name = 'fastsam-local';
  private byId = new Map<string, LocalProposal>();
  private rejectedForText: Set<string>;
  constructor(proposals: LocalProposal[], rejectedForText: Set<string> = new Set()) {
    for (const p of proposals) this.byId.set(p.region.id, p);
    this.rejectedForText = rejectedForText;
  }
  async segment(_absolutePath: string, region: Rect & { id?: string }): Promise<SegmentationResult | { rejected: string }> {
    const id = (region as any).id as string | undefined;
    if (id && this.rejectedForText.has(id)) return { rejected: 'Mostly overlaps a detected text line — that\'s the text, not a separate graphic' };
    const found = id ? this.byId.get(id) : undefined;
    if (!found) return { rejected: 'No precomputed local mask for this region' };
    const bw = found.region.width, bh = found.region.height;
    let fg = 0, borderFg = 0, borderTotal = 0;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const onBorder = x === 0 || y === 0 || x === bw - 1 || y === bh - 1;
        if (onBorder) borderTotal++;
        if (found.mask[y * bw + x]) { fg++; if (onBorder) borderFg++; }
      }
    }
    const metrics = { coverage: fg / (bw * bh), borderTouch: borderFg / Math.max(1, borderTotal), softness: 0 };
    return { mask: found.mask, bbox: found.region, cutoutPng: found.cutoutPng, metrics };
  }
}
