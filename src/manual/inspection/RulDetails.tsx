import type { Elevator } from '../engine';
import type { EvaluatedId } from './engine';
import { componentRul, formatRul, rulModelVersion } from './rul';

export default function RulDetails({id,elevator,compact=false}:{id:EvaluatedId;elevator:Elevator;compact?:boolean}){
  const r=componentRul(id,elevator.componentInspections,elevator.driveType);
  const label=r.mode==='history'?'Predicted RUL · measured trend':'Estimated RUL';
  return <div className="inspection-rul" data-rul-mode={r.mode}>
    <strong>{label}: {formatRul(r.days)}</strong>
    {r.days!==null?<><small>{r.mode==='baseline'?'Experimental baseline model':'Historical linear projection'}{r.demo?' · demo observations':''}</small><small>As of {new Date(r.asOf!).toLocaleDateString()} · not a maintenance deadline</small>
      {!compact&&<><p>RUL = (F − H) / D = ({r.threshold} − {Number(r.indicator!.toFixed(3))}) / {Number(r.rate!.toFixed(5))} = {Number(r.days.toFixed(1))} days.</p><p>H is the increasing risk/condition index, not the decreasing health percentage. F = {r.threshold} index points is the assumed model threshold; D = {Number(r.rate!.toFixed(5))} index points/day.</p><p>{r.reason} {r.mode==='history'?`${r.n} comparable periods; R² = ${r.r2?.toFixed(2)}.`:''}</p><p>{rulModelVersion}: baseline rates and the failure threshold are demonstration assumptions, not manufacturer-calibrated life limits. A critical parameter still requires attention regardless of this projection.</p></>}
    </>:<small>{r.reason}</small>}
  </div>;
}
