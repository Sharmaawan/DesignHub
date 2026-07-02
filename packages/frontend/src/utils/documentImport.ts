/**
 * Document Import Utilities
 * Converts PDF, SVG, CSV, XLSX, DOCX, PPTX into editor page definitions.
 */

// Vite resolves this to the actual asset URL (dev server or built bundle)
// — avoids CDN dependency and CORS issues entirely.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export interface PageImage { dataUrl: string; width: number; height: number; textLines?: PdfTextLine[]; }
export interface PdfTextLine { x: number; y: number; width: number; height: number; fontSize: number; text: string; }
export interface ParsedTable { rows: number; cols: number; cells: string[][]; }

/* ------------------------------------------------------------------ */
/*  PDF → array of page images (one per PDF page)                      */
/* ------------------------------------------------------------------ */

let pdfjsLib: any = null;

async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  const mod = await import('pdfjs-dist');
  pdfjsLib = mod;
  // Use the locally bundled worker — no CDN required
  mod.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  return mod;
}

// Groups pdf.js's raw per-run text items into per-line runs (items sharing a baseline
// and sitting close enough horizontally to be the same line of text), in canvas pixel
// space. Assumes unrotated pages, which covers the overwhelming majority of real PDFs —
// full rotation/shear support would need a much heavier matrix decomposition for a case
// that's rare in practice.
function extractTextLines(items: any[], scale: number, canvasHeight: number): PdfTextLine[] {
  const lines: PdfTextLine[] = [];
  for (const it of items) {
    const str: string = it.str;
    if (!str || !str.trim()) continue;
    const fontSizePdf = Math.hypot(it.transform[0], it.transform[1]);
    if (!fontSizePdf) continue;
    const xCanvas = it.transform[4] * scale;
    const yBaselineCanvas = canvasHeight - it.transform[5] * scale;
    const fontSizeCanvas = fontSizePdf * scale;
    const widthCanvas = (it.width || 0) * scale;
    const topY = yBaselineCanvas - fontSizeCanvas * 0.85;
    const heightCanvas = fontSizeCanvas * 1.15;

    const prev = lines[lines.length - 1];
    const sameLine = prev
      && Math.abs(prev.y - topY) < fontSizeCanvas * 0.4
      && xCanvas <= prev.x + prev.width + fontSizeCanvas * 2;
    if (sameLine) {
      const gap = xCanvas > prev.x + prev.width + 1 ? ' ' : '';
      prev.text += gap + str;
      prev.width = Math.max(prev.width, xCanvas + widthCanvas - prev.x);
      prev.fontSize = Math.max(prev.fontSize, fontSizeCanvas);
    } else {
      lines.push({ x: xCanvas, y: topY, width: widthCanvas, height: heightCanvas, fontSize: fontSizeCanvas, text: str });
    }
  }
  return lines;
}

export async function importPDF(file: File): Promise<PageImage[]> {
  const pdfjs = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  const result: PageImage[] = [];
  const SCALE = 1.5;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: SCALE });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Pull the real text runs (position + font size) so callers can turn them into
    // editable text layers instead of leaving everything as flattened pixels.
    let textLines: PdfTextLine[] = [];
    try {
      const textContent = await page.getTextContent();
      textLines = extractTextLines(textContent.items, SCALE, viewport.height);
    } catch {
      // Scanned/image-only PDFs have no text layer — fall back to image-only, silently.
    }

    // Mask each detected text line on the rendered background so the flattened pixels
    // don't show through underneath the editable text element drawn on top of it.
    for (const line of textLines) {
      let bg = '#FFFFFF';
      try {
        const sx = Math.max(0, Math.min(canvas.width - 1, Math.round(line.x)));
        const sy = Math.max(0, Math.min(canvas.height - 1, Math.round(line.y - 2)));
        const px = ctx.getImageData(sx, sy, 1, 1).data;
        bg = `rgb(${px[0]},${px[1]},${px[2]})`;
      } catch {
        // Cross-origin/tainted canvas — keep the white fallback.
      }
      ctx.fillStyle = bg;
      ctx.fillRect(line.x - 1, line.y - 1, line.width + 2, line.height + 2);
    }

    result.push({
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
      // Store dimensions/positions in original PDF units so the canvas page feels natural
      width: Math.round(viewport.width / SCALE),
      height: Math.round(viewport.height / SCALE),
      textLines: textLines.map((l) => ({
        x: l.x / SCALE, y: l.y / SCALE, width: l.width / SCALE, height: l.height / SCALE,
        fontSize: l.fontSize / SCALE, text: l.text,
      })),
    });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  SVG → single page image                                            */
/* ------------------------------------------------------------------ */

