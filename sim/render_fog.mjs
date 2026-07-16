/**
 * Standalone fog-of-war visualiser.
 * Reads map_final.backv2.tmx, runs the same computeVisibilityPolygon
 * algorithm as visibility.ts, and writes an SVG to /tmp/fog_debug.svg.
 *
 * Run:  node sim/render_fog.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const TMX_PATH = path.resolve(__dir, '../Assets/Maps/map_final.backv2.tmx');
const OUT_PATH = '/tmp/fog_debug.svg';

// ── TMX parser (regex-based, no DOM dependency) ──────────────────────────────
function parseTmxWalls(tmxText) {
  const walls = [];
  // Match every <object ...> block that has name="walls" or name="tables"
  const blockRe = /<object\s([^>]*)\/>/gs;
  for (const m of tmxText.matchAll(blockRe)) {
    const attrs = m[1];
    const name = (attrs.match(/\bname="([^"]*)"/) ?? [])[1] ?? '';
    if (name !== 'walls') continue; // tables no longer cast shadows (matches TmxParser.ts fix)
    const x = parseFloat((attrs.match(/\bx="([^"]*)"/) ?? [])[1] ?? '0');
    const y = parseFloat((attrs.match(/\by="([^"]*)"/) ?? [])[1] ?? '0');
    const w = parseFloat((attrs.match(/\bwidth="([^"]*)"/) ?? [])[1] ?? '0');
    const h = parseFloat((attrs.match(/\bheight="([^"]*)"/) ?? [])[1] ?? '0');
    walls.push({ x, y, width: w, height: h });
  }
  return walls;
}

// ── Visibility algorithm (mirrors visibility.ts exactly) ─────────────────────
function raySegT(ox, oy, dx, dy, ax, ay, bx, by) {
  const rx = bx - ax, ry = by - ay;
  const denom = dx * ry - dy * rx;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((ax - ox) * ry - (ay - oy) * rx) / denom;
  const u = ((ax - ox) * dy - (ay - oy) * dx) / denom;
  if (t < -1e-10 || u < -1e-10 || u > 1 + 1e-10) return null;
  return t;
}

function circleSegIntersectAngles(px, py, r, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const ex = ax - px, ey = ay - py;
  const a = dx * dx + dy * dy;
  if (a < 1e-10) return [];
  const b = 2 * (ex * dx + ey * dy);
  const c = ex * ex + ey * ey - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const sqrtD = Math.sqrt(disc);
  const angles = [];
  for (const t of [(-b - sqrtD) / (2 * a), (-b + sqrtD) / (2 * a)]) {
    if (t > 1e-6 && t < 1 + 1e-6) {
      const tt = Math.min(t, 1);
      angles.push(Math.atan2(ay + tt * dy - py, ax + tt * dx - px));
    }
  }
  return angles;
}

function computeVisibilityPolygon(px, py, radius, wallRects) {
  const r15sq = radius * radius * 2.25;
  const nearby = wallRects.filter(wr => {
    const cx = Math.max(wr.x, Math.min(px, wr.x + wr.width));
    const cy = Math.max(wr.y, Math.min(py, wr.y + wr.height));
    const ddx = cx - px, ddy = cy - py;
    return ddx * ddx + ddy * ddy < r15sq;
  });

  const segs = [];
  const angles = [];
  const EPS = 0.0001;

  for (const wr of nearby) {
    const x1 = wr.x, y1 = wr.y, x2 = wr.x + wr.width, y2 = wr.y + wr.height;
    const edges = [
      [x1, y1, x2, y1],
      [x2, y1, x2, y2],
      [x2, y2, x1, y2],
      [x1, y2, x1, y1],
    ];
    for (const [ax, ay, bx, by] of edges) {
      segs.push({ ax, ay, bx, by });
      for (const a of circleSegIntersectAngles(px, py, radius, ax, ay, bx, by)) {
        angles.push(a - EPS, a, a + EPS);
      }
    }
    for (const [cx, cy] of [[x1, y1], [x2, y1], [x1, y2], [x2, y2]]) {
      const a = Math.atan2(cy - py, cx - px);
      angles.push(a - EPS, a, a + EPS);
    }
  }

  const BDRY = 24;
  for (let i = 0; i < BDRY; i++) angles.push(-Math.PI + (i / BDRY) * Math.PI * 2);

  const pts = [];
  for (const angle of angles) {
    const ddx = Math.cos(angle), ddy = Math.sin(angle);
    let minT = radius;
    for (const s of segs) {
      const t = raySegT(px, py, ddx, ddy, s.ax, s.ay, s.bx, s.by);
      if (t !== null && t > 0 && t < minT) minT = t;
    }
    pts.push({ angle, x: px + ddx * minT, y: py + ddy * minT });
  }
  pts.sort((a, b) => a.angle - b.angle);
  return pts;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const tmx = fs.readFileSync(TMX_PATH, 'utf8');
const walls = parseTmxWalls(tmx);
console.log(`Loaded ${walls.length} wall rects from TMX`);

// Player positions from actual game constants (settings.ts)
// PLAYER_SPAWN = { x: 4528, y: 1712 }
// cafeteria    = { x: 3277, y: 658 }
// reactor_room = { x:  729, y: 1395 }
const VISION_R = 200;
const positions = [
  { label: 'Spawn (hallway)', px: 4528, py: 1712 },
  { label: 'Cafeteria',       px: 3277, py: 658  },
  { label: 'Reactor room',    px: 729,  py: 1395 },
];

// Each panel shows a 700×700 world-unit viewport centred on the player.
// Scale: 1 world unit → SCALE px in SVG.
const VIEW = 700; // world units visible per panel
const PX   = 600; // SVG pixel size of each panel
const SCALE = PX / VIEW;
const PAD  = 20;

const TOTAL_W = PX * positions.length + PAD * (positions.length + 1);
const TOTAL_H = PX + 60; // 60 px label strip at top

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TOTAL_W}" height="${TOTAL_H}"
  style="background:#1a0a2e;font-family:monospace">
`;

// Helper: world coord → panel SVG coord
function wx(worldX, px, panelOx) {
  return panelOx + (worldX - px + VIEW / 2) * SCALE;
}
function wy(worldY, py, panelOy) {
  return panelOy + (worldY - py + VIEW / 2) * SCALE;
}

for (let pi = 0; pi < positions.length; pi++) {
  const { label, px, py } = positions[pi];
  const ox = PAD + pi * (PX + PAD); // panel x origin in SVG
  const oy = 60;                     // panel y origin in SVG (below label)

  const poly = computeVisibilityPolygon(px, py, VISION_R, walls);
  console.log(`${label}: polygon has ${poly.length} pts`);

  // Clip region for this panel
  const clipId = `clip${pi}`;
  svg += `<defs><clipPath id="${clipId}"><rect x="${ox}" y="${oy}" width="${PX}" height="${PX}" /></clipPath></defs>\n`;

  // Panel background
  svg += `<rect x="${ox}" y="${oy}" width="${PX}" height="${PX}" fill="#111122" />\n`;

  // All walls in viewport (dim grey)
  svg += `<g clip-path="url(#${clipId})">\n`;
  for (const wr of walls) {
    const sx = wx(wr.x, px, ox), sy = wy(wr.y, py, oy);
    const sw = wr.width * SCALE, sh = wr.height * SCALE;
    // Cull anything fully outside viewport
    if (sx + sw < ox || sx > ox + PX || sy + sh < oy || sy > oy + PX) continue;
    svg += `<rect x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" width="${sw.toFixed(1)}" height="${sh.toFixed(1)}"
      fill="#2a2a44" stroke="#444466" stroke-width="0.5" />\n`;
  }

  // Visibility polygon (lit region)
  const polyPts = poly.map(p => `${wx(p.x, px, ox).toFixed(1)},${wy(p.y, py, oy).toFixed(1)}`).join(' ');
  svg += `<polygon points="${polyPts}" fill="rgba(255,230,100,0.30)" stroke="rgba(255,220,80,0.95)" stroke-width="1.5" />\n`;

  // Highlight nearby walls (orange outline)
  const r15sq = VISION_R * VISION_R * 2.25;
  for (const wr of walls) {
    const cx = Math.max(wr.x, Math.min(px, wr.x + wr.width));
    const cy = Math.max(wr.y, Math.min(py, wr.y + wr.height));
    if ((cx - px) ** 2 + (cy - py) ** 2 < r15sq) {
      const sx = wx(wr.x, px, ox), sy = wy(wr.y, py, oy);
      svg += `<rect x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" width="${(wr.width*SCALE).toFixed(1)}" height="${(wr.height*SCALE).toFixed(1)}"
        fill="none" stroke="#f80" stroke-width="1.2" />\n`;
    }
  }

  // Vision circle (dashed white)
  const cSVGx = wx(px, px, ox), cSVGy = wy(py, py, oy);
  const cR = VISION_R * SCALE;
  svg += `<circle cx="${cSVGx.toFixed(1)}" cy="${cSVGy.toFixed(1)}" r="${cR.toFixed(1)}"
    fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-dasharray="6 4" />\n`;

  // Ray lines (faint)
  for (const p of poly) {
    svg += `<line x1="${cSVGx.toFixed(1)}" y1="${cSVGy.toFixed(1)}" x2="${wx(p.x,px,ox).toFixed(1)}" y2="${wy(p.y,py,oy).toFixed(1)}"
      stroke="rgba(255,255,255,0.10)" stroke-width="0.5" />\n`;
  }

  // Player dot
  svg += `<circle cx="${cSVGx.toFixed(1)}" cy="${cSVGy.toFixed(1)}" r="5" fill="#00ff66" />\n`;
  svg += `</g>\n`;

  // Panel border
  svg += `<rect x="${ox}" y="${oy}" width="${PX}" height="${PX}" fill="none" stroke="#555" stroke-width="1" />\n`;

  // Label
  svg += `<text x="${(ox + PX/2).toFixed(0)}" y="${(oy - 12).toFixed(0)}" fill="white" font-size="15" text-anchor="middle" font-family="monospace">${label} — ${poly.length} rays, vision r=${VISION_R}</text>\n`;
}

svg += `</svg>`;

fs.writeFileSync(OUT_PATH, svg);
console.log(`Wrote ${OUT_PATH}`);
