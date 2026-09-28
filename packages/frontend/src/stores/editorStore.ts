import { create } from 'zustand';
import { CanvasElement, Page, Project, PageTransition, ElementAnimation, Track, PageBackgroundImage } from '../types';
import { generateId } from '../utils/cn';

interface HistoryEntry {
  pages: Page[];
  currentPageIndex: number;
}

interface EditorState {
  project: Project | null;
  // Bumped every time setProject bulk-replaces `pages` wholesale (a fresh
  // load or reload — including the redundant reload-loop autosave triggers
  // via EditorPage's own effect, see its comment). useCollaboration.ts uses
  // this to tell "this is a bulk reload of possibly-the-same data, just
  // re-baseline my diff and don't broadcast anything" apart from "this is a
  // genuine local edit, diff it and tell collaborators" — without it, every
  // reload's fresh element object references look like N new elements to a
  // reference-equality diff, and a second connected session (another tab, a
  // collaborator, even a one-off verification session) would receive and
  // append duplicates of everything already on the page.
  loadGeneration: number;
  pages: Page[];
  currentPageIndex: number;
  selectedElementIds: string[];
  hoveredElementId: string | null;
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
  showRulers: boolean;
  showGuides: boolean;
  snapEnabled: boolean;
  gridSize: number;
  isDragging: boolean;
  isResizing: boolean;
  isEditing: boolean;
  clipboard: CanvasElement[];
  history: HistoryEntry[];
  historyIndex: number;
  sidePanelTab: string;
  rightPanelOpen: boolean;
  isSaving: boolean;
  lastSaved: string | null;
  collaborators: { id: string; name: string; avatar: string; cursor?: { x: number; y: number } }[];
  commentsOpen: boolean;
  versionsOpen: boolean;
  viewportCenter: { x: number; y: number };
  // The canvas container's own on-screen pixel size (set by EditorCanvas's
  // ResizeObserver) — kept in the store, not just local component state, so
  // any zoom entry point (toolbar buttons, keyboard shortcuts, wheel) can
  // anchor the zoom to the viewport's actual center instead of each
  // duplicating that math (or, worse, not doing it at all).
  viewportSize: { width: number; height: number };
  layersOpen: boolean;
  elementNames: Record<string, string>;
  activeTool: 'select' | 'pen' | 'highlighter' | 'eraser';
  drawColor: string;
  drawWidth: number;

  // Video-timeline playback — ephemeral, not undo-tracked and not persisted (unlike
  // page transitions and element animations, which are real persisted Page/CanvasElement
  // fields — see PageTransition/ElementAnimation in types/index.ts).
  isPlaying: boolean;
  playheadMs: number;
  playbackRate: number;

  setProject: (project: Project) => void;
  addPage: () => void;
  removePage: (index: number) => void;
  setCurrentPage: (index: number) => void;
  updatePage: (index: number, data: Partial<Page>) => void;
  duplicatePage: (index: number) => void;
  reorderPages: (from: number, to: number) => void;

  addElement: (element: Partial<CanvasElement> & { type: CanvasElement['type'] }) => void;
  updateElement: (id: string, data: Partial<CanvasElement>) => void;
  removeElements: (ids: string[]) => void;
  duplicateElements: (ids: string[]) => void;
  setActiveTool: (tool: EditorState['activeTool']) => void;
  setDrawColor: (color: string) => void;
  setDrawWidth: (width: number) => void;
  addDrawing: (points: number[], tool: 'pen' | 'highlighter' | 'eraser', stroke: string, strokeWidth: number) => void;
  selectElement: (id: string | null, multi?: boolean) => void;
  selectAll: () => void;
  deselectAll: () => void;
  setHoveredElement: (id: string | null) => void;

