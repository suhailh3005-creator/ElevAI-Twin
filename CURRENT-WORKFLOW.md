# Manual elevator workspace

The latest incremental update adds operational usage metrics, optional starting counters, counter reconciliation, data-quality review and normalized usage trends to Overview / Digital Twin. Existing experimental models and storage remain. See [USAGE-INCREMENT.md](USAGE-INCREMENT.md) for the assessment, formulas, validation rules and deferred stages.

## Start

Run `npm ci` once, then `npm run dev -- --port 5174 --strictPort`. Open http://127.0.0.1:5174/.

The first screen is an empty registry. Add a project name and elevator name (for example, ELAB 202), then enter a start/end measurement period and all required motor readings. Example labels are placeholders, not saved assets. Return through **All elevators** to add or open another elevator.

## Measurements

The entry form collects motor age, lifetime operating hours/cycles, period operating hours/cycles, average load, winding temperature, bearing temperature, vibration velocity RMS, measured/reference current and measured/reference voltage, fault count, and optional source notes. Period temperatures and electrical values must use a consistent measurement method. Electrical deviation is a signed difference from the supplied reference; it is not three-phase imbalance or harmonic distortion.

Periods must end in the past and have positive duration. Operating hours cannot exceed elapsed time or lifetime counters. Later periods cannot overlap previous periods; lifetime counters cannot decrease. After a physical motor replacement, register a new motor/elevator record rather than resetting history silently.

## Calculations and scope

Only the motor is modelled. No fixed component-health percentages, sample fleet, generated history or injected faults are shown.

The user authorized retaining explicitly experimental formulas. The default v3 model therefore uses an openly disclosed condition-index heuristic based on entered age, cumulative usage, temperatures, vibration, electrical deviations and faults. This replaces the original fixed initial degradation of 0.37. Its weights/reference scales are not validated industry thresholds. The original daily-wear stress concept is adapted to the entered period usage, separate winding/bearing readings and relative electrical deviations.

All formulas and source descriptions are visible and editable per elevator in **Evidence**. An arithmetic parser accepts named variables, + - * / ^, min/max/abs/sqrt/exp/log/clamp; it never executes JavaScript. Degradation must be 0–1 and rate nonnegative. Invalid custom model outputs leave measurements accessible and show a calculation error.

- Health = (1 − degradation) × 100.
- Future degradation = initial degradation + daily rate × elapsed days.
- Days to threshold = max(0, threshold − degradation) / daily rate.
- Zero rate below threshold gives no predicted crossing, not a guarantee of unlimited life.

Forecasts start at the latest observation period end. They are conditional projections, not measured history or calibrated failure probabilities. Graphs of measured history require at least two recorded periods. Editing formulas recalculates estimates; recorded readings remain immutable.

## Workspaces

- **Overview / Digital Twin:** entered vitals, period data and measured history.
- **Prognostics:** per-elevator experimental condition, rate and time-to-threshold projections.
- **Scenario Lab:** test explicitly entered alternative readings without overwriting measurements.
- **Decision Engine:** save quoted costs, downtime and explicitly assumed post-work degradation/rate. No default intervention prices or fabricated outcomes.
- **Investigation:** compare real entered periods and optional user-supplied upper limits. No synthetic fault probabilities.
- **Response Planner:** compare baseline and saved intervention assumptions against budget/downtime/horizon; replay paired forecasts; search continuous technician availability. Windows rank earliest first without a fabricated building traffic profile. They must finish before the model threshold date. Saved plans become stale when readings or formulas change.
- **AI Assistant:** optional OpenAI context is restricted to the selected elevator's latest record, formulas and options. The server recalculates results. The assistant cannot mutate data. Conversations are view-local; API settings remain server-only in `.env.local`.

## Local database

Registry data is saved under `elevai-manual-registry:v1` in localStorage. It is scoped to the browser profile and origin (host and port). Each elevator has independent readings, formula configuration, monitoring limits, comparison options, plans and event history. The old demo's localStorage keys are ignored, not migrated into measured records.

Export backups from the registry. Import validates the schema and adds previously unseen elevator IDs without overwriting existing ones. A storage write failure is reported and does not pretend a record was saved. This is browser-local persistence, not a shared SQL server or automatic cloud backup.

## Validation

`npm test` runs the calculation suites, including manual-model parser, input validation, stress response, planning and scheduling tests.

`npm run build` checks TypeScript and produces the app.

`node scripts/manual-check.mjs` runs isolated headless Edge checks for creation, multi-elevator isolation, period validation, formula updates, target/replay/scheduling, measured-limit checks, selected-only AI context (mocked), persistence, backup restore and mobile layout. It does not add test elevators to the user's browser profile or call OpenAI.

Legacy scripts and engine tests remain for reference; use `manual-check.mjs` for the active interface.
