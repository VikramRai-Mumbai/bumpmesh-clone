# Milestones

| # | Milestone | Status |
|---|---|---|
| 1 | Editor foundation and STL viewing | Done |
| 2 | UI clone and editor controls | Done |
| 3 | Procedural texture and displacement | Done |
| 4 | Surface selection and masking | Done |
| 5 | Advanced texturing and hardening | Done |

General rules:

- The BumpMesh editor is the visual reference. Layout and look follow it closely, but the name, logo and assets are our own.
- Every control does exactly what it shows; controls for later milestones are clearly labelled.
- Undo/redo is one shared history; each milestone adds its settings to the history document.

## 1. Editor foundation and STL viewing

Next.js app with the reference layout: header (logo, name, version), 3D viewport, settings sidebar on the right, and status bar. Three.js scene with lights, orbit/zoom/pan, grid and axis gizmo. Default 50 mm cube, STL upload parsed in the browser. The status bar shows name, triangles, file size and dimensions, plus the mouse controls hint. A Zustand store holds model info, loading and error state.

Checked: `tsc --noEmit`, `biome check` and `next build` pass.

## 2. UI clone and editor controls

Header (right side):

| Control | Behaviour |
|---|---|
| Undo / Redo | Step through history; disabled when there is nothing to undo or redo |
| Reset | Restores the original orientation (and, from Milestone 3, all texture settings) and refits the camera; can be undone |
| Save Project / Load Project | Added in Milestone 5 |
| Theme | Switches light / dark; remembered across visits |

Sidebar top row:

| Control | Behaviour |
|---|---|
| Load Model... | Opens the STL picker (also `Ctrl+O` or drag-and-drop on the viewport) |
| Place on Face | Pick mode: hover highlights a triangle, click rests that face on the plate; `Esc` cancels |
| Rotate | X°, Y°, Z° fields hold the total rotation applied from the panel. Apply (or Enter) is one undo step and stays disabled until a value changes. The fields clear if the model is moved another way (undo, Place on Face). Reset clears them and restores the original orientation |

Viewport and status bar:

- Z-up scene; the model is centred and rests on the grid.
- Red X and green Y dimension lines, with labels printed on the plate.
- Wireframe and Perspective View toggles (Section View added in Milestone 4).
- Camera refits on load, rotate and reset; old geometry is disposed.
- Collapsible sidebar; texture sections laid out as in the reference and enabled in Milestones 3–5.

Shortcuts: `Ctrl+Z`, `Ctrl+Shift+Z` / `Ctrl+Y`, `Ctrl+O`, `F` fit view, `W` wireframe, `Esc` cancel pick mode.

Undo/redo is a snapshot history (`lib/history.ts`) of the editor document. Orientation is the only document field in this milestone.

Checked: `tsc --noEmit`, `biome check` and `next build` pass; layout and controls checked in headless Chrome.

## 3. Procedural texture and displacement

Textures: 16 seamless height functions generated in code (Knurl, Diamond Plate, Ribs, Dots, Hexagons, Square Setts, Bricks, Grid, Basket Weave, Waves, Scales, Carbon Weave, Stone, Noise, Wood Grain, Leather), rendered to 256×256 heightmaps. The sidebar shows 12; the Texture Gallery has all of them with search and category filters.

| Section | Controls |
|---|---|
| Displacement Map | Texture picker, Texture Gallery, Invert texture, Texture Smoothing (blur). Upload custom map: Milestone 5 |
| Projection | Triplanar with Transition Smoothing (more modes in Milestone 5) |
| Displacement | Texture height (mm), Reverse direction, Symmetric displacement, 3D Preview |
| Transform | Size U / V (mm) with proportional lock, Offset U / V, Rotation |
| Export | Resolution (mm), Max triangles, estimated output triangles, Export STL, verification result (3MF added in Milestone 5) |

Preview: the default view shades bumps from the texture on the GPU, so sliders update instantly. 3D Preview welds and subdivides a copy of the mesh (up to 400k triangles) and moves its vertices in the vertex shader.

Export: bake rotation and placement, weld vertices, subdivide edges longer than the resolution (up to Max triangles), move each vertex along its normal by the sampled height, write a binary STL and download it. The file is then parsed again and its triangle count and size are shown, as a re-import check.

