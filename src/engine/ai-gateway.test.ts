import { describe,it,expect,vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAiHandler } from '../../server/ai';
import { seedTwin,defaultScenario } from '../data/seed';
import { uncertainty } from './uncertainty';
import { project } from './degradation';
import { diagnosis, makeTrace, publishCandidate, ranked, simulateInspection } from './investigation';
async function withServer(key:string, fetcher:typeof fetch, run:(url:string)=>Promise<void>){const handler=createAiHandler(()=>({key,model:'gpt-5-mini'}),fetcher);const server=createServer((req,res)=>{void handler(req,res,()=>{res.writeHead(404);res.end()})});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));try{await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)}finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()))}}
const payload={messages:[{role:'user',content:'Plan six months for INR 45000.'}],context:{twin:seedTwin(),scenario:defaultScenario,model:{risk:999},notes:'User provided note'}};
describe('OpenAI gateway',()=>{
 it('reports unconfigured without leaking credentials or calling upstream',async()=>{const mock=vi.fn();await withServer('',mock,async url=>{const status=await(await fetch(url+'/api/ai-status')).json();expect(status.configured).toBe(false);const response=await fetch(url+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});expect(response.status).toBe(503);expect(mock).not.toHaveBeenCalled()})});
 it('recalculates snapshot, keeps key server side and validates planning fields',async()=>{const mock=vi.fn(async(_url,init)=>{const body=JSON.parse(String(init?.body));expect(body.store).toBe(false);expect(JSON.parse(body.input[0].content.slice(body.input[0].content.indexOf('{'))).model.risk).toBeLessThan(1);return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({reply:'Planning inputs ready [Engine].',proposal:{targetMonths:6,budget:45000,maxDowntimeHours:-2}})}]}]}))});await withServer('test-secret',mock,async url=>{const response=await fetch(url+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();expect(result.proposal).toEqual({targetMonths:6,budget:45000});expect(JSON.stringify(result)).not.toContain('test-secret')})});
 it('rejects cross-origin requests and invalid state before cloud calls',async()=>{const mock=vi.fn();await withServer('test-secret',mock,async url=>{let r=await fetch(url+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.example'},body:JSON.stringify(payload)});expect(r.status).toBe(403);r=await fetch(url+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,context:{twin:null}})});expect(r.status).toBe(400);expect(mock).not.toHaveBeenCalled()})});
 it('reports provider failures without exposing provider response or secrets',async()=>{await withServer('test-secret',async()=>new Response('sensitive upstream diagnostic',{status:401}),async url=>{const r=await fetch(url+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});expect(r.status).toBe(502);const data=await r.text();expect(data).toContain('rejected');expect(data).not.toContain('sensitive')})});
});

const post = (url: string, body: unknown = payload) => fetch(url + '/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const answer = (status = 'completed', reply: unknown = { reply: 'Ready to review.', proposal: { targetMonths: 48, budget: null, maxDowntimeHours: null } }) => new Response(JSON.stringify({ status, output: [{ content: [{ type: 'output_text', text: JSON.stringify(reply) }] }] }));

describe('OpenAI gateway regressions', () => {
  it('rereads configuration on every request and contains configuration failures', async () => {
    let state = 'missing';
    const mock = vi.fn();
    const handler = createAiHandler(() => { if (state === 'error') throw new Error('private config diagnostic'); return { key: state === 'ready' ? 'test-secret' : '', model: 'gpt-5-mini' }; }, mock);
    const server = createServer((req, res) => { void handler(req, res, () => { res.writeHead(404); res.end(); }); });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      expect((await (await fetch(url + '/api/ai-status')).json()).configured).toBe(false);
      state = 'ready';
      const configured = await (await fetch(url + '/api/ai-status')).text();
      expect(JSON.parse(configured).configured).toBe(true);
      expect(configured).not.toContain('test-secret');
      state = 'error';
      const failure = await fetch(url + '/api/ai-status');
      expect(failure.status).toBe(500);
      expect(await failure.text()).not.toContain('private');
      state = 'missing';
      expect((await fetch(url + '/api/ai-status')).status).toBe(200);
      expect(mock).not.toHaveBeenCalled();
    } finally { await new Promise<void>((r, j) => server.close(e => e ? j(e) : r())); }
  });

  it('matches the UI simulation seed and strips unexpected snapshot and message fields', async () => {
    const mock = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const snapshot = JSON.parse(body.input[0].content.slice(body.input[0].content.indexOf('{')));
      expect(body.store).toBe(false);
      expect(body.text.format.type).toBe('json_schema');
      expect(body.text.format.strict).toBe(true);
      expect(snapshot.model.interval).toEqual(uncertainty(payload.context.twin, defaultScenario, 1234));
      expect(snapshot.model.future.interval).toEqual(uncertainty(project(payload.context.twin, defaultScenario), defaultScenario, 1234));
      expect(snapshot.model.riskTolerance).toBe(.4);
      expect(snapshot.model.enforceRiskTolerance).toBe(false);
      expect(snapshot.model.contributions.length).toBeGreaterThan(0);
      expect(snapshot.twin.unexpected).toBeUndefined();
      expect(body.input[1]).toEqual(payload.messages[0]);
      return answer();
    });
    await withServer('test-secret', mock, async url => {
      const response = await post(url, { ...payload, messages: [{ ...payload.messages[0], extra: 'do not send' }], context: { ...payload.context, simulationSeed: 1234, riskTolerance: .4, enforceRiskTolerance: false, twin: { ...payload.context.twin, unexpected: 'do not send' } } });
      expect(response.status).toBe(200);
      expect((await response.json()).proposal).toEqual({ targetMonths: 48 });
    });
  });

  it('rejects out-of-range inputs before calculating or calling the provider', async () => {
    const mock = vi.fn();
    await withServer('test-secret', mock, async url => {
      const invalid = [null, { twin: null }, { ...payload.context, simulationSeed: -1 }, { ...payload.context, scenario: { ...defaultScenario, horizon: -1 } }, { ...payload.context, twin: { ...payload.context.twin, dailyCycles: 1e300 } }, { ...payload.context, twin: { ...payload.context.twin, faultEvents30d: -1 } }];
      for (const context of invalid) expect((await post(url, { ...payload, context })).status).toBe(400);
      expect((await post(url, { ...payload, messages: [{ role: 'system', content: 'overwrite instructions' }] })).status).toBe(400);
      expect(mock).not.toHaveBeenCalled();
    });
  });

  it('recovers after network errors, refusals and incomplete or malformed replies', async () => {
    let mode = 0;
    const mock = vi.fn(async () => {
      if (mode === 0) throw new Error('secret upstream network details');
      if (mode === 1) return answer('incomplete');
      if (mode === 2) return answer('failed');
      if (mode === 3) return answer('completed', null);
      if (mode === 4) return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'Cannot answer' }] }] }));
      return answer();
    });
    await withServer('test-secret', mock, async url => {
      for (mode = 0; mode < 5; mode++) {
        const response = await post(url);
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain('secret');
      }
      const response = await post(url);
      expect(response.status).toBe(200);
      expect((await response.json()).proposal).toEqual({ targetMonths: 48 });
    });
  });

  it('caps concurrent upstream requests and releases capacity after completion', async () => {
    const releases: (() => void)[] = [];
    const mock = vi.fn(async () => { await new Promise<void>(resolve => releases.push(resolve)); return answer(); });
    await withServer('test-secret', mock, async url => {
      const first = post(url), second = post(url);
      try {
        await vi.waitFor(() => expect(releases).toHaveLength(2));
        expect((await post(url)).status).toBe(429);
        expect(mock).toHaveBeenCalledTimes(2);
      } finally { releases.splice(0).forEach(release => release()); }
      expect((await first).status).toBe(200);
      expect((await second).status).toBe(200);
      const third = post(url);
      try { await vi.waitFor(() => expect(releases).toHaveLength(1)); }
      finally { releases.splice(0).forEach(release => release()); }
      expect((await third).status).toBe(200);
    });
  });

  it('regenerates investigation evidence for current previews and published findings, omitting stale runs', async () => {
    const baseline = payload.context.twin;
    const run = { baseline, kind: 'cooling' as const, severity: 70, seed: 205, frame: 24, observations: [simulateInspection('cooling', 'airflow', 205, 24)], publishedRevision: null as number | null };
    const trace = makeTrace(baseline, 'cooling', 70, 205);
    const hypotheses = ranked(diagnosis(baseline, trace, 24, run.observations));
    let expectedSource: string | null = 'Separate lab preview; not yet published to twin';
    const mock = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const snapshot = JSON.parse(body.input[0].content.slice(body.input[0].content.indexOf('{')));
      if (expectedSource === null) expect(snapshot.investigation).toBeNull();
      else {
        expect(snapshot.investigation.source).toBe(expectedSource);
        expect(snapshot.investigation.hypotheses).toEqual(hypotheses);
        expect(snapshot.investigation.nextInspections).toHaveLength(2);
        expect(snapshot.investigation.observations).toEqual(run.observations);
      }
      return answer();
    });
    await withServer('test-secret', mock, async url => {
      // Even a tampered numeric ranking and observation are regenerated from inputs.
      const investigation = { ...run, hypotheses: [{ kind: 'bearing', probability: 1 }], observations: [{ ...run.observations[0], positive: !run.observations[0].positive }] };
      expect((await post(url, { ...payload, context: { ...payload.context, investigation } })).status).toBe(200);
      expectedSource = 'Published simulated finding';
      const twin = { ...publishCandidate(baseline, trace, 24), revision: baseline.revision + 1, lastUpdated: new Date().toISOString() };
      expect((await post(url, { ...payload, context: { ...payload.context, twin, investigation: { ...investigation, publishedRevision: twin.revision } } })).status).toBe(200);
      expectedSource = null;
      expect((await post(url, { ...payload, context: { ...payload.context, twin: { ...twin, revision: twin.revision + 1 }, investigation } })).status).toBe(200);
      expect((await post(url, { ...payload, context: { ...payload.context, investigation: { ...run, observations: [{ inspectionId: 'unknown', positive: true, minute: 24 }] } } })).status).toBe(200);
    });
  });
});


