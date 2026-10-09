// Web Worker for heavy geometry work, so the page stays responsive:
// "export" runs the full export pipeline; "preview" welds and subdivides for 3D Preview.

import * as THREE from "three";
import { type ExportJob, runExport } from "@/lib/geometry/export-pipeline";
import { subdivide, weld } from "@/lib/geometry/mesh-ops";

export type PreviewJob = {
  positions: Float32Array;
  resolution: number;
  maxTriangles: number;
};

export type WorkerRequest =
  | { type: "export"; job: ExportJob }
  | { type: "preview"; job: PreviewJob };

export type WorkerMessage =
  | { type: "progress"; label: string; progress: number }
  | { type: "error"; message: string }
  | {
      type: "export-done";
      bytes: Uint8Array;
      triangles: number;
      limited: boolean;
      verified: { triangles: number; size: [number, number, number] };
    }
  | {
      type: "preview-done";
      positions: Float32Array;
      index: Uint32Array;
      parents: Uint32Array;
    };

const post = (message: WorkerMessage, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(message, transfer);

/** Welds and subdivides a copy of the model for the GPU 3D Preview. */
function runPreview(job: PreviewJob) {
  const source = new THREE.BufferGeometry();
  source.setAttribute("position", new THREE.BufferAttribute(job.positions, 3));
  const welded = weld(source);
  const { geometry, parents } = subdivide(
    welded,
    job.resolution,
    job.maxTriangles,
  );
  const positions = geometry.getAttribute("position").array as Float32Array;
  const index = Uint32Array.from(geometry.index?.array ?? []);
  post({ type: "preview-done", positions, index, parents }, [
    positions.buffer,
    index.buffer,
    parents.buffer,
  ]);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  try {
    const request = event.data;
    if (request.type === "preview") {
      runPreview(request.job);
      return;
    }
    const out = runExport(request.job, (label, progress) =>
      post({ type: "progress", label, progress }),
    );
    post({ type: "export-done", ...out }, [out.bytes.buffer]);
  } catch (error) {
    post({
      type: "error",
      message:
        error instanceof Error ? error.message : "Geometry worker failed",
    });
  }
};
