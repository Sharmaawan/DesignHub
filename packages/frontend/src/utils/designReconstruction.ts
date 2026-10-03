// Converts a single flattened uploaded image into multiple independently editable
// CanvasElements — real text objects, real shape objects for solid-color blocks, and
// a separately cropped photo region — instead of leaving it as one flat image with
// controls drawn over the top.
//
// This is explicitly a *progressive, confidence-based* pipeline, not a claim of
// perfect recovery:
//   Level 1 — OCR text detection (tesseract.js): reliable, always attempted.
//   Level 2 — Solid-color rectangular block detection (flood-fill on pixel data):
//             reliable for banners/buttons/bars, the common "shape" case in a
//             flattened marketing design.
//   Level 2.5 — Corner-graphic detection (a targeted, narrower heuristic, not general
//             segmentation): a logo/wordmark is almost always a small, self-contained
//             graphic sitting in a corner on an otherwise plain area — e.g. a seal in
//             a white header. Flood-filling that corner's OWN plain background color
//             outward from the very corner pixel, then treating whatever's left
//             unclaimed inside the corner as the graphic, isolates exactly that case
//             without needing true object segmentation. It will miss a logo that
//             ISN'T in a corner, or one sitting directly on a busy photo (nothing to
//             flood-fill outward from) — those stay part of the Photo/Background.
//   Level 3 — Remaining complex-pixel region → one cropped "Photo" element (bounding
//             box of the union of sizable unclaimed regions, not per-object
//             segmentation — true multi-photo/icon segmentation beyond the corner
//             case above needs a trained ML model, which isn't attempted here).
//   Level 4 (vectorization) is deliberately NOT implemented — tracing arbitrary
//             icons into clean SVG paths from a flattened photo is unreliable
//             without a purpose-built model, and a bad attempt is worse than none.
//   Level 5 — Whatever's left stays as the Background layer.
//
// Masking: text and shape elements are made fully opaque over exactly their source
// bounding box (via a solid fill sized to the box, using the Text element's own
// `data.background` field for text) so the original pixels underneath don't show
// through gaps. The background image is ALSO pre-blanked (filled with the sampled
// local color) under text and shape regions specifically, so moving a reconstructed
// element later reveals a plausible plain fill rather than the original graphic. The
// photo region is left untouched in the background — filling a chunk of a photo with
// a flat color would look obviously wrong — so moving the extracted Photo element
// will reveal the original pixels underneath at its old position; that's a known,
// inherent limit of "cover, don't repaint" for non-uniform imagery.

import { createWorker, Worker } from 'tesseract.js';

// Starting a fresh Tesseract worker (loading the WASM engine + English traineddata)
// is the dominant cost of every OCR call here — typically far more than actually
// recognizing a modestly-sized image. Every double-click extraction used to pay
// that startup cost from scratch. Kept alive for the life of the tab and reused
// across every call instead — first OCR call still pays the cost, every one after
// is just the (much cheaper) recognition itself.
let sharedWorkerPromise: Promise<Worker> | null = null;
function getSharedWorker(): Promise<Worker> {
  if (!sharedWorkerPromise) sharedWorkerPromise = createWorker('eng');
  return sharedWorkerPromise;
}

export interface ReconstructedTextElement {
  kind: 'text';
  name: string;
  x: number; y: number; width: number; height: number;
  content: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
}

export interface ReconstructedShapeElement {
  kind: 'shape';
  name: string;
  x: number; y: number; width: number; height: number;
  fill: string;
}

export interface ReconstructedPhotoElement {
  kind: 'photo';
  name: string;
  x: number; y: number; width: number; height: number;
  dataUrl: string;
}

// Structurally identical to a Photo element (both are just an image crop of the
// original) — kept as its own `kind` purely so the UI/naming can tell "this is
// probably a logo, sitting in a corner" apart from "this is the main photo."
export interface ReconstructedLogoElement {
  kind: 'logo';
  name: string;
  x: number; y: number; width: number; height: number;
  dataUrl: string;
}

export type ReconstructedElement = ReconstructedTextElement | ReconstructedShapeElement | ReconstructedPhotoElement | ReconstructedLogoElement;

export interface ReconstructionResult {
  width: number;
  height: number;
  elements: ReconstructedElement[];
  backgroundDataUrl: string; // original image with text/shape regions blanked out
  textConfidenceNote: string;
}

type RGB = [number, number, number];

function getPixel(data: Uint8ClampedArray, w: number, x: number, y: number): RGB {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not load image for reconstruction'));
    img.src = url;
  });
  return img;
}

// --- Level 1: OCR ---

interface DetectedTextLine {
  text: string;
  x: number; y: number; width: number; height: number;
  confidence: number;
}

