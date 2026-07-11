---
name: Phaser letterbox/pillarbox black bars
description: Why a fixed "design resolution" game canvas shows black bars around the perimeter on some devices, and how to remove them.
---

## The problem
`Phaser.Scale.FIT` (with `autoCenter: CENTER_BOTH`) scales the internal game canvas uniformly to fit *inside* the parent element, preserving the configured `width`/`height` aspect ratio. If that configured aspect ratio doesn't match the actual device/window aspect ratio, FIT leaves empty space on one axis — rendered as black bars (pillarbox on the sides, letterbox on top/bottom) — even though nothing is functionally broken.

This is easy to miss during development because it only shows up on devices/windows whose aspect ratio differs from whatever fixed size was chosen (e.g. a `750x1334` "design canvas" tuned for one iPhone generation looks fine there but pillarboxes on taller/narrower modern phones).

## The fix
Don't hardcode a fixed design resolution. Set the Phaser game config's `width`/`height` to the actual `window.innerWidth`/`window.innerHeight` at boot, keep `Scale.FIT`, and add a `window.addEventListener('resize', () => game.scale.resize(window.innerWidth, window.innerHeight))` so it self-corrects if the viewport changes later (mobile browser chrome show/hide, orientation change, or an embedded WebView's viewport expanding after an async `expand()` call). Since the internal resolution's aspect ratio now always equals the real viewport's, FIT scales 1:1 with zero leftover space — no bars, without switching to `Scale.RESIZE` or cropping (`ENVELOP`).

**Why:** matches the letterbox-causing aspect mismatch at its root instead of working around it; avoids the cropping risk of `ENVELOP` (which can clip edge-anchored HUD elements) and avoids needing to rewrite every fixed-pixel layout for `Scale.RESIZE`.

**How to apply:** safe with zero/minimal layout changes only if the scene code already positions things via `this.scale.width`/`this.scale.height` fractions (as most HUD code should). Scenes with genuinely fixed pixel offsets tuned for one specific design height (e.g. absolute `y` values assuming a ~1334px-tall canvas) will shift proportionally on shorter/taller real viewports — acceptable drift, not a hard blocker, but worth flagging if a scene leans heavily on fixed pixels rather than fractions.

For a WebView/Mini-App host that exposes an `expand()`-style call to maximize its own viewport, call that *before* reading `window.innerWidth/innerHeight` for the initial config, since the expansion may not be synchronous — pair with the resize listener above as a safety net for whenever the late viewport update actually lands.

## Gotcha: a fixed `camera.setZoom(N)` breaks once the canvas resolution changes
If gameplay code sets a hardcoded `camera.setZoom(N)` (a common way to keep a scrolling/follow camera readable on a small mobile frame), that constant was implicitly tuned *for the old fixed design resolution*. Switching the canvas to the real device viewport (per the fix above) without also rescaling that zoom makes the camera show far less of the world at the same `N` — it reads as "everything suddenly zoomed way in", especially on real phones whose CSS width is much smaller than a typical desktop-tuned design width (e.g. 750).

Fix: rescale the tuned zoom by how much smaller/larger the real canvas is than the original design size, using the same limiting-axis logic `Scale.FIT` used: `effectiveZoom = tunedZoom * Math.min(canvas.width / designWidth, canvas.height / designHeight)`. Apply once at scene create and again on the Scale Manager's `resize` event (remove the listener in the scene's `shutdown()`). This reproduces the exact visual zoom level the letterboxed version had, just without the bars.

**Why:** `Math.min(...)` mirrors which axis `FIT` was constrained by (width-limited vs. height-limited), so the recovered zoom matches what the user was already looking at, instead of guessing a fresh value.

