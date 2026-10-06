// Builds the streaming geometry used by the viewer from the optimised intermediate
// (atlas.json + body-N.bin, produced by optimize-anatomy.mjs).
//
// Output in public/models/:
//   manifest.json          parts, files and systems (small, fetched first, never cached forever)
//   concepts.<hash>.json   named FMA concepts for search (loaded lazily)
//   lod0.<hash>.bin.gz     low-detail whole body (all systems) shown first
//   <system>-<n>.<hash>.bin.gz   full-detail geometry, one or more files per system
//
// Each .bin.gz is gzip(meshopt-encoded streams). Streams, in order:
//   position: uint16 x, y, z, partIndex (8 bytes/vertex), quantised to the global body bounds
//   normal:   octahedral-encoded int8 (4 bytes) or int16 (8 bytes) per vertex
//   index:    uint32 triangle list, meshopt TRIANGLES codec
// Content hashes in file names let the service worker cache them forever.
//
// Usage: node scripts/build-streaming-assets.mjs [--input work/optimised]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {MeshoptEncoder, MeshoptSimplifier} from 'meshoptimizer';

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const root = path.resolve(import.meta.dirname, '..');
const input = path.resolve(root, arg('input', 'work/optimised'));
const output = path.join(root, 'public/models');

// Tuning. Change these and re-run to trade size against detail.
const LOD0_RATIO = 0.05;          // fraction of triangles kept in the low-detail body
const LOD0_ERROR = 0.1;          // max relative simplification error for the low-detail body
const LOD0_MIN_TRIANGLES = 16;    // tiny parts are kept as-is below this
const MAX_TRIANGLES_PER_FILE = 220_000; // larger systems are split so they stream progressively
const FULL_NORMAL = {stride: 8, bits: 12}; // int16 octahedral normals for full detail
const LOD0_NORMAL = {stride: 4, bits: 8};  // int8 octahedral normals for the low-detail body
// Load order follows the viewer's layer order; it does not affect file contents.
const SYSTEM_ORDER = ['skeletal', 'muscular', 'cardiac', 'sensory', 'arterial', 'venous', 'nervous', 'respiratory',
  'digestive', 'urinary', 'lymphatic', 'endocrine', 'reproductive', 'integumentary', 'connective'];

const atlas = JSON.parse(fs.readFileSync(path.join(input, 'atlas.json'), 'utf8'));
const chunks = atlas.chunks.map(c => fs.readFileSync(path.join(input, c.url.split('/').pop())));

// --- Read every part from the intermediate chunks -------------------------------------
const parts = atlas.parts.map((p, index) => {
  const b = chunks[p.chunk];
  const positions = new Float32Array(b.buffer.slice(b.byteOffset + p.positions, b.byteOffset + p.positions + p.vertexCount * 12));
  const n16 = new Int16Array(b.buffer.slice(b.byteOffset + p.normals, b.byteOffset + p.normals + p.vertexCount * 6));
  const normals = new Float32Array(p.vertexCount * 3);
  for (let v = 0; v < p.vertexCount; v++) {
    const x = n16[v * 3] / 32767, y = n16[v * 3 + 1] / 32767, z = n16[v * 3 + 2] / 32767, l = Math.hypot(x, y, z) || 1;
    normals[v * 3] = x / l; normals[v * 3 + 1] = y / l; normals[v * 3 + 2] = z / l;
  }
  const indices = new Uint32Array(b.buffer.slice(b.byteOffset + p.indices, b.byteOffset + p.indices + p.indexCount * 4));
  return {index, meta: p, positions, normals, indices};
});

// Global quantisation grid: one origin and one uniform step for every file.
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const p of atlas.parts) for (let a = 0; a < 3; a++) {
  min[a] = Math.min(min[a], p.bounds[0][a]);
  max[a] = Math.max(max[a], p.bounds[1][a]);
}
const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
const quant = {origin: min, scale: extent / 65535};

