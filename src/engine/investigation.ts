import type { TwinState } from '../types';
import { clamp } from './degradation';
import { mulberry32 } from './uncertainty';

export const faultKinds = ['normal', 'cooling', 'bearing', 'overload'] as const;
export type FaultKind = typeof faultKinds[number];
export type Features = [number, number, number, number];
export type Scores = Record<FaultKind, number>;
export const faultLabels: Record<FaultKind, string> = { normal: 'Baseline variation', cooling: 'Cooling restriction', bearing: 'Bearing wear', overload: 'Sustained overload' };
export const faultDescriptions: Record<FaultKind, string> = {
  normal: 'A control run with small sensor variation.',
  cooling: 'Restricted airflow causes a thermal rise, with little change in demand.',
  bearing: 'Mechanical wear raises vibration and adds thermal and current stress.',
  overload: 'Higher demand raises load, current, and temperature together.',
};
// Features are changes from THIS twin's baseline: °C / 15, mm/s / 3, A / 4, load percentage points / 25.
const signatures: Record<FaultKind, Features> = { normal: [0, 0, 0, 0], cooling: [1, .16, .22, .04], bearing: [.52, 1, .38, .03], overload: [.62, .25, 1, 1] };
const noiseScale: Features = [.15, .14, .16, .12];
function gaussian(random: () => number) { return Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random()); }
function sample(kind: FaultKind, random: () => number): Features {
  const severity = .28 + random() * .92;
  return signatures[kind].map((value, i) => value * severity + gaussian(random) * noiseScale[i]) as Features;
}
interface ClassStats { mean: Features; variance: Features }
function train(seed: number, perClass: number): Record<FaultKind, ClassStats> {
  const random = mulberry32(seed);
  return Object.fromEntries(faultKinds.map(kind => {
    const samples = Array.from({ length: perClass }, () => sample(kind, random));
    const mean = [0, 1, 2, 3].map(i => samples.reduce((sum, row) => sum + row[i], 0) / samples.length) as Features;
    const variance = mean.map((value, i) => Math.max(.008, samples.reduce((sum, row) => sum + (row[i] - value) ** 2, 0) / samples.length)) as Features;
    return [kind, { mean, variance }];
  })) as Record<FaultKind, ClassStats>;
}
const model = train(81204, 320);
export function classify(features: Features): Scores {
  if (!features.every(Number.isFinite)) return { normal: .25, cooling: .25, bearing: .25, overload: .25 };
  const logScores = faultKinds.map(kind => features.reduce((sum, value, i) => {
    const { mean, variance } = model[kind];
    return sum - .5 * (Math.log(2 * Math.PI * variance[i]) + (value - mean[i]) ** 2 / variance[i]);
  }, Math.log(.25)));
  const max = Math.max(...logScores);
  const exp = logScores.map(score => Math.exp(score - max));
  const total = exp.reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(faultKinds.map((kind, i) => [kind, exp[i] / total])) as Scores;
}
export function ranked(scores: Scores) { return faultKinds.map(kind => ({ kind, probability: scores[kind] })).sort((a, b) => b.probability - a.probability); }
function evaluate() {
  const random = mulberry32(91597);
  const perClass = 120;
  const rows = faultKinds.map(kind => {
    let correct = 0;
    const confusion = Object.fromEntries(faultKinds.map(k => [k, 0])) as Scores;
    for (let index = 0; index < perClass; index++) {
      const predicted = ranked(classify(sample(kind, random)))[0].kind;
      confusion[predicted]++;
      if (predicted === kind) correct++;
    }
    return { kind, correct, total: perClass, confusion };
  });
  return { accuracy: rows.reduce((sum, row) => sum + row.correct, 0) / (perClass * faultKinds.length), trainSamples: 1280, testSamples: 480, rows };
}
export const modelEvaluation = evaluate();