  moveElement: (id: string, x: number, y: number) => void;
  resizeElement: (id: string, width: number, height: number) => void;
  rotateElement: (id: string, rotation: number) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  lockElement: (id: string) => void;
  unlockElement: (id: string) => void;
  hideElement: (id: string) => void;
  showElement: (id: string) => void;
  // Canva-style align: a single id aligns to the page bounds; 2+ ids align to
  // each other's shared bounding box (the selection), matching real Canva's
  // "align" behavior for single vs. multi-selection.
  alignElements: (ids: string[], edge: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom') => void;
  // Even edge-to-edge spacing along an axis — needs 3+ elements (the first and
  // last stay put, everything between is spaced evenly), matching Canva's
  // "distribute" behavior.
  distributeElements: (ids: string[], axis: 'horizontal' | 'vertical') => void;
  groupElements: (ids: string[]) => void;
  ungroupElements: (id: string) => void;

  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  resetZoom: () => void;
  setPan: (x: number, y: number) => void;
  setViewportSize: (width: number, height: number) => void;

  toggleGrid: () => void;
  toggleRulers: () => void;
  toggleGuides: () => void;
  toggleSnap: () => void;
  setGridSize: (size: number) => void;

  undo: () => void;
  redo: () => void;
  pushHistory: () => void;

  setSidePanelTab: (tab: string) => void;
  setRightPanelOpen: (open: boolean) => void;
  rightPanelSection: string;
  setRightPanelSection: (section: string) => void;
  setCommentsOpen: (open: boolean) => void;
  setVersionsOpen: (open: boolean) => void;
  setLayersOpen: (open: boolean) => void;
  updatePageTransition: (pageIndex: number, transition: PageTransition) => void;
  setElementAnimation: (elementId: string, animation: ElementAnimation) => void;
  renameElement: (elementId: string, name: string) => void;
  setPageBackgroundColor: (pageIndex: number, color: string) => void;
  // Removes the element and sets it as the page's background in one history step —
  // see PageBackgroundImage for why this is a page property, not a CanvasElement.
  setElementAsPageBackground: (elementId: string, backgroundImage: PageBackgroundImage) => void;
  clearPageBackgroundImage: (pageIndex: number) => void;
  // Swaps in a freshly-patched working-background URL after an on-demand
  // reconstructElementRegion() call (see EditorCanvas.tsx) — a silent technical
  // update, not a user action, so unlike setElementAsPageBackground it does not
  // push a history entry (undo shouldn't visibly "unreveal" a cleaned region).
  // Scoped by pageId so a stale in-flight reconstruction from a page the user
  // has since navigated away from can't clobber a different page's background.
  patchPageBackgroundImageSrc: (pageId: string, src: string) => void;

  importDocumentPages: (defs: Array<{
    name: string;
    width: number;
    height: number;
    backgroundColor: string;
    elements: Omit<CanvasElement, 'id'>[];
  }>) => void;

  setSaving: (saving: boolean) => void;
  setLastSaved: (time: string) => void;
  setCollaborators: (collaborators: EditorState['collaborators']) => void;

  copy: () => void;
  paste: () => void;
  cut: () => void;
  setViewportCenter: (x: number, y: number) => void;

  setIsPlaying: (playing: boolean) => void;
  setPlayheadMs: (ms: number) => void;
  setPlaybackRate: (rate: number) => void;
  addTrack: (type: 'video' | 'text' | 'audio', name?: string) => string;
  removeTrack: (trackId: string) => void;
  assignElementToTrack: (elementId: string, trackId: string, timelineStart: number, timelineEnd: number) => void;
  setPageDuration: (pageIndex: number, duration: number) => void;
  splitClipAtTime: (elementId: string, atMs: number) => void;
  duplicateClipOnTimeline: (elementId: string) => void;

  get currentPage(): Page | null;
  get selectedElements(): CanvasElement[];
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: null,
  loadGeneration: 0,
  pages: [
    {
      id: generateId(),
      name: 'Page 1',
      elements: [],
      backgroundColor: '#FFFFFF',
      width: 1920,
      height: 1080,
    },
  ],
  currentPageIndex: 0,
  selectedElementIds: [],
  hoveredElementId: null,
  zoom: 0.5,
  panX: 0,
  panY: 0,
  showGrid: false,
  showRulers: false,
  showGuides: true,
  snapEnabled: true,
  gridSize: 20,
  isDragging: false,
  isResizing: false,
  isEditing: false,
  clipboard: [],
  history: [],
  historyIndex: -1,
  sidePanelTab: 'templates',
  rightPanelOpen: true,
  rightPanelSection: 'properties',
  isSaving: false,
  lastSaved: null,
  collaborators: [],
  commentsOpen: false,
  versionsOpen: false,
  viewportCenter: { x: 960, y: 540 },
  viewportSize: { width: 0, height: 0 },
  layersOpen: false,
  elementNames: {},
  activeTool: 'select',
  drawColor: '#1E1E1E',
  drawWidth: 4,

  isPlaying: false,
  playheadMs: 0,
  playbackRate: 1,

  setProject: (project) => {
    set({
      project,
      loadGeneration: get().loadGeneration + 1,
      pages: project.pages.length > 0 ? project.pages : [
        {
          id: generateId(),
          name: 'Page 1',
          elements: [],
          backgroundColor: '#FFFFFF',
          width: 1920,
          height: 1080,
        },
      ],
    });
    get().pushHistory();
  },

  addPage: () => {
    const { pages } = get();
    const lastPage = pages[pages.length - 1];
    const newPage: Page = {
      id: generateId(),
      name: `Page ${pages.length + 1}`,
      elements: [],
      backgroundColor: lastPage?.backgroundColor || '#FFFFFF',
      width: lastPage?.width || 1920,
      height: lastPage?.height || 1080,
    };
    set({ pages: [...pages, newPage], currentPageIndex: pages.length });
    get().pushHistory();
  },

  removePage: (index) => {
    const { pages, currentPageIndex } = get();
    if (pages.length <= 1) return;
    const newPages = pages.filter((_, i) => i !== index);
    set({
      pages: newPages,
      currentPageIndex: Math.min(currentPageIndex, newPages.length - 1),
    });
    get().pushHistory();
  },

  setCurrentPage: (index) => {
    set({ currentPageIndex: index, selectedElementIds: [], hoveredElementId: null });
  },

  updatePage: (index, data) => {
    const { pages } = get();
    const newPages = [...pages];
    newPages[index] = { ...newPages[index], ...data };
    set({ pages: newPages });
  },

  duplicatePage: (index) => {
    const { pages } = get();
    const page = pages[index];
    const newPage: Page = {
      ...JSON.parse(JSON.stringify(page)),
      id: generateId(),
      name: `${page.name} (Copy)`,
    };
    const newPages = [...pages];
    newPages.splice(index + 1, 0, newPage);
    set({ pages: newPages, currentPageIndex: index + 1 });
    get().pushHistory();
  },

  reorderPages: (from, to) => {
    const { pages, currentPageIndex } = get();
    const newPages = [...pages];
    const [moved] = newPages.splice(from, 1);
    newPages.splice(to, 0, moved);
    let newIndex = currentPageIndex;
    if (currentPageIndex === from) newIndex = to;
    else if (from < currentPageIndex && to >= currentPageIndex) newIndex--;
    else if (from > currentPageIndex && to <= currentPageIndex) newIndex++;
    set({ pages: newPages, currentPageIndex: newIndex });
    get().pushHistory();
  },

  addElement: (elementData) => {
    const { pages, currentPageIndex, viewportCenter } = get();
    const page = pages[currentPageIndex];
    const maxZ = page.elements.length > 0
      ? Math.max(...page.elements.map((e) => e.zIndex))
      : -1;

    const shapeDefaults: Record<string, { w: number; h: number }> = {
      rectangle: { w: 200, h: 120 },
      circle: { w: 120, h: 120 },
      triangle: { w: 150, h: 130 },
      star: { w: 120, h: 120 },
      pentagon: { w: 120, h: 120 },
      hexagon: { w: 120, h: 120 },
      diamond: { w: 120, h: 120 },
      arrow: { w: 200, h: 50 },
      line: { w: 250, h: 4 },
      heart: { w: 120, h: 120 },
    };

    const defaults: Record<string, unknown> = {
      text: {
        content: 'Text',
        fontFamily: 'Inter',
        fontSize: 32,
        fontWeight: 500,
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'left',
        color: '#000000',
        lineHeight: 1.4,
        letterSpacing: 0,
        textTransform: 'none',
      },
      image: {
        src: (elementData.data as any)?.src || '',
        objectFit: 'cover',
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
      },
      shape: {
        shapeType: 'rectangle',
        fill: '#7B2FBE',
        stroke: 'transparent',
        strokeWidth: 0,
        cornerRadius: 0,
      },
      icon: {
        iconSet: 'custom',
        iconName: 'star',
        svgPath: '',
        fill: '#000000',
      },
      sticker: {
        iconSet: 'stickers',
        iconName: 'smile',
        svgPath: '',
        fill: '#FFD700',
      },
      chart: {
        chartType: 'bar',
        data: [
          { label: 'Q1', value: 25, color: '#7B2FBE' },
          { label: 'Q2', value: 40, color: '#00C4CC' },
          { label: 'Q3', value: 35, color: '#FF6B9D' },
          { label: 'Q4', value: 50, color: '#FF8A00' },
        ],
        showLabels: true,
        showLegend: true,
      },
      table: {
        rows: 3,
        cols: 3,
        cells: [['Header 1', 'Header 2', 'Header 3'], ['Cell 1', 'Cell 2', 'Cell 3'], ['Cell 4', 'Cell 5', 'Cell 6']],
        headerRow: true,
        borderColor: '#E5E5E5',
        headerBgColor: '#7B2FBE',
        headerTextColor: '#FFFFFF',
        cellTextColor: '#333333',
      },
      video: {
        src: '',
        autoplay: false,
        loop: false,
        muted: true,
        startTime: 0,
        endTime: 0,
      },
      audio: {
        src: '',
        volume: 1,
        muted: false,
        loop: false,
        startTime: 0,
        endTime: 0,
      },
    };

    // Determine default dimensions per type
    let defaultWidth: number;
    let defaultHeight: number;

    if (elementData.type === 'text') {
      defaultWidth = 400;
      defaultHeight = 60;
    } else if (elementData.type === 'shape') {
      const shapeType = (elementData.data as any)?.shapeType || 'rectangle';
      const sd = shapeDefaults[shapeType] || { w: 200, h: 120 };
      defaultWidth = sd.w;
      defaultHeight = sd.h;
    } else if (elementData.type === 'chart') {
      defaultWidth = 400;
      defaultHeight = 300;
    } else if (elementData.type === 'table') {
      defaultWidth = 500;
      defaultHeight = 250;
    } else {
      defaultWidth = 300;
      defaultHeight = 300;
    }

    // Center of the page (always center new elements on the visible page)
    const centerX = page.width / 2 - defaultWidth / 2;
    const centerY = page.height / 2 - defaultHeight / 2;

    const element: CanvasElement = {
      id: generateId(),
      type: elementData.type,
      x: elementData.x ?? centerX,
      y: elementData.y ?? centerY,
      width: elementData.width ?? defaultWidth,
      height: elementData.height ?? defaultHeight,
      rotation: elementData.rotation ?? 0,
      opacity: elementData.opacity ?? 1,
      visible: elementData.visible ?? true,
      locked: elementData.locked ?? false,
      name: elementData.name ?? `${elementData.type} ${page.elements.length + 1}`,
      fill: elementData.fill,
      stroke: elementData.stroke,
      strokeWidth: elementData.strokeWidth,
      shadow: elementData.shadow,
      zIndex: maxZ + 1,
      // Callers that already know this element belongs on a timeline track (video
      // auto-added to the timeline, see LeftSidebar.tsx's addVideoToCanvas) pass these
      // through — previously silently dropped here, which was the root cause of newly
      // added video never actually landing on a track despite the caller intending it to.
      trackId: elementData.trackId,
      timelineStart: elementData.timelineStart,
      timelineEnd: elementData.timelineEnd,
      data: { ...(defaults[elementData.type] || {}), ...(elementData.data || {}) } as CanvasElement['data'],
    };

    const newPages = [...pages];
    newPages[currentPageIndex] = {
      ...page,
      elements: [...page.elements, element],
    };
    set({
      pages: newPages,
      selectedElementIds: [element.id],
      rightPanelOpen: true,
    });
    get().pushHistory();
  },

  setActiveTool: (tool) => set({ activeTool: tool, selectedElementIds: [] }),
  setDrawColor: (color) => set({ drawColor: color }),
  setDrawWidth: (width) => set({ drawWidth: width }),

  addDrawing: (points, tool, stroke, strokeWidth) => {
    if (points.length < 4) return; // fewer than 2 points — not a real stroke
    const xs = points.filter((_, i) => i % 2 === 0);
    const ys = points.filter((_, i) => i % 2 === 1);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    // Points are stored relative to the element's own bounding box (matching every
    // other element's x/y-relative convention), padded by the stroke width so thick
    // strokes don't get visually clipped right at the edge of their own bounding box.
    const pad = strokeWidth;
    const relativePoints = points.map((v, i) => (i % 2 === 0 ? v - minX + pad : v - minY + pad));

    get().addElement({
      type: 'drawing',
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
      name: tool === 'pen' ? 'Drawing' : tool === 'highlighter' ? 'Highlight' : 'Eraser',
      data: { type: 'drawing', tool, points: relativePoints, stroke, strokeWidth } as any,
    });
  },

  updateElement: (id, data) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const newPages = [...pages];
    newPages[currentPageIndex] = {
      ...page,
      elements: page.elements.map((el) =>
        el.id === id ? { ...el, ...data } : el
      ),
    };
    set({ pages: newPages });
  },

