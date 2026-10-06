// Landing overlay shown over the turning body. It fades away when the visitor starts
// exploring, picks a tour, or drags the model; the sparkle button in the top bar brings it back.
import {ArrowRight} from 'lucide-react';
import {BRAND, INTRO, TOURS, type Tour} from '../content';

interface Props {
  open: boolean;
  onStart: () => void;
  onTour: (tour: Tour) => void;
}

export function Intro({open, onStart, onTour}: Props) {
  return (
    <section className="intro" data-open={open} aria-hidden={!open} aria-labelledby="intro-title" inert={!open}>
      <p className="intro-eyebrow"><span className="pulse-dot" aria-hidden="true"/>{INTRO.eyebrow}</p>
      <h1 id="intro-title" className="intro-title">{INTRO.title}</h1>
      <p className="intro-lead">{INTRO.lead}</p>
      <button className="cta" onClick={onStart} autoFocus>{INTRO.start}<ArrowRight size={18}/></button>
      <div className="intro-tours">
        <span className="intro-tours-label">{INTRO.toursLabel}</span>
        <div className="tour-list">
          {TOURS.map(t => <button key={t.id} className="tour-chip" onClick={() => onTour(t)}>{t.label}</button>)}
        </div>
      </div>
      <dl className="intro-stats">
        {INTRO.stats.map(s => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}
      </dl>
      <p className="intro-note">{INTRO.note} <a href={BRAND.attributionUrl} target="_blank" rel="noreferrer">{BRAND.attribution}</a></p>
    </section>
  );
}
