// Anima root: owns the explorer state and composes the 3D scene with the interface.
// Layout: intro overlay (landing) -> explorer (layers panel, control deck, detail panel).
import {useEffect, useMemo, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import AnatomyScene, {type SceneStats} from './scene';
import {BenchPanel} from './interface/bench-panel';
import {rememberDeviceTier, type DeviceTier} from './render/device-tier';
import {registerAtlasTools} from './agent-tools';
import {DEFAULT_VISIBLE, type Atlas, type Concept, type SceneState, type SystemId, type View} from './anatomy';
import {BRAND, UI, type Tour} from './content';
import {loadConcepts, loadManifest, type Manifest} from './data/manifest';
import {syncServiceWorkerCache} from './service-worker';
import {splashError} from './splash';
import {TopBar} from './interface/top-bar';
import {Intro} from './interface/intro';
import {LayersPanel} from './interface/layers-panel';
import {ControlDeck} from './interface/control-deck';
import {SearchPanel} from './interface/search-panel';
import {DetailPanel} from './interface/detail-panel';
import {AboutPanel} from './interface/about-panel';
import {ErrorNotice, StreamingStatus} from './interface/status';

/** ?bench opens the benchmark panel (frame rate and detail switch) and skips the intro. */
const benchMode = typeof location !== 'undefined' && new URLSearchParams(location.search).has('bench');
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const initial: SceneState = {explode: 0, visible: DEFAULT_VISIBLE, selected: [], isolate: false, view: 'three-quarter', rotate: false, reset: 0};

export default function Home() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  // The body turns slowly behind the intro, unless the visitor prefers reduced motion.
  const [state, setState] = useState<SceneState>(() => ({...initial, rotate: !reducedMotion()}));
  const [intro, setIntro] = useState(!benchMode);
  const [benchTier, setBenchTier] = useState<DeviceTier | undefined>();
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<'layers' | 'search' | null>(null);
  const [details, setDetails] = useState(false);
  const [about, setAbout] = useState(false);
  const [chosen, setChosen] = useState<Concept | null>(null);
  const pendingFocus = useRef<string | null>(null);

  // The manifest (parts and geometry files) is needed first; search names load once the browser is idle.
  useEffect(() => {
    const abort = new AbortController();
    loadManifest(abort.signal).then(m => {
      setManifest(m);
      syncServiceWorkerCache(m);
      const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500));
      idle(() => { loadConcepts(m, abort.signal).then(setConcepts).catch(e => { if (e.name !== 'AbortError') console.warn(e); }); });
    }).catch(e => {
      if (e.name !== 'AbortError') { setError(e.message); splashError(e.message); }
    });
    return () => abort.abort();
  }, []);

  const atlas = useMemo<Atlas | null>(() => manifest && {version: manifest.version, parts: manifest.parts, concepts}, [manifest, concepts]);
  const parts = useMemo(() => new Map(manifest?.parts.map(p => [p.id, p])), [manifest]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of manifest?.parts ?? []) c[p.system] = (c[p.system] ?? 0) + 1;
    return c;
  }, [manifest]);
  const selectedParts = state.selected.map(id => parts.get(id)).filter(p => !!p);
  const shownParts = manifest?.parts.filter(p => state.isolate ? state.selected.includes(p.id) : state.visible.includes(p.system) || state.selected.includes(p.id)).length ?? 0;

  const enterExplorer = () => {
    setIntro(false);
    setState(s => ({...s, rotate: false}));
  };
  const choose = (c: Concept) => {
    setChosen(c);
    setState(s => ({...s, selected: c.elements, isolate: false, rotate: false}));
    setDetails(true);
    setPanel(null);
    setIntro(false);
  };
  const choosePart = (id: string) => {
    const p = parts.get(id);
    if (!p) return;
    choose({id: p.conceptId, name: p.name, elements: [id]});
  };
  const setVisible = (visible: SystemId[]) => {
    setDetails(false);
    setState(s => ({...s, selected: [], isolate: false, visible}));
  };
  const startTour = (tour: Tour) => {
    enterExplorer();
    setVisible(tour.systems);
    setState(s => ({...s, explode: 0, view: 'three-quarter', reset: s.reset + 1}));
    if (tour.focus) pendingFocus.current = tour.focus;
  };
  const reset = () => {
    setState(s => ({...initial, reset: s.reset + 1}));
    setChosen(null);
    setDetails(false);
    setPanel(null);
  };

  // A tour that focuses a named structure waits until the search names have loaded.
  useEffect(() => {
    const name = pendingFocus.current;
    if (!name || !concepts.length) return;
    pendingFocus.current = null;
    const concept = concepts.find(c => c.name.toLowerCase() === name);
    if (concept) choose(concept);
  });

  // "/" opens search from anywhere except text fields.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      setIntro(false);
      setDetails(false);
      setPanel('search');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  useEffect(() => {
    if (!atlas) return;
    return registerAtlasTools(atlas, c => flushSync(() => choose(c)));
  }, [atlas]);

  return (
    <main className="app" data-mode={intro ? 'intro' : 'explore'}>
      <div className="backdrop" aria-hidden="true"/>
      {/* Dragging the body is an obvious "I want to explore" signal, so it dismisses the intro. */}
      <div className="stage" onPointerDownCapture={() => { if (intro) enterExplorer(); }}>
        {manifest && <AnatomyScene manifest={manifest} state={{...state, inspectorOpen: details && selectedParts.length > 0}}
          onSelect={choosePart} onProgress={n => { setProgress(n); if (n === 100) setError(''); }}
          onError={e => { setError(e); splashError(e); }}
          detailTier={benchTier} onStats={benchMode ? setStats : undefined}/>}
      </div>

      <TopBar searchOpen={panel === 'search'}
        onSearch={() => { setIntro(false); setDetails(false); setPanel(p => p === 'search' ? null : 'search'); }}
        onIntro={() => { setPanel(null); setDetails(false); setIntro(true); setState(s => ({...s, explode: 0, rotate: !reducedMotion()})); }}
        onAbout={() => { setDetails(false); setPanel(null); setAbout(true); }}/>

      <Intro open={intro} onStart={enterExplorer} onTour={startTour}/>

      <div className="explorer" inert={intro} aria-hidden={intro}>
        <LayersPanel visible={state.visible} counts={counts} shownParts={shownParts} mobileOpen={panel === 'layers'}
          onClose={() => setPanel(null)} onChange={setVisible}/>
        <ControlDeck view={state.view} explode={state.explode} rotate={state.rotate}
          onView={(view: View) => setState(s => ({...s, view, reset: s.reset + 1, rotate: false}))}
          onExplode={explode => setState(s => ({...s, explode, view: explode > .8 ? 'front' : s.view, rotate: false}))}
          onRotate={() => setState(s => ({...s, rotate: !s.rotate}))}
          onReset={reset}
          onLayers={() => { setDetails(false); setPanel(p => p === 'layers' ? null : 'layers'); }}/>
        <p className="hint">{state.explode > .8 ? UI.hintSpread : UI.hintDesktop}</p>
      </div>

      {panel === 'search' && <SearchPanel concepts={concepts} onChoose={choose} onClose={() => setPanel(null)}/>}

      <footer className="legal">
        <span>{BRAND.disclaimer}</span>
        <a href={BRAND.attributionUrl} target="_blank" rel="noreferrer">{BRAND.attribution}</a>
      </footer>

      {!intro && !error && <StreamingStatus progress={progress}/>}
      {error && <ErrorNotice message={error}/>}

      <DetailPanel open={details} concept={chosen} parts={selectedParts} isolated={state.isolate}
        onOpenChange={setDetails} onChoosePart={choosePart}
        onIsolate={() => setState(s => ({...s, isolate: !s.isolate, explode: 0}))}
        onClear={() => { setState(s => ({...s, selected: [], isolate: false})); setDetails(false); }}/>
      <AboutPanel open={about} onOpenChange={setAbout}/>
      {benchMode && <BenchPanel stats={stats} onTier={t => { rememberDeviceTier(t); setBenchTier(t); }}/>}
    </main>
  );
}
