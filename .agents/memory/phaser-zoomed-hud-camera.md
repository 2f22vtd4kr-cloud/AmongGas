---
name: Phaser UI camera for zoomed HUDs
description: Why HUD elements need a second unzoomed camera once the main camera has a zoom level other than 1.0
---

In Phaser 3, `setScrollFactor(0)` only cancels camera *scroll* for an object — it does not cancel the camera's *zoom* or *rotation*. Once the main camera's zoom is pushed above 1.0 (e.g. for a tighter mobile-portrait view), every HUD element that relies only on `setScrollFactor(0)` gets zoomed/repositioned along with the world and can end up pushed off-screen.

**Why:** discovered while adapting a desktop game's camera for mobile portrait play — raising zoom broke the whole HUD (joystick, action buttons, task bar) even though every HUD object had `setScrollFactor(0)`.

**How to apply:** add a second camera (e.g. `uiCamera`) with no zoom/scroll, added after the HUD is built. Snapshot the HUD objects into a set, then call `mainCamera.ignore(hudSet)` and `uiCamera.ignore(everythingElse)`. Any HUD-layer object created later dynamically (alert overlays, result text, modal panels) needs its own explicit `mainCamera.ignore(...)` call at creation time, or it will render (distorted) on the main camera as well.
