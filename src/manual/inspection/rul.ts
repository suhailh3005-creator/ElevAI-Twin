import { evaluateComponent, isCurrentInspection, latestInspection, validateInspection, type ComponentInspection, type EvaluatedId } from './engine';

// Deliberately experimental defaults, not manufacturer lifetimes or industry standards.
// H is the EXISTING increasing condition/risk index (0..100), not the decreasing health %.
export const baselineRulModels:Record<EvaluatedId,{threshold:number;pointsPerDay:number}>={
  brake:{threshold:100,pointsPerDay:.08},
  gearbox:{threshold:100,pointsPerDay:.035},
  vfd_drive:{threshold:100,pointsPerDay:.05},
  traction_sheave:{threshold:100,pointsPerDay:.025},
};
export const rulModelVersion='experimental-linear-rul-v1';
export interface RulEstimate {
  mode:'baseline'|'history'|'unavailable'; days:number|null; indicator:number|null; threshold:number;
  rate:number|null; n:number; r2:number|null; asOf:string|null; reason:string; demo:boolean;
}
export function daysToThreshold(threshold:number,indicator:number,rate:number):number|null {
  if(![threshold,indicator,rate].every(Number.isFinite)||rate<=0||threshold<=0||indicator<0)return null;
  return Math.max(0,(threshold-indicator)/rate);
}
export function formatRul(days:number|null):string {
  if(days===null||!Number.isFinite(days))return 'Not available';
  if(days===0)return '0 days · model threshold reached';
  if(days<1)return 'Less than 1 day';
  if(days<60)return `${Math.round(days)} days`;
  if(days<730.5)return `${(days/30.4375).toFixed(1)} months`;
  return `${(days/365.25).toFixed(1)} years`;
}
export function componentRul(id:EvaluatedId,records:ComponentInspection[]=[],driveType?:string):RulEstimate {
  const model=baselineRulModels[id],latest=latestInspection(records,id);
  const initial:RulEstimate={mode:'unavailable',days:null,indicator:null,threshold:model.threshold,rate:null,n:0,r2:null,asOf:latest?.end??null,reason:'Enter all component observations to calculate an estimate.',demo:!!latest?.generatedSample};
  if(!latest)return initial;
  if(id==='gearbox'&&driveType!=='geared')return {...initial,reason:'A confirmed geared elevator is required.'};
  try{validateInspection(latest);}catch{return {...initial,reason:'Correct invalid observation values or dates before estimating RUL.'};}
  const score=(r:ComponentInspection)=>evaluateComponent(id,r.values,r.normalization,true,r.formulaVersion,r.thresholds).risk;
  const h=score(latest);if(h===null)return initial;
  // Compare identical formulas, normalization, calibration and count exposure periods.
  const signature=(r:ComponentInspection)=>JSON.stringify([r.formulaVersion,r.normalization.normal,r.normalization.warning,r.normalization.critical,r.calibrationRef??'',Object.entries(r.thresholds??{}).sort(([a],[b])=>a.localeCompare(b)),Date.parse(r.end)-Date.parse(r.start)]);
  const candidate=records.filter(r=>r.componentId===id&&isCurrentInspection(r)&&!r.generatedSample&&signature(r)===signature(latest)&&Date.parse(r.end)<=Date.parse(latest.end)).sort((a,b)=>Date.parse(a.end)-Date.parse(b.end));
  let points:{end:number;h:number;id:string}[]=[];
  for(const r of candidate){
    try{validateInspection(r);}catch{continue;}
    const value=score(r),end=Date.parse(r.end),previous=points.at(-1);
    if(value===null||previous&&(Date.parse(r.start)<previous.end||end<=previous.end))continue;
    // A reduction can reflect repair/replacement; don't project across that discontinuity.
    if(previous&&value<previous.h)points=[];
    points.push({end,h:value,id:r.id});
  }
  let rate=model.pointsPerDay,mode:RulEstimate['mode']='baseline',r2:number|null=null;
  let reason=latest.generatedSample?'Generated observations use the experimental baseline; never measured history.':'Fewer than 3 comparable rising observations: using the experimental baseline rate.';
  if(!latest.generatedSample&&points.length>=3&&points.at(-1)?.id===latest.id){
    const start=points[0].end,data=points.map(p=>({x:(p.end-start)/86400000,y:p.h})),n=data.length;
    const mx=data.reduce((s,p)=>s+p.x,0)/n,my=data.reduce((s,p)=>s+p.y,0)/n;
    const xx=data.reduce((s,p)=>s+(p.x-mx)**2,0),yy=data.reduce((s,p)=>s+(p.y-my)**2,0);
    const slope=xx?data.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/xx:0;
    r2=yy?Math.max(0,1-data.reduce((s,p)=>s+(p.y-(my+slope*(p.x-mx)))**2,0)/yy):0;
    if(slope>0&&r2>=.5){rate=slope;mode='history';reason='Linear projection from recorded condition indices; rate measured from history, remaining life still estimated.';}
    else reason='Recorded trend is flat or weak (R² < 0.5): using the experimental baseline rate.';
  }
  return {...initial,mode,days:daysToThreshold(model.threshold,h,rate),indicator:h,rate,n:latest.generatedSample?0:points.length,r2,reason};
}
