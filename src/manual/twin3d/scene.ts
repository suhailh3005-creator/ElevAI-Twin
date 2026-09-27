import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTwinModel } from './model';
import { interpolatedPosition, statusAppearance, type ComponentId, type ComponentStateMap } from './components';
import { motionDuration, tweenValue } from './motion';

export function createTwinScene(host:HTMLDivElement,callbacks:{select:(id:ComponentId|null)=>void;separate?:(id:ComponentId)=>void;hover:(id:ComponentId|null)=>void;error:(message:string)=>void;anchor?:(point:{x:number;y:number;visible:boolean}|null)=>void}){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.setClearColor(0x111b23,1);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const canvas=renderer.domElement;canvas.setAttribute('aria-label','Interactive 3D elevator. Use the adjacent component list and view controls for keyboard access.');canvas.setAttribute('role','img');
  host.appendChild(canvas);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-7,7,7,-7,.1,100);
  const model=createTwinModel();scene.add(model.root);
  scene.add(new THREE.HemisphereLight(0xe6f6ff,0x556777,2.5));
  const key=new THREE.DirectionalLight(0xfff1db,3.2);key.position.set(5,12,8);scene.add(key);
  const fill=new THREE.DirectionalLight(0x93b6cf,1.8);fill.position.set(-6,5,-5);scene.add(fill);
  const grid=new THREE.GridHelper(18,36,0x31434f,0x1d2e39);grid.position.y=-.12;scene.add(grid);
  const outline=new THREE.BoxHelper(model.root,0x86e4df);outline.visible=false;scene.add(outline);
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.12;controls.minZoom=.4;controls.maxZoom=7;controls.maxPolarAngle=Math.PI*.92;
  let disposed=false,frame=0,active=true,selected:ComponentId|null=null,hovered:ComponentId|null=null,isolated=false,hidden:ComponentId[]=[];
  let ambientTimer:ReturnType<typeof setTimeout>|undefined;
  let factor=0,targetFactor=0,animation:{start:number;from:number;to:number}|null=null;
  let separated=false;
  const foreground=new Map<ComponentId,{value:number;from:number;to:number;start:number;offset:THREE.Vector3}>();
  const localBounds=new Map([...model.nodes].map(([id,node])=>{const box=new THREE.Box3().setFromObject(node.object);return [id,{center:box.getCenter(new THREE.Vector3()).sub(node.object.position),size:box.getSize(new THREE.Vector3())}];}));
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  type Pose={position:THREE.Vector3;target:THREE.Vector3;zoom:number};
  let cameraAnimation:{start:number;from:Pose;to:Pose}|null=null,returnPose:Pose|null=null;
  const pose=():Pose=>({position:camera.position.clone(),target:controls.target.clone(),zoom:camera.zoom});
  function applyPose(p:Pose){camera.position.copy(p.position);controls.target.copy(p.target);camera.zoom=p.zoom;camera.updateProjectionMatrix();const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;}
  function moveCamera(to:Pose,instant=false){if(instant||reducedMotion.matches){cameraAnimation=null;applyPose(to);}else cameraAnimation={start:performance.now(),from:pose(),to};requestRender();}
  function interruptCamera(){cameraAnimation=null;requestRender();}
  function motionPreference(){controls.enableDamping=!reducedMotion.matches;if(reducedMotion.matches){if(animation){factor=animation.to;model.setExplosion(factor);animation=null;}if(cameraAnimation){const to=cameraAnimation.to;cameraAnimation=null;applyPose(to);}}requestRender();}
  controls.enableDamping=!reducedMotion.matches;
  reducedMotion.addEventListener('change',motionPreference);
  function requestRender(){if(!disposed&&active&&!document.hidden&&!frame)frame=requestAnimationFrame(render);}
  function render(now:number){
    frame=0;if(disposed||!active)return;
    if(animation){const t=Math.min(1,(now-animation.start)/motionDuration);factor=tweenValue(animation.from,animation.to,t);model.setExplosion(factor);if(t===1)animation=null;}
    if(cameraAnimation){const {from,to,start}=cameraAnimation,t=Math.min(1,(now-start)/motionDuration),s=tweenValue(0,1,t);applyPose({position:from.position.clone().lerp(to.position,s),target:from.target.clone().lerp(to.target,s),zoom:tweenValue(from.zoom,to.zoom,t)});if(t===1)cameraAnimation=null;}
    const dampingChanged=controls.update();
    const transforms=new Map<ComponentId,{offset:THREE.Vector3;scale:number}>();let movingForeground=false;
    for(const [id,transition]of foreground){const t=reducedMotion.matches?1:Math.min(1,(now-transition.start)/motionDuration);transition.value=tweenValue(transition.from,transition.to,t);if(t<1)movingForeground=true;if(transition.value===0&&t===1){foreground.delete(id);continue;}
      transforms.set(id,{offset:transition.offset.clone().multiplyScalar(transition.value),scale:1});
    }
    model.setPresentation(transforms);
    const node=selected?model.nodes.get(selected):undefined;
    outline.visible=!!node?.object.visible;if(node?.object.visible){outline.setFromObject(node.object);(outline.material as THREE.LineBasicMaterial).color.set(statusAppearance[node.definition.status].color??'#7e949e');}
    model.tick(now/1000,!reducedMotion.matches);renderer.render(scene,camera);
    if(node?.object.visible){const point=new THREE.Box3().setFromObject(node.object).getCenter(new THREE.Vector3()).project(camera);callbacks.anchor?.({x:(point.x+1)*host.clientWidth/2,y:(1-point.y)*host.clientHeight/2,visible:point.z>=-1&&point.z<=1});}else callbacks.anchor?.(null);
    if(animation||cameraAnimation||dampingChanged||movingForeground)requestRender();
    else if(!reducedMotion.matches){clearTimeout(ambientTimer);ambientTimer=setTimeout(requestRender,1000/24);}
  }
  function foregroundSelection(){const now=performance.now();for(const [id,node]of model.nodes){const to=separated&&id===selected&&node.object.visible?1:0,old=foreground.get(id);if((old?.to??0)!==to){
    // Capture a world-space offset once. Orbiting never changes the inspection position.
    const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),size=localBounds.get(id)!.size;
    const offset=old?.offset??right.multiplyScalar(3.5+Math.max(size.x,size.z)*.5);
    foreground.set(id,{value:old?.value??0,from:old?.value??0,to,start:now,offset});
  }}requestRender();}
  function interaction(){model.setInteraction({selected,hovered,isolated,hidden});requestRender();}
  function resize(){const width=host.clientWidth,height=host.clientHeight;if(width<1||height<1)return;renderer.setSize(width,height,false);const half=7.2;camera.left=-half*width/height;camera.right=half*width/height;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();requestRender();}
  function fittedPose(bounds:THREE.Box3,keepAngle=false):Pose{
    const center=bounds.getCenter(new THREE.Vector3()),offset=keepAngle?camera.position.clone().sub(controls.target):new THREE.Vector3(12,9,14);
    const view=camera.clone();view.position.copy(center).add(offset);view.lookAt(center);view.updateMatrixWorld(true);
    let x=0,y=0;for(const a of [bounds.min.x,bounds.max.x])for(const b of [bounds.min.y,bounds.max.y])for(const c of [bounds.min.z,bounds.max.z]){const p=new THREE.Vector3(a,b,c).applyMatrix4(view.matrixWorldInverse);x=Math.max(x,Math.abs(p.x));y=Math.max(y,Math.abs(p.y));}
    return {position:view.position.clone(),target:center,zoom:THREE.MathUtils.clamp(Math.min((camera.right-camera.left)/(2*x*1.2),(camera.top-camera.bottom)/(2*y*1.2)),.4,4)};
  }
  function layoutPose(){
    // Include the target layout so parts stay in frame during the whole transition.
    const current=factor;model.setPresentation(new Map());model.setExplosion(targetFactor);const bounds=new THREE.Box3().setFromObject(model.root);model.setExplosion(current);return fittedPose(bounds);
  }
  function resetCamera(instant=false){returnPose=null;moveCamera(layoutPose(),instant);}
  function focus(){const node=selected?model.nodes.get(selected):undefined;if(node?.object.visible){
    returnPose??=pose();const bounds=localBounds.get(selected!)!,center=new THREE.Vector3(...interpolatedPosition(node.definition,targetFactor)).add(bounds.center);
    if(separated)center.add(foreground.get(selected!)?.offset??new THREE.Vector3());
    const box=new THREE.Box3().setFromCenterAndSize(center,bounds.size.clone()).expandByScalar(separated?1.6:.65);
    moveCamera(fittedPose(box,true));
  }}
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function pick(event:MouseEvent){
    const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    const objects=[...model.nodes.values()].filter(n=>n.object.visible&&n.definition.selectable).map(n=>n.object);
    return (raycaster.intersectObjects(objects,true)[0]?.object.userData.componentId as ComponentId|undefined)??null;
  }
  let down:{x:number;y:number;id:number}|null=null;
  function pointerDown(e:PointerEvent){if(e.button===0)down={x:e.clientX,y:e.clientY,id:e.pointerId};}
  function pointerMove(e:PointerEvent){if(e.buttons)return;const id=pick(e);if(hovered!==id){hovered=id;callbacks.hover(id);canvas.style.cursor=id?'pointer':'grab';interaction();}}
  let clickTimer:ReturnType<typeof setTimeout>|undefined;
  function pointerUp(e:PointerEvent){if(down&&down.id===e.pointerId&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<5){const id=pick(e);clearTimeout(clickTimer);clickTimer=setTimeout(()=>{callbacks.select(id);if(id===selected&&!separated)focus();},240);}down=null;}
  function doubleClick(e:MouseEvent){clearTimeout(clickTimer);const id=pick(e);if(id)callbacks.separate?.(id);}
  function pointerLeave(){down=null;if(hovered){hovered=null;callbacks.hover(null);interaction();}}
  function lostContext(e:Event){e.preventDefault();callbacks.error('The 3D graphics context was lost. Reload the page to restore it; component information and readings remain available.');}
  function smoothWheel(e:WheelEvent){e.preventDefault();e.stopImmediatePropagation();const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?host.clientHeight:1),to=cameraAnimation?.to??pose();moveCamera({...to,zoom:THREE.MathUtils.clamp(to.zoom*Math.exp(-Math.max(-500,Math.min(500,pixels))*.0015),controls.minZoom,controls.maxZoom)});}
  canvas.addEventListener('wheel',smoothWheel,{capture:true,passive:false});
  canvas.addEventListener('dblclick',doubleClick);
  canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointerleave',pointerLeave);canvas.addEventListener('webglcontextlost',lostContext);
  controls.addEventListener('change',requestRender);
  controls.addEventListener('start',interruptCamera);
  let lastWidth=host.clientWidth,lastHeight=host.clientHeight;
  const observer=new ResizeObserver(()=>{if(host.clientWidth===lastWidth&&host.clientHeight===lastHeight)return;lastWidth=host.clientWidth;lastHeight=host.clientHeight;resize();if(!selected)resetCamera(true);});observer.observe(host);
  const visibility=new IntersectionObserver(entries=>{active=entries[0].isIntersecting;if(active)requestRender();else if(frame){cancelAnimationFrame(frame);frame=0;}});visibility.observe(host);
  document.addEventListener('visibilitychange',requestRender);
  resize();resetCamera(true);
  return {
    setExplosion(value:number){targetFactor=value;if(reducedMotion.matches||factor===value){factor=value;model.setExplosion(factor);animation=null;}else animation={start:performance.now(),from:factor,to:value};if(selected){returnPose=layoutPose();focus();}else resetCamera();requestRender();},
    setGeared(value:boolean){model.setGeared(value);if(selected){returnPose=layoutPose();focus();}else resetCamera();requestRender();},
    setStates(value:ComponentStateMap){model.setStates(value);requestRender();},
    setInteraction(value:{selected:ComponentId|null;isolated:boolean;hidden:ComponentId[];separated?:boolean}){const previous=selected,wasSeparated=separated;selected=value.selected;separated=!!value.separated;isolated=value.isolated;hidden=value.hidden;interaction();foregroundSelection();if(previous!==selected||wasSeparated!==separated){if(selected)focus();else if(returnPose){moveCamera(returnPose);returnPose=null;}else resetCamera();}},
    resetCamera(instant=false){selected=null;separated=false;isolated=false;interaction();foregroundSelection();resetCamera(instant);},
    focus,
    zoom(multiplier:number){const to=cameraAnimation?.to??pose();moveCamera({...to,zoom:THREE.MathUtils.clamp(to.zoom*multiplier,controls.minZoom,controls.maxZoom)});},
    rotate(angle:number){const to=cameraAnimation?.to??pose(),offset=to.position.clone().sub(to.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),angle);moveCamera({...to,position:to.target.clone().add(offset)});},
    dispose(){disposed=true;clearTimeout(ambientTimer);document.removeEventListener('visibilitychange',requestRender);clearTimeout(clickTimer);canvas.removeEventListener('dblclick',doubleClick);if(frame)cancelAnimationFrame(frame);observer.disconnect();visibility.disconnect();reducedMotion.removeEventListener('change',motionPreference);controls.removeEventListener('change',requestRender);controls.removeEventListener('start',interruptCamera);controls.dispose();canvas.removeEventListener('wheel',smoothWheel,true);canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointerleave',pointerLeave);canvas.removeEventListener('webglcontextlost',lostContext);model.dispose();outline.geometry.dispose();(outline.material as THREE.Material).dispose();grid.geometry.dispose();const gm=grid.material;(Array.isArray(gm)?gm:[gm]).forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();canvas.remove();},
  };
}
export type TwinScene=ReturnType<typeof createTwinScene>;
