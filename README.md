# 3D Texture Studio

A browser-based 3D surface texture editor, inspired by [BumpMesh](https://bumpmesh.com). You load an STL model, pick a surface texture, preview it in 3D, and export a new STL where the texture is real geometry, ready for 3D printing.

This is an independent project and is not affiliated with BumpMesh.

## Features

Done (Milestone 1):

- Editor layout based on the reference: header, 3D viewport, right settings sidebar, status bar
- Default cube, orbit / zoom / pan, grid and axis gizmo
- STL upload, parsed in the browser with Three.js `STLLoader`
- Status bar shows file name, triangle count, file size, dimensions and mouse controls
- Error message for invalid files

Done (Milestone 2):

- Header: undo, redo, reset, light/dark theme
- Undo/redo history for the model's orientation
- Place on Face (click a face to rest the model on it) and Rotate by custom X° / Y° / Z° angles
- Z-up scene, model centred and resting on the grid, X/Y dimension lines
- Wireframe and perspective/orthographic toggles in the status bar
- Drag-and-drop STL loading, collapsible sidebar
- Camera refits on every model or orientation change; old geometry is disposed
- Texture sections laid out as in the reference

Done (Milestone 3):

- 16 procedural textures (grip, geometric, patterns, organic), generated in code; thumbnails and a searchable Texture Gallery
- Invert, Texture Smoothing, Transition Smoothing (triplanar projection)
- Texture height, Reverse direction, Symmetric displacement
- Size U/V with proportional lock, Offset U/V, Rotation
- Live preview: bump shading by default, real vertex displacement with 3D Preview
- Export STL: weld, subdivide to the chosen resolution, displace, write binary STL, then re-read the file to verify triangle count and size
- All texture settings are undoable; the header Reset restores defaults

Done (Milestone 4):

- Angle masking: keep faces near horizontal (top and/or bottom) smooth
- Surface masking: Exclude or Include only, painted with a Single or Circle brush or a Bucket fill that follows the surface up to a max angle; Erase (or Shift), Clear All
- Smooth mask edge: texture fades in over a distance, with Linear, S-Curve or Ease-In curves
- Painted areas are tinted in the viewport; the mask applies to the preview, 3D Preview and export
- Section View: cut the model along X, Y or Z to see and paint inner surfaces
- Every stroke, fill and mask change is one undo step

Done (Milestone 5):

- Upload custom map: any PNG, JPG or WebP becomes a heightmap
- Projection modes: Triplanar, Cubic (Box), Cylindrical (Seam Blend, Cap Angle, Snap seamless), Spherical, Planar XY / XZ / YZ
- Favorites in the Texture Gallery (★, remembered in this browser)
- Save Project / Load Project (`.texproj`): model, settings, painted mask and custom map; load as Model + settings or Settings only
- Export STL or 3MF in a Web Worker with progress and Cancel; 3D Preview is prepared in the worker too
- Input checks (size limits, empty or broken files, invalid coordinates, zero-area triangles removed), WebGL and lost-context messages, and an error screen instead of a blank page

Keyboard shortcuts: `Ctrl+Z` undo, `Ctrl+Shift+Z` / `Ctrl+Y` redo, `Ctrl+O` load model, `F` fit view, `W` wireframe, `Esc` cancel Place on Face or leave a mask tool. While a mask tool is active: left-drag paints, `Shift` erases, `Alt` + drag orbits.

Details in [docs/milestones.md](docs/milestones.md).

## Tech stack

| Package | Version |
|---|---|
| Next.js | 16.4.0 |
| React | 19.3.0 |
| TypeScript | 5.9.3 |
| Three.js | 0.186.1 |
| @react-three/fiber | 9.8.1 |
| @react-three/drei | 10.7.9 |
| Zustand | 5.0.15 |
| three-mesh-bvh | 0.9.16 |
| fflate | 0.8.3 |
| Tailwind CSS | 4.3.3 |
| Biome | 2.4.2 |

Node.js 24 runs Next.js; Bun 1.3 is used as the package manager.

## Getting started

### Requirements

- [Node.js](https://nodejs.org) 24 LTS (runs Next.js)
- [Bun](https://bun.sh) 1.3 or newer (package manager and script runner)
- Git
- A desktop browser with WebGL 2: current Chrome, Edge, Firefox or Safari

Check your versions:

```bash
node --version   # v24.x
bun --version    # 1.3.x
```

### Run the app

```bash
git clone https://github.com/VikramRai-Mumbai/bumpmesh-clone.git
cd bumpmesh-clone
bun install
bun run dev
```

Open http://localhost:3000. The editor starts with a 50 mm sample cube; use **Load Model...** (or drag an `.stl` onto the viewport) to open your own file.

### Production build

```bash
bun run build
bun run start        # serves the built app on http://localhost:3000
```

Stop `bun run dev` before running `bun run build`; both use the `.next` folder.

### Checks

```bash
bunx tsc --noEmit    # type-check
bun run lint         # Biome lint and format check
bun run format       # apply Biome formatting
```

### Quick tour

1. Load an STL, or keep the sample cube.
2. Pick a texture in **Displacement Map** (or open **Texture Gallery**).
3. Adjust **Texture height**, **Size U/V** and **Projection**; turn on **3D Preview** to see real depth.
4. Optionally mask areas in **Masking** (angle sliders, brush or bucket fill).
5. Click **Export STL** or **Export 3MF** and open the file in your slicer.
6. **Save Project** keeps the model and all settings in a `.texproj` file.

### Troubleshooting

- **Port 3000 in use:** run `bun run dev -p 3001` and open http://localhost:3001.
- **"3D graphics are not available":** enable hardware acceleration in the browser settings.
- **Odd errors after pulling changes:** delete `.next` and `node_modules`, then run `bun install` again.

## Project structure

```
src/
  app/                             layout (SEO, theme script), page, icon
  components/editor/
    EditorClient.tsx               client-only boundary (ssr: false)
    TextureEditor.tsx              layout, file picker, drag-and-drop
    EditorHeader.tsx               logo, undo/redo/reset, theme
    ModelViewport.tsx              R3F canvas, camera, controls
    ModelMesh.tsx                  model, picking, brush / fill, mask display
    SectionPanel.tsx               Section View controls
    MaskingSection.tsx             masking controls
    DimensionLines.tsx             X/Y measurements on the plate
    EditorSidebar.tsx              model actions, rotate panel
    TextureSettingsPanel.tsx       texture sections
    TextureGallery.tsx             gallery with search and categories
    ExportSection.tsx              resolution, STL / 3MF export, progress, verification
    EditorErrorBoundary.tsx        recovery screen on errors
    useTexturedMaterial.ts         triplanar preview shader
    StatusBar.tsx                  model info, view toggles
  components/ui/                   Button, Slider, Checkbox, Select, Section, icons
  hooks/useKeyboardShortcuts.ts    global shortcuts
  lib/history.ts                   generic undo/redo history
  lib/geometry/orientation.ts      rotation and placement math
  lib/geometry/stl-loader.ts       STL parsing and model info
  lib/geometry/mesh-ops.ts         weld, subdivide, triangle estimate
  lib/geometry/export-pipeline.ts  export pipeline and verification (runs in the worker)
  lib/geometry/threemf.ts          3MF writer / reader
  lib/project.ts                   .texproj save / load with validation
  lib/worker-client.ts             runs worker jobs with progress and cancel
  workers/geometry.worker.ts       export and 3D Preview preparation off the main thread
  lib/texture/                     presets, custom maps, heightmaps, projections, thumbnails
  lib/mask/                        face weights, edge falloff, adjacency and bucket fill
  store/editor-store.ts            Zustand: model, history, view, mask tools, theme, export
```

More detail in [docs/architecture.md](docs/architecture.md).
