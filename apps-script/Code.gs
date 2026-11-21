/******************************************************************
 *  PERSONĀLA PIETEIKUMI
 *  Darbinieku pieņemšana darbā + atvaļinājumi ar kalendāru
 *  Google Sheets + Apps Script web app
 *
 *  1) Ielīmē šo Code.gs un failu Index.html
 *  2) Palaid funkciju setup() vienu reizi
 *  3) Lapā "Lietotāji" nomaini admina PIN un pievieno darbu vadītājus
 *  4) Deploy → New deployment → Web app
 ******************************************************************/

const SH = {
  HIRE: 'Pieņemšana',
  VAC: 'Atvaļinājumi',
  USERS: 'Lietotāji',
  LISTS: 'Saraksti',
  SET: 'Iestatījumi'
};

const HIRE_HEADERS = [
  'ID', 'Iesniegts', 'Iesniedza',
  'Vārds, Uzvārds', 'Personas kods', 'Deklarētā adrese', 'Telefons', 'E-pasts',
  'Invaliditāte', 'Pensionārs', 'Veselības pārbaude',
  'SIA', 'Objekts', 'Amats', 'Sāk strādāt',
  'Alga (EUR)', 'Banka', 'IBAN',
  'Piezīmes', 'Statuss', 'Admina komentārs', 'Kalendāra notikums',
  'Begin Time'  // jaunas kolonnas vienmēr beigās, lai esošie dati nesajūk
];
const BEGIN_TIME = ['Kodu kalkulators', 'Aplikācija viedtālrunī'];

const VAC_HEADERS = [
  'ID', 'Iesniegts', 'Iesniedza',
  'Darbinieks', 'SIA', 'Objekts', 'Amats', 'Veids',
  'No', 'Līdz', 'Kalendārās dienas', 'Darba dienas', 'Aizvietotājs',
  'Piezīmes', 'Statuss', 'Admina komentārs', 'Kalendāra notikums'
];

const STATUSES = ['Jauns', 'Apstrādē', 'Apstiprināts', 'Noraidīts'];
const INVAL = ['NĒ', '1. grupa', '2. grupa', '3. grupa'];
const OBJ_SEP = '; '; // vairāku objektu atdalītājs (komats nederēs: "Turaidas 4,6,8")

const AM_SEP = ' — '; // objekts — amati

function splitObj_(v) {
  return String(v || '').split(';').map(s => s.trim()).filter(Boolean);
}
/** "Turaidas 10 — Apkopēja, Sētnieks — 600 EUR" → { name, amati: [...], alga: 600 } */
function objPair_(entry) {
  const parts = String(entry).split('—').map(x => x.trim());
  const name = parts.shift() || '';
  let alga = null;
  const last = parts[parts.length - 1];
  if (last && /^\d+([.,]\d+)?\s*(EUR|€)?$/i.test(last)) { alga = Number(last.replace(/[^\d.,]/g, '').replace(',', '.')); parts.pop(); }
  const amati = (parts[0] || '').split(',').map(a => a.trim()).filter(Boolean);
  return { name, amati, alga };
}
function objNames_(v) { return splitObj_(v).map(e => objPair_(e).name).filter(Boolean); }
function objAmati_(v) {
  const out = [];
  splitObj_(v).forEach(e => objPair_(e).amati.forEach(a => { if (out.indexOf(a) < 0) out.push(a); }));
  return out;
}
/** Objektu saraksts bez algām (lai alga nenonāk pie citiem lietotājiem). */
function noAlga_(v) { return splitObj_(v).map(e => objEntry_(objPair_(e), false)).join(OBJ_SEP); }
function objAlgaSum_(v) {
  return Math.round(splitObj_(v).reduce((s, e) => s + (objPair_(e).alga || 0), 0) * 100) / 100;
}
function eur_(n) { return (Math.round(n * 100) / 100).toString().replace('.', ',') + ' EUR'; }
function objEntry_(o, withAlga) {
  let s = o.name;
  if (o.amati.length) s += AM_SEP + o.amati.join(', ');
  if (withAlga && o.alga != null) s += AM_SEP + String(o.alga).replace('.', ',') + ' EUR';
  return s;
}
/** Pārbauda un sakārto objektu sarakstu.
 *  hire = true: katram objektam jābūt vismaz vienam amatam un algai. */
function parseObj_(v, hire) {
  const byName = {}, order = [];
  splitObj_(v).forEach(e => {
    const p = objPair_(e);
    const name = p.name.replace(/[;—]/g, ',').trim();
    if (!name) return;
    const k = name.toLowerCase();
    if (!byName[k]) { byName[k] = { name, amati: [], alga: null }; order.push(k); }
    p.amati.forEach(a => { a = a.replace(/[;—,]/g, ' ').trim(); if (a && byName[k].amati.indexOf(a) < 0) byName[k].amati.push(a); });
    if (p.alga != null) byName[k].alga = (byName[k].alga || 0) + p.alga;
  });
  if (!order.length) throw new Error('Pievienojiet vismaz vienu objektu.');
  if (hire) {
    const noAm = order.filter(k => !byName[k].amati.length).map(k => byName[k].name);
    if (noAm.length) throw new Error('Izvēlieties amatu objektam: ' + noAm.join(', '));
    const noAlga = order.filter(k => !(byName[k].alga > 0)).map(k => byName[k].name);
    if (noAlga.length) throw new Error('Norādiet algu objektam: ' + noAlga.join(', '));
  }
  return order.map(k => objEntry_(byName[k], hire)).join(OBJ_SEP);
}

/* ======================= WEB APP ======================= */

function doGet() {
  // Vecā lietotne (fails Index) vēl strādā, ja tāds ir projektā; citādi — API statuss
  try {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Personāla pieteikumi')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (e) {
    return json_({ ok: true, app: 'SH | Personāls', time: new Date().toISOString() });
  }
}

