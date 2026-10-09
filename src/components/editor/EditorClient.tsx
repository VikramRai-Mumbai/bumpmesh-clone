"use client";

// Client-only wrapper so the WebGL editor is never rendered on the server.

import dynamic from "next/dynamic";
import EditorErrorBoundary from "./EditorErrorBoundary";

// Load the WebGL editor only in the browser; three.js needs `window` and a canvas.
const TextureEditor = dynamic(() => import("./TextureEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center">
      <p>Loading 3D Editor...</p>
    </div>
  ),
});

// Client boundary that the server-rendered page mounts; crashes show a recovery screen.
export default function EditorClient() {
  return (
    <EditorErrorBoundary>
      <TextureEditor />
    </EditorErrorBoundary>
  );
}
