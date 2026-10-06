// Information about the selected structure, with focus (isolate) and clear actions.
// Non-modal so the 3D view stays interactive while it is open.
import {useRef} from 'react';
import {ArrowUpRight, ChevronRight, Focus} from 'lucide-react';
import {Sheet, SheetContent, SheetDescription, SheetTitle} from '@/components/ui/sheet';
import {EXPLANATIONS, SYSTEMS, explanation, type Concept, type Part} from '../anatomy';
import {UI} from '../content';

interface Props {
  open: boolean;
  concept: Concept | null;
  parts: Part[];
  isolated: boolean;
  onOpenChange: (open: boolean) => void;
  onChoosePart: (id: string) => void;
  onIsolate: () => void;
  onClear: () => void;
}

export function DetailPanel({open, concept, parts, isolated, onOpenChange, onChoosePart, onIsolate, onClear}: Props) {
  const title = useRef<HTMLHeadingElement>(null);
  const first = parts[0], system = SYSTEMS.find(s => s.id === first?.system);
  const specific = !!concept && !!EXPLANATIONS[concept.name.toLowerCase()];
  return (
    <Sheet open={open && parts.length > 0} modal={false} disablePointerDismissal onOpenChange={onOpenChange}>
      <SheetContent initialFocus={title} className={`detail-sheet ${isolated ? 'is-isolated' : ''}`} showCloseButton overlay={false}>
        <div className="detail-head" style={{'--system': system?.color} as React.CSSProperties}>
          <p className="detail-eyebrow"><span className="system-swatch" aria-hidden="true"/>{system?.name}</p>
          <SheetTitle ref={title} tabIndex={-1} className="detail-title">{concept?.name}</SheetTitle>
        </div>
        <div className="detail-body" key={`${concept?.id}-${isolated}`}>
          <SheetDescription className="detail-text">{concept && first ? explanation(concept.name, first.system) : ''}</SheetDescription>
          {concept && system && !specific && <p className="detail-note">{UI.detail.fallbackNote(system.name)}</p>}
          <dl className="detail-meta">
            <div><dt>{UI.detail.reference}</dt><dd>{concept?.id}</dd></div>
            <div><dt>{UI.detail.parts}</dt><dd>{parts.length.toLocaleString('en-GB')}</dd></div>
          </dl>
          {parts.length > 1 && (
            <div className="detail-members">
              <h3>{UI.detail.members}</h3>
              {parts.slice(0, 50).map(p => (
                <button key={p.id} onClick={() => onChoosePart(p.id)}><span>{p.name}</span><ChevronRight size={14}/></button>
              ))}
              {parts.length > 50 && <p>{UI.detail.more(parts.length - 50)}</p>}
            </div>
          )}
          <a className="detail-source" href="https://lifesciencedb.jp/bp3d/" target="_blank" rel="noreferrer">{UI.detail.source}<ArrowUpRight size={14}/></a>
        </div>
        <div className="detail-actions">
          <button className={`cta small ${isolated ? 'active' : ''}`} onClick={onIsolate}><Focus size={17}/>{isolated ? UI.detail.unfocus : UI.detail.focus}</button>
          <button className="ghost-button" onClick={onClear}>{UI.detail.clear}</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
