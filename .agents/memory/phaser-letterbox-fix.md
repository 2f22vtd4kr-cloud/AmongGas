---
name: Phaser letterbox/pillarbox black bars
description: Why a fixed "design resolution" game canvas shows black bars around the perimeter on some devices, and why non-uniform CSS stretching or cover-cropping are NOT safe fixes when HUD buttons are anchored close to the design canvas's edges.
---

## The problem
`Phaser.Scale.FIT` (with `autoCenter: CENTER_BOTH`) scales the internal game canvas uniformly to fit *inside* the parent element, preserving the configured `width`/`height` aspect ratio. If that configured aspect ratio doesn't match the actual device/window aspect ratio, FIT leaves empty space on one axis — rendered as black bars.

## Two tempting fixes that both cause worse visible bugs
1. **Change the internal design resolution to the real device size.** Breaks every hand-tuned literal-pixel HUD value (fonts, icon sizes, panel widths, `camera.setZoom(...)`) because those pixel values were implicitly being shrunk by FIT's own CSS downscale before; remove that downscale and they render ~2x too large. Fixing this properly requires a global "virtual coordinate space + compensating camera zoom" rework across every scene — high effort, high regression risk, not a quick patch.
2. **Force the canvas element to `width:100%; height:100%` in CSS (independent axes).** Removes the bars but applies a *non-uniform* stretch whenever the device aspect ratio isn't exactly the design ratio. This visibly deforms any circular/square art (round buttons become ovals) and shifts inset-margin calculations (e.g. a compass/radar arrow's "stay N px from the edge" logic) asymmetrically, which can make arrows appear clipped past one edge even though the margin logic itself is correct in canvas-space.
   A *uniform* "cover" crop (scale up until there are zero bars, cropping overflow) avoids the deformation, but on real phone aspect ratios (much taller/narrower than an old ~0.56 design ratio) it needs to crop 60-90+ virtual px off the sides — which lands directly on any HUD buttons anchored within ~70px of the design canvas's edges (common for corner action buttons/emergency/minimap icons). Don't reach for `Scale.ENVELOP`/cover without first checking every HUD element's margin from the edges against the worst-case crop amount.

**Why:** both temptations solve the black-bar symptom but introduce a different, worse defect (distortion or clipped-off buttons) precisely because the game's HUD wasn't authored to tolerate either resolution changes or aspect-ratio-dependent cropping.

## The pragmatic fix actually shipped
Keep the internal design resolution fixed and keep `Scale.FIT` (uniform, centered, no deformation, no cropping) exactly as Phaser intends. Instead of trying to eliminate the bars geometrically, make them visually disappear: set the surrounding page background (`html, body`) to match the game's own palette (e.g. a dark radial gradient matching the Phaser config's `backgroundColor` and loading-screen color) instead of flat black. The letterbox sliver is still technically empty page background, not game canvas, but it blends into the scene rather than reading as a broken black stripe — with zero risk to HUD sizing, button shape, or arrow-margin math.

**How to apply:** if a future ask insists on a *literal* edge-to-edge fill (not just visually blended bars), the only correct way to do it without deformation or cropping is the full "dynamic canvas resolution + camera zoom compensation + virtual-coordinate layout" rework from temptation #1 above — done deliberately and completely across every scene, not as a quick patch.
