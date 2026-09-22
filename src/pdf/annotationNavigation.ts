import { rotateRect } from '../lib/coordinates';
import type { NormalizedRect } from '../types';

export interface AnnotationViewport {
  page: number; rowHeight: number; pageWidth: number; pageHeight: number;
  viewportWidth: number; viewportHeight: number; contentWidth: number; contentHeight: number;
  rotation: number;
}

/**
 * Centers the first annotation fragment in the reader, accounting for page fitting and rotation.
 * @param rect Canonical normalized anchor on the target page.
 * @param view Current CSS-pixel layout, using the same virtual row sizing as the renderer.
 * @returns Clamped horizontal and vertical scroll offsets; never uses HiDPI backing pixels.
 */
export function annotationScrollTarget(rect: NormalizedRect, view: AnnotationViewport): {left:number;top:number} {
  const rotated=rotateRect(rect,view.rotation);
  // Rows start at (page-1)*rowHeight, with 12 CSS pixels of top padding; pages are horizontally centered.
  const pageTop=(view.page-1)*view.rowHeight+12;
  const pageLeft=(view.contentWidth-view.pageWidth)/2;
  // Center the fragment, but keep the beginning visible if a large area is taller than the viewport.
  const x=pageLeft+(rotated.x+rotated.width/2)*view.pageWidth;
  const y=pageTop+rotated.y*view.pageHeight+Math.min(rotated.height*view.pageHeight/2,view.viewportHeight/4);
  return {
    left:Math.max(0,Math.min(view.contentWidth-view.viewportWidth,x-view.viewportWidth/2)),
    top:Math.max(0,Math.min(view.contentHeight-view.viewportHeight,y-view.viewportHeight/2)),
  };
}
