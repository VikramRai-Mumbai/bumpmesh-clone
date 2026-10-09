// Face adjacency and bucket fill: grow a selection across connected faces until the
// surface bends more than a threshold angle.

import type * as THREE from "three";
import { getFaceNormals } from "./mask";

type Adjacency = {
  /** Neighbour faces of face f are list[start[f] .. start[f + 1]). */
  start: Uint32Array;
  list: Uint32Array;
};

const cache = new WeakMap<THREE.BufferGeometry, Adjacency>();

/**
 * Builds edge adjacency for a non-indexed mesh by matching rounded vertex positions
 * (STL repeats shared corners per triangle). Cached per geometry.
 */
export function getAdjacency(geometry: THREE.BufferGeometry): Adjacency {
  const cached = cache.get(geometry);
  if (cached) return cached;

  const pos = geometry.getAttribute("position");
  const faces = pos.count / 3;

  // Give equal positions the same vertex id.
  const ids = new Uint32Array(pos.count);
  const lookup = new Map<string, number>();
  const r = (x: number) => Math.round(x * 1e4);
  for (let i = 0; i < pos.count; i++) {
    const k = `${r(pos.getX(i))},${r(pos.getY(i))},${r(pos.getZ(i))}`;
    let id = lookup.get(k);
    if (id === undefined) {
      id = lookup.size;
      lookup.set(k, id);
    }
    ids[i] = id;
  }

  // Faces sharing an (undirected) edge are neighbours.
  const vertexCount = lookup.size;
  const edgeOwner = new Map<number, number>();
  const pairs: number[] = [];
  for (let f = 0; f < faces; f++) {
    for (let k = 0; k < 3; k++) {
      const a = ids[f * 3 + k];
      const b = ids[f * 3 + ((k + 1) % 3)];
      const edge = a < b ? a * vertexCount + b : b * vertexCount + a;
      const other = edgeOwner.get(edge);
      if (other === undefined) edgeOwner.set(edge, f);
      else pairs.push(f, other);
    }
  }

  const counts = new Uint32Array(faces + 1);
  for (const f of pairs) counts[f + 1]++;
  for (let f = 0; f < faces; f++) counts[f + 1] += counts[f];
  const list = new Uint32Array(pairs.length);
  const fillAt = counts.slice(0, faces);
  for (let i = 0; i < pairs.length; i += 2) {
    list[fillAt[pairs[i]]++] = pairs[i + 1];
    list[fillAt[pairs[i + 1]]++] = pairs[i];
  }

  const adjacency = { start: counts, list };
  cache.set(geometry, adjacency);
  return adjacency;
}

/**
 * Faces reachable from `seed` without crossing an edge sharper than `maxAngle`.
 * Comparing each step to the previous face lets the fill follow gentle curves
 * (a cylinder wall) but stop at sharp corners.
 * @returns Face indices in the filled region.
 */
export function floodFill(
  geometry: THREE.BufferGeometry,
  seed: number,
  maxAngle: number,
): number[] {
  const { start, list } = getAdjacency(geometry);
  const normals = getFaceNormals(geometry);
  const minDot = Math.cos((maxAngle * Math.PI) / 180);
  const visited = new Uint8Array(start.length - 1);
  const region: number[] = [];
  const stack = [seed];
  visited[seed] = 1;

  while (stack.length) {
    const f = stack.pop() as number;
    region.push(f);
    for (let i = start[f]; i < start[f + 1]; i++) {
      const g = list[i];
      if (visited[g]) continue;
      const dot =
        normals[f * 3] * normals[g * 3] +
        normals[f * 3 + 1] * normals[g * 3 + 1] +
        normals[f * 3 + 2] * normals[g * 3 + 2];
      if (dot >= minDot) {
        visited[g] = 1;
        stack.push(g);
      }
    }
  }
  return region;
}