/* ======================= JSON API (GitHub lietotnei) ======================= */
/* Tāpat kā Aizvietošanā: POST {action, pin, ...} → {ok:true, ...} vai {ok:false, error} */

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'Nederīgs pieprasījums' }); }
  try {
    const user = pinUser_(req.pin, req.login);
    if (!user) { Utilities.sleep(600); return json_({ ok: false, error: 'Nepareizs PIN' }); }
    const fn = API[req.action];
    if (!fn) return json_({ ok: false, error: 'Nezināma darbība' });
    return json_(Object.assign({ ok: true }, fn(user, req) || {}));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err).replace(/^Error:\s*/, '') });
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Lietotājs pēc vārda + PIN (lapa Lietotāji). */
function pinUser_(pin, login) {
  pin = String(pin || '').trim();
  login = String(login || '').trim().toLowerCase();
  if (!pin) return null;
  const cu = centralUser_(pin, 'pers');
  if (cu.known) return cu.role ? { name: cu.name, role: cu.role === 'admin' ? 'admin' : 'vaditajs' } : null;
  const rows = sheet_(SH.USERS).getDataRange().getDisplayValues().slice(1);
  // Ja norādīts lietotājs — jāsakrīt vārdam un PIN; citādi pietiek ar PIN
  const u = rows.find(r => r[0].trim() && r[1].trim() === pin && r[3].trim().toUpperCase() !== 'NĒ' &&
    (!login || r[0].trim().toLowerCase() === login));
  return u ? { name: u[0].trim(), role: u[2].trim().toLowerCase() === 'admin' ? 'admin' : 'vaditajs' } : null;
}

const API = {
  login: (u) => ({ user: u, meta: getInit(u) }),
  hire: (u, r) => submitHire(u, r.form || {}),
  vacation: (u, r) => submitVacation(u, r.form || {}),
  days: (u, r) => ({ days: previewDays(u, r.no, r.lidz) }),
  records: (u) => {
    const conv = t => { const x = getRecords(u, t); return x.rows.map(row => { const o = {}; x.headers.forEach((h, i) => o[h] = row[i]); return o; }); };
    return { hire: conv('hire'), vac: conv('vac') };
  },
  status: (u, r) => { setStatus(u, r.type, r.id, r.status, r.comment); return {}; },
  calendar: (u, r) => getCalendarRange(u, r.from, r.to)
};

/* ======================= SETUP ======================= */

function setup() {
  const ss = SpreadsheetApp.getActive();

  const hire = ensureSheet_(ss, SH.HIRE, HIRE_HEADERS);
  addMissingHeaders_(hire, HIRE_HEADERS);
  ['E:E', 'G:G', 'R:R'].forEach(r => hire.getRange(r).setNumberFormat('@')); // personas kods, tālrunis, IBAN kā teksts
  hire.getRange('O:O').setNumberFormat('dd.mm.yyyy');
  hire.getRange('B:B').setNumberFormat('dd.mm.yyyy hh:mm');

  const vac = ensureSheet_(ss, SH.VAC, VAC_HEADERS);
  vac.getRange('I:J').setNumberFormat('dd.mm.yyyy');
  vac.getRange('B:B').setNumberFormat('dd.mm.yyyy hh:mm');

  const users = ensureSheet_(ss, SH.USERS, ['Vārds', 'PIN', 'Loma (admin / vaditajs)', 'Aktīvs (JĀ / NĒ)']);
  users.getRange('B:B').setNumberFormat('@');
  if (users.getLastRow() < 2) {
    users.getRange(2, 1, 2, 4).setValues([
      ['Administrators', '1234', 'admin', 'JĀ'],
      ['Darbu vadītājs', '1111', 'vaditajs', 'JĀ']
    ]);
  }

  const lists = ensureSheet_(ss, SH.LISTS, ['SIA', 'Banka', 'Atvaļinājuma veids', 'Amats', 'Objekts']);
  if (lists.getLastRow() < 2) {
    const cols = [
      ['SH CLEANING', 'SELECTUM HOME'],
      ['Citadele', 'Swedbank', 'SEB', 'Luminor', 'LHV', 'Revolut', 'Cita'],
      ['Ikgadējais apmaksātais', 'Bezalgas', 'Mācību', 'Papildatvaļinājums', 'Paternitātes', 'Bērna kopšanas'],
      ['Apkopēja', 'Sētnieks', 'Teritorijas kopējs', 'Tehniķis'],
      []
    ];
    const max = Math.max(...cols.map(c => c.length));
    const grid = [];
    for (let i = 0; i < max; i++) grid.push(cols.map(c => c[i] || ''));
    lists.getRange(2, 1, max, cols.length).setValues(grid);
  }
  // Tālruņa kodu kolonna (pievieno arī jau esošai tabulai)
  const lh = lists.getRange(1, 1, 1, lists.getLastColumn()).getDisplayValues()[0];
  if (lh.indexOf('Tālruņa kods') < 0) {
    const c = lh.filter(String).length + 1;
    lists.getRange(1, c).setValue('Tālruņa kods')
      .setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
    lists.getRange(2, c, 1000, 1).setNumberFormat('@');
    const codes = ['+371 Latvija', '+370 Lietuva', '+372 Igaunija', '+48 Polija', '+380 Ukraina', '+375 Baltkrievija', '+7 Krievija', '+49 Vācija', '+44 Lielbritānija'];
    lists.getRange(2, c, codes.length, 1).setValues(codes.map(v => [v]));
    lists.autoResizeColumn(c);
  }

  const set = ensureSheet_(ss, SH.SET, ['Iestatījums', 'Vērtība', 'Paskaidrojums']);
  const want = [
    ['ADMIN_EMAIL', '', 'Saņem VISUS jaunos pieteikumus. Vairākas adreses atdala ar komatu. Tukšs = nesūtīt'],
    ['EMAIL_PIENEMSANA', '', 'Papildu saņēmēji tikai pieņemšanai darbā (piem. grāmatvedība, personāldaļa)'],
    ['EMAIL_ATVALINAJUMI', '', 'Papildu saņēmēji tikai atvaļinājumiem'],
    ['PILNI_DATI_EPASTA', 'NĒ', 'JĀ = e-pastā arī personas kods, adrese un IBAN. NĒ = tie redzami tikai tabulā'],
    ['ZINOT_VADITAJAM', 'JĀ', 'JĀ = darbu vadītājs saņem e-pastu, kad mainās pieteikuma statuss (adrese lapā Lietotāji)'],
    ['CALENDAR_ID', '', 'Google kalendāra ID apstiprinātajiem ierakstiem (tukšs = neizmantot)'],
    ['WEB_APP_URL', '', 'Lietotnes saite e-pasta pogai (tukšs = https://vaitkevix.github.io/personals/)']
  ];
  const have = set.getDataRange().getDisplayValues().map(r => String(r[0]).trim());
  want.filter(w => have.indexOf(w[0]) < 0).forEach(w => set.appendRow(w));

  // Lietotāju e-pasti
  const uh = users.getRange(1, 1, 1, users.getLastColumn()).getDisplayValues()[0];
  if (uh.indexOf('E-pasts') < 0) {
    users.getRange(1, 5).setValue('E-pasts')
      .setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
  }

  // Statusa izvēlne tabulā
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build();
  hire.getRange(2, HIRE_HEADERS.indexOf('Statuss') + 1, 1000, 1).setDataValidation(rule);
  vac.getRange(2, VAC_HEADERS.indexOf('Statuss') + 1, 1000, 1).setDataValidation(rule);

  [hire, vac, users, lists, set].forEach(s => s.autoResizeColumns(1, s.getLastColumn()));
}

