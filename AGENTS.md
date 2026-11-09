<!-- BEGIN principles: synced from github.com/kyle-pace/principles. Edit them there; changes made here are overwritten. -->

## Development principles

These apply to every project Kyle builds, on any platform, with any agent. The project's own section of this file adds specifics and can override a default for that project. Kyle's direct instructions in a session override both.

### Priority order

When two goals conflict, the higher one wins:

1. Accessibility
2. Privacy
3. Correctness and reliability
4. Performance
5. Polish

### Accessibility comes first

Accessibility is designed in from the first commit, not audited in at the end.

- Meet WCAG 2.2 AA at minimum. Text contrast is at least 4.5:1 (3:1 for large text and for UI parts like borders and icons), in both light and dark mode.
- Use semantic, native elements first (`button`, `a`, `label`, headings in order, landmarks). Add ARIA only when no native element does the job.
- Everything interactive works with a keyboard, has a visible focus style and has an accessible name. Touch targets are at least 24×24 px; aim for 44×44.
- Never carry meaning with color alone. Meaningful images get alt text; decorative ones get empty alt.
- Respect user settings: reduced motion, light/dark preference, text zoom to 200% without breaking layout. On Apple platforms: Dynamic Type, VoiceOver labels and hints, Reduce Motion, Increase Contrast.
- Motion is short (under 300 ms for interface animation), never `ease-in`, and on the web only runs inside `@media (prefers-reduced-motion: no-preference)`.

### Type

- Atkinson Hyperlegible Next for all text and Atkinson Hyperlegible Mono for code, in every product.
- Self-host the fonts: on the web use the `@fontsource/atkinson-hyperlegible-next` and `@fontsource/atkinson-hyperlegible-mono` packages; in apps, bundle the font files. Never load fonts from Google Fonts or any other font CDN.
- Offering a setting to switch to the device's own font is fine.

### Privacy comes second, and right behind

