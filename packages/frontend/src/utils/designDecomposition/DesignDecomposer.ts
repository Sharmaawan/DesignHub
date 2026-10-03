import { BACKEND_ORIGIN as BACKEND, designAPI, uploadAPI, DesignAnalysis, DesignTextRegion, DesignVisionResult } from '../api';
import { detectTextLines, DetectedTextLine } from '../templateDecomposition';
import type { CanvasElement, ImageData, Page, PageDecomposition, TextData } from '../../types';
import { fitTextToGlyphs } from './textFitting';
import { validateDecomposedPage } from './validate';

// Flat image -> editable design. The ORIGINAL upload is never modified: the
// reconstructed background is a separate file, produced server-side from the
// original every time. This module runs only when the user clicks "Make
// Editable" — it is never reachable from a render, an effect, or a page load.

export type StepId = 'upload' | 'analyze' | 'text' | 'objects' | 'background' | 'layers';
export type StepStatus = 'active' | 'done' | 'skipped';
export interface ProgressEvent { step: StepId; status: StepStatus; detail?: string }

export const STEP_LABELS: Record<StepId, string> = {
  upload: 'Uploading image',
  analyze: 'Analyzing design',
  text: 'Detecting text',
  objects: 'Detecting objects',
  background: 'Reconstructing background',
  layers: 'Building editable layers',
};

export class DecompositionError extends Error {
  constructor(public code: 'aborted' | 'ocr' | 'server' | 'empty' | 'validation', message: string) {
    super(message);
  }
}

export interface DecomposeSummary {
  editableText: number;
  extractedObjects: number;
  flattened: PageDecomposition['flattened'];
  notes: string[];
}
export interface DecomposeOutcome { page: Page; summary: DecomposeSummary }

// A line has to clear both bars to become editable text. The footer of the
// test poster ("phone-icon 8260077222 (9773… whatsapp-icon @&www…") is the
// reason both exist: OCR misreads icons as symbols/digits (confidence ~49%,
// heavy punctuation), and erasing those pixels to replace them with garbage
// text would make the design worse.
// Stylized poster/design text (colored headings, bold display fonts) often
// scores 50-65% confidence in Tesseract even when perfectly legible — the
// original 70% bar was designed for the footer icon-misread case (phone
// numbers mixed with WhatsApp icons), which the MAX_SYMBOL_RATIO gate already
// handles independently. Lowering to 45% keeps that safety net while letting
// real headings through.
const MIN_OCR_CONFIDENCE = 45;
const MAX_SYMBOL_RATIO = 0.18;
// Overlap score of the fitted font's glyphs against the original glyphs.
// Lowered from 0.3 to 0.15 — custom/display fonts in design posters never
// closely match the available web fonts, so 0.3 was silently dropping most
// real text. 0.15 still rejects pure noise while accepting a best-effort match.
const MIN_FIT_SCORE = 0.15;
const VERSION_FALLBACK = '1.0.0';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const symbolRatio = (t: string) => {
  const stripped = t.replace(/\s/g, '');
  if (!stripped) return 1;
  const good = stripped.replace(/[^A-Za-z0-9.,'’\-:]/g, '').length;
  return 1 - good / stripped.length;
};

function loadImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not read the image'));
    img.src = url;
  });
}

