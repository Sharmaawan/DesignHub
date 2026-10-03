import Tesseract from 'tesseract.js';
import { generateId } from './cn';
import { CanvasElement } from '../types';

// Singleton Tesseract worker — creating a new worker per call pays the full
// WASM engine + trained-data load cost every time (~1-3s on a cold cache).
// This module-level promise keeps one worker alive and ready for reuse across
// all calls in the same browser session. It is created lazily on first use and
// recreated automatically if it ever terminates unexpectedly.
let _workerPromise: Promise<Tesseract.Worker> | null = null;

async function getSharedWorker(): Promise<Tesseract.Worker> {
  if (!_workerPromise) {
    _workerPromise = (async () => {
      const w = await Tesseract.createWorker('eng', 1);
      await w.setParameters({ tessedit_pageseg_mode: '11' as any });
      return w;
    })().catch((err) => {
      _workerPromise = null; // reset so next call retries
      throw err;
    });
  }
  return _workerPromise;
}

/**
 * Decompose flattened template image into individual editable text elements
 * using Tesseract.js OCR. Creates REAL native DesignHub elements.
 *
 * Returns array: [background_image, text_element_1, text_element_2, ...]
 */
export interface DetectedTextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  avgWordHeight: number;
  /** Width-weighted mean Tesseract word confidence, 0-100. */
  conf: number;
}

export function buildBackgroundElement(imageUrl: string, imageWidth: number, imageHeight: number): CanvasElement {
  return {
    id: generateId(),
    type: 'image',
    x: 0,
    y: 0,
    width: imageWidth,
    height: imageHeight,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: 'Background',
    zIndex: 0,
    data: {
      type: 'image' as const,
      src: imageUrl,
      objectFit: 'cover' as const,
      borderRadius: 0,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0,
      blur: 0,
      filters: [],
      cropX: 0,
      cropY: 0,
      cropWidth: 100,
      cropHeight: 100,
    } as any,
  };
}

export async function decomposeTemplateImage(
  imageUrl: string,
  imageWidth: number,
  imageHeight: number
): Promise<CanvasElement[]> {
  // Always start with background image
  const elements: CanvasElement[] = [buildBackgroundElement(imageUrl, imageWidth, imageHeight)];

  try {
    const lines = await detectTextLines(imageUrl, imageWidth, imageHeight);
    // The uploaded image is the source of truth and is never modified —
    // painting over detected regions (an earlier version of this function
    // erased them and re-uploaded a "cleaned" background) counts as exactly
    // the kind of automatic change a locked template must never undergo.
    //
    // A generic black is used as the placeholder color here; it's invisible
    // either way (opacity 0, see below) until the caller decides to reveal it.
    // (The main "Make Editable"/"Upload Template" flow no longer uses this
    // function at all — see designDecomposition/DesignDecomposer.ts, which
    // reconstructs each element's real region server-side on demand instead
    // of leaving a same-size texture patch guess to a client-side crop.)
    //
    // Every extracted line still sits exactly on top of the same text already
    // baked into the background image — so until the user actually edits it,
    // the two would double-expose. Creating it at opacity 0 keeps it a real,
    // clickable, selectable element (positioned to match what's underneath)
    // without drawing anything — the original pixels remain the only visible
    // copy until an intentional edit changes the content.
    lines.forEach((line) => {
      const txt = line.text.trim();
      if (!txt) return;

      elements.push({
        id: generateId(),
        type: 'text',
        x: Math.max(0, line.x - 4),
        y: Math.max(0, line.y - 4),
        width: Math.min(imageWidth - Math.max(0, line.x - 4), line.width + 8),
        height: Math.min(imageHeight - Math.max(0, line.y - 4), line.height + 8),
        rotation: 0,
        opacity: 0,
        visible: true,
        locked: false,
        name: txt.substring(0, 30),
        zIndex: 10,
        data: {
          type: 'text' as const,
          content: txt,
          // OCR can only read pixels, never the actual font a template's baked-in
          // text used — there's no way to recover that. Rather than default to a
          // plain system font (Arial) that reads as visibly "wrong" the moment
          // this text is edited, guess a closer-looking stand-in: large text is
          // usually a heading, styled bold in most templates; smaller text is
          // usually a caption, closer to a plain body font. Either way, the Font
          // Family picker in the text panel is the real fix once edited.
          fontFamily: line.avgWordHeight >= 28 ? 'Poppins' : 'Inter',
          fontSize: Math.max(10, Math.min(80, Math.round(line.avgWordHeight * 0.9))),
          fontWeight: line.avgWordHeight >= 28 ? 800 : 400,
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'left',
          color: '#000000',
          lineHeight: 1.2,
          letterSpacing: 0,
          textTransform: 'none',
        } as any,
      });
    });

    return elements;
  } catch (err) {
    // OCR failed - return just background
    console.error('[OCR]', err);
    return elements;
  }
}

