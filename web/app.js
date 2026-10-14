import { CFG, THEMES } from './config.js';
import { STR } from './i18n.js';
import { regionHe } from './regions.js';
import { api, nearLoad, farLoad, takeFirst } from './data.js';

/* global maplibregl, pmtiles, basemaps */

const store = {
  get(k, d) { try { return localStorage.getItem('tz-' + k) || d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tz-' + k, v); } catch { /* private mode */ } },
};

const S = {
  lang: store.get('lang', 'he') === 'en' ? 'en' : 'he',
  theme: store.get('theme', 'light') === 'dark' ? 'dark' : 'light',
  // Layers shown when the site opens. Like the leading live maps, it opens with the core picture (aircraft, ships and the
  // unusual signals) and leaves the dense layers (satellites, close approaches in space, thermal hotspots) for the user
  // to turn on. Whatever the user turns on or off is remembered on their device.
  showAc: true, showLabels: true, showGnss: true, showSats: false, showQuakes: true, showShips: true, showFires: false, showOutages: true, showConj: false, showSkies: true,
  follow: null, trail: null, link: null,
  ships: [], fires: [], outages: [], outagesOk: false, countries: null, img: 'off',
  ref: { airlines: null, airports: null, routes: new Map() },
  sats: [], satView: [], satInView: 0, satNow: [], satLib: null, satExtra: new Map(), conj: [], conjOk: false, imgOver: [], imgNext: null, skies: null, milw: [], quakes: [],
  ac: [], near: [], far: [], em: [], src: null, gnss: null, loaded: false, netErr: false,
  view: { name: 'home' },
  map: null,
};
const LAYER_OPTS = { ac: 'showAc', labels: 'showLabels', gnss: 'showGnss', skies: 'showSkies', sats: 'showSats', conj: 'showConj', ships: 'showShips', quakes: 'showQuakes', fires: 'showFires', outages: 'showOutages' };
try { const saved = JSON.parse(store.get('layers', '{}')); for (const [k, f] of Object.entries(LAYER_OPTS)) if (typeof saved[k] === 'boolean') S[f] = saved[k]; } catch { /* nothing saved yet */ }
const saveLayers = () => store.set('layers', JSON.stringify(Object.fromEntries(Object.entries(LAYER_OPTS).map(([k, f]) => [k, S[f]]))));
// A link straight to one item on the map, e.g. openeye.co.il/#ac-4x1234 or #ship-123456789 (like the leading sites do).
const readLink = () => { const m = /^#(ac|ship|sat|quake|fire|outage|conj|skyc)-([\w.~-]{1,40})$/.exec(location.hash); if (m) S.link = { name: m[1], id: decodeURIComponent(m[2]) }; return !!m; };
readLink();
// a link opened while the site is already open in this tab changes only the address after the #
addEventListener('hashchange', () => { if (readLink()) openLink(); });
const coarse = matchMedia('(pointer: coarse)').matches;   // a finger needs a bigger area around an item than a mouse
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


// Aircraft out to about 4,000 km from Israel. The near ones (in_region, about 460 km) come every 15 seconds
// with the rest of the live data; the far ones (in_wide and not in_region) every minute, page by page,
// because the server hands out at most 1,000 rows per request.
const mergeAc = () => {
  const near = new Set(S.near.map((a) => a.hex));
  S.ac = S.near.concat(S.far.filter((a) => !near.has(a.hex)));
};
async function refreshFar() {
  try {
    const far = await (takeFirst('far') || farLoad());
    S.far = far.map((a) => ({ ...a, far: true }));
  } catch { return; }   // keep the last far picture; the near aircraft keep updating on their own
  mergeAc(); drawAircraft(); render();
}

async function refresh() {
  try {
    const [ac, em, src, drv, milw] = await (takeFirst('near') || nearLoad());
    const g = drv.find((d) => d.key === 'gnss_grid');
    S.gnss = g && Date.now() - Date.parse(g.computed_at) < 10 * 60 * 1000 ? g.data : null;
    // An emergency is shown only when it is backed up: a 7500/7600/7700 code, or the emergency flag
    // received more than once, at least a minute apart, from an aircraft with a known position.
    const confirmed = (e) => ['7500', '7600', '7700'].includes(e.squawk)
      || (e.lat != null && e.lon != null && Date.parse(e.last_seen) - Date.parse(e.first_seen) >= 60000);
    S.near = ac; mergeAc(); S.milw = milw.map((a) => ({ ...a, world: true })); S.em = em.filter(confirmed); S.src = src[0] || null; S.netErr = false; S.loaded = true;
    if (!secondaryStarted) setTimeout(startSecondary, 3000);
  } catch {
    S.netErr = true;
  }
  drawAircraft(); drawGnss();
  render();
  followTick(); trailTick(); openLink();
}

/* ---------- slower layers: satellites and earthquakes (every 5 minutes) ---------- */
const QUAKE_MIN_MAG = 2.5;
async function refreshSlow() {
  try {
    const rows = await api('/derived?select=key,data,computed_at&key=in.(quakes,fires,outages,skies)');
    const fresh = (r, min) => r && Date.now() - Date.parse(r.computed_at) < min * 60 * 1000;
    const q = rows.find((r) => r.key === 'quakes');
    S.quakes = fresh(q, 30) ? q.data.events.filter((e) => e.mag != null && e.mag >= QUAKE_MIN_MAG) : [];
    const f = rows.find((r) => r.key === 'fires');
    // each spot: [lat, lon, power in megawatts, confidence n|h, minutes since epoch, D|N]
    S.fires = fresh(f, 120) ? f.data.spots.map((x, i) => ({ id: 'f' + i, lat: x[0], lon: x[1], frp: x[2], conf: x[3], time: new Date(x[4] * 60000).toISOString(), dn: x[5] })) : [];
    const o = rows.find((r) => r.key === 'outages');
    S.outagesOk = !!fresh(o, 90);
    S.outages = S.outagesOk ? o.data.events.slice().sort((a, b) => Date.parse(b.start) - Date.parse(a.start)) : [];
    const sk = rows.find((r) => r.key === 'skies');
    S.skies = fresh(sk, 30) ? sk.data : null;
    if ((S.outages.length || S.skies) && !S.countries) { try { S.countries = await refJson('countries.json'); } catch { /* list still works without map marks */ } }
  } catch { /* keep what we have */ }
  drawQuakes(); drawFires(); drawOutages(); drawSkies(); tickSats(); render();
}

// Satellites: the whole public catalogue (our own copy, refreshed every 3 hours by our workflow) is loaded
// on the device, together with the debris of the big breakups. Every 10 seconds we work out which objects
// are over the part of the map on screen, and every second we move just those. A phone therefore never
// animates more than SAT_MAX objects.
const DATA = 'https://raw.githubusercontent.com/elimarshak/tzofia/data/';
const SAT_MAX = 2500;
const pause = () => new Promise((r) => setTimeout(r, 0));
const getText = async (name) => { try { const r = await fetch(DATA + name, { cache: 'no-cache' }); return r.ok ? await r.text() : ''; } catch { return ''; } };
const csvRows = (text) => { const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean); return lines.length ? [lines[0].split(','), lines.slice(1)] : [[], []]; };
// Which breakup a piece of debris comes from, by the name the catalogue gives it.
const debrisOf = (name) => (/^COSMOS 1408/.test(name) ? 'c1408' : /^FENGYUN 1C/.test(name) ? 'fy1c' : /^(IRIDIUM 33|COSMOS 2251)/.test(name) ? 'col09' : null);
async function parseGp(text, kind) {
  const lib = S.satLib, [head, lines] = csvRows(text), all = [];
  if (head[0] !== 'OBJECT_NAME') return all;
  const NUM = new Set(['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY',
    'EPHEMERIS_TYPE', 'NORAD_CAT_ID', 'ELEMENT_SET_NO', 'REV_AT_EPOCH', 'BSTAR', 'MEAN_MOTION_DOT', 'MEAN_MOTION_DDOT']);
  for (let n = 0; n < lines.length; n++) {
    const cells = lines[n].split(','); if (cells.length < head.length) continue;
    const o = {}; head.forEach((k, i) => { o[k] = NUM.has(k) ? Number(cells[i]) : cells[i]; });
    try { const rec = lib.json2satrec(o); if (rec && !rec.error) all.push({ id: String(o.NORAD_CAT_ID), name: o.OBJECT_NAME, incl: o.INCLINATION, epoch: o.EPOCH, kind, rec }); } catch { /* skip */ }
    if (n % 1500 === 1499) await pause();
  }
  return all;
}
async function loadCatalogue() {
  try {
    if (!S.satLib) S.satLib = await import('./vendor/satellite/index.js');
    const [active, debris, extra, soc, imaging] = await Promise.all(['celestrak_active.csv', 'celestrak_debris.csv', 'socrates_gp.csv', 'socrates.csv', 'celestrak_imaging.csv'].map(getText));
    const sats = await parseGp(active, 'sat');
    if (!sats.length) return;
    // imaging satellites: 'opt' takes pictures with a camera, 'sar' with radar (works at night and through clouds)
    const kinds = new Map(csvRows(imaging)[1].map((ln) => ln.split(',')));
    for (const st of sats) { const k = kinds.get(st.id); if (k === 'opt' || k === 'sar') st.img = k; }
    S.imgNextAt = 0;
    const ids = new Set(sats.map((x) => x.id));
    for (const d of await parseGp(debris, 'deb')) if (!ids.has(d.id)) { ids.add(d.id); sats.push(d); }
    S.sats = sats;
    S.satExtra = new Map((await parseGp(extra, 'other')).map((x) => [x.id, x]));
    loadConj(soc);
    scanSats(); drawConj(); render();
  } catch { /* keep what we have */ }
}
// Closest predicted approaches between two objects in orbit (CelesTrak SOCRATES, the 40 closest in the next 7 days).
// The mark on the map is where the first object will be at the moment of closest approach.
function loadConj(text) {
  const [head, lines] = csvRows(text);
  if (head[0] !== 'NORAD_CAT_ID_1') { S.conjOk = false; return; }
  const col = (k) => head.indexOf(k), lib = S.satLib, now = Date.now();
  const byId = new Map(S.sats.map((x) => [x.id, x]));
  const clean = (v) => v.replace(/\s*\[[^\]]*\]\s*$/, '');
  S.conj = lines.map((ln) => {
    const c = ln.split(','), tca = Date.parse(c[col('TCA')].replace(' ', 'T') + 'Z');
    const a = { id: c[col('NORAD_CAT_ID_1')], name: clean(c[col('OBJECT_NAME_1')]) }, b = { id: c[col('NORAD_CAT_ID_2')], name: clean(c[col('OBJECT_NAME_2')]) };
    const e = { id: `${a.id}-${b.id}-${tca}`, a, b, tca, range: Number(c[col('TCA_RANGE')]), speed: Number(c[col('TCA_RELATIVE_SPEED')]), prob: Number(c[col('MAX_PROB')]) };
    const st = byId.get(a.id) || S.satExtra.get(a.id) || byId.get(b.id) || S.satExtra.get(b.id);
    if (st && lib) { const d = new Date(tca); const o = satPos(st, d, lib.gstime(d)); if (o) Object.assign(e, { lat: o.lat, lon: o.lon, km: o.km }); }
    return e;
  }).filter((e) => e.tca > now && Number.isFinite(e.range)).sort((x, y) => x.range - y.range);
  S.conjOk = true;
}
function drawConj() {
  const m = S.map; if (!m || !m.getSource('conj')) return;
  m.getSource('conj').setData({ type: 'FeatureCollection', features: S.conj.filter((e) => e.lat != null && e.tca > Date.now()).map((e) => (
    { type: 'Feature', properties: { id: e.id }, geometry: { type: 'Point', coordinates: [e.lon, e.lat] } })) });
}
function satPos(st, now, gmst) {
  const lib = S.satLib, pv = lib.propagate(st.rec, now);
  const pos = pv && pv.position, vel = pv && pv.velocity;
  if (!pos || typeof pos !== 'object') return null;
  const g = lib.eciToGeodetic(pos, gmst);
  return { id: st.id, name: st.name, incl: st.incl, deb: st.kind === 'deb' ? 1 : 0, img: st.img ? 1 : 0, lat: lib.degreesLat(g.latitude), lon: lib.degreesLong(g.longitude), km: g.height,
    kms: vel && typeof vel === 'object' ? Math.hypot(vel.x, vel.y, vel.z) : null };
}
// Imaging satellites "over Israel": the point on the ground under the satellite is within IMG_KM of the centre of Israel.
const IMG_KM = 500, IL_CENTRE = [31.4, 35.0];
function kmFromIsrael(o) {
  const r = Math.PI / 180, a = Math.sin(((o.lat - IL_CENTRE[0]) * r) / 2) ** 2
    + Math.cos(o.lat * r) * Math.cos(IL_CENTRE[0] * r) * Math.sin(((o.lon - IL_CENTRE[1]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
// The next time each imaging satellite comes within range in the next 3 hours (30-second steps).
let passBusy = false;
async function nextImgPasses() {
  const lib = S.satLib; if (!lib || passBusy) return;
  passBusy = true; S.imgNextAt = Date.now();
  try {
    const t0 = Date.now(), list = [], here = new Set(S.imgOver.map((x) => x.id));
    const imgs = S.sats.filter((x) => x.img && !here.has(x.id));
    for (let i = 0; i < imgs.length; i++) {
      for (let s = 30; s <= 3 * 3600; s += 30) {
        const d = new Date(t0 + s * 1000), o = satPos(imgs[i], d, lib.gstime(d));
        if (o && kmFromIsrael(o) <= IMG_KM) { list.push({ st: imgs[i], at: d.getTime() }); break; }
      }
      if (i % 20 === 19) await pause();
    }
    S.imgNext = list.sort((a, b) => a.at - b.at);
    if (['home', 'imgsats'].includes(S.view.name)) render();
  } finally { passBusy = false; }
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
    S.satInView = inView.length; S.debInView = inView.filter((x) => x.kind === 'deb').length;
    const over = [];
    for (const st of S.sats) if (st.img) { const o = satPos(st, now, gmst); if (o && kmFromIsrael(o) <= IMG_KM) over.push(st); }
    const changed = over.map((x) => x.id).join() !== S.imgOver.map((x) => x.id).join();
    S.imgOver = over;
    if (changed && ['home', 'imgsats'].includes(S.view.name)) render();
    if (Date.now() - (S.imgNextAt || 0) > 5 * 60 * 1000) nextImgPasses();
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
    { type: 'Feature', properties: { id: o.id, deb: o.deb, img: o.img }, geometry: { type: 'Point', coordinates: [o.lon, o.lat] } })) });
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

// One mark per country an outage touched, placed at the country's label point (not a border statement).
function outagePoints() {
  const out = [];
  for (const e of S.outages) for (const code of e.countries) {
    const at = S.countries && S.countries[code];
    if (at) out.push({ id: e.id, code, lon: at[0], lat: at[1], open: e.end ? 0 : 1 });
  }
  return out;
}
function drawOutages() {
  const m = S.map; if (!m || !m.getSource('outages')) return;
  m.getSource('outages').setData({ type: 'FeatureCollection', features: outagePoints().map((x) => (
    { type: 'Feature', properties: { id: x.id, open: x.open }, geometry: { type: 'Point', coordinates: [x.lon, x.lat] } })) });
}
// Emptying skies: one mark per flagged country, at the country's label point (above the outage mark, if any).
const skiesFlagged = () => (S.skies ? S.skies.areas.filter((a) => a.drop) : []);
function drawSkies() {
  const m = S.map; if (!m || !m.getSource('skies')) return;
  m.getSource('skies').setData({ type: 'FeatureCollection', features: skiesFlagged().filter((a) => S.countries && S.countries[a.code]).map((a) => (
    { type: 'Feature', properties: { id: a.code }, geometry: { type: 'Point', coordinates: S.countries[a.code] } })) });
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
// An aircraft that reports almost no speed high in the air is reporting something no aircraft can do: its
// navigation system is most likely receiving a false position (the pattern seen when GPS is spoofed).
// Its position and speed are then not shown as facts, and the map marks it as an unreliable position.
const badFix = (a) => !a.on_ground && a.gs != null && a.gs < 100 && (a.alt_baro ?? a.alt_geom ?? 0) >= 20000;
const lowAcc = (a) => !a.on_ground && ((a.nic != null && a.nic < 7) || badFix(a));
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
// How far along the registered route the aircraft is, 0..1, or null when it can't be told or the aircraft is clearly
// not on that route (the route is the one registered for the callsign, not a confirmation of this flight).
const km = (la1, lo1, la2, lo2) => { const r = Math.PI / 180, d = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(d))); };
const kmBetween = (p, q) => km(p[1], p[0], q[1], q[0]);   // [lon, lat] pairs
// The sources box lists one source per line, with the Latin names and licences kept whole inside the Hebrew text.
function sourceLines(parts) {
  const lines = [[]];
  for (const p of parts) {
    if (Array.isArray(p)) { lines[lines.length - 1].push(h('bdi', {}, h('a', { href: p[1], target: '_blank', rel: 'noopener noreferrer' }, p[0]))); continue; }
    p.split(/(?<=\.)\s+/).forEach((seg, i) => {
      if (i > 0) lines.push([]);
      for (const bit of seg.split(/(\([^)]*\))/)) if (bit) lines[lines.length - 1].push(/[A-Za-z]/.test(bit) && /^\(/.test(bit) ? h('bdi', {}, bit) : bit);
    });
  }
  return lines.filter((l) => l.length).map((l) => {
    const last = l[l.length - 1];
    if (typeof last === 'string') l[l.length - 1] = last.replace(/\.\s*$/, '');
    return h('li', {}, ...l);
  });
}
function routeProgress(a, rt) {
  if (!rt || rt.length < 2 || a.lat == null || badFix(a)) return null;
  const from = S.ref.airports && S.ref.airports[rt[0].code], to = S.ref.airports && S.ref.airports[rt[rt.length - 1].code];
  if (!from || !to || from[3] == null || to[3] == null) return null;
  const total = km(from[3], from[4], to[3], to[4]), done = km(from[3], from[4], a.lat, a.lon), left = km(a.lat, a.lon, to[3], to[4]);
  if (total < 50 || done + left > total * 1.25) return null;
  return Math.min(1, Math.max(0, done / (done + left)));
}

const emName = (e) => (e.flight || '').trim() || e.reg || e.hex.toUpperCase();
const airborne = () => S.ac.filter((a) => !a.on_ground);
const findAc = (hex) => S.ac.find((x) => x.hex === hex) || S.milw.find((x) => x.hex === hex) || S.em.find((x) => x.hex === hex);

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
  m.addSource('outages', { type: 'geojson', data: empty });
  m.addLayer({ id: 'outages', type: 'circle', source: 'outages',
    paint: { 'circle-radius': 10, 'circle-color': c.ink, 'circle-opacity': ['case', ['==', ['get', 'open'], 1], 0.55, 0.12],
      'circle-stroke-color': c.ink, 'circle-stroke-width': 2.2, 'circle-translate': [0, 24] } });
  m.addLayer({ id: 'outage-x', type: 'symbol', source: 'outages',
    layout: { 'text-field': '×', 'text-font': ['Noto Sans Regular'], 'text-size': 15, 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-offset': [0, -0.05] },
    paint: { 'text-color': c.ink, 'text-halo-color': c.halo, 'text-halo-width': 1, 'text-translate': [0, 24] } });
  m.addLayer({ id: 'outage-sel', type: 'circle', source: 'outages', filter: ['==', ['get', 'id'], ''],
    paint: { 'circle-radius': 16, 'circle-color': c.accent, 'circle-opacity': 0.2, 'circle-stroke-color': c.accent, 'circle-stroke-width': 2, 'circle-translate': [0, 24] } });
  m.addSource('skies', { type: 'geojson', data: empty });
  m.addLayer({ id: 'skies', type: 'circle', source: 'skies',
    paint: { 'circle-radius': 10, 'circle-color': c.warn, 'circle-opacity': 0.15, 'circle-stroke-color': c.warn, 'circle-stroke-width': 2.2, 'circle-translate': [0, -24] } });
  m.addLayer({ id: 'skies-dot', type: 'circle', source: 'skies', paint: { 'circle-radius': 3, 'circle-color': c.warn, 'circle-translate': [0, -24] } });
  m.addLayer({ id: 'skies-sel', type: 'circle', source: 'skies', filter: ['==', ['get', 'id'], ''],
    paint: { 'circle-radius': 16, 'circle-color': c.accent, 'circle-opacity': 0.2, 'circle-stroke-color': c.accent, 'circle-stroke-width': 2, 'circle-translate': [0, -24] } });
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
    paint: { 'circle-radius': ['case', ['==', ['get', 'img'], 1], 3.4, ['==', ['get', 'deb'], 1], 1.8, 2.6],
      'circle-color': ['case', ['==', ['get', 'img'], 1], c.accent, ['==', ['get', 'deb'], 1], c.sub, c.ink],
      'circle-opacity': ['case', ['==', ['get', 'deb'], 1], 0.75, 0.85], 'circle-stroke-color': c.halo, 'circle-stroke-width': ['case', ['==', ['get', 'deb'], 1], 0.6, 1] } });
  m.addSource('conj', { type: 'geojson', data: empty });
  m.addLayer({ id: 'conj', type: 'circle', source: 'conj',
    paint: { 'circle-radius': 7, 'circle-color': c.warn, 'circle-opacity': 0.12, 'circle-stroke-color': c.warn, 'circle-stroke-width': 1.8 } });
  m.addLayer({ id: 'conj-dot', type: 'circle', source: 'conj',
    paint: { 'circle-radius': 2, 'circle-color': c.warn } });
  m.addLayer({ id: 'conj-sel', type: 'circle', source: 'conj', filter: ['==', ['get', 'id'], ''],
    paint: { 'circle-radius': 13, 'circle-color': c.accent, 'circle-opacity': 0.22, 'circle-stroke-color': c.accent, 'circle-stroke-width': 2 } });
  // the path the selected aircraft flew in the last hour (like the line the leading flight maps draw)
  m.addSource('trail', { type: 'geojson', data: empty });
  m.addLayer({ id: 'trail', type: 'line', source: 'trail', layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': c.accent, 'line-width': 2.4, 'line-opacity': 0.85 } });
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
  drawAircraft(); drawGnss(); drawQuakes(); drawFires(); drawOutages(); drawSkies(); drawShips(); drawConj(); tickSats(); drawTrail();
}

/* ---------- the selected aircraft: its path, following it, and a link to it ---------- */
const TRAIL_URL = CFG.api.replace('/rest/v1', '/functions/v1/trail');
let trailAt = 0;
function drawTrail() {
  const m = S.map; if (!m || !m.getSource('trail')) return;
  const tr = S.trail, a = tr && S.view.name === 'ac' && S.view.hex === tr.hex ? findAc(tr.hex) : null;
  let pts = a && !badFix(a) ? tr.points.concat(a.lat != null ? [[a.lon, a.lat]] : []) : [];
  // a line that does not reach the aircraft would mislead: draw it only when the stored path ends near the live position
  if (pts.length > 1 && kmBetween(pts[pts.length - 2], pts[pts.length - 1]) > 60) pts = [];
  m.getSource('trail').setData({ type: 'FeatureCollection', features: pts.length > 1 && S.showAc
    ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }] : [] });
}
async function trailTick(force) {
  const hex = S.view.name === 'ac' ? S.view.hex : null;
  if (!hex) { if (S.trail) { S.trail = null; drawTrail(); } return; }
  if (!force && S.trail && S.trail.hex === hex && Date.now() - trailAt < 60000) { drawTrail(); return; }
  trailAt = Date.now();
  try {
    const r = await fetch(TRAIL_URL + '?hex=' + encodeURIComponent(hex), { credentials: 'omit' });
    const j = r.ok ? await r.json() : null;
    if (j && S.view.name === 'ac' && S.view.hex === hex) S.trail = { hex, points: j.points || [] };
  } catch { /* the line is a bonus; the rest of the card works without it */ }
  drawTrail();
}
function followTick() {
  if (!S.follow) return;
  const a = findAc(S.follow);
  if (!a || S.view.name !== 'ac' || S.view.hex !== S.follow) { S.follow = null; render(); return; }
  if (a.lat != null) S.map.easeTo({ center: [a.lon, a.lat], padding: mapPadding(), duration: 800 });
}
const mapPadding = () => (innerWidth >= 900 ? { top: 70, bottom: 0, left: 0, right: 0 } : { top: 70, bottom: $('#sheet').offsetHeight, left: 0, right: 0 });
const linkOf = (v) => (v.name === 'ac' ? v.hex : v.id);
function setLink() {
  const v = S.view, id = DETAIL_VIEWS.includes(v.name) ? linkOf(v) : null;
  const want = id ? '#' + v.name + '-' + encodeURIComponent(id) : '';
  if (location.hash !== want) history.replaceState(null, '', location.pathname + location.search + want);
}
// Opens the item named in the link once its data has arrived (ships, satellites and the rest load at different times).
function openLink() {
  const k = S.link; if (!k) return;
  const ok = k.name === 'ac' ? findAc(k.id) : k.name === 'ship' ? S.ships.find((s) => String(s.mmsi) === k.id)
    : k.name === 'sat' ? S.sats.find((x) => String(x.id) === k.id) : k.name === 'quake' ? S.quakes.find((x) => String(x.id) === k.id)
    : k.name === 'fire' ? S.fires.find((x) => String(x.id) === k.id) : k.name === 'outage' ? S.outages.find((x) => String(x.id) === k.id)
    : k.name === 'conj' ? S.conj.find((x) => String(x.id) === k.id) : k.name === 'skyc' ? S.skies && (k.id === 'ALL' || S.skies.areas.some((x) => x.code === k.id)) : null;
  if (!ok) return;
  S.link = null;
  if (k.name === 'sat' && !S.showSats) { S.showSats = true; $('#opt-sats').checked = true; applyLayerOptions(); scanSats(); }
  if (k.name === 'conj' && !S.showConj) { S.showConj = true; $('#opt-conj').checked = true; }
  if (k.name === 'fire' && !S.showFires) { S.showFires = true; $('#opt-fires').checked = true; }
  go(k.name === 'ac' ? { name: 'ac', hex: ok.hex, brief: true, from: { name: 'home' } } : { name: k.name, id: k.name === 'ship' ? String(ok.mmsi) : k.name === 'skyc' ? k.id : ok.id, brief: true, from: { name: 'home' } });
  if (k.name === 'ac' || k.name === 'ship') flyTo(ok, 7);
}
async function copyLink() {
  const L = t(), url = location.origin + location.pathname + location.hash;
  let done = false;
  try { await navigator.clipboard.writeText(url); done = true; } catch { /* some browsers refuse; the address bar already shows the link */ }
  toast(done ? L.linkCopied : L.linkInBar);
}
function toast(text) {
  const el = $('#toast'); el.textContent = text; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2600);
}
function closeCard() {
  S.follow = null;
  go({ name: 'home' });
  $('#sheet').classList.add('closed');
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
  for (const id of ['outages', 'outage-x', 'outage-sel']) m.setLayoutProperty(id, 'visibility', S.showOutages ? 'visible' : 'none');
  m.setFilter('outage-sel', ['==', ['get', 'id'], S.view.name === 'outage' ? S.view.id : '']);
  for (const id of ['skies', 'skies-dot', 'skies-sel']) m.setLayoutProperty(id, 'visibility', S.showSkies ? 'visible' : 'none');
  m.setFilter('skies-sel', ['==', ['get', 'id'], S.view.name === 'skyc' ? S.view.id : '']);
  for (const id of ['conj', 'conj-dot', 'conj-sel']) m.setLayoutProperty(id, 'visibility', S.showConj ? 'visible' : 'none');
  m.setFilter('conj-sel', ['==', ['get', 'id'], S.view.name === 'conj' ? S.view.id : '']);
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
      properties: { hex: a.hex, label: callsign(a), band: em ? 'e' : band(a), track: a.track ?? 0, low: !em && (a.far ? badFix(a) : lowAcc(a)) ? 1 : 0, prio: em ? 0 : 1 } });
  };
  for (const a of S.ac) push(a, isEmerg(a));
  for (const a of S.milw) push(a, isEmerg(a));   // military aircraft anywhere in the world
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
let sharpShown = false;
// Sharp picture (Sentinel-2, 10 metres per pixel): served by our own function, only from this zoom and inside this area.
const SHARP = { minzoom: 9, maxzoom: 13, bounds: [24, 12, 64, 43] };
function sharpHere() {
  const m = S.map, c = m.getCenter(), b = SHARP.bounds;
  return m.getZoom() >= SHARP.minzoom && c.lng > b[0] && c.lng < b[2] && c.lat > b[1] && c.lat < b[3];
}
function imgSource() {
  if (S.img === 'sharp') return { key: 'sharp', type: 'raster', tileSize: 512, minzoom: SHARP.minzoom, maxzoom: SHARP.maxzoom, bounds: SHARP.bounds,
    tiles: [CFG.api.replace('/rest/v1', '/functions/v1/sat10') + '/{z}/{x}/{y}'] };
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
    m.addLayer({ id: 'img', type: 'raster', source: 'img', ...(def.minzoom ? { minzoom: def.minzoom } : {}) }, first ? first.id : undefined);
  }
  // the drawn land and sea would cover the picture, so they step aside while it is shown; borders, roads and names stay
  // (the sharp picture exists only close up and inside its area, so there the drawn map stays until we are in it)
  sharpShown = S.img === 'sharp' && sharpHere();
  const hide = on && (S.img !== 'sharp' || sharpShown);
  const ids = new Set(BASEMAPS.map((b) => b.id));
  for (const l of layers) if (l.type === 'fill' && ids.has(l.source)) m.setLayoutProperty(l.id, 'visibility', hide ? 'none' : 'visible');
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

