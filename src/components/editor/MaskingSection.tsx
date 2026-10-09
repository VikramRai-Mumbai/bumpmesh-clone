"use client";

// Masking section: angle masking, painted surface masking (brush / bucket fill) and the
// smooth edge fade. Option sliders preview live and commit one undo step on release.

import type { ReactNode } from "react";
import { Button, SoonBadge } from "@/components/ui/Button";
import { InfoTip, Select, Slider } from "@/components/ui/Field";
import { Section } from "@/components/ui/Section";
import {
  countPainted,
  type FalloffCurve,
  type MaskMode,
} from "@/lib/mask/mask";
import {
  type MaskOptions,
  type MaskTool,
  useEditorStore,
  useMaskSettings,
} from "@/store/editor-store";

type NumberOption = "topAngle" | "bottomAngle" | "falloff";

/** Binds a numeric mask option to a Slider: live preview while dragging, commit on release. */
function useMaskNumber(key: NumberOption) {
  const mask = useMaskSettings();
  const previewMask = useEditorStore((s) => s.previewMask);
  const setMask = useEditorStore((s) => s.setMask);
  return {
    value: mask[key],
    onChange: (v: number) => previewMask({ [key]: v } as Partial<MaskOptions>),
    onCommit: (v: number) => setMask({ [key]: v }),
  };
}

/** Two or more mutually exclusive buttons. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: Readonly<{
  value: T;
  options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}>) {
  return (
    <div className="flex rounded-md border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          disabled={o.disabled}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${value === o.value ? "bg-accent text-white" : "text-fg hover:bg-subtle"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** All masking controls. */
export default function MaskingSection() {
  const mask = useMaskSettings();
  const setMask = useEditorStore((s) => s.setMask);
  const clearPaint = useEditorStore((s) => s.clearPaint);
  const tool = useEditorStore((s) => s.maskTool);
  const setTool = useEditorStore((s) => s.setMaskTool);
  const brushShape = useEditorStore((s) => s.brushShape);
  const brushSize = useEditorStore((s) => s.brushSize);
  const fillAngle = useEditorStore((s) => s.fillAngle);
  const erase = useEditorStore((s) => s.erase);
  const setBrush = useEditorStore((s) => s.setBrush);

  const topAngle = useMaskNumber("topAngle");
  const bottomAngle = useMaskNumber("bottomAngle");
  const falloff = useMaskNumber("falloff");
  const painted = countPainted(mask.paint);

  // Clicking the active tool again switches it off.
  const pickTool = (t: MaskTool) => setTool(tool === t ? "none" : t);

  return (
    <Section title="Masking">
      <p className="flex items-center text-[11px] font-medium text-muted">
        Angle masking
        <InfoTip text="0° = no masking. Surfaces within this angle of horizontal will not be textured." />
      </p>
      <Slider label="Top faces (°)" min={0} max={90} step={1} {...topAngle} />
      <Slider
        label="Bottom faces (°)"
        min={0}
        max={90}
        step={1}
        {...bottomAngle}
      />

      <p className="flex items-center pt-1 text-[11px] font-medium text-muted">
        Surface masking
        <InfoTip text="Paint surfaces to control which areas receive texture." />
      </p>
      <Segmented<MaskMode>
        value={mask.mode}
        onChange={(mode) => setMask({ mode })}
        options={[
          {
            value: "exclude",
            label: "Exclude",
            title: "Painted surfaces will not receive texture",
          },
          {
            value: "include",
            label: "Include only",
            title: "Only painted surfaces will receive texture",
          },
        ]}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          className={`flex-1 ${tool === "brush" ? "border-accent bg-accent-soft text-accent" : ""}`}
          aria-pressed={tool === "brush"}
          title="Brush: paint triangles"
          onClick={() => pickTool("brush")}
        >
          Brush
        </Button>
        <Button
          size="sm"
          className={`flex-1 ${tool === "fill" ? "border-accent bg-accent-soft text-accent" : ""}`}
          aria-pressed={tool === "fill"}
          title="Bucket fill: fill connected surface up to the max angle"
          onClick={() => pickTool("fill")}
        >
          Bucket fill
        </Button>
        <Button
          size="sm"
          className={erase ? "border-accent bg-accent-soft text-accent" : ""}
          aria-pressed={erase}
          title="Erase instead of paint (or hold Shift)"
          onClick={() => setBrush({ erase: !erase })}
        >
          Erase
        </Button>
      </div>

      {tool === "brush" && (
        <>
          <Segmented
            value={brushShape}
            onChange={(shape) => setBrush({ brushShape: shape })}
            options={[
              {
                value: "single",
                label: "Single",
                title: "Paint one triangle at a time",
              },
              {
                value: "circle",
                label: "Circle",
                title: "Paint everything inside the circle",
              },
            ]}
          />
          <Segmented
            value="standard"
            onChange={() => {}}
            options={[
              {
                value: "standard",
                label: "Standard",
                title: "Marks every whole triangle the brush touches",
              },
              {
                value: "precision",
                label: (
                  <>
                    Precision <SoonBadge />
                  </>
                ),
                title:
                  "Splits triangles to follow the brush outline: coming soon",
                disabled: true,
              },
            ]}
          />
          {brushShape === "circle" && (
            <Slider
              label="Size (mm)"
              min={0.5}
              max={30}
              step={0.5}
              value={brushSize}
              onCommit={(v) => setBrush({ brushSize: v })}
              onChange={(v) => setBrush({ brushSize: v })}
            />
          )}
          <Slider label="Hardness %" value={100} min={0} max={100} disabled />
        </>
      )}
      {tool === "fill" && (
        <Slider
          label="Max angle (°)"
          min={1}
          max={90}
          step={1}
          value={fillAngle}
          onCommit={(v) => setBrush({ fillAngle: v })}
        />
      )}
      {tool !== "none" && (
        <p className="rounded-md bg-accent-soft px-2 py-1.5 text-[11px] text-accent">
          {tool === "brush" ? "Left-drag to paint" : "Click a surface to fill"}{" "}
          · Shift to erase · Alt + drag to orbit · Esc to finish
        </p>
      )}

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">
          {painted.toLocaleString()} face{painted === 1 ? "" : "s"} painted
        </span>
        <Button size="sm" disabled={painted === 0} onClick={clearPaint}>
          Clear All
        </Button>
      </div>
      {mask.mode === "include" && painted === 0 && (
        <p className="text-[11px] text-amber-600">
          Include only is on but nothing is painted, so no surface gets texture.
        </p>
      )}

      <p className="flex items-center pt-1 text-[11px] font-medium text-muted">
        Smooth mask edge
        <InfoTip text="Gradually reduces texture to zero near masked areas, so textured and smooth regions meet without a step. Shown in 3D Preview and the export." />
      </p>
      <Slider label="Distance (mm)" min={0} max={10} step={0.1} {...falloff} />
      <Select
        label="Curve"
        value={mask.curve}
        onChange={(v) => setMask({ curve: v as FalloffCurve })}
        options={[
          { value: "linear", label: "Linear" },
          { value: "scurve", label: "S-Curve" },
          { value: "ease", label: "Ease-In" },
        ]}
      />
    </Section>
  );
}
