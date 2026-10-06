// Types and fetch helpers for the streaming geometry manifest written by
// scripts/build-streaming-assets.mjs. All URLs in the manifest are relative to the
// site base (Vite's BASE_URL), so the app works at / and under /anima-body-anatomy/.
import type {Concept, Part, SystemId} from '../anatomy';

export interface StreamRange {offset: number; length: number}

/** 0 low (placeholder), 1 standard (phones, weak laptops), 2 full (source resolution). */
export type DetailLevel = 0 | 1 | 2;

export interface GeometryFile {
  url: string;
  /** Owning system, or 'all' for the level 0 body. */
  system: SystemId | 'all';
  level: DetailLevel;
  bytes: number;
  rawBytes: number;
  vertexCount: number;
  indexCount: number;
  /** 4 = int8 octahedral normals, 8 = int16. */
  normalStride: 4 | 8;
  streams: {position: StreamRange; normal: StreamRange; index: StreamRange};
  /** [partIndex, indexStart, indexCount] for every part in the file. */
  parts: [number, number, number][];
  /** Level 0 file only: [indexStart, indexCount] per system. */
  systems?: Partial<Record<SystemId, [number, number]>>;
}

export interface Manifest {
  format: 3;
  version: string;
  build: string;
  levels: {level: DetailLevel; name: string; triangles: number}[];
  /** Part indices in the geometry are stored as index + level * levelOffset. */
  levelOffset: number;
  sourceTriangles: number;
  quant: {origin: number[]; scale: number};
  concepts: string;
  parts: Part[];
  files: GeometryFile[];
}

/** Resolves a manifest-relative path against the deployed base path. */
export const assetUrl = (path: string) => import.meta.env.BASE_URL + path;

/** Early fetches started by the inline boot script in web/index.html, if present. */
interface Boot {manifest?: Promise<Response>}
const boot = () => (window as Window & {__animaBoot?: Boot}).__animaBoot;

export async function loadManifest(signal?: AbortSignal): Promise<Manifest> {
  // Reuse the request the inline boot script already started, so the manifest
  // downloads in parallel with the JavaScript bundle.
  const early = boot()?.manifest;
  if (early) delete boot()!.manifest;
  const response = await (early ?? fetch(assetUrl('models/manifest.json'), {signal, cache: 'no-cache'}));
  if (!response.ok) throw new Error('The anatomy catalogue could not be loaded.');
  const manifest = await response.json() as Manifest;
  if (manifest.format !== 3) throw new Error('The anatomy catalogue is in an unexpected format. Please reload the page.');
  return manifest;
}

export async function loadConcepts(manifest: Manifest, signal?: AbortSignal): Promise<Concept[]> {
  const response = await fetch(assetUrl(manifest.concepts), {signal});
  if (!response.ok) throw new Error('Search data could not be loaded.');
  return response.json();
}
