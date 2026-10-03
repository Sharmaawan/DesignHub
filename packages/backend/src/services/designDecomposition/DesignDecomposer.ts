import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import {
  AnalyzeResult, DECOMPOSITION_VERSION, DetectedRegion, ObjectResult, ObjectType, ProviderKeys,
  ReconstructResult, Rect, TextRegionInput, TextRegionResult,
} from './types';
import { generateTextMask, loadRawImage, modelBackgroundAround } from './MaskGenerator';
import { inpaintRegion } from './LocalInpainter';
import { analyzeWithProviders, buildVisionProviders, VisionProvider } from './VisionProvider';
import { ObjectSegmenter, U2NetSegmenter } from './ObjectSegmenter';
import { proposeLocalRegions, LocalPrecomputedSegmenter, LocalProposal } from './LocalSegmentationProvider';
import { ImageReconstructionProvider, LocalInpaintProvider, OpenAIInpaintProvider, maskBounds } from './BackgroundReconstructor';
import { cachePath, readJsonCache, sha256, writeJsonCache } from './cache';

const MAX_VISION_DIMENSION = 1536;
const CLAIMING_TYPES = new Set<ObjectType>(['logo', 'badge', 'icon', 'qr']);
const EXTRACTABLE_TYPES = new Set<ObjectType>(['logo', 'badge', 'icon', 'qr', 'photo', 'decorative']);
const EXTRACT_CONFIDENCE = 0.75;
const LOCAL_INPAINT_MAX_RING_RMS = 18;

const area = (r: Rect) => r.width * r.height;
function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

interface StoredSegmentation {
  regionId: string;
  bbox: Rect;
  needsAI: boolean;
  maskFile: string;
}

export interface VisionFetchResult {
  regions: DetectedRegion[];
  status: AnalyzeResult['capabilities']['vision'];
  cached: boolean;
}

// Bridges the early, text-independent proposal call (source of `regions`,
// returned to the frontend) to the later analyzeDesign call (which needs the
// actual per-region masks FastSAM already computed, not just their boxes).
// Disk-backed caches elsewhere in this file (vision-*.json, seg-*.json) exist
// specifically to survive a server restart; this one doesn't need to — the
// mask/cutout data involved is only ever used again a few seconds later, in
// the same request flow, before the process has any chance to restart.
const localProposalCache = new Map<string, LocalProposal[]>();

/**
 * The object-candidate call in isolation — no text involved, so a caller (the
 * /analyze-vision route) can kick this off the moment the image is uploaded,
 * concurrently with OCR running client-side, instead of waiting for OCR to
 * finish first. Cloud vision (OpenAI/Anthropic) is tried first when a key is
 * configured — it semantically recognizes "this is a logo" rather than
 * inferring it from geometry — with local FastSAM segmentation as an
 * automatic, fully offline fallback whenever no cloud key is set or every
 * configured provider fails (bad/missing model access, no credits, etc.).
 * Either path always returns a real result or an honest unavailable reason —
 * never a silent no-op. Successful cloud results are cached by source hash +
 * version so a second call for the same image never pays for a second API
 * call; local results are cheap enough (and too large) to persist the same
 * way, so they're only bridged via localProposalCache above.
 */
export async function fetchVisionRegions(
  absolutePath: string, keys: ProviderKeys, visionProviders?: VisionProvider[],
): Promise<VisionFetchResult> {
  const sourceHash = sha256(fs.readFileSync(absolutePath));
  const V = DECOMPOSITION_VERSION;

  const visionCacheName = `vision-${sourceHash}-${V}.json`;
  const cached = visionProviders ? null : readJsonCache<{ regions: DetectedRegion[]; provider: string }>(visionCacheName);
  if (cached) return { regions: cached.regions, status: { available: true, provider: cached.provider }, cached: true };

  const meta = await sharp(absolutePath).metadata();
  const imageWidth = meta.width || 0, imageHeight = meta.height || 0;
  const providers = visionProviders ?? buildVisionProviders(keys);
  let cloudReason: string | undefined;

  if (providers.length > 0) {
    const scale = Math.min(1, MAX_VISION_DIMENSION / Math.max(imageWidth, imageHeight));
    const vw = Math.round(imageWidth * scale), vh = Math.round(imageHeight * scale);
    const png = await sharp(absolutePath).flatten({ background: '#ffffff' }).resize(vw, vh, { fit: 'fill' }).png().toBuffer();
    const res = await analyzeWithProviders(providers, { base64: png.toString('base64'), mime: 'image/png', width: imageWidth, height: imageHeight });
    if (res.status.available) {
      if (!visionProviders) writeJsonCache(visionCacheName, { regions: res.regions, provider: res.status.provider });
      return { regions: res.regions, status: res.status, cached: false };
    }
    cloudReason = res.status.reason;
    console.warn('[fetchVisionRegions] cloud vision unavailable, falling back to local FastSAM:', cloudReason);
  }

  const local = await proposeLocalRegions(absolutePath, imageWidth, imageHeight);
  if (!local.error) {
    localProposalCache.set(sourceHash, local.proposals);
    return { regions: local.proposals.map((p) => p.region), status: { available: true, provider: 'fastsam-local' }, cached: false };
  }
  const reason = cloudReason ? `${cloudReason} · local fallback also failed: ${local.error}` : local.error;
  return { regions: [], status: { available: false, reason }, cached: false };
}