Undo/redo: every texture setting is part of the history document. Sliders preview while dragging and record one step on release.

Checked: `tsc --noEmit`, `biome check` and `next build` pass. In headless Chrome: texture change, 3D Preview, gallery and export run without errors; a 20 × 40 × 60 mm box exported at 0.4 mm gave 393,216 triangles at 21 × 41 × 61 mm (0.5 mm texture on every side), and the file is watertight (no open or non-manifold edges).

## 4. Surface selection and masking

| Control | Behaviour |
|---|---|
| Top faces / Bottom faces (°) | Faces within this angle of pointing straight up / down are not textured (0 = off). Follows the current rotation |
| Exclude / Include only | Painted faces stay smooth, or only painted faces get texture |
| Brush | Left-drag to paint. Single = the triangle under the cursor; Circle = every triangle within Size (mm). A ring shows the brush on the surface |
| Bucket fill | Click a face to fill the connected surface, stopping at edges sharper than Max angle |
| Erase | Erase instead of paint (or hold Shift) |
| Clear All | Removes the painted selection |
| Smooth mask edge | Distance (mm) and curve (Linear, S-Curve, Ease-In) over which texture fades in next to masked areas |
| Section View (status bar) | Cut along X, Y or Z with a position slider and Flip; painting and picking ignore the cut-away part |

While a tool is active the left button paints, Alt + drag orbits, right-drag pans and Esc leaves the tool.

How it works: the painted selection is one bit per triangle of the original model, stored in the history document (each stroke, fill or Clear All is one undo step). Angle and paint combine into a 0–1 weight per face. The viewport writes it into vertex attributes the shader reads (masked faces show no texture, painted faces are tinted). For 3D Preview and export, subdivision records each new triangle's original face, vertices touching a masked face get weight 0 so the edge stays flat and closed, and the falloff ramps the weight up with distance (found with a spatial grid). Brush and fill picking use a BVH (`three-mesh-bvh`) in indirect mode, which keeps the triangle order the mask relies on.

Checked: `tsc --noEmit` and `biome check` pass. In headless Chrome: on the sample cube, Top faces 10° + bucket fill on one side + export gave 51.00 × 50.50 × 50.50 mm (masked top and painted side stayed flat, every other side grew 0.5 mm); brush strokes, undo and Section View work without console errors. On a 3,968-triangle sphere a 5 mm circle brush stroke painted 158 triangles, and 3D Preview showed the painted area smooth and tinted with the texture fading in over 3 mm.

## 5. Advanced texturing and hardening

| Feature | Behaviour |
|---|---|
| Upload custom map | PNG / JPG / WebP (up to 20 MB) converted to a 256×256 grayscale heightmap; appears as a tile with Remove |
| Projection | Triplanar, Cubic (Box), Cylindrical, Spherical, Planar XY / XZ / YZ. Cylindrical and spherical have Seam Blend and Snap seamless (Size U rounded so the texture wraps a whole number of times); cylindrical has Cap Angle for the ends |
| Favorites | Star textures in the gallery; ★ Favorites filter; stored in this browser |
| Save / Load Project | `.texproj` zip: settings JSON plus raw binary model, painted mask and custom map. Load as Model + settings, or Settings only (painted mask kept only if the triangle count matches). Files are validated with clear errors |
| Export | STL or 3MF, run in a Web Worker with step progress and Cancel; the written file is read back to verify |
| 3D Preview | Mesh preparation runs in the worker |
| Input checks | Over 200 MB warns, over 500 MB is refused; empty, unreadable and NaN files are rejected; zero-area triangles (relative to model size) are removed and reported |
| Model units | STL has no units: models under 1 mm are treated as metres and scaled ×1000 with a note; a Model units switch (mm / cm / m / in) rescales the model and keeps all settings |
| Robustness | WebGL 2 missing → explanation; GPU context loss → "Restoring" overlay; render errors → recovery screen with Reload |

Checked: `tsc --noEmit` and `biome check` pass; production build checked in a clean checkout. In headless Chrome against the dev server: broken STL rejected with a message; cylindrical, spherical and a custom PNG map render on a sphere; STL and 3MF exports verified (339,712 triangles, 50.84 × 50.88 × 50.91 mm); a 4M-triangle export was cancelled mid-subdivision while the page stayed responsive; Save Project, Load Project (both modes) and favorites work; no console errors.
