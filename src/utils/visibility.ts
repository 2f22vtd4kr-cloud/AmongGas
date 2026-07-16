import type { WallRect } from '../types';

interface Seg { ax: number; ay: number; bx: number; by: number; }

/**
 * Returns the t-value where ray (ox+t·dx, oy+t·dy) intersects segment
 * (ax,ay)→(bx,by), or null if no valid forward intersection.
 */
function raySegT(
  ox: number, oy: number, dx: number, dy: number,
  ax: number, ay: number, bx: number, by: number,
): number | null {
  const rx = bx - ax, ry = by - ay;
  const denom = dx * ry - dy * rx;
  if (Math.abs(denom) < 1e-10) return null; // parallel
  const t = ((ax - ox) * ry - (ay - oy) * rx) / denom;
  const u = ((ax - ox) * dy - (ay - oy) * dx) / denom;
  if (t < -1e-10 || u < -1e-10 || u > 1 + 1e-10) return null;
  return t;
}

/**
 * Compute a 2D visibility polygon (shadow casting) from (px,py) in world
 * space, clipped to `radius` world units and blocked by wall rectangles.
 *
 * Algorithm:
 *  1. Discard walls farther than 1.5× radius.
 *  2. Collect wall-corner angles as ray targets (three rays per corner at
 *     angle ± ε for correct behind-corner visibility).
 *  3. Add 36 evenly-spaced boundary rays so open areas stay circular.
 *  4. Each ray travels to the nearest wall intersection or the radius.
 *  5. Sort hits by angle → the visibility polygon.
 *
 * The returned point array is in world coordinates and is suitable for
 * converting to screen space (subtract camera.worldView offset, scale by
 * camera.zoom) before drawing with Graphics.fillPoints.
 */
export function computeVisibilityPolygon(
  px: number, py: number,
  radius: number,
  wallRects: WallRect[],
): { x: number; y: number }[] {
  // 1. Filter nearby walls (squared-distance test for speed)
  const r15sq = radius * radius * 2.25; // (radius × 1.5)²
  const nearby = wallRects.filter(wr => {
    const cx = Math.max(wr.x, Math.min(px, wr.x + wr.width));
    const cy = Math.max(wr.y, Math.min(py, wr.y + wr.height));
    const ddx = cx - px, ddy = cy - py;
    return ddx * ddx + ddy * ddy < r15sq;
  });

  // 2. Build segments and corner-angle list
  const segs: Seg[] = [];
  const angles: number[] = [];
  const EPS = 0.0001;

  for (const wr of nearby) {
    const x1 = wr.x, y1 = wr.y, x2 = wr.x + wr.width, y2 = wr.y + wr.height;
    segs.push(
      { ax: x1, ay: y1, bx: x2, by: y1 }, // top edge
      { ax: x2, ay: y1, bx: x2, by: y2 }, // right edge
      { ax: x2, ay: y2, bx: x1, by: y2 }, // bottom edge
      { ax: x1, ay: y2, bx: x1, by: y1 }, // left edge
    );
    for (const [cx, cy] of [[x1, y1], [x2, y1], [x1, y2], [x2, y2]] as [number,number][]) {
      const a = Math.atan2(cy - py, cx - px);
      angles.push(a - EPS, a, a + EPS);
    }
  }

  // 3. Boundary rays keep the silhouette circular in open areas
  const BDRY = 36;
  for (let i = 0; i < BDRY; i++) {
    angles.push(-Math.PI + (i / BDRY) * Math.PI * 2);
  }

  // 4. Cast every ray, clip to nearest wall intersection
  const pts: { angle: number; x: number; y: number }[] = [];
  for (const angle of angles) {
    const ddx = Math.cos(angle), ddy = Math.sin(angle);
    let minT = radius;
    for (const s of segs) {
      const t = raySegT(px, py, ddx, ddy, s.ax, s.ay, s.bx, s.by);
      if (t !== null && t > 0 && t < minT) minT = t;
    }
    pts.push({ angle, x: px + ddx * minT, y: py + ddy * minT });
  }

  // 5. Sort by angle → polygon in world coords
  pts.sort((a, b) => a.angle - b.angle);
  return pts;
}
