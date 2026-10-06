// Fixed header: wordmark on the left, search / intro / about actions on the right.
import {Info, Search, Sparkles} from 'lucide-react';
import {BRAND, UI} from '../content';

interface Props {
  searchOpen: boolean;
  onSearch: () => void;
  onIntro: () => void;
  onAbout: () => void;
}

export function TopBar({searchOpen, onSearch, onIntro, onAbout}: Props) {
  return (
    <header className="top-bar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true"/>
        <span className="brand-name">{BRAND.name}</span>
        <span className="brand-tagline">{BRAND.tagline}</span>
      </div>
      <nav className="top-actions" aria-label="Main">
        <button className={`chip-button search-trigger ${searchOpen ? 'active' : ''}`} onClick={onSearch} aria-label={UI.searchLabel} aria-expanded={searchOpen}>
          <Search size={16}/><span className="label">{UI.search}</span><kbd>/</kbd>
        </button>
        <button className="icon-chip" onClick={onIntro} aria-label={UI.showIntro} title={UI.showIntro}><Sparkles size={17}/></button>
        <button className="icon-chip" onClick={onAbout} aria-label={UI.about} title={UI.about}><Info size={17}/></button>
      </nav>
    </header>
  );
}
