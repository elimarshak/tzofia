import { CFG, THEMES } from './config.js';
import { STR } from './i18n.js';

/* global maplibregl, pmtiles, basemaps */

const store = {
  get(k, d) { try { return localStorage.getItem('tz-' + k) || d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tz-' + k, v); } catch { /* private mode */ } },
};

const S = {
  lang: store.get('lang', 'he') === 'en' ? 'en' : 'he',
  theme: store.get('theme', 'dark') === 'light' ? 'light' : 'dark',
  showAc: true, showLabels: true, showGnss: true, showSats: true, showQuakes: true, showShips: true, showFires: true,
  ships: [], fires: [], img: 'off',
  ref: { airlines: null, airports: null, routes: new Map() },
  sats: [], satView: [], satInView: 0, satNow: [], satLib: null, quakes: [],
  ac: [], em: [], src: null, gnss: null, loaded: false, netErr: false,
  view: { name: 'home' },
  map: null,
};
const t = () => STR[S.lang];
const T = () => THEMES[S.theme];
const $ = (s) => document.querySelector(s);

/* ---------- tiny DOM helper: text only, never HTML from data ---------- */
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
function svg(pathD, cls) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2.2'); s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path'); p.setAttribute('d', pathD); s.append(p);
  return s;
}
const chev = () => svg('m14 6-6 6 6 6', 'chev');

/* ---------- data ---------- */
const LIVE_COLS = 'hex,flight,reg,ac_type,descr,operator,lat,lon,alt_baro,alt_geom,on_ground,gs,track,baro_rate,geom_rate,squawk,emergency,nic,nac_p,mil,pos_time';

