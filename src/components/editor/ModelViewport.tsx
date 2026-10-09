"use client";

// 3D viewport: Z-up scene with camera, lights, grid and gizmo around the model,
// camera re-framing, mouse mapping for the masking tools and the Section View panel.

import {
  Bounds,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  useBounds,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import * as THREE from "three";
import { useEditorStore } from "@/store/editor-store";
import DimensionLines from "./DimensionLines";
import ModelMesh from "./ModelMesh";
import SectionPanel from "./SectionPanel";

// STL files and the reference editor use Z as "up".
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const CAMERA_START: [number, number, number] = [150, -150, 120];

const COLORS = {
  light: { background: "#f0f0f5", cell: "#d4d4e0", section: "#a9a9bd" },
  dark: { background: "#1f2026", cell: "#34353f", section: "#4b4c5a" },
};

/**
 * R3F canvas with camera, lights, grid, axis gizmo and the model.
 * Reads everything from the editor store; has no props.
 */
export default function ModelViewport() {
  const perspective = useEditorStore((s) => s.perspective);
  const picking = useEditorStore((s) => s.picking);
  const tool = useEditorStore((s) => s.maskTool);
  const sectionOn = useEditorStore((s) => s.section.enabled);
  const theme = useEditorStore((s) => s.theme);
  const size = useEditorStore((s) => s.placement.size);
  const colors = COLORS[theme];
  const altDown = useAltKey();
  const [webgl] = useState(hasWebGL);
  const [contextLost, setContextLost] = useState(false);
  // While a mask tool is active the left button paints; Alt + left still orbits.
  const leftButton =
    tool !== "none" && !altDown ? (-1 as THREE.MOUSE) : THREE.MOUSE.ROTATE;

  if (!webgl) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-2">
          <p className="text-sm font-semibold">3D graphics are not available</p>
          <p className="text-xs text-muted">
            This editor needs WebGL 2. Turn on hardware acceleration in your
            browser settings, or try a recent version of Chrome, Edge, Firefox
            or Safari.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full"
      style={{
        background: colors.background,
        cursor: picking || tool !== "none" ? "crosshair" : undefined,
      }}
    >
      <Canvas
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
          // If the GPU resets, ask the browser to restore the context and show a notice meanwhile.
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            setContextLost(true);
          });
          gl.domElement.addEventListener("webglcontextrestored", () =>
            setContextLost(false),
          );
        }}
      >
        <color attach="background" args={[colors.background]} />

        {perspective ? (
          <PerspectiveCamera
            makeDefault
            position={CAMERA_START}
            fov={45}
            near={0.1}
            far={100000}
          />
        ) : (
          <OrthographicCamera
            makeDefault
            position={CAMERA_START}
            zoom={4}
            near={-100000}
            far={100000}
          />
        )}

        <ambientLight intensity={1.2} />
        <directionalLight position={[100, -150, 200]} intensity={2} />
        <directionalLight position={[-120, 100, 80]} intensity={0.6} />

        {/* Near/far clipping only suits the perspective camera; it would cut the ortho grid. */}
        <Bounds fit clip={perspective} observe margin={1.4}>
          <FitOnRequest clip={perspective} />
          <ModelMesh />
        </Bounds>

        <DimensionLines size={size} />

        {/* drei's Grid lies in XZ; rotate it onto the XY build plate. */}
        <Grid
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, -0.01]}
          infiniteGrid
          cellSize={10}
          sectionSize={50}
          cellColor={colors.cell}
          sectionColor={colors.section}
          fadeDistance={2000}
        />

        <OrbitControls
          makeDefault
          mouseButtons={{
            LEFT: leftButton,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          }}
        />

        <GizmoHelper alignment="bottom-left" margin={[80, 80]}>
          <GizmoViewport
            axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
            labelColor="white"
          />
        </GizmoHelper>
      </Canvas>
      {sectionOn && <SectionPanel />}
      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-app/80 text-sm">
          Graphics were interrupted. Restoring...
        </div>
      )}
    </div>
  );
}

/**
 * Re-frames the camera whenever the store's `fitRequest` counter changes.
 * Fits to the model's final box (from the placement), not its pose mid-animation.
 */
function FitOnRequest({ clip }: Readonly<{ clip: boolean }>) {
  const bounds = useBounds();
  const fitRequest = useEditorStore((s) => s.fitRequest);

  useEffect(() => {
    if (fitRequest === 0) return;
    const [x, y, z] = useEditorStore.getState().placement.size;
    const box = new THREE.Box3(
      new THREE.Vector3(-x / 2, -y / 2, 0),
      new THREE.Vector3(x / 2, y / 2, z),
    );
    const api = bounds.refresh(box);
    (clip ? api.clip() : api).fit();
  }, [bounds, fitRequest, clip]);

  return null;
}

/** Tracks whether Alt is held, so Alt + drag can orbit while a mask tool is active. */
function useAltKey() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    const update = (e: KeyboardEvent) => setDown(e.altKey);
    const clear = () => setDown(false);
    window.addEventListener("keydown", update);
    window.addEventListener("keyup", update);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", update);
      window.removeEventListener("keyup", update);
      window.removeEventListener("blur", clear);
    };
  }, []);
  return down;
}

/** True if the browser can create a WebGL 2 context. */
function hasWebGL() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}
