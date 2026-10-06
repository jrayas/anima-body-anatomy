// Builds Anima's streaming geometry directly from the official BodyParts3D archive.
//
// Input
//   work/source/obj/isa_BP3D_4.0_obj_99/*.obj   (extract isa_BP3D_4.0_obj_99.zip here; gitignored)
//   scripts/data/parts.json                     names, FMA concept IDs and system per mesh
//   scripts/data/concepts.json                  named concepts for search
//
// Processing, per source mesh
//   weld split vertices -> light Taubin smoothing (volume-guarded) -> smooth normals = "full"
//   simplify "full" to a global triangle budget                       = "standard"
//   simplify further                                                   = "low"
//
// Detail levels (see app/data/streamer.ts for which devices load which)
//   0 low       about 115k triangles, one file, shown first on every device
//   1 standard  about 1.6M triangles, phones and weak laptops
//   2 full      source resolution (6.7M triangles), PCs; phones load it only for focused parts
//
// Output in public/models/: manifest.json, concepts.<hash>.json and
// <level>-<system>-<n>.<hash>.bin.gz files. Each file is gzip(meshopt streams):
//   position: uint16 x, y, z + part index (8 bytes/vertex) on a global quantisation grid
//   normal:   octahedral int8 (low) or int16 (standard, full)
//   index:    uint32 triangle list (meshopt TRIANGLES codec)
// The part index is stored as index + level * 16384 so shaders know each copy's level.
//
// Usage: node scripts/build-streaming-assets.mjs [--source work/source/obj/isa_BP3D_4.0_obj_99]
//        [--standard 1600000] [--taubin 2]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {MeshoptEncoder, MeshoptSimplifier} from 'meshoptimizer';
import {readObj} from './lib/obj-source.mjs';
import {smoothNormals, taubin, volume, weld} from './lib/mesh-quality.mjs';

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const root = path.resolve(import.meta.dirname, '..');
const source = path.resolve(root, arg('source', 'work/source/obj/isa_BP3D_4.0_obj_99'));
const output = path.join(root, 'public/models');

// --- Tuning ---------------------------------------------------------------------------------
const STANDARD_TRIANGLES = Number(arg('standard', 1_600_000)); // whole-body budget for level 1
const LOW_TRIANGLES = 115_000;                                  // whole-body budget for level 0
const TAUBIN_ITERATIONS = Number(arg('taubin', 2));
const MAX_VOLUME_CHANGE = 0.03;      // smoothing is reduced or skipped for parts that would change more
const STANDARD_ERROR = 0.01;         // max relative simplification error for level 1
const LOW_ERROR = 0.1;               // level 0 is a placeholder and may be coarse
const MIN_TRIANGLES = 16;            // tiny parts are never simplified below this
const LEVEL_OFFSET = 16384;          // part index + level * LEVEL_OFFSET
const LEVELS = [
  {level: 0, name: 'low', normal: {stride: 4, bits: 8}, maxTrianglesPerFile: Infinity},
  {level: 1, name: 'standard', normal: {stride: 8, bits: 12}, maxTrianglesPerFile: 220_000},
  {level: 2, name: 'full', normal: {stride: 8, bits: 12}, maxTrianglesPerFile: 200_000},
];
// File order within a level follows the viewer's layer order.
const SYSTEM_ORDER = ['skeletal', 'muscular', 'cardiac', 'sensory', 'arterial', 'venous', 'nervous', 'respiratory',
  'digestive', 'urinary', 'lymphatic', 'endocrine', 'reproductive', 'integumentary', 'connective'];

const {parts: meta} = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/parts.json'), 'utf8'));
const concepts = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/concepts.json'), 'utf8'));
if (!fs.existsSync(source)) throw new Error(`Source OBJ folder not found: ${source}\nExtract isa_BP3D_4.0_obj_99.zip from https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html into work/source/obj/.`);
const started = Date.now();

