// Reads one BodyParts3D OBJ file into typed arrays in Anima's coordinate system.
// Source: millimetres, Z-up. Anima: metres, Y-up, standing on the stage at y = 0
// (the same transform the original Human Atlas converter used, so part positions match).
// Source normals are ignored; they are recalculated after welding.
import fs from 'node:fs';

/** @returns {{positions: Float32Array, indices: Uint32Array}} */
export function readObj(file) {
  const text = fs.readFileSync(file, 'utf8');
  const positions = [], indices = [];
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const c0 = text.charCodeAt(start), c1 = text.charCodeAt(start + 1);
    if (c0 === 118 /* v */ && c1 === 32 /* space */) {
      const [x, y, z] = text.slice(start + 2, end).trim().split(/\s+/).map(Number);
      positions.push(x * 0.001, z * 0.001 + 0.0781112, -y * 0.001 - 0.1);
    } else if (c0 === 102 /* f */ && c1 === 32) {
      const face = text.slice(start + 2, end).trim().split(/\s+/).map(s => parseInt(s, 10) - 1);
      // Fan-triangulate polygons (the source is triangles, but be safe).
      for (let j = 1; j < face.length - 1; j++) indices.push(face[0], face[j], face[j + 1]);
    }
    start = end + 1;
  }
  return {positions: new Float32Array(positions), indices: new Uint32Array(indices)};
}
