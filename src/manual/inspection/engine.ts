import type { ComponentId, ComponentStateMap } from '../twin3d/components';

export const evaluatedIds=['brake','gearbox','vfd_drive','traction_sheave'] as const;
export type EvaluatedId=typeof evaluatedIds[number];
export type StoredComponentId=EvaluatedId|'ropes';
export const currentFormulaVersion='component-v3' as const;
export interface MaintenanceThreshold { description:string; source:string }
export type Band='normal'|'warning'|'critical';
export type Condition=Band|'unknown';
export interface Normalization {normal:number;warning:number;critical:number}
export const defaultNormalization:Normalization={normal:0,warning:.5,critical:1};
export type InputValue=number|string;
export type FormulaVersion='component-v1'|'component-v2'|'component-v3';
export interface ComponentInspection {id:string;componentId:StoredComponentId;start:string;end:string;recordedAt:string;source:string;values:Record<string,InputValue>;normalization:Normalization;formulaVersion:FormulaVersion;generatedSample?:boolean;demoTarget?:StoredComponentId;maintenanceThreshold?:MaintenanceThreshold; thresholds?:Record<string,{warning:number;critical:number}>; calibrationRef?:string}
export interface Parameter {id:string;label:string;unit:string;factor:string;weight:number;warning?:number;critical?:number;min?:number;max?:number;integer?:boolean;options?:[string,string,string];hint?:string}
export interface Definition {id:StoredComponentId;name:string;parameters:Parameter[]}
const numeric=(id:string,label:string,unit:string,factor:string,weight:number,warning:number,critical:number,extra:Partial<Parameter>={}):Parameter=>({id,label,unit,factor,weight,warning,critical,min:0,...extra});
export const definitions:Record<StoredComponentId,Definition>={
  brake:{id:'brake',name:'Brake',parameters:[numeric('brake_temperature','Brake temperature','°C','F_T',.30,70,90,{min:-273.15}),numeric('brake_response_time','Brake response time','ms','F_RT',.35,100,150),numeric('brake_wear','Brake wear','%','F_W',.20,50,75,{max:100}),numeric('fault_count','Fault count','events / entered period','F_F',.15,1,2,{integer:true})]},
  gearbox:{id:'gearbox',name:'Gearbox',parameters:[numeric('temperature','Gearbox temperature','°C','F_T',.25,70,85,{min:-273.15}),numeric('vibration','Gearbox vibration RMS','mm/s','F_V',.35,3.5,5),{id:'oil_condition',label:'Oil condition',unit:'inspection category',factor:'F_O',weight:.25,options:['Good','Degraded','Critical condition']},{id:'oil_leakage',label:'Oil leakage',unit:'inspection category',factor:'F_L',weight:.15,options:['None','Minor','Significant']}]},
  vfd_drive:{id:'vfd_drive',name:'VFD / Drive',parameters:[numeric('current_deviation','Current deviation magnitude','%','F_I',.30,5,10,{hint:'Enter absolute deviation from the applicable reference, not current in amperes.'}),numeric('voltage_deviation','Voltage deviation magnitude','%','F_V',.20,5,10,{hint:'Enter absolute deviation from the applicable reference, not voltage in volts.'}),numeric('temperature','Drive temperature','°C','F_T',.25,60,75,{min:-273.15}),numeric('fault_count','Drive fault count','events / entered period','F_F',.25,1,3,{integer:true})]},
  traction_sheave:{id:'traction_sheave',name:'Traction Sheave',parameters:[numeric('sheave_wear','Sheave wear','%','F_W',.35,10,20,{max:100}),numeric('rope_slip','Rope slip','%','F_S',.30,2,5,{max:100}),numeric('vibration','Sheave vibration RMS','mm/s','F_V',.20,3.5,5),numeric('temperature','Sheave temperature','°C','F_T',.15,60,75,{min:-273.15})]},
  ropes:{id:'ropes',name:'Rope Slip',parameters:[numeric('rope_slip','Rope slip','%','F_S',1,2,5,{max:100,hint:'Slip assessment of the existing ropes element only; not an assessment of rope strength or remaining life.'})]},
};
export function definitionFor(id:StoredComponentId,version:FormulaVersion=currentFormulaVersion):Definition{
  const base=definitions[id];
  // Only decode the retired v2 formula for historical evidence; never generate it.
  if(id!=='traction_sheave'||version!=='component-v2')return base;
  const parameters=base.parameters.filter(p=>p.id!=='rope_slip');
  const sum=parameters.reduce((total,p)=>total+p.weight,0);
  return {...base,parameters:parameters.map(p=>({...p,weight:p.weight/sum}))};
}
export const isEvaluated=(id:ComponentId):id is EvaluatedId=>evaluatedIds.includes(id as EvaluatedId);
export const conditionLabels:Record<Condition,string>={normal:'Normal',warning:'Warning / Repair Required',critical:'Critical',unknown:'Unknown / incomplete'};
export const thresholdSource='User-supplied component specification · component-v1 · not manufacturer-validated';
export function validNormalization(n:Normalization){return !!n&&[n.normal,n.warning,n.critical].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)&&n.normal<=n.warning&&n.warning<=n.critical;}
export function inputIssue(p:Parameter,value:unknown):string|null{
  if(value===undefined||value===null||value==='')return 'Missing required input';
  if(p.options)return typeof value==='string'&&p.options.includes(value)?null:'Choose a listed inspection category';
  if(typeof value!=='number'||!Number.isFinite(value))return `Enter a finite number in ${p.unit}`;
  if(value<(p.min??0)||(p.max!==undefined&&value>p.max))return `Value must be ${p.min??0} or greater${p.max!==undefined?` and at most ${p.max}`:''} ${p.unit}`;
  if(p.integer&&!Number.isSafeInteger(value))return 'Enter a nonnegative whole count';
  return null;
}
export function thresholdText(p:Parameter){return p.options?`Normal: ${p.options[0]}; Warning: ${p.options[1]}; Critical: ${p.options[2]}`:`Normal: < ${p.warning}; Warning: ${p.warning}–${p.critical} inclusive; Critical: > ${p.critical} ${p.unit}`;}
export function classify(p:Parameter,value:InputValue):Band{
  if(p.options)return (['normal','warning','critical'] as const)[p.options.indexOf(value as string)];
  return (value as number)>p.critical!?'critical':(value as number)>=p.warning!?'warning':'normal';
}
export const defaultStatusPriority:readonly Condition[]=['critical','warning','unknown','normal'];
export function aggregate(bands:Condition[],priority:readonly Condition[]=defaultStatusPriority):Condition{
  // Known hazards remain visible even when another prerequisite is missing.
  const status=priority.find(band=>bands.includes(band))??'unknown';
  return status==='normal'&&bands.includes('unknown')?'unknown':status;
}
// Status policy is separate from condition-index weights; no aggregate score bands are supplied.
export interface StatusPolicy {kind:'worst-parameter';priority:readonly Condition[]}
export const defaultStatusPolicy:StatusPolicy={kind:'worst-parameter',priority:defaultStatusPriority};
export function evaluateStatus(bands:Condition[],valid=true,policy:StatusPolicy=defaultStatusPolicy){return aggregate(valid?bands:[...bands,'unknown'],policy.priority);}
export interface EvidenceRow {parameter:Parameter;value:InputValue|undefined;classification:Condition;issue:string|null;factor:number|null;contribution:number|null;threshold:string}
export interface InspectionResult {
  componentId:StoredComponentId;name:string;status:Condition;health:number|null;risk:number|null;complete:boolean;applicable:boolean;rows:EvidenceRow[];formula:string;substitution:string;issues:string[];
  remainingUsageLife:null;failureProbability90Days:null;degradationIndex:null;dailyDegradationRate:null;timeToThreshold:null;
}
export function evaluateComponent(id:EvaluatedId,values:Record<string,InputValue>={},normalization:Normalization=defaultNormalization,applicable=true,version:FormulaVersion=currentFormulaVersion,thresholds?:ComponentInspection['thresholds']):InspectionResult{
  const base=definitionFor(id,version),definition={...base,parameters:base.parameters.map(p=>({...p,...(thresholds?.[p.id]?{warning:thresholds[p.id].warning,critical:thresholds[p.id].critical}:{})}))},valid=validNormalization(normalization);
  const rows=definition.parameters.map(parameter=>{
    const value=values[parameter.id],issue=inputIssue(parameter,value),classification:Condition=issue?'unknown':classify(parameter,value);
    const factor=classification==='unknown'||!valid?null:Math.max(0,Math.min(1,normalization[classification]));
    return {parameter,value,classification,issue,factor,contribution:factor===null?null:parameter.weight*factor,threshold:thresholdText(parameter)};
  });
  const complete=applicable&&valid&&rows.every(r=>!r.issue),sum=rows.reduce((total,r)=>total+r.parameter.weight*100*(r.factor??0),0),risk=complete?Math.max(0,Math.min(100,sum)):null;
  return {componentId:id,name:definition.name,status:applicable?evaluateStatus(rows.map(r=>r.classification),valid):'unknown',health:risk===null?null:100-risk,risk,complete,applicable,rows,
    formula:version==='component-v2'&&id==='traction_sheave'?'Risk = 100 × (0.35F_W + 0.20F_V + 0.15F_T) / 0.70\nHealth = 100 − Risk':`Risk = 100 × (${definition.parameters.map(p=>`${p.weight.toFixed(2)}${p.factor}`).join(' + ')})\nHealth = 100 − Risk`,
    substitution:complete?`Risk = 100 × (${rows.map(r=>`${r.parameter.weight} × ${r.factor}`).join(' + ')}) = ${Number(risk!.toFixed(6))}\nHealth = 100 − ${Number(risk!.toFixed(6))} = ${Number((100-risk!).toFixed(6))}`:'Score unavailable until all required valid inputs are supplied.',
    issues:[...rows.filter(r=>r.issue).map(r=>`${r.parameter.label}: ${r.issue}`),...(!valid?['Invalid normalization: use ordered finite factors from 0 to 1.']:[]),...(!applicable?['Gearbox evaluation requires a confirmed geared elevator.']:[])],
    remainingUsageLife:null,failureProbability90Days:null,degradationIndex:null,dailyDegradationRate:null,timeToThreshold:null};
}
export function validateInspection(record:ComponentInspection){
  if(!record||![...evaluatedIds,'ropes'].includes(record.componentId)||typeof record.id!=='string'||!record.id||!['component-v1','component-v2','component-v3'].includes(record.formulaVersion)||typeof record.source!=='string'||!record.source.trim()||!record.values||typeof record.values!=='object'||Array.isArray(record.values)||!validNormalization(record.normalization))throw new Error('Invalid component inspection record.');
  if(record.generatedSample!==undefined&&typeof record.generatedSample!=='boolean')throw new Error('Invalid sample provenance.');
  if(record.demoTarget!==undefined&&(!record.generatedSample||![...evaluatedIds,'ropes'].includes(record.demoTarget)))throw new Error('Invalid demonstration target.');
  if(record.maintenanceThreshold!==undefined&&(!record.maintenanceThreshold||typeof record.maintenanceThreshold.description!=='string'||!record.maintenanceThreshold.description.trim()||typeof record.maintenanceThreshold.source!=='string'||!record.maintenanceThreshold.source.trim()))throw new Error('Maintenance threshold needs a description and source.');
  if(record.thresholds!==undefined){if(!record.calibrationRef?.trim()||typeof record.thresholds!=='object'||Array.isArray(record.thresholds))throw new Error('Threshold overrides require a calibration reference.');for(const [key,t]of Object.entries(record.thresholds)){const p=definitionFor(record.componentId,record.formulaVersion).parameters.find(p=>p.id===key);if(!p||p.options||!t||!Number.isFinite(t.warning)||!Number.isFinite(t.critical)||t.warning>=t.critical||t.warning<(p.min??0)||(p.max!==undefined&&t.critical>p.max))throw new Error('Invalid equipment-specific threshold.');}}
  const start=Date.parse(record.start),end=Date.parse(record.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>Date.now()+60000||!Number.isFinite(Date.parse(record.recordedAt)))throw new Error('Enter a completed observation period with end after start.');
  for(const [key,value] of Object.entries(record.values)){const p=definitionFor(record.componentId,record.formulaVersion).parameters.find(p=>p.id===key);if(!p)throw new Error('Unknown component measurement.');const issue=inputIssue(p,value);if(issue)throw new Error(`${p.label}: ${issue}`);}
}
export function isCurrentInspection(r:ComponentInspection):r is ComponentInspection & {componentId:EvaluatedId}{return isEvaluated(r.componentId)&&!(r.componentId==='traction_sheave'&&r.formulaVersion==='component-v2');}
export function latestInspection(records:ComponentInspection[]|undefined,id:EvaluatedId){return records?.filter(r=>r.componentId===id&&isCurrentInspection(r)).sort((a,b)=>Date.parse(b.end)-Date.parse(a.end)||Date.parse(b.recordedAt)-Date.parse(a.recordedAt))[0];}
export function inspectionStates(records:ComponentInspection[]|undefined,driveType?:'geared'|'gearless'):ComponentStateMap{
  const map:ComponentStateMap={};
  for(const id of evaluatedIds){const record=latestInspection(records,id);if(!record)continue;const result=evaluateComponent(id,record.values,record.normalization,id!=='gearbox'||driveType==='geared',record.formulaVersion,record.thresholds);map[id]={status:result.status,healthState:result.health===null?null:`${Number(result.health.toFixed(2))}% · project condition index`,source:`${record.generatedSample?'GENERATED DEMO DATA · ':''}${record.source} · period ending ${record.end}`};}
  return map;
}
