import type { ComponentInspection } from './inspection/engine';
export const fields = [
  { key: 'motorAgeYears', label: 'Motor age', unit: 'years', max: 100 },
  { key: 'operatingHours', label: 'Total operating hours', unit: 'h', max: 1000000 },
  { key: 'totalCycles', label: 'Total cycles', unit: 'cycles', max: 1000000000 },
  { key: 'periodOperatingHours', label: 'Operating hours in this period', unit: 'h', max: 1000000 },
  { key: 'periodCycles', label: 'Cycles in this period', unit: 'cycles', max: 1000000000 },
  { key: 'averageLoadPct', label: 'Average load', unit: '% rated load', max: 200 },
  { key: 'windingTemperatureC', label: 'Winding temperature', unit: '°C', max: 500 },
  { key: 'bearingTemperatureC', label: 'Bearing temperature', unit: '°C', max: 500 },
  { key: 'vibrationRms', label: 'Vibration velocity RMS', unit: 'mm/s', max: 1000 },
  { key: 'currentA', label: 'Measured current RMS', unit: 'A', max: 10000 },
  { key: 'ratedCurrentA', label: 'Reference / rated current', unit: 'A', max: 10000 },
  { key: 'voltageV', label: 'Measured voltage RMS', unit: 'V', max: 100000 },
  { key: 'ratedVoltageV', label: 'Reference / rated voltage', unit: 'V', max: 100000 },
  { key: 'faultEvents', label: 'Fault events in this period', unit: 'events', max: 1000000 },
] as const;
export type FieldKey = typeof fields[number]['key'];
export type Vitals = Record<FieldKey, number>;
export interface Reading extends Vitals { id: string; start: string; end: string; recordedAt: string; notes: string; generatedSample?: boolean; startOperatingHours?: number; startTotalCycles?: number }
export interface Model { name: string; source: string; degradationExpression: string; rateExpression: string; threshold: number }
export interface Intervention { id: string; name: string; cost: number; downtimeHours: number; afterDegradation: number; afterRate: number; source: string }
export interface SavedPlan { id: string; start: string; end: string; action: string; cost: number; readingId: string; modelSignature: string; source: string }
export interface Log { id: string; at: string; title: string }
export interface Elevator { id: string; project: string; name: string; location: string; readings: Reading[]; model: Model; limits: Partial<Record<FieldKey, number>>; interventions: Intervention[]; plans: SavedPlan[]; events: Log[]; usageSettings?: UsageSettings; componentInspections?:ComponentInspection[]; driveType?:'geared'|'gearless'; fieldConnected?:boolean }
export const periodDays = (r: Pick<Reading, 'start' | 'end'>) => (Date.parse(r.end) - Date.parse(r.start)) / 86400000;
export function variables(r: Reading): Record<string, number> {
  const days = periodDays(r);
  return { ...Object.fromEntries(fields.map(f => [f.key, r[f.key]])), periodDays: days, dailyCycles: r.periodCycles / days,
    currentDeviationPct: (r.currentA - r.ratedCurrentA) / r.ratedCurrentA * 100,
    voltageDeviationPct: (r.voltageV - r.ratedVoltageV) / r.ratedVoltageV * 100 };
}
export function validateReading(r: Reading) {
  if (!Number.isFinite(periodDays(r)) || periodDays(r) <= 0) throw new Error('The period end must be after its start.');
  if (Date.parse(r.end) > Date.now() + 60000) throw new Error('Readings cannot describe a future measurement period.');
  for (const f of fields) if (!Number.isFinite(r[f.key]) || r[f.key] < 0 || r[f.key] > f.max) throw new Error(`Enter a valid ${f.label.toLowerCase()}.`);
  if (!r.ratedCurrentA || !r.ratedVoltageV) throw new Error('Reference current and voltage must be greater than zero.');
  if (r.periodOperatingHours > periodDays(r) * 24 + .001) throw new Error('Operating hours exceed the measurement period.');
  if (r.periodOperatingHours > r.operatingHours || r.periodCycles > r.totalCycles) throw new Error('Period usage cannot exceed lifetime usage.');
  for (const key of ['totalCycles','periodCycles','faultEvents'] as const) if (!Number.isInteger(r[key])) throw new Error('Cycles and fault counts must be whole numbers.');
  if (r.startOperatingHours !== undefined && (!Number.isFinite(r.startOperatingHours) || r.startOperatingHours < 0)) throw new Error('Starting operating hours must be a nonnegative number.');
  if (r.startTotalCycles !== undefined && (!Number.isSafeInteger(r.startTotalCycles) || r.startTotalCycles < 0)) throw new Error('Starting cycles must be a nonnegative whole number.');
}