// A line reading over a busy photo background often comes back from Tesseract as
// a short run of symbols/mixed-case noise ("Ww w a x TIRES", "EE SUL ol i - df\"
// i | I IE") rather than a clean miss — confidence alone doesn't catch this
// because the engine can be fairly "confident" about individual glyphs that are
// still collectively gibberish. Two independent signals catch this pattern: real
// design text is made of a FEW words that are each several letters long, while
// this kind of noise is a STRING of short 1-2 letter fragments and stray symbols
// stitched together — so both the real-word ratio and the average word length
// have to clear the bar, not just one.
// `lenient` is used by extractRegionAtPoint (a user-clicked point is itself
// strong evidence of real text, so it needs a lower bar than a blind full-image
// scan) — but NOT disabled outright, because a completely unfiltered click can
// still land on nearby photo-texture noise a few pixels from the real text it
// was aimed at (e.g. "Centurion 1] | | | | 110 IR" off a seal/logo) and turn it
// into its own garbled floating element. The real-word ratio is what actually
// tells these apart: real headline text is mostly real words even when short,
// noise is mostly stray fragments/symbols regardless of how it averages out.
function looksLikePlausibleText(text: string, lenient = false): boolean {
  const letters = text.replace(/[^A-Za-z]/g, '').length;
  if (letters < 2) return false;
  if (letters / text.replace(/\s/g, '').length < (lenient ? 0.5 : 0.55)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const realWords = words.filter((w) => /[A-Za-z]{2,}/.test(w)).length;
  if (realWords / words.length < (lenient ? 0.45 : 0.6)) return false;
  if (lenient) return true;
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  return avgWordLength >= 2.2;
}

function boxIoU(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
  const ix0 = Math.max(a.x, b.x), iy0 = Math.max(a.y, b.y);
  const ix1 = Math.min(a.x + a.width, b.x + b.width), iy1 = Math.min(a.y + a.height, b.y + b.height);
  const iw = Math.max(0, ix1 - ix0), ih = Math.max(0, iy1 - iy0);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

// IoU alone misses a common duplicate shape: a short fragment Tesseract ALSO
// read as its own separate "line" sitting almost entirely inside a much wider
// line that already contains that same word (e.g. a whole heading plus a
// separate, slightly-misread detection of just one word within it) — IoU
// divides by the UNION, which the much bigger box dominates, so it stays small
// even at near-total overlap of the smaller box. Checking containment (what
// fraction of the SMALLER box's own area is covered) catches that case too.
function boxContainment(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
  const ix0 = Math.max(a.x, b.x), iy0 = Math.max(a.y, b.y);
  const ix1 = Math.min(a.x + a.width, b.x + b.width), iy1 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0);
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return smallerArea > 0 ? inter / smallerArea : 0;
}

interface OcrWord { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number }

// Tesseract's LINE-level segmentation sometimes merges multiple separate, short
// labels sitting side-by-side (e.g. a row of stat labels divided by a thin
// decorative line it often misreads as a stray "|" character) into one "line"
// spanning across the gap between them — producing exactly the kind of garbled
// "INDUSTRY READY | HIGHLY" text this splits back apart. Uses Tesseract's own
// WORD-level positions (finer-grained than the line bbox) to find gaps much wider
// than this line's own normal word-spacing — a real single line/headline never has
// a gap that wide mid-sentence, but two distinct adjacent labels commonly do.
function splitLineOnWordGaps(words: OcrWord[]): OcrWord[][] {
  if (words.length <= 1) return [words];
  const gaps = words.slice(1).map((w, i) => w.bbox.x0 - words[i].bbox.x1);
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const avgHeight = words.reduce((s, w) => s + (w.bbox.y1 - w.bbox.y0), 0) / words.length;
  // Needs to be both a big multiple of this line's own typical gap AND a big
  // fraction of the text's own height — the ratio alone is meaningless when the
  // median gap is ~0 (very few words), which would make any gap look "huge".
  const gapThreshold = Math.max(median * 3, avgHeight * 0.6, 8);
  const groups: OcrWord[][] = [[words[0]]];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].bbox.x0 - words[i - 1].bbox.x1;
    if (gap > gapThreshold) groups.push([words[i]]);
    else groups[groups.length - 1].push(words[i]);
  }
  // A lone symbol-only "word" that ended up isolated in its own group (wide gaps
  // on both sides) is almost always the misread divider itself — drop it rather
  // than attach it to either neighboring label.
  return groups.filter((g) => !(g.length === 1 && g[0].text.replace(/[^A-Za-z0-9]/g, '').length === 0));
}

// Takes the already-loaded, already-drawn canvas (not the raw URL) so Tesseract
// reads the EXACT same pixels the rest of this module's color/shape analysis does.
// Handing it the URL directly let Tesseract do its own internal fetch, which (unlike
// the crossOrigin='anonymous' <img> load used everywhere else here) isn't guaranteed
// to see the real pixel data — in testing that produced silent garbage OCR output
// ("a EEE" for a banner that actually reads "TOGETHER, WE BUILD FUTURES.") instead
// of an error, which made it look like there was simply no text on the image.
// minConfidence/requirePlausible are relaxed by extractRegionAtPoint (see its own
// comment): scanning the WHOLE image blind needs strict filtering to keep photo-
// texture noise out, but a line only matters there if it also happens to sit under
// a point the user deliberately double-clicked — that anchor is itself strong
// evidence of real text, so demanding the same paranoid word-shape check there
// mostly just rejects genuine headline text that OCR read slightly oddly.
async function detectText(canvas: HTMLCanvasElement, minConfidence = 65, plausibility: 'strict' | 'lenient' | 'off' = 'strict'): Promise<DetectedTextLine[]> {
  const worker = await getSharedWorker();
  const { data } = await worker.recognize(canvas, {}, { blocks: true } as any);
  const lines: DetectedTextLine[] = [];
  for (const block of (data as any).blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const words: OcrWord[] = ((line as any).words || []).map((w: any) => ({ text: w.text, bbox: w.bbox, confidence: w.confidence }));
        const groups = words.length > 0 ? splitLineOnWordGaps(words) : null;
        const candidates = groups ?? [null];
        for (const group of candidates) {
          let text: string, x0: number, y0: number, x1: number, y1: number, confidence: number;
          if (group) {
            text = group.map((w) => w.text).join(' ').trim();
            x0 = Math.min(...group.map((w) => w.bbox.x0));
            y0 = Math.min(...group.map((w) => w.bbox.y0));
            x1 = Math.max(...group.map((w) => w.bbox.x1));
            y1 = Math.max(...group.map((w) => w.bbox.y1));
            confidence = group.reduce((s, w) => s + w.confidence, 0) / group.length;
          } else {
            // No word-level data on this line — fall back to the line as a whole.
            text = (line.text || '').trim();
            ({ x0, y0, x1, y1 } = line.bbox);
            confidence = line.confidence;
          }
          if (!text || confidence < minConfidence) continue;
          if (plausibility === 'strict' && !looksLikePlausibleText(text, false)) continue;
          if (plausibility === 'lenient' && !looksLikePlausibleText(text, true)) continue;
          if (x1 <= x0 || y1 <= y0) continue;
          lines.push({ text, x: x0, y: y0, width: x1 - x0, height: y1 - y0, confidence });
        }
      }
    }
  }
  // Tesseract's paragraph/line segmentation can produce two overlapping "lines"
  // for the same physical text (e.g. a column-detection false split on a banner
  // sitting over a photo) — each individually plausible, but stacked on canvas
  // they render as unreadable overlapping boxes. Keep only the higher-confidence
  // line of any pair that substantially overlaps.
  lines.sort((a, b) => b.confidence - a.confidence);
  const kept: DetectedTextLine[] = [];
  for (const line of lines) {
    if (kept.some((k) => boxIoU(k, line) > 0.3 || boxContainment(k, line) > 0.7)) continue;
    kept.push(line);
  }
  return kept;
}