const DETAIL_VIEWS = ['ac', 'sat', 'quake', 'ship', 'fire', 'outage', 'conj', 'skyc'];
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
  // On a phone the sheet covers the lower part of the map, so the opening view is centred in the part that is left visible.
  m.once('load', () => {
    if (innerWidth >= 900) return;
    m.jumpTo({ center: CFG.center, zoom: CFG.zoom, padding: { top: 70, bottom: Math.min($('#sheet').offsetHeight, innerHeight * 0.62), left: 0, right: 0 } });
  });
  m.on('style.load', addOverlay);
  m.on('moveend', () => { scanSats(); if (S.img === 'sharp' && sharpHere() !== sharpShown) applyImagery(); });
  // Until the first full drawing of the map, a small note says it is loading (on a slow phone connection this takes a few seconds).
  m.once('idle', () => { $('#maploading').hidden = true; });
  setTimeout(() => { $('#maploading').hidden = true; }, 20000);
  m.on('dragstart', () => { if (S.follow) { S.follow = null; render(); } });   // moving the map by hand stops following an aircraft
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) m.on('mousemove', (ev) => hoverTip(ev.point));
  m.on('mouseout', () => hoverTip(null));
  m.on('click', (ev) => {
    hoverTip(null);
    const p = ev.point, r = coarse ? 22 : 14;   // at least the 24-pixel touch area the accessibility standard (WCAG 2.2) sets
    const hits = m.getLayer('ac') ? m.queryRenderedFeatures([[p.x - r, p.y - r], [p.x + r, p.y + r]], { layers: ['ac'] }) : [];
    if (hits.length) {
      let best = hits[0], bd = Infinity;
      for (const f of hits) {
        const q = m.project(f.geometry.coordinates); const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (d < bd) { bd = d; best = f; }
      }
      go({ name: 'ac', hex: best.properties.hex, brief: true, from: DETAIL_VIEWS.includes(S.view.name) ? S.view.from : S.view });
    } else {
      const q = coarse ? 18 : 12, box = [[p.x - q, p.y - q], [p.x + q, p.y + q]];
      const from = DETAIL_VIEWS.includes(S.view.name) ? S.view.from : S.view;
      const pick = (layer, area) => (m.getLayer(layer) ? m.queryRenderedFeatures(area, { layers: [layer] })[0] : null);
      const ship = pick('ships', box);
      const cj = !ship ? pick('conj', box) : null;
      const sat = !ship && !cj ? pick('sats', box) : null;
      const qk = !ship && !cj && !sat ? pick('quakes', ev.point) : null;
      const fire = !ship && !sat && !qk ? pick('fires', box) : null;
      const cut = !ship && !sat && !qk && !fire ? pick('outages', box) : null;
      const sky = !ship && !sat && !qk && !fire && !cut ? pick('skies', box) : null;
      if (ship) go({ name: 'ship', id: ship.properties.id, brief: true, from });
      else if (cj) go({ name: 'conj', id: cj.properties.id, brief: true, from });
      else if (sat) go({ name: 'sat', id: sat.properties.id, brief: true, from });
      else if (qk) go({ name: 'quake', id: qk.properties.id, brief: true, from });
      else if (fire) go({ name: 'fire', id: fire.properties.id, brief: true, from });
      else if (cut) go({ name: 'outage', id: cut.properties.id, brief: true, from });
      else if (sky) go({ name: 'skyc', id: sky.properties.id, brief: true, from });
      else if (DETAIL_VIEWS.includes(S.view.name)) {
        const to = (S.view.brief ? S.view.from : null) || S.view.from || { name: 'home' };
        S.follow = null;
        go(to);
        if (to.name === 'home') $('#sheet').classList.add('closed');   // a tap on empty map puts the card away and leaves the map clear
      }
    }
    closeLayers(); closeSearch(); $('#sources').hidden = true;
  });
}

