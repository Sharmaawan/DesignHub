/**
 * Centralized coordinate transformation utility for the Canva-style editor.
 *
 * PHILOSOPHY:
 * - All element data is stored in DESIGN/PAGE SPACE (element.x, element.y)
 * - The viewport is defined by zoom and pan (panX, panY)
 * - This module converts between these spaces and SCREEN space
 *
 * MATH:
 * screenX = designX * zoom + panX
 * screenY = designY * zoom + panY
 *
 * designX = (screenX - panX) / zoom
 * designY = (screenY - panY) / zoom
 *
 * INVARIANT:
 * - Element x/y NEVER change due to zoom/pan changes
 * - Only viewport transformation changes
 */

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Convert a point from design/page space to screen space
 */
export function designPointToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: point.x * viewport.zoom + viewport.panX,
    y: point.y * viewport.zoom + viewport.panY,
  };
}

/**
 * Convert a point from screen space to design/page space
 */
export function screenPointToDesign(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  };
}

/**
 * Convert a rectangle from design/page space to screen space
 */
export function designRectToScreen(rect: Rect, viewport: Viewport): Rect {
  return {
    x: rect.x * viewport.zoom + viewport.panX,
    y: rect.y * viewport.zoom + viewport.panY,
    width: rect.width * viewport.zoom,
    height: rect.height * viewport.zoom,
  };
}

/**
 * Convert a rectangle from screen space to design/page space
 */
export function screenRectToDesign(rect: Rect, viewport: Viewport): Rect {
  return {
    x: (rect.x - viewport.panX) / viewport.zoom,
    y: (rect.y - viewport.panY) / viewport.zoom,
    width: rect.width / viewport.zoom,
    height: rect.height / viewport.zoom,
  };
}

/**
 * Convert a delta (relative movement) from screen space to design space
 * Used for: drag distance, resize delta, etc.
 */
export function screenDeltaToDesignDelta(delta: Point, viewport: Viewport): Point {
  return {
    x: delta.x / viewport.zoom,
    y: delta.y / viewport.zoom,
  };
}

/**
 * Convert a delta from design space to screen space
 */
export function designDeltaToScreenDelta(delta: Point, viewport: Viewport): Point {
  return {
    x: delta.x * viewport.zoom,
    y: delta.y * viewport.zoom,
  };
}

/**
 * Calculate the screen-space bounding box for a design element.
 * When the element has a non-zero rotation, the axis-aligned bounding box is
 * computed from the four rotated corners so overlays (selection handles, alignment
 * guides, screen-space hit tests) line up with what the user actually sees.
 */
export function getElementScreenRect(element: { x: number; y: number; width: number; height: number; rotation?: number }, viewport: Viewport): Rect {
  const rotation = element.rotation ?? 0;

  // Fast path: no rotation — simple scale + translate
  if (rotation === 0) return designRectToScreen(element, viewport);

  // Rotate all four corners around the element's own centre, then take the
  // axis-aligned bounding box of the rotated corners in screen space.
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Element centre in design space
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  const hw = element.width / 2;
  const hh = element.height / 2;

  // Four corners relative to centre, rotated
  const corners = [
    [-hw, -hh],
    [ hw, -hh],
    [ hw,  hh],
    [-hw,  hh],
  ].map(([dx, dy]) => ({
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  }));

  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  // Convert the design-space AABB to screen space
  return designRectToScreen({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, viewport);
}

/**
 * Calculate design-space point that should remain under the cursor when zooming
 * Used for cursor-anchored zoom operations
 */
export function getCursorAnchorDesignPoint(screenCursorPos: Point, viewport: Viewport): Point {
  return screenPointToDesign(screenCursorPos, viewport);
}

/**
 * Calculate new pan values such that a given design point remains under a screen cursor after zoom change
 */
export function calculatePanForAnchoredZoom(
  designAnchorPoint: Point,
  screenCursorPos: Point,
  newZoom: number,
  containerWidth: number,
  containerHeight: number,
  pageWidth: number,
  pageHeight: number,
): Point {
  // Map the anchor design point forward at the new zoom
  const newX = designAnchorPoint.x * newZoom;
  const newY = designAnchorPoint.y * newZoom;

  // Calculate pan so this point appears at the cursor position
  const panX = screenCursorPos.x - newX;
  const panY = screenCursorPos.y - newY;

  // Clamp pan to keep the page visible
  const clampedPanX = clampPan(panX, containerWidth, pageWidth * newZoom);
  const clampedPanY = clampPan(panY, containerHeight, pageHeight * newZoom);

  return { x: clampedPanX, y: clampedPanY };
}

/**
 * Clamp a pan value so the page stays visible (per-axis)
 * If page fits entirely, center it. Otherwise constrain edges.
 */
function clampPan(panValue: number, containerSpan: number, pageSpan: number): number {
  if (pageSpan <= containerSpan) {
    // Page fits — center it
    return (containerSpan - pageSpan) / 2;
  }
  // Page is larger — clamp edges to container edges
  return Math.min(0, Math.max(containerSpan - pageSpan, panValue));
}

/**
 * Calculate the zoom level that fits the page entirely within the container
 */
export function calculateFitZoom(
  containerWidth: number,
  containerHeight: number,
  pageWidth: number,
  pageHeight: number,
  insetPx: number = 32,
  maxZoom: number = 1,
): number {
  const scale = Math.min(
    (containerWidth - insetPx) / pageWidth,
    (containerHeight - insetPx) / pageHeight,
    maxZoom,
  ) * 0.94; // slight additional margin
  return Math.max(0.1, scale);
}

/**
 * Calculate centered pan for a given zoom level (fit-to-screen pan)
 */
export function calculateCenteredPan(
  containerWidth: number,
  containerHeight: number,
  pageWidth: number,
  pageHeight: number,
  zoom: number,
): Point {
  return {
    x: (containerWidth - pageWidth * zoom) / 2,
    y: (containerHeight - pageHeight * zoom) / 2,
  };
}