function ringStats(samples: RGB[]): { avg: RGB; variance: number } {
  if (samples.length === 0) return { avg: [255, 255, 255], variance: Infinity };
  const sum = samples.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]] as RGB, [0, 0, 0] as RGB);
  const avg: RGB = [sum[0] / samples.length, sum[1] / samples.length, sum[2] / samples.length];
  const variance = samples.reduce((acc, p) => acc + colorDistance(p, avg) ** 2, 0) / samples.length;
  return { avg, variance };
}

// Samples the local background color from a thin ring just outside a box (avoiding
// the box itself), and the box's own "ink" color as the most common significantly-
// different-from-background pixel bucket inside it.
function sampleTextColors(data: Uint8ClampedArray, w: number, h: number, box: { x: number; y: number; width: number; height: number }) {
  const margin = 4;
  const x0 = Math.max(0, Math.floor(box.x));
  const x1 = Math.min(w - 1, Math.ceil(box.x + box.width));
  const yAbove = Math.max(0, Math.floor(box.y - margin));
  const yBelow = Math.min(h - 1, Math.ceil(box.y + box.height + margin));
  const aboveSamples: RGB[] = [], belowSamples: RGB[] = [];
  for (let x = x0; x <= x1; x += 3) {
    aboveSamples.push(getPixel(data, w, x, yAbove));
    belowSamples.push(getPixel(data, w, x, yBelow));
  }
  // Averaging the above AND below rings blindly is what produced a visibly wrong
  // mask color for a stacked headline — e.g. sampling both the clear sky directly
  // above "TOGETHER," AND the red "WE BUILD FUTURES." sitting right below it blends
  // into a muddy pink that matches neither. A stacked headline is far more likely to
  // have genuinely different content directly BELOW a line (the next line) than
  // above it, so: if the two rings actually agree, average them as before (the
  // common, safe case); if they disagree, trust whichever ring is internally more
  // consistent (low pixel-to-pixel variance = a real uniform background, not a mix
  // of two different things), biased toward "above" when it's a close call.
  const aboveStats = ringStats(aboveSamples);
  const belowStats = ringStats(belowSamples);
  const ringsAgree = colorDistance(aboveStats.avg, belowStats.avg) < 40;
  let bgAvg: RGB;
  if (ringsAgree) {
    bgAvg = ringStats([...aboveSamples, ...belowSamples]).avg;
  } else if (aboveStats.variance <= belowStats.variance * 1.5) {
    bgAvg = aboveStats.avg;
  } else {
    bgAvg = belowStats.avg;
  }

  const buckets = new Map<string, { rgb: RGB; count: number }>();
  const y0 = Math.max(0, Math.floor(box.y));
  const y1 = Math.min(h - 1, Math.ceil(box.y + box.height));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = getPixel(data, w, x, y);
      if (colorDistance(p, bgAvg) > 55) {
        const key = `${p[0] >> 4},${p[1] >> 4},${p[2] >> 4}`;
        const e = buckets.get(key) || { rgb: p, count: 0 };
        e.count++;
        buckets.set(key, e);
      }
    }
  }
  let best: { rgb: RGB; count: number } | null = null;
  for (const e of buckets.values()) if (!best || e.count > best.count) best = e;
  return {
    background: rgbToHex(bgAvg[0], bgAvg[1], bgAvg[2]),
    backgroundRgb: bgAvg,
    ink: best ? rgbToHex(best.rgb[0], best.rgb[1], best.rgb[2]) : '#000000',
  };
}

// Tesseract's reported line bbox is frequently bigger than the actual glyphs on
// BOTH axes — a short headline centered in a wide paragraph region can come back
// with the whole paragraph's width, and a line's reported height can likewise
// come out taller than its real ink (paragraph-level bbox leakage, generous font-
// metric padding, or two visually stacked lines briefly treated as one region).
// An inflated WIDTH renders as a text box stretching into whatever sits beside
// it; an inflated HEIGHT is worse, because this box's dimensions are also what
// size the opaque mask painted onto the background — a bad height blanks out a
// swath of the original image far bigger than the line it was supposed to cover
// (this is what produced a patch spanning two full headline lines instead of
// one). Re-measures the box's ACTUAL ink extent on both axes (pixels meaningfully
// different from the sampled local background) and tightens x/y/width/height to
// that, so both the rendered text box AND the mask it drives always match what's
// actually printed inside the original box, never more.
function tightenTextBox(
  data: Uint8ClampedArray, w: number, h: number,
  box: { x: number; y: number; width: number; height: number }, bgRgb: RGB
): { x: number; y: number; width: number; height: number } {
  const x0 = Math.max(0, Math.floor(box.x)), x1 = Math.min(w - 1, Math.ceil(box.x + box.width));
  const y0 = Math.max(0, Math.floor(box.y)), y1 = Math.min(h - 1, Math.ceil(box.y + box.height));
  let minInkX = -1, maxInkX = -1, minInkY = -1, maxInkY = -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (colorDistance(getPixel(data, w, x, y), bgRgb) > 55) {
        if (minInkX === -1 || x < minInkX) minInkX = x;
        if (x > maxInkX) maxInkX = x;
        if (minInkY === -1 || y < minInkY) minInkY = y;
        if (y > maxInkY) maxInkY = y;
      }
    }
  }
  if (minInkX === -1) return { x: box.x, y: box.y, width: box.width, height: box.height }; // no ink found — leave the original bbox alone
  const pad = 3;
  const tightX = Math.max(x0, minInkX - pad), tightX1 = Math.min(x1, maxInkX + pad);
  const tightY = Math.max(y0, minInkY - pad), tightY1 = Math.min(y1, maxInkY + pad);
  return {
    x: tightX, y: tightY,
    width: Math.max(1, tightX1 - tightX + 1),
    height: Math.max(1, tightY1 - tightY + 1),
  };
}

// --- Level 2: solid-color rectangular block detection ---

