import type { WallRect, MapObject } from '../types';

export interface TmxData {
  walls: WallRect[];
  objects: MapObject[];
}

/**
 * Parse a Tiled TMX (XML) string and extract obstacle rectangles
 * and named interactive objects from the object layer.
 */
export function parseTmx(tmxText: string): TmxData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(tmxText, 'text/xml');

  const walls: WallRect[] = [];
  const objects: MapObject[] = [];

  const objectGroups = doc.querySelectorAll('objectgroup');

  for (const group of Array.from(objectGroups)) {
    const elems = group.querySelectorAll('object');
    for (const el of Array.from(elems)) {
      const name = el.getAttribute('name') ?? '';
      const x = parseFloat(el.getAttribute('x') ?? '0');
      const y = parseFloat(el.getAttribute('y') ?? '0');
      const w = parseFloat(el.getAttribute('width') ?? '0');
      const h = parseFloat(el.getAttribute('height') ?? '0');
      const id = parseInt(el.getAttribute('id') ?? '0', 10);

      if (name === 'walls' || name === 'tables') {
        // Collision rects
        walls.push({ x, y, width: w, height: h });
      } else if (name !== 'props') {
        // Interactive / named objects
        objects.push({ id, name, x, y, width: w, height: h });
      }
    }
  }

  return { walls, objects };
}
