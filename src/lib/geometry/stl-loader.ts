// Framework-free STL parsing, validation and model metadata, kept separate from React so it
// can be reused (e.g. in a Web Worker).

import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

/** Files above this size trigger a warning; above MAX_BYTES they are refused. */
const WARN_BYTES = 200 * 1024 * 1024;
const MAX_BYTES = 500 * 1024 * 1024;
/** Triangles with less area than this (mm²) are treated as degenerate and dropped. */
const MIN_AREA = 1e-10;

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

/**
 * Removes zero-area triangles from non-indexed positions.
 * @returns The kept positions and how many triangles were removed.
 */
function dropDegenerate(positions: Float32Array) {
  const keep = new Float32Array(positions.length);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let out = 0;
  for (let i = 0; i < positions.length; i += 9) {
    a.fromArray(positions, i);
    b.fromArray(positions, i + 3);
    c.fromArray(positions, i + 6);
    if (b.sub(a).cross(c.sub(a)).length() / 2 > MIN_AREA) {
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
 * @returns The parsed `geometry`, its `info`, and `notes` worth telling the user.
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

  const { positions, removed } = dropDegenerate(raw);
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
  return { geometry, info, notes };
}