export interface AnalyzeParams {
  absolutePath: string;
  textRegions: TextRegionInput[];
  keys: ProviderKeys;
  /** When the caller already fetched vision results (e.g. concurrently with OCR via /analyze-vision), pass them here so this never pays for a second API call. */
  precomputedVision?: VisionFetchResult;
  /** Test seams — production callers never set these. */
  visionProviders?: VisionProvider[];
  segmenter?: ObjectSegmenter;
}

/**
 * Stage 1: understand the image. Produces glyph masks for every text region
 * (validated), detects candidate non-text regions via a vision provider, and
 * for each reliable candidate produces a real segmentation mask. Nothing is
 * modified here — no pixels are removed, no elements decided.
 */
export async function analyzeDesign(p: AnalyzeParams): Promise<AnalyzeResult> {
  const fileBuf = fs.readFileSync(p.absolutePath);
  const sourceHash = sha256(fileBuf);
  const V = DECOMPOSITION_VERSION;

  // Text-mask generation (CPU-bound, local) and the vision API call have no
  // dependency on each other — only the merge step below needs both — so
  // they run concurrently rather than one after the other. When the caller
  // already ran /analyze-vision alongside client-side OCR, `precomputedVision`
  // is used as-is instead of firing a second (paid) request for the same image.
  const [img, vision] = await Promise.all([
    loadRawImage(p.absolutePath),
    p.precomputedVision ? Promise.resolve(p.precomputedVision) : fetchVisionRegions(p.absolutePath, p.keys, p.visionProviders),
  ]);
  const texts: TextRegionResult[] = [];
  for (const r of p.textRegions) texts.push((await generateTextMask(img, r, p.textRegions)).result);
  const regions = vision.regions;
  const visionStatus = vision.status;
  const visionCached = vision.cached;

  // --- text that belongs to a detected logo/badge/icon/QR stays flattened ---
  if (visionStatus.available) {
    for (const t of texts) {
      if (!t.accepted || !t.ink) continue;
      const owner = regions.find((o) => CLAIMING_TYPES.has(o.type) && overlapArea(t.ink!, o) / area(t.ink!) >= 0.7);
      if (owner) { t.accepted = false; t.reason = `Part of a detected ${owner.type} (${owner.description || 'graphic'}) — stays with the graphic`; delete t.maskPng; }
    }
  }

  // --- objects: separability gates, then real segmentation -----------------
  const acceptedTextBoxes = texts.filter((t) => t.accepted && t.ink).map((t) => t.ink!);

  let segmenter: ObjectSegmenter;
  if (p.segmenter) {
    segmenter = p.segmenter;
  } else if (visionStatus.provider === 'fastsam-local') {
    // Real masks were already computed during fetchVisionRegions above — text
    // regions weren't known then, so the text-overlap check is applied only
    // now, once `acceptedTextBoxes` exists.
    let localProposals = localProposalCache.get(sourceHash);
    if (!localProposals) {
      const local = await proposeLocalRegions(p.absolutePath, img.width, img.height);
      localProposals = local.proposals;
    }
    const rejectedForText = new Set<string>();
    for (const lp of localProposals) {
      if (acceptedTextBoxes.some((t) => overlapArea(lp.region, t) / area(lp.region) > 0.6)) rejectedForText.add(lp.region.id);
    }
    segmenter = new LocalPrecomputedSegmenter(localProposals, rejectedForText);
  } else {
    segmenter = new U2NetSegmenter();
  }

  const objects: ObjectResult[] = [];
  const eligible = regions.filter((r) => EXTRACTABLE_TYPES.has(r.type));
  const hasOpenAI = !!p.keys.openai;

  for (const r of regions) {
    const base: ObjectResult = { ...r, extracted: false };
    if (!EXTRACTABLE_TYPES.has(r.type)) { objects.push({ ...base, reason: `${r.type} regions stay in the background (no vector-shape fitting available)` }); continue; }
    if (r.confidence < EXTRACT_CONFIDENCE) { objects.push({ ...base, reason: `Confidence ${r.confidence.toFixed(2)} is below the ${EXTRACT_CONFIDENCE} bar for extraction` }); continue; }
    const rival = eligible.find((o) => o.id !== r.id && overlapArea(r, o) / Math.min(area(r), area(o)) > 0.2);
    if (rival) { objects.push({ ...base, reason: `Overlaps another detected graphic ("${rival.description || rival.type}") too closely to separate` }); continue; }
    const straddled = acceptedTextBoxes.find((b) => { const f = overlapArea(b, r) / area(b); return f > 0.2 && f < 0.7; });
    if (straddled) { objects.push({ ...base, reason: 'A text line straddles this region\'s edge — cannot separate cleanly' }); continue; }

    const seg = await segmenter.segment(p.absolutePath, r, img.width, img.height);
    if ('rejected' in seg) { objects.push({ ...base, reason: seg.rejected }); continue; }

    // Where will the hole come from — can the local provider fill it convincingly?
    const ring = modelBackgroundAround(img, seg.bbox, [], Math.max(8, Math.round(Math.max(seg.bbox.width, seg.bbox.height) * 0.1)));
    const needsAI = !ring || ring.rms > LOCAL_INPAINT_MAX_RING_RMS;
    if (needsAI && !hasOpenAI) {
      objects.push({ ...base, reason: 'The area behind this graphic is too detailed to reconstruct locally, and AI inpainting is not configured' });
      continue;
    }

    const stem = `${sourceHash.slice(0, 16)}-${r.id}`;
    const cutoutName = `cutout-${stem}.png`;
    fs.writeFileSync(path.join('uploads', cutoutName), seg.cutoutPng);
    const maskFile = `seg-${stem}-${V}-mask.png`;
    const maskPng = await sharp(Buffer.from(seg.mask.map((v) => (v ? 255 : 0))), { raw: { width: seg.bbox.width, height: seg.bbox.height, channels: 1 } }).png().toBuffer();
    fs.writeFileSync(cachePath(maskFile), maskPng);
    const stored: StoredSegmentation = { regionId: r.id, bbox: seg.bbox, needsAI, maskFile };
    writeJsonCache(`seg-${stem}-${V}.json`, stored);

    objects.push({ ...base, extracted: true, cutoutUrl: `/uploads/${cutoutName}`, cutoutRect: seg.bbox, reason: needsAI ? 'Will be reconstructed with AI inpainting' : undefined });
  }

  return {
    sourceHash, version: V, imageWidth: img.width, imageHeight: img.height, texts, objects,
    capabilities: {
      vision: visionStatus,
      segmentation: { available: true, provider: segmenter.name },
      aiInpaint: hasOpenAI ? { available: true, provider: 'openai' } : { available: false, reason: 'No OpenAI API key is configured' },
    },
    cached: { vision: visionCached },
  };
}

