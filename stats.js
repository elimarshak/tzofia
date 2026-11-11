// The private page of our own visit counter (see supabase/functions/stats). Hebrew only: it is for Ilya.
// The password is kept on this device after the first entry, and the device is then marked as Ilya's own, so his
// visits to the site are left out of the numbers.
'use strict';
const URL_STATS = 'https://wpnbzpulkyogdeuuqffh.supabase.co/functions/v1/stats';
const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem('tz-' + k) || ''; } catch { return ''; } },
  set(k, v) { try { if (v) localStorage.setItem('tz-' + k, v); else localStorage.removeItem('tz-' + k); } catch { /* private mode */ } },
};
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v; else if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const n = (x) => Number(x || 0).toLocaleString('he-IL');

/* ---------- words ---------- */
const people = (c) => (c === 0 ? 'אף אחד' : c === 1 ? 'אדם אחד' : `${n(c)} אנשים`);
function duration(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return sec === 1 ? 'שנייה אחת' : `${sec} שניות`;
  const m = Math.floor(sec / 60), s = sec % 60;
  const mm = m === 1 ? 'דקה' : `${n(m)} דקות`;
  if (!s) return m === 1 ? 'דקה אחת' : mm;
  return `${mm} ו-${s === 1 ? 'שנייה אחת' : `${s} שניות`}`;
}
const REF = [[/(^|\.)facebook\.com$|^fb\.com$|^fb\.me$/, 'פייסבוק'], [/(^|\.)instagram\.com$/, 'אינסטגרם'], [/(^|\.)google(\.|$)/, 'גוגל'],
  [/^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, 'X (טוויטר)'], [/whatsapp/, 'וואטסאפ'], [/(^|\.)t\.me$|telegram/, 'טלגרם'],
  [/(^|\.)bing\.com$/, 'בינג'], [/(^|\.)reddit\.com$/, 'רדיט'], [/(^|\.)linkedin\.com$|lnkd\.in/, 'לינקדאין'], [/(^|\.)youtube\.com$/, 'יוטיוב']];
const refName = (d) => { if (!d) return 'כניסה ישירה, או קישור מאפליקציה שלא מגלה מאיפה הגיעו האנשים (למשל וואטסאפ)'; const m = REF.find(([r]) => r.test(d)); return m ? m[1] : d; };
const countryName = (c) => { if (!c) return 'לא ידוע'; try { return new Intl.DisplayNames(['he'], { type: 'region' }).of(c) || c; } catch { return c; } };
const DEV = { mobile: 'טלפון או טאבלט', desktop: 'מחשב' };
const OS = { android: 'אנדרואיד', ios: 'אייפון או אייפד', windows: 'ווינדוס', mac: 'מק', linux: 'לינוקס', chromeos: 'כרומבוק', other: 'אחר' };
const LANG = { he: 'עברית', en: 'אנגלית' };
const THEME = { light: 'מפה בהירה', dark: 'מפה כהה' };
const LAYERS = { ac: 'מטוסים', labels: 'אותות קריאה', gnss: 'שיבושי ניווט', skies: 'שמיים שמתרוקנים', sats: 'לוויינים ופסולת חלל',
  conj: 'התקרבויות בחלל', ships: 'ספינות', quakes: 'רעידות אדמה', fires: 'מוקדי חום', outages: 'ניתוקי אינטרנט',
  airst: 'תחנות ניטור איכות האוויר', airlive: 'מדידות זיהום האוויר בזמן אמת' };
const ITEMS = { ac: 'מטוס', ship: 'ספינה', sat: 'לוויין', quake: 'רעידת אדמה', fire: 'מוקד חום', outage: 'ניתוק אינטרנט',
  conj: 'התקרבות בחלל', skyc: 'מדינה בשמיים שמתרוקנים', airst: 'תחנת ניטור של איכות האוויר', airlv: 'מדידה של זיהום האוויר' };
const VIEWS = { gnss: 'שיבושי ניווט', emerg: 'מצבי חירום', sky: 'השמיים באזור', quakes: 'רעידות אדמה', outages: 'ניתוקי אינטרנט',
  skies: 'שמיים שמתרוקנים', milw: 'מטוסים צבאיים', imgsats: 'לווייני צילום', conjs: 'התקרבויות בחלל', air: 'איכות האוויר' };
