import type { TwinState, Scenario, Weights } from '../types';
export const defaultScenario: Scenario = { trafficChangePct: 0, loadChangePct: 0, ambientTemperatureDelta: 0, horizon: 6 };
export const defaultWeights: Weights = { Safety: 35, Cost: 25, Downtime: 15, Energy: 10, Longevity: 15 };
export const seedTwin = (): TwinState => ({ assetId: 'EL-204', component: 'traction_motor', revision: 42, degradation: .37, ageYears: 8.4, totalCycles: 1284310, dailyCycles: 420, operatingHours: 18422, averageLoadPct: 55, temperatureC: 76.4, vibrationRms: 5.6, currentA: 19.8, faultEvents30d: 3, efficiencyImprovementPct: 0, lastUpdated: new Date().toISOString() });
export const fleet = [{ id: 'EL-204', tower: 'Tower B', status: 'High priority', mode: 'FULL TWIN' }, { id: 'EL-102', tower: 'Tower A', status: 'Stable', mode: 'CONTEXT ONLY' }, { id: 'EL-311', tower: 'Tower C', status: 'Monitor', mode: 'CONTEXT ONLY' }];
export const history = Array.from({ length: 12 }, (_, i) => ({ month: `M${i + 1}`, health: [88,87,85,83,81,78,76,74,71,69,66,63][i], temperature: 65 + i * 1.03636, vibration: 3.4 + i * .2 }));
