This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Landing page regression checks

```sh
npm run lint
npx tsc --noEmit --incremental false
npm test
npm run build
```

Start the application (`npm run dev`, or `npm start` after building), then run
`npm run test:responsive` in another terminal. This uses headless Chrome through
Playwright, checks all nine widths from 320px to 1920px, and saves screenshots in
`test-results/` (gitignored). Set `TEST_BASE_URL` to test another local port;
`TEST_BROWSER_CHANNEL=msedge` uses installed Edge instead of Chrome.

The responsive suite checks footer geometry, CTA removal, 44px touch targets, Kody's
launcher clearance and panel bounds, keyboard focus/order, internal link
responses, animation after 15 seconds, pause/resume, automatic playback even
with reduced motion enabled (the requested product behavior), and browser
console/hydration errors. It also simulates WebGL failure and checks that the
roaming bug retains a visible, moving SVG fallback. It does not submit
authentication or chat requests.
The unit suite exercises frame scheduling, container resizing, low-power mode,
WebGL loss/restoration, Strict Mode cleanup, and resource disposal.

For a sustained-motion regression, run `node tests/animation-playback.e2e.mjs`
against the same local server. It starts mobile and desktop pages with Reduce
Motion already enabled and checks both characters in each of three consecutive
ten-second windows, catching animations that freeze after startup.
