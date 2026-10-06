// On-demand, prioritised loading of full-detail geometry by system.
// The scene tells the streamer which systems are wanted (visible or selected); only
// those files are downloaded, a few at a time, in manifest order (skeleton first).
// Hidden systems are not fetched until they are shown.
import type {SystemId} from '../anatomy';
import {loadGeometryFile, type DecodedFile} from './geometry';
import type {GeometryFile, Manifest} from './manifest';

interface Callbacks {
  onFile: (decoded: DecodedFile) => void;
  /** Bytes downloaded and total bytes for the currently wanted full-detail files. */
  onProgress: (loaded: number, total: number) => void;
  onError: (message: string) => void;
}

export class SystemStreamer {
  private readonly abort = new AbortController();
  private readonly files: GeometryFile[];
  private readonly done = new Set<GeometryFile>();
  private readonly inFlight = new Set<GeometryFile>();
  private wanted = new Set<SystemId>();

  constructor(private readonly manifest: Manifest, private readonly callbacks: Callbacks, private readonly concurrency = 3) {
    this.files = manifest.files.filter(f => f.lod === 1);
  }

  /** Loads the low-detail body. Resolves once it is decoded. */
  async loadLowDetail(): Promise<DecodedFile> {
    const lod0 = this.manifest.files.find(f => f.lod === 0);
    if (!lod0) throw new Error('The anatomy catalogue has no low-detail body.');
    return loadGeometryFile(this.manifest, lod0, this.abort.signal);
  }

  /** Updates the set of systems that should be in full detail and starts any downloads. */
  want(systems: Iterable<SystemId>) {
    this.wanted = new Set(systems);
    this.report();
    this.pump();
  }

  /** True when every file of the system has been decoded. */
  isComplete(system: SystemId) {
    return this.files.every(f => f.system !== system || this.done.has(f));
  }

  dispose() {
    this.abort.abort();
  }

  private pump() {
    while (this.inFlight.size < this.concurrency) {
      const next = this.files.find(f => this.wanted.has(f.system as SystemId) && !this.done.has(f) && !this.inFlight.has(f));
      if (!next) return;
      this.inFlight.add(next);
      loadGeometryFile(this.manifest, next, this.abort.signal)
        .then(decoded => {
          if (this.abort.signal.aborted) return;
          this.done.add(next);
          this.callbacks.onFile(decoded);
        })
        .catch(e => {
          if (!this.abort.signal.aborted) this.callbacks.onError(e instanceof Error ? e.message : 'Could not load the anatomy.');
        })
        .finally(() => {
          this.inFlight.delete(next);
          this.report();
          this.pump();
        });
    }
  }

  private report() {
    let loaded = 0, total = 0;
    for (const f of this.files) {
      if (!this.wanted.has(f.system as SystemId)) continue;
      total += f.bytes;
      if (this.done.has(f)) loaded += f.bytes;
    }
    this.callbacks.onProgress(loaded, total);
  }
}
