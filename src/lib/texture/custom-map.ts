// Turns an uploaded image into a heightmap (browser only): resample to 256×256, grayscale.

import { HEIGHTMAP_SIZE, type Heightmap } from "./heightmap";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Decodes an image file into a heightmap (luminance 0–1).
 * @throws Error for unsupported types, oversized files or undecodable images.
 */
export async function imageToHeightmap(file: File): Promise<Heightmap> {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error("Use a PNG, JPG or WebP image for a custom map.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Custom map images must be smaller than 20 MB.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image could not be read.");
  }

  const size = HEIGHTMAP_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();

  // Canvas rows start at the top; heightmap row 0 is v = 0 (bottom), so flip.
  const pixels = ctx.getImageData(0, 0, size, size).data;
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = ((size - 1 - y) * size + x) * 4;
      data[y * size + x] =
        (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) /
        255;
    }
  }
  return { size, data };
}
