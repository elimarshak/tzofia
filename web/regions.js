// Hebrew for the earthquake region names the seismological centre sends in English (Flinn-Engdahl style),
// e.g. "CENTRAL TURKEY", "CRETE, GREECE", "DODECANESE IS.-TURKEY BORDER REG".
// A name is translated only when every part of it is known; otherwise the caller shows the original as it came.
const PLACES = {
  TURKEY: 'טורקיה', GREECE: 'יוון', IRAN: 'איראן', IRAQ: 'עיראק', SYRIA: 'סוריה', LEBANON: 'לבנון', ISRAEL: 'ישראל',
  JORDAN: 'ירדן', EGYPT: 'מצרים', CYPRUS: 'קפריסין', ITALY: 'איטליה', ALBANIA: 'אלבניה', SPAIN: 'ספרד', PORTUGAL: 'פורטוגל',
  FRANCE: 'צרפת', MOROCCO: 'מרוקו', ALGERIA: 'אלג׳יריה', TUNISIA: 'תוניסיה', LIBYA: 'לוב', SUDAN: 'סודאן', ERITREA: 'אריתריאה',
  ETHIOPIA: 'אתיופיה', DJIBOUTI: 'ג׳יבוטי', YEMEN: 'תימן', 'SAUDI ARABIA': 'ערב הסעודית', OMAN: 'עומאן',
  'UNITED ARAB EMIRATES': 'איחוד האמירויות', QATAR: 'קטר', KUWAIT: 'כווית', BAHRAIN: 'בחריין', AFGHANISTAN: 'אפגניסטן',
  PAKISTAN: 'פקיסטן', TURKMENISTAN: 'טורקמניסטן', AZERBAIJAN: 'אזרבייג׳ן', ARMENIA: 'ארמניה', GEORGIA: 'גאורגיה',
  BULGARIA: 'בולגריה', ROMANIA: 'רומניה', SERBIA: 'סרביה', MONTENEGRO: 'מונטנגרו', 'NORTH MACEDONIA': 'מקדוניה הצפונית',
  KOSOVO: 'קוסובו', 'BOSNIA AND HERZEGOVINA': 'בוסניה והרצגובינה', CROATIA: 'קרואטיה', MALTA: 'מלטה',
  CRETE: 'כרתים', SICILY: 'סיציליה', SARDINIA: 'סרדיניה', 'DODECANESE ISLANDS': 'איי הדודקאנס', 'DODECANESE IS.': 'איי הדודקאנס',
  'MADEIRA ISLANDS': 'איי מדיירה', 'CANARY ISLANDS': 'האיים הקנריים', 'BALEARIC ISLANDS': 'האיים הבלאריים',
  'AEGEAN SEA': 'הים האגאי', 'IONIAN SEA': 'הים היוני', 'MEDITERRANEAN SEA': 'הים התיכון', 'ADRIATIC SEA': 'הים האדריאטי',
  'TYRRHENIAN SEA': 'הים הטירני', 'BLACK SEA': 'הים השחור', 'CASPIAN SEA': 'הים הכספי', 'RED SEA': 'הים האדום',
  'DEAD SEA': 'ים המלח', 'SEA OF MARMARA': 'ים מרמרה', 'ARABIAN SEA': 'הים הערבי', 'GULF OF ADEN': 'מפרץ עדן',
  'GULF OF AQABA': 'מפרץ אילת', 'GULF OF SUEZ': 'מפרץ סואץ', 'PERSIAN GULF': 'המפרץ הפרסי', 'GULF OF OMAN': 'מפרץ עומאן',
  'STRAIT OF GIBRALTAR': 'מצר גיברלטר', 'STRAIT OF HORMUZ': 'מצר הורמוז',
};
const DIRS = {
  NORTHERN: 'צפון', SOUTHERN: 'דרום', EASTERN: 'מזרח', WESTERN: 'מערב', CENTRAL: 'מרכז',
  NORTHWESTERN: 'צפון מערב', NORTHEASTERN: 'צפון מזרח', SOUTHWESTERN: 'דרום מערב', SOUTHEASTERN: 'דרום מזרח',
};
const D = Object.keys(DIRS).join('|');

function tr(s) {
  const t = s.trim();
  if (PLACES[t]) return PLACES[t];
  let m;
  if ((m = t.match(/^(.+?), (.+)$/))) { const a = tr(m[1]), b = tr(m[2]); return a && b ? `${a}, ${b}` : null; }
  if ((m = t.match(/^(.+)-(.+?) BORDER(?: REG(?:ION)?)?$/))) { const a = tr(m[1]), b = tr(m[2]); return a && b ? `אזור הגבול בין ${a} ל${b}` : null; }
  if ((m = t.match(/^(.+) REG(?:ION)?$/))) { const a = tr(m[1]); return a ? `אזור ${a}` : null; }
  if ((m = t.match(/^NEAR (?:THE )?COAST OF (.+)$/))) { const a = tr(m[1]); return a ? `סמוך לחוף ${a}` : null; }
  if ((m = t.match(/^OFF (?:THE )?COAST OF (.+)$/))) { const a = tr(m[1]); return a ? `מול חוף ${a}` : null; }
  if ((m = t.match(new RegExp(`^(${D}) AND (${D}) (.+)$`)))) { const a = tr(m[3]); return a ? `${DIRS[m[1]]} ו${DIRS[m[2]]} ${a}` : null; }
  if ((m = t.match(new RegExp(`^(${D}) (.+)$`)))) { const a = tr(m[2]); return a ? `${DIRS[m[1]]} ${a}` : null; }
  return null;
}
export const regionHe = (s) => (typeof s === 'string' && s ? tr(s.toUpperCase()) : null);
