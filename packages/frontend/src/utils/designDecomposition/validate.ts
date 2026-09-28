import type { Page } from '../../types';

/**
 * Last line of defense before a decomposed design replaces anything: every
 * layer must be finite, positive-sized, on the page, uniquely identified, and
 * (for text) non-empty. Returns human-readable problems; an empty array means valid.
 */
export function validateDecomposedPage(page: Page): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  if (!(page.width > 0 && page.height > 0)) problems.push('page has no size');
  if (!page.backgroundImage?.src) problems.push('page has no background image');

  for (const el of page.elements) {
    if (!el.id) { problems.push('a layer has no id'); continue; }
    if (seen.has(el.id)) problems.push(`duplicate layer id ${el.id}`);
    seen.add(el.id);
    const nums = [el.x, el.y, el.width, el.height, el.rotation, el.opacity, el.zIndex];
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) problems.push(`${el.name}: non-numeric geometry`);
    if (el.width <= 0 || el.height <= 0) problems.push(`${el.name}: zero size`);
    // A little slack: glyph overhang and fitted text boxes may poke a few px past the edge.
    const slack = 40;
    if (el.x + el.width < -slack || el.y + el.height < -slack || el.x > page.width + slack || el.y > page.height + slack) {
      problems.push(`${el.name}: outside the page`);
    }
    if (el.type === 'text' && !String((el.data as any).content || '').trim()) problems.push(`${el.name}: empty text`);
    if (el.type === 'image' && !(el.data as any).src) problems.push(`${el.name}: image has no source`);
  }
  return problems;
}
