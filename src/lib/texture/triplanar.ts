// Texture settings and projection (triplanar, cubic, cylindrical, spherical, planar),
// implemented twice with identical math: a CPU sampler for export and a GLSL chunk
// for the viewport preview.

import { type Heightmap, sampleHeightmap } from "./heightmap";

export type ProjectionMode =
  | "triplanar"
  | "cubic"
  | "cylindrical"
  | "spherical"
  | "planarXY"
  | "planarXZ"
  | "planarYZ";

/** Numeric codes shared with the shader. */
export const PROJECTION_CODES: Record<ProjectionMode, number> = {
  triplanar: 0,
  cubic: 1,
  cylindrical: 2,
  spherical: 3,
  planarXY: 4,
  planarXZ: 5,
  planarYZ: 6,
};

export type TextureSettings = {
  textureId: string;
  invert: boolean;
  /** Heightmap blur radius in texels. */
  smoothing: number;
  projection: ProjectionMode;
  /** Triplanar: 0 = hard switch between planes, 1 = wide blend. */
  transition: number;
  /** Cylindrical / spherical: how wide the cross-fade at the wrap seam is (0–1). */
  seamBlend: number;
  /** Cylindrical: faces within this angle of vertical use a flat cap projection (0 = off). */
  capAngle: number;
  /** Cylindrical / spherical: round Size U so the texture wraps a whole number of times. */
  snapSeamless: boolean;
  /** Displacement amplitude in mm. */
  depth: number;
  /** Push into the surface instead of out. */
  reverse: boolean;
  /** Mid-grey is zero displacement; light goes out, dark goes in. */
  symmetric: boolean;
  /** Tile size in mm. */
  sizeU: number;
  sizeV: number;
  lockUV: boolean;
  /** Tile offset in tiles (0–1). */
  offsetU: number;
  offsetV: number;
  /** Texture rotation in degrees. */
  rotation: number;
};

export const DEFAULT_TEXTURE: TextureSettings = {
  textureId: "knurl",
  invert: false,
  smoothing: 0,
  projection: "triplanar",
  transition: 0.5,
  seamBlend: 0.3,
  capAngle: 30,
  snapSeamless: true,
  depth: 0.5,
  reverse: false,
  symmetric: false,
  sizeU: 10,
  sizeV: 10,
  lockUV: true,
  offsetU: 0,
  offsetV: 0,
  rotation: 0,
};

/** Where wrapped projections are centred and how large they are (from the placed model). */
export type ProjectionFrame = {
  center: [number, number, number];
  /** Radius used to turn angles into millimetres. */
  radius: number;
  /** Size U actually used (snapped for seamless wrapping when enabled). */
  sizeU: number;
};

/**
 * Builds the projection frame for a model placed on the plate (centred on X/Y, Z from 0).
 * @param size - Placed model size [x, y, z] in mm.
 */
export function projectionFrame(
  s: TextureSettings,
  size: [number, number, number],
): ProjectionFrame {
  const [sx, sy, sz] = size;
  const radius =
    s.projection === "spherical"
      ? Math.max(sx, sy, sz, 1e-3) / 2
      : Math.max(sx, sy, 1e-3) / 2;
  const wrapped =
    s.projection === "cylindrical" || s.projection === "spherical";
  let sizeU = s.sizeU;
  if (wrapped && s.snapSeamless) {
    const circumference = 2 * Math.PI * radius;
    sizeU = circumference / Math.max(1, Math.round(circumference / s.sizeU));
  }
  return { center: [0, 0, sz / 2], radius, sizeU };
}

/** Exponent for blend weights |n|^p: low transition = sharp seams, high = soft. */
export function blendPower(transition: number) {
  return 1 + (1 - transition) * 15;
}

