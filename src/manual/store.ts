import { create } from 'zustand';
import { validateInspection, type ComponentInspection } from './inspection/engine';
import { fields, validateReading, evaluate, latest, experimentalModel, validUsageSettings, type UsageSettings, type Elevator, type Reading, type Model, type Intervention, type SavedPlan, type FieldKey } from './engine';
const KEY = 'elevai-manual-registry:v1';
export interface Database { version: 1; elevators: Elevator[]; selectedId: string | null }
export function validDatabase(value: unknown): value is Database {
  try {
    const d = value as Database;
    if (!d || d.version !== 1 || !Array.isArray(d.elevators) || d.elevators.length>500 || (d.selectedId!==null&&typeof d.selectedId!=='string')) return false;
    const ids = new Set<string>();
    for (const e of d.elevators) {
      if (!e || typeof e.id!=='string'||ids.has(e.id)||typeof e.project!=='string'||!e.project.trim()||typeof e.name!=='string'||!e.name.trim()||typeof e.location!=='string'||!Array.isArray(e.readings)||!e.readings.length||!Array.isArray(e.events)||!Array.isArray(e.plans)||!Array.isArray(e.interventions)||!e.limits) return false;
      ids.add(e.id);
      if(e.fieldConnected!==undefined&&typeof e.fieldConnected!=='boolean')return false;
      if(e.usageSettings!==undefined&&!validUsageSettings(e.usageSettings))return false;
      if(e.driveType!==undefined&&!['geared','gearless'].includes(e.driveType))return false;
      if(e.componentInspections!==undefined){if(!Array.isArray(e.componentInspections)||e.componentInspections.length>10000)return false;const inspectionIds=new Set<string>();for(const r of e.componentInspections){validateInspection(r);if(inspectionIds.has(r.id))return false;inspectionIds.add(r.id);}}
      for (const r of e.readings) { validateReading(r); if(typeof r.id!=='string'||typeof r.notes!=='string'||!Number.isFinite(Date.parse(r.recordedAt)))return false; }
      if (!e.model || typeof e.model.name!=='string'||typeof e.model.source!=='string')return false;
      // A newer reading can make a custom formula invalid: retain data and report the model error in the UI.
      if(typeof e.model.degradationExpression!=='string'||typeof e.model.rateExpression!=='string'||!(e.model.threshold>0&&e.model.threshold<=1))return false;
      for(const [k,v] of Object.entries(e.limits))if(!fields.some(f=>f.key===k)||typeof v!=='number'||!Number.isFinite(v)||v<0)return false;
      for(const o of e.interventions)if(typeof o.id!=='string'||typeof o.name!=='string'||typeof o.source!=='string'||![o.cost,o.downtimeHours,o.afterDegradation,o.afterRate].every(x=>Number.isFinite(x)&&x>=0)||o.afterDegradation>1)return false;
      for(const p of e.plans)if(typeof p.id!=='string'||typeof p.action!=='string'||typeof p.readingId!=='string'||typeof p.modelSignature!=='string'||typeof p.source!=='string'||!Number.isFinite(p.cost)||!Number.isFinite(Date.parse(p.start))||!Number.isFinite(Date.parse(p.end)))return false;
      for(const l of e.events)if(typeof l.id!=='string'||typeof l.title!=='string'||!Number.isFinite(Date.parse(l.at)))return false;
    }
    return d.selectedId===null||ids.has(d.selectedId);
  } catch { return false; }
}
const blank: Database = {version:1,elevators:[],selectedId:null};
let initial: Database = blank, initialError='';
try { const raw = localStorage.getItem(KEY); if(raw) { const parsed:unknown=JSON.parse(raw); if(!validDatabase(parsed))throw new Error('Invalid saved data'); initial=parsed; } }
catch { initialError='The local registry could not be restored. Existing stored data has not been overwritten. Import a valid backup or save a new registry.'; }
const log = (title:string) => ({id:crypto.randomUUID(),at:new Date().toISOString(),title});
interface Store extends Database { error:string; connectField:(id:string)=>void; syncInspections:(id:string,records:ComponentInspection[])=>void; inspection:(id:string,record:ComponentInspection)=>void; driveType:(id:string,type:'geared'|'gearless')=>void; usageSettings:(id:string,settings:UsageSettings)=>void; select:(id:string|null)=>void; add:(e:Pick<Elevator,'project'|'name'|'location'|'componentInspections'|'driveType'>,r:Reading)=>string; reading:(id:string,r:Reading)=>void; model:(id:string,m:Model)=>void; limits:(id:string,limits:Partial<Record<FieldKey,number>>)=>void; option:(id:string,o:Intervention)=>void; removeOption:(id:string,oid:string)=>void; savePlan:(id:string,p:SavedPlan)=>void; removePlan:(id:string,pid:string)=>void; importData:(raw:string)=>void; exportData:()=>string }
export const useRegistry=create<Store>((set,get)=>{
  const commit=(d:Database)=>{ try{localStorage.setItem(KEY,JSON.stringify(d));set({...d,error:''});}catch{set({error:'Browser storage is full or unavailable. This change was not saved. Export a backup and free storage before retrying.'});throw new Error('Could not save the local database.');} };
  const update=(id:string,fn:(e:Elevator)=>Elevator)=>{const s=get();commit({version:1,selectedId:s.selectedId,elevators:s.elevators.map(e=>e.id===id?fn(e):e)});};
  return {...initial,error:initialError,
    connectField:id=>update(id,e=>({...e,fieldConnected:true})),
    syncInspections:(id,records)=>{if(!Array.isArray(records)||records.length>10000)throw new Error('Invalid field observations.');records.forEach(validateInspection);const e=get().elevators.find(e=>e.id===id);if(!e)return;const existing=new Map((e.componentInspections??[]).map(r=>[r.id,r]));for(const r of records){const old=existing.get(r.id);if(old&&JSON.stringify(old)!==JSON.stringify(r))throw new Error('Server observation conflicts with browser history.');}const additions=records.filter(r=>!existing.has(r.id));if(!additions.length)return;update(id,e=>({...e,componentInspections:[...(e.componentInspections??[]),...additions],events:[log('Field Lab observations synchronized'),...e.events]}));},
    inspection:(id,record)=>{validateInspection(record);update(id,e=>{if(record.componentId==='gearbox'&&e.driveType!=='geared')throw new Error('Confirm that this elevator is geared before saving a gearbox inspection.');if(e.componentInspections?.some(r=>r.id===record.id))throw new Error('This inspection has already been saved.');return {...e,componentInspections:[...(e.componentInspections??[]),record],events:[log(`Component inspection saved: ${record.componentId}`),...e.events]};});},
    driveType:(id,type)=>{if(!['geared','gearless'].includes(type))throw new Error('Invalid drive type.');update(id,e=>({...e,driveType:type,events:[log(`Installed drive type recorded: ${type}`),...e.events]}));},
    select:id=>{const s=get();if(id!==null&&!s.elevators.some(e=>e.id===id))return;commit({version:1,elevators:s.elevators,selectedId:id});},
    add:(info,r)=>{validateReading(r);if(info.driveType!==undefined&&!['geared','gearless'].includes(info.driveType))throw new Error('Invalid drive type.');for(const record of info.componentInspections??[]){validateInspection(record);if(record.componentId==='gearbox'&&info.driveType!=='geared')throw new Error('Gearbox observations require a geared elevator.');}const s=get();if(s.elevators.some(e=>e.project.trim().toLowerCase()===info.project.trim().toLowerCase()&&e.name.trim().toLowerCase()===info.name.trim().toLowerCase()))throw new Error('This elevator already exists in this project. Open it to add a reading.');const id=crypto.randomUUID();commit({version:1,selectedId:id,elevators:[...s.elevators,{...info,project:info.project.trim(),name:info.name.trim(),id,readings:[r],model:{...experimentalModel},limits:{},interventions:[],plans:[],events:[log('Elevator created with entered readings and component observations')]}]});return id;},
    reading:(id,r)=>{validateReading(r);update(id,e=>{const prior=latest(e);if(e.readings.some(old=>Date.parse(old.start)===Date.parse(r.start)&&Date.parse(old.end)===Date.parse(r.end)))throw new Error('Duplicate measurement period: this interval is already recorded; the previous period ends at the same time.');if(Date.parse(r.start)<Date.parse(prior.end))throw new Error('New measurement periods must begin at or after the previous period ends.');if(r.totalCycles<prior.totalCycles||r.operatingHours<prior.operatingHours||r.motorAgeYears<prior.motorAgeYears)throw new Error('Lifetime counters and motor age cannot decrease. Register a new motor record after replacement.');return {...e,readings:[...e.readings,r],events:[log('New measurement period recorded'),...e.events]};});},
    model:(id,m)=>update(id,e=>{evaluate(latest(e),m);return {...e,model:m,events:[log(`Calculation model saved: ${m.name}`),...e.events]};}),
    usageSettings:(id,settings)=>{if(!validUsageSettings(settings))throw new Error('Invalid usage-analysis settings.');update(id,e=>({...e,usageSettings:{...settings},events:[log('Operational trend analysis settings saved'),...e.events]}));},
    limits:(id,limits)=>update(id,e=>({...e,limits,events:[log('User-supplied monitoring limits saved'),...e.events]})),
    option:(id,o)=>update(id,e=>({...e,interventions:[...e.interventions,o],events:[log(`Intervention assumptions added: ${o.name}`),...e.events]})),
    removeOption:(id,oid)=>update(id,e=>({...e,interventions:e.interventions.filter(o=>o.id!==oid)})),
    savePlan:(id,p)=>update(id,e=>({...e,plans:[p,...e.plans],events:[log(`Local maintenance plan saved: ${p.action}`),...e.events]})),
    removePlan:(id,pid)=>update(id,e=>({...e,plans:e.plans.filter(p=>p.id!==pid),events:[log('Local maintenance plan removed'),...e.events]})),
    importData:raw=>{const d:unknown=JSON.parse(raw);if(!validDatabase(d))throw new Error('This backup is not a valid ElevAI manual registry.');const s=get();const ids=new Set(s.elevators.map(e=>e.id));const additions=d.elevators.filter(e=>!ids.has(e.id));if(!additions.length)throw new Error('No new elevators in this backup. Existing records were kept.');commit({version:1,selectedId:s.selectedId,elevators:[...s.elevators,...additions]});},
    exportData:()=>JSON.stringify({version:1,elevators:get().elevators,selectedId:get().selectedId},null,2),
  };
});