// --- Low-detail versions of every part --------------------------------------------------
function simplifyPart(part) {
  const triangles = part.indices.length / 3;
  if (triangles <= LOD0_MIN_TRIANGLES) return part;
  const target = Math.max(LOD0_MIN_TRIANGLES, Math.floor(triangles * LOD0_RATIO)) * 3;
  let [simplified] = MeshoptSimplifier.simplify(part.indices, part.positions, 3, target, LOD0_ERROR);
  // Topology-preserving simplification stalls on some meshes; fall back to sloppy
  // (vertex clustering) so the low-detail body stays small. It is replaced within seconds.
  if (simplified.length > target * 2) [simplified] = MeshoptSimplifier.simplifySloppy(part.indices, part.positions, 3, null, target, LOD0_ERROR);
  if (simplified.length === 0) return part;
  const [remap, count] = MeshoptSimplifier.compactMesh(simplified);
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  for (let old = 0; old < remap.length; old++) {
    const n = remap[old];
    if (n === 0xffffffff) continue;
    positions.set(part.positions.subarray(old * 3, old * 3 + 3), n * 3);
    normals.set(part.normals.subarray(old * 3, old * 3 + 3), n * 3);
  }
  return {...part, positions, normals, indices: simplified};
}

// --- Encode a list of parts into one streaming file -------------------------------------
const files = [];
let maxQuantError = 0;
function emitFile(name, system, lod, list, normal) {
  let vertexCount = 0, indexCount = 0;
  const prepared = list.map(part => {
    // Reorder for vertex-cache efficiency and better meshopt compression.
    const indices = part.indices.slice();
    const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, true);
    const positions = new Float32Array(unique * 3), normals = new Float32Array(unique * 3);
    for (let old = 0; old < remap.length; old++) {
      const n = remap[old];
      if (n === 0xffffffff) continue;
      positions.set(part.positions.subarray(old * 3, old * 3 + 3), n * 3);
      normals.set(part.normals.subarray(old * 3, old * 3 + 3), n * 3);
    }
    const entry = {part, positions, normals, indices, vertexStart: vertexCount, indexStart: indexCount};
    vertexCount += unique;
    indexCount += indices.length;
    return entry;
  });
  const qpos = new Uint16Array(vertexCount * 4), nrm = new Float32Array(vertexCount * 4), idx = new Uint32Array(indexCount);
  for (const e of prepared) {
    for (let v = 0; v < e.positions.length / 3; v++) {
      const o = (e.vertexStart + v) * 4;
      for (let a = 0; a < 3; a++) {
        const value = e.positions[v * 3 + a], q = Math.round((value - quant.origin[a]) / quant.scale);
        qpos[o + a] = q;
        maxQuantError = Math.max(maxQuantError, Math.abs(q * quant.scale + quant.origin[a] - value));
        nrm[o + a] = e.normals[v * 3 + a];
      }
      qpos[o + 3] = e.part.index;
    }
    for (let i = 0; i < e.indices.length; i++) idx[e.indexStart + i] = e.indices[i] + e.vertexStart;
  }
  const posStream = MeshoptEncoder.encodeGltfBuffer(new Uint8Array(qpos.buffer), vertexCount, 8, 'ATTRIBUTES', 1);
  const octNormals = MeshoptEncoder.encodeFilterOct(nrm, vertexCount, normal.stride, normal.bits);
  const nrmStream = MeshoptEncoder.encodeGltfBuffer(octNormals, vertexCount, normal.stride, 'ATTRIBUTES', 1);
  const idxStream = MeshoptEncoder.encodeGltfBuffer(new Uint8Array(idx.buffer), indexCount, 4, 'TRIANGLES');
  const pad = n => (4 - (n % 4)) % 4;
  const streams = {};
  const pieces = [];
  let offset = 0;
  for (const [key, data] of [['position', posStream], ['normal', nrmStream], ['index', idxStream]]) {
    streams[key] = {offset, length: data.length};
    pieces.push(Buffer.from(data), Buffer.alloc(pad(data.length)));
    offset += data.length + pad(data.length);
  }
  const raw = Buffer.concat(pieces), gz = gzipSync(raw, {level: 9});
  const hash = crypto.createHash('sha256').update(gz).digest('hex').slice(0, 10);
  const file = `${name}.${hash}.bin.gz`;
  fs.writeFileSync(path.join(output, file), gz);
  files.push({
    url: `models/${file}`, system, lod, bytes: gz.length, rawBytes: raw.length, vertexCount, indexCount,
    normalStride: normal.stride, streams,
    // [partIndex, indexStart, indexCount] for every part in this file
    parts: prepared.map(e => [e.part.index, e.indexStart, e.indices.length]),
    sourceBytes: list.reduce((n, p) => n + p.positions.length * 4 + p.normals.length * 2 + p.indices.length * 4, 0),
  });
}

