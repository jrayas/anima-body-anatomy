// System layers: presets, one row per system (name = show only this, switch = toggle).
// On phones it becomes a bottom sheet opened from the control deck.
import {X} from 'lucide-react';
import {Switch} from '@/components/ui/switch';
import {SYSTEMS, type SystemId} from '../anatomy';
import {UI} from '../content';

const ORGANS: SystemId[] = ['cardiac', 'respiratory', 'digestive', 'urinary', 'endocrine', 'reproductive'];

interface Props {
  visible: SystemId[];
  counts: Record<string, number>;
  shownParts: number;
  mobileOpen: boolean;
  onClose: () => void;
  onChange: (visible: SystemId[]) => void;
}

export function LayersPanel({visible, counts, shownParts, mobileOpen, onClose, onChange}: Props) {
  const systems = SYSTEMS.filter(s => counts[s.id] > 0);
  const same = (ids: SystemId[]) => ids.length === visible.length && ids.every(id => visible.includes(id));
  const presets: [string, SystemId[]][] = [
    [UI.presets.all, systems.map(s => s.id)],
    [UI.presets.bones, ['skeletal']],
    [UI.presets.organs, ORGANS],
    [UI.presets.none, []],
  ];
  return (
    <section className={`layers panel ${mobileOpen ? 'mobile-open' : ''}`} aria-label={UI.layers}>
      <header className="panel-head">
        <h2>{UI.layers}</h2>
        <button className="icon-chip mobile-only" onClick={onClose} aria-label="Close layers"><X size={17}/></button>
      </header>
      <div className="segmented presets" role="group" aria-label="Layer presets">
        {presets.map(([label, ids]) => (
          <button key={label} aria-pressed={same(ids)} onClick={() => onChange(ids)}>{label}</button>
        ))}
      </div>
      <ul className="system-list">
        {systems.map(s => {
          const on = visible.includes(s.id);
          return (
            <li key={s.id} className={`system-row ${on ? 'on' : ''}`} style={{'--system': s.color} as React.CSSProperties}>
              <button className="system-name" title={UI.showOnly(s.name)} onClick={() => onChange([s.id])}>
                <span className="system-swatch" aria-hidden="true"/>{s.name}<span className="system-count">{counts[s.id]}</span>
              </button>
              <Switch checked={on} aria-label={UI.toggleSystem(s.name)}
                onCheckedChange={() => onChange(on ? visible.filter(x => x !== s.id) : [...visible, s.id])}/>
            </li>
          );
        })}
      </ul>
      <footer className="panel-foot">{UI.partsShown(shownParts)}</footer>
    </section>
  );
}
