---
name: Phaser letterbox/pillarbox black bars
description: Why a fixed "design resolution" game canvas shows black bars around the perimeter on some devices, and the safe way to remove them without breaking HUD sizing.
---

## The problem
`Phaser.Scale.FIT` (with `autoCenter: CENTER_BOTH`) scales the internal game canvas uniformly to fit *inside* the parent element, preserving the configured `width`/`height` aspect ratio. If that configured aspect ratio doesn't match the actual device/window aspect ratio, FIT leaves empty space on one axis — rendered as black bars (pillarbox on the sides, letterbox on top/bottom).

## Do NOT fix this by changing the internal design resolution
The tempting fix is to set the Phaser game config's `width`/`height` to `window.innerWidth`/`innerHeight` at boot instead of a fixed design size. **This breaks every hand-tuned pixel value in the game.** Any HUD/UI code with literal pixel sizes — `fontSize: '24px'`, fixed-width panels, fixed icon dimensions, a `camera.setZoom(1.45)` tuned for world-scale readability, etc. — was implicitly being shrunk by the CSS downscale that `Scale.FIT` applies when squeezing a large design canvas (e.g. 750 wide) down to a small real device width (e.g. ~390 CSS px, roughly half). Once the internal resolution *becomes* the real device size, that implicit shrink disappears and everything renders at roughly double (or more) its intended physical size — text, buttons, and the camera's world view all look "massive"/"zoomed in", even after separately trying to compensate the camera zoom (world-space zoom and HUD-space literal pixel sizes need *different* compensation math, so patching one still leaves the other broken — not worth the complexity).

**Why:** design resolution changes affect two independent systems (world-camera zoom vs. literal-pixel HUD sizing) that don't share a single correction factor; trying to rescale both correctly is far more failure-prone than not touching the resolution at all.

## The actual fix: stretch the canvas in CSS, keep the design resolution fixed
Leave the Phaser game config's `width`/`height` at the original fixed design resolution (e.g. 750x1334) and leave `Scale.FIT` in place logically, but override the canvas element's *rendered* CSS size to fill 100% of its container regardless of aspect ratio:

```css
#game-container { width: 100%; height: 100%; }
#game-container canvas { display: block !important; width: 100% !important; height: 100% !important; }
```

This stretches the canvas (non-uniformly, by whatever small amount the device aspect differs from the design aspect) to cover the full viewport with zero black bars, while every game object keeps rendering at exactly its originally-tuned pixel size on the internal canvas — nothing about world zoom or HUD literal-pixel sizing needs to change at all.

**How to apply:** confirm the design aspect ratio is reasonably close to the target devices' aspect ratios first (a mobile-portrait design stretched onto a mobile-portrait device is a mild, unnoticeable stretch; forcing a portrait design to fill a landscape desktop window will look heavily distorted — that's expected and fine for a mobile-only game, not a bug).
