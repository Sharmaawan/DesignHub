import Tesseract from 'tesseract.js';
import { generateId } from './cn';
import { CanvasElement } from '../types';

/**
 * Decompose flattened template image into individual editable text elements
 * using Tesseract.js OCR. Creates REAL native DesignHub elements.
 *
 * Returns array: [background_image, text_element_1, text_element_2, ...]
 */
export async function decomposeTemplateImage(
  imageUrl: string,
  imageWidth: number,
  imageHeight: number
): Promise<CanvasElement[]> {
  // Always start with background image
  const background: CanvasElement = {
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

  const elements: CanvasElement[] = [background];
  let worker: Tesseract.Worker | null = null;

  try {
    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.size) throw new Error('Empty blob');

    // Create worker
    worker = await Tesseract.createWorker('eng', 1);

    // Try the RAW image FIRST. Verified directly against a real uploaded poster
    // (gradient sky background, stylized dark-green heading font): the raw,
    // unprocessed image found 399 words including the exact heading text at
    // good confidence, while the "enhanced" passes below (aggressive contrast
    // boost + grayscale + binary threshold) actively destroyed that same text
    // before Tesseract ever got a clean look at it — the threshold passes were
    // making detection *worse*, not better. They're kept as a fallback for
    // genuinely low-contrast images, but only run if the raw pass finds nothing.
    let { data } = await worker.recognize(blob);
    console.log('[OCR Pass 1 - raw] Words detected:', data?.words?.length || 0);

    if (!data?.words || data.words.length === 0) {
      console.log('[OCR] Raw pass found no text - trying contrast-enhanced preprocessing...');
      const processedBlob = await enhanceImageForOCR(blob);
      const result = await worker.recognize(processedBlob);
      data = result.data;
      console.log('[OCR Pass 2 - enhanced] Words detected:', data?.words?.length || 0);
    }

    if (!data?.words || data.words.length === 0) {
      console.log('[OCR] Enhanced pass found no text - trying extreme threshold preprocessing...');
      const processedBlob = await enhanceImageForOCRExtreme(blob);
      const result = await worker.recognize(processedBlob);
      data = result.data;
      console.log('[OCR Pass 3 - extreme] Words detected:', data?.words?.length || 0);
    }

    if (!data?.words || data.words.length === 0) {
      console.log('[OCR] Extreme pass found no text - trying inverted/ultra preprocessing...');
      const processedBlob = await enhanceImageForOCRUltra(blob);
      const result = await worker.recognize(processedBlob);
      data = result.data;
      console.log('[OCR Pass 4 - ultra] Words detected:', data?.words?.length || 0);
    }

    if (!data?.words || data.words.length === 0) {
      console.warn('[OCR] No words detected in image');
      return elements; // Only background
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
        x: w.bbox.x0,
        y: w.bbox.y0,
        width: w.bbox.x1 - w.bbox.x0,
        height: w.bbox.y1 - w.bbox.y0,
        conf: w.confidence,
      }))
      .filter((r: any) => r.width > 1 && r.height > 1)
      .filter((r: any) => r.conf >= 55 || r.height >= minHeadingHeight);

    console.log('[OCR] Filtered regions:', regions.length);

    if (regions.length === 0) {
      console.warn('[OCR] No text detected in image - user can add text with Text Tool');
      // Clean approach: return only the background image
      // User can add text manually using the Text Tool
      // This prevents overlapping placeholder boxes and matches Canva's UX
      return elements;
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
      .filter((line: any) => line.text.split(/\s+/).some((w: string) => {
        const core = w.replace(/[^A-Za-z]/g, '');
        return core.length >= 3 && /^([A-Z][a-z]*|[A-Z]+|[a-z]+)$/.test(core);
      }));

    // The uploaded image is the source of truth and is never modified —
    // painting over detected regions (an earlier version of this function
    // erased them and re-uploaded a "cleaned" background) counts as exactly
    // the kind of automatic change a locked template must never undergo.
    //
    // Sampling each line's ink/background color and cropping a texture patch
    // used to happen right here, eagerly, for every detected line — often 70+
    // on a dense poster. That was hundreds of canvas reads and image crops,
    // every one of them paid for up front during the upload's "Creating…"
    // step, even though the overwhelming majority of those lines are never
    // touched again by anyone. That work is deferred now — see
    // sampleColorsForRegion below and finishEdit in EditorCanvas.tsx — and
    // only actually runs for a specific element the moment (if ever) the
    // user edits it. A generic black is used as the placeholder color here;
    // it's invisible either way (opacity 0, see below) until that happens.
    //
    // Every extracted line still sits exactly on top of the same text already
    // baked into the background image — so until the user actually edits it,
    // the two would double-expose. Creating it at opacity 0 keeps it a real,
    // clickable, selectable element (positioned to match what's underneath)
    // without drawing anything — the original pixels remain the only visible
    // copy until an intentional edit changes the content.
    lines.forEach((line: any) => {
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
          fontFamily: 'Arial',
          fontSize: Math.max(10, Math.min(80, Math.round(line.avgWordHeight * 0.9))),
          fontWeight: 400,
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
  } finally {
    if (worker) await worker.terminate().catch(() => {});
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
      if (heightRatio <= 1.5 && Math.abs(w.y - ref.y) <= yThreshold) {
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
  };
}

// Reads (never writes) the pixels under and around ONE text region to report
// its ink color, its surrounding color, and — when a clean donor region
// exists — a real cropped snippet of the image to use as a texture-matched
// patch. This used to run eagerly for every detected line during upload
// (often 70+ on a dense poster: hundreds of canvas reads before the editor
// ever opened, for lines the overwhelming majority of which nobody ever
// edits). It's deferred now — called on demand from EditorCanvas.tsx's
// finishEdit, only for the one element actually being edited, only the
// first time it's edited. Nothing about the source image is modified.
//
// The ink and surrounding colors are sampled from two different places on
// purpose. Within the tightly-cropped box, the "ink" pixels (the letter
// strokes) almost always cover less area than the "paper" behind them — so
// splitting the box's own pixels into two brightness clusters and treating
// the smaller one as ink reliably finds the text color, dark-on-light or
// light-on-dark alike. But asking that *same* box for "the background" is
// less reliable — an anti-aliasing halo or a subtle highlight right around
// the glyphs can get misread as the background rather than as part of the
// text (verified on a real poster: a confident solid white for a region
// that was actually sitting on plain orange). A margin sampled from just
// outside the box — pixels the text itself never touches — reports what's
// actually there.
//
// The surrounding color is still only a flat approximation, though — it can
// match a solid or a smooth gradient but not a textured or patterned
// background (diagonal stripes, dots, a watermark grid), since a flat fill
// has no texture at all (verified on a real poster: a correctly-averaged
// gray still left a visible seam against diagonal stripes). A real same-size
// snippet cropped from directly above or below the box — checked to never
// overlap a *different* text element — reproduces texture and patterns too,
// since it's actual adjacent pixels rather than a computed value; the flat
// color is kept only as the fallback for when no clean donor region exists
// (text pinned to an edge, or boxed in by other elements on both sides).
export async function sampleColorsForRegion(
  imageUrl: string,
  box: { x: number; y: number; width: number; height: number },
  otherBoxes: { x0: number; y0: number; x1: number; y1: number }[],
  imageWidth: number,
  imageHeight: number
): Promise<{ color: string; bgColor: string; bgPatchImage: string | null }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = imageWidth;
      canvas.height = imageHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ color: '#000000', bgColor: '#FFFFFF', bgPatchImage: null });
        return;
      }
      ctx.drawImage(img, 0, 0, imageWidth, imageHeight);

      const toRgb = (sum: number[], n: number) => [
        Math.round(sum[0] / n), Math.round(sum[1] / n), Math.round(sum[2] / n),
      ] as const;
      const rgbStr = (c: readonly [number, number, number]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
      const luminance = (c: readonly [number, number, number]) => (c[0] + c[1] + c[2]) / 3;
      const overlapsAnyOtherBox = (x0: number, y0: number, x1: number, y1: number) =>
        otherBoxes.some((b) => x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0);

      const x0 = Math.max(0, Math.floor(box.x));
      const y0 = Math.max(0, Math.floor(box.y));
      const x1 = Math.min(imageWidth, Math.ceil(box.x + box.width));
      const y1 = Math.min(imageHeight, Math.ceil(box.y + box.height));
      const boxW = x1 - x0;
      const boxH = y1 - y0;
      if (boxW <= 0 || boxH <= 0) {
        resolve({ color: '#000000', bgColor: '#FFFFFF', bgPatchImage: null });
        return;
      }

      // --- Ink color: cluster the box's own pixels ---
      const pixels = ctx.getImageData(x0, y0, boxW, boxH).data;
      let sumBrightness = 0;
      const count = pixels.length / 4;
      for (let i = 0; i < pixels.length; i += 4) {
        sumBrightness += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      }
      const avgBrightness = sumBrightness / count;

      const dark = [0, 0, 0];
      const light = [0, 0, 0];
      let darkCount = 0;
      let lightCount = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        if (brightness < avgBrightness) {
          dark[0] += pixels[i]; dark[1] += pixels[i + 1]; dark[2] += pixels[i + 2];
          darkCount++;
        } else {
          light[0] += pixels[i]; light[1] += pixels[i + 1]; light[2] += pixels[i + 2];
          lightCount++;
        }
      }
      const inkIsDark = darkCount <= lightCount;
      const inkCount = inkIsDark ? darkCount : lightCount;
      const inkSum = inkIsDark ? dark : light;
      const inkRgb = inkCount > 0 ? toRgb(inkSum, inkCount) : ([0, 0, 0] as const);

      // --- Margin sanity-check: sampled from OUTSIDE the box only ---
      const margin = Math.max(4, Math.round(Math.min(boxW, boxH) * 0.25));
      const mx0 = Math.max(0, x0 - margin);
      const my0 = Math.max(0, y0 - margin);
      const mx1 = Math.min(imageWidth, x1 + margin);
      const my1 = Math.min(imageHeight, y1 + margin);
      let bgSumR = 0, bgSumG = 0, bgSumB = 0, bgN = 0;
      const sampleRow = (yy: number, xFrom: number, xTo: number) => {
        if (yy < 0 || yy >= imageHeight) return;
        const row = ctx.getImageData(xFrom, yy, Math.max(1, xTo - xFrom), 1).data;
        for (let i = 0; i < row.length; i += 4) {
          bgSumR += row[i]; bgSumG += row[i + 1]; bgSumB += row[i + 2]; bgN++;
        }
      };
      const sampleCol = (xx: number, yFrom: number, yTo: number) => {
        if (xx < 0 || xx >= imageWidth) return;
        const col = ctx.getImageData(xx, yFrom, 1, Math.max(1, yTo - yFrom)).data;
        for (let i = 0; i < col.length; i += 4) {
          bgSumR += col[i]; bgSumG += col[i + 1]; bgSumB += col[i + 2]; bgN++;
        }
      };
      sampleRow(my0, mx0, mx1); // strip above the box
      sampleRow(y1, mx0, mx1); // strip below the box
      sampleCol(mx0, my0, my1); // strip left of the box
      sampleCol(x1, my0, my1); // strip right of the box

      const bgRgb = bgN > 0
        ? toRgb([bgSumR, bgSumG, bgSumB], bgN)
        : ([255, 255, 255] as const);
      const bgColor = rgbStr(bgRgb);

      const contrast = Math.abs(luminance(inkRgb) - luminance(bgRgb));
      const color = contrast < 40 ? (avgBrightness > 128 ? '#000000' : '#FFFFFF') : rgbStr(inkRgb);

      let bgPatchImage: string | null = null;
      const tryDonor = (dy0: number) => {
        const dy1 = dy0 + boxH;
        if (dy0 < 0 || dy1 > imageHeight) return false;
        if (overlapsAnyOtherBox(x0, dy0, x1, dy1)) return false;
        const donor = document.createElement('canvas');
        donor.width = boxW;
        donor.height = boxH;
        const dctx = donor.getContext('2d');
        if (!dctx) return false;
        dctx.putImageData(ctx.getImageData(x0, dy0, boxW, boxH), 0, 0);
        bgPatchImage = donor.toDataURL('image/png');
        return true;
      };
      // Below first — a heading's own caption/subtext, if any, is usually
      // further below still, so this is less likely to clip another element
      // than looking upward toward a logo or a different heading.
      tryDonor(y1) || tryDonor(y0 - boxH);

      resolve({ color, bgColor, bgPatchImage });
    };
    img.onerror = () => resolve({ color: '#000000', bgColor: '#FFFFFF', bgPatchImage: null });
    img.src = imageUrl;
  });
}

