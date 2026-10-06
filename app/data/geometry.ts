// Downloads and decodes one streaming geometry file into a Three.js BufferGeometry.
// Decoding (meshopt) runs in Web Workers; the main thread only dequantises positions.
import * as T from 'three';
import {MeshoptDecoder} from 'meshoptimizer/decoder';
import {decodeModelResponse} from '../model-download';
import {assetUrl, type GeometryFile, type Manifest} from './manifest';

let decoderReady: Promise<void> | null = null;
function decoder() {
  decoderReady ??= MeshoptDecoder.ready.then(() => {
    MeshoptDecoder.useWorkers(Math.min(4, Math.max(1, (navigator.hardwareConcurrency ?? 4) - 1)));
  });
  return decoderReady;
}

export interface DecodedFile {
  file: GeometryFile;
  /** Shared by the render mesh and the per-part pick meshes. */
  geometry: T.BufferGeometry;
}

/**
 * Fetches, gunzips and decodes a file. Positions become float32 (body space, metres),
 * normals stay as normalised int8/int16 and partIndex is a uint16 attribute that the
 * part-state shader uses to look up offset, visibility and selection.
 */
export async function loadGeometryFile(manifest: Manifest, file: GeometryFile, signal: AbortSignal,
  onBytes?: (bytes: number) => void): Promise<DecodedFile> {
  const [response] = await Promise.all([fetch(assetUrl(file.url), {signal}), decoder()]);
  const buffer = new Uint8Array(await decodeModelResponse(response, file.rawBytes, true));
  onBytes?.(file.bytes);
  const stream = (r: {offset: number; length: number}) => buffer.subarray(r.offset, r.offset + r.length);
  const {vertexCount, indexCount, normalStride} = file;

  const [qpos, nrm, idx] = await Promise.all([
    MeshoptDecoder.decodeGltfBufferAsync(vertexCount, 8, stream(file.streams.position), 'ATTRIBUTES'),
    MeshoptDecoder.decodeGltfBufferAsync(vertexCount, normalStride, stream(file.streams.normal), 'ATTRIBUTES', 'OCTAHEDRAL'),
    MeshoptDecoder.decodeGltfBufferAsync(indexCount, 4, stream(file.streams.index), 'TRIANGLES'),
  ]);

  // Dequantise uint16 positions to metres and split out the per-vertex part index.
  const q = new Uint16Array(qpos.buffer, qpos.byteOffset, vertexCount * 4);
  const positions = new Float32Array(vertexCount * 3), partIndex = new Uint16Array(vertexCount);
  const {origin, scale} = manifest.quant;
  for (let v = 0; v < vertexCount; v++) {
    positions[v * 3] = origin[0] + q[v * 4] * scale;
    positions[v * 3 + 1] = origin[1] + q[v * 4 + 1] * scale;
    positions[v * 3 + 2] = origin[2] + q[v * 4 + 2] * scale;
    partIndex[v] = q[v * 4 + 3];
  }

  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  const normals = normalStride === 4
    ? new T.InterleavedBuffer(new Int8Array(nrm.buffer, nrm.byteOffset, vertexCount * 4), 4)
    : new T.InterleavedBuffer(new Int16Array(nrm.buffer, nrm.byteOffset, vertexCount * 4), 4);
  geometry.setAttribute('normal', new T.InterleavedBufferAttribute(normals, 3, 0, true));
  geometry.setAttribute('partIndex', new T.BufferAttribute(partIndex, 1));
  geometry.setIndex(new T.BufferAttribute(new Uint32Array(idx.buffer, idx.byteOffset, indexCount), 1));
  return {file, geometry};
}

/** A geometry that shares every attribute of `source` but draws only part of its index. */
export function shareGeometry(source: T.BufferGeometry, indexStart: number, indexCount: number) {
  const g = new T.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) g.setAttribute(name, attribute);
  g.setIndex(source.getIndex());
  g.setDrawRange(indexStart, indexCount);
  return g;
}

/**
 * A lightweight view of one part inside a decoded file, used only for raycasting.
 * It shares the file's attributes and limits the triangles with drawRange.
 */
export function partPickGeometry(source: T.BufferGeometry, indexStart: number, indexCount: number, bounds: T.Box3) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', source.getAttribute('position'));
  g.setIndex(source.getIndex());
  g.setDrawRange(indexStart, indexCount);
  g.boundingBox = bounds.clone();
  g.boundingSphere = bounds.getBoundingSphere(new T.Sphere());
  return g;
}
