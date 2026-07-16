---
name: Fog of war implementation
description: How the Among Us fog of war is rendered in GameScene — approach, constraints, Canvas 2D compositing, and key gotchas.
---

# Fog of war — GameScene.ts

## The rule (current implementation)
Fog is rendered via **native Canvas 2D on an offscreen HTMLCanvasElement**, NOT Phaser GeometryMasks.
The offscreen canvas is composited onto the game canvas in a `uiCamera 'prerender'` hook so the HUD camera renders on top.

Vision radii (world units, `src/settings.ts`):
- `CREW_VISION = 200` → ~290 px at zoom 1.45
- `IMP_VISION  = 280` → ~406 px at zoom 1.45
- Ghosts: `renderFogCanvas()` returns early — full map visible

## Why native Canvas 2D (not Phaser GeometryMask)
GeometryMask is **binary** — a pixel is either in the mask or not. There is no way to assign varying alpha to different parts of a GeometryMask path in Phaser Canvas mode. This means any GeometryMask approach produces **hard stepped edges**, never a smooth gradient. The original Among Us uses a radial gradient for its circular vision falloff — this requires actual Canvas 2D `createRadialGradient`.

## The compositing algorithm (renderFogCanvas)

```
Step 1 — fillRect with near-opaque black (alpha 0.96) on the offscreen canvas.

Step 2 — destination-out with a radial gradient centred on the player:
         alpha=1 from 0 to 60% of visionR*1.2  (fully erases fog → bright)
         alpha=0 at visionR*1.2                 (no erasure → full dark)
         Result: a soft-edged lit disc, bright at centre, fading at edge.

Step 3 — source-over fill with even-odd path rule:
         path = [full-screen rect] + [visibility polygon]
         even-odd fills the region inside the rect but OUTSIDE the polygon.
         This re-darkens wall-shadow areas with full opacity (0.97),
         restoring hard crisp shadows while leaving the gradient intact elsewhere.

Step 4 — gameCtx.drawImage(fogCanvas, 0, 0) onto the live game canvas.
```

## Wall shadow correctness (Why step 3 works)
Even-odd rule for two sub-paths:
- Point inside polygon: rect-crossing(1) + polygon-crossing(1) = 2 = even → NOT filled ✓
- Point outside polygon but inside screen: rect-crossing(1) + polygon-crossing(0 or 2) = odd → filled ✓

## Visibility polygon (src/utils/visibility.ts)
`computeVisibilityPolygon(px, py, radius, wallRects)`:
- Filters 194 TMX wall rects to those within radius×1.5
- Casts rays at each wall corner angle (±ε for behind-corner accuracy) + 36 boundary samples
- Returns sorted `{x, y}[]` polygon in world coords
- Stored on `GameScene.wallRects: WallRect[]` from TMX parse in create()

## Camera hook ordering (CRITICAL)
```typescript
this.uiCamera.on('prerender', this.renderFogCanvas, this);
```
This fires AFTER the world camera renders map/players but BEFORE the HUD camera renders buttons/joystick.
Fog appears between world and HUD — correct layering.

**Must be cleaned up in shutdown():**
```typescript
this.uiCamera?.off('prerender', this.renderFogCanvas, this);
this.fogCanvas = null; this.fogCtx = null;
```

## Gotcha: getContext('2d') on the game canvas — REQUIRES Canvas renderer
`this.game.canvas.getContext('2d')` returns **null** when Phaser uses WebGL (Phaser.AUTO picks WebGL
when the GPU is available — i.e. in any real browser). Calling `.drawImage()` on null crashes the
Phaser game loop and the game appears completely frozen (no sound, no movement).

**Fix: `type: Phaser.CANVAS` in `src/main.ts`** — must never be changed to AUTO or WEBGL while the
fog compositing approach is in use. A null-check guard was also added in `renderFogCanvas()` as a
belt-and-suspenders safety net.

The offscreen `fogCanvas` width/height must match `this.scale.width/height` (internal resolution), not CSS display size.

## Gotcha: Previous GeometryMask approach (DO NOT revert to this)
The old approach (fogInner 0.92 alpha + fogOuter 0.4 alpha, both GeometryMask invertAlpha=true) produced:
- 0% fog inside inner polygon (good)
- 92% fog just outside inner polygon → **sharp 0%→92% step at polygon boundary** ← the bug
- 95% fog outside outer polygon
The stepped layers cannot create a gradient because GeometryMask is binary in Canvas mode.

## Tuning
Gradient stops are at `colorStop(0.60, opaque)` and `colorStop(1.0, transparent)` relative to a radius of `visionR × 1.2`. So the bright zone extends to `visionR × 0.72` and the falloff spans from `visionR × 0.72` to `visionR × 1.2` (≈ 48% of vision radius wide). Adjust the 0.60 stop to make the bright zone larger/smaller.
