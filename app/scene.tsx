import {useEffect,useRef} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {createExplosionLayout} from './explosion-layout';
import {PointerTap} from './pointer-tap';
import {SYSTEMS,type SceneState,type SystemId} from './anatomy';
import type {DecodedFile} from './data/geometry';
import type {Manifest} from './data/manifest';
import {SystemStreamer} from './data/streamer';
import {hideSplash} from './splash';
import {createStage} from './render/stage';
import {createPartNormalMaterial,createSystemMaterial,type PartStateUniforms} from './render/materials';
import {createPost} from './render/post';
import {Residency} from './render/residency';
import {detectDeviceTier,type DeviceTier} from './render/device-tier';

/** Standard tier: camera distance (m) below which nearby parts load at source resolution. */
const CLOSE_UP_DISTANCE=0.9;
/** Standard tier: source-resolution triangles allowed for close-ups at any one time. */
const CLOSE_UP_TRIANGLES=1_200_000;
/** Rendering statistics, reported every half second when the benchmark panel is open. */
export interface SceneStats {tier:DeviceTier;fps:number;residentTriangles:number;drawnTriangles:number;drawCalls:number;files:number}
interface Props {manifest:Manifest;state:SceneState;onSelect:(id:string)=>void;onProgress:(n:number)=>void;onError:(s:string)=>void;
 /** Forces a device tier (benchmark panel); undefined uses detection. */
 detailTier?:DeviceTier;
 /** Benchmark mode: render continuously and report statistics. */
 onStats?:(stats:SceneStats)=>void}