export interface ReconstructParams {
  absolutePath: string;
  /** The uploaded image's public URL — returned as-is when there is nothing to reconstruct. */
  url: string;
  /** Every text region from analysis (needed so each mask sees the same neighbors it did then). */
  allTextRegions: TextRegionInput[];
  /** Only these texts are actually being made editable, so only these are erased. */
  acceptedTextIds: string[];
  /** Only these extracted objects are actually being made editable. */
  objectIds: string[];
  keys: ProviderKeys;
  aiProvider?: ImageReconstructionProvider;
}

/**
 * Stage 2: remove exactly the pixels that are becoming editable layers and
 * reconstruct what was underneath. Always reads the ORIGINAL file — never a
 * previous output — and writes a new file, so the source is immutable and
 * running this twice can't compound edits.
 */
export async function reconstructDesign(p: ReconstructParams): Promise<ReconstructResult> {
  const sourceHash = sha256(fs.readFileSync(p.absolutePath));
  const V = DECOMPOSITION_VERSION;
  const warnings: string[] = [];
  const dropped: string[] = [];

  const accepted = p.allTextRegions.filter((r) => p.acceptedTextIds.includes(r.id));
  const objectIds = [...p.objectIds].sort();
  if (accepted.length === 0 && objectIds.length === 0) {
    return { sourceHash, version: V, backgroundUrl: p.url, method: 'none', cached: false, warnings, droppedObjectIds: [] };
  }

  const key = sha256(JSON.stringify({ sourceHash, V, t: accepted.map((r) => [r.id, r.x, r.y, r.width, r.height, r.core]).sort(), o: objectIds })).slice(0, 24);
  const outName = `recon-${key}.png`;
  const outPath = path.join('uploads', outName);
  const cachedMethod = readJsonCache<{ method: ReconstructResult['method'] }>(`recon-${key}.json`);
  if (cachedMethod && fs.existsSync(outPath)) {
    return { sourceHash, version: V, backgroundUrl: `/uploads/${outName}`, method: cachedMethod.method, cached: true, warnings, droppedObjectIds: [] };
  }

  const original = await loadRawImage(p.absolutePath);
  const work = { ...original, data: Buffer.from(original.data) }; // pristine `original` stays untouched for mask generation
  let usedAI = false;

  // Objects first: their holes are bigger and text near them should see the repaired pixels.
  const local = new LocalInpaintProvider();
  const aiMasks: { id: string; mask: Uint8Array }[] = [];
  for (const id of objectIds) {
    const stem = `${sourceHash.slice(0, 16)}-${id}`;
    const meta = readJsonCache<StoredSegmentation>(`seg-${stem}-${V}.json`);
    if (!meta || !fs.existsSync(cachePath(meta.maskFile))) { dropped.push(id); warnings.push(`Segmentation for ${id} is not available — left flattened`); continue; }
    const { data } = await sharp(cachePath(meta.maskFile)).raw().toBuffer({ resolveWithObject: true });
    // Full-size hole mask, grown in proportion to the object so no rim/halo of it survives.
    const full = new Uint8Array(original.width * original.height);
    const g = Math.max(3, Math.min(10, Math.round(Math.max(meta.bbox.width, meta.bbox.height) * 0.04)));
    for (let y = 0; y < meta.bbox.height; y++) {
      for (let x = 0; x < meta.bbox.width; x++) {
        if (!data[y * meta.bbox.width + x]) continue;
        for (let dy = -g; dy <= g; dy++) for (let dx = -g; dx <= g; dx++) {
          const yy = meta.bbox.y + y + dy, xx = meta.bbox.x + x + dx;
          if (yy >= 0 && xx >= 0 && yy < original.height && xx < original.width) full[yy * original.width + xx] = 1;
        }
      }
    }
    if (meta.needsAI) aiMasks.push({ id, mask: full });
    else await local.reconstruct(work, full);
  }

  if (aiMasks.length) {
    const union = new Uint8Array(original.width * original.height);
    for (const a of aiMasks) for (let i = 0; i < union.length; i++) if (a.mask[i]) union[i] = 1;
    try {
      const ai = p.aiProvider ?? (p.keys.openai ? new OpenAIInpaintProvider(p.keys.openai) : null);
      if (!ai) throw new Error('AI inpainting is not configured');
      // One grouped call for every object that needs it, not one per object.
      await ai.reconstruct(work, union);
      usedAI = true;
    } catch (err: any) {
      // Never leave a hole: without a reconstruction the object must stay in the background.
      for (const a of aiMasks) { dropped.push(a.id); }
      warnings.push(`AI reconstruction failed (${err?.message || 'unknown error'}) — those graphics were left flattened`);
    }
  }

  // Text: masks computed from the pristine original so results don't depend on object repairs.
  for (const r of accepted) {
    const m = await generateTextMask(original, r, p.allTextRegions);
    if (m.result.accepted) inpaintRegion(work, m.box, m.mask, m.plane);
    else warnings.push(`Text ${r.id} could not be masked cleanly (${m.result.reason}) — left as is`);
  }

  await sharp(work.data, { raw: { width: work.width, height: work.height, channels: 3 } }).png().toFile(outPath);
  const method: ReconstructResult['method'] = usedAI ? 'ai-inpaint+local-inpaint' : 'local-inpaint';
  // Always write the cache JSON — even when some objects were dropped (AI
  // failed or segmentation missing). Without it, a second call with the same
  // parameters would miss the cache and redundantly re-run every local inpaint
  // that already succeeded. The droppedObjectIds list in the result tells the
  // caller which objects couldn't be reconstructed; that doesn't invalidate
  // the partial result on disk.
  writeJsonCache(`recon-${key}.json`, { method, droppedObjectIds: dropped });
  return { sourceHash, version: V, backgroundUrl: `/uploads/${outName}`, method, cached: false, warnings, droppedObjectIds: dropped };
}