interface DetectedRegion { x: number; y: number; width: number; height: number; color: string; area: number }
// Runs on a downsampled copy for speed, then scales results back to full resolution.
export function detectColorBlocks(smallData: Uint8ClampedArray, sw: number, sh: number, scale: number, isExcluded: (x: number, y: number) => boolean): DetectedRegion[] {
  const visited = new Uint8Array(sw * sh);
  const regions: DetectedRegion[] = [];
  const minArea = Math.max(60, sw * sh * 0.004);
  const threshold = 16;

  for (let sy = 0; sy < sh; sy++) {
    for (let sx = 0; sx < sw; sx++) {
      const idx = sy * sw + sx;
      if (visited[idx]) continue;
      if (isExcluded(sx * scale, sy * scale)) { visited[idx] = 1; continue; }
      const seed = getPixel(smallData, sw, sx, sy);
      const stack: [number, number][] = [[sx, sy]];
      visited[idx] = 1;
      let minX = sx, maxX = sx, minY = sy, maxY = sy, count = 0, sumR = 0, sumG = 0, sumB = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        const p = getPixel(smallData, sw, cx, cy);
        count++; sumR += p[0]; sumG += p[1]; sumB += p[2];
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        const neighbors: [number, number][] = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= sw || ny < 0 || ny >= sh) continue;
          const nidx = ny * sw + nx;
          if (visited[nidx]) continue;
          if (isExcluded(nx * scale, ny * scale)) { visited[nidx] = 1; continue; }
          const np = getPixel(smallData, sw, nx, ny);
          if (colorDistance(np, seed) < threshold) {
            visited[nidx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      const bboxArea = (maxX - minX + 1) * (maxY - minY + 1);
      const wPx = maxX - minX + 1, hPx = maxY - minY + 1;
      if (count >= minArea && count / bboxArea > 0.85 && wPx > 4 && hPx > 4) {
        regions.push({
          x: minX * scale, y: minY * scale, width: wPx * scale, height: hPx * scale,
          color: rgbToHex(sumR / count, sumG / count, sumB / count),
          area: count * scale * scale,
        });
      }
    }
  }
  return regions;
}

// --- Level 2.5: corner graphic (logo) detection ---
// Flood-fills a corner box's OWN background color outward from the very corner
// pixel; whatever's left unclaimed inside that box is presumed to contain a
// distinct graphic sitting on top of it (see module doc above for the exact
// reasoning and its limits).
//
// The corner box is deliberately generous in size (it has to be, to comfortably
// contain a logo of unknown size), which means it can extend past a header's own
// boundary into whatever's below it — a photo region, say. If that happens, the
// unclaimed pixels include a chunk of that OTHER region too, which is emphatically
// NOT a logo. The fix is to never treat "everything unclaimed in the box" as one
// answer: cluster the unclaimed pixels into connected components first, then keep
// only the one nearest the actual corner point that's also compact and modestly
// sized — a leaked-in region reads as either a large, sprawling component or one
// that doesn't actually touch the corner, and gets rejected on that basis.
function detectCornerGraphic(
  smallData: Uint8ClampedArray, sw: number, sh: number, scale: number,
  cornerX: 'left' | 'right', cornerY: 'top' | 'bottom',
  isAlreadyClaimed: (x: number, y: number) => boolean
): DetectedRegion | null {
  const boxW = Math.round(sw * 0.34), boxH = Math.round(sh * 0.34);
  const bx0 = cornerX === 'left' ? 0 : Math.max(0, sw - boxW);
  const by0 = cornerY === 'top' ? 0 : Math.max(0, sh - boxH);
  const bx1 = Math.min(sw, bx0 + boxW), by1 = Math.min(sh, by0 + boxH);
  const seedX = cornerX === 'left' ? bx0 : bx1 - 1;
  const seedY = cornerY === 'top' ? by0 : by1 - 1;
  if (seedX < 0 || seedY < 0 || seedX >= sw || seedY >= sh) return null;
  if (isAlreadyClaimed(seedX * scale, seedY * scale)) return null;

  const seedColor = getPixel(smallData, sw, seedX, seedY);
  const threshold = 22;
  const isBackground = new Uint8Array(sw * sh); // 1 = matches the corner's own plain color
  {
    const stack: [number, number][] = [[seedX, seedY]];
    isBackground[seedY * sw + seedX] = 1;
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as [number, number][]) {
        if (nx < bx0 || nx >= bx1 || ny < by0 || ny >= by1) continue;
        const nidx = ny * sw + nx;
        if (isBackground[nidx]) continue;
        const np = getPixel(smallData, sw, nx, ny);
        if (colorDistance(np, seedColor) < threshold) { isBackground[nidx] = 1; stack.push([nx, ny]); }
      }
    }
  }

  // Cluster the unclaimed (non-background, not already text/shape) pixels into
  // connected components.
  const visited = new Uint8Array(sw * sh);
  const boxArea = (bx1 - bx0) * (by1 - by0);
  let best: DetectedRegion | null = null;
  let bestDistToCorner = Infinity;
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      const idx = y * sw + x;
      if (visited[idx] || isBackground[idx] || isAlreadyClaimed(x * scale, y * scale)) { visited[idx] = 1; continue; }
      const stack: [number, number][] = [[x, y]];
      visited[idx] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, count = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        count++;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as [number, number][]) {
          if (nx < bx0 || nx >= bx1 || ny < by0 || ny >= by1) continue;
          const nidx = ny * sw + nx;
          if (visited[nidx]) continue;
          visited[nidx] = 1;
          if (!isBackground[nidx] && !isAlreadyClaimed(nx * scale, ny * scale)) stack.push([nx, ny]);
        }
      }
      const compW = maxX - minX + 1, compH = maxY - minY + 1;
      const compBboxArea = compW * compH;
      const minGraphicArea = Math.max(12, sw * sh * 0.0008);
      // A real logo is a compact blob, not a thin sprawling strip (which is what a
      // leaked-in stripe of some other region looks like) — require it to fill a
      // reasonable fraction of its own bounding box, and to not itself dominate the
      // corner box in either dimension.
      const fillRatio = count / compBboxArea;
      // A genuine logo/icon graphic is roughly compact (closer to square); a thin,
      // wide-or-tall strip is what a line of body text looks like when it isn't
      // excluded up front (which this function deliberately doesn't do — see the
      // call site's comment on why text can't be blanket-excluded here without
      // losing a real logo that got merged into an OCR line's bounding box).
      const aspect = compW > compH ? compW / compH : compH / compW;
      if (count < minGraphicArea || fillRatio < 0.2 || aspect > 2.6 || compW > boxW * 0.85 || compH > boxH * 0.85 || count > boxArea * 0.5) continue;
      // Distance from the component's nearest edge to the actual corner point —
      // the winning component should be the one that's actually AT the corner.
      const cornerPxX = cornerX === 'left' ? bx0 : bx1 - 1;
      const cornerPxY = cornerY === 'top' ? by0 : by1 - 1;
      const nearestX = Math.max(minX, Math.min(cornerPxX, maxX));
      const nearestY = Math.max(minY, Math.min(cornerPxY, maxY));
      const dist = Math.hypot(nearestX - cornerPxX, nearestY - cornerPxY);
      if (dist < bestDistToCorner) {
        bestDistToCorner = dist;
        best = { x: minX * scale, y: minY * scale, width: compW * scale, height: compH * scale, color: '', area: count * scale * scale };
      }
    }
  }
  // The winning component still has to actually be near the corner (within roughly
  // half the box's own span) — otherwise it's more likely an unrelated small blob
  // elsewhere in the box than a corner logo.
  if (best && bestDistToCorner > Math.max(boxW, boxH) * 0.6) return null;
  return best;
}

