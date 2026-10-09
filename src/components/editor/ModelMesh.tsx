"use client";

// The model in the viewport: textured display mesh, an invisible BVH-accelerated pick
// mesh for Place on Face and the masking tools, mask attributes and the brush cursor.

import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { acceleratedRaycast, MeshBVH } from "three-mesh-bvh";
import { floodFill } from "@/lib/mask/fill";
import {
  computeFaceWeights,
  computeVertexWeights,
  isMaskEmpty,
  isPainted,
  type MaskSettings,
} from "@/lib/mask/mask";
import { projectionFrame } from "@/lib/texture/triplanar";
import { runWorkerTask } from "@/lib/worker-client";
import {
  useEditorStore,
  useMaskSettings,
  useTextureSettings,
} from "@/store/editor-store";
import { useTexturedMaterial } from "./useTexturedMaterial";

/** Triangle budget for the live 3D preview (export can go much higher). */
const PREVIEW_MAX_TRIANGLES = 400_000;
const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;
const noRaycast = () => null;

type Hit = {
  face: number;
  /** World-space hit point and face normal. */
  point: THREE.Vector3;
  normal: THREE.Vector3;
  /** Hit point in the mesh's own space (for BVH queries). */
  local: THREE.Vector3;
};

/**
 * Section View cut as a world-space clipping plane, or null when off.
 * Keeps the part of the model below `position` on the chosen axis (or above, if flipped).
 */
export function useSectionPlane(): THREE.Plane | null {
  const { enabled, axis, position, flip } = useEditorStore((s) => s.section);
  const size = useEditorStore((s) => s.placement.size);
  return useMemo(() => {
    if (!enabled) return null;
    const i = AXIS_INDEX[axis];
    // The placed model spans [-size/2, size/2] on X/Y and [0, size] on Z.
    const min = i === 2 ? 0 : -size[i] / 2;
    const cut = min + position * size[i];
    const normal = new THREE.Vector3().setComponent(i, flip ? 1 : -1);
    return new THREE.Plane(normal, flip ? -cut : cut);
  }, [enabled, axis, position, flip, size]);
}

/**
 * Adds `aMask` (1 = textured) and `aPaint` (1 = tinted) attributes the material reads.
 * Created up front with neutral values so the shader never reads a missing attribute.
 */
function ensureMaskAttributes(geometry: THREE.BufferGeometry) {
  const count = geometry.getAttribute("position").count;
  if (!geometry.getAttribute("aMask")) {
    geometry.setAttribute(
      "aMask",
      new THREE.BufferAttribute(new Float32Array(count).fill(1), 1),
    );
  }
  if (!geometry.getAttribute("aPaint")) {
    geometry.setAttribute(
      "aPaint",
      new THREE.BufferAttribute(new Float32Array(count), 1),
    );
  }
}

/** Writes per-face weight and paint state into the (non-indexed) model's attributes. */
function writeFaceAttributes(
  geometry: THREE.BufferGeometry,
  faceWeights: Float32Array | null,
  mask: MaskSettings,
) {
  const maskAttr = geometry.getAttribute("aMask") as THREE.BufferAttribute;
  const paintAttr = geometry.getAttribute("aPaint") as THREE.BufferAttribute;
  const m = maskAttr.array as Float32Array;
  const p = paintAttr.array as Float32Array;
  const faces = m.length / 3;
  for (let f = 0; f < faces; f++) {
    const w = faceWeights ? faceWeights[f] : 1;
    const painted = isPainted(mask.paint, f) ? 1 : 0;
    m[f * 3] = m[f * 3 + 1] = m[f * 3 + 2] = w;
    p[f * 3] = p[f * 3 + 1] = p[f * 3 + 2] = painted;
  }
  maskAttr.needsUpdate = true;
  paintAttr.needsUpdate = true;
}

/**
 * Welded, subdivided copy of the model for 3D Preview (so vertices can move on the GPU
 * without cracks), with the parent face of each triangle. Built in the geometry worker so
 * the page stays responsive; null while off or still being prepared.
 */
