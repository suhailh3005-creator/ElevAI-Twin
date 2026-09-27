# Interactive elevator assembly — implementation report

This report records the initial 3D milestone. The later [component-intelligence report](COMPONENT-INTELLIGENCE.md) documents inspection calculations, revised status colors and smooth camera transitions that extend it.

## Existing architecture discovered

The active application uses React 19, TypeScript, React Router HashRouter, Zustand, localStorage, Recharts and Vite. `src/App.tsx` mounts `src/manual/Workspace.tsx`. The existing Digital Twin is `Twin` in `src/manual/Pages.tsx`, at `#/twin`. Its measurement history, stored-record viewer, input dialog and operational-usage analysis remain in place below the added assembly panel.

The existing calculation layer is `src/manual/engine.ts`. The local registry uses `elevai-manual-registry:v1`. The optional AI integration is the existing Vite server plugin in `server/manual-ai.ts`. This extension changes none of those schemas, calculations, endpoints or credentials. There was no installed 3D engine before this extension. The older `src/pages` and `src/engine` directories were not replaced.

## Files created

| File | Responsibility |
|---|---|
| `src/manual/twin3d/components.ts` | Stable identity registry, transforms, typed external status contract and presentation palette |
| `src/manual/twin3d/geometry.ts` | Named component geometry, semantic scene hierarchy, shared resources and disposal |
| `src/manual/twin3d/model.ts` | Applies layout, visibility, selection and supplied visual states to existing nodes |
| `src/manual/twin3d/scene.ts` | WebGL renderer, orthographic camera, OrbitControls, picking, demand rendering and lifecycle |
| `src/manual/twin3d/ElevatorTwin3D.tsx` | Dashboard panel, controls, accessible list, inspector and optional visual test |
| `src/manual/twin3d/twin3d.css` | Scoped desktop/mobile panel styling |
| `src/manual/twin3d/twin3d.test.ts` | Component, transform, material isolation and resource-disposal tests |
| `scripts/twin3d-check.mjs` | Isolated Edge browser acceptance tests and screenshots |
| `3D-EXTENSION.md` | This implementation report and integration guidance |

Browser screenshots are in `artifacts/twin3d/`: `assembled.png`, `exploded.png`, `repair-preview.png`, and `mobile.png`. They contain isolated test records, not the user's saved elevator data.

## Files modified

- `src/manual/Pages.tsx`: adds one lazy-loaded panel inside the existing `Twin` component, keyed by elevator ID. Existing content and route are retained.
- `package.json` and `package-lock.json`: add the renderer and its TypeScript definitions.
- `scripts/usage-check.mjs`: waits for responsive chart/canvas resize callbacks before asserting mobile width, instead of checking during the first resize frame.
- Existing regression scripts regenerate their test screenshots/backups under `artifacts/manual/` and `artifacts/usage/` when run.

## Dependencies added, if any

`three ^0.186.0` and development-only `@types/three ^0.186.0`. No new backend, router, state library, database or React rendering framework was introduced. The panel is loaded on demand by React `lazy` and `Suspense`.