/** Converts a sampled height (0–1) to a signed offset along the normal, in mm. */
export function displacementAmount(h: number, s: TextureSettings) {
  const base = s.symmetric ? h - 0.5 : h;
  return base * s.depth * (s.reverse ? -1 : 1);
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Builds a CPU height sampler for a world position and unit normal.
 * Must stay in sync with TEXTURE_GLSL below.
 */
export function createTextureSampler(
  map: Heightmap,
  s: TextureSettings,
  frame: ProjectionFrame,
) {
  const angle = (s.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const power = blendPower(s.transition);
  const [cx, cy, cz] = frame.center;
  const R = frame.radius;
  const capCos = s.capAngle > 0 ? Math.cos((s.capAngle * Math.PI) / 180) : 2;
  const seam = s.seamBlend * 0.5 * Math.PI;

  const plane = (a: number, b: number) =>
    sampleHeightmap(
      map,
      (a * cos - b * sin) / frame.sizeU + s.offsetU,
      (a * sin + b * cos) / s.sizeV + s.offsetV,
    );

  // Angle around the axis becomes arc length; near ±π cross-fade with the other side.
  const wrap = (theta: number, v: number) => {
    const h = plane(theta * R, v);
    if (seam <= 0) return h;
    const t =
      Math.min(1, Math.max(0, (Math.abs(theta) - (Math.PI - seam)) / seam)) *
      0.5;
    if (t <= 0) return h;
    const other = plane((theta - Math.sign(theta) * 2 * Math.PI) * R, v);
    return h + (other - h) * t;
  };

  return (
    px: number,
    py: number,
    pz: number,
    nx: number,
    ny: number,
    nz: number,
  ) => {
    switch (s.projection) {
      case "planarXY":
        return plane(px, py);
      case "planarXZ":
        return plane(px, pz);
      case "planarYZ":
        return plane(py, pz);
      case "cubic": {
        const ax = Math.abs(nx);
        const ay = Math.abs(ny);
        const az = Math.abs(nz);
        if (ax >= ay && ax >= az) return plane(py, pz);
        if (ay >= az) return plane(px, pz);
        return plane(px, py);
      }
      case "cylindrical": {
        const side = wrap(Math.atan2(py - cy, px - cx), pz);
        const cap = smoothstep(capCos - 0.08, capCos + 0.08, Math.abs(nz));
        return cap > 0 ? side + (plane(px, py) - side) * cap : side;
      }
      case "spherical": {
        const dx = px - cx;
        const dy = py - cy;
        const dz = pz - cz;
        const r = Math.max(Math.hypot(dx, dy, dz), 1e-6);
        const phi = Math.acos(Math.min(1, Math.max(-1, dz / r)));
        return wrap(Math.atan2(dy, dx), phi * R);
      }
      default: {
        let wx = Math.abs(nx) ** power;
        let wy = Math.abs(ny) ** power;
        let wz = Math.abs(nz) ** power;
        const total = Math.max(wx + wy + wz, 1e-5);
        wx /= total;
        wy /= total;
        wz /= total;
        return wx * plane(py, pz) + wy * plane(px, pz) + wz * plane(px, py);
      }
    }
  };
}

/** GLSL twin of createTextureSampler + displacementAmount; uniforms set by the material. */
export const TEXTURE_GLSL = /* glsl */ `
uniform sampler2D uHeightMap;
uniform vec2 uTexSize;
uniform vec2 uTexOffset;
uniform float uTexRotation;
uniform float uBlendPower;
uniform float uProjection;
uniform vec3 uCenter;
uniform float uRadius;
uniform float uSeam;
uniform float uCapCos;
uniform float uDepth;
uniform float uSymmetric;
uniform float uSign;

float texPlane(vec2 a) {
  float c = cos(uTexRotation);
  float s = sin(uTexRotation);
  vec2 uv = vec2(a.x * c - a.y * s, a.x * s + a.y * c) / uTexSize + uTexOffset;
  return texture2D(uHeightMap, uv).r;
}

float texWrap(float theta, float v) {
  float h = texPlane(vec2(theta * uRadius, v));
  if (uSeam <= 0.0) return h;
  float t = clamp((abs(theta) - (PI - uSeam)) / uSeam, 0.0, 1.0) * 0.5;
  if (t <= 0.0) return h;
  float other = texPlane(vec2((theta - sign(theta) * 2.0 * PI) * uRadius, v));
  return mix(h, other, t);
}

float textureHeight(vec3 p, vec3 n) {
  if (uProjection > 3.5) {
    if (uProjection < 4.5) return texPlane(p.xy);
    if (uProjection < 5.5) return texPlane(p.xz);
    return texPlane(p.yz);
  }
  if (uProjection > 0.5 && uProjection < 1.5) {
    vec3 a = abs(n);
    if (a.x >= a.y && a.x >= a.z) return texPlane(p.yz);
    if (a.y >= a.z) return texPlane(p.xz);
    return texPlane(p.xy);
  }
  if (uProjection > 1.5 && uProjection < 2.5) {
    float side = texWrap(atan(p.y - uCenter.y, p.x - uCenter.x), p.z);
    float cap = smoothstep(uCapCos - 0.08, uCapCos + 0.08, abs(n.z));
    return mix(side, texPlane(p.xy), cap);
  }
  if (uProjection > 2.5) {
    vec3 d = p - uCenter;
    float r = max(length(d), 1e-6);
    float phi = acos(clamp(d.z / r, -1.0, 1.0));
    return texWrap(atan(d.y, d.x), phi * uRadius);
  }
  vec3 w = pow(abs(n), vec3(uBlendPower));
  w /= max(w.x + w.y + w.z, 1e-5);
  return w.x * texPlane(p.yz) + w.y * texPlane(p.xz) + w.z * texPlane(p.xy);
}

float displacementAmount(float h) {
  return (h - 0.5 * uSymmetric) * uDepth * uSign;
}
`;