const IMG = { off: 'הסירו את התמונה מהחלל', clouds: 'בחרו בתמונת העננים מהחלל', d1: 'בחרו בצילום היומי מהחלל של אתמול', d0: 'בחרו בצילום היומי מהחלל של היום', sharp: 'בחרו בצילום המפורט מהחלל' };
const AIRIMG = { off: 'הסירו את התמונה של זיהום האוויר', no2: 'בחרו בתמונת החנקן הדו-חמצני', so2: 'בחרו בתמונת הגופרית הדו-חמצנית', dust: 'בחרו בתמונת האבק והעשן', pm25: 'בחרו בתחזית החלקיקים הדקים' };
function eventName(k) {
  const [a, b, c] = k.split(':');
  if (a === 'layer') return c === 'on' ? `הדליקו את השכבה '${LAYERS[b] || b}'` : `כיבו את השכבה '${LAYERS[b] || b}'`;
  if (a === 'item') return `פתחו כרטיס של ${ITEMS[b] || b}`;
  if (a === 'view') return `פתחו את המסך '${VIEWS[b] || b}'`;
  if (a === 'img') return IMG[b] || `בחרו תמונה מהחלל (${b})`;
  if (a === 'airimg') return AIRIMG[b] || `בחרו תמונה של זיהום האוויר (${b})`;
  if (a === 'lang') return b === 'en' ? 'עברו לאנגלית' : 'עברו לעברית';
  if (a === 'theme') return b === 'dark' ? 'עברו למפה הכהה' : 'עברו למפה הבהירה';
  return { search: 'חיפשו מטוס או ספינה', copylink: 'העתיקו קישור', follow: 'עקבו אחרי מטוס', legend: 'פתחו את המקרא', 'push:on': 'הפעילו התרעות לטלפון' }[k] || k;
}
const LINKS = { ac: 'קישור למטוס', ship: 'קישור לספינה', sat: 'קישור ללוויין', quake: 'קישור לרעידת אדמה', fire: 'קישור למוקד חום',
  outage: 'קישור לניתוק אינטרנט', conj: 'קישור להתקרבות בחלל', skyc: 'קישור למדינה בשמיים שמתרוקנים', airst: 'קישור לתחנת ניטור', airlv: 'קישור למדידה של זיהום האוויר' };
