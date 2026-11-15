// Retired: World transit (kylepace.dev/world-transit, repo kyle-pace/world-transit)
// replaced this map. Every old address sends people to the closest new page, so old links
// and shared cards keep working: the map opens on Puget Sound, the agencies page on the
// United States. Absolute addresses, since this Worker only owns /transit.
import type { APIRoute } from 'astro';

export const prerender = false;

const NEW = 'https://kylepace.dev/world-transit';

export function newAddress(path: string): string {
  const p = `/${path}`.replace(/\/+$/, '');
  if (p === '' || p === '/') return `${NEW}/?at=-122.33,47.6,9`;
  if (p.startsWith('/agencies')) return `${NEW}/agencies/us/`;
  if (p.startsWith('/about')) return `${NEW}/about/`;
  return `${NEW}/`;
}

export const GET: APIRoute = ({ params }) => new Response(null, { status: 301, headers: { location: newAddress(params.path ?? '') } });