// With a mouse: the pointer turns into a hand over anything that can be clicked, and a short label shows what it is
// (the leading flight and ship maps do the same), so the map itself tells the user what is clickable.
const HOVER_LAYERS = ['ac', 'ships', 'conj', 'sats', 'quakes', 'fires', 'outages', 'skies'];
function hoverTip(p) {
  const m = S.map, tip = $('#tip');
  if (!p || !m) { tip.hidden = true; if (m) m.getCanvas().style.cursor = ''; return; }
  const layers = HOVER_LAYERS.filter((l) => m.getLayer(l) && m.getLayoutProperty(l, 'visibility') !== 'none');
  const f = layers.length ? m.queryRenderedFeatures([[p.x - 10, p.y - 10], [p.x + 10, p.y + 10]], { layers })[0] : null;
  m.getCanvas().style.cursor = f ? 'pointer' : '';
  const text = f ? hoverText(f) : null;
  if (!text) { tip.hidden = true; return; }
  tip.textContent = text; tip.hidden = false;
  tip.style.left = Math.min(p.x + 14, innerWidth - tip.offsetWidth - 8) + 'px';
  tip.style.top = Math.max(8, p.y - tip.offsetHeight - 10) + 'px';
}
function hoverText(f) {
  const L = t(), id = f.properties.id;
  switch (f.layer.id) {
    case 'ac': {
      const a = findAc(f.properties.hex); if (!a) return null;
      const alt = a.on_ground ? L.ground : altOf(a) != null ? L.alt(altOf(a)) : null;
      return [callsign(a) || a.reg || a.hex.toUpperCase(), alt].filter(Boolean).join(' · ');
    }
    case 'ships': { const x = S.ships.find((s) => String(s.mmsi) === String(id)); return x ? x.name || String(x.mmsi) : L.ship; }
    case 'sats': { const x = S.sats.find((s) => String(s.id) === String(id)); return x ? x.name : L.sat; }
    case 'quakes': { const e = S.quakes.find((x) => String(x.id) === String(id)); return e ? L.quakeTitle(e.mag.toFixed(1)) : L.quakes; }
    case 'fires': return L.fire;
    case 'outages': { const e = S.outages.find((x) => String(x.id) === String(id)); return e ? outagePlace(e) : L.outage; }
    case 'skies': return skyName(id);
    case 'conj': return L.conj;
    default: return null;
  }
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
  if (S.follow && !(view.name === 'ac' && view.hex === S.follow)) S.follow = null;
  $('#sheet').classList.remove('closed');
  applyLayerOptions();
  render();
  $('#sheet-body').scrollTop = 0;
  setLink(); trailTick();
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
  const low = S.near.filter(lowAcc).length, em = S.em.length, sky = airborne().length, zones = gnssZones().length;
  return [header(L.title),
    row(low || zones ? c.warn : c.alt[2], L.gnss, [zones ? L.gnssZones(zones) : null, low ? L.gnssSome(low) : L.gnssNone].filter(Boolean).join(' '), () => go({ name: 'gnss' })),
    row(em ? c.warn : c.alt[2], L.emerg,
      em === 1 ? [L.emergOne, ' ', h('b', { class: 'cs', style: 'color:var(--accent)' }, emName(S.em[0]))] : em ? L.emergSome(em) : L.emergNone,
      () => { if (em === 1) { go({ name: 'ac', hex: S.em[0].hex, from: { name: 'home' } }); flyTo(S.ac.find((a) => a.hex === S.em[0].hex) || S.em[0], 7); } else go({ name: 'emerg' }); }),
    row(S.quakes.length ? c.accent : c.alt[2], L.quakes, quakeSummary(), () => go({ name: 'quakes' })),
    row(S.outages.some((e) => !e.end) ? c.warn : c.alt[2], L.outages, outageSummary(), () => go({ name: 'outages' })),
    row(skiesFlagged().length ? c.warn : c.alt[2], L.skies, skiesSummary(), () => go({ name: 'skies' })),
    row(c.alt[2], L.milw, L.milwCount(S.milw.length), () => go({ name: 'milw' })),
    row(S.imgOver.length ? c.accent : c.alt[2], L.imgSats, imgSummary(), () => go({ name: 'imgsats' })),
    row(S.conj.length ? c.warn : c.alt[2], L.conjs, conjSummary(), () => go({ name: 'conjs' })),
    row(c.alt[2], L.sky, L.skyCount(sky), () => go({ name: 'sky' }))];
}
function viewGnss() {
  const L = t(); const list = S.near.filter(lowAcc);
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
  return [header(L.sky, { name: 'home' }), h('p', { class: 'note' }, L.skyCount(list.length) + ' ' + L.skyNote + (S.satNow.length ? ' ' + L.satCount(S.satInView - (S.debInView || 0), S.debInView || 0, S.satNow.length) : '')), list.map(acRow)];
}
function viewAircraft(hex) {
  const L = t();
  const a = findAc(hex);
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
    add(L.fSpeed, badFix(a) ? L.notPossible : a.gs != null ? L.speed(a.gs) : null);
    add(L.fTrack, badFix(a) ? L.notPossible : a.track != null ? L.deg(a.track) : null);
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
  actionRow(S.view, null),
  badFix(a) ? h('p', { class: 'note warnnote' }, L.badFixNote) : null,
  h('dl', { class: 'facts' }, facts),
  airline || (rt && rt.length > 1) ? h('p', { class: 'note' }, L.routeNote) : null];
}

