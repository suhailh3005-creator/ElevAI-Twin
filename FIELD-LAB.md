# Field Lab: six additions for a defensible prototype

Open an elevator, choose **Field Lab**, then **Connect this elevator**. This copies its component observations to a persistent local server database. New accepted observations synchronize to that elevator's Digital Twin every three seconds, including while viewing the Twin. Existing motor readings and the experimental motor model remain in the browser registry.

## 1. Validation

Attach an independently assessed normal/warning/critical label to an observation, including assessor and evidence reference. The report displays a three-class confusion matrix, exact-class accuracy, abnormal precision/recall, false alarms, missed abnormal cases, incomplete cases and demo exclusions. Labels cannot be overwritten. Export the report for review. The app records the user's evidence claim; it cannot independently authenticate an inspection report. Demo cases test the pipeline and do not establish field accuracy. No accuracy is shown without scored labelled cases.

## 2. Telemetry and replay

Prepare a six-period generated example for any of the five components, or import a recorded JSON file. Step or play observations through the same ingestion/evaluation pipeline. Pause stops further scheduled sends; an already submitted request may finish. Leaving the tab stops playback. Packets retain historical timestamps; late arrivals do not replace newer periods. A latest-period timestamp and stale/missing/incomplete flags show data quality.

The API accepts 1–100 packets per atomic batch. A replay file can contain up to 1,000 packets. Invalid batches are rejected entirely; repeated identical packet IDs are idempotent, while conflicting IDs are rejected. Gearbox data requires a geared elevator.

Packet shape is available in **Deployment**. `values` use the exact component parameter IDs and units from Add Elevator: temperature in °C, vibration velocity RMS in mm/s, response time in ms, wear/slip/deviation in percent, faults as whole counts over the stated period. Categorical values must exactly match listed options. Never send raw acceleration as velocity RMS.

## 3. Trends

Numeric component trends use ordinary least squares over non-overlapping observations with the same formula version, calibration reference and threshold configuration. Fault-count series also require equal-length observation periods. Select a comparable source; do not combine different installation locations or load regimes without engineering justification. Generated observations are excluded by default. At least three distinct periods are required. The page shows slope, R², observations and projected warning/critical boundary crossing from the last observation. Non-increasing trends and weak fits with R² below 0.5 do not receive a future crossing estimate. These are experimental projections, not calibrated remaining life, confidence intervals, failure probability or a guaranteed maintenance date.

## 4. Component decisions and AI

Each component's evidence identifies the abnormal parameter and applicable boundary. Create an inspection task from warning/critical observations. The existing Response Planner surfaces component priorities separately from its motor intervention simulations. The AI request now includes the latest record for all four components; the server validates and recalculates them before sending context to the configured provider. Missing data remains unknown, demo labels remain visible, and other elevators are excluded. An API credential and working provider access are still required for cloud answers; no key is supplied by Codex.

## 5. Technician workflow

Tasks follow open → inspected → repaired → verified. Record technician identity, findings and repair notes. Every transition appends a timestamped history entry. Verification requires a complete, non-demo, normal observation of the same component whose period starts after the recorded repair. This verifies the recorded assessment only; it does not approve elevator operation or replace statutory inspection. Export work orders for review.

## 6. Deployment foundation

- Server storage is `.data/field-lab.json`, excluded from Git. Serialized transactions and atomic replacement prevent partial database writes. Corrupt files cause a visible failure and are not overwritten.
- The database stores component observations, equipment profiles, reference labels and work orders. Browser registry backups separately preserve motor readings and planning records. To view the same elevator in a second local browser, import its browser registry backup, then connect Field Lab with its original ID.
- Equipment profiles record model, reference, permitted device ID, calibration dates and stale-data interval. Optional numeric threshold overrides are snapshotted into new real observations. Unspecified boundaries remain experimental defaults. Old observations retain their original boundaries.
- Real ingestion requires a valid unexpired profile and matching device ID. The period cannot predate the current profile. Multiple historical calibration versions are not yet modelled.
- App requests require a local session token. Gateway ingestion requires a separate `ELEVAI_INGEST_TOKEN` set in server `.env.local`. The server reads configuration without exposing the token in the browser. It is never prefixed with `VITE_`.
- Set a long random token in the local server environment or `.env.local`, then configure the same token in your read-only bridge process. The `scripts/send-telemetry.mjs` client reads its credential from the process environment: `node scripts/send-telemetry.mjs <elevator-id> <replay.json>`.
- Ingestion is `POST http://127.0.0.1:5174/api/field/ingest` with JSON and `Authorization: Bearer <token>`. Request body: `{ "elevatorId": "registry UUID", "deviceId": "profile device ID", "packets": [...] }`.
- Both dev (`npm run dev -- --port 5174 --strictPort`) and built preview (`npm run build`, then `npm run preview -- --port 5174 --strictPort`) expose these local APIs. Only run one on the port. Copying `dist` to a static host alone does not provide the server APIs.
- Export the server database through Deployment. To restore: stop the local server, preserve the existing `.data/field-lab.json` as a separate backup, replace it with the exported version-1 file and restart. Retain the browser registry backup too.

The service intentionally accepts loopback traffic only and has no elevator actuation endpoint. Remote TLS, enterprise identity/RBAC, per-device credentials, multi-process database locking, tamper-evident audit storage and certified installation are future production work. A real pilot also needs approved controller/sensor access and independent validation data. This implementation does not claim those external approvals or measurements exist.

## Demonstration

1. Add a geared elevator with motor values. Component inputs can remain blank.
2. Connect Field Lab. Prepare and play a six-period Brake demo.
3. Open Digital Twin: the latest brake observation is critical and healthy generated components use cool-white holographic materials.
4. In Trends, choose Brake / Brake response time and include demos. Explain the slope and limits.
5. In Component decisions, assign a technician and create a task. Record inspection and repair; show that demo data cannot verify a repair.
6. Add a reference label in Validation, then explicitly include demos to illustrate the confusion matrix. Explain that real validation remains to be performed.

Tests cover authentication, calibration identity, atomicity, concurrency, persistence, reference metrics, trend exclusions, all four replay generators, component-aware context and technician transition guards. Browser checks cover the integrated workflow without contacting the AI provider or modifying the user's elevator records.

Current scope: Brake, Gearbox, VFD / Drive and Traction Sheave. Rope slip is a Sheave factor. New packets use component-v3. Retired standalone Ropes and v2 Sheave records are retained as historical data only. Digital Twin RUL is an experimental model distinct from the parameter-boundary projections in Field Lab. See CORRECTION-HOLOGRAM.md.
