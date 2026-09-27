import { useRef, useState, type FormEvent } from 'react';
import { Plus, ArrowUpRight, Download, Upload, Building2 } from 'lucide-react';
import { fields, latest, safeEvaluation, validateReading, type Reading, type Elevator, type FieldKey } from './engine';
import { useRegistry } from './store';
import { Badge, Header, Modal } from '../components/UI';
import ObservationInputs from './inspection/ObservationInputs';
import { blankObservations, inspectionsFromDraft } from './inspection/entry';

export const num = (v:number|null|undefined,digits=1)=>v===null||v===undefined||!Number.isFinite(v)?'—':v.toLocaleString('en-IN',{maximumFractionDigits:digits});
export const date = (v:string)=>new Date(v).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
export function ReadingForm({elevator,onDone,onCancel}:{elevator?:Elevator;onDone:()=>void;onCancel:()=>void}) {
  const s=useRegistry();const [error,setError]=useState(''),[generated,setGenerated]=useState(false);const formRef=useRef<HTMLFormElement>(null);
  const [observations,setObservations]=useState(blankObservations);
  function autofill(){
    const random=(min:number,max:number,digits=0)=>Number((min+Math.random()*(max-min)).toFixed(digits));
    const age=random(2,14,1),dailyCycles=random(180,600),dailyHours=random(4,9,1),stress=Math.random();
    const end=new Date(Date.now()-3600000);end.setSeconds(0,0);const start=new Date(end.getTime()-7*86400000);
    const local=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const values:Record<string,string|number>={project:'Demo building',name:`DEMO-${crypto.randomUUID().slice(0,6).toUpperCase()}`,location:`Tower ${['A','B','C'][random(0,2)]} · Sample site`,start:local(start),end:local(end),motorAgeYears:age,operatingHours:Math.round(age*365*dailyHours),totalCycles:Math.round(age*365*dailyCycles),periodOperatingHours:Number((7*dailyHours).toFixed(1)),periodCycles:7*dailyCycles,averageLoadPct:random(35,75,1),windingTemperatureC:Number((55+stress*40).toFixed(1)),bearingTemperatureC:Number((40+stress*30).toFixed(1)),vibrationRms:Number((1.5+stress*5).toFixed(2)),ratedCurrentA:18,currentA:Number((17+stress*5).toFixed(2)),ratedVoltageV:415,voltageV:random(395,430,1),faultEvents:Math.floor(stress*4),notes:'GENERATED DEMO DATA — illustrative random readings, not measurements from a real elevator. Values are editable; do not use this record for operational maintenance decisions.'};
    for(const [key,value]of Object.entries(values)){const input=formRef.current?.elements.namedItem(key);if(input instanceof HTMLInputElement||input instanceof HTMLTextAreaElement)input.value=String(value);}
    setGenerated(true);setError('');
  }
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const data=new FormData(event.currentTarget);
    try {
      const values=Object.fromEntries(fields.map(f=>{const raw=String(data.get(f.key)??'');if(!raw.trim())throw new Error(`Enter ${f.label.toLowerCase()}.`);return [f.key,Number(raw)];}));
      const r={...values,id:crypto.randomUUID(),start:new Date(String(data.get('start'))).toISOString(),end:new Date(String(data.get('end'))).toISOString(),recordedAt:new Date().toISOString(),notes:String(data.get('notes')??'')} as Reading;
      if(generated)r.generatedSample=true;
      for(const key of ['startOperatingHours','startTotalCycles'] as const){const raw=String(data.get(key)??'').trim();if(raw)r[key]=Number(raw);}
      validateReading(r);
      if(elevator)s.reading(elevator.id,r);else {
        const project=String(data.get('project')??'').trim(),name=String(data.get('name')??'').trim();
        if(!project||!name)throw new Error('Project and elevator names cannot be blank.');
        const componentInspections=inspectionsFromDraft(observations,r);
        s.add({project,name,location:String(data.get('location')??'').trim(),...(componentInspections.length?{componentInspections}:{}),...(observations.driveType?{driveType:observations.driveType}:{})},r);
      }
      onDone();
    }catch(e){setError(e instanceof Error?e.message:'Unable to save readings.');}
  }
  return <form ref={formRef} onSubmit={submit} className="reading-form">
    {!elevator&&<div className="notice"><div><strong>Try the dashboard with sample readings</strong><p>Autofill all fields with a randomized, illustrative elevator profile. Review or edit it, then create the elevator.</p>{generated&&<Badge>GENERATED DEMO DATA · NOT REAL MEASUREMENTS</Badge>}</div><div><button type="button" onClick={autofill}>{generated?'Generate another sample':'Autofill sample values'}</button>{generated&&<button type="button" onClick={()=>{formRef.current?.reset();setGenerated(false);setError('');}}>Clear sample</button>}</div></div>}
    <p>Enter measured values for one observation period. Lifetime counters refer to the period end; temperatures, vibration, load, current and voltage should summarize the same period. No sensor readings are prefilled.</p>
    {!elevator&&<div className="manual-form-grid"><label className="field">Project name<input name="project" required maxLength={100} placeholder="e.g. Engineering campus"/></label><label className="field">Elevator name / ID<input name="name" required maxLength={100} placeholder="e.g. ELAB 202"/></label><label className="field">Location (optional)<input name="location" maxLength={150} placeholder="Building / floor / site"/></label></div>}
    <div className="manual-form-grid"><label className="field">Measurement period start<input required type="datetime-local" name="start"/></label><label className="field">Measurement period end<input required type="datetime-local" name="end"/></label></div>
    {elevator&&<p>Previous period ended {date(latest(elevator).end)}. Add a later, non-overlapping period.</p>}
    <details className="panel"><summary>Optional starting counters · reconcile this interval</summary><p>Enter actual cumulative counters at the period start if available. Otherwise, reconciliation can use a preceding record only when its end exactly matches this start. Blank values are not guessed.</p><div className="manual-form-grid"><label className="field">Operating hours at period start (h)<input name="startOperatingHours" type="number" min={0} step="any" placeholder="Optional actual start counter"/></label><label className="field">Cycles at period start<input name="startTotalCycles" type="number" min={0} step={1} placeholder="Optional actual start counter"/></label></div><p>Mismatches are flagged in Digital Twin without replacing your supplied period values.</p></details>
    <div className="manual-form-grid">{fields.map(f=><label className="field" key={f.key}>{f.label}<div className="unit-input"><input required type="number" name={f.key} min={f.key==='ratedCurrentA'||f.key==='ratedVoltageV'?0.001:0} max={f.max} step={['totalCycles','periodCycles','faultEvents'].includes(f.key)?1:'any'} placeholder="Enter measured value"/><span>{f.unit}</span></div></label>)}</div>
    <p className="muted">Current/voltage deviation is calculated against your reference values. This is not phase imbalance or harmonic distortion. Vibration must be velocity RMS in mm/s.</p>
    <label className="field">Measurement source / notes<textarea name="notes" maxLength={4000} rows={3} placeholder="Meter, sensor location, technician, measurement method…"/></label>
    {!elevator&&<ObservationInputs draft={observations} onChange={setObservations}/>}
    <div className="notice">Calculated health and maintenance timing use an experimental model. Its assumed reference scales and editable formulas are shown in Evidence.</div>
    {error&&<div role="alert" className="warning">{error}</div>}
    <div className="actions"><button type="button" onClick={onCancel}>Cancel</button><button type="submit" className="primary">{elevator?'Save measurement period':'Create elevator & open dashboard'}<ArrowUpRight size={16}/></button></div>
  </form>;
}
export default function Registry({onOpen}:{onOpen:()=>void}) {
  const s=useRegistry(),file=useRef<HTMLInputElement>(null);const [add,setAdd]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState('');
  const elevators=s.elevators.filter(e=>`${e.project} ${e.name} ${e.location}`.toLowerCase().includes(query.toLowerCase()));
  function download(){const url=URL.createObjectURL(new Blob([s.exportData()],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='elevai-registry-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <div className="registry"><div className="registry-brand"><Building2 size={22}/><strong>ElevAI Twin</strong><Badge>LOCAL WORKSPACE</Badge></div>
    <Header eyebrow="YOUR PROJECTS · YOUR MEASUREMENTS" title="Elevator registry" description="Start with a real observation period. Keep every elevator’s readings, calculations and plans in its own record." action={<button className="primary" onClick={()=>setAdd(true)}><Plus size={16}/>Add elevator</button>}/>
    <div className="registry-toolbar"><input aria-label="Search elevators" placeholder="Search project, elevator or location" value={query} onChange={e=>setQuery(e.target.value)}/><button onClick={download}><Download size={15}/>Export backup</button><button onClick={()=>file.current?.click()}><Upload size={15}/>Import backup</button><input ref={file} type="file" accept=".json,application/json" hidden onChange={async event=>{const f=event.target.files?.[0];if(!f)return;try{if(f.size>10000000)throw new Error('Backup must be under 10 MB.');s.importData(await f.text());setError('');}catch(e){setError(e instanceof Error?e.message:'Import failed.');}event.target.value='';}}/></div>
    {(error||s.error)&&<div role="alert" className="warning">{error||s.error}</div>}
    {!s.elevators.length?<section className="registry-empty panel"><Building2 size={44} strokeWidth={1}/><h2>Your first elevator starts here.</h2><p>Add its name, measurement period and motor vitals. The dashboard will calculate from those values only.</p><button className="primary" onClick={()=>setAdd(true)}>Add your first elevator <Plus size={15}/></button><small>Start with your measurements, or choose optional sample autofill.</small></section>:<div className="registry-cards">{elevators.map(e=>{const r=latest(e),{result}=safeEvaluation(r,e.model);return <article className="panel elevator-card" key={e.id}><div className="section-title"><Badge>{e.project}</Badge><span className="muted">{e.readings.length} period{e.readings.length===1?'':'s'}</span></div><h2>{e.name}</h2><p>{e.location||'Location not specified'}</p><div className="card-health"><strong>{num(result?.health)}<small>%</small></strong><span>Experimental health index</span></div><p className="muted">Latest period ends {date(r.end)}</p><button className="full-width" onClick={()=>{try{s.select(e.id);onOpen();}catch(err){setError(String(err));}}}>Open elevator<ArrowUpRight size={16}/></button></article>;})}</div>}
    {!!s.elevators.length&&!elevators.length&&<p className="empty">No elevators match your search.</p>}
    <p className="registry-storage">Saved in this browser on this localhost address. Export backups to retain a portable copy. Imports add new records and keep existing records unchanged.</p>
    {add&&<Modal title="Add an elevator" onClose={()=>setAdd(false)}><ReadingForm onCancel={()=>setAdd(false)} onDone={()=>{setAdd(false);onOpen();}}/></Modal>}
  </div>;
}
export function VitalsTable({reading}:{reading:Reading}){return <div className="panel state-grid">{fields.map(f=><div key={f.key}><span>{f.label}</span><strong>{num(reading[f.key])}<small> {f.unit}</small></strong><Badge>{reading.generatedSample?'GENERATED SAMPLE':'MANUALLY ENTERED'}</Badge></div>)}</div>;}
export function LimitsForm({elevator}:{elevator:Elevator}){
  const s=useRegistry();const [message,setMessage]=useState('');
  return <form onSubmit={event=>{event.preventDefault();const fd=new FormData(event.currentTarget);const limits:Partial<Record<FieldKey,number>>={};for(const f of fields){const raw=String(fd.get(f.key)??'');if(raw.trim())limits[f.key]=Number(raw);}try{s.limits(elevator.id,limits);setMessage('Monitoring limits saved for this elevator.');}catch(e){setMessage(String(e));}}}><p>Optional upper limits supplied by your maintenance team or manufacturer. Blank means no limit configured; the app will not invent one.</p><div className="manual-form-grid">{fields.filter(f=>['averageLoadPct','windingTemperatureC','bearingTemperatureC','vibrationRms','currentA','voltageV'].includes(f.key)).map(f=><label className="field" key={f.key}>{f.label} maximum ({f.unit})<input name={f.key} type="number" min={0} max={f.max} step="any" defaultValue={elevator.limits[f.key]??''}/></label>)}</div><button type="submit">Save monitoring limits</button>{message&&<p role="status">{message}</p>}</form>;
}
