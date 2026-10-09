// Mesh preparation for displacement: weld shared vertices and subdivide long edges.

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Merges duplicate vertices so neighbouring triangles share points. Without this,
 * displacing an STL (which stores every triangle separately) opens cracks.
 * @returns Indexed geometry with only a position attribute.
 */
export function weld(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const positionOnly = new THREE.BufferGeometry();
  positionOnly.setAttribute("position", geometry.getAttribute("position"));
  if (geometry.index) positionOnly.setIndex(geometry.index);
  const welded = mergeVertices(positionOnly, 1e-4);
  positionOnly.dispose();
  return welded;
}

export type SubdivideResult = {
  geometry: THREE.BufferGeometry;
  /** True if the triangle budget stopped subdivision before every edge was short enough. */
  limited: boolean;
  /** For each output triangle, the input triangle it came from (used by masking). */
  parents: Uint32Array;
};

/**
 * Splits edges longer than `maxEdge` until all edges fit or the budget is reached.
 * The split decision depends only on each edge, so neighbours agree and no cracks appear.
 * @param geometry - Indexed geometry (see weld).
 * @param maxEdge - Target edge length in mm.
 * @param maxTriangles - Upper limit on output triangles.
 */
export function subdivide(
  geometry: THREE.BufferGeometry,
  maxEdge: number,
  maxTriangles: number,
): SubdivideResult {
  const source = geometry.getAttribute("position");
  const pos: number[] = Array.from(source.array as ArrayLike<number>);
  let index: number[] = geometry.index
    ? Array.from(geometry.index.array as ArrayLike<number>)
    : Array.from({ length: source.count }, (_, i) => i);
  // Input triangle each current triangle descends from.
  let parents: number[] = Array.from({ length: index.length / 3 }, (_, t) => t);
  const limitSq = maxEdge * maxEdge;
  let limited = false;

  const lengthSq = (a: number, b: number) => {
    const dx = pos[a * 3] - pos[b * 3];
    const dy = pos[a * 3 + 1] - pos[b * 3 + 1];
    const dz = pos[a * 3 + 2] - pos[b * 3 + 2];
    return dx * dx + dy * dy + dz * dz;
  };
  const isLong = (a: number, b: number) => lengthSq(a, b) > limitSq;

  for (let pass = 0; pass < 16; pass++) {
    // Count the triangles this pass would produce before doing any work.
    let next = 0;
    let anyLong = false;
    for (let t = 0; t < index.length; t += 3) {
      const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
      const long = +isLong(a, b) + +isLong(b, c) + +isLong(c, a);
      if (long) anyLong = true;
      next += 1 + long;
    }
    if (!anyLong) break;
    if (next > maxTriangles) {
      limited = true;
      break;
    }

    const vertexCount = pos.length / 3;
    const midpoints = new Map<number, number>();
    const midpoint = (a: number, b: number) => {
      const key = a < b ? a * vertexCount + b : b * vertexCount + a;
      let m = midpoints.get(key);
      if (m === undefined) {
        m = pos.length / 3;
        pos.push(
          (pos[a * 3] + pos[b * 3]) / 2,
          (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2,
          (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2,
        );
        midpoints.set(key, m);
      }
      return m;
    };

    const out: number[] = [];
    const outParents: number[] = [];
    for (let t = 0; t < index.length; t += 3) {
      // Rotate the triangle so the split pattern can be handled in one canonical form.
      let tri = [index[t], index[t + 1], index[t + 2]];
      let flags = [0, 1, 2].map((i) => isLong(tri[i], tri[(i + 1) % 3]));
      const count = flags.filter(Boolean).length;
      // A triangle splits into count + 1 pieces (4 when all three edges split).
      const pieces = count === 3 ? 4 : count + 1;
      for (let k = 0; k < pieces; k++) outParents.push(parents[t / 3]);

      if (count === 0) {
        out.push(...tri);
        continue;
      }
      if (count === 3) {
        const [a, b, c] = tri;
        const ab = midpoint(a, b);
        const bc = midpoint(b, c);
        const ca = midpoint(c, a);
        out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
        continue;
      }
      // Rotate so edge 0 (a–b) is long and, for two long edges, edge 2 (c–a) is short.
      for (let r = 0; r < 3; r++) {
        const ok = count === 1 ? flags[0] : flags[0] && flags[1];
        if (ok) break;
        tri = [tri[1], tri[2], tri[0]];
        flags = [flags[1], flags[2], flags[0]];
      }
      const [a, b, c] = tri;
      const ab = midpoint(a, b);
      if (count === 1) {
        out.push(a, ab, c, ab, b, c);
      } else {
        const bc = midpoint(b, c);
        out.push(ab, b, bc, a, ab, bc, a, bc, c);
      }
    }
    index = out;
    parents = outParents;
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  result.setIndex(
    pos.length / 3 > 65535
      ? new THREE.Uint32BufferAttribute(index, 1)
      : new THREE.Uint16BufferAttribute(index, 1),
  );
  return { geometry: result, limited, parents: Uint32Array.from(parents) };
}

/** Total surface area in mm². */
export function surfaceArea(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute("position");
  const index = geometry.index;
  const count = index ? index.count : position.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let area = 0;
  for (let i = 0; i < count; i += 3) {
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return area;
}

/**
 * Rough output size for a given resolution: area divided by the area of a typical
 * subdivided triangle, never below the input count and capped at the budget.
 */
export function estimateTriangles(
  geometry: THREE.BufferGeometry,
  resolution: number,
  maxTriangles: number,
): number {
  const input =
    (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
  // Midpoint splits leave edges between res/2 and res; measured ≈ 0.14·res² per triangle.
  const perTriangle = 0.14 * resolution * resolution;
  const estimate = Math.max(input, surfaceArea(geometry) / perTriangle);
  return Math.round(Math.min(estimate, maxTriangles));
}
