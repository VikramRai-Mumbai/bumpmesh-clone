// Heightmap grids: generation from presets, invert/blur processing and bilinear sampling.
// The same data drives the GPU preview and the CPU export, so both match.

import { getPreset } from "./presets";

export type Heightmap = {
  size: number;
  /** Row-major heights in [0, 1]; row 0 is v = 0. */
  data: Float32Array;
};

export const HEIGHTMAP_SIZE = 256;

const rawCache = new Map<string, Heightmap>();
const processedCache = new Map<string, Heightmap>();

/** Texture id used for the user's uploaded heightmap. */
export const CUSTOM_TEXTURE_ID = "custom";
let customMap: Heightmap | null = null;
let customVersion = 0;

/** Registers (or clears) the uploaded heightmap; cached variants of the old one are dropped. */
export function setCustomHeightmap(map: Heightmap | null) {
  customMap = map;
  customVersion++;
  for (const cache of [rawCache, processedCache]) {
    for (const key of cache.keys()) {
      if (key.startsWith(CUSTOM_TEXTURE_ID)) cache.delete(key);
    }
  }
}

/** Changes whenever the custom map is replaced, so caches and thumbnails can refresh. */
export function getCustomVersion() {
  return customVersion;
}

export function getCustomHeightmap() {
  return customMap;
}

/**
 * Renders a preset into a size×size grid and normalises it to 0–1.
 * Sample points are texel centres so the grid matches GPU texture sampling.
 */
export function buildHeightmap(id: string, size = HEIGHTMAP_SIZE): Heightmap {
  const key = `${id}@${size}`;
  const cached = rawCache.get(key);
  if (cached) return cached;

  // The custom map is used as uploaded; other sizes (thumbnails) are resampled from it.
  if (id === CUSTOM_TEXTURE_ID && customMap) {
    const source = customMap;
    const map =
      size === source.size
        ? source
        : {
            size,
            data: Float32Array.from({ length: size * size }, (_, i) =>
              sampleHeightmap(
                source,
                ((i % size) + 0.5) / size,
                (Math.floor(i / size) + 0.5) / size,
              ),
            ),
          };
    rawCache.set(key, map);
    return map;
  }

  const { height } = getPreset(id);
  const data = new Float32Array(size * size);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = height((x + 0.5) / size, (y + 0.5) / size);
      data[y * size + x] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  const range = max - min || 1;
  for (let i = 0; i < data.length; i++) data[i] = (data[i] - min) / range;

  const map = { size, data };
  rawCache.set(key, map);
  return map;
}

/** Separable box blur with wrap-around, so the result still tiles. */
function blur(map: Heightmap, radius: number): Heightmap {
  const { size } = map;
  const tmp = new Float32Array(size * size);
  const out = new Float32Array(size * size);
  const width = radius * 2 + 1;
  const wrap = (i: number) => ((i % size) + size) % size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++)
        sum += map.data[y * size + wrap(x + k)];
      tmp[y * size + x] = sum / width;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++)
        sum += tmp[wrap(y + k) * size + x];
      out[y * size + x] = sum / width;
    }
  }
  return { size, data: out };
}

/**
 * Returns the preset's heightmap with invert and smoothing applied (cached).
 * @param id - Preset id.
 * @param invert - Swap high and low.
 * @param smoothing - Blur radius in texels (0 = none).
 */
export function getProcessedHeightmap(
  id: string,
  invert: boolean,
  smoothing: number,
): Heightmap {
  const radius = Math.max(0, Math.round(smoothing));
  const key = `${id}|${invert}|${radius}`;
  const cached = processedCache.get(key);
  if (cached) return cached;

  let map = buildHeightmap(id);
  if (radius > 0) map = blur(map, radius);
  if (invert) map = { size: map.size, data: map.data.map((h) => 1 - h) };

  if (processedCache.size > 24) processedCache.clear();
  processedCache.set(key, map);
  return map;
}

/**
 * Bilinear sample with wrap-around, matching WebGL LINEAR + REPEAT filtering.
 * @param u - Horizontal coordinate in tiles (any value; wraps).
 * @param v - Vertical coordinate in tiles (any value; wraps).
 */
export function sampleHeightmap(map: Heightmap, u: number, v: number) {
  const { size, data } = map;
  const x = u * size - 0.5;
  const y = v * size - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const wx0 = ((x0 % size) + size) % size;
  const wy0 = ((y0 % size) + size) % size;
  const wx1 = (wx0 + 1) % size;
  const wy1 = (wy0 + 1) % size;
  const a = data[wy0 * size + wx0];
  const b = data[wy0 * size + wx1];
  const c = data[wy1 * size + wx0];
  const d = data[wy1 * size + wx1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
