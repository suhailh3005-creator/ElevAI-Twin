import { describe, expect, it } from 'vitest';
import { defaultScenario, seedTwin } from '../data/seed';
import { defaultTarget, findMaintenanceWindows, findTargetPlan, localDate, replayIntervention, type ScheduleInput } from './planning';
import { health, project, rate } from './degradation';

describe('target planning', () => {
  it('prefers zero-cost operating changes over feasible paid interventions', () => {
    const result = findTargetPlan(seedTwin(), { ...defaultTarget, targetMonths: 8, budget: 500000, maxDowntimeHours: 100 });
    expect(result.recommendation?.action).toBe('None');
    expect(result.recommendation?.rulMonths).toBeGreaterThanOrEqual(8);
    expect(result.recommendation?.cost).toBe(0);
    expect(result.feasibleCount).toBeGreaterThan(1);
  });
  it('returns an honest infeasible result when every permitted path misses the target', () => {
    const result = findTargetPlan(seedTwin(), { ...defaultTarget, targetMonths: 60, budget: 0, allowedActions: [] });
    expect(result.recommendation).toBeNull();
    expect(result.feasibleCount).toBe(0);
    expect(result.reason).toContain('No searched combination');
  });
  it('enforces both downtime and the allowed intervention list', () => {
    const locked = { ...defaultTarget, targetMonths: 15, budget: 500000, maxTrafficReductionPct: 0, maxLoadReductionPct: 0, maxCoolingDeltaC: 0 };
    expect(findTargetPlan(seedTwin(), { ...locked, maxDowntimeHours: 0 }).recommendation).toBeNull();
    expect(findTargetPlan(seedTwin(), { ...locked, maxDowntimeHours: 100, allowedActions: ['Repair'] }).recommendation).toBeNull();
    const result = findTargetPlan(seedTwin(), { ...locked, maxDowntimeHours: 24, allowedActions: ['Replace'] });
    expect(result.recommendation?.action).toBe('Replace');
    expect(result.recommendation?.downtimeHours).toBe(24);
  });
  it('minimizes operating burden when unchanged operation already meets the target', () => {
    const result = findTargetPlan(seedTwin(), { ...defaultTarget, targetMonths: 2 });
    expect(result.recommendation?.burden).toBe(0);
    expect(result.recommendation?.action).toBe('None');
  });
  it('rejects nonfinite inputs before evaluating candidates', () => {
    expect(findTargetPlan(seedTwin(), { ...defaultTarget, targetMonths: NaN }).searched).toBe(0);
    expect(findTargetPlan(seedTwin(), { ...defaultTarget, budget: -1 }).searched).toBe(0);
  });
  it('exports only horizons supported by Scenario Lab and uses the current operating baseline', () => {
    const twin = { ...seedTwin(), dailyCycles: 300, averageLoadPct: 40 };
    const result = findTargetPlan(twin, { ...defaultTarget, targetMonths: 9 });
    const candidate = result.recommendation!;
    expect(candidate).toBeTruthy();
    expect([3, 6, 12]).toContain(candidate.scenario.horizon);
    const projected = project(twin, candidate.scenario);
    expect(projected.dailyCycles).toBeCloseTo(300 * (1 + candidate.scenario.trafficChangePct / 100));
    expect(projected.averageLoadPct).toBeCloseTo(40 + candidate.scenario.loadChangePct);
  });
});

describe('paired intervention replay', () => {
  it('has identical paths before the action and changes health at the chosen month', () => {
    const twin = seedTwin(), original = { ...twin };
    const replay = replayIntervention(twin, { ...defaultScenario, trafficChangePct: 40 }, 'Repair', 2, 12);
    expect(replay.data.filter(d => d.month < 2).every(d => d.with === d.without)).toBe(true);
    const at = replay.data.find(d => d.month === 2)!;
    expect(at.with).toBeGreaterThan(at.without);
    const projected = project(twin, { ...defaultScenario, trafficChangePct: 40 });
    expect(at.with).toBeCloseTo(health((twin.degradation + 2 * rate(projected)) * .78));
    expect(twin).toEqual(original);
  });
  it('does not erase an earlier threshold crossing with a later intervention', () => {
    const replay = replayIntervention(seedTwin(), defaultScenario, 'Replace', 9, 12);
    expect(replay.reachesThresholdBeforeIntervention).toBe(true);
    expect(replay.interventionCrossing).toBe(replay.controlCrossing);
  });
  it('does not charge an intervention outside the replay horizon', () => {
    const replay = replayIntervention(seedTwin(), defaultScenario, 'Replace', 18, 12);
    expect(replay.actionInHorizon).toBe(false);
    expect(replay.cost).toBe(0);
    expect(replay.downtimeHours).toBe(0);
    expect(replay.data.every(d => d.with === d.without)).toBe(true);
  });
});