/** Pievieno trūkstošās kolonnas (piem. jaunas funkcijas) esošas lapas beigās. */
function addMissingHeaders_(sh, headers) {
  const have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getDisplayValues()[0];
  headers.forEach((h, i) => {
    if (have[i] !== h && have.indexOf(h) < 0 && !have[i]) {
      sh.getRange(1, i + 1).setValue(h).setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
    }
  });
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ======================= PALĪGFUNKCIJAS ======================= */

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Nav atrasta lapa "' + name + '". Palaidiet setup().');
  return sh;
}

function setting_(key) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.SET);
  if (!sh) return '';
  const rows = sh.getDataRange().getDisplayValues();
  for (const r of rows) if (String(r[0]).trim() === key) return String(r[1]).trim();
  return '';
}

function tz_() { return Session.getScriptTimeZone() || 'Europe/Riga'; }

function fmt_(d, pattern) {
  return d instanceof Date && !isNaN(d) ? Utilities.formatDate(d, tz_(), pattern || 'yyyy-MM-dd') : '';
}

function parseDate_(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('Nepareizs datums.');
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

function toDate_(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const m = String(v || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}

function nextId_(prefix) {
  const p = PropertiesService.getScriptProperties();
  const k = 'seq_' + prefix;
  const n = Number(p.getProperty(k) || 0) + 1;
  p.setProperty(k, String(n));
  return prefix + '-' + String(n).padStart(4, '0');
}

function col_(headers, name) { return headers.indexOf(name); }

/** Teksts, ko Sheets nedrīkst pārvērst par formulu vai skaitli (+371..., =..., 0...). */
function txt_(v) {
  const s = String(v == null ? '' : v);
  return /^[+=\-@]/.test(s) || /^0\d/.test(s) ? "'" + s : s;
}

/** Datumu formāts tikko pievienotajai rindai — neatkarīgi no tabulas valodas. */
function formatRow_(sh, headers, formats) {
  const r = sh.getLastRow();
  Object.keys(formats).forEach(h => {
    const c = headers.indexOf(h);
    if (c >= 0) sh.getRange(r, c + 1).setNumberFormat(formats[h]);
  });
}

/* ---------- Validācija ---------- */

function normPK_(pk) {
  const d = String(pk || '').replace(/\D/g, '');
  if (d.length !== 11) throw new Error('Personas kodam jābūt 11 cipariem (piem. 010190-12345).');
  if (!d.startsWith('32')) { // vecā formāta kodiem pārbauda kontrolciparu
    const w = [1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    let s = 0;
    for (let i = 0; i < 10; i++) s += +d[i] * w[i];
    if ((1101 - s) % 11 !== +d[10]) throw new Error('Personas kods nav derīgs — pārbaudiet ciparus.');
  }
  return d.slice(0, 6) + '-' + d.slice(6);
}

function normIBAN_(v) {
  const s = String(v || '').replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) throw new Error('Nepareizs IBAN formāts.');
  if (s.startsWith('LV') && s.length !== 21) throw new Error('Latvijas IBAN jābūt 21 simbolam (LV00XXXX0000000000000).');
  const r = s.slice(4) + s.slice(0, 4);
  let m = 0;
  for (const ch of r) {
    const part = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const dg of part) m = (m * 10 + +dg) % 97;
  }
  if (m !== 1) throw new Error('IBAN kontrolsumma nesakrīt — pārbaudiet numuru.');
  return s;
}

function normPhone_(kods, nr) {
  const k = (String(kods || '').match(/\+\d{1,4}/) || [''])[0];
  if (!k) throw new Error('Izvēlieties valsts kodu.');
  let n = String(nr || '').replace(/[\s\-()]/g, '');
  if (n.startsWith(k)) n = n.slice(k.length);            // ja ievadīts ar kodu
  else if (n.startsWith('00' + k.slice(1))) n = n.slice(k.length + 1);
  if (!/^\d{6,12}$/.test(n)) throw new Error('Nepareizs telefona numurs.');
  if (k === '+371' && n.length !== 8) throw new Error('Latvijas numuram jābūt 8 cipariem.');
  return k + ' ' + n;
}

/* ---------- Latvijas svētku dienas un darba dienas ---------- */

function easter_(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

function dkey_(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

function lvHolidays_(y) {
  const set = new Set();
  [[1, 1], [5, 1], [6, 23], [6, 24], [12, 24], [12, 25], [12, 26], [12, 31]]
    .forEach(([m, d]) => set.add(dkey_(new Date(y, m - 1, d))));
  // 4. maijs un 18. novembris — ja brīvdienā, pārceļ uz pirmdienu
  [[5, 4], [11, 18]].forEach(([m, d]) => {
    const dt = new Date(y, m - 1, d);
    if (dt.getDay() === 6) dt.setDate(dt.getDate() + 2);
    else if (dt.getDay() === 0) dt.setDate(dt.getDate() + 1);
    set.add(dkey_(dt));
  });
  const e = easter_(y);
  set.add(dkey_(new Date(y, e.getMonth(), e.getDate() - 2))); // Lielā Piektdiena
  set.add(dkey_(new Date(y, e.getMonth(), e.getDate() + 1))); // Otrās Lieldienas
  return set;
}

function countDays_(from, to) {
  const hol = {};
  let cal = 0, work = 0;
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    cal++;
    const y = d.getFullYear();
    if (!hol[y]) hol[y] = lvHolidays_(y);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6 && !hol[y].has(dkey_(d))) work++;
  }
  return { cal, work };
}

/* ======================= PIETEIKŠANĀS ======================= */

function getUserNames() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.USERS);
  if (!sh) return [];
  return sh.getDataRange().getDisplayValues().slice(1)
    .filter(r => r[0].trim() && r[3].trim().toUpperCase() !== 'NĒ')
    .map(r => r[0].trim());
}

