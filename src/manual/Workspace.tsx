import { lazy, Suspense } from 'react';
import { useFieldSync } from './field/client';
const FieldLab=lazy(()=>import('./field/FieldLab'));
import { NavLink, Route, Routes, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layers, LayoutDashboard, Box, Activity, SlidersHorizontal, Scale, FileText, ScanSearch, CalendarClock, MessageSquare, ArrowLeft } from 'lucide-react';
import { useRegistry } from './store';
import Registry from './Registry';
import { Overview, Twin, Prognostics, Scenario, Decision, Evidence, Investigation } from './Pages';
import Planning from './Planning';
import Assistant from './Assistant';
import { Badge } from '../components/UI';
import { latest } from './engine';
import './manual.css';
const links=[['/','Overview',LayoutDashboard],['/twin','Digital Twin',Box],['/prognostics','Prognostics',Activity],['/scenario','Scenario Lab',SlidersHorizontal],['/decision','Decision Engine',Scale],['/evidence','Evidence',FileText],['/investigation','Investigation',ScanSearch],['/planning','Response Planner',CalendarClock],['/assistant','AI Assistant',MessageSquare],['/field','Field Lab',ScanSearch]] as const;
export default function Workspace(){
  const s=useRegistry(),nav=useNavigate(),location=useLocation(),e=s.elevators.find(e=>e.id===s.selectedId);
  const fieldStatus=useFieldSync(e);
  if(!e||location.pathname==='/elevators')return <Registry onOpen={()=>nav('/')}/>;
  return <div className="app-shell manual-shell"><aside className="sidebar"><div className="brand"><div><Layers size={26}/><strong>ElevAI <span>Twin</span></strong></div><small>MEASUREMENT WORKSPACE</small></div><button className="registry-back" onClick={()=>nav('/elevators')}><ArrowLeft size={15}/>All elevators</button><div className="nav-caption">{e.name}</div><nav>{links.map(([path,label,Icon])=><NavLink key={path} to={path} end={path==='/'}><Icon size={17}/><span>{label}</span></NavLink>)}</nav><div className="sidebar-bottom"><div className="prototype">Manual measurement mode<small>Saved locally · {s.elevators.length} elevator{s.elevators.length===1?'':'s'}</small></div><div className="sidebar-tagline">ENTER. UNDERSTAND.<br/>COMPARE. PLAN.</div></div></aside><div className="workspace"><div className="topbar"><span>{e.project} <span className="slash">/</span><strong>{e.name}</strong></span><div className="topbar-right"><Badge>MANUAL INPUT</Badge><Badge>EXPERIMENTAL MODEL</Badge></div></div><main>{fieldStatus&&<p className="field-sync-status" role="status">{fieldStatus}</p>}{latest(e).generatedSample&&<div className="warning"><strong>Generated demo data</strong><p>This elevator uses randomized sample readings, not real measurements. All results are for demonstration.</p></div>}{s.error&&<div role="alert" className="warning">{s.error}</div>}<div key={e.id}><Routes><Route path="/" element={<Overview elevator={e}/>}/><Route path="/twin" element={<Twin elevator={e}/>}/><Route path="/prognostics" element={<Prognostics elevator={e}/>}/><Route path="/scenario" element={<Scenario elevator={e} key={e.readings.length}/>}/><Route path="/decision" element={<Decision elevator={e}/>}/><Route path="/evidence" element={<Evidence elevator={e}/>}/><Route path="/investigation" element={<Investigation elevator={e}/>}/><Route path="/planning" element={<Planning elevator={e}/>}/><Route path="/field" element={<Suspense fallback={<p>Loading Field Lab…</p>}><FieldLab key={e.id} elevator={e}/></Suspense>}/><Route path="/assistant" element={<Assistant elevator={e}/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></div></main><footer><span>{e.name} · {e.readings.length} measured periods · Browser-local record</span><span>Experimental calculations · v3</span></footer></div></div>;
}
