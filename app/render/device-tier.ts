// Chooses how much geometry this device should hold for the whole body.
//   'full'      source resolution for every visible system (capable PCs)
//   'standard'  about 1.6M triangles, plus source resolution only for what the visitor
//               focuses on or zooms into (phones, tablets, weak laptops)
// Visitors can override the choice with ?detail=full or ?detail=standard (remembered),
// and the benchmark page (?bench) switches between them live.
export type DeviceTier = 'full' | 'standard';

const STORAGE_KEY = 'anima:detail';

export function detectDeviceTier(renderer?: {getContext: () => WebGLRenderingContext | WebGL2RenderingContext}): DeviceTier {
  const override = new URLSearchParams(location.search).get('detail');
  if (override === 'full' || override === 'standard') {
    try { localStorage.setItem(STORAGE_KEY, override); } catch { /* Storage unavailable; use for this visit only. */ }
    return override;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'full' || saved === 'standard') return saved;
  } catch { /* Fall through to detection. */ }

  // Touch-first devices are phones or tablets.
  if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) return 'standard';
  // Little memory (Chrome reports up to 8 GB).
  const memory = (navigator as Navigator & {deviceMemory?: number}).deviceMemory;
  if (memory !== undefined && memory < 8) return 'standard';
  // Integrated Intel graphics (not Arc cards), mobile chips and software renderers.
  // Phones and iPads were already caught by the pointer check above.
  const gl = renderer?.getContext();
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  const gpu = info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  if (/Intel(?!.*Arc)|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Microsoft Basic Render/i.test(gpu)) return 'standard';
  return 'full';
}

export function rememberDeviceTier(tier: DeviceTier) {
  try { localStorage.setItem(STORAGE_KEY, tier); } catch { /* Not essential. */ }
}
