// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// The live transit map lives at kylepace.dev/transit/. It's its own Worker, mounted on
// that path by the routes in wrangler.jsonc; the hub (kyle-pace/kylepace.dev) serves
// everything else on the domain.
// Everything this site serves sits under /transit/: pages and the live API in
// src/pages/transit/, routes and stops in public/transit/, and built assets in
// /transit/_astro/. (Astro's `base` option isn't used: with the Cloudflare adapter it
// serves the files from the wrong folder.)
// Static by default; /transit/api/vehicles.json renders on request.
export default defineConfig({
  site: 'https://kylepace.dev',
  build: { assets: 'transit/_astro' },
  session: false,
  adapter: cloudflare({ imageService: 'compile' }),
});
