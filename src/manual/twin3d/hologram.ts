import * as THREE from 'three';
import { statusAppearance, type VisualStatus } from './components';

// Presentation only: this layer consumes statuses and never reads inspection values.
export const hologramStyle={opacity:.57,unknownOpacity:.36,selectedOpacity:.83,edgeOpacity:.42,rim:.23};
export function createHologram(root:THREE.Group){
  const edges=new Map<string,THREE.EdgesGeometry>();
  const lines=new Map<THREE.Mesh,THREE.LineSegments>();
  const uniforms={holoTime:{value:0},holoMotion:{value:1}};
  const prepared=new Set<THREE.MeshStandardMaterial>();
  const meshes:THREE.Mesh[]=[];root.traverse(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});
  for(const mesh of meshes){
    const material=mesh.material as THREE.MeshStandardMaterial;
    if(!prepared.has(material)){
      prepared.add(material);material.transparent=true;material.depthWrite=false;material.depthTest=true;
      material.roughness=.65;material.metalness=.08;material.opacity=hologramStyle.unknownOpacity;
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,uniforms);
        shader.vertexShader='varying vec3 holoLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nholoLocal = position;');
        shader.fragmentShader='uniform float holoTime; uniform float holoMotion; varying vec3 holoLocal;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>
          float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
          float scan = pow(0.5 + 0.5 * sin(holoLocal.y * 18.0 - holoTime * 0.65), 18.0);
          gl_FragColor.rgb += diffuse * (${hologramStyle.rim.toFixed(2)} * rim + 0.055 * scan * holoMotion);
          gl_FragColor.a = min(0.94, gl_FragColor.a + rim * 0.12);
        `);
      };
      material.customProgramCacheKey=()=> 'elevai-hologram-v1';
    }
    if(!edges.has(mesh.geometry.uuid))edges.set(mesh.geometry.uuid,new THREE.EdgesGeometry(mesh.geometry,32));
    const line=new THREE.LineSegments(edges.get(mesh.geometry.uuid),new THREE.LineBasicMaterial({color:0x7e949e,transparent:true,opacity:hologramStyle.edgeOpacity,depthTest:true,depthWrite:false}));
    line.raycast=()=>{};mesh.add(line);lines.set(mesh,line);
  }
  return {
    appearance(mesh:THREE.Mesh,status:VisualStatus,selected:boolean,hovered:boolean){
      const color=statusAppearance[status].color??'#7e949e',material=mesh.material as THREE.MeshStandardMaterial;
      material.color.set(color);material.emissive.set(color);material.emissiveIntensity=selected?.3:hovered?.2:status==='unknown'?.06:.14;
      material.opacity=selected?hologramStyle.selectedOpacity:status==='unknown'?hologramStyle.unknownOpacity:hologramStyle.opacity;
      const line=lines.get(mesh);if(line){const lm=line.material as THREE.LineBasicMaterial;lm.color.set(color);lm.opacity=selected?.75:hovered?.6:hologramStyle.edgeOpacity;}
    },
    tick(seconds:number,motion:boolean){uniforms.holoTime.value=motion?seconds:0;uniforms.holoMotion.value=motion?1:0;},
    dispose(){for(const line of lines.values()){line.removeFromParent();(line.material as THREE.Material).dispose();}for(const edge of edges.values())edge.dispose();lines.clear();edges.clear();},
  };
}
