"use client";

// Bottom bar: model summary, view toggles and the mouse controls hint.

import { Checkbox } from "@/components/ui/Field";
import { useEditorStore } from "@/store/editor-store";

/** Model info on the left, Wireframe / Perspective toggles in the middle, hint on the right. */
export default function StatusBar() {
  const info = useEditorStore((s) => s.modelInfo);
  const size = useEditorStore((s) => s.placement.size);
  const wireframe = useEditorStore((s) => s.wireframe);
  const setWireframe = useEditorStore((s) => s.setWireframe);
  const perspective = useEditorStore((s) => s.perspective);
  const setPerspective = useEditorStore((s) => s.setPerspective);
  const sectionOn = useEditorStore((s) => s.section.enabled);
  const setSection = useEditorStore((s) => s.setSection);

  return (
    <footer className="flex h-7 shrink-0 items-center gap-5 border-t border-line bg-panel px-3 text-[11px] text-muted">
      {info && (
        <span className="truncate">
          {info.name} · {info.triangles.toLocaleString()} triangles ·{" "}
          {(info.sizeBytes / 1024 / 1024).toFixed(2)} MB ·{" "}
          {size.map((v) => v.toFixed(2)).join(" × ")} mm
        </span>
      )}

      <div className="flex shrink-0 items-center gap-4 text-fg">
        <Checkbox
          label="Wireframe"
          checked={wireframe}
          onChange={setWireframe}
          title="Show mesh edges (W)"
        />
        <Checkbox
          label="Perspective View"
          checked={perspective}
          onChange={setPerspective}
          title="Perspective instead of orthographic camera"
        />
        <Checkbox
          label="Section View"
          checked={sectionOn}
          onChange={(enabled) => setSection({ enabled })}
          title="Cut the model open to check and mask inner surfaces"
        />
      </div>

      <span className="ml-auto hidden shrink-0 md:inline">
        Left drag: orbit · Right drag: pan · Scroll: zoom
      </span>
    </footer>
  );
}
