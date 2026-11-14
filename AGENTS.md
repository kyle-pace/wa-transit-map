<!-- BEGIN principles (web): synced from github.com/kyle-pace/principles. Edit them there; changes made here are overwritten. -->

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
- Respect user settings: reduced motion, light/dark preference, text zoom to 200% without breaking layout.
- Motion is short (under 300 ms for interface animation) and never `ease-in`.
- On the web, motion only runs inside `@media (prefers-reduced-motion: no-preference)`.

### Every screen size from day one

Layouts are designed for phones, tablets and big screens from the first commit, not stretched or squeezed in later.

- **Web projects** are fully responsive: mobile first, fluid from 320 px wide up to large desktop monitors. No sideways scrolling at 320 px. Cap line length for reading (about 70 characters), and let wider screens add columns instead of stretching text.
- Prefer fluid layouts (flexbox, grid, `clamp()`, container queries) over many fixed breakpoints.
- Handle touch, mouse and keyboard on every size, and respect safe areas and notches.

### Type

- Atkinson Hyperlegible Next for all text and Atkinson Hyperlegible Mono for code, in every product.
- Self-host the fonts. Never load them from Google Fonts or any other font CDN.
- On the web, use the `@fontsource/atkinson-hyperlegible-next` and `@fontsource/atkinson-hyperlegible-mono` packages.
- Offering a setting to switch to the device's own font is fine.

### Privacy comes second, and right behind

