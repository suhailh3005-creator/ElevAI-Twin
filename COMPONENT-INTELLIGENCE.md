# Component intelligence and smooth motion — implementation report

**Historical report:** See [Component observations](COMPONENT-OBSERVATIONS.md) and [Correction and hologram report](CORRECTION-HOLOGRAM.md) for current four-component scope, four-factor Sheave calculation, holographic colours and experimental RUL. The workflow and palette below describe an earlier milestone.

## Existing architecture inspected

The active `#/twin` route is the `Twin` component in `src/manual/Pages.tsx`. Its lazy-loaded `ElevatorTwin3D` panel owns transient interaction state; `components.ts`, `geometry.ts`, `model.ts` and `scene.ts` already provide the 17 identities and Three.js rendering. The application continues to use React, TypeScript, React Router, Zustand and the existing version-1 localStorage registry. Existing motor calculations, recorded usage and the Vite AI integration are retained.

The attached specification was implemented as an incremental extension. Its thresholds are identified as **user-supplied project assumptions**, not verified manufacturer limits or certified elevator-industry criteria. Its gearbox validation note explicitly resolves the inconsistent `F_F_O` term to oil-condition `F_O`.

## Existing files modified

- `src/manual/engine.ts`: optional `componentInspections` and installed `driveType` metadata on each elevator. Existing motor formulas are unchanged.
- `src/manual/store.ts`: validates/restores/exports component records and adds inspection/drive-type save actions with event logging. Legacy backups remain valid. Gearbox observations require a confirmed geared elevator.
- `src/manual/twin3d/components.ts`: adds Critical, maps it to red, and maps Normal/Warning/Repair Required to yellow while preserving their separate labels.
- `src/manual/twin3d/scene.ts`: smooth selection focus, camera reset, rotation buttons, zoom buttons and wheel zoom; orbit damping; interruptible transitions; reduced-motion support; cleanup.
- `src/manual/twin3d/ElevatorTwin3D.tsx`: synchronized registry-based dropdown, inspection panel, saved evaluation-to-3D binding, sidebar position reset on selection/save.
- `src/manual/twin3d/twin3d.css`: scoped inspection layout and responsive styling.
- `src/manual/twin3d/twin3d.test.ts`: updates color expectations for the new requested Critical/Repair semantics.
- `scripts/twin3d-check.mjs`: waits for eased camera transitions and verifies click/dropdown synchronization.
- `3D-EXTENSION.md`: points to this later phase; the earlier report describes the previous milestone.

## New files created

- `src/manual/inspection/engine.ts`: reusable configuration-driven evaluation, validation, evidence and visualization adapter.
- `src/manual/inspection/InspectionPanel.tsx`: reusable input/result/evidence panel for the four components.
- `src/manual/inspection/inspection.test.ts`: formula, boundary, missing-input, validation and motion tests.
- `src/manual/twin3d/motion.ts`: shared bounded smootherstep interpolation.
- `scripts/inspection-check.mjs`: isolated browser tests for calculations, persistence and smooth transitions.
- `COMPONENT-INTELLIGENCE.md`: this report.

Test artifacts are under `artifacts/inspection/`, including desktop/mobile screenshots and animation frame-timing observations. Existing regression scripts regenerate their artifacts as usual.

## Dependencies added

None in this phase. The existing Three.js and OrbitControls integration is extended.

## Component evaluation engine

The input pipeline is: saved observation → validation → threshold classification → categorical normalization → weighted risk → complementary health → worst-known-parameter status → evidence → 3D presentation.

The default factors are Normal = 0, Warning = 0.5 and Critical = 1. They are explicit and configurable in the input form, saved with each observation, and displayed in Evidence & Formulas. Configuration must contain ordered finite factors in [0,1]. Parameter thresholds and weights live in one definition registry. Raw measurements are preserved separately from derived results, and evaluations are deterministic.

For numerical bands, the warning lower and upper endpoints are inclusive; Critical starts strictly above the upper endpoint. Categorical values must match listed choices. Counts must be nonnegative safe integers; wear/slip percentages are bounded to 0–100; deviation inputs are nonnegative magnitudes; temperatures cannot fall below absolute zero. Units are fixed and shown alongside every field. No motor reading is silently substituted for a different component's measurement.