// ============================================================================
// Progressive, single-element reconstruction — the on-demand replacement for
// looping reconstructDesign() over everything at import time. The working
// background starts as a byte-for-byte copy of the original and is patched in
// place, one element at a time, only when that specific element is actually
// edited/moved/deleted in the editor. reconstructDesign() above is untouched
// and still available (e.g. a future "flatten everything" bulk action), but
// the normal Make Editable / Upload Template flow no longer calls it.
// ============================================================================

export interface ReconstructRegionParams {
  absolutePath: string;
  allTextRegions: TextRegionInput[];
  elementId: string;
  kind: 'text' | 'object';
  keys: ProviderKeys;
  aiProvider?: ImageReconstructionProvider;
}

export interface ReconstructRegionResult {
  ok: boolean;
  /** Set when ok=false — caller marks the element requiresFlattenedEditing and leaves the original pixels alone. */
  reason?: string;
  workingBackgroundUrl?: string;
  version?: number;
  /** Text only — the sampled ink color for the now-visible editable text. */
  inkColor?: string;
}

interface WorkingBackgroundState {
  sourceHash: string;
  version: number;
  patchedElementIds: string[];
}

function workingBackgroundNames(sourceHash: string) {
  return {
    pngName: `working-${sourceHash}.png`,
    pngPath: path.join('uploads', `working-${sourceHash}.png`),
    pngUrl: `/uploads/working-${sourceHash}.png`,
    stateFile: `working-${sourceHash}-state.json`,
    maskFile: `working-${sourceHash}-patchedmask.png`,
  };
}