// --- Full level: welded, lightly smoothed source meshes ----------------------------------------
const smoothingStats = {0: 0};
let sourceTriangles = 0, volumeChange = 0, smoothedParts = 0;
const parts = meta.map((m, index) => {
  const obj = readObj(path.join(source, `${m.id}.obj`));
  sourceTriangles += obj.indices.length / 3;
  let {positions, indices} = weld(obj.positions, obj.indices);
  // Thin tubes (small vessels, nerves) shrink under Laplacian smoothing, so each part gets
  // the most smoothing that keeps its volume within MAX_VOLUME_CHANGE.
  const before = Math.abs(volume(positions, indices));
  let applied = 0;
  for (let iterations = TAUBIN_ITERATIONS; iterations > 0; iterations--) {
    const smoothed = taubin(positions, indices, iterations);
    const change = before > 1e-12 ? Math.abs(Math.abs(volume(smoothed, indices)) - before) / before : 0;
    if (change > MAX_VOLUME_CHANGE) continue;
    positions = smoothed; applied = iterations; volumeChange += change; smoothedParts++;
    break;
  }
  smoothingStats[applied] = (smoothingStats[applied] ?? 0) + 1;
  const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (let v = 0; v < positions.length; v += 3) for (let a = 0; a < 3; a++) {
    bounds[0][a] = Math.min(bounds[0][a], positions[v + a]);
    bounds[1][a] = Math.max(bounds[1][a], positions[v + a]);
  }
  return {index, meta: m, bounds, levels: [null, null, {positions, indices, normals: smoothNormals(positions, indices)}]};
});
const fullTriangles = parts.reduce((n, p) => n + p.levels[2].indices.length / 3, 0);

// --- Simplified levels ------------------------------------------------------------------------
function simplify(mesh, ratio, error, sloppyFallback) {
  const triangles = mesh.indices.length / 3;
  if (triangles <= MIN_TRIANGLES) return mesh;
  const target = Math.max(MIN_TRIANGLES, Math.floor(triangles * ratio)) * 3;
  let [indices] = MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, target, error);
  // Topology-preserving simplification can stall; level 0 falls back to vertex clustering.
  if (sloppyFallback && indices.length > target * 2) [indices] = MeshoptSimplifier.simplifySloppy(mesh.indices, mesh.positions, 3, null, target, error);
  if (indices.length === 0) return mesh;
  const [remap, count] = MeshoptSimplifier.compactMesh(indices);
  const positions = new Float32Array(count * 3);
  for (let old = 0; old < remap.length; old++) {
    if (remap[old] !== 0xffffffff) positions.set(mesh.positions.subarray(old * 3, old * 3 + 3), remap[old] * 3);
  }
  return {positions, indices, normals: smoothNormals(positions, indices)};
}
for (const part of parts) {
  part.levels[1] = simplify(part.levels[2], STANDARD_TRIANGLES / fullTriangles, STANDARD_ERROR, false);
  part.levels[0] = simplify(part.levels[1], LOW_TRIANGLES / STANDARD_TRIANGLES, LOW_ERROR, true);
}

// --- Encoding -----------------------------------------------------------------------------------
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const p of parts) for (let a = 0; a < 3; a++) {
  min[a] = Math.min(min[a], p.bounds[0][a]);
  max[a] = Math.max(max[a], p.bounds[1][a]);
}
const quant = {origin: min, scale: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 65535};

const files = [];
let maxQuantError = 0;
function emitFile(name, system, level, list) {
  const {normal} = LEVELS[level];
  let vertexCount = 0, indexCount = 0;
  const prepared = list.map(part => {
    const mesh = part.levels[level];
    // Reorder for vertex-cache efficiency and better meshopt compression.
    const indices = mesh.indices.slice();
    const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, true);
    const positions = new Float32Array(unique * 3), normals = new Float32Array(unique * 3);
    for (let old = 0; old < remap.length; old++) {
      const n = remap[old];
      if (n === 0xffffffff) continue;
      positions.set(mesh.positions.subarray(old * 3, old * 3 + 3), n * 3);
      normals.set(mesh.normals.subarray(old * 3, old * 3 + 3), n * 3);
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
      qpos[o + 3] = e.part.index + level * LEVEL_OFFSET;
    }
    for (let i = 0; i < e.indices.length; i++) idx[e.indexStart + i] = e.indices[i] + e.vertexStart;
  }
  const streams = {}, pieces = [];
  let offset = 0;
  for (const [key, data] of [
    ['position', MeshoptEncoder.encodeGltfBuffer(new Uint8Array(qpos.buffer), vertexCount, 8, 'ATTRIBUTES', 1)],
    ['normal', MeshoptEncoder.encodeGltfBuffer(MeshoptEncoder.encodeFilterOct(nrm, vertexCount, normal.stride, normal.bits), vertexCount, normal.stride, 'ATTRIBUTES', 1)],
    ['index', MeshoptEncoder.encodeGltfBuffer(new Uint8Array(idx.buffer), indexCount, 4, 'TRIANGLES')],
  ]) {
    const pad = (4 - (data.length % 4)) % 4;
    streams[key] = {offset, length: data.length};
    pieces.push(Buffer.from(data), Buffer.alloc(pad));
    offset += data.length + pad;
  }
  const raw = Buffer.concat(pieces), gz = gzipSync(raw, {level: 9});
  const file = `${name}.${crypto.createHash('sha256').update(gz).digest('hex').slice(0, 10)}.bin.gz`;
  fs.writeFileSync(path.join(output, file), gz);
  files.push({
    url: `models/${file}`, system, level, bytes: gz.length, rawBytes: raw.length, vertexCount, indexCount,
    normalStride: normal.stride, streams,
    // [partIndex, indexStart, indexCount] for every part in this file
    parts: prepared.map(e => [e.part.index, e.indexStart, e.indices.length]),
  });
  return files.at(-1);
}