export default function AnatomyScene({manifest,state,onSelect,onProgress,onError,detailTier,onStats}:Props){
 const host=useRef<HTMLDivElement>(null),latest=useRef(state),select=useRef(onSelect),progress=useRef(onProgress),fail=useRef(onError);
 const latestTier=useRef(detailTier),stats=useRef(onStats);latestTier.current=detailTier;stats.current=onStats;
 latest.current=state;select.current=onSelect;progress.current=onProgress;fail.current=onError;
 useEffect(()=>{
  // The scene reads `atlas.parts` throughout; the manifest has the same part records.
  const atlas=manifest;
  const onProgress=(n:number)=>progress.current(n),onError=(s:string)=>fail.current(s);
  const el=host.current!;let disposed=false,frame=0,dirty=true,ready=false,lastView='',lastReset=-1,lastIsolate='',layoutKey='',amount=0;
  let lastState:SceneState|null=null;

  let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{onError('This browser could not start the 3D viewer. Please try a browser with WebGL enabled.');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<768?1.5:2));// Transparent canvas: the dark gradient backdrop is CSS (.backdrop), which costs nothing per frame.
  renderer.setClearColor(0x000000,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Interactive human anatomy. Drag to orbit, pinch or scroll to zoom, and tap a structure to inspect it.');
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.005,100),controls=new OrbitControls(camera,renderer.domElement);
  camera.position.set(1.4,1.05,3.6);controls.target.set(0,.85,0);controls.enableDamping=true;controls.dampingFactor=.085;controls.minDistance=.07;controls.maxDistance=40;controls.maxPolarAngle=Math.PI*.96;controls.addEventListener('change',()=>{dirty=true;});
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xffffff,0xa7acb2,1.05));
  const key=new T.DirectionalLight(0xfffaf4,2.3);key.position.set(-2,4,3);scene.add(key);
  // A cool cyan rim light gives the body a faint holographic edge against the dark backdrop.
  const rim=new T.DirectionalLight(0x8fe9ff,2.2);rim.position.set(2,2,-3);scene.add(rim);
  const stage=createStage();scene.add(stage.group);
  const width=T.MathUtils.ceilPowerOfTwo(atlas.parts.length),data=new Float32Array(width*4),partTexture=new T.DataTexture(data,width,1,T.RGBAFormat,T.FloatType);partTexture.needsUpdate=true;
  const selectedData=new Uint8Array(width*4),selectionTexture=new T.DataTexture(selectedData,width,1);selectionTexture.needsUpdate=true;
  const materials:T.Material[]=[],geometries:T.BufferGeometry[]=[],pickers:(T.Mesh|undefined)[]=[],centers=atlas.parts.map(p=>new T.Vector3().fromArray(p.bounds[0]).add(new T.Vector3().fromArray(p.bounds[1])).multiplyScalar(.5));
  const offsets:T.Vector3[]=[],bounds=atlas.parts.map(p=>new T.Box3(new T.Vector3().fromArray(p.bounds[0]),new T.Vector3().fromArray(p.bounds[1])));
  let packingWidth=1,packingHeight=1;
  const markerPositions=new Float32Array(atlas.parts.length*3),markerGeometry=new T.BufferGeometry();markerGeometry.setAttribute('position',new T.BufferAttribute(markerPositions,3));
  const markerMaterial=new T.PointsMaterial({color:0x64748b,size:5,sizeAttenuation:false,transparent:true,opacity:.72,depthTest:false});
  markerMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif (distance(gl_PointCoord, vec2(0.5)) > 0.5) discard;');};
  const markers=new T.Points(markerGeometry,markerMaterial);markers.frustumCulled=false;markers.renderOrder=10;markers.visible=false;scene.add(markers);
  const hover=document.createElement('div');hover.className='part-hover';hover.setAttribute('role','tooltip');hover.hidden=true;el.appendChild(hover);
  type Target={index:number;x:number;y:number;left:number;right:number;top:number;bottom:number};let targets:Target[]=[];
  const projected=new T.Vector3();
  const findTarget=(x:number,y:number,radius:number)=>{
   let best=-1,score=Infinity;
   for(const t of targets){const dx=Math.max(t.left-x,0,x-t.right),dy=Math.max(t.top-y,0,y-t.bottom),distance=Math.hypot(dx,dy);if(distance>radius)continue;const candidate=distance+Math.hypot(t.x-x,t.y-y)*.025;if(candidate<score){score=candidate;best=t.index;}}
   return best;
  };
  // Per-part GPU state. partState (float RGBA): explode offset xyz, visible w.
  // selectionState (byte RGBA): R selected, G best resident detail level (see app/render/materials.ts).
  const stateUniforms:PartStateUniforms={partState:{value:partTexture},selectionState:{value:selectionTexture},stateWidth:{value:width}};
  const mats=new Map(SYSTEMS.map(s=>{const m=createSystemMaterial(s,stateUniforms);materials.push(m);return [s.id,m as T.Material];}));
  const normalMaterial=createPartNormalMaterial(stateUniforms);materials.push(normalMaterial);
  // Ambient occlusion via post-processing. Phones render directly until the quality setting (Phase 3) exists.
  const post=createPost(renderer,scene,camera,normalMaterial);post.enabled=!matchMedia('(pointer: coarse)').matches;
  // Which files are in the scene, the best level per part and the pick meshes (app/render/residency.ts).
  const residency=new Residency(scene,mats,bounds,pickers,selectedData,selectionTexture,i=>[data[i*4],data[i*4+1],data[i*4+2]]);
  const addFile=(decoded:DecodedFile)=>{residency.add(decoded);dirty=true;};
  // How much of the body this device holds at source resolution (app/render/device-tier.ts).
  let tier:DeviceTier=latestTier.current??detectDeviceTier(renderer);
  let firstBody=false,fullDetail=false;
  const streamer=new SystemStreamer(manifest,tier,{
   onFile:addFile,
   onRelease:file=>{residency.remove(file);dirty=true;},
   onProgress:(loadedBytes,total)=>{
    onProgress(total?Math.round(loadedBytes/total*100):100);
    if(firstBody&&loadedBytes===total&&!fullDetail){fullDetail=true;performance.mark('anima:full-detail');}
   },
   onError:message=>{if(!disposed)onError(message);},
  });
  // The low-detail body loads first, on its own, so it is not slowed by full-detail downloads.
  // Shader warm-up: compile every material on a tiny placeholder mesh while the low-detail body
  // downloads. compileAsync uses KHR_parallel_shader_compile where available, so the main
  // thread is not blocked and the first real frame needs no compilation.
  const warmGeometry=new T.BufferGeometry();warmGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(9),3));warmGeometry.setAttribute('normal',new T.BufferAttribute(new Float32Array(9),3));warmGeometry.setAttribute('partIndex',new T.BufferAttribute(new Uint16Array(3),1));
  const warm=new T.Group();mats.forEach(m=>{const mesh=new T.Mesh(warmGeometry,m);mesh.frustumCulled=false;warm.add(mesh);});scene.add(warm);
  const compiled=renderer.compileAsync(scene,camera).catch(()=>{/* Falls back to compiling on first render. */}).finally(()=>{scene.remove(warm);warmGeometry.dispose();});
  Promise.all([streamer.loadLowDetail(),compiled]).then(([decoded])=>{if(disposed)return;addFile(decoded);ready=true;lastState=null;dirty=true;wantSystems(latest.current);}).catch(e=>{if(!disposed&&e?.name!=='AbortError')onError(e instanceof Error?e.message:'Could not load the anatomy.');});
  // Full detail is fetched only for systems that are visible or contain a selection.
  // Close-ups (standard tier): the focused structure, and what is near the centre of view when
  // the camera is close, are loaded at source resolution within a triangle budget.
  const indexOf=new Map(atlas.parts.map((p,i)=>[p.id,i])),fullTriangles=new Float32Array(atlas.parts.length);
  for(const f of manifest.files)if(f.level===2)for(const [i,,count] of f.parts)fullTriangles[i]=count/3;
  const frustum=new T.Frustum(),viewProjection=new T.Matrix4(),partBox=new T.Box3();
  const closeUpParts=(s:SceneState)=>{
   const chosen:number[]=[];let budget=CLOSE_UP_TRIANGLES;
   const take=(i:number)=>{if(budget<=0)return;chosen.push(i);budget-=fullTriangles[i];};
   if(s.isolate)for(const id of s.selected){const i=indexOf.get(id);if(i!==undefined)take(i);}
   if(!s.isolate&&amount<.1&&camera.position.distanceTo(controls.target)<CLOSE_UP_DISTANCE){
    camera.updateMatrixWorld();viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(viewProjection);
    const near:[number,number][]=[];
    atlas.parts.forEach((p,i)=>{if(data[i*4+3]<.5||p.system==='integumentary')return;partBox.copy(bounds[i]);if(frustum.intersectsBox(partBox))near.push([i,partBox.distanceToPoint(controls.target)]);});
    near.sort((a,b)=>a[1]-b[1]).forEach(([i])=>take(i));
   }
   return chosen;
  };
  const wantSystems=(s:SceneState)=>{const wanted=new Set<SystemId>(s.isolate?[]:s.visible);for(const id of s.selected){const p=atlas.parts[indexOf.get(id)??-1];if(p)wanted.add(p.system);}streamer.want({systems:wanted,closeUp:closeUpParts(s)});};
  // Re-evaluate close-ups shortly after the camera stops moving.
  let closeUpTimer=0;controls.addEventListener('change',()=>{clearTimeout(closeUpTimer);closeUpTimer=window.setTimeout(()=>{if(ready&&!disposed&&tier==='standard')wantSystems(latest.current);},350);});
  const fit=(view:string,extent=0)=>{
   const aspect=camera.aspect,mobile=el.clientWidth<768,normalDistance=mobile?Math.max(4.5,1.8*el.clientHeight/Math.max(160,el.clientHeight-350)/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))):4;
   const reservedHeight=mobile?350:270;const availableAspect=Math.max(.35,(el.clientWidth-(mobile?40:340))/Math.max(160,el.clientHeight-reservedHeight));const atlasDistance=Math.max(packingHeight,packingWidth/availableAspect)/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*(el.clientHeight/Math.max(160,el.clientHeight-reservedHeight))*1.08;
   const distance=T.MathUtils.lerp(normalDistance,Math.max(.2,atlasDistance),extent);if(extent>.8)view='front';
   const direction=view==='front'?new T.Vector3(0,.02,1):view==='back'?new T.Vector3(0,.02,-1):view==='side'?new T.Vector3(1,.02,0):new T.Vector3(.35,.06,1).normalize();
   controls.target.set(extent>.1&&el.clientWidth>767?-packingWidth*.12:0,extent>.1||mobile?.85:.68,0);camera.position.copy(controls.target).addScaledVector(direction,distance);controls.update();dirty=true;
  };
  const resize=()=>{layoutKey='';lastState=null;renderer.setPixelRatio(Math.min(devicePixelRatio,el.clientWidth<768||el.clientHeight<600?1.5:2));camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight);post.setSize(el.clientWidth,el.clientHeight,renderer.getPixelRatio());fit(latest.current.view,amount);};const observer=new ResizeObserver(resize);observer.observe(el);
  const raycaster=new T.Raycaster(),pointer=new T.Vector2(),tap=new PointerTap(),worldBox=new T.Box3(),hitPoint=new T.Vector3();
  const down=(e:PointerEvent)=>{hover.hidden=true;tap.down(e.pointerId,e.clientX,e.clientY,e.pointerType==='touch'?12:5);};
  const move=(e:PointerEvent)=>{tap.move(e.pointerId,e.clientX,e.clientY);if(e.buttons||amount<.5||e.pointerType==='touch'){hover.hidden=true;return;}const rect=el.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,index=findTarget(x,y,12);hover.hidden=index<0;renderer.domElement.style.cursor=index<0?'grab':'pointer';if(index>=0){hover.textContent=atlas.parts[index].name;hover.style.left=`${Math.max(8,Math.min(x+14,el.clientWidth-260))}px`;hover.style.top=`${Math.max(8,Math.min(y+18,el.clientHeight-55))}px`;}};
  const cancel=(e:PointerEvent)=>tap.cancel(e.pointerId);
  const up=(e:PointerEvent)=>{
   const validTap=tap.up(e.pointerId,e.clientX,e.clientY);if(!validTap||!ready)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
   let nearest=Infinity,found=-1;const hasSolid=atlas.parts.some((p,i)=>p.system!=='integumentary'&&data[i*4+3]>.5);
   pickers.forEach((mesh,i)=>{if(!mesh||data[i*4+3]<.5||(hasSolid&&atlas.parts[i].system==='integumentary'))return;worldBox.copy(bounds[i]).translate(mesh.position);if(!raycaster.ray.intersectBox(worldBox,hitPoint))return;const hits=raycaster.intersectObject(mesh,false);if(hits[0]&&hits[0].distance<nearest){nearest=hits[0].distance;found=i;}});
   if(found<0&&amount>.45)found=findTarget(e.clientX-rect.left,e.clientY-rect.top,e.pointerType==='touch'?24:16);if(found>=0){hover.hidden=true;select.current(atlas.parts[found].id);}
  };
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancel);
  const clock=new T.Clock();let lastExtent=-1,sampleStart=performance.now(),sampleFrames=0;
  // Counters cover every pass of a frame (scene and ambient occlusion), reset once per frame.
  renderer.info.autoReset=false;
  const animate=()=>{
   // Rendering stops entirely while the tab is hidden; see onVisibility below.
   if(disposed||document.hidden)return;frame=requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05),s=latest.current;
   const changed=lastState?.visible!==s.visible||lastState?.selected!==s.selected||lastState?.isolate!==s.isolate;
   const moving=Math.abs(amount-s.explode)>.0001;
   if(moving){amount=T.MathUtils.damp(amount,s.explode,8,dt);dirty=true;}
   if(changed||moving||lastExtent<0){
    if(changed&&ready)wantSystems(s);
    const visible=new Set(s.visible),selection=new Set(s.selected);
    const visibleParts=atlas.parts.filter(p=>s.isolate?selection.has(p.id):visible.has(p.system)||selection.has(p.id));
    const nextLayoutKey=visibleParts.map(p=>p.id).join(',')+':'+camera.aspect.toFixed(3);
    if(nextLayoutKey!==layoutKey){const layout=createExplosionLayout(visibleParts,camera.aspect);packingWidth=layout.width;packingHeight=layout.height;atlas.parts.forEach((p,i)=>{const cell=layout.cells.get(p.id);offsets[i]=cell?new T.Vector3(cell.x,cell.y+.85,0):centers[i].clone();});layoutKey=nextLayoutKey;if(amount>.05&&!s.isolate)fit(s.view,Math.max(0,(amount-.3)/.7));}

    atlas.parts.forEach((p,i)=>{
     const c=centers[i],destination=offsets[i];let dx=0,dy=0,dz=0;
     if(amount<=.45){const t=amount/.45;const group=SYSTEMS.findIndex(sys=>sys.id===p.system);const angle=group/SYSTEMS.length*Math.PI*2;dx=Math.sin(angle)*t*.48;dy=(c.y-.85)*t*.28;dz=Math.cos(angle)*t*.48;}
     else {const t=(amount-.45)/.55,group=SYSTEMS.findIndex(sys=>sys.id===p.system),angle=group/SYSTEMS.length*Math.PI*2;dx=T.MathUtils.lerp(Math.sin(angle)*.48,destination.x-c.x,t);dy=T.MathUtils.lerp((c.y-.85)*.28,destination.y-c.y,t);dz=T.MathUtils.lerp(Math.cos(angle)*.48,-c.z,t);}
     const selected=selection.has(p.id);data.set([dx,dy,dz,(s.isolate?selected:visible.has(p.system)||selected)?1:0],i*4);selectedData[i*4]=selected&&!s.isolate?255:0;
     markerPositions.set(data[i*4+3]>.5?[c.x+dx,c.y+dy,c.z+dz]:[10000,10000,10000],i*3);const mesh=pickers[i];if(mesh){mesh.position.set(dx,dy,dz);mesh.updateMatrix();mesh.updateMatrixWorld(true);}
    });partTexture.needsUpdate=true;selectionTexture.needsUpdate=true;markerGeometry.attributes.position.needsUpdate=true;lastState=s;lastExtent=amount;dirty=true;
   }
   if(s.view!==lastView||s.reset!==lastReset){fit(s.view,amount);lastView=s.view;lastReset=s.reset;}
   if(moving&&!s.isolate)fit(amount>.5?'front':s.view,Math.max(0,(amount-.3)/.7));
   const isolateKey=s.isolate?s.selected.join(',')+':'+s.reset+':'+s.inspectorOpen+':'+camera.aspect:'';
   if(isolateKey!==lastIsolate||(s.isolate&&moving)){
    if(s.isolate){const box=new T.Box3();atlas.parts.forEach((p,i)=>{if(s.selected.includes(p.id))box.union(bounds[i].clone().translate(new T.Vector3(data[i*4],data[i*4+1],data[i*4+2])));});
     if(!box.isEmpty()){const center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());const w=el.clientWidth,h=el.clientHeight,mobile=w<768,landscape=w>h&&h<=600;let left=20,right=w-20,top=mobile?175:110,bottom=h-170;if(s.inspectorOpen){if(landscape){right=w-335;top=100;bottom=h-125;}else if(mobile){const sheet=document.querySelector('.detail-sheet')?.getBoundingClientRect(),header=document.querySelector('.top-bar')?.getBoundingClientRect();top=(header?.bottom??94)+16;bottom=(sheet?.top??h*.58-139)-16;}else{right=w-370;left=w>1100?285:25;}}const availableWidth=Math.max(150,right-left),availableHeight=Math.max(40,bottom-top);camera.setViewOffset(w,h,w/2-(left+right)/2,h/2-(top+bottom)/2,w,h);const distance=Math.max(.07,Math.max(size.y*h/availableHeight,size.x*w/availableWidth/camera.aspect,size.z)/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*1.35);controls.maxDistance=Math.max(40,distance*2);controls.target.copy(center);camera.position.copy(center).add(new T.Vector3(.2,.1,1).normalize().multiplyScalar(distance));controls.update();dirty=true;}
    }else if(lastIsolate){camera.clearViewOffset();fit(s.view,amount);}
    lastIsolate=isolateKey;
   }
   controls.enableRotate=amount<.8;controls.mouseButtons.LEFT=amount<.8?T.MOUSE.ROTATE:T.MOUSE.PAN;controls.touches.ONE=amount<.8?T.TOUCH.ROTATE:T.TOUCH.PAN;stage.group.visible=amount<.5&&!s.isolate;markers.visible=amount>.75;controls.autoRotate=s.rotate&&!s.isolate&&amount<.4;controls.autoRotateSpeed=.65;controls.update();if(controls.autoRotate)dirty=true;
   if(latestTier.current&&latestTier.current!==tier){tier=latestTier.current;streamer.setTier(tier);fullDetail=false;}
   if(stats.current){dirty=true;sampleFrames++;const now=performance.now();if(now-sampleStart>=500){stats.current({tier,fps:Math.round(sampleFrames*1000/(now-sampleStart)),residentTriangles:residency.stats().triangles,drawnTriangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,files:residency.stats().files});sampleStart=now;sampleFrames=0;}}
   if(dirty){renderer.info.reset();post.render();targets=[];if(amount>.45){const hasSolid=atlas.parts.some((p,i)=>p.system!=='integumentary'&&data[i*4+3]>.5);atlas.parts.forEach((p,i)=>{if(data[i*4+3]<.5||(hasSolid&&p.system==='integumentary'))return;let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;for(let corner=0;corner<8;corner++){projected.set(p.bounds[(corner&1)?1:0][0]+data[i*4],p.bounds[(corner&2)?1:0][1]+data[i*4+1],p.bounds[(corner&4)?1:0][2]+data[i*4+2]).project(camera);const x=(projected.x+1)*el.clientWidth/2,y=(1-projected.y)*el.clientHeight/2;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}projected.copy(centers[i]).add(new T.Vector3(data[i*4],data[i*4+1],data[i*4+2])).project(camera);if(projected.z< -1||projected.z>1)return;targets.push({index:i,x:(projected.x+1)*el.clientWidth/2,y:(1-projected.y)*el.clientHeight/2,left,right,top,bottom});});}dirty=false;}

   // First frame that shows the low-detail body: record the timing and remove the splash screen.
   if(ready&&!firstBody){firstBody=true;performance.mark('anima:first-body');hideSplash();}
  };animate();
  const onVisibility=()=>{if(!document.hidden&&!disposed){cancelAnimationFrame(frame);clock.getDelta();dirty=true;animate();}};
  document.addEventListener('visibilitychange',onVisibility);
  const contextLost=(e:Event)=>{e.preventDefault();onError('The 3D session was paused by your device. Reload to continue.');};renderer.domElement.addEventListener('webglcontextlost',contextLost);
  return()=>{disposed=true;clearTimeout(closeUpTimer);streamer.dispose();residency.dispose();document.removeEventListener('visibilitychange',onVisibility);cancelAnimationFrame(frame);observer.disconnect();controls.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());scene.traverse(o=>{if(o instanceof T.Mesh&&!geometries.includes(o.geometry)){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});env.dispose();stage.dispose();post.dispose();partTexture.dispose();selectionTexture.dispose();markerGeometry.dispose();markerMaterial.dispose();hover.remove();renderer.dispose();renderer.domElement.remove();};
 },[manifest]);
 return <div className="scene" ref={host}/>;
}
