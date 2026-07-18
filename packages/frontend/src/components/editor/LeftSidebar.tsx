import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { uploadAPI, aiAPI, aiSettingsAPI } from '../../utils/api';
import { importPDF, importSVG, importCSV, importXLSX, importDOCX, importPPTX, paginateParagraphs } from '../../utils/documentImport';
import { useEditorStore } from '../../stores/editorStore';
import { COLORS_PALETTE } from '../../utils/cn';
import {
  HiOutlineTemplate, HiOutlineViewGrid, HiOutlinePencil,
  HiOutlineColorSwatch, HiOutlineUpload,
  HiOutlineSearch, HiOutlinePlus, HiOutlineChevronLeft,
  HiOutlineSparkles, HiOutlineChevronDown, HiOutlineChevronUp,
  HiOutlinePencilAlt, HiCursorClick, HiOutlineTrash,
} from 'react-icons/hi';
import toast from 'react-hot-toast';

// Parses an Iconify SVG body fragment into flat path `d` strings + parallel fill colors.
// Iconify icon bodies are pre-flattened (no nested <g transform>), but they still mix
// <path>/<circle>/<rect>/<ellipse>/<polygon>/<polyline>/<line> — a path-only regex drops
// every non-path shape, which is what made some icons render as broken fragments.
function parseSvgShapes(body: string): { paths: string[]; fills: string[] } {
  const paths: string[] = [];
  const fills: string[] = [];
  const push = (d: string, fill: string | null) => {
    if (!d) return;
    paths.push(d);
    fills.push(fill && fill !== 'none' ? fill : 'currentColor');
  };
  const num = (v: string | null, fallback = 0) => (v ? parseFloat(v) : fallback);

  try {
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('parse error');

    doc.querySelectorAll('path, circle, rect, ellipse, polygon, polyline, line').forEach((el) => {
      const fill = el.getAttribute('fill');
      const tag = el.tagName.toLowerCase();

      if (tag === 'path') {
        push(el.getAttribute('d') || '', fill);
      } else if (tag === 'circle') {
        const cx = num(el.getAttribute('cx')), cy = num(el.getAttribute('cy')), r = num(el.getAttribute('r'));
        if (r > 0) push(`M ${cx - r},${cy} A ${r},${r} 0 1,0 ${cx + r},${cy} A ${r},${r} 0 1,0 ${cx - r},${cy} Z`, fill);
      } else if (tag === 'ellipse') {
        const cx = num(el.getAttribute('cx')), cy = num(el.getAttribute('cy'));
        const rx = num(el.getAttribute('rx')), ry = num(el.getAttribute('ry'));
        if (rx > 0 && ry > 0) push(`M ${cx - rx},${cy} A ${rx},${ry} 0 1,0 ${cx + rx},${cy} A ${rx},${ry} 0 1,0 ${cx - rx},${cy} Z`, fill);
      } else if (tag === 'rect') {
        const x = num(el.getAttribute('x')), y = num(el.getAttribute('y'));
        const w = num(el.getAttribute('width')), h = num(el.getAttribute('height'));
        const rx = num(el.getAttribute('rx'), num(el.getAttribute('ry')));
        if (w > 0 && h > 0) {
          if (rx > 0) {
            push(`M ${x + rx},${y} H ${x + w - rx} A ${rx},${rx} 0 0 1 ${x + w},${y + rx} V ${y + h - rx} A ${rx},${rx} 0 0 1 ${x + w - rx},${y + h} H ${x + rx} A ${rx},${rx} 0 0 1 ${x},${y + h - rx} V ${y + rx} A ${rx},${rx} 0 0 1 ${x + rx},${y} Z`, fill);
          } else {
            push(`M ${x},${y} H ${x + w} V ${y + h} H ${x} Z`, fill);
          }
        }
      } else if (tag === 'polygon' || tag === 'polyline') {
        const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
        if (pts.length >= 4) {
          let d = `M ${pts[0]},${pts[1]}`;
          for (let i = 2; i < pts.length - 1; i += 2) d += ` L ${pts[i]},${pts[i + 1]}`;
          if (tag === 'polygon') d += ' Z';
          push(d, fill);
        }
      } else if (tag === 'line') {
        const x1 = num(el.getAttribute('x1')), y1 = num(el.getAttribute('y1'));
        const x2 = num(el.getAttribute('x2')), y2 = num(el.getAttribute('y2'));
        push(`M ${x1},${y1} L ${x2},${y2}`, fill);
      }
    });
  } catch {
    // Fall back to a path-only regex if DOMParser chokes on unusual markup.
    const pathRe = /<path([^>]*)>/gi;
    let m;
    while ((m = pathRe.exec(body)) !== null) {
      const dMatch = m[1].match(/d="([^"]+)"/);
      const fillMatch = m[1].match(/fill="([^"]+)"/);
      if (dMatch) push(dMatch[1], fillMatch ? fillMatch[1] : null);
    }
  }

  return { paths, fills };
}

type TabKey = 'templates' | 'elements' | 'text' | 'uploads' | 'background' | 'ai' | 'tools';

const TABS: { key: TabKey; icon: React.ElementType; label: string }[] = [
  { key: 'templates', icon: HiOutlineTemplate, label: 'Templates' },
  { key: 'elements', icon: HiOutlineViewGrid, label: 'Elements' },
  { key: 'text', icon: HiOutlinePencil, label: 'Text' },
  { key: 'tools', icon: HiOutlinePencilAlt, label: 'Tools' },
  { key: 'uploads', icon: HiOutlineUpload, label: 'Uploads' },
  { key: 'background', icon: HiOutlineColorSwatch, label: 'Background' },
  { key: 'ai', icon: HiOutlineSparkles, label: 'AI' },
];

