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
 * Returns t-values ∈ (0, 1] where segment (ax,ay)→(bx,by) intersects the
 * circle of radius `r` centred at (px, py).  Used to generate precise
 * shadow-boundary angles when a wall face crosses the vision-circle rim —
 * the critical case where all four wall corners lie beyond the radius and
 * corner-angle rays would never hit the wall.
 */
function circleSegIntersectAngles(
  px: number, py: number, r: number,
  ax: number, ay: number, bx: number, by: number,
): number[] {
  const dx = bx - ax, dy = by - ay;
  const ex = ax - px, ey = ay - py;
  const a = dx * dx + dy * dy;
  if (a < 1e-10) return [];
  const b = 2 * (ex * dx + ey * dy);
  const c = ex * ex + ey * ey - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const sqrtD = Math.sqrt(disc);
  const angles: number[] = [];
  for (const t of [(-b - sqrtD) / (2 * a), (-b + sqrtD) / (2 * a)]) {
    if (t > 1e-6 && t < 1 + 1e-6) {
      const tt = Math.min(t, 1);
      angles.push(Math.atan2(ay + tt * dy - py, ax + tt * dx - px));
    }
  }
  return angles;
}

/**
 * Compute a 2D visibility polygon (shadow casting) from (px,py) in world
 * space, clipped to `radius` world units and blocked by wall rectangles.
 *
 * Algorithm:
 *  1. Discard walls farther than 1.5× radius.
 *  2. Collect wall-corner angles as ray targets (three rays per corner at
 *     angle ± ε for correct behind-corner visibility).
 *  3. For every wall edge that crosses the vision-circle boundary, add exact
 *     crossing angles (±ε). This is the key fix for walls whose corners all
 *     lie outside the radius — without these, corner-angle rays miss the wall
 *     and shadow precision falls back to the coarse boundary-ray grid.
 *  4. Add 24 evenly-spaced boundary rays so open areas stay circular.
 *  5. Each ray travels to the nearest wall intersection or the radius.
 *  6. Sort hits by angle → the visibility polygon.
 *
 * The returned point array is in world coordinates.
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
    const edges: [number, number, number, number][] = [
      [x1, y1, x2, y1], // top
      [x2, y1, x2, y2], // right
      [x2, y2, x1, y2], // bottom
      [x1, y2, x1, y1], // left
    ];
    for (const [ax, ay, bx, by] of edges) {
      segs.push({ ax, ay, bx, by });

      // 3. Circle–edge intersection angles (precise shadow boundaries)
      for (const a of circleSegIntersectAngles(px, py, radius, ax, ay, bx, by)) {
        angles.push(a - EPS, a, a + EPS);
      }
    }
    // Corner angles (still useful when corners are within radius)
    for (const [cx, cy] of [[x1, y1], [x2, y1], [x1, y2], [x2, y2]] as [number, number][]) {
      const a = Math.atan2(cy - py, cx - px);
      angles.push(a - EPS, a, a + EPS);
    }
  }

  // 4. Boundary rays keep the silhouette circular in open areas.
  //    64 rays → one every 5.6° → chord deviation < 0.3 px at r=200, invisible.
  //    (24 rays → 15° → ~2.5 px deviation, visible as polygon facets.)
  const BDRY = 64;
  for (let i = 0; i < BDRY; i++) {
    angles.push(-Math.PI + (i / BDRY) * Math.PI * 2);
  }

  // 5. Cast every ray, clip to nearest wall intersection
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

  // 6. Sort by angle → polygon in world coords
  pts.sort((a, b) => a.angle - b.angle);
  return pts;
}