/** Creates the working background (a copy of the original) the first time any element for this source is reconstructed. A no-op on every call after that. */
async function ensureWorkingBackground(absolutePath: string, sourceHash: string): Promise<WorkingBackgroundState> {
  const { pngPath, stateFile, maskFile } = workingBackgroundNames(sourceHash);
  const maskPath = cachePath(maskFile);
  const existing = readJsonCache<WorkingBackgroundState>(stateFile);
  if (existing && fs.existsSync(pngPath) && fs.existsSync(maskPath)) return existing;

  const original = await loadRawImage(absolutePath);
  await sharp(original.data, { raw: { width: original.width, height: original.height, channels: 3 } }).png().toFile(pngPath);
  await sharp(Buffer.alloc(original.width * original.height, 0), { raw: { width: original.width, height: original.height, channels: 1 } }).png().toFile(maskPath);
  const state: WorkingBackgroundState = { sourceHash, version: 1, patchedElementIds: [] };
  writeJsonCache(stateFile, state);
  return state;
}

/**
 * Reconstructs exactly one element's region — nothing else. Idempotent: a
 * second call for the same elementId returns the already-patched working
 * background without redoing any pixel work (see patchedElementIds).
 * Skips pixels already claimed by a *different* element's earlier patch
 * (the overlap guard) rather than letting one patch overwrite another.
 */
