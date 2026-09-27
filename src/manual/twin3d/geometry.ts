import * as THREE from 'three';
import { createComponentRegistry, type ComponentId, type TwinComponent, type Vector3Tuple } from './components';
export interface ComponentNode { definition:TwinComponent; object:THREE.Group }
const colors={motor:0x508b91,steel:0xa4afb6,dark:0x36454f,rail:0x637781,rope:0xc6baa0,door:0xb5c4cd,weight:0x9a9079,safety:0xc6a869,cabinet:0x657e88};
export function buildElevator(geared=false){
  const root=new THREE.Group();root.name='ElevatorDigitalTwin';
  const geometries=new Map<string,THREE.BufferGeometry>(),materials=new Map<string,THREE.MeshStandardMaterial>();
  const geometry=(key:string,create:()=>THREE.BufferGeometry)=>{if(!geometries.has(key))geometries.set(key,create());return geometries.get(key)!;};
  const material=(id:string,color:number)=>{const key=`${id}:${color}`;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.58,metalness:.38}));return materials.get(key)!;};
  function mesh(parent:THREE.Group,g:THREE.BufferGeometry,color:number,at:Vector3Tuple,id:string){const m=new THREE.Mesh(g,material(id,color));m.position.set(...at);m.userData.componentId=id;m.userData.baseColor=color;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function box(p:THREE.Group,size:Vector3Tuple,at:Vector3Tuple,color:number,id:string){return mesh(p,geometry(`b:${size}`,()=>new THREE.BoxGeometry(...size)),color,at,id);}
  function cylinder(p:THREE.Group,r:number,h:number,at:Vector3Tuple,color:number,id:string,axis:'x'|'y'|'z'='y'){
    const m=mesh(p,geometry(`c:${r}:${h}`,()=>new THREE.CylinderGeometry(r,r,h,24)),color,at,id);if(axis==='x')m.rotation.z=Math.PI/2;if(axis==='z')m.rotation.x=Math.PI/2;return m;
  }
  function wheel(p:THREE.Group,r:number,width:number,id:string){
    cylinder(p,r,width,[0,0,0],colors.dark,id,'x');
    for(const x of [-width/2,width/2])cylinder(p,r+.035,.035,[x,0,0],colors.steel,id,'x');
    cylinder(p,r*.28,width+.12,[0,0,0],colors.steel,id,'x');
    for(let k=0;k<5;k++){const torus=geometry(`torus:${r}`,()=>new THREE.TorusGeometry(r+.009,.012,6,32));const ring=mesh(p,torus,colors.rail,[-width*.38+k*width*.19,0,0],id);ring.rotation.y=Math.PI/2;}
    for(let k=0;k<6;k++){const spoke=box(p,[.03,r*1.6,.055],[width/2+.021,0,0],colors.rail,id);spoke.rotation.x=k*Math.PI/3;}
  }
  const builders:Record<ComponentId,(g:THREE.Group,id:ComponentId)=>void>={
    traction_motor:(g,id)=>{cylinder(g,.39,.94,[0,0,0],colors.motor,id,'x');for(let i=0;i<9;i++)cylinder(g,.42,.027,[-.4+i*.1,0,0],colors.motor,id,'x');cylinder(g,.13,.5,[.62,0,0],colors.steel,id,'x');box(g,[1.05,.13,.72],[0,-.43,0],colors.dark,id);box(g,[.35,.2,.3],[-.1,.4,0],colors.dark,id);},
    traction_sheave:(g,id)=>wheel(g,.65,.38,id),
    ropes:(g,id)=>{for(const x of [-.03,.07,.17,.27]){const points=[new THREE.Vector3(x,4.47-6.8,.5+.15),new THREE.Vector3(x,8.45-6.8,.5+.15)];for(let i=1;i<=24;i++){const angle=i/24*Math.PI;points.push(new THREE.Vector3(x,8.45+.65*Math.sin(angle)-6.8,.65*Math.cos(angle)));}points.push(new THREE.Vector3(x,6.48-6.8,-.8+.15));const curve=new THREE.CurvePath<THREE.Vector3>();for(let i=1;i<points.length;i++)curve.add(new THREE.LineCurve3(points[i-1],points[i]));mesh(g,geometry(`rope:${x}`,()=>new THREE.TubeGeometry(curve,64,.018,6,false)),colors.rope,[0,0,0],id);}},
    brake:(g,id)=>{cylinder(g,.37,.075,[0,0,0],colors.steel,id,'x');for(const sign of [-1,1])box(g,[.23,.19,.35],[0,sign*.32,0],colors.safety,id);box(g,[.13,.8,.12],[.18,0,0],colors.dark,id);},
    gearbox:(g,id)=>{box(g,[.56,.77,.65],[0,0,0],colors.motor,id);cylinder(g,.19,.82,[0,0,0],colors.steel,id,'x');for(const x of [-.24,.24])box(g,[.06,.87,.75],[x,0,0],colors.dark,id);},
    vfd_drive:(g,id)=>{box(g,[.62,1.08,.48],[0,0,0],colors.cabinet,id);box(g,[.45,.35,.04],[0,.22,.26],colors.dark,id);for(let i=0;i<5;i++)box(g,[.4,.02,.02],[0,-.05-i*.07,.27],colors.steel,id);box(g,[.18,.12,.05],[0,.25,.29],0x79a2a6,id);},
    elevator_controller:(g,id)=>{box(g,[.7,1.2,.48],[0,0,0],colors.cabinet,id);box(g,[.57,1.04,.03],[0,0,.255],colors.steel,id);box(g,[.28,.22,.04],[0,.29,.29],colors.dark,id);box(g,[.035,.18,.045],[.2,-.12,.29],colors.dark,id);for(let i=0;i<3;i++)cylinder(g,.027,.05,[-.13+i*.12,.02,.3],i===0?0x73a4a3:colors.dark,id,'z');},
    guide_rails:(g,id)=>{for(const x of [-1.36,1.36]){box(g,[.1,8.7,.12],[x,0,.35],colors.rail,id);box(g,[.25,8.7,.035],[x,0,.28],colors.rail,id);for(let y=-3.7;y<4;y+=1.8)box(g,[.36,.09,.21],[x,y,.24],colors.dark,id);}for(const x of [-.9,.9]){box(g,[.08,8.7,.12],[x,0,-.95],colors.rail,id);}},
    door_system:(g,id)=>{for(const x of [-1.14,1.14])box(g,[.09,2.5,.13],[x,0,0],colors.dark,id);for(const y of [-1.25,1.25])box(g,[2.4,.1,.16],[0,y,0],colors.steel,id);for(const x of [-.76,.76]){box(g,[.69,2.28,.06],[x,0,0],colors.door,id);box(g,[.026,2.08,.02],[x+Math.sign(x)*.22,0,.045],colors.rail,id);}},
    door_motor:(g,id)=>{box(g,[2.3,.12,.18],[0,0,0],colors.dark,id);cylinder(g,.14,.34,[-.83,.12,.02],colors.motor,id,'x');for(const x of [-1,1])cylinder(g,.07,.04,[x,.02,.13],colors.steel,id,'z');box(g,[2,.027,.024],[0,.08,.16],colors.rope,id);},
    encoder:(g,id)=>{cylinder(g,.17,.18,[0,0,0],colors.safety,id,'x');cylinder(g,.09,.2,[.12,0,0],colors.steel,id,'x');box(g,[.06,.2,.08],[-.02,-.2,0],colors.dark,id);},
    pulley_idler_sheaves:(g,id)=>{wheel(g,.28,.38,id);box(g,[.6,.1,.7],[0,-.38,0],colors.dark,id);},
    elevator_cabin:(g,id)=>{box(g,[2.38,.14,2.12],[0,-1.25,0],colors.dark,id);box(g,[2.22,.035,1.98],[0,-1.16,0],colors.steel,id);box(g,[2.4,.13,2.15],[0,1.2,0],colors.steel,id);box(g,[2.24,2.25,.065],[0,0,-1],colors.cabinet,id);for(const x of [-1.13,1.13]){for(const z of [-.95,.95])box(g,[.07,2.3,.07],[x,0,z],colors.steel,id);box(g,[.05,.64,1.96],[x,-.8,0],colors.steel,id);box(g,[.05,.04,1.96],[x,-.17,0],colors.rope,id);}box(g,[1.55,.08,.08],[0,1.34,.12],colors.dark,id);},
    counterweight:(g,id)=>{for(const x of [-.79,.79])box(g,[.09,2.25,.34],[x,0,0],colors.dark,id);for(const y of [-1.1,1.1])box(g,[1.66,.12,.37],[0,y,0],colors.dark,id);for(let i=0;i<10;i++)box(g,[1.43,.17,.25],[0,-.88+i*.196,0],colors.weight,id);box(g,[.5,.17,.32],[0,1.19,.12],colors.steel,id);},
    safety_gear:(g,id)=>{for(const x of [-1.27,1.27]){box(g,[.29,.28,.33],[x,0,0],colors.safety,id);box(g,[.08,.42,.1],[x,0,.2],colors.dark,id);}box(g,[2.42,.06,.06],[0,-.12,0],colors.steel,id);},
    buffers:(g,id)=>{for(const [x,z]of [[-.65,.4],[.65,.4],[0,-.95]]){cylinder(g,.2,.12,[x,-.27,z],colors.dark,id);cylinder(g,.075,.5,[x,0,z],colors.steel,id);for(let i=0;i<6;i++){const ring=mesh(g,geometry('buffer-ring',()=>new THREE.TorusGeometry(.13,.025,6,16)),colors.safety,[x,-.2+i*.07,z],id);ring.rotation.x=Math.PI/2;}cylinder(g,.16,.07,[x,.29,z],colors.dark,id);}},
    pit_equipment:(g,id)=>{box(g,[3.8,.2,3.35],[0,-.1,0],colors.dark,id);box(g,[.42,.45,.35],[1.32,.19,-1],colors.safety,id);for(const x of [-1.6,-1.2])box(g,[.04,1.08,.04],[x,.52,1.3],colors.steel,id);for(let i=0;i<5;i++)box(g,[.4,.035,.04],[-1.4,.16+i*.18,1.3],colors.steel,id);},
  };
  const groups=new Map<string,THREE.Group>();
  const nodes=new Map<ComponentId,ComponentNode>();
  for(const definition of createComponentRegistry(geared)){
    if(!groups.has(definition.group)){const group=new THREE.Group();group.name=definition.group;groups.set(definition.group,group);root.add(group);}
    const object=new THREE.Group();object.name=definition.id;object.userData.componentId=definition.id;object.position.set(...definition.assembledPosition);object.visible=definition.visible;
    builders[definition.id](object,definition.id);groups.get(definition.group)!.add(object);nodes.set(definition.id,{definition,object});
  }
  const structure=new THREE.Group();structure.name='shaft_structure';root.add(structure);
  for(const x of [-1.65,1.65])for(const z of [-1.45,1.6])box(structure,[.045,9.3,.045],[x,4.7,z],0x35464f,'shaft_structure');
  for(const y of [.12,7.88,9.34]){for(const z of [-1.45,1.6])box(structure,[3.34,.045,.045],[0,y,z],0x35464f,'shaft_structure');for(const x of [-1.65,1.65])box(structure,[.045,.045,3.05],[x,y,.075],0x35464f,'shaft_structure');}
  box(structure,[3.3,.11,.55],[0,7.96,-.1],0x42525b,'shaft_structure');
  root.updateMatrixWorld(true);
  return {root,nodes,structure,dispose(){for(const g of geometries.values())g.dispose();for(const m of materials.values())m.dispose();}};
}
export type ElevatorSceneModel = ReturnType<typeof buildElevator>;
