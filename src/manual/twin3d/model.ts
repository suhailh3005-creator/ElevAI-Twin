import * as THREE from 'three';
import { createComponentRegistry, interpolatedPosition, resolveVisualState, type ComponentId, type ComponentStateMap } from './components';
import { buildElevator } from './geometry';
import { createHologram } from './hologram';

// Geometry, view state and externally supplied condition data have separate owners.
export function createTwinModel(){
  const model=buildElevator();
  const hologram=createHologram(model.root);
  let explosion=0,geared=false,selected:ComponentId|null=null,hovered:ComponentId|null=null,isolated=false;
  let hidden=new Set<ComponentId>(),states:ComponentStateMap={};
  const appearances=new Map<ComponentId,string>();
  let presentation=new Map<ComponentId,{offset:THREE.Vector3;scale:number}>();
  function update(){
    for(const definition of createComponentRegistry(geared)){
      const node=model.nodes.get(definition.id)!;
      const state=resolveVisualState(definition.id,states);
      node.definition={...definition,...state};
      node.object.position.set(...interpolatedPosition(definition,explosion));
      const transform=presentation.get(definition.id);if(transform)node.object.position.add(transform.offset);node.object.scale.setScalar(transform?.scale??1);
      node.object.visible=definition.visible&&!hidden.has(definition.id)&&(!isolated||selected===definition.id);
      node.definition.visible=node.object.visible;
      const appearance=`${state.status}:${selected===definition.id}:${hovered===definition.id}`;
      if(appearances.get(definition.id)!==appearance)node.object.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        hologram.appearance(object,state.status,definition.id===selected,definition.id===hovered);
      });
      appearances.set(definition.id,appearance);
    }
    model.structure.visible=!isolated&&explosion<.85;
    model.root.updateMatrixWorld(true);
  }
  update();
  return {...model,
    tick:hologram.tick,
    dispose(){hologram.dispose();model.dispose();},
    setPresentation(value:Map<ComponentId,{offset:THREE.Vector3;scale:number}>){presentation=value;update();},
    setExplosion(value:number){explosion=Math.max(0,Math.min(1,value));update();},
    setGeared(value:boolean){geared=value;if(!geared&&selected==='gearbox'){selected=null;isolated=false;}update();},
    setStates(value:ComponentStateMap){states=value;update();},
    setInteraction(value:{selected:ComponentId|null;hovered:ComponentId|null;isolated:boolean;hidden:ComponentId[]}){selected=value.selected;hovered=value.hovered;isolated=value.isolated&&!!selected;hidden=new Set(value.hidden);update();},
    snapshot(){return {explosion,geared,selected,isolated,components:[...model.nodes.values()].map(({definition,object})=>({id:definition.id,position:object.position.toArray(),visible:object.visible,status:definition.status,healthState:definition.healthState}))};},
  };
}