export interface TelemetryPoint { minute: number; temperatureC: number; vibrationRms: number; currentA: number; averageLoadPct: number }
export function makeTrace(baseline: TwinState, kind: FaultKind, severity: number, seed: number): TelemetryPoint[] {
  const random = mulberry32(seed);
  const amount = clamp(severity, 20, 100) / 100;
  return Array.from({ length: 25 }, (_, minute) => {
    const ramp = Math.min(1, Math.max(0, (minute - 3) / 17));
    const feature = signatures[kind].map((value, i) => value * amount * ramp + gaussian(random) * noiseScale[i] * .24) as Features;
    return { minute, temperatureC: Math.max(0, baseline.temperatureC + feature[0] * 15), vibrationRms: Math.max(.1, baseline.vibrationRms + feature[1] * 3), currentA: Math.max(.1, baseline.currentA + feature[2] * 4), averageLoadPct: clamp(baseline.averageLoadPct + feature[3] * 25, 1, 100) };
  });
}
export function traceFeatures(baseline: TwinState, trace: TelemetryPoint[], frame: number): Features {
  const last = trace.slice(Math.max(0, frame - 3), frame + 1);
  if (!last.length) return [0, 0, 0, 0];
  const mean = (key: keyof TelemetryPoint) => last.reduce((sum, point) => sum + point[key], 0) / last.length;
  return [(mean('temperatureC') - baseline.temperatureC) / 15, (mean('vibrationRms') - baseline.vibrationRms) / 3, (mean('currentA') - baseline.currentA) / 4, (mean('averageLoadPct') - baseline.averageLoadPct) / 25];
}

export const inspections = [
  { id: 'airflow', name: 'Measure cooling airflow', measurement: 'Airflow below reference', positive: 'Low airflow observed', negative: 'Airflow within reference', minutes: 8, likelihood: { normal: .09, cooling: .92, bearing: .16, overload: .2 } },
  { id: 'envelope', name: 'Capture bearing vibration spectrum', measurement: 'Bearing-frequency sidebands', positive: 'Bearing sidebands detected', negative: 'No bearing sidebands detected', minutes: 12, likelihood: { normal: .07, cooling: .13, bearing: .91, overload: .24 } },
  { id: 'load', name: 'Record peak load and current', measurement: 'Sustained load-current correlation', positive: 'High load-current correlation', negative: 'Load-current correlation normal', minutes: 6, likelihood: { normal: .12, cooling: .2, bearing: .25, overload: .93 } },
] as const;
export type InspectionId = typeof inspections[number]['id'];
export interface Observation { inspectionId: InspectionId; positive: boolean; minute: number }
export function entropy(scores: Scores) { return -faultKinds.reduce((sum, kind) => sum + (scores[kind] > 0 ? scores[kind] * Math.log2(scores[kind]) : 0), 0); }
export function updateWithObservation(scores: Scores, inspectionId: InspectionId, positive: boolean): Scores {
  const inspection = inspections.find(item => item.id === inspectionId)!;
  const terms = faultKinds.map(kind => scores[kind] * (positive ? inspection.likelihood[kind] : 1 - inspection.likelihood[kind]));
  const total = terms.reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(faultKinds.map((kind, i) => [kind, terms[i] / Math.max(1e-15, total)])) as Scores;
}
export function diagnosis(baseline: TwinState, trace: TelemetryPoint[], frame: number, observations: Observation[]): Scores {
  return observations.reduce((scores, observation) => updateWithObservation(scores, observation.inspectionId, observation.positive), classify(traceFeatures(baseline, trace, frame)));
}
export function bestInspections(scores: Scores, observed: InspectionId[] = []) {
  return inspections.filter(item => !observed.includes(item.id)).map(item => {
    const chancePositive = faultKinds.reduce((sum, kind) => sum + scores[kind] * item.likelihood[kind], 0);
    const expectedEntropy = chancePositive * entropy(updateWithObservation(scores, item.id, true)) + (1 - chancePositive) * entropy(updateWithObservation(scores, item.id, false));
    return { ...item, informationGain: Math.max(0, entropy(scores) - expectedEntropy), chancePositive };
  }).sort((a, b) => b.informationGain - a.informationGain);
}
export function simulateInspection(kind: FaultKind, inspectionId: InspectionId, seed: number, minute: number): Observation {
  const index = inspections.findIndex(item => item.id === inspectionId);
  const inspection = inspections[index];
  return { inspectionId, positive: mulberry32(seed + 7001 + index * 313)() < inspection.likelihood[kind], minute };
}
export function publishCandidate(baseline: TwinState, trace: TelemetryPoint[], frame: number): TwinState {
  const point = trace[clamp(frame, 0, trace.length - 1)];
  return { ...baseline, temperatureC: point.temperatureC, vibrationRms: point.vibrationRms, currentA: point.currentA, averageLoadPct: point.averageLoadPct };
}
export function isCurrentBaseline(baseline: TwinState, current: TwinState) { return baseline.assetId === current.assetId && baseline.revision === current.revision && baseline.lastUpdated === current.lastUpdated; }
