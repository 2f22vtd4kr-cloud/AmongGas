---
name: Screen-edge-hugging compass arrow
description: How to build a 360-degree HUD direction indicator (like Among Us's task arrow) that rides the border of the screen instead of sitting fixed in one spot.
---

## The technique
Given a target world position and the player's world position:
1. Compute `angle = Angle.Between(player, target)` in world space (camera doesn't rotate, so this angle is valid directly in screen space too).
2. Treat screen centre as the compass origin (valid approximation when the camera follows the player with only a small deadzone/lerp).
3. Cast a ray from centre in `angle` direction and clip it to a rectangle inset from the true screen edges by a small margin (so the icon never clips off-screen):
   `t = min(halfW/|cos(angle)|, halfH/|sin(angle)|)`, point = centre + (cos,sin)*t.
4. Position the HUD icon at that point every frame, and rotate it to `angle` (plus whatever offset makes the icon's default orientation point "forward").
5. Hide the arrow only once its task/objective is actually completed — do not hide it just because the player is in interact range (a glow/highlight on the target object is a separate, complementary signal, not a replacement for the arrow).

**Why:** a fixed-position rotating-only arrow (e.g. parked near top-center) reads as "a bigger version of the wrong widget" — real edge-radar compasses must actually move around the screen border as the target direction changes, not just spin in place. Likewise, an arrow that always snaps to the screen edge (even when the target is already visible on screen) reads as broken — the reference behavior is for it to leave the border and hover right next to the target once it's in view.

**How to apply:** reusable for any off-screen-target indicator (quest markers, objective arrows, radar blips) in a Phaser HUD layer rendered on a `setScrollFactor(0)` container/camera. If there are multiple simultaneous targets (e.g. one arrow per remaining task), give each its own arrow instance and run this update independently per target — do not collapse to a single "tracked" target unless explicitly asked.

### On-screen "hover near target" mode
When the target is already within the visible camera view, don't force it through the edge-of-screen ray-cast — instead float the arrow a short fixed distance *before* the target's actual screen position, still pointing at it. Because the main camera has no rotation, the world-space angle between player and target equals the screen-space angle exactly, so the same `angle` value drives rotation in both modes; only the arrow's *origin* differs (screen centre for the off-screen/radar mode vs. the target's own screen point for the on-screen/hover mode).

To get a target's exact HUD-pixel position from world coordinates (needed to decide which mode applies and where to place the hover arrow): `screenX = (target.x - camera.worldView.x) * camera.zoom`, `screenY = (target.y - camera.worldView.y) * camera.zoom`. Treat the target as "on screen" if that point falls inside the viewport inset by the same margin used for the edge clip.
