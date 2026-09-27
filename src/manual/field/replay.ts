import { randomObservations, inspectionsFromDraft, entryOrder } from '../inspection/entry';
import { defaultNormalization, definitionFor, type ComponentInspection, type EvaluatedId } from '../inspection/engine';
export interface ReplayFile { version:1; deviceId:string; packets:ComponentInspection[] }
export function demoReplay(target:EvaluatedId,now=Date.now()):ReplayFile{
  const batch=crypto.randomUUID(),packets:ComponentInspection[]=[];
  for(let step=0;step<6;step++){
    const draft=randomObservations(target,()=>.5);draft.values[target]={...Object.fromEntries(definitionFor(target,'component-v3').parameters.map(p=>[p.id,p.options?p.options[0]:p.integer?'0':String((p.warning??1)*.4)]))};
    const param={traction_sheave:'sheave_wear',brake:'brake_response_time',gearbox:'vibration',vfd_drive:'current_deviation'}[target],p=definitionFor(target,'component-v3').parameters.find(p=>p.id===param)!;
    draft.values[target]![param]=String(Number((p.warning!*.4+step*(p.critical!*1.2-p.warning!*.4)/5).toFixed(3)));
    const end=new Date(now-(5-step)*86400000-1000).toISOString(),start=new Date(Date.parse(end)-86400000).toISOString();
    const records=inspectionsFromDraft(draft,{start,end});for(const record of records){record.id=`${batch}-${step}-${record.componentId}`;record.source=`Generated six-period replay · ${target}`;record.normalization={...defaultNormalization};packets.push(record);}
  }
  return {version:1,deviceId:'demo-replay',packets};
}
export function replayGroups(file:ReplayFile){
  if(!file||file.version!==1||typeof file.deviceId!=='string'||!Array.isArray(file.packets)||file.packets.length>1000||!file.packets.length)throw new Error('Use a version-1 replay JSON with deviceId and 1–1000 packets.');
  const groups=new Map<string,ComponentInspection[]>();for(const r of file.packets){if(!entryOrder.includes(r.componentId as EvaluatedId))throw new Error('Unknown component.');const values=groups.get(r.end)??[];values.push(r);groups.set(r.end,values);}return [...groups.entries()].sort(([a],[b])=>Date.parse(a)-Date.parse(b)).map(([,values])=>values);
}
