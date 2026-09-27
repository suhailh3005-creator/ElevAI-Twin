import type { Scenario, TwinState } from '../types';
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const THRESHOLD = .55;
export const health = (d: number) => clamp((1 - d) * 100, 0, 100);
export function project(t: TwinState, s: Scenario): TwinState { return { ...t, dailyCycles: Math.max(1, t.dailyCycles * (1 + s.trafficChangePct / 100)), averageLoadPct: clamp(t.averageLoadPct + s.loadChangePct, 20, 100), temperatureC: Math.max(0, t.temperatureC + .07 * s.trafficChangePct + .1 * s.loadChangePct + s.ambientTemperatureDelta), vibrationRms: Math.max(0, t.vibrationRms * (1 + .003 * s.trafficChangePct + .0015 * s.loadChangePct)), currentA: Math.max(0, t.currentA * (1 + .0025 * s.trafficChangePct + .002 * s.loadChangePct)) }; }
export function stress(t: TwinState) { return (t.dailyCycles / 420) ** .95 * (t.averageLoadPct / 55) ** .35 * (1 + Math.max(0, t.temperatureC - 65) / 50) ** .45 * (1 + Math.max(0, t.vibrationRms - 3.5) / 10) ** .55 * (1 + Math.max(0, t.currentA - 18) / 20) ** .25; }
export const rate = (t: TwinState) => .0216 * stress(t);
export const rul = (t: TwinState) => clamp((THRESHOLD - t.degradation) / rate(t), 0, 120);