function login(name, pin) {
  const rows = sheet_(SH.USERS).getDataRange().getDisplayValues().slice(1);
  const n = String(name || '').trim().toLowerCase();
  const u = rows.find(r =>
    r[0].trim().toLowerCase() === n &&
    r[1].trim() === String(pin || '').trim() &&
    r[3].trim().toUpperCase() !== 'NĒ');
  if (!u) {
    Utilities.sleep(800);
    throw new Error('Nepareizs vārds vai PIN.');
  }
  const user = { name: u[0].trim(), role: u[2].trim().toLowerCase() === 'admin' ? 'admin' : 'vaditajs' };
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('t_' + token, JSON.stringify(user), 21600); // 6 h
  return { token, user };
}

function logout(token) {
  if (token) CacheService.getScriptCache().remove('t_' + token);
  return true;
}

function auth_(token) {
  if (token && typeof token === 'object' && token.name) return token;   // JSON API jau pārbaudīja PIN
  const c = token && CacheService.getScriptCache().get('t_' + token);
  if (!c) throw new Error('SESIJA_BEIGUSIES');
  return JSON.parse(c);
}

/* ======================= SĀKUMA DATI ======================= */

function getInit(token) {
  const user = auth_(token);
  const lv = sheet_(SH.LISTS).getDataRange().getDisplayValues();
  const lhead = lv[0].map(h => String(h).trim());
  const ML = masterLists_();   // pamatdati no SH portāla (ja pieejami)
  const MK = { 'SIA': 'sia', 'Banka': 'bankas', 'Atvaļinājuma veids': 'veidi', 'Amats': 'amati', 'Tālruņa kods': 'kodi', 'Objekts': 'objekti' };
  const colVals = name => {
    if (ML && MK[name] && (ML[MK[name]] || []).length) return ML[MK[name]].slice();
    const i = typeof name === 'number' ? name : lhead.indexOf(name);
    return i < 0 ? [] : lv.slice(1).map(r => String(r[i] || '').trim()).filter(Boolean);
  };

  // darbinieku saraksts atvaļinājuma formai (tikai vārds + darbavieta)
  const employees = {};
  const objekti = new Set(colVals('Objekts'));
  const h = sheet_(SH.HIRE).getDataRange().getDisplayValues().slice(1);
  h.forEach(r => {
    const name = r[col_(HIRE_HEADERS, 'Vārds, Uzvārds')];
    if (r[col_(HIRE_HEADERS, 'Statuss')] === 'Noraidīts' || !name) return;
    employees[name.toLowerCase()] = {
      name, sia: r[col_(HIRE_HEADERS, 'SIA')], objekts: noAlga_(r[col_(HIRE_HEADERS, 'Objekts')]), amats: r[col_(HIRE_HEADERS, 'Amats')]
    };
    objNames_(r[col_(HIRE_HEADERS, 'Objekts')]).forEach(o => objekti.add(o));
  });
  sheet_(SH.VAC).getDataRange().getDisplayValues().slice(1).forEach(r => {
    const name = r[col_(VAC_HEADERS, 'Darbinieks')];
    if (name && !employees[name.toLowerCase()]) {
      employees[name.toLowerCase()] = {
        name, sia: r[col_(VAC_HEADERS, 'SIA')], objekts: r[col_(VAC_HEADERS, 'Objekts')], amats: r[col_(VAC_HEADERS, 'Amats')]
      };
    }
    objNames_(r[col_(VAC_HEADERS, 'Objekts')]).forEach(o => objekti.add(o));
  });

  return {
    user,
    statuses: STATUSES,
    inval: INVAL,
    lists: {
      sia: colVals('SIA'), bankas: colVals('Banka'), veidi: colVals('Atvaļinājuma veids'), amati: colVals('Amats'),
      kodi: colVals('Tālruņa kods'),
      objekti: [...objekti].sort((a, b) => a.localeCompare(b, 'lv'))
    },
    employees: Object.values(employees).sort((a, b) => a.name.localeCompare(b.name, 'lv'))
  };
}

/* ======================= PIEŅEMŠANA DARBĀ ======================= */

