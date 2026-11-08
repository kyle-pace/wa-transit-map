// Live vehicle positions for every Washington transit system with a realtime feed, for
// the map at /transit/ (src/lib/transit.ts). Server-rendered; the merged answer is
// cached at the edge for 15 seconds, so the agencies' feeds are read at most about four
// times a minute per Cloudflare location, however many people have the map open.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getLiveVehicles } from '../../../lib/transit';

export const prerender = false;

const EDGE_SECONDS = 15;

export const GET: APIRoute = async ({ request, locals }) => {
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  const cacheKey = new Request(new URL('/transit/api/vehicles.json', request.url).toString());
  const cached = await cache?.match(cacheKey);
  if (cached) return cached;

  // OneBusAway Puget Sound key (Sound Transit, Pierce Transit, WSF, Seattle Streetcar).
  // Set it with `wrangler secret put OBA_API_KEY`; TEST is OneBusAway's shared key.
  const obaKey = (env as unknown as Record<string, string | undefined>).OBA_API_KEY || 'TEST';

  try {
    const body = JSON.stringify(await getLiveVehicles(obaKey));
    const response = new Response(body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': `public, max-age=10, s-maxage=${EDGE_SECONDS}`,
      },
    });
    const ctx = (locals as { cfContext?: { waitUntil(p: Promise<unknown>): void } }).cfContext;
    if (cache && ctx) ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error('Transit vehicles failed', error);
    return new Response(JSON.stringify({ error: 'The live feeds didn’t answer. Try again in a bit.' }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
};
