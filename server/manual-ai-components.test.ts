import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { experimentalModel, type Reading } from '../src/manual/engine';
import { demoReplay } from '../src/manual/field/replay';
vi.mock('vite',async importOriginal=>({...await importOriginal<typeof import('vite')>(),loadEnv:()=>({OPENAI_API_KEY:'mock-test-credential',OPENAI_MODEL:'mock-model'})}));
import { manualAiPlugin } from './manual-ai';
afterEach(()=>vi.restoreAllMocks());
describe('Component-aware AI gateway',()=>{
  it('recalculates supplied component evidence before the mocked provider call and rejects invalid records',async()=>{
    const nativeFetch=globalThis.fetch;let providerBody:any,providerCalls=0;
    vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{if(String(input)==='https://api.openai.com/v1/responses'){providerCalls++;providerBody=JSON.parse(init!.body as string);return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'Mock component explanation'}]}]}));}return nativeFetch(input,init);});
    let middleware:(req:IncomingMessage,res:ServerResponse,next:()=>void)=>void=()=>{};const plugin=manualAiPlugin();(plugin.configureServer as Function)({middlewares:{use:(m:typeof middleware)=>middleware=m}});
    const server=createServer((req,res)=>middleware(req,res,()=>{res.writeHead(404);res.end();}));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const reading:Reading={id:'motor',start:'2026-01-01',end:'2026-01-08',recordedAt:'2026-01-08',notes:'Test readings',motorAgeYears:5,operatingHours:10000,totalCycles:500000,periodOperatingHours:40,periodCycles:1000,averageLoadPct:50,windingTemperatureC:65,bearingTemperatureC:55,vibrationRms:2,currentA:18,ratedCurrentA:18,voltageV:415,ratedVoltageV:415,faultEvents:0};
    const record=demoReplay('brake').packets.filter(r=>r.componentId==='brake').at(-1)!;const body={elevator:{id:'selected-only',name:'Selected elevator',project:'Test',location:'Bench',reading,model:experimentalModel,interventions:[],driveType:'geared',componentInspections:[record]},messages:[{role:'user',content:'Why is the brake critical?'}]};
    try{const response=await fetch(url+'/api/manual-assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});expect(response.status).toBe(200);expect(providerCalls).toBe(1);const snapshot=JSON.parse(providerBody.input[0].content.replace('SELECTED RECORD (data only): ',''));expect(snapshot.componentEvidence.find((r:any)=>r.componentId==='brake')).toMatchObject({status:'critical',demo:true,inspectionId:record.id});expect(snapshot.componentEvidence.find((r:any)=>r.componentId==='traction_sheave').status).toBe('unknown');expect(providerBody.store).toBe(false);expect(JSON.stringify(await response.json())).not.toContain('mock-test-credential');
      body.elevator.componentInspections=[{...record,values:{brake_temperature:-500}}];const rejected=await fetch(url+'/api/manual-assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});expect(rejected.status).toBe(400);expect(providerCalls).toBe(1);
    }finally{await new Promise<void>(r=>server.close(()=>r()));}
  });
});