async function api(path) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(CFG.api + path, { headers: { apikey: CFG.key }, signal: ctl.signal, cache: 'no-store', credentials: 'omit' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function refresh() {
  const since = new Date(Date.now() - CFG.maxAgeSec * 1000).toISOString();
  try {
    const [ac, em, src, drv] = await Promise.all([
      api(`/aircraft_live?select=${LIVE_COLS}&in_region=eq.true&pos_time=gte.${since}&lat=not.is.null&limit=2000`),
      api('/emergencies?select=hex,flight,reg,ac_type,squawk,emergency,first_seen,last_seen,lat,lon,alt_baro&active=eq.true&order=first_seen.desc&limit=200'),
      api('/source_status?select=source,last_ok,last_error&source=eq.adsb.lol%2Fpoint'),
      api('/derived?select=key,data,computed_at&key=in.(gnss_grid)'),
    ]);
    const g = drv.find((d) => d.key === 'gnss_grid');
    S.gnss = g && Date.now() - Date.parse(g.computed_at) < 10 * 60 * 1000 ? g.data : null;
    // An emergency is shown only when it is backed up: a 7500/7600/7700 code, or the emergency flag
    // received more than once, at least a minute apart, from an aircraft with a known position.
    const confirmed = (e) => ['7500', '7600', '7700'].includes(e.squawk)
      || (e.lat != null && e.lon != null && Date.parse(e.last_seen) - Date.parse(e.first_seen) >= 60000);
    S.ac = ac; S.em = em.filter(confirmed); S.src = src[0] || null; S.netErr = false; S.loaded = true;
  } catch {
    S.netErr = true;
  }
  drawAircraft(); drawGnss();
  render();
}

/* ---------- slower layers: satellites and earthquakes (every 5 minutes) ---------- */
const QUAKE_MIN_MAG = 2.5;
async function refreshSlow() {
  try {
    const rows = await api('/derived?select=key,data,computed_at&key=in.(quakes,fires)');
    const fresh = (r, min) => r && Date.now() - Date.parse(r.computed_at) < min * 60 * 1000;
    const q = rows.find((r) => r.key === 'quakes');
    S.quakes = fresh(q, 30) ? q.data.events.filter((e) => e.mag != null && e.mag >= QUAKE_MIN_MAG) : [];
    const f = rows.find((r) => r.key === 'fires');
    // each spot: [lat, lon, power in megawatts, confidence n|h, minutes since epoch, D|N]
    S.fires = fresh(f, 120) ? f.data.spots.map((x, i) => ({ id: 'f' + i, lat: x[0], lon: x[1], frp: x[2], conf: x[3], time: new Date(x[4] * 60000).toISOString(), dn: x[5] })) : [];
  } catch { /* keep what we have */ }
  drawQuakes(); drawFires(); tickSats(); render();
}

// Satellites: the whole public catalogue (our own copy, refreshed every 3 hours by our workflow) is loaded
// on the device. Every 10 seconds we work out which satellites are over the part of the map on screen,
// and every second we move just those. A phone therefore never animates more than SAT_MAX objects.
const SAT_SRC = 'https://raw.githubusercontent.com/elimarshak/tzofia/data/celestrak_active.csv';
const SAT_MAX = 2500;
const pause = () => new Promise((r) => setTimeout(r, 0));
async function loadCatalogue() {
  try {
    if (!S.satLib) S.satLib = await import('./vendor/satellite/index.js');
    const lib = S.satLib;
    const text = await (await fetch(SAT_SRC, { cache: 'no-cache' })).text();
    const lines = text.split(/\r?\n/).filter(Boolean), head = lines[0].split(',');
    if (head[0] !== 'OBJECT_NAME') return;
    const NUM = new Set(['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY',
      'EPHEMERIS_TYPE', 'NORAD_CAT_ID', 'ELEMENT_SET_NO', 'REV_AT_EPOCH', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT']);
    const all = [];
    for (let n = 1; n < lines.length; n++) {
      const cells = lines[n].split(','); if (cells.length < head.length) continue;
      const o = {}; head.forEach((k, i) => { o[k] = NUM.has(k) ? Number(cells[i]) : cells[i]; });
      try { const rec = lib.json2satrec(o); if (rec && !rec.error) all.push({ id: String(o.NORAD_CAT_ID), name: o.OBJECT_NAME, incl: o.INCLINATION, epoch: o.EPOCH, rec }); } catch { /* skip */ }
      if (n % 1500 === 0) await pause();
    }
    S.sats = all;
    scanSats();
  } catch { /* keep what we have */ }
}
function satPos(st, now, gmst) {
  const lib = S.satLib, pv = lib.propagate(st.rec, now);
  const pos = pv && pv.position, vel = pv && pv.velocity;
  if (!pos || typeof pos !== 'object') return null;
  const g = lib.eciToGeodetic(pos, gmst);
  return { id: st.id, name: st.name, incl: st.incl, lat: lib.degreesLat(g.latitude), lon: lib.degreesLong(g.longitude), km: g.height,
    kms: vel && typeof vel === 'object' ? Math.hypot(vel.x, vel.y, vel.z) : null };
}
let scanning = false;
async function scanSats() {
  const m = S.map, lib = S.satLib;
  if (!m || !lib || scanning || !S.showSats || document.hidden || !S.sats.length) return;
  scanning = true;
  try {
    const b = m.getBounds(), padX = (b.getEast() - b.getWest()) * 0.15, padY = (b.getNorth() - b.getSouth()) * 0.15;
    const w = b.getWest() - padX, e = b.getEast() + padX, s0 = b.getSouth() - padY, n0 = b.getNorth() + padY;
    const whole = e - w >= 360;
    const now = new Date(), gmst = lib.gstime(now), inView = [];
    for (let i = 0; i < S.sats.length; i++) {
      const o = satPos(S.sats[i], now, gmst);
      if (o && o.lat >= s0 && o.lat <= n0 && (whole || [o.lon, o.lon - 360, o.lon + 360].some((x) => x >= w && x <= e))) inView.push(S.sats[i]);
      if (i % 2000 === 1999) await pause();
    }
    S.satInView = inView.length;
    const step = Math.ceil(inView.length / SAT_MAX);
    let view = step > 1 ? inView.filter((_, i) => i % step === 0) : inView;
    if (S.view.name === 'sat' && !view.some((x) => x.id === S.view.id)) { const sel = S.sats.find((x) => x.id === S.view.id); if (sel) view = view.concat(sel); }
    S.satView = view;
  } finally { scanning = false; }
  tickSats();
}
function tickSats() {
  const m = S.map, lib = S.satLib;
  if (!m || !m.getSource('sats')) return;
  const out = [];
  if (lib && S.showSats && !document.hidden) {
    const now = new Date(), gmst = lib.gstime(now);
    for (const st of S.satView) { const o = satPos(st, now, gmst); if (o) out.push(o); }
  }
  S.satNow = out;
  m.getSource('sats').setData({ type: 'FeatureCollection', features: out.map((o) => (
    { type: 'Feature', properties: { id: o.id }, geometry: { type: 'Point', coordinates: [o.lon, o.lat] } })) });
  if (S.view.name === 'sat') { const f = document.querySelector('#sheet-body dl.facts'); if (f) f.replaceWith(satFacts(S.view.id)); }
}

// Ships: the latest position of every ship our listener heard in the last 20 minutes.
async function refreshShips() {
  if (!S.showShips || document.hidden) return;
  try {
    const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    S.ships = await api(`/ships_live?select=mmsi,name,lat,lon,sog,cog,heading,nav,kind,dest,callsign,t&t=gte.${since}&lat=not.is.null&limit=8000`);
  } catch { /* keep what we have */ }
  drawShips();
  if (S.view.name === 'ship') render();
}
function drawShips() {
  const m = S.map; if (!m || !m.getSource('ships')) return;
  m.getSource('ships').setData({ type: 'FeatureCollection', features: S.ships.map((x) => (
    { type: 'Feature', properties: { id: String(x.mmsi), dir: x.heading ?? x.cog ?? 0, still: (x.sog ?? 0) < 0.5 ? 1 : 0 },
      geometry: { type: 'Point', coordinates: [x.lon, x.lat] } })) });
}
function drawFires() {
  const m = S.map; if (!m || !m.getSource('fires')) return;
  m.getSource('fires').setData({ type: 'FeatureCollection', features: S.fires.map((x) => (
    { type: 'Feature', properties: { id: x.id, frp: x.frp }, geometry: { type: 'Point', coordinates: [x.lon, x.lat] } })) });
}
function shipImage(fill, halo, moving) {
  const c = document.createElement('canvas'); c.width = c.height = 40;
  const x = c.getContext('2d');
  x.translate(20, 20); x.lineJoin = 'round'; x.lineWidth = 3; x.strokeStyle = halo; x.fillStyle = fill;
  const p = new Path2D(moving ? 'M0,-13 L7,-3 L7,12 L-7,12 L-7,-3 Z' : 'M0,-7 L7,0 L0,7 L-7,0 Z');
  x.stroke(p); x.fill(p);
  return x.getImageData(0, 0, 40, 40);
}

function drawQuakes() {
  const m = S.map; if (!m || !m.getSource('quakes')) return;
  m.getSource('quakes').setData({ type: 'FeatureCollection', features: S.quakes.map((e) => (
    { type: 'Feature', properties: { id: e.id, mag: e.mag }, geometry: { type: 'Point', coordinates: [e.lon, e.lat] } })) });
}

// Share of aircraft with low position accuracy per map cell, last hour (gpsjam.org formula).
function gnssZones() {
  const g = S.gnss; if (!g) return [];
  const out = [];
  for (const [gy, gx, good, bad] of g.cells) {
    const pct = 100 * (bad - 1) / (good + bad);
    if (pct >= 2) out.push({ gy, gx, pct, level: pct > 10 ? 2 : 1 });
  }
  return out;
}

const altOf = (a) => a.alt_baro ?? a.alt_geom;
function band(a) {
  if (a.on_ground) return '0';
  const x = altOf(a);
  if (x == null) return 'u';
  return x < 5000 ? '0' : x < 15000 ? '1' : x < 30000 ? '2' : '3';
}
const isEmerg = (a) => ['7500', '7600', '7700'].includes(a.squawk) || S.em.some((e) => e.hex === a.hex);
const lowAcc = (a) => !a.on_ground && a.nic != null && a.nic < 7;
const callsign = (a) => { const c = (a.flight || '').trim(); return /^[A-Z0-9-]{2,8}$/i.test(c) ? c : ''; };   // transponders sometimes send filler such as @@@@@@@@
/* ---------- airlines and routes: an open public-domain table keyed by callsign ---------- */
const refUrl = (f) => new URL('ref/' + f, location.href).href;
async function refJson(f) { const r = await fetch(refUrl(f)); if (!r.ok) throw new Error(f); return r.json(); }
const csKey = (cs) => { const m = /^([A-Z]{3})0*(\d.*)$/.exec(cs); return m ? m[1] + m[2] : cs; };
const csPrefix = (cs) => (/^[A-Z]{3}\d/.test(cs) ? cs.slice(0, 3) : null);
const airlineOf = (cs) => { const p = csPrefix(cs); return p && S.ref.airlines ? S.ref.airlines[p] || null : null; };
// Route registered for this callsign, as airport records [{code, name, city, cc}], or null. undefined = still loading.
function routeOf(cs) {
  const p = csPrefix(cs); if (!p) return null;
  const table = S.ref.routes.get(p);
  if (table === undefined) { loadRoutes([p]); return undefined; }
  if (!table || !S.ref.airports) return S.ref.airports === null ? undefined : null;
  const codes = table[csKey(cs)]; if (!codes) return null;
  return codes.split('-').map((code) => { const a = S.ref.airports[code]; return { code, name: a ? a[0] : code, city: a ? a[1] : '', cc: a ? a[2] : '' }; });
}
let refBusy = false;
async function loadRoutes(prefixes) {
  const need = prefixes.filter((p) => !S.ref.routes.has(p));
  if (!need.length && S.ref.airports) return;
  need.forEach((p) => S.ref.routes.set(p, false));   // false = requested
  try {
    if (!S.ref.airports && !refBusy) { refBusy = true; S.ref.airports = await refJson('airports.json').catch(() => ({})); }
    await Promise.all(need.map(async (p) => S.ref.routes.set(p, await refJson('routes/' + p + '.json').catch(() => ({})))));
  } finally { render(); }
}
const placeName = (a) => [a.city || a.name, a.cc].filter(Boolean).join(', ');

const emName = (e) => (e.flight || '').trim() || e.reg || e.hex.toUpperCase();
const airborne = () => S.ac.filter((a) => !a.on_ground);

/* ---------- map ---------- */
const PLANE = 'M0,-9 L1.6,-3 L8,1.5 L8,3 L1.6,1.2 L1.2,6 L3.4,7.8 L3.4,9 L0,8 L-3.4,9 L-3.4,7.8 L-1.2,6 L-1.6,1.2 L-8,3 L-8,1.5 L-1.6,-3 Z';

function planeImage(fill, halo) {
  const c = document.createElement('canvas'); c.width = c.height = 60;
  const x = c.getContext('2d');
  x.translate(30, 30); x.scale(2.7, 2.7);
  const p = new Path2D(PLANE);
  x.lineJoin = 'round'; x.lineWidth = 1.5; x.strokeStyle = halo; x.stroke(p);
  x.fillStyle = fill; x.fill(p);
  return x.getImageData(0, 0, 60, 60);
}
function ringImage(color) {
  const c = document.createElement('canvas'); c.width = c.height = 76;
  const x = c.getContext('2d');
  x.lineWidth = 4; x.strokeStyle = color; x.setLineDash([8, 6.5]);
  x.beginPath(); x.arc(38, 38, 33, 0, Math.PI * 2); x.stroke();
  return x.getImageData(0, 0, 76, 76);
}

// The basemap comes as three files (GitHub refuses single files over 100 MB): the world at a basic
// level, the Middle East and Mediterranean at a medium level, Israel and its neighbours at the finest.
// Each finer file is drawn on top of the coarser one, starting at the zoom where the coarser one ends.
const BASEMAPS = window.TZ_BASEMAPS || [{ id: 'world', file: 'basemap-world.pmtiles', maxzoom: 6 }];

function mapStyle() {
  const base = new URL('.', location.href).href;
  const c = T();
  const flavor = { ...basemaps.namedFlavor(S.theme), background: c.sea, earth: c.land, water: c.sea };
  const sources = {}, layers = [];
  BASEMAPS.forEach((b, i) => {
    sources[b.id] = { type: 'vector', url: 'pmtiles://' + base + b.file };
    const from = i === 0 ? 0 : BASEMAPS[i - 1].maxzoom + 1;
    for (const l of basemaps.layers(b.id, flavor, { lang: S.lang })) {
      if (i > 0 && l.type === 'background') continue;
      layers.push(i === 0 ? l : { ...l, id: b.id + '-' + l.id, minzoom: Math.max(l.minzoom || 0, from) });
    }
  });
  return {
    version: 8,
    glyphs: base + 'assets/fonts/{fontstack}/{range}.pbf',
    sprite: base + 'assets/sprites/v4/' + S.theme,
    sources, layers,
  };
}

function addOverlay() {
  const m = S.map, c = T();
  const img = (name, data) => { if (m.hasImage(name)) m.removeImage(name); m.addImage(name, data, { pixelRatio: 2 }); };
  c.alt.forEach((col, i) => img('plane-' + i, planeImage(col, c.halo)));
  img('plane-u', planeImage(c.unk, c.halo));
  img('plane-e', planeImage(c.warn, c.halo));
  img('ring', ringImage(c.warn));
  img('ship-1', shipImage(c.ship, c.halo, true)); img('ship-0', shipImage(c.ship, c.halo, false));

  m.addSource('gnss', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  m.addLayer({ id: 'gnss', type: 'fill', source: 'gnss',
    paint: { 'fill-color': c.warn, 'fill-opacity': ['case', ['==', ['get', 'level'], 2], 0.42, 0.17], 'fill-outline-color': c.warn } });
  const empty = { type: 'FeatureCollection', features: [] };
  m.addSource('quakes', { type: 'geojson', data: empty });
  m.addLayer({ id: 'quakes', type: 'circle', source: 'quakes',
    paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 2.5, 5, 4, 11, 6, 24],
      'circle-color': c.accent, 'circle-opacity': 0.14, 'circle-stroke-color': c.accent, 'circle-stroke-width': 1.6 } });
  m.addLayer({ id: 'quake-sel', type: 'circle', source: 'quakes', filter: ['==', ['get', 'id'], ''],
    paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 2.5, 9, 4, 15, 6, 28], 'circle-color': c.accent, 'circle-opacity': 0, 'circle-stroke-color': c.ink, 'circle-stroke-width': 2 } });
  m.addSource('fires', { type: 'geojson', data: empty });
  m.addLayer({ id: 'fires', type: 'circle', source: 'fires',
    paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'frp'], 0, 2.4, 20, 4, 200, 7], 'circle-color': c.fire, 'circle-opacity': 0.85,
      'circle-stroke-color': c.halo, 'circle-stroke-width': 0.8 } });
  m.addLayer({ id: 'fire-sel', type: 'circle', source: 'fires', filter: ['==', ['get', 'id'], ''],
    paint: { 'circle-radius': 11, 'circle-color': c.fire, 'circle-opacity': 0, 'circle-stroke-color': c.ink, 'circle-stroke-width': 2 } });
  m.addSource('ships', { type: 'geojson', data: empty });
  m.addLayer({ id: 'ship-sel', type: 'circle', source: 'ships', filter: ['==', ['get', 'id'], ''],
    paint: { 'circle-radius': 14, 'circle-color': c.accent, 'circle-opacity': 0.22, 'circle-stroke-color': c.accent, 'circle-stroke-width': 2 } });
  m.addLayer({ id: 'ships', type: 'symbol', source: 'ships',
    layout: { 'icon-image': ['case', ['==', ['get', 'still'], 1], 'ship-0', 'ship-1'], 'icon-rotate': ['get', 'dir'], 'icon-rotation-alignment': 'map',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.55, 8, 0.9, 11, 1.1], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
  m.addSource('sats', { type: 'geojson', data: empty });
  m.addLayer({ id: 'sat-sel', type: 'circle', source: 'sats', filter: ['==', ['get', 'id'], ''],
    paint: { 'circle-radius': 11, 'circle-color': c.accent, 'circle-opacity': 0.22, 'circle-stroke-color': c.accent, 'circle-stroke-width': 2 } });
  m.addLayer({ id: 'sats', type: 'circle', source: 'sats',
    paint: { 'circle-radius': 2.6, 'circle-color': c.ink, 'circle-opacity': 0.85, 'circle-stroke-color': c.halo, 'circle-stroke-width': 1 } });
  m.addSource('ac', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  m.addLayer({ id: 'ac-ring', type: 'symbol', source: 'ac', filter: ['==', ['get', 'low'], 1],
    layout: { 'icon-image': 'ring', 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
  m.addLayer({ id: 'ac-sel', type: 'circle', source: 'ac', filter: ['==', ['get', 'hex'], ''],
    paint: { 'circle-radius': 19, 'circle-color': c.accent, 'circle-opacity': 0.22, 'circle-stroke-color': c.accent, 'circle-stroke-width': 2 } });
  m.addLayer({ id: 'ac', type: 'symbol', source: 'ac',
    layout: {
      'icon-image': ['concat', 'plane-', ['get', 'band']],
      'icon-rotate': ['get', 'track'], 'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'prio'],
      'text-field': ['get', 'label'], 'text-font': ['Noto Sans Medium'], 'text-size': 11.5,
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 1.25,
      'text-optional': true, 'text-allow-overlap': false,
    },
    paint: { 'text-color': c.ink, 'text-halo-color': c.halo, 'text-halo-width': 1.6 } });
  applyLayerOptions();
  drawAircraft(); drawGnss(); drawQuakes(); drawFires(); drawShips(); tickSats();
}

function applyLayerOptions() {
  const m = S.map; if (!m || !m.getLayer('ac')) return;
  for (const id of ['ac', 'ac-ring', 'ac-sel']) m.setLayoutProperty(id, 'visibility', S.showAc ? 'visible' : 'none');
  m.setLayoutProperty('ac', 'text-field', S.showLabels ? ['get', 'label'] : '');
  m.setLayoutProperty('gnss', 'visibility', S.showGnss ? 'visible' : 'none');
  m.setFilter('ac-sel', ['==', ['get', 'hex'], S.view.name === 'ac' ? S.view.hex : '']);
  for (const id of ['sats', 'sat-sel']) m.setLayoutProperty(id, 'visibility', S.showSats ? 'visible' : 'none');
  for (const id of ['quakes', 'quake-sel']) m.setLayoutProperty(id, 'visibility', S.showQuakes ? 'visible' : 'none');
  m.setFilter('sat-sel', ['==', ['get', 'id'], S.view.name === 'sat' ? S.view.id : '']);
  m.setFilter('quake-sel', ['==', ['get', 'id'], S.view.name === 'quake' ? S.view.id : '']);
  for (const id of ['ships', 'ship-sel']) m.setLayoutProperty(id, 'visibility', S.showShips ? 'visible' : 'none');
  for (const id of ['fires', 'fire-sel']) m.setLayoutProperty(id, 'visibility', S.showFires ? 'visible' : 'none');
  m.setFilter('ship-sel', ['==', ['get', 'id'], S.view.name === 'ship' ? S.view.id : '']);
  m.setFilter('fire-sel', ['==', ['get', 'id'], S.view.name === 'fire' ? S.view.id : '']);
  applyImagery();
}

function drawAircraft() {
  const m = S.map; if (!m || !m.getSource('ac')) return;
  const seen = new Set();
  const feats = [];
  const push = (a, em) => {
    if (a.lat == null || a.lon == null || seen.has(a.hex)) return;
    seen.add(a.hex);
    feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      properties: { hex: a.hex, label: callsign(a), band: em ? 'e' : band(a), track: a.track ?? 0, low: !em && lowAcc(a) ? 1 : 0, prio: em ? 0 : 1 } });
  };
  for (const a of S.ac) push(a, isEmerg(a));
  for (const e of S.em) push(e, true);   // emergencies anywhere in the world
  m.getSource('ac').setData({ type: 'FeatureCollection', features: feats });
}

// Daily satellite photo of the whole Earth from NASA (GIBS service, VIIRS instrument on the NOAA-20 satellite).
// About 250 metres per pixel: clouds, smoke, dust and large fires are visible; buildings are not.
// Pictures from space, one at a time (menu 'שכבות'):
//  'clouds' - the last full-hour picture from Europe's Meteosat weather satellite (EUMETSAT view service):
//             Europe, Africa and the Middle East, about 1 to 2 km per pixel, day and night.
//  'd1','d0' - NASA's daily photo of the whole Earth (GIBS service, VIIRS on NOAA-20), about 250 m per pixel.
const imgDate = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
const lastHour = () => { const d = new Date(Date.now() - 40 * 60 * 1000); d.setUTCMinutes(0, 0, 0); return d.toISOString().replace('.000Z', 'Z'); };
function imgSource() {
  if (S.img === 'clouds') return { key: 'clouds-' + lastHour(), type: 'raster', tileSize: 512, maxzoom: 7,
    tiles: ['https://view.eumetsat.int/geoserver/ows?service=WMS&version=1.3.0&request=GetMap&layers=mtg_fd:rgb_geocolour&styles='
      + '&format=image/jpeg&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512&time=' + lastHour()] };
  const day = imgDate(S.img === 'd0' ? 0 : 1);
  return { key: 'nasa-' + day, type: 'raster', tileSize: 256, maxzoom: 9,
    tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/' + day
      + '/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg'] };
}
let imgKey = '';
function applyImagery() {
  const m = S.map; if (!m || !m.getLayer('ac')) return;
  const on = S.img !== 'off', src = on ? imgSource() : null;
  if (m.getLayer('img') && (!on || src.key !== imgKey || !m.getSource('img'))) { m.removeLayer('img'); m.removeSource('img'); }
  const layers = m.getStyle().layers;
  if (on && !m.getSource('img')) {
    const { key, ...def } = src; imgKey = key;
    m.addSource('img', def);
    const first = layers.find((l) => l.type !== 'background');
    m.addLayer({ id: 'img', type: 'raster', source: 'img' }, first ? first.id : undefined);
  }
  // the drawn land and sea would cover the picture, so they step aside while it is shown; borders, roads and names stay
  const ids = new Set(BASEMAPS.map((b) => b.id));
  for (const l of layers) if (l.type === 'fill' && ids.has(l.source)) m.setLayoutProperty(l.id, 'visibility', on ? 'none' : 'visible');
}

function drawGnss() {
  const m = S.map; if (!m || !m.getSource('gnss')) return;
  const g = S.gnss, dy = g ? g.dlat : 0, dx = g ? g.dlon : 0;
  const feats = gnssZones().map((z) => {
    const y = z.gy * dy, x = z.gx * dx;
    return { type: 'Feature', properties: { level: z.level },
      geometry: { type: 'Polygon', coordinates: [[[x, y], [x + dx, y], [x + dx, y + dy], [x, y + dy], [x, y]]] } };
  });
  m.getSource('gnss').setData({ type: 'FeatureCollection', features: feats });
}

const DETAIL_VIEWS = ['ac', 'sat', 'quake', 'ship', 'fire'];
function initMap() {
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  maplibregl.setRTLTextPlugin(new URL('vendor/mapbox-gl-rtl-text.js', location.href).href, true);
  const m = new maplibregl.Map({
    container: 'map', style: mapStyle(), center: CFG.center, zoom: CFG.zoom,
    minZoom: 2, maxZoom: 13, attributionControl: false,
    dragRotate: false, pitchWithRotate: false, touchPitch: false,
  });
  m.touchZoomRotate.disableRotation();
  S.map = m;
  m.on('style.load', addOverlay);
  m.on('moveend', () => scanSats());
  m.on('click', (ev) => {
    const p = ev.point, r = 14;
    const hits = m.getLayer('ac') ? m.queryRenderedFeatures([[p.x - r, p.y - r], [p.x + r, p.y + r]], { layers: ['ac'] }) : [];
    if (hits.length) {
      let best = hits[0], bd = Infinity;
      for (const f of hits) {
        const q = m.project(f.geometry.coordinates); const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (d < bd) { bd = d; best = f; }
      }
      go({ name: 'ac', hex: best.properties.hex, from: DETAIL_VIEWS.includes(S.view.name) ? S.view.from : S.view });
    } else {
      const box = [[p.x - 10, p.y - 10], [p.x + 10, p.y + 10]];
      const from = DETAIL_VIEWS.includes(S.view.name) ? S.view.from : S.view;
      const pick = (layer, area) => (m.getLayer(layer) ? m.queryRenderedFeatures(area, { layers: [layer] })[0] : null);
      const ship = pick('ships', box);
      const sat = !ship ? pick('sats', box) : null;
      const qk = !ship && !sat ? pick('quakes', ev.point) : null;
      const fire = !ship && !sat && !qk ? pick('fires', box) : null;
      if (ship) go({ name: 'ship', id: ship.properties.id, from });
      else if (sat) go({ name: 'sat', id: sat.properties.id, from });
      else if (qk) go({ name: 'quake', id: qk.properties.id, from });
      else if (fire) go({ name: 'fire', id: fire.properties.id, from });
      else if (DETAIL_VIEWS.includes(S.view.name)) go(S.view.from || { name: 'home' });
    }
    closeLayers();
  });
}

function flyTo(a, zoom) {
  if (a.lat == null || a.lon == null) return;
  const inside = a.lon > CFG.bounds[0][0] && a.lon < CFG.bounds[1][0] && a.lat > CFG.bounds[0][1] && a.lat < CFG.bounds[1][1];
  if (!inside) return;   // the basemap covers the region only
  const sheetH = $('#sheet').offsetHeight;
  S.map.easeTo({ center: [a.lon, a.lat], zoom: Math.max(S.map.getZoom(), zoom || 7), padding: { bottom: sheetH, top: 70, left: 0, right: 0 }, duration: 600 });
}

/* ---------- sheet views ---------- */
function go(view) {
  S.view = view;
  $('#sheet').classList.remove('closed');
  applyLayerOptions();
  render();
  $('#sheet-body').scrollTop = 0;
}

function freshLine() {
  const L = t();
  if (S.netErr) return h('p', { class: 'fresh bad' }, L.noNet);
  if (!S.loaded) return h('p', { class: 'fresh' }, L.loading);
  const ok = S.src && S.src.last_ok ? Date.parse(S.src.last_ok) : null;
  if (ok == null) return h('p', { class: 'fresh bad' }, L.silent('?'));
  const sec = Math.max(0, Math.round((Date.now() - ok) / 1000));
  if (sec > CFG.staleSec) return h('p', { class: 'fresh bad' }, L.silent(Math.round(sec / 60)));
  return h('p', { class: 'fresh' }, sec < 60 ? L.freshSec(sec) : L.freshMin(Math.round(sec / 60)));
}

function row(color, title, sub, onClick, tags) {
  return h('button', { class: 'row', type: 'button', on: { click: onClick } },
    h('i', { class: 'dot', style: 'background:' + color }),
    h('div', { class: 'txt' }, h('strong', null, title, tags || null), h('span', null, sub)),
    chev());
}

function acRow(a) {
  const L = t(), c = T(), cs = callsign(a);
  const b = band(a);
  const col = isEmerg(a) ? c.warn : b === 'u' ? c.unk : c.alt[+b];
  const alt = a.on_ground ? L.ground : altOf(a) != null ? L.alt(altOf(a)) : L.none;
  const rt = cs ? routeOf(cs) : null;
  const kind = [a.ac_type, cs ? airlineOf(cs) : null, rt && rt.length > 1 ? L.toPlace(placeName(rt[rt.length - 1])) : null].filter(Boolean).join(' · ');
  return row(col, h('span', { class: 'cs', style: 'display:inline;color:inherit;font-size:inherit' }, cs || L.noCallsign),
    [alt, kind].filter(Boolean).join(' · '),
    () => { go({ name: 'ac', hex: a.hex, from: S.view }); flyTo(a, 8); },
    [a.mil ? h('i', { class: 'tag', style: 'font-style:normal' }, L.mil) : null, lowAcc(a) ? h('i', { class: 'tag warn', style: 'font-style:normal' }, L.tagLow) : null]);
}

function header(title, backTo) {
  const L = t();
  return h('div', { class: 'head' },
    backTo ? h('button', { class: 'back', type: 'button', on: { click: () => go(backTo) } }, chev(), L.back) : null,
    h('h2', null, title), freshLine());
}

function viewHome() {
  const L = t(), c = T();
  const low = S.ac.filter(lowAcc).length, em = S.em.length, sky = airborne().length, zones = gnssZones().length;
  return [header(L.title),
    row(low || zones ? c.warn : c.alt[2], L.gnss, [zones ? L.gnssZones(zones) : null, low ? L.gnssSome(low) : L.gnssNone].filter(Boolean).join(' '), () => go({ name: 'gnss' })),
    row(em ? c.warn : c.alt[2], L.emerg,
      em === 1 ? [L.emergOne, ' ', h('b', { class: 'cs', style: 'color:var(--accent)' }, emName(S.em[0]))] : em ? L.emergSome(em) : L.emergNone,
      () => { if (em === 1) { go({ name: 'ac', hex: S.em[0].hex, from: { name: 'home' } }); flyTo(S.ac.find((a) => a.hex === S.em[0].hex) || S.em[0], 7); } else go({ name: 'emerg' }); }),
    row(S.quakes.length ? c.accent : c.alt[2], L.quakes, quakeSummary(), () => go({ name: 'quakes' })),
    row(c.alt[2], L.sky, L.skyCount(sky), () => go({ name: 'sky' }))];
}
function viewGnss() {
  const L = t(); const list = S.ac.filter(lowAcc);
  const zones = gnssZones().length, c = T();
  const key = (op, text) => h('p', { class: 'note key' }, h('i', { class: 'swatch', style: `background:${c.warn};opacity:${op}` }), text);
  return [header(L.gnss, { name: 'home' }),
    h('p', { class: 'note' }, S.gnss ? (zones ? L.gnssZones(zones) : L.gnssZonesNone) : L.gnssZonesNoData),
    key(0.42, L.gnssKeyHigh), key(0.17, L.gnssKeyMid),
    h('p', { class: 'note' }, L.gnssMethod),
    h('p', { class: 'note' }, (list.length ? L.gnssSome(list.length) : L.gnssNone) + ' ' + L.gnssNote), list.map(acRow)];
}
function viewEmerg() {
  const L = t(), c = T();
  const rows = S.em.map((e) => {
    const live = S.ac.find((a) => a.hex === e.hex);
    const what = L.sq[e.squawk] || e.emergency || '';
    return row(c.warn, h('span', { class: 'cs', style: 'display:inline;color:inherit;font-size:inherit' }, emName(e)),
      [what, e.squawk, e.ac_type].filter(Boolean).join(' · '),
      () => { go({ name: 'ac', hex: e.hex, from: S.view }); flyTo(live || e, 7); });
  });
  return [header(L.emerg, { name: 'home' }), h('p', { class: 'note' }, (S.em.length ? L.emergSome(S.em.length) : L.emergNone) + ' ' + L.emergNote), rows];
}
function viewSky() {
  const L = t();
  loadRoutes([...new Set(airborne().map((a) => csPrefix(callsign(a))).filter(Boolean))]);
  const list = airborne().slice().sort((a, b) => (callsign(a) || '~').localeCompare(callsign(b) || '~'));
  return [header(L.sky, { name: 'home' }), h('p', { class: 'note' }, L.skyCount(list.length) + ' ' + L.skyNote + (S.satNow.length ? ' ' + L.satCount(S.satInView, S.satNow.length) : '')), list.map(acRow)];
}
function viewAircraft(hex) {
  const L = t();
  const a = S.ac.find((x) => x.hex === hex) || S.em.find((x) => x.hex === hex);
  const back = S.view.from || { name: 'home' };
  if (!a) return [header(hex.toUpperCase(), back), h('p', { class: 'note' }, L.none)];
  const cs = callsign(a);
  const ltr = (v) => h('span', { class: 'cs' }, v);
  const facts = [];
  const add = (k, v) => facts.push(h('dt', null, k), h('dd', null, v == null || v === '' ? L.none : v));
  add(L.fFlight, cs ? ltr(cs) : null);
  add(L.fReg, a.reg ? ltr(a.reg) : null);
  add(L.fType, [a.ac_type, a.descr].filter(Boolean).join(' · ') ? ltr([a.ac_type, a.descr].filter(Boolean).join(' · ')) : null);
  const airline = cs ? airlineOf(cs) : null, rt = cs ? routeOf(cs) : null;
  if (airline) add(L.fAirline, ltr(airline));
  if (rt && rt.length > 1) {
    const full = (x) => ltr(`${x.name} (${[x.city, x.cc].filter(Boolean).join(', ')})`);
    add(L.fFrom, full(rt[0]));
    if (rt.length > 2) add(L.fVia, ltr(rt.slice(1, -1).map(placeName).join(' · ')));
    add(L.fTo, full(rt[rt.length - 1]));
  }
  add(L.fAlt, a.on_ground ? L.ground : altOf(a) != null ? L.alt(altOf(a)) : null);
  add(L.fPos, a.lat != null && a.lon != null ? ltr(`${a.lat.toFixed(3)}, ${a.lon.toFixed(3)}`) : null);
  if ('gs' in a) {
    add(L.fSpeed, a.gs != null ? L.speed(a.gs) : null);
    add(L.fTrack, a.track != null ? L.deg(a.track) : null);
    const vr = a.baro_rate ?? a.geom_rate;
    add(L.fVert, vr != null ? L.vert(vr) : null);
  }
  add(L.fSquawk, a.squawk ? [ltr(a.squawk), L.sq[a.squawk] ? ' · ' + L.sq[a.squawk] : ''] : null);
  if ('nic' in a) add(L.fAcc, a.nic == null ? null : lowAcc(a) ? L.accLow : L.accOk);
  const seenAt = a.pos_time || a.last_seen;
  add(L.fSeen, seenAt ? L.ago(Math.max(0, Math.round((Date.now() - Date.parse(seenAt)) / 1000))) : null);
  add(L.fHex, ltr(a.hex.toUpperCase()));
  const title = h('h2', null, h('span', { class: 'cs' }, cs || a.reg || a.hex.toUpperCase()),
    a.mil ? h('i', { class: 'tag', style: 'font-style:normal' }, L.mil) : null,
    isEmerg(a) || !('gs' in a) ? h('i', { class: 'tag warn', style: 'font-style:normal' }, L.sq[a.squawk] || L.emerg) : null);
  return [h('div', { class: 'head' },
    h('button', { class: 'back', type: 'button', on: { click: () => go(back) } }, chev(), L.back), title, freshLine()),
  h('dl', { class: 'facts' }, facts),
  airline || (rt && rt.length > 1) ? h('p', { class: 'note' }, L.routeNote) : null];
}

const secAgo = (iso) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
function quakeSummary() {
  const L = t(), q = S.quakes;
  if (!q.length) return L.quakesNone;
  const top = q.reduce((a, b) => (b.mag > a.mag ? b : a));
  return L.quakesSome(q.length, top.mag.toFixed(1));
}
function viewQuakes() {
  const L = t(), c = T();
  const rows = S.quakes.slice().sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).map((e) =>
    row(c.accent, L.mag(e.mag.toFixed(1)), [L.ago(secAgo(e.time)), e.region ? h('i', { class: 'cs', style: 'font-style:normal' }, ' · ' + e.region) : null],
      () => { go({ name: 'quake', id: e.id, from: S.view }); flyTo(e, 7); }));
  return [header(L.quakes, { name: 'home' }), h('p', { class: 'note' }, quakeSummary() + ' ' + L.quakesNote), rows];
}
function viewQuake(id) {
  const L = t(), e = S.quakes.find((x) => x.id === id), back = S.view.from || { name: 'home' };
  const head = (title) => h('div', { class: 'head' }, h('button', { class: 'back', type: 'button', on: { click: () => go(back) } }, chev(), L.back), h('h2', null, title));
  if (!e) return [head(L.quakes), h('p', { class: 'note' }, L.gone)];
  const facts = [];
  const add = (k, v) => facts.push(h('dt', null, k), h('dd', null, v == null || v === '' ? L.unknown : v));
  add(L.qMag, h('span', { class: 'cs' }, e.mag.toFixed(1) + (e.magtype ? ' (' + e.magtype + ')' : '')));
  add(L.qTime, L.ago(secAgo(e.time)));
  add(L.qDepth, e.depth != null ? L.km(Math.round(e.depth)) : null);
  add(L.qRegion, e.region ? h('span', { class: 'cs' }, e.region) : null);
  add(L.fPos, h('span', { class: 'cs' }, `${e.lat.toFixed(3)}, ${e.lon.toFixed(3)}`));
  return [head(L.quakeTitle(e.mag.toFixed(1))), h('dl', { class: 'facts' }, facts)];
}
function satFacts(id) {
  const L = t(), o = S.satNow.find((x) => x.id === id);
  const facts = [];
  const add = (k, v) => facts.push(h('dt', null, k), h('dd', null, v == null || v === '' ? L.unknown : v));
  add(L.sId, h('span', { class: 'cs' }, id));
  if (o) {
    add(L.fAlt, L.km(Math.round(o.km)));
    add(L.fSpeed, o.kms != null ? L.kmh(Math.round(o.kms * 3600)) : null);
    add(L.sIncl, o.incl != null ? L.deg(o.incl) : null);
    add(L.fPos, h('span', { class: 'cs' }, `${o.lat.toFixed(2)}, ${o.lon.toFixed(2)}`));
  }
  return h('dl', { class: 'facts' }, facts);
}
function viewSat(id) {
  const L = t(), st = S.sats.find((x) => x.id === id), back = S.view.from || { name: 'home' };
  const here = S.satNow.some((x) => x.id === id);
  return [h('div', { class: 'head' },
    h('button', { class: 'back', type: 'button', on: { click: () => go(back) } }, chev(), L.back),
    h('h2', null, h('span', { class: 'cs' }, st ? st.name : id), h('i', { class: 'tag', style: 'font-style:normal' }, L.sat))),
  h('p', { class: 'note' }, here ? L.satNote : L.satLeft), satFacts(id)];
}

function detailHead(title, tag) {
  const back = S.view.from || { name: 'home' };
  return h('div', { class: 'head' }, h('button', { class: 'back', type: 'button', on: { click: () => go(back) } }, chev(), t().back),
    h('h2', null, title, tag ? h('i', { class: 'tag', style: 'font-style:normal' }, tag) : null));
}
function shipKind(code) {
  const L = t().shipKinds;
  if (code == null) return null;
  if (code === 30) return L.fishing; if (code === 35) return L.military; if (code === 36 || code === 37) return L.pleasure;
  if (code === 31 || code === 32 || code === 52) return L.tug; if (code === 51) return L.rescue; if (code === 55) return L.law;
  if (code >= 60 && code <= 69) return L.passenger; if (code >= 70 && code <= 79) return L.cargo; if (code >= 80 && code <= 89) return L.tanker;
  return L.other;
}
function viewShip(id) {
  const L = t(), x = S.ships.find((v) => String(v.mmsi) === id);
  if (!x) return [detailHead(L.ship), h('p', { class: 'note' }, L.shipGone)];
  const ltr = (v) => h('span', { class: 'cs' }, v);
  const facts = [];
  const add = (k, v) => facts.push(h('dt', null, k), h('dd', null, v == null || v === '' ? L.none : v));
  add(L.shName, x.name ? ltr(x.name) : null);
  add(L.shType, shipKind(x.kind));
  add(L.fTo, x.dest ? ltr(x.dest) : null);
  add(L.fSpeed, x.sog != null ? L.knots(x.sog) : null);
  add(L.fTrack, x.cog != null ? L.deg(x.cog) : null);
  add(L.fPos, ltr(`${x.lat.toFixed(3)}, ${x.lon.toFixed(3)}`));
  add(L.fSeen, L.ago(secAgo(x.t)));
  add(L.fFlight, x.callsign ? ltr(x.callsign) : null);
  add(L.shMmsi, ltr(String(x.mmsi)));
  return [detailHead(h('span', { class: 'cs' }, x.name || String(x.mmsi)), L.ship), h('dl', { class: 'facts' }, facts), h('p', { class: 'note' }, L.shipNote)];
}
function viewFire(id) {
  const L = t(), x = S.fires.find((v) => v.id === id);
  if (!x) return [detailHead(L.fire), h('p', { class: 'note' }, L.gone)];
  const facts = [];
  const add = (k, v) => facts.push(h('dt', null, k), h('dd', null, v));
  add(L.qTime, L.ago(secAgo(x.time)));
  add(L.fiPower, L.megawatt(x.frp));
  add(L.fiConf, x.conf === 'h' ? L.fiHigh : L.fiNormal);
  add(L.fPos, h('span', { class: 'cs' }, `${x.lat.toFixed(3)}, ${x.lon.toFixed(3)}`));
  return [detailHead(L.fire), h('dl', { class: 'facts' }, facts), h('p', { class: 'note' }, L.fireNote)];
}
function render() {
  const body = $('#sheet-body');
  const keep = body.scrollTop;
  const v = S.view;
  const nodes = v.name === 'gnss' ? viewGnss() : v.name === 'emerg' ? viewEmerg() : v.name === 'sky' ? viewSky()
    : v.name === 'ac' ? viewAircraft(v.hex) : v.name === 'quakes' ? viewQuakes() : v.name === 'quake' ? viewQuake(v.id)
    : v.name === 'sat' ? viewSat(v.id) : v.name === 'ship' ? viewShip(v.id) : v.name === 'fire' ? viewFire(v.id) : viewHome();
  body.replaceChildren(...nodes.flat().filter(Boolean));
  body.scrollTop = keep;
}

/* ---------- chrome: language, theme, layers ---------- */
function applyTheme() {
  const c = T(), st = document.documentElement.style;
  for (const k of ['sea', 'land', 'ink', 'sub', 'panel', 'line', 'accent', 'warn', 'markink', 'btn', 'shadow']) st.setProperty('--' + k, c[k]);
  document.querySelector('meta[name=theme-color]').setAttribute('content', c.sea);
  document.querySelectorAll('input[name=theme]').forEach((r) => { r.checked = r.value === S.theme; });
}
function applyLang() {
  const L = t();
  document.documentElement.lang = S.lang; document.documentElement.dir = L.dir;
  document.title = L.brand;
  $('#brand-name').textContent = L.brand;
  $('#btn-lang').textContent = L.otherLang;
  const dm = (n) => { const d = imgDate(n).split('-'); return `${+d[2]}.${+d[1]}`; };
  $('#img-d1').textContent = L.imgDay(dm(1), false); $('#img-d0').textContent = L.imgDay(dm(0), true);
  $('#btn-lang').setAttribute('lang', S.lang === 'he' ? 'en' : 'he');
  $('#grip').setAttribute('aria-label', L.toggleSheet);
  document.querySelectorAll('[data-t]').forEach((e) => { e.textContent = L[e.dataset.t]; });
  const c = T();
  $('#legend').replaceChildren(L.legend, h('span', null, L.low), ...c.alt.map((col) => h('i', { style: 'background:' + col })), h('span', null, L.high));
  $('#credit').replaceChildren(...L.credit.map((p) => Array.isArray(p) ? h('a', { href: p[1], target: '_blank', rel: 'noopener noreferrer' }, p[0]) : p));
}
function closeLayers() { $('#layers').hidden = true; $('#btn-layers').setAttribute('aria-expanded', 'false'); }

function wire() {
  $('#btn-lang').addEventListener('click', () => {
    S.lang = S.lang === 'he' ? 'en' : 'he'; store.set('lang', S.lang);
    applyLang(); render(); S.map.setStyle(mapStyle());
  });
  $('#btn-layers').addEventListener('click', () => {
    const p = $('#layers'); p.hidden = !p.hidden; $('#btn-layers').setAttribute('aria-expanded', String(!p.hidden));
  });
  $('#opt-ac').addEventListener('change', (e) => { S.showAc = e.target.checked; applyLayerOptions(); });
  $('#opt-labels').addEventListener('change', (e) => { S.showLabels = e.target.checked; applyLayerOptions(); });
  $('#opt-gnss').addEventListener('change', (e) => { S.showGnss = e.target.checked; applyLayerOptions(); });
  $('#opt-sats').addEventListener('change', (e) => { S.showSats = e.target.checked; applyLayerOptions(); scanSats(); tickSats(); });
  $('#opt-quakes').addEventListener('change', (e) => { S.showQuakes = e.target.checked; applyLayerOptions(); });
  $('#opt-ships').addEventListener('change', (e) => { S.showShips = e.target.checked; applyLayerOptions(); refreshShips(); });
  $('#opt-fires').addEventListener('change', (e) => { S.showFires = e.target.checked; applyLayerOptions(); });
  document.querySelectorAll('input[name=img]').forEach((r) => r.addEventListener('change', () => { if (r.checked) { S.img = r.value; applyImagery(); } }));
  setInterval(() => { if (S.img === 'clouds' && !document.hidden) applyImagery(); }, 5 * 60 * 1000);   // picks up the next hour's picture
  document.querySelectorAll('input[name=theme]').forEach((r) => r.addEventListener('change', () => {
    if (!r.checked) return;
    S.theme = r.value; store.set('theme', S.theme);
    applyTheme(); applyLang(); render(); S.map.setStyle(mapStyle());
  }));
  $('#grip').addEventListener('click', () => $('#sheet').classList.toggle('closed'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLayers(); });
}

/* ---------- start ---------- */
applyTheme(); applyLang(); render();
initMap(); wire();
refJson('airlines.json').then((j) => { S.ref.airlines = j; render(); }).catch(() => { S.ref.airlines = {}; });
refresh();
refreshSlow();
setInterval(() => { if (!document.hidden) refreshSlow(); }, 5 * 60 * 1000);
setInterval(tickSats, 1000);
loadCatalogue(); setInterval(loadCatalogue, 3 * 3600 * 1000);
refreshShips(); setInterval(refreshShips, 60 * 1000);
setInterval(scanSats, 10000);
let timer = setInterval(refresh, CFG.pollMs);
document.addEventListener('visibilitychange', () => {
  clearInterval(timer);
  if (!document.hidden) { refresh(); timer = setInterval(refresh, CFG.pollMs); }
});
setInterval(() => {   // keeps the "updated … ago" line honest without rebuilding the panel
  const f = document.querySelector('#sheet-body .fresh');
  if (f && !document.hidden) f.replaceWith(freshLine());
}, 1000);
