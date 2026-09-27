import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUp, Bot, Check, ChevronDown, FileText, LoaderCircle, RefreshCw, ShieldCheck, Square, Upload, X } from 'lucide-react';
import { Header, Badge } from '../components/UI';
import { useTwin } from '../store/useTwin';
import { useInvestigation } from '../store/useInvestigation';
import { isCurrentBaseline } from '../engine/investigation';
import { useModel } from '../hooks/useModel';
import { contributions } from '../engine/prognostics';
import { n, money } from '../utils/format';
import './Assistant.css';

type Proposal = { targetMonths?: number; budget?: number; maxDowntimeHours?: number };
type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; fingerprint: string; revision: number; timestamp: string; sourceSummary: string; provider?: string; model?: string; proposal?: Proposal; notesIncluded?: boolean };
type Status = { configured: boolean; provider: string; model: string };
type RequestPayload = { messages: { role: 'user' | 'assistant'; content: string }[]; context: Record<string, unknown> };
type PendingRequest = { payload: RequestPayload; fingerprint: string; revision: number; sourceSummary: string; notesIncluded: boolean };
const CHAT_KEY = 'elevai-assistant:v1';
const NOTES_LIMIT = 30_000;
const PROMPTS = [
  { title: 'Explain the current risk', text: 'What is driving this motor’s current risk, and how certain is the estimate? Cite the supplied twin and engine evidence.' },
  { title: 'Find a way to six months', text: 'Can this motor reach six more months with a budget of ₹150,000 and no more than 12 hours of downtime? Prepare those constraints for the planner. Do not claim feasibility before the planner runs.' },
  { title: 'Prepare my next inspection', text: 'Based on the current telemetry, what should I inspect next, and what uncertainty would it resolve? Distinguish measured values, engine outputs, and hypotheses.' },
];

function validProposal(value: unknown): Proposal | undefined {
  if (!value || typeof value !== 'object') return;
  const p = value as Record<string, unknown>, result: Proposal = {};
  const fields = [['targetMonths', 1, 60], ['budget', 0, 1_000_000], ['maxDowntimeHours', 0, 168]] as const;
  for (const [key, min, max] of fields) {
    const val = p[key];
    if (typeof val === 'number' && Number.isFinite(val) && val >= min && val <= max) result[key] = val;
  }
  return Object.keys(result).length ? result : undefined;
}

function readMessages(): ChatMessage[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((m): m is ChatMessage => !!m && typeof m === 'object' && ['user', 'assistant'].includes(m.role) && typeof m.id === 'string' && typeof m.content === 'string' && m.content.length <= 20_000 && typeof m.fingerprint === 'string' && m.fingerprint.length <= 5_000 && Number.isInteger(m.revision) && typeof m.timestamp === 'string' && typeof m.sourceSummary === 'string' && m.sourceSummary.length <= 1_000 && (m.provider === undefined || typeof m.provider === 'string') && (m.model === undefined || typeof m.model === 'string'))
      .slice(-40).map(m => ({ ...m, proposal: validProposal(m.proposal) }));
  } catch { return []; }
}

function CitationText({ text }: { text: string }) {
  return <div className="assistant-response-text">{text.split(/(\[Twin\]|\[Engine\]|\[Notes\])/g).map((part, i) => /^\[(Twin|Engine|Notes)\]$/.test(part) ? <span className="assistant-citation" key={i} title={part === '[Twin]' ? 'Stored simulated twin state' : part === '[Engine]' ? 'Calculated prototype model output' : 'User-supplied notes, not independently verified'}>{part}</span> : <span key={i}>{part}</span>)}</div>;
}

