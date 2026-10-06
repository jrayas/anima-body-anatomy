// Benchmark panel, opened with ?bench in the URL. It shows frame rate, triangles and draw
// calls while the body turns, and switches between standard and full detail so the
// detail limit of a real device can be read off directly.
import type {SceneStats} from '../scene';
import type {DeviceTier} from '../render/device-tier';

interface Props {
  stats: SceneStats | null;
  onTier: (tier: DeviceTier) => void;
}

const millions = (n: number) => `${(n / 1e6).toFixed(2)}M`;

export function BenchPanel({stats, onTier}: Props) {
  const fpsClass = !stats ? '' : stats.fps >= 50 ? 'good' : stats.fps >= 30 ? 'ok' : 'poor';
  return (
    <section className="bench panel" aria-label="Benchmark">
      <header className="panel-head"><h2>Benchmark</h2></header>
      <dl>
        <div><dt>Frame rate</dt><dd className={fpsClass}>{stats ? `${stats.fps} fps` : '…'}</dd></div>
        <div><dt>Detail</dt><dd>{stats?.tier ?? '…'}</dd></div>
        <div><dt>Triangles loaded</dt><dd>{stats ? millions(stats.residentTriangles) : '…'}</dd></div>
        <div><dt>Triangles drawn per frame</dt><dd>{stats ? millions(stats.drawnTriangles) : '…'}</dd></div>
        <div><dt>Draw calls</dt><dd>{stats?.drawCalls ?? '…'}</dd></div>
        <div><dt>Files</dt><dd>{stats?.files ?? '…'}</dd></div>
      </dl>
      <div className="segmented" role="group" aria-label="Detail level">
        <button aria-pressed={stats?.tier === 'standard'} onClick={() => onTier('standard')}>Standard</button>
        <button aria-pressed={stats?.tier === 'full'} onClick={() => onTier('full')}>Full</button>
      </div>
      <p className="bench-hint">Let the body turn for 10 seconds after loading, then read the frame rate. Below 30 fps the device is struggling.</p>
    </section>
  );
}
