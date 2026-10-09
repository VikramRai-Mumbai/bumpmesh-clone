// Shared editor state (Zustand): the loaded model, undoable document, view options,
// masking tools, theme and export status.

import * as THREE from "three";
import { create } from "zustand";
import type { ExportFormat } from "@/lib/geometry/export-pipeline";
import {
  type Axis,
  computePlacement,
  IDENTITY,
  type Placement,
  placeFaceDown,
  type Rotation,
  rotateAboutAxis,
} from "@/lib/geometry/orientation";
import {
  getModelInfo,
  type ModelInfo,
  type ModelUnits,
  UNIT_TO_MM,
} from "@/lib/geometry/stl-loader";
import { commit, createHistory, type History, redo, undo } from "@/lib/history";
import {
  clonePaint,
  computeFaceWeights,
  DEFAULT_MASK,
  isMaskEmpty,
  type MaskSettings,
  setPainted,
} from "@/lib/mask/mask";
import { loadProject, PROJECT_EXTENSION, saveProject } from "@/lib/project";
import { imageToHeightmap } from "@/lib/texture/custom-map";
import {
  CUSTOM_TEXTURE_ID,
  getCustomHeightmap,
  getProcessedHeightmap,
  setCustomHeightmap,
} from "@/lib/texture/heightmap";
import {
  DEFAULT_TEXTURE,
  projectionFrame,
  type TextureSettings,
} from "@/lib/texture/triplanar";
import {
  CancelledError,
  runWorkerTask,
  type WorkerTask,
} from "@/lib/worker-client";

/** Everything that undo/redo restores. */
export type EditorDoc = {
  rotation: Rotation;
  texture: TextureSettings;
  mask: MaskSettings;
};

/** Mask settings that sliders and selects change (the painted selection is separate). */
export type MaskOptions = Omit<MaskSettings, "paint">;

export type MaskTool = "none" | "brush" | "fill";
export type BrushShape = "single" | "circle";

export type SectionSettings = {
  enabled: boolean;
  axis: Axis;
  /** Cut position across the model, 0–1. */
  position: number;
  /** Keep the other side of the cut. */
  flip: boolean;
};

export type Theme = "light" | "dark";

export type ExportSettings = {
  /** Target edge length in mm. */
  resolution: number;
  maxTriangles: number;
};

export type ExportState =
  | { status: "idle" }
  | { status: "running"; step: string; progress: number }
  | {
      status: "done";
      fileName: string;
      triangles: number;
      limited: boolean;
      verified: { triangles: number; size: [number, number, number] };
    }
  | { status: "error"; message: string };

/** How Load Project applies a file. */
export type ProjectLoadMode = "full" | "settings";

const INITIAL_DOC: EditorDoc = {
  rotation: IDENTITY,
  texture: DEFAULT_TEXTURE,
  mask: DEFAULT_MASK,
};
const AXES: Axis[] = ["x", "y", "z"];
const EMPTY_PLACEMENT: Placement = { offset: [0, 0, 0], size: [0, 0, 0] };