// --- Level 3: largest remaining (photo) region ---
// Bounding box of the union of sizable unclaimed connected components — merges
// fragments split by overlaid text (common when a headline sits directly on a photo)
// into one sensible rectangle, rather than one strictly-connected blob.
function extractPhotoBounds(smallW: number, smallH: number, scale: number, isClaimed: (x: number, y: number) => boolean): { x: number; y: number; width: number; height: number } | null {
  const visited = new Uint8Array(smallW * smallH);
  const minComponentArea = Math.max(20, smallW * smallH * 0.003);
  let unionMinX = Infinity, unionMinY = Infinity, unionMaxX = -Infinity, unionMaxY = -Infinity;
  let found = false;

  for (let sy = 0; sy < smallH; sy++) {
    for (let sx = 0; sx < smallW; sx++) {
      const idx = sy * smallW + sx;
      if (visited[idx] || isClaimed(sx * scale, sy * scale)) { visited[idx] = 1; continue; }
      const stack: [number, number][] = [[sx, sy]];
      visited[idx] = 1;
      let minX = sx, maxX = sx, minY = sy, maxY = sy, count = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        count++;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as [number, number][]) {
          if (nx < 0 || nx >= smallW || ny < 0 || ny >= smallH) continue;
          const nidx = ny * smallW + nx;
          if (visited[nidx]) continue;
          visited[nidx] = 1;
          if (!isClaimed(nx * scale, ny * scale)) stack.push([nx, ny]);
        }
      }
      if (count >= minComponentArea) {
        found = true;
        if (minX < unionMinX) unionMinX = minX;
        if (minY < unionMinY) unionMinY = minY;
        if (maxX > unionMaxX) unionMaxX = maxX;
        if (maxY > unionMaxY) unionMaxY = maxY;
      }
    }
  }
  if (!found) return null;
  return {
    x: unionMinX * scale, y: unionMinY * scale,
    width: (unionMaxX - unionMinX + 1) * scale, height: (unionMaxY - unionMinY + 1) * scale,
  };
}

