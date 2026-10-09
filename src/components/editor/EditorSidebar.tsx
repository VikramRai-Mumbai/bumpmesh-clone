"use client";

// Settings sidebar: model actions (load, place on face, rotate), texture settings and
// export. The texture gallery replaces the sidebar content while it is open.

import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  ChevronIcon,
  LayersIcon,
  PlaceIcon,
  RotateIcon,
} from "@/components/ui/icons";
import type { Rotation } from "@/lib/geometry/orientation";
import type { ModelUnits } from "@/lib/geometry/stl-loader";
import { useEditorStore } from "@/store/editor-store";
import ExportSection from "./ExportSection";
import TextureGallery from "./TextureGallery";
import TextureSettingsPanel from "./TextureSettingsPanel";

type Props = Readonly<{
  onOpenFile: () => void;
}>;

/**
 * Right settings panel. Collapses to a thin strip with an arrow button.
 * @param onOpenFile - Opens the model file picker (owned by TextureEditor).
 */
export default function EditorSidebar({ onOpenFile }: Props) {
  const open = useEditorStore((s) => s.sidebarOpen);
  const setOpen = useEditorStore((s) => s.setSidebarOpen);
  const gallery = useEditorStore((s) => s.galleryOpen);

  return (
    <div className="relative flex h-full shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        title={open ? "Collapse sidebar" : "Expand sidebar"}
        className="absolute top-1/2 -left-5 z-10 flex h-10 w-5 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-line bg-panel text-muted hover:text-fg"
      >
        <ChevronIcon left={!open} />
      </button>

      {open && (
        <aside className="h-full w-96 overflow-y-auto border-l border-line bg-panel">
          {gallery ? (
            <TextureGallery />
          ) : (
            <>
              <ModelActions onOpenFile={onOpenFile} />
              <TextureSettingsPanel />
              <ExportSection />
            </>
          )}
        </aside>
      )}
    </div>
  );
}

