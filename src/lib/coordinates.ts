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

/**
 * Rotates canonical ratios clockwise around a unit page, swapping width/height at quarter turns.
 * @param rect Normalized source rectangle. @param degrees Multiple of 90; negative values undo rotation.
 * @returns Rectangle in the rotated page's normalized coordinate system.
 */
export function rotateRect(rect: NormalizedRect, degrees: number): NormalizedRect {
  assertNormalizedRect(rect);
  if(!Number.isFinite(degrees)||degrees%90!==0)throw new RangeError('Rotation must be a multiple of 90');
  const turn = ((degrees % 360) + 360) % 360;
  let result={...rect};
  // At 90°, (x,y) maps to (1-y,x); subtract height to keep the rectangle's top-left corner.
  if (turn === 90) result={ ...rect, x: 1-rect.y-rect.height, y: rect.x, width: rect.height, height: rect.width };
  // At 180°, both axes reverse; subtract dimensions to locate the new top-left corner.
  if (turn === 180) result={ ...rect, x: 1-rect.x-rect.width, y: 1-rect.y-rect.height };
  // At 270°, (x,y) maps to (y,1-x); subtract width on the reversed vertical axis.
  if (turn === 270) result={ ...rect, x: rect.y, y: 1-rect.x-rect.width, width: rect.height, height: rect.width };
  // Snap only floating-point roundoff at page boundaries; 1 - 0.8 - 0.2 may be slightly negative.
  const snap=(value:number):number=>Math.abs(value)<1e-12?0:Math.abs(value-1)<1e-12?1:value;
  return {...result,x:snap(result.x),y:snap(result.y),width:snap(result.width),height:snap(result.height)};
}

/**
 * Coalesces overlapping/touching text fragments on the same line without bridging lines or columns.
 * @param rects Canonical page ratios, including legacy overlapping DOM selection bounds.
 * @param intrinsicRotation PDF page rotation; quarter turns make canonical text lines vertical.
 * @returns Fresh rectangles with one shared baseline per connected line segment.
 */
export function mergeTextRects(rects: readonly NormalizedRect[], intrinsicRotation = 0): NormalizedRect[] {
  // Unrotate intrinsic page coordinates so line clustering always works along the horizontal axis.
  const work=rects.filter(rect=>rect.width>0&&rect.height>0).map(rect=>rotateRect(rect,-intrinsicRotation));
  const merged:NormalizedRect[]=[];
  for(const candidate of work.sort((a,b)=>a.page-b.page||a.y-b.y||a.x-b.x)) {
    let current={...candidate};let index=0;
    while(index<merged.length) {
      const previous=merged[index];
      if(!previous){index+=1;continue;}
      // Shared vertical coverage identifies a line; a small height-relative gap permits word fragments.
      const overlap=Math.min(current.y+current.height,previous.y+previous.height)-Math.max(current.y,previous.y);
      const shortHeight=Math.min(current.height,previous.height),longHeight=Math.max(current.height,previous.height);
      const gap=Math.max(current.x,previous.x)-Math.min(current.x+current.width,previous.x+previous.width);
      if(previous.page===current.page&&overlap>=shortHeight*0.55&&longHeight<=shortHeight*1.8&&gap<=Math.min(0.012,longHeight*0.45)) {
        // The union has one bottom edge, avoiding doubled underlines from nested spans or differing fonts.
        const x=Math.min(current.x,previous.x),y=Math.min(current.y,previous.y);
        current={page:current.page,x,y,width:Math.max(current.x+current.width,previous.x+previous.width)-x,height:Math.max(current.y+current.height,previous.y+previous.height)-y};
        merged.splice(index,1);index=0;
      } else index+=1;
    }
    merged.push(current);
  }
  return merged.map(rect=>rotateRect(rect,intrinsicRotation));
}
