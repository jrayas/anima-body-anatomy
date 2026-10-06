// About, scope, disclaimer and credits (BodyParts3D attribution and the Human Atlas fork credit).
import {ArrowUpRight, ShieldAlert} from 'lucide-react';
import {Sheet, SheetContent, SheetDescription, SheetTitle} from '@/components/ui/sheet';
import {ABOUT} from '../content';

export function AboutPanel({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="about-sheet">
        <p className="detail-eyebrow">{ABOUT.eyebrow}</p>
        <SheetTitle className="detail-title">{ABOUT.title}</SheetTitle>
        <div className="about-body">
          <SheetDescription className="detail-text">{ABOUT.paragraphs[0]}</SheetDescription>
          {ABOUT.sections.map(s => (
            <section key={s.heading}>
              <h3>{s.heading}</h3>
              {s.paragraphs.map(p => <p key={p}>{p}</p>)}
            </section>
          ))}
          <p className="warning"><ShieldAlert size={18}/>{ABOUT.warning}</p>
          <section>
            <h3>{ABOUT.creditsHeading}</h3>
            <p>{ABOUT.credits}</p>
            <ul className="about-links">
              {ABOUT.links.map(l => <li key={l.href}><a href={l.href} target="_blank" rel="noreferrer">{l.label}<ArrowUpRight size={14}/></a></li>)}
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
