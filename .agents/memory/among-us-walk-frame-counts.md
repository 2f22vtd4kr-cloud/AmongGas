---
    name: Among Us clone walk-frame counts
    description: Player walk animations have an inconsistent frame count per direction — down has 18, up/left/right have 17 — for every color, by design.
    ---

    Every FULL_COLORS player (Red, Blue, Green, Orange, Yellow) in this project ships 18 walk frames for the "down" direction but only 17 for "up"/"left"/"right". This is consistent across all 5 colors, so it's the actual asset layout, not a missing/corrupt file.

    **Why:** Code originally looped `for f in 1..18` for every direction during preload, which tried to load a nonexistent step18.png for up/left/right and threw "Failed to process file" console errors on every load.

    **How to apply:** When touching walk-frame loading/animation code in `src/scenes/GamePreloadScene.ts`, use a per-direction frame count map instead of a single hardcoded constant. Don't "fix" this by fabricating a duplicate 18th frame — the correct fix is bounding the loop to the real per-direction count.
    