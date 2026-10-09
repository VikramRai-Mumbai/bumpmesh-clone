// Surface mask: which faces receive texture. Combines angle masking (near-horizontal
// tops/bottoms) with a painted selection, and fades displacement near mask edges.

import * as THREE from "three";
import type { Rotation } from "@/lib/geometry/orientation";

export type MaskMode = "exclude" | "include";
export type FalloffCurve = "linear" | "scurve" | "ease";

export type MaskSettings = {
  /** Exclude: painted faces stay smooth. Include: only painted faces get texture. */
  mode: MaskMode;
  /** Faces within this many degrees of pointing straight up are not textured (0 = off). */
  topAngle: number;
  /** Same for faces pointing straight down. */
  bottomAngle: number;
  /** Distance in mm over which texture fades in from a mask edge (0 = hard edge). */
  falloff: number;
  curve: FalloffCurve;
  /** Painted faces, one bit per triangle of the original model. */
  paint: Uint8Array;
};

export const DEFAULT_MASK: MaskSettings = {
  mode: "exclude",
  topAngle: 0,
  bottomAngle: 0,
  falloff: 0,
  curve: "linear",
  paint: new Uint8Array(0),
};

// --- Bitset helpers (immutable updates return a copy) ---

/** True if face `i` is painted. Faces beyond the array are unpainted. */
export function isPainted(paint: Uint8Array, i: number) {
  return ((paint[i >> 3] ?? 0) & (1 << (i & 7))) !== 0;
}

/** Copy of `paint` sized for `faceCount` faces, so it can be edited in place. */
export function clonePaint(paint: Uint8Array, faceCount: number) {
  const out = new Uint8Array(Math.ceil(faceCount / 8));
  out.set(paint.subarray(0, out.length));
  return out;
}

/** Sets or clears one face in a (mutable) bitset. */
export function setPainted(paint: Uint8Array, i: number, on: boolean) {
  if (on) paint[i >> 3] |= 1 << (i & 7);
  else paint[i >> 3] &= ~(1 << (i & 7));
}

/** Number of painted faces. */
export function countPainted(paint: Uint8Array) {
  let n = 0;
  for (const byte of paint) {
    let b = byte;
    while (b) {
      b &= b - 1;
      n++;
    }
  }
  return n;
}

// --- Face data ---

const normalCache = new WeakMap<THREE.BufferGeometry, Float32Array>();

/**
 * Unit normal of every triangle in the geometry's own space (cached per geometry).
 * The model geometry is non-indexed, so triangle i uses vertices 3i..3i+2.
 */
export function getFaceNormals(geometry: THREE.BufferGeometry): Float32Array {
  const cached = normalCache.get(geometry);
  if (cached) return cached;

  const pos = geometry.getAttribute("position");
  const faces = pos.count / 3;
  const out = new Float32Array(faces * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let f = 0; f < faces; f++) {
    a.fromBufferAttribute(pos, f * 3);
    b.fromBufferAttribute(pos, f * 3 + 1);
    c.fromBufferAttribute(pos, f * 3 + 2);
    c.sub(b).cross(a.sub(b)).normalize();
    out.set([c.x, c.y, c.z], f * 3);
  }
  normalCache.set(geometry, out);
  return out;
}

/** True when nothing is masked, so callers can skip mask work entirely. */
export function isMaskEmpty(mask: MaskSettings) {
  return (
    mask.topAngle <= 0 &&
    mask.bottomAngle <= 0 &&
    mask.mode === "exclude" &&
    countPainted(mask.paint) === 0
  );
}

/**
 * Texture weight per original face: 1 = textured, 0 = masked.
 * @param geometry - Original (non-indexed) model geometry.
 * @param rotation - Model rotation, so "top" and "bottom" follow the current orientation.
 */
export function computeFaceWeights(
  geometry: THREE.BufferGeometry,
  rotation: Rotation,
  mask: MaskSettings,
): Float32Array {
  const normals = getFaceNormals(geometry);
  const faces = normals.length / 3;
  const weights = new Float32Array(faces);
  const q = new THREE.Quaternion(...rotation);
  const n = new THREE.Vector3();
  const topCos =
    mask.topAngle > 0 ? Math.cos((mask.topAngle * Math.PI) / 180) : 2;
  const bottomCos =
    mask.bottomAngle > 0 ? Math.cos((mask.bottomAngle * Math.PI) / 180) : 2;
  const include = mask.mode === "include";

  for (let f = 0; f < faces; f++) {
    const painted = isPainted(mask.paint, f);
    let w = include ? (painted ? 1 : 0) : painted ? 0 : 1;
    if (w > 0 && (topCos <= 1 || bottomCos <= 1)) {
      // World-space Z of the face normal: +1 = facing up, −1 = facing down.
      n.fromArray(normals, f * 3).applyQuaternion(q);
      if (n.z >= topCos || -n.z >= bottomCos) w = 0;
    }
    weights[f] = w;
  }
  return weights;
}

/** Shapes the 0–1 fade across the falloff distance. */
export function falloffCurve(t: number, curve: FalloffCurve) {
  const x = Math.min(1, Math.max(0, t));
  if (curve === "scurve") return x * x * (3 - 2 * x);
  if (curve === "ease") return x * x;
  return x;
}

/**
 * Per-vertex texture weight for an indexed, subdivided mesh.
 * A vertex touching any masked triangle gets 0 (so the mask edge stays closed and flat);
 * with a falloff, weights then ramp from 0 to 1 with distance from the nearest such vertex.
 * @param positions - Vertex positions (xyz triplets) in mm.
 * @param index - Triangle vertex indices.
 * @param parents - Original face of each triangle.
 * @param faceWeights - From computeFaceWeights.
 */
export function computeVertexWeights(
  positions: ArrayLike<number>,
  index: ArrayLike<number>,
  parents: ArrayLike<number>,
  faceWeights: Float32Array,
  falloff: number,
  curve: FalloffCurve,
): Float32Array {
  const vertexCount = positions.length / 3;
  const weights = new Float32Array(vertexCount).fill(1);
  for (let t = 0; t < index.length / 3; t++) {
    if (faceWeights[parents[t]] < 1) {
      weights[index[t * 3]] = 0;
      weights[index[t * 3 + 1]] = 0;
      weights[index[t * 3 + 2]] = 0;
    }
  }
  if (falloff <= 0) return weights;

  // Bucket the zero-weight vertices in a grid with cell size = falloff distance,
  // then each textured vertex only checks the 27 surrounding cells.
  const cell = falloff;
  const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  for (let v = 0; v < vertexCount; v++) {
    if (weights[v] > 0) continue;
    const k = key(
      Math.floor(positions[v * 3] / cell),
      Math.floor(positions[v * 3 + 1] / cell),
      Math.floor(positions[v * 3 + 2] / cell),
    );
    const bucket = grid.get(k);
    if (bucket) bucket.push(v);
    else grid.set(k, [v]);
  }
  if (grid.size === 0) return weights;

  for (let v = 0; v < vertexCount; v++) {
    if (weights[v] === 0) continue;
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const cz = Math.floor(z / cell);
    let best = falloff * falloff;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(key(cx + dx, cy + dy, cz + dz));
          if (!bucket) continue;
          for (const o of bucket) {
            const ex = positions[o * 3] - x;
            const ey = positions[o * 3 + 1] - y;
            const ez = positions[o * 3 + 2] - z;
            const d = ex * ex + ey * ey + ez * ez;
            if (d < best) best = d;
          }
        }
      }
    }
    weights[v] = falloffCurve(Math.sqrt(best) / falloff, curve);
  }
  return weights;
}