  removeElements: (ids) => {
    const { pages, currentPageIndex, selectedElementIds } = get();
    const page = pages[currentPageIndex];
    const newPages = [...pages];
    newPages[currentPageIndex] = {
      ...page,
      elements: page.elements.filter((el) => !ids.includes(el.id)),
    };
    set({
      pages: newPages,
      selectedElementIds: selectedElementIds.filter((id) => !ids.includes(id)),
    });
    get().pushHistory();
  },

  duplicateElements: (ids) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const elementsToDuplicate = page.elements.filter((el) => ids.includes(el.id));
    const maxZ = Math.max(...page.elements.map((e) => e.zIndex));
    const duplicates = elementsToDuplicate.map((el, i) => ({
      ...JSON.parse(JSON.stringify(el)),
      id: generateId(),
      x: el.x + 20,
      y: el.y + 20,
      zIndex: maxZ + i + 1,
      name: `${el.name} (Copy)`,
    }));
    const newPages = [...pages];
    newPages[currentPageIndex] = {
      ...page,
      elements: [...page.elements, ...duplicates],
    };
    set({
      pages: newPages,
      selectedElementIds: duplicates.map((d) => d.id),
    });
    get().pushHistory();
  },

  selectElement: (id, multi = false) => {
    const { selectedElementIds } = get();
    if (!id) {
      set({ selectedElementIds: [] });
      return;
    }
    if (multi) {
      if (selectedElementIds.includes(id)) {
        set({ selectedElementIds: selectedElementIds.filter((i) => i !== id) });
      } else {
        set({ selectedElementIds: [...selectedElementIds, id] });
      }
    } else {
      set({ selectedElementIds: [id] });
    }
  },

  selectAll: () => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    set({ selectedElementIds: page.elements.filter((e) => !e.locked).map((e) => e.id) });
  },

  deselectAll: () => set({ selectedElementIds: [] }),

  setHoveredElement: (id) => set({ hoveredElementId: id }),

  moveElement: (id, x, y) => {
    get().updateElement(id, { x, y });
  },

  resizeElement: (id, width, height) => {
    get().updateElement(id, { width: Math.max(20, width), height: Math.max(20, height) });
  },

  rotateElement: (id, rotation) => {
    get().updateElement(id, { rotation });
  },

  bringForward: (id) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const elements = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
    const idx = elements.findIndex((e) => e.id === id);
    if (idx < elements.length - 1) {
      const temp = elements[idx].zIndex;
      elements[idx] = { ...elements[idx], zIndex: elements[idx + 1].zIndex };
      elements[idx + 1] = { ...elements[idx + 1], zIndex: temp };
    }
    const newPages = [...pages];
    newPages[currentPageIndex] = { ...page, elements };
    set({ pages: newPages });
  },

  sendBackward: (id) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const elements = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
    const idx = elements.findIndex((e) => e.id === id);
    if (idx > 0) {
      const temp = elements[idx].zIndex;
      elements[idx] = { ...elements[idx], zIndex: elements[idx - 1].zIndex };
      elements[idx - 1] = { ...elements[idx - 1], zIndex: temp };
    }
    const newPages = [...pages];
    newPages[currentPageIndex] = { ...page, elements };
    set({ pages: newPages });
  },

  bringToFront: (id) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const maxZ = Math.max(...page.elements.map((e) => e.zIndex));
    const newPages = [...pages];
    newPages[currentPageIndex] = {
      ...page,
      elements: page.elements.map((e) =>
        e.id === id ? { ...e, zIndex: maxZ + 1 } : e
      ),
    };
    set({ pages: newPages });
  },

  sendToBack: (id) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const minZ = Math.min(...page.elements.map((e) => e.zIndex));
    const newPages = [...pages];
    newPages[currentPageIndex] = {
      ...page,
      elements: page.elements.map((e) =>
        e.id === id ? { ...e, zIndex: minZ - 1 } : e
      ),
    };
    set({ pages: newPages });
  },

  lockElement: (id) => { get().updateElement(id, { locked: true }); get().pushHistory(); },
  unlockElement: (id) => { get().updateElement(id, { locked: false }); get().pushHistory(); },
  hideElement: (id) => { get().updateElement(id, { visible: false }); get().pushHistory(); },
  showElement: (id) => { get().updateElement(id, { visible: true }); get().pushHistory(); },

  alignElements: (ids, edge) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const targets = page.elements.filter((e) => ids.includes(e.id) && !e.locked);
    if (targets.length === 0) return;
    // One element aligns to the page; two or more align to their own shared
    // bounding box, so aligning a multi-selection moves them relative to each
    // other rather than snapping every one of them to the page edge.
    const [minX, maxX, minY, maxY] = targets.length === 1
      ? [0, page.width, 0, page.height]
      : [
          Math.min(...targets.map((e) => e.x)),
          Math.max(...targets.map((e) => e.x + e.width)),
          Math.min(...targets.map((e) => e.y)),
          Math.max(...targets.map((e) => e.y + e.height)),
        ];
    const targetIds = new Set(targets.map((e) => e.id));
    const newPages = [...pages];
    newPages[currentPageIndex] = {
      ...page,
      elements: page.elements.map((e) => {
        if (!targetIds.has(e.id)) return e;
        switch (edge) {
          case 'left': return { ...e, x: minX };
          case 'centerH': return { ...e, x: (minX + maxX) / 2 - e.width / 2 };
          case 'right': return { ...e, x: maxX - e.width };
          case 'top': return { ...e, y: minY };
          case 'centerV': return { ...e, y: (minY + maxY) / 2 - e.height / 2 };
          case 'bottom': return { ...e, y: maxY - e.height };
          default: return e;
        }
      }),
    };
    set({ pages: newPages });
    get().pushHistory();
  },

  distributeElements: (ids, axis) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const targets = page.elements.filter((e) => ids.includes(e.id) && !e.locked);
    if (targets.length < 3) return;
    const sorted = [...targets].sort((a, b) => axis === 'horizontal' ? a.x - b.x : a.y - b.y);
    const first = sorted[0], last = sorted[sorted.length - 1];
    const size = (e: CanvasElement) => axis === 'horizontal' ? e.width : e.height;
    const start = (e: CanvasElement) => axis === 'horizontal' ? e.x : e.y;
    const totalSpan = (start(last) + size(last)) - start(first);
    const totalSize = sorted.reduce((s, e) => s + size(e), 0);
    const gap = (totalSpan - totalSize) / (sorted.length - 1);
    const positions = new Map<string, number>();
    let cursor = start(first);
    for (const e of sorted) {
      positions.set(e.id, cursor);
      cursor += size(e) + gap;
    }
    const newPages = [...pages];
    newPages[currentPageIndex] = {
      ...page,
      elements: page.elements.map((e) => {
        if (!positions.has(e.id)) return e;
        const pos = positions.get(e.id)!;
        return axis === 'horizontal' ? { ...e, x: pos } : { ...e, y: pos };
      }),
    };
    set({ pages: newPages });
    get().pushHistory();
  },

  groupElements: (ids) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const groupId = generateId();
    const newPages = [...pages];
    newPages[currentPageIndex] = {
      ...page,
      elements: page.elements.map((e) =>
        ids.includes(e.id) ? { ...e, groupId } : e
      ),
    };
    set({ pages: newPages, selectedElementIds: [groupId] });
    get().pushHistory();
  },

  ungroupElements: (id) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const element = page.elements.find((e) => e.id === id);
    if (!element?.groupId) return;
    const newPages = [...pages];
    newPages[currentPageIndex] = {
      ...page,
      elements: page.elements.map((e) =>
        e.groupId === element.groupId ? { ...e, groupId: undefined } : e
      ),
    };
    set({ pages: newPages });
    get().pushHistory();
  },

  // Every zoom change is anchored to the viewport's current center — without
  // this, changing zoom while panned drifts the design toward wherever
  // panX/panY happens to point, and at a small enough zoom that can push
  // the whole page (and whatever's selected on it) off-screen entirely.
  // Verified directly: zooming out via the toolbar buttons after panning
  // did exactly this. Falls back to a zoom-only change if the viewport
  // hasn't been measured yet (viewportSize starts at 0,0 before
  // EditorCanvas's ResizeObserver reports the container's real size).
  setZoom: (zoom) => set((s) => {
    const clamped = Math.max(0.1, Math.min(5, zoom));
    const { width, height } = s.viewportSize;
    if (width <= 0 || height <= 0) return { zoom: clamped };
    const cx = width / 2, cy = height / 2;
    const stageX = (cx - s.panX) / s.zoom, stageY = (cy - s.panY) / s.zoom;
    return { zoom: clamped, panX: cx - stageX * clamped, panY: cy - stageY * clamped };
  }),
  zoomIn: () => get().setZoom(get().zoom * 1.2),
  zoomOut: () => get().setZoom(get().zoom / 1.2),
  // Recomputes zoom from the page's actual dimensions against the last-measured
  // viewport size, mirroring the same formula EditorCanvas uses for its one-time
  // initial fit — so the toolbar's "Fit" button produces the same result a fresh
  // page load would, instead of the flat zoom=1/pan=(0,0) this used to do (which
  // left the page anywhere from off-screen to cut off depending on prior pan).
  zoomToFit: () => set((s) => {
    const { width, height } = s.viewportSize;
    const page = s.pages[s.currentPageIndex];
    if (!page || width <= 0 || height <= 0) return {};
    const scale = Math.min(
      (width - 100) / page.width,
      (height - 100) / page.height,
      1
    ) * 0.8;
    return {
      zoom: scale,
      panX: (width - page.width * scale) / 2,
      panY: (height - page.height * scale) / 2,
    };
  }),
  resetZoom: () => set({ zoom: 1, panX: 0, panY: 0 }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  setViewportSize: (width, height) => set({ viewportSize: { width, height } }),

  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleRulers: () => set((s) => ({ showRulers: !s.showRulers })),
  toggleGuides: () => set((s) => ({ showGuides: !s.showGuides })),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setGridSize: (size) => set({ gridSize: Math.max(2, Math.min(200, size)) }),

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const entry = history[historyIndex - 1];
      set({
        pages: entry.pages,
        currentPageIndex: entry.currentPageIndex,
        historyIndex: historyIndex - 1,
      });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const entry = history[historyIndex + 1];
      set({
        pages: entry.pages,
        currentPageIndex: entry.currentPageIndex,
        historyIndex: historyIndex + 1,
      });
    }
  },

  pushHistory: () => {
    const { pages, currentPageIndex, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({
      pages: JSON.parse(JSON.stringify(pages)),
      currentPageIndex,
    });
    if (newHistory.length > 50) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  setSidePanelTab: (tab) => set({ sidePanelTab: tab }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setRightPanelSection: (section) => set({ rightPanelSection: section }),
  setCommentsOpen: (open) => set({ commentsOpen: open, versionsOpen: false }),
  setVersionsOpen: (open) => set({ versionsOpen: open, commentsOpen: false }),
  setSaving: (saving) => set({ isSaving: saving }),
  setLastSaved: (time) => set({ lastSaved: time }),
  setCollaborators: (collaborators) => set({ collaborators }),

  copy: () => {
    const { pages, currentPageIndex, selectedElementIds } = get();
    const page = pages[currentPageIndex];
    const elements = page.elements.filter((e) => selectedElementIds.includes(e.id));
    set({ clipboard: JSON.parse(JSON.stringify(elements)) });
  },

  paste: () => {
    const { clipboard, pages, currentPageIndex } = get();
    if (clipboard.length === 0) return;
    const page = pages[currentPageIndex];
    const maxZ = Math.max(...page.elements.map((e) => e.zIndex), 0);
    const pasted = clipboard.map((el, i) => ({
      ...el,
      id: generateId(),
      x: el.x + 20,
      y: el.y + 20,
      zIndex: maxZ + i + 1,
      name: `${el.name} (Pasted)`,
    }));
    const newPages = [...pages];
    newPages[currentPageIndex] = {
      ...page,
      elements: [...page.elements, ...pasted],
    };
    set({
      pages: newPages,
      selectedElementIds: pasted.map((p) => p.id),
    });
    get().pushHistory();
  },

  cut: () => {
    get().copy();
    get().removeElements(get().selectedElementIds);
  },

  setViewportCenter: (x, y) => set({ viewportCenter: { x, y } }),

  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setPlayheadMs: (ms) => set({ playheadMs: ms }),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),

  addTrack: (type, name) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const tracks = page.tracks || [];
    const track: Track = {
      id: generateId(),
      type,
      name: name || `${type[0].toUpperCase()}${type.slice(1)} ${tracks.filter((t) => t.type === type).length + 1}`,
    };
    const newPages = [...pages];
    newPages[currentPageIndex] = { ...page, tracks: [...tracks, track] };
    set({ pages: newPages });
    get().pushHistory();
    return track.id;
  },

  removeTrack: (trackId) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const newPages = [...pages];
    newPages[currentPageIndex] = {
      ...page,
      tracks: (page.tracks || []).filter((t) => t.id !== trackId),
      elements: page.elements.filter((e) => e.trackId !== trackId),
    };
    set({ pages: newPages });
    get().pushHistory();
  },

  assignElementToTrack: (elementId, trackId, timelineStart, timelineEnd) => {
    get().updateElement(elementId, { trackId, timelineStart, timelineEnd });
    get().pushHistory();
  },

  setPageDuration: (pageIndex, duration) => {
    const { pages } = get();
    const newPages = [...pages];
    newPages[pageIndex] = { ...newPages[pageIndex], duration: Math.max(0, duration) };
    set({ pages: newPages });
    get().pushHistory();
  },

  // Cuts a clip into two independent clips at `atMs` — the original shrinks to end
  // at the cut point, and a new clip picks up from there to the original's old end.
  // For video/audio, each half's own media-trim (data.startTime/endTime) is adjusted
  // so playback content stays continuous across the cut — the viewer should never be
  // able to tell a split happened just from watching it play.
  splitClipAtTime: (elementId, atMs) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const clip = page.elements.find((e) => e.id === elementId);
    if (!clip || !clip.trackId) return;
    const start = clip.timelineStart ?? 0;
    const end = clip.timelineEnd ?? 0;
    // Splitting only makes sense strictly inside the clip — at or past either edge
    // there's nothing to cut.
    if (atMs <= start + 50 || atMs >= end - 50) return;

    const hasMediaTrim = clip.type === 'video' || clip.type === 'audio';
    const mediaStart = hasMediaTrim ? ((clip.data as any).startTime || 0) : 0;
    const splitMediaOffset = (atMs - start) / 1000;

    const maxZ = Math.max(...page.elements.map((e) => e.zIndex));
    const secondHalf: CanvasElement = {
      ...JSON.parse(JSON.stringify(clip)),
      id: generateId(),
      zIndex: maxZ + 1,
      timelineStart: atMs,
      timelineEnd: end,
      data: hasMediaTrim ? { ...clip.data, startTime: mediaStart + splitMediaOffset } : clip.data,
    };

    const newPages = [...pages];
    newPages[currentPageIndex] = {
      ...page,
      elements: page.elements.map((e) => e.id === elementId
        ? { ...e, timelineEnd: atMs, data: hasMediaTrim ? { ...e.data, endTime: mediaStart + splitMediaOffset } as any : e.data }
        : e
      ).concat(secondHalf),
    };
    set({ pages: newPages, selectedElementIds: [secondHalf.id] });
    get().pushHistory();
  },

  // Timeline-aware duplicate — unlike the generic duplicateElements (which stacks the
  // copy directly on top at the same timelineStart/End, invisible until dragged away),
  // this places the copy immediately after the original on the same track, clamped to
  // whatever room is actually free before the next clip or the scene's own end.
  duplicateClipOnTimeline: (elementId) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const clip = page.elements.find((e) => e.id === elementId);
    if (!clip || !clip.trackId) return;
    const start = clip.timelineStart ?? 0;
    const end = clip.timelineEnd ?? 0;
    const clipLen = end - start;

    const trackClips = page.elements.filter((e) => e.trackId === clip.trackId && e.id !== elementId);
    const nextClipStart = trackClips
      .map((c) => c.timelineStart ?? 0)
      .filter((s) => s >= end)
      .reduce((min, s) => Math.min(min, s), page.duration || Infinity);
    const availableLen = Math.min(clipLen, nextClipStart - end);
    if (availableLen < 200) return; // no meaningful room right after this clip

    const maxZ = Math.max(...page.elements.map((e) => e.zIndex));
    const duplicate: CanvasElement = {
      ...JSON.parse(JSON.stringify(clip)),
      id: generateId(),
      zIndex: maxZ + 1,
      name: `${clip.name} (Copy)`,
      timelineStart: end,
      timelineEnd: end + availableLen,
    };
    const newPages = [...pages];
    newPages[currentPageIndex] = { ...page, elements: [...page.elements, duplicate] };
    set({ pages: newPages, selectedElementIds: [duplicate.id] });
    get().pushHistory();
  },

  setLayersOpen: (open) => set({ layersOpen: open }),

  updatePageTransition: (pageIndex, transition) => {
    const { pages } = get();
    const newPages = [...pages];
    newPages[pageIndex] = { ...newPages[pageIndex], transition };
    set({ pages: newPages });
  },

  setElementAnimation: (elementId, animation) => {
    const { pages, currentPageIndex } = get();
    const page = pages[currentPageIndex];
    const newPages = [...pages];
    newPages[currentPageIndex] = {
      ...page,
      elements: page.elements.map((el) => (el.id === elementId ? { ...el, animation } : el)),
    };
    set({ pages: newPages });
  },

  renameElement: (elementId, name) => {
    set((state) => ({
      elementNames: { ...state.elementNames, [elementId]: name },
    }));
  },

  setPageBackgroundColor: (pageIndex, color) => {
    const { pages } = get();
    const newPages = [...pages];
    // A page-level background image, when present, is opaque and fully covers the
    // page (see PageBackgroundImage), so it always visually hides backgroundColor
    // underneath — picking a new color/gradient here has to replace it, or the
    // picker would look completely broken (color "applies" but nothing changes).
    // Matches real Canva: choosing a background color clears any background photo.
    newPages[pageIndex] = { ...newPages[pageIndex], backgroundColor: color, backgroundImage: undefined };
    set({ pages: newPages });
  },

  setElementAsPageBackground: (elementId, backgroundImage) => {
    const { pages, currentPageIndex, selectedElementIds } = get();
    const page = pages[currentPageIndex];
    const newPages = [...pages];
    // One atomic update — removing the element AND setting the background together —
    // so undo reverses both in a single step instead of leaving a half-converted state.
    newPages[currentPageIndex] = {
      ...page,
      backgroundImage,
      elements: page.elements.filter((el) => el.id !== elementId),
    };
    set({
      pages: newPages,
      selectedElementIds: selectedElementIds.filter((id) => id !== elementId),
    });
    get().pushHistory();
  },

  clearPageBackgroundImage: (pageIndex) => {
    const { pages } = get();
    const newPages = [...pages];
    newPages[pageIndex] = { ...newPages[pageIndex], backgroundImage: undefined };
    set({ pages: newPages });
    get().pushHistory();
  },

  patchPageBackgroundImageSrc: (pageId, src) => {
    const { pages } = get();
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1 || !pages[idx].backgroundImage) return;
    const newPages = [...pages];
    newPages[idx] = { ...newPages[idx], backgroundImage: { ...newPages[idx].backgroundImage!, src } };
    set({ pages: newPages });
  },

  importDocumentPages: (defs) => {
    const { pages, currentPageIndex } = get();
    const isBlankCanvas = pages.length === 1 && pages[0].elements.length === 0;

    const newPages: Page[] = defs.map((def) => ({
      id: generateId(),
      name: def.name,
      width: def.width,
      height: def.height,
      backgroundColor: def.backgroundColor,
      elements: def.elements.map((el) => ({ ...el, id: generateId() } as CanvasElement)),
    }));

    let finalPages: Page[];
    let firstIdx: number;
    if (isBlankCanvas) {
      finalPages = newPages;
      firstIdx = 0;
    } else {
      finalPages = [...pages];
      finalPages.splice(currentPageIndex + 1, 0, ...newPages);
      firstIdx = currentPageIndex + 1;
    }

    set({ pages: finalPages, currentPageIndex: firstIdx, selectedElementIds: [] });
    get().pushHistory();
  },

  get currentPage() {
    const state = get();
    return state.pages[state.currentPageIndex] || null;
  },

  get selectedElements() {
    const state = get();
    const page = state.pages[state.currentPageIndex];
    if (!page) return [];
    return page.elements.filter((e) => state.selectedElementIds.includes(e.id));
  },
}));
