// Validates the streaming geometry in public/models against its manifest:
// every file decodes, hashes match file names, indices are in range, every vertex's
// partIndex belongs to its part range, and every part appears once in the low-detail
// body and exactly once in full detail.
// Usage: node scripts/validate-atlas.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {MeshoptDecoder} from 'meshoptimizer/decoder';

await MeshoptDecoder.ready;
const base = new URL('../public/models/', import.meta.url);
const read = url => fs.readFileSync(new URL(url.replace(/^models\//, ''), base));
const manifest = JSON.parse(read('models/manifest.json'));
const concepts = JSON.parse(read(manifest.concepts));

assert.equal(manifest.format, 2);
assert.equal(manifest.parts.length, 2234);
assert.equal(concepts.length, 3432);
const ids = new Set(manifest.parts.map(p => p.id));
assert.equal(ids.size, manifest.parts.length);
for (const p of manifest.parts) {
  assert.ok(p.name.trim() && p.name !== '-' && p.conceptId !== '-' && p.system, `${p.id}: incomplete record`);
  for (let a = 0; a < 3; a++) assert.ok(p.bounds[0][a] <= p.bounds[1][a], `${p.id}: bad bounds`);
}
for (const c of concepts) {
  assert.ok(c.elements.length);
  for (const id of c.elements) assert.ok(ids.has(id), `${c.id}: missing ${id}`);
}

const seen = [new Map(), new Map()];
const triangles = [0, 0];
for (const file of manifest.files) {
  const gz = read(file.url);
  assert.equal(gz.length, file.bytes, `${file.url}: size`);
  const hash = crypto.createHash('sha256').update(gz).digest('hex').slice(0, 10);
  assert.ok(file.url.includes(`.${hash}.`), `${file.url}: content hash mismatch`);
  const raw = gunzipSync(gz);
  assert.equal(raw.length, file.rawBytes);
  const stream = r => new Uint8Array(raw.buffer, raw.byteOffset + r.offset, r.length);
  const pos = new Uint8Array(file.vertexCount * 8), nrm = new Uint8Array(file.vertexCount * file.normalStride), idx = new Uint8Array(file.indexCount * 4);
  MeshoptDecoder.decodeGltfBuffer(pos, file.vertexCount, 8, stream(file.streams.position), 'ATTRIBUTES');
  MeshoptDecoder.decodeGltfBuffer(nrm, file.vertexCount, file.normalStride, stream(file.streams.normal), 'ATTRIBUTES', 'OCTAHEDRAL');
  MeshoptDecoder.decodeGltfBuffer(idx, file.indexCount, 4, stream(file.streams.index), 'TRIANGLES');
  const q = new Uint16Array(pos.buffer), indices = new Uint32Array(idx.buffer);
  for (const [partIndex, start, count] of file.parts) {
    assert.ok(count >= 3 && count % 3 === 0, `${file.url}: part ${partIndex} empty`);
    for (let i = start; i < start + count; i++) {
      assert.ok(indices[i] < file.vertexCount, `${file.url}: index out of range`);
      assert.equal(q[indices[i] * 4 + 3], partIndex, `${file.url}: vertex belongs to another part`);
    }
    const map = seen[file.lod];
    assert.ok(!map.has(partIndex), `part ${partIndex} appears twice at lod ${file.lod}`);
    map.set(partIndex, file.url);
    triangles[file.lod] += count / 3;
  }
  if (file.lod === 1) assert.ok(file.parts.every(([i]) => manifest.parts[i].system === file.system), `${file.url}: wrong system`);
}
for (const lod of [0, 1]) assert.equal(seen[lod].size, manifest.parts.length, `lod ${lod} is missing parts`);
assert.equal(triangles[0], manifest.triangles.lod0);
assert.equal(triangles[1], manifest.triangles.full);
console.log(`Verified ${manifest.files.length} files, ${ids.size} parts at both levels of detail, ${concepts.length} concepts, ` +
  `${triangles[1].toLocaleString()} full-detail and ${triangles[0].toLocaleString()} low-detail triangles.`);
