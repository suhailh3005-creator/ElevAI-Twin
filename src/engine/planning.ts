import type { Action, Scenario, TwinState } from '../types';
import { clamp, health, project, rate, rul, THRESHOLD } from './degradation';
import { intervene } from './interventions';
import { options } from './optimizer';

export interface TargetConstraints {
  targetMonths: number;
  budget: number;
  maxDowntimeHours: number;
  maxTrafficReductionPct: number;
  maxLoadReductionPct: number;
  maxCoolingDeltaC: number;
  allowedActions: Action[];
}
export const defaultTarget: TargetConstraints = { targetMonths: 9, budget: 50000, maxDowntimeHours: 8, maxTrafficReductionPct: 30, maxLoadReductionPct: 20, maxCoolingDeltaC: 10, allowedActions: ['Repair', 'Replace', 'Modernize'] };
export interface TargetCandidate {
  action: Action | 'None'; scenario: Scenario; rulMonths: number; cost: number; downtimeHours: number; burden: number; endHealth: number;
}
const between = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export const validAction = (v: unknown): v is Action => options.some(o => o.name === v);
export function validTarget(v: unknown): v is TargetConstraints {
  if (!v || typeof v !== 'object') return false;
  const c = v as TargetConstraints;
  return between(c.targetMonths, 1, 60) && between(c.budget, 0, 1000000) && between(c.maxDowntimeHours, 0, 168)
    && between(c.maxTrafficReductionPct, 0, 30) && between(c.maxLoadReductionPct, 0, 20) && between(c.maxCoolingDeltaC, 0, 10)
    && Array.isArray(c.allowedActions) && c.allowedActions.length <= 3 && c.allowedActions.every(validAction) && new Set(c.allowedActions).size === c.allowedActions.length;
}
const steps = (max: number, step = 5) => Array.from(new Set([...Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step), max]));
export function findTargetPlan(twin: TwinState, c: TargetConstraints) {
  if (!validTarget(c)) return { searched: 0, feasibleCount: 0, recommendation: null, candidates: [] as TargetCandidate[], reason: 'Enter valid constraints before searching.' };
  const candidates: TargetCandidate[] = [];
  let searched = 0;
  const actions: (Action | 'None')[] = ['None', ...c.allowedActions];
  for (const action of actions) {
    const option = options.find(o => o.name === action);
    const cost = option?.cost ?? 0, downtimeHours = option?.downtime ?? 0;
    if (cost > c.budget || downtimeHours > c.maxDowntimeHours) continue;
    const after = action === 'None' ? twin : intervene(twin, action);
    for (const traffic of steps(c.maxTrafficReductionPct)) for (const load of steps(c.maxLoadReductionPct)) for (const cooling of steps(c.maxCoolingDeltaC)) {
      const scenario: Scenario = { trafficChangePct: -traffic, loadChangePct: -load, ambientTemperatureDelta: -cooling, horizon: [3, 6, 12].find(h => h >= c.targetMonths) ?? 12 };
      const projected = project(after, scenario), rulMonths = rul(projected);
      searched++;
      if (rulMonths + 1e-9 >= c.targetMonths) candidates.push({ action, scenario, rulMonths, cost, downtimeHours, burden: traffic / 30 + load / 20 + cooling / 10, endHealth: health(projected.degradation + rate(projected) * c.targetMonths) });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost || a.burden - b.burden || b.rulMonths - a.rulMonths);
  return { searched, feasibleCount: candidates.length, recommendation: candidates[0] ?? null, candidates: candidates.slice(0, 3), reason: candidates.length ? '' : 'No searched combination reaches the target within your budget, downtime, action, and operating limits.' };
}

export function replayIntervention(twin: TwinState, scenario: Scenario, action: Action, delayMonths: number, horizon: number) {
  const delay = clamp(delayMonths, 0, 24), length = clamp(horizon, 1, 36);
  const before = project(twin, scenario), controlCrossing = rul(before);
  const option = options.find(o => o.name === action)!;
  const downtimeMonths = option.downtime / (30 * 24);
  const atIntervention = { ...twin, degradation: clamp(twin.degradation + rate(before) * delay, 0, 1) };
  const after = project(intervene(atIntervention, action), scenario);
  const interventionCrossing = controlCrossing <= delay ? controlCrossing : delay + downtimeMonths + rul(after);
  const times = Array.from({ length: Math.ceil(length * 4) + 1 }, (_, i) => Math.min(length, i / 4));
  if (delay > 0 && delay <= length) times.push(Math.max(0, delay - .0001), delay, Math.min(length, delay + downtimeMonths));
  const data = [...new Set(times)].sort((a, b) => a - b).map(month => ({
    month: Number(month.toFixed(4)),
    without: health(before.degradation + rate(before) * month),
    with: month < delay ? health(before.degradation + rate(before) * month) : health(after.degradation + rate(after) * Math.max(0, month - delay - downtimeMonths)),
  }));
  return { data, controlCrossing, interventionCrossing, reachesThresholdBeforeIntervention: controlCrossing <= delay, actionInHorizon: delay <= length, cost: delay <= length ? option.cost : 0, downtimeHours: delay <= length ? option.downtime : 0, after };
}

export interface ScheduleInput {
  earliestDate: string; deadlineDate: string; action: Action; budget: number; weekdays: number[]; hours: 'quiet' | 'business' | 'any';
}
export interface MaintenanceWindow {
  start: string; end: string; action: Action; cost: number; downtimeHours: number; disruptedTrips: number; delayDays: number;
}
export function localDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) && localDate(date) === value ? date : null;
}
export function validSchedule(v: unknown): v is ScheduleInput {
  if (!v || typeof v !== 'object') return false;
  const s = v as ScheduleInput;
  return typeof s.earliestDate === 'string' && !!parseDate(s.earliestDate) && typeof s.deadlineDate === 'string' && !!parseDate(s.deadlineDate)
    && validAction(s.action) && between(s.budget, 0, 1000000) && Array.isArray(s.weekdays) && s.weekdays.length <= 7 && s.weekdays.every(d => Number.isInteger(d) && between(d, 0, 6)) && new Set(s.weekdays).size === s.weekdays.length && ['quiet', 'business', 'any'].includes(s.hours);
}
export function defaultSchedule(): ScheduleInput {
  const start = new Date(), end = new Date(); end.setDate(end.getDate() + 14);
  return { earliestDate: localDate(start), deadlineDate: localDate(end), action: 'Repair', budget: 50000, weekdays: [1, 2, 3, 4, 5], hours: 'quiet' };
}
export const hourlyTraffic = [.10, .07, .06, .06, .09, .18, .45, 1.25, 2, 1.8, 1.1, 1.15, 1.5, 1.25, 1, 1, 1.25, 1.8, 1.6, 1.1, .75, .5, .3, .18];
export function findMaintenanceWindows(twin: TwinState, scenario: Scenario, input: ScheduleInput, now = new Date()) {
  const empty = (reason: string) => ({ windows: [] as MaintenanceWindow[], evaluated: 0, reason, thresholdAt: null as string | null });
  if (!validSchedule(input) || !Number.isFinite(now.getTime())) return empty('Enter valid dates, costs, and availability.');
  const earliest = parseDate(input.earliestDate)!, deadline = parseDate(input.deadlineDate)!;
  deadline.setDate(deadline.getDate() + 1);
  if (deadline <= earliest) return empty('The deadline must be on or after the earliest date.');
  if (deadline.getTime() - earliest.getTime() > 91 * 86400000) return empty('Choose a scheduling range of 90 days or less.');
  const option = options.find(o => o.name === input.action)!;
  if (option.cost > input.budget) return empty(`${input.action} exceeds the configured budget.`);
  if (!input.weekdays.length) return empty('Select at least one available technician weekday.');
  const projected = project(twin, scenario);
  const thresholdTime = now.getTime() + rul(projected) * 30 * 86400000;
  const thresholdAt = new Date(thresholdTime).toISOString();
  if (twin.degradation >= THRESHOLD) return { ...empty('The current twin has already reached the model threshold. No future operating window is proposed.'), thresholdAt };
  const minimumStart = Math.max(now.getTime(), earliest.getTime());
  const firstDate = new Date(minimumStart);
  firstDate.setMinutes(0, 0, 0);
  if (firstDate.getTime() < minimumStart) firstDate.setTime(firstDate.getTime() + 3600000);
  const first = firstDate.getTime();
  const totalWeight = hourlyTraffic.reduce((a, b) => a + b, 0);
  let evaluated = 0;
  const windows: MaintenanceWindow[] = [];
  for (let start = first; start + option.downtime * 3600000 <= deadline.getTime(); start += 3600000) {
    evaluated++;
    const end = start + option.downtime * 3600000;
    if (end >= thresholdTime) continue;
    let fits = true, disruptedTrips = 0;
    for (let h = 0; h < option.downtime; h++) {
      const d = new Date(start + h * 3600000), hour = d.getHours(), weekday = d.getDay();
      const allowedHour = input.hours === 'any' || (input.hours === 'quiet' ? hour < 7 || hour >= 19 : hour >= 8 && hour < 18);
      if (!input.weekdays.includes(weekday) || !allowedHour) { fits = false; break; }
      disruptedTrips += projected.dailyCycles * hourlyTraffic[hour] / totalWeight * ([0, 6].includes(weekday) ? .55 : 1);
    }
    if (fits) windows.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), action: input.action, cost: option.cost, downtimeHours: option.downtime, disruptedTrips: Math.round(disruptedTrips), delayDays: (start - now.getTime()) / 86400000 });
  }
  windows.sort((a, b) => a.disruptedTrips - b.disruptedTrips || a.delayDays - b.delayDays);
  const dates = new Set<string>();
  const distinct = windows.filter(w => { const day = localDate(new Date(w.start)); if (dates.has(day)) return false; dates.add(day); return true; }).slice(0, 5);
  return { windows: distinct, evaluated, thresholdAt, reason: distinct.length ? '' : 'No continuous window fits the technician days, allowed hours, deadline, and model threshold. Try broader availability or an earlier date.' };
}
