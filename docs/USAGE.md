# Usage Guide

## 1. Start The App

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173/`.

## 2. Import A USDZ Scan

Use the drop zone in the right panel to select or drag in a `.usdz` file.

The app parses the file in the browser and displays the original scan. If parsing fails, the source app may have exported a USDZ variant that Three.js cannot read yet.

## 3. Preview Modes

- `Original`: shows the imported scan.
- `Repaired`: shows only the repaired result after a successful repair task.
- `Side-by-side`: shows original on the left and repaired result on the right.
- `Difference`: overlays original and repaired models for diagnostic comparison.

Render modes:

- `Solid`: best for user-facing inspection.
- `Wireframe`: useful for topology and remesh checks.
- `Point cloud`: useful for scan density inspection.

## 4. API Key

Use a 3D AI Studio API Key. Keys from DeepSeek, OpenAI, or other LLM vendors are not compatible because this app calls a mesh repair endpoint, not a text-generation endpoint.

The key is stored only in React state for the current page session.

## 5. Repair Options

`Bake textures`

Keeps visual color and texture detail on the repaired mesh. Leave enabled for normal preview workflows.

`Hollow`

Creates a hollow structure. Leave disabled unless preparing an asset for 3D printing or material reduction.

`Quality`

Controls the third-party repair quality parameter. `default` is the safest first pass.

## 6. Interpreting Results

Mesh repair often changes topology rather than visible surface shape. A successful repair can look similar in solid mode while still changing vertices, triangles, normals, loose faces, or watertightness.

Check the `Repair comparison` panel after repair. If mesh, vertex, and triangle counts are nearly identical, the API likely returned a result that is very close to the input model.
