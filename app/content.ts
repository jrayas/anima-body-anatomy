// All interface copy in one place (British English). Edit wording here rather than in components.
import type {SystemId} from './anatomy';

export const BRAND = {
  name: 'Anima',
  tagline: 'Human Anatomy',
  disclaimer: 'Educational model, not medical advice',
  attribution: 'Anatomy data: BodyParts3D © DBCLS, CC BY 4.0',
  attributionUrl: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',
  repositoryUrl: 'https://github.com/jrayas/anima-body-anatomy',
};

export const INTRO = {
  eyebrow: 'Educational 3D model',
  title: 'The human body, layer by layer.',
  lead: 'Turn it around, take it apart and look inside. Explore every part of a reference human body, right in your browser.',
  start: 'Start exploring',
  toursLabel: 'Or jump straight to',
  stats: [
    {value: '15', label: 'body systems'},
    {value: '2,234', label: 'separate parts'},
    {value: '3,432', label: 'named structures'},
  ],
  note: 'For learning only. Not medical advice.',
};

/** A guided starting point: which systems to show, and optionally a named structure to select. */
export interface Tour {id: string; label: string; systems: SystemId[]; focus?: string}
export const TOURS: Tour[] = [
  {id: 'heart', label: 'Heart', systems: ['cardiac', 'arterial', 'venous', 'skeletal'], focus: 'heart'},
  {id: 'skeleton', label: 'Skeleton', systems: ['skeletal', 'connective']},
  {id: 'nerves', label: 'Brain & nerves', systems: ['nervous', 'sensory']},
  {id: 'lungs', label: 'Lungs', systems: ['respiratory', 'skeletal', 'cardiac']},
  {id: 'circulation', label: 'Circulation', systems: ['cardiac', 'arterial', 'venous']},
];

export const UI = {
  search: 'Search',
  searchLabel: 'Search the body',
  searchPlaceholder: 'Try heart, femur or vagus nerve…',
  searchEmpty: 'Nothing matches that name.',
  searchLoading: 'Loading the index of names…',
  searchHintEmpty: 'Pick a starting point, or type the name of any structure.',
  searchHintResults: 'Showing up to 80 results. Add more letters to narrow them down.',
  showIntro: 'Show the introduction',
  about: 'About Anima',
  layers: 'Layers',
  presets: {all: 'All', bones: 'Bones', organs: 'Organs', none: 'None'},
  showOnly: (name: string) => `Show only ${name.toLowerCase()}`,
  toggleSystem: (name: string) => `Show ${name.toLowerCase()}`,
  partsShown: (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'part' : 'parts'} shown`,
  views: [
    {id: 'three-quarter', short: '¾', label: 'Three-quarter view'},
    {id: 'front', short: 'Front', label: 'Front view'},
    {id: 'side', short: 'Side', label: 'Side view'},
    {id: 'back', short: 'Back', label: 'Back view'},
  ] as const,
  spread: 'Spread apart',
  spreadStart: 'Together',
  spreadEnd: 'Every part',
  turntable: 'Turntable',
  stopTurntable: 'Stop turning',
  reset: 'Reset',
  resetLabel: 'Reset the view and layers',
  loading: 'Loading full detail',
  reload: 'Reload',
  hintDesktop: 'Drag to turn · Scroll to zoom · Click a part',
  hintSpread: 'Drag to pan · Scroll to zoom · Click a part',
  detail: {
    fallbackNote: (system: string) => `General background on ${system.toLowerCase()}. A description of this exact structure isn’t available yet.`,
    reference: 'FMA reference',
    parts: 'Parts',
    members: 'In this structure',
    more: (n: number) => `And ${n.toLocaleString('en-GB')} more parts.`,
    source: 'See the source data',
    focus: 'Focus on this',
    unfocus: 'Show surroundings',
    clear: 'Clear',
  },
};

export const ABOUT = {
  eyebrow: 'About',
  title: 'About Anima',
  paragraphs: [
    'Anima is an educational 3D model of the human body that runs in your browser. Turn it around, peel away layers, spread every part out, and look up any named structure.',
  ],
  sections: [
    {
      heading: 'What you are looking at',
      paragraphs: [
        'The anatomy comes from BodyParts3D, a reference model of an adult male built from MRI data and refined by anatomical illustrators. It has 2,234 separate meshes, grouped under 3,432 named structures.',
        'It is one reference body. It doesn’t include every structure, or the natural variation between people. Colours and groupings are ours, chosen for clarity, and the geometry is simplified so it loads quickly.',
      ],
    },
  ],
  warning: 'Anima is for learning. It is not medical advice and must not be used for diagnosis or treatment.',
  creditsHeading: 'Credits',
  credits: 'BodyParts3D, © The Database Center for Life Science, licensed under Creative Commons Attribution 4.0 International.',
  links: [
    {label: 'BodyParts3D licence', href: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html'},
    {label: 'Original data download', href: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html'},
    {label: 'Source publication (Mitsuhashi et al., 2009)', href: 'https://doi.org/10.1093/nar/gkn613'},
    {label: 'Built on Human Atlas by ashemag (MIT licence)', href: 'https://github.com/ashemag/human-atlas'},
    {label: 'Anima source code', href: 'https://github.com/jrayas/anima-body-anatomy'},
  ],
};
