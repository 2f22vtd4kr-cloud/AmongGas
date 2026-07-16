---
name: Fog of war implementation
description: How the fog-of-war works in GameScene — native Canvas 2D offscreen approach, correctness rules, and key pitfalls.
---

# Fog of war — native Canvas 2D offscreen approach

## The approach
An offscreen `HTMLCanvasElement` (`fogCanvas`, 750×1334) is composited onto the live Phaser game canvas each frame via the `uiCamera.prerender` event (fires after the world camera has drawn, before the HUD camera draws its objects). Phaser is forced to Canvas renderer in `main.ts`; never switch to WebGL or `getContext('2d')` on the game canvas returns null.

## Four-step render (renderFogCanvas in GameScene.ts)
1. Fill offscreen with near-opaque darkness (`rgba(10,10,10,0.96)`).
2. `destination-out` radial gradient punches a soft disc of light at the player's screen position. Gradient stops: opaque 0→60% of `visionR*1.2`, fades to transparent at `visionR*1.2`.
3. `source-over` even-odd fill re-darkens wall-shadow areas: path = full-canvas rect + visibility polygon. Even-odd fills the region *outside* the polygon → hard shadow edges where walls block sight.
4. `gameCtx.save()` / `drawImage(fogCanvas, 0, 0)` / `gameCtx.restore()` blits onto the live canvas. Always save/restore and set `globalCompositeOperation = 'source-over'` and identity transform before drawing — Phaser may leave the context in a non-default state.

## Critical correctness rule: polygon radius = visionR × 1.2
The visibility polygon must be computed with `radius = (visionR * 1.2) / cam.zoom` (world units), NOT `visionR / cam.zoom`.

**Why:** The gradient's soft falloff zone runs from `visionR` to `visionR*1.2`. If the polygon only extends to `visionR`, the even-odd fill (step 3) re-darkens the entire falloff zone, killing the soft edge and producing a hard circle in open areas. Using `visionR*1.2` as the polygon boundary lets the gradient control the fade — the step-3 fill only kicks in beyond the gradient's outer edge, where it's already fully opaque anyway.

Wall shadows inside `visionR` still have hard edges because those polygon vertices sit at the actual wall hit-distance (< visionR), not at the 1.2× limit.

## Visibility polygon algorithm (src/utils/visibility.ts)
- Filters walls within 1.5× radius (squared-distance AABB clamp).
- Casts rays toward: corner angles (±ε), circle-edge crossing angles (±ε) for walls whose corners are all beyond the radius, and 64 evenly-spaced boundary rays.
- 64 boundary rays → chord deviation < 0.3 px at r=200, invisible. (24 → ~2.5 px, visible polygon facets.)
- Circle-edge intersections fix the "Reactor case": a wide wall whose corners are all outside the vision radius but whose face crosses the circle. Without them the wall casts no shadow.

## Table transparency (matches original Among Us)
`TmxParser.ts` returns `{ walls, tables, objects }`. Only `walls` feed into `GameScene.wallRects` (the rect list passed to `computeVisibilityPolygon`). `tables` are added to the physics static group alongside walls so they block player movement, but they do **not** cast vision shadows — matching the original game's "List of transparent walls". Never merge these two arrays for shadow casting.

## Ghosts
`if (!this.player.isAlive) return;` at the top of `renderFogCanvas` — ghosts skip fog entirely and see the full unoccluded map.

## Sabotage (lights)
`crewVision = CREW_VISION_SABOTAGED` when `sabotageType === 'lights'`; impostor vision is unaffected.

## Cleanup
`uiCamera.off('prerender', this.renderFogCanvas, this)` and null the canvases in `shutdown()` — otherwise stale handlers draw on dead cameras after scene restart.