// The region name as the seismological centre sends it, in Hebrew when we can translate every part of it.
function regionNode(region) {
  if (!region) return null;
  const he = S.lang === 'he' ? regionHe(region) : null;
  return he || h('span', { class: 'cs' }, region);
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
    row(c.accent, L.mag(e.mag.toFixed(1)), [L.ago(secAgo(e.time)), e.region ? ', ' : null, regionNode(e.region)],
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
  add(L.qRegion, regionNode(e.region));
  add(L.fPos, h('span', { class: 'cs' }, `${e.lat.toFixed(3)}, ${e.lon.toFixed(3)}`));
  return [head(L.quakeTitle(e.mag.toFixed(1))), h('dl', { class: 'facts' }, facts)];
}
function countryName(code) {
  try { return new Intl.DisplayNames([S.lang === 'he' ? 'he' : 'en'], { type: 'region' }).of(code) || code; } catch { return code; }
}
const outagePlace = (e) => (e.countries.length ? e.countries.map(countryName).join(', ') : t().unknown);
const when = (iso) => new Date(iso).toLocaleString(S.lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: S.lang === 'he' ? 'numeric' : 'short', hour: '2-digit', minute: '2-digit' });
function outageSummary() {
  const L = t(), n = S.outages.length;
  if (!S.outagesOk) return L.outagesStale;
  return n ? L.outagesSome(n, S.outages.filter((e) => !e.end).length) : L.outagesNone;
}
function showOutage(e) {
  go({ name: 'outage', id: e.id, from: S.view });
  const at = S.countries && S.countries[e.countries[0]];
  if (at) S.map.easeTo({ center: at, zoom: 4, padding: { bottom: $('#sheet').offsetHeight, top: 70, left: 0, right: 0 }, duration: 600 });
}
function viewOutages() {
  const L = t(), c = T();
  const rows = S.outages.map((e) => row(e.end ? c.unk : c.warn, outagePlace(e),
    [L.outKinds[e.kind] || L.oKindNone, ', ', L.outCauses[e.cause] || L.oCauseNone, '. ', e.end ? L.oEnded(when(e.end)) : L.oOngoing], () => showOutage(e)));
  return [header(L.outages, { name: 'home' }), h('p', { class: 'note' }, outageSummary() + ' ' + L.outagesNote), rows];
}
function viewOutage(id) {
  const L = t(), e = S.outages.find((x) => x.id === id);
  if (!e) return [detailHead(L.outages), h('p', { class: 'note' }, L.gone)];
  const facts = [];
  const add = (k, v) => facts.push(h('dt', null, k), h('dd', null, v == null || v === '' ? L.unknown : v));
  add(L.oKind, L.outKinds[e.kind] || L.oKindNone);
  add(L.oCause, L.outCauses[e.cause] || L.oCauseNone);
  add(L.oStart, when(e.start));
  add(L.oEnd, e.end ? when(e.end) : L.oOngoing);
  if (e.networks.length) add(L.oNetworks, h('span', { class: 'cs' }, e.networks.map((n) => n.name || 'AS' + n.asn).join(', ')));
  if (e.text) add(L.oText, h('span', { class: 'cs' }, e.text));
  if (e.link) add(L.oLink, h('a', { href: e.link, target: '_blank', rel: 'noopener noreferrer', style: 'color:var(--accent)' }, L.oLinkText));
  return [detailHead(outagePlace(e), L.outage), h('dl', { class: 'facts' }, facts), h('p', { class: 'note' }, L.outageNote)];
}
function skiesSummary() {
  const L = t(), k = S.skies;
  if (!k) return L.skiesStale;
  if (!k.live) return L.skiesNoLive;
  if (k.days < k.need_days) return L.skiesLearning(k.days, k.need_days);
  const f = skiesFlagged();
  return f.length ? L.skiesSome(f.map((a) => countryName(a.code))) : L.skiesNone;
}
const skyName = (code) => (code === 'ALL' ? t().skiesAll : countryName(code));
function showSkyArea(a) {
  go({ name: 'skyc', id: a.code, from: S.view });
  const at = a.code !== 'ALL' && S.countries && S.countries[a.code];
  if (at) S.map.easeTo({ center: at, zoom: Math.max(S.map.getZoom(), 5), padding: { bottom: $('#sheet').offsetHeight, top: 70, left: 0, right: 0 }, duration: 600 });
}
function viewSkies() {
  const L = t(), c = T(), k = S.skies;
  const list = k ? [k.all, ...k.areas.filter((a) => a.now > 0 || (a.base || 0) > 0)] : [];
  const rows = list.map((a) => row(a.drop ? c.warn : a.code === 'ALL' ? c.accent : c.alt[2], skyName(a.code),
    a.base == null ? L.skiesRowNoBase(a.now) : L.skiesRow(a.now, Math.round(a.base)), () => showSkyArea(a)));
  return [header(L.skies, { name: 'home' }), h('p', { class: 'note' }, skiesSummary()), h('p', { class: 'note' }, L.skiesNote), rows];
}
function viewSkyArea(code) {
  const L = t(), k = S.skies, a = k && (code === 'ALL' ? k.all : k.areas.find((x) => x.code === code));
  if (!a) return [detailHead(L.skies), h('p', { class: 'note' }, L.gone)];
  const facts = [];
  const add = (key, v) => facts.push(h('dt', null, key), h('dd', null, v == null || v === '' ? L.unknown : v));
  add(L.skNow, L.planes(a.now));
  add(L.skBase, a.base == null ? L.skNoBase : L.planes(Math.round(a.base)));
  if (a.base) add(L.skChange, L.pctChange(Math.round((a.now / a.base - 1) * 100)));
  add(L.skDays, L.days(k.days));
  return [detailHead(skyName(code), a.drop ? L.skDrop : null), h('dl', { class: 'facts' }, facts), h('p', { class: 'note' }, L.skiesNote)];
}
function imgSummary() {
  const L = t();
  if (!S.sats.length) return L.loading;
  const o = S.imgOver, opt = o.filter((x) => x.img === 'opt').length, sar = o.length - opt;
  const next = S.imgNext && S.imgNext.find((x) => x.at > Date.now());
  return [o.length ? L.imgOverSome(opt, sar) : L.imgOverNone, next ? ' ' + L.imgNextIn(L.inTime((next.at - Date.now()) / 1000)) : ''].join('');
}
const imgTag = (st) => (st.img === 'sar' ? t().satSar : t().satOpt);
function viewImgSats() {
  const L = t(), c = T();
  const openSat = (st) => () => { go({ name: 'sat', id: st.id, from: S.view }); scanSats(); };
  const nameOf = (st) => h('span', { class: 'cs', style: 'display:inline;color:inherit;font-size:inherit' }, st.name);
  const now = S.imgOver.map((st) => row(c.accent, nameOf(st), imgTag(st), openSat(st)));
  const next = (S.imgNext || []).filter((x) => x.at > Date.now()).slice(0, 30)
    .map((x) => row(c.alt[2], nameOf(x.st), L.imgRow(imgTag(x.st), L.inTime((x.at - Date.now()) / 1000)), openSat(x.st)));
  return [header(L.imgSats, { name: 'home' }), h('p', { class: 'note' }, imgSummary()), h('p', { class: 'note' }, L.imgNote),
    now.length ? h('h3', { class: 'sub' }, L.imgNowTitle) : null, now,
    next.length ? h('h3', { class: 'sub' }, L.imgNextTitle) : null, next];
}
function viewMilw() {
  const L = t();
  const list = S.milw.slice().sort((a, b) => (callsign(a) || a.ac_type || '~').localeCompare(callsign(b) || b.ac_type || '~'));
  return [header(L.milw, { name: 'home' }), h('p', { class: 'note' }, L.milwCount(list.length) + ' ' + L.milwNote), list.map(acRow)];
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
  const here = S.satNow.some((x) => x.id === id), deb = st && st.kind === 'deb';
  const origin = deb ? L.debFrom[debrisOf(st.name)] : null;
  return [h('div', { class: 'head' },
    h('button', { class: 'back', type: 'button', on: { click: () => go(back) } }, chev(), L.back),
    h('h2', null, h('span', { class: 'cs' }, st ? st.name : id), h('i', { class: 'tag', style: 'font-style:normal' }, deb ? L.deb : st && st.img ? imgTag(st) : L.sat))),
  origin ? h('p', { class: 'note' }, origin) : null,
  h('p', { class: 'note' }, here ? (deb ? L.debNote : L.satNote) : L.satLeft), satFacts(id)];
}
const metres = (km) => (km < 1 ? t().metres(Math.round(km * 1000)) : t().km(Math.round(km * 10) / 10));
const chance = (p) => (!(p > 0) ? t().unknown : p >= 0.01 ? t().pct(Math.round(p * 1000) / 10) : p >= 0.0001 ? t().pct(Number((p * 100).toPrecision(1))) : t().pctTiny);
const pairName = (e) => [h('span', { class: 'cs', style: 'display:inline;color:inherit;font-size:inherit' }, e.a.name), t().and, h('span', { class: 'cs', style: 'display:inline;color:inherit;font-size:inherit' }, e.b.name)];
function conjSummary() {
  const L = t();
  if (!S.conjOk) return L.conjStale;
  return S.conj.length ? L.conjSome(S.conj.length, metres(S.conj[0].range)) : L.conjNone;
}
function showConj(e) {
  go({ name: 'conj', id: e.id, from: S.view });
  if (e.lat != null) S.map.easeTo({ center: [e.lon, e.lat], zoom: Math.max(S.map.getZoom(), 3), padding: { bottom: $('#sheet').offsetHeight, top: 70, left: 0, right: 0 }, duration: 600 });
}
function viewConjs() {
  const L = t(), c = T();
  const rows = S.conj.map((e) => row(c.warn, pairName(e), `${L.inTime((e.tca - Date.now()) / 1000)} ${L.cPass(metres(e.range))}.`, () => showConj(e)));
  return [header(L.conjs, { name: 'home' }), h('p', { class: 'note' }, conjSummary()), h('p', { class: 'note' }, L.conjsNote), rows];
}
function viewConj(id) {
  const L = t(), e = S.conj.find((x) => x.id === id);
  if (!e) return [detailHead(L.conj), h('p', { class: 'note' }, L.gone)];
  const facts = [];
  const add = (k, v) => facts.push(h('dt', null, k), h('dd', null, v == null || v === '' ? L.unknown : v));
  const obj = (o) => (S.sats.some((x) => x.id === o.id)
    ? h('a', { href: '#', class: 'cs', style: 'color:var(--accent)', on: { click: (ev) => { ev.preventDefault(); go({ name: 'sat', id: o.id, from: S.view }); scanSats(); } } }, o.name)
    : h('span', { class: 'cs' }, o.name));
  add(L.cFirst, obj(e.a));
  add(L.cSecond, obj(e.b));
  add(L.qTime, `${when(new Date(e.tca).toISOString())} (${L.inTime((e.tca - Date.now()) / 1000).toLowerCase()})`);
  add(L.cRange, metres(e.range));
  add(L.cSpeed, L.kmh(Math.round(e.speed * 3600)));
  add(L.cProb, chance(e.prob));
  if (e.km != null) add(L.fAlt, L.km(Math.round(e.km)));
  if (e.lat != null) add(L.fPos, h('span', { class: 'cs' }, `${e.lat.toFixed(2)}, ${e.lon.toFixed(2)}`));
  return [detailHead(L.conj), h('dl', { class: 'facts' }, facts), h('p', { class: 'note' }, L.conjNote)];
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
  const short = v.brief ? viewBrief(v) : null;
  $('#sheet').classList.toggle('brief', !!short);
  $('#sheet').classList.toggle('detail', DETAIL_VIEWS.includes(v.name));   // shows the close button; the sources line stays on the main panel
  $('#sheet').classList.toggle('home', v.name === 'home');
  const nodes = short ? short : v.name === 'gnss' ? viewGnss() : v.name === 'emerg' ? viewEmerg() : v.name === 'sky' ? viewSky()
    : v.name === 'ac' ? viewAircraft(v.hex) : v.name === 'quakes' ? viewQuakes() : v.name === 'quake' ? viewQuake(v.id)
    : v.name === 'sat' ? viewSat(v.id) : v.name === 'ship' ? viewShip(v.id) : v.name === 'fire' ? viewFire(v.id) : v.name === 'outages' ? viewOutages() : v.name === 'outage' ? viewOutage(v.id) : v.name === 'conjs' ? viewConjs() : v.name === 'conj' ? viewConj(v.id) : v.name === 'skies' ? viewSkies() : v.name === 'skyc' ? viewSkyArea(v.id)
    : v.name === 'milw' ? viewMilw() : v.name === 'imgsats' ? viewImgSats() : viewHome();
  body.replaceChildren(...nodes.flat().filter(Boolean));
  body.scrollTop = keep;
}

