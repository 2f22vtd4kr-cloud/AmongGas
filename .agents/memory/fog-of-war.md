---
name: Fog of war implementation
description: How the fog-of-war works in GameScene — native Canvas 2D offscreen approach, correctness rules, and key pitfalls.
---

# Fog of war — native Canvas 2D offscreen approach

## The approach
An offscreen `HTMLCanvasElement` (`fogCanvas`, 750×1334) is composited onto the live Phaser game canvas each frame via the `uiCamera.prerender` event (fires after the world camera has drawn, before the HUD camera draws its objects). Phaser is forced to Canvas renderer in `main.ts`; never switch to WebGL or `getContext('2d')` on the game canvas returns null.

## Four-step render (renderFogCanvas in GameScene.ts)
1. Fill offscreen with `rgba(0,0,0,0.97)` — near-total black; areas outside the disc are pitch black, matching real Among Us where nothing is visible beyond vision.
2. `destination-out` radial gradient punches a soft disc of light at the player's screen position. Gradient stops: opaque 0→90% of `visionR*1.2`, fades to transparent at `visionR*1.2` (10% soft edge — short, crisper than 15%).
3. `source-over` even-odd fill re-darkens wall-shadow areas with `rgba(0,0,0,0.97)` — **clipped to the vision disc** (see critical rule below). Path = full-canvas rect + visibility polygon; even-odd fills regions *outside* the polygon.
4. `gameCtx.save()` / `drawImage(fogCanvas, 0, 0)` / `gameCtx.restore()` blits onto the live canvas. Always save/restore and set identity transform before drawing — Phaser may leave the context in a non-default state.

## Critical rule: wall shadows MUST be clipped to the vision disc
Step 3 uses `ctx.save() → ctx.arc(…).clip() → fill → ctx.restore()` to restrict the fill to the vision disc.

**Why this matters:** Without clip, the shadow fill covers outside-disc pixels that are already ~0.97 dark, doing redundant work and risking rounding artefacts. With clip:
- Inside disc + inside polygon (visible area): 0% fog → fully lit
- Inside disc + outside polygon (wall shadow): 0.97 fog → pitch black
- Outside disc: 0.97 base fog → pitch black (unchanged)

## Critical correctness rule: polygon radius = visionR × 1.2
Compute polygon with `radius = (visionR * 1.2) / cam.zoom` (world units), NOT `visionR / cam.zoom`.

**Why:** The gradient's soft falloff zone runs from 85% to 100% of `visionR*1.2`. If the polygon only extends to `visionR`, the even-odd fill re-darkens the entire falloff zone, killing the soft edge. Using `visionR*1.2` as the polygon boundary matches the gradient's outer edge.

## Vision radii (settings.ts)
- `CREW_VISION = 420` world units — covers the whole cafeteria (~270wu half-width) so you see the full room you're standing in; dark only at screen edges, matching real AU default. Do NOT reduce this — a smaller value makes rooms look truncated by a visible dark ring inside the room.
- `IMP_VISION = 590` — ~1.4× crew
- `CREW_VISION_SABOTAGED = 110` — lights-out "barely see your feet" glow (~3.4 tiles, ~26% of normal); the contrast between 420 and 110 is what makes the lights sabotage feel scary
- `CAMERA_ZOOM = 0.75`

## Critical sizing insight (learned from reference images)
The vision radius must be ≥ the room half-width so the player sees the whole room from its center with no dark edges cutting into it. Cafeteria half-width ≈ 270wu → 420wu comfortably covers it. A value of 270wu creates a visible dark circle inside the room, which looks completely wrong vs real AU.

## Visibility polygon algorithm (src/utils/visibility.ts)
- Filters walls within 1.5× radius (squared-distance AABB clamp).
- Casts rays toward: corner angles (±ε), circle-edge crossing angles (±ε) for walls whose corners are all beyond the radius, and 64 evenly-spaced boundary rays.
- 64 boundary rays → chord deviation < 0.3 px at r=200. (24 → ~2.5 px visible facets.)
- Circle-edge intersections fix the "Reactor case": wide wall whose corners are outside the vision radius but whose face crosses the circle.

## Table transparency (matches original Among Us)
`TmxParser.ts` returns `{ walls, tables, objects }`. Only `walls` feed into `GameScene.wallRects`. Tables are NOT shadow casters — they block player movement but NOT vision (matching original AU "transparent walls" list). Never merge tables into wallRects.

## Ghosts
`if (!this.player.isAlive) return;` at top of `renderFogCanvas` — ghosts skip fog and see the full map.

## Sabotage (lights)
`crewVision = CREW_VISION_SABOTAGED` when `sabotageType === 'lights'`; impostor vision unaffected.

## Cleanup
`uiCamera.off('prerender', this.renderFogCanvas, this)` and null the canvases in `shutdown()` — stale handlers draw on dead cameras after scene restart.
