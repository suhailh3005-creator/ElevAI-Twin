# Correction and holographic Digital Twin report

Date: 2026-09-25. The latest explicit request adds estimated RUL and makes single click focus, double click separate. These supersede the earlier XML restrictions on changing RUL availability and the earlier automatic pop-out-on-selection behavior. No recorded history was invented or migrated.

## Current component intelligence and correction mapping

- C01: Four current evaluated IDs: brake, gearbox, vfd_drive, traction_sheave. The 17 physical IDs remain intact. Ropes is selectable but unevaluated.
- C02: Current Sheave risk = 100 × (0.35 F_W + 0.30 F_S + 0.20 F_V + 0.15 F_T). Health = 100 − Risk. No weight renormalization. Slip is a Sheave input. New records use component-v3; historical v1 meaning is preserved. Retired v2 Sheave evidence and standalone Ropes records are retained without becoming current assessments.
- C03: Active runtime is main.tsx → App.tsx → manual/Workspace.tsx. manual/* is active; components/UI.tsx, Charts.tsx, formatting and types are shared. Legacy pages/layout/store/engine areas are retained because tests or shared imports may depend on them. No broad deletion or architecture replacement.
- C04/C05: Temporary presentation offsets are separate from original/exploded positions. Projected component anchors connect readable callouts to selected meshes. Callouts show identity, current status, risk/health, RUL availability/provenance, maintenance configuration and unavailable 90-day probability.
- C06: Worst-parameter status is a separate policy from weighted numerical condition index. Unknown/invalid data cannot create a complete Normal assessment; known critical measurements remain visible. No aggregate risk-score status bands were invented.
- C07: Optional maintenanceThreshold contains a description and source, validated and displayed separately. Without a supplied record it says Not configured. The experimental RUL threshold is not an automatic maintenance deadline.
- C08: The latest request explicitly enables experimental RUL. 90-day failure probability remains unavailable. Unimplemented components and incomplete observations still do not receive fabricated scores or life estimates.

## Holographic rendering architecture and material implementation

The existing Three.js geometry builder and all component identities are retained. model.ts owns transient view state; scene.ts owns camera, orbit target and animation; hologram.ts owns visual material configuration only. The rendering layer consumes the existing status map and never evaluates measurements or changes component formulas, risk indices or raw observations.

Existing component-specific MeshStandardMaterial instances are enhanced with a lightweight onBeforeCompile shader: controlled emission, view-dependent Fresnel/rim and a low-amplitude slow scan. Transparent surfaces keep depth testing and disable depth writing; geometric edge lines improve interior readability. Edge geometries are cached by source geometry, materials remain independent between components, and all added resources are disposed on unmount. There is no bloom pipeline, particle system, texture download or new dependency.

Normal = cool-white hologram (#e3eff5). Medium / Warning / Repair Required = amber/yellow (#e8b85b). Critical = red (#ed4d58). Unknown = subdued gray (#7e949e), with lower opacity. Existing externally supplied Upgrade and Replace presentation states retain their labels. Selection increases opacity and emission without replacing the status color; the selection outline uses the same semantic color.

## Selected component behavior

Single-click a mesh or select it from the list/dropdown: the camera smoothly zooms to its center and OrbitControls.target follows the same center. Double-click a mesh: it moves sideways along a world-space offset captured once, and the camera target follows its final center. Orbiting does not recalculate the offset, so the component stays centered while the elevator remains visible for context. Separation changes presentation position, not geometry or engineering data. Separate component / Return component buttons provide keyboard and touch access. Existing isolation remains a separate visibility option.

Camera position, target, zoom and presentation offsets use the existing 720 ms smootherstep animation. Input interrupts camera movement. Returning, switching selection and resetting reverse the temporary transforms. Assemble/explode update focus to the selected component's target layout and update the return camera pose. Reset restores the current full layout. Mobile callouts move beneath the canvas rather than covering the selected component.

## RUL definition and explicit assumptions

RUL days = max(0, (F − H) / D). H is the existing increasing weighted risk/condition index, NOT 100 − risk. F is the assumed model failure threshold, 100 index points. D is in index points/day. The display states the observation date: it estimates remaining time at that recorded condition, not a verified current failure date.

Model version: experimental-linear-rul-v1. These predefined baseline rates are demonstration assumptions, not KONE/manufacturer lifetimes, certified industry formulas or field-calibrated rates:

| Component | F | Baseline D (index points/day) |
|---|---:|---:|
| Brake | 100 | 0.08 |
| Gearbox | 100 | 0.035 |
| VFD / Drive | 100 | 0.05 |
| Traction Sheave | 100 | 0.025 |

The module baselineRulModels in src/manual/inspection/rul.ts centralizes these parameters. Current entered/generated observations determine H. Without sufficient comparable history the UI labels the result Estimated RUL / Experimental baseline model and exposes the substitution and assumptions in the inspection panel. Changing conditions changes the result. A critical individual parameter can coexist with positive projected time to the aggregate model threshold; the UI states that critical conditions require attention regardless of this projection.

Historical projection requires at least three complete, non-demo, non-overlapping, equally long periods using the same formula version, normalization, calibration and threshold snapshot. The newest observation must be included. A decreasing indicator resets the comparable sequence, avoiding projection across apparent repair/replacement. Ordinary least squares fits index points against elapsed days. Only a positive slope and R² ≥ 0.5 use the history rate. Flat/weak/insufficient trends fall back explicitly to the baseline. The result is labelled Predicted RUL · measured trend: the rate comes from recorded indices; remaining life is still an unvalidated estimate. No generated sample is labelled measured history.

Days convert using 30.4375 days/month and 365.25 days/year. Zero means the model threshold has already been reached. Missing/invalid component observations and inapplicable gearbox configurations withhold estimates with a specific action/reason. The other physical components retain their honest unevaluated state. No existing motor formulas, component classification thresholds or 90-day probabilities are changed.

## Modified files

| Area | Files and purpose |
|---|---|
| Current scope and evidence | src/manual/inspection/engine.ts: four active IDs, v3 four-factor Sheave, legacy retention, explicit status policy and maintenance metadata. entry.ts and ObservationInputs.tsx: four entry groups/generators and slip within Sheave. InspectionPanel.tsx: read-only evidence/history, maintenance metadata and RUL. |
| RUL | New src/manual/inspection/rul.ts and RulDetails.tsx: auditable estimates and shared presentation. rul.test.ts: sign/units, conditions, history prerequisites, demos, repair reset, unavailable cases and formatting. |
| Scene and materials | src/manual/twin3d/hologram.ts: reusable visual layer. model.ts: reversible presentation transforms and material/resource ownership. components.ts: centralized status palette. scene.ts: focus/separation/orbit, projection, visibility/motion-aware rendering and cleanup. |
| Twin UI | ElevatorTwin3D.tsx: click/double-click and accessible separation controls, anchored responsive callout. InspectionCallout.tsx: identity/evidence/RUL summary. twin3d.css: responsive callout, semantic badges and RUL typography. |
| Current/archived field data | src/manual/field/analysis.ts, replay.ts, FieldLab.tsx and server/field-lab.ts: current four-component intake/replay/context, legacy restoration and exclusions. |
| Regression coverage | inspection/inspection.test.ts, entry.test.ts; field/analysis.test.ts; twin3d/twin3d.test.ts; server/field-lab.test.ts, manual-ai-components.test.ts; scripts/inspection-check.mjs, field-check.mjs, twin3d-check.mjs; new scripts/hologram-check.mjs. |
| Documentation | COMPONENT-OBSERVATIONS.md, COMPONENT-INTELLIGENCE.md historical notice, FIELD-LAB.md, START-HERE.txt and this report. |

## Performance considerations

Material and geometry instances are created once, not per frame. Shader animation changes shared uniforms. No React state updates run at frame rate; callout anchors update DOM styles directly. Camera/transform interaction uses requestAnimationFrame; idle scans are capped at approximately 24 scheduling updates/second. Offscreen and hidden pages stop scheduling; reduced motion stops scans and uses immediate camera/transform changes. Pixel ratio is capped at 1.75. Actual GPU frame rate depends on hardware; no universal FPS guarantee is claimed.

## Verification

155 automated tests pass. Production build passes (Vite retains its advisory that some bundles exceed 500 kB). Existing manual, usage, inspection, twin3d and field browser scripts pass. The new hologram browser script passes shader compilation, simultaneous semantic colours, ambient scan, real mesh double-click separation, centered orbit, reversible assembled/exploded focus, both RUL modes, mobile callout separation, reduced motion and unchanged persisted observations.

The final production build, hologram browser check and full twin3d camera/layout regression were rerun after the final camera/outline adjustment and all passed.

Browser tests use isolated browser storage. Field Lab checks use a separate temporary database and mocked AI responses. They do not use the user's AI credentials or mutate the user's saved elevators. Screenshot artifacts are under artifacts/hologram and artifacts/twin3d. Tests do not establish engineering predictive accuracy.

## Visual QA and remaining limitations

Inspected desktop assembled, separated and mobile screenshots. The hologram exposes internal relationships without bloom; status and provenance remain textual as well as coloured. The separated component stays near the center with part of the elevator visible for context. On mobile the callout is below the canvas and internally scrollable for long details.

The model is schematic. Four components have current observation-based evaluations; the other 13 physical IDs are not silently assigned health or RUL. RUL baselines/thresholds require manufacturer calibration and validation before operational use. Historical rates fit a categorical condition index rather than a physical fatigue model, so they are explanatory projections. Maintenance triggers remain a separate supplied field, and 90-day failure probability remains unavailable. No live controller integration, safety certification or field validation is implied by this rendering update.

