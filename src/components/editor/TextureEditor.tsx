"use client";

// Top-level editor layout; owns the file picker and drag-and-drop, and loads models into the store.

import { type DragEvent, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { loadSTL } from "@/lib/geometry/stl-loader";
import { useEditorStore } from "@/store/editor-store";
import EditorHeader from "./EditorHeader";
import EditorSidebar from "./EditorSidebar";
import ModelViewport from "./ModelViewport";
import StatusBar from "./StatusBar";

/**
 * Editor shell: header, viewport, sidebar and status bar.
 * Starts with a 50 mm cube and loads STL files from the picker, Ctrl+O or drag-and-drop.
 */
export default function TextureEditor() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const hasModel = useEditorStore((s) => s.geometry !== null);
  const setModel = useEditorStore((s) => s.setModel);
  const setLoading = useEditorStore((s) => s.setLoading);
  const setError = useEditorStore((s) => s.setError);
  const setNotice = useEditorStore((s) => s.setNotice);

  // Show the sample cube on first load.
  useEffect(() => {
    if (!hasModel) setModel(new THREE.BoxGeometry(50, 50, 50), "Sample Cube");
  }, [hasModel, setModel]);

  const openFilePicker = () => fileInput.current?.click();
  useKeyboardShortcuts(openFilePicker);

  /**
   * Loads an STL and makes it the active model (fresh history, camera refit).
   * Sets the loading flag while parsing and stores any error for the sidebar.
   * @param file - File from the picker or a drop.
   */
  async function handleFile(file: File) {
    setLoading(true);
    setError(null);

    try {
      const { geometry, notes, units } = await loadSTL(file);
      setModel(geometry, file.name, file.size, units);
      setNotice(notes.length ? notes.join(" ") : null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to load model");
    } finally {
      setLoading(false);
    }
  }

  // Accepts the first dropped file; loadSTL validates the extension.
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="flex h-screen flex-col bg-app text-fg">
      <EditorHeader />

      <div className="flex min-h-0 flex-1">
        <main
          className="relative min-w-0 flex-1"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <ModelViewport />
          {dragging && (
            <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/70 text-sm font-medium text-accent">
              Drop an .stl file to load it
            </div>
          )}
        </main>

        <EditorSidebar onOpenFile={openFilePicker} />
      </div>

      <StatusBar />

      <input
        ref={fileInput}
        type="file"
        accept=".stl"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          // Reset so the same file can be selected again.
          event.target.value = "";
        }}
      />
    </div>
  );
}
