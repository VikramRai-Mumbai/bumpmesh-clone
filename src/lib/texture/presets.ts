// Built-in procedural textures. Each is a seamless height function h(u, v) in [0, 1]
// over one tile (u, v in [0, 1)), so no image assets are needed.

export type TextureCategory = "Grip" | "Geometric" | "Patterns" | "Organic";

export type TexturePreset = {
  id: string;
  name: string;
  category: TextureCategory;
  /** Height at tile coordinates (u, v); any range, normalised to 0–1 afterwards. */
  height: (u: number, v: number) => number;
};

const TAU = Math.PI * 2;
const fract = (x: number) => x - Math.floor(x);
/** Triangle wave: 0 at integers, 1 at half-integers. */
const tri = (x: number) => 1 - Math.abs(2 * fract(x) - 1);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Deterministic hash of an integer lattice point to [0, 1). */
function hash(i: number, j: number, seed = 0) {
  const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
  return fract(s);
}

/** Value noise that repeats every `period` cells, so it tiles. */
function periodicNoise(u: number, v: number, period: number, seed = 0) {
  const x = u * period;
  const y = v * period;
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) =>
    hash(
      ((a % period) + period) % period,
      ((b % period) + period) % period,
      seed,
    );
  const top = h(i, j) + (h(i + 1, j) - h(i, j)) * sx;
  const bottom = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * sx;
  return top + (bottom - top) * sy;
}

/** Fractal noise built from periodic octaves. */
function fbm(u: number, v: number, period: number, octaves = 4, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let p = period;
  for (let o = 0; o < octaves; o++) {
    sum += amp * periodicNoise(u, v, p, seed + o);
    amp *= 0.5;
    p *= 2;
  }
  return sum;
}

/** Distances to the nearest and second-nearest jittered cell point (tiling). */
function voronoi(u: number, v: number, cells: number, seed = 0) {
  const x = u * cells;
  const y = v * cells;
  const ci = Math.floor(x);
  const cj = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const i = ci + di;
      const j = cj + dj;
      const wi = ((i % cells) + cells) % cells;
      const wj = ((j % cells) + cells) % cells;
      const px = i + 0.15 + 0.7 * hash(wi, wj, seed);
      const py = j + 0.15 + 0.7 * hash(wi, wj, seed + 1);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2 };
}

/** Distance from the centre of the nearest hexagon (flat-topped grid, slightly stretched to tile). */
function hexDistance(u: number, v: number) {
  const x = u * 3 * Math.sqrt(3);
  const y = v * 6;
  const sx = Math.sqrt(3);
  const sy = 3;
  const ax = fract(x / sx) * sx - sx / 2;
  const ay = fract(y / sy) * sy - sy / 2;
  const bx = fract((x - sx / 2) / sx) * sx - sx / 2;
  const by = fract((y - sy / 2) / sy) * sy - sy / 2;
  const hex = (px: number, py: number) => {
    const qx = Math.abs(px);
    const qy = Math.abs(py);
    return Math.max(qx, qx * 0.5 + qy * 0.866025);
  };
  return Math.min(hex(ax, ay), hex(bx, by));
}