- Collect the least data that answers a real product question. No ad or marketing pixels, no fingerprinting, no selling or sharing data.
- Never put personal information in analytics: no names, emails, free-text input or precise location.
- Respect Global Privacy Control and Do Not Track by sending no analytics at all, and give people an opt-out.
- No cookies for analytics (keep the ID in `localStorage`), so no cookie banner is needed.
- Analytics only runs on the live production domain, never on localhost or preview builds.
- Any project that collects data has a short, plain-language privacy page.
- Secrets never go in Git. (Browser API keys that are public by design, like Amplitude's, are fine in code.)

### Default stack

Use these unless the project's section says otherwise. **Do not add any other third-party service, SDK, script, font or paid tool without asking Kyle first.**

- **Product analytics: Amplitude**, set up the private way:
  - on the web, use `startAnalytics` from kp-design's `kp-design/analytics`, which does all of this
  - autocapture on, IP address tracking off, identity in `localStorage`
  - off under GPC, Do Not Track or the opt-out; only on the live domain
  - Session Replay only if the project wants it: a small sample (about 5%), conservative masking, and its code only loaded for sampled sessions
  - custom events follow the naming rules under "Analytics events" below
- **Backend: Firebase** (Auth, Firestore, Functions, Storage) when a project needs accounts or shared data.
  - Security rules deny by default and are locked down before anything ships.
  - Firebase Analytics stays off; Amplitude covers analytics.
- **Web hosting: Cloudflare** (Workers with static assets). GitHub Pages is fine for a simple static site.
- **Design system for Kyle's websites: [kp-design](https://github.com/kyle-pace/kp-design)**, installed from GitHub and pinned to a commit. It holds the tokens, self-hosted Atkinson, header, footer, display settings and analytics; projects on kylepace.dev use its `DevLayout`. Don't copy these into a project; change them in kp-design. (Apple apps don't use it.)
- Put each outside service behind its own module (one file talks to Amplitude, one to Firebase), so switching tools means changing one file.
- CI checks the stack on every push: Amplitude is in every site and app, Firebase Analytics isn't, each Firebase config file is for a bundle ID the app really has, and Firestore rules aren't open. It can't see inside the Amplitude or Firebase consoles, so settings there (APNs keys, API key restrictions, a separate production project) still need a person.
- Keep running costs near zero: prefer static pages, free tiers and on-device work, and ask before adding anything that bills.

### Analytics events

Every project uses the same rules, so charts read the same way everywhere.

- **Event names:** Title Case, past-tense verb first, then the object: "Saved Recipe", "Viewed Deal", "Completed Onboarding". Not "Recipe Saved" and not `save_recipe`. Use the same verb for the same action across projects (Viewed, Opened, Tapped, Added, Removed, Changed, Saved, Completed).
- **Property names:** lowercase `snake_case` (`deal_id`, `stores_picked`). Keep names and values the same across events and projects when they mean the same thing.
- Leave Amplitude's own `[Amplitude] …` events alone. Add custom events only for actions that answer a real product question; autocapture covers page views and clicks.
- **One Amplitude project per product.**
- kylepace.dev and every experiment on it share the kylepace.dev project, so each experiment's custom events also send `experiment` with the project's slug (`experiment: "skill-tree"`).
- **Every new feature ships with its events.** Building a feature includes its analytics: the events that say whether people find it and use it, written in the same change as the feature, not left as a follow-up. Say in your report which events you added, or why the feature needs none.
- **Tracking plan first:** add each new event and its properties to the project's tracking plan in Amplitude, with a description and category, as part of the same piece of work. Do it yourself when you can reach Amplitude; if you can't, say so and list exactly what needs adding. Nothing should arrive as "unexpected".
- **Renaming an event:** rename it in code, then merge the old name into the new one in Amplitude so history stays connected. Don't rename in Amplitude alone.
- **New product:** create its Amplitude project and add a row for it to the "All projects overview" dashboard. A new experiment on kylepace.dev needs neither: it appears there by page path.

### Self-host everything; approve outside hosts one at a time

- Serve libraries, fonts and assets from the project itself. Install them from npm and bundle them, or keep a pinned copy in the repo (for example in `vendor/`) with a script that refreshes it.
- Never load them from a CDN like jsDelivr, unpkg or cdnjs.
- **Scripts, styles, fonts and APIs** from an outside host need Kyle's OK every time. Approvals are per project and per host. Once he approves, add the host to that project's `.agents/allowed-hosts.txt` with a comment saying what it's for and the date he approved it.
- **Images** are lighter, because an outside image can only learn that someone visited, not run code. An image host can be added without asking when the image belongs to the content being shown (a recipe site's own photo on a result for its recipe, a book's cover from the library that lists it). Load those images with `referrerpolicy="no-referrer"` and `loading="lazy"`, add the host to `.agents/allowed-hosts.txt` with a comment saying what it's for, and mention the new host to Kyle when you report back. Decorative images, stock photos and anything that looks like tracking still need his OK.
- All of this applies to hosts that JavaScript calls at runtime too, even though the CI check only sees HTML and CSS. List those in the same file.

### Look and feel: no generated defaults

- Before building a page or app's look, write a short plan in `design/PLAN.md`: the subject and who it's for, the one bold element, 4 to 6 named colors (light and dark), and the layout as a sketch. Take the ideas from the subject's own world, not from other websites. If a frontend-design skill is available, load it.
- Check the plan against the generated defaults and change anything that matches: a big headline over a muted sentence and a pill button; pills or one corner radius on everything; grids of identical cards; small labels above headings; colored dots or squares as decoration; details joined with middle dots; monospace for small labels; copy that explains the interface instead of using it.
- Spend boldness in one place and keep the rest quiet. Look at screenshots (phone and desktop, light and dark) before calling it done.
- Experiments on kylepace.dev are their own pages (kp-design's `LabLayout`) with their own look. The app comes first; the explanation goes on its About page, linked from the top bar.
- About pages use the same title, headings and step format everywhere (the `about-page` skill). The look can follow the project's theme; the words never do.

### How things get built

- Static and simple by default. Add JavaScript, servers or dependencies only where they earn it.
- Colors, type and spacing live in one tokens file. Light and dark mode exist from the start.
- Copy is plain language, written for the person using it.
- Don't add "Built with AI" lines or other AI credits to sites or apps unless Kyle asks.

### Correctness

- Anything that reads data from outside the project (a feed, a flyer, an API response, a file someone picks) gets a test that runs it against a saved real sample, plus one broken sample.
- One bad record never takes down the rest: skip it, log it, and keep going.
- A scheduled job that fails must fail out loud (a red run), and must never replace good published data with empty or partial data.
- A bug fix comes with a test that fails without the fix, when the project has tests.

### Performance

Budgets, not goals. If a project needs to go over (a map, a globe, a video player), its section says so and by how much.

- Content pages ship no more than 50 KB of JavaScript (compressed), and read fine without it.
- No single image over 200 KB. Images are sized to how they're shown, served as AVIF or WebP, given `width` and `height`, and lazy-loaded below the first screen.
- On a mid-range phone: the main content shows within 2.5 seconds (Largest Contentful Paint) and the layout shifts less than 0.1 (Cumulative Layout Shift). Lighthouse performance is 90 or higher on mobile.

### Shipping

- Small commits, each with a plain sentence saying what changed for the person using it.
- Websites deploy from `main`. Once the checks for the change's tier pass (see "Before you call it done"), push to `main`; no need to wait for Kyle. Use a branch and pull request when he asks for one, or when you want him to look before it goes live.
- Never force-push `main`, skip a failing check to get something out, or commit a secret.
- Changing the principles or kp-design changes every project. Test the change against one real project first, then roll it out.
- **Ask Kyle first, every time:** anything that costs money; a new outside service, SDK or host (see above); DNS, domain or email changes; deleting data, a repo or a deployed project; making a private repo public or a public one private; publishing something he hasn't linked publicly yet (a draft, a case study, an unannounced app); anything that speaks for him (his résumé, LinkedIn, a post or message in his name).
- When Kyle has to do a step himself (approve a setting, create a repo, sign in), give him the direct link to the exact page.
- If you couldn't finish or couldn't check something, say so plainly in your report. Don't describe work as done when a step was skipped.

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

Match the checking to the change. If you're unsure which tier a change is, use the higher one. In your report, say which tier you used and what you ran.

**Tier 1: words and data.** Copy, a link, a value in a data file, a dependency pin, docs.

- The build passes, and so do any tests and linters.
- Read the changed text where it shows up in the built output.

**Tier 2: something people see or use changed.** Layout, styles, a component, a new control, new behavior.

- Everything in tier 1.
- A new feature has its events in code and in the Amplitude tracking plan (see "Analytics events").
- Run the project's check command (`npm run check` where a project has one). It runs axe on every page in light and dark, fails on sideways scrolling, and saves screenshots at 320, 768, 1280 and 1920 px. Fix what it finds.
- Look at the changed screen in light and dark, at the smallest size and a large one.
- Use new controls with the keyboard (and VoiceOver in apps): reachable, visible focus, a name that makes sense.

**Tier 3: a new page, screen or project, or a redesign.**

- Everything in tier 2.
- Look at every size in light and dark: 320, 768, 1280 and 1920 px wide.
- Check it at 200% text zoom (the largest Dynamic Type size in apps) and with reduced motion on.
- Everything under "Every new page or project ships with".
- Check it against the performance budgets.

CI runs the check command where a project has one, the stack check (see "Default stack"), and a third-party check that fails if a page loads scripts, styles, fonts or images from a host that isn't allowed. Don't add a host just to get past it: ask Kyle, or for a content image follow the image rule above.

<!-- END principles -->

## This project

Washington transit, live: every bus, train and ferry in Washington that reports where it is, on one map with every route and stop, at [kylepace.dev/transit/](https://kylepace.dev/transit/). It moved here from kylepace.net/labs/transit/ (which now redirects) and is one of the experiments on the [kylepace.dev](https://github.com/kyle-pace/kylepace.dev) hub. The repo is `wa-transit-map`; the path is `/transit/`.

- **Feeds:** `src/lib/transit-feeds.ts` lists every system, its GTFS schedule zips and, where there is one, its GTFS-realtime vehicle feed. It has no imports and only erasable TypeScript, because Node runs it directly from the data script. Add or fix a feed there.
- **Routes and stops:** `scripts/build-transit.ts` downloads the schedules and writes `public/transit/` (meta, routes, stops, and `report.json` saying what each feed gave). GitHub Actions runs it weekly and whenever the feed list changes (`.github/workflows/transit-data.yml`). Don't hand-edit those files.
- **Live positions:** `src/pages/transit/api/vehicles.json.ts` fetches every live feed, decodes it (`src/lib/gtfs-rt.ts`) and caches the merged answer at the edge for 15 seconds.
- **OneBusAway key:** Sound Transit, Pierce Transit, Washington State Ferries and the Seattle Streetcar come through OneBusAway Puget Sound. The Worker reads the `OBA_API_KEY` secret and falls back to the shared `TEST` key.
- **The map:** `src/components/TransitMap.astro` (markup, styles) and `transit-map.ts` (MapLibre logic). The basemap is OpenFreeMap, approved for this project only (`.agents/allowed-hosts.txt`).
- **It's its own Cloudflare Worker (`wa-transit-map`) on the hub's domain.** The routes in `wrangler.jsonc` claim `kylepace.dev/transit` and `/transit/*`. Everything it serves, including the live API, lives under `/transit/`. Don't use Astro's `base` option; with the Cloudflare adapter it serves files from the wrong folder.
- **It stands on its own, not as a page of kylepace.dev.** The shell is kp-design's `LabLayout` (a back link to kylepace.dev, a one-line footer, display settings and analytics to the shared kylepace.dev Amplitude project), pinned to a commit in package.json. The bar's right side holds the lab's own links (Live map, Agencies, About). About is its own page, `src/pages/transit/about.astro` (`/transit/about/`), with the standard title, headings and step format from the `about-page` skill; its "How it works" steps are drawn as a strip map, with counts and dates read from the data files. If how the data is collected or served changes, change that page too. The map and agencies pages keep a short `#about` section with credits. LabLayout gives no heading sizes, page width or prose styles, so each page styles its own layout.
- **Its look is its own:** `src/styles/theme.css` overrides kp-design's tokens (Shore, Sound, Guide green) and holds the shared bits (the bar links, the green sign plate). The plan behind it is `design/PLAN.md`: the map fills the window with one sign mounted on it, the agencies page is a directory, no pills, eyebrows, middle dots or monospace labels. `transit-map.ts` retints the basemap's land and water to match (`BASEMAP`), so keep the two in step.
- **Share cards:** `design/og.html` and `design/og-agencies.html` draw the lab's sign, one line and the address over the left side of the original artwork (`design/base-*.png`), rendered to `public/transit/share.png` and `share-agencies.png`. `design/og-about.html` is the about page's card (`share-about.png`), drawn from scratch with the same strip map.
- Run `npm run build` before pushing; it must pass. Cloudflare Workers Builds deploys `main`.
- **Checking a change:** `npm run build`, then `npm run check` (the `page-check` skill): axe in light and dark, sideways scrolling, JavaScript weight, and screenshots in `.check/`. CI runs it on every push.
- **JavaScript budget: 400 KB** per page, over the principles' 50 KB for content pages. The map library (MapLibre) and live vehicle drawing run in the browser. `npm run check` enforces it; raise it only with a reason written here.
- **Tests:** `npm test` (Node's own test runner, nothing to install). `tests/build-transit.test.mjs` runs the weekly data job against a saved real schedule and broken copies of it (not a zip, no routes, junk rows); `tests/gtfs-rt.test.mjs` runs the live-position reader against a saved real feed, an empty one, a cut-off one and an error page. Samples are in `tests/samples/`. The data job writes to `TRANSIT_OUT` when it's set, so tests never touch `public/transit/`. CI runs the tests on every push and before each weekly build. The weekly build goes red only when every feed it tried failed; a single failed feed keeps its last good data and shows as a warning on the run.
