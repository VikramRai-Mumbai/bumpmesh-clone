"use client";

// Export section: resolution, triangle budget and estimate, Export STL / 3MF with
// progress and Cancel (runs in a worker), and the verification read back from the file.

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { InfoTip, Select, Slider } from "@/components/ui/Field";
import { Section } from "@/components/ui/Section";
import { estimateTriangles } from "@/lib/geometry/mesh-ops";
import { useEditorStore } from "@/store/editor-store";

const BUDGETS = [500_000, 1_000_000, 2_000_000, 4_000_000];
const fmt = (n: number) => n.toLocaleString();

/** Export controls and status; the pipeline itself lives in the store / lib. */
export default function ExportSection() {
  const geometry = useEditorStore((s) => s.geometry);
  const settings = useEditorStore((s) => s.exportSettings);
  const setSettings = useEditorStore((s) => s.setExportSettings);
  const state = useEditorStore((s) => s.exportState);
  const exportModel = useEditorStore((s) => s.exportModel);
  const cancelExport = useEditorStore((s) => s.cancelExport);
  const running = state.status === "running";

  const estimate = useMemo(
    () =>
      geometry
        ? estimateTriangles(
            geometry,
            settings.resolution,
            settings.maxTriangles,
          )
        : 0,
    [geometry, settings.resolution, settings.maxTriangles],
  );

  return (
    <Section title="Export">
      <Slider
        label={
          <>
            Resolution (mm)
            <InfoTip text="Longest edge allowed after subdivision. Smaller values capture more texture detail but produce larger files." />
          </>
        }
        min={0.1}
        max={2}
        step={0.05}
        value={settings.resolution}
        onCommit={(resolution) => setSettings({ resolution })}
      />
      <Select
        label="Max triangles"
        value={String(settings.maxTriangles)}
        options={BUDGETS.map((n) => ({ value: String(n), label: fmt(n) }))}
        onChange={(v) => setSettings({ maxTriangles: Number(v) })}
      />
      <p className="text-xs text-muted">
        Output triangles: ≈ {fmt(estimate)}
        {estimate >= settings.maxTriangles && " (limited by Max triangles)"}
      </p>

      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          disabled={!geometry || running}
          onClick={() => void exportModel("stl")}
        >
          Export STL
        </Button>
        <Button
          className="flex-1"
          disabled={!geometry || running}
          title="3MF keeps millimetre units and is smaller than STL"
          onClick={() => void exportModel("3mf")}
        >
          Export 3MF
        </Button>
      </div>

      {state.status === "running" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-accent">
            <span>{state.step}...</span>
            <button
              type="button"
              onClick={cancelExport}
              className="text-muted underline hover:text-fg"
            >
              Cancel
            </button>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${Math.round(state.progress * 100)}%` }}
            />
          </div>
        </div>
      )}
      {state.status === "error" && (
        <p className="text-xs text-red-500">{state.message}</p>
      )}
      {state.status === "done" && (
        <div className="rounded-md bg-subtle p-2 text-[11px] text-muted">
          <p className="font-medium text-fg">Saved {state.fileName}</p>
          <p>
            Verified: {fmt(state.verified.triangles)} triangles ·{" "}
            {state.verified.size.map((v) => v.toFixed(2)).join(" × ")} mm
          </p>
          {state.limited && (
            <p className="text-amber-600">
              Triangle limit reached before the target resolution; raise Max
              triangles for finer detail.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
