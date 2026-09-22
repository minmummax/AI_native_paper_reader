import type { NormalizedRect } from '../types';

/** Viewport rectangle measured in CSS pixels, never a persistence format. */
export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Validates finite ratios, page numbering and page boundaries before persistence.
 * @param rect Candidate normalized rectangle.
 * @returns Nothing; throws RangeError when coordinates are invalid.
 */
export function assertNormalizedRect(rect: NormalizedRect): void {
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (!values.every(value => Number.isFinite(value) && value >= 0 && value <= 1)
      || !Number.isInteger(rect.page) || rect.page < 1
      // Opposite edges must stay inside the page; epsilon tolerates floating-point rounding.
      || rect.x + rect.width > 1 + Number.EPSILON
      || rect.y + rect.height > 1 + Number.EPSILON) {
    throw new RangeError('Annotation rectangles must be normalized within their page');
  }
}

/**
 * Converts a top-left viewport rectangle to zoom-independent storage coordinates.
 * @param rect CSS-pixel rectangle in the same viewport as pageWidth/pageHeight.
 * @param pageWidth Positive viewport width (CSS pixels, not HiDPI backing pixels).
 * @param pageHeight Positive viewport height in CSS pixels.
 * @param page One-based page number.
 * @returns Validated normalized rectangle.
 */
export function normalizeRect(rect: ViewportRect, pageWidth: number, pageHeight: number, page: number): NormalizedRect {
  if (!Number.isFinite(pageWidth) || !Number.isFinite(pageHeight) || pageWidth <= 0 || pageHeight <= 0) {
    throw new RangeError('Page dimensions must be finite and positive');
  }
  // Divide horizontal dimensions by viewport width and vertical ones by height.
  // Both operands use the same zoom and CSS-pixel space, so their ratios are zoom/DPR independent.
  const normalized = { x: rect.x / pageWidth, y: rect.y / pageHeight,
    width: rect.width / pageWidth, height: rect.height / pageHeight, page };
  assertNormalizedRect(normalized);
  return normalized;
}

/**
 * Encodes validated annotation rectangles, including the 1-based page on every rect.
 * @param rects Rectangles for one annotation.
 * @param pageNumber Annotation page; all rectangles must belong to it.
 * @returns JSON text suitable for annotations.rects_json.
 */
export function serializeRects(rects: readonly NormalizedRect[], pageNumber: number): string {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || rects.length === 0) {
    throw new RangeError('An annotation needs a valid page and at least one rectangle');
  }
  for (const rect of rects) {
    assertNormalizedRect(rect);
    if (rect.page !== pageNumber) throw new RangeError('Rectangle page does not match annotation page');
  }
  return JSON.stringify(rects);
}