Missing inputs are not zero. Partial observations may be saved, but any missing/invalid prerequisite prevents a numerical health/risk score. A known Critical or Warning input remains visible even if another input is missing; the panel explicitly labels that assessment incomplete. Normal requires all prerequisites to be known and normal.

Records include component ID, observation period, entry timestamp, source, raw values, normalization and formula version. Multiple observations are retained. The newest period end, then newest entry timestamp, determines the current assessment. There is no automatic sensor feed or generated history. Fault counts apply to the entered period; the supplied bands do not normalize differing period durations.

## Brake implementation

`Risk = 100 × (0.30F_T + 0.35F_RT + 0.20F_W + 0.15F_F)`; `Health = 100 − Risk`.

| Parameter | Normal | Warning | Critical |
|---|---|---|---|
| Temperature | <70 °C | 70–90 °C | >90 °C |
| Response time | <100 ms | 100–150 ms | >150 ms |
| Wear | <50% | 50–75% | >75% |
| Faults | 0 | 1–2 | >2 |

The supplied example (82 °C, 120 ms, 35% wear, one fault) produces 40 risk and 60 health. A brake-specific safety note is included.

## Gearbox implementation

`Risk = 100 × (0.25F_T + 0.35F_V + 0.25F_O + 0.15F_L)`; `Health = 100 − Risk`.

| Parameter | Normal | Warning | Critical |
|---|---|---|---|
| Temperature | <70 °C | 70–85 °C | >85 °C |
| Vibration | <3.5 mm/s | 3.5–5 mm/s | >5 mm/s |
| Oil condition | Good | Degraded | Critical condition |
| Leakage | None | Minor | Significant |

The user must confirm installed drive type before a gearbox inspection can be saved/evaluated. The existing schematic selector remains a viewing option. Changing confirmed type to gearless preserves historical observations but suspends the current gearbox assessment and hides the gearbox layout. Confirming geared updates the schematic accordingly.

## VFD / Drive implementation

`Risk = 100 × (0.30F_I + 0.20F_V + 0.25F_T + 0.25F_F)`; `Health = 100 − Risk`.

| Parameter | Normal | Warning | Critical |
|---|---|---|---|
| Current deviation magnitude | <5% | 5–10% | >10% |
| Voltage deviation magnitude | <5% | 5–10% | >10% |
| Temperature | <60 °C | 60–75 °C | >75 °C |
| Faults | 0 | 1–3 | >3 |

The form requests deviation magnitudes rather than guessing a reference from motor current/voltage fields.

## Traction Sheave implementation

`Risk = 100 × (0.35F_W + 0.30F_S + 0.20F_V + 0.15F_T)`; `Health = 100 − Risk`.

| Parameter | Normal | Warning | Critical |
|---|---|---|---|
| Wear | <10% | 10–20% | >20% |
| Rope slip | <2% | 2–5% | >5% |
| Vibration | <3.5 mm/s | 3.5–5 mm/s | >5 mm/s |
| Temperature | <60 °C | 60–75 °C | >75 °C |

## 17-component selector

The dropdown is generated from the existing 17-ID registry. Dropdown, component list, 3D picking, highlight and information panel share one selected ID. Selecting a hidden component through the list/dropdown reveals it for inspection if applicable. Gearbox identity and applicability information remain inspectable when the physical gearbox is absent from the schematic. Other unevaluated components explicitly state that evaluation is not yet implemented. The existing traction-motor readings remain available without duplicated motor calculations.

## 3D component focus behavior

Selection smoothly moves the existing orthographic camera toward the selected component, with padding that leaves neighboring equipment visible. It does not duplicate, detach or permanently transform geometry. Clearing selection restores the previous camera pose; Reset view returns to a framed layout. Assemble/explode retain exact endpoint transforms.

Camera target, position and zoom interpolate over 720 ms using `6t⁵ − 15t⁴ + 10t³`, with zero endpoint velocity and acceleration. Rapid selections start the replacement transition from the currently rendered pose. Mouse/touch orbit interrupts camera animation naturally. Orbit damping decays after input; wheel zoom and camera buttons are eased. Reduced-motion preference bypasses transitions and inertia, including when the preference changes during an animation.

