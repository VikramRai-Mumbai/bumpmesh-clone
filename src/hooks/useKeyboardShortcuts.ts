"use client";

// Global editor keyboard shortcuts, wired to store actions.

import { useEffect } from "react";
import { useEditorStore } from "@/store/editor-store";

/** True when the key press is meant for a text field, not the editor. */
function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * Registers editor shortcuts on window for the component's lifetime:
 * Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo, Ctrl+O open file, F fit view,
 * W wireframe, Esc cancel Place on Face or leave the mask tool.
 * @param onOpenFile - Opens the model file picker.
 */
export function useKeyboardShortcuts(onOpenFile: () => void) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (isTyping(event.target)) return;
      const store = useEditorStore.getState();
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;

      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
      } else if (mod && key === "y") {
        event.preventDefault();
        store.redo();
      } else if (mod && key === "o") {
        event.preventDefault();
        onOpenFile();
      } else if (!mod && !event.altKey && key === "f") {
        store.requestFit();
      } else if (!mod && !event.altKey && key === "w") {
        store.setWireframe(!store.wireframe);
      } else if (key === "escape") {
        if (store.picking) store.setPicking(false);
        if (store.maskTool !== "none") store.setMaskTool("none");
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onOpenFile]);
}
