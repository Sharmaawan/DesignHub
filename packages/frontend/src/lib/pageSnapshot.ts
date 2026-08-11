import { Page } from '../types';
import { mountOffscreenCanvas } from './videoExport';

// Renders an arbitrary page (not necessarily the one currently on screen) to a
// static image, off-screen — reuses the same isolated-EditorCanvas-instance
// technique videoExport.ts already relies on for pixel-identical export output,
// so capturing page N doesn't require switching currentPageIndex (and the visible
// flicker/undo-history churn that would cause) just to grab its canvas.
export async function capturePageAsDataUrl(
  page: Page,
  opts: { format?: 'png' | 'jpeg'; quality?: number; scale?: number } = {}
): Promise<string> {
  const { format = 'png', quality = 0.92, scale = 2 } = opts;
  const width = Math.max(1, Math.round(page.width * scale));
  const height = Math.max(1, Math.round(page.height * scale));
  const { canvas, root, container } = await mountOffscreenCanvas(page, width, height, scale);
  try {
    // Give images/fonts a moment to actually paint before capturing — same reasoning
    // as the equivalent settle wait in videoExport.ts's exportPageAsMp4.
    await new Promise((r) => setTimeout(r, 250));
    return canvas.toDataURL(format === 'jpeg' ? 'image/jpeg' : 'image/png', quality);
  } finally {
    root.unmount();
    container.remove();
  }
}
