# Footer and landing animation changes

## Follow-up: CTA removed and roaming restored

The bottom CTA shown in the user's screenshot has been removed completely,
including its framed robot area and buttons. The footer redesign is retained.
The user requested that the bug roam around the landing page as before.

The robot now uses viewport coordinates again and is visible from the top of
the landing page through the footer. Its movement reserves room for the header
and bottom assistant area. Movement steers around heading and control bounds;
headings and controls also render above the decorative
layer, which cannot intercept clicks. The pause control lives in the footer.
Reduced motion and hidden-tab suspension remain supported.

An inline SVG fallback stays visible while the 3D scene initializes, when WebGL
initialization fails, and while a lost WebGL context awaits restoration. The
fallback continues roaming after initialization failure, rather than leaving
an empty animation layer.

The responsive regression script now checks removal of the CTA, visibility at
the top and footer, viewport containment, and simulated WebGL failure, alongside
the existing footer, Kody, keyboard, and reduced-motion checks.

## Original redesign record (superseded where noted above)

Implemented locally on 30 October 2026. Existing uncommitted authentication,
FAQ, header, and Kody changes were preserved. No deployment was performed.

## Changes and causes

- Replaced the flat footer with Brand, Platform, Resources, and Legal groups,
  existing branding, accessible social links, dynamic copyright year, and a
  separate bottom bar. Mobile navigation has two columns, tablet navigation
  has three, and desktop has four columns including the brand.
- Added the requested CTA heading, description, registration link, and project
  GitHub link. Desktop has copy on the left and visual/actions on the right;
  mobile places the visual above the copy and full-width action buttons.
- The robot previously used fixed viewport coordinates, allowing it to cover
  page content. It now uses a reserved, clipped grid cell and measures its own
  container. Its canvas, scan label, and pointer following stay in that cell.
- Removed the prior explicit disregard for reduced motion. The robot now
  renders a static pose for that preference and provides a pause/resume button.
  Intersection/resize observers, tab visibility, WebGL restoration, deferred
  initialization, and cleanup keep playback reliable and stop offscreen work.
  Slow GPUs retain the existing adaptive quality behavior.
- Kody's ten-second retreat animation moved its launcher offscreen. Removed
  that behavior, reserved a right-side lane beside footer/CTA content, added
  horizontal safe-area handling, increased small controls to 44px, and made
  the closed panel inert. Decoration stays below the header and assistant;
  native modal dialogs remain in the browser top layer.
- Footer/CTA use dark surfaces, readable light text, purple accents, wrapping
  grid tracks, visible focus outlines, and 44px minimum navigation targets.
  The reserved visual area prevents layout shift when WebGL initializes.

## Destinations

The GitHub project URL comes from the existing Git remote. LinkedIn and email
reuse the previous footer. Features, Security, and GitHub App link to existing
landing sections; How It Works now has its own section anchor. FAQ, privacy,
terms, and registration reuse existing routes. A public documentation route
was not implemented, so Documentation is noninteractive and marked Coming
soon. Pricing, changelog, and health status are omitted.

## Files changed for this task

- frontend/app/page.tsx
- frontend/app/landing-page.module.css
- frontend/components/marketing/site-footer.tsx (new)
- frontend/components/marketing/site-footer.module.css (new)
- frontend/components/landing/RoboticBug.tsx
- frontend/components/landing/robotic-bug.module.css
- frontend/components/kody/kody-assistant.tsx
- frontend/components/kody/kody-assistant.module.css
- frontend/tests/robotic-bug.test.mjs
- frontend/tests/landing-responsive.e2e.mjs (new)
- frontend/package.json
- frontend/package-lock.json
- frontend/.gitignore
- frontend/README.md
- docs/footer-redesign.md (this report)

## Validation actually executed

- Full ESLint: exit 0, no errors; four existing warnings in reviews/[id],
  team, invite, and use-current-tenant. Final targeted ESLint on changed
  TypeScript and test files: exit 0, no warnings.
- TypeScript: npx tsc --noEmit --incremental false, exit 0.
- Production build: npm run build, exit 0; all 32 static pages generated.
- Unit tests: node --test tests/*.test.mjs, all 27 passed. Includes container
  bounds at all requested widths, scan lifecycle, reduced motion, pause,
  offscreen/tab suspension, slow GPU, context restoration, Strict Mode and
  disposal behavior.
- Headless Chrome responsive script passed against both development and
  production servers at 320, 360, 375, 390, 430, 768, 1024, 1366, and 1920px.
  Checks included footer/CTA alignment, touch targets, launcher clearance,
  Kody panel bounds and Escape focus restoration, keyboard order and visible
  focus, internal HTTP links and section anchors, animation after 15 seconds,
  pause/resume, reduced motion, and console/hydration errors. Final production
  checks also verified rendered canvas bounds and dark footer colors while
  the system color preference was light.
- Desktop and mobile screenshots visually inspected. Screenshots are in
  frontend/test-results/ (ignored by Git).
- git diff --check passed.

## Limits

Tests use desktop Chrome with resized viewports, not physical mobile devices
or Safari/Firefox. Safe-area handling is implemented in CSS but was not tested
on a notched device. No live OAuth, GitHub App installation, or chatbot API
requests were submitted. External links reuse known destinations; the browser
suite checks internal HTTP links and external URL format, not external service
availability. Public deployment remains unchanged. The optional 3D decoration
is omitted gracefully when WebGL cannot initialize.

Repeatable test commands and browser environment options are documented in
frontend/README.md. Use npm test and npm run test:responsive after starting a
local server; TEST_BASE_URL can point the browser suite to another local port.
