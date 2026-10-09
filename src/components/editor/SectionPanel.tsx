"use client";

// Floating Section View controls over the viewport: cut axis, position and flip.

import { Button } from "@/components/ui/Button";
import { useEditorStore } from "@/store/editor-store";

const AXES = ["x", "y", "z"] as const;

/** Cuts the model open so inner surfaces can be inspected and masked. */
export default function SectionPanel() {
  const section = useEditorStore((s) => s.section);
  const setSection = useEditorStore((s) => s.setSection);

  return (
    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-line bg-panel/95 px-3 py-2 text-xs shadow-md">
      <span className="font-medium text-muted">Section</span>
      <div className="flex gap-1">
        {AXES.map((axis) => (
          <Button
            key={axis}
            size="sm"
            aria-pressed={section.axis === axis}
            title={`Cut perpendicular to the ${axis.toUpperCase()} axis`}
            className={`w-7 px-0 uppercase ${section.axis === axis ? "border-accent bg-accent-soft text-accent" : ""}`}
            onClick={() => setSection({ axis })}
          >
            {axis}
          </Button>
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.005}
        value={section.position}
        aria-label="Cut position"
        onChange={(e) => setSection({ position: Number(e.target.value) })}
        className="w-40"
      />
      <Button
        size="sm"
        aria-pressed={section.flip}
        onClick={() => setSection({ flip: !section.flip })}
      >
        Flip
      </Button>
    </div>
  );
}
