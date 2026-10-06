// Decides which geometry files should be resident and downloads them a few at a time.
//
//   level 0  the low-detail body, always loaded first
//   level 1  standard detail for wanted systems         (device tier 'standard')
//   level 2  source resolution for wanted systems        (device tier 'full')
//            or only for focused / zoomed-in parts       (device tier 'standard')
//
// On the standard tier, level 2 files that are no longer needed are released to keep
// memory low on phones. Hidden systems are never fetched until they are shown.
import type {SystemId} from '../anatomy';
import type {DeviceTier} from '../render/device-tier';
import {loadGeometryFile, type DecodedFile} from './geometry';
import type {GeometryFile, Manifest} from './manifest';

interface Callbacks {
  onFile: (decoded: DecodedFile) => void;
  /** Called when a resident file should be removed from the scene and GPU. */
  onRelease: (file: GeometryFile) => void;
  /** Bytes downloaded and total bytes for the currently wanted files (excluding close-ups). */
  onProgress: (loaded: number, total: number) => void;
  onError: (message: string) => void;
}

export interface Wanted {
  systems: Iterable<SystemId>;
  /** Parts that should be at source resolution even on the standard tier. */
  closeUp?: Iterable<number>;
}

export class SystemStreamer {
  private readonly abort = new AbortController();
  private readonly resident = new Set<GeometryFile>();
  private readonly inFlight = new Set<GeometryFile>();
  private readonly fileOfPart = new Map<number, GeometryFile>();
  private desired: GeometryFile[] = [];
  private bodyFiles = new Set<GeometryFile>();
  private wanted: Wanted = {systems: []};

  constructor(private readonly manifest: Manifest, private tier: DeviceTier, private readonly callbacks: Callbacks,
    private readonly concurrency = 3) {
    for (const f of manifest.files) if (f.level === 2) for (const [part] of f.parts) this.fileOfPart.set(part, f);
  }

  /** Loads the low-detail body. Resolves once it is decoded. */
  async loadLowDetail(): Promise<DecodedFile> {
    const low = this.manifest.files.find(f => f.level === 0);
    if (!low) throw new Error('The anatomy catalogue has no low-detail body.');
    const decoded = await loadGeometryFile(this.manifest, low, this.abort.signal);
    this.resident.add(low);
    return decoded;
  }

  getTier() { return this.tier; }

  setTier(tier: DeviceTier) {
    this.tier = tier;
    this.want(this.wanted);
  }

  /** Updates what should be resident, releases what is no longer needed and starts downloads. */
  want(wanted: Wanted) {
    this.wanted = wanted;
    const systems = new Set(wanted.systems);
    const bodyLevel = this.tier === 'full' ? 2 : 1;
    const body = this.manifest.files.filter(f => f.level === bodyLevel && systems.has(f.system as SystemId));
    const closeUp = new Set<GeometryFile>();
    if (this.tier === 'standard') for (const part of wanted.closeUp ?? []) {
      const file = this.fileOfPart.get(part);
      if (file) closeUp.add(file);
    }
    // Close-ups first: they are what the visitor is looking at.
    this.desired = [...closeUp, ...body];
    this.bodyFiles = new Set(body);

    // Release files that are no longer useful. Level 1 stays once loaded (it is small);
    // level 2 is released on the standard tier, and everything above level 0 that does
    // not belong to the current tier is released when the tier changes.
    const keep = new Set(this.desired);
    for (const file of [...this.resident]) {
      if (file.level === 0 || keep.has(file)) continue;
      const wrongTier = (this.tier === 'full' && file.level === 1) || (this.tier === 'standard' && file.level === 2);
      if (wrongTier) {
        this.resident.delete(file);
        this.callbacks.onRelease(file);
      }
    }
    this.report();
    this.pump();
  }

  /** True when every desired file has been decoded. */
  isComplete() {
    return this.desired.every(f => this.resident.has(f));
  }

  dispose() {
    this.abort.abort();
  }

  private pump() {
    while (this.inFlight.size < this.concurrency) {
      const next = this.desired.find(f => !this.resident.has(f) && !this.inFlight.has(f));
      if (!next) return;
      this.inFlight.add(next);
      loadGeometryFile(this.manifest, next, this.abort.signal)
        .then(decoded => {
          if (this.abort.signal.aborted) return;
          // The visitor may have moved on while this was downloading.
          if (!this.desired.includes(next) && next.level === 2 && this.tier === 'standard') return;
          this.resident.add(next);
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
    for (const f of this.bodyFiles) {
      total += f.bytes;
      if (this.resident.has(f)) loaded += f.bytes;
    }
    this.callbacks.onProgress(loaded, total);
  }
}
