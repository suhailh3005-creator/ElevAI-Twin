import InspectionCallout from './InspectionCallout';
import { useEffect, useMemo, useRef, useState } from 'react';
import { latest, type Elevator } from '../engine';
import { date, num } from '../Registry';
import { createComponentRegistry, resolveVisualState, statusAppearance, visualStatuses, type ComponentId, type ComponentStateMap, type VisualStatus } from './components';
import { createTwinScene, type TwinScene } from './scene';
import './twin3d.css';
import InspectionPanel from '../inspection/InspectionPanel';
import { inspectionStates, isEvaluated } from '../inspection/engine';

const emptyStates:ComponentStateMap={};
export default function ElevatorTwin3D({elevator,componentStates=emptyStates,onComponentSelect}:{elevator:Elevator;componentStates?:ComponentStateMap;onComponentSelect?:(id:ComponentId|null)=>void}){
  const callout=useRef<HTMLDivElement>(null),anchorDot=useRef<HTMLDivElement>(null),leader=useRef<SVGLineElement>(null);
  const host=useRef<HTMLDivElement>(null),scene=useRef<TwinScene|null>(null),sidebar=useRef<HTMLElement>(null);
  const [error,setError]=useState(''),[selected,setSelected]=useState<ComponentId|null>(null),[hovered,setHovered]=useState<ComponentId|null>(null);
  const [geared,setGeared]=useState(elevator.driveType==='geared'),[explosion,setExplosion]=useState(0),[hidden,setHidden]=useState<ComponentId[]>([]),[isolated,setIsolated]=useState(false);
  const [separated,setSeparated]=useState(false);
  const [preview,setPreview]=useState<{id:ComponentId;status:VisualStatus}|null>(null);
  const registry=useMemo(()=>createComponentRegistry(geared),[geared]);
  const states=useMemo<ComponentStateMap>(()=>{const base={...inspectionStates(elevator.componentInspections,elevator.driveType),...componentStates};return preview?{...base,[preview.id]:{status:preview.status,healthState:null,source:'Visual test only — not an assessment'}}:base;},[elevator.componentInspections,elevator.driveType,componentStates,preview]);
  const component=registry.find(c=>c.id===selected),state=selected?resolveVisualState(selected,states):null,r=latest(elevator);
  useEffect(()=>{
    if(!host.current)return;
    try{scene.current=createTwinScene(host.current,{select:id=>{setSelected(id);setSeparated(false);},separate:id=>{setSelected(id);setSeparated(true);setIsolated(false);},hover:setHovered,error:setError,anchor:point=>{const box=callout.current,h=host.current;if(!box||!h)return;const narrow=h.clientWidth<600,x=point?.x??12,y=point?.y??100,left=narrow?10:Math.max(10,Math.min(h.clientWidth-270,x+100)),top=narrow?h.clientHeight+10:Math.max(85,Math.min(h.clientHeight-box.offsetHeight-12,y-55));h.parentElement?.classList.toggle('compact-callout',narrow);box.style.left=left+'px';box.style.top=top+'px';box.dataset.anchored=String(!!point?.visible);if(anchorDot.current){anchorDot.current.style.left=x+'px';anchorDot.current.style.top=y+'px';anchorDot.current.style.display=point?.visible?'block':'none';}if(leader.current){leader.current.setAttribute('x1',String(x));leader.current.setAttribute('y1',String(y));leader.current.setAttribute('x2',String(left));leader.current.setAttribute('y2',String(top+25));leader.current.style.display=point?.visible?'block':'none';}}});}
    catch{setError('3D rendering is unavailable in this browser. Component descriptions and your recorded measurements are still available below.');}
    return ()=>{scene.current?.dispose();scene.current=null;};
  },[]);
  useEffect(()=>{scene.current?.setGeared(geared);},[geared]);
  useEffect(()=>{if(elevator.driveType)setGeared(elevator.driveType==='geared');},[elevator.driveType]);
  useEffect(()=>{scene.current?.setExplosion(explosion);},[explosion]);
  useEffect(()=>{scene.current?.setStates(states);},[states]);
  useEffect(()=>{sidebar.current?.scrollTo({top:0});},[selected,elevator.componentInspections]);
  useEffect(()=>{scene.current?.setInteraction({selected,hidden,isolated,separated});onComponentSelect?.(selected);},[selected,hidden,isolated,separated,onComponentSelect]);
  const visible=(id:ComponentId)=>!hidden.includes(id)&&(!isolated||selected===id)&&(id!=='gearbox'||geared);
  function selectComponent(id:ComponentId|null){if(id)setHidden(h=>h.filter(value=>value!==id));setSelected(id);setSeparated(false);}
  return <section className="panel twin3d" aria-label="Interactive elevator assembly">
    <div className="section-title"><div><span className="twin3d-eyebrow">COMPONENT EXPLORER / {elevator.name}</span><h2>Elevator assembly</h2></div><span className="badge">HOLOGRAPHIC SCHEMATIC</span></div>
    <p>Explore the machine, car and shaft as one system. Click to focus · double-click to separate and inspect. Geometry is illustrative; condition states use supplied component data.</p>
    <div className="twin3d-toolbar" aria-label="3D view controls">
      <div className="twin3d-buttons"><button aria-pressed={explosion===0} onClick={()=>setExplosion(0)}>Assemble</button><button aria-pressed={explosion===1} onClick={()=>setExplosion(1)}>Explode</button><button onClick={()=>{setSelected(null);setSeparated(false);setIsolated(false);scene.current?.resetCamera();}}>Reset view</button></div>
      <label className="twin3d-range">Separation <input aria-label="Component separation" type="range" min={0} max={1} step={.01} aria-valuetext={`${Math.round(explosion*100)}% separation`} value={explosion} onChange={event=>setExplosion(Number(event.target.value))}/><span className="twin3d-percent" aria-hidden="true">{Math.round(explosion*100)}%</span></label>
      <label className="twin3d-layout">Schematic layout<select value={geared?'geared':'gearless'} onChange={event=>{const value=event.target.value==='geared';setGeared(value);if(!value&&selected==='gearbox'){setSelected(null);setSeparated(false);setIsolated(false);}if(!value&&preview?.id==='gearbox')setPreview(null);}}><option value="gearless">Gearless · no gearbox</option><option value="geared">Geared · with gearbox</option></select></label>
      <label className="twin3d-layout twin3d-selector">Inspect component<select aria-label="Inspect component" value={selected??''} onChange={event=>selectComponent(event.target.value as ComponentId||null)}><option value="">Choose a component</option>{registry.map(c=><option key={c.id} value={c.id}>{c.displayName}{c.id==='gearbox'&&!geared?' · geared only':''}</option>)}</select></label>
    </div>
    <div className="twin3d-grid">
      <div className={`twin3d-stage ${selected?'has-callout':''}`}>
        <div className="twin3d-canvas" ref={host}/>{component&&<><svg className="twin3d-callout-leader" aria-hidden="true"><line ref={leader}/></svg><div ref={anchorDot} className="twin3d-anchor" aria-hidden="true"/><InspectionCallout ref={callout} component={component} elevator={elevator}/></>}
        <div className="twin3d-stage-label"><span>{explosion===0?'ASSEMBLED':explosion===1?'EXPLODED':'PARTIALLY EXPLODED'}</span><small>{separated?'SEPARATED INSPECTION · ':''}{registry.filter(c=>visible(c.id)).length} visible / 17 component identities</small></div>
        {preview&&<div className="twin3d-preview-banner">VISUAL TEST · {registry.find(c=>c.id===preview.id)?.displayName}: {preview.status}. Not an assessment.</div>}
        {error&&<div className="twin3d-error" role="alert">{error}</div>}
        <div className="twin3d-hover" aria-hidden="true">{hovered?registry.find(c=>c.id===hovered)?.displayName:'Drag to orbit · scroll / pinch to zoom · right-drag / two fingers to pan'}</div>
        <div className="twin3d-camera"><button aria-label="Zoom in" onClick={()=>scene.current?.zoom(1.2)}>＋</button><button aria-label="Zoom out" onClick={()=>scene.current?.zoom(1/1.2)}>−</button><button aria-label="Rotate left" onClick={()=>scene.current?.rotate(-Math.PI/8)}>↶</button><button aria-label="Rotate right" onClick={()=>scene.current?.rotate(Math.PI/8)}>↷</button></div>
      </div>
      <aside id="component-inspection-evidence" ref={sidebar} className={`twin3d-sidebar ${selected?'has-inspection':''}`} aria-label="Elevator components">
        {selected&&(isEvaluated(selected)?<InspectionPanel key={`${elevator.id}-${selected}`} id={selected} elevator={elevator}/>:<div className="inspection-panel"><h3>{component?.displayName}</h3><p>{selected==='traction_motor'?'Existing motor readings remain available in the inspector below. Motor estimates continue on their original pages.':'Component-specific evaluation not yet implemented. No health, risk or predictive values have been generated.'}</p></div>)}
        <div className="twin3d-list-heading"><h3>Components <small>17</small></h3><button onClick={()=>{setHidden([]);setIsolated(false);}}>Show all</button></div>
        <div className="twin3d-list">{registry.map(c=>{const v=resolveVisualState(c.id,states),absent=!geared&&c.id==='gearbox';return <div className={`twin3d-row ${selected===c.id?'selected':''}`} key={c.id} data-component-id={c.id} data-status={v.status}>
          <input type="checkbox" aria-label={`Show ${c.displayName}`} checked={visible(c.id)} disabled={absent} onChange={event=>{const show=event.target.checked;setIsolated(false);setHidden(previous=>show?previous.filter(id=>id!==c.id):[...previous,c.id]);}}/>
          <button aria-pressed={selected===c.id} onClick={()=>selectComponent(c.id)}><span>{c.displayName}</span><small>{absent?'Absent from schematic · geared only':preview?.id===c.id?`Visual test · ${v.status}`:statusAppearance[v.status].label}</small></button>
          <span className="twin3d-status-dot" style={{background:statusAppearance[v.status].color??'#6d818a'}} aria-hidden="true"/>
        </div>;})}</div>
      </aside>
    </div>
    <div className="twin3d-inspector" aria-label="Selected component details">
      {component&&state?<>
        <div><span className="twin3d-eyebrow">SELECTED / {component.category}</span><h3>{component.displayName}</h3><code>{component.id}</code><p>{component.metadata.description}</p></div>
        <div><dl><div><dt>Condition status</dt><dd>{preview?.id===selected?`Visual test · ${state.status}`:statusAppearance[state.status].label}</dd></div><div><dt>Health</dt><dd>{state.healthState??'Not supplied'}</dd></div><div><dt>Source</dt><dd>{state.source??'No component condition source connected'}</dd></div><div><dt>Visibility</dt><dd>{!geared&&selected==='gearbox'?'Not applicable in gearless layout':visible(selected!)?'Visible':'Hidden'}</dd></div></dl>
        <div className="twin3d-buttons"><button disabled={!visible(selected!)} onClick={()=>scene.current?.focus()}>Focus component</button><button disabled={!visible(selected!)} aria-pressed={separated} onClick={()=>{setSeparated(!separated);setIsolated(false);}}>{separated?'Return component':'Separate component'}</button><button disabled={!geared&&selected==='gearbox'} aria-pressed={isolated} onClick={()=>{setHidden(h=>h.filter(id=>id!==selected));setIsolated(!isolated);}}>{isolated?'End isolation':'Isolate component'}</button><button onClick={()=>{setSelected(null);setSeparated(false);setIsolated(false);}}>Clear selection</button></div></div>
        {selected==='traction_motor'&&<div className="twin3d-motor"><h4>Existing recorded motor readings</h4><p>{date(r.start)} — {date(r.end)} · {r.generatedSample?'Generated sample record':'Manual record'}</p><dl><div><dt>Winding temperature</dt><dd>{num(r.windingTemperatureC)} °C</dd></div><div><dt>Bearing temperature</dt><dd>{num(r.bearingTemperatureC)} °C</dd></div><div><dt>Vibration RMS</dt><dd>{num(r.vibrationRms)} mm/s</dd></div><div><dt>Cumulative operation</dt><dd>{num(r.operatingHours)} h</dd></div></dl><p>These are saved readings. They do not assign a component repair or replacement status.</p></div>}
      </>:<p>Select a component in the model or list to inspect its identity and available data. Every component starts with unknown condition.</p>}
    </div>
    <div className="twin3d-legend" aria-label="Component condition legend">{visualStatuses.map(status=><span key={status}><i style={{background:statusAppearance[status].color??'#6d818a'}}/>{status}</span>)}</div><p className="twin3d-footnote">Normal is cool white; Warning / Repair Required is amber; Critical is red. Unknown components use subdued gray. Rope Slip is a Traction Sheave factor. Ropes remains selectable without standalone evaluation.</p>
    <details className="twin3d-test"><summary>Visualization test · preview a supplied status</summary><p>This temporary preview demonstrates future data binding. It is not saved, does not change readings or calculations, and is not a maintenance recommendation. Only one component is previewed at a time.</p><label className="field">Preview status for {component?.displayName??'a selected component'}<select aria-label="Preview component status" disabled={!component||(!geared&&selected==='gearbox')} value={preview?.id===selected?preview.status:''} onChange={event=>setPreview(event.target.value&&selected?{id:selected,status:event.target.value as VisualStatus}:null)}><option value="">No visual test</option>{visualStatuses.map(status=><option key={status} value={status}>{status}</option>)}</select></label><button disabled={!preview} onClick={()=>setPreview(null)}>Clear visual test</button></details>
    <p className="twin3d-footnote">Schematic layout is a viewing option, not verified elevator configuration. This is not an installation drawing. Existing measurements, usage analysis and experimental estimates remain below and on their original pages.</p>
  </section>;
}
