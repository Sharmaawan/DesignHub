import { create } from 'zustand';
import { CanvasElement, Page, Project, PageTransition, ElementAnimation } from '../types';
import { generateId } from '../utils/cn';

interface HistoryEntry {
  pages: Page[];
  currentPageIndex: number;
}

interface EditorState {
  project: Project | null;
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
  layersOpen: boolean;
  pageTransitions: PageTransition[];
  elementAnimations: Record<string, ElementAnimation>;
  elementNames: Record<string, string>;

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
  groupElements: (ids: string[]) => void;
  ungroupElements: (id: string) => void;

  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  resetZoom: () => void;
  setPan: (x: number, y: number) => void;

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

  get currentPage(): Page | null;
  get selectedElements(): CanvasElement[];
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: null,
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
  showRulers: true,
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
  layersOpen: false,
  pageTransitions: [{ type: 'none', duration: 0.5, delay: 0 }],
  elementAnimations: {},
  elementNames: {},

  setProject: (project) => {
    set({
      project,
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
    set({ selectedElementIds: page.elements.map((e) => e.id) });
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

  lockElement: (id) => get().updateElement(id, { locked: true }),
  unlockElement: (id) => get().updateElement(id, { locked: false }),
  hideElement: (id) => get().updateElement(id, { visible: false }),
  showElement: (id) => get().updateElement(id, { visible: true }),

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

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
  zoomIn: () => set((s) => ({ zoom: Math.min(5, s.zoom * 1.2) })),
  zoomOut: () => set((s) => ({ zoom: Math.max(0.1, s.zoom / 1.2) })),
  zoomToFit: () => set({ zoom: 0.5, panX: 0, panY: 0 }),
  resetZoom: () => set({ zoom: 1, panX: 0, panY: 0 }),
  setPan: (x, y) => set({ panX: x, panY: y }),

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

  setLayersOpen: (open) => set({ layersOpen: open }),

  updatePageTransition: (pageIndex, transition) => {
    const { pageTransitions } = get();
    const newTransitions = [...pageTransitions];
    while (newTransitions.length <= pageIndex) {
      newTransitions.push({ type: 'none', duration: 0.5, delay: 0 });
    }
    newTransitions[pageIndex] = transition;
    set({ pageTransitions: newTransitions });
  },

  setElementAnimation: (elementId, animation) => {
    set((state) => ({
      elementAnimations: { ...state.elementAnimations, [elementId]: animation },
    }));
  },

  renameElement: (elementId, name) => {
    set((state) => ({
      elementNames: { ...state.elementNames, [elementId]: name },
    }));
  },

  setPageBackgroundColor: (pageIndex, color) => {
    const { pages } = get();
    const newPages = [...pages];
    newPages[pageIndex] = { ...newPages[pageIndex], backgroundColor: color };
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