function submitHire(token, f) {
  const user = auth_(token);
  const req = (k, label) => {
    const v = String(f[k] || '').trim();
    if (!v) throw new Error('Aizpildiet lauku: ' + label);
    return v;
  };

  const vards = req('vards', 'Vārds, Uzvārds');
  const pk = normPK_(req('pk', 'Personas kods'));
  const adrese = req('adrese', 'Deklarētā adrese');
  const tel = normPhone_(f.telKods, req('tel', 'Telefona numurs'));
  const epasts = String(f.epasts || '').trim();
  if (epasts && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(epasts)) throw new Error('Nepareiza e-pasta adrese.');
  const inval = INVAL.indexOf(f.inval) >= 0 ? f.inval : 'NĒ';
  const pens = f.pens === 'JĀ' ? 'JĀ' : 'NĒ';
  const vesel = f.vesel === 'IR' ? 'IR' : 'NAV';
  const bt = BEGIN_TIME.indexOf(f.begintime) >= 0 ? f.begintime : '';
  if (!bt) throw new Error('Izvēlieties Begin Time: kodu kalkulators vai aplikācija viedtālrunī.');
  const sia = req('sia', 'SIA');
  const objekts = parseObj_(f.objekts, true);
  const amats = objAmati_(objekts).join(', ');
  const sakums = parseDate_(req('sakums', 'Datums, ar kuru sāk strādāt'));
  const alga = objAlgaSum_(objekts);
  const banka = req('banka', 'Banka');
  const iban = normIBAN_(req('iban', 'IBAN'));
  const piez = String(f.piezimes || '').trim();

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let id;
  try {
    const sh = sheet_(SH.HIRE);
    const rows = sh.getDataRange().getValues().slice(1);
    const dup = rows.find(r => {
      const d = toDate_(r[col_(HIRE_HEADERS, 'Sāk strādāt')]);
      return String(r[col_(HIRE_HEADERS, 'Personas kods')]) === pk &&
        r[col_(HIRE_HEADERS, 'Statuss')] !== 'Noraidīts' && d && d.getTime() === sakums.getTime();
    });
    if (dup) throw new Error('Šis darbinieks ar šo datumu jau ir pieteikts (' + dup[0] + ').');

    id = nextId_('P');
    sh.appendRow([
      id, new Date(), user.name,
      txt_(vards), txt_(pk), txt_(adrese), txt_(tel), txt_(epasts),
      inval, pens, vesel,
      sia, txt_(objekts), txt_(amats), sakums,
      alga, banka, txt_(iban),
      txt_(piez), 'Jauns', '', '',
      bt
    ]);
    formatRow_(sh, HIRE_HEADERS, { 'Iesniegts': 'dd.mm.yyyy hh:mm', 'Sāk strādāt': 'dd.mm.yyyy' });
  } finally {
    lock.releaseLock();
  }

  const mailErr = mailHire_({
    id, by: user.name, vards, pk, adrese, tel, epasts, inval, pens, vesel,
    sia, objekts, amats, sakums: fmt_(sakums, 'dd.MM.yyyy'), alga, banka, iban, piez, bt
  });

  return { id, mailErr };
}

/* ======================= ATVAĻINĀJUMI ======================= */

function previewDays(token, no, lidz) {
  auth_(token);
  const a = parseDate_(no), b = parseDate_(lidz);
  if (b < a) return null;
  return countDays_(a, b);
}

function submitVacation(token, f) {
  const user = auth_(token);
  const req = (k, label) => {
    const v = String(f[k] || '').trim();
    if (!v) throw new Error('Aizpildiet lauku: ' + label);
    return v;
  };

  const darb = req('darbinieks', 'Darbinieks');
  const sia = req('sia', 'SIA');
  const objekts = parseObj_(f.objekts, false);
  const myObj = objNames_(objekts).map(o => o.toLowerCase());
  const amats = objAmati_(objekts).join(', ');
  const veids = req('veids', 'Atvaļinājuma veids');
  const no = parseDate_(req('no', 'No'));
  const lidz = parseDate_(req('lidz', 'Līdz'));
  if (lidz < no) throw new Error('Datums "Līdz" nevar būt agrāks par "No".');
  const aizv = String(f.aizvietotajs || '').trim();
  const piez = String(f.piezimes || '').trim();
  const days = countDays_(no, lidz);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let id;
  const warnings = [];
  try {
    const sh = sheet_(SH.VAC);
    const rows = sh.getDataRange().getValues().slice(1);
    rows.forEach(r => {
      if (r[col_(VAC_HEADERS, 'Statuss')] === 'Noraidīts') return;
      const a = toDate_(r[col_(VAC_HEADERS, 'No')]), b = toDate_(r[col_(VAC_HEADERS, 'Līdz')]);
      if (!a || !b || a > lidz || b < no) return;
      const name = String(r[col_(VAC_HEADERS, 'Darbinieks')]);
      const range = fmt_(a, 'dd.MM') + '–' + fmt_(b, 'dd.MM.yyyy');
      if (name.trim().toLowerCase() === darb.toLowerCase()) {
        throw new Error(darb + ' jau ir atvaļinājums šajā periodā (' + range + ', ' + r[0] + ').');
      }
      const common = objNames_(r[col_(VAC_HEADERS, 'Objekts')]).filter(o => myObj.indexOf(o.toLowerCase()) >= 0);
      if (common.length) {
        warnings.push(name + ' (' + common.join(', ') + ') arī būs atvaļinājumā ' + range);
      }
    });

    id = nextId_('A');
    sh.appendRow([
      id, new Date(), user.name,
      txt_(darb), sia, txt_(objekts), txt_(amats), veids,
      no, lidz, days.cal, days.work, txt_(aizv),
      txt_(piez), 'Jauns', '', ''
    ]);
    formatRow_(sh, VAC_HEADERS, { 'Iesniegts': 'dd.mm.yyyy hh:mm', 'No': 'dd.mm.yyyy', 'Līdz': 'dd.mm.yyyy' });
  } finally {
    lock.releaseLock();
  }

  const mailErr = mailVacation_({
    id, by: user.name, darb, sia, objekts, amats, veids,
    no: fmt_(no, 'dd.MM.yyyy'), lidz: fmt_(lidz, 'dd.MM.yyyy'),
    cal: days.cal, work: days.work, aizv, piez, warnings
  });

  return { id, days, warnings, mailErr };
}

/* ======================= SARAKSTS UN STATUSI ======================= */

function getRecords(token, type) {
  const user = auth_(token);
  const isHire = type === 'hire';
  const headers = isHire ? HIRE_HEADERS : VAC_HEADERS;
  const sh = sheet_(isHire ? SH.HIRE : SH.VAC);
  let rows = sh.getDataRange().getValues().slice(1).filter(r => r[0]).map(r => r.map((v, i) => {
    if (v instanceof Date) return fmt_(v, headers[i] === 'Iesniegts' ? 'dd.MM.yyyy HH:mm' : 'dd.MM.yyyy');
    return String(v);
  }));
  if (user.role !== 'admin') rows = rows.filter(r => r[2] === user.name);
  rows.reverse();
  return { headers, rows: rows.slice(0, 400) };
}

