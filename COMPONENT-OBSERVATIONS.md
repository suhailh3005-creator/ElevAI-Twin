# Component observations in Add Elevator

Current evaluated IDs: brake, gearbox, vfd_drive, traction_sheave. All 17 physical components remain selectable. Rope Slip is a Traction Sheave input; Ropes has no standalone current assessment.

Open **Add elevator → Enter Component Observations**. Enter component measurements, their source and the completed observation period. Confirm a geared drive for gearbox evaluation. Blank groups stay unknown; incomplete groups receive no numerical score.

**Enter Random Values** offers four demonstration targets. It populates all four groups and makes only the selected component critical. Other evaluated components remain normal. Generated provenance survives edits, saving, reload and export/import. These ranges are illustrative, not actual readings or manufacturer limits.

| Component | Healthy demo values | Selected defect |
|---|---|---|
| Traction Sheave | Wear 2–8%; slip 0.2–1.5%; vibration 0.6–2.8 mm/s; temperature 30–52 °C | Wear 24–38%; vibration 5.6–7.8 mm/s |
| Brake | Temperature 35–60 °C; response 55–90 ms; wear 12–40%; zero faults | Response 165–220 ms; wear 78–90%; 3–5 faults |
| Gearbox | Temperature 35–60 °C; vibration 0.6–2.8 mm/s; good oil; no leakage | Temperature 90–105 °C; vibration 5.6–8 mm/s; critical oil; significant leakage |
| VFD / Drive | Current/voltage deviation 0.3–3.8%; temperature 30–52 °C; zero faults | Current deviation 12–18%; temperature 80–95 °C; 4–7 faults |

The current component-v3 Sheave formula is exactly:

Risk = 100 × (0.35 F_W + 0.30 F_S + 0.20 F_V + 0.15 F_T)

Health = 100 − Risk. There is no renormalization. Default factors are normal 0, warning 0.5, critical 1. Status is determined separately by the worst known parameter. Incomplete observations cannot produce a Normal assessment.

Historical v1 records retain their meaning. Retired v2 Sheave and standalone Ropes records can be restored/exported; they are excluded from current assessments, new telemetry, reference metrics and trends. No existing observations are migrated. v2 Sheave evidence remains visible in its history.

The Digital Twin reads saved observations without a second entry form. Normal = cool white hologram; Warning/Repair = amber; Critical = red; Unknown = subdued gray. RUL now uses a separately disclosed experimental baseline or a comparable recorded trend. See [the current implementation report](CORRECTION-HOLOGRAM.md) for the assumptions, history safeguards and verification.
