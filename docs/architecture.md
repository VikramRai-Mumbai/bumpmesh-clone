# Architecture

## Overview

Everything runs in the browser. Next.js serves a static page, and the 3D editor is loaded on the client only, since Three.js needs `window` and WebGL.

```
page.tsx (server)
  └─ EditorClient       dynamic import, ssr: false
       └─ TextureEditor  file picker, drag-and-drop, shortcuts
            ├─ EditorHeader    undo / redo / reset, theme
            ├─ ModelViewport   camera, controls, DimensionLines, SectionPanel
            │    └─ ModelMesh   display mesh, BVH pick mesh, brush / fill, mask attributes
            ├─ EditorSidebar   load, place on face, rotate
            │    ├─ TextureSettingsPanel (incl. MaskingSection) / TextureGallery
            │    └─ ExportSection
            └─ StatusBar       model info, wireframe / perspective
```

## State

All editor state is in one Zustand store (`store/editor-store.ts`). Components subscribe to single fields, so they re-render only when that field changes.

| Part | Contents | Undoable |
|---|---|---|
| Model | `geometry` (always in millimetres), `modelInfo`, `modelUnits` | No (loading a model starts a new history) |
| Document | `rotation` (quaternion), `texture` (all texture settings), `mask` (options + painted faces bitset) | Yes |
| Live preview | `texturePreview`, `maskPreview`: slider values while dragging; `paintDraft`: selection during a stroke | No (committed on release) |
| Derived | `placement`: offset to sit on the plate, rotated size | Recomputed |
| View | wireframe, perspective, sidebar, gallery, 3D Preview, pick mode, mask tool and brush options, Section View, theme | No |
| Export | resolution, max triangles, progress and result | No |

The geometry moved into the store in Milestone 2 because the viewport, status bar and actions all need it. It is never modified by editing: rotation is applied as a transform, so undo stays cheap and the original mesh stays intact. Changing Model units swaps in a rescaled copy; triangle order is unchanged, so the painted mask still lines up.

## Undo / redo

`lib/history.ts` is a generic snapshot history (`past`, `present`, `future`, up to 100 steps). Each undoable action builds a new document object and commits it. Undo and redo move between snapshots, so actions need no undo code of their own. Texture and mask settings in later milestones are added to the document and become undoable automatically.

## Orientation

`lib/geometry/orientation.ts`:

- `rotateAboutAxis`: rotate about a world axis by any angle (the Rotate panel applies X, then Y, then Z).
- `placeFaceDown`: turn a picked face's normal to −Z so the face rests on the plate.
- `computePlacement`: rotate every vertex to get the exact box, then centre on X/Y and drop to Z = 0.

The viewport applies `rotation`, then `placement.offset`. The status bar shows the rotated size.

## STL loading