fs.mkdirSync(output, {recursive: true});
for (const f of fs.readdirSync(output)) {
  if (/^(manifest\.json|concepts\..+\.json|.+\.[0-9a-f]{10}\.bin\.gz)$/.test(f)) fs.unlinkSync(path.join(output, f));
}

const centreY = p => (p.bounds[0][1] + p.bounds[1][1]) / 2;
const systems = SYSTEM_ORDER.filter(s => parts.some(p => p.meta.system === s));
const bySystem = system => parts.filter(p => p.meta.system === system).sort((a, b) => centreY(b) - centreY(a));

// Level 0: one file, systems contiguous so each system is one draw range.
const low = emitFile('low', 'all', 0, systems.flatMap(bySystem));
low.systems = {};
for (const [partIndex, indexStart, count] of low.parts) {
  const r = (low.systems[meta[partIndex].system] ??= [indexStart, 0]);
  r[1] = indexStart + count - r[0];
}

// Levels 1 and 2: per system, head to toe, balanced into files of bounded size.
for (const {level, name, maxTrianglesPerFile} of LEVELS.slice(1)) {
  for (const system of systems) {
    const list = bySystem(system), total = list.reduce((t, p) => t + p.levels[level].indices.length / 3, 0);
    const fileCount = Math.ceil(total / maxTrianglesPerFile), perFile = total / fileCount;
    let batch = [], triangles = 0, n = 0;
    const flush = () => { if (batch.length) emitFile(`${name}-${system}-${n++}`, system, level, batch); batch = []; triangles = 0; };
    for (const part of list) {
      const t = part.levels[level].indices.length / 3;
      if (batch.length && n < fileCount - 1 && triangles + t / 2 > perFile) flush();
      batch.push(part);
      triangles += t;
    }
    flush();
  }
}

const conceptsJson = JSON.stringify(concepts);
const conceptsFile = `concepts.${crypto.createHash('sha256').update(conceptsJson).digest('hex').slice(0, 10)}.json`;
fs.writeFileSync(path.join(output, conceptsFile), conceptsJson);

const levelTriangles = level => parts.reduce((n, p) => n + p.levels[level].indices.length / 3, 0);
const round = v => Math.round(v * 1e5) / 1e5;
const manifest = {
  format: 3,
  version: 'BodyParts3D 4.0',
  build: crypto.createHash('sha256').update(files.map(f => f.url).join() + conceptsFile).digest('hex').slice(0, 10),
  levels: LEVELS.map(({level, name}) => ({level, name, triangles: levelTriangles(level)})),
  levelOffset: LEVEL_OFFSET,
  sourceTriangles,
  quant,
  concepts: `models/${conceptsFile}`,
  parts: parts.map(({meta: p, bounds}) => ({id: p.id, name: p.name, conceptId: p.conceptId, system: p.system, bounds: bounds.map(b => b.map(round))})),
  files,
};
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest));

// --- Report -------------------------------------------------------------------------------------
const mb = n => (n / 1e6).toFixed(2).padStart(6) + ' MB';
console.log(`Source: ${sourceTriangles.toLocaleString('en-GB')} triangles from ${parts.length} meshes`);
console.log(`Taubin smoothing: parts by iterations ${JSON.stringify(smoothingStats)}; mean volume change ${(volumeChange / Math.max(1, smoothedParts) * 100).toFixed(2)}% (max ${MAX_VOLUME_CHANGE * 100}%)`);
console.log(`Quantisation step ${(quant.scale * 1000).toFixed(4)} mm, max error ${(maxQuantError * 1000).toFixed(4)} mm`);
for (const {level, name} of LEVELS) {
  const fs_ = files.filter(f => f.level === level);
  console.log(`Level ${level} ${name.padEnd(8)} ${levelTriangles(level).toLocaleString('en-GB').padStart(10)} triangles  ${String(fs_.length).padStart(3)} files  ${mb(fs_.reduce((n, f) => n + f.bytes, 0))}`);
}
console.log(`Total hosted geometry ${mb(files.reduce((n, f) => n + f.bytes, 0))}; manifest ${mb(gzipSync(JSON.stringify(manifest)).length)} gzip; built in ${((Date.now() - started) / 1000).toFixed(0)} s`);
