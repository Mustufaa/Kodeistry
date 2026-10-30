# Robotic bug and Kody animation update

## Behavior

The existing six-leg Three.js bug patrols automatically with no visible animation controls. Steering brakes on arrival and near edges, turns gradually, and drives the original IK gait using achieved ground-plane travel. Mouse following maintains a stand-off distance; autonomous patrol resumes after three seconds without mouse movement. Touch/pen movement does not become a follow target. Existing decorative scans, head motion, antennae, WebGL fallback and context recovery remain.

The previous movement loop projected the robot out of expanded heading/button rectangles after each movement step. These rectangles could disconnect the available space on narrow layouts, while steering and the gait still assumed forward travel. Recovery also snapped the heading. The new loop removes those hard collision walls and heading snaps. Existing page stacking keeps headings and controls above the pointer-transparent decoration. Safe viewport waypoints, arrival braking and a three-second progress watchdog provide recovery without teleportation during patrol. Resizing may clamp the position into the newly visible viewport.

The camera now measures a conservative projected envelope of the existing model over gait poses and headings, including feet and antennae. Camera fitting, boundary clearance and pixels-per-world-unit use this envelope. Delta time governs movement; GPU cost can reduce resolution/frame rate. Rendering stops in hidden tabs. Reduced motion displays a still bug; a lightweight one-second preference reconciliation also handles delayed browser media-query events.

Kody remains the original layered SVG, not a replacement 3D character. Its existing ten-second idle visibility cycle now runs:

1. Shutdown and eye dimming: 0?300 ms.
2. Original head, neck, body, arms and legs separate: 300?900 ms.
3. Eighteen small geometric fragments and a subtle white glow: 900?1500 ms.
4. Fragments disappear: 1500?1800 ms.
5. Launcher hidden and inert for five seconds, then a reversed 1800 ms assembly and welcoming wave.

Hover, focus and open chat retain availability. An interrupted dismantle reverses from its current pose. Hidden elements do not receive pointer or keyboard input. Timelines, timers and listeners are canceled on cleanup; conversation state and pending API requests remain independent of the visibility timeline. Reduced motion uses a short fade with no fragmented movement or idle waving. This follows the latest supplied brief's reduced-motion requirement.

## Files

- `frontend/components/landing/RoboticBug.tsx`: patrol, cursor following, lifecycle, recovery, reduced motion; controls removed.
- `frontend/components/landing/robot-motion.ts`: smooth turning, arrival/edge braking, achieved speed.
- `frontend/components/landing/robot-scene.ts`: projected model envelope and fitted camera metrics.
- `frontend/components/landing/robot-model.ts`: exposes existing model for measurement; antennae respond to head gaze.
- `frontend/components/landing/robotic-bug.module.css`: removes control styling.
- `frontend/components/kody/kody-assistant.tsx`: wraps existing SVG parts and retains chat behavior.
- `frontend/components/kody/use-kody-visibility.ts`: cancelable visibility state machine and Web Animations timelines.
- `frontend/components/kody/kody-assistant.module.css`: segmented transforms, fragments, reduced motion and hidden state.
- `frontend/app/landing-page.module.css`: keeps brand/body copy and badge above the moving decoration.
- `frontend/app/page.tsx`, `frontend/components/marketing/site-footer.tsx`: mount decoration independently of footer controls.
- `frontend/tests/robotic-bug.test.mjs`, `animation-playback.e2e.mjs`, `kody-retreat.e2e.mjs`, `landing-responsive.e2e.mjs`: updated regression coverage.

## Verification

Run from `frontend` with a production server available through `TEST_BASE_URL`:

```text
npm run build
npm test
node tests/animation-playback.e2e.mjs
node tests/kody-retreat.e2e.mjs
node tests/landing-responsive.e2e.mjs
```

The patrol browser test defaults to 120 real seconds at both 375px and 1366px. `PATROL_SECONDS` can shorten only that sampling phase for focused lifecycle regressions. Unit coverage includes deterministic two-minute movement, all four boundaries, 30/60/144 Hz steering, strict-mode cleanup, one renderer, touch input, WebGL failure/context loss and reduced motion. Browser screenshots are written under `frontend/test-results/`.

Limitations: browser checks use installed Chrome with desktop/mobile viewports, not physical mobile hardware or a measured Core Web Vitals/60 FPS guarantee. Tab visibility is simulated in the lifecycle checks; a real OS tab/background test remains useful. Chat requests are mocked to verify payload/history and UI behavior; the live AI service is not exercised. The model is still the original SVG/Three.js artwork. Changes are local and have not been deployed.

### Completed local checks

- Production build and TypeScript: passed.
- Unit tests: 30 passed.
- ESLint on changed animation components and tests: passed.
- Actual 120-second browser patrol: passed for desktop 1366px and mobile 375px, with movement in every ten-second window.
- Cursor following/inactivity, resize/orientation dimensions, simulated tab visibility and live reduced-motion changes: passed in the focused browser rerun.
- Kody stages, repeated cycles, interrupted dismantling, repeated chat open/close, mocked request history, reduced motion and no invisible hit target: passed on 375px/1366px.
- Responsive checks at 320/360/375/390/430/768/1024/1366/1920px, footer links/focus/touch targets, WebGL fallback and no console/hydration errors: passed.
- Reviewed desktop roaming and mobile Kody separation/fragment screenshots.
