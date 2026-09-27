import { describe, expect, it } from 'vitest';
import { seedTwin } from '../data/seed';
import { bestInspections, classify, diagnosis, entropy, faultKinds, inspections, isCurrentBaseline, makeTrace, modelEvaluation, publishCandidate, ranked, simulateInspection, traceFeatures, updateWithObservation } from './investigation';

describe('synthetic fault investigation', () => {
  it('learns separable fault families and reports a seeded, independent holdout', () => {
    expect(modelEvaluation.trainSamples).toBe(1280);
    expect(modelEvaluation.testSamples).toBe(480);
    expect(modelEvaluation.accuracy).toBeGreaterThan(.85);
    expect(modelEvaluation.accuracy).toBeLessThan(1);
    expect(modelEvaluation.rows.reduce((sum, row) => sum + row.total, 0)).toBe(480);
  });
  it('classifies the observed pattern without accepting a ground-truth fault parameter', () => {
    const baseline = seedTwin();
    for (const fault of faultKinds) {
      const trace = makeTrace(baseline, fault, 85, 301);
      expect(ranked(classify(traceFeatures(baseline, trace, 24)))[0].kind).toBe(fault);
    }
  });
  it('uses a smooth seeded onset and changes the supplied baseline instead of a fixed seed twin', () => {
    const baseline = { ...seedTwin(), temperatureC: 42, vibrationRms: 1.3, currentA: 11, averageLoadPct: 30 };
    const trace = makeTrace(baseline, 'cooling', 80, 222);
    expect(trace).toEqual(makeTrace(baseline, 'cooling', 80, 222));
    expect(Math.abs(trace[0].temperatureC - 42)).toBeLessThan(2);
    expect(trace[24].temperatureC).toBeGreaterThan(52);
    expect(trace[24].averageLoadPct).toBeLessThan(35);
    expect(baseline.temperatureC).toBe(42);
  });
  it('does not let future telemetry leak into the current diagnosis', () => {
    const baseline = seedTwin();
    const trace = makeTrace(baseline, 'bearing', 80, 202);
    const changedFuture = trace.map(point => point.minute > 8 ? { ...point, temperatureC: 900 } : point);
    expect(traceFeatures(baseline, trace, 8)).toEqual(traceFeatures(baseline, changedFuture, 8));
    expect(ranked(diagnosis(baseline, trace, 0, []))[0].kind).toBe('normal');
  });
  it('keeps classifier probabilities normalized even for extreme sensor values', () => {
    for (const features of [[0, 0, 0, 0], [100, 20, 40, 30], [NaN, 0, 0, 0]] as [number, number, number, number][]) {
      const scores = classify(features);
      expect(Object.values(scores).every(score => Number.isFinite(score) && score >= 0 && score <= 1)).toBe(true);
      expect(Object.values(scores).reduce((sum, score) => sum + score, 0)).toBeCloseTo(1);
    }
  });
  it('selects the measurement with greatest expected entropy reduction', () => {
    const scores = { normal: .04, cooling: .46, bearing: .46, overload: .04 };
    const choices = bestInspections(scores);
    expect(choices[0].informationGain).toBeGreaterThan(choices.at(-1)!.informationGain);
    expect(choices[0].id).not.toBe('load');
    for (const choice of choices) {
      const likelihood = inspections.find(item => item.id === choice.id)!.likelihood;
      const chancePositive = faultKinds.reduce((sum, fault) => sum + scores[fault] * likelihood[fault], 0);
      const expected = chancePositive * entropy(updateWithObservation(scores, choice.id, true)) + (1 - chancePositive) * entropy(updateWithObservation(scores, choice.id, false));
      expect(choice.informationGain).toBeCloseTo(entropy(scores) - expected);
    }
    expect(bestInspections(scores, ['airflow', 'envelope', 'load'])).toEqual([]);
  });
  it('updates beliefs in both directions and does not reuse a completed inspection', () => {
    const scores = { normal: .1, cooling: .4, bearing: .4, overload: .1 };
    expect(updateWithObservation(scores, 'airflow', true).cooling).toBeGreaterThan(scores.cooling);
    expect(updateWithObservation(scores, 'airflow', false).cooling).toBeLessThan(scores.cooling);
    expect(bestInspections(scores, ['airflow']).some(item => item.id === 'airflow')).toBe(false);
    expect(simulateInspection('bearing', 'envelope', 205, 12)).toEqual(simulateInspection('bearing', 'envelope', 205, 12));
  });
  it('publishes only the visible snapshot and detects revision and reset-stale baselines', () => {
    const baseline = seedTwin();
    const trace = makeTrace(baseline, 'overload', 80, 100);
    const candidate = publishCandidate(baseline, trace, 8);
    expect(candidate.currentA).toBe(trace[8].currentA);
    expect(candidate.degradation).toBe(baseline.degradation);
    expect(candidate.revision).toBe(baseline.revision);
    expect(isCurrentBaseline(baseline, { ...baseline })).toBe(true);
    expect(isCurrentBaseline(baseline, { ...baseline, revision: baseline.revision + 1 })).toBe(false);
    expect(isCurrentBaseline(baseline, { ...baseline, lastUpdated: 'different reset timestamp' })).toBe(false);
  });
});
