import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defineConfig, type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

// GitHub Pages serves the site from /<repository>/. Override with BASE_PATH=/ for a root host.
const base = process.env.BASE_PATH ?? '/anima-body-anatomy/';

/** Publishes the repository's ATTRIBUTION.md with the site so the credits are reachable online. */
const attribution = (): Plugin => ({
  name: 'anima-attribution',
  generateBundle() {
    this.emitFile({type: 'asset', fileName: 'ATTRIBUTION.md', source: fs.readFileSync(path('./ATTRIBUTION.md'), 'utf8')});
  },
});

export default defineConfig({
  base,
  root: path('./web'),
  publicDir: path('./public'),
  plugins: [react(), attribution()],
  resolve: {alias: {'@': path('./')}},
  css: {postcss: {plugins: [tailwindcss()]}},
  server: {watch: {usePolling: true}},
  build: {
    outDir: path('./dist'),
    emptyOutDir: true,
    // three.js is large and changes rarely; a separate chunk caches well across deploys.
    rolldownOptions: {output: {advancedChunks: {groups: [{name: 'three', test: /node_modules[\\/]three/}]}}},
  },
});