const DRAW_COLORS = ['#1E1E1E', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#7B2FBE', '#EC4899', '#FFFFFF'];

const SHAPE_TYPES = [
  'rectangle', 'circle', 'triangle', 'star',
  'pentagon', 'hexagon', 'arrow', 'line', 'heart', 'diamond',
] as const;

const SHAPE_COLORS = ['#6366F1','#EC4899','#F59E0B','#10B981','#3B82F6','#EF4444','#8B5CF6','#14B8A6','#F97316','#06B6D4'];

// Heroicons v1 solid — viewBox 0 0 20 20
const ICON_LIBRARY = [
  { name: 'Home',        cat: 'UI',            path: 'M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z' },
  { name: 'Heart',       cat: 'UI',            path: 'M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z' },
  { name: 'Star',        cat: 'UI',            path: 'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' },
  { name: 'User',        cat: 'UI',            path: 'M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z' },
  { name: 'Check',       cat: 'UI',            path: 'M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z' },
  { name: 'Plus',        cat: 'UI',            path: 'M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z' },
  { name: 'X',           cat: 'UI',            path: 'M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z' },
  { name: 'Search',      cat: 'UI',            path: 'M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z' },
  { name: 'Menu',        cat: 'UI',            path: 'M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z' },
  { name: 'Settings',    cat: 'UI',            path: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  { name: 'Mail',        cat: 'Communication', path: 'M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884zM18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z' },
  { name: 'Phone',       cat: 'Communication', path: 'M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z' },
  { name: 'Chat',        cat: 'Communication', path: 'M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z' },
  { name: 'Bell',        cat: 'Communication', path: 'M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z' },
  { name: 'Arrow →',     cat: 'Arrows',        path: 'M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z' },
  { name: 'Arrow ←',     cat: 'Arrows',        path: 'M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z' },
  { name: 'Arrow ↑',     cat: 'Arrows',        path: 'M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z' },
  { name: 'Arrow ↓',     cat: 'Arrows',        path: 'M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z' },
  { name: 'Refresh',     cat: 'Arrows',        path: 'M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z' },
  { name: 'Chart Bar',   cat: 'Business',      path: 'M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z' },
  { name: 'Calendar',    cat: 'Business',      path: 'M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z' },
  { name: 'Clock',       cat: 'Business',      path: 'M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z' },
  { name: 'Location',    cat: 'Business',      path: 'M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z' },
  { name: 'Camera',      cat: 'Media',         path: 'M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z' },
  { name: 'Play',        cat: 'Media',         path: 'M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z' },
  { name: 'Music',       cat: 'Media',         path: 'M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z' },
  { name: 'Lightning',   cat: 'Symbols',       path: 'M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z' },
  { name: 'Globe',       cat: 'Symbols',       path: 'M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z' },
  { name: 'Lock',        cat: 'Symbols',       path: 'M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z' },
  { name: 'Bookmark',    cat: 'Symbols',       path: 'M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z' },
  { name: 'Sun',         cat: 'Nature',        path: 'M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z' },
  { name: 'Moon',        cat: 'Nature',        path: 'M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z' },
  { name: 'Fire',        cat: 'Nature',        path: 'M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z' },
];

const ICON_CATEGORIES = ['All', ...Array.from(new Set(ICON_LIBRARY.map((i) => i.cat)))];

const STICKER_CATEGORIES = ['Trending', 'Arrow', 'Word', 'Food', 'Love', 'Shape', 'Nature', 'Emoji', 'Weather', 'Business'];

// Canonical canvas sizes per template category — matches Canva's real presets.
const CATEGORY_SIZE: Record<string, { width: number; height: number }> = {
  Birthday:       { width: 1080, height: 1350 }, // Invitation-card style
  Instagram:      { width: 1080, height: 1080 }, // Instagram Post (story variants override below)
  Facebook:       { width: 1200, height: 630 },  // Facebook Post
  Logo:           { width: 500,  height: 500 },
  'Business Card': { width: 1050, height: 600 },
  YouTube:        { width: 1280, height: 720 },  // YouTube Thumbnail
};

// Color schemes cycled through for AI-generated designs — keeps the "Generate" box from
// needing its own color-picking round-trip to the AI (unreliable to parse hex codes from
// free-form text) while still giving each generation a distinct, coherent look.
const AI_DESIGN_PALETTES = [
  { bg: '#111827', accent: '#6366F1', text: '#FFFFFF' },
  { bg: '#FFFFFF', accent: '#EC4899', text: '#111827' },
  { bg: '#0F172A', accent: '#F59E0B', text: '#FFFFFF' },
  { bg: '#FDF4FF', accent: '#A855F7', text: '#581C87' },
  { bg: '#F0FDF4', accent: '#10B981', text: '#064E3B' },
  { bg: '#1E1B4B', accent: '#C084FC', text: '#EDE9FE' },
  { bg: '#FFF7ED', accent: '#EA580C', text: '#1C1917' },
  { bg: '#083344', accent: '#22D3EE', text: '#FFFFFF' },
];

// Curated Picsum (picsum.photos) photo ids — a free, no-API-key placeholder image
// service, same category of external asset service this app already uses elsewhere
// (Iconify for icon search, DiceBear for avatars). Picked for variety: nature,
// texture, abstract, architecture — good general-purpose design backgrounds.
const BACKGROUND_PHOTOS = [
  { id: '1015', label: 'Mountain Lake' },
  { id: '1018', label: 'Forest Road' },
  { id: '1043', label: 'Green Field' },
  { id: '1036', label: 'Night Sky' },
  { id: '1050', label: 'Misty Peaks' },
  { id: '1080', label: 'Ferns' },
  { id: '106', label: 'Foliage' },
  { id: '110', label: 'Waves' },
  { id: '164', label: 'Skyline' },
  { id: '129', label: 'Marble' },
  { id: '145', label: 'Desert' },
  { id: '160', label: 'Ocean' },
];

// Picsum is random stock photography with no theme search, so occasion-specific
// backgrounds (birthday, convocation, ...) are fetched live from Wikimedia Commons —
// a free, keyless, CORS-enabled public search API (same "no API key needed" bar as
// Picsum/Iconify/DiceBear already used elsewhere in this file).
const BACKGROUND_PHOTO_CATEGORIES: { label: string; query: string }[] = [
  { label: 'Birthday', query: 'birthday party balloons decoration' },
  { label: 'Conference', query: 'conference hall presentation stage' },
  { label: 'Convocation', query: 'graduation convocation ceremony' },
  { label: 'Academic', query: 'university campus academic library' },
];

const BUILT_IN_TEMPLATES = [
  // General — keeps whatever canvas size is already open
  { id: 'minimal',         cat: 'General',    name: 'Minimal',           bg: '#FFFFFF', accent: '#6366F1', text: '#111827' },
  { id: 'bold',            cat: 'General',    name: 'Bold Gradient',     bg: '#6366F1', accent: '#FFFFFF', text: '#FFFFFF' },
  { id: 'dark',            cat: 'General',    name: 'Dark Modern',       bg: '#111827', accent: '#6366F1', text: '#FFFFFF' },
  { id: 'warm',            cat: 'General',    name: 'Warm Coral',        bg: '#FFF5F5', accent: '#EF4444', text: '#1F2937' },
  { id: 'nature',          cat: 'General',    name: 'Nature',            bg: '#F0FDF4', accent: '#10B981', text: '#064E3B' },
  { id: 'ocean',           cat: 'General',    name: 'Ocean',             bg: '#EFF6FF', accent: '#3B82F6', text: '#1E3A8A' },
  { id: 'creative',        cat: 'General',    name: 'Creative',          bg: '#FDF4FF', accent: '#A855F7', text: '#581C87' },
  { id: 'corporate',       cat: 'General',    name: 'Corporate',         bg: '#F8FAFC', accent: '#0F172A', text: '#0F172A' },
  { id: 'sunset-glow',     cat: 'General',    name: 'Sunset Glow',       bg: '#FFF7ED', accent: '#FB923C', text: '#7C2D12' },
  { id: 'midnight-gold',   cat: 'General',    name: 'Midnight Gold',     bg: '#0B1120', accent: '#FBBF24', text: '#FDE68A' },
  { id: 'mint-fresh',      cat: 'General',    name: 'Mint Fresh',        bg: '#ECFDF5', accent: '#059669', text: '#064E3B' },
  { id: 'berry-pop',       cat: 'General',    name: 'Berry Pop',         bg: '#500724', accent: '#F472B6', text: '#FCE7F3' },
  { id: 'classic-mono',    cat: 'General',    name: 'Classic Mono',      bg: '#171717', accent: '#FFFFFF', text: '#FAFAFA' },
  { id: 'sky-pastel',      cat: 'General',    name: 'Sky Pastel',        bg: '#F0F9FF', accent: '#0EA5E9', text: '#0C4A6E' },
  { id: 'ocean-breeze',    cat: 'General',    name: 'Ocean Breeze',      bg: '#0C4A6E', accent: '#FFFFFF', text: '#FFFFFF', photoId: '160' },
  { id: 'mountain-vista',  cat: 'General',    name: 'Mountain Vista',    bg: '#0F172A', accent: '#FFFFFF', text: '#FFFFFF', photoId: '1015' },
  { id: 'urban-skyline',   cat: 'General',    name: 'Urban Skyline',     bg: '#0F172A', accent: '#38BDF8', text: '#FFFFFF', photoId: '164' },
  { id: 'marble-luxe',     cat: 'General',    name: 'Marble Luxe',       bg: '#F5F5F4', accent: '#B8860B', text: '#1C1917', photoId: '129', overlay: 'light' },
  { id: 'forest-path',     cat: 'General',    name: 'Forest Path',       bg: '#052E16', accent: '#4ADE80', text: '#FFFFFF', photoId: '1018' },
  { id: 'desert-dunes',    cat: 'General',    name: 'Desert Dunes',      bg: '#78350F', accent: '#FB923C', text: '#FFFFFF', photoId: '145' },
  // Birthday → 1080×1350
  { id: 'bday-fun',        cat: 'Birthday',   name: 'Fun Birthday',      bg: '#FFF9C4', accent: '#FF6F00', text: '#4A148C' },
  { id: 'bday-elegant',    cat: 'Birthday',   name: 'Elegant Birthday',  bg: '#1A1A2E', accent: '#FFD700', text: '#FFFFFF' },
  { id: 'bday-pastel',     cat: 'Birthday',   name: 'Pastel Party',      bg: '#FCE4EC', accent: '#E91E63', text: '#880E4F' },
  { id: 'bday-kids',       cat: 'Birthday',   name: 'Kids Birthday',     bg: '#E3F2FD', accent: '#FF5722', text: '#0D47A1' },
  { id: 'bday-confetti',   cat: 'Birthday',   name: 'Confetti Bash',     bg: '#FFF1F2', accent: '#FB7185', text: '#881337' },
  { id: 'bday-galaxy',     cat: 'Birthday',   name: 'Galaxy Party',      bg: '#1E1B4B', accent: '#A78BFA', text: '#EDE9FE' },
  // Instagram → 1080×1080 (Post) / 1080×1920 (Story)
  { id: 'ig-minimal',      cat: 'Instagram',  name: 'IG Minimal',        bg: '#FAFAFA', accent: '#C13584', text: '#262626' },
  { id: 'ig-bold',         cat: 'Instagram',  name: 'IG Bold',           bg: '#833AB4', accent: '#FCAF45', text: '#FFFFFF' },
  { id: 'ig-story-dark',   cat: 'Instagram',  name: 'Story Dark',        bg: '#0F0F0F', accent: '#E040FB', text: '#FFFFFF', width: 1080, height: 1920 },
  { id: 'ig-story-light',  cat: 'Instagram',  name: 'Story Light',       bg: '#FFF0F6', accent: '#E91E63', text: '#1A1A1A', width: 1080, height: 1920 },
  { id: 'ig-product',      cat: 'Instagram',  name: 'Product Post',      bg: '#F5F5F5', accent: '#212121', text: '#212121' },
  { id: 'ig-golden-hour',  cat: 'Instagram',  name: 'Golden Hour',       bg: '#FED7AA', accent: '#EA580C', text: '#7C2D12' },
  { id: 'ig-pastel-grid',  cat: 'Instagram',  name: 'Pastel Grid',       bg: '#FDF2F8', accent: '#F9A8D4', text: '#831843' },
  { id: 'ig-editorial',    cat: 'Instagram',  name: 'Editorial',         bg: '#FAFAF9', accent: '#78716C', text: '#1C1917' },
  { id: 'ig-nature-escape', cat: 'Instagram', name: 'Nature Escape',     bg: '#052E16', accent: '#FFFFFF', text: '#FFFFFF', photoId: '1080' },
  { id: 'ig-city-nights',  cat: 'Instagram',  name: 'City Nights',       bg: '#0F172A', accent: '#A78BFA', text: '#FFFFFF', photoId: '1036' },
  // Facebook → 1200×630 (Post) / 1080×1920 (Story)
  { id: 'fb-cover',        cat: 'Facebook',   name: 'FB Cover',          bg: '#1877F2', accent: '#FFFFFF', text: '#FFFFFF' },
  { id: 'fb-post',         cat: 'Facebook',   name: 'FB Post',           bg: '#FFFFFF', accent: '#1877F2', text: '#1C1E21' },
  { id: 'fb-event',        cat: 'Facebook',   name: 'FB Event',          bg: '#18191A', accent: '#42B72A', text: '#FFFFFF' },
  { id: 'fb-story',        cat: 'Facebook',   name: 'FB Story',          bg: '#1877F2', accent: '#FFFFFF', text: '#FFFFFF', width: 1080, height: 1920 },
  { id: 'fb-minimal',      cat: 'Facebook',   name: 'FB Minimal',        bg: '#F0F2F5', accent: '#1877F2', text: '#050505' },
  { id: 'fb-announcement', cat: 'Facebook',   name: 'Announcement',      bg: '#E7F3FF', accent: '#0866FF', text: '#050505' },
  { id: 'fb-scenic-cover', cat: 'Facebook',   name: 'Scenic Cover',      bg: '#0F172A', accent: '#FFFFFF', text: '#FFFFFF', photoId: '1050' },
  // Logo → 500×500
  { id: 'logo-minimal',    cat: 'Logo',       name: 'Minimal Logo',      bg: '#FFFFFF', accent: '#111827', text: '#111827' },
  { id: 'logo-bold',       cat: 'Logo',       name: 'Bold Logo',         bg: '#111827', accent: '#6366F1', text: '#FFFFFF' },
  { id: 'logo-colorful',   cat: 'Logo',       name: 'Colorful Logo',     bg: '#FFF7ED', accent: '#EA580C', text: '#1C1917' },
  { id: 'logo-elegant',    cat: 'Logo',       name: 'Elegant Logo',      bg: '#FAF5FF', accent: '#7C3AED', text: '#1E1B4B' },
  { id: 'logo-luxury',     cat: 'Logo',       name: 'Luxury Logo',       bg: '#0C0A09', accent: '#D4AF37', text: '#F5F5F4' },
  { id: 'logo-pastel',     cat: 'Logo',       name: 'Pastel Logo',       bg: '#FDF4FF', accent: '#D946EF', text: '#4A044E' },
  // Business Card → 1050×600
  { id: 'biz-clean',       cat: 'Business Card', name: 'Clean Card',     bg: '#FFFFFF', accent: '#2563EB', text: '#111827' },
  { id: 'biz-dark',        cat: 'Business Card', name: 'Dark Card',      bg: '#111827', accent: '#10B981', text: '#FFFFFF' },
  { id: 'biz-elegant',     cat: 'Business Card', name: 'Elegant Card',   bg: '#1E1B4B', accent: '#C084FC', text: '#EDE9FE' },
  { id: 'biz-gold',        cat: 'Business Card', name: 'Gold Accent',   bg: '#FFFFFF', accent: '#B8860B', text: '#1C1917' },
  { id: 'biz-sage',        cat: 'Business Card', name: 'Sage Card',     bg: '#F0FDF4', accent: '#4D7C0F', text: '#14532D' },
  { id: 'biz-marble',      cat: 'Business Card', name: 'Marble Card',   bg: '#F5F5F4', accent: '#B8860B', text: '#1C1917', photoId: '129', overlay: 'light' },
  // YouTube → 1280×720 (Thumbnail)
  { id: 'yt-gaming',       cat: 'YouTube',    name: 'Gaming Thumbnail',  bg: '#0F0F0F', accent: '#FF0000', text: '#FFFFFF' },
  { id: 'yt-education',    cat: 'YouTube',    name: 'Education',         bg: '#FFF8E1', accent: '#F57F17', text: '#1A1A1A' },
  { id: 'yt-vlog',         cat: 'YouTube',    name: 'Vlog Thumbnail',    bg: '#E8F5E9', accent: '#2E7D32', text: '#1B5E20' },
  { id: 'yt-tech',         cat: 'YouTube',    name: 'Tech Thumbnail',    bg: '#E3F2FD', accent: '#1565C0', text: '#0D47A1' },
  { id: 'yt-podcast',      cat: 'YouTube',    name: 'Podcast Thumbnail', bg: '#1E1B4B', accent: '#818CF8', text: '#E0E7FF' },
  { id: 'yt-beauty',       cat: 'YouTube',    name: 'Beauty Thumbnail',  bg: '#FFF1F2', accent: '#FB7185', text: '#881337' },
  { id: 'yt-travel',       cat: 'YouTube',    name: 'Travel Thumbnail',  bg: '#052E16', accent: '#FACC15', text: '#FFFFFF', photoId: '1043' },
].map((t) => ({ ...t, width: (t as any).width ?? CATEGORY_SIZE[t.cat]?.width, height: (t as any).height ?? CATEGORY_SIZE[t.cat]?.height }));

const TEXT_PRESETS = [
  { label: 'Add a heading',           fontSize: 48, fontWeight: 700, color: '#111827' },
  { label: 'Add a subheading',        fontSize: 32, fontWeight: 600, color: '#374151' },
  { label: 'Add body text',           fontSize: 18, fontWeight: 400, color: '#4B5563' },
  { label: 'Add a caption',           fontSize: 13, fontWeight: 400, color: '#9CA3AF' },
];

const FONT_COMBOS = [
  { heading: 'Playfair Display', body: 'Source Sans 3', hw: 700, bw: 400 },
  { heading: 'Montserrat',       body: 'Lato',           hw: 800, bw: 400 },
  { heading: 'Oswald',           body: 'Open Sans',      hw: 600, bw: 400 },
  { heading: 'Raleway',          body: 'Merriweather',   hw: 700, bw: 400 },
];

function ShapePreview({ shape, color }: { shape: string; color: string }) {
  switch (shape) {
    case 'circle':   return <div className="w-7 h-7 rounded-full" style={{ background: color }} />;
    case 'triangle': return <svg viewBox="0 0 24 24" className="w-7 h-7"><polygon points="12,2 22,22 2,22" fill={color}/></svg>;
    case 'star':     return <svg viewBox="0 0 24 24" className="w-7 h-7"><polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9" fill={color}/></svg>;
    case 'pentagon': return <svg viewBox="0 0 24 24" className="w-7 h-7"><polygon points="12,2 22,9 18,21 6,21 2,9" fill={color}/></svg>;
    case 'hexagon':  return <svg viewBox="0 0 24 24" className="w-7 h-7"><polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill={color}/></svg>;
    case 'arrow':    return <svg viewBox="0 0 24 24" className="w-7 h-7"><polygon points="2,9 15,9 15,5 22,12 15,19 15,15 2,15" fill={color}/></svg>;
    case 'line':     return <svg viewBox="0 0 24 24" className="w-7 h-7"><line x1="2" y1="12" x2="22" y2="12" stroke={color} strokeWidth="3" strokeLinecap="round"/></svg>;
    case 'heart':    return <svg viewBox="0 0 24 24" className="w-7 h-7"><path d="M12 21C12 21 3 14 3 8a5 5 0 019-3 5 5 0 019 3c0 6-9 13-9 13z" fill={color}/></svg>;
    case 'diamond':  return <svg viewBox="0 0 24 24" className="w-7 h-7"><polygon points="12,2 22,12 12,22 2,12" fill={color}/></svg>;
    default:         return <div className="w-7 h-7 rounded" style={{ background: color }} />;
  }
}

export default function LeftSidebar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>('templates');
  const [panelOpen, setPanelOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [iconCat, setIconCat] = useState('All');
  const [iconColor, setIconColor] = useState('#6366F1');
  const [iconSearch, setIconSearch] = useState('');
  const [iconifyResults, setIconifyResults] = useState<{ name: string; prefix: string; body: string; width: number; height: number }[]>([]);
  const [iconifyLoading, setIconifyLoading] = useState(false);
  const [stickerCat, setStickerCat] = useState('Trending');
  const [stickerSearch, setStickerSearch] = useState('');
  const [stickerResults, setStickerResults] = useState<{ id: string; url: string; thumb: string }[]>([]);
  const [stickerLoading, setStickerLoading] = useState(false);
  const [showBgColorOptions, setShowBgColorOptions] = useState(false);
  const [bgPhotoCategory, setBgPhotoCategory] = useState<string | null>(null);
  const [bgPhotoResults, setBgPhotoResults] = useState<{ url: string; title: string }[]>([]);
  const [bgPhotoLoading, setBgPhotoLoading] = useState(false);
  const [aiTemplatePrompt, setAiTemplatePrompt] = useState('');
  const [aiTemplateGenerating, setAiTemplateGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiTab, setAiTab] = useState<'write' | 'image' | 'suggest'>('write');
  const [aiConfiguredProviders, setAiConfiguredProviders] = useState<string[]>([]);
  const [aiReferenceImages, setAiReferenceImages] = useState<{ dataUrl: string; name: string }[]>([]);

  // Landed here from a Dashboard "Magic AI Studio" quick-action card (?ai=write/image/
  // suggest) — those used to just create a blank design and tell the user to go find
  // the AI tab themselves via a toast; this opens it directly instead.
  useEffect(() => {
    const ai = searchParams.get('ai');
    if (ai === 'write' || ai === 'image' || ai === 'suggest') {
      setActiveTab('ai');
      setPanelOpen(true);
      setAiTab(ai);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  useEffect(() => {
    if (activeTab !== 'ai' && activeTab !== 'templates') return;
    aiSettingsAPI
      .list()
      .then(({ data }) => {
        const active = (data as { provider: string; isActive: boolean }[])
          .filter((s) => s.isActive)
          .map((s) => s.provider);
        setAiConfiguredProviders(active);
      })
      .catch((err) => console.error('[AI] failed to load configured providers', err));
  }, [activeTab]);

  // Auto-load Trending once when the Elements tab is first opened — matches the
  // reference screenshot showing content immediately rather than requiring a
  // search first. Guarded so revisiting the tab doesn't refetch every time.
  useEffect(() => {
    if (activeTab === 'elements' && stickerResults.length === 0 && !stickerLoading && import.meta.env.VITE_TENOR_API_KEY) {
      handleStickerSearch('Trending');
    }
  }, [activeTab]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiRefFileInputRef = useRef<HTMLInputElement>(null);

  const AI_MAX_REFERENCE_IMAGES = 6;

  const handleAiReferenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    const room = AI_MAX_REFERENCE_IMAGES - aiReferenceImages.length;
    if (room <= 0) { toast.error(`Up to ${AI_MAX_REFERENCE_IMAGES} reference images`); return; }
    const toAdd = files.slice(0, room);
    if (files.length > toAdd.length) toast.error(`Only added ${toAdd.length} — up to ${AI_MAX_REFERENCE_IMAGES} reference images`);
    toAdd.forEach((file) => {
      if (!file.type.startsWith('image/')) { toast.error(`${file.name} isn't an image`); return; }
      const reader = new FileReader();
      reader.onload = () => setAiReferenceImages((prev) => [...prev, { dataUrl: reader.result as string, name: file.name }]);
      reader.readAsDataURL(file);
    });
  };

  const {
    addElement, removeElements, pushHistory, pages, currentPageIndex, setPageBackgroundColor, updatePage, importDocumentPages,
    activeTool, setActiveTool, drawColor, setDrawColor, drawWidth, setDrawWidth,
  } = useEditorStore();
  const currentPage = pages[currentPageIndex];
  const cw = currentPage?.width ?? 1920;
  const ch = currentPage?.height ?? 1080;
  const cx = cw / 2 - 150;
  const cy = ch / 2 - 75;

  const jitter = () => Math.random() * 40 - 20;

  const handleAddShape = (shape: typeof SHAPE_TYPES[number], i: number) => {
    const color = SHAPE_COLORS[i % SHAPE_COLORS.length];
    addElement({
      type: 'shape', x: cx + jitter(), y: cy + jitter(),
      width: shape === 'line' ? 300 : 200, height: shape === 'line' ? 4 : 200,
      rotation: 0, opacity: 1, visible: true, locked: false,
      name: shape.charAt(0).toUpperCase() + shape.slice(1), zIndex: 0,
      data: { type: 'shape', shapeType: shape, fill: color, stroke: 'transparent', strokeWidth: 0, cornerRadius: 0 },
    });
    pushHistory();
  };

  const handleAddText = (preset: typeof TEXT_PRESETS[number]) => {
    addElement({
      type: 'text', x: cx, y: cy + jitter(),
      width: 700, height: preset.fontSize * 1.5,
      rotation: 0, opacity: 1, visible: true, locked: false, name: 'Text', zIndex: 0,
      data: {
        type: 'text', content: preset.label,
        fontFamily: 'Inter', fontSize: preset.fontSize, fontWeight: preset.fontWeight,
        fontStyle: 'normal', textDecoration: 'none', textAlign: 'left',
        color: preset.color, lineHeight: 1.4, letterSpacing: 0, textTransform: 'none',
      },
    });
    pushHistory();
  };

  const handleAddPageNumber = () => {
    addElement({
      type: 'text', x: cw - 120, y: ch - 60,
      width: 100, height: 30,
      rotation: 0, opacity: 1, visible: true, locked: false, name: 'Page Number', zIndex: 0,
      data: {
        type: 'text', content: `${currentPageIndex + 1}`,
        fontFamily: 'Inter', fontSize: 18, fontWeight: 400,
        fontStyle: 'normal', textDecoration: 'none', textAlign: 'center',
        color: '#9CA3AF', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none',
      },
    });
    pushHistory();
  };

  const handleAddFontCombo = (combo: typeof FONT_COMBOS[number]) => {
    addElement({
      type: 'text', x: cx, y: cy - 60, width: 700, height: 70,
      rotation: 0, opacity: 1, visible: true, locked: false, name: 'Heading', zIndex: 0,
      data: { type: 'text', content: 'Add your heading here', fontFamily: combo.heading, fontSize: 48, fontWeight: combo.hw, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#111827', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' },
    });
    addElement({
      type: 'text', x: cx, y: cy + 20, width: 700, height: 36,
      rotation: 0, opacity: 1, visible: true, locked: false, name: 'Body', zIndex: 0,
      data: { type: 'text', content: 'Supporting sentence or two goes here.', fontFamily: combo.body, fontSize: 22, fontWeight: combo.bw, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#6B7280', lineHeight: 1.5, letterSpacing: 0, textTransform: 'none' },
    });
    pushHistory();
  };

  const handleAddIcon = (icon: typeof ICON_LIBRARY[number]) => {
    // cx/cy above are calibrated for the ~300x150 default element footprint used
    // elsewhere in this panel; icons need their own exact-center math at 100x100.
    const ICON_SIZE = 80;
    addElement({
      type: 'icon' as any, x: cw / 2 - ICON_SIZE / 2, y: ch / 2 - ICON_SIZE / 2,
      width: ICON_SIZE, height: ICON_SIZE,
      rotation: 0, opacity: 1, visible: true, locked: false, name: icon.name, zIndex: 0,
      data: { type: 'icon', iconSet: 'heroicons', iconName: icon.name, svgPath: icon.path, fill: iconColor, viewBoxWidth: 20, viewBoxHeight: 20 } as any,
    });
    pushHistory();
  };

  const handleApplyTemplate = (tpl: typeof BUILT_IN_TEMPLATES[number]) => {
    // Picking a different template should REPLACE the design, not stack a new accent
    // bar/title/subtitle on top of whatever a previous template click already added —
    // otherwise every click layers more overlapping duplicates on the same page.
    const existingTemplateElementIds = pages[currentPageIndex].elements
      .filter((e) => ['Accent Bar', 'Title', 'Subtitle', 'Background Photo', 'Photo Overlay'].includes(e.name))
      .map((e) => e.id);
    if (existingTemplateElementIds.length > 0) removeElements(existingTemplateElementIds);

    // Resize to the template's canonical size (Facebook/Instagram/YouTube/etc.) instead
    // of leaving whatever canvas happened to be open — matches Canva's format behavior.
    const tw = tpl.width ?? cw;
    const th = tpl.height ?? ch;
    if (tpl.width && tpl.height) {
      updatePage(currentPageIndex, { width: tpl.width, height: tpl.height });
    }

    const photoId = (tpl as any).photoId as string | undefined;
    if (photoId) {
      // Same technique as the standalone "Add background photo" feature — Picsum
      // crops server-side to exactly tw x th, so it fills any page format cleanly.
      addElement({
        type: 'image', x: 0, y: 0, width: tw, height: th,
        rotation: 0, opacity: 1, visible: true, locked: false, name: 'Background Photo', zIndex: 0,
        data: {
          type: 'image', objectFit: 'cover', borderRadius: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [],
          src: `https://picsum.photos/id/${photoId}/${Math.round(tw)}/${Math.round(th)}`,
          cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100,
        } as any,
      });
      addElement({
        type: 'shape', x: 0, y: 0, width: tw, height: th,
        rotation: 0, opacity: 1, visible: true, locked: false, name: 'Photo Overlay', zIndex: 0,
        data: {
          type: 'shape', shapeType: 'rectangle',
          fill: (tpl as any).overlay === 'light' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.35)',
          stroke: 'transparent', strokeWidth: 0, cornerRadius: 0,
        },
      });
    } else {
      setPageBackgroundColor(currentPageIndex, tpl.bg);
    }
    addElement({
      type: 'shape', x: 0, y: 0, width: tw, height: 8,
      rotation: 0, opacity: 1, visible: true, locked: false, name: 'Accent Bar', zIndex: 0,
      data: { type: 'shape', shapeType: 'rectangle', fill: tpl.accent, stroke: 'transparent', strokeWidth: 0, cornerRadius: 0 },
    });
    addElement({
      type: 'text', x: 100, y: th * 0.35, width: tw - 200, height: 120,
      rotation: 0, opacity: 1, visible: true, locked: false, name: 'Title', zIndex: 0,
      data: { type: 'text', content: tpl.name + ' Design', fontFamily: 'Inter', fontSize: 80, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: tpl.text, lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' },
    });
    addElement({
      type: 'text', x: 100, y: th * 0.55, width: tw - 200, height: 50,
      rotation: 0, opacity: 1, visible: true, locked: false, name: 'Subtitle', zIndex: 0,
      data: { type: 'text', content: 'Your subtitle goes here', fontFamily: 'Inter', fontSize: 36, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: tpl.accent === '#FFFFFF' ? 'rgba(255,255,255,0.7)' : tpl.accent, lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' },
    });
    pushHistory();
  };

  // "Describe your ideal design" — same replace-not-stack + accent/title/subtitle layout
  // as handleApplyTemplate, but the copy comes from AI instead of a fixed template, and
  // the color scheme is picked from a curated palette (asking the model for hex codes
  // and parsing them back out reliably is more trouble than it's worth here).
  const handleGenerateTemplateFromPrompt = async () => {
    if (!aiTemplatePrompt.trim()) { toast.error('Describe what you want to create first'); return; }
    const token = localStorage.getItem('designhub-token');
    if (!token) { toast.error('Please log in to use AI generation'); return; }

    const provider = aiConfiguredProviders.includes('anthropic')
      ? 'anthropic'
      : aiConfiguredProviders.includes('openai')
      ? 'openai'
      : 'anthropic';

    setAiTemplateGenerating(true);
    console.log('[AI] generate template request', { provider, prompt: aiTemplatePrompt });
    try {
      const { data } = await aiAPI.generate({
        provider,
        type: 'text',
        prompt: `Design brief: ${aiTemplatePrompt}\n\nRespond with EXACTLY two lines, nothing else:\nLine 1: a short punchy headline (max 6 words)\nLine 2: a one-sentence supporting subtitle (max 12 words)`,
      });
      const content: string = data.content || '';
      if (!content) throw new Error('AI provider returned no content');

      const lines = content.split('\n').map((l) => l.replace(/^(line\s*\d[:.]?\s*)/i, '').trim()).filter(Boolean);
      const title = (lines[0] || aiTemplatePrompt).slice(0, 60);
      const subtitle = (lines[1] || 'Your subtitle goes here').slice(0, 100);
      const palette = AI_DESIGN_PALETTES[Math.floor(Math.random() * AI_DESIGN_PALETTES.length)];

      const existingTemplateElementIds = pages[currentPageIndex].elements
        .filter((e) => e.name === 'Accent Bar' || e.name === 'Title' || e.name === 'Subtitle')
        .map((e) => e.id);
      if (existingTemplateElementIds.length > 0) removeElements(existingTemplateElementIds);

      setPageBackgroundColor(currentPageIndex, palette.bg);
      addElement({
        type: 'shape', x: 0, y: 0, width: cw, height: 8,
        rotation: 0, opacity: 1, visible: true, locked: false, name: 'Accent Bar', zIndex: 0,
        data: { type: 'shape', shapeType: 'rectangle', fill: palette.accent, stroke: 'transparent', strokeWidth: 0, cornerRadius: 0 },
      });
      addElement({
        type: 'text', x: 100, y: ch * 0.35, width: cw - 200, height: 120,
        rotation: 0, opacity: 1, visible: true, locked: false, name: 'Title', zIndex: 0,
        data: { type: 'text', content: title, fontFamily: 'Inter', fontSize: 80, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: palette.text, lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' },
      });
      addElement({
        type: 'text', x: 100, y: ch * 0.55, width: cw - 200, height: 50,
        rotation: 0, opacity: 1, visible: true, locked: false, name: 'Subtitle', zIndex: 0,
        data: { type: 'text', content: subtitle, fontFamily: 'Inter', fontSize: 36, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: palette.accent === '#FFFFFF' ? 'rgba(255,255,255,0.7)' : palette.accent, lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' },
      });
      pushHistory();
      toast.success('Design generated');
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Design generation failed';
      console.error('[AI] generate template failed', err);
      toast.error(message);
    } finally {
      setAiTemplateGenerating(false);
    }
  };

  // Replace, not stack — same pattern as handleApplyTemplate, so picking a different
  // photo swaps the background instead of layering photos on top of each other.
  // Inserted unlocked (not full-page-locked) so it behaves like any other image —
  // the user can select it and resize/move it, e.g. to cover only half the page,
  // instead of being stuck at exactly full-page size.
  const replaceBackgroundPhotoElement = (data: Record<string, unknown>) => {
    const existingId = pages[currentPageIndex].elements.find((e) => e.name === 'Background Photo')?.id;
    if (existingId) removeElements([existingId]);
    addElement({
      type: 'image', x: 0, y: 0, width: cw, height: ch,
      rotation: 0, opacity: 1, visible: true, locked: false, name: 'Background Photo', zIndex: 0,
      data: {
        type: 'image', objectFit: 'cover', borderRadius: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0,
        filters: [], ...data,
      } as any,
    });
    pushHistory();
    toast.success('Background photo added — drag or resize it like any image');
  };

  const handleAddBackgroundPhoto = (photoId: string) => {
    // Picsum crops server-side to exactly the requested pixel size, so no client-side
    // crop math is needed here — it already fills cw×ch on any page format (Facebook,
    // Instagram Story, etc.) without distortion.
    replaceBackgroundPhotoElement({
      src: `https://picsum.photos/id/${photoId}/${Math.round(cw)}/${Math.round(ch)}`,
      cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100,
    });
  };

  // Wikimedia results are fixed-size thumbnails at their native aspect ratio, which
  // rarely matches the page (e.g. a square photo on a 1200x630 Facebook Post canvas)
  // — since the renderer doesn't implement `objectFit` itself, stretching it to
  // cw x ch directly would visibly distort it. Instead: load it to read its natural
  // size, then compute a "cover" crop in the same cropX/Y/Width/Height percentage
  // fields the image crop tool already uses, so it fills the page cleanly on any size.
  const handleAddSearchedBackgroundPhoto = (url: string) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const targetRatio = cw / ch;
      const srcRatio = img.naturalWidth / img.naturalHeight;
      let cropX = 0, cropY = 0, cropWidth = 100, cropHeight = 100;
      if (srcRatio > targetRatio) {
        cropWidth = (targetRatio / srcRatio) * 100;
        cropX = (100 - cropWidth) / 2;
      } else if (srcRatio < targetRatio) {
        cropHeight = (srcRatio / targetRatio) * 100;
        cropY = (100 - cropHeight) / 2;
      }
      replaceBackgroundPhotoElement({ src: url, cropX, cropY, cropWidth, cropHeight });
    };
    img.onerror = () => toast.error('Could not load that photo — try another');
    img.src = url;
  };

  const handleSearchBackgroundCategory = async (category: { label: string; query: string }) => {
    setBgPhotoCategory(category.label);
    setBgPhotoLoading(true);
    setBgPhotoResults([]);
    try {
      const params = new URLSearchParams({
        action: 'query', generator: 'search', gsrsearch: category.query, gsrnamespace: '6',
        gsrlimit: '12', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '400', format: 'json', origin: '*',
      });
      const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      const pages: any[] = Object.values(data.query?.pages || {});
      const results = pages
        .filter((p) => p.imageinfo?.[0]?.thumburl)
        .map((p) => ({ url: p.imageinfo[0].thumburl as string, title: (p.title as string).replace(/^File:/, '').replace(/\.\w+$/, '') }));
      setBgPhotoResults(results);
      if (results.length === 0) toast.error(`No ${category.label.toLowerCase()} photos found — try a different category`);
    } catch (err) {
      console.error('[BackgroundPhotos] search failed', err);
      toast.error('Photo search failed — check your connection');
    } finally {
      setBgPhotoLoading(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) { toast.error('Enter a prompt first'); return; }
    const token = localStorage.getItem('designhub-token');
    if (!token) { toast.error('Please log in to use AI generation'); return; }

    const isImage = aiTab === 'image';
    // Only OpenAI supports image generation; text tabs use whichever provider the user has configured.
    const provider = isImage
      ? 'openai'
      : aiConfiguredProviders.includes('anthropic')
      ? 'anthropic'
      : aiConfiguredProviders.includes('openai')
      ? 'openai'
      : 'anthropic';

    const prompt = aiTab === 'write'
      ? `Write compelling design copy for: ${aiPrompt}. Provide 2-3 short punchy lines suitable for a visual design. Format: just the text, no explanations.`
      : aiTab === 'suggest'
      ? `Suggest design ideas for: ${aiPrompt}. Give 3 specific visual design suggestions with colors, fonts, and layout ideas. Keep each suggestion to 1-2 sentences.`
      : isImage && aiReferenceImages.length > 0
      ? `${aiPrompt}. Incorporate the attached logo/reference image${aiReferenceImages.length > 1 ? 's' : ''} naturally into the design.`
      : aiPrompt;

    console.log('[AI] generate request', { provider, type: isImage ? 'image' : 'text', aiTab });
    setAiGenerating(true);
    setAiResult('');
    try {
      const { data } = await aiAPI.generate({
        provider, prompt, type: isImage ? 'image' : 'text',
        ...(isImage && aiReferenceImages.length > 0 ? { referenceImages: aiReferenceImages.map((r) => r.dataUrl) } : {}),
      });
      console.log('[AI] generate response received', { hasContent: !!data.content, contentType: data.contentType });
      let content: string = data.content || '';
      if (!content) throw new Error('AI provider returned no content');

      // Image generation (gpt-image-1) always returns base64, which the backend
      // persists to disk and hands back as a relative /uploads/... path — resolve
      // it against the backend's own origin, same as every other /uploads/ URL in
      // this file, or it 404s against the frontend's origin instead.
      if (isImage && content.startsWith('/uploads/')) {
        const BACKEND = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';
        content = `${BACKEND}${content}`;
      }

      setAiResult(content);

      if (aiTab === 'write') {
        addElement({
          type: 'text', x: cx, y: cy, width: 700, height: 120,
          rotation: 0, opacity: 1, visible: true, locked: false, name: 'AI Text', zIndex: 0,
          data: { type: 'text', content: content.slice(0, 200), fontFamily: 'Inter', fontSize: 32, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#111827', lineHeight: 1.4, letterSpacing: 0, textTransform: 'none' },
        });
        pushHistory();
        toast.success('AI text added to canvas');
      } else {
        toast.success(isImage ? 'Image generated' : 'Ideas generated');
      }
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'AI generation failed';
      console.error('[AI] generate failed', err);
      toast.error(message);
    } finally {
      setAiGenerating(false);
    }
  };

  // Tenor's public "demo" key was retired — this genuinely needs a real (free)
  // key from https://console.cloud.google.com (Tenor API), same pattern as the
  // other optional integrations (Pexels, LottieFiles) configured via VITE_ env vars.
  const handleStickerSearch = async (query: string) => {
    const key = import.meta.env.VITE_TENOR_API_KEY;
    if (!key) return;
    setStickerLoading(true);
    try {
      const endpoint = query.toLowerCase() === 'trending'
        ? `https://tenor.googleapis.com/v2/featured?key=${key}&searchfilter=sticker&media_filter=gif&limit=30`
        : `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${key}&searchfilter=sticker&media_filter=gif&limit=30`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      const results = (data.results || [])
        .map((r: any) => ({
          id: r.id,
          url: r.media_formats?.gif?.url || r.media_formats?.tinygif?.url,
          thumb: r.media_formats?.tinygif?.url || r.media_formats?.gif?.url,
        }))
        .filter((r: any) => r.url);
      setStickerResults(results);
    } catch {
      toast.error('Sticker search failed — check your connection');
      setStickerResults([]);
    } finally {
      setStickerLoading(false);
    }
  };

  // Sized to the sticker's own aspect ratio (capped) rather than a fixed square,
  // same reasoning as addVideoToCanvas — most stickers aren't perfectly square.
  const addStickerToCanvas = (url: string, name: string) => {
    const probe = new window.Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => {
      const nw = probe.naturalWidth || 200;
      const nh = probe.naturalHeight || 200;
      const maxSize = 220;
      const scale = Math.min(1, maxSize / Math.max(nw, nh));
      const w = Math.round(nw * scale);
      const h = Math.round(nh * scale);
      addElement({
        type: 'image', x: cx, y: cy, width: w, height: h,
        rotation: 0, opacity: 1, visible: true, locked: false, name, zIndex: 0,
        data: { type: 'image', src: url, animated: true, objectFit: 'contain', borderRadius: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 },
      });
      pushHistory();
      toast.success('Sticker added to canvas');
    };
    probe.onerror = () => toast.error('Could not load that sticker');
    probe.src = url;
  };

  const handleIconifySearch = async (query: string) => {
    if (!query.trim()) { setIconifyResults([]); return; }
    setIconifyLoading(true);
    try {
      // Search Iconify — free, no key needed, CORS-enabled
      const res = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=40&pretty=0`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      const iconNames: string[] = data.icons || [];

      // Group by prefix, fetch data for each unique prefix
      const byPrefix: Record<string, string[]> = {};
      iconNames.forEach((full) => {
        const colon = full.indexOf(':');
        if (colon === -1) return;
        const prefix = full.slice(0, colon);
        const name = full.slice(colon + 1);
        (byPrefix[prefix] = byPrefix[prefix] || []).push(name);
      });

      const results: { name: string; prefix: string; body: string; width: number; height: number }[] = [];
      await Promise.all(
        Object.entries(byPrefix).slice(0, 4).map(async ([prefix, names]) => {
          try {
            const r = await fetch(`https://api.iconify.design/${prefix}.json?icons=${names.slice(0, 10).join(',')}`);
            if (!r.ok) return;
            const d = await r.json();
            Object.entries(d.icons || {}).forEach(([n, v]: [string, any]) => {
              // Per-icon size overrides the icon set's default — icons within one set aren't always square.
              results.push({
                name: n, prefix, body: v.body || '',
                width: v.width || d.width || 24,
                height: v.height || d.height || 24,
              });
            });
          } catch {}
        })
      );
      setIconifyResults(results.slice(0, 36));
    } catch {
      toast.error('Icon search failed — check internet connection');
    } finally {
      setIconifyLoading(false);
    }
  };

  const handleAddIconifyIcon = (icon: { name: string; prefix: string; body: string; width: number; height: number }) => {
    // Parse every drawable shape in the SVG body — not just <path> — so icons built
    // from <circle>/<rect>/<ellipse>/<polygon>/<line> don't get silently dropped
    // (that was rendering as broken/incomplete icons).
    const { paths, fills } = parseSvgShapes(icon.body);
    if (paths.length === 0) {
      toast.error('This icon has no drawable shapes');
      return;
    }
    // cx/cy are calibrated for the ~300x150 default element footprint used elsewhere
    // in this panel; icons need their own exact-center math at 100x100.
    const ICON_SIZE = 80;
    addElement({
      type: 'icon' as any, x: cw / 2 - ICON_SIZE / 2, y: ch / 2 - ICON_SIZE / 2,
      width: ICON_SIZE, height: ICON_SIZE,
      rotation: 0, opacity: 1, visible: true, locked: false, name: `${icon.prefix}:${icon.name}`, zIndex: 0,
      data: {
        type: 'icon', iconSet: icon.prefix, iconName: icon.name,
        svgPaths: paths, iconFills: fills, viewBoxWidth: icon.width, viewBoxHeight: icon.height, fill: iconColor,
      } as any,
    });
    pushHistory();
    toast.success(`${icon.name} added`);
  };

  type UploadedFile = {
    id: string;
    name: string;
    url: string;
    type: string;
    size: string;
    progress: number; // 0-100, 100 = done
    error?: string;
    canvasable: boolean; // can be dragged to canvas
    thumbnail?: string; // base64 thumbnail for images
  };

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const getFileCategory = (mime: string, name: string): 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'sheet' | 'slides' | 'text' | 'svg' | 'unknown' => {
    if (mime === 'image/svg+xml' || name.toLowerCase().endsWith('.svg')) return 'svg';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime === 'application/pdf') return 'pdf';
    if (mime.includes('word') || mime.includes('document') || /\.(doc|docx)$/i.test(name)) return 'doc';
    if (mime.includes('sheet') || mime.includes('excel') || /\.(xls|xlsx|csv)$/i.test(name)) return 'sheet';
    if (mime.includes('presentation') || mime.includes('powerpoint') || /\.(ppt|pptx)$/i.test(name)) return 'slides';
    if (mime === 'text/plain' || mime === 'text/csv' || /\.(txt|csv)$/i.test(name)) return 'text';
    return 'unknown';
  };

  const FILE_CAT_META: Record<string, { icon: string; label: string; color: string }> = {
    image:   { icon: '🖼️', label: 'Image',        color: '#6366F1' },
    svg:     { icon: '✏️', label: 'SVG',           color: '#8B5CF6' },
    video:   { icon: '🎬', label: 'Video',         color: '#EF4444' },
    audio:   { icon: '🎵', label: 'Audio',         color: '#F59E0B' },
    pdf:     { icon: '📄', label: 'PDF',           color: '#EC4899' },
    doc:     { icon: '📝', label: 'Word',          color: '#3B82F6' },
    sheet:   { icon: '📊', label: 'Spreadsheet',  color: '#10B981' },
    slides:  { icon: '📑', label: 'Slides',       color: '#F97316' },
    text:    { icon: '📃', label: 'Text',          color: '#6B7280' },
    unknown: { icon: '📁', label: 'File',          color: '#9CA3AF' },
  };

  const fmtSize = (bytes: number) =>
    bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

  const addImageToCanvas = (url: string, name: string, w = 500, h = 375) => {
    addElement({
      type: 'image', x: cx, y: cy, width: w, height: h,
      rotation: 0, opacity: 1, visible: true, locked: false, name, zIndex: 0,
      data: { type: 'image', src: url, objectFit: 'cover', borderRadius: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 },
    });
    pushHistory();
    toast.success(`${name} added to canvas`);
  };

  // Reads the video's real dimensions first (same technique as loadImageSize for
  // template uploads) so it lands on the canvas at its own aspect ratio instead of a
  // guessed default that would look stretched.
  const addVideoToCanvas = (url: string, name: string) => {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const nw = probe.videoWidth || 640;
      const nh = probe.videoHeight || 360;
      const maxW = 500;
      const w = Math.min(maxW, nw);
      const h = w * (nh / nw);
      addElement({
        type: 'video', x: cx, y: cy, width: w, height: h,
        rotation: 0, opacity: 1, visible: true, locked: false, name, zIndex: 0,
        data: { type: 'video', src: url, autoplay: true, loop: true, muted: true, startTime: 0, endTime: 0 },
      });
      pushHistory();
      toast.success(`${name} added to canvas`);
    };
    probe.onerror = () => toast.error('Could not read that video file');
    probe.src = url;
  };

  const BACKEND = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

  // Import categories the editor can turn into editable canvas content, as opposed to
  // video/audio which are just stored and opened externally.
  const IMPORTABLE_CATS = ['image', 'svg', 'pdf', 'doc', 'sheet', 'slides', 'text'];

  // Shared by fresh uploads (processFile) and re-opening a previously uploaded file
  // (handleImportExistingFile) — both end up with a real File object + its server URL
  // and just need the same "turn this into editable canvas content" logic.
  const importFileIntoCanvas = async (file: File, serverUrl: string, matchId: string) => {
    const cat = getFileCategory(file.type, file.name);
    try {
      // ── IMAGE ────────────────────────────────────────────────────────
      if (cat === 'image') {
        const img = new window.Image();
        img.onload = () => {
          const w = Math.min(img.naturalWidth || 500, Math.round(cw * 0.7));
          const h = img.naturalWidth ? Math.round((img.naturalHeight / img.naturalWidth) * w) : 375;
          addElement({
            type: 'image', x: cx, y: cy, width: w, height: h,
            rotation: 0, opacity: 1, visible: true, locked: false, name: file.name, zIndex: 0,
            data: { type: 'image', src: serverUrl, objectFit: 'cover', borderRadius: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 },
          });
          pushHistory();
          setUploadedFiles((prev) => prev.map((f) => f.id === matchId ? { ...f, progress: 100, canvasable: true, thumbnail: serverUrl } : f));
          toast.success(`${file.name} added to canvas`);
        };
        img.onerror = () => {
          addElement({
            type: 'image', x: cx, y: cy, width: 500, height: 375,
            rotation: 0, opacity: 1, visible: true, locked: false, name: file.name, zIndex: 0,
            data: { type: 'image', src: serverUrl, objectFit: 'cover', borderRadius: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 },
          });
          pushHistory();
          setUploadedFiles((prev) => prev.map((f) => f.id === matchId ? { ...f, progress: 100, canvasable: true, thumbnail: serverUrl } : f));
        };
        img.src = serverUrl;
        return;
      }

      // ── SVG ──────────────────────────────────────────────────────────
      if (cat === 'svg') {
        const result = await importSVG(file);
        addElement({
          type: 'image', x: cx, y: cy, width: result.width, height: result.height,
          rotation: 0, opacity: 1, visible: true, locked: false, name: file.name, zIndex: 0,
          data: { type: 'image', src: result.dataUrl, objectFit: 'contain', borderRadius: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 },
        });
        pushHistory();
        setUploadedFiles((prev) => prev.map((f) => f.id === matchId ? { ...f, progress: 100, canvasable: true, thumbnail: result.dataUrl } : f));
        toast.success(`${file.name} imported as SVG`);
        return;
      }

      // ── PDF → one canvas page per PDF page ───────────────────────────
      if (cat === 'pdf') {
        toast.loading(`Rendering PDF pages…`, { id: matchId });
        const pageImages = await importPDF(file);
        toast.dismiss(matchId);

        importDocumentPages(pageImages.map((pg, i) => ({
          name: `${file.name} – Page ${i + 1}`,
          width: pg.width,
          height: pg.height,
          backgroundColor: '#FFFFFF',
          elements: [
            {
              type: 'image' as const,
              x: 0, y: 0, width: pg.width, height: pg.height,
              rotation: 0, opacity: 1, visible: true, locked: false,
              name: `Page ${i + 1} Background`, zIndex: 0,
              data: {
                type: 'image' as const, src: pg.dataUrl,
                objectFit: 'contain' as const, borderRadius: 0,
                brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0,
                filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100,
              },
            },
            // Real text runs pulled from the PDF, laid on top of the (now text-masked)
            // background image so they're editable instead of flattened pixels.
            ...(pg.textLines || []).map((line, li) => ({
              type: 'text' as const,
              x: line.x, y: line.y, width: Math.max(line.width, 20), height: Math.max(line.height, line.fontSize * 1.3),
              rotation: 0, opacity: 1, visible: true, locked: false,
              name: `Page ${i + 1} Text ${li + 1}`, zIndex: li + 1,
              data: {
                type: 'text' as const, content: line.text,
                fontFamily: 'Inter', fontSize: Math.max(6, Math.round(line.fontSize)), fontWeight: 400,
                fontStyle: 'normal' as const, textDecoration: 'none' as const, textAlign: 'left' as const,
                color: '#111827', lineHeight: 1.15, letterSpacing: 0, textTransform: 'none' as const,
              },
            })),
          ],
        })));

        setUploadedFiles((prev) => prev.map((f) => f.id === matchId ? {
          ...f, progress: 100, canvasable: true, thumbnail: pageImages[0]?.dataUrl,
        } : f));
        const textLineCount = pageImages.reduce((n, pg) => n + (pg.textLines?.length || 0), 0);
        toast.success(
          textLineCount > 0
            ? `${file.name}: ${pageImages.length} page${pageImages.length > 1 ? 's' : ''} imported — text is editable`
            : `${file.name}: ${pageImages.length} page${pageImages.length > 1 ? 's' : ''} imported`
        );
        return;
      }

      // ── SPREADSHEET → editable table on current page ─────────────────
      if (cat === 'sheet') {
        const ext = file.name.split('.').pop()?.toLowerCase();
        const table = ext === 'csv' ? await importCSV(file) : await importXLSX(file);
        const rows = Math.min(table.rows, 50);
        const cols = Math.min(table.cols, 20);
        const cells = table.cells.slice(0, rows).map((r) => r.slice(0, cols));
        const CELL_W = Math.min(120, Math.floor((cw * 0.9) / Math.max(cols, 1)));
        const CELL_H = 36;
        addElement({
          type: 'table',
          x: Math.max(0, cx - (CELL_W * cols) / 2),
          y: Math.max(0, cy - (CELL_H * rows) / 2),
          width: CELL_W * cols, height: CELL_H * rows,
          rotation: 0, opacity: 1, visible: true, locked: false, name: file.name, zIndex: 0,
          data: {
            type: 'table', rows, cols, cells,
            headerRow: true, borderColor: '#E5E7EB',
            headerBgColor: '#6366F1', headerTextColor: '#FFFFFF', cellTextColor: '#111827',
          },
        });
        pushHistory();
        setUploadedFiles((prev) => prev.map((f) => f.id === matchId ? { ...f, progress: 100, canvasable: true } : f));
        toast.success(`${file.name} imported as editable table`);
        return;
      }

      // ── PLAIN TEXT → text element on current page ────────────────────
      if (cat === 'text') {
        const text = await file.text();
        addElement({
          type: 'text', x: cx, y: cy, width: Math.min(cw * 0.8, 900), height: 400,
          rotation: 0, opacity: 1, visible: true, locked: false, name: file.name, zIndex: 0,
          data: {
            type: 'text', content: text.slice(0, 2000),
            fontFamily: 'Courier New', fontSize: 14, fontWeight: 400,
            fontStyle: 'normal', textDecoration: 'none', textAlign: 'left',
            color: '#111827', lineHeight: 1.6, letterSpacing: 0, textTransform: 'none',
          },
        });
        pushHistory();
        setUploadedFiles((prev) => prev.map((f) => f.id === matchId ? { ...f, progress: 100, canvasable: true } : f));
        toast.success(`${file.name} imported as text`);
        return;
      }

      // ── DOCX → one canvas page per page-worth of text, one text element
      //    PER PARAGRAPH ──────────────────────────────────────────────
      // A long document (e.g. a multi-page resume) used to land as a single
      // text box sized for one page, with every paragraph crammed into one
      // giant merged string — the box doesn't clip, so it overflowed way
      // past the page edges, AND even once paginated, the whole page was
      // still one uneditable-by-section blob (couldn't click into just the
      // summary, or just one bullet, without touching everything else).
      // Each paragraph now becomes its own independently selectable, movable,
      // resizable text element, positioned by its own measured height so
      // they still stack exactly where the merged text used to flow.
      if (cat === 'doc') {
        toast.loading(`Extracting text from ${file.name}…`, { id: matchId });
        const paragraphs = await importDOCX(file);
        toast.dismiss(matchId);
        const DOC_W = 794; // A4 px at 96dpi
        const DOC_H = 1123;
        const MARGIN = 72;
        const boxWidth = DOC_W - MARGIN * 2;
        const boxHeight = DOC_H - MARGIN * 2;
        const pages = paginateParagraphs(paragraphs, boxWidth, boxHeight);
        importDocumentPages(pages.map((pageParagraphs, i) => ({
          name: pages.length > 1 ? `${file.name} – Page ${i + 1}` : file.name,
          width: DOC_W, height: DOC_H,
          backgroundColor: '#FFFFFF',
          elements: pageParagraphs.map((para, j) => ({
            type: 'text' as const,
            x: MARGIN, y: MARGIN + para.y, width: boxWidth, height: para.height,
            rotation: 0, opacity: 1, visible: true, locked: false, name: `Paragraph ${j + 1}`, zIndex: j,
            data: {
              type: 'text' as const, content: para.text,
              fontFamily: 'Inter', fontSize: 16, fontWeight: 400,
              fontStyle: 'normal' as const, textDecoration: 'none' as const, textAlign: 'left' as const,
              color: '#111827', lineHeight: 1.7, letterSpacing: 0, textTransform: 'none' as const,
            },
          })),
        })));
        setUploadedFiles((prev) => prev.map((f) => f.id === matchId ? { ...f, progress: 100, canvasable: true } : f));
        toast.success(pages.length > 1 ? `${file.name} imported across ${pages.length} pages. Edit the text on canvas.` : `${file.name} imported. Edit the text on canvas.`);
        return;
      }

      // ── PPTX → one canvas page per slide ────────────────────────────
      if (cat === 'slides') {
        toast.loading(`Extracting slides from ${file.name}…`, { id: matchId });
        const slides = await importPPTX(file);
        toast.dismiss(matchId);
        const SW = 1280, SH = 720;

        importDocumentPages(slides.map((slide, i) => ({
          name: `${file.name} – Slide ${i + 1}`,
          width: SW, height: SH,
          backgroundColor: '#FFFFFF',
          elements: [
            {
              type: 'text' as const,
              x: 80, y: 80, width: SW - 160, height: 120,
              rotation: 0, opacity: 1, visible: true, locked: false,
              name: `Slide ${i + 1} Title`, zIndex: 1,
              data: {
                type: 'text' as const, content: slide.title,
                fontFamily: 'Inter', fontSize: 48, fontWeight: 700,
                fontStyle: 'normal' as const, textDecoration: 'none' as const, textAlign: 'left' as const,
                color: '#111827', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' as const,
              },
            },
            ...(slide.body ? [{
              type: 'text' as const,
              x: 80, y: 240, width: SW - 160, height: SH - 320,
              rotation: 0, opacity: 1, visible: true, locked: false,
              name: `Slide ${i + 1} Body`, zIndex: 1,
              data: {
                type: 'text' as const, content: slide.body,
                fontFamily: 'Inter', fontSize: 24, fontWeight: 400,
                fontStyle: 'normal' as const, textDecoration: 'none' as const, textAlign: 'left' as const,
                color: '#374151', lineHeight: 1.6, letterSpacing: 0, textTransform: 'none' as const,
              },
            }] : []),
          ],
        })));

        setUploadedFiles((prev) => prev.map((f) => f.id === matchId ? { ...f, progress: 100, canvasable: true } : f));
        toast.success(`${file.name}: ${slides.length} slide${slides.length > 1 ? 's' : ''} imported`);
        return;
      }

      // ── VIDEO / AUDIO → saved to DB, shown in panel only ────────────
      setUploadedFiles((prev) => prev.map((f) => f.id === matchId ? { ...f, progress: 100 } : f));
      toast.success(`${file.name} saved`);
    } catch (importErr: any) {
      console.error('Import error:', importErr);
      toast.dismiss(matchId);
      setUploadedFiles((prev) => prev.map((f) => f.id === matchId ? {
        ...f, progress: 100, error: 'Import failed — file saved to server',
      } : f));
      toast.error(`Could not import ${file.name}: ${importErr?.message || 'parse error'}`);
    }
  };

  const processFile = async (file: File) => {
    const cat = getFileCategory(file.type, file.name);
    const fileId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const supported = ['image', 'svg', 'video', 'audio', 'pdf', 'doc', 'sheet', 'slides', 'text'];
    if (!supported.includes(cat)) {
      toast.error(`${file.name}: unsupported file type`);
      return;
    }

    setUploadedFiles((prev) => [{
      id: fileId, name: file.name, url: '', type: file.type,
      size: fmtSize(file.size), progress: 0, canvasable: false,
    }, ...prev]);

    // Upload to backend for persistence
    let serverUrl = '';
    try {
      const { data: saved } = await uploadAPI.upload(file, (pct) => {
        setUploadedFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, progress: Math.min(pct, 60) } : f));
      });
      serverUrl = `${BACKEND}${saved.url}`;
      setUploadedFiles((prev) => prev.map((f) => f.id === fileId ? {
        ...f, id: saved.id || fileId, url: serverUrl, progress: 70,
      } : f));
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Upload failed';
      setUploadedFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, progress: 100, error: msg } : f));
      toast.error(`${file.name}: ${msg}`);
      return;
    }

    await importFileIntoCanvas(file, serverUrl, fileId);
  };

  // Re-opens a file from a previous session (loaded from upload history, which only has
  // a URL, not a File object) and runs it through the same import pipeline as a fresh
  // upload — this is what makes clicking an old PDF/DOCX/PPTX/XLSX import it into the
  // editor instead of falling back to opening it in a new browser tab.
  const handleImportExistingFile = async (f: UploadedFile) => {
    if (!f.url) return;
    const cat = getFileCategory(f.type, f.name);
    if (!IMPORTABLE_CATS.includes(cat)) return;
    toast.loading(`Opening ${f.name}…`, { id: f.id });
    try {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error('Could not fetch file from server');
      const blob = await res.blob();
      const file = new File([blob], f.name, { type: f.type || blob.type });
      toast.dismiss(f.id);
      await importFileIntoCanvas(file, f.url, f.id);
    } catch (err: any) {
      toast.dismiss(f.id);
      console.error('Re-import error:', err);
      toast.error(`Could not open ${f.name}: ${err?.message || 'fetch failed'}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(processFile);
    e.target.value = '';
  };

  // Load previously saved uploads from the database when Uploads tab is opened
  useEffect(() => {
    if (activeTab !== 'uploads') return;
    const token = localStorage.getItem('designhub-token');
    if (!token) return;
    uploadAPI.list().then(({ data }) => {
      const BACKEND = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';
      const fromDB: UploadedFile[] = (data as any[]).map((f) => {
        const cat = getFileCategory(f.fileType || '', f.fileName || '');
        return {
          id: f.id,
          name: f.fileName || f.name || 'File',
          url: f.url?.startsWith('http') ? f.url : `${BACKEND}${f.url}`,
          type: f.fileType || '',
          size: fmtSize(f.size || 0),
          progress: 100,
          canvasable: IMPORTABLE_CATS.includes(cat),
          thumbnail: (cat === 'image' || cat === 'svg')
            ? (f.url?.startsWith('http') ? f.url : `${BACKEND}${f.url}`)
            : undefined,
        };
      });
      // Merge: keep local in-progress ones, prepend DB records not already shown
      setUploadedFiles((prev) => {
        const existingIds = new Set(prev.map((f) => f.id));
        const fresh = fromDB.filter((f) => !existingIds.has(f.id));
        return [...prev.filter((f) => f.progress < 100), ...fresh];
      });
    }).catch(() => {/* not logged in or network error — silent */});
  }, [activeTab]);

  const filteredIcons = ICON_LIBRARY.filter((ic) => {
    const matchCat = iconCat === 'All' || ic.cat === iconCat;
    const matchSearch = !search || ic.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleTabClick = (key: TabKey) => {
    // Leaving the Tools tab (switching elsewhere, or collapsing it) should drop back
    // to Select — otherwise the canvas stays in draw/erase mode with no visible sign
    // of it once the Tools panel itself is no longer even showing.
    if (activeTab === 'tools' && (key !== 'tools' || panelOpen) && activeTool !== 'select') {
      setActiveTool('select');
    }
    if (activeTab === key && panelOpen) { setPanelOpen(false); return; }
    setActiveTab(key);
    setPanelOpen(true);
    setSearch('');
  };

  return (
    <div className="flex h-full flex-shrink-0">
      {/* Icon strip */}
      <div className="w-14 flex flex-col items-center gap-1 py-2 bg-white dark:bg-canva-dark-surface border-r border-gray-200 dark:border-canva-dark-border overflow-y-auto">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => handleTabClick(key)} title={label}
            className={`flex flex-col items-center gap-0.5 w-12 py-2 rounded-lg text-[9px] font-medium transition-colors ${
              activeTab === key && panelOpen
                ? 'bg-canva-purple/10 text-canva-purple'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            <Icon size={20} /><span>{label}</span>
          </button>
        ))}
      </div>

      {/* Panel */}
      {panelOpen && (
        <div className="w-64 bg-white dark:bg-canva-dark-surface border-r border-gray-200 dark:border-canva-dark-border flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <span className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{activeTab}</span>
            <button
              onClick={() => {
                if (activeTab === 'tools' && activeTool !== 'select') setActiveTool('select');
                setPanelOpen(false);
              }}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
            >
              <HiOutlineChevronLeft size={14} />
            </button>
          </div>

          {(activeTab === 'templates' || activeTab === 'elements') && (
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-2.5 py-1.5">
                <HiOutlineSearch size={13} className="text-gray-400 flex-shrink-0" />
                <input type="text" placeholder={`Search ${activeTab}...`} value={search} onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 outline-none" />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">

            {/* TEMPLATES */}
            {activeTab === 'templates' && (
              <div className="p-3">
                {/* Describe your ideal design — generates a title/subtitle/color scheme via AI */}
                <div className="mb-3 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-canva-purple/5 to-pink-500/5">
                  <textarea
                    value={aiTemplatePrompt}
                    onChange={(e) => setAiTemplatePrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleGenerateTemplateFromPrompt(); }}
                    placeholder="Describe your ideal design…"
                    rows={2}
                    className="w-full px-2.5 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-canva-purple/30 focus:border-canva-purple mb-2"
                  />
                  <button
                    onClick={handleGenerateTemplateFromPrompt}
                    disabled={aiTemplateGenerating || !aiTemplatePrompt.trim()}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-gradient-to-r from-canva-purple to-pink-500 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-all"
                  >
                    {aiTemplateGenerating
                      ? <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generating…</>
                      : <><HiOutlineSparkles size={13} />Generate design</>}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {BUILT_IN_TEMPLATES
                    .filter((t) => !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.cat.toLowerCase().includes(search.toLowerCase()))
                    .map((tpl) => (
                    <button key={tpl.id} onClick={() => handleApplyTemplate(tpl)}
                      className="group relative self-start rounded-lg overflow-hidden border-2 border-transparent hover:border-canva-purple transition-all shadow-sm"
                      style={{ background: tpl.bg, aspectRatio: tpl.width && tpl.height ? `${tpl.width} / ${tpl.height}` : '16 / 9' }}>
                      {(tpl as any).photoId && (
                        <img src={`https://picsum.photos/id/${(tpl as any).photoId}/200/120`} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                      )}
                      {(tpl as any).photoId && (
                        <div className="absolute inset-0" style={{ background: (tpl as any).overlay === 'light' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.3)' }} />
                      )}
                      <div className="absolute top-0 left-0 right-0 h-2" style={{ background: tpl.accent }} />
                      <div className="absolute inset-0 flex flex-col justify-center px-2.5">
                        <div className="text-[11px] font-bold truncate leading-tight" style={{ color: tpl.text }}>{tpl.name}</div>
                        <div className="text-[9px] mt-0.5 opacity-60 uppercase tracking-wide" style={{ color: tpl.text }}>{tpl.cat}</div>
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ELEMENTS */}
            {activeTab === 'elements' && (
              <div className="p-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Shapes</p>
                <div className="grid grid-cols-5 gap-1 mb-4">
                  {SHAPE_TYPES.map((shape, i) => (
                    <button key={shape} onClick={() => handleAddShape(shape, i)} title={shape}
                      className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                      <ShapePreview shape={shape} color={SHAPE_COLORS[i % SHAPE_COLORS.length]} />
                      <span className="text-[8px] text-gray-400 capitalize">{shape}</span>
                    </button>
                  ))}
                </div>

                <div className="border-t border-gray-100 dark:border-gray-800 pt-3 mb-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Icons</p>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-[10px] text-gray-500">Color</label>
                    <input type="color" value={iconColor} onChange={(e) => setIconColor(e.target.value)}
                      className="w-6 h-6 rounded border border-gray-200 cursor-pointer" />
                    <div className="flex-1 overflow-x-auto flex gap-1">
                      {['#6366F1','#EC4899','#EF4444','#F59E0B','#10B981','#3B82F6','#111827'].map((c) => (
                        <button key={c} onClick={() => setIconColor(c)}
                          className={`w-4 h-4 rounded-full flex-shrink-0 border-2 ${iconColor === c ? 'border-canva-purple scale-110' : 'border-transparent'}`}
                          style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                  {/* Iconify web search */}
                  <div className="flex items-center gap-1.5 mb-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5">
                    <HiOutlineSearch size={12} className="text-gray-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={iconSearch}
                      onChange={(e) => setIconSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleIconifySearch(iconSearch); }}
                      placeholder="Search 200k+ icons (press Enter)…"
                      className="flex-1 bg-transparent text-[10px] text-gray-700 dark:text-gray-300 placeholder-gray-400 outline-none"
                    />
                    {iconSearch && (
                      <button onClick={() => { setIconSearch(''); setIconifyResults([]); }} className="text-gray-300 hover:text-gray-500">×</button>
                    )}
                  </div>

                  {/* Iconify results */}
                  {iconifyLoading && (
                    <div className="flex items-center justify-center py-4 text-[10px] text-gray-400">
                      <svg className="animate-spin h-4 w-4 mr-1.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      Searching Iconify…
                    </div>
                  )}

                  {iconifyResults.length > 0 && !iconifyLoading && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] text-gray-400">{iconifyResults.length} results from web</span>
                        <button onClick={() => { setIconifyResults([]); setIconSearch(''); }} className="text-[9px] text-gray-400 hover:text-canva-purple">clear</button>
                      </div>
                      <div className="grid grid-cols-5 gap-1 mb-3">
                        {iconifyResults.map((icon) => (
                          <button key={`${icon.prefix}:${icon.name}`} onClick={() => handleAddIconifyIcon(icon)}
                            title={`${icon.prefix}:${icon.name}`}
                            className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-canva-purple/10 transition-colors group">
                            <div className="w-6 h-6 flex items-center justify-center">
                              <svg viewBox={`0 0 ${icon.width} ${icon.height}`} className="w-6 h-6" dangerouslySetInnerHTML={{ __html: icon.body.replace(/currentColor/g, iconColor) }} />
                            </div>
                            <span className="text-[6px] text-gray-400 truncate w-full text-center">{icon.name}</span>
                          </button>
                        ))}
                      </div>
                      <div className="border-t border-gray-100 dark:border-gray-800 pt-2 mb-2">
                        <p className="text-[9px] text-gray-400 text-center">Built-in icons below</p>
                      </div>
                    </div>
                  )}

                  {/* Built-in category chips (hide when web results showing) */}
                  {iconifyResults.length === 0 && (
                    <div className="flex gap-1 flex-wrap mb-2">
                      {ICON_CATEGORIES.map((cat) => (
                        <button key={cat} onClick={() => setIconCat(cat)}
                          className={`px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors ${iconCat === cat ? 'bg-canva-purple text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-5 gap-1">
                    {filteredIcons.map((icon) => (
                      <button key={icon.name} onClick={() => handleAddIcon(icon)} title={icon.name}
                        className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                        <svg viewBox="0 0 20 20" className="w-6 h-6" fill={iconColor}>
                          <path d={icon.path} />
                        </svg>
                        <span className="text-[7px] text-gray-400 truncate w-full text-center">{icon.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Animated Stickers */}
                <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Animated Stickers</p>

                  {!import.meta.env.VITE_TENOR_API_KEY ? (
                    <div className="text-center py-4 px-2 rounded-lg bg-gray-50 dark:bg-gray-800/60">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">Add a free Tenor API key as <code className="text-[9px]">VITE_TENOR_API_KEY</code> to enable animated stickers.</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 mb-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5">
                        <HiOutlineSearch size={12} className="text-gray-400 flex-shrink-0" />
                        <input
                          type="text"
                          value={stickerSearch}
                          onChange={(e) => setStickerSearch(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && stickerSearch.trim()) { setStickerCat(''); handleStickerSearch(stickerSearch); } }}
                          placeholder="Search animated stickers (press Enter)…"
                          className="flex-1 bg-transparent text-[10px] text-gray-700 dark:text-gray-300 placeholder-gray-400 outline-none"
                        />
                        {stickerSearch && (
                          <button onClick={() => { setStickerSearch(''); setStickerCat('Trending'); handleStickerSearch('Trending'); }} className="text-gray-300 hover:text-gray-500">×</button>
                        )}
                      </div>

                      <div className="flex gap-1 flex-wrap mb-2">
                        {STICKER_CATEGORIES.map((cat) => (
                          <button key={cat}
                            onClick={() => { setStickerCat(cat); setStickerSearch(''); handleStickerSearch(cat); }}
                            className={`px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors flex-shrink-0 ${stickerCat === cat ? 'bg-canva-purple text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                            {cat}
                          </button>
                        ))}
                      </div>

                      {stickerLoading ? (
                        <div className="flex items-center justify-center py-4 text-[10px] text-gray-400">
                          <svg className="animate-spin h-4 w-4 mr-1.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                          Loading stickers…
                        </div>
                      ) : stickerResults.length > 0 ? (
                        <div className="grid grid-cols-3 gap-1.5">
                          {stickerResults.map((s) => (
                            <button key={s.id} onClick={() => addStickerToCanvas(s.url, 'Sticker')}
                              className="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 hover:ring-2 hover:ring-canva-purple transition-all aspect-square">
                              <img src={s.thumb} alt="" loading="lazy" className="w-full h-full object-contain" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-[10px] text-gray-400 py-4">No stickers found — try a different search</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* TEXT */}
            {activeTab === 'text' && (
              <div className="p-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Add text</p>
                <div className="space-y-1 mb-4">
                  {TEXT_PRESETS.map((p) => (
                    <button key={p.label} onClick={() => handleAddText(p)}
                      className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-canva-purple hover:bg-canva-purple/5 transition-colors group">
                      <span
                        style={{ fontWeight: p.fontWeight, color: p.color }}
                        className={p.fontSize >= 48 ? 'text-xl block' : p.fontSize >= 32 ? 'text-base block' : p.fontSize >= 18 ? 'text-sm block' : 'text-xs block'}>
                        {p.label}
                      </span>
                    </button>
                  ))}
                  <button onClick={handleAddPageNumber}
                    className="w-full text-left px-3 py-2 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 hover:border-canva-purple hover:bg-canva-purple/5 transition-colors text-xs text-gray-500">
                    + Page number
                  </button>
                </div>
                <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Animated text</p>
                  <div className="grid grid-cols-2 gap-1.5 mb-3">
                    {([
                      { label: 'Typewriter', anim: 'typewriter', icon: '⌨️' },
                      { label: 'Fade In',    anim: 'fadeIn',     icon: '🌅' },
                      { label: 'Slide Up',   anim: 'slideUp',    icon: '⬆️' },
                      { label: 'Slide Left', anim: 'slideLeft',  icon: '⬅️' },
                      { label: 'Bounce',     anim: 'bounce',     icon: '🏀' },
                      { label: 'Zoom',       anim: 'zoom',       icon: '🔍' },
                    ] as const).map(({ label, anim, icon }) => (
                      <button key={anim}
                        onClick={() => {
                          addElement({
                            type: 'text', x: cx, y: cy + jitter(), width: 700, height: 80,
                            rotation: 0, opacity: 1, visible: true, locked: false, name: label + ' Text', zIndex: 0,
                            data: { type: 'text', content: 'Your animated text', fontFamily: 'Inter', fontSize: 40, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'center', color: '#111827', lineHeight: 1.3, letterSpacing: 0, textTransform: 'none', animation: anim } as any,
                          });
                          pushHistory();
                          toast.success(`${label} text added`);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-canva-purple hover:bg-canva-purple/5 transition-colors text-left">
                        <span className="text-sm">{icon}</span>
                        <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Font combinations</p>
                  <div className="space-y-2">
                    {FONT_COMBOS.map((combo, i) => (
                      <button key={i} onClick={() => handleAddFontCombo(combo)}
                        className="w-full text-left p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-canva-purple hover:bg-canva-purple/5 transition-all hover:shadow-sm group">
                        <div style={{ fontFamily: combo.heading, fontWeight: combo.hw }} className="text-[17px] leading-tight text-gray-900 dark:text-white mb-0.5">Heading</div>
                        <div style={{ fontFamily: combo.body, fontWeight: combo.bw }} className="text-xs text-gray-500 dark:text-gray-400 leading-tight">Body text preview</div>
                        <div className="text-[9px] text-gray-300 dark:text-gray-600 mt-1.5 tracking-wide uppercase">{combo.heading} · {combo.body}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TOOLS — freehand drawing/annotation directly on the canvas */}
            {activeTab === 'tools' && (
              <div className="p-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Draw</p>
                <div className="grid grid-cols-4 gap-1.5 mb-4">
                  {([
                    { tool: 'select', label: 'Select', icon: HiCursorClick },
                    { tool: 'pen', label: 'Pen', icon: HiOutlinePencilAlt },
                    { tool: 'highlighter', label: 'Highlight', icon: HiOutlinePencil },
                    { tool: 'eraser', label: 'Eraser', icon: HiOutlineTrash },
                  ] as const).map(({ tool, label, icon: Icon }) => (
                    <button
                      key={tool}
                      onClick={() => setActiveTool(tool)}
                      title={label}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border transition-colors ${
                        activeTool === tool
                          ? 'border-canva-purple bg-canva-purple/10 text-canva-purple'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <Icon size={18} />
                      <span className="text-[9px] font-medium">{label}</span>
                    </button>
                  ))}
                </div>

                {activeTool !== 'select' && activeTool !== 'eraser' && (
                  <div className="mb-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Color</p>
                    <div className="flex flex-wrap gap-2">
                      {DRAW_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setDrawColor(c)}
                          className={`w-7 h-7 rounded-full border-2 transition-transform ${drawColor === c ? 'border-canva-purple scale-110' : 'border-gray-200 dark:border-gray-700'}`}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Brush size</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1}
                      max={40}
                      value={drawWidth}
                      onChange={(e) => setDrawWidth(Number(e.target.value))}
                      className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-canva-purple"
                    />
                    <span className="text-xs text-gray-400 w-6 text-right">{drawWidth}</span>
                  </div>
                </div>

                {activeTool !== 'select' && activeTool !== 'eraser' && (
                  <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
                    Draw directly on the canvas by clicking and dragging. Switch back to "Select" when you're done to edit other elements normally.
                  </p>
                )}
                {activeTool === 'eraser' && (
                  <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
                    Drag over a pen or highlighter stroke to remove it. This only erases your own drawings — it never affects photos, text, or shapes.
                  </p>
                )}
              </div>
            )}

            {/* UPLOADS */}
            {activeTab === 'uploads' && (
              <div className="p-3">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.svg,.csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />

                {/* Upload button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-canva-purple hover:text-canva-purple transition-colors mb-2">
                  <HiOutlinePlus size={16} /> Upload files
                </button>

                {/* Accepted type badges */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {['IMG', 'SVG', 'PDF', 'DOC', 'XLS', 'PPT', 'MP4', 'MP3', 'TXT'].map((t) => (
                    <span key={t} className="px-1.5 py-0.5 rounded text-[8px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{t}</span>
                  ))}
                </div>

                {/* Drag-and-drop zone */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    Array.from(e.dataTransfer.files).forEach(processFile);
                  }}
                  className="min-h-[64px] rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 text-[10px] text-gray-400 mb-3 hover:border-canva-purple/40 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}>
                  <span className="text-lg">📂</span>
                  <span>Drop or click to upload</span>
                </div>

                {/* File list */}
                {uploadedFiles.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Your uploads ({uploadedFiles.length})</p>
                      {uploadedFiles.length > 0 && (
                        <button onClick={() => setUploadedFiles([])} className="text-[9px] text-gray-300 hover:text-red-400 transition-colors">clear all</button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {uploadedFiles.map((f) => {
                        const cat = getFileCategory(f.type, f.name);
                        const meta = FILE_CAT_META[cat] || FILE_CAT_META.unknown;
                        const isDone = f.progress >= 100;
                        const isImage = cat === 'image' || cat === 'svg';
                        // Image/SVG go straight to canvas; video becomes a real playable
                        // canvas element; PDFs/DOCX/PPTX/XLSX/TXT run through the import
                        // pipeline; audio has no in-canvas representation yet, so it
                        // still opens externally.
                        const activate = () => {
                          if (!f.url) return;
                          if (isImage) addImageToCanvas(f.url, f.name);
                          else if (cat === 'video') addVideoToCanvas(f.url, f.name);
                          else if (f.canvasable) handleImportExistingFile(f);
                          else window.open(f.url, '_blank', 'noopener,noreferrer');
                        };
                        return (
                          <div
                            key={f.id}
                            draggable={f.canvasable && isDone}
                            onDragEnd={() => { if (f.canvasable && isDone) activate(); }}
                            onClick={() => { if (isDone && !f.error) activate(); }}
                            className={`flex items-start gap-2 p-2 rounded-lg transition-colors group ${
                              f.canvasable && isDone
                                ? 'bg-gray-50 dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-grab active:cursor-grabbing'
                                : isDone && f.url && !f.error
                                ? 'bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer'
                                : 'bg-gray-50 dark:bg-gray-800'
                            } ${f.error ? 'border border-red-200 dark:border-red-900' : ''}`}>
                            {/* Thumbnail or icon */}
                            <div className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden border border-gray-200 dark:border-gray-700 flex items-center justify-center" style={{ background: `${meta.color}15` }}>
                              {f.thumbnail ? (
                                <img src={f.thumbnail} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-lg leading-none">{meta.icon}</span>
                              )}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-0.5">
                                <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300 truncate flex-1">{f.name}</span>
                                <span className="text-[8px] font-semibold px-1 rounded flex-shrink-0" style={{ background: `${meta.color}20`, color: meta.color }}>{meta.label}</span>
                              </div>
                              <div className="text-[9px] text-gray-400 mb-1">{f.size}</div>
                              {/* Progress bar */}
                              {!isDone && (
                                <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div className="h-full bg-canva-purple transition-all duration-200 rounded-full" style={{ width: `${f.progress}%` }} />
                                </div>
                              )}
                              {f.error && <div className="text-[9px] text-red-500 mt-0.5">{f.error}</div>}
                              {isDone && !f.error && f.canvasable && (
                                <div className="text-[9px] text-gray-400">{isImage ? 'Drag to canvas or' : 'Click to import or'}</div>
                              )}
                            </div>
                            {/* Action buttons */}
                            {isDone && !f.error && f.url && (
                              <div className="flex flex-col gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                                {f.canvasable ? (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); activate(); }}
                                    className="text-[9px] px-1.5 py-1 bg-canva-purple hover:bg-canva-purple/90 text-white rounded-lg font-medium whitespace-nowrap">
                                    {isImage ? '+ Canvas' : 'Import'}
                                  </button>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); window.open(f.url, '_blank', 'noopener,noreferrer'); }}
                                    className="text-[9px] px-1.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium whitespace-nowrap">
                                    Open ↗
                                  </button>
                                )}
                                <a
                                  href={f.url}
                                  download={f.name}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[9px] px-1.5 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium text-center no-underline">
                                  ↓
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI */}
            {activeTab === 'ai' && (
              <div className="p-3 flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-gradient-to-r from-canva-purple/10 to-pink-500/10 border border-canva-purple/20">
                  <HiOutlineSparkles size={15} className="text-canva-purple flex-shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-gray-900 dark:text-white">Magic AI</div>
                    <div className="text-[9px] text-gray-400">
                      {aiConfiguredProviders.length > 0
                        ? `Using ${aiConfiguredProviders.join(' / ')}`
                        : 'No API key configured — add one in Settings'}
                    </div>
                  </div>
                </div>

                {/* Mode pills */}
                <div className="flex gap-1 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  {(['write', 'image', 'suggest'] as const).map((t) => (
                    <button key={t} onClick={() => setAiTab(t)}
                      className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold transition-all ${aiTab === t ? 'bg-white dark:bg-gray-700 text-canva-purple shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}>
                      {t === 'write' ? 'Write' : t === 'image' ? 'Image' : 'Ideas'}
                    </button>
                  ))}
                </div>

                {/* Prompt input */}
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAiGenerate(); }}
                  placeholder={aiTab === 'write' ? 'Catchy headline for a fitness brand…' : aiTab === 'image' ? 'Neon city skyline at dusk…' : 'Birthday card for a 30-year-old…'}
                  rows={6}
                  className="w-full px-3 py-2.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg resize-y min-h-[110px] bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-canva-purple/30 focus:border-canva-purple"
                />

                {/* Reference images (logo/template) upload — image mode only */}
                {aiTab === 'image' && (
                  <div>
                    <input
                      ref={aiRefFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleAiReferenceFileChange}
                    />
                    {aiReferenceImages.length > 0 && (
                      <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                        {aiReferenceImages.map((ref, i) => (
                          <div key={i} className="relative group">
                            <img src={ref.dataUrl} alt={ref.name} title={ref.name} className="w-full aspect-square rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                            <button
                              onClick={() => setAiReferenceImages((prev) => prev.filter((_, idx) => idx !== i))}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-gray-900/80 text-white text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {aiReferenceImages.length < AI_MAX_REFERENCE_IMAGES && (
                      <button
                        onClick={() => aiRefFileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-[10px] text-gray-500 dark:text-gray-400 hover:border-canva-purple hover:text-canva-purple transition-colors">
                        <HiOutlinePlus size={12} />
                        {aiReferenceImages.length > 0 ? 'Add another reference image' : 'Upload logo / template images (optional)'}
                      </button>
                    )}
                  </div>
                )}

                {/* Generate */}
                <button
                  onClick={handleAiGenerate}
                  disabled={aiGenerating || !aiPrompt.trim()}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-canva-purple hover:bg-canva-purple/90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition-all">
                  {aiGenerating
                    ? <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generating…</>
                    : <><HiOutlineSparkles size={13} />Generate</>}
                </button>

                {/* Result card */}
                {aiResult && (
                  <div className="rounded-lg border border-canva-purple/20 bg-canva-purple/5 p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] font-semibold text-canva-purple uppercase tracking-wide">Result</span>
                      <button onClick={() => setAiResult('')} className="text-[9px] text-gray-400 hover:text-gray-600">clear</button>
                    </div>
                    {aiTab === 'image' ? (
                      <img src={aiResult} alt="AI generated" className="w-full rounded-md" />
                    ) : (
                      <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{aiResult}</p>
                    )}
                    {aiTab !== 'write' && (
                      <button
                        onClick={() => {
                          if (aiTab === 'image') {
                            addImageToCanvas(aiResult, 'AI Image');
                          } else {
                            addElement({ type: 'text', x: cx, y: cy, width: 700, height: 100, rotation: 0, opacity: 1, visible: true, locked: false, name: 'AI Text', zIndex: 0, data: { type: 'text', content: aiResult.slice(0, 300), fontFamily: 'Inter', fontSize: 22, fontWeight: 400, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#111827', lineHeight: 1.5, letterSpacing: 0, textTransform: 'none' } });
                            pushHistory();
                            toast.success('Added to canvas');
                          }
                        }}
                        className="mt-2 w-full py-1.5 text-[10px] font-semibold bg-canva-purple text-white rounded-md hover:bg-canva-purple/90 transition-colors">
                        Add to canvas
                      </button>
                    )}
                  </div>
                )}

                {/* Quick prompts */}
                {!aiResult && (
                  <div>
                    <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Suggestions</p>
                    <div className="flex flex-wrap gap-1">
                      {(aiTab === 'write'
                        ? ['Bold tagline', 'CTA text', 'Event title', 'Product headline', 'Bio line']
                        : aiTab === 'image'
                        ? ['Abstract bg', 'Tech pattern', 'Sunset', 'Watercolor']
                        : ['Birthday card', 'IG post', 'Logo idea', 'YT thumbnail']
                      ).map((p) => (
                        <button key={p} onClick={() => setAiPrompt(p)}
                          className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] text-gray-500 dark:text-gray-400 hover:bg-canva-purple/10 hover:text-canva-purple border border-transparent hover:border-canva-purple/20 transition-all">
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* BACKGROUND */}
            {activeTab === 'background' && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Photos</p>
                  {bgPhotoCategory && (
                    <button onClick={() => { setBgPhotoCategory(null); setBgPhotoResults([]); }} className="text-[9px] text-canva-purple hover:underline">
                      ← Featured
                    </button>
                  )}
                </div>

                {/* Occasion categories — Picsum has no theme search, so these fetch
                    real matching photos live from Wikimedia Commons instead. */}
                <div className="flex gap-1 flex-wrap mb-2">
                  {BACKGROUND_PHOTO_CATEGORIES.map((cat) => (
                    <button key={cat.label} onClick={() => handleSearchBackgroundCategory(cat)}
                      className={`px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors ${
                        bgPhotoCategory === cat.label ? 'bg-canva-purple text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}>
                      {cat.label}
                    </button>
                  ))}
                </div>

                {bgPhotoLoading && (
                  <div className="flex items-center justify-center py-6 text-[10px] text-gray-400">
                    <svg className="animate-spin h-4 w-4 mr-1.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Searching…
                  </div>
                )}

                {!bgPhotoLoading && bgPhotoCategory ? (
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {bgPhotoResults.map((photo, i) => (
                      <button key={i} onClick={() => handleAddSearchedBackgroundPhoto(photo.url)} title={photo.title}
                        className="group relative aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-canva-purple transition-all">
                        <img src={photo.url} alt={photo.title} loading="lazy" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                        <span className="absolute bottom-1 left-1.5 right-1.5 text-[9px] font-medium text-white drop-shadow truncate">{photo.title}</span>
                      </button>
                    ))}
                  </div>
                ) : !bgPhotoLoading && (
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {BACKGROUND_PHOTOS.map((photo) => (
                      <button key={photo.id} onClick={() => handleAddBackgroundPhoto(photo.id)} title={photo.label}
                        className="group relative aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-canva-purple transition-all">
                        <img src={`https://picsum.photos/id/${photo.id}/160/100`} alt={photo.label} loading="lazy" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                        <span className="absolute bottom-1 left-1.5 text-[9px] font-medium text-white drop-shadow">{photo.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setShowBgColorOptions((s) => !s)}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2"
                >
                  <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Color options</span>
                  {showBgColorOptions ? <HiOutlineChevronUp size={14} className="text-gray-400" /> : <HiOutlineChevronDown size={14} className="text-gray-400" />}
                </button>

                {showBgColorOptions && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Solid colors</p>
                    <div className="grid grid-cols-9 gap-1.5 mb-4">
                      {COLORS_PALETTE.map((color) => (
                        <button key={color} style={{ background: color }} onClick={() => setPageBackgroundColor(currentPageIndex, color)}
                          className="w-6 h-6 rounded border border-gray-200 dark:border-gray-700 hover:scale-110 hover:ring-2 hover:ring-canva-purple transition-all" title={color} />
                      ))}
                    </div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Gradients</p>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {['linear-gradient(135deg,#667eea,#764ba2)','linear-gradient(135deg,#f093fb,#f5576c)','linear-gradient(135deg,#4facfe,#00f2fe)','linear-gradient(135deg,#43e97b,#38f9d7)','linear-gradient(135deg,#fa709a,#fee140)','linear-gradient(135deg,#a18cd1,#fbc2eb)','linear-gradient(135deg,#fccb90,#d57eeb)','linear-gradient(135deg,#e0c3fc,#8ec5fc)','linear-gradient(135deg,#fddb92,#d1fdff)'].map((g, i) => (
                        <button key={i} style={{ background: g }} onClick={() => setPageBackgroundColor(currentPageIndex, g)}
                          className="h-10 rounded-lg hover:ring-2 hover:ring-canva-purple transition-all" />
                      ))}
                    </div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Custom</p>
                    <div className="flex items-center gap-2">
                      <input type="color" className="w-9 h-9 rounded cursor-pointer border border-gray-200"
                        onChange={(e) => setPageBackgroundColor(currentPageIndex, e.target.value)} />
                      <span className="text-xs text-gray-500">Pick any color</span>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