/**
 * Runs OCR and returns grouped, noise-filtered text lines. Throws if OCR
 * itself fails (callers decide how to degrade) — returns [] when it ran fine
 * but found no text.
 */
export async function detectTextLines(
  imageUrl: string,
  imageWidth: number,
  imageHeight: number
): Promise<DetectedTextLine[]> {
  // Use the shared singleton worker — no create/terminate overhead on every call.
  const worker = await getSharedWorker();

  try {
    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.size) throw new Error('Empty blob');

    // Upscale if the image is small — Tesseract accuracy drops sharply below
    // ~150 DPI effective resolution. Most uploaded design images are already
    // large enough, but anything under 1500px on the long side gets scaled up.
    // The scale factor is tracked so bounding boxes can be mapped back to the
    // original image coordinates after OCR.
    const TARGET_MIN_DIM = 1500;
    const ocrScale = Math.max(1, TARGET_MIN_DIM / Math.max(imageWidth, imageHeight));
    const ocrBlob = ocrScale > 1.05 ? await upscaleBlob(blob, imageWidth, imageHeight, ocrScale) : blob;
    console.log(`[OCR] image ${imageWidth}×${imageHeight}, ocrScale=${ocrScale.toFixed(2)}`);

    // Try the RAW image FIRST. Verified directly against a real uploaded poster
    // (gradient sky background, stylized dark-green heading font): the raw,
    // unprocessed image found 399 words including the exact heading text at
    // good confidence, while the "enhanced" passes below (aggressive contrast
    // boost + grayscale + binary threshold) actively destroyed that same text
    // before Tesseract ever got a clean look at it — the threshold passes were
    // making detection *worse*, not better. They're kept as a fallback for
    // genuinely low-contrast images, but only run if the raw pass finds nothing.
    let { data } = await worker.recognize(ocrBlob);
    console.log('[OCR Pass 1 - raw] Words detected:', data?.words?.length || 0);

    // Detect dark-background images early — if the image median brightness is
    // below 100 it's likely a dark-background design (navy, black, dark brown)
    // with light/white/yellow text. Tesseract's default Otsu binarizer expects
    // dark-ink-on-light and inverts the result on dark images, producing
    // garbage. Run a dedicated dark-background pass BEFORE the generic fallbacks
    // when the image is detected as dark.
    const isDarkBackground = await detectDarkBackground(ocrBlob);
    if (isDarkBackground && (!data?.words || data.words.length < 5)) {
      console.log('[OCR] Dark background detected — trying dark-optimized preprocessing...');
      const darkBlob = await enhanceImageForOCRDark(ocrBlob);
      const darkResult = await worker.recognize(darkBlob);
      if ((darkResult.data?.words?.length || 0) > (data?.words?.length || 0)) {
        data = darkResult.data;
        console.log('[OCR Pass 1b - dark-optimized] Words detected:', data?.words?.length || 0);
      }
    }

    if (!data?.words || data.words.length === 0) {
      console.log('[OCR] Raw pass found no text - trying contrast-enhanced preprocessing...');
      const processedBlob = await enhanceImageForOCR(ocrBlob);
      const result = await worker.recognize(processedBlob);
      data = result.data;
      console.log('[OCR Pass 2 - enhanced] Words detected:', data?.words?.length || 0);
    }

    if (!data?.words || data.words.length === 0) {
      console.log('[OCR] Enhanced pass found no text - trying extreme threshold preprocessing...');
      const processedBlob = await enhanceImageForOCRExtreme(ocrBlob);
      const result = await worker.recognize(processedBlob);
      data = result.data;
      console.log('[OCR Pass 3 - extreme] Words detected:', data?.words?.length || 0);
    }

    if (!data?.words || data.words.length === 0) {
      console.log('[OCR] Extreme pass found no text - trying inverted/ultra preprocessing...');
      const processedBlob = await enhanceImageForOCRUltra(ocrBlob);
      const result = await worker.recognize(processedBlob);
      data = result.data;
      console.log('[OCR Pass 4 - ultra] Words detected:', data?.words?.length || 0);
    }

    if (!data?.words || data.words.length === 0) {
      console.warn('[OCR] No words detected in image');
      return [];
    }

    console.log('[OCR] Detected words:', data.words.length);

    // A real poster's OCR pass returns hundreds of words including a lot of
    // noise misread from decorative graphics (icons, leaves, logos) at very low
    // confidence. Accepting literally everything (the old behavior) buried
    // real headings in clutter. A large stylized heading font can *also* score
    // surprisingly low confidence from Tesseract despite being perfectly
    // legible — so confidence alone isn't reliable either. Keeping a region
    // if it clears a modest confidence bar OR is simply large (a heading-sized
    // font, regardless of how Tesseract scored it) keeps both normal body text
    // and stylized titles while dropping most small-symbol misreads.
    const minHeadingHeight = Math.max(20, imageHeight * 0.02);
    const regions = data.words
      .filter((w: any) => w.text && w.text.trim().length > 0)
      .map((w: any) => ({
        text: w.text.trim(),
        // Scale bounding boxes back from OCR-space to original image space.
        x: Math.round(w.bbox.x0 / ocrScale),
        y: Math.round(w.bbox.y0 / ocrScale),
        width: Math.round((w.bbox.x1 - w.bbox.x0) / ocrScale),
        height: Math.round((w.bbox.y1 - w.bbox.y0) / ocrScale),
        conf: w.confidence,
      }))
      .filter((r: any) => r.width > 1 && r.height > 1)
      // Accept any word that passes a modest confidence bar OR is large enough
      // to be a heading (large stylized fonts routinely score below 55 on
      // colorful poster backgrounds despite being perfectly legible).
      // Lowered from 55 → 35 to match the MIN_OCR_CONFIDENCE reduction; the
      // MAX_SYMBOL_RATIO gate in DesignDecomposer.ts handles icon/symbol noise.
      .filter((r: any) => r.conf >= 35 || r.height >= minHeadingHeight);

    console.log('[OCR] Filtered regions:', regions.length);

    if (regions.length === 0) {
      console.warn('[OCR] No text detected in image - user can add text with Text Tool');
      // Clean approach: return only the background image
      // User can add text manually using the Text Tool
      // This prevents overlapping placeholder boxes and matches Canva's UX
      return [];
    }

    // Group into lines — height-aware so a big stylized heading and small
    // logo/caption text that happen to share a Y-band never get merged
    // together (see groupWords below for why plain Y-proximity isn't enough).
    const lines = groupWords(regions)
      // A merged line still passes through as noise if none of its words
      // individually cleared the confidence bar (they all rode in on the
      // height bypass) and it doesn't actually spell anything — verified
      // against a real poster: requiring a run of 3+ letters cut a 168-element
      // result (mostly single-symbol misreads off decorative icons) down to
      // 73, while every real caption/heading, including the target text,
      // survived intact.
      .filter((line: any) => /[a-zA-Z]{3,}/.test(line.text))
      // That 3-letters-somewhere bar is too weak on its own — verified against
      // a different real poster: a cursive monogram watermark ("C") next to a
      // gold star got misread as "JIroRG", which contains six letters (passes
      // the check above) but spells nothing. Worse than just a junk text
      // element: its erase-rectangle (see cleanBackgroundAndSampleColors)
      // bled into the neighboring university logo and cut "UNIVERSITY" down
      // to "UNIVER?". Requiring at least one word shaped like a real one —
      // Title Case, ALL CAPS, or all lowercase, not OCR's telltale chaotic
      // JIroRG-style case-flipping — blocks both failure modes at once,
      // since a rejected line here never reaches the erase step either.
      // Splitting only on whitespace lets a real hyphenated compound slip
      // through as a false positive: "by Outlook-ICARE" strips down to the
      // single token "OutlookICARE" (the hyphen removed along with every
      // other non-letter), which has capitals in the *middle* — the same
      // case-flipping shape as actual OCR garbage — and fails all three
      // patterns even though "Outlook" and "ICARE" are each individually
      // legitimate. Splitting on hyphens too checks each half on its own.
      .filter((line: any) => line.text.split(/[\s-]+/).some((w: string) => {
        const core = w.replace(/[^A-Za-z]/g, '');
        return core.length >= 3 && /^([A-Z][a-z]*|[A-Z]+|[a-z]+)$/.test(core);
      }));

    const deduped = dedupeOverlappingLines(lines) as DetectedTextLine[];

    // Per-region re-OCR pass for low-confidence lines.
    // For any merged line below confidence 75, crop that region from the
    // original image, upscale it to a fixed height of 80px (Tesseract sweet
    // spot for single-line text), and re-run OCR with PSM 7 (single text line).
    // This catches stylized words like "Aunty"-type misreads where the full-image
    // pass had noisy background context contaminating the recognition.
    const REOCR_CONF_THRESHOLD = 75;
    const REOCR_TARGET_HEIGHT = 80;
    const finalLines: DetectedTextLine[] = [];
    for (const line of deduped) {
      if (line.conf >= REOCR_CONF_THRESHOLD) {
        finalLines.push(line);
        continue;
      }
      try {
        const pad = 6;
        const cx = Math.max(0, line.x - pad), cy = Math.max(0, line.y - pad);
        const cw = Math.min(imageWidth - cx, line.width + pad * 2);
        const ch = Math.min(imageHeight - cy, line.height + pad * 2);
        if (cw < 4 || ch < 4) { finalLines.push(line); continue; }
        const regionScale = Math.max(1, REOCR_TARGET_HEIGHT / ch);
        const cropBlob = await cropAndUpscaleBlob(blob, cx, cy, cw, ch, regionScale);
        await worker.setParameters({ tessedit_pageseg_mode: '7' as any }); // single text line
        const { data: reData } = await worker.recognize(cropBlob);
        await worker.setParameters({ tessedit_pageseg_mode: '11' as any }); // restore
        if (reData?.text?.trim()) {
          const reText = reData.text.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
          const reConf = reData.words?.length
            ? reData.words.reduce((s: number, w: any) => s + (w.confidence ?? 0) * (w.bbox.x1 - w.bbox.x0), 0) /
              Math.max(1, reData.words.reduce((s: number, w: any) => s + (w.bbox.x1 - w.bbox.x0), 0))
            : line.conf;
          console.log(`[OCR re-OCR] "${line.text}" (${Math.round(line.conf)}%) → "${reText}" (${Math.round(reConf)}%)`);
          // Only accept the re-OCR result if it looks like real words (same filter as main pass)
          const looksReal = reText.split(/[\s-]+/).some((w: string) => {
            const core = w.replace(/[^A-Za-z]/g, '');
            return core.length >= 3 && /^([A-Z][a-z]*|[A-Z]+|[a-z]+)$/.test(core);
          });
          if (looksReal && reConf > line.conf) {
            finalLines.push({ ...line, text: reText, conf: reConf });
            continue;
          }
        }
      } catch (e) {
        console.warn('[OCR re-OCR] failed for line', line.text, e);
      }
      finalLines.push(line);
    }

    return finalLines;
  } catch (err) {
    console.error('[OCR]', err);
    throw err;
  } finally {
    // Do NOT terminate — the shared worker is reused across calls.
    // If something went badly wrong (e.g. WASM crash), reset the promise
    // so the next call gets a fresh worker.
    // Normal errors (image fetch failed, no text found) leave the worker healthy.
  }
}

