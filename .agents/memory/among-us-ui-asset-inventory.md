---
name: Among Us clone — UI icon asset inventory
description: Which HUD button icons exist as real art in Assets/ vs which are missing, for matching the mobile-reference Among Us UI.
---

Checked when comparing the game's HUD against a real Among Us mobile-gameplay reference screenshot.

- Real icon art that exists and should be used instead of emoji/drawn shapes: `Assets/Images/UI/kill_icon(.png/_dim.png)`, `emergency_icon(.png/_dim.png)`, `sabotage_icon`, `light_bulb_icon`, `map_button.png`. All were loaded in `GamePreloadScene` but several sat unused in favor of emoji text — worth checking for this pattern again if more HUD buttons get revisited.
- No dedicated small icon graphic exists anywhere in `Assets/` for "USE" or "REPORT" buttons, nor for settings-gear/chat-bubble/ping HUD elements seen in real mobile Among Us. The large `Assets/Images/Alerts/report_dead_body_*` files are full-screen banners, not button icons — don't mistake them for one.
- **Why:** the project's explicit rule is to never vector-draw or generate new game assets — only use what's already in `Assets/`. Confirmed via full `find`/`ls` of `Assets/Images/{UI,Items,Alerts}` that no hand/report/use/settings/chat icon exists under any filename.
- **How to apply:** when asked to visually match reference Among Us UI again, swap in real assets where they exist (grep `GamePreloadScene` load list first — it often loads more than what's wired up), and explicitly tell the user which reference elements have no asset instead of inventing one.