const linkName = (p) => { const m = /^#([a-z]+)-(.*)$/.exec(p); return [m ? LINKS[m[1]] || 'קישור' : 'קישור', h('br'), h('span', { class: 'ltr' }, p)]; };

/* ---------- drawing ---------- */
const PERIODS = [['30', '30 הימים האחרונים'], ['7', '7 הימים האחרונים'], ['yesterday', 'אתמול'], ['today', 'היום']];   // older on the right
function periodsTable(per) {
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : 'אין ביקורים');
  const rows = [
    ['אנשים שונים', 'כמה אנשים שונים נכנסו לאתר. אדם שנכנס כמה פעמים נספר פעם אחת.', (x) => n(x.people)],
    ['אנשים חדשים', 'אלה אנשים שנכנסו לאתר בפעם הראשונה בתקופה הזאת.', (x) => n(x.new_people)],
    ['אנשים שחזרו', 'אלה אנשים שכבר נכנסו לאתר גם לפני התקופה הזאת.', (x) => n(x.people - x.new_people)],
    ['ביקורים', 'כל כניסה לאתר נספרת כביקור. ביקור נגמר אחרי חצי שעה בלי שום פעילות.', (x) => n(x.visits)],
    ['זמן השהייה החציוני', 'חצי מהביקורים היו קצרים מהזמן הזה, וחצי מהם היו ארוכים ממנו.', (x) => (x.visits ? duration(x.median_sec) : 'אין ביקורים')],
    ['זמן שהייה ממוצע', 'מחברים את כל זמני השהייה ומחלקים במספר הביקורים.', (x) => (x.visits ? duration(x.avg_sec) : 'אין ביקורים')],
    ['ביקורים שהסתיימו מיד', 'זה אחוז הביקורים שבהם האתר נסגר בתוך דקה, בלי אף לחיצה.', (x) => (x.visits ? [pct(x.left_at_once, x.visits), h('small', { class: 'sub' }, x.left_at_once === 1 ? 'ביקור אחד' : `${n(x.left_at_once)} ביקורים`)] : 'אין ביקורים')],
  ];
  return h('div', { class: 'scroll' }, h('table', null,
    h('thead', null, h('tr', null, ...PERIODS.map(([, t]) => h('th', null, t)))),
    h('tbody', null, ...rows.flatMap(([t, sub, f]) => [
      h('tr', { class: 'metric' }, h('td', { class: 'label', colspan: String(PERIODS.length) }, t, h('small', null, sub))),
      h('tr', null, ...PERIODS.map(([k]) => h('td', { class: 'num' }, f(per[k])))),
    ]))));
}
// bars, oldest on the right and newest on the left, like the tables
function bars(series, label, every) {
  const W = 760, H = 260, top = 30, bottom = 36, max = Math.max(1, ...series.map((x) => x.v));
  const bw = W / series.length;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img');
  const el = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; svg.append(e); return e; };
  el('line', { x1: 0, x2: W, y1: H - bottom, y2: H - bottom, stroke: '#D9DEE2' });
  series.forEach((x, i) => {
    const xr = W - (i + 1) * bw, bh = ((H - top - bottom) * x.v) / max;
    if (x.v) {
      const r = el('rect', { x: xr + bw * 0.15, y: H - bottom - bh, width: bw * 0.7, height: bh, rx: 2, fill: '#0B4F8A' });
      const t = document.createElementNS(ns, 'title'); t.textContent = `${label(x.k)}: ${people(x.v)}`; r.append(t);
      if (x.v === max) el('text', { x: xr + bw / 2, y: H - bottom - bh - 6, 'text-anchor': 'middle', 'font-size': 22, fill: '#16222E' }, n(x.v));
    }
    if (i % every === Math.floor(every / 2)) el('text', { x: xr + bw / 2, y: H - 6, 'text-anchor': 'middle', 'font-size': 20, fill: '#4A5866' }, label(x.k));
  });
  return h('div', { class: 'chart' }, svg);
}
function hoursSeries(rows) {   // the last 48 hours, Israel time, with empty hours filled in
  const got = new Map(rows.map((r) => [r.k, r.people]));
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const out = [];
  for (let i = 47; i >= 0; i--) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(Date.now() - i * 3600e3)).map((x) => [x.type, x.value]));
    const k = `${p.year}-${p.month}-${p.day}T${p.hour}`;
    out.push({ k, v: got.get(k) || 0 });
  }
  return out;
}
function daysSeries(rows) {
  const got = new Map(rows.map((r) => [r.k, r.people]));
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' });
  const out = [];
  for (let i = 29; i >= 0; i--) { const k = fmt.format(new Date(Date.now() - i * 864e5)); out.push({ k, v: got.get(k) || 0 }); }
  return out;
}
function listTable(title, sub, rows, name, cols) {
  cols = cols || [['visits', 'ביקורים'], ['people', 'אנשים']];
  return h('section', null, h('h2', null, title), sub ? h('p', { class: 'note' }, sub) : null,
    rows.length ? h('div', { class: 'scroll' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, ''), ...cols.map(([, t]) => h('th', null, t)))),
      h('tbody', null, ...rows.map((r) => h('tr', null, h('td', { class: 'label' }, name(r.k)), ...cols.map(([k]) => h('td', { class: 'num' }, n(r[k]))))))))
      : h('p', { class: 'note' }, 'אין נתונים בתקופה הזאת.'));
}