Rendering is demand-driven, continues only through active transitions or settling controls, pauses offscreen and stops at rest. Geometry is retained between selection/status updates. Event handlers, media-query listeners, observers, animation frames and GPU resources are cleaned up on unmount. Actual frame rate depends on hardware/browser load; smooth interpolation is not a promise of a fixed FPS on every device.

## Inspection panel

Desktop presents the focused component and a scrollable inspection panel side by side. Small screens stack them. The panel shows identity, semantic status, health/risk indices, prediction availability, maintenance criteria, entry form, evidence and safety context. Source and observation dates are visible. Saving updates only that elevator's component history and derived state; it does not overwrite motor measurements, formulas or maintenance plans.

Critical is red. Normal and Warning / Repair Required are yellow as requested, with distinct semantic/text labels. This palette remains centralized in `statusAppearance`. The earlier manual visual-test control remains clearly labeled, transient and separate from saved evaluation results.

## Evidence and formula display

Evidence & Formulas expands to show the actual raw inputs, units, classification, numeric factor, weight, weighted contribution, threshold bands, symbolic formula, substituted arithmetic and result. It exposes the categorical-normalization assumption and the gearbox term correction. Maintenance information lists currently abnormal parameters and the supplied bands; no separate numerical risk-score service threshold is invented.

## RUL handling

The weighted snapshot formulas do not calculate remaining life. The result keeps remaining life, degradation index, daily degradation rate and time to threshold unavailable. The UI explains the absence of a supported component prediction/trend model. Existing experimental motor forecasts are not reused as component predictions.

## 90-day probability handling

Risk index is not failure probability. The result's probability remains null and the panel says “90-day failure probability unavailable.” A future validated prediction adapter can extend the shared inspection-result model without changing component geometry or identity; no fake prediction provider was added in this phase.

## Tests executed

- `npm test`: 113 passing tests across eight files. Includes all four formulas, all-normal/all-critical results, mixed weights, complements, threshold endpoints, the supplied brake example, gearbox oil-factor consistency, invalid/missing fields, partial hazard preservation, configurable status priority, normalization validation, predictive nulls, semantic colors and motion endpoints/retargeting.
- `node scripts/inspection-check.mjs`: saves/evaluates all four components, checks evidence and null predictions, independent persisted histories, gearbox applicability, partial critical observations, 17-way synchronization, intermediate camera/explode frames, rapid selection changes, idle-render cessation, reduced motion, mobile layout and unchanged motor records.
- `node scripts/twin3d-check.mjs`: existing rendering, rotate/zoom/wheel/pan/reset, raycasting, focus/isolation, status preview, assembly/explosion, visibility, gearbox layout, repeated unmount/mount and WebGL fallback regression.
- `node scripts/manual-check.mjs`: existing end-to-end dashboard regression.
- `node scripts/usage-check.mjs`: existing operational usage/data-quality regression.
- `npm run build`: TypeScript and Vite production build. The existing large-chunk advisory remains; the 3D/inspection panel is lazy-loaded.

Screenshots are visually reviewed. Browser tests run in isolated headless Edge with software WebGL available, so they do not alter the user's saved records. The motion timing artifact is an observation of that test environment, not a hardware performance certification.

## Existing functionality verified

Existing elevator creation/switching/storage, measurement validation, custom motor formulas, interventions, target exploration, replay, scheduling, monitoring limits, scenarios, selected-elevator AI context, backup handling, usage normalization, counter reconciliation and mobile pages remain functional. The existing AI regression mocks its provider; this phase does not assert live/funded AI API availability.

## Known limitations

These are supplied deterministic condition-index formulas, not validated failure models. No new sensor integration, maintenance action automation, RUL/probability model or remaining-component formulas were introduced. Snapshot thresholds need equipment-specific review; fault-count comparisons also need a defined consistent observation window. The 3D representation remains schematic and parts can occlude one another from some angles. Touch controls use existing OrbitControls; physical-device testing and long-session GPU memory profiling were not performed.

## Recommended next phase

Validate thresholds, measurement definitions and observation windows against the actual manufacturer's equipment. Add verified component-specific inspection/sensor sources and data freshness policy. Only then add separately validated trend, RUL or calibrated failure-probability outputs, preserving their provenance and keeping them distinct from the weighted risk index.
