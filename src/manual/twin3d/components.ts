export type Vector3Tuple = [number, number, number];
export const componentIds = ['traction_motor','traction_sheave','ropes','brake','gearbox','vfd_drive','elevator_controller','guide_rails','door_system','door_motor','encoder','pulley_idler_sheaves','elevator_cabin','counterweight','safety_gear','buffers','pit_equipment'] as const;
export type ComponentId = typeof componentIds[number];
export const visualStatuses = ['unknown','normal','warning','repair','critical','upgrade','replace'] as const;
export type VisualStatus = typeof visualStatuses[number];
export interface ComponentVisualState { status:VisualStatus; healthState:string|null; source?:string }
export type ComponentStateMap = Partial<Record<ComponentId,ComponentVisualState>>;
export interface TwinComponent extends ComponentVisualState {
  id:ComponentId; displayName:string; category:string; group:string;
  visible:boolean; selectable:boolean; assembledPosition:Vector3Tuple; explodedPosition:Vector3Tuple;
  metadata:{ description:string; applicability:string; schematic:true };
}
type Definition = [ComponentId,string,string,string,Vector3Tuple,Vector3Tuple,string];
const definitions:Definition[] = [
  ['traction_motor','Traction Motor','Drive','drive_system',[-.62,8.45,-.15],[-3.7,10,-.15],'Motor body and output shaft. Existing motor readings are available in the inspector.'],
  ['traction_sheave','Traction Sheave','Drive','drive_system',[.12,8.45,-.15],[.2,10.6,-.15],'Grooved wheel connecting the machine to the suspension ropes.'],
  ['ropes','Ropes','Drive','drive_system',[0,6.8,-.15],[0,7.8,1.9],'Four schematic suspension ropes link the car roof, drive sheave and counterweight.'],
  ['brake','Brake','Drive safety','drive_system',[.52,8.45,-.15],[2,10.1,.1],'Schematic brake disc and paired calipers beside the drive sheave.'],
  ['gearbox','Gearbox','Drive · geared only','drive_system',[-.55,8.45,-.15],[-1.8,10.8,-.7],'Conditional gearbox between motor and traction sheave; absent in gearless layouts.'],
  ['vfd_drive','VFD / Drive','Electrical control','drive_system',[2.15,8.4,-.7],[5,9.4,-1.8],'Variable-frequency drive cabinet in the machine-space context.'],
  ['elevator_controller','Elevator Controller','Control','control_system',[2.15,6.85,-.7],[5.8,7,.1],'Control cabinet. No controller condition data is currently supplied.'],
  ['guide_rails','Guide Rails','Guidance','guidance_system',[0,4.6,0],[-4,4.6,0],'Car and counterweight guide rails extend vertically through the shaft.'],
  ['door_system','Door System','Door','car_system',[0,3.2,1.43],[0,3.2,4.1],'Car entrance frame and two sliding door panels shown partly open for clarity.'],
  ['door_motor','Door Motor','Door','car_system',[0,4.55,1.25],[-1.4,5.8,3],'Door operator, motor and belt across the cabin entrance.'],
  ['encoder','Encoder','Feedback','drive_system',[-1.23,8.45,-.15],[-4.2,8.4,.2],'Feedback encoder mounted at the traction motor’s rear shaft.'],
  ['pulley_idler_sheaves','Pulley / Idler Sheaves','Drive','drive_system',[0,7.25,-1.08],[1.8,8.2,-2.7],'Schematic guide sheave alongside the counterweight rope run.'],
  ['elevator_cabin','Elevator Cabin','Car','car_system',[0,3.2,.38],[0,3.2,.38],'Cutaway car with floor, roof, frame and rear wall; dimensions are illustrative.'],
  ['counterweight','Counterweight','Counterweight','counterweight_system',[0,5.35,-.95],[2.7,4.9,-2.4],'Framed stack of counterweight plates behind the car.'],
  ['safety_gear','Safety Gear','Safety','car_system',[0,1.85,.35],[-2.9,1.9,1.8],'Paired schematic safety-gear blocks at the lower car frame beside its rails.'],
  ['buffers','Buffers','Safety pit','pit_system',[0,.62,.05],[1.6,.7,2.8],'Car and counterweight buffers beneath their respective travel paths.'],
  ['pit_equipment','Pit Equipment','Pit','pit_system',[0,.25,0],[-3.6,.1,-2.2],'Pit platform, access ladder and service enclosure.'],
];
export function createComponentRegistry(geared=false):TwinComponent[]{
  return definitions.map(([id,displayName,category,group,assembled,exploded,description])=>{
    let position:Vector3Tuple=[...assembled];
    if(geared&&id==='traction_motor')position=[-1.32,8.45,-.15];
    if(geared&&id==='encoder')position=[-1.93,8.45,-.15];
    return {id,displayName,category,group,visible:id!=='gearbox'||geared,selectable:true,assembledPosition:position,explodedPosition:[...exploded],status:'unknown',healthState:null,metadata:{description,applicability:id==='gearbox'?'Geared elevator only':'Schematic layout',schematic:true}};
  });
}
export const defaultVisualState:ComponentVisualState={status:'unknown',healthState:null};
export function resolveVisualState(id:ComponentId,states:ComponentStateMap):ComponentVisualState {
  const state=states[id];
  return state&&visualStatuses.includes(state.status)?{status:state.status,healthState:typeof state.healthState==='string'?state.healthState:null,source:state.source}:defaultVisualState;
}
// Presentation mapping only. No condition thresholds or recommendation logic.
export const statusAppearance:Record<VisualStatus,{color:string|null;label:string}>={
  unknown:{color:'#7e949e',label:'Unknown · no complete condition data'},normal:{color:'#e3eff5',label:'Normal'},
  warning:{color:'#e8b85b',label:'Warning / Repair Required'},repair:{color:'#e8b85b',label:'Repair Required'},critical:{color:'#ed4d58',label:'Critical'},
  upgrade:{color:'#8f85eb',label:'Upgrade (supplied)'},replace:{color:'#e178c4',label:'Replace (supplied)'},
};
export function interpolatedPosition(component:TwinComponent,factor:number):Vector3Tuple {
  const t=Math.max(0,Math.min(1,factor));
  if(t===0)return [...component.assembledPosition];
  if(t===1)return [...component.explodedPosition];
  return component.assembledPosition.map((v,i)=>v+(component.explodedPosition[i]-v)*t) as Vector3Tuple;
}
