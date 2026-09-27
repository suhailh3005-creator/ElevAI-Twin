import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import { blankObservations, entryOrder, inspectionsFromDraft, randomObservations } from './entry';
import { defaultNormalization, evaluateComponent, inspectionStates, validateInspection, type ComponentInspection } from './engine';
import { createTwinModel } from '../twin3d/model';

const period={start:'2026-01-01T00:00:00Z',end:'2026-01-08T00:00:00Z'};
describe('Add Elevator component observations',()=>{
  it.each(entryOrder)('%s demo flags exactly the selected component for boundary and varied random draws',target=>{
    for(let i=0;i<100;i++){
      const draft=randomObservations(target,()=>i/99),records=inspectionsFromDraft(draft,period),states=inspectionStates(records,'geared');
      expect(records).toHaveLength(4);expect(new Set(records.map(r=>r.id)).size).toBe(4);
      expect(draft.driveType).toBe('geared');expect(records.every(r=>r.generatedSample&&r.demoTarget===target)).toBe(true);
      for(const id of entryOrder)expect(states[id]?.status).toBe(id===target?'critical':'normal');
      for(const record of records)expect(()=>validateInspection(record)).not.toThrow();
    }
  });
  it('changes real evaluated observations, not an override based on the chosen target',()=>{
    const draft=randomObservations('traction_sheave');draft.values.traction_sheave={sheave_wear:'2',rope_slip:'1',vibration:'1',temperature:'40'};const states=inspectionStates(inspectionsFromDraft(draft,period),'geared');expect(states.ropes).toBeUndefined();expect(states.traction_sheave?.status).toBe('normal');
  });
  it('keeps empty observations absent and partial observations unknown',()=>{
    expect(inspectionsFromDraft(blankObservations(),period)).toEqual([]);
    const draft=blankObservations();draft.source='Manual report';draft.values.brake={brake_temperature:'45'};const records=inspectionsFromDraft(draft,period);expect(inspectionStates(records).brake?.status).toBe('unknown');expect(inspectionStates(records).brake?.healthState).toBeNull();
  });
  it('requires source, valid values and confirmed gearbox applicability',()=>{
    const draft=randomObservations('brake');draft.source='';expect(()=>inspectionsFromDraft(draft,period)).toThrow('source');draft.source='Report';draft.values.brake!.brake_wear='101';expect(()=>inspectionsFromDraft(draft,period)).toThrow();draft.values.brake!.brake_wear='30';draft.driveType='';expect(()=>inspectionsFromDraft(draft,period)).toThrow('drive type');draft.driveType='gearless';expect(inspectionsFromDraft(draft,period).some(r=>r.componentId==='gearbox')).toBe(false);
  });
  it('copies only period dates, never a motor record ID or motor values',()=>{
    const records=inspectionsFromDraft(randomObservations('brake'),{...period,id:'motor-record',vibrationRms:400} as typeof period);expect(records.every(r=>r.id!=='motor-record'&&!('vibrationRms'in r))).toBe(true);
  });
  it('preserves explicitly requested historical v2 evidence while restoring the current four-factor formula',()=>{
    const legacy:ComponentInspection={id:'old',componentId:'traction_sheave',...period,recordedAt:period.end,source:'Old report',values:{sheave_wear:0,rope_slip:6,vibration:0,temperature:20},normalization:defaultNormalization,formulaVersion:'component-v1'};
    expect(()=>validateInspection(legacy)).not.toThrow();expect(evaluateComponent('traction_sheave',legacy.values).risk).toBe(30);expect(inspectionStates([legacy]).traction_sheave?.status).toBe('critical');
    const current=evaluateComponent('traction_sheave',{sheave_wear:25,vibration:1,temperature:40},defaultNormalization,true,'component-v2');expect(current.risk).toBeCloseTo(50);expect(current.rows.map(r=>r.parameter.id)).not.toContain('rope_slip');expect(current.formula).toContain('/ 0.70');expect(evaluateComponent('traction_sheave',{sheave_wear:25,rope_slip:1,vibration:1,temperature:40}).risk).toBe(35);expect(inspectionStates([{...legacy,formulaVersion:'component-v2',values:{sheave_wear:25,vibration:1,temperature:40}}]).traction_sheave).toBeUndefined();
  });
  it.each(entryOrder)('%s demo renders the chosen defect red and the other evaluated components white',target=>{
    const model=createTwinModel();try{const colors=()=>{const map:Record<string,string[]>={};for(const [id,node]of model.nodes){map[id]=[];node.object.traverse(o=>{if(o instanceof THREE.Mesh)map[id].push((o.material as THREE.MeshStandardMaterial).color.getHexString());});}return map;};const before=colors();model.setGeared(true);model.setStates(inspectionStates(inspectionsFromDraft(randomObservations(target),period),'geared'));const after=colors();for(const id of Object.keys(before)){if(id===target)expect(after[id].every(c=>c==='ed4d58')).toBe(true);else if(entryOrder.includes(id as typeof target))expect(after[id].every(c=>c==='e3eff5')).toBe(true);else expect(after[id]).toEqual(before[id]);}}finally{model.dispose();}
  });
});