export async function reconstructDesign(imageUrl: string, onProgress?: (label: string) => void): Promise<ReconstructionResult> {
  onProgress?.('Loading image…');
  const img = await loadImage(imageUrl);
  const width = img.naturalWidth, height = img.naturalHeight;

  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = width; fullCanvas.height = height;
  const fullCtx = fullCanvas.getContext('2d')!;
  fullCtx.drawImage(img, 0, 0);
  const fullData = fullCtx.getImageData(0, 0, width, height);

  onProgress?.('Reading text (OCR)…');
  const rawTextLines = await detectText(fullCanvas);
  // Tesseract occasionally merges noisy/textured regions (a busy photo background,
  // in particular) into one wildly oversized "line" bounding box — a real single
  // line of design text is never a large fraction of the whole image's height, and
  // is essentially always wider than it is tall. Filtering these out avoids both a
  // garbled text element and a badly-mismatched masked patch on the background
  // (the mask fill is sampled from just outside the box, which is meaningless once
  // the box itself is wrong). The lower bound catches the opposite failure — a
  // sliver a handful of pixels tall read off photo texture, too thin to be any
  // real line of design text but still passing the word-shape check above.
  const minTextHeight = Math.max(10, height * 0.015);
  const textLines = rawTextLines.filter((l) => l.height >= minTextHeight && l.height < height * 0.15 && l.width >= l.height);

  let textElements: ReconstructedTextElement[] = textLines.map((line, i) => {
    const { background, backgroundRgb, ink } = sampleTextColors(fullData.data, width, height, line);
    const tight = tightenTextBox(fullData.data, width, height, line, backgroundRgb);
    return {
      kind: 'text',
      name: line.text.length > 20 ? `Text ${i + 1}` : line.text,
      x: tight.x, y: tight.y, width: tight.width, height: tight.height,
      content: line.text,
      fontSize: Math.max(8, Math.round(tight.height * 0.78)),
      color: ink,
      backgroundColor: background,
    };
  });

  onProgress?.('Finding shapes and color blocks…');
  const scale = Math.max(1, Math.ceil(Math.max(width, height) / 400));
  const smallW = Math.max(1, Math.round(width / scale));
  const smallH = Math.max(1, Math.round(height / scale));
  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = smallW; smallCanvas.height = smallH;
  const smallCtx = smallCanvas.getContext('2d')!;
  smallCtx.drawImage(img, 0, 0, smallW, smallH);
  const smallData = smallCtx.getImageData(0, 0, smallW, smallH);

  const isInsideAnyTextBox = (x: number, y: number) =>
    textElements.some((t) => x >= t.x - 2 && x <= t.x + t.width + 2 && y >= t.y - 2 && y <= t.y + t.height + 2);

  const shapeRegions = detectColorBlocks(smallData.data, smallW, smallH, scale, isInsideAnyTextBox);
  // Reject a region that covers almost the entire canvas — that's the page's own
  // plain backdrop, not a distinct "shape" worth pulling out as its own object.
  const pageArea = width * height;
  const shapeElements: ReconstructedShapeElement[] = shapeRegions
    .filter((r) => r.area < pageArea * 0.6)
    .map((r, i) => ({
      kind: 'shape', name: `Shape ${i + 1}`, x: r.x, y: r.y, width: r.width, height: r.height, fill: r.color,
    }));

  onProgress?.('Looking for a logo…');
  // Deliberately excludes only SHAPE regions here, not text boxes — an OCR "line"'s
  // bounding box can end up wider than the actual text (Tesseract sometimes misreads
  // a graphic right next to a headline as a stray leading character and merges it
  // into the same line), and if that inflated box happens to overlap a real corner
  // logo, excluding on text would make the logo invisible to this detector entirely.
  // The flood-fill/connected-component logic below is what actually isolates the
  // compact logo blob — it doesn't need the text exclusion to do that correctly.
  const isClaimedByShape = (x: number, y: number) =>
    shapeElements.some((s) => x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height);
  const cornerHits = (['left', 'right'] as const).flatMap((cx) =>
    (['top', 'bottom'] as const).map((cy) => detectCornerGraphic(smallData.data, smallW, smallH, scale, cx, cy, isClaimedByShape))
  ).filter((r): r is DetectedRegion => r !== null);

  // A wordmark/logo (small, stylized, often underlined serif text right next to a
  // seal) is exactly the kind of line OCR reads worst — it can come back as a
  // deceptively word-shaped mess ("UNIVcentutrjhguyERSITY =cen") that still
  // passes looksLikePlausibleText, because that check can only ask "does this
  // look word-shaped," not "is this genuinely readable." A text line whose box
  // mostly SITS ON TOP of a detected corner logo (as opposed to just brushing its
  // edge, handled by the trim pass below) is almost certainly that exact
  // misreading, not a real separate headline — dropped entirely rather than kept
  // as a garbled element.
  const overlapArea = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => {
    const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return ix * iy;
  };
  textElements = textElements.filter((t) => {
    const tArea = t.width * t.height;
    return !cornerHits.some((logo) => tArea > 0 && overlapArea(t, logo) > tArea * 0.4);
  });

  // A text line whose OCR bounding box leaked into a detected logo's area (the
  // exact scenario above) should be trimmed to start after the logo, rather than
  // rendering a text element that visually overlaps it.
  for (const t of textElements) {
    for (const logo of cornerHits) {
      const overlapsVertically = t.y < logo.y + logo.height && t.y + t.height > logo.y;
      if (overlapsVertically && t.x < logo.x + logo.width && t.x + t.width > logo.x) {
        const newX = logo.x + logo.width + 4;
        if (newX > t.x && newX < t.x + t.width) {
          t.width = t.x + t.width - newX;
          t.x = newX;
          // The logo overlapping this line is exactly what produces the stray
          // leading character Tesseract sometimes reads off the graphic itself
          // (e.g. "@ TOGETHER," for a line that only actually says "TOGETHER,").
          t.content = t.content.replace(/^\W{1,2}\s+/, '');
          if (t.name.length <= 20) t.name = t.content;
        }
      }
    }
  }
  const logoElements: ReconstructedLogoElement[] = cornerHits.map((r, i) => {
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = r.width; cropCanvas.height = r.height;
    const cropCtx = cropCanvas.getContext('2d')!;
    cropCtx.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    return {
      kind: 'logo', name: cornerHits.length > 1 ? `Logo ${i + 1}` : 'Logo',
      x: r.x, y: r.y, width: r.width, height: r.height,
      dataUrl: cropCanvas.toDataURL('image/png'),
    };
  });
  // Sampled once more here (rather than reusing detectCornerGraphic's internal seed)
  // for simplicity — the corner's very edge pixel, just outside each detected logo,
  // is a fine stand-in for "the plain color this logo sits on."
  const logoFillColors = cornerHits.map((r) => {
    const px = Math.max(0, Math.min(width - 1, Math.round(r.x) - 3));
    const py = Math.max(0, Math.min(height - 1, Math.round(r.y) - 3));
    const p = getPixel(fullData.data, width, px, py);
    return rgbToHex(p[0], p[1], p[2]);
  });

  onProgress?.('Isolating the photo region…');
  const isClaimed = (x: number, y: number) =>
    isInsideAnyTextBox(x, y) || isClaimedByShape(x, y) || logoElements.some((l) => x >= l.x && x <= l.x + l.width && y >= l.y && y <= l.y + l.height);
  const photoBounds = extractPhotoBounds(smallW, smallH, scale, isClaimed);

  const elements: ReconstructedElement[] = [...shapeElements, ...textElements, ...logoElements];
  if (photoBounds && photoBounds.width > 20 && photoBounds.height > 20) {
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = photoBounds.width; cropCanvas.height = photoBounds.height;
    const cropCtx = cropCanvas.getContext('2d')!;
    cropCtx.drawImage(img, photoBounds.x, photoBounds.y, photoBounds.width, photoBounds.height, 0, 0, photoBounds.width, photoBounds.height);
    elements.push({
      kind: 'photo', name: 'Photo',
      x: photoBounds.x, y: photoBounds.y, width: photoBounds.width, height: photoBounds.height,
      dataUrl: cropCanvas.toDataURL('image/png'),
    });
  }

  onProgress?.('Preparing background…');
  // Blank text and shape regions in a COPY of the original so the background layer
  // doesn't visually double up with the now-independent text/shape elements sitting
  // on top of it — filled with each region's own sampled local color, which is a
  // faithful match for solid blocks and a reasonable one for plain-color text
  // surroundings. The photo region is deliberately left untouched (see module doc).
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = width; bgCanvas.height = height;
  const bgCtx = bgCanvas.getContext('2d')!;
  bgCtx.drawImage(img, 0, 0);
  for (const t of textElements) {
    bgCtx.fillStyle = t.backgroundColor;
    bgCtx.fillRect(Math.floor(t.x) - 1, Math.floor(t.y) - 1, Math.ceil(t.width) + 2, Math.ceil(t.height) + 2);
  }
  for (const s of shapeElements) {
    bgCtx.fillStyle = s.fill;
    bgCtx.fillRect(Math.floor(s.x), Math.floor(s.y), Math.ceil(s.width), Math.ceil(s.height));
  }
  logoElements.forEach((l, i) => {
    bgCtx.fillStyle = logoFillColors[i];
    bgCtx.fillRect(Math.floor(l.x) - 1, Math.floor(l.y) - 1, Math.ceil(l.width) + 2, Math.ceil(l.height) + 2);
  });

  return {
    width, height,
    elements,
    backgroundDataUrl: bgCanvas.toDataURL('image/png'),
    textConfidenceNote: textElements.length === 0
      ? 'No text was confidently detected — the image may be low-resolution or stylized.'
      : `${textElements.length} text line(s), ${shapeElements.length} color block(s), ${logoElements.length} logo/graphic(s) detected.`,
  };
}

