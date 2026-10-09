"use client";

// X (red) and Y (green) measurement lines drawn on the build plate around the model,
// with labels printed flat on the plate like the reference editor.

import { Line } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

type Vec3 = [number, number, number];

type Props = Readonly<{
  /** Rotated model size [x, y, z]; the model is centred on X/Y and sits on Z = 0. */
  size: Vec3;
}>;

/**
 * Renders text into a canvas texture so it can lie on the plate as a mesh.
 * @returns The texture and its width/height ratio; disposed when the text changes.
 */
function useTextTexture(text: string, color: string) {
  const result = useMemo(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const font = "600 48px ui-monospace, monospace";
    if (!ctx) return null;
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
    canvas.height = 64;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(text, 8, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return { texture, aspect: canvas.width / canvas.height };
  }, [text, color]);

  useEffect(() => () => result?.texture.dispose(), [result]);
  return result;
}

/** One measurement: main line, end ticks and a flat label beside the line. */
function Dimension({
  from,
  to,
  tick,
  color,
  label,
  textHeight,
}: Readonly<{
  from: Vec3;
  to: Vec3;
  tick: Vec3;
  color: string;
  label: string;
  textHeight: number;
}>) {
  const text = useTextTexture(label, color);
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const labelPos: Vec3 = [
    (from[0] + to[0]) / 2 + tick[0] * 2.2,
    (from[1] + to[1]) / 2 + tick[1] * 2.2,
    0,
  ];
  const ends = [from, to].map(
    (p) =>
      [
        [p[0] - tick[0], p[1] - tick[1], 0],
        [p[0] + tick[0], p[1] + tick[1], 0],
      ] as Vec3[],
  );

  return (
    <group>
      <Line points={[from, to]} color={color} lineWidth={1.5} />
      {ends.map((points) => (
        <Line
          key={points[0].join()}
          points={points}
          color={color}
          lineWidth={1.5}
        />
      ))}
      {text && (
        <mesh position={labelPos} rotation={[0, 0, angle]}>
          <planeGeometry args={[textHeight * text.aspect, textHeight]} />
          <meshBasicMaterial
            map={text.texture}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * Shows the model's footprint: X along the front edge, Y along the right edge.
 * Hidden until a model with a non-zero size is loaded.
 */
export default function DimensionLines({ size }: Props) {
  const [sx, sy] = size;
  if (sx <= 0 && sy <= 0) return null;

  const extent = Math.max(sx, sy);
  const gap = extent * 0.12 + 2;
  const tick = extent * 0.03 + 0.5;
  const textHeight = extent * 0.07 + 1;

  return (
    <group position={[0, 0, 0.02]}>
      <Dimension
        from={[-sx / 2, -sy / 2 - gap, 0]}
        to={[sx / 2, -sy / 2 - gap, 0]}
        tick={[0, -tick, 0]}
        color="#ef4444"
        label={`X: ${sx.toFixed(2)}`}
        textHeight={textHeight}
      />
      <Dimension
        from={[sx / 2 + gap, -sy / 2, 0]}
        to={[sx / 2 + gap, sy / 2, 0]}
        tick={[tick, 0, 0]}
        color="#22c55e"
        label={`Y: ${sy.toFixed(2)}`}
        textHeight={textHeight}
      />
    </group>
  );
}
