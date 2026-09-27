# ElevAI Twin

## Current application: manual multi-elevator workspace (v3)

The active app now starts with an empty elevator registry. Enter a project, elevator name, measurement period and motor vitals; no demonstration readings are automatically loaded. Each elevator has independent measurements, formulas, limits, intervention assumptions and plans, saved in this browser's localStorage. Export/import JSON backups from the registry.

See [CURRENT-WORKFLOW.md](CURRENT-WORKFLOW.md) for the current data model, formulas, limitations and checks. Start with `npm run dev -- --port 5174 --strictPort` and open the printed localhost URL. The experimental formulas can be inspected and edited in Evidence.

**The notes below describe the original archived demonstration workflow. Its seeded state, synthetic fault lab, fixed costs and old screenshots are not the current routed interface.**

A digital-twin decision-support prototype for the EL-204 traction motor. React, Vite, strict TypeScript, Tailwind CSS, React Router, Recharts, Lucide and persisted Zustand. All engineering calculations, fault classification and planning work locally. The optional OpenAI assistant uses a server-only gateway attached to the local Vite server.

## Run

Requires Node.js 20.19+ and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For the demo, use `npm run build` then `npm run preview`. Both commands support the AI gateway. Keep that terminal running. Only cloud AI needs internet; the rest of the application works offline after installation. Use the same browser profile and origin to retain localStorage. This is a locally served application, not a double-click HTML file or an installed PWA.

## OpenAI setup

Set `OPENAI_API_KEY` in the ignored `.env.local` file. `OPENAI_MODEL` defaults to `gpt-5-mini`. Never put the key in a `VITE_` variable, browser storage, or source code. Save the file and click **Recheck connection** in AI Assistant. The server reloads the environment file for each request; no restart is required. The status badge checks configuration, not whether API billing/model access is valid; sending a question verifies the actual provider call.

The assistant sends the current simulated twin, scenario, recent events, and optional user-selected text notes to OpenAI only when a question is submitted. The server recomputes numerical evidence and requests a structured response. AI replies can propose editable planning constraints, but never change the twin or book maintenance. The engine searches for feasibility only after the user reviews the constraints and runs the planner. No provider key means a clear setup state, not a simulated AI answer.

The gateway is intended for a locally served demo on loopback. A public deployment would need its own authenticated server, rate limits and secret management; uploading only `dist/` does not provide cloud AI. API calls use `store: false`; this does not override the provider's broader data policies.

Implementation reference: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Verification

```sh
npm test
npm run build
```

## Structure

- `src/engine`: degradation, logistic risk, Monte Carlo, optimization, interventions, synthetic-trained fault classification, information-gain inspection selection, target search, counterfactual replay and scheduling; Vitest tests.
- `src/store`: Zustand state, localStorage recovery and event persistence (`elevai-twin:v1`).
- `src/data`, `src/types`: official seed, static fleet context and strict domain types.
- `src/components`, `src/layouts`: accessible dialogs, technical SVG, charts and application shell.
- `src/pages`: the original six pages plus Investigation, Response Planner and AI Assistant.
- `server/ai.ts`: loopback-only OpenAI gateway shared by dev and production preview; the secret is excluded from the frontend build.
- `src/hooks`, `src/utils`: memoized model outputs and consistent Indian numeric formatting.

## Judging sequence

1. Reset Demo, confirm. Overview starts at 63% health, roughly 68% model risk and 6–7 months estimated RUL.
2. Digital Twin → View raw state. Show revision 42 and actual state JSON.
3. Prognostics → show the weighted feature terms and 500-sample prediction interval.
4. Scenario Lab → move Traffic change to +40%. Cycles become 588; RUL falls to roughly 4–5 months. Save the scenario.
5. Decision Engine → default priorities recommend Replace. To demonstrate sensitivity, disable the risk constraint and set Cost to 100%; Repair wins. Restore default priorities via Reset Demo and repeat +40% traffic if needed.
6. Preview Replace → show computed before/after results → Apply to digital twin.
7. Return to Overview → health is 96%, risk falls and RUL rises. Revision increments to 43.
8. Refresh → changed state remains. Evidence includes the intervention event.
9. Shift+R → Reset prototype → official starting state returns.

Keys 1–9 navigate pages. Shift+R opens reset confirmation; shortcuts are ignored inside form controls and dialogs.

## New demonstration: fault to response

1. Reset Demo, then open **Investigation**.
2. Choose cooling restriction, inject, and play or complete the evolving telemetry trace.
3. Show the ranked hypotheses, observe the recommended simulated inspection, and explain the expected information gain. Open the model card to show synthetic training and holdout results.
4. Publish the snapshot to the twin. Show the new revision and changed prognostics.
5. Open **Response Planner → What would it take?** Set the target horizon, budget, downtime and permitted operating changes. Search, then load a feasible scenario or explain why no searched plan meets the limits.
6. Use **Intervention replay** to compare the same operating conditions with and without the proposed intervention. A late intervention retains the earlier threshold crossing.
7. Use **Maintenance windows** to search dated technician availability and simulated building traffic; save a local plan and show its event in Evidence.
8. With an OpenAI key configured, ask **AI Assistant** to explain the current risk or turn a natural-language request into planning constraints. Review those inputs and run the deterministic search.

## Model boundaries

RUL means time to degradation 0.55, not catastrophic failure. The logistic 90-day risk is an uncalibrated prototype model, not a trained production predictor. Optimizer residual risks are assumptions distinct from calculated prognostic risk. Other components and assets are explicitly static architecture context. The 12-month graph is simulated seed history, never rewritten to imply a historical intervention. Scenario inputs remain future assumptions after an intervention and are applied to the updated baseline. Telemetry replay advances one simulated day; it does not connect to equipment.

The Gaussian naive Bayes classifier is trained on 1,280 synthetic examples and evaluated on 480 independent synthetic examples from the same generator. Its scores rank four modeled signatures; they are not field-calibrated diagnostic probabilities. Unmodeled and combined faults are outside its scope. Inspection likelihoods are explicit assumptions, and simulated inspection observations use the injected cause. Fault publishing changes readings, not accumulated degradation instantaneously.

Target planning searches a bounded discrete grid, sorted by intervention cost and then operating burden. Operating-change implementation costs are excluded. Scheduling assumes continuous crew availability during selected days/hours, uses a simulated traffic profile, and saves plans locally without an external booking. Deterministic threshold feasibility is never permission to operate an elevator.