export async function decomposeImage(
  file: File,
  opts: { onProgress?: (e: ProgressEvent) => void; signal?: AbortSignal } = {},
): Promise<DecomposeOutcome> {
  const emit = (step: StepId, status: StepStatus, detail?: string) => opts.onProgress?.({ step, status, detail });
  const checkAbort = () => { if (opts.signal?.aborted) throw new DecompositionError('aborted', 'Cancelled'); };
  const notes: string[] = [];
  const flattened: PageDecomposition['flattened'] = [];

  try {
    // 1. Upload the untouched original.
    emit('upload', 'active');
    const { data: saved } = await uploadAPI.upload(file);
    const originalUrl: string = saved.url; // server-relative, e.g. /uploads/<uuid>.png
    const fullOriginalUrl = `${BACKEND}${originalUrl}`;
    const { width, height } = await loadImageSize(fullOriginalUrl);
    emit('upload', 'done');
    checkAbort();

    // 2. Text (client-side Tesseract) and object detection (backend vision
    // call) have no dependency on each other — only the merge in step 3 needs
    // both — so they run concurrently instead of OCR blocking vision from
    // even starting. A vision failure here (network hiccup, provider error)
    // degrades to "unavailable" rather than aborting text-only decomposition,
    // matching how an unavailable provider is already handled everywhere else.
    emit('text', 'active');
    emit('objects', 'active');
    const textPromise = detectTextLines(fullOriginalUrl, width, height)
      .then((lines) => { emit('text', 'done', `${lines.length} text line${lines.length === 1 ? '' : 's'} found`); return lines; })
      .catch((err: any) => { throw new DecompositionError('ocr', `Text detection failed: ${err?.message || 'unknown error'}`); });
    const visionPromise: Promise<DesignVisionResult> = designAPI.analyzeVision(originalUrl, opts.signal)
      .then(({ data }) => data)
      .catch((err: any): DesignVisionResult => ({
        regions: [],
        status: { available: false, reason: err?.response?.data?.error || err?.message || 'Object detection request failed' },
        cached: false,
      }));

    const [lines, visionResult] = await Promise.all([textPromise, visionPromise]);
    if (visionResult.status.available) {
      emit('objects', 'done', `${visionResult.regions.length} candidate graphic${visionResult.regions.length === 1 ? '' : 's'} found`);
    } else {
      notes.push(`AI editing is temporarily unavailable — logos, badges and other graphics stay in the background image. (${visionResult.status.reason || 'no vision provider configured'})`);
      emit('objects', 'skipped', 'AI object detection unavailable');
    }
    checkAbort();

    const ordered = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
    const regions: DesignTextRegion[] = [];
    const lineById = new Map<string, DetectedTextLine>();
    ordered.forEach((line, i) => {
      const id = `t${i}`;
      const label = line.text.trim().slice(0, 40);
      if (line.conf < MIN_OCR_CONFIDENCE) { flattened.push({ kind: 'text', label, reason: `Low OCR confidence (${Math.round(line.conf)}%) — left as part of the image` }); return; }
      if (symbolRatio(line.text) > MAX_SYMBOL_RATIO) { flattened.push({ kind: 'text', label, reason: 'Mostly symbols — likely icons misread as text, left as part of the image' }); return; }
      const x = Math.max(0, line.x - 4), y = Math.max(0, line.y - 4);
      regions.push({
        id, x, y,
        width: Math.min(width - x, line.width + 8), height: Math.min(height - y, line.height + 8),
        core: { x: line.x, y: line.y, width: line.width, height: line.height },
      });
      lineById.set(id, line);
    });

    // 3. Backend: validated glyph masks, plus real segmentation for whichever
    // vision-detected candidates pass the separability gates. `visionResult`
    // was already fetched concurrently above, so this never re-runs the
    // (paid) vision API call for the same image.
    emit('analyze', 'active');
    let analysis: DesignAnalysis;
    try {
      ({ data: analysis } = await designAPI.analyze(originalUrl, regions, visionResult, opts.signal));
    } catch (err: any) {
      if (opts.signal?.aborted) throw new DecompositionError('aborted', 'Cancelled');
      throw new DecompositionError('server', err?.response?.data?.error || err?.message || 'Design analysis failed');
    }
    emit('analyze', 'done', visionResult.status.available ? `${analysis.objects.filter((o) => o.extracted).length} graphic${analysis.objects.filter((o) => o.extracted).length === 1 ? '' : 's'} separated` : undefined);
    for (const o of analysis.objects) {
      if (!o.extracted) flattened.push({ kind: o.type, label: o.description || o.type, reason: o.reason || 'Not reliably separable' });
    }
    checkAbort();

    // 4. Fit real fonts to the real glyphs; anything that can't be matched stays flattened.
    emit('layers', 'active', 'Matching fonts to the original text');
    const fits = new Map<string, Awaited<ReturnType<typeof fitTextToGlyphs>>>();
    const acceptedTextIds: string[] = [];
    for (const t of analysis.texts) {
      const line = lineById.get(t.id);
      if (!line) continue;
      const label = line.text.trim().slice(0, 40);
      if (!t.accepted || !t.ink || !t.maskPng) { flattened.push({ kind: 'text', label, reason: t.reason || 'Could not be masked cleanly' }); continue; }
      const fit = await fitTextToGlyphs(line.text.trim(), t.ink, t.maskPng);
      console.debug('[MakeEditable] font fit', t.id, JSON.stringify(label), fit ? `${fit.fontFamily} ${fit.fontWeight} score=${fit.score.toFixed(2)}` : 'no candidate');
      if (!fit || fit.score < MIN_FIT_SCORE) {
        flattened.push({
          kind: 'text', label,
          reason: fit
            ? `No available font matched this text closely enough (${Math.round(fit.score * 100)}% overlap) — left as part of the image`
            : "This text's proportions do not match any available font — left as part of the image",
        });
        continue;
      }
      fits.set(t.id, fit);
      acceptedTextIds.push(t.id);
    }
    checkAbort();

    const extracted = analysis.objects.filter((o) => o.extracted && o.cutoutUrl && o.cutoutRect);
    if (acceptedTextIds.length === 0 && extracted.length === 0) {
      throw new DecompositionError('empty', 'No editable text or reliably separable graphics were found in this image.');
    }
    emit('background', 'skipped');
    checkAbort();

    // 5. Build the layer stack. IDs are derived from source hash + region id — deterministic,
    // never random, so the same source always yields the same ids. No pixels are removed
    // here — the page's background is the untouched original (see below); each layer's
    // own region only gets reconstructed on demand, the first time it's actually edited
    // (text) or moved/deleted (objects) — see reconstructElementRegion / EditorCanvas.tsx.
    emit('layers', 'active', 'Assembling layers');
    const hash8 = analysis.sourceHash.slice(0, 8);
    const version = analysis.version || VERSION_FALLBACK;
    const elements: CanvasElement[] = [];
    let z = 1;

    for (const o of extracted) {
      const r = o.cutoutRect!;
      const data: ImageData = {
        type: 'image', src: `${BACKEND}${o.cutoutUrl}`, objectFit: 'fill', borderRadius: 0,
        brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [],
        cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100,
      };
      elements.push({
        id: `dh-${hash8}-${o.id}`, type: 'image', x: r.x, y: r.y, width: r.width, height: r.height,
        rotation: 0, opacity: 1, visible: true, locked: false, zIndex: z++,
        name: `${o.type[0].toUpperCase()}${o.type.slice(1)}${o.description ? ` — ${o.description}` : ''}`.slice(0, 60),
        confidence: o.confidence, editable: true,
        // The cutout already occludes the original pixels 1:1, so it renders
        // immediately (unlike text, below) — revealed here tracks only
        // whether the background hole *underneath* it has been cleaned yet,
        // which only matters once this object is moved or deleted.
        revealed: false,
        source: { regionId: o.id, sourceHash: analysis.sourceHash, version, role: o.type as any },
        data,
      });
    }

    const textStart = 100;
    acceptedTextIds.forEach((id, i) => {
      const line = lineById.get(id)!;
      const t = analysis.texts.find((tt) => tt.id === id)!;
      const fit = fits.get(id)!;
      const content = line.text.trim();
      const data: TextData = {
        type: 'text', content,
        fontFamily: fit.fontFamily, fontSize: fit.fontSize, fontWeight: fit.fontWeight,
        fontStyle: 'normal', textDecoration: 'none', textAlign: 'left',
        color: t.inkColor || '#000000', lineHeight: 1.2, letterSpacing: fit.letterSpacing, textTransform: 'none',
      };
      elements.push({
        id: `dh-${hash8}-${id}`, type: 'text', x: fit.x, y: fit.y, width: fit.width, height: fit.height,
        rotation: 0, opacity: 1, visible: true, locked: false, zIndex: textStart + i,
        name: content.slice(0, 40),
        confidence: Math.round(clamp(line.conf / 100, 0, 1) * 100) / 100, editable: true,
        revealed: false,
        // Store the background color behind this text so EditorCanvas can paint
        // a cover rect to mask the baked-in original pixels before server-side
        // reconstruction runs (e.g. when the user edits via the properties panel).
        ...(t.inkBackground ? { inkBackground: t.inkBackground } : {}),
        // Store the tight ink bounding box (exact glyph pixel bounds in page
        // space) so the cover rect in EditorCanvas can mask the baked-in text
        // at the correct position — element.x/y/width/height is the typographic
        // container (shifted/larger), not the ink rect.
        ...(t.ink ? { inkX: t.ink.x, inkY: t.ink.y, inkWidth: t.ink.width, inkHeight: t.ink.height } : {}),
        // Top-3 alternative font suggestions from the fitting run — stored so
        // TextProperties can show a "closest font" hint without re-running the
        // full fitting loop.
        ...(fit.suggestions?.length ? { fontSuggestions: fit.suggestions } : {}),
        source: { regionId: id, sourceHash: analysis.sourceHash, version, role: 'text' },
        data,
      });
    });

    const page: Page = {
      id: `dh-page-${hash8}`,
      name: 'Page 1',
      width, height,
      backgroundColor: '#FFFFFF',
      elements,
      // The untouched original — not a reconstruction. Progressively patched
      // in place (same URL, version-bumped query string) as regions get
      // revealed; never regenerated wholesale. See page.decomposition.originalUrl,
      // which always keeps pointing at this same file regardless of how many
      // patches have since been applied to backgroundImage.src.
      backgroundImage: { src: fullOriginalUrl, cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 },
      decomposition: {
        version, status: 'completed', createdAt: new Date().toISOString(), sourceHash: analysis.sourceHash,
        originalUrl: fullOriginalUrl, flattened, textRegions: regions,
      },
    };

    const problems = validateDecomposedPage(page);
    if (problems.length) throw new DecompositionError('validation', `The generated design failed validation: ${problems.slice(0, 3).join('; ')}`);
    emit('layers', 'done');

    return { page, summary: { editableText: acceptedTextIds.length, extractedObjects: elements.filter((e) => e.type === 'image').length, flattened, notes } };
  } catch (err) {
    if (err instanceof DecompositionError) throw err;
    if (opts.signal?.aborted) throw new DecompositionError('aborted', 'Cancelled');
    throw new DecompositionError('server', (err as any)?.message || 'Unexpected error');
  }
}