// --- Clean previous outputs ----------------------------------------------------------------
fs.mkdirSync(output, {recursive: true});
for (const f of fs.readdirSync(output)) {
  if (/^(body-\d+\.bin(\.gz)?|atlas\.json|manifest\.json|concepts\..+\.json|.+\.[0-9a-f]{10}\.bin\.gz)$/.test(f)) fs.unlinkSync(path.join(output, f));
}

const centreY = p => (p.meta.bounds[0][1] + p.meta.bounds[1][1]) / 2;
const bySystem = system => parts.filter(p => p.meta.system === system).sort((a, b) => centreY(b) - centreY(a));
const systems = SYSTEM_ORDER.filter(s => parts.some(p => p.meta.system === s));

// Low-detail body: one file, parts grouped by system so each system is a contiguous index range.
emitFile('lod0', 'all', 0, systems.flatMap(s => bySystem(s).map(simplifyPart)), LOD0_NORMAL);
const lod0 = files[0];
const lod0Systems = {};
for (const [partIndex, indexStart, count] of lod0.parts) {
  const s = atlas.parts[partIndex].system, r = (lod0Systems[s] ??= [indexStart, 0]);
  r[1] = indexStart + count - r[0];
}
lod0.systems = lod0Systems;

// Full detail: split each system into files of at most MAX_TRIANGLES_PER_FILE, head to toe.
for (const system of systems) {
  // Balance the split so there is no tiny trailing file (each one is an extra draw call).
  const list = bySystem(system), total = list.reduce((t, p) => t + p.indices.length / 3, 0);
  const fileCount = Math.ceil(total / MAX_TRIANGLES_PER_FILE), perFile = total / fileCount;
  let batch = [], triangles = 0, n = 0;
  const flush = () => { if (batch.length) emitFile(`${system}-${n++}`, system, 1, batch, FULL_NORMAL); batch = []; triangles = 0; };
  for (const part of list) {
    if (batch.length && n < fileCount - 1 && triangles + part.indices.length / 3 / 2 > perFile) flush();
    batch.push(part);
    triangles += part.indices.length / 3;
  }
  flush();
}

// Concepts are only needed for search, so they load after the body is on screen.
const conceptsJson = JSON.stringify(atlas.concepts);
const conceptsFile = `concepts.${crypto.createHash('sha256').update(conceptsJson).digest('hex').slice(0, 10)}.json`;
fs.writeFileSync(path.join(output, conceptsFile), conceptsJson);

const round = v => Math.round(v * 1e5) / 1e5;
const manifest = {
  format: 2,
  version: atlas.version,
  build: crypto.createHash('sha256').update(files.map(f => f.url).join() + conceptsFile).digest('hex').slice(0, 10),
  triangles: {lod0: lod0.indexCount / 3, full: atlas.triangles, source: atlas.sourceTriangles},
  quant,
  concepts: `models/${conceptsFile}`,
  parts: atlas.parts.map(p => ({id: p.id, name: p.name, conceptId: p.conceptId, system: p.system, bounds: p.bounds.map(b => b.map(round))})),
  files: files.map(({sourceBytes, ...f}) => f),
};
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest));

// --- Report -------------------------------------------------------------------------------
const mb = n => (n / 1e6).toFixed(2).padStart(6) + ' MB';
console.log(`Quantisation step ${(quant.scale * 1000).toFixed(4)} mm, max error ${(maxQuantError * 1000).toFixed(4)} mm`);
console.log('file'.padEnd(34), 'tris'.padStart(8), 'source', '   meshopt', '      gzip');
for (const f of files) console.log(f.url.split('/').pop().padEnd(34), String(f.indexCount / 3).padStart(8), mb(f.sourceBytes), mb(f.rawBytes), mb(f.bytes));
const total = files.reduce((n, f) => n + f.bytes, 0);
console.log(`Geometry total ${mb(total)} in ${files.length} files (LOD0 ${mb(lod0.bytes)})`);
console.log(`manifest.json ${mb(fs.statSync(path.join(output, 'manifest.json')).size)} raw, ${mb(gzipSync(JSON.stringify(manifest)).length)} gzip`);
console.log(`${conceptsFile} ${mb(conceptsJson.length)} raw, ${mb(gzipSync(conceptsJson).length)} gzip`);