function setStatus(token, type, id, status, comment) {
  const user = auth_(token);
  if (user.role !== 'admin') throw new Error('Statusu var mainīt tikai administrators.');
  if (STATUSES.indexOf(status) < 0) throw new Error('Nezināms statuss.');

  const isHire = type === 'hire';
  const headers = isHire ? HIRE_HEADERS : VAC_HEADERS;
  const sh = sheet_(isHire ? SH.HIRE : SH.VAC);
  const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getDisplayValues().map(r => r[0]);
  const i = ids.indexOf(id);
  if (i < 0) throw new Error('Ieraksts nav atrasts.');
  const rowNum = i + 2;
  const row = sh.getRange(rowNum, 1, 1, headers.length).getValues()[0];

  sh.getRange(rowNum, col_(headers, 'Statuss') + 1).setValue(status);
  sh.getRange(rowNum, col_(headers, 'Admina komentārs') + 1).setValue(String(comment || '').trim());

  // Paziņojums darbu vadītājam, ja statuss tiešām mainījies
  const oldStatus = String(row[col_(headers, 'Statuss')]);
  if (oldStatus !== status && yes_('ZINOT_VADITAJAM', 'JĀ')) {
    const to = userEmail_(row[2]);
    const name = row[col_(headers, isHire ? 'Vārds, Uzvārds' : 'Darbinieks')];
    if (to) mailStatus_(to, type, id, name, status, String(comment || '').trim());
  }

  // Google kalendārs (ja iestatīts)
  const calId = setting_('CALENDAR_ID');
  const evCol = col_(headers, 'Kalendāra notikums') + 1;
  const evId = String(row[evCol - 1] || '');
  if (calId) {
    const cal = CalendarApp.getCalendarById(calId);
    if (!cal) throw new Error('Nav piekļuves kalendāram ' + calId);
    if (status === 'Apstiprināts' && !evId) {
      let ev;
      if (isHire) {
        const d = toDate_(row[col_(headers, 'Sāk strādāt')]);
        ev = cal.createAllDayEvent('Sāk darbu: ' + row[col_(headers, 'Vārds, Uzvārds')], d, {
          description: row[col_(headers, 'SIA')] + ' · ' + row[col_(headers, 'Objekts')] + ' · ' + row[col_(headers, 'Amats')]
        });
      } else {
        const a = toDate_(row[col_(headers, 'No')]), b = toDate_(row[col_(headers, 'Līdz')]);
        const end = new Date(b); end.setDate(end.getDate() + 1);
        const aizv = row[col_(headers, 'Aizvietotājs')];
        ev = cal.createAllDayEvent('Atvaļinājums: ' + row[col_(headers, 'Darbinieks')], a, end, {
          description: row[col_(headers, 'Veids')] + '\nObjekts: ' + row[col_(headers, 'Objekts')] +
            (aizv ? '\nAizvietotājs: ' + aizv : '')
        });
      }
      sh.getRange(rowNum, evCol).setValue(ev.getId());
    } else if (status !== 'Apstiprināts' && evId) {
      const ev = cal.getEventById(evId);
      if (ev) ev.deleteEvent();
      sh.getRange(rowNum, evCol).setValue('');
    }
  }
  return true;
}

/* ======================= KALENDĀRS ======================= */

function getCalendar(token, year, month) {
  return getCalendarRange(token, fmt_(new Date(year, month - 1, 1)), fmt_(new Date(year, month, 0)));
}

/** Kalendāra dati jebkuram periodam (nedēļa / mēnesis / gads). Datumi 'yyyy-MM-dd'. */
function getCalendarRange(token, fromStr, toStr) {
  auth_(token);
  const from = parseDate_(fromStr);
  const to = parseDate_(toStr);
  if (to < from) throw new Error('Nepareizs periods.');
  if ((to - from) / 864e5 > 400) throw new Error('Periods par garu.');
  const events = [];

  sheet_(SH.VAC).getDataRange().getValues().slice(1).forEach(r => {
    const st = r[col_(VAC_HEADERS, 'Statuss')];
    if (!r[0] || st === 'Noraidīts') return;
    const a = toDate_(r[col_(VAC_HEADERS, 'No')]), b = toDate_(r[col_(VAC_HEADERS, 'Līdz')]);
    if (!a || !b || a > to || b < from) return;
    events.push({
      type: 'vac', id: r[0], name: r[col_(VAC_HEADERS, 'Darbinieks')],
      sia: r[col_(VAC_HEADERS, 'SIA')], objekts: r[col_(VAC_HEADERS, 'Objekts')],
      amats: r[col_(VAC_HEADERS, 'Amats')], veids: r[col_(VAC_HEADERS, 'Veids')],
      no: fmt_(a), lidz: fmt_(b), work: r[col_(VAC_HEADERS, 'Darba dienas')],
      aizv: r[col_(VAC_HEADERS, 'Aizvietotājs')], status: st, by: r[2]
    });
  });

  sheet_(SH.HIRE).getDataRange().getValues().slice(1).forEach(r => {
    const st = r[col_(HIRE_HEADERS, 'Statuss')];
    if (!r[0] || st === 'Noraidīts') return;
    const d = toDate_(r[col_(HIRE_HEADERS, 'Sāk strādāt')]);
    if (!d || d < from || d > to) return;
    events.push({
      type: 'hire', id: r[0], name: r[col_(HIRE_HEADERS, 'Vārds, Uzvārds')],
      sia: r[col_(HIRE_HEADERS, 'SIA')], objekts: noAlga_(r[col_(HIRE_HEADERS, 'Objekts')]),
      amats: r[col_(HIRE_HEADERS, 'Amats')], no: fmt_(d), lidz: fmt_(d), status: st, by: r[2]
    });
  });

  const hol = {};
  const holidays = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    if (!hol[y]) hol[y] = lvHolidays_(y);
    if (hol[y].has(dkey_(d))) holidays.push(fmt_(d));
  }

  return { events, holidays };
}

/* ======================= E-PASTA PAZIŅOJUMI ======================= */

