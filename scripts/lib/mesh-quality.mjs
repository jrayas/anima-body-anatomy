// Offline mesh clean-up used by build-streaming-assets.mjs. All functions are pure:
// they take typed arrays for one part and return new ones.
//
// - weld:          merge vertices that share a position (the source splits vertices along
//                  seams, which creates visible shading creases).
// - smoothNormals: angle-weighted vertex normals recalculated from the final surface.
// - taubin:        Taubin lambda/mu smoothing, which removes faceting and noise while
//                  approximately preserving volume. Open-boundary vertices are pinned so
//                  thin sheets (muscles, membranes) do not shrink at their edges.

/** Merges vertices with identical positions and drops triangles that collapse. */
export function weld(positions, indices) {
  const map = new Map(), remap = new Uint32Array(positions.length / 3), out = [];
  for (let v = 0; v < remap.length; v++) {
    const key = `${positions[v * 3]},${positions[v * 3 + 1]},${positions[v * 3 + 2]}`;
    let n = map.get(key);
    if (n === undefined) {
      n = out.length / 3;
      map.set(key, n);
      out.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
    }
    remap[v] = n;
  }
  const tris = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = remap[indices[i]], b = remap[indices[i + 1]], c = remap[indices[i + 2]];
    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }
  return {positions: new Float32Array(out), indices: new Uint32Array(tris)};
}

/** Angle-weighted vertex normals (robust to uneven triangle sizes). */
export function smoothNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  const p = i => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const angle = (a, b) => {
    const la = len(a), lb = len(b);
    if (!la || !lb) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb))));
  };
  for (let i = 0; i < indices.length; i += 3) {
    const ids = [indices[i], indices[i + 1], indices[i + 2]], v = ids.map(p);
    const n = cross(sub(v[1], v[0]), sub(v[2], v[0])), l = len(n);
    if (!l) continue;
    for (let k = 0; k < 3; k++) {
      const w = angle(sub(v[(k + 1) % 3], v[k]), sub(v[(k + 2) % 3], v[k]));
      for (let a = 0; a < 3; a++) normals[ids[k] * 3 + a] += (n[a] / l) * w;
    }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const l = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1;
    normals[v] /= l; normals[v + 1] /= l; normals[v + 2] /= l;
  }
  return normals;
}

/** Vertex adjacency and open-boundary flags for a triangle mesh. */
function topology(vertexCount, indices) {
  const neighbours = Array.from({length: vertexCount}, () => new Set());
  const edges = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[i + k], b = indices[i + (k + 1) % 3];
      neighbours[a].add(b); neighbours[b].add(a);
      const key = a < b ? a * vertexCount + b : b * vertexCount + a;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  const boundary = new Uint8Array(vertexCount);
  for (const [key, count] of edges) {
    if (count !== 1) continue;
    boundary[Math.floor(key / vertexCount)] = 1;
    boundary[key % vertexCount] = 1;
  }
  return {neighbours: neighbours.map(s => Uint32Array.from(s)), boundary};
}

/**
 * Taubin smoothing: alternate a shrinking step (lambda) and an inflating step (mu)
 * of uniform Laplacian smoothing. Returns new positions; boundary vertices stay fixed.
 */
export function taubin(positions, indices, iterations = 2, lambda = 0.5, mu = -0.53) {
  const count = positions.length / 3, {neighbours, boundary} = topology(count, indices);
  let current = positions.slice(), next = new Float32Array(positions.length);
  const step = factor => {
    for (let v = 0; v < count; v++) {
      const ns = neighbours[v];
      if (boundary[v] || ns.length === 0) {
        next[v * 3] = current[v * 3]; next[v * 3 + 1] = current[v * 3 + 1]; next[v * 3 + 2] = current[v * 3 + 2];
        continue;
      }
      let x = 0, y = 0, z = 0;
      for (const n of ns) { x += current[n * 3]; y += current[n * 3 + 1]; z += current[n * 3 + 2]; }
      x /= ns.length; y /= ns.length; z /= ns.length;
      next[v * 3] = current[v * 3] + factor * (x - current[v * 3]);
      next[v * 3 + 1] = current[v * 3 + 1] + factor * (y - current[v * 3 + 1]);
      next[v * 3 + 2] = current[v * 3 + 2] + factor * (z - current[v * 3 + 2]);
    }
    [current, next] = [next, current];
  };
  for (let i = 0; i < iterations; i++) { step(lambda); step(mu); }
  return current;
}

/** Signed volume of a closed mesh (used to report how much smoothing changed a part). */
export function volume(positions, indices) {
  let v = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    v += positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1])
      - positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c])
      + positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
  }
  return v / 6;
}