/** Load / Place on Face / Rotate row with the privacy note, loading state and errors. */
function ModelActions({ onOpenFile }: Props) {
  const loading = useEditorStore((s) => s.loading);
  const error = useEditorStore((s) => s.error);
  const notice = useEditorStore((s) => s.notice);
  const setNotice = useEditorStore((s) => s.setNotice);
  const picking = useEditorStore((s) => s.picking);
  const setPicking = useEditorStore((s) => s.setPicking);
  const [rotateOpen, setRotateOpen] = useState(false);

  return (
    <div className="border-b border-line px-4 pt-4 pb-3">
      <div className="flex gap-1.5">
        <Button
          size="sm"
          className="h-8 flex-1"
          onClick={onOpenFile}
          disabled={loading}
        >
          <LayersIcon />
          {loading ? "Loading..." : "Load Model..."}
        </Button>
        <Button
          size="sm"
          className={`h-8 ${picking ? "border-accent bg-accent-soft" : ""}`}
          aria-pressed={picking}
          title="Click a face of the model to rest it on the build plate (Esc to cancel)"
          onClick={() => setPicking(!picking)}
        >
          <PlaceIcon />
          Place on Face
        </Button>
        <Button
          size="sm"
          className={`h-8 ${rotateOpen ? "bg-subtle" : ""}`}
          aria-expanded={rotateOpen}
          onClick={() => setRotateOpen(!rotateOpen)}
        >
          <RotateIcon />
          Rotate
        </Button>
      </div>

      {rotateOpen && <RotateControls />}

      {picking && (
        <p className="mt-2 rounded-md bg-accent-soft px-2 py-1.5 text-[11px] text-accent">
          Click a face on the model to place it down. Press Esc to cancel.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {notice && (
        <p className="mt-2 flex items-start justify-between gap-2 text-xs text-green-600">
          {notice}
          <button
            type="button"
            aria-label="Dismiss"
            className="text-muted hover:text-fg"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </p>
      )}

      <UnitsRow />

      <p className="mt-2 text-center text-[11px] text-muted">
        All processing runs locally in your browser. No data is uploaded.
      </p>
    </div>
  );
}

const UNITS: { value: ModelUnits; label: string; title: string }[] = [
  { value: "mm", label: "mm", title: "File coordinates are millimetres" },
  { value: "cm", label: "cm", title: "File coordinates are centimetres (×10)" },
  { value: "m", label: "m", title: "File coordinates are metres (×1000)" },
  { value: "in", label: "in", title: "File coordinates are inches (×25.4)" },
];

/**
 * Model units: STL files carry no units, so this sets how file coordinates are read.
 * Changing it rescales the model; settings and the painted mask are kept.
 */
function UnitsRow() {
  const units = useEditorStore((s) => s.modelUnits);
  const setUnits = useEditorStore((s) => s.setModelUnits);
  const hasModel = useEditorStore((s) => s.geometry !== null);

  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      <span
        className="text-muted"
        title="STL files have no units; choose how to read this file"
      >
        Model units
      </span>
      <div className="flex flex-1 rounded-md border border-line p-0.5">
        {UNITS.map((u) => (
          <button
            key={u.value}
            type="button"
            title={u.title}
            disabled={!hasModel}
            aria-pressed={units === u.value}
            onClick={() => setUnits(u.value)}
            className={`flex-1 rounded px-2 py-0.5 ${units === u.value ? "bg-accent text-white" : "text-fg hover:bg-subtle"}`}
          >
            {u.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const AXES = ["X", "Y", "Z"] as const;
const ZERO = ["0", "0", "0"];

/**
 * Reference-style rotate row: one degree field per axis, Apply and Reset.
 * The fields hold the total rotation applied from this panel: Apply turns the model from
 * where it was before the first Apply, so editing Z after applying X only adds the Z turn.
 * Apply stays disabled until a value changes. If the model is moved another way (undo,
 * redo, Place on Face, header reset) the fields clear, so they always match the model.
 * Reset clears the fields and restores the original orientation. Enter also applies.
 */
function RotateControls() {
  const rotateBy = useEditorStore((s) => s.rotateBy);
  const resetRotation = useEditorStore((s) => s.resetRotation);
  const rotation = useEditorStore((s) => s.history.present.rotation);
  const [values, setValues] = useState(ZERO);
  // Orientation before the first Apply, plus the values and result of the last Apply.
  const [applied, setApplied] = useState<{
    base: Rotation;
    values: string[];
    result: Rotation;
  } | null>(null);

  // Clear the fields when something other than this panel changes the orientation.
  useEffect(() => {
    if (applied && applied.result !== rotation) {
      setValues(ZERO);
      setApplied(null);
    }
  }, [applied, rotation]);

  const degrees = values.map((v) => Number(v) || 0) as [number, number, number];
  const canApply = applied
    ? values.some((v, i) => v !== applied.values[i])
    : degrees.some((d) => d !== 0);

  function apply(event: FormEvent) {
    event.preventDefault();
    if (!canApply) return;
    const base = applied ? applied.base : rotation;
    rotateBy(degrees, base);
    setApplied({
      base,
      values,
      result: useEditorStore.getState().history.present.rotation,
    });
  }

  function reset() {
    resetRotation();
    setValues(ZERO);
    setApplied(null);
  }

  return (
    <form onSubmit={apply} className="mt-2 flex items-center gap-1.5">
      {AXES.map((axis, i) => (
        <label key={axis} className="flex items-center gap-1">
          <span className="min-w-4 text-[11px] font-semibold text-muted">
            {axis}°
          </span>
          <input
            type="number"
            step={1}
            value={values[i]}
            onChange={(e) =>
              setValues(values.map((v, j) => (j === i ? e.target.value : v)))
            }
            onFocus={(e) => e.target.select()}
            aria-label={`Rotate ${axis} degrees`}
            className="h-7 w-13 rounded border border-line bg-panel px-1.5 text-right text-[11px] text-fg"
          />
        </label>
      ))}
      <Button
        type="submit"
        size="sm"
        className="ml-auto h-7 px-2 text-[11px]"
        disabled={!canApply}
      >
        Apply
      </Button>
      <Button
        size="sm"
        className="h-7 px-2 text-[11px]"
        onClick={reset}
        title="Clear the fields and restore the original orientation"
      >
        Reset
      </Button>
    </form>
  );
}
