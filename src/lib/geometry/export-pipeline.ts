// Export pipeline on plain arrays (runs inside a Web Worker): bake orientation, weld,
// subdivide, apply mask weights, displace, write STL or 3MF, then read the file back.

import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { computeVertexWeights, type FalloffCurve } from "@/lib/mask/mask";
import type { Heightmap } from "@/lib/texture/heightmap";
import {
  createTextureSampler,
  displacementAmount,
  type ProjectionFrame,
  type TextureSettings,
} from "@/lib/texture/triplanar";
import { subdivide, weld } from "./mesh-ops";
import type { Placement, Rotation } from "./orientation";
import { inspect3MF, write3MF } from "./threemf";

export type ExportFormat = "stl" | "3mf";

/** Mask input for export: per original face weights plus the edge fade. */
export type ExportMask = {
  faceWeights: Float32Array;
  falloff: number;
  curve: FalloffCurve;
};

/** Everything the worker needs; all plain data so it can be posted to a worker. */
export type ExportJob = {
  /** Original non-indexed model positions. */
  positions: Float32Array;
  name: string;
  rotation: Rotation;
  placement: Placement;
  heightmap: Heightmap;
  settings: TextureSettings;
  frame: ProjectionFrame;
  mask: ExportMask | null;
  resolution: number;
  maxTriangles: number;
  format: ExportFormat;
};

export type ExportOutput = {
  bytes: Uint8Array;
  triangles: number;
  /** True if the triangle budget was reached before the target resolution. */
  limited: boolean;
  /** Read back from the written file. */
  verified: { triangles: number; size: [number, number, number] };
};

/**
 * Moves every vertex along its smoothed normal by the texture height at that point.
 * @param weights - Optional per-vertex factor (0 = masked, 1 = full texture).
 */
export function displaceGeometry(
  geometry: THREE.BufferGeometry,
  map: Heightmap,
  settings: TextureSettings,
  frame: ProjectionFrame,
  weights?: Float32Array,
) {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const sample = createTextureSampler(map, settings, frame);

  for (let i = 0; i < position.count; i++) {
    const w = weights ? weights[i] : 1;
    if (w === 0) continue;
    const px = position.getX(i);
    const py = position.getY(i);
    const pz = position.getZ(i);
    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);
    const d = w * displacementAmount(sample(px, py, pz, nx, ny, nz), settings);
    position.setXYZ(i, px + nx * d, py + ny * d, pz + nz * d);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** Triangle count and size of a binary STL, read with the same loader users import with. */
function inspectSTL(bytes: Uint8Array) {
  const check = new STLLoader().parse(bytes.slice().buffer);
  check.computeBoundingBox();
  const size =
    check.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3();
  const triangles = check.getAttribute("position").count / 3;
  check.dispose();
  return {
    triangles,
    size: [size.x, size.y, size.z] as [number, number, number],
  };
}

/**
 * Runs the full export and returns the file bytes plus a verification read-back.
 * @param onStep - Called with a short label and 0–1 progress before each step.
 */
export function runExport(
  job: ExportJob,
  onStep: (label: string, progress: number) => void,
): ExportOutput {
  onStep("Preparing mesh", 0.05);
  const baked = new THREE.BufferGeometry();
  baked.setAttribute("position", new THREE.BufferAttribute(job.positions, 3));
  baked.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(...job.placement.offset),
      new THREE.Quaternion(...job.rotation),
      new THREE.Vector3(1, 1, 1),
    ),
  );
  const welded = weld(baked);
  baked.dispose();

  onStep("Subdividing", 0.2);
  const {
    geometry: dense,
    limited,
    parents,
  } = subdivide(welded, job.resolution, job.maxTriangles);
  welded.dispose();

  onStep("Applying texture", 0.5);
  const weights = job.mask
    ? computeVertexWeights(
        dense.getAttribute("position").array,
        dense.index?.array ?? [],
        parents,
        job.mask.faceWeights,
        job.mask.falloff,
        job.mask.curve,
      )
    : undefined;
  displaceGeometry(dense, job.heightmap, job.settings, job.frame, weights);
  const triangles = (dense.index?.count ?? 0) / 3;

  onStep(job.format === "3mf" ? "Writing 3MF" : "Writing STL", 0.75);
  let bytes: Uint8Array;
  if (job.format === "3mf") {
    bytes = write3MF(
      dense.getAttribute("position").array,
      dense.index?.array ?? [],
      job.name,
    );
  } else {
    const view = new STLExporter().parse(new THREE.Mesh(dense), {
      binary: true,
    }) as DataView;
    bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  dense.dispose();

  onStep("Verifying file", 0.9);
  const verified = job.format === "3mf" ? inspect3MF(bytes) : inspectSTL(bytes);
  return { bytes, triangles, limited, verified };
}