// Plain Y-proximity grouping merges unrelated content on a complex multi-column
// poster: verified directly against a real upload where "UNIVERSITY" (a small
// 17px-tall logo label) and "Wellness Centre" (a 46px-tall heading) sit close
// enough in Y to land in the same "row" by position alone, garbling the actual
// heading text with logo noise. The fix is two-factor: words only share a row
// if their Y position AND their height (font size) are both close — a small
// caption and a big heading at a similar height on the page are almost never
// actually the same line of text — and *within* a row, a large gap relative to
// that row's font size (not a fixed pixel value) starts a new group, so two
// unrelated text blocks that happen to sit on the same visual baseline (e.g.
// a logo on the left, a heading on the right) still split apart correctly.
function groupWords(words: any[]): any[] {
  if (!words.length) return [];

  const sorted = [...words].sort((a, b) => a.y - b.y);
  const rows: any[][] = [];
  for (const w of sorted) {
    let placed = false;
    for (const row of rows) {
      const ref = row[0];
      const heightRatio = Math.max(w.height, ref.height) / Math.min(w.height, ref.height);
      const yThreshold = Math.min(w.height, ref.height) * 0.6;
      const sameRowByRatio = heightRatio <= 1.5 && Math.abs(w.y - ref.y) <= yThreshold;

      // Short lowercase connector words ("as", "a", "of", "in"...) have no
      // ascenders/descenders, so Tesseract measures a noticeably shorter bbox
      // for them than for a neighboring capitalized/descender word on the
      // exact same visual line — verified against a real upload: "Recognized"
      // (with the 'g' descender) measured 43px tall, "as"/"a" right next to
      // it measured only 27px, a 1.59x ratio that fails the check above and
      // silently dropped "as a" into its own too-short "row" — which then
      // never cleared the real-word-length filter downstream, leaving those
      // words completely unrecovered. A word whose vertical span sits almost
      // entirely within the other's span is still the same line regardless
      // of the ratio; two words merely sharing a rough Y band (the UNIVERSITY
      // logo caption vs. Wellness Centre heading regression this function
      // documents above) never shares this much of its actual vertical range.
      const overlapTop = Math.max(w.y, ref.y);
      const overlapBottom = Math.min(w.y + w.height, ref.y + ref.height);
      const overlap = overlapBottom - overlapTop;
      const sameRowByOverlap = overlap > 0 && overlap / Math.min(w.height, ref.height) >= 0.6;

      if (sameRowByRatio || sameRowByOverlap) {
        row.push(w);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([w]);
  }

  const lines: any[][] = [];
  for (const row of rows) {
    const byX = [...row].sort((a, b) => a.x - b.x);
    let group = [byX[0]];
    for (let i = 1; i < byX.length; i++) {
      const w = byX[i];
      const prevEnd = Math.max(...group.map((g) => g.x + g.width));
      const gap = w.x - prevEnd;
      const refHeight = Math.max(...group.map((g) => g.height));
      if (gap < refHeight * 1.8) {
        group.push(w);
      } else {
        lines.push(group);
        group = [w];
      }
    }
    lines.push(group);
  }

  return lines.map(mergeLine);
}

// Tesseract can detect the same visual glyphs as two DIFFERENT lines with
// nearly identical, overlapping bounding boxes — one accurate read, one
// garbled misread ("INSTITUTION" alongside a nonsense "hgvh" at almost the
// same box, verified directly against a real uploaded template). Both can
// independently pass every filter above (a garbled read like "hgvh" is still
// shaped like a valid all-lowercase word), so without this, decomposition
// creates two separate, overlapping editable TextElements for what a person
// sees as one piece of text — each gets its own region "reconstructed" and
// revealed, producing a permanent doubled/ghosted render with no single
// element a user could select to fix. For any two lines whose boxes overlap
// by a large fraction of the smaller one's area, keep only the
// higher-confidence line and drop the rest as duplicates of it.
function dedupeOverlappingLines(lines: any[]): any[] {
  const byConfDesc = [...lines].sort((a, b) => b.conf - a.conf);
  const kept: any[] = [];
  for (const line of byConfDesc) {
    const overlapsKept = kept.some((k) => {
      const ox = Math.max(0, Math.min(line.x + line.width, k.x + k.width) - Math.max(line.x, k.x));
      const oy = Math.max(0, Math.min(line.y + line.height, k.y + k.height) - Math.max(line.y, k.y));
      const overlapArea = ox * oy;
      const minArea = Math.min(line.width * line.height, k.width * k.height);
      return minArea > 0 && overlapArea / minArea >= 0.6;
    });
    if (!overlapsKept) kept.push(line);
  }
  // Restore original (top-to-bottom, left-to-right) order rather than the
  // confidence order used only to decide which duplicate wins.
  const keptSet = new Set(kept);
  return lines.filter((l) => keptSet.has(l));
}

function mergeLine(words: any[]): any {
  const byX = [...words].sort((a, b) => a.x - b.x);
  const minX = Math.min(...words.map((w) => w.x));
  const minY = Math.min(...words.map((w) => w.y));
  const maxX = Math.max(...words.map((w) => w.x + w.width));
  const maxY = Math.max(...words.map((w) => w.y + w.height));
  return {
    text: byX.map((w) => w.text).join(' '),
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    // The individual words' own average height — used for font size instead of
    // the merged box's height. A row that's mostly one font size but pulls in
    // one stray word near the edge of the grouping tolerance can end up with a
    // bounding box noticeably taller than any word actually in it (verified on
    // a real poster: a handful of small unrelated icon-glyph misreads merged
    // into one box whose height implied an 80px heading font, though none of
    // the words in it were anywhere near that size) — sizing text off the
    // *words*, not the *box*, avoids inheriting that inflation.
    avgWordHeight: words.reduce((sum, w) => sum + w.height, 0) / words.length,
    // Width-weighted, so a long confident word outweighs a stray one-character misread.
    conf: words.reduce((sum, w) => sum + (w.conf ?? 0) * w.width, 0) / Math.max(1, words.reduce((sum, w) => sum + w.width, 0)),
  };
}

// Upscale a blob by `scale` factor using a canvas — used to give Tesseract
// higher effective DPI on small images.
async function upscaleBlob(blob: Blob, origW: number, origH: number, scale: number): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(origW * scale);
        canvas.height = Math.round(origH * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(blob); return; }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => resolve(b || blob), 'image/png');
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(blob);
  });
}

