// Read-only local gateway sender. Never logs the credential or operates equipment.
import { readFile } from 'node:fs/promises';
const [elevatorId,file]=process.argv.slice(2),token=process.env.ELEVAI_INGEST_TOKEN;
if(!elevatorId||!file||!token){console.error('Usage: set ELEVAI_INGEST_TOKEN in this process, then node scripts/send-telemetry.mjs <elevator-id> <replay.json>');process.exitCode=1;}
else try{
  const input=JSON.parse(await readFile(file,'utf8'));if(input.version!==1||!Array.isArray(input.packets)||input.packets.length>1000||typeof input.deviceId!=='string')throw new Error('Invalid replay file.');
  for(let i=0;i<input.packets.length;i+=100){const response=await fetch('http://127.0.0.1:5174/api/field/ingest',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({elevatorId,deviceId:input.deviceId,packets:input.packets.slice(i,i+100)}),signal:AbortSignal.timeout(15000)});if(!response.ok){const data=await response.json();throw new Error(data.error??`Gateway rejected batch: HTTP ${response.status}`);}console.log(`Accepted ${Math.min(i+100,input.packets.length)}/${input.packets.length} observations.`);}
}catch(error){console.error(error instanceof Error?error.message:'Telemetry send failed.');process.exitCode=1;}
