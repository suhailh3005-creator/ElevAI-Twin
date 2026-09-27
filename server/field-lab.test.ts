import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createFieldHandler } from './field-lab';
import { demoReplay } from '../src/manual/field/replay';
const id='11111111-1111-4111-8111-111111111111';
async function serverTest(fn:(url:string,session:string,path:string)=>Promise<void>,path?:string){const dir=await mkdtemp(join(tmpdir(),'elevai-field-')),file=path??join(dir,'field.json'),handler=createFieldHandler(file,()=> 'test-ingest-key');const server=createServer((req,res)=>handler(req,res,()=>{res.writeHead(404);res.end();}));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;try{const {session}=await(await fetch(url+'/api/field/session')).json();await fn(url,session,file);}finally{await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}}
const post=(url:string,session:string,path:string,body:unknown)=>fetch(url+'/api/field/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Elevai-Session':session},body:JSON.stringify(body)});
const connect={elevatorId:id,name:'Test elevator',project:'Test project',driveType:'geared',inspections:[]};
describe('Persistent Field Lab API',()=>{
  it('requires authentication and rejects cross-origin traffic',async()=>serverTest(async(url,session)=>{expect((await fetch(url+'/api/field/backup')).status).toBe(401);expect((await fetch(url+'/api/field/session',{headers:{Origin:'https://other.example'}})).status).toBe(403);expect((await post(url,session,'connect',connect)).status).toBe(200);const keyRequest=await fetch(url+'/api/field/backup',{headers:{Authorization:'Bearer test-ingest-key'}});expect(keyRequest.status).toBe(401);}));
  it('persists, deduplicates, rejects conflicting/invalid batches atomically, and survives restart',async()=>serverTest(async(url,session,file)=>{
    await post(url,session,'connect',connect);const packets=demoReplay('traction_sheave').packets.slice(0,5),body={elevatorId:id,deviceId:'demo',packets};expect((await post(url,session,'ingest',body)).status).toBe(200);expect((await post(url,session,'ingest',body)).status).toBe(200);
    const fail=await post(url,session,'ingest',{...body,packets:[{...packets[0],id:'new-id'},{...packets[1],id:'invalid',values:{bad:4}}]});expect(fail.status).toBe(400);expect(JSON.parse(await readFile(file,'utf8')).assets[id].inspections).toHaveLength(5);
    expect((await post(url,session,'ingest',{...body,packets:[{...packets[0],source:'changed'}]})).status).toBe(400);
    await serverTest(async(next,nextSession)=>{const r=await fetch(next+'/api/field/asset?id='+id,{headers:{'X-Elevai-Session':nextSession}});expect((await r.json()).inspections).toHaveLength(5);},file);
  }));
  it('requires calibrated device identity for real packets and snapshots configured thresholds',async()=>serverTest(async(url,session)=>{
    await post(url,session,'connect',connect);const packet={...demoReplay('traction_sheave').packets.find(r=>r.componentId==='traction_sheave')!,generatedSample:false};delete packet.demoTarget;const body={elevatorId:id,deviceId:'device-1',packets:[packet]};expect((await post(url,session,'ingest',body)).status).toBe(400);
    const profile={equipmentModel:'Test model',reference:'Calibration report',deviceId:'device-1',calibrationDate:'2025-01-01',calibrationDue:'2099-01-01',staleMinutes:60,thresholds:{traction_sheave:{rope_slip:{warning:3,critical:7}}}};expect((await post(url,session,'profile',{elevatorId:id,profile})).status).toBe(200);
    expect((await post(url,session,'ingest',{...body,deviceId:'wrong'})).status).toBe(400);const r=await fetch(url+'/api/field/ingest',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-ingest-key'},body:JSON.stringify(body)});expect(r.status).toBe(200);expect((await r.json()).inspections[0]).toMatchObject({thresholds:{rope_slip:{warning:3,critical:7}},generatedSample:false});
  }));
  it('preserves concurrent updates and immutable labels',async()=>serverTest(async(url,session)=>{await post(url,session,'connect',connect);const packets=demoReplay('brake').packets;await Promise.all(packets.slice(0,10).map(p=>post(url,session,'ingest',{elevatorId:id,packets:[p]})));const label={elevatorId:id,inspectionId:packets[0].id,actual:'normal',assessor:'Engineer',evidence:'Report 1'};expect((await post(url,session,'label',label)).status).toBe(200);expect((await post(url,session,'label',label)).status).toBe(400);const data=await(await fetch(url+'/api/field/asset?id='+id,{headers:{'X-Elevai-Session':session}})).json();expect(data.inspections).toHaveLength(10);expect(data.labels).toHaveLength(1);}));
  it('refuses corrupted database without overwriting it',async()=>serverTest(async(url,session,file)=>{await writeFile(file,'broken');expect((await post(url,session,'connect',connect)).status).toBe(400);expect(await readFile(file,'utf8')).toBe('broken');}));
  it('verifies a repair only after a real normal follow-up and preserves its audit trail',async()=>serverTest(async(url,session)=>{
    await post(url,session,'connect',connect);const alert=demoReplay('traction_sheave').packets.filter(r=>r.componentId==='traction_sheave').at(-1)!;await post(url,session,'ingest',{elevatorId:id,packets:[alert]});
    let response=await post(url,session,'job',{elevatorId:id,inspectionId:alert.id,assignee:'Engineer'}),asset=await response.json();const jobId=asset.jobs[0].id;
    expect((await post(url,session,'transition',{elevatorId:id,jobId,action:'verify',actor:'Engineer',note:'Premature'})).status).toBe(400);
    await post(url,session,'transition',{elevatorId:id,jobId,action:'inspect',actor:'Engineer',note:'Inspection documented'});response=await post(url,session,'transition',{elevatorId:id,jobId,action:'repair',actor:'Engineer',note:'Repair documented'});asset=await response.json();const repairedAt=asset.jobs[0].updatedAt;
    await post(url,session,'profile',{elevatorId:id,profile:{equipmentModel:'Test',reference:'TEST calibration',deviceId:'device',calibrationDate:'2025-01-01',calibrationDue:'2099-01-01',staleMinutes:60}});
    const followup={...alert,id:'real-followup',generatedSample:false,start:repairedAt,end:new Date().toISOString(),values:{sheave_wear:0,rope_slip:1,vibration:0,temperature:20}};delete followup.demoTarget;
    expect((await post(url,session,'ingest',{elevatorId:id,deviceId:'device',packets:[followup]})).status).toBe(200);
    response=await post(url,session,'transition',{elevatorId:id,jobId,action:'verify',actor:'Engineer',note:'Independent normal follow-up',followupId:followup.id});expect(response.status).toBe(200);asset=await response.json();expect(asset.jobs[0]).toMatchObject({status:'verified',followupId:followup.id});expect(asset.jobs[0].history).toHaveLength(4);
  }));
});
