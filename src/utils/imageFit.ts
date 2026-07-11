import Phaser from 'phaser';

/**
 * Scales an image so it fits entirely inside a maxW x maxH box while
 * preserving its native aspect ratio (letterboxed inside the box —
 * like CSS `object-fit: contain`).
 *
 * Use this for buttons, logos, panels, and any image whose proportions
 * matter (text baked into the art, recognizable shapes, etc). Setting
 * `setDisplaySize(w, h)` directly with two independently-chosen
 * fractions of the canvas width/height stretches/squishes the image
 * whenever the canvas aspect ratio doesn't match the source art's
 * aspect ratio — which is exactly what happened when the base
 * resolution changed to a tall portrait size.
 */
export function fitContain<T extends Phaser.GameObjects.Image>(
  image: T,
  maxW: number,
  maxH: number,
): T {
  const src = image.texture.getSourceImage() as { width: number; height: number };
  const nativeW = src.width || maxW;
  const nativeH = src.height || maxH;
  const scale = Math.min(maxW / nativeW, maxH / nativeH);
  image.setDisplaySize(nativeW * scale, nativeH * scale);
  return image;
}

/**
 * Scales an image so it fully covers a boxW x boxH area while
 * preserving its native aspect ratio (overflow extends symmetrically
 * past the box — like CSS `object-fit: cover`). Intended for
 * full-bleed backgrounds positioned at the box's center; the excess is
 * simply clipped by the camera, no mask needed.
 */
export function fitCover<T extends Phaser.GameObjects.Image>(
  image: T,
  boxW: number,
  boxH: number,
): T {
  const src = image.texture.getSourceImage() as { width: number; height: number };
  const nativeW = src.width || boxW;
  const nativeH = src.height || boxH;
  const scale = Math.max(boxW / nativeW, boxH / nativeH);
  image.setDisplaySize(nativeW * scale, nativeH * scale);
  return image;
}
