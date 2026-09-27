import { defaultNormalization, definitionFor, evaluatedIds, validateInspection, type ComponentInspection, type EvaluatedId, type InputValue, type Normalization } from './engine';

export const entryOrder:EvaluatedId[]=['traction_sheave','brake','gearbox','vfd_drive'];
export interface ObservationDraft {values:Partial<Record<EvaluatedId,Record<string,string>>>;normalizations:Partial<Record<EvaluatedId,Normalization>>;source:string;driveType:''|'geared'|'gearless';generatedSample?:boolean;demoTarget?:EvaluatedId}
export const blankObservations=():ObservationDraft=>({values:{},normalizations:{},source:'',driveType:''});

// Illustrative demo profiles constrained against the SAME evaluator bands as manual input.
// Five explicit defect mechanisms, never a hardcoded visual-state override.
export function randomObservations(target:EvaluatedId,rng:()=>number=Math.random):ObservationDraft{
  if(!evaluatedIds.includes(target))throw new Error('Choose a component to demonstrate.');
  const n=(min:number,max:number,digits=1)=>Number((min+Math.min(1,Math.max(0,rng()))*(max-min)).toFixed(digits));
  const values:Record<EvaluatedId,Record<string,InputValue>>={
    traction_sheave:{sheave_wear:n(2,8),rope_slip:n(.2,1.5,2),vibration:n(.6,2.8,2),temperature:n(30,52)},
    brake:{brake_temperature:n(35,60),brake_response_time:n(55,90),brake_wear:n(12,40),fault_count:0},
    gearbox:{temperature:n(35,60),vibration:n(.6,2.8,2),oil_condition:'Good',oil_leakage:'None'},
    vfd_drive:{current_deviation:n(.3,3.8,2),voltage_deviation:n(.3,3.8,2),temperature:n(30,52),fault_count:0},
  };
  const defects:Record<EvaluatedId,()=>void>={
    traction_sheave:()=>Object.assign(values.traction_sheave,{sheave_wear:n(24,38),vibration:n(5.6,7.8,2)}),
    brake:()=>Object.assign(values.brake,{brake_response_time:n(165,220),brake_wear:n(78,90),fault_count:n(3,5,0)}),
    gearbox:()=>Object.assign(values.gearbox,{temperature:n(90,105),vibration:n(5.6,8,2),oil_condition:'Critical condition',oil_leakage:'Significant'}),
    vfd_drive:()=>Object.assign(values.vfd_drive,{current_deviation:n(12,18,2),temperature:n(80,95),fault_count:n(4,7,0)}),
  };
  defects[target]();
  return {values:Object.fromEntries(entryOrder.map(id=>[id,Object.fromEntries(Object.entries(values[id]).map(([key,value])=>[key,String(value)]))])),normalizations:{},driveType:'geared',source:`Generated demonstration · target: ${definitionFor(target).name}`,generatedSample:true,demoTarget:target};
}
export function inspectionsFromDraft(draft:ObservationDraft,period:{start:string;end:string}):ComponentInspection[]{
  const records:ComponentInspection[]=[];
  for(const id of entryOrder){
    if(id==='gearbox'&&draft.driveType==='gearless')continue;
    const values:Record<string,InputValue>={};
    for(const p of definitionFor(id,'component-v3').parameters){const raw=draft.values[id]?.[p.id]?.trim();if(raw)values[p.id]=p.options?raw:Number(raw);}
    if(!Object.keys(values).length)continue;
    if(id==='gearbox'&&draft.driveType!=='geared')throw new Error('Select the installed drive type before entering gearbox observations.');
    if(!draft.source.trim())throw new Error('Enter the component observation source.');
    const record:ComponentInspection={id:crypto.randomUUID(),componentId:id,start:period.start,end:period.end,recordedAt:new Date().toISOString(),source:draft.source.trim(),values,normalization:{...(draft.normalizations[id]??defaultNormalization)},formulaVersion:'component-v3',...(draft.generatedSample?{generatedSample:true,demoTarget:draft.demoTarget}:{})};
    validateInspection(record);records.push(record);
  }
  return records;
}
