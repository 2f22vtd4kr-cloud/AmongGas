---
name: Fog of war implementation
description: How the Among Us fog of war (visibility) is built in GameScene — approach, constraints, and key gotchas.
---

# Fog of war — GameScene.ts

## The rule
Two stacked `GeometryMask invertAlpha=true` rectangles (Canvas + WebGL compatible):
- `fogInner` alpha 0.92, mask = **visibility polygon** — main darkness, wall-blocked
- `fogOuter` alpha 0.40, mask = same polygon scaled ×1.35 outward from player — soft glow falloff

Vision radii (world units, from `src/settings.ts`):
- `CREW_VISION = 200` → ~290 px at zoom 1.45
- `IMP_VISION  = 280` → ~406 px at zoom 1.45
- Ghosts: both layers hidden (`!player.isAlive`)

**Why shadow casting:** The original Among Us blocks line-of-sight through walls, producing an irregular polygon rather than a circle. Replicating this uses `src/utils/visibility.ts` — `computeVisibilityPolygon()` — which casts rays to each wall corner (±ε for behind-corner visibility) plus 36 boundary samples for the circular falloff in open areas.

**Why:** GeometryMask is the only masking mode that works in both Canvas and WebGL renderers. BitmapMask and RenderTexture.erase() are WebGL-only; this game runs Canvas (confirmed from Phaser boot log).

## Shadow casting implementation (src/utils/visibility.ts)
- Filters 194 TMX wall rects to those within `radius × 1.5`
- Extracts 4 edges per nearby wall; casts rays at each corner angle (−ε, exact, +ε) + 36 boundary samples
- Returns sorted `{x,y}[]` polygon in world coords
- Stored on `GameScene.wallRects: WallRect[]` from the TMX parse at scene create

## How to draw the mask
Both masks use `Graphics.fillPoints(screenPoly, true, true)` after `fillStyle(0xffffff)`.  
World → screen conversion:
```typescript
const screenPoly = worldPoly.map(p => ({
  x: (p.x - cam.worldView.x) * cam.zoom,
  y: (p.y - cam.worldView.y) * cam.zoom,
}));
```
Outer polygon: scale each world point away from player by ×1.35 before converting.

## Gotcha 1: mask Graphics MUST have `setScrollFactor(0)` — critical
Without `setScrollFactor(0)`, the canvas renderer applies the world-camera transform to the mask Graphics.  
The polygon is drawn at e.g. `(375, 667)` in local space, but after camera transform that maps to `~(-4881, …)` — thousands of pixels off-screen.  
Result: mask clips nothing → entire viewport is dark.  
**Fix:** `this.add.graphics().setScrollFactor(0).setVisible(false)` on BOTH mask objects.

## Gotcha 2: `{ add: false }` removed from Phaser 3.90 typings
`this.make.graphics({ add: false })` throws TS2353 — `add` is not in the `Options` type.  
Fix: `this.add.graphics().setScrollFactor(0).setVisible(false)`.  
Also call `this.uiCamera.ignore([fogInner, fogOuter, fogMaskInner, fogMaskOuter])` so the HUD camera doesn't double-render them.

## Tuning
Adjust `CREW_VISION` / `IMP_VISION` in `src/settings.ts`. At zoom 1.45, 1 world unit ≈ 1.45 screen px. Viewport half-width ≈ 258 world units — a radius below that creates visible dark corners.