function usePreviewGeometry(
  geometry: THREE.BufferGeometry | null,
  enabled: boolean,
  resolution: number,
) {
  const [preview, setPreview] = useState<{
    geometry: THREE.BufferGeometry;
    parents: Uint32Array;
  } | null>(null);
  const setBusy = useEditorStore((s) => s.setPreviewBusy);

  useEffect(() => {
    setPreview(null);
    if (!geometry || !enabled) return;
    setBusy(true);
    const task = runWorkerTask(
      {
        type: "preview",
        job: {
          positions: (
            geometry.getAttribute("position").array as Float32Array
          ).slice(),
          resolution,
          maxTriangles: PREVIEW_MAX_TRIANGLES,
        },
      },
      "preview-done",
    );
    let built: THREE.BufferGeometry | null = null;
    task.promise
      .then(({ positions, index, parents }) => {
        built = new THREE.BufferGeometry();
        built.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        built.setIndex(new THREE.BufferAttribute(index, 1));
        built.computeVertexNormals();
        ensureMaskAttributes(built);
        setPreview({ geometry: built, parents });
      })
      .catch(() => {
        // Cancelled because settings changed, or the worker failed: keep the bump preview.
      })
      .finally(() => setBusy(false));
    return () => {
      task.cancel();
      built?.dispose();
    };
  }, [geometry, enabled, resolution, setBusy]);

  return preview;
}

/**
 * The model, rotated by the current document and moved to sit on the plate.
 * Interaction happens on an invisible copy of the original mesh (face numbers match the
 * mask); the visible mesh is the original or, with 3D Preview, a subdivided copy.
 */
