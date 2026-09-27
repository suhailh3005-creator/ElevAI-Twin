import { useEffect, useState } from 'react';
import { useRegistry } from '../store';
import type { Elevator } from '../engine';
import type { FieldAsset } from './analysis';
let session='';
export async function fieldRequest<T=FieldAsset>(path:string,body?:unknown,retry=true):Promise<T>{
  if(!session){const response=await fetch('/api/field/session',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Local Field Lab server unavailable. Run npm run dev or npm run preview.');session=(await response.json()).session;}
  const response=await fetch(`/api/field/${path}`,{method:body===undefined?'GET':'POST',signal:AbortSignal.timeout(15000),headers:{'X-Elevai-Session':session,...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  if(response.status===401&&retry){session='';return fieldRequest(path,body,false);}const data=await response.json();if(!response.ok)throw new Error(data.error??'Field Lab request failed.');return data;
}
export function useFieldSync(elevator:Elevator|undefined){
  const [status,setStatus]=useState('');
  useEffect(()=>{if(!elevator?.fieldConnected){setStatus('');return;}let cancelled=false;const id=elevator.id;
    async function sync(){try{const asset=await fieldRequest(`asset?id=${encodeURIComponent(id)}`);if(!cancelled){useRegistry.getState().syncInspections(id,asset.inspections);setStatus('Field Lab connected · polling every 3 seconds');}}catch(err){if(!cancelled)setStatus(`Field Lab offline · ${err instanceof Error?err.message:'retrying'}`);}}
    void sync();const timer=setInterval(()=>void sync(),3000);return()=>{cancelled=true;clearInterval(timer);};
  },[elevator?.id,elevator?.fieldConnected]);return status;
}
export function downloadJson(name:string,value:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
