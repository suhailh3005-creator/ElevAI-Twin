import { useMemo } from 'react';
import { useTwin } from '../store/useTwin';
import { project, health, stress, rul, rate } from '../engine/degradation';
import { risk } from '../engine/prognostics';
import { uncertainty } from '../engine/uncertainty';
import { defaultScenario } from '../data/seed';
export function useModel() { const {twin,scenario,simulationSeed}=useTwin(); return useMemo(()=>{ const projected=project(twin,scenario); return { twin,projected,scenario,health:health(twin.degradation),risk:risk(twin),rul:rul(twin),rate:rate(twin),stress:stress(twin),interval:uncertainty(twin,defaultScenario,simulationSeed),future:{risk:risk(projected,twin),rul:rul(projected),rate:rate(projected),stress:stress(projected),interval:uncertainty(projected,scenario,simulationSeed)} }; },[twin,scenario,simulationSeed]); }
