// Bottom control deck: camera views, the "spread apart" slider, turntable and reset.
import {Layers3, Pause, RotateCcw, RotateCw} from 'lucide-react';
import {Slider} from '@/components/ui/slider';
import type {View} from '../anatomy';
import {UI} from '../content';

interface Props {
  view: View;
  explode: number;
  rotate: boolean;
  onView: (view: View) => void;
  onExplode: (amount: number) => void;
  onRotate: () => void;
  onReset: () => void;
  onLayers: () => void;
}

export function ControlDeck({view, explode, rotate, onView, onExplode, onRotate, onReset, onLayers}: Props) {
  return (
    <nav className="deck panel" aria-label="View controls">
      <button className="deck-button mobile-only" onClick={onLayers} aria-label="Open layers"><Layers3 size={18}/><span>{UI.layers}</span></button>
      <div className="segmented views" role="group" aria-label="Camera view">
        {UI.views.map(v => (
          <button key={v.id} aria-pressed={view === v.id} aria-label={v.label} title={v.label}
            disabled={explode > .8 && v.id !== 'front'} onClick={() => onView(v.id)}>{v.short}</button>
        ))}
      </div>
      <div className="spread">
        <div className="spread-label"><label id="spread-label">{UI.spread}</label><output>{Math.round(explode * 100)}%</output></div>
        <Slider aria-labelledby="spread-label" min={0} max={100} step={1} value={[explode * 100]}
          onValueChange={v => onExplode((Array.isArray(v) ? v[0] : v) / 100)}/>
        <div className="spread-ends" aria-hidden="true"><span>{UI.spreadStart}</span><span>{UI.spreadEnd}</span></div>
      </div>
      <div className="deck-actions">
        <button className={`deck-button ${rotate ? 'active' : ''}`} disabled={explode >= .4} onClick={onRotate}
          aria-label={rotate ? UI.stopTurntable : UI.turntable} title={rotate ? UI.stopTurntable : UI.turntable}>
          {rotate ? <Pause size={17}/> : <RotateCw size={17}/>}
        </button>
        <button className="deck-button" onClick={onReset} aria-label={UI.resetLabel} title={UI.resetLabel}><RotateCcw size={17}/></button>
      </div>
    </nav>
  );
}