export async function importSVG(file: File): Promise<PageImage> {
  const text = await file.text();
  const blob = new Blob([text], { type: 'image/svg+xml' });
  const dataUrl = await new Promise<string>((res) => {
    const reader = new FileReader();
    reader.onload = (e) => res(e.target!.result as string);
    reader.readAsDataURL(blob);
  });

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  let w = parseFloat(svg.getAttribute('width') || '0');
  let h = parseFloat(svg.getAttribute('height') || '0');
  if (!w || !h) {
    const vb = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
    if (vb && vb.length === 4) { w = vb[2]; h = vb[3]; }
  }
  return { dataUrl, width: Math.round(w) || 800, height: Math.round(h) || 600 };
}

/* ------------------------------------------------------------------ */
/*  CSV → ParsedTable                                                   */
/* ------------------------------------------------------------------ */

export async function importCSV(file: File): Promise<ParsedTable> {
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);
  const cells = lines.map((line) => {
    const fields: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) { fields.push(cur); cur = ''; }
      else cur += ch;
    }
    fields.push(cur);
    return fields;
  });
  const maxCols = Math.max(...cells.map((r) => r.length));
  const padded = cells.map((r) => { while (r.length < maxCols) r.push(''); return r; });
  return { rows: padded.length, cols: maxCols, cells: padded };
}

/* ------------------------------------------------------------------ */
/*  XLSX → ParsedTable (via SheetJS)                                   */
/* ------------------------------------------------------------------ */

export async function importXLSX(file: File): Promise<ParsedTable> {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw: (string | number | boolean | null)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1, defval: '', raw: false,
  }) as any;
  const cells = raw.map((row) => row.map((c) => (c == null ? '' : String(c))));
  const maxCols = Math.max(...cells.map((r) => r.length), 1);
  const padded = cells.map((r) => { while (r.length < maxCols) r.push(''); return r; });
  return { rows: padded.length, cols: maxCols, cells: padded };
}

/* ------------------------------------------------------------------ */
/*  DOCX → paragraphs using JSZip to read the ZIP contents            */
/* ------------------------------------------------------------------ */

export async function importDOCX(file: File): Promise<string[]> {
  try {
    const JSZip = (await import('jszip')).default;
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const xmlFile = zip.file('word/document.xml');
    if (!xmlFile) return ['(Could not read document content)'];
    const xml = await xmlFile.async('string');

    // Group <w:t> runs inside <w:p> paragraphs
    const paragraphs: string[] = [];
    const paraMatches = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
    for (const para of paraMatches) {
      const runs = para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      const text = runs.map((r) => r.replace(/<[^>]+>/g, '')).join('').trim();
      if (text) paragraphs.push(text);
    }
    return paragraphs.slice(0, 300);
  } catch {
    // Fallback: naive binary scan
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let raw = '';
    for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
    const matches = raw.match(/<w:t[^>]*>([^<]{1,500})<\/w:t>/g) || [];
    return matches.map((m) => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean).slice(0, 100);
  }
}

/* ------------------------------------------------------------------ */
/*  PPTX → slide text blocks using JSZip                               */
/* ------------------------------------------------------------------ */

export async function importPPTX(
  file: File,
): Promise<Array<{ title: string; body: string }>> {
  try {
    const JSZip = (await import('jszip')).default;
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Find all slide files sorted numerically
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)?.[0] || '0');
        const nb = parseInt(b.match(/\d+/)?.[0] || '0');
        return na - nb;
      });

    if (!slideFiles.length) return [{ title: 'Slide 1', body: 'No slides found' }];

    const slides: Array<{ title: string; body: string }> = [];
    for (const slideFile of slideFiles) {
      const xml = await zip.file(slideFile)!.async('string');
      // Extract text runs grouped by shape/placeholder
      const shapeMatches = xml.match(/<p:sp[ >][\s\S]*?<\/p:sp>/g) || [];
      let title = '';
      const bodyParts: string[] = [];

      for (const shape of shapeMatches) {
        const texts: string[] = (shape.match(/<a:t>([^<]*)<\/a:t>/g) || [])
          .map((t) => t.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean);
        if (!texts.length) continue;
        const text = texts.join(' ');
        // First non-empty shape is the title if it looks like one (short)
        if (!title && text.length < 200) title = text;
        else bodyParts.push(text);
      }
      slides.push({
        title: title || `Slide ${slides.length + 1}`,
        body: bodyParts.join('\n\n'),
      });
    }
    return slides;
  } catch {
    // Fallback: naive scan
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let raw = '';
    for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
    const texts = (raw.match(/<a:t>([^<]{1,300})<\/a:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    const chunkSize = Math.max(1, Math.ceil(texts.length / 10));
    return Array.from({ length: Math.ceil(texts.length / chunkSize) }, (_, i) => {
      const chunk = texts.slice(i * chunkSize, (i + 1) * chunkSize);
      return { title: chunk[0] || `Slide ${i + 1}`, body: chunk.slice(1).join('\n') };
    });
  }
}
