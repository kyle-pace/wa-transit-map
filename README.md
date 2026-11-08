# Washington transit, live

Every bus, train and ferry in Washington that reports where it is, on one zoomable map with every route and stop. Positions refresh every 15 seconds.

Live at **[kylepace.dev/transit](https://kylepace.dev/transit/)**, one of the experiments on [kylepace.dev](https://kylepace.dev). There's also a page for [every agency](https://kylepace.dev/transit/agencies/).

Built with [Astro](https://astro.build) and [MapLibre](https://maplibre.org) on Cloudflare Workers, using [kp-design](https://github.com/kyle-pace/kp-design), following [kyle-pace/principles](https://github.com/kyle-pace/principles).

## Run it

```sh
npm install
npm run dev       # http://localhost:4321/transit/
npm run build     # builds to dist/
npm run preview   # builds, then runs it the way Cloudflare will
npm run data      # rebuilds routes and stops from every feed (slow)
```

## How it works

- `src/lib/transit-feeds.ts` lists every system: its GTFS schedule zips and, where there is one, its GTFS-realtime vehicle positions feed. Add or fix a feed there.
- `scripts/build-transit.ts` downloads the schedules and writes `public/transit/` (meta, routes, stops, plus `report.json` saying what each feed gave). GitHub Actions runs it weekly and whenever the feed list changes; a failed download keeps that system's last good data.
- `/transit/api/vehicles.json` fetches every live feed, decodes it (`src/lib/gtfs-rt.ts`) and caches the merged answer at the edge for 15 seconds. Its `feeds` list shows which feeds answered.
- Sound Transit, Pierce Transit, Washington State Ferries and the Seattle Streetcar come through OneBusAway Puget Sound. It works with OneBusAway's shared `TEST` key; for a real key, email oba_api_key@soundtransit.org and set it with `npx wrangler secret put OBA_API_KEY`.
- The basemap is OpenFreeMap (free, no key).

## How it's served

Its own Cloudflare Worker, `wa-transit-map`, mounted on the hub's domain by two routes in `wrangler.jsonc` (`kylepace.dev/transit` and `kylepace.dev/transit/*`). Cloudflare Workers Builds deploys `main` (build `npm run build`, deploy `npx wrangler deploy`).
