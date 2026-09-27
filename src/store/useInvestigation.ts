import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { TwinState } from '../types';
import { seedTwin } from '../data/seed';
import { faultKinds, makeTrace, simulateInspection, type FaultKind, type InspectionId, type Observation, type TelemetryPoint } from '../engine/investigation';

export interface InvestigationRun { baseline: TwinState; kind: FaultKind; severity: number; seed: number; trace: TelemetryPoint[]; frame: number; observations: Observation[]; publishedRevision: number | null }
interface InvestigationStore {
  kind: FaultKind; severity: number; run: InvestigationRun | null; playing: boolean;
  configure: (kind: FaultKind, severity: number) => void;
  start: (baseline: TwinState) => void;
  step: () => void;
  setPlaying: (playing: boolean) => void;
  complete: () => void;
  inspect: (id: InspectionId) => void;
  markPublished: (revision: number) => void;
  reset: () => void;
}
const initial = { kind: 'cooling' as FaultKind, severity: 70, run: null as InvestigationRun | null, playing: false };
const safeStorage: StateStorage = {
  getItem: name => { try { const raw = localStorage.getItem(name); if (raw) JSON.parse(raw); return raw; } catch { return null; } },
  setItem: (name, value) => { try { localStorage.setItem(name, value); } catch { /* Session state still works. */ } },
  removeItem: name => { try { localStorage.removeItem(name); } catch { /* Storage can be unavailable. */ } },
};
function validRun(value: unknown): value is InvestigationRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as InvestigationRun;
  return !!run.baseline && Object.entries(seedTwin()).every(([key, value]) => typeof value === 'number' ? Number.isFinite(run.baseline[key as keyof TwinState]) : typeof run.baseline[key as keyof TwinState] === 'string') && faultKinds.includes(run.kind) && run.severity >= 20 && run.severity <= 100 && Number.isFinite(run.seed) && Number.isInteger(run.frame) && run.frame >= 0 && run.frame <= 24 && Array.isArray(run.trace) && run.trace.length === 25 && run.trace.every((point, index) => point && point.minute === index && ['temperatureC', 'vibrationRms', 'currentA', 'averageLoadPct'].every(key => Number.isFinite(point[key as keyof TelemetryPoint]))) && Array.isArray(run.observations) && run.observations.every(item => item && ['airflow','envelope','load'].includes(item.inspectionId) && typeof item.positive === 'boolean' && Number.isFinite(item.minute)) && new Set(run.observations.map(item => item.inspectionId)).size === run.observations.length && (run.publishedRevision === null || Number.isFinite(run.publishedRevision));
}
export const useInvestigation = create<InvestigationStore>()(persist((set, get) => ({
  ...initial,
  configure: (kind, severity) => set({ kind, severity }),
  start: baseline => { const { kind, severity, run } = get(); const seed = (run?.seed ?? 204) + 1; set({ run: { baseline: { ...baseline }, kind, severity, seed, trace: makeTrace(baseline, kind, severity, seed), frame: 0, observations: [], publishedRevision: null }, playing: true }); },
  step: () => set(state => { if (!state.run || state.run.frame >= 24) return { playing: false }; const frame = state.run.frame + 1; return { run: { ...state.run, frame }, playing: frame < 24 && state.playing }; }),
  setPlaying: playing => set({ playing: playing && !!get().run && get().run!.frame < 24 }),
  complete: () => set(state => ({ playing: false, run: state.run ? { ...state.run, frame: 24 } : null })),
  inspect: id => set(state => { if (!state.run || state.run.frame < 6 || state.run.publishedRevision || state.run.observations.some(item => item.inspectionId === id)) return {}; return { run: { ...state.run, observations: [...state.run.observations, simulateInspection(state.run.kind, id, state.run.seed, state.run.frame)] } }; }),
  markPublished: revision => set(state => ({ playing: false, run: state.run ? { ...state.run, publishedRevision: revision } : null })),
  reset: () => set({ ...initial }),
}), { name: 'elevai-investigation:v1', storage: createJSONStorage(() => safeStorage), partialize: state => ({ kind: state.kind, severity: state.severity, run: state.run, playing: false }), merge: (persisted, current) => { const saved = persisted as Partial<InvestigationStore> | undefined; return { ...current, kind: saved?.kind && faultKinds.includes(saved.kind) ? saved.kind : initial.kind, severity: typeof saved?.severity === 'number' && saved.severity >= 20 && saved.severity <= 100 ? saved.severity : initial.severity, run: validRun(saved?.run) ? saved.run : null, playing: false }; } }));
if (typeof window !== 'undefined') window.addEventListener('elevai-reset', () => useInvestigation.getState().reset());