// Lazily-created, never-terminated worker shared by detectNearbyTextRegions
// across every on-demand call in the session — each call already only runs
// once per element (see revealingOcrTextIdsRef in EditorCanvas.tsx), but
// Tesseract worker startup itself costs a second or more, and there's no
// reason to pay it again for the second, third, etc. element a user edits
// in the same session.
let sharedDetectWorkerPromise: Promise<Tesseract.Worker> | null = null;
function getSharedDetectWorker(): Promise<Tesseract.Worker> {
  if (!sharedDetectWorkerPromise) {
    sharedDetectWorkerPromise = Tesseract.createWorker('eng', 1);
  }
  return sharedDetectWorkerPromise;
}

// Some templates draw one word directly overlapping another as a deliberate
// layered design (verified on a real poster: a small "HAPPY" caption and a
// "DAY" caption both drawn on top of a huge "ENGINEERS'" — all one flat
// image). The main decomposeTemplateImage pass only detects words readable
// on their own; the giant word underneath the smaller overlapping text
// often reads as garbage there and never becomes a text element at all, so
// sampleColorsForRegion's texture-patch donor search — which only avoids
// *known* sibling text boxes — has no idea it exists and can crop straight
// through its letters, producing a patch with ghosted fragments of it.
//
// This runs a second, small, on-demand OCR pass — scoped to a padded crop
// around the one box actually being edited, not the whole image — the
// moment (if ever) that element is opened for editing. It's deliberately
// separate from decomposeTemplateImage: it never runs at upload time and
// never touches every detected line, only the single region a user is
// about to reveal, so it adds no time to the "Creating…" step and doesn't
// change what decomposeTemplateImage itself detects or how fast it runs.
export async function detectNearbyTextRegions(
  imageUrl: string,
  box: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
): Promise<{ x0: number; y0: number; x1: number; y1: number }[]> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = imageUrl;
    });

    // Generous padding, especially vertically — a decorative overlapping
    // word (like the giant "ENGINEERS'" case) is typically much taller than
    // the smaller text drawn on top of it, so the crop needs enough margin
    // above/below to actually contain it, not just immediately-adjacent
    // pixels. Horizontal padding can't just scale off this element's own
    // width either — verified on the real poster: "HAPPY" is wide enough
    // that its own box-relative padding happened to catch the full width of
    // "ENGINEERS'" underneath it, but "DAY", a much narrower box sitting on
    // that exact same word, only caught a horizontal sliver of it — too
    // little for Tesseract to read it as a legible word at all, so it went
    // undetected and the ghosting stayed. Also flooring horizontal padding
    // to a fraction of the whole image width means a wide decorative word
    // gets caught regardless of how narrow the element drawn on top of it
    // happens to be.
    const padX = Math.max(box.width * 0.5, 60, imageWidth * 0.3);
    const padY = Math.max(box.height * 2.5, 80);
    const cx0 = Math.max(0, Math.floor(box.x - padX));
    const cy0 = Math.max(0, Math.floor(box.y - padY));
    const cx1 = Math.min(imageWidth, Math.ceil(box.x + box.width + padX));
    const cy1 = Math.min(imageHeight, Math.ceil(box.y + box.height + padY));
    const cw = cx1 - cx0;
    const ch = cy1 - cy0;
    if (cw <= 0 || ch <= 0) return [];

    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = imageWidth;
    fullCanvas.height = imageHeight;
    const fctx = fullCanvas.getContext('2d');
    if (!fctx) return [];
    fctx.drawImage(img, 0, 0, imageWidth, imageHeight);

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cw;
    cropCanvas.height = ch;
    const cctx = cropCanvas.getContext('2d');
    if (!cctx) return [];
    cctx.putImageData(fctx.getImageData(cx0, cy0, cw, ch), 0, 0);

    const blob: Blob | null = await new Promise((resolve) => cropCanvas.toBlob(resolve, 'image/png'));
    if (!blob) return [];

    const worker = await getSharedDetectWorker();
    const { data } = await worker.recognize(blob);
    const words = (data?.words || []).filter(
      (w: any) => w.text && w.text.trim().length > 0 && w.bbox.x1 - w.bbox.x0 > 1 && w.bbox.y1 - w.bbox.y0 > 1
    );

    const targetX0 = box.x, targetY0 = box.y;
    const targetX1 = box.x + box.width, targetY1 = box.y + box.height;
    const results: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const w of words) {
      const x0 = cx0 + w.bbox.x0;
      const y0 = cy0 + w.bbox.y0;
      const x1 = cx0 + w.bbox.x1;
      const y1 = cy0 + w.bbox.y1;
      // Skip words that are really just the element's own text re-detected —
      // majority-overlapping the target box itself, not a genuinely
      // different piece of text sitting behind/around it.
      const ix0 = Math.max(x0, targetX0), iy0 = Math.max(y0, targetY0);
      const ix1 = Math.min(x1, targetX1), iy1 = Math.min(y1, targetY1);
      const interArea = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0);
      const wordArea = Math.max(1, (x1 - x0) * (y1 - y0));
      if (interArea / wordArea > 0.6) continue;
      // Pad the exclusion box a little past OCR's literal bbox — verified on
      // a real overlapping-text poster: a donor crop taken just outside the
      // reported box still caught a glyph's descender/anti-aliased edge,
      // since Tesseract's bbox doesn't always fully contain the visible
      // stroke. This only widens what the patch-donor search avoids; it
      // doesn't change what's treated as this word's own text.
      const padX = Math.max(4, (x1 - x0) * 0.15);
      const padY = Math.max(4, (y1 - y0) * 0.15);
      results.push({ x0: x0 - padX, y0: y0 - padY, x1: x1 + padX, y1: y1 + padY });
    }
    return results;
  } catch (err) {
    console.warn('[OCR] detectNearbyTextRegions failed', err);
    return [];
  }
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