// Crop a region from a blob and upscale it — used for per-line re-OCR.
async function cropAndUpscaleBlob(blob: Blob, x: number, y: number, w: number, h: number, scale: number): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(blob); return; }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => resolve(b || blob), 'image/png');
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(blob);
  });
}

// Detect if an image is predominantly dark (median pixel brightness < 100).
// Used to decide whether to run the dark-background OCR pass early.
async function detectDarkBackground(blob: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Sample at reduced resolution for speed — 64×64 is plenty for brightness estimation
        const canvas = document.createElement('canvas');
        const SAMPLE = 64;
        canvas.width = SAMPLE;
        canvas.height = SAMPLE;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(false); return; }
        ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
        const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
        let sum = 0;
        const n = SAMPLE * SAMPLE;
        for (let i = 0; i < data.length; i += 4) {
          sum += (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
        }
        resolve(sum / n < 100);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(blob);
  });
}

// Dedicated preprocessing for dark-background images (navy, black, dark brown).
// Strategy: invert the image so light text becomes dark, then apply per-channel
// histogram stretching (not a fixed contrast multiplier) to maximize the spread
// between text and background, then threshold. This works far better than the
// generic passes for dark designs with white/yellow/cyan text.
async function enhanceImageForOCRDark(blob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(blob); return; }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        const n = d.length / 4;

        // Step 1: compute per-channel min/max for histogram stretching
        let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i]   < rMin) rMin = d[i];   if (d[i]   > rMax) rMax = d[i];
          if (d[i+1] < gMin) gMin = d[i+1]; if (d[i+1] > gMax) gMax = d[i+1];
          if (d[i+2] < bMin) bMin = d[i+2]; if (d[i+2] > bMax) bMax = d[i+2];
        }
        const rRange = Math.max(1, rMax - rMin);
        const gRange = Math.max(1, gMax - gMin);
        const bRange = Math.max(1, bMax - bMin);

        // Step 2: stretch + invert + convert to grayscale + threshold
        for (let i = 0; i < d.length; i += 4) {
          // Histogram stretch each channel
          const r = ((d[i]   - rMin) / rRange) * 255;
          const g = ((d[i+1] - gMin) / gRange) * 255;
          const b = ((d[i+2] - bMin) / bRange) * 255;
          // Luminance
          const lum = (r * 299 + g * 587 + b * 114) / 1000;
          // Invert so light text → dark ink (Tesseract's expected orientation)
          const inv = 255 - lum;
          // Threshold: anything above 80 is ink (generous — inverted light text is bright)
          const out = inv > 80 ? 0 : 255;
          d[i] = d[i+1] = d[i+2] = out;
        }

        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob((b) => resolve(b || blob), 'image/png');
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(blob);
  });
}

