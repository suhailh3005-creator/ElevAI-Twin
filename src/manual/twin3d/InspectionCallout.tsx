import RulDetails from '../inspection/RulDetails';
import { statusAppearance } from './components';
import { forwardRef } from 'react';
import type { Elevator } from '../engine';
import { conditionLabels, evaluateComponent, isEvaluated, latestInspection } from '../inspection/engine';
import type { TwinComponent } from './components';
import { num } from '../Registry';

export default forwardRef<HTMLDivElement,{component:TwinComponent;elevator:Elevator}>(function InspectionCallout({component,elevator},ref){
  const record=isEvaluated(component.id)?latestInspection(elevator.componentInspections,component.id):undefined;
  const result=isEvaluated(component.id)?evaluateComponent(component.id,record?.values,record?.normalization,component.id!=='gearbox'||elevator.driveType==='geared',record?.formulaVersion,record?.thresholds):null;
  return <div ref={ref} className="twin3d-callout" role="region" aria-label="Selected component callout" data-component={component.id} style={{borderColor:statusAppearance[result?.status??'unknown'].color??undefined}}>
    <strong>{component.displayName}</strong><small>Selected component · focused inspection</small>
    {result?<><span className={`inspection-status ${result.status}`}>{conditionLabels[result.status]}{!result.complete?' · incomplete':''}</span><p>Condition index: Risk {num(result.risk,2)} / Health {num(result.health,2)}{result.complete?'%':' · unavailable'}</p><small>Status follows the worst known parameter, not aggregate score bands.</small>{record?.generatedSample&&<small>Generated demo observations</small>}</>:<p>Component-specific evaluation not yet implemented.</p>}
    {isEvaluated(component.id)?<RulDetails id={component.id} elevator={elevator} compact/>:<p>RUL model not configured for this component.</p>}<dl><div><dt>90-day failure probability</dt><dd>Unavailable</dd></div><div><dt>Separate maintenance threshold</dt><dd>{record?.maintenanceThreshold?`${record.maintenanceThreshold.description} · ${record.maintenanceThreshold.source}`:'Not configured'}</dd></div></dl>
    <a href="#component-inspection-evidence" onClick={event=>{event.preventDefault();document.getElementById('component-inspection-evidence')?.scrollIntoView({block:'nearest',behavior:'instant'});}}>Inspection evidence alongside →</a>
  </div>;
});
