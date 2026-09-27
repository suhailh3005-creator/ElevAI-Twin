import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { defaultSchedule, defaultTarget, validAction, validSchedule, validTarget, type MaintenanceWindow, type ScheduleInput, type TargetConstraints } from '../engine/planning';
import type { Action, Scenario } from '../types';

interface ReplayInput { action: Action; delayMonths: number; horizon: number }
interface SavedWindow extends MaintenanceWindow { id: string; savedAt: string; revision: number; scenario: Scenario }
const initial = () => ({ constraints: { ...defaultTarget, allowedActions: [...defaultTarget.allowedActions] }, replay: { action: 'Repair' as Action, delayMonths: 1, horizon: 12 }, schedule: defaultSchedule(), savedWindows: [] as SavedWindow[] });
interface Store extends ReturnType<typeof initial> {
  setConstraints: (constraints: TargetConstraints) => void;
  setReplay: (replay: ReplayInput) => void;
  setSchedule: (schedule: ScheduleInput) => void;
  saveWindow: (window: MaintenanceWindow, revision: number, scenario: Scenario) => void;
  deleteWindow: (id: string) => void;
  reset: () => void;
}
export function validPlanningState(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const s = value as ReturnType<typeof initial>;
  return validTarget(s.constraints) && validSchedule(s.schedule) && !!s.replay && validAction(s.replay.action)
    && Number.isFinite(s.replay.delayMonths) && s.replay.delayMonths >= 0 && s.replay.delayMonths <= 24
    && Number.isFinite(s.replay.horizon) && s.replay.horizon >= 1 && s.replay.horizon <= 36
    && Array.isArray(s.savedWindows) && s.savedWindows.length <= 50 && s.savedWindows.every(w => typeof w.id === 'string' && Number.isFinite(Date.parse(w.start)) && Number.isFinite(Date.parse(w.end)) && Number.isFinite(Date.parse(w.savedAt)) && Number.isInteger(w.revision) && validAction(w.action) && Number.isFinite(w.cost) && w.cost >= 0 && Number.isFinite(w.downtimeHours) && w.downtimeHours > 0 && Number.isFinite(w.disruptedTrips) && w.disruptedTrips >= 0 && Number.isFinite(w.delayDays) && !!w.scenario && ['trafficChangePct', 'loadChangePct', 'ambientTemperatureDelta', 'horizon'].every(k => Number.isFinite(w.scenario[k as keyof Scenario])));
}
let storageIssue = '';
const storage: StateStorage = {
  getItem: key => { try { const raw = localStorage.getItem(key); if (!raw) return null; if (!validPlanningState(JSON.parse(raw).state)) throw new Error('Invalid state'); return raw; } catch { storageIssue = 'Planning data could not be restored. Default inputs are loaded.'; return null; } },
  setItem: (key, value) => { try { localStorage.setItem(key, value); } catch { storageIssue = 'Planning storage is unavailable. Changes are kept for this session.'; } },
  removeItem: key => { try { localStorage.removeItem(key); } catch { /* unavailable storage */ } },
};
export const getPlanningStorageIssue = () => storageIssue;
export const usePlanning = create<Store>()(persist(set => ({
  ...initial(),
  setConstraints: constraints => set({ constraints }), setReplay: replay => set({ replay }), setSchedule: schedule => set({ schedule }),
  saveWindow: (window, revision, scenario) => set(s => ({ savedWindows: [{ ...window, revision, scenario: { ...scenario }, id: crypto.randomUUID(), savedAt: new Date().toISOString() }, ...s.savedWindows].slice(0, 50) })),
  deleteWindow: id => set(s => ({ savedWindows: s.savedWindows.filter(w => w.id !== id) })),
  reset: () => { storageIssue = ''; set(initial()); },
}), { name: 'elevai-planning:v1', storage: createJSONStorage(() => storage) }));
if (typeof window !== 'undefined') window.addEventListener('elevai-reset', () => { usePlanning.getState().reset(); try { sessionStorage.removeItem('elevai-planning-proposal:v1'); } catch { /* unavailable storage */ } });