- Collect the least data that answers a real product question. No ad or marketing pixels, no fingerprinting, no selling or sharing data.
- Never put personal information in analytics: no names, emails, free-text input or precise location.
- Respect Global Privacy Control and Do Not Track by sending no analytics at all, and give people an opt-out.
- No cookies for analytics (keep the ID in `localStorage`), so no cookie banner is needed.
- Analytics only runs on the live production domain, never on localhost or preview builds.
- In Apple apps, keep personal data on the device or in the user's own iCloud unless a feature truly needs a server.
- Any project that collects data has a short, plain-language privacy page.
- Secrets never go in Git. (Browser API keys that are public by design, like Amplitude's, are fine in code.)

### Default stack

Use these unless the project's section says otherwise. **Do not add any other third-party service, SDK, script, font or paid tool without asking Kyle first.**

- **Product analytics: Amplitude**, set up the private way (see `src/lib/analytics.ts` in kylepace.net):
  - autocapture on, IP address tracking off, identity in `localStorage`
  - off under GPC, Do Not Track or the opt-out; only on the live domain
  - Session Replay only if the project wants it: a small sample (about 5%), conservative masking, and its code only loaded for sampled sessions
  - custom event names in Title Case, past-tense verb first: "Clicked Resume", "Saved Recipe"
- **Backend: Firebase** (Auth, Firestore, Functions, Storage) when a project needs accounts or shared data.
  - Security rules deny by default and are locked down before anything ships.
  - Firebase Analytics stays off; Amplitude covers analytics.
- **Web hosting: Cloudflare** (Workers with static assets). GitHub Pages is fine for a simple static site.
- **Apple apps:** native Swift and SwiftUI.
- Put each outside service behind its own module (one file talks to Amplitude, one to Firebase), so switching tools means changing one file.
- Keep running costs near zero: prefer static pages, free tiers and on-device work, and ask before adding anything that bills.

### Self-host everything; approve outside hosts one at a time

- Serve libraries, fonts and assets from the project itself. Install them from npm and bundle them, or keep a pinned copy in the repo (for example in `vendor/`) with a script that refreshes it. Never load them from a CDN like jsDelivr, unpkg or cdnjs.
- If a project needs something from an outside host (cover images from a book API, say), ask Kyle. Approvals are per project and per host. Once he approves, add the host to that project's `.agents/allowed-hosts.txt` with a comment saying what it's for and the date he approved it.
- This applies to hosts that JavaScript calls at runtime too (images, APIs), even though the CI check only sees HTML and CSS. List those in the same file.

### How things get built

- Static and simple by default. Add JavaScript, servers or dependencies only where they earn it.
- Colors, type and spacing live in one tokens file. Light and dark mode exist from the start.
- Copy is plain language, written for the person using it.
- Don't add "Built with AI" lines or other AI credits to sites or apps unless Kyle asks.

### Teach Kyle as you go

Kyle is a product leader building his development skills through this work. Treat each session as a chance to teach, briefly.

- When a change involves a real decision (data structure, architecture, a library, security, performance, a tradeoff), explain it in plain language: what you chose, the main alternative, and why. A short paragraph, not a lecture.
- After making changes, show the most important part of the diff and walk through what it does in plain terms. Point out one thing worth learning from it.
- Define jargon the first time it comes up in a session.
- When a change is small and safe (a color, copy, a value, spacing), offer to let Kyle make it by hand, and tell him which file and line to change.
- Skip all of this for trivial changes like typos and formatting.

### Every new page or project ships with

- A share card (Open Graph image, 1200×630) in dark mode, using Atkinson. Follow `.agents/skills/share-card/SKILL.md`.
- A real title, description and favicon.
- A privacy note if it collects anything.

### Before you call it done

- The build passes, and so do any tests and linters.
- Run an accessibility check on what changed (axe on the web, Accessibility Inspector on Apple platforms), fix what it finds, and tab through new UI with the keyboard.
- Look at it in both light and dark mode, and at a narrow phone width.
- CI runs a third-party check that fails if a page loads scripts, styles, fonts or images from a host that isn't allowed. Don't add a host to get past it; ask Kyle.

<!-- END principles -->

## This project

Washington transit, live: every bus, train and ferry in Washington that reports where it is, on one map with every route and stop, at [kylepace.dev/transit/](https://kylepace.dev/transit/). It moved here from kylepace.net/labs/transit/ (which now redirects) and is one of the experiments on the [kylepace.dev](https://github.com/kyle-pace/kylepace.dev) hub. The repo is `wa-transit-map`; the path is `/transit/`.

- **Feeds:** `src/lib/transit-feeds.ts` lists every system, its GTFS schedule zips and, where there is one, its GTFS-realtime vehicle feed. It has no imports and only erasable TypeScript, because Node runs it directly from the data script. Add or fix a feed there.
- **Routes and stops:** `scripts/build-transit.ts` downloads the schedules and writes `public/transit/` (meta, routes, stops, and `report.json` saying what each feed gave). GitHub Actions runs it weekly and whenever the feed list changes (`.github/workflows/transit-data.yml`). Don't hand-edit those files.
- **Live positions:** `src/pages/transit/api/vehicles.json.ts` fetches every live feed, decodes it (`src/lib/gtfs-rt.ts`) and caches the merged answer at the edge for 15 seconds.
- **OneBusAway key:** Sound Transit, Pierce Transit, Washington State Ferries and the Seattle Streetcar come through OneBusAway Puget Sound. The Worker reads the `OBA_API_KEY` secret and falls back to the shared `TEST` key.
- **The map:** `src/components/TransitMap.astro` (markup, styles) and `transit-map.ts` (MapLibre logic). The basemap is OpenFreeMap, approved for this project only (`.agents/allowed-hosts.txt`).
- **It's its own Cloudflare Worker (`wa-transit-map`) on the hub's domain.** The routes in `wrangler.jsonc` claim `kylepace.dev/transit` and `/transit/*`. Everything it serves, including the live API, lives under `/transit/`. Don't use Astro's `base` option; with the Cloudflare adapter it serves files from the wrong folder.
- **It stands on its own, not as a page of kylepace.dev.** The shell is kp-design's `LabLayout` (a back link to kylepace.dev, a one-line footer, display settings and analytics to the shared kylepace.dev Amplitude project), pinned to a commit in package.json. The bar's right side holds the lab's own links (Live map, Agencies, About); each page's About section is `#about`, below the main content. LabLayout gives no heading sizes, page width or prose styles, so each page styles its own layout.
- **Its look is its own:** `src/styles/theme.css` overrides kp-design's tokens (Shore, Sound, Guide green) and holds the shared bits (the bar links, the green sign plate). The plan behind it is `design/PLAN.md`: the map fills the window with one sign mounted on it, the agencies page is a directory, no pills, eyebrows, middle dots or monospace labels. `transit-map.ts` retints the basemap's land and water to match (`BASEMAP`), so keep the two in step.
- **Share cards:** `design/og.html` and `design/og-agencies.html` draw the lab's sign, one line and the address over the left side of the original artwork (`design/base-*.png`), rendered to `public/transit/share.png` and `share-agencies.png`.
- Run `npm run build` before pushing; it must pass. Cloudflare Workers Builds deploys `main`.
