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
5. Hide the arrow once the player is within interact range of the target (reuse existing proximity/"nearby" detection) — a glow/highlight on the target object itself takes over as the "you're here" signal instead.

**Why:** a fixed-position rotating-only arrow (e.g. parked near top-center) reads as "a bigger version of the wrong widget" — real edge-radar compasses must actually move around the screen border as the target direction changes, not just spin in place.

**How to apply:** reusable for any off-screen-target indicator (quest markers, objective arrows, radar blips) in a Phaser HUD layer rendered on a `setScrollFactor(0)` container/camera.