export default function ModelMesh() {
  const geometry = useEditorStore((s) => s.geometry);
  const rotation = useEditorStore((s) => s.history.present.rotation);
  const committedMask = useEditorStore((s) => s.history.present.mask);
  const offset = useEditorStore((s) => s.placement.offset);
  const wireframe = useEditorStore((s) => s.wireframe);
  const picking = useEditorStore((s) => s.picking);
  const preview3d = useEditorStore((s) => s.preview3d);
  const resolution = useEditorStore((s) => s.exportSettings.resolution);
  const tool = useEditorStore((s) => s.maskTool);
  const brushShape = useEditorStore((s) => s.brushShape);
  const brushSize = useEditorStore((s) => s.brushSize);
  const settings = useTextureSettings();
  const mask = useMaskSettings();
  const clipPlane = useSectionPlane();
  const size = useEditorStore((s) => s.placement.size);
  const frame = useMemo(
    () => projectionFrame(settings, size),
    [settings, size],
  );

  const [hovered, setHovered] = useState<number[] | null>(null);
  const [cursor, setCursor] = useState<Hit | null>(null);
  const stroking = useRef(false);
  const pickMesh = useRef<THREE.Mesh>(null);

  // Build the BVH once per model (indirect mode keeps triangle order = mask numbering).
  const bvh = useMemo(() => {
    if (!geometry) return null;
    ensureMaskAttributes(geometry);
    const tree = new MeshBVH(geometry, { indirect: true });
    // drei bundles its own copy of three-mesh-bvh whose typings claim `boundsTree`;
    // the runtime object is the same kind of BVH.
    geometry.boundsTree = tree as unknown as typeof geometry.boundsTree;
    return tree;
  }, [geometry]);
  const hiddenMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ visible: false }),
    [],
  );

  // Mask weights per original face (null = nothing masked).
  const faceWeights = useMemo(
    () =>
      geometry && !isMaskEmpty(mask)
        ? computeFaceWeights(geometry, rotation, mask)
        : null,
    [geometry, rotation, mask],
  );
  useEffect(() => {
    if (geometry) writeFaceAttributes(geometry, faceWeights, mask);
  }, [geometry, faceWeights, mask]);

  // 3D Preview: per-vertex weights with falloff, from the committed mask (not mid-stroke).
  const preview = usePreviewGeometry(geometry, preview3d, resolution);
  useEffect(() => {
    if (!preview || !geometry) return;
    const { geometry: dense, parents } = preview;
    const weights = isMaskEmpty(committedMask)
      ? new Float32Array(dense.getAttribute("position").count).fill(1)
      : computeVertexWeights(
          dense.getAttribute("position").array,
          dense.index?.array ?? [],
          parents,
          computeFaceWeights(geometry, rotation, committedMask),
          committedMask.falloff,
          committedMask.curve,
        );
    const maskAttr = dense.getAttribute("aMask") as THREE.BufferAttribute;
    (maskAttr.array as Float32Array).set(weights);
    maskAttr.needsUpdate = true;

    // Tint vertices that belong to a painted original face.
    const paintAttr = dense.getAttribute("aPaint") as THREE.BufferAttribute;
    const tint = paintAttr.array as Float32Array;
    const index = dense.index?.array ?? [];
    tint.fill(0);
    for (let t = 0; t < parents.length; t++) {
      if (!isPainted(committedMask.paint, parents[t])) continue;
      tint[index[t * 3]] = tint[index[t * 3 + 1]] = tint[index[t * 3 + 2]] = 1;
    }
    paintAttr.needsUpdate = true;
  }, [preview, geometry, rotation, committedMask]);

  const shown = preview?.geometry ?? geometry;
  const material = useTexturedMaterial({
    settings,
    wireframe,
    displace: preview !== null,
    clipPlane,
    frame,
  });

  // Animation targets for the rotation / placement easing.
  const placed = useRef<THREE.Group>(null);
  const rotated = useRef<THREE.Group>(null);
  const shownGeometry = useRef<THREE.BufferGeometry | null>(null);
  const targetQuat = useRef(new THREE.Quaternion());
  const targetPos = useRef(new THREE.Vector3());

  // Eases the model toward its new rotation and position so turns are visible,
  // even on symmetric models like the sample cube. A newly loaded model snaps into place.
  useFrame((_, delta) => {
    if (!placed.current || !rotated.current) return;
    targetQuat.current.fromArray(rotation);
    targetPos.current.fromArray(offset);

    if (shownGeometry.current !== geometry) {
      shownGeometry.current = geometry;
      rotated.current.quaternion.copy(targetQuat.current);
      placed.current.position.copy(targetPos.current);
      return;
    }

    const t = 1 - Math.exp(-delta * 14);
    rotated.current.quaternion.slerp(targetQuat.current, t);
    placed.current.position.lerp(targetPos.current, t);
  });

  // A stroke released outside the model still ends cleanly.
  useEffect(() => {
    const end = () => {
      if (!stroking.current) return;
      stroking.current = false;
      useEditorStore.getState().endStroke();
    };
    window.addEventListener("pointerup", end);
    return () => window.removeEventListener("pointerup", end);
  }, []);

  if (!geometry || !shown) return null;

  /** Nearest hit on the pick mesh that is not cut away by Section View. */
  function visibleHit(
    event: ThreeEvent<PointerEvent | MouseEvent>,
  ): Hit | null {
    const hit = event.intersections.find(
      (i) =>
        i.object === pickMesh.current &&
        i.face &&
        i.faceIndex != null &&
        (!clipPlane || clipPlane.distanceToPoint(i.point) >= 0),
    );
    if (hit?.faceIndex == null || !hit.face || !pickMesh.current) return null;
    const normal = hit.face.normal
      .clone()
      .transformDirection(pickMesh.current.matrixWorld);
    return {
      face: hit.faceIndex,
      point: hit.point.clone(),
      normal,
      local: pickMesh.current.worldToLocal(hit.point.clone()),
    };
  }

  /** Local-space vertices of one triangle, for the hover highlight. */
  function triangleOf(face: number) {
    const pos = geometry?.getAttribute("position");
    if (!pos) return null;
    return [0, 1, 2].flatMap((k) => [
      pos.getX(face * 3 + k),
      pos.getY(face * 3 + k),
      pos.getZ(face * 3 + k),
    ]);
  }

  /** Faces under the brush: one triangle, or every triangle within the radius. */
  function facesUnderBrush(hit: Hit): number[] {
    if (brushShape === "single" || !bvh) return [hit.face];
    const sphere = new THREE.Sphere(hit.local, brushSize);
    const target = new THREE.Vector3();
    const faces: number[] = [];
    bvh.shapecast({
      intersectsBounds: (box) => sphere.intersectsBox(box),
      intersectsTriangle: (tri, i) => {
        tri.closestPointToPoint(sphere.center, target);
        if (target.distanceTo(sphere.center) <= sphere.radius) {
          // In indirect mode the callback already receives the geometry triangle index.
          faces.push(i);
        }
      },
    });
    return faces;
  }

  function handleMove(event: ThreeEvent<PointerEvent>) {
    if (!picking && tool === "none") return;
    const hit = visibleHit(event);
    event.stopPropagation();
    if (!hit) return;
    if (picking || (tool === "brush" && brushShape === "single")) {
      setHovered(triangleOf(hit.face));
    }
    if (tool === "brush") {
      setCursor(hit);
      if (stroking.current) {
        const s = useEditorStore.getState();
        s.paintFaces(facesUnderBrush(hit), !(s.erase || event.shiftKey));
      }
    }
  }

  function handleDown(event: ThreeEvent<PointerEvent>) {
    if (tool === "none" || event.button !== 0 || event.altKey) return;
    const hit = visibleHit(event);
    if (!hit) return;
    event.stopPropagation();
    const s = useEditorStore.getState();
    const on = !(s.erase || event.shiftKey);
    if (tool === "fill") {
      s.fillFaces(
        floodFill(geometry as THREE.BufferGeometry, hit.face, s.fillAngle),
        on,
      );
      return;
    }
    stroking.current = true;
    s.beginStroke();
    s.paintFaces(facesUnderBrush(hit), on);
  }

  // Places the clicked face on the plate (face.normal is in the mesh's local space).
  function handleClick(event: ThreeEvent<MouseEvent>) {
    if (!picking) return;
    const hit = event.intersections.find((i) => i.object === pickMesh.current);
    if (!hit?.face) return;
    event.stopPropagation();
    const { x, y, z } = hit.face.normal;
    useEditorStore.getState().placeOnFace([x, y, z]);
    setHovered(null);
  }

  function handleOut() {
    setHovered(null);
    setCursor(null);
  }

  return (
    <>
      <group ref={placed}>
        <group ref={rotated}>
          <mesh geometry={shown} material={material} raycast={noRaycast} />

          {/* biome-ignore lint/a11y/noStaticElementInteractions: three.js mesh, not a DOM element */}
          <mesh
            ref={pickMesh}
            geometry={geometry}
            material={hiddenMaterial}
            raycast={acceleratedRaycast}
            onPointerMove={handleMove}
            onPointerDown={handleDown}
            onPointerOut={handleOut}
            onClick={handleClick}
          />

          {hovered && (picking || tool === "brush") && (
            <mesh key={hovered.join()} raycast={noRaycast}>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[new Float32Array(hovered), 3]}
                />
              </bufferGeometry>
              <meshBasicMaterial
                color="#5b50e6"
                side={THREE.DoubleSide}
                transparent
                opacity={0.75}
                polygonOffset
                polygonOffsetFactor={-2}
              />
            </mesh>
          )}
        </group>
      </group>

      {tool === "brush" && brushShape === "circle" && cursor && (
        <BrushCursor
          point={cursor.point}
          normal={cursor.normal}
          radius={brushSize}
        />
      )}
    </>
  );
}

/** Ring showing the circle brush size, lying on the surface under the pointer. */
function BrushCursor({
  point,
  normal,
  radius,
}: Readonly<{ point: THREE.Vector3; normal: THREE.Vector3; radius: number }>) {
  const quaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        normal,
      ),
    [normal],
  );
  const position = useMemo(
    () => point.clone().addScaledVector(normal, 0.05),
    [point, normal],
  );
  return (
    <mesh position={position} quaternion={quaternion} raycast={noRaycast}>
      <ringGeometry args={[radius * 0.9, radius, 48]} />
      <meshBasicMaterial
        color="#5b50e6"
        transparent
        opacity={0.85}
        depthTest={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
