// Materials for anatomy meshes.
//
// Every anatomy material shares the same "part state" vertex code: a per-vertex partIndex
// looks up the part's explode offset and visibility (partState texture) and its selection
// and best loaded detail level (selectionState texture). Part indices are stored as
// index + level * LEVEL_OFFSET, so every copy knows its own level and is hidden while a
// better level of the same part is loaded.
// The same code is injected into the normal/depth material used by ambient occlusion, so
// AO always matches what is drawn.
import * as T from 'three';
import type {SystemId, SystemInfo} from '../anatomy';

export interface PartStateUniforms {
  partState: {value: T.Texture};
  selectionState: {value: T.Texture};
  stateWidth: {value: number};
}

/** Must match LEVEL_OFFSET in scripts/build-streaming-assets.mjs (also in the manifest). */
export const LEVEL_OFFSET = 16384;
/** selectionState.g stores the best resident level as level * LEVEL_STEP (0, 85, 170). */
export const LEVEL_STEP = 85;

const VERTEX_HEADER = /* glsl */`
attribute float partIndex;
uniform sampler2D partState;
uniform sampler2D selectionState;
uniform float stateWidth;
varying float partSelected;
varying vec3 vDetailPos;
`;
const VERTEX_STATE = /* glsl */`
#include <begin_vertex>
float meshLevel = floor((partIndex + 0.5) / ${LEVEL_OFFSET}.0);
float partId = partIndex - ${LEVEL_OFFSET}.0 * meshLevel;
vec2 stateUv = vec2((partId + 0.5) / stateWidth, 0.5);
vec4 state = texture2D(partState, stateUv);
vec4 flags = texture2D(selectionState, stateUv);
transformed += state.xyz;
partSelected = flags.r;
// Surface detail is anchored to the body, not the camera or the explode offset.
vDetailPos = position;
float bestLevel = floor(flags.g * 255.0 / ${LEVEL_STEP}.0 + 0.5);
// Hidden parts, and copies of parts that have a better level resident, are culled.
bool partHidden = state.w < 0.5 || meshLevel < bestLevel - 0.5;
`;
// Moving every vertex of a hidden part outside the clip volume skips rasterisation entirely.
const VERTEX_CULL = '#include <project_vertex>\nif (partHidden) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);';

/** Adds part-state behaviour to any built-in material's shader. */
export function injectPartState(shader: T.Shader, uniforms: PartStateUniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = VERTEX_HEADER + shader.vertexShader
    .replace('#include <begin_vertex>', VERTEX_STATE)
    .replace('#include <project_vertex>', VERTEX_CULL);
}

/** Surface response per system: drier bone, moist organs, glossy vessels and cartilage.
 * detail: procedural micro-relief (features per metre, strength). It is a shading effect
 * only and does not represent real anatomical texture. */
interface Surface {roughness: number; metalness?: number; clearcoat?: number; clearcoatRoughness?: number; sheen?: number; sheenColor?: string; detail?: [number, number]}
const SURFACES: Partial<Record<SystemId, Surface>> & {default: Surface} = {
  default: {roughness: 0.5, clearcoat: 0.15, clearcoatRoughness: 0.5},
  skeletal: {roughness: 0.62, clearcoat: 0.05, clearcoatRoughness: 0.7, sheen: 0.25, sheenColor: '#fff4dc', detail: [700, 0.6]},
  muscular: {roughness: 0.48, clearcoat: 0.18, clearcoatRoughness: 0.45, sheen: 0.45, sheenColor: '#ff9f8f', detail: [450, 0.7]},
  cardiac: {roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.3, sheenColor: '#ff8a7a', detail: [400, 0.5]},
  arterial: {roughness: 0.32, clearcoat: 0.55, clearcoatRoughness: 0.25},
  venous: {roughness: 0.32, clearcoat: 0.55, clearcoatRoughness: 0.25},
  nervous: {roughness: 0.45, clearcoat: 0.2, clearcoatRoughness: 0.4, sheen: 0.35, sheenColor: '#fff0b8'},
  sensory: {roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.12},
  respiratory: {roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.3, sheenColor: '#ffd0d8', detail: [350, 0.5]},
  digestive: {roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35, detail: [300, 0.4]},
  urinary: {roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35},
  endocrine: {roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.35},
  lymphatic: {roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.35},
  reproductive: {roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.35},
  connective: {roughness: 0.3, clearcoat: 0.45, clearcoatRoughness: 0.2},
  integumentary: {roughness: 0.6},
};