1. A file comes from the picker, `Ctrl+O` or drag-and-drop.
2. `file.arrayBuffer()` reads it locally (nothing is uploaded).
3. `STLLoader.parse()` returns a `BufferGeometry` (ASCII or binary).
4. Zero-area triangles are removed (the threshold is relative to the model's size), normals are computed, and `getModelInfo` gives triangle count and file size.
5. Units are guessed: STL has no units, and a model under 1 mm in every direction is treated as metres (`guessUnits`), with a note shown in the sidebar.
6. `setModel` scales the geometry to millimetres, stores it, disposes the previous one, resets history and asks the viewport to refit. The Model units switch (mm / cm / m / in) calls `setModelUnits` to rescale later while keeping all settings.

Errors (wrong extension, empty geometry, parser exceptions) are caught in `handleFile` and shown in the sidebar.

## Viewport

- Z-up scene (`Object3D.DEFAULT_UP`); orthographic camera by default, perspective optional.
- drei `Bounds` frames the model. `FitOnRequest` refits whenever the store's `fitRequest` counter changes (new model, rotate, reset, `F`).
- Near/far clipping is only adjusted for the perspective camera; for orthographic it would cut off the grid.
- Dimension labels are canvas textures on flat planes, so they lie on the plate like in the reference.

## Textures

`lib/texture/`:

- `presets.ts`: 16 seamless height functions `h(u, v)` built from tiling noise, Voronoi cells and simple shapes.
- `heightmap.ts`: renders a preset to a 256×256 grid (normalised to 0–1), applies blur and invert, and samples it bilinearly with wrap-around, the same way the GPU does.
- `triplanar.ts`: STL has no UV coordinates, so the texture is projected. Triplanar blends three planes by the surface normal; cubic picks the dominant plane; planar uses one plane; cylindrical and spherical turn the angle around the model's centre into arc length (with a cross-fade at the wrap seam, optional flat caps, and Size U snapped so the pattern wraps a whole number of times). The same code exists as a CPU sampler (export) and a GLSL chunk (preview), so what you see is what you export.
- `custom-map.ts`: decodes an uploaded image into a 256×256 grayscale heightmap, registered under the `custom` texture id.

## Preview material

`useTexturedMaterial` extends `MeshStandardMaterial` with `onBeforeCompile`:

- Default: the fragment shader samples the height per pixel and tilts the normal using screen-space derivatives (bump mapping without UVs). No extra geometry.
- 3D Preview: a welded, subdivided copy of the mesh is drawn and the vertex shader moves each vertex along its normal. Flat shading shows the real relief.
- The heightmap is a half-float texture with a mip chain built on the CPU, so distant surfaces don't sparkle.
- Uniforms are updated in place, so slider drags never recompile the shader.

## Export pipeline

`lib/geometry/export-pipeline.ts` runs inside `workers/geometry.worker.ts` (started per job by `lib/worker-client.ts`; Cancel terminates the worker). It works on plain arrays copied from the main thread:

1. Bake rotation and placement into a copy of the mesh.
2. `weld`: merge duplicate vertices so neighbouring triangles share points (STL stores each triangle separately; without this the surface would crack).
3. `subdivide`: split edges longer than the resolution. The split decision depends only on the edge, so neighbours always agree and no T-junctions appear. Stops before exceeding Max triangles.
4. `displaceGeometry`: move each vertex along its smoothed normal by the sampled height.
5. Write binary STL (`STLExporter`) or 3MF (`threemf.ts`, zipped with fflate), then read the file back (`STLLoader` or the 3MF reader) to report triangle count and size.

## Masking

`lib/mask/`:

- `mask.ts`: the painted selection is a bitset (one bit per original triangle). `computeFaceWeights` combines it with the angle mask (face normal after rotation vs. straight up / down) into a 0–1 weight per face. `computeVertexWeights` turns that into per-vertex weights on a subdivided mesh: any vertex touching a masked face gets 0, then the falloff ramps up with distance to the nearest such vertex, using a spatial grid with cell size = falloff distance.
- `fill.ts`: face adjacency from shared edges (rounded positions, since STL repeats corners), and a flood fill that crosses an edge only if the two faces' normals are within Max angle.

Triangle numbering: models are stored non-indexed, so triangle i is always vertices 3i..3i+2. The BVH is built in indirect mode so it never reorders triangles; welding keeps triangle order; subdivision records each new triangle's parent.

Viewport: an invisible copy of the original mesh with the BVH handles all picking (Place on Face, brush, fill), so face numbers match the mask even when 3D Preview shows a subdivided mesh. Brush strokes edit a draft copy of the bitset (a new array per dab, so memoised readers see changes) and commit once on release.

Section View: a world-space clipping plane on the model material; pick results on the cut-away side are skipped.

## Project files

`lib/project.ts` writes a `.texproj` zip: `project.json` (app id, format version, rotation, texture and mask options) plus raw binary parts (`model.bin` positions, `paint.bin` mask bitset, `custommap.bin`). Loading checks the app id and version, validates every value against the defaults (unknown or wrong-typed values fall back), and rejects truncated or non-finite model data.

## Robustness

- `loadSTL` enforces size limits, rejects empty, unreadable and NaN files, removes zero-area triangles relative to the model's size, and detects metre-scale files.
- `EditorErrorBoundary` shows a recovery screen if rendering throws.
- The viewport checks for WebGL 2 before creating the canvas and handles `webglcontextlost` / `webglcontextrestored`.

## Theme

Colour tokens live in `globals.css` and switch with a `dark` class on `<html>`. A small inline script in `layout.tsx` applies the saved theme before first paint, so there is no light/dark flash.

## Key decisions

- **Client-side processing:** keeps models private and avoids a backend. Heavy work (export, 3D Preview preparation) runs in a Web Worker so the page stays responsive.
- **React Three Fiber + Drei:** the scene follows React state, and controls, grid and gizmo come ready-made.
- **Zustand:** small API, no provider, components subscribe to only what they use.
- **Snapshot undo/redo:** simpler than writing an undo step for every action, and works for any future setting.
- **Geometry code outside React:** `src/lib` has no React imports, so the math can be reused in a worker later.
- **Non-destructive editing:** the original mesh is never changed; preview and export are derived from settings.
- **Procedural textures:** no image assets to license or ship, and every texture tiles perfectly.
- **GPU preview, CPU export:** the shader gives instant feedback; the CPU pipeline produces the exact mesh. Both share the same projection formula.

## Future enhancements

Texture layers (several textures with their own settings and areas), a precision brush that splits triangles along the brush edge, manual axis fitting for cylindrical projection, and moving STL parsing and mask weights into the worker as well.
