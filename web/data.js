// Requests to the data server, shared by early.js and app.js (both get the same copy of this module).
import { CFG } from './config.js';

export const LIVE_COLS = 'hex,flight,reg,ac_type,descr,operator,lat,lon,alt_baro,alt_geom,on_ground,gs,track,baro_rate,geom_rate,squawk,emergency,nic,nac_p,mil,pos_time';

export async function api(path) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(CFG.api + path, { headers: { apikey: CFG.key }, signal: ctl.signal, cache: 'no-store', credentials: 'omit' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

// The server hands out at most 1,000 rows per request, so a long list is read page by page.
export async function apiPages(path, max) {
  const out = [];
  for (let off = 0; off < max; off += 1000) {
    const part = await api(`${path}&order=hex&limit=1000&offset=${off}`);
    out.push(...part);
    if (part.length < 1000) break;
  }
  return out;
}

const ago = (sec) => new Date(Date.now() - sec * 1000).toISOString();

// Everything the map needs every 15 seconds: aircraft within about 460 km, declared emergencies,
// the freshness of the aircraft sources (adsb.lol and our own home station), the navigation-interference grid and military aircraft worldwide.
export const nearLoad = () => Promise.all([
  api(`/aircraft_live?select=${LIVE_COLS}&in_region=eq.true&pos_time=gte.${ago(CFG.maxAgeSec)}&lat=not.is.null&limit=2000`),
  api('/emergencies?select=hex,flight,reg,ac_type,squawk,emergency,first_seen,last_seen,lat,lon,alt_baro&active=eq.true&order=first_seen.desc&limit=200'),
  api('/source_status?select=source,last_ok,last_error&source=in.(adsb.lol%2Fpoint,home)'),
  api('/derived?select=key,data,computed_at&key=in.(gnss_grid)'),
  // military aircraft anywhere in the world (the source sends this list every two minutes, so it may be a little older)
  api(`/aircraft_live?select=${LIVE_COLS}&mil=eq.true&in_region=eq.false&pos_time=gte.${ago(300)}&lat=not.is.null&limit=1500`),
]);

// Aircraft beyond about 460 km and up to about 4,000 km, every minute.
export const farLoad = () => apiPages(`/aircraft_live?select=${LIVE_COLS}&in_wide=eq.true&in_region=eq.false&pos_time=gte.${ago(CFG.maxAgeSec)}&lat=not.is.null`, 8000);

// The first round is started by early.js as soon as the page begins loading, while the map library is still
// downloading. app.js takes each answer once; every later round is a fresh request.
let first = null;
export function startFirst() {
  if (first) return;
  first = { near: nearLoad(), far: farLoad() };
  first.near.catch(() => {}); first.far.catch(() => {});
}
export function takeFirst(kind) {
  const p = first ? first[kind] : null;
  if (first) first[kind] = null;
  return p;
}