// The short card shown when something is tapped on the map: a name and the few facts that matter most.
// It leaves the map visible; "all details" opens the full list.
function viewBrief(v) {
  const L = t(), ltr = (x) => h('span', { class: 'cs' }, x), tag = (x, warn) => h('i', { class: 'tag' + (warn ? ' warn' : ''), style: 'font-style:normal' }, x);
  let title = null; const lines = [];
  if (v.name === 'ac') {
    const a = findAc(v.hex);
    if (!a) return null;
    const cs = callsign(a), airline = cs ? airlineOf(cs) : null, rt = cs ? routeOf(cs) : null;
    title = [ltr(cs || a.reg || a.hex.toUpperCase()), a.mil ? tag(L.mil) : null, isEmerg(a) || !('gs' in a) ? tag(L.sq[a.squawk] || L.emerg, true) : null];
    if (airline) lines.push(ltr(airline));
    const alt = a.on_ground ? L.ground : altOf(a) != null ? L.alt(altOf(a)) : null;
    const fly = [alt ? `${L.fAlt} ${alt}.` : null, a.gs != null && !badFix(a) ? `${L.fSpeed} ${L.speed(a.gs)}.` : null].filter(Boolean).join(' ');
    if (fly) lines.push(fly);
    if (badFix(a)) lines.push(h('span', { class: 'warnnote' }, L.badFixNote));
    if (rt && rt.length > 1) {
      lines.push([L.fFrom + ': ', ltr(placeName(rt[0]))]);
      lines.push([L.fTo + ': ', ltr(placeName(rt[rt.length - 1]))]);
      const pr = routeProgress(a, rt);
      if (pr != null) lines.push(h('span', { class: 'prog', role: 'img', 'aria-label': L.progress(Math.round(pr * 100)) },
        h('i', { style: `inline-size:${Math.round(pr * 100)}%` })));
    }
    const seenAt = a.pos_time || a.last_seen;
    if (seenAt) lines.push(`${L.fSeen}: ${L.ago(secAgo(seenAt))}.`);
  } else if (v.name === 'ship') {
    const x = S.ships.find((s) => String(s.mmsi) === v.id);
    if (!x) return null;
    title = [ltr(x.name || String(x.mmsi)), tag(L.ship)];
    const kind = shipKind(x.kind);
    const what = [kind ? `${L.shType}: ${kind}` : null, x.sog != null ? `${L.fSpeed} ${L.knots(x.sog)}` : null].filter(Boolean).join('. ');
    if (what) lines.push(what + '.');
    if (x.dest) lines.push([L.fTo + ': ', ltr(x.dest)]);
    if (x.t) lines.push(`${L.fSeen}: ${L.ago(secAgo(x.t))}.`);
  } else if (v.name === 'sat') {
    const st = S.sats.find((x) => x.id === v.id), o = S.satNow.find((x) => x.id === v.id);
    title = [ltr(st ? st.name : v.id), tag(st && st.kind === 'deb' ? L.deb : st && st.img ? imgTag(st) : L.sat)];
    if (o) lines.push([`${L.fAlt} ${L.km(Math.round(o.km))}.`, o.kms != null ? ` ${L.fSpeed} ${L.kmh(Math.round(o.kms * 3600))}.` : ''].join(''));
  } else if (v.name === 'skyc') {
    const k = S.skies, a = k && (v.id === 'ALL' ? k.all : k.areas.find((x) => x.code === v.id));
    if (!a) return null;
    title = [skyName(v.id), a.drop ? tag(L.skDrop, true) : null];
    lines.push(a.base == null ? L.skiesRowNoBase(a.now) : L.skiesRow(a.now, Math.round(a.base)));
  } else if (v.name === 'conj') {
    const e = S.conj.find((x) => x.id === v.id);
    if (!e) return null;
    title = [L.conj];
    lines.push(pairName(e));
    lines.push(`${L.inTime((e.tca - Date.now()) / 1000)} ${L.cPass(metres(e.range))}.`);
  } else if (v.name === 'quake') {
    const e = S.quakes.find((x) => x.id === v.id);
    if (!e) return null;
    title = [L.quakeTitle(e.mag.toFixed(1))];
    lines.push(L.ago(secAgo(e.time)) + '.');
    if (e.region) lines.push(regionNode(e.region));
  } else if (v.name === 'fire') {
    const x = S.fires.find((f) => f.id === v.id);
    if (!x) return null;
    title = [L.fire];
    lines.push(`${L.ago(secAgo(x.time))}. ${L.fiPower} ${L.megawatt(x.frp)}.`);
  } else if (v.name === 'outage') {
    const e = S.outages.find((x) => x.id === v.id);
    if (!e) return null;
    title = [outagePlace(e), tag(L.outage)];
    lines.push(`${L.oKind}: ${L.outKinds[e.kind] || L.oKindNone}. ${L.oCause}: ${L.outCauses[e.cause] || L.oCauseNone}.`);
    lines.push((e.end ? L.oEnded(when(e.end)) : L.oOngoing) + '.');
  } else return null;
  return [h('div', { class: 'head' }, h('h2', null, ...title.filter(Boolean))),
    ...lines.map((x) => h('p', { class: 'brief-line' }, ...[].concat(x))),
    actionRow(v, h('button', { class: 'back more', type: 'button', on: { click: () => go({ ...v, brief: false, from: v }) } }, L.allDetails))];
}
// The actions under a selected item: full details (on the short card), following the aircraft, and a link to share.
function actionRow(v, first) {
  const L = t(), following = v.name === 'ac' && S.follow === v.hex;
  return h('div', { class: 'acts' }, first,
    v.name === 'ac' ? h('button', { class: 'back more', type: 'button', 'aria-pressed': String(following),
      on: { click: () => { S.follow = following ? null : v.hex; render(); followTick(); } } }, following ? L.followStop : L.follow) : null,
    h('button', { class: 'back more', type: 'button', on: { click: copyLink } }, L.copyLink));
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
  const credit = () => L.credit.map((p) => Array.isArray(p) ? h('a', { href: p[1], target: '_blank', rel: 'noopener noreferrer' }, p[0]) : p);
  $('#credit').replaceChildren(...credit());
  $('#sources-text').replaceChildren(...sourceLines(L.credit));
  for (const [id, key] of [['#btn-zin', 'zoomIn'], ['#btn-zout', 'zoomOut'], ['#btn-home', 'homeView'], ['#btn-info', 'sources'], ['#btn-search', 'search'], ['#btn-close', 'close']]) {
    $(id).setAttribute('aria-label', L[key]); $(id).title = L[key];
  }
  $('#q').placeholder = L.searchPh; $('#q').setAttribute('aria-label', L.search);
  $('.ctl').setAttribute('aria-label', L.mapControls);
  drawLegend();
}
// The key at the bottom of the map: aircraft altitude colours always, and when opened, every symbol on the map now.
function drawLegend() {
  const L = t(), c = T(), open = $('#legend').getAttribute('aria-expanded') === 'true';
  const sym = (style, text) => h('span', { class: 'key-item' }, h('i', { class: 'sym', style }), text);
  const items = [
    S.showAc ? sym(`border:2px dashed ${c.warn};border-radius:50%;background:none`, L.tagLow) : null,
    S.showGnss ? sym(`background:${c.warn};opacity:.5`, L.gnss) : null,
    S.showSkies ? sym(`border:2px solid ${c.warn};border-radius:50%;background:none`, L.skies) : null,
    S.showShips ? sym(`background:${c.ship};clip-path:polygon(50% 0,100% 100%,50% 75%,0 100%)`, L.ships) : null,
    S.showQuakes ? sym(`border:1.6px solid ${c.accent};border-radius:50%;background:none`, L.quakes) : null,
    S.showOutages ? sym(`border:2px solid ${c.ink};border-radius:50%;background:none`, L.outages) : null,
    S.showFires ? sym(`background:${c.fire};border-radius:50%;inline-size:8px;block-size:8px`, L.fires) : null,
    S.showSats ? sym(`background:${c.ink};border-radius:50%;inline-size:6px;block-size:6px`, L.sats) : null,
    S.showConj ? sym(`border:1.8px solid ${c.warn};border-radius:50%;background:none`, L.conjs) : null,
  ].filter(Boolean);
  $('#legend').replaceChildren(
    h('span', { class: 'key-row' }, L.legend, h('span', null, L.low), ...c.alt.map((col) => h('i', { style: 'background:' + col })), h('span', null, L.high),
      items.length ? svg(open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6', 'chev') : null),
    ...(open && items.length ? [h('span', { class: 'key-list' }, items)] : []));
}
// Search by callsign, registration or transponder ID for aircraft, and by name or MMSI for ships.
function runSearch() {
  const L = t(), q = $('#q').value.trim().toUpperCase(), out = $('#results');
  if (q.length < 2) { out.replaceChildren(); return; }
  const c = T(), hits = [];
  const seen = new Set();
  for (const a of S.ac.concat(S.milw, S.em)) {
    if (seen.has(a.hex)) continue; seen.add(a.hex);
    const cs = callsign(a);
    if ((cs && cs.toUpperCase().includes(q)) || (a.reg && a.reg.toUpperCase().includes(q)) || a.hex.toUpperCase() === q)
      hits.push(row(isEmerg(a) ? c.warn : c.alt[2], h('span', { class: 'cs', style: 'display:inline;color:inherit;font-size:inherit' }, cs || a.reg || a.hex.toUpperCase()),
        [L.optAircraft, a.ac_type, cs ? airlineOf(cs) : null].filter(Boolean).join(' · '),
        () => { closeSearch(); go({ name: 'ac', hex: a.hex, brief: true, from: { name: 'home' } }); flyTo(a, 8); }));
    if (hits.length >= 12) break;
  }
  if (S.showShips) for (const x of S.ships) {
    if (hits.length >= 16) break;
    if ((x.name && x.name.toUpperCase().includes(q)) || String(x.mmsi) === q)
      hits.push(row(c.ship, h('span', { class: 'cs', style: 'display:inline;color:inherit;font-size:inherit' }, x.name || String(x.mmsi)), [L.ship, shipKind(x.kind)].filter(Boolean).join(' · '),
        () => { closeSearch(); go({ name: 'ship', id: String(x.mmsi), brief: true, from: { name: 'home' } }); flyTo(x, 8); }));
  }
  out.replaceChildren(...(hits.length ? hits : [h('p', { class: 'note' }, L.searchNone)]));
}
function closeSearch() { $('#search').hidden = true; $('#btn-search').setAttribute('aria-expanded', 'false'); }
/* ---------- phone alerts (Web Push) ---------- */
// The browser subscribes with the site's public key; our server keeps the subscription and sends an alert when a
// chosen event happens. On an iPhone this works only after the site is added to the home screen.
const PUSH_URL = CFG.api.replace('/rest/v1', '/functions/v1/push');
const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function pushNote(text) { const n = $('#push-note'); n.textContent = text || ''; n.hidden = !text; }
function b64u(s) {
  const b = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function pushSub() {
  if (!pushOk()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
async function pushOn() {
  const L = t();
  if (!pushOk()) { pushNote(isIOS() ? L.pushIOS : L.pushNo); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { pushNote(L.pushDenied); return false; }
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  const { key } = await (await fetch(PUSH_URL, { credentials: 'omit' })).json();
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) });
  const r = await fetch(PUSH_URL, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'subscribe', sub: sub.toJSON(), topics: ['skies'], lang: S.lang }) });
  if (!r.ok) throw new Error('subscribe ' + r.status);
  store.set('push', 'skies'); pushNote(L.pushOnDone);
  return true;
}
async function pushOff() {
  const sub = await pushSub();
  if (sub) {
    await fetch(PUSH_URL, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unsubscribe', endpoint: sub.endpoint }) });
    await sub.unsubscribe();
  }
  store.set('push', ''); pushNote(t().pushOffDone);
}
async function pushInit() {
  const box = $('#opt-push-skies');
  box.checked = store.get('push', '') === 'skies' && !!(await pushSub().catch(() => null));
  box.addEventListener('change', async () => {
    box.disabled = true;
    try { box.checked = box.checked ? await pushOn() : (await pushOff(), false); }
    catch { box.checked = false; pushNote(t().pushFail); }
    finally { box.disabled = false; }
  });
}
function closeLayers() { $('#layers').hidden = true; $('#btn-layers').setAttribute('aria-expanded', 'false'); }

function wire() {
  $('#btn-lang').addEventListener('click', () => {
    S.lang = S.lang === 'he' ? 'en' : 'he'; store.set('lang', S.lang);
    applyLang(); render(); S.map.setStyle(mapStyle());
  });
  $('#btn-layers').addEventListener('click', () => {
    closeSearch(); $('#sources').hidden = true;
    const p = $('#layers'); p.hidden = !p.hidden; $('#btn-layers').setAttribute('aria-expanded', String(!p.hidden));
  });
  $('#btn-search').addEventListener('click', () => {
    closeLayers(); $('#sources').hidden = true;
    const p = $('#search'); p.hidden = !p.hidden; $('#btn-search').setAttribute('aria-expanded', String(!p.hidden));
    if (!p.hidden) { $('#q').focus(); runSearch(); }
  });
  $('#q').addEventListener('input', runSearch);
  $('#btn-zin').addEventListener('click', () => S.map.zoomIn());
  $('#btn-zout').addEventListener('click', () => S.map.zoomOut());
  $('#btn-home').addEventListener('click', () => { S.follow = null; S.map.easeTo({ center: CFG.center, zoom: CFG.zoom, padding: mapPadding(), duration: 700 }); render(); });
  $('#btn-info').addEventListener('click', () => { closeLayers(); closeSearch(); $('#sources').hidden = !$('#sources').hidden; });
  $('#btn-close').addEventListener('click', closeCard);
  $('#legend').addEventListener('click', () => {
    const l = $('#legend'); l.setAttribute('aria-expanded', String(l.getAttribute('aria-expanded') !== 'true')); drawLegend();
  });
  for (const [k, f] of Object.entries(LAYER_OPTS)) $('#opt-' + k).checked = S[f];
  for (const [k, f] of Object.entries(LAYER_OPTS)) $('#opt-' + k).addEventListener('change', (e) => { S[f] = e.target.checked; saveLayers(); drawLegend(); drawTrail(); });
  $('#opt-ac').addEventListener('change', (e) => { S.showAc = e.target.checked; applyLayerOptions(); });
  $('#opt-labels').addEventListener('change', (e) => { S.showLabels = e.target.checked; applyLayerOptions(); });
  $('#opt-gnss').addEventListener('change', (e) => { S.showGnss = e.target.checked; applyLayerOptions(); });
  $('#opt-sats').addEventListener('change', (e) => { S.showSats = e.target.checked; applyLayerOptions(); scanSats(); tickSats(); });
  $('#opt-quakes').addEventListener('change', (e) => { S.showQuakes = e.target.checked; applyLayerOptions(); });
  $('#opt-ships').addEventListener('change', (e) => { S.showShips = e.target.checked; applyLayerOptions(); refreshShips(); });
  $('#opt-skies').addEventListener('change', (e) => { S.showSkies = e.target.checked; applyLayerOptions(); });
  $('#opt-conj').addEventListener('change', (e) => { S.showConj = e.target.checked; applyLayerOptions(); });
  $('#opt-outages').addEventListener('change', (e) => { S.showOutages = e.target.checked; applyLayerOptions(); });
  $('#opt-fires').addEventListener('change', (e) => { S.showFires = e.target.checked; applyLayerOptions(); });
  document.querySelectorAll('input[name=img]').forEach((r) => r.addEventListener('change', () => { if (r.checked) { S.img = r.value; applyImagery(); } }));
  setInterval(() => { if (S.img === 'clouds' && !document.hidden) applyImagery(); }, 5 * 60 * 1000);   // picks up the next hour's picture
  document.querySelectorAll('input[name=theme]').forEach((r) => r.addEventListener('change', () => {
    if (!r.checked) return;
    S.theme = r.value; store.set('theme', S.theme);
    applyTheme(); applyLang(); render(); S.map.setStyle(mapStyle());
  }));
  $('#grip').addEventListener('click', () => $('#sheet').classList.toggle('closed'));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = !$('#layers').hidden || !$('#search').hidden || !$('#sources').hidden;
    closeLayers(); closeSearch(); $('#sources').hidden = true;
    if (!open && DETAIL_VIEWS.includes(S.view.name)) closeCard();   // Esc closes the open card, like the close button
  });
}

