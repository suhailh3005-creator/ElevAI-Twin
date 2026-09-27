export interface TwinState { assetId: string; component: string; revision: number; degradation: number; ageYears: number; totalCycles: number; dailyCycles: number; operatingHours: number; averageLoadPct: number; temperatureC: number; vibrationRms: number; currentA: number; faultEvents30d: number; efficiencyImprovementPct: number; lastUpdated: string }
export interface Scenario { trafficChangePct: number; loadChangePct: number; ambientTemperatureDelta: number; horizon: number }
export type Action = 'Repair' | 'Replace' | 'Modernize';
export type Weights = Record<'Safety' | 'Cost' | 'Downtime' | 'Energy' | 'Longevity', number>;
export interface TwinEvent { id: string; timestamp: string; assetId: string; type: string; title: string; description: string; revision: number; metadata: Record<string, unknown> }
export interface SavedScenario { id: string; name: string; settings: Scenario; revision: number }
