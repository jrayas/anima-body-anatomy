// Anatomical systems, their display colours and the educational copy shown for them.
// Descriptions are general background written for Anima, not medical advice.
// Anatomical structure names come from the BodyParts3D data and are not edited here.

export type SystemId = 'skeletal'|'muscular'|'arterial'|'venous'|'nervous'|'digestive'|'respiratory'|'urinary'|'reproductive'|'lymphatic'|'endocrine'|'integumentary'|'connective'|'sensory'|'cardiac';

export interface SystemInfo {
  id: SystemId;
  /** Short display name used in the layers panel and detail panel. */
  name: string;
  /** Base colour of the system's material in the 3D view (tuned for the dark theme). */
  color: string;
  description: string;
}

/** Display order of the layers panel. */
export const SYSTEMS: SystemInfo[] = [
  {id: 'skeletal', name: 'Bones', color: '#e6dcc2',
    description: 'Bone gives the body its frame. It shields the brain, heart and lungs, anchors the muscles that move us, and holds the marrow where new blood cells are made.'},
  {id: 'muscular', name: 'Muscles', color: '#c25a4e',
    description: 'Skeletal muscles work by contracting and pulling on bone through their tendons. Arranged in opposing groups, they move joints, hold posture and generate body heat.'},
  {id: 'cardiac', name: 'Heart', color: '#d9564c',
    description: 'Four chambers, four valves and a wall of cardiac muscle. Each beat sends blood two ways: through the lungs to collect oxygen, and out to the rest of the body.'},
  {id: 'sensory', name: 'Sense organs', color: '#9ccfdb',
    description: 'The eyes and inner ears turn light, sound and head movement into nerve signals. These specialised tissues are the brain’s windows on the outside world.'},
  {id: 'arterial', name: 'Arteries', color: '#d8473c',
    description: 'Arteries carry blood away from the heart under pressure. Their thick, elastic walls branch into ever smaller vessels that reach every tissue.'},
  {id: 'venous', name: 'Veins', color: '#4f86c6',
    description: 'Veins bring blood back towards the heart. Pressure in them is low, so many rely on one-way valves and the squeeze of nearby muscles to keep blood moving.'},
  {id: 'nervous', name: 'Brain & nerves', color: '#ecc25e',
    description: 'The brain and spinal cord process information. The nerves branching from them carry commands out to the muscles and bring sensations back from the skin and organs.'},
  {id: 'respiratory', name: 'Lungs & airways', color: '#de98a4',
    description: 'Air travels down the windpipe and the branching bronchi into the lungs, where oxygen passes into the blood and carbon dioxide passes out.'},
  {id: 'digestive', name: 'Digestive tract', color: '#d4a070',
    description: 'From mouth to bowel, the digestive tract breaks food down and absorbs what the body needs. The liver, gallbladder and pancreas supply the juices that make this possible.'},
  {id: 'urinary', name: 'Kidneys & bladder', color: '#cc8a6c',
    description: 'The kidneys filter the blood, balancing water and salts and removing waste as urine, which drains through the ureters to be stored in the bladder.'},
  {id: 'lymphatic', name: 'Lymphatic', color: '#8fc79a',
    description: 'A network of vessels and nodes that returns surplus fluid from the tissues to the blood. Immune cells gather in the nodes to watch for infection.'},
  {id: 'endocrine', name: 'Hormone glands', color: '#b48fd6',
    description: 'Glands such as the thyroid and adrenals release hormones into the bloodstream: chemical messages that adjust growth, energy use and the response to stress.'},
  {id: 'reproductive', name: 'Reproductive', color: '#d4a2ae',
    description: 'This model is based on a male reference body. Its reproductive structures produce and carry sperm and make the hormone testosterone.'},
  {id: 'integumentary', name: 'Skin', color: '#d6b49a',
    description: 'The outer surface of the body, shown as a translucent shell. Skin is a waterproof barrier, a sense organ and a regulator of body temperature.'},
  {id: 'connective', name: 'Ligaments & cartilage', color: '#a6d4cd',
    description: 'Ligaments tie bone to bone. Cartilage cushions the joints and gives shape to structures such as the ears, nose and airways.'},
];

/** One source mesh. Geometry lives in the streaming files listed by the manifest. */
export interface Part {id: string; name: string; conceptId: string; system: SystemId; bounds: [number[], number[]]}
/** A named FMA concept; may group several meshes. */
export interface Concept {id: string; name: string; elements: string[]}
/** Part records plus the named concepts used by search (concepts arrive after first render). */
export interface Atlas {version: string; parts: Part[]; concepts: Concept[]}

export type View = 'three-quarter'|'front'|'back'|'side';
export interface SceneState {inspectorOpen?: boolean; explode: number; visible: SystemId[]; selected: string[]; isolate: boolean; view: View; rotate: boolean; reset: number}

/** Everything except the skin shell is shown on load. */
export const DEFAULT_VISIBLE: SystemId[] = SYSTEMS.map(s => s.id).filter(id => id !== 'integumentary');

/** Organ-specific explanations, keyed by lower-case structure name. Others fall back to the system description. */
export const EXPLANATIONS: Record<string, string> = {
  'heart': 'A fist-sized muscular pump behind the breastbone. The right side sends blood through the lungs; the left side, with its thicker wall, pushes it around the whole body.',
  'liver': 'The largest organ inside the body, tucked under the right side of the diaphragm. It processes nutrients from the gut, stores energy, breaks down many drugs and toxins, and makes bile.',
  'brain': 'Protected by the skull, the brain interprets the senses, starts movement, and holds memory and language. Its regions specialise, but they work as one connected network.',
  'stomach': 'A J-shaped muscular bag below the diaphragm. It churns food with acid and enzymes for a few hours, then releases it gradually into the small intestine.',
  'spleen': 'A soft organ in the upper left abdomen, sheltered by the lower ribs. It filters the blood, recycles worn-out red cells and helps the immune system respond to infection.',
  'pancreas': 'A long gland lying behind the stomach. It releases digestive enzymes into the small intestine, and the hormones insulin and glucagon into the blood.',
  'urinary bladder': 'A stretchy, muscular reservoir in the pelvis. It fills with urine from the kidneys and empties under voluntary control.',
  'trachea': 'The windpipe: a tube held open by C-shaped rings of cartilage. It carries air from the voice box down to where it divides into the two main bronchi.',
  'diaphragm': 'A dome of muscle separating the chest from the abdomen. As it contracts and flattens, the chest expands and air is drawn into the lungs.',
};

export function explanation(name: string, system: SystemId) {
  return EXPLANATIONS[name.toLowerCase()] ?? SYSTEMS.find(s => s.id === system)?.description ?? '';
}
