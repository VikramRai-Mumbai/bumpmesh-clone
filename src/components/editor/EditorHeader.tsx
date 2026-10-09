"use client";

// App header: branding on the left, history / project / theme controls on the right.

import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { RedoIcon, ResetIcon, UndoIcon } from "@/components/ui/icons";
import { PROJECT_EXTENSION } from "@/lib/project";
import { type ProjectLoadMode, useEditorStore } from "@/store/editor-store";

/** Project logo: an isometric cube with a textured top face. */
function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true" fill="none">
      <path d="M16 3 28 10 16 17 4 10Z" fill="#6366f1" />
      <path d="M4 10 16 17v12L4 22Z" fill="#4338ca" />
      <path d="M28 10 16 17v12l12-7Z" fill="#312e81" />
      <path
        d="M9 10.5 12 9l3 1.5L18 9l3 1.5L24 9"
        stroke="#e0e7ff"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M8 12.5 11 11l3 1.5L17 11l3 1.5L23 11"
        stroke="#c7d2fe"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Top bar matching the reference layout. Undo/redo/reset drive the shared history in the store;
 * project save/load are shown disabled until Milestone 5.
 */
export default function EditorHeader() {
  const canUndo = useEditorStore((s) => s.history.past.length > 0);
  const canRedo = useEditorStore((s) => s.history.future.length > 0);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const resetDoc = useEditorStore((s) => s.resetDoc);
  const theme = useEditorStore((s) => s.theme);
  const toggleTheme = useEditorStore((s) => s.toggleTheme);
  const saveProject = useEditorStore((s) => s.saveProject);
  const hasModel = useEditorStore((s) => s.geometry !== null);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line bg-panel px-3">
      <div className="flex min-w-0 items-center gap-2">
        <Logo />
        <h1 className="truncate text-[15px] font-semibold">
          3D Texture Studio
        </h1>
        <span className="text-[11px] text-muted">
          v{process.env.NEXT_PUBLIC_APP_VERSION}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <IconButton label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <UndoIcon />
        </IconButton>
        <IconButton
          label="Redo (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={redo}
        >
          <RedoIcon />
        </IconButton>
        <IconButton
          label="Reset settings to defaults"
          onClick={resetDoc}
          className="ml-2"
        >
          <ResetIcon />
        </IconButton>

        <div className="ml-2 hidden items-center gap-1.5 sm:flex">
          <Button
            disabled={!hasModel}
            title={`Save model and settings (${PROJECT_EXTENSION})`}
            onClick={saveProject}
          >
            Save Project
          </Button>
          <LoadProjectMenu />
        </div>

        <Button className="ml-2 min-w-26" onClick={toggleTheme}>
          {theme === "dark" ? "Light Theme" : "Dark Theme"}
        </Button>
      </div>
    </header>
  );
}

const LOAD_OPTIONS: { mode: ProjectLoadMode; label: string; hint: string }[] = [
  {
    mode: "full",
    label: "Model + settings",
    hint: "Replace the current model",
  },
  {
    mode: "settings",
    label: "Settings only",
    hint: "Apply to the current model",
  },
];

/** Load Project button with a small menu choosing what to load, then a file picker. */
function LoadProjectMenu() {
  const loadProject = useEditorStore((s) => s.loadProject);
  const [open, setOpen] = useState(false);
  const mode = useRef<ProjectLoadMode>("full");
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  // Close the menu on any click outside it.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={root} className="relative">
      <Button aria-expanded={open} onClick={() => setOpen(!open)}>
        Load Project
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-line bg-panel p-1 shadow-lg">
          {LOAD_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              className="block w-full rounded px-2.5 py-1.5 text-left hover:bg-subtle"
              onClick={() => {
                mode.current = option.mode;
                setOpen(false);
                input.current?.click();
              }}
            >
              <span className="block text-xs font-medium">{option.label}</span>
              <span className="block text-[11px] text-muted">
                {option.hint}
              </span>
            </button>
          ))}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept={PROJECT_EXTENSION}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void loadProject(file, mode.current);
          e.target.value = "";
        }}
      />
    </div>
  );
}
