// The floor under the body: a single shader-drawn disc with fine concentric rings,
// radial ticks and a soft glow, fading to nothing at the edge. One draw call, no textures.
import * as T from 'three';

export interface Stage {
  group: T.Group;
  /** Accent colour of the lines and glow. */
  setColor: (color: T.ColorRepresentation) => void;
  dispose: () => void;
}

export function createStage(radius = 1.3): Stage {
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      color: {value: new T.Color('#4fe3d6')},
      radius: {value: radius},
    },
    vertexShader: /* glsl */`
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      uniform float radius;
      varying vec2 vPos;
      // Anti-aliased line of the given width (in world units) at distance 0.
      float line(float d, float width) {
        float w = fwidth(d);
        return 1.0 - smoothstep(width, width + w * 1.5, abs(d));
      }
      void main() {
        float r = length(vPos);
        float fade = 1.0 - smoothstep(radius * 0.25, radius, r);
        // Concentric rings every 0.2 m, with a brighter ring around the feet.
        float rings = line(mod(r + 0.1, 0.2) - 0.1, 0.001) * 0.16;
        float footRing = line(r - 0.62, 0.0016) * 0.55 + line(r - 0.55, 0.0008) * 0.25;
        // Short radial ticks around the foot ring, every 5 degrees.
        float angle = atan(vPos.y, vPos.x);
        float tick = line(mod(angle + 0.0436, 0.0873) - 0.0436, 0.004 / max(r, 0.01)) * step(0.63, r) * step(r, 0.65) * 0.3;
        // Soft glow pooled under the body.
        float glow = exp(-r * r * 12.0) * 0.16;
        float alpha = (rings + footRing + tick) * fade + glow;
        gl_FragColor = vec4(color, alpha);
      }`,
  });
  // The extension is required for fwidth() under WebGL1 fallbacks; WebGL2 has it built in.
  (material as T.ShaderMaterial & {extensions: {derivatives: boolean}}).extensions.derivatives = true;
  const disc = new T.Mesh(new T.CircleGeometry(radius, 128), material);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -0.012;
  disc.renderOrder = -1;
  const group = new T.Group();
  group.add(disc);
  return {
    group,
    setColor: color => material.uniforms.color.value.set(color),
    dispose: () => { disc.geometry.dispose(); material.dispose(); },
  };
}
