// Grayscale thumbnails of the presets for the sidebar and gallery (browser only).

import {
  buildHeightmap,
  CUSTOM_TEXTURE_ID,
  getCustomVersion,
} from "./heightmap";

const cache = new Map<string, string>();

/** Returns a cached PNG data URL of the preset's heightmap. */
export function getThumbnail(id: string, size = 96): string {
  const key = id === CUSTOM_TEXTURE_ID ? `${id}:${getCustomVersion()}` : id;
  const cached = cache.get(key);
  if (cached) return cached;

  const map = buildHeightmap(id, size);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const image = ctx.createImageData(size, size);
  // Heightmap row 0 is the bottom (v = 0); canvas row 0 is the top, so draw flipped.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const g = Math.round(map.data[y * size + x] * 255);
      image.data.set([g, g, g, 255], ((size - 1 - y) * size + x) * 4);
    }
  }
  ctx.putImageData(image, 0, 0);

  const url = canvas.toDataURL("image/png");
  cache.set(key, url);
  return url;
}
