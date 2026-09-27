import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, Check, FlaskConical, Gauge, Pause, Play, Search, SkipForward, Waves, Wind } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Header, Modal } from '../components/UI';
import { Chart } from '../components/Charts';
import { useTwin } from '../store/useTwin';
import { useInvestigation } from '../store/useInvestigation';
import { bestInspections, diagnosis, entropy, faultDescriptions, faultKinds, faultLabels, inspections, isCurrentBaseline, modelEvaluation, publishCandidate, ranked, traceFeatures } from '../engine/investigation';
import { rul } from '../engine/degradation';
import './Investigation.css';

const icons = { normal: Activity, cooling: Wind, bearing: Waves, overload: Gauge };
const signed = (value: number, digits = 1) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
export default function Investigation() {
  const twin = useTwin(state => state.twin);
  const { kind, severity, run, playing, configure, start, step, setPlaying, complete, inspect, markPublished } = useInvestigation();
  const [publishOpen, setPublishOpen] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => { if (!playing) return; const timer = window.setInterval(step, 650); return () => window.clearInterval(timer); }, [playing, step]);
  useEffect(() => { if (!run) { setPublishOpen(false); setStatus(''); } }, [run]);
  const scores = useMemo(() => run ? diagnosis(run.baseline, run.trace, run.frame, run.observations) : null, [run]);
  const hypotheses = scores ? ranked(scores) : [];
  const inspectionChoices = scores ? bestInspections(scores, run?.observations.map(item => item.inspectionId)) : [];
  const next = inspectionChoices[0];
  const current = run?.trace[run.frame];
  const baseline = run?.baseline ?? twin;
  const collecting = !run || run.frame < 6;
  const stale = !!run && !isCurrentBaseline(run.baseline, twin);
  const published = !!run?.publishedRevision;
  const candidate = run ? publishCandidate(run.baseline, run.trace, run.frame) : null;
  const features = run ? traceFeatures(run.baseline, run.trace, run.frame) : [0, 0, 0, 0];
  const anomalous = !collecting && features.some(value => Math.abs(value) > .25);
  const data = run?.trace.slice(0, run.frame + 1).map(point => ({ month: `${point.minute}m`, thermal: 100 * (point.temperatureC / Math.max(.1, baseline.temperatureC) - 1), vibration: 100 * (point.vibrationRms / Math.max(.1, baseline.vibrationRms) - 1) })) ?? [];
  const begin = () => { setStatus(''); setPublishOpen(false); start(twin); useTwin.getState().log('INVESTIGATION_STARTED', 'Simulated fault investigation started', {fault:kind,severity,baselineRevision:twin.revision}); };
  const publish = () => {
    const freshRun = useInvestigation.getState().run;
    if (!freshRun || !isCurrentBaseline(freshRun.baseline, useTwin.getState().twin) || freshRun.publishedRevision !== null) { setStatus('The twin changed. Start a new investigation from its current state.'); setPublishOpen(false); return; }
    const freshCandidate = publishCandidate(freshRun.baseline, freshRun.trace, freshRun.frame);
    const accepted = useTwin.getState().injectFault(freshCandidate, { sourceRevision: freshRun.baseline.revision, baselineUpdatedAt: freshRun.baseline.lastUpdated, fault: freshRun.kind, severity: freshRun.severity, classifierTop: hypotheses[0]?.kind, observations: freshRun.observations, synthetic: true });
    if (accepted) { markPublished(useTwin.getState().twin.revision); setStatus('Snapshot published. Prognostics and planning now use these simulated readings.'); }
    else setStatus('The twin changed. Start a new investigation to publish a current snapshot.');
    setPublishOpen(false);
  };
  return <div className="investigation-page">
    <Header eyebrow="DETECT · EXPLAIN · INVESTIGATE" title="Find the fault behind the signal" description="Create a disturbance, watch evidence emerge, and choose the measurement that resolves uncertainty." action={<Badge>SYNTHETIC FAULT LAB</Badge>}/>
    <div className="investigation-journey" aria-label="Investigation progress">
      {['Inject a disturbance', 'Read the evidence', 'Resolve uncertainty', 'Plan a response'].map((text, index) => <div className={(index === 0 || (index === 1 && !!run) || (index === 2 && !!run?.observations.length) || (index === 3 && published)) ? 'reached' : ''} key={text}><span>{String(index + 1).padStart(2, '0')}</span>{text}{index < 3 && <ArrowRight size={14}/>}</div>)}
    </div>
    <div className="investigation-layout">
      <section className="panel investigation-controls">
        <div className="section-title"><h2>Choose a disturbance</h2><FlaskConical size={17}/></div>
        <p className="muted">Changes are relative to twin revision {twin.revision}. Each run stays in this lab until you publish a snapshot.</p>
        <div className="investigation-faults" role="group" aria-label="Fault type">
          {faultKinds.map(fault => { const Icon = icons[fault]; return <button key={fault} aria-pressed={kind === fault} className={kind === fault ? 'selected' : ''} onClick={() => configure(fault, severity)}><Icon size={18}/><span>{faultLabels[fault]}<small>{fault === 'normal' ? 'Control experiment' : fault === 'cooling' ? 'Thermal signature' : fault === 'bearing' ? 'Mechanical signature' : 'Demand signature'}</small></span>{kind === fault && <Check size={15}/>}</button>; })}
        </div>
        <label className="slider investigation-severity"><span>Disturbance severity<b>{severity}%</b></span><input aria-label="Disturbance severity" type="range" min={20} max={100} step={5} disabled={kind === 'normal'} value={severity} onChange={event => configure(kind, Number(event.target.value))}/><small>Subtle · 20%<span>Pronounced · 100%</span></small></label>
        <p className="investigation-control-description">{faultDescriptions[kind]}</p>
        <button className="primary full-width" onClick={begin}><Play size={15}/>{run ? 'Start new investigation' : 'Inject and investigate'}</button>
        <small className="investigation-footnote">New settings apply on the next run. Starting again replaces this lab run.</small>
      </section>
      <div>
        <section className="panel investigation-telemetry">
          <div className="section-title"><div><h2>Live evidence stream</h2><p className="muted">{run ? `${faultLabels[run.kind]} · ${run.severity}% severity · baseline revision ${baseline.revision}` : '24 simulated minutes · one evolving operating snapshot'}</p></div><Badge>{collecting ? 'AWAITING EVIDENCE' : anomalous ? 'ANOMALY DETECTED' : 'BASELINE VARIATION'}</Badge></div>
          <div className="investigation-sensors">
            {[{ label: 'Motor temperature', value: current?.temperatureC ?? baseline.temperatureC, reference: baseline.temperatureC, unit: '°C' }, { label: 'Vibration RMS', value: current?.vibrationRms ?? baseline.vibrationRms, reference: baseline.vibrationRms, unit: 'mm/s' }, { label: 'Motor current', value: current?.currentA ?? baseline.currentA, reference: baseline.currentA, unit: 'A' }, { label: 'Average load', value: current?.averageLoadPct ?? baseline.averageLoadPct, reference: baseline.averageLoadPct, unit: '%' }].map(sensor => <div key={sensor.label}><span>{sensor.label}</span><strong>{sensor.value.toFixed(1)}<small>{sensor.unit}</small></strong><small>{signed(sensor.value - sensor.reference)} {sensor.unit === '%' ? 'pp' : sensor.unit} from baseline</small></div>)}
          </div>
          {run ? <><div className="investigation-chart-label">Signal change from baseline (%) · simulated minute</div><Chart data={data} lines={[{ key: 'thermal', name: 'Temperature change' }, { key: 'vibration', name: 'Vibration change', dashed: true }]} height={215}/><div className="investigation-playback"><span><i className={playing ? 'running' : ''}/>{playing ? 'STREAMING' : run.frame === 24 ? 'TRACE COMPLETE' : 'PAUSED'} <b>{run.frame} / 24 min</b></span><div><button aria-label={playing ? 'Pause telemetry' : 'Resume telemetry'} disabled={run.frame >= 24 || published} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={14}/> : <Play size={14}/>}</button><button disabled={run.frame >= 24 || published} onClick={() => { setPlaying(false); step(); }}>+1 min</button><button disabled={run.frame >= 24 || published} onClick={complete}><SkipForward size={14}/>Complete trace</button></div></div></> : <div className="investigation-empty"><Activity size={40} strokeWidth={1}/><h3>The next signal starts a story.</h3><p>Inject a fault to see how a change in temperature, vibration, current, and load points toward a cause.</p></div>}
        </section>
        {stale && !published && <div className="warning"><strong>This run uses an earlier twin revision.</strong><p>Your investigation remains available. Start a new run before publishing to the changed twin.</p></div>}
      </div>
    </div>
    <div className="grid-two investigation-results">
      <section className="panel">
        <div className="section-title"><h2>What explains the pattern?</h2><Badge>TRAINED CLASSIFIER</Badge></div>
        {collecting ? <div className="investigation-result-placeholder"><Search size={23}/><p>{run ? 'Collecting the first six minutes of evidence. Early readings overlap with baseline variation.' : 'The classifier will rank four hypotheses from sensor changes, without receiving the injected fault label.'}</p></div> : <><div className="investigation-diagnosis"><small>{hypotheses[0].probability < .7 ? 'AMBIGUOUS EVIDENCE' : 'BEST SUPPORTED HYPOTHESIS'}</small><h3>{faultLabels[hypotheses[0].kind]}</h3><p>{hypotheses[0].probability < .7 ? 'Several causes fit these readings. An inspection can help distinguish them.' : 'A synthetic-model ranking, not a confirmed mechanical diagnosis.'}</p></div><div className="investigation-hypotheses">{hypotheses.map((hypothesis, index) => <div key={hypothesis.kind}><div><span><small>0{index + 1}</small>{faultLabels[hypothesis.kind]}</span><strong>{(hypothesis.probability * 100).toFixed(1)}%</strong></div><div className="bar"><i style={{ width: `${hypothesis.probability * 100}%` }}/></div></div>)}</div><p className="investigation-evidence">Observed across the last four samples: {signed(features[0] * 15)}°C temperature, {signed(features[1] * 3, 2)} mm/s vibration, {signed(features[2] * 4, 2)} A current, and {signed(features[3] * 25)} pp load.</p><small className="investigation-footnote">Scores sum to 100% across these four modeled causes. Unmodeled faults and combined faults are outside this classifier.</small></>}
      </section>
      <section className="panel investigation-inspection">
        <div className="section-title"><h2>What should we measure next?</h2><Badge>INFORMATION GAIN</Badge></div>
        {collecting ? <div className="investigation-result-placeholder"><Waves size={23}/><p>Once evidence arrives, compare inspections by how much uncertainty each is expected to remove.</p></div> : next ? <><small className="investigation-recommendation">NEXT BEST INSPECTION</small><h3>{next.name}</h3><p>Check for {next.measurement.toLowerCase()}. This measurement is expected to distinguish the current hypotheses better than the remaining alternatives.</p><div className="investigation-inspection-stats"><div><strong>{next.informationGain < .005 ? '<0.01' : next.informationGain.toFixed(2)}<small>bits</small></strong><span>Expected uncertainty removed</span></div><div><strong>{next.minutes}<small>min</small></strong><span>Assumed inspection duration</span></div></div><button className="full-width" disabled={published} onClick={() => { setPlaying(false); inspect(next.id); const observation=useInvestigation.getState().run?.observations.at(-1); if(observation)useTwin.getState().log('INSPECTION_OBSERVED', 'Simulated inspection evidence recorded', {...observation,sourceRevision:run?.baseline.revision}); }}><Search size={15}/>Observe simulated inspection</button><div className="investigation-alternatives">{inspectionChoices.slice(1).map(choice => <div key={choice.id}><span>{choice.name}</span><small>{choice.informationGain.toFixed(2)} bits</small></div>)}</div></> : <div className="investigation-result-placeholder"><Check size={24}/><p>All three modeled inspections have been observed. Review the updated evidence and plan a response.</p></div>}
        {!!run?.observations.length && <div className="investigation-observations" aria-live="polite">{run.observations.map(observation => { const definition = inspections.find(item => item.id === observation.inspectionId)!; return <div key={observation.inspectionId}><Check size={14}/><span>{observation.positive ? definition.positive : definition.negative}<small>Simulated observation · minute {observation.minute}</small></span></div>; })}</div>}
        {!collecting && <small className="investigation-footnote">Current uncertainty: {entropy(scores!).toFixed(2)} bits. Ranking uses expected entropy reduction with explicit, assumed inspection likelihoods. Results may support a different hypothesis.</small>}
      </section>
    </div>
    {run && <section className="notice investigation-response"><div><Badge>{published ? `PUBLISHED · REVISION ${run.publishedRevision}` : 'CONNECT EVIDENCE TO ACTION'}</Badge><h2>{published ? 'The twin is ready for a response.' : 'Make this finding part of the twin.'}</h2><p>{published ? 'Use the updated operating state to find a feasible intervention, replay its impact, and select a maintenance window.' : `Publish the current minute-${run.frame} sensor snapshot. The calculation engine will recompute risk and RUL from those readings.`}</p></div>{published ? <Link className="button primary" to="/planning">Plan a response<ArrowRight size={15}/></Link> : <button className="primary" disabled={collecting || stale} onClick={() => { setPlaying(false); setPublishOpen(true); }}>Publish snapshot to twin<ArrowRight size={15}/></button>}</section>}
    {status && <p role="status" className="investigation-status">{status}</p>}
    <details className="panel investigation-method"><summary>Model card · inspect training and validation <span>{(modelEvaluation.accuracy * 100).toFixed(1)}% synthetic holdout accuracy</span></summary><p>A Gaussian naive Bayes classifier is fitted to {modelEvaluation.trainSamples.toLocaleString()} seeded synthetic feature vectors. The {modelEvaluation.testSamples}-sample holdout uses a separate seed and was never included in fitting. Both sets come from the same four configured signal families. Accuracy measures this simulated task and does not establish performance on real elevators.</p><div className="investigation-validation">{modelEvaluation.rows.map(row => <div key={row.kind}><span>{faultLabels[row.kind]}</span><strong>{row.correct} / {row.total}</strong><small>holdout samples correctly classified</small></div>)}</div><p>Features use change from the captured baseline: temperature / 15°C, vibration / 3 mm/s, current / 4 A, and load / 25 percentage points. The latest four samples are averaged. Equal class priors and Gaussian feature likelihoods produce the displayed scores; these are not calibrated real-world probabilities. “Baseline variation” means no newly injected fault, not a healthy asset. Inspection outcomes are sampled using the configured likelihood table.</p><div className="investigation-table-wrap"><table><thead><tr><th>Probability of a positive inspection</th>{faultKinds.map(fault => <th key={fault}>{faultLabels[fault]}</th>)}</tr></thead><tbody>{inspections.map(inspection => <tr key={inspection.id}><td>{inspection.name}</td>{faultKinds.map(fault => <td key={fault}>{(inspection.likelihood[fault] * 100).toFixed(0)}%</td>)}</tr>)}</tbody></table></div></details>
    {publishOpen && run && candidate && <Modal title="Publish the simulated finding" onClose={() => setPublishOpen(false)}><p>The current readings will become the working twin state. This creates a traceable event and updates downstream planning.</p><table><thead><tr><th>Reading</th><th>Captured baseline</th><th>Snapshot</th></tr></thead><tbody><tr><td>Temperature</td><td>{baseline.temperatureC.toFixed(1)}°C</td><td>{candidate.temperatureC.toFixed(1)}°C</td></tr><tr><td>Vibration RMS</td><td>{baseline.vibrationRms.toFixed(2)} mm/s</td><td>{candidate.vibrationRms.toFixed(2)} mm/s</td></tr><tr><td>Current</td><td>{baseline.currentA.toFixed(2)} A</td><td>{candidate.currentA.toFixed(2)} A</td></tr><tr><td>Average load</td><td>{baseline.averageLoadPct.toFixed(1)}%</td><td>{candidate.averageLoadPct.toFixed(1)}%</td></tr><tr><td>Estimated threshold RUL</td><td>{rul(baseline).toFixed(1)} months</td><td>{rul(candidate).toFixed(1)} months</td></tr></tbody></table><Badge>SIMULATED READINGS · PROTOTYPE ENGINE</Badge><div className="actions"><button onClick={() => setPublishOpen(false)}>Keep in lab</button><button className="primary" disabled={stale || published} onClick={publish}>Publish snapshot</button></div></Modal>}
  </div>;
}