function recipients_(type) {
  const list = [setting_('ADMIN_EMAIL'), setting_(type === 'hire' ? 'EMAIL_PIENEMSANA' : 'EMAIL_ATVALINAJUMI')]
    .join(',').split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(s => /@/.test(s));
  return [...new Set(list)].join(',');
}

function userEmail_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.USERS);
  if (!sh) return '';
  const rows = sh.getDataRange().getDisplayValues();
  const ci = rows[0].map(h => String(h).trim()).indexOf('E-pasts');
  if (ci < 0) return '';
  const r = rows.slice(1).find(x => x[0].trim().toLowerCase() === String(name).trim().toLowerCase());
  return r && /@/.test(r[ci]) ? r[ci].trim() : '';
}

function yes_(key, def) {
  const v = (setting_(key) || def).toUpperCase();
  return v === 'JĀ' || v === 'JA' || v === 'YES';
}

function webAppUrl_() {
  const own = setting_('WEB_APP_URL');
  if (/^https:\/\/\S+$/.test(own)) return own;
  return 'https://vaitkevix.github.io/personals/';   // SH | Personāls lietotne
}

/**
 * sections: [{ title: 'DARBINIEKS', rows: [['Vārds', 'Jānis'], ...] }]
 */
function sendMail_(to, subject, heading, sub, sections, note, accent, recId) {
  if (!to) return 'nav norādīts saņēmējs (lapa Iestatījumi → ADMIN_EMAIL, kolonna B)';
  const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const color = accent || '#1f3a5f';
  const base = webAppUrl_();
  const url = recId ? base + (base.indexOf('?') < 0 ? '?' : '&') + 'id=' + encodeURIComponent(recId) : base;

  let html = '<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f9;padding:24px 12px">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e3e7ee">' +
    '<div style="background:' + color + ';color:#fff;padding:18px 22px">' +
    '<div style="font-size:12px;letter-spacing:.08em;opacity:.8;text-transform:uppercase">Personāla pieteikumi</div>' +
    '<div style="font-size:20px;font-weight:bold;margin-top:4px">' + e(heading) + '</div>' +
    (sub ? '<div style="font-size:14px;opacity:.9;margin-top:4px">' + e(sub) + '</div>' : '') + '</div>' +
    '<div style="padding:8px 22px 20px">';
  if (note) html += '<div style="background:#fdf3d8;color:#7a5400;border-radius:8px;padding:10px 12px;margin-top:14px;font-size:14px">' + note + '</div>';
  let text = heading + (sub ? '\n' + sub : '') + '\n';

  sections.forEach(sec => {
    html += '<div style="font-size:12px;font-weight:bold;letter-spacing:.06em;color:' + color + ';margin:18px 0 6px">' + e(sec.title) + '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px">';
    text += '\n*' + sec.title + '*\n';
    sec.rows.filter(r => r[1] !== '' && r[1] != null).forEach(r => {
      html += '<tr><td style="padding:6px 0;color:#667085;width:42%;border-bottom:1px solid #f0f2f5;vertical-align:top">' + e(r[0]) +
        '</td><td style="padding:6px 0;border-bottom:1px solid #f0f2f5;font-weight:bold">' + e(r[1]).replace(/\n/g, '<br>') + '</td></tr>';
      text += r[0] + ': ' + String(r[1]).replace(/\n/g, '; ') + '\n';
    });
    html += '</table>';
  });

  html += '<div style="margin-top:22px">' +
    '<a href="' + url + '" style="display:inline-block;background:' + color + ';color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;font-size:15px">' + (recId ? 'Atvērt pieteikumu' : 'Atvērt lietotni') + ' →</a>' +
    '</div></div></div>' +
    '<div style="text-align:center;font-size:11px;color:#98a2b3;margin-top:12px">Automātisks paziņojums — uz šo e-pastu nav jāatbild</div></div>';

  try {
    MailApp.sendEmail({ to: to, subject: subject, body: text + '\nAtvērt: ' + url, htmlBody: html, name: 'Personāla pieteikumi' });
    console.log('E-pasts nosūtīts uz ' + to + ': ' + subject);
    return '';
  } catch (err) {
    console.warn('E-pastu neizdevās nosūtīt uz ' + to + ': ' + err);
    return String(err.message || err);
  }
}

function mailHire_(d) {
  const full = yes_('PILNI_DATI_EPASTA', 'NĒ');
  return sendMail_(recipients_('hire'),
    'Pieņemt darbā: ' + d.vards + ' — ' + d.sia + ', sāk ' + d.sakums,
    'Pieņemt darbinieku', d.vards + ' · ' + d.id,
    [
      { title: 'DARBINIEKS', rows: [
        ['Vārds, Uzvārds', d.vards],
        ['Personas kods', full ? d.pk : ''],
        ['Deklarētā adrese', full ? d.adrese : ''],
        ['Telefona numurs', d.tel], ['E-pasts', d.epasts],
        ['Invaliditāte', d.inval], ['Pensionārs', d.pens], ['Veselības pārbaude', d.vesel]] },
      { title: 'DARBS', rows: [['SIA', d.sia],
        ['Objekti un amati', splitObj_(d.objekts).map(e => objEntry_(objPair_(e), false)).join('\n')], ['Sāk strādāt', d.sakums], ['Begin Time', d.bt]] },
      { title: 'ATALGOJUMS', rows: [
        ['Alga', splitObj_(d.objekts).length > 1
          ? splitObj_(d.objekts).map(e => { const p = objPair_(e); return p.name + ': ' + eur_(p.alga || 0); }).join('\n') + '\nKopā: ' + eur_(d.alga)
          : eur_(d.alga)],
        ['Banka', d.banka], ['IBAN', full ? d.iban : '']] },
      { title: 'PIETEIKUMS', rows: [['Iesniedza', d.by], ['Piezīmes', d.piez]] }
    ],
    full ? '' : 'Personas kods, adrese un IBAN redzami lietotnē.', '', d.id);
}