describe('maintenance window scheduling', () => {
  const now = new Date(2026, 8, 14, 0, 0, 0); // Monday in the runtime timezone.
  const input: ScheduleInput = { earliestDate: localDate(now), deadlineDate: '2026-09-20', action: 'Repair', budget: 50000, weekdays: [1, 2, 3, 4, 5], hours: 'quiet' };
  it('returns actual continuous windows with every hour available and before the threshold', () => {
    const result = findMaintenanceWindows(seedTwin(), defaultScenario, input, now);
    expect(result.windows.length).toBeGreaterThan(0);
    for (const w of result.windows) {
      expect(new Date(w.end).getTime() - new Date(w.start).getTime()).toBe(5 * 3600000);
      expect(new Date(w.end).getTime()).toBeLessThan(Date.parse(result.thresholdAt!));
      expect(new Date(w.start).getMinutes()).toBe(0);
      expect(new Date(w.end).getMinutes()).toBe(0);
      for (let h = 0; h < 5; h++) {
        const d = new Date(Date.parse(w.start) + h * 3600000);
        expect(input.weekdays).toContain(d.getDay());
        expect(d.getHours() < 7 || d.getHours() >= 19).toBe(true);
      }
    }
    expect(result.windows.map(w => w.disruptedTrips)).toEqual(result.windows.map(w => w.disruptedTrips).sort((a, b) => a - b));
  });
  it('rounds a partial current hour forward without proposing a past start', () => {
    const current = new Date(2026, 8, 14, 1, 17, 31);
    const result = findMaintenanceWindows(seedTwin(), defaultScenario, input, current);
    expect(result.windows.length).toBeGreaterThan(0);
    for (const window of result.windows) {
      expect(Date.parse(window.start)).toBeGreaterThanOrEqual(current.getTime());
      expect(new Date(window.start).getMinutes()).toBe(0);
      expect(new Date(window.start).getSeconds()).toBe(0);
    }
  });
  it('never squeezes a 24-hour replacement into a 12-hour quiet window', () => {
    const result = findMaintenanceWindows(seedTwin(), defaultScenario, { ...input, action: 'Replace', budget: 200000 }, now);
    expect(result.windows).toHaveLength(0);
    expect(result.reason).toContain('No continuous window');
  });
  it('supports continuous multiday work when every occupied day is available', () => {
    const result = findMaintenanceWindows(seedTwin(), defaultScenario, { ...input, action: 'Modernize', budget: 500000, hours: 'any' }, now);
    expect(result.windows.length).toBeGreaterThan(0);
    expect(result.windows[0].downtimeHours).toBe(72);
    const blocked = findMaintenanceWindows(seedTwin(), defaultScenario, { ...input, action: 'Modernize', budget: 500000, hours: 'any', weekdays: [1] }, now);
    expect(blocked.windows).toHaveLength(0);
  });
  it('rejects invalid dates, insufficient budgets, and dates beyond the threshold', () => {
    expect(findMaintenanceWindows(seedTwin(), defaultScenario, { ...input, earliestDate: '2026-02-30' }, now).windows).toHaveLength(0);
    expect(findMaintenanceWindows(seedTwin(), defaultScenario, { ...input, budget: 0 }, now).reason).toContain('budget');
    expect(findMaintenanceWindows({ ...seedTwin(), degradation: .54999 }, defaultScenario, input, now).windows).toHaveLength(0);
    expect(findMaintenanceWindows({ ...seedTwin(), degradation: .55 }, defaultScenario, input, now).reason).toContain('already reached');
  });
});
