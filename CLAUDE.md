# Anima: Human Anatomy

Educational 3D model of the human body, hosted on GitHub Pages. A fork of
[ashemag/human-atlas](https://github.com/ashemag/human-atlas) (MIT). Anatomy data is
BodyParts3D (CC BY 4.0).

## Rules

- **British English** in all UI text, comments and documentation (colour, optimise, behaviour, licence as a noun).
  Anatomical names from the BodyParts3D/FMA data are left as they are.
- **Attribution must stay visible**: the BodyParts3D CC BY 4.0 credit is always on screen (footer), in the About
  panel and in `ATTRIBUTION.md`. Keep the Human Atlas MIT credit in About and `ATTRIBUTION.md`.
- **Label it as an educational model, not medical advice**, on screen at all times.
- **Do not build** a physiology engine, scenarios or a vitals HUD. Animations (heartbeat, breathing, flow, nerve
  pulses) are visual only, with fixed natural rhythms, and each can be toggled.
- **Do not claim anatomical accuracy** beyond what the source data contains. The low-detail body is a loading placeholder.
- **Performance**: target 60 fps on a mid-range laptop; keep draw calls low (one per geometry file, about 20 in total);
  pause rendering when the tab is hidden; cap the pixel ratio at 2; render on demand unless something is animating.
- **Ask the owner before** installing any dependency, downloading source archives, making major architectural
  changes, or increasing total download size by more than 10 MB.
- **Work in phases** and stop for review after each. After each phase: run a local server, test in headless Chromium
  (Playwright), check the console for errors, and screenshot front, side and close-up views. Report what was verified.
- The site's look must stay distinct from upstream Human Atlas (layout, copy and styling are our own).

## Commands

```sh
npm ci                     # install
npm run dev                # dev server: http://localhost:3016/anima-body-anatomy/
npm run check              # TypeScript
npm run build              # production build in dist/ (BASE_PATH=/ for a root host)
node tests/serve.mjs       # serve dist/ like GitHub Pages: http://localhost:4173/anima-body-anatomy/
node tests/smoke.mjs <url> --prefix <name>    # screenshots + console check (tests/screenshots/)
node tests/measure-load.mjs <url> --runs 3    # load timings and transfer sizes at 50 Mbps
node tests/offline-cache.mjs <url>            # service worker: second load works offline
node tests/profile-main-thread.mjs <url>      # long tasks and hottest functions
node scripts/validate-atlas.mjs               # decode and check every geometry file
node scripts/validate-interactions.mjs        # layout, picking-tap and search contracts
```

## File structure

```
web/index.html            Entry HTML: inline splash screen and early manifest fetch (window.__animaBoot)
web/main.tsx              React entry; registers the service worker
app/page.tsx              Root component: explorer state, composes scene and interface
app/scene.tsx             Three.js scene: materials, part-state textures, picking, camera, render loop
app/anatomy.ts            Systems (names, colours, descriptions), organ explanations, shared types
app/content.ts            All interface copy, tours and links. Edit wording here.
app/interface/*.tsx       UI components: top bar, intro, layers, control deck, search, detail, about, status
app/data/manifest.ts      Manifest types and fetch helpers (all URLs relative to BASE_URL)
app/data/geometry.ts      Fetch + gunzip + meshopt-decode (in workers) one geometry file
app/data/streamer.ts      On-demand, prioritised full-detail loading by system
app/render/stage.ts       Shader-drawn holographic floor
app/service-worker.ts     SW registration and cache sync; public/sw.js is the worker itself
app/explosion-layout.ts   Packing for the "spread apart" view
app/pointer-tap.ts        Tap-versus-drag detection
app/agent-tools.ts        Optional WebMCP tools (search and inspect)
components/ui/            shadcn components that are actually used (keep this list minimal)
public/models/            Generated geometry (do not edit by hand)
scripts/                  Geometry pipeline and validators
tests/                    Local server and Playwright checks
.github/workflows/deploy.yml   Build, validate and deploy to GitHub Pages on push to main
```

## Geometry pipeline

Source: the official BodyParts3D archive `isa_BP3D_4.0_obj_99.zip` (143 MB), extracted to
`work/source/obj/` (gitignored), plus `scripts/data/parts.json` (names, FMA IDs, systems) and
`scripts/data/concepts.json`. `node scripts/build-streaming-assets.mjs` (about 20 s) writes `public/models/`:

- Per mesh: weld split vertices → Taubin smoothing (2 iterations, reduced or skipped if volume would change > 3%)
  → angle-weighted normals. This is **level 2 (full)**, the source resolution (6.68M triangles).
- **Level 1 (standard)**: simplified to a 1.6M-triangle whole-body budget (1% error bound).
- **Level 0 (low)**: about 120k triangles, one file, shown first on every device.
- `manifest.json` (fetched first, never cached forever) and `concepts.<hash>.json` (search, loaded when idle).

Each `.bin.gz` is gzip(meshopt streams): uint16 positions + part index, octahedral normals, uint32 indices. The part
index is stored as `index + level * 16384`. Content hashes in names let the service worker cache files forever.
Mesh clean-up lives in `scripts/lib/mesh-quality.mjs`, the OBJ reader in `scripts/lib/obj-source.mjs`.

## Detail tiers (app/render/device-tier.ts, app/data/streamer.ts)

- **full** (capable PCs): level 0, then level 2 for every visible system (about 22 MB).
- **standard** (phones, tablets, Intel integrated graphics, < 8 GB memory): level 0, then level 1 (about 6.5 MB).
  Level 2 is loaded only for the focused structure, or for parts near the centre of view when the camera is within
  0.9 m, up to 1.2M triangles, and released afterwards.
- Override with `?detail=full|standard` (remembered). `?bench` opens a panel with frame rate, triangles and a
  tier switch, for measuring real devices.

## How rendering works

- One draw call per geometry file. A `partIndex` vertex attribute indexes two small data textures:
  `partState` (explode offset xyz, visible w) and `selectionState` (R selected, G best resident level × 85).
  Hidden parts, and copies of parts with a better level resident, are culled in the vertex shader.
- `app/render/residency.ts` tracks resident files, the best level per part and the matching pick mesh.
- Picking: per-part geometries share the file's buffers and limit triangles with `drawRange`; ray tests run only
  against parts whose bounding box the ray hits.
- `app/render/materials.ts`: one `MeshPhysicalMaterial` per system (per-system roughness, clearcoat, sheen and
  procedural micro-relief, which is a shading effect only). Shaders are pre-compiled with `compileAsync`.
- `app/render/post.ts`: MSAA scene target → HBAO (ambient occlusion, using a part-state normal material) → output.
  Off on touch devices until the Phase 3 quality setting exists.
- The canvas is transparent; the dark backdrop and grid are CSS.

## Coding conventions

- TypeScript, React function components, ES modules. Keep modules small and focused; add a header comment
  explaining what the module does and why.
- `app/scene.tsx` is dense, inherited code; new rendering features go in `app/render/` modules, not into it.
- UI strings live in `app/content.ts`; styles in `app/globals.css`, organised by section with design tokens at the top.
- Use `assetUrl()` for every fetched file so the GitHub Pages base path works.
- Respect `prefers-reduced-motion`. Phone touch targets are at least 44 px.
- Generated files (`public/models/*`) are rebuilt by scripts, never hand-edited.