// Operational analysis is independent of the experimental condition/forecast model.
// Source readings are never rewritten, inferred missing intervals are never inserted.
export interface UsageSettings { stableTolerancePct: number; outlierMadMultiplier: number }
export const defaultUsageSettings: UsageSettings = { stableTolerancePct: 5, outlierMadMultiplier: 3 };
export function validUsageSettings(s: UsageSettings) {
  return !!s && Number.isFinite(s.stableTolerancePct) && s.stableTolerancePct >= 0 && s.stableTolerancePct <= 100 && Number.isFinite(s.outlierMadMultiplier) && s.outlierMadMultiplier >= 1 && s.outlierMadMultiplier <= 10;
}
export interface UsageMetrics {
  periodDays: number | null; intervalHours: number; intervalCycles: number;
  averageHoursPerDay: number | null; averageCyclesPerDay: number | null; cyclesPerHour: number | null;
  cumulativeHours: number; cumulativeCycles: number;
}
export function usageMetrics(r: Reading): UsageMetrics {
  const days = periodDays(r), valid = Number.isFinite(days) && days > 0;
  return { periodDays: valid ? days : null, intervalHours:r.periodOperatingHours, intervalCycles:r.periodCycles,
    averageHoursPerDay:valid?r.periodOperatingHours/days:null, averageCyclesPerDay:valid?r.periodCycles/days:null,
    cyclesPerHour:r.periodOperatingHours>0?r.periodCycles/r.periodOperatingHours:null,
    cumulativeHours:r.operatingHours,cumulativeCycles:r.totalCycles };
}
export interface UsageIssue { code:string; severity:'error'|'warning'|'info'; message:string }
export interface CounterComparison { field:'hours'|'cycles'; source:'entered start counter'|'previous contiguous period'; start:number; end:number; derivedInterval:number; suppliedInterval:number; difference:number }
export function measurementQuality(r:Reading, previous?:Reading) {
  const issues:UsageIssue[] = [], counters:CounterComparison[]=[];
  try { validateReading(r); } catch(err) { issues.push({code:'invalid_reading',severity:'error',message:err instanceof Error?err.message:'Invalid measurement values.'}); }
  const start=Date.parse(r.start),end=Date.parse(r.end),previousEnd=previous?Date.parse(previous.end):NaN;
  const contiguous=!!previous&&start===previousEnd;
  if(previous){
    if(start===Date.parse(previous.start)&&end===previousEnd)issues.push({code:'duplicate_period',severity:'error',message:'This measurement period duplicates the preceding record.'});
    else if(start<previousEnd)issues.push({code:'overlap',severity:'error',message:'This measurement overlaps a preceding period; usage totals must not be added together.'});
    else if(start>previousEnd)issues.push({code:'gap',severity:'warning',message:`There is an unobserved gap of ${Number(((start-previousEnd)/86400000).toFixed(3))} days before this period. No usage is assumed for the gap.`});
    if(r.operatingHours<previous.operatingHours||r.totalCycles<previous.totalCycles)issues.push({code:'counter_decrease',severity:'error',message:'A cumulative counter decreased. Check the entry or document a replacement/counter reset; the original values are retained.'});
    if(r.motorAgeYears<previous.motorAgeYears)issues.push({code:'age_decrease',severity:'warning',message:'Motor age decreased relative to the preceding record.'});
  }
  const definitions=[{field:'hours' as const,start:r.startOperatingHours,end:r.operatingHours,supplied:r.periodOperatingHours,prior:previous?.operatingHours,tolerance:.001},{field:'cycles' as const,start:r.startTotalCycles,end:r.totalCycles,supplied:r.periodCycles,prior:previous?.totalCycles,tolerance:0}];
  for(const d of definitions){
    const initial=d.start??(contiguous?d.prior:undefined);
    if(initial===undefined){issues.push({code:`${d.field}_start_unknown`,severity:'info',message:`No starting ${d.field} counter is available for reconciliation. Supplied period ${d.field} are retained.`});continue;}
    const delta=d.end-initial,difference=delta-d.supplied;
    counters.push({field:d.field,source:d.start===undefined?'previous contiguous period':'entered start counter',start:initial,end:d.end,derivedInterval:delta,suppliedInterval:d.supplied,difference});
    if(delta<0)issues.push({code:`${d.field}_negative_delta`,severity:'warning',message:`The ending ${d.field} counter is below its entered starting value.`});
    if(Math.abs(difference)>d.tolerance)issues.push({code:`${d.field}_mismatch`,severity:'warning',message:`${d.field==='hours'?'Operating hours':'Cycles'} from counter difference (${Number(delta.toFixed(4))}) do not match supplied period usage (${d.supplied}). Neither value has been changed.`});
    if(contiguous&&d.start!==undefined&&Math.abs(d.start-d.prior!)>d.tolerance)issues.push({code:`${d.field}_boundary_mismatch`,severity:'warning',message:`Entered starting ${d.field} do not match the preceding contiguous period's ending counter.`});
  }
  if(r.periodCycles>0&&r.periodOperatingHours===0)issues.push({code:'cycles_without_hours',severity:'warning',message:'Cycles are recorded with zero operating hours. Cycles per operating hour cannot be calculated.'});
  if(r.generatedSample)issues.push({code:'generated_sample',severity:'info',message:'Generated sample: excluded from measured operational trend classification.'});
  return {issues,counters};
}
export type UsageTrendLabel='Insufficient history'|'Increasing'|'Decreasing'|'Relatively stable'|'Irregular'|'Anomalous usage';
const median=(xs:number[])=>{const a=[...xs].sort((a,b)=>a-b),mid=Math.floor(a.length/2);return a.length%2?a[mid]:(a[mid-1]+a[mid])/2;};
function classifyUsage(values:number[],settings:UsageSettings):{label:UsageTrendLabel;growthPct:number|null;outlierEvaluated:boolean;reason:string}{
  if(values.length<2)return {label:'Insufficient history',growthPct:null,outlierEvaluated:false,reason:'At least two consecutive, non-sample periods without quality warnings are needed.'};
  const current=values.at(-1)!,prior=values.at(-2)!,growthPct=prior===0?null:(current-prior)/prior*100;
  const baseline=values.slice(0,-1),center=median(baseline),mad=median(baseline.map(v=>Math.abs(v-center)));
  const outlierEvaluated=baseline.length>=5&&mad>0;
  if(outlierEvaluated&&Math.abs(current-center)>settings.outlierMadMultiplier*mad&&Math.abs(current-center)>Math.abs(center)*settings.stableTolerancePct/100)
    return {label:'Anomalous usage',growthPct,outlierEvaluated,reason:`Latest rate differs from the previous ${baseline.length} periods' median by more than ${settings.outlierMadMultiplier} × median absolute deviation and the ${settings.stableTolerancePct}% stability tolerance. This is a statistical usage flag, not a fault.`};
  const directions=values.slice(1).map((v,i)=>{const old=values[i];return Math.abs(v-old)<=Math.abs(old)*settings.stableTolerancePct/100?0:v>old?1:-1;});
  const up=directions.includes(1),down=directions.includes(-1);
  const label:UsageTrendLabel=up&&down?'Irregular':up?'Increasing':down?'Decreasing':'Relatively stable';
  return {label,growthPct,outlierEvaluated,reason:`Adjacent normalized rates use a ${settings.stableTolerancePct}% stability tolerance.${outlierEvaluated?' Outlier screen did not flag the latest rate.':' Outlier screen needs five prior periods with nonzero median absolute deviation.'}`};
}
export function usageHistory(readings:Reading[],settings:UsageSettings=defaultUsageSettings){
  if(!validUsageSettings(settings))throw new Error('Usage settings require a 0–100% stability tolerance and a 1–10 outlier multiplier.');
  const ordered=[...readings].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)||Date.parse(a.end)-Date.parse(b.end));
  let preceding:Reading|undefined;
  const rows=ordered.map(r=>{const quality=measurementQuality(r,preceding);if(!preceding||Date.parse(r.end)>Date.parse(preceding.end))preceding=r;return {reading:r,metrics:usageMetrics(r),...quality};});
  let segment:typeof rows=[];
  for(const row of rows){if(row.reading.generatedSample||row.issues.some(i=>i.severity!=='info'))segment=[];else segment.push(row);}
  const recent=segment.slice(-12);
  return {rows,comparablePeriods:recent.length,
    hoursTrend:classifyUsage(recent.map(r=>r.metrics.averageHoursPerDay!),settings),
    cyclesTrend:classifyUsage(recent.map(r=>r.metrics.averageCyclesPerDay!),settings),
    issueCount:rows.reduce((n,r)=>n+r.issues.filter(i=>i.severity!=='info').length,0),
    generatedPeriods:rows.filter(r=>r.reading.generatedSample).length,
  };
}
// An openly experimental condition index replaces the old assigned degradation of .37.
// Its reference scales are assumptions, not OEM limits or claimed industry standards.
export const experimentalModel: Model = {
  name:'Experimental motor model v3',
  source:'Unvalidated demonstration model. Condition weights and reference scales are assumptions; daily wear adapts the original demo stress equation. Not an OEM or industry-standard life model.',
  degradationExpression:'clamp(0.15*clamp(motorAgeYears/20,0,1) + 0.1*clamp(operatingHours/60000,0,1) + 0.1*clamp(totalCycles/3000000,0,1) + 0.1*clamp(max(0,windingTemperatureC-65)/65,0,1) + 0.1*clamp(max(0,bearingTemperatureC-55)/55,0,1) + 0.2*clamp(vibrationRms/12,0,1) + 0.1*clamp(abs(currentDeviationPct)/50,0,1) + 0.1*clamp(abs(voltageDeviationPct)/20,0,1) + 0.05*clamp(faultEvents/periodDays,0,1),0,1)',
  rateExpression:'0.0216/30 * (dailyCycles/420)^0.95 * (averageLoadPct/55)^0.35 * (1+max(0,windingTemperatureC-65)/50)^0.45 * (1+max(0,bearingTemperatureC-55)/50)^0.25 * (1+max(0,vibrationRms-3.5)/10)^0.55 * (1+max(0,currentDeviationPct)/100)^0.25 * (1+abs(voltageDeviationPct)/100)^0.25',
  threshold:0.55,
};
// Arithmetic parser only: no JavaScript evaluation, property access or executable code.
export function expression(source: string, vars: Record<string, number>): number {
  if (!source.trim() || source.length > 1000) throw new Error('Enter a formula of 1–1,000 characters.');
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|[()+\-*/^,]|\S/g) ?? [];
  let i = 0, depth = 0;
  function atom(): number {
    if (++depth > 40) throw new Error('Formula is too deeply nested.');
    const token = tokens[i++]; let value: number;
    if (token === '(') { value = sum(); if (tokens[i++] !== ')') throw new Error('Missing closing parenthesis.'); }
    else if (/^(?:\d|\.)/.test(token ?? '')) { value = Number(token); }
    else if (/^[A-Za-z_][A-Za-z_0-9]*$/.test(token ?? '')) {
      if (tokens[i] === '(') {
        i++; const args = [sum()]; while (tokens[i] === ',') { i++; args.push(sum()); }
        if (tokens[i++] !== ')') throw new Error('Missing function parenthesis.');
        const funcs: Record<string, { min: number; max: number; fn: (...a: number[]) => number }> = {
          min: {min:2,max:20,fn:Math.min}, max:{min:2,max:20,fn:Math.max}, abs:{min:1,max:1,fn:Math.abs},
          sqrt:{min:1,max:1,fn:Math.sqrt}, exp:{min:1,max:1,fn:Math.exp}, log:{min:1,max:1,fn:Math.log},
          clamp:{min:3,max:3,fn:(a,b,c)=>Math.min(c,Math.max(b,a))},
        };
        const f = funcs[token]; if (!f || args.length < f.min || args.length > f.max) throw new Error(`Invalid function or arguments: ${token}.`);
        value = f.fn(...args);
      } else { if (!Object.hasOwn(vars, token)) throw new Error(`Unknown variable: ${token}.`); value = vars[token]; }
    } else throw new Error(`Unexpected token: ${token ?? 'end of formula'}.`);
    depth--; return value;
  }
  function power(): number { const left = atom(); if (tokens[i] === '^') { i++; return left ** unary(); } return left; }
  function unary(): number { if (tokens[i] === '+') { i++; return unary(); } if (tokens[i] === '-') { i++; return -unary(); } return power(); }
  function product(): number { let v = unary(); while (tokens[i] === '*' || tokens[i] === '/') { const op = tokens[i++]; const right = unary(); v = op === '*' ? v * right : v / right; } return v; }
  function sum(): number { let v = product(); while (tokens[i] === '+' || tokens[i] === '-') { const op = tokens[i++]; const right = product(); v = op === '+' ? v + right : v - right; } return v; }
  const result = sum();
  if (i !== tokens.length || !Number.isFinite(result)) throw new Error('Formula must produce a finite number using supported arithmetic.');
  return result;
}
export function evaluate(r: Reading, m: Model) {
  const v = variables(r), degradation = expression(m.degradationExpression, v), rate = expression(m.rateExpression, {...v, degradation});
  if (degradation < 0 || degradation > 1) throw new Error('Degradation formula must return a value from 0 to 1.');
  if (rate < 0) throw new Error('Daily degradation rate cannot be negative.');
  if (!(m.threshold > 0 && m.threshold <= 1)) throw new Error('Threshold must be greater than 0 and at most 1.');
  return { degradation, rate, health: (1 - degradation) * 100, days: degradation >= m.threshold ? 0 : rate > 0 ? (m.threshold - degradation) / rate : null };
}
export function safeEvaluation(r: Reading | undefined, m: Model) {
  try { return { result: r ? evaluate(r, m) : null, error: '' }; } catch(e) { return { result:null, error: e instanceof Error ? e.message : 'Invalid formula' }; }
}
export function latest(e: Elevator) { return [...e.readings].sort((a,b)=>Date.parse(b.end)-Date.parse(a.end))[0]; }
export function snapshotSignature(e: Elevator) { return JSON.stringify([latest(e)?.id,e.model]); }
export function targetSearch(e: Elevator, targetDays: number, budget: number, maxHours: number) {
  const base = evaluate(latest(e),e.model);
  const options = [{id:'none',name:'No intervention',cost:0,downtimeHours:0,afterDegradation:base.degradation,afterRate:base.rate,source:'Current entered readings'},...e.interventions];
  return options.map(o=>({...o,days:o.afterDegradation>=e.model.threshold?0:o.afterRate>0?(e.model.threshold-o.afterDegradation)/o.afterRate:Infinity}))
    .filter(o=>o.cost<=budget&&o.downtimeHours<=maxHours&&o.days>=targetDays).sort((a,b)=>a.cost-b.cost||a.downtimeHours-b.downtimeHours);
}
export interface WindowInput { earliest:string; deadline:string; weekdays:number[]; startHour:number; endHour:number; budget:number }
export function serviceWindows(e:Elevator,option:Intervention,input:WindowInput,now=Date.now()) {
  const start=new Date(`${input.earliest}T00:00:00`).getTime(),end=new Date(`${input.deadline}T23:59:59`).getTime();
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>91*86400000)throw new Error('Choose an ordered date range of at most 90 days.');
  if(!input.weekdays.length)throw new Error('Select at least one available weekday.');
  if(input.startHour<0||input.endHour>24||input.startHour>=input.endHour)throw new Error('Working-hour end must be later than start (0–24).');
  if(option.cost>input.budget)throw new Error('This option exceeds the entered budget.');
  const r=latest(e),m=evaluate(r,e.model),thresholdAt=m.days===null?Infinity:Date.parse(r.end)+m.days*86400000;
  const windows:{start:string;end:string}[]=[];
  const seen=new Set<string>();
  for(let t=Math.ceil(Math.max(start,now)/3600000)*3600000;t+option.downtimeHours*3600000<=end;t+=3600000){
    const finish=t+option.downtimeHours*3600000;
    if(finish>=thresholdAt)continue;
    let fits=true;
    for(let check=t;check<finish;check+=15*60000){const d=new Date(check);const hour=d.getHours()+d.getMinutes()/60;if(!input.weekdays.includes(d.getDay())||hour<input.startHour||hour>=input.endHour){fits=false;break;}}
    const day=new Date(t).toLocaleDateString('en-CA');
    if(fits&&!seen.has(day)){seen.add(day);windows.push({start:new Date(t).toISOString(),end:new Date(finish).toISOString()});if(windows.length===5)break;}
  }
  return windows;
}
export function replay(e:Elevator,o:Intervention,delay:number,horizon:number){
  const m=evaluate(latest(e),e.model),downtime=o.downtimeHours/24;
  const times=Array.from({length:61},(_,i)=>i*horizon/60);
  if(delay<=horizon)times.push(Math.max(0,delay-.001),delay,Math.min(horizon,delay+downtime));
  return {late:m.days!==null&&delay>=m.days, data:[...new Set(times)].sort((a,b)=>a-b).map(day=>({
    month:`${numDay(day)} d`,without:Math.max(0,(1-m.degradation-m.rate*day)*100),
    with:Math.max(0,(1-(day<delay?m.degradation+m.rate*day:o.afterDegradation+o.afterRate*Math.max(0,day-delay-downtime)))*100),
  }))};
}
const numDay=(n:number)=>Math.round(n*100)/100;
