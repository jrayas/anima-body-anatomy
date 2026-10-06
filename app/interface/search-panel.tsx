// Search over the named FMA concepts. Shows suggested organs before the visitor types.
import {useMemo, useState} from 'react';
import {X} from 'lucide-react';
import {Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList} from '@/components/ui/combobox';
import type {Concept} from '../anatomy';
import {UI} from '../content';

const SUGGESTED = ['heart', 'brain', 'liver', 'stomach', 'spleen', 'pancreas', 'urinary bladder', 'trachea'];

interface Props {
  concepts: Concept[];
  onChoose: (concept: Concept) => void;
  onClose: () => void;
}

export function SearchPanel({concepts, onChoose, onClose}: Props) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const term = query.toLowerCase().trim();
    if (!term) return SUGGESTED.map(name => concepts.find(c => c.name.toLowerCase() === name)).filter((c): c is Concept => !!c);
    return concepts.filter(c => c.name.toLowerCase().includes(term) || c.id.toLowerCase().includes(term))
      .sort((a, b) => a.name.length - b.name.length).slice(0, 80);
  }, [concepts, query]);
  return (
    <section className="search panel" aria-label={UI.searchLabel}>
      <header className="panel-head">
        <h2>{UI.searchLabel}</h2>
        <button className="icon-chip" onClick={onClose} aria-label="Close search"><X size={17}/></button>
      </header>
      <Combobox<Concept> items={results} value={null} onValueChange={value => { if (value) onChoose(value); }}
        inputValue={query} onInputValueChange={setQuery} itemToStringLabel={c => c.name} filter={null} open
        onOpenChange={open => { if (!open) onClose(); }}>
        <ComboboxInput autoFocus placeholder={UI.searchPlaceholder} aria-label={UI.searchLabel} showTrigger={false}/>
        <ComboboxContent className="search-results">
          <ComboboxEmpty>{concepts.length ? UI.searchEmpty : UI.searchLoading}</ComboboxEmpty>
          <ComboboxList>
            {(c: Concept) => (
              <ComboboxItem key={c.id} value={c}>
                <span className="result-name">{c.name}</span>
                <span className="result-count">{c.elements.length}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <p className="search-hint">{query ? UI.searchHintResults : UI.searchHintEmpty}</p>
    </section>
  );
}