// --- Targeted single-region extraction (double-click a spot on the image) ---
// Unlike reconstructDesign (which decomposes the WHOLE image into every text/shape/
// logo/photo layer it can find at once), this looks for exactly ONE element — the
// one sitting at the clicked point — and leaves everything else as flat image
// pixels. Runs the same detectors, but only far enough to answer "what, if
// anything, is at (pointXPct, pointYPct)?" instead of exhaustively cataloguing the
// whole image, and only ever returns a single hit.
export type ExtractedRegion = ReconstructedTextElement | ReconstructedShapeElement | ReconstructedLogoElement;

export interface RegionExtractionResult {
  region: ExtractedRegion;
  backgroundDataUrl: string; // full-size original with just that one region blanked
  width: number;
  height: number;
}

// A miss carries a human-readable reason (what OCR actually saw near the click, if
// anything) so the caller can show it directly in its "nothing found" message —
// letting a screenshot of that message alone diagnose a real detection bug, instead
// of needing the browser console.
export type RegionExtractionOutcome =
  | { found: true; result: RegionExtractionResult }
  | { found: false; debug: string };

export async function extractRegionAtPoint(
  imageUrl: string,
  pointXPct: number, // 0-100, percent of the image's natural width
  pointYPct: number, // 0-100, percent of the image's natural height
  onProgress?: (label: string) => void
): Promise<RegionExtractionOutcome> {
  onProgress?.('Loading image…');
  const img = await loadImage(imageUrl);
  const width = img.naturalWidth, height = img.naturalHeight;
  const px = (pointXPct / 100) * width;
  const py = (pointYPct / 100) * height;

  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = width; fullCanvas.height = height;
  const fullCtx = fullCanvas.getContext('2d')!;
  fullCtx.drawImage(img, 0, 0);
  const fullData = fullCtx.getImageData(0, 0, width, height);

  const blankedCopy = (fill: (ctx: CanvasRenderingContext2D) => void): string => {
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = width; bgCanvas.height = height;
    const bgCtx = bgCanvas.getContext('2d')!;
    bgCtx.drawImage(img, 0, 0);
    fill(bgCtx);
    return bgCanvas.toDataURL('image/png');
  };

  const scale = Math.max(1, Math.ceil(Math.max(width, height) / 400));
  const smallW = Math.max(1, Math.round(width / scale));
  const smallH = Math.max(1, Math.round(height / scale));
  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = smallW; smallCanvas.height = smallH;
  const smallCtx = smallCanvas.getContext('2d')!;
  smallCtx.drawImage(img, 0, 0, smallW, smallH);
  const smallData = smallCtx.getImageData(0, 0, smallW, smallH);

  const cropLogo = (r: DetectedRegion) => {
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = r.width; cropCanvas.height = r.height;
    cropCanvas.getContext('2d')!.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    const fillPx = Math.max(0, Math.min(width - 1, Math.round(r.x) - 3));
    const fillPy = Math.max(0, Math.min(height - 1, Math.round(r.y) - 3));
    const p = getPixel(fullData.data, width, fillPx, fillPy);
    const fillColor = rgbToHex(p[0], p[1], p[2]);
    const backgroundDataUrl = blankedCopy((ctx) => {
      ctx.fillStyle = fillColor;
      ctx.fillRect(Math.floor(r.x) - 1, Math.floor(r.y) - 1, Math.ceil(r.width) + 2, Math.ceil(r.height) + 2);
    });
    return {
      found: true as const,
      result: {
        region: { kind: 'logo' as const, name: 'Logo', x: r.x, y: r.y, width: r.width, height: r.height, dataUrl: cropCanvas.toDataURL('image/png') },
        backgroundDataUrl, width, height,
      },
    };
  };

  // A university/brand wordmark (small, stylized, often underlined serif text right
  // next to a seal) is exactly the kind of line line-level OCR reads worst — it can
  // come back as a deceptively word-shaped mess ("UNIVcentutrjhguyERSITY =cen") that
  // still passes the lenient plausibility check below, because that check can only
  // ask "does this look word-shaped," not "is this actually readable." A click that
  // lands in a corner (where a logo naturally sits) tries logo detection FIRST,
  // before OCR gets a chance to misread that same wordmark as a garbled text line.
  const cornerZoneFrac = 0.4;
  const nearLeft0 = px < width * cornerZoneFrac, nearRight0 = px > width * (1 - cornerZoneFrac);
  const nearTop0 = py < height * cornerZoneFrac, nearBottom0 = py > height * (1 - cornerZoneFrac);
  if (nearLeft0 || nearRight0) {
    const cornerXs: ('left' | 'right')[] = nearLeft0 ? ['left'] : ['right'];
    const cornerYs: ('top' | 'bottom')[] = nearTop0 ? ['top'] : nearBottom0 ? ['bottom'] : ['top', 'bottom'];
    for (const cx of cornerXs) {
      for (const cy of cornerYs) {
        const r = detectCornerGraphic(smallData.data, smallW, smallH, scale, cx, cy, () => false);
        if (r && px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height) {
          onProgress?.('Extracting logo…');
          return cropLogo(r);
        }
      }
    }
  }

  onProgress?.('Reading text (OCR)…');
  // OCR only a horizontal band around the click, not the whole image — Tesseract's
  // recognition time scales with pixel area, and a click only ever needs whatever
  // line sits at this specific point. Full width (a design headline can span it
  // entirely) but a limited height band, generous enough that a click a bit off
  // from the line's vertical center still lands inside the scanned area.
  const bandHeight = Math.min(height, Math.max(220, height * 0.3));
  const bandY = Math.max(0, Math.min(height - bandHeight, py - bandHeight / 2));
  const bandCanvas = document.createElement('canvas');
  bandCanvas.width = width; bandCanvas.height = Math.round(bandHeight);
  bandCanvas.getContext('2d')!.drawImage(img, 0, bandY, width, bandHeight, 0, 0, width, bandHeight);
  // Relaxed confidence + a lighter plausibility bar (see detectText's own comment)
  // — the click itself is most of the filter here, but a completely unfiltered
  // OCR read can still turn nearby photo-texture noise into a garbled element.
  const rawTextLines = (await detectText(bandCanvas, 50, 'lenient')).map((l) => ({ ...l, y: l.y + bandY }));
  const minTextHeight = Math.max(6, height * 0.008);
  const textLines = rawTextLines.filter((l) => l.height >= minTextHeight && l.height < height * 0.2);
  // Generous padding (relative to the line's own size, not a fixed pixel count) —
  // a click a little above/below the exact glyph pixels (e.g. nearer the line's
  // padding than its ink) should still count as "clicking on that line."
  let hitText = textLines.find((l) => {
    const padX = Math.max(6, l.width * 0.15), padY = Math.max(6, l.height * 0.6);
    return px >= l.x - padX && px <= l.x + l.width + padX && py >= l.y - padY && py <= l.y + l.height + padY;
  });
  // At a zoomed-out view, a screen-pixel-accurate double-click can still land many
  // IMAGE pixels away from any line's padded box — "click directly on the text" is
  // an unreasonable ask at 30-40% zoom. Falls back to whichever line is nearest the
  // click, with NO further distance cap — textLines here already only contains
  // lines found within the narrow vertical band scanned around the click (see
  // bandHeight above), so anything in it is already "nearby" by construction; an
  // extra absolute-distance rejection on top of that band limit was just producing
  // "found it but rejected it" misses on exactly the wide/short lines (like a full
  // headline) this fallback exists to catch.
  if (!hitText && textLines.length > 0) {
    const distanceTo = (l: DetectedTextLine) => {
      const dx = Math.max(0, l.x - px, px - (l.x + l.width));
      const dy = Math.max(0, l.y - py, py - (l.y + l.height));
      return Math.hypot(dx, dy);
    };
    hitText = [...textLines].sort((a, b) => distanceTo(a) - distanceTo(b))[0];
  }
  console.log('[extractRegionAtPoint] click at', { pointXPct, pointYPct, px, py }, 'found', textLines.length, 'text line(s):',
    textLines.map((l) => ({ text: l.text, x: l.x, y: l.y, w: l.width, h: l.height, conf: l.confidence })), 'hit:', hitText?.text ?? null);
  if (hitText) {
    const { background, backgroundRgb, ink } = sampleTextColors(fullData.data, width, height, hitText);
    // Tesseract's reported bbox is frequently bigger than the actual glyphs on
    // BOTH axes (see tightenTextBox) — an untightened HEIGHT was the real cause of
    // a blank patch spanning way more vertical space than one line of text, since
    // hitText.height (not just width) directly sizes the mask painted onto the
    // background below.
    const tight = tightenTextBox(fullData.data, width, height, hitText, backgroundRgb);
    // Blanked with the SAME generous padding used for hit-testing above (not the
    // tight +2px reconstructDesign uses for its already-strict lines) — a residual
    // sliver of un-blanked glyph pixels just outside a tight mask is exactly what
    // let a second nearby double-click re-discover the same text and create a
    // duplicate element.
    const padX = Math.max(6, tight.width * 0.15), padY = Math.max(6, tight.height * 0.6);
    const backgroundDataUrl = blankedCopy((ctx) => {
      ctx.fillStyle = background;
      ctx.fillRect(Math.floor(tight.x - padX), Math.floor(tight.y - padY), Math.ceil(tight.width + padX * 2), Math.ceil(tight.height + padY * 2));
    });
    return {
      found: true,
      result: {
        region: {
          kind: 'text', name: hitText.text.length > 20 ? 'Text' : hitText.text,
          x: tight.x, y: tight.y, width: tight.width, height: tight.height,
          content: hitText.text, fontSize: Math.max(8, Math.round(tight.height * 0.78)),
          color: ink, backgroundColor: background,
        },
        backgroundDataUrl, width, height,
      },
    };
  }

  onProgress?.('Finding shapes…');
  const isInsideAnyTextBox = (x: number, y: number) =>
    textLines.some((t) => x >= t.x - 2 && x <= t.x + t.width + 2 && y >= t.y - 2 && y <= t.y + t.height + 2);
  const shapeRegions = detectColorBlocks(smallData.data, smallW, smallH, scale, isInsideAnyTextBox);
  const pageArea = width * height;
  const hitShape = shapeRegions.find((r) => r.area < pageArea * 0.6 && px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height);
  if (hitShape) {
    const backgroundDataUrl = blankedCopy((ctx) => {
      ctx.fillStyle = hitShape.color;
      ctx.fillRect(Math.floor(hitShape.x), Math.floor(hitShape.y), Math.ceil(hitShape.width), Math.ceil(hitShape.height));
    });
    return {
      found: true,
      result: {
        region: { kind: 'shape', name: 'Shape', x: hitShape.x, y: hitShape.y, width: hitShape.width, height: hitShape.height, fill: hitShape.color },
        backgroundDataUrl, width, height,
      },
    };
  }

  onProgress?.('Looking for a logo…');
  // Second attempt, now WITH shapes excluded — the corner-first pass above ran
  // before shapeRegions existed, so a logo blob touching a nearby color block could
  // have been merged in and rejected there as "not compact enough." Only worth
  // retrying in the same corner zone the first pass already checked.
  const isInsideAnyShape = (x: number, y: number) => shapeRegions.some((s) => x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height);
  if (nearLeft0 || nearRight0) {
    const cornerXs: ('left' | 'right')[] = nearLeft0 ? ['left'] : ['right'];
    const cornerYs: ('top' | 'bottom')[] = nearTop0 ? ['top'] : nearBottom0 ? ['bottom'] : ['top', 'bottom'];
    for (const cx of cornerXs) {
      for (const cy of cornerYs) {
        const r = detectCornerGraphic(smallData.data, smallW, smallH, scale, cx, cy, isInsideAnyShape);
        if (r && px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height) return cropLogo(r);
      }
    }
  }

  const debug = textLines.length === 0
    ? 'OCR found no readable text in that area of the image.'
    : `OCR found ${textLines.length} line(s) nearby but the click didn't land on any of them: ${textLines.slice(0, 3).map((l) => `"${l.text}"`).join(', ')}`;
  return { found: false, debug };
}