type EditorStore = {
  geometry: THREE.BufferGeometry | null;
  modelInfo: ModelInfo | null;
  history: History<EditorDoc>;
  /** Derived from geometry + rotation; recomputed whenever either changes. */
  placement: Placement;
  /** Unsaved texture changes while a slider is being dragged (not in history yet). */
  texturePreview: Partial<TextureSettings> | null;
  /** Unsaved mask option changes while a slider is being dragged. */
  maskPreview: Partial<MaskOptions> | null;
  /** Working copy of the painted selection during a brush stroke (replaced, never mutated). */
  paintDraft: Uint8Array | null;

  maskTool: MaskTool;
  brushShape: BrushShape;
  /** Circle brush radius in mm. */
  brushSize: number;
  /** Bucket fill stops at edges sharper than this (degrees). */
  fillAngle: number;
  /** Erase instead of paint (Shift does the same while held). */
  erase: boolean;
  section: SectionSettings;

  loading: boolean;
  error: string | null;

  wireframe: boolean;
  perspective: boolean;
  sidebarOpen: boolean;
  galleryOpen: boolean;
  /** Real geometric displacement in the viewport instead of bump shading. */
  preview3d: boolean;
  /** True while the worker prepares the 3D Preview mesh. */
  previewBusy: boolean;
  /** True while waiting for the user to click a face for "Place on Face". */
  picking: boolean;
  /** Incremented to ask the viewport to re-frame the camera. */
  fitRequest: number;
  theme: Theme;

  exportSettings: ExportSettings;
  exportState: ExportState;
  /** File name of the uploaded custom heightmap, or null. */
  customMapName: string | null;
  /** Short message shown after project load/save (cleared on next action). */
  notice: string | null;

  /** Current model units; the geometry is always stored in millimetres. */
  modelUnits: ModelUnits;
  /**
   * Makes a geometry the active model.
   * @param units - Units of the incoming coordinates; they are scaled to millimetres.
   */
  setModel: (
    geometry: THREE.BufferGeometry,
    name: string,
    sizeBytes?: number,
    units?: ModelUnits,
  ) => void;
  /** Re-interprets the model in other units (rescales it), keeping all settings. */
  setModelUnits: (units: ModelUnits) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  /** Rotates `from` (default: current rotation) by [x, y, z] degrees about the world axes. */
  rotateBy: (degrees: [number, number, number], from?: Rotation) => void;
  placeOnFace: (localNormal: [number, number, number]) => void;
  resetRotation: () => void;
  /** Header reset: orientation and all texture settings back to defaults. */
  resetDoc: () => void;
  /** Commits texture changes as one undo step and clears any live preview. */
  setTexture: (patch: Partial<TextureSettings>) => void;
  /** Shows texture changes live without recording history (slider drag). */
  previewTexture: (patch: Partial<TextureSettings> | null) => void;
  /** Commits mask option changes as one undo step. */
  setMask: (patch: Partial<MaskOptions>) => void;
  previewMask: (patch: Partial<MaskOptions> | null) => void;
  /** Starts a brush stroke on a copy of the painted selection. */
  beginStroke: () => void;
  /** Paints (or erases) faces in the current stroke. */
  paintFaces: (faces: Iterable<number>, on: boolean) => void;
  /** Records the stroke as one undo step. */
  endStroke: () => void;
  /** Paints a set of faces as one undo step (bucket fill). */
  fillFaces: (faces: number[], on: boolean) => void;
  clearPaint: () => void;
  setMaskTool: (tool: MaskTool) => void;
  setBrush: (
    patch: Partial<
      Pick<EditorStore, "brushShape" | "brushSize" | "fillAngle" | "erase">
    >,
  ) => void;
  setSection: (patch: Partial<SectionSettings>) => void;
  undo: () => void;
  redo: () => void;

  setWireframe: (on: boolean) => void;
  setPerspective: (on: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setGalleryOpen: (open: boolean) => void;
  setPreview3d: (on: boolean) => void;
  setPreviewBusy: (busy: boolean) => void;
  setPicking: (on: boolean) => void;
  requestFit: () => void;
  toggleTheme: () => void;

  setExportSettings: (patch: Partial<ExportSettings>) => void;
  /** Runs the export pipeline in a worker and downloads the file. */
  exportModel: (format: ExportFormat) => Promise<void>;
  cancelExport: () => void;

  /** Uses an uploaded image as the texture (one undo step for the texture switch). */
  setCustomMap: (file: File) => Promise<void>;
  removeCustomMap: () => void;

  /** Downloads the current model and all settings as a project file. */
  saveProject: () => void;
  /** Opens a project file: model + settings, or settings only on the current model. */
  loadProject: (file: File, mode: ProjectLoadMode) => Promise<void>;
  setNotice: (notice: string | null) => void;
};

/** The running export, so it can be cancelled. */
let exportTask: WorkerTask<unknown> | null = null;

/** Reads the theme already applied to <html> by the inline script in layout.tsx. */
function initialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** With the U/V lock on, a size change on one axis is copied to the other. */
function linkSizes(
  current: TextureSettings,
  patch: Partial<TextureSettings>,
): Partial<TextureSettings> {
  const locked = patch.lockUV ?? current.lockUV;
  if (!locked) return patch;
  if (patch.sizeU !== undefined) return { ...patch, sizeV: patch.sizeU };
  if (patch.sizeV !== undefined) return { ...patch, sizeU: patch.sizeV };
  if (patch.lockUV) return { ...patch, sizeV: current.sizeU };
  return patch;
}

/** Saves a blob as a file through a temporary link. */
function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Editor store hook. Subscribe to single fields, e.g. `useEditorStore((s) => s.wireframe)`,
 * so a component re-renders only when that field changes.
 */
export const useEditorStore = create<EditorStore>((set, get) => {
  /** Applies a new history; placement is only recomputed when the rotation changed. */
  const applyHistory = (history: History<EditorDoc>) => {
    const { geometry, history: before, placement } = get();
    const rotationChanged =
      history.present.rotation !== before.present.rotation;
    set({
      history,
      texturePreview: null,
      maskPreview: null,
      placement:
        geometry && rotationChanged
          ? computePlacement(geometry, history.present.rotation)
          : geometry
            ? placement
            : EMPTY_PLACEMENT,
    });
  };

  /** Records a document change as one undo step. */
  const change = (update: (doc: EditorDoc) => EditorDoc) => {
    const { history } = get();
    applyHistory(commit(history, update(history.present)));
  };

  return {
    geometry: null,
    modelInfo: null,
    history: createHistory(INITIAL_DOC),
    placement: EMPTY_PLACEMENT,
    texturePreview: null,
    maskPreview: null,
    paintDraft: null,
    maskTool: "none",
    brushShape: "circle",
    brushSize: 3,
    fillAngle: 20,
    erase: false,
    section: { enabled: false, axis: "x", position: 0.5, flip: false },
    loading: false,
    error: null,
    wireframe: false,
    perspective: false,
    sidebarOpen: true,
    galleryOpen: false,
    preview3d: false,
    previewBusy: false,
    picking: false,
    fitRequest: 0,
    theme: initialTheme(),
    exportSettings: { resolution: 0.4, maxTriangles: 2_000_000 },
    exportState: { status: "idle" },
    customMapName: null,
    notice: null,
    modelUnits: "mm",

    // New model: free the old GPU buffers and start a fresh history, keeping texture and
    // mask options but clearing the painted selection. Geometry is stored non-indexed so
    // triangle i is always vertices 3i..3i+2 (the mask relies on that numbering).
    setModel: (input, name, sizeBytes = 0, units = "mm") => {
      const geometry = input.index ? input.toNonIndexed() : input;
      if (geometry !== input) input.dispose();
      const factor = UNIT_TO_MM[units];
      if (factor !== 1) geometry.scale(factor, factor, factor);
      const previous = get().geometry;
      if (previous && previous !== geometry) previous.dispose();
      const { texture, mask } = get().history.present;
      const doc: EditorDoc = {
        rotation: IDENTITY,
        texture,
        mask: { ...mask, paint: new Uint8Array(0) },
      };
      set({
        geometry,
        modelUnits: units,
        modelInfo: getModelInfo(geometry, name, sizeBytes),
        history: createHistory(doc),
        placement: computePlacement(geometry, IDENTITY),
        texturePreview: null,
        maskPreview: null,
        paintDraft: null,
        maskTool: "none",
        picking: false,
        exportState: { status: "idle" },
        fitRequest: get().fitRequest + 1,
      });
    },
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    // Rescales a copy of the model (triangle order is unchanged, so the painted mask
    // still lines up) and keeps the undo history and settings.
    setModelUnits: (units) => {
      const { geometry, modelUnits, history, fitRequest } = get();
      if (!geometry || units === modelUnits) return;
      const ratio = UNIT_TO_MM[units] / UNIT_TO_MM[modelUnits];
      const scaled = geometry.clone().scale(ratio, ratio, ratio);
      geometry.dispose();
      set({
        geometry: scaled,
        modelUnits: units,
        placement: computePlacement(scaled, history.present.rotation),
        exportState: { status: "idle" },
        fitRequest: fitRequest + 1,
        notice: null,
      });
    },

    // Applies X, then Y, then Z (world axes) as a single undo step; zero angles are skipped.
    rotateBy: (degrees, from) => {
      if (!from && degrees.every((d) => d === 0)) return;
      change((doc) => ({
        ...doc,
        rotation: AXES.reduce(
          (r, axis, i) =>
            degrees[i] ? rotateAboutAxis(r, axis, degrees[i]) : r,
          from ?? doc.rotation,
        ),
      }));
      get().requestFit();
    },
    placeOnFace: (localNormal) => {
      change((doc) => ({
        ...doc,
        rotation: placeFaceDown(doc.rotation, localNormal),
      }));
      set({ picking: false });
      get().requestFit();
    },
    resetRotation: () => {
      change((doc) => ({ ...doc, rotation: IDENTITY }));
      get().requestFit();
    },
    resetDoc: () => {
      change(() => INITIAL_DOC);
      get().requestFit();
    },
    setTexture: (patch) =>
      change((doc) => ({
        ...doc,
        texture: { ...doc.texture, ...linkSizes(doc.texture, patch) },
      })),
    previewTexture: (patch) =>
      set({
        texturePreview: patch
          ? linkSizes(get().history.present.texture, patch)
          : null,
      }),
    setMask: (patch) =>
      change((doc) => ({ ...doc, mask: { ...doc.mask, ...patch } })),
    previewMask: (maskPreview) => set({ maskPreview }),

    beginStroke: () => {
      const { geometry, history } = get();
      if (!geometry) return;
      const faces = geometry.getAttribute("position").count / 3;
      set({ paintDraft: clonePaint(history.present.mask.paint, faces) });
    },
    // Each dab makes a new array, so memoised readers (counts, weights) always see changes.
    paintFaces: (faces, on) => {
      const { paintDraft } = get();
      if (!paintDraft) return;
      const next = paintDraft.slice();
      for (const f of faces) setPainted(next, f, on);
      set({ paintDraft: next });
    },
    endStroke: () => {
      const { paintDraft } = get();
      if (!paintDraft) return;
      change((doc) => ({ ...doc, mask: { ...doc.mask, paint: paintDraft } }));
      set({ paintDraft: null });
    },
    fillFaces: (faces, on) => {
      const { geometry, history } = get();
      if (!geometry || faces.length === 0) return;
      const paint = clonePaint(
        history.present.mask.paint,
        geometry.getAttribute("position").count / 3,
      );
      for (const f of faces) setPainted(paint, f, on);
      change((doc) => ({ ...doc, mask: { ...doc.mask, paint } }));
    },
    clearPaint: () =>
      change((doc) => ({
        ...doc,
        mask: { ...doc.mask, paint: new Uint8Array(0) },
      })),
    setMaskTool: (maskTool) => set({ maskTool, picking: false }),
    setBrush: (patch) => set(patch),
    setSection: (patch) => set({ section: { ...get().section, ...patch } }),

    undo: () => applyHistory(undo(get().history)),
    redo: () => applyHistory(redo(get().history)),

    setWireframe: (wireframe) => set({ wireframe }),
    setPerspective: (perspective) => {
      set({ perspective });
      get().requestFit();
    },
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    setGalleryOpen: (galleryOpen) => set({ galleryOpen }),
    setPreview3d: (preview3d) => set({ preview3d }),
    setPreviewBusy: (previewBusy) => set({ previewBusy }),
    setPicking: (picking) =>
      set(picking ? { picking, maskTool: "none" } : { picking }),
    requestFit: () => set({ fitRequest: get().fitRequest + 1 }),

    // Switch theme, update <html> and remember the choice.
    toggleTheme: () => {
      const theme: Theme = get().theme === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", theme === "dark");
      try {
        localStorage.setItem("theme", theme);
      } catch {
        // Storage can be blocked (private mode); the theme still applies for this visit.
      }
      set({ theme });
    },

    setExportSettings: (patch) =>
      set({ exportSettings: { ...get().exportSettings, ...patch } }),

    exportModel: async (format) => {
      const { geometry, modelInfo, history, placement, exportSettings } = get();
      if (!geometry || get().exportState.status === "running") return;
      const { rotation, texture, mask } = history.present;
      const base = (modelInfo?.name ?? "model").replace(/\.stl$/i, "");
      const fileName = `${base}_textured.${format}`;
      set({
        exportState: { status: "running", step: "Starting", progress: 0 },
      });

      try {
        const task = runWorkerTask(
          {
            type: "export",
            job: {
              positions: (
                geometry.getAttribute("position").array as Float32Array
              ).slice(),
              name: base,
              rotation,
              placement,
              heightmap: getProcessedHeightmap(
                texture.textureId,
                texture.invert,
                texture.smoothing,
              ),
              settings: texture,
              frame: projectionFrame(texture, placement.size),
              mask: isMaskEmpty(mask)
                ? null
                : {
                    faceWeights: computeFaceWeights(geometry, rotation, mask),
                    falloff: mask.falloff,
                    curve: mask.curve,
                  },
              resolution: exportSettings.resolution,
              maxTriangles: exportSettings.maxTriangles,
              format,
            },
          },
          "export-done",
          (step, progress) =>
            set({ exportState: { status: "running", step, progress } }),
        );
        exportTask = task;
        const out = await task.promise;
        download(
          new Blob([out.bytes as Uint8Array<ArrayBuffer>], {
            type: format === "3mf" ? "model/3mf" : "model/stl",
          }),
          fileName,
        );
        set({
          exportState: {
            status: "done",
            fileName,
            triangles: out.triangles,
            limited: out.limited,
            verified: out.verified,
          },
        });
      } catch (error) {
        set({
          exportState:
            error instanceof CancelledError
              ? { status: "idle" }
              : {
                  status: "error",
                  message:
                    error instanceof Error ? error.message : "Export failed",
                },
        });
      } finally {
        exportTask = null;
      }
    },
    cancelExport: () => exportTask?.cancel(),

    setCustomMap: async (file) => {
      try {
        const map = await imageToHeightmap(file);
        setCustomHeightmap(map);
        set({ customMapName: file.name, error: null });
        get().setTexture({ textureId: CUSTOM_TEXTURE_ID });
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : "Could not load image",
        });
      }
    },
    removeCustomMap: () => {
      if (get().history.present.texture.textureId === CUSTOM_TEXTURE_ID) {
        get().setTexture({ textureId: DEFAULT_TEXTURE.textureId });
      }
      setCustomHeightmap(null);
      set({ customMapName: null });
    },

    saveProject: () => {
      const { geometry, modelInfo, history, customMapName } = get();
      const custom = getCustomHeightmap();
      const name = (modelInfo?.name ?? "project").replace(/\.stl$/i, "");
      const bytes = saveProject({
        name: modelInfo?.name ?? name,
        rotation: history.present.rotation,
        texture: history.present.texture,
        mask: history.present.mask,
        positions: geometry
          ? (geometry.getAttribute("position").array as Float32Array)
          : null,
        customMap:
          custom && customMapName
            ? { name: customMapName, heightmap: custom }
            : null,
      });
      download(
        new Blob([bytes as Uint8Array<ArrayBuffer>], {
          type: "application/zip",
        }),
        `${name}${PROJECT_EXTENSION}`,
      );
      set({ notice: `Saved ${name}${PROJECT_EXTENSION}` });
    },

    loadProject: async (file, mode) => {
      try {
        const project = loadProject(new Uint8Array(await file.arrayBuffer()));
        if (project.customMap) {
          setCustomHeightmap(project.customMap.heightmap);
          set({ customMapName: project.customMap.name });
        }

        if (mode === "full") {
          if (!project.positions)
            throw new Error("This project does not contain a model.");
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(project.positions, 3),
          );
          geometry.computeVertexNormals();
          get().setModel(geometry, project.name, project.positions.byteLength);
          const doc: EditorDoc = {
            rotation: project.rotation,
            texture: project.texture,
            mask: project.mask,
          };
          set({
            history: createHistory(doc),
            placement: computePlacement(geometry, doc.rotation),
            fitRequest: get().fitRequest + 1,
            notice: `Loaded ${file.name}`,
            error: null,
          });
          return;
        }

        // Settings only: keep the current model and orientation; reuse the painted
        // selection only if it was made on a model with the same triangle count.
        const faces = (get().geometry?.getAttribute("position").count ?? 0) / 3;
        const paintFits =
          project.positions !== null && project.positions.length / 9 === faces;
        change((doc) => ({
          ...doc,
          texture: project.texture,
          mask: {
            ...project.mask,
            paint: paintFits ? project.mask.paint : doc.mask.paint,
          },
        }));
        set({
          notice: paintFits
            ? `Applied settings from ${file.name}`
            : `Applied settings from ${file.name} (painted mask skipped: different model)`,
          error: null,
        });
      } catch (error) {
        set({
          error:
            error instanceof Error ? error.message : "Could not open project",
        });
      }
    },
    setNotice: (notice) => set({ notice }),
  };
});

/** Texture settings currently on screen: committed values plus any live slider preview. */
export function useTextureSettings(): TextureSettings {
  const base = useEditorStore((s) => s.history.present.texture);
  const preview = useEditorStore((s) => s.texturePreview);
  return preview ? { ...base, ...preview } : base;
}

/** Mask settings on screen: committed values, live slider preview and any stroke in progress. */
export function useMaskSettings(): MaskSettings {
  const base = useEditorStore((s) => s.history.present.mask);
  const preview = useEditorStore((s) => s.maskPreview);
  const draft = useEditorStore((s) => s.paintDraft);
  if (!preview && !draft) return base;
  return { ...base, ...preview, paint: draft ?? base.paint };
}