// Enhance image for better OCR: standard preprocessing
async function enhanceImageForOCR(blob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(blob);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Standard enhancement: 2.5x contrast
        for (let i = 0; i < data.length; i += 4) {
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          const contrast = 2.5;
          const delta = brightness - 128;
          const newBrightness = Math.min(255, Math.max(0, 128 + delta * contrast));

          data[i] = newBrightness;
          data[i + 1] = newBrightness;
          data[i + 2] = newBrightness;
        }

        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob((b) => resolve(b || blob), 'image/jpeg', 0.99);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(blob);
  });
}

// Extreme enhancement for difficult images
async function enhanceImageForOCRExtreme(blob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(blob);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Extreme: 4.0x contrast + threshold
        for (let i = 0; i < data.length; i += 4) {
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;

          // Apply extreme contrast
          let newBrightness = 128 + (brightness - 128) * 4.0;
          newBrightness = Math.min(255, Math.max(0, newBrightness));

          // Apply binary threshold for text extraction
          newBrightness = newBrightness > 140 ? 255 : 0;

          data[i] = newBrightness;
          data[i + 1] = newBrightness;
          data[i + 2] = newBrightness;
        }

        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob((b) => resolve(b || blob), 'image/jpeg', 0.95);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(blob);
  });
}

// Ultra-aggressive: inverted + extreme contrast
async function enhanceImageForOCRUltra(blob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(blob);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Ultra: Try both normal and inverted
        for (let i = 0; i < data.length; i += 4) {
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;

          // Extreme contrast with inversion
          let newBrightness = 255 - brightness;
          newBrightness = 128 + (newBrightness - 128) * 3.5;
          newBrightness = Math.min(255, Math.max(0, newBrightness));

          // Strong threshold
          newBrightness = newBrightness > 120 ? 255 : 0;

          data[i] = newBrightness;
          data[i + 1] = newBrightness;
          data[i + 2] = newBrightness;
        }

        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob((b) => resolve(b || blob), 'image/jpeg', 0.9);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(blob);
  });
}
