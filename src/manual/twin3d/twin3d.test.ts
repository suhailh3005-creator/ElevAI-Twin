import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { componentIds, createComponentRegistry, interpolatedPosition, resolveVisualState, visualStatuses } from './components';
import { createTwinModel } from './model';

describe('component-addressable elevator visualization',()=>{
  it('layers reversible presentation offsets over both canonical layouts',()=>{
    const model=createTwinModel();try{for(const factor of [0,.5,1]){model.setExplosion(factor);const original=model.nodes.get('brake')!.object.position.clone();model.setPresentation(new Map([['brake',{offset:new THREE.Vector3(5,0,1),scale:1}]]));expect(model.nodes.get('brake')!.object.position.clone().sub(original).toArray()).toEqual([5,0,1]);model.setPresentation(new Map());expect(model.nodes.get('brake')!.object.position.toArray()).toEqual(original.toArray());}}finally{model.dispose();}
  });
  it('keeps simultaneous hologram colors semantic through selection without material allocation',()=>{
    const model=createTwinModel();try{const materials=new Set<THREE.Material>();model.root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments)materials.add(o.material as THREE.Material);});model.setStates({brake:{status:'critical',healthState:null},traction_sheave:{status:'normal',healthState:null},vfd_drive:{status:'warning',healthState:null}});for(let n=0;n<20;n++)model.setInteraction({selected:n%2?'brake':'traction_sheave',hovered:'vfd_drive',isolated:false,hidden:[]});for(const [id,color]of [['brake','ed4d58'],['traction_sheave','e3eff5'],['vfd_drive','e8b85b'],['ropes','7e949e']]as const)model.nodes.get(id)!.object.traverse(o=>{if(o instanceof THREE.Mesh){expect((o.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(color);expect(materials.has(o.material as THREE.Material)).toBe(true);}});let count=0;const all=new Set<THREE.BufferGeometry|THREE.Material>();model.root.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){all.add(o.geometry);all.add(o.material as THREE.Material);}});for(const resource of all)resource.addEventListener('dispose',()=>count++);model.dispose();expect(count).toBe(all.size);}catch(e){model.dispose();throw e;}
  });
  it('has all 17 stable identities, semantic groups and no invented conditions',()=>{
    const registry=createComponentRegistry();
    expect(registry).toHaveLength(17);expect(new Set(registry.map(c=>c.id)).size).toBe(17);
    for(const c of registry){expect(c.status).toBe('unknown');expect(c.healthState).toBeNull();expect(c.metadata.schematic).toBe(true);expect(c.assembledPosition.every(Number.isFinite)).toBe(true);expect(c.explodedPosition.every(Number.isFinite)).toBe(true);}
    const model=createTwinModel();try{expect(model.root.name).toBe('ElevatorDigitalTwin');for(const id of componentIds){const node=model.nodes.get(id)!;expect(node.object.parent?.name).toBe(node.definition.group);let count=0;node.object.traverse(o=>{if(o instanceof THREE.Mesh){count++;expect(o.userData.componentId).toBe(id);}});expect(count).toBeGreaterThan(0);}}finally{model.dispose();}
  });
  it('interpolates deterministic transforms and exactly restores assembly after repeated transitions',()=>{
    const model=createTwinModel();try{const initial=model.snapshot().components.map(c=>c.position);for(let n=0;n<20;n++){model.setExplosion(1);for(const c of model.snapshot().components)expect(c.position).toEqual(createComponentRegistry().find(d=>d.id===c.id)!.explodedPosition);model.setExplosion(.375);model.setExplosion(0);expect(model.snapshot().components.map(c=>c.position)).toEqual(initial);}expect(interpolatedPosition(createComponentRegistry()[0],-4)).toEqual(initial[0]);}finally{model.dispose();}
  });
  it('adapts motor and encoder for geared layout without recreating geometry',()=>{
    const model=createTwinModel();try{const node=model.nodes.get('traction_motor')!.object,uuid=node.uuid;expect(model.nodes.get('gearbox')!.object.visible).toBe(false);model.setGeared(true);expect(model.nodes.get('gearbox')!.object.visible).toBe(true);expect(node.position.x).toBe(-1.32);model.setGeared(false);expect(node.position.x).toBe(-.62);expect(node.uuid).toBe(uuid);}finally{model.dispose();}
  });
  it.each(visualStatuses)('accepts external %s state on only one component, preserving geometry and transforms',status=>{
    const model=createTwinModel();try{const before=model.snapshot().components.map(c=>c.position),uuids=[...model.nodes.values()].map(n=>n.object.uuid);model.setStates({brake:{status,healthState:'Externally supplied text',source:'Test adapter'}});const components=model.snapshot().components;expect(components.find(c=>c.id==='brake')?.status).toBe(status);expect(components.filter(c=>c.id!=='brake').every(c=>c.status==='unknown'&&c.healthState===null)).toBe(true);expect(components.map(c=>c.position)).toEqual(before);expect([...model.nodes.values()].map(n=>n.object.uuid)).toEqual(uuids);}finally{model.dispose();}
  });
  it('colors critical red exclusively and restores base material colors on removal',()=>{
    const model=createTwinModel();const colors=()=>{const values:Record<string,string[]>={};for(const [id,node]of model.nodes){values[id]=[];node.object.traverse(o=>{if(o instanceof THREE.Mesh)values[id].push((o.material as THREE.MeshStandardMaterial).color.getHexString());});}return values;};try{const before=colors();model.setStates({brake:{status:'critical',healthState:null}});const after=colors();expect(after.brake.every(c=>c==='ed4d58')).toBe(true);for(const id of componentIds.filter(id=>id!=='brake'))expect(after[id]).toEqual(before[id]);model.setStates({});expect(colors()).toEqual(before);}finally{model.dispose();}
  });
  it('keeps visibility, isolation and condition data independent',()=>{
    const model=createTwinModel();try{model.setStates({ropes:{status:'warning',healthState:null}});model.setInteraction({selected:'ropes',hovered:null,isolated:true,hidden:[]});expect(model.snapshot().components.filter(c=>c.visible).map(c=>c.id)).toEqual(['ropes']);model.setInteraction({selected:null,hovered:null,isolated:false,hidden:['brake']});expect(model.nodes.get('brake')!.object.visible).toBe(false);expect(model.nodes.get('ropes')!.definition.status).toBe('warning');expect(model.nodes.get('gearbox')!.object.visible).toBe(false);}finally{model.dispose();}
  });
  it('falls back to unknown for missing or invalid external state',()=>{
    expect(resolveVisualState('ropes',{})).toEqual({status:'unknown',healthState:null});
    // Malformed JSON from a future adapter must not become a condition.
    expect(resolveVisualState('ropes',{ropes:{status:'invalid',healthState:50}} as never)).toEqual({status:'unknown',healthState:null});
  });
  it('disposes each shared geometry and material exactly once',()=>{
    const model=createTwinModel(),geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();model.root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);materials.add(o.material as THREE.Material);}});let disposed=0;for(const item of [...geometries,...materials])item.addEventListener('dispose',()=>disposed++);model.dispose();expect(disposed).toBe(geometries.size+materials.size);
  });
});