function mailVacation_(d) {
  return sendMail_(recipients_('vac'),
    'Atvaļinājums: ' + d.darb + ' ' + d.no + ' – ' + d.lidz,
    'Atvaļinājuma pieteikums', d.darb + ' · ' + d.id,
    [
      { title: 'DARBINIEKS', rows: [['Vārds, Uzvārds', d.darb], ['SIA', d.sia], ['Objekti un amati', splitObj_(d.objekts).join('\n')]] },
      { title: 'ATVAĻINĀJUMS', rows: [['Veids', d.veids], ['No', d.no], ['Līdz', d.lidz],
        ['Ilgums', d.cal + ' kalendārās dienas, ' + d.work + ' darba dienas'], ['Aizvietotājs', d.aizv]] },
      { title: 'PIETEIKUMS', rows: [['Iesniedza', d.by], ['Piezīmes', d.piez]] }
    ],
    d.warnings.length ? '<b>Uzmanību:</b><br>' + d.warnings.map(w => String(w).replace(/</g, '&lt;')).join('<br>') : '',
    '#0e5e6f', d.id);
}

function mailStatus_(to, type, id, name, status, comment) {
  const colors = { 'Apstiprināts': '#1e7a4a', 'Noraidīts': '#b42318', 'Apstrādē': '#9a6a00', 'Jauns': '#1f3a5f' };
  sendMail_(to,
    (type === 'hire' ? 'Pieņemšana' : 'Atvaļinājums') + ' — ' + name + ': ' + status,
    status, (type === 'hire' ? 'Pieņemšana darbā' : 'Atvaļinājums') + ' · ' + name + ' · ' + id,
    [{ title: 'STATUSS', rows: [['Pieteikums', id], ['Darbinieks', name], ['Jaunais statuss', status], ['Komentārs', comment]] }],
    '', colors[status], id);
}

/** Palaid šo, lai pārbaudītu, vai e-pasti pienāk. */
function testEmail() {
  ['ADMIN_EMAIL', 'EMAIL_PIENEMSANA', 'EMAIL_ATVALINAJUMI']
    .forEach(k => Logger.log(k + ' tabulā = "' + setting_(k) + '"'));
  const to = [recipients_('hire'), recipients_('vac')].join(',').split(',').filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i).join(',');
  if (!to) {
    throw new Error('Lapā Iestatījumi nav atrasta neviena e-pasta adrese. ' +
      'Ieraksti adresi kolonnā B rindā ADMIN_EMAIL (piem. personals@selectumhome.lv), nevis JĀ.');
  }
  const err = sendMail_(to, 'Testa e-pasts — Personāla pieteikumi', 'E-pasts strādā ✓', 'Šis ir testa paziņojums',
    [{ title: 'IESTATĪJUMI', rows: [['ADMIN_EMAIL', setting_('ADMIN_EMAIL') || '(tukšs)'],
      ['EMAIL_PIENEMSANA', setting_('EMAIL_PIENEMSANA') || '(tukšs)'],
      ['EMAIL_ATVALINAJUMI', setting_('EMAIL_ATVALINAJUMI') || '(tukšs)'],
      ['Atlikušais e-pastu limits šodien', MailApp.getRemainingDailyQuota()]] }]);
  if (err) throw new Error('Neizdevās nosūtīt: ' + err);
  Logger.log('✓ Nosūtīts uz: ' + to);
}

/* ===== Vienotais PIN no SH portāla (pilnvaras mainās portālā vaitkevix.cloud/sh). © VAITKEVIX, SIA ===== */
const PORTAL_URL_ = 'https://aizvietosana-api.vaitkevix.workers.dev/portal';
/** { known:false } — PIN portālā nav; { known:true, name, role } — role '' nozīmē: nav piekļuves */
function centralUser_(pin, app) {
  pin = String(pin || '').trim(); if (!pin) return { known: false };
  const key = 'cu_' + app + '_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'sh|' + pin)).slice(0, 30);
  const cache = CacheService.getScriptCache(), c = cache.get(key);
  if (c) return JSON.parse(c);
  try {
    const r = UrlFetchApp.fetch(PORTAL_URL_, { method: 'post', contentType: 'text/plain', payload: JSON.stringify({ action: 'check', pin: pin, app: app }), muteHttpExceptions: true });
    const j = JSON.parse(r.getContentText());
    if (!j.ok) return { known: false };
    const out = j.known ? { known: true, name: j.name, role: j.role || '' } : { known: false };
    cache.put(key, JSON.stringify(out), 300);
    return out;
  } catch (e) { return { known: false }; }
}
/** Saraksti (SIA, bankas, amati, atvaļinājumu veidi, tālruņa kodi, objekti) no SH portāla; kešs 5 min */
function masterLists_() {
  const cache = CacheService.getScriptCache(), c = cache.get('master_lists');
  if (c) return JSON.parse(c);
  try {
    const r = UrlFetchApp.fetch(PORTAL_URL_, { method: 'post', contentType: 'text/plain', payload: JSON.stringify({ action: 'lists' }), muteHttpExceptions: true });
    const j = JSON.parse(r.getContentText()); if (!j.ok) return null;
    const out = { sia: j.sia, bankas: j.bankas, veidi: j.veidi, amati: j.amati, kodi: j.kodi, objekti: j.objekti };
    try { cache.put('master_lists', JSON.stringify(out), 300); } catch (e) {}
    return out;
  } catch (e) { return null; }
}
/** Palaid vienreiz no redaktora, lai atļautu savienojumu ar portālu */
function parbauditPortalu() { return centralUser_('0', 'test'); }

/** Inventārs: lapas, izmēri, formulas ar atsaucēm uz citām lapām (pārcelšanai uz vienu tabulu). © VAITKEVIX, SIA */
function lapuInventars() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const out = ss.getSheets().map(sh => {
    const r = sh.getLastRow(), c = sh.getLastColumn();
    let f = 0, x = 0, ext = 0;
    if (r && c) sh.getRange(1, 1, Math.min(r, 3000), c).getFormulas().forEach(row => row.forEach(v => { if (v) { f++; if (/!/.test(v)) x++; if (/IMPORTRANGE/i.test(v)) ext++; } }));
    return [sh.getName(), r, c, f, x, ext, sh.isSheetHidden() ? 'slēpta' : ''].join(' | ');
  });
  console.log(ss.getName() + ' (' + ss.getId() + ')\n' + out.join('\n'));
  return out;
}
