// Keeps track of which geometry files are in the scene and, for every part, which detail
// levels are resident. Adding or removing a file updates:
//   - the render meshes (one draw call per file, or per system range for the level 0 body)
//   - selectionState.g, the best resident level per part (shaders hide worse copies)
//   - the pick mesh used for raycasting, always the best resident level
import * as T from 'three';
import type {SystemId} from '../anatomy';
import {partPickGeometry, shareGeometry, type DecodedFile} from '../data/geometry';
import type {GeometryFile} from '../data/manifest';
import {LEVEL_STEP} from './materials';

interface Entry {
  file: GeometryFile;
  meshes: T.Mesh[];
  geometries: T.BufferGeometry[];
  picks: Map<number, T.Mesh>;
}

export class Residency {
  private readonly entries = new Map<GeometryFile, Entry>();
  /** Per part: resident level -> pick mesh. */
  private readonly levels: Map<number, T.Mesh>[];
  triangles = 0;

  constructor(
    private readonly scene: T.Scene,
    private readonly materials: Map<SystemId, T.Material>,
    private readonly bounds: T.Box3[],
    /** Best-level pick mesh per part, read by the scene's raycasting. */
    readonly pickers: (T.Mesh | undefined)[],
    /** selectionState data (RGBA bytes per part) and its texture. */
    private readonly flags: Uint8Array,
    private readonly flagTexture: T.DataTexture,
    /** Current explode offset of a part, so new pick meshes start in the right place. */
    private readonly offsetOf: (part: number) => [number, number, number],
  ) {
    this.levels = bounds.map(() => new Map());
  }

  add({file, geometry}: DecodedFile) {
    const entry: Entry = {file, meshes: [], geometries: [geometry], picks: new Map()};
    const ranges: [string, number, number][] = file.level === 0
      ? Object.entries(file.systems ?? {}).map(([s, r]) => [s, r[0], r[1]])
      : [[file.system, 0, file.indexCount]];
    for (const [system, start, count] of ranges) {
      const g = file.level === 0 ? shareGeometry(geometry, start, count) : geometry;
      if (g !== geometry) entry.geometries.push(g);
      const mesh = new T.Mesh(g, this.materials.get(system as SystemId));
      mesh.frustumCulled = false;
      mesh.name = `${system}:level${file.level}`;
      this.scene.add(mesh);
      entry.meshes.push(mesh);
    }
    for (const [part, start, count] of file.parts) {
      const g = partPickGeometry(geometry, start, count, this.bounds[part]);
      entry.geometries.push(g);
      const pick = new T.Mesh(g);
      pick.matrixAutoUpdate = false;
      entry.picks.set(part, pick);
      this.levels[part].set(file.level, pick);
      this.refresh(part);
    }
    this.entries.set(file, entry);
    this.triangles += file.indexCount / 3;
    this.flagTexture.needsUpdate = true;
  }

  remove(file: GeometryFile) {
    const entry = this.entries.get(file);
    if (!entry) return;
    for (const mesh of entry.meshes) this.scene.remove(mesh);
    for (const g of entry.geometries) g.dispose();
    for (const part of entry.picks.keys()) {
      this.levels[part].delete(file.level);
      this.refresh(part);
    }
    this.entries.delete(file);
    this.triangles -= file.indexCount / 3;
    this.flagTexture.needsUpdate = true;
  }

  /** Number of files and triangles currently resident (for the benchmark panel). */
  stats() {
    return {files: this.entries.size, triangles: this.triangles};
  }

  dispose() {
    for (const file of [...this.entries.keys()]) this.remove(file);
  }

  private refresh(part: number) {
    const levels = this.levels[part];
    const best = levels.size ? Math.max(...levels.keys()) : 0;
    this.flags[part * 4 + 1] = best * LEVEL_STEP;
    const pick = levels.get(best);
    if (pick) {
      pick.position.set(...this.offsetOf(part));
      pick.updateMatrix();
      pick.updateMatrixWorld(true);
    }
    this.pickers[part] = pick;
  }
}