export const TEXTURE_PRESETS: TexturePreset[] = [
  {
    id: "knurl",
    name: "Knurl",
    category: "Grip",
    height: (u, v) => Math.min(tri(4 * (u + v)), tri(4 * (u - v))),
  },
  {
    id: "diamond-plate",
    name: "Diamond Plate",
    category: "Grip",
    height: (u, v) => {
      const a = fract(4 * u + 4 * v) - 0.5;
      const b = fract(4 * u - 4 * v) - 0.5;
      const lens = (Math.abs(a) * 2.6 + Math.abs(b) * 0.9) * 1.4;
      return smooth(1, 0.6, lens);
    },
  },
  {
    id: "ribs",
    name: "Ribs",
    category: "Grip",
    height: (u) => smooth(0.15, 0.85, tri(8 * u)),
  },
  {
    id: "dots",
    name: "Dots",
    category: "Grip",
    height: (u, v) => {
      const x = fract(6 * u) - 0.5;
      const y = fract(6 * v) - 0.5;
      const r = Math.hypot(x, y) / 0.34;
      return r < 1 ? Math.sqrt(1 - r * r) : 0;
    },
  },
  {
    id: "hexagons",
    name: "Hexagons",
    category: "Geometric",
    // Cell boundaries are at distance √3/2 ≈ 0.866; leave a groove just inside them.
    height: (u, v) => smooth(0.84, 0.7, hexDistance(u, v)),
  },
  {
    id: "square-setts",
    name: "Square Setts",
    category: "Geometric",
    height: (u, v) => {
      const x = fract(6 * u) - 0.5;
      const y = fract(6 * v) - 0.5;
      const edge = smooth(0.47, 0.36, Math.max(Math.abs(x), Math.abs(y)));
      return edge * (1 - 0.6 * (x * x + y * y));
    },
  },
  {
    id: "bricks",
    name: "Bricks",
    category: "Geometric",
    height: (u, v) => {
      // Distance to the mortar in tile units, so joints are equally wide both ways.
      const row = Math.floor(8 * v);
      const x = fract(4 * u + (row % 2) * 0.5);
      const y = fract(8 * v);
      const dx = Math.min(x, 1 - x) / 4;
      const dy = Math.min(y, 1 - y) / 8;
      return smooth(0.004, 0.014, Math.min(dx, dy));
    },
  },
  {
    id: "grid",
    name: "Grid",
    category: "Geometric",
    height: (u, v) => {
      const gx = tri(8 * u);
      const gy = tri(8 * v);
      return smooth(0.08, 0.2, Math.min(gx, gy));
    },
  },
  {
    id: "basket-weave",
    name: "Basket Weave",
    category: "Geometric",
    height: (u, v) => {
      const bx = Math.floor(4 * u);
      const by = Math.floor(4 * v);
      const horizontal = (bx + by) % 2 === 0;
      const t = horizontal ? fract(12 * v) : fract(12 * u);
      const along = horizontal ? fract(4 * u) : fract(4 * v);
      return Math.sin(Math.PI * t) * (0.75 + 0.25 * Math.sin(Math.PI * along));
    },
  },
  {
    id: "waves",
    name: "Waves",
    category: "Patterns",
    height: (u, v) =>
      0.5 + 0.5 * Math.sin(TAU * (6 * u + 0.35 * Math.sin(TAU * 2 * v))),
  },
  {
    id: "scales",
    name: "Scales",
    category: "Patterns",
    height: (u, v) => {
      const y = 6 * v;
      const row = Math.floor(y);
      const x = fract(6 * u + (row % 2) * 0.5) - 0.5;
      const ly = fract(y);
      const r = Math.hypot(x, ly * 0.9) / 0.62;
      return r < 1 ? Math.sqrt(1 - r * r) * (0.4 + 0.6 * ly) : 0;
    },
  },
  {
    id: "carbon-weave",
    name: "Carbon Weave",
    category: "Patterns",
    height: (u, v) => {
      const i = Math.floor(8 * u);
      const j = Math.floor(8 * v);
      const over = ((i + Math.floor(j / 2)) % 2 === 0) !== (j % 2 === 0);
      const t = over ? fract(8 * v) : fract(8 * u);
      return 0.35 + 0.65 * Math.sin(Math.PI * t) * (over ? 1 : 0.8);
    },
  },
  {
    id: "stone",
    name: "Stone",
    category: "Organic",
    height: (u, v) => {
      const { f1, f2 } = voronoi(u, v, 6, 3);
      return smooth(0, 0.18, f2 - f1) * (0.85 + 0.15 * fbm(u, v, 8, 3, 5));
    },
  },
  {
    id: "noise",
    name: "Noise",
    category: "Organic",
    height: (u, v) => fbm(u, v, 6, 5, 11),
  },
  {
    id: "wood-grain",
    name: "Wood Grain",
    category: "Organic",
    height: (u, v) =>
      0.5 + 0.5 * Math.sin(TAU * (10 * v + 1.4 * fbm(u, v, 3, 4, 21))),
  },
  {
    id: "leather",
    name: "Leather",
    category: "Organic",
    height: (u, v) => {
      const { f1 } = voronoi(u, v, 14, 7);
      return clamp01(1 - f1 * 1.4) * 0.8 + 0.2 * fbm(u, v, 16, 3, 9);
    },
  },
];

export const TEXTURE_CATEGORIES: TextureCategory[] = [
  "Grip",
  "Geometric",
  "Patterns",
  "Organic",
];

/** Looks up a preset by id, falling back to the first one. */
export function getPreset(id: string): TexturePreset {
  return TEXTURE_PRESETS.find((p) => p.id === id) ?? TEXTURE_PRESETS[0];
}