/* ---------- start ---------- */
applyTheme(); applyLang(); render();
initMap(); wire(); pushInit();
refJson('airlines.json').then((j) => { S.ref.airlines = j; render(); }).catch(() => { S.ref.airlines = {}; });
// Satellites, ships, earthquakes, fires, internet outages and the emptying-skies check start a few seconds
// after the aircraft are on the map, so they do not compete with the aircraft for the connection.
let secondaryStarted = false;
function startSecondary() {
  if (secondaryStarted) return;
  secondaryStarted = true;
  refreshSlow(); loadCatalogue(); refreshShips();
}
setTimeout(startSecondary, 8000);   // in case the aircraft data is slow to arrive
refresh();
{ const k = setInterval(() => { if (S.link) openLink(); else clearInterval(k); }, 1500); setTimeout(() => clearInterval(k), 120000); }
setInterval(() => { if (!document.hidden) refreshSlow(); }, 5 * 60 * 1000);
setInterval(tickSats, 1000);
setInterval(loadCatalogue, 3 * 3600 * 1000);
setInterval(refreshShips, 60 * 1000);
setInterval(scanSats, 10000);
setInterval(() => { S.conj = S.conj.filter((e) => e.tca > Date.now()); drawConj(); }, 60 * 1000);
let timer = setInterval(refresh, CFG.pollMs);
const FAR_MS = CFG.farPollMs || 60000;   // a browser may still hold the previous config.js for a few minutes
refreshFar(); let farTimer = setInterval(refreshFar, FAR_MS);
document.addEventListener('visibilitychange', () => {
  clearInterval(timer); clearInterval(farTimer);
  if (!document.hidden) { refresh(); timer = setInterval(refresh, CFG.pollMs); refreshFar(); farTimer = setInterval(refreshFar, FAR_MS); }
});
setInterval(() => {   // keeps the "updated … ago" line honest without rebuilding the panel
  const f = document.querySelector('#sheet-body .fresh');
  if (f && !document.hidden) f.replaceWith(freshLine());
}, 1000);
