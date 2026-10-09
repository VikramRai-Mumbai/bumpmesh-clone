// Runs one job in a fresh geometry worker; cancelling terminates the worker immediately.

import type { WorkerMessage, WorkerRequest } from "@/workers/geometry.worker";

export type WorkerTask<T> = {
  promise: Promise<T>;
  cancel: () => void;
};

/**
 * Starts a worker job.
 * @param request - Job to run (data is copied to the worker).
 * @param done - Picks the final message type to resolve with.
 * @param onProgress - Optional progress callback (label, 0–1).
 */
export function runWorkerTask<T extends WorkerMessage["type"]>(
  request: WorkerRequest,
  done: T,
  onProgress?: (label: string, progress: number) => void,
): WorkerTask<Extract<WorkerMessage, { type: T }>> {
  const worker = new Worker(
    new URL("../workers/geometry.worker.ts", import.meta.url),
    { type: "module" },
  );
  let reject: (reason: Error) => void = () => {};

  const promise = new Promise<Extract<WorkerMessage, { type: T }>>(
    (resolve, rejectPromise) => {
      reject = rejectPromise;
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data;
        if (message.type === "progress") {
          onProgress?.(message.label, message.progress);
        } else if (message.type === "error") {
          worker.terminate();
          rejectPromise(new Error(message.message));
        } else if (message.type === done) {
          worker.terminate();
          resolve(message as Extract<WorkerMessage, { type: T }>);
        }
      };
      worker.onerror = (event) => {
        worker.terminate();
        rejectPromise(new Error(event.message || "Geometry worker crashed"));
      };
      worker.postMessage(request);
    },
  );

  return {
    promise,
    cancel: () => {
      worker.terminate();
      reject(new CancelledError());
    },
  };
}

/** Thrown when a task is cancelled by the user. */
export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}
