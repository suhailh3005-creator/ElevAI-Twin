# Incremental traction-motor usage foundation

## Assessment before changes

The active routes use `src/manual` (React, Zustand and browser localStorage). Earlier `src/pages`, `src/engine` and `src/store` implementations remain in the project but are not the current routed app. The existing `Elevator.readings` array already retains raw, dated motor measurements and generated-sample provenance. The six requested usage fields correspond to `operatingHours`, `totalCycles`, `start`, `end`, `periodCycles` and `periodOperatingHours`; none were renamed.

The project already provides multiple elevators, sensor history, validation, editable experimental formulas, assumed intervention comparisons, local plans and an optional AI gateway. Its experimental health and time-to-threshold outputs are not validated physical-health, failure or RUL predictions. There are no verified failure labels or measured degradation labels in the current schema. No ML training is justified by this implementation alone.

## Scope of this increment

Stages 1–4 only: extend measured usage, reconciliation and historical operational analysis. Existing architecture, routes, model equations and outputs remain. No new API endpoints or data source were introduced.

### Changes

- `src/manual/engine.ts`: optional starting counters on `Reading`; pure usage metrics, quality checks and statistical classifications; optional `UsageSettings` on the existing elevator record. Existing experimental formulas are unchanged.
- `src/manual/store.ts`: validate/persist optional usage settings and identify duplicate new intervals explicitly. Existing localStorage key and version 1 remain. Existing records do not require migration.
- `src/manual/Registry.tsx`: optional start-counter inputs in the existing measurement form. No new required fields.
- `src/manual/Pages.tsx`: an operational summary on Overview and expanded metrics, charts, raw-period table, reconciliation and adjustable analysis settings on Digital Twin.
- `src/manual/manual.css`: styles for those added panels, using existing layout conventions.
- `src/manual/usage.test.ts`: calculation, data-quality, compatibility and isolation tests.
- `scripts/usage-check.mjs`: browser checks for the new panel and form fields, run after `scripts/manual-check.mjs` creates isolated test fixtures.

## Calculation traceability

Raw inputs remain stored as entered. These results are calculated on demand rather than saved as redundant derived fields:

- Elapsed days = (end timestamp − start timestamp) / 86,400,000.
- Hours/day = supplied interval hours / elapsed days.
- Cycles/day = supplied interval cycles / elapsed days.
- Cycles/operating hour = supplied interval cycles / supplied interval hours.
- Usage growth (%) = (latest normalized rate − previous normalized rate) / previous normalized rate × 100.
- Counter-derived interval = ending cumulative counter − available starting counter.

Zero denominators produce unavailable rather than infinity. The cumulative totals remain the latest entered ending counters; history with missing intervals is not summed into a false cumulative total.

Start counters can be supplied explicitly, or the preceding ending counter can be used when the measurement boundary is exactly contiguous. Counter differences across gaps are not assigned to the current period. Hours reconciliation allows 0.001 h of numeric/entry precision; cycles reconcile exactly. Tables expose both raw values and the counter-derived difference.

## Validation and raw-data preservation

Existing invalid-input rejection remains: negative/nonfinite values, reversed/future dates, impossible interval hours, decreasing cumulative counters on new records and overlapping new records. Failed submissions leave the form values available for correction. Duplicate new intervals now receive a specific error.

Quality analysis also identifies gaps, overlaps/duplicates in historical imports, decreasing counters, unknown starting counters, explicit boundary mismatches and cycles recorded with zero hours. Counter/period mismatches are retained unchanged and visibly flagged; there is no automatic correction. Existing historical records are never rewritten by this layer.

## Trend semantics

Increasing, decreasing, relatively stable and irregular compare normalized adjacent usage rates in the latest consecutive eligible segment (up to 12 periods). The default 5% stability tolerance is an editable analysis assumption. The optional anomalous-usage screen needs at least five preceding comparable periods and nonzero median absolute deviation (MAD). It flags a latest value beyond the configured MAD multiplier and stability tolerance; the default multiplier is 3. These settings are explicitly statistical assumptions, not engineering thresholds or proof of a fault.

Generated sample records are not eligible for measured trend classification. Quality warnings/errors break the comparison segment. Raw records and all quality information remain visible. The latest period’s direct metrics remain available even when its trend cannot be classified.

## Preserved behavior

No existing classes/functions/routes/storage fields were renamed. Formula editing, experimental forecasts, scenarios, maintenance comparisons, scheduling, AI routes, demo autofill and export/import remain. Optional fields round-trip through the existing JSON backup. Measured operational indicators are shown separately from experimental condition/forecast estimates.

## Deferred next stages

Motor metadata and actual maintenance/fault-event records should be added to the existing elevator structure in a subsequent increment. An audit message or a saved hypothetical plan is not an actual maintenance/failure event. No predictive model or modernization recommendation was added. Establish reliable field records and verified event labels before assessing model readiness.
