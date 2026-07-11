---
name: Phaser image aspect distortion from independent W/H fractions
description: Why UI images (buttons, logos, minimaps, alert banners) looked squished after changing the game's base canvas resolution/aspect ratio
---

A common pattern in ported/legacy Phaser code is sizing an image with two independently chosen fractions of the canvas, e.g. `image.setDisplaySize(W * 0.22, H * 0.07)`. This ignores the image's native aspect ratio entirely, so it only *looks* right by coincidence, when the canvas aspect ratio happens to be close to whatever the art was originally designed against.

**Why:** changing the base resolution to a tall portrait size (for mobile) changed the canvas aspect ratio drastically, and every image sized this way (menu buttons/title, minimap, victory/emergency alert banners, color-select swatches, full-page help/credit art) visibly stretched or squished, even though nothing about those images' own code had changed.

**How to apply:** never set independent W-fraction/H-fraction display sizes on an image whose proportions matter. Use a helper that reads `texture.getSourceImage()` for native width/height and computes a single uniform scale: `fitContain` (scale = min(maxW/nativeW, maxH/nativeH), like CSS `object-fit: contain`) for buttons/logos/panels/banners where content must not be cropped, and `fitCover` (scale = max(...), like `object-fit: cover`) for full-bleed backgrounds where cropping overflow is fine. Fixed-pixel (non-canvas-relative) sizes on textures with mismatched aspect ratios are a separate, usually lower-priority issue since their distortion doesn't change when the canvas resolution changes.
