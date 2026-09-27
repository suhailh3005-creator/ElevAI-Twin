import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';
import { evaluatedIds, validateInspection, type ComponentInspection, type EvaluatedId } from '../src/manual/inspection/engine';
import { resultFor, transitionJob, validProfile, validatePacket, type FieldAsset, type ReferenceLabel } from '../src/manual/field/analysis';

interface FieldDatabase {version:1;assets:Record<string,FieldAsset>}
const send=(res:ServerResponse,status:number,data:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const same=(a:string,b:string)=>!!a&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const text=(x:unknown,max=300)=>typeof x==='string'&&!!x.trim()&&x.length<=max;
export function createFieldHandler(path:string,getIngestKey:()=>string){
  const session=randomBytes(32).toString('hex');let db:FieldDatabase|null=null,queue:Promise<unknown>=Promise.resolve();
  async function read(){if(db)return db;try{const value=JSON.parse(await readFile(path,'utf8')) as FieldDatabase;if(value.version!==1||!value.assets||Array.isArray(value.assets))throw Error();for(const [id,a]of Object.entries(value.assets)){if(id!==a.id||!text(a.name,100)||!text(a.project,100)||!Array.isArray(a.inspections)||a.inspections.length>10000||!Array.isArray(a.jobs)||!Array.isArray(a.labels)||!Number.isSafeInteger(a.revision)||a.revision<0||a.profile!==null&&!validProfile(a.profile))throw Error();a.inspections.forEach(validateInspection);const ids=new Set(a.inspections.map(r=>r.id));if(ids.size!==a.inspections.length)throw Error();for(const l of a.labels)if(!ids.has(l.inspectionId)||!['normal','warning','critical'].includes(l.actual)||!text(l.assessor,150)||!text(l.evidence,2000))throw Error();for(const j of a.jobs)if(!ids.has(j.inspectionId)||![...evaluatedIds,'ropes'].includes(j.componentId)||!['open','inspected','repaired','verified'].includes(j.status)||!Array.isArray(j.history)||j.history.some(h=>!text(h.actor,150)||!text(h.action,3100)||!Number.isFinite(Date.parse(h.at))))throw Error();}db=value;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')db={version:1,assets:{}};else throw new Error('Server database cannot be read. Restore a valid backup; it has not been overwritten.');}return db;}
  async function save(next:FieldDatabase){await mkdir(dirname(path),{recursive:true});const temp=path+'.tmp';await writeFile(temp,JSON.stringify(next),{encoding:'utf8',mode:0o600});await rename(temp,path);db=next;}
  async function handle(req:IncomingMessage,res:ServerResponse,next:()=>void){
    const url=new URL(req.url??'/', 'http://localhost');if(!url.pathname.startsWith('/api/field/'))return next();
    const host=req.headers.host??'',remote=req.socket.remoteAddress??'';
    if(!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)||req.headers.origin&&req.headers.origin!==`http://${host}`||req.headers['sec-fetch-site']==='cross-site'){send(res,403,{error:'Field Lab is restricted to the local application origin and loopback gateway.'});return;}
    if(url.pathname==='/api/field/session'&&req.method==='GET'){send(res,200,{session});return;}
    const ingest=url.pathname==='/api/field/ingest',bearer=(req.headers.authorization??'').replace(/^Bearer /,''),app=same(String(req.headers['x-elevai-session']??''),session);
    if(!(app||ingest&&same(bearer,getIngestKey()))){send(res,401,{error:'Authentication required. Use the app session or a configured gateway ingestion token.'});return;}
    if(req.method==='GET'){
      const data=await read();
      if(url.pathname==='/api/field/status'){send(res,200,{storage:'Atomic file database',assets:Object.keys(data.assets).length,ingestionConfigured:!!getIngestKey(),mode:'Loopback only',authentication:'Local app session; separate bearer token for ingestion',transport:'HTTP on loopback only. Remote TLS/RBAC deployment is not configured.'});return;}
      if(url.pathname==='/api/field/backup'){send(res,200,data);return;}
      const assetId=url.searchParams.get('id')??'';const a=url.pathname==='/api/field/asset'&&Object.hasOwn(data.assets,assetId)?data.assets[assetId]:undefined;if(!a){send(res,404,{error:'Connect this elevator to Field Lab first.'});return;}send(res,200,a);return;
    }
    if(req.method!=='POST'){send(res,405,{error:'Use GET or POST.'});return;}
    if(!req.headers['content-type']?.startsWith('application/json')){send(res,415,{error:'JSON required.'});return;}
    let body:any;try{let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>2000000){send(res,413,{error:'Limit is 2 MB per request.'});return;}chunks.push(Buffer.from(chunk));}body=JSON.parse(Buffer.concat(chunks).toString());}catch{send(res,400,{error:'Invalid JSON.'});return;}
    // Serialize read-modify-write transactions. Failed writes never update the live database.
    const work=queue.then(async()=>{
      const data=structuredClone(await read());const id=body?.elevatorId;if(!text(id,120)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new Error('Invalid elevator ID.');
      if(url.pathname==='/api/field/connect'){
        if(!text(body.name,100)||!text(body.project,100)||body.driveType!==undefined&&!['geared','gearless'].includes(body.driveType))throw new Error('Invalid elevator metadata.');
        if(!data.assets[id]){if(Object.keys(data.assets).length>=500)throw new Error('Server asset limit reached.');data.assets[id]={id,name:body.name,project:body.project,driveType:body.driveType,inspections:[],jobs:[],labels:[],profile:null,revision:0};}
        const a=data.assets[id];a.name=body.name;a.project=body.project;a.driveType=body.driveType;
        if(!Array.isArray(body.inspections)||body.inspections.length>10000)throw new Error('Invalid inspection history.');
        for(const record of body.inspections){validateInspection(record);const old=a.inspections.find(r=>r.id===record.id);if(old&&JSON.stringify(old)!==JSON.stringify(record))throw new Error('Inspection ID conflict. Import without changing saved observations.');if(!old)a.inspections.push(record);}
      }
      const a=data.assets[id];if(!a)throw new Error('Connect the elevator before sending data.');
      if(url.pathname==='/api/field/ingest'){
        if(!Array.isArray(body.packets)||!body.packets.length||body.packets.length>100)throw new Error('Send 1–100 packets.');
        for(const value of body.packets){const p=validatePacket(value);if(p.componentId==='gearbox'&&a.driveType!=='geared')throw new Error('Gearbox requires a confirmed geared elevator.');
          if(!p.generatedSample){const profile=a.profile;if(!profile||!validProfile(profile)||Date.parse(profile.calibrationDue)<Date.now())throw new Error('Real telemetry needs a current equipment calibration profile.');if(body.deviceId!==profile.deviceId)throw new Error('Device ID does not match the equipment profile.');if(Date.parse(p.start)<Date.parse(profile.calibrationDate))throw new Error('Observation predates this calibration profile.');}
          const record:ComponentInspection={...p};if(!p.generatedSample&&a.profile){record.thresholds=a.profile.thresholds?.[p.componentId];record.calibrationRef=`${a.profile.equipmentModel} · ${a.profile.reference} · ${a.profile.deviceId} · calibration ${a.profile.calibrationDate}`;}else{delete record.thresholds;delete record.calibrationRef;}
          validateInspection(record);const old=a.inspections.find(r=>r.id===record.id);if(old){if(JSON.stringify(old)!==JSON.stringify(record))throw new Error('Packet ID already exists with different data.');continue;}a.inspections.push(record);
        }
      }else if(url.pathname==='/api/field/profile'){
        if(!validProfile(body.profile))throw new Error('Enter model, reference, device ID, valid calibration dates and a stale-data limit.');
        if(body.profile.thresholds!==undefined&&(body.profile.thresholds===null||typeof body.profile.thresholds!=='object'||Array.isArray(body.profile.thresholds)))throw new Error('Threshold overrides must be an object.');
        if(body.profile.thresholds){for(const [componentId,thresholds]of Object.entries(body.profile.thresholds)){if(!evaluatedIds.includes(componentId as EvaluatedId))throw new Error('Configure thresholds only for the four active evaluated components.');const probe:ComponentInspection={id:'validation',componentId:componentId as EvaluatedId,start:'2025-01-01',end:'2025-01-02',recordedAt:new Date().toISOString(),source:'profile validation',values:{},normalization:{normal:0,warning:.5,critical:1},formulaVersion:'component-v3',thresholds:thresholds as ComponentInspection['thresholds'],calibrationRef:body.profile.reference};validateInspection(probe);}}
        a.profile=body.profile;
      }else if(url.pathname==='/api/field/label'){
        if(!a.inspections.some(r=>r.id===body.inspectionId)||!['normal','warning','critical'].includes(body.actual)||!text(body.assessor,150)||!text(body.evidence,2000))throw new Error('Select an observation and provide an independent assessor and evidence reference.');
        if(a.labels.some(l=>l.inspectionId===body.inspectionId))throw new Error('This observation already has a reference label; labels are immutable.');
        const label:ReferenceLabel={id:randomBytes(12).toString('hex'),inspectionId:body.inspectionId,actual:body.actual,assessor:body.assessor,evidence:body.evidence,at:new Date().toISOString()};a.labels.push(label);
      }else if(url.pathname==='/api/field/job'){
        const record=a.inspections.find(r=>r.id===body.inspectionId);if(!record||!text(body.assignee,150))throw new Error('Select an observation and assign a technician.');
        const result=resultFor(record,a.driveType);if(!['warning','critical'].includes(result.status))throw new Error('A work order needs an abnormal observation.');
        if(a.jobs.some(j=>j.componentId===record.componentId&&j.status!=='verified'))throw new Error('This component already has an open work order.');
        const at=new Date().toISOString();a.jobs.push({id:randomBytes(12).toString('hex'),componentId:record.componentId,inspectionId:record.id,status:'open',assignee:body.assignee,finding:'',repair:'',followupId:'',createdAt:at,updatedAt:at,history:[{at,action:'Alert converted to inspection task',actor:body.assignee}]});
      }else if(url.pathname==='/api/field/transition'){
        const index=a.jobs.findIndex(j=>j.id===body.jobId);if(index<0)throw new Error('Work order not found.');a.jobs[index]=transitionJob(a.jobs[index],body.action,body.actor,body.note,a.inspections.find(r=>r.id===body.followupId),a.driveType);
      }else if(url.pathname!=='/api/field/connect'&&url.pathname!=='/api/field/ingest')throw new Error('Unknown operation.');
      if(a.inspections.length>10000)throw new Error('Observation limit reached. Export the database before archiving.');a.revision++;await save(data);send(res,200,a);
    });queue=work.catch(()=>{});try{await work;}catch(e){send(res,400,{error:e instanceof Error?e.message:'Request rejected.'});}
  }
  return (req:IncomingMessage,res:ServerResponse,next:()=>void)=>{void handle(req,res,next).catch(()=>send(res,503,{error:'Field database unavailable; existing data was preserved.'}));};
}
export function fieldLabPlugin():Plugin{
  const handler=createFieldHandler(resolve(process.env.ELEVAI_FIELD_DATABASE??resolve(process.cwd(),'.data/field-lab.json')),()=>loadEnv('development',process.cwd(),'ELEVAI_').ELEVAI_INGEST_TOKEN?.trim()??'');
  return {name:'elevai-field-lab',configureServer:s=>{s.middlewares.use(handler);},configurePreviewServer:s=>{s.middlewares.use(handler);}};
}
