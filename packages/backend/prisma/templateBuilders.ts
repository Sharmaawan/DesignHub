// Small composable helpers for authoring curated system templates — every
// helper returns a plain CanvasElement-shaped object (id, type, x/y/width/
// height, rotation/opacity/visible/locked/zIndex/name, data), matching
// exactly what packages/frontend's Page/CanvasElement contract expects (see
// TemplatesPage.handleUseTemplate and editorStore.setProject). Keeping this
// untyped/plain mirrors the rest of seed.ts, which has no dependency on the
// frontend package's types.
//
// A fresh element-id counter is scoped per template via `newTemplate()` so
// two templates never collide on ids within the same generated `data.pages`
// tree (ids only need to be unique within one template).

let counter = 0;
const nextId = () => `el-${++counter}`;

export function newTemplate() {
  counter = 0;
}

export function text(opts: {
  x: number; y: number; width: number; height: number;
  content: string; fontFamily?: string; fontSize: number; fontWeight?: number;
  color: string; textAlign?: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: number; letterSpacing?: number; opacity?: number; zIndex: number; name: string;
}) {
  return {
    id: nextId(), type: 'text', x: opts.x, y: opts.y, width: opts.width, height: opts.height,
    rotation: 0, opacity: opts.opacity ?? 1, visible: true, locked: false, zIndex: opts.zIndex, name: opts.name,
    data: {
      type: 'text', content: opts.content,
      fontFamily: opts.fontFamily || 'Inter', fontSize: opts.fontSize, fontWeight: opts.fontWeight ?? 400,
      fontStyle: 'normal', textDecoration: 'none', textAlign: opts.textAlign || 'left', color: opts.color,
      lineHeight: opts.lineHeight ?? 1.3, letterSpacing: opts.letterSpacing ?? 0, textTransform: 'none',
    },
  };
}

export function shape(opts: {
  x: number; y: number; width: number; height: number;
  shapeType?: 'rectangle' | 'circle' | 'triangle' | 'star' | 'pentagon' | 'hexagon' | 'diamond' | 'heart';
  fill: string; stroke?: string; strokeWidth?: number; cornerRadius?: number;
  opacity?: number; zIndex: number; name: string;
}) {
  return {
    id: nextId(), type: 'shape', x: opts.x, y: opts.y, width: opts.width, height: opts.height,
    rotation: 0, opacity: opts.opacity ?? 1, visible: true, locked: false, zIndex: opts.zIndex, name: opts.name,
    data: {
      type: 'shape', shapeType: opts.shapeType || 'rectangle', fill: opts.fill,
      stroke: opts.stroke || 'transparent', strokeWidth: opts.strokeWidth ?? 0, cornerRadius: opts.cornerRadius ?? 0,
    },
  };
}

// An empty photo placeholder — a "Frame" (see ShapeData.isFrameSlot in the
// frontend types), so every curated template's "image" is a real, native,
// independently editable element the user fills with their own photo,
// rather than a baked-in stock image with licensing implications.
export function frameSlot(opts: {
  x: number; y: number; width: number; height: number;
  shapeType?: 'circle' | 'rectangle'; cornerRadius?: number; zIndex: number; name?: string;
}) {
  return {
    id: nextId(), type: 'shape', x: opts.x, y: opts.y, width: opts.width, height: opts.height,
    rotation: 0, opacity: 1, visible: true, locked: false, zIndex: opts.zIndex, name: opts.name || 'Photo Frame',
    data: {
      type: 'shape', shapeType: opts.shapeType || 'circle', fill: '#F3F4F6', stroke: '#B8BCC4', strokeWidth: 2,
      cornerRadius: opts.cornerRadius ?? 0, isFrameSlot: true,
    },
  };
}

export function line(opts: {
  x: number; y: number; width: number; height?: number; fill: string; strokeWidth?: number; zIndex: number; name?: string;
}) {
  return {
    id: nextId(), type: 'shape', x: opts.x, y: opts.y, width: opts.width, height: opts.height ?? 4,
    rotation: 0, opacity: 1, visible: true, locked: false, zIndex: opts.zIndex, name: opts.name || 'Line',
    data: { type: 'shape', shapeType: 'line', fill: opts.fill, stroke: 'transparent', strokeWidth: opts.strokeWidth ?? 2, cornerRadius: 0 },
  };
}

export function page(opts: { id: string; width: number; height: number; backgroundColor: string; elements: any[] }) {
  return { id: opts.id, name: 'Page 1', backgroundColor: opts.backgroundColor, width: opts.width, height: opts.height, elements: opts.elements };
}

export function template(opts: { name: string; category: string; tags: string[]; pageData: ReturnType<typeof page> }) {
  return { name: opts.name, category: opts.category, thumbnail: '', data: { pages: [opts.pageData] }, tags: opts.tags, isPremium: false };
}
