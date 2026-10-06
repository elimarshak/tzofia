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
  showAc: true, showLabels: true, showGnss: true,
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
    S.ac = ac; S.em = em; S.src = src[0] || null; S.netErr = false; S.loaded = true;
  } catch {
    S.netErr = true;
  }
  drawAircraft(); drawGnss();
  render();
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
const isEmerg = (a) => ['7500', '7600', '7700'].includes(a.squawk) || (a.emergency && a.emergency !== 'none');
const lowAcc = (a) => !a.on_ground && a.nic != null && a.nic < 7;
const callsign = (a) => { const c = (a.flight || '').trim(); return /^[A-Z0-9-]{2,8}$/i.test(c) ? c : ''; };   // transponders sometimes send filler such as @@@@@@@@
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

function mapStyle() {
  const base = new URL('.', location.href).href;
  const c = T();
  const flavor = { ...basemaps.namedFlavor(S.theme), background: c.sea, earth: c.land, water: c.sea };
  return {
    version: 8,
    glyphs: base + 'assets/fonts/{fontstack}/{range}.pbf',
    sprite: base + 'assets/sprites/v4/' + S.theme,
    sources: { protomaps: { type: 'vector', url: 'pmtiles://' + base + 'basemap.pmtiles' } },
    layers: basemaps.layers('protomaps', flavor, { lang: S.lang }),
  };
}

function addOverlay() {
  const m = S.map, c = T();
  const img = (name, data) => { if (m.hasImage(name)) m.removeImage(name); m.addImage(name, data, { pixelRatio: 2 }); };
  c.alt.forEach((col, i) => img('plane-' + i, planeImage(col, c.halo)));
  img('plane-u', planeImage(c.unk, c.halo));
  img('plane-e', planeImage(c.warn, c.halo));
  img('ring', ringImage(c.warn));

  m.addSource('gnss', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  m.addLayer({ id: 'gnss', type: 'fill', source: 'gnss',
    paint: { 'fill-color': c.warn, 'fill-opacity': ['case', ['==', ['get', 'level'], 2], 0.42, 0.17], 'fill-outline-color': c.warn } });
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
  drawAircraft(); drawGnss();
}

function applyLayerOptions() {
  const m = S.map; if (!m || !m.getLayer('ac')) return;
  for (const id of ['ac', 'ac-ring', 'ac-sel']) m.setLayoutProperty(id, 'visibility', S.showAc ? 'visible' : 'none');
  m.setLayoutProperty('ac', 'text-field', S.showLabels ? ['get', 'label'] : '');
  m.setLayoutProperty('gnss', 'visibility', S.showGnss ? 'visible' : 'none');
  m.setFilter('ac-sel', ['==', ['get', 'hex'], S.view.name === 'ac' ? S.view.hex : '']);
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

function initMap() {
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  maplibregl.setRTLTextPlugin(new URL('vendor/mapbox-gl-rtl-text.js', location.href).href, true);
  const m = new maplibregl.Map({
    container: 'map', style: mapStyle(), center: CFG.center, zoom: CFG.zoom,
    minZoom: 4.5, maxZoom: 13, maxBounds: CFG.bounds, attributionControl: false,
    dragRotate: false, pitchWithRotate: false, touchPitch: false,
  });
  m.touchZoomRotate.disableRotation();
  S.map = m;
  m.on('style.load', addOverlay);
  m.on('click', (ev) => {
    const p = ev.point, r = 14;
    const hits = m.getLayer('ac') ? m.queryRenderedFeatures([[p.x - r, p.y - r], [p.x + r, p.y + r]], { layers: ['ac'] }) : [];
    if (hits.length) {
      let best = hits[0], bd = Infinity;
      for (const f of hits) {
        const q = m.project(f.geometry.coordinates); const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (d < bd) { bd = d; best = f; }
      }
      go({ name: 'ac', hex: best.properties.hex, from: S.view.name === 'ac' ? S.view.from : S.view });
    } else if (S.view.name === 'ac') go(S.view.from || { name: 'home' });
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
  const kind = [a.ac_type, a.operator].filter(Boolean).join(' · ');
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
    row(em ? c.warn : c.alt[2], L.emerg, em ? L.emergSome(em) : L.emergNone, () => go({ name: 'emerg' })),
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
    return row(c.warn, h('span', { class: 'cs', style: 'display:inline;color:inherit;font-size:inherit' }, (e.flight || '').trim() || e.reg || e.hex),
      [what, e.squawk, e.ac_type].filter(Boolean).join(' · '),
      () => { go({ name: 'ac', hex: e.hex, from: S.view }); flyTo(live || e, 7); });
  });
  return [header(L.emerg, { name: 'home' }), h('p', { class: 'note' }, (S.em.length ? L.emergSome(S.em.length) : L.emergNone) + ' ' + L.emergNote), rows];
}
function viewSky() {
  const L = t();
  const list = airborne().slice().sort((a, b) => (callsign(a) || '~').localeCompare(callsign(b) || '~'));
  return [header(L.sky, { name: 'home' }), h('p', { class: 'note' }, L.skyCount(list.length) + ' ' + L.skyNote), list.map(acRow)];
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
  if (a.operator) add(L.fOp, ltr(a.operator));
  add(L.fAlt, a.on_ground ? L.ground : altOf(a) != null ? L.alt(altOf(a)) : null);
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
  h('dl', { class: 'facts' }, facts)];
}

function render() {
  const body = $('#sheet-body');
  const keep = body.scrollTop;
  const v = S.view;
  const nodes = v.name === 'gnss' ? viewGnss() : v.name === 'emerg' ? viewEmerg() : v.name === 'sky' ? viewSky()
    : v.name === 'ac' ? viewAircraft(v.hex) : viewHome();
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
refresh();
let timer = setInterval(refresh, CFG.pollMs);
document.addEventListener('visibilitychange', () => {
  clearInterval(timer);
  if (!document.hidden) { refresh(); timer = setInterval(refresh, CFG.pollMs); }
});
setInterval(() => {   // keeps the "updated … ago" line honest without rebuilding the panel
  const f = document.querySelector('#sheet-body .fresh');
  if (f && !document.hidden) f.replaceWith(freshLine());
}, 1000);
