import { describe, expect, it } from 'vitest';
import { demoReplay, replayGroups } from './replay';
import { componentContext, parameterTrend, resultFor, transitionJob, validationReport, type WorkOrder } from './analysis';
import { defaultNormalization, evaluateComponent, validateInspection, type ComponentInspection } from '../inspection/engine';
const record=(id:string,value:number,demo=false):ComponentInspection=>({id,componentId:'traction_sheave',values:{sheave_wear:0,rope_slip:value,vibration:0,temperature:20},normalization:defaultNormalization,formulaVersion:'component-v3',start:'2026-01-01',end:'2026-01-02',recordedAt:'2026-01-02',source:'Independent sensor log',generatedSample:demo});
describe('Field analysis and provenance',()=>{
  it('calculates false alarms and missed faults from independent labels, excluding demos and missing inputs',()=>{
    const records=[record('tp',6),record('tn',1),record('fp',6),record('fn',1),record('demo',6,true),{...record('missing',1),values:{}}];
    const labels=records.map((r,i)=>({id:r.id,inspectionId:r.id,actual:(['critical','normal','normal','critical','critical','normal'] as const)[i],assessor:'Engineer',evidence:'Inspection report',at:'2026-01-03'}));
    const r=validationReport(records,labels);expect(r).toMatchObject({tp:1,tn:1,fp:1,fn:1,total:4,unknown:1,excluded:1,precision:.5,recall:.5,accuracy:.5});expect(validationReport([],[]).accuracy).toBeNull();expect(validationReport(records,labels,undefined,true).total).toBe(5);
  });
  it.each(['brake','gearbox','vfd_drive','traction_sheave'] as const)('replays six progressing periods for %s using real evaluator thresholds',id=>{
    const file=demoReplay(id),groups=replayGroups(file);expect(groups).toHaveLength(6);expect(file.packets).toHaveLength(24);file.packets.forEach(validateInspection);expect(resultFor(groups[0].find(r=>r.componentId===id)!,'geared').status).toBe('normal');expect(resultFor(groups[5].find(r=>r.componentId===id)!,'geared').status).toBe('critical');expect(file.packets.every(r=>r.generatedSample)).toBe(true);
  });
  it('projects a measured slope and withholds ungrounded forecasts',()=>{
    const records=[1,2,3].map((v,i)=>({...record(String(i),v),start:`2026-01-0${i+1}`,end:`2026-01-0${i+2}`}));const t=parameterTrend(records,'traction_sheave','rope_slip');expect(t?.slope).toBe(1);expect(t?.r2).toBe(1);expect(t?.daysToCritical).toBe(2);expect(parameterTrend(records.slice(0,2),'traction_sheave','rope_slip')?.slope).toBeNull();expect(parameterTrend(records.map(r=>({...r,generatedSample:true})),'traction_sheave','rope_slip')).toBeNull();
    const declining=records.map((r,i)=>({...r,values:{sheave_wear:0,rope_slip:3-i,vibration:0,temperature:20}}));expect(parameterTrend(declining,'traction_sheave','rope_slip')?.daysToCritical).toBeNull();
  });
  it('does not blend threshold configurations and removes overlapping periods',()=>{
    const r=record('first',1);const records=[r,{...r,id:'duplicate'}, {...r,id:'second',start:'2026-01-02',end:'2026-01-03'},{...r,id:'third',start:'2026-01-03',end:'2026-01-04'}];expect(parameterTrend(records,'traction_sheave','rope_slip')).toMatchObject({n:3,excluded:1});records[3]={...records[3],thresholds:{rope_slip:{warning:3,critical:7}},calibrationRef:'Equipment reference'};expect(parameterTrend(records,'traction_sheave','rope_slip')?.n).toBe(1);
  });
  it('applies equipment boundaries without allowing threshold JSON to change weights',()=>{
    const r={...record('custom',4),thresholds:{rope_slip:{warning:5,critical:8,weight:0}},calibrationRef:'Manufacturer reference'};validateInspection(r);expect(resultFor(r).status).toBe('normal');expect(evaluateComponent('traction_sheave',{sheave_wear:0,rope_slip:9,vibration:0,temperature:20},defaultNormalization,true,'component-v3',r.thresholds).risk).toBe(30);expect(()=>validateInspection({...r,thresholds:{rope_slip:{warning:9,critical:8}}})).toThrow();
  });
  it('keeps AI context tied to saved observations and their provenance',()=>{const context=componentContext({componentInspections:[record('demo',7,true)]});expect(context.find(r=>r.componentId==='traction_sheave')).toMatchObject({status:'critical',demo:true});expect(context.find(r=>r.componentId==='brake')?.status).toBe('unknown');});
  it('excludes unequal count intervals and different calibration references from trends',()=>{
    const records=demoReplay('brake').packets.filter(r=>r.componentId==='brake');records[0]={...records[0],start:new Date(Date.parse(records[0].start)-86400000).toISOString()};expect(parameterTrend(records,'brake','fault_count',true)).toMatchObject({n:5,excluded:1});records.at(-1)!.calibrationRef='New sensor calibration';expect(parameterTrend(records,'brake','brake_response_time',true)?.n).toBe(1);
  });
  it('requires ordered technician steps and real post-repair follow-up',()=>{
    const job:WorkOrder={id:'job',componentId:'traction_sheave',inspectionId:'alert',status:'open',assignee:'A',finding:'',repair:'',followupId:'',createdAt:'2026-01-01',updatedAt:'2026-01-01',history:[]};expect(()=>transitionJob(job,'verify','A','checked',record('f',1))).toThrow('order');const inspected=transitionJob(job,'inspect','Engineer','Confirmed slip',undefined);expect(inspected.status).toBe('inspected');const repaired={...transitionJob(inspected,'repair','Engineer','Adjusted per approved procedure',undefined),updatedAt:'2026-01-01'};expect(()=>transitionJob(repaired,'verify','Engineer','checked',record('fake',1,true))).toThrow('non-demo');expect(()=>transitionJob(repaired,'verify','Engineer','checked',record('abnormal',6))).toThrow();expect(transitionJob(repaired,'verify','Engineer','Normal measured follow-up',record('real',1))).toMatchObject({status:'verified',followupId:'real'});
  });
});
