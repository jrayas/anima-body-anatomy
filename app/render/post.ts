// Post-processing: multisampled scene render, horizon-based ambient occlusion (HBAO) and
// the final tone-mapping/colour-space output. When disabled, the scene renders directly.
// HBAO uses our part-state normal material so offsets and hidden parts match the scene.
import * as T from 'three';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {HBAOPass} from 'three/examples/jsm/postprocessing/HBAOPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface PostOptions {
  /** World-space sampling radius in metres. */
  radius?: number;
  distanceExponent?: number;
  bias?: number;
  samples?: number;
}

export interface Post {
  enabled: boolean;
  render: () => void;
  setSize: (width: number, height: number, pixelRatio: number) => void;
  dispose: () => void;
}

export function createPost(renderer: T.WebGLRenderer, scene: T.Scene, camera: T.PerspectiveCamera,
  normalMaterial: T.Material, options: PostOptions = {}): Post {
  const size = renderer.getDrawingBufferSize(new T.Vector2());
  // MSAA on the scene target keeps edges as clean as the direct (antialiased) render.
  const target = new T.WebGLRenderTarget(size.x, size.y, {type: T.HalfFloatType, samples: 4});
  const composer = new EffectComposer(renderer, target);
  const scenePass = new RenderPass(scene, camera);
  scenePass.clearAlpha = 0;
  const ao = new HBAOPass(scene, camera, size.x, size.y);
  ao.normalMaterial.dispose();
  ao.normalMaterial = normalMaterial as T.MeshNormalMaterial;
  ao.updateHbaoMaterial({radius: options.radius ?? 0.04, distanceExponent: options.distanceExponent ?? 1.2, bias: options.bias ?? 0.02, samples: options.samples ?? 16});
  ao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 4, samples: 16});
  composer.addPass(scenePass);
  composer.addPass(ao);
  composer.addPass(new OutputPass());

  const post: Post = {
    enabled: true,
    render: () => (post.enabled ? composer.render() : renderer.render(scene, camera)),
    setSize: (width, height, pixelRatio) => {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
    },
    dispose: () => { ao.dispose(); composer.dispose(); target.dispose(); },
  };
  return post;
}