export default function Assistant() {
  const s = useTwin(), m = useModel(), navigate = useNavigate();
  const run = useInvestigation(state => state.run);
  const investigation = run && (isCurrentBaseline(run.baseline, s.twin) || run.publishedRevision === s.twin.revision) ? { baseline: run.baseline, kind: run.kind, severity: run.severity, seed: run.seed, frame: run.frame, observations: run.observations, publishedRevision: run.publishedRevision } : undefined;
  const [messages, setMessages] = useState<ChatMessage[]>(readMessages);
  const [input, setInput] = useState(''), [notes, setNotes] = useState(''), [notesName, setNotesName] = useState(''), [includeNotes, setIncludeNotes] = useState(false);
  const [status, setStatus] = useState<Status | null>(null), [checking, setChecking] = useState(true), [statusError, setStatusError] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState<PendingRequest | null>(null), [storageError, setStorageError] = useState(false);
  const [notesError, setNotesError] = useState(''), [cancelled, setCancelled] = useState(false);
  const controller = useRef<AbortController | null>(null), statusController = useRef<AbortController | null>(null), mounted = useRef(true), bottom = useRef<HTMLDivElement>(null), fileInput = useRef<HTMLInputElement>(null);
  const fingerprint = JSON.stringify({ twin: s.twin, scenario: s.scenario, seed: s.simulationSeed, riskTolerance: s.tolerance, enforceRiskTolerance: s.enforce, investigation });
  const currentFingerprint = useRef(fingerprint);
  currentFingerprint.current = fingerprint;
  const sourceSummary = `Traffic ${s.scenario.trafficChangePct > 0 ? '+' : ''}${s.scenario.trafficChangePct}% · load ${s.scenario.loadChangePct > 0 ? '+' : ''}${s.scenario.loadChangePct}% · ambient ${s.scenario.ambientTemperatureDelta > 0 ? '+' : ''}${s.scenario.ambientTemperatureDelta}°C · horizon ${s.scenario.horizon} mo${investigation ? ` · Investigation minute ${investigation.frame}${investigation.publishedRevision ? ' · published' : ' · lab preview'}` : ''}`;

  async function checkStatus() {
    statusController.current?.abort();
    const request = new AbortController(); statusController.current = request;
    setChecking(true); setStatusError('');
    const timeout = window.setTimeout(() => request.abort(), 12_000);
    try {
      const response = await fetch('/api/ai-status', { signal: request.signal });
      if (!response.ok) throw new Error('AI service could not be reached. Start the app with npm run dev, then check again.');
      const data = await response.json() as Partial<Status>;
      if (typeof data.configured !== 'boolean' || typeof data.provider !== 'string' || typeof data.model !== 'string') throw new Error('AI service is unavailable. Start the app with npm run dev, then check again.');
      if (mounted.current && statusController.current === request) setStatus(data as Status);
    } catch (err) {
      if (mounted.current && statusController.current === request) {
        setStatus(null); setStatusError(request.signal.aborted ? 'The AI service did not respond. Check that the local server is running.' : err instanceof Error ? err.message : 'Unable to check AI connection.');
      }
    } finally { window.clearTimeout(timeout); if (mounted.current && statusController.current === request) setChecking(false); }
  }

  useEffect(() => {
    mounted.current = true;
    void checkStatus();
    const reset = () => {
      controller.current?.abort(); controller.current = null;
      setBusy(false); setMessages([]); setInput(''); setNotes(''); setNotesName(''); setIncludeNotes(false); setError(''); setRetry(null); setCancelled(false); setNotesError('');
      try { localStorage.removeItem(CHAT_KEY); sessionStorage.removeItem('elevai-planning-proposal:v1'); } catch { /* In-memory reset still works. */ }
    };
    window.addEventListener('elevai-reset', reset);
    return () => { mounted.current = false; controller.current?.abort(); statusController.current?.abort(); window.removeEventListener('elevai-reset', reset); };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-40))); setStorageError(false); }
    catch { setStorageError(true); }
  }, [messages]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, busy, error]);

  async function performRequest(request: PendingRequest) {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(''); setCancelled(false); setRetry(request);
    const timeout = window.setTimeout(() => abort.abort('timeout'), 75_000);
    try {
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.payload), signal: abort.signal });
      const data = await response.json().catch(() => null) as { reply?: unknown; error?: unknown; provider?: unknown; model?: unknown; proposal?: unknown } | null;
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `AI request failed (${response.status}). Check the server configuration and try again.`);
      if (typeof data?.reply !== 'string' || !data.reply.trim() || data.reply.length > 20_000) throw new Error('The provider returned an unreadable response. Please try again.');
      if (mounted.current && controller.current === abort) {
        setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'assistant', content: data.reply as string, fingerprint: request.fingerprint, revision: request.revision, timestamp: new Date().toISOString(), sourceSummary: request.sourceSummary, notesIncluded: request.notesIncluded, proposal: validProposal(data.proposal), provider: typeof data.provider === 'string' ? data.provider : status?.provider, model: typeof data.model === 'string' ? data.model : status?.model }].slice(-40) as ChatMessage[]);
        setRetry(null);
      }
    } catch (err) {
      if (mounted.current && controller.current === abort) {
        if (abort.signal.aborted && abort.signal.reason !== 'timeout') setCancelled(true);
        else setError(abort.signal.reason === 'timeout' ? 'The AI request timed out. Your question is saved; you can retry.' : err instanceof Error ? err.message : 'Unable to contact the AI provider. Please try again.');
      }
    } finally { window.clearTimeout(timeout); if (mounted.current && controller.current === abort) { setBusy(false); controller.current = null; } }
  }

  function ask(text = input) {
    const content = text.trim();
    if (!content || busy || !status?.configured) return;
    if (content.length > 4_000) { setError('Keep your question under 4,000 characters.'); return; }
    const attachNotes = includeNotes && !!notes.trim();
    const message: ChatMessage = { id: crypto.randomUUID(), role: 'user', content, fingerprint, revision: s.twin.revision, timestamp: new Date().toISOString(), sourceSummary, notesIncluded: attachNotes };
    const history = messages.filter(x => x.fingerprint === fingerprint).slice(-12).map(({ role, content: text }) => ({ role, content: text }));
    // Keep enough room for notes and telemetry within the gateway's request limit.
    while (history.length && new TextEncoder().encode(JSON.stringify(history)).length > 40_000) history.shift();
    const request: PendingRequest = {
      fingerprint, revision: s.twin.revision, sourceSummary, notesIncluded: attachNotes,
      payload: {
        messages: [...history, { role: 'user', content }],
        context: {
          twin: s.twin, scenario: s.scenario, simulationSeed: s.simulationSeed, riskTolerance: s.tolerance, enforceRiskTolerance: s.enforce,
          model: { health: m.health, risk: m.risk, rul: m.rul, rate: m.rate, stress: m.stress, interval: m.interval, future: m.future, projected: m.projected, contributions: contributions(m.projected, s.twin), riskTolerance: s.tolerance, enforceRiskTolerance: s.enforce },
          recentEvents: s.events.slice(0, 8), notes: attachNotes ? notes : '', investigation,
        },
      },
    };
    setMessages(previous => [...previous, message].slice(-40)); setInput(''); setIncludeNotes(false);
    void performRequest(request);
  }

  function submit(event: FormEvent) { event.preventDefault(); ask(); }

  async function importNotes(file?: File) {
    if (!file) return;
    setNotesError('');
    if (!file.name.toLowerCase().endsWith('.txt')) { setNotesError('Choose a plain-text .txt file.'); return; }
    if (file.size > NOTES_LIMIT) { setNotesError('Maintenance notes must be smaller than 30 KB.'); return; }
    try { const text = await file.text(); if (text.includes('\u0000')) throw new Error('This file is not plain text.'); setNotes(text); setNotesName(file.name); setIncludeNotes(false); }
    catch (err) { setNotesError(err instanceof Error ? err.message : 'Could not read this file.'); }
    if (fileInput.current) fileInput.current.value = '';
  }

  function reviewProposal(message: ChatMessage) {
    if (!message.proposal || message.fingerprint !== currentFingerprint.current) return;
    const envelope = { proposal: message.proposal, revision: s.twin.revision, scenario: s.scenario, createdAt: new Date().toISOString() };
    try {
      sessionStorage.setItem('elevai-planning-proposal:v1', JSON.stringify(envelope));
      window.dispatchEvent(new CustomEvent('elevai-planning-proposal', { detail: envelope }));
      navigate('/planning');
    } catch { setError('Browser session storage is unavailable. Open Target Planner and enter the proposed constraints manually.'); }
  }

  const previousContextCount = messages.filter(x => x.fingerprint !== fingerprint).length;
  return <>
    <Header eyebrow="GROUNDED CLOUD AI" title="Engineering copilot" description="Ask better questions of your twin. Turn the answer into a plan you can inspect." action={<button onClick={() => { controller.current?.abort(); controller.current = null; setBusy(false); setMessages([]); setError(''); setRetry(null); setCancelled(false); }} disabled={!messages.length && !busy}><RefreshCw size={14}/>New conversation</button>}/>
    <div className="assistant-layout">
      <div className="assistant-main">
        <section className={`assistant-connection ${status?.configured ? 'is-configured' : ''}`} aria-live="polite">
          <span className="assistant-connection-icon">{checking ? <LoaderCircle className="assistant-spin" size={17}/> : status?.configured ? <ShieldCheck size={19}/> : <Bot size={19}/>}</span>
          <div><strong>{checking ? 'Checking AI configuration' : status?.configured ? `${status.provider} · ${status.model}` : 'Connect your cloud AI'}</strong><p>{checking ? 'Reading the local server’s provider configuration.' : status?.configured ? 'Provider configured. Responses use the current twin and calculation engine.' : 'Add a provider API key on the server to enable real AI responses.'}</p></div>
          <button className="icon-button" aria-label="Recheck AI connection" title="Recheck AI connection" onClick={() => void checkStatus()} disabled={checking}><RefreshCw size={15}/></button>
        </section>
        {!checking && !status?.configured && <details className="assistant-setup" open><summary>Server setup <ChevronDown size={14}/></summary><p>Add your OpenAI API key to <code>.env.local</code> in the project folder, then check configuration below. The server reloads these settings automatically. Keep the key out of browser code and chat.</p><pre>OPENAI_API_KEY=your-key{'\n'}OPENAI_MODEL=gpt-5-mini</pre><p>See the project README for setup details. The fault investigation, target planner, and replay work without an AI connection.</p><button onClick={() => void checkStatus()} disabled={checking}>Check configuration <RefreshCw size={13}/></button></details>}
        {statusError && <div className="assistant-alert" role="status">{statusError}</div>}
        {storageError && <div className="assistant-alert" role="status">Browser storage is unavailable. This conversation will last only for this session.</div>}
        {previousContextCount > 0 && <div className="assistant-context-notice"><RefreshCw size={14}/><span>Your twin, scenario, or investigation changed. Earlier answers are marked as previous context; new questions use the current snapshot.</span></div>}
        <section className="assistant-chat panel" aria-label="Engineering copilot conversation">
          {!messages.length && <div className="assistant-welcome"><span className="assistant-orbit"><Bot size={27}/></span><Badge>EL-204 · TRACTION MOTOR</Badge><h2>A second perspective.<br/><span>Grounded in your twin.</span></h2><p>Explore the evidence behind a prediction, prepare an inspection, or describe the operating constraints for your next plan.</p><div className="assistant-prompts">{PROMPTS.map(prompt => <button key={prompt.title} onClick={() => setInput(prompt.text)}><span>{prompt.title}</span><ArrowUp size={14}/></button>)}</div></div>}
          <div className="assistant-messages" role="log" aria-live="polite" aria-relevant="additions">
            {messages.map(message => {
              const stale = message.fingerprint !== fingerprint;
              return <article key={message.id} className={`assistant-message ${message.role} ${stale ? 'previous-context' : ''}`}>
                <div className="assistant-message-meta"><strong>{message.role === 'assistant' ? <><Bot size={13}/>Engineering copilot</> : 'You'}</strong><span>Rev {message.revision}{stale ? ' · Previous context' : ''}</span>{message.notesIncluded && <span><FileText size={11}/> Notes included</span>}</div>
                <CitationText text={message.content}/>
                {message.proposal && <div className="assistant-proposal"><Badge>PROPOSED CONSTRAINTS · REVIEW REQUIRED</Badge><dl>{message.proposal.targetMonths !== undefined && <div><dt>Target horizon</dt><dd>{message.proposal.targetMonths} months</dd></div>}{message.proposal.budget !== undefined && <div><dt>Budget ceiling</dt><dd>{money(message.proposal.budget)}</dd></div>}{message.proposal.maxDowntimeHours !== undefined && <div><dt>Downtime limit</dt><dd>{message.proposal.maxDowntimeHours} hours</dd></div>}</dl><p>The planner will calculate feasibility after you review these values.</p><button disabled={stale} onClick={() => reviewProposal(message)}>Review in Target Planner →</button>{stale && <small>Ask again with the current twin before importing these constraints.</small>}</div>}
                <details className="assistant-snapshot"><summary>Context snapshot <ChevronDown size={11}/></summary><p>{message.sourceSummary}</p><p>{new Date(message.timestamp).toLocaleString()}{message.role === 'assistant' && message.model ? ` · ${message.provider} / ${message.model}` : ''}</p></details>
              </article>;
            })}
          </div>
          {busy && <div className="assistant-thinking" role="status"><LoaderCircle className="assistant-spin" size={15}/><span>Asking the cloud model with your snapshot…</span><button onClick={() => controller.current?.abort()}><Square size={11}/>Cancel</button></div>}
          {error && <div className="assistant-alert" role="alert"><p>{error}</p>{retry && !busy && <button disabled={retry.fingerprint !== fingerprint} onClick={() => void performRequest(retry)}>Retry question <RefreshCw size={13}/></button>}{retry && retry.fingerprint !== fingerprint && <small>The snapshot changed. Submit a new question using the current twin.</small>}</div>}
          {cancelled && !busy && <div className="assistant-cancelled" role="status">Request cancelled.{retry && retry.fingerprint === fingerprint && <button onClick={() => void performRequest(retry)}>Retry</button>}</div>}
          <div ref={bottom}/>
        </section>
        <form className="assistant-composer" onSubmit={submit}><label className="sr-only" htmlFor="assistant-question">Ask the engineering copilot</label><textarea id="assistant-question" rows={3} placeholder="Ask about this twin, or describe the constraints for your next plan…" value={input} maxLength={4_000} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); ask(); } }}/><div className="assistant-composer-toolbar"><span>Rev {s.twin.revision} · {includeNotes && notes.trim() ? 'Twin + engine + notes' : 'Twin + engine'}<small>Enter to send · Shift + Enter for a new line</small></span><button className="primary" type="submit" disabled={busy || !status?.configured || !input.trim()} aria-label="Send question">{busy ? <LoaderCircle className="assistant-spin" size={16}/> : <ArrowUp size={17}/>}Ask AI</button></div></form>
        <p className="assistant-disclosure">Sending a question shares your current simulated twin, engine results, recent events, and this snapshot’s conversation with the configured cloud provider. Notes are attached only when selected. AI answers can be wrong; proposed changes always require review.</p>
      </div>
      <aside className="assistant-context" aria-label="Context shared with AI">
        <section className="panel"><div className="section-title"><h2>Connected context</h2><Badge>REV {s.twin.revision}</Badge></div><div className="assistant-source"><div><span className="assistant-citation">[Twin]</span><Check size={13}/></div><strong>EL-204 · Traction motor</strong><p>Stored simulated telemetry, condition and recent event history.</p></div><div className="assistant-source"><div><span className="assistant-citation">[Engine]</span><Check size={13}/></div><strong>Calculated, before the AI responds</strong><dl><div><dt>Current health</dt><dd>{n(m.health, 0)}%</dd></div><div><dt>Current 90-day risk</dt><dd>{n(m.risk * 100, 1)}%</dd></div><div><dt>Scenario RUL · P50</dt><dd>{n(m.future.interval.p50)} mo</dd></div><div><dt>Scenario interval · P5–P95</dt><dd>{n(m.future.interval.p05)}–{n(m.future.interval.p95)} mo</dd></div></dl><p>Prototype model outputs. Risk is a fraction in the supplied model; the display uses percent.</p></div><Link className="assistant-text-link" to="/evidence">Inspect the model’s assumptions →</Link></section>
        <section className="panel assistant-notes"><div className="section-title"><h2>Maintenance notes</h2><FileText size={15}/></div><p>Add a text excerpt or import a .txt file. Its content is treated as user-supplied reference material.</p><div className="assistant-file-row"><button onClick={() => fileInput.current?.click()}><Upload size={13}/>Import .txt</button><small>Up to 30 KB</small><input ref={fileInput} type="file" accept=".txt,text/plain" className="sr-only" aria-label="Import maintenance notes" onChange={event => void importNotes(event.target.files?.[0])}/></div>{notesName && <div className="assistant-file-name"><FileText size={12}/><span>{notesName}</span><button className="icon-button" aria-label="Remove maintenance notes" onClick={() => { setNotes(''); setNotesName(''); setIncludeNotes(false); setNotesError(''); }}><X size={13}/></button></div>}<label className="sr-only" htmlFor="assistant-notes">Paste maintenance notes</label><textarea id="assistant-notes" rows={7} value={notes} placeholder="Paste a maintenance log, inspection finding, or manual excerpt…" onChange={event => { const value = event.target.value; if (new TextEncoder().encode(value).length > NOTES_LIMIT) { setNotesError('Keep maintenance notes under 30 KB.'); return; } setNotes(value); setNotesName(''); setNotesError(''); if (!value.trim()) setIncludeNotes(false); }}/><div className="assistant-notes-count">{new TextEncoder().encode(notes).length.toLocaleString()} / 30,000 bytes</div>{notesError && <p className="assistant-notes-error" role="alert">{notesError}</p>}<label className="assistant-attach"><input type="checkbox" checked={includeNotes} disabled={!notes.trim() || busy} onChange={event => setIncludeNotes(event.target.checked)}/><span>Attach notes to my next question<small>Clears after sending. Text stays in this session only.</small></span></label></section>
        <div className="assistant-boundary"><ShieldCheck size={17}/><p>The AI explains evidence and suggests constraints. The calculation engine determines feasibility. Only you apply an intervention.</p></div>
      </aside>
    </div>
  </>;
}
