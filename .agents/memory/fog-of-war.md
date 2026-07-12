---
name: Fog of war implementation
description: How the Among Us fog of war (vision circle) is built in GameScene — approach, constraints, and key gotchas.
---

# Fog of war — GameScene.ts

## The rule
Two stacked `GeometryMask invertAlpha=true` rectangles (Canvas + WebGL compatible):
- `fogInner` alpha 0.92, mask radius = `baseR` — main darkness
- `fogOuter` alpha 0.40, mask radius = `baseR × 1.4` — soft transition zone

Vision radii (world units, from `src/settings.ts`):
- `CREW_VISION = 200` → ~290 px at zoom 1.45
- `IMP_VISION  = 280` → ~406 px at zoom 1.45
- Ghosts: both layers hidden (`!player.isAlive`)

**Why:** GeometryMask is the only masking mode that works in both Canvas and WebGL renderers. BitmapMask and RenderTexture.erase() are WebGL-only; this game runs Canvas (confirmed from Phaser boot log).

## How to apply
`setupFog()` called in `create()` after `setupUiCamera()`.  
`updateFog()` called in `update()` immediately after `player.update()`.

World → screen conversion each frame:
```typescript
const sx = (this.player.x - cam.worldView.x) * cam.zoom;
const sy = (this.player.y - cam.worldView.y) * cam.zoom;
const baseR = (player.isImpostor ? IMP_VISION : CREW_VISION) * cam.zoom;
```

## Gotcha: `{ add: false }` removed from Phaser 3.90 typings
`this.make.graphics({ add: false })` throws TS2353 in Phaser 3.90 — `add` is not in the `Options` type.  
Fix: `this.add.graphics().setVisible(false)` — GeometryMask reads path data regardless of visibility.  
Also call `this.uiCamera.ignore([fogInner, fogOuter, fogMaskInner, fogMaskOuter])` so HUD camera doesn't double-render them.

## Tuning
Adjust `CREW_VISION` / `IMP_VISION` in `src/settings.ts`. At zoom 1.45, 1 world unit ≈ 1.45 screen px. Viewport half-width ≈ 258 world units — a radius below that creates visible dark corners.
