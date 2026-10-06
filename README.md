# Anima: Human Anatomy

An educational 3D model of the human body that runs in your browser. Turn it around, peel away layers, spread every
part out and look up any of 3,432 named structures.

**Live site:** https://jrayas.github.io/anima-body-anatomy/

> Anima is for learning. It is an educational model, **not medical advice**, and must not be used for diagnosis or
> treatment.

## Features

- 2,234 separately selectable parts across 15 body systems, from the BodyParts3D reference anatomy.
- Fast first view: a low-detail body appears in under a second on broadband, then detail streams in,
  system by system, only for the layers you are viewing.
- Source-resolution geometry on capable computers; phones get a lighter version plus full detail for whatever
  you focus on.
- Works offline after the first visit (service worker cache).
- Layers, guided starting points, search, focus on a single structure, and a "spread apart" view of every part.
- Phone and desktop layouts.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:3016/anima-body-anatomy/.

To test the production build the way GitHub Pages serves it:

```sh
npm run build
node tests/serve.mjs
```

Then open http://localhost:4173/anima-body-anatomy/.

## Deploy to GitHub Pages

1. Fork or push this repository to GitHub.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` type-checks, validates the geometry, builds with
   the base path `/<repository-name>/` and publishes the site to `https://<user>.github.io/<repository-name>/`.

To host at the root of a domain instead, build with `BASE_PATH=/ npm run build`.

## Checks

```sh
npm run check                         # TypeScript
node scripts/validate-atlas.mjs       # decode and verify every geometry file
node scripts/validate-interactions.mjs
node tests/smoke.mjs http://localhost:4173/anima-body-anatomy/   # screenshots and console errors
node tests/measure-load.mjs http://localhost:4173/anima-body-anatomy/
node tests/offline-cache.mjs http://localhost:4173/anima-body-anatomy/
```

The browser checks use Playwright's Chromium (`npx playwright install chromium` if it is missing).

## How it works

The geometry is built directly from the official BodyParts3D archive at three detail levels, split by body system
and compressed with meshoptimizer and gzip:

| Level | Triangles | Download | Used by |
|---|---|---|---|
| Low | about 120k | 0.5 MB | every device, shown first |
| Standard | about 1.6M | 6.2 MB | phones, tablets, laptops with integrated graphics |
| Full (source resolution) | 6.68M | 22.4 MB | capable computers; phones load it only for the structure in focus or close to the camera |

Add `?detail=full` or `?detail=standard` to the address to override the automatic choice, or `?bench` to show frame
rate and triangle counts on your own device. Each file is drawn in a single draw call, and small data textures
control each part's position, visibility, selection and detail level on the GPU. See [CLAUDE.md](CLAUDE.md) for the
file structure and conventions.

## Rebuilding the geometry

Optional. The repository already includes the browser-ready files in `public/models/`. To rebuild:

1. Download `isa_BP3D_4.0_obj_99.zip` (143 MB) from the
   [BodyParts3D download page](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html).
2. Extract it so the OBJ files are in `work/source/obj/isa_BP3D_4.0_obj_99/`.
3. Run `node scripts/build-streaming-assets.mjs`, then `node scripts/validate-atlas.mjs`.

## Credits and licences

- Application code: MIT ([LICENSE](LICENSE)). Anima is a fork of
  [Human Atlas](https://github.com/ashemag/human-atlas) by ashemag.
- Anatomy data: **BodyParts3D, © The Database Center for Life Science, CC BY 4.0**. Keep this attribution when
  redistributing. Full details and adaptations are in [ATTRIBUTION.md](ATTRIBUTION.md).
- The model is one adult male reference body. It does not include every structure or the natural variation
  between people.