/* ---------- loading ---------- */
let period = '7', timer = null, lastData = null;
async function load() {
  const key = store.get('statskey');
  if (!key) return showLogin();
  let r;
  try { r = await fetch(`${URL_STATS}?p=${period}`, { headers: { 'x-stats-key': key }, credentials: 'omit', cache: 'no-store' }); }
  catch { return showData(lastData, 'אין חיבור לשרת. הדף ינסה שוב בעוד דקה.'); }
  if (r.status === 401) { store.set('statskey', ''); return showLogin('הסיסמה לא נכונה.'); }
  if (r.status === 503) { store.set('statskey', ''); return showLogin('הסיסמה של עמוד הנתונים עוד לא נקבעה בשרת.'); }
  const j = await r.json().catch(() => null);
  if (!j || j.error) return showData(lastData, 'השרת לא הצליח לחשב את הנתונים. הדף ינסה שוב בעוד דקה.');
  store.set('me', '1');   // this device is Ilya's: his visits to the site are left out of the numbers
  lastData = j; showData(j);
}
function showLogin(msg) {
  clearInterval(timer); timer = null;
  $('#login').hidden = false; $('#data').hidden = true; $('#out').hidden = true;
  $('#err').textContent = msg || ''; $('#err').hidden = !msg;
}
function showData(j, problem) {
  if (!j) return showLogin(problem);
  $('#login').hidden = true; $('#data').hidden = false; $('#out').hidden = false;
  if (!timer) timer = setInterval(load, 60 * 1000);
  const sd = j.since ? new Date(j.since) : null;
  const since = sd ? `${sd.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })} בשעה ${sd.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : null;
  const live = j.live === 0 ? 'אף אחד לא נמצא באתר כרגע.' : `${people(j.live)} ${j.live === 1 ? 'נמצא' : 'נמצאים'} באתר כרגע.`;
  const hourLabel = (k) => `${k.slice(11, 13)}:00`;
  const dayLabel = (k) => `${+k.slice(8, 10)}.${+k.slice(5, 7)}`;
  const by = j.by;
  const pick = h('div', { class: 'row' }, ...PERIODS.map(([k, t]) => h('button', { type: 'button', 'aria-pressed': String(k === period),
    on: { click: () => { period = k; load(); } } }, t)));
  $('#data').replaceChildren(
    h('section', null, h('p', { class: 'big' }, live),
      h('p', { class: 'note' }, since ? `המונה סופר כניסות מאז ${since}. הנתונים מתעדכנים כאן בכל דקה.` : 'המונה עוד לא קיבל אף כניסה.'),
      problem ? h('p', { class: 'err' }, problem) : null),
    h('section', null, h('h2', null, 'סיכום לפי תקופות'), periodsTable(j.periods)),
    h('section', null, h('h2', null, 'אנשים שונים בכל שעה, ב-48 השעות האחרונות'), h('p', { class: 'note' }, 'השעה המוקדמת ביותר מופיעה מימין, והשעה האחרונה מופיעה משמאל.'),
      bars(hoursSeries(j.hours), hourLabel, 6)),
    h('section', null, h('h2', null, 'אנשים שונים בכל יום, ב-30 הימים האחרונים'), h('p', { class: 'note' }, 'היום המוקדם ביותר מופיע מימין, והיום הנוכחי מופיע משמאל.'),
      bars(daysSeries(j.days), dayLabel, 5)),
    h('section', null, h('h2', null, 'הטבלאות שבהמשך מציגות את התקופה שבחרת:'), pick),
    listTable('מאיפה הגיעו האנשים לאתר', 'בכל שורה מופיע האתר שבו האנשים לחצו על הקישור לאתר שלנו.', by.ref, refName),
    listTable('תגיות של קישורים שפרסמת', ['אם תפרסם קישור עם תגית, תראה כאן כמה אנשים נכנסו דרכו. קישור עם תגית נראה כך:', h('br'), h('span', { class: 'ltr' }, 'openeye.co.il/?src=facebook')], by.src, (k) => (k ? h('span', { class: 'ltr' }, k) : 'בלי תגית')),
    listTable('מדינות', null, by.country, countryName),
    listTable('ערים בישראל', 'שמות הערים מופיעים כמו שהם כתובים בטבלת כתובות הרשת, ולכן חלקם באנגלית.', by.city, (k) => (k ? h('bdi', null, k) : 'לא ידוע')),
    listTable('מכשירים', null, by.dev, (k) => DEV[k] || k || 'לא ידוע'),
    listTable('מערכות הפעלה', null, by.os, (k) => OS[k] || k || 'לא ידוע'),
    listTable('השפה שבה האתר נפתח', null, by.lang, (k) => LANG[k] || k),
    listTable('מראה המפה כשהאתר נפתח', null, by.theme, (k) => THEME[k] || k),
    listTable('פעולות באתר', 'אותה פעולה נספרת לכל היותר פעם אחת בכל 5 שניות, כדי שלחיצה כפולה לא תיספר פעמיים.', by.events, eventName, [['times', 'פעמים'], ['people', 'אנשים']]),
    listTable('קישורים ישירים שנפתחו', 'כניסות לאתר דרך קישור שמוביל ישר לפריט מסוים.', by.links, linkName),
  );
}
$('#go').addEventListener('click', () => { const v = $('#key').value.trim(); if (!v) return; store.set('statskey', v); $('#key').value = ''; load(); });
$('#key').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#go').click(); });
$('#out').addEventListener('click', () => { store.set('statskey', ''); showLogin(); });
load();
