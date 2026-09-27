import { contributions } from './prognostics';
import type { TwinState } from '../types';
export function explain(t: TwinState, baseline = t) { const top = contributions(t, baseline).filter(x => x.pct > 1).slice(0, 3); return top.length ? `Estimated risk is primarily driven by ${top.map(x => x.name.toLowerCase()).join(', ')}. ${t.faultEvents30d ? 'Recent fault activity also contributes to the short-term risk estimate.' : 'No recent fault activity is recorded in this simulated state.'}` : 'No elevated sensor contributions are present; the model retains a baseline risk.'; }
