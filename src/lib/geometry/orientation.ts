// Model orientation math: rotations as quaternions and placement on the build plate (Z-up).

import * as THREE from "three";

/** Quaternion as a plain tuple [x, y, z, w] so it can live in history snapshots. */
export type Rotation = [number, number, number, number];
export type Axis = "x" | "y" | "z";

export type Placement = {
  /** Translation that centres the rotated model on X/Y and rests it on Z = 0. */
  offset: [number, number, number];
  /** Rotated bounding-box size [x, y, z]. */
  size: [number, number, number];
};

export const IDENTITY: Rotation = [0, 0, 0, 1];

const AXES: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

const toQuat = (r: Rotation) => new THREE.Quaternion(...r);
const toTuple = (q: THREE.Quaternion): Rotation => [q.x, q.y, q.z, q.w];

/**
 * Rotates the model about a world axis.
 * @param rotation - Current model rotation.
 * @param axis - World axis to rotate around.
 * @param degrees - Angle, positive is counter-clockwise looking down the axis.
 * @returns New rotation (input is not modified).
 */
export function rotateAboutAxis(
  rotation: Rotation,
  axis: Axis,
  degrees: number,
): Rotation {
  const step = new THREE.Quaternion().setFromAxisAngle(
    AXES[axis],
    THREE.MathUtils.degToRad(degrees),
  );
  return toTuple(step.multiply(toQuat(rotation)).normalize());
}

/**
 * Rotation that turns a picked face to point straight down, so it rests on the plate.
 * @param rotation - Current model rotation.
 * @param localNormal - Face normal in the geometry's own (unrotated) space.
 * @returns New rotation with that face facing -Z.
 */
export function placeFaceDown(
  rotation: Rotation,
  localNormal: [number, number, number],
): Rotation {
  const current = toQuat(rotation);
  const worldNormal = new THREE.Vector3(...localNormal)
    .applyQuaternion(current)
    .normalize();
  const align = new THREE.Quaternion().setFromUnitVectors(
    worldNormal,
    new THREE.Vector3(0, 0, -1),
  );
  return toTuple(align.multiply(current).normalize());
}

/**
 * Computes where to put the rotated model so it is centred and sits on the grid.
 * Uses every vertex, so the box is exact for any rotation.
 * @param geometry - Model geometry in its own space.
 * @param rotation - Model rotation.
 * @returns Offset to apply after rotating, and the rotated size.
 */
export function computePlacement(
  geometry: THREE.BufferGeometry,
  rotation: Rotation,
): Placement {
  const position = geometry.getAttribute("position");
  const q = toQuat(rotation);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    box.expandByPoint(v.fromBufferAttribute(position, i).applyQuaternion(q));
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  return {
    offset: [-center.x, -center.y, -box.min.z],
    size: [size.x, size.y, size.z],
  };
}
