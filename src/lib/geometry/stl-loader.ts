// Framework-free STL parsing, validation and model metadata, kept separate from React so it
// can be reused (e.g. in a Web Worker).

import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

/** Files above this size trigger a warning; above MAX_BYTES they are refused. */
const WARN_BYTES = 200 * 1024 * 1024;
const MAX_BYTES = 500 * 1024 * 1024;
/**
 * A triangle is degenerate if its area is below this fraction of the model's
 * bounding-box diagonal squared, so the check works at any unit scale.
 */
const MIN_RELATIVE_AREA = 1e-14;

/** Supported model units and their size in millimetres. */
export type ModelUnits = "mm" | "cm" | "m" | "in";
export const UNIT_TO_MM: Record<ModelUnits, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
};

/**
 * Guesses the file's units from its size. STL has no units; printable parts are rarely
 * under 1 mm, so a model that small was almost certainly exported in metres.
 */
export function guessUnits(maxDimension: number): ModelUnits {
  return maxDimension > 0 && maxDimension < 1 ? "m" : "mm";
}

// Summary shown in the status bar (dimensions come from the placement, since they change with rotation).
export type ModelInfo = {
  name: string;
  triangles: number;
  sizeBytes: number;
};

/**
 * Computes display metadata for a geometry.
 * @param geometry - Mesh geometry (indexed or non-indexed).
 * @param name - Label shown in the status bar (file name or "Sample Cube").
 * @param sizeBytes - Source file size; 0 for built-in geometry.
 * @returns Name, triangle count and file size.
 */
export function getModelInfo(
  geometry: THREE.BufferGeometry,
  name: string,
  sizeBytes = 0,
): ModelInfo {
  return {
    name,
    triangles: geometry.index
      ? geometry.index.count / 3
      : geometry.attributes.position.count / 3,
    sizeBytes,
  };
}

/** Largest side of the axis-aligned bounding box of non-indexed positions. */
function boxSize(positions: Float32Array) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}

/**
 * Removes zero-area triangles from non-indexed positions.
 * @param minArea - Area below which a triangle counts as degenerate (model units²).
 * @returns The kept positions and how many triangles were removed.
 */
function dropDegenerate(positions: Float32Array, minArea: number) {
  const keep = new Float32Array(positions.length);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let out = 0;
  for (let i = 0; i < positions.length; i += 9) {
    a.fromArray(positions, i);
    b.fromArray(positions, i + 3);
    c.fromArray(positions, i + 6);
    if (b.sub(a).cross(c.sub(a)).length() / 2 > minArea) {
      keep.set(positions.subarray(i, i + 9), out);
      out += 9;
    }
  }
  return {
    positions: keep.slice(0, out),
    removed: (positions.length - out) / 9,
  };
}

/**
 * Reads an STL file in the browser, validates it and returns clean geometry.
 * Checks: extension, size limits, empty or unreadable data, invalid coordinates;
 * zero-area triangles are removed.
 * @param file - User-selected `.stl` file (ASCII or binary).
 * @returns The parsed `geometry` (in file units), its `info`, the guessed `units`,
 *   and `notes` worth telling the user.
 * @throws Error with a readable message if the file can't be used.
 */
export async function loadSTL(file: File) {
  if (!file.name.toLowerCase().endsWith(".stl")) {
    throw new Error("Invalid file type. Please upload an STL file.");
  }
  if (file.size === 0) throw new Error("This STL file is empty.");
  if (file.size > MAX_BYTES) {
    throw new Error(
      "This STL file is larger than 500 MB, which is too big to edit in the browser.",
    );
  }

  const notes: string[] = [];
  if (file.size > WARN_BYTES) {
    notes.push("Large file: editing and export may be slow.");
  }

  let parsed: THREE.BufferGeometry;
  try {
    parsed = new STLLoader().parse(await file.arrayBuffer());
  } catch {
    throw new Error("This file could not be read as an STL.");
  }

  const raw = parsed.getAttribute("position")?.array as
    | Float32Array
    | undefined;
  parsed.dispose();
  if (!raw || raw.length === 0) {
    throw new Error("STL file does not contain any triangles.");
  }
  if (!raw.every(Number.isFinite)) {
    throw new Error("STL file contains invalid (NaN or infinite) coordinates.");
  }

  const [sx, sy, sz] = boxSize(raw);
  const diagonalSq = sx * sx + sy * sy + sz * sz;
  const { positions, removed } = dropDegenerate(
    raw,
    diagonalSq * MIN_RELATIVE_AREA,
  );
  if (positions.length === 0) {
    throw new Error("STL file only contains zero-area triangles.");
  }
  if (removed > 0) {
    notes.push(
      `Removed ${removed.toLocaleString()} zero-area triangle${removed === 1 ? "" : "s"}.`,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const info = getModelInfo(geometry, file.name, file.size);

  const units = guessUnits(Math.max(sx, sy, sz));
  if (units !== "mm") {
    const f = (v: number) => Number(v.toPrecision(3));
    notes.push(
      `Model was ${f(sx)} × ${f(sy)} × ${f(sz)} in file units, so it looks like metres; scaled ×1000 to millimetres. Change it under Units if needed.`,
    );
  }
  return { geometry, info, units, notes };
}