const SELECTION_COLOUR = 'vec3(0.31, 0.89, 0.84)';

/** Global surface-detail strength (0 turns it off; the Phase 3 quality setting will drive it). */
export const surfaceDetail = {value: 1};

// Two octaves of value noise turned into a bump via screen-space derivatives (as three's
// bump mapping does), so no texture is downloaded. It fades out where features would be
// smaller than a pixel, which would only shimmer.
const DETAIL_FRAGMENT_HEADER = /* glsl */`
varying vec3 vDetailPos;
uniform float detailScale;
uniform float detailStrength;
uniform float surfaceDetail;
float animaHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float animaNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(animaHash(i), animaHash(i + vec3(1, 0, 0)), f.x), mix(animaHash(i + vec3(0, 1, 0)), animaHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(animaHash(i + vec3(0, 0, 1)), animaHash(i + vec3(1, 0, 1)), f.x), mix(animaHash(i + vec3(0, 1, 1)), animaHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 animaPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sx = normalize(dFdx(surfPos)), sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  return normalize(abs(det) * surfNorm - sign(det) * (dHdxy.x * r1 + dHdxy.y * r2));
}
`;
const DETAIL_FRAGMENT = /* glsl */`
#include <normal_fragment_maps>
if (detailStrength > 0.0 && surfaceDetail > 0.0) {
  vec3 p = vDetailPos * detailScale;
  float h = animaNoise(p) * 0.65 + animaNoise(p * 2.03) * 0.35;
  float fade = 1.0 - smoothstep(0.3, 0.7, length(fwidth(p)));
  vec2 dHdxy = vec2(dFdx(h), dFdy(h)) * detailStrength * fade * surfaceDetail;
  normal = animaPerturb(-vViewPosition, normal, dHdxy, faceDirection);
}
`;

/** Physically based material for one system, with part-state and selection tint. */
export function createSystemMaterial(system: SystemInfo, uniforms: PartStateUniforms): T.MeshPhysicalMaterial {
  const surface = SURFACES[system.id] ?? SURFACES.default;
  const skin = system.id === 'integumentary';
  const material = new T.MeshPhysicalMaterial({
    color: system.color,
    roughness: surface.roughness,
    metalness: surface.metalness ?? 0,
    clearcoat: surface.clearcoat ?? 0,
    clearcoatRoughness: surface.clearcoatRoughness ?? 0.3,
    sheen: surface.sheen ?? 0,
    sheenColor: new T.Color(surface.sheenColor ?? '#ffffff'),
    sheenRoughness: 0.6,
    side: T.DoubleSide,
    transparent: skin,
    opacity: skin ? 0.1 : 1,
    depthWrite: !skin,
  });
  const [detailScale, detailStrength] = surface.detail ?? [1, 0];
  material.onBeforeCompile = shader => {
    injectPartState(shader, uniforms);
    Object.assign(shader.uniforms, {detailScale: {value: detailScale}, detailStrength: {value: detailStrength}, surfaceDetail});
    shader.fragmentShader = 'varying float partSelected;\n' + DETAIL_FRAGMENT_HEADER + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, ${SELECTION_COLOUR}, partSelected * 0.7);`)
      .replace('#include <normal_fragment_maps>', DETAIL_FRAGMENT);
  };
  return material;
}

/** View-space normals with part state, for the ambient occlusion G-buffer pass. */
export function createPartNormalMaterial(uniforms: PartStateUniforms): T.MeshNormalMaterial {
  const material = new T.MeshNormalMaterial({side: T.DoubleSide, blending: T.NoBlending});
  material.onBeforeCompile = shader => injectPartState(shader, uniforms);
  return material;
}