Camera/control implementation follows the official [Three.js OrbitControls documentation](https://threejs.org/docs/pages/OrbitControls.html); the scene uses an [orthographic camera](https://threejs.org/docs/pages/OrthographicCamera.html) and [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).

## 3D component registry implemented

Each registry entry provides `id`, `displayName`, `category`, `group`, `visible`, `selectable`, `assembledPosition`, `explodedPosition`, `status`, `healthState`, and `metadata`. The metadata discloses schematic geometry and applicability. Every mesh carries its owning `componentId`; each component has one independent named group.

The root `ElevatorDigitalTwin` contains subordinate `shaft_structure` plus the six semantic system groups below. All 17 identities exist in both configurations; the gearbox is hidden and not pickable when the schematic is gearless.

## Components implemented

| System | Stable IDs |
|---|---|
| `drive_system` | `traction_motor`, `traction_sheave`, `ropes`, `brake`, `gearbox`, `vfd_drive`, `encoder`, `pulley_idler_sheaves` |
| `control_system` | `elevator_controller` |
| `car_system` | `elevator_cabin`, `door_system`, `door_motor`, `safety_gear` |
| `counterweight_system` | `counterweight` |
| `guidance_system` | `guide_rails` |
| `pit_system` | `buffers`, `pit_equipment` |

## Assembled view implementation

The default view shows a cutaway car, front door and operator, overhead drive assembly, suspension ropes over the sheave to the counterweight, car/counterweight rails, lower safety gear, buffers and pit equipment. Controller and VFD cabinets sit beside the machine/shaft context. Neutral material colors differentiate parts; no component starts with a repair color or fabricated health value.

Geared layout reveals the gearbox and moves the motor and encoder to retain their mechanical relationship. The layout selector is explicitly a schematic viewing option; no verified drive configuration currently exists in the saved elevator schema. Returning to Digital Twin or selecting another elevator starts assembled, with no visual test retained.

## Exploded view implementation

Each component has fixed assembled and exploded endpoints. A clamped separation factor interpolates between them. A 650 ms smoothstep animation eases transitions, while endpoint assignment restores the exact original coordinates. The cabin remains the central reference; other systems separate along defined directions. The shaft context is hidden near full explosion to reduce clutter. The camera fits the target layout. Reduced-motion preferences bypass animation.

## Interaction controls implemented

- Left drag to orbit; scroll or pinch to zoom; right drag or two-finger gesture to pan through OrbitControls.
- Assemble, Explode, continuous separation slider, and Reset view.
- Keyboard-accessible zoom and rotation buttons.
- Pointer hover indication/name and raycast selection.
- All 17 components selectable through the accessible list, including gearbox metadata when absent.
- Per-component visibility, Show all, Focus component, Isolate component, and Clear selection.
- Textual condition labels, selected identity/category/source/health, and status legend.
- The motor inspector reads the selected elevator's existing winding/bearing temperatures, vibration and cumulative hours, with measurement dates and sample provenance. It does not reinterpret them as component condition decisions.

Small layouts stack the component list below the viewport. A text/list fallback retains access to component details and all existing dashboard content if WebGL cannot initialize.

## Future status/highlight interface

The React panel accepts `componentStates?: ComponentStateMap` and `onComponentSelect?: (id: ComponentId | null) => void`. The map is supplied by a future adapter to the existing decision/data layer. The renderer does not calculate it.

```tsx
// Example shape ONLY: values must come from an actual upstream source.
<ElevatorTwin3D
  elevator={selectedElevator}
  componentStates={upstreamComponentStates}
  onComponentSelect={handleComponentSelection}
/>
```

```ts
type ComponentVisualState = {
  status: 'unknown' | 'normal' | 'warning' | 'repair' | 'upgrade' | 'replace';
  healthState: string | null;
  source?: string;
};
type ComponentStateMap = Partial<Record<ComponentId, ComponentVisualState>>;
```

Missing/invalid states resolve to `unknown` and `healthState: null`. `repair` uses red, `warning` amber, `upgrade` violet, and `replace` magenta. `normal` retains the base material. Geometry and transforms are retained when conditions change; only components whose appearance signature changes have materials updated. Materials are isolated by component ID, preventing color changes from leaking into other parts.

The collapsed **Visualization test** control previews exactly one selected component's status. It prominently labels the preview as a test, uses no health percentage, has a clear control, and writes nothing to storage. It temporarily overrides only that component's supplied visual state. There are no repair thresholds, component RUL models, AI condition predictions or replacement decisions in this extension.

## Tests performed

- `npm test`: 89 passing tests across seven files, including 13 new 3D checks. Coverage includes all IDs/hierarchy, unknown defaults, deterministic and exact reversible transforms, geared layout, all six status inputs, one-component red highlighting, material restoration, independent visibility/isolation, invalid external data and disposal of shared resources.
- `npm run build`: TypeScript and production Vite build pass. Vite reports a size advisory for the existing main bundle and the lazy 3D bundle (approximately 589 kB minified / 150 kB gzip); this is not a build error.
- `node scripts/twin3d-check.mjs`: real WebGL draws, idle-render cessation, camera rotation/zoom/wheel/pan/reset, raycast/list selection, focus/isolation, status preview/clear, rendered explosion, geared/gearless switching, visibility, repeated route unmount/remount, 390 px layout, unchanged localStorage and WebGL-unavailable fallback.
- Screenshots reviewed for assembled, exploded, explicit repair-preview and mobile views. Browser tests use an isolated Edge profile; software WebGL is enabled in the test runner.

Renderer work occurs only for view/state changes and active transitions. Offscreen rendering pauses. Unmount cancels animation frames, disconnects observers, removes pointer/control events, disposes controls/geometries/materials/renderer and releases the WebGL context. Repeated route tests check for obvious resource/render failures; they are not a long-running GPU memory benchmark.

## Existing functionality verified

The existing `scripts/manual-check.mjs` regression passes: blank startup, separate elevator creation/switching/persistence, input validation, measurement periods, custom formulas, interventions, target exploration, replay, scheduling, limits, scenario isolation, selected-only AI request context, backups, and mobile routes. Its AI test mocks the external provider; it does not demonstrate funded/live API access.

`scripts/usage-check.mjs` verifies legacy records, normalized usage, persisted independent analysis settings, optional start counters, mismatch retention, unchanged formulas/raw history, generated-sample exclusion and mobile quality review.

## Known limitations

The geometry is an illustrative traction-elevator schematic, not an installation-specific CAD/BIM model or a mechanically validated construction drawing. Dimensions and rope arrangement must be adapted to a real elevator's design. Other elevator types are not represented. Some components can occlude one another at particular orbit angles; use explode, isolate, visibility or the component list.

Component condition data is not yet connected. Existing motor estimates remain explicitly experimental on their original pages and do not imply repair/replace statuses in 3D. Layout and interaction settings are transient. WebGL support is required for rendering; a textual fallback is provided. Touch controls come from OrbitControls; automated coverage uses desktop pointer controls and a mobile viewport rather than physical mobile hardware.

## Recommended next implementation phase

Add verified asset metadata for drive type and installation geometry, then implement a typed adapter from real component records/approved decision outputs to the existing `componentStates` prop. Include provenance, timestamps and unknown/stale-data handling upstream. Validate the status meaning and thresholds independently of the visualization, using manufacturer guidance and actual maintenance records. The present scene registry and geometry do not need replacement to accept that data.