export async function reconstructElementRegion(p: ReconstructRegionParams): Promise<ReconstructRegionResult> {
  const sourceHash = sha256(fs.readFileSync(p.absolutePath));
  const V = DECOMPOSITION_VERSION;
  const names = workingBackgroundNames(sourceHash);
  const state = await ensureWorkingBackground(p.absolutePath, sourceHash);

  if (state.patchedElementIds.includes(p.elementId)) {
    return { ok: true, workingBackgroundUrl: `${names.pngUrl}?v=${state.version}`, version: state.version };
  }

  const original = await loadRawImage(p.absolutePath);
  const maskPath = cachePath(names.maskFile);
  const patched = await sharp(maskPath).raw().toBuffer({ resolveWithObject: true });
  const patchedMask = patched.data; // full-image, 255 = pixel already claimed by an earlier patch

  const working = await loadRawImage(names.pngPath);
  let inkColor: string | undefined;
  let touchedAny = false;

  if (p.kind === 'text') {
    const region = p.allTextRegions.find((r) => r.id === p.elementId);
    if (!region) return { ok: false, reason: 'Unknown text region' };
    const m = await generateTextMask(original, region, p.allTextRegions);
    if (!m.result.accepted || m.mask.length === 0) return { ok: false, reason: m.result.reason || 'Could not be masked cleanly' };
    inkColor = m.result.inkColor;
    // Overlap guard: drop any mask pixel another element already patched.
    const localMask = new Uint8Array(m.mask.length);
    for (let y = 0; y < m.box.height; y++) {
      for (let x = 0; x < m.box.width; x++) {
        const i = y * m.box.width + x;
        if (!m.mask[i]) continue;
        const ax = m.box.x + x, ay = m.box.y + y;
        if (patchedMask[ay * original.width + ax]) continue;
        localMask[i] = 1;
        patchedMask[ay * original.width + ax] = 255;
        touchedAny = true;
      }
    }
    if (touchedAny) inpaintRegion(working, m.box, localMask, m.plane);
  } else {
    const stem = `${sourceHash.slice(0, 16)}-${p.elementId}`;
    const meta = readJsonCache<{ regionId: string; bbox: Rect; needsAI: boolean; maskFile: string }>(`seg-${stem}-${V}.json`);
    if (!meta || !fs.existsSync(cachePath(meta.maskFile))) return { ok: false, reason: 'Segmentation for this graphic is not available' };
    const { data: segMask } = await sharp(cachePath(meta.maskFile)).raw().toBuffer({ resolveWithObject: true });
    const g = Math.max(3, Math.min(10, Math.round(Math.max(meta.bbox.width, meta.bbox.height) * 0.04)));
    const full = new Uint8Array(original.width * original.height);
    for (let y = 0; y < meta.bbox.height; y++) {
      for (let x = 0; x < meta.bbox.width; x++) {
        if (!segMask[y * meta.bbox.width + x]) continue;
        for (let dy = -g; dy <= g; dy++) {
          for (let dx = -g; dx <= g; dx++) {
            const yy = meta.bbox.y + y + dy, xx = meta.bbox.x + x + dx;
            if (yy >= 0 && xx >= 0 && yy < original.height && xx < original.width) full[yy * original.width + xx] = 1;
          }
        }
      }
    }
    for (let i = 0; i < full.length; i++) {
      if (!full[i]) continue;
      if (patchedMask[i]) { full[i] = 0; continue; }
      patchedMask[i] = 255;
      touchedAny = true;
    }
    if (touchedAny) {
      if (meta.needsAI) {
        if (!p.keys.openai) return { ok: false, reason: 'The area behind this graphic is too detailed to reconstruct locally, and AI inpainting is not configured' };
        try {
          const ai = p.aiProvider ?? new OpenAIInpaintProvider(p.keys.openai);
          await ai.reconstruct(working, full);
        } catch (err: any) {
          return { ok: false, reason: `AI reconstruction failed (${err?.message || 'unknown error'})` };
        }
      } else {
        await new LocalInpaintProvider().reconstruct(working, full);
      }
    }
  }

  if (!touchedAny) {
    // Every pixel this element would have claimed was already patched by
    // something else (fully overlapping regions) — nothing new to persist,
    // but the element itself is still considered successfully revealed.
    const next: WorkingBackgroundState = { ...state, patchedElementIds: [...state.patchedElementIds, p.elementId] };
    writeJsonCache(names.stateFile, next);
    return { ok: true, workingBackgroundUrl: `${names.pngUrl}?v=${state.version}`, version: state.version, inkColor };
  }

  await sharp(working.data, { raw: { width: working.width, height: working.height, channels: 3 } }).png().toFile(names.pngPath);
  await sharp(patchedMask, { raw: { width: original.width, height: original.height, channels: 1 } }).png().toFile(maskPath);
  const nextVersion = state.version + 1;
  const next: WorkingBackgroundState = { sourceHash, version: nextVersion, patchedElementIds: [...state.patchedElementIds, p.elementId] };
  writeJsonCache(names.stateFile, next);

  return { ok: true, workingBackgroundUrl: `${names.pngUrl}?v=${nextVersion}`, version: nextVersion, inkColor };
}

export { maskBounds };
