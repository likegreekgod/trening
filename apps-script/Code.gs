/**
 * Trening – aplikacja klienta (Google Apps Script, web app)
 * Arkusz: zakładki Plan, Klienci, Log, Sesje.
 * Wdrożenie: Wdróż → Nowe wdrożenie → Aplikacja internetowa
 *            Wykonaj jako: Ja | Kto ma dostęp: Każdy
 * Link klienta: <URL_WDROŻENIA>?k=<klucz z zakładki Klienci>
 * Klienci, kolumna F „bol”: TAK = pola bólu kolana/barku zawsze widoczne; puste/NIE = opcjonalne (zwinięte).
 * Klienci, kolumna G „tryb”: PROSTY = tryb prosty (słowa zamiast RPE, bez VBT/%, „Wszystko jak w planie”, ściągawka);
 *                            puste/PRO = pełny tryb.
 * Klienci, kolumna I „masters”: TAK = ostrzejsze progi w podsumowaniu.
 * Plan, kolumna „grupa” (opcjonalna): R, P, CR, CP, PS, I — do podsumowania ciężarowców (brak = rozpoznanie po nazwie).
 * Klienci, kolumna H „dod_serie”: ile dodatkowych serii klient może dopisać do każdego ćwiczenia (puste/0 = nie może).
 * Plan, kolumna „dod_serie” (opcjonalna): to samo dla konkretnego ćwiczenia — ma pierwszeństwo przed kolumną H.
 * Plan, kolumna „drop” (opcjonalna): liczba zaplanowanych drop setów po ostatniej serii.
 * Log, seria: 1…n robocze, n+1… dodatkowe, R1… rozgrzewka, D1… drop set.
 * Log, typ: DROP, FAIL (nieudana) lub DROP+FAIL; puste = zwykła seria.
 * Plan bez dat (kolumna „data” pusta): jednostka zamknięta dostaje datę wykonania z Sesji, niezamknięta — dzisiejszą.
 *   Dzięki temu aplikacja otwiera pierwszą niezrobioną jednostkę, a Log/Sesje/podsumowanie mają faktyczne daty.
 * Klienci, kolumna J „zamiana”: TAK = klient może zamienić ćwiczenie (z powodem).
 * Klienci, kolumna K „skala”: RIR = widok RIR zamiast RPE (arkusz zawsze zapisuje RPE; RIR = 10 − RPE).
 * Klienci, kolumna L „sufit_oly”: ułamek 1RM ponad plan dla bojów (domyślnie 0,05).
 * Plan, kolumna „zamienniki” (opcjonalna): nazwy rozdzielone „;”. Kolumna „blok” (opcjonalna): np. B2;
 *   tygodnie numerowane u klienta ciągle (blok 2 od tyg. 7), bo id serii = klient|tydzien|jednostka|nr|seria.
 * Data faktyczna jednostki = dzień z Sesje.start (data w Sesjach to data z planu); bez Sesji – data z planu.
 */

const ROOT_FOLDER_NAME = 'Trening – Klienci';
const CHUNK = 4 * 1024 * 1024; // musi być wielokrotnością 256 KB

const LOG_HEADERS = ['id', 'zapisano', 'klient', 'tydzien', 'jednostka', 'data', 'nr_cw', 'cwiczenie',
  'seria', 'kg', 'powt', 'rpe', 'vbt_ms', 'wykonane', 'film_link', 'uwagi', 'typ',
  'ocena', 'vbt_peak', 'wysokosc_cm', 'sciezka', 'zamiana'];
const SES_HEADERS = ['id', 'zapisano', 'klient', 'tydzien', 'jednostka', 'data',
  'bol_kolano', 'bol_bark', 'samopoczucie', 'czas_min', 'uwagi', 'start', 'koniec', 'bol', 'bol_max', 'rpe_sesji'];
const DYS_HEADERS = ['id', 'zapisano', 'klient', 'data', 'cmj1', 'cmj2', 'cmj3', 'cmj_sr',
  'sen', 'stres', 'zmeczenie', 'bolesnosc', 'hooper_suma', 'vbt_test', 'werdykt', 'powody'];
const OCENY = ['L', 'S', 'W', 'X'];   // boje: Łatwo / Średnio / Walka / Spalone

/* ---------- WEB ---------- */

function doGet(e) {
  const key = String((e && e.parameter && e.parameter.k) || '').trim();
  const client = findClient_(key);
  if (!client) {
    const why = key ? 'Nieznany klucz (' + key.slice(0, 4) + '…).' : 'W linku brakuje klucza (?k=…).';
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:24px">Nieprawidłowy link. ' + why + ' Skontaktuj się z trenerem.</p>')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  const t = HtmlService.createTemplateFromFile('Index');
  t.clientName = client.name;
  t.clientKey = key;
  t.painTrack = client.pain;
  t.simpleMode = client.simple;
  t.extraSets = client.extra;
  return t.evaluate()
    .setTitle('Trening – ' + client.name)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- API dla aplikacji na GitHub Pages ----------
 * POST (Content-Type text/plain, bez preflight CORS), body: {fn, key, args:[…]} → {ok:true, result} | {ok:false, error}
 */
const API_FNS = { getData, logSet, logSession, deleteSet, startUpload, uploadChunk, saveDyspozycja, przesunJednostke };

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const f = API_FNS[req.fn];
    if (!f) throw new Error('Nieznana funkcja: ' + req.fn);
    out = { ok: true, result: f.apply(null, [req.key].concat(req.args || [])) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- API (google.script.run – stara wersja, link /exec?k=) ---------- */

function getData(key) {
  const client = mustClient_(key);
  const ss = SpreadsheetApp.getActive();
  const plan = ss.getSheetByName('Plan').getDataRange().getValues();
  const h = plan.shift();
  const idx = name => h.indexOf(name);
  const ix = idx('dod_serie'), idr = idx('drop');
  const opt = (r, name) => idx(name) < 0 || r[idx(name)] === null || r[idx(name)] === undefined ? '' : String(r[idx(name)]).trim();
  const rows = plan.filter(r => String(r[idx('klient')]).toLowerCase() === client.id)
    .map(r => ({
      week: Number(r[idx('tydzien')]), day: String(r[idx('jednostka')]), title: String(r[idx('tytul')]),
      date: fmtDate_(r[idx('data')]), order: Number(r[idx('nr')]), name: String(r[idx('cwiczenie')]),
      prio: String(r[idx('prio')]), sets: Number(r[idx('serie')]) || 1, reps: txt_(r[idx('powt')]),
      pct: r[idx('procent')] === '' ? null : Number(String(r[idx('procent')]).replace(',', '.')),
      kg: numOr_(txt_(r[idx('kg')])), rpe: numOr_(r[idx('rpe_max')]), note: String(r[idx('uwagi')]),
      extra: ix < 0 || r[ix] === '' || r[ix] === null ? null : (Number(r[ix]) || 0),
      drop: idr < 0 ? 0 : (Number(r[idr]) || 0),
      group: opt(r, 'grupa').toUpperCase(), block: opt(r, 'blok'),
      swaps: opt(r, 'zamienniki').split(';').map(s => s.trim()).filter(Boolean)
    }));
  const sessions = readRows_('Sesje', SES_HEADERS, client.id);
  fillDates_(rows, sessions, today_());
  return { cfg: { name: client.name, pain: client.pain, simple: client.simple, extra: client.extra,
      swap: client.swap, scale: client.scale, olyCeil: client.olyCeil },
    plan: rows, logs: readRows_('Log', LOG_HEADERS, client.id), sessions: sessions,
    readiness: readRows_('Dyspozycja', DYS_HEADERS, client.id) };
}

/** Zapis jednej serii. Idempotentny po id (klient|tydz|jedn|nr|seria). */
function logSet(key, s) {
  const client = mustClient_(key);
  const id = [client.id, s.week, s.day, s.order, s.set].join('|');
  upsert_('Log', LOG_HEADERS, id, [id, new Date(), client.id, s.week, s.day, s.date || today_(), s.order, s.name,
    s.set, s.kg, s.reps, s.rpe, s.vbt, s.done ? 'TAK' : '', s.video || '', s.note || '', s.typ || '']
    .concat(logV2_(s)));
  return { ok: true, id: id };
}

/** Kolumny Log v2 (ocena boju, VBT z filmu, ścieżka, zamiana). Brak pól (stara aplikacja) = puste. */
function logV2_(s) {
  const o = String(s.ocena || '').toUpperCase();
  let path = s.path === undefined || s.path === null ? '' : (typeof s.path === 'string' ? s.path : JSON.stringify(s.path));
  if (path.length > 45000) path = '';                                         // limit komórki 50 000 znaków
  const v = x => x === undefined || x === null ? '' : x;
  return [OCENY.indexOf(o) >= 0 ? o : '', v(s.vbtPeak), v(s.height), path, String(s.swap || '')];
}

/** Dyspozycja dnia: jeden wpis na klienta i dzień (ponowny zapis tego dnia nadpisuje). */
function saveDyspozycja(key, d) {
  const client = mustClient_(key);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) ? d.date : today_();
  const id = [client.id, date].join('|');
  const v = x => x === undefined || x === null ? '' : x;
  const h = d.hooper || {};
  upsert_('Dyspozycja', DYS_HEADERS, id, [id, new Date(), client.id, date,
    v((d.cmj || [])[0]), v((d.cmj || [])[1]), v((d.cmj || [])[2]), v(d.cmjAvg),
    v(h.sen), v(h.stres), v(h.zmeczenie), v(h.bolesnosc), v(h.suma), v(d.vbt),
    String(d.verdict || ''), [].concat(d.reasons || []).join('; ')]);
  return { ok: true, id: id };
}

/** Klient przesuwa niezrobione jednostki: moves = [{week, day, date}]. Zrobionych (z wpisem w Sesjach) nie zmienia. */
function przesunJednostke(key, moves) {
  const client = mustClient_(key);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName('Plan');
    const v = sh.getDataRange().getValues(), h = v[0];
    const res = planMoves_(tableOf_('Plan'), readRows_('Sesje', SES_HEADERS, client.id), client.id, [].concat(moves || []));
    if (res.rows.length) {
      planTextCols_();
      const col = h.indexOf('data') + 1;
      res.rows.forEach(([i, date]) => sh.getRange(i + 2, col).setValue(date));
    }
    return { ok: true, moved: res.moved, skipped: res.skipped };
  } finally { lock.releaseLock(); }
}

/** Czysta funkcja: które wiersze Planu (indeks od 0, bez nagłówka) dostają nową datę. */
function planMoves_(plan, sessions, clientId, moves) {
  const done = {};
  sessions.forEach(s => { done[s.tydzien + '|' + s.jednostka] = 1; });
  const rows = [], moved = [], skipped = [];
  moves.forEach(m => {
    const u = m.week + '|' + m.day;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(m.date || ''))) { skipped.push({ week: m.week, day: m.day, why: 'zła data' }); return; }
    if (done[u]) { skipped.push({ week: m.week, day: m.day, why: 'jednostka zrobiona' }); return; }
    let n = 0;
    plan.forEach((r, i) => {
      if (String(r.klient).toLowerCase() === clientId && String(r.tydzien) === String(m.week) && String(r.jednostka) === String(m.day)) { rows.push([i, m.date]); n++; }
    });
    if (n) moved.push({ week: m.week, day: m.day, date: m.date }); else skipped.push({ week: m.week, day: m.day, why: 'brak w planie' });
  });
  return { rows, moved, skipped };
}

/** Usunięcie serii dodanej przez klienta (rozgrzewka / dodatkowa / drop) — kasuje wiersz w Log. */
function deleteSet(key, s) {
  const client = mustClient_(key);
  const id = [client.id, s.week, s.day, s.order, s.set].join('|');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_('Log', LOG_HEADERS);
    const hit = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1)
      .createTextFinder(id).matchEntireCell(true).findNext();
    if (hit && hit.getRow() > 1) sh.deleteRow(hit.getRow());
  } finally { lock.releaseLock(); }
  return { ok: true };
}

/** Zapis jednostki. Ból: liczba 0–10 lub '' (nie zgłoszono); bol = „miejsce:0–10; …”, bol_max = najwyższa ocena. Czas liczony w aplikacji: od pierwszego wpisu do „Zakończ”. */
function logSession(key, s) {
  const client = mustClient_(key);
  const id = [client.id, s.week, s.day].join('|');
  upsert_('Sesje', SES_HEADERS, id, [id, new Date(), client.id, s.week, s.day, s.date || today_(),
    s.knee, s.shoulder, s.feel, s.minutes, s.note || '', s.start || '', s.end || '', s.pain || '', s.painMax === undefined ? '' : s.painMax, s.rpeSession === undefined ? '' : s.rpeSession]);
  return { ok: true };
}

/** Start wgrywania filmu: tworzy sesję resumable w Drive, zwraca uploadId. */
function startUpload(key, meta) {
  const client = mustClient_(key);
  meta.date = meta.date || today_();
  const folder = sessionFolder_(client, meta.date, meta.day);
  const safe = String(meta.name).replace(/[^\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ \-]/g, '').slice(0, 40);
  const ext = (String(meta.fileName).match(/\.[a-z0-9]+$/i) || ['.mp4'])[0];
  const fileName = `${meta.date}_${meta.day}_${safe}_s${meta.set || 0}${ext}`;
  const headers = {
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
    'X-Upload-Content-Type': meta.mimeType || 'video/mp4',
    'X-Upload-Content-Length': String(meta.size)
  };
  // Tryb bezpośredni: sesja z nagłówkiem Origin pozwala telefonowi wysłać plik prosto do Google (CORS)
  if (meta.origin) headers.Origin = meta.origin;
  const res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: headers,
    payload: JSON.stringify({ name: fileName, parents: [folder.getId()] }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Drive init ' + res.getResponseCode() + ': ' + res.getContentText());
  const location = res.getHeaders()['Location'] || res.getHeaders()['location'];
  const uploadId = Utilities.getUuid();
  CacheService.getScriptCache().put('up_' + uploadId, location, 21600);
  return { uploadId: uploadId, chunk: CHUNK, url: meta.origin ? location : null };
}

/** Wysyła jeden fragment (base64). Zwraca {done:false} lub {done:true, link}. */
function uploadChunk(key, uploadId, b64, start, total) {
  mustClient_(key);
  const location = CacheService.getScriptCache().get('up_' + uploadId);
  if (!location) throw new Error('Sesja wgrywania wygasła — spróbuj ponownie.');
  const bytes = Utilities.base64Decode(b64);
  const end = start + bytes.length - 1;
  const res = UrlFetchApp.fetch(location, {
    method: 'put',
    contentType: 'application/octet-stream',
    headers: { 'Content-Range': `bytes ${start}-${end}/${total}` },
    payload: bytes,
    muteHttpExceptions: true,
    followRedirects: false
  });
  const code = res.getResponseCode();
  if (code === 308) return { done: false };
  if (code === 200 || code === 201) {
    const f = JSON.parse(res.getContentText());
    return { done: true, id: f.id, link: f.webViewLink || ('https://drive.google.com/file/d/' + f.id + '/view') };
  }
  throw new Error('Drive upload ' + code + ': ' + res.getContentText());
}

/* ---------- POMOCNICZE ---------- */

function findClient_(key) {
  key = String(key || '').trim();
  if (!key) return null;
  const sh = SpreadsheetApp.getActive().getSheetByName('Klienci');
  const v = sh.getDataRange().getValues();
  const cell = (r, i) => String(r[i] === undefined ? '' : r[i]).trim().toUpperCase();
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === key && String(v[i][3]).toUpperCase() !== 'NIE') {
      return { key: key, id: String(v[i][1]).toLowerCase(), name: String(v[i][2]),
        pain: cell(v[i], 5) === 'TAK',
        simple: cell(v[i], 6) === 'PROSTY',
        extra: Number(String(v[i][7] === undefined ? '' : v[i][7]).replace(',', '.')) || 0,
        swap: cell(v[i], 9) === 'TAK',
        scale: cell(v[i], 10) === 'RIR' ? 'RIR' : 'RPE',
        olyCeil: olyCeil_(v[i][11]) };
    }
  }
  return null;
}

/** Klienci L „sufit_oly”: ułamek (0,05) albo procent (5 / „5%”); puste lub błędne = 0,05. */
function olyCeil_(v) {
  const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.').replace('%', ''));
  if (!(n >= 0)) return 0.05;
  return n >= 1 ? n / 100 : n;
}

function mustClient_(key) {
  const c = findClient_(key);
  if (!c) throw new Error('Brak dostępu.');
  return c;
}

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); }
  if (sh.getLastRow() === 0) { sh.appendRow(headers); sh.setFrozenRows(1); }
  else if (sh.getLastColumn() < headers.length) sh.getRange(1, 1, 1, headers.length).setValues([headers]); // nowe kolumny
  return sh;
}

function upsert_(name, headers, id, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(name, headers);
    const hit = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1)
      .createTextFinder(id).matchEntireCell(true).findNext();
    if (hit) sh.getRange(hit.getRow(), 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
  } finally { lock.releaseLock(); }
}

function readRows_(name, headers, clientId) {
  const sh = sheet_(name, headers);
  const v = sh.getDataRange().getValues();
  const h = v.shift();
  return v.filter(r => String(r[2]).toLowerCase() === clientId).map(r => {
    const o = {};
    h.forEach((k, i) => { o[k] = r[i] instanceof Date ? r[i].toISOString() : r[i]; });
    return o;
  });
}

/** Arkusze zamieniają zakresy typu „6-8” na datę — odtwarzamy tekst „6–8” (miesiąc–dzień). */
function txt_(v) {
  if (v instanceof Date) return (v.getMonth() + 1) + '–' + v.getDate();
  return v === null || v === undefined ? '' : String(v);
}

/** Kolumny tekstowe w Plan (data, powt, kg) — ustawiane PRZED wpisaniem, żeby „6-8” nie stało się datą. */
function planTextCols_() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Plan') || ss.getSheets()[0];
  ['E:E', 'J:J', 'L:L'].forEach(a => sh.getRange(a).setNumberFormat('@'));
}

function numOr_(v) {
  if (v === '' || v === null) return '';
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? String(v) : n;
}

function fmtDate_(d) {
  if (d instanceof Date) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(d).slice(0, 10);
}

/** Dzisiejsza data w strefie skryptu (YYYY-MM-DD). */
function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Data z Sesji: tekst „YYYY-MM-DD” albo ISO z readRows_ (komórka-data → UTC) → dzień w strefie skryptu. */
function sesDay_(v) {
  const t = String(v === null || v === undefined ? '' : v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) return fmtDate_(new Date(t));
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : '';
}

/** Plan bez dat: jednostka zamknięta → data z Sesji, niezamknięta → dziś. Wiersze z datą bez zmian. */
function fillDates_(rows, sessions, today) {
  if (!rows.some(r => !r.date)) return;
  const done = {};
  sessions.forEach(s => { const d = sesDay_(s.data); if (d) done[s.tydzien + '|' + s.jednostka] = d; });
  rows.forEach(r => { if (!r.date) r.date = done[r.week + '|' + r.day] || today; });
}

function rootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* utworzymy nowy */ } }
  const it = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);
  props.setProperty('ROOT_FOLDER_ID', f.getId());
  return f;
}

function child_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function sessionFolder_(client, date, day) {
  return child_(child_(rootFolder_(), client.name), `${date}_${day}`);
}

/** Uruchom raz ręcznie z edytora — nadaje uprawnienia i tworzy zakładki/folder. */
function setup() {
  planTextCols_();
  if (typeof seedPlan === 'function') seedPlan();   // stary sposób (Plan.gs); nowy: wczytajPlany() z Drive
  const kl = sheet_('Klienci', ['klucz', 'klient_id', 'imie', 'aktywny']);
  kl.getRange('A:A').setNumberFormat('@');
  if (kl.getLastRow() < 2) kl.appendRow([newKey_(), 'damian', 'Damian', 'TAK']);
  if (!kl.getRange(1, 5).getValue()) kl.getRange(1, 5).setValue('link');
  if (!kl.getRange(1, 6).getValue()) kl.getRange(1, 6).setValue('bol');
  if (!kl.getRange(1, 7).getValue()) kl.getRange(1, 7).setValue('tryb');
  if (!kl.getRange(1, 8).getValue()) kl.getRange(1, 8).setValue('dod_serie');
  if (!kl.getRange(1, 9).getValue()) kl.getRange(1, 9).setValue('masters');
  if (!kl.getRange(1, 10).getValue()) kl.getRange(1, 10).setValue('zamiana');
  if (!kl.getRange(1, 11).getValue()) kl.getRange(1, 11).setValue('skala');
  if (!kl.getRange(1, 12).getValue()) kl.getRange(1, 12).setValue('sufit_oly');
  // listy rozwijane: „tryb”, „zamiana”, „skala”
  const list = (col, vals) => kl.getRange(2, col, Math.max(kl.getMaxRows() - 1, 1), 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(vals, true).setAllowInvalid(true).build());
  list(7, ['PROSTY', 'PRO']);
  list(10, ['TAK', 'NIE']);
  list(11, ['RPE', 'RIR']);
  // klucze liczbowe (Arkusze potrafią zamienić je na liczbę) → nowy klucz tekstowy
  const keys = kl.getRange(2, 1, kl.getLastRow() - 1, 1).getValues();
  keys.forEach((r, i) => { if (!/^k[0-9a-f]{11}$/.test(String(r[0]))) kl.getRange(i + 2, 1).setValue(newKey_()); });
  sheet_('Log', LOG_HEADERS);
  sheet_('Sesje', SES_HEADERS);
  sheet_('Dyspozycja', DYS_HEADERS);
  const f = rootFolder_();
  UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  Logger.log('OK. Folder na filmy: ' + f.getUrl());
}

function newKey_() {
  return 'k' + Utilities.getUuid().replace(/-/g, '').slice(0, 11);
}

/** Po wdrożeniu: uruchom, aby wypisać linki dla klientów (Dziennik wykonania). */
function linki() {
  // Adres z Zarządzaj wdrożeniami → „URL aplikacji internetowej”, zapisany we Właściwościach skryptu jako WEBAPP_URL.
  // getService().getUrl() potrafi zwrócić adres wersji testowej (head), który po zamianie /dev→/exec wymaga logowania.
  const props = PropertiesService.getScriptProperties();
  const pwa = String(props.getProperty('PWA_URL') || '').trim();   // np. https://login.github.io/trening/
  const saved = props.getProperty('WEBAPP_URL');
  const url = String(saved || ScriptApp.getService().getUrl() || '').trim().replace(/\?.*$/, '').replace(/\/dev$/, '/exec');
  if (!url && !pwa) { Logger.log('Brak wdrożenia — najpierw Wdróż → Nowe wdrożenie.'); return; }
  if (!saved) Logger.log('UWAGA: brak WEBAPP_URL we Właściwościach skryptu — link może nie działać dla klientów.');
  const sh = SpreadsheetApp.getActive().getSheetByName('Klienci');
  if (!sh) { Logger.log('Brak zakładki Klienci — uruchom najpierw setup.'); return; }
  sh.getRange(1, 5).setValue('link');
  const v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    const link = (pwa || url) + '?k=' + v[i][0];
    sh.getRange(i + 1, 5).setValue(link);
    Logger.log(v[i][2] + ': ' + link);
  }
}

/* ================== PODSUMOWANIE (dla trenera) ==================
 * Uruchom `podsumowanie` (albo menu Trening → Odśwież podsumowanie). `instalujPodsumowanie` = codziennie ok. 5:00.
 * Tydzień = pon–niedz wg daty jednostki z planu (plan bez dat: data z Sesji). Liczone tylko serie wykonane (✓), bez rozgrzewki (R…).
 * Miary: wykonanie planu, serie robocze / twarde (RPE ≥ 7, FAIL, DROP), tonaż [kg], NL i średnia intensywność [%1RM]
 * dla ćwiczeń z % w planie, % FAIL, serie dodatkowe + drop, sRPE-TL = RPE sesji × min [AU] (Foster 2001),
 * ACWR „uncoupled” = sRPE-TL tygodnia ÷ średnia 4 poprzednich tygodni (Gabbett 2016, Lolli 2019; min. 3 tyg. historii), monotonia i strain (Foster 1998), zmiana e1RM ćwiczeń głównych
 * [kg × (1 + (powt + RIR)/30), RIR = 10 − RPE], RPE względem rpe_max z planu, samopoczucie, ból.
 * Ciężarowcy: grupy R rwanie, P podrzut/zarzut, CR ciąg rwaniowy, CP ciąg podrzutowy, PS przysiad, I inne
 * (kolumna Plan „grupa” albo rozpoznanie po nazwie). NL w strefach intensywności jak u Torokhtiya / Miedwiediewa,
 * skuteczność ≥ 85%, spalone < 85%, prędkość VBT w strefie 80–90%. e1RM nie jest liczone dla R i P.
 * fail_% w Podsumowaniu = serie spalone BEZ bojów (R, P); boje ocenia „spal_<85_%” w Podsumowanie_OLY.
 * Klienci, kolumna I „masters” = TAK → ostrzejsze progi (ACWR 1,2/1,4; spalone < 85%: 7/15%).
 * Status: 🔴 za dużo / 🟠 uwaga / 🟢 OK / 🔵 za lekko — flagi do decyzji trenera, nie diagnoza.
 */
const SUM_HEADERS = ['klient', 'tydzien_od', 'tyg_planu', 'jednostki', 'wykonanie_%', 'serie_rob', 'serie_twarde', 'tonaz_kg',
  'NL_%', 'sr_int_%', 'fail_%', 'dod+drop', 'sRPE_TL_AU', 'ACWR', 'monotonia', 'strain', 'e1RM_zm_%', 'RPE_vs_plan',
  'samopocz_sr', 'samopocz_min', 'bol_max', 'status', 'powody'];
const OLY_HEADERS = ['klient', 'tydzien_od', 'masters', 'NL_R', 'NL_P', 'NL_CR', 'NL_CP', 'NL_PS', 'NL_I', 'NL_razem', 'spec_%',
  'int_R_%', 'int_P_%', 'int_CR_%', 'int_CP_%', 'int_PS_%', 'z≤60', 'z61-70', 'z71-80', 'z81-90', 'z91-100', 'z>100', 'z>80_%', 'NL>90',
  'max_R', 'max_P', 'skut_≥85_%', 'spal_<85_%', 'VBT_80-90_zm_ms', 'sygnaly'];
const GROUPS = ['R', 'P', 'CR', 'CP', 'PS', 'I'];
const SUMX_HEADERS = ['klient', 'tydzien_od', 'cwiczenie', 'serie', 'tonaz_kg', 'e1RM_max', 'NL', 'sr_int_%', 'RPE_sr', 'fail'];
const STATUS_BG = { '🔴 za dużo': '#f8c9c4', '🟠 uwaga': '#fde2b8', '🟢 OK': '#cdebd3', '🔵 za lekko': '#cfe0fb', '– za mało danych': '#eeeeee' };

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Trening')
    .addItem('Wczytaj plany z Drive', 'wczytajPlany')
    .addItem('Odśwież podsumowanie', 'podsumowanie')
    .addToUi();
}

function instalujPodsumowanie() { instalujWyzwalacze(); }

/** Uruchom raz: podsumowanie codziennie ok. 5:00, wczytywanie planów z Drive co 15 min. */
function instalujWyzwalacze() {
  ScriptApp.getProjectTriggers().filter(t => ['podsumowanie', 'wczytajPlany'].indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('podsumowanie').timeBased().everyDays(1).atHour(5).create();
  ScriptApp.newTrigger('wczytajPlany').timeBased().everyMinutes(15).create();
  Logger.log('OK: podsumowanie codziennie ~5:00, plany z „' + ROOT_FOLDER_NAME + '/_plany” co 15 min.');
}

function podsumowanie() {
  const localDay = t => Utilities.formatDate(new Date(t), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const plan = tableOf_('Plan'), log = tableOf_('Log'), ses = tableOf_('Sesje');
  const res = computeSummary_(plan, log, ses, tableOf_('Klienci'), { localDay });
  const bl = computeBlocks_(plan, log, ses, tableOf_('Dyspozycja'), res.rows, { localDay });
  writeTable_('Bloki', BLOK_HEADERS, keepNotes_(bl, tableOf_('Bloki')));
  writeTable_('Podsumowanie', SUM_HEADERS, res.rows, (sh, n) => {
    const col = SUM_HEADERS.indexOf('status') + 1;
    if (n) sh.getRange(2, col, n, 1).setBackgrounds(res.rows.map(r => [STATUS_BG[r[col - 1]] || '#ffffff']));
  });
  writeTable_('Podsumowanie_cw', SUMX_HEADERS, res.exRows);
  writeTable_('Podsumowanie_OLY', OLY_HEADERS, res.olyRows);
  Logger.log('Podsumowanie: ' + res.rows.length + ' tygodni, ' + res.exRows.length + ' wierszy ćwiczeń.');
}

function tableOf_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getDataRange().getValues(), h = v.shift();
  return v.map(r => { const o = {}; h.forEach((k, i) => o[k] = r[i]); return o; });
}

function writeTable_(name, headers, rows, after) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.setFrozenRows(1);
  if (after) after(sh, rows.length);
}

/* --- obliczenia (czyste funkcje, bez Arkuszy) --- */
const blank_ = v => v === '' || v === null || v === undefined;
const n_ = v => blank_(v) ? NaN : Number(String(v).replace(',', '.'));
const day_ = d => (d instanceof Date) ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : new Date(String(d).slice(0, 10) + 'T00:00:00Z');
const iso_ = d => d.toISOString().slice(0, 10);
const r1_ = v => isFinite(v) ? Math.round(v * 10) / 10 : '';
const r2_ = v => isFinite(v) ? Math.round(v * 100) / 100 : '';
/** „2+1” → 3, „8” → 8, „8/str” → 8, „10 m” → 10 */
function repsOf_(v) {
  const t = String(v === null || v === undefined ? '' : v).trim();
  if (/^\d+(\s*\+\s*\d+)+$/.test(t)) return t.split('+').reduce((a, b) => a + (parseInt(b, 10) || 0), 0);
  return parseInt(t, 10) || 0;
}
function groupOf_(g, name) {
  const G = String(g || '').trim().toUpperCase();
  if (GROUPS.indexOf(G) >= 0) return G;
  const n = String(name || '').toLowerCase();
  if (/(ciąg|pull).*(rwan|snatch)|(rwan|snatch).*(ciąg|pull)|high pull/.test(n)) return 'CR';
  if (/(ciąg|pull).*(podrzut|zarzut|clean)|(zarzut|clean).*(ciąg|pull)/.test(n)) return 'CP';
  if (/martwy|rdl|rumuń|romanian|good ?morning|wyciskan|bench|sots|dip/.test(n)) return 'I';
  if (/rwan|snatch/.test(n)) return 'R';
  if (/podrzut|zarzut|jerk|clean|wybicie|push press/.test(n)) return 'P';
  if (/przysiad|squat/.test(n)) return 'PS';
  return 'I';
}
const zoneIx_ = rel => { const p = rel * 100; return p <= 60 ? 0 : p <= 70 ? 1 : p <= 80 ? 2 : p <= 90 ? 3 : p <= 100 ? 4 : 5; };
const avg_ = a => a.length ? a.reduce((s2, v) => s2 + v, 0) / a.length : NaN;

function weekOf_(d) {
  const x = day_(d); if (isNaN(x)) return '';
  x.setUTCDate(x.getUTCDate() - (x.getUTCDay() + 6) % 7);
  return iso_(x);
}

/** Dzień w strefie Europe/Warsaw z ISO (Sesje.start). Apps Script: podsumowanie() podaje wersję z Utilities. */
function localDayDefault_(t) {
  try { return new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' }); } catch (e) { return String(t).slice(0, 10); }
}

/** Faktyczna data jednostki: klient|tydzien|jednostka → dzień z Sesje.start (data w Sesjach to data z planu). */
function unitDates_(ses, localDay) {
  const AD = {};
  ses.forEach(s => {
    const t = s.start instanceof Date ? s.start.toISOString() : String(s.start || '');
    if (/^\d{4}-\d{2}-\d{2}T/.test(t)) AD[[String(s.klient).toLowerCase(), s.tydzien, s.jednostka].join('|')] = (localDay || localDayDefault_)(t);
  });
  return AD;
}

function computeSummary_(plan, log, ses, klienci, opts) {
  const P = {}, B = {}, D = {}, M = {}, SD = {};
  (klienci || []).forEach(k => { M[String(k.klient_id).toLowerCase()] = String(k.masters || '').trim().toUpperCase() === 'TAK'; });
  const g0 = () => ({ R: 0, P: 0, CR: 0, CP: 0, PS: 0, I: 0 });
  const key = (...a) => a.map(String).join('|');
  plan.forEach(r => { P[key(String(r.klient).toLowerCase(), r.tydzien, r.jednostka, r.nr)] = r; });
  // plan bez dat: data jednostki = data wykonania z Sesji (jednostki niezrobione nie wchodzą do tygodnia)
  ses.forEach(s => { if (!blank_(s.data)) SD[key(String(s.klient).toLowerCase(), s.tydzien, s.jednostka)] = s.data; });
  // jednostka zrobiona: tydzień wg faktycznej daty treningu (jednostki bywają przesuwane)
  const AD = unitDates_(ses, opts && opts.localDay);
  const acc = (c, w) => B[c + '|' + w] || (B[c + '|' + w] = { c, w, planW: {}, sess: 0, planned: 0, planTon: 0, donePlanned: 0, work: 0, hard: 0,
    ton: 0, nl: 0, intSum: 0, fail: 0, addDrop: 0, e1: {}, rpeDiff: [], feel: [], pain: NaN, srpe: 0, srpeN: 0, ex: {},
    strWork: 0, strFail: 0, olyAny: false,
    o: { nl: g0(), int: g0(), intN: g0(), zones: [0, 0, 0, 0, 0, 0], nl90: 0, maxKg: { R: 0, P: 0 }, maxName: { R: '', P: '' }, maxRel: { R: 0, P: 0 },
         hiSets: 0, hiMade: 0, loSets: 0, loMiss: 0 } });

  plan.forEach(r => {
    const c = String(r.klient).toLowerCase(), u = key(c, r.tydzien, r.jednostka);
    const w = weekOf_(AD[u] || (blank_(r.data) ? SD[u] : r.data));
    if (!c || !w) return;
    const a = acc(c, w); a.planned += n_(r.serie) || 0; a.planW[r.tydzien] = 1;
    const pk = n_(r.kg), pr = repsOf_(r.powt);
    if (pk > 0 && pr > 0) a.planTon += (n_(r.serie) || 0) * pr * pk;
  });

  log.forEach(l => {
    if (String(l.wykonane).toUpperCase() !== 'TAK') return;
    const c = String(l.klient).toLowerCase(), s = String(l.seria), w = weekOf_(AD[key(c, l.tydzien, l.jednostka)] || l.data);
    if (!c || !w || /^R/i.test(s)) return;                                   // rozgrzewka poza objętością
    const pr = P[key(c, l.tydzien, l.jednostka, l.nr_cw)] || {};
    const a = acc(c, w), name = String(l.cwiczenie);
    const x = a.ex[name] || (a.ex[name] = { sets: 0, ton: 0, e1: 0, nl: 0, intSum: 0, rpe: [], fail: 0, v80: [] });
    const typ = String(l.typ || ''), fail = /FAIL/.test(typ), drop = /DROP/.test(typ) || /^D/i.test(s);
    const kg = n_(l.kg), reps = n_(l.powt), rpe = n_(l.rpe);
    a.work++; x.sets++;
    if (/^\d+$/.test(s) && +s <= (n_(pr.serie) || 0)) a.donePlanned++; else a.addDrop++;
    if (fail) { a.fail++; x.fail++; }
    const grp = groupOf_(pr.grupa, name), lift = grp === 'R' || grp === 'P', o = a.o;
    if (!lift) { a.strWork++; if (fail) a.strFail++; }
    if (fail || drop || rpe >= 7) a.hard++;
    if (kg > 0 && reps > 0) { a.ton += kg * reps; x.ton += kg * reps; }
    const pct = n_(pr.procent), pkg = n_(pr.kg);
    const rel = pct > 0 && pkg > 0 && kg > 0 ? kg / (pkg / pct) : NaN;       // %1RM rzeczywisty z 1RM zakodowanego w planie
    if (rel > 0 && reps > 0) { a.nl += reps; a.intSum += reps * rel; x.nl += reps; x.intSum += reps * rel; }
    // ciężarowcy: NL (zaliczone), strefy, skuteczność, VBT
    if (lift || grp === 'CR' || grp === 'CP') a.olyAny = true;
    if (!fail && reps > 0) {
      o.nl[grp] += reps;
      if (rel > 0) {
        o.int[grp] += reps * rel; o.intN[grp] += reps;
        if (grp !== 'I') { o.zones[zoneIx_(rel)] += reps; if (rel > 0.9) o.nl90 += reps; }
      }
    }
    if (lift && rel > 0) {
      if (rel >= 0.85) { o.hiSets++; if (!fail) o.hiMade++; } else { o.loSets++; if (fail) o.loMiss++; }
    }
    if (lift && !fail && kg > 0) {
      if (kg > o.maxKg[grp]) { o.maxKg[grp] = kg; o.maxName[grp] = name; }
      if (rel > o.maxRel[grp]) o.maxRel[grp] = rel;
    }
    const vb = n_(l.vbt_ms);
    if (!fail && vb > 0 && rel >= 0.8 && rel <= 0.9) x.v80.push(vb);
    if (rpe >= 5) x.rpe.push(rpe);
    if (!fail && !lift && rpe >= 5 && kg > 0 && reps > 0) {                  // e1RM tylko poza rwaniem i podrzutem
      const e = kg * (1 + (reps + (10 - rpe)) / 30);
      x.e1 = Math.max(x.e1, e);
      if (String(pr.prio) === 'A') a.e1[name] = Math.max(a.e1[name] || 0, e);
    }
    const rmax = n_(pr.rpe_max);
    if (rpe >= 5 && rmax > 0) a.rpeDiff.push(rpe - rmax);
  });

  ses.forEach(s => {
    const c = String(s.klient).toLowerCase(), sd = AD[key(c, s.tydzien, s.jednostka)] || s.data, w = weekOf_(sd);
    if (!c || !w) return;
    const a = acc(c, w); a.sess++;
    const f = n_(s.samopoczucie); if (f > 0) a.feel.push(f);
    const pm = !blank_(s.bol_max) ? n_(s.bol_max) : Math.max(n_(s.bol_kolano) || -1, n_(s.bol_bark) || -1);
    if (pm >= 0) a.pain = isNaN(a.pain) ? pm : Math.max(a.pain, pm);
    const rs = n_(s.rpe_sesji), mn = n_(s.czas_min);
    if (rs >= 0 && mn > 0) {
      const d = iso_(day_(sd)), load = rs * mn;
      a.srpe += load; a.srpeN++;
      (D[c] || (D[c] = {}))[d] = ((D[c] || {})[d] || 0) + load;
    }
  });

  const rows = [], exRows = [], olyRows = [];
  const byClient = {};
  Object.values(B).forEach(a => (byClient[a.c] || (byClient[a.c] = [])).push(a));
  Object.keys(byClient).sort().forEach(c => {
    const weeks = byClient[c].filter(a => a.work || a.sess).sort((x, y) => x.w.localeCompare(y.w));
    weeks.forEach((a, i) => {
      // monotonia z 7 dni tygodnia (dni bez treningu = 0)
      const dl = D[c] || {}, daily = [];
      for (let k = 0; k < 7; k++) { const d = day_(a.w); d.setUTCDate(d.getUTCDate() + k); daily.push(dl[iso_(d)] || 0); }
      const mean = daily.reduce((s, v) => s + v, 0) / 7;
      const sd = Math.sqrt(daily.reduce((s, v) => s + (v - mean) * (v - mean), 0) / 7);
      const mono = a.srpeN >= 2 && sd > 0 ? mean / sd : NaN;
      // ACWR uncoupled: ten tydzień ÷ średnia z maks. 4 poprzednich tygodni kalendarzowych (brak treningu = 0)
      const prevW = [];
      for (let k = 1; k <= 4; k++) { const d = day_(a.w); d.setUTCDate(d.getUTCDate() - 7 * k); const p = byClient[c].find(z => z.w === iso_(d)); prevW.push(p ? p.srpe : 0); }
      const firstW = weeks.find(z => z.srpeN > 0);
      const histW = firstW ? Math.round((day_(a.w) - day_(firstW.w)) / 6048e5) : 0;
      const nW = Math.min(4, histW);
      const chronic = nW ? prevW.slice(0, nW).reduce((s2, v) => s2 + v, 0) / nW : 0;
      const acwr = a.srpeN && histW >= 3 && chronic > 0 ? a.srpe / chronic : NaN;
      // tydzień lżejszy z planu (deload): planowany tonaż ≥ 25% niższy niż średnia 3 poprzednich
      const pPrev = weeks.slice(Math.max(0, i - 3), i).map(z => z.planTon).filter(v => v > 0);
      const planLight = pPrev.length > 0 && a.planTon > 0 && a.planTon <= 0.75 * pPrev.reduce((s2, v) => s2 + v, 0) / pPrev.length;
      // e1RM: bieżący tydzień vs średnia z 2 poprzednich (te same ćwiczenia główne)
      const chg = (back) => {
        const prev = weeks.slice(Math.max(0, i - back), i), d = [];
        Object.keys(a.e1).forEach(k => {
          const pv = prev.map(p => p.e1[k]).filter(v => v > 0);
          if (pv.length) d.push(a.e1[k] / (pv.reduce((s, v) => s + v, 0) / pv.length) - 1);
        });
        return d.length ? 100 * d.reduce((s, v) => s + v, 0) / d.length : NaN;
      };
      const e1chg = chg(2), e1flat3 = i >= 3 ? chg(3) : NaN;
      const rpeVs = a.rpeDiff.length ? a.rpeDiff.reduce((s, v) => s + v, 0) / a.rpeDiff.length : NaN;
      const failPct = a.strWork ? 100 * a.strFail / a.strWork : NaN;
      const T = M[c] ? { aR: 1.4, aO: 1.2, mO: 7, mR: 15 } : { aR: 1.5, aO: 1.3, mO: 10, mR: 20 };
      const o = a.o, prev3 = weeks.slice(Math.max(0, i - 3), i);
      const missPct = o.loSets ? 100 * o.loMiss / o.loSets : NaN;
      const vd = [];
      Object.keys(a.ex).forEach(k => {
        const cur = avg_(a.ex[k].v80), pv = prev3.map(p => p.ex[k] ? avg_(p.ex[k].v80) : NaN).filter(v => v > 0);
        if (cur > 0 && pv.length) vd.push(cur - avg_(pv));
      });
      const vbtChg = avg_(vd);
      const nl90prev = avg_(prev3.map(p => p.o.nl90));
      const nl90jump = nl90prev > 0 && o.nl90 > 1.5 * nl90prev && o.nl90 - nl90prev >= 4;
      const OS = [];
      const lowFeel = a.feel.filter(f => f <= 2).length;
      const feelAvg = a.feel.length ? a.feel.reduce((s, v) => s + v, 0) / a.feel.length : NaN;
      const R = [], O = [], L = [];
      if (acwr > T.aR) R.push('ACWR > ' + T.aR); else if (acwr > T.aO) O.push('ACWR ' + T.aO + '–' + T.aR); else if (acwr < 0.8) L.push('ACWR < 0,8');
      if (a.olyAny) {
        if (missPct > T.mR) OS.push('R', 'spalone < 85%: ' + r1_(missPct) + '%');
        else if (missPct > T.mO) OS.push('O', 'spalone < 85%: ' + r1_(missPct) + '%');
        if (vbtChg <= -0.05) OS.push('O', 'VBT 80–90% ' + r2_(vbtChg) + ' m/s');
        if (nl90jump) OS.push('O', 'NL > 90% +' + Math.round(100 * (o.nl90 / nl90prev - 1)) + '%');
        for (let k = 0; k < OS.length; k += 2) (OS[k] === 'R' ? R : O).push(OS[k + 1]);
      }
      if (e1chg <= -5) R.push('e1RM −5% lub więcej'); else if (e1chg <= -2.5) O.push('e1RM spada');
      if (failPct > 10) R.push('FAIL > 10%'); else if (failPct >= 5) O.push('FAIL 5–10%');
      if (lowFeel >= 2) R.push('samopoczucie ≤ 2 (2×)'); else if (lowFeel === 1) O.push('samopoczucie ≤ 2');
      if (a.pain > 3) R.push('ból > 3/10');
      if (mono > 2) R.push('monotonia > 2'); else if (mono > 1.5) O.push('monotonia > 1,5');
      if (rpeVs >= 1) O.push('RPE ≥ +1 ponad plan'); else if (rpeVs <= -1.5) L.push('RPE ≤ −1,5 poniżej planu');
      if (Math.abs(e1flat3) < 1) L.push('e1RM płaski 3 tyg.');
      if (a.work && a.fail === 0 && feelAvg >= 4.8) L.push('0 FAIL, samopoczucie 5');
      if (planLight) L.length = 0;                                             // deload z planu ≠ „za lekko”
      const enough = a.work > 0 && (i > 0 || a.srpeN > 0);
      const status = !enough ? '– za mało danych'
        : (R.length >= 2 || (R.length && O.length)) ? '🔴 za dużo'
        : (R.length || O.length) ? '🟠 uwaga'
        : L.length >= 2 ? '🔵 za lekko' : '🟢 OK';
      rows.push([c, a.w, Object.keys(a.planW).join(','), a.sess, a.planned ? Math.round(100 * a.donePlanned / a.planned) : '',
        a.work, a.hard, Math.round(a.ton), a.nl || '', a.nl ? r1_(100 * a.intSum / a.nl) : '', r1_(failPct), a.addDrop,
        a.srpeN ? Math.round(a.srpe) : '', r2_(acwr), r2_(mono), isFinite(mono) ? Math.round(a.srpe * mono) : '', r1_(e1chg), r2_(rpeVs),
        r1_(feelAvg), a.feel.length ? Math.min(...a.feel) : '', isNaN(a.pain) ? '' : a.pain, status,
        (planLight ? ['tydzień lżejszy z planu'] : []).concat(R, O, L).join('; ')]);
      if (a.olyAny) {
        const nlAll = GROUPS.reduce((s2, g) => s2 + o.nl[g], 0), spec = nlAll - o.nl.I, zAll = o.zones.reduce((s2, v) => s2 + v, 0);
        const mx = g => o.maxKg[g] ? o.maxKg[g] + ' kg' + (o.maxRel[g] ? ' · ' + Math.round(100 * o.maxRel[g]) + '%' : '') + ' (' + o.maxName[g] + ')' : '';
        const sig = []; for (let k = 0; k < OS.length; k += 2) sig.push(OS[k + 1]);
        olyRows.push([c, a.w, M[c] ? 'TAK' : ''].concat(GROUPS.map(g => o.nl[g] || ''), [nlAll, nlAll ? Math.round(100 * spec / nlAll) : ''],
          ['R', 'P', 'CR', 'CP', 'PS'].map(g => o.intN[g] ? r1_(100 * o.int[g] / o.intN[g]) : ''),
          o.zones.map(z => z || ''), [zAll ? Math.round(100 * (o.zones[3] + o.zones[4] + o.zones[5]) / zAll) : '', o.nl90 || '',
          mx('R'), mx('P'), o.hiSets ? Math.round(100 * o.hiMade / o.hiSets) : '', isFinite(missPct) ? r1_(missPct) : '',
          isFinite(vbtChg) ? r2_(vbtChg) : '', sig.join('; ')]));
      }
      Object.keys(a.ex).sort().forEach(k => {
        const x = a.ex[k];
        exRows.push([c, a.w, k, x.sets, Math.round(x.ton), x.e1 ? r1_(x.e1) : '', x.nl || '', x.nl ? r1_(100 * x.intSum / x.nl) : '',
          x.rpe.length ? r1_(x.rpe.reduce((s, v) => s + v, 0) / x.rpe.length) : '', x.fail || '']);
      });
    });
  });
  return { rows, exRows, olyRows };
}

/* ================== BLOKI (klient × blok, historia współpracy) ==================
 * Blok = kolumna Plan „blok” (pusta = „(bez bloku)”). Liczone z całej historii przy każdym podsumowaniu.
 * Kolumna „wnioski” należy do trenera: keepNotes_ przenosi ją między przeliczeniami (klucz klient|blok).
 */
const BLOK_HEADERS = ['klient', 'blok', 'od', 'do', 'tygodnie', 'jednostki', 'wykonanie_%', 'tonaz_kg', 'e1RM_zm',
  'najlepsze_boje', 'sRPE_sr', 'samopocz_sr', 'dyspozycja', 'bol_max', 'statusy', 'wnioski'];
const NO_BLOCK = '(bez bloku)';

function computeBlocks_(plan, log, ses, dys, sumRows, opts) {
  const key = (...a) => a.map(String).join('|');
  const AD = unitDates_(ses, opts && opts.localDay);
  const U = {}, P = {}, X = {};
  const blockOf = r => String(r.blok === undefined || r.blok === null ? '' : r.blok).trim() || NO_BLOCK;
  plan.forEach(r => {
    const c = String(r.klient).toLowerCase(); if (!c) return;
    const u = key(c, r.tydzien, r.jednostka), b = blockOf(r);
    P[key(c, r.tydzien, r.jednostka, r.nr)] = r;
    const x = X[c + '|' + b] || (X[c + '|' + b] = { c, b, units: {}, weeks: [], planned: 0, donePlanned: 0, ton: 0,
      e1: {}, best: { R: [0, ''], P: [0, ''] }, rpe: [], feel: [], pain: NaN, dates: [] });
    U[u] = x;
    x.planned += n_(r.serie) || 0;
    if (!x.units[u]) { x.units[u] = 0; x.weeks.push(n_(r.tydzien)); const pd = blank_(r.data) ? NaN : day_(r.data), d = AD[u] || (isNaN(pd) ? '' : iso_(pd)); if (d) x.dates.push(d); }
  });
  log.forEach(l => {
    if (String(l.wykonane).toUpperCase() !== 'TAK') return;
    const c = String(l.klient).toLowerCase(), s = String(l.seria), x = U[key(c, l.tydzien, l.jednostka)];
    if (!x || /^R/i.test(s)) return;
    const pr = P[key(c, l.tydzien, l.jednostka, l.nr_cw)] || {};
    const fail = /FAIL/.test(String(l.typ || '')), kg = n_(l.kg), reps = n_(l.powt), rpe = n_(l.rpe);
    if (/^\d+$/.test(s) && +s <= (n_(pr.serie) || 0)) x.donePlanned++;
    if (kg > 0 && reps > 0) x.ton += kg * reps;
    const name = String(l.cwiczenie), grp = groupOf_(pr.grupa, name);
    if ((grp === 'R' || grp === 'P') && !fail && kg > x.best[grp][0]) x.best[grp] = [kg, name];
    if (grp !== 'R' && grp !== 'P' && String(pr.prio) === 'A' && !fail && rpe >= 5 && kg > 0 && reps > 0) {
      const e = kg * (1 + (reps + (10 - rpe)) / 30), w = n_(l.tydzien), m = x.e1[name] || (x.e1[name] = {});
      m[w] = Math.max(m[w] || 0, e);
    }
  });
  ses.forEach(s => {
    const x = U[key(String(s.klient).toLowerCase(), s.tydzien, s.jednostka)]; if (!x) return;
    x.units[key(String(s.klient).toLowerCase(), s.tydzien, s.jednostka)] = 1;
    const r = n_(s.rpe_sesji), f = n_(s.samopoczucie);
    if (r >= 0) x.rpe.push(r);
    if (f > 0) x.feel.push(f);
    const pm = !blank_(s.bol_max) ? n_(s.bol_max) : Math.max(n_(s.bol_kolano) || -1, n_(s.bol_bark) || -1);
    if (pm >= 0) x.pain = isNaN(x.pain) ? pm : Math.max(x.pain, pm);
  });
  const SI = SUM_HEADERS.indexOf('status');
  const pl = v => String(r1_(v)).replace('.', ',');
  return Object.values(X).map(x => {
    const d = x.dates.slice().sort(), od = d[0] || '', dd = d[d.length - 1] || '';
    const wk = x.weeks.filter(w => w > 0), units = Object.values(x.units);
    const e1 = Object.keys(x.e1).sort().map(n => {
      const ws = Object.keys(x.e1[n]).map(Number).sort((a, b) => a - b);
      if (ws.length < 2) return '';
      const a = x.e1[n][ws[0]], b = x.e1[n][ws[ws.length - 1]];
      return n + ' ' + Math.round(a) + '→' + Math.round(b) + ' (' + (b >= a ? '+' : '') + pl(100 * (b / a - 1)) + '%)';
    }).filter(Boolean).join('; ');
    const best = ['R', 'P'].filter(g => x.best[g][0]).map(g => g + ' ' + x.best[g][0] + ' kg (' + x.best[g][1] + ')').join('; ');
    const inRange = t => od && dd && t >= od && t <= dd;
    const verd = {};
    (dys || []).forEach(r => {
      const t = r.data instanceof Date ? iso_(day_(r.data)) : String(r.data || '').slice(0, 10);
      if (String(r.klient).toLowerCase() === x.c && inRange(t) && r.werdykt) verd[r.werdykt] = (verd[r.werdykt] || 0) + 1;
    });
    const st = { '🔴': 0, '🟠': 0 };
    (sumRows || []).forEach(r => {
      if (r[0] !== x.c || !od || r[1] < weekOf_(od) || r[1] > weekOf_(dd)) return;
      const s = String(r[SI] || '');
      if (s.indexOf('🔴') === 0) st['🔴']++; else if (s.indexOf('🟠') === 0) st['🟠']++;
    });
    return [x.c, x.b, od, dd, wk.length ? Math.min(...wk) + '–' + Math.max(...wk) : '',
      units.filter(Boolean).length + '/' + units.length, x.planned ? Math.round(100 * x.donePlanned / x.planned) : '',
      Math.round(x.ton), e1, best, x.rpe.length ? r1_(avg_(x.rpe)) : '', x.feel.length ? r1_(avg_(x.feel)) : '',
      Object.keys(verd).map(k => k + ' ' + verd[k]).join(', '), isNaN(x.pain) ? '' : x.pain,
      st['🔴'] || st['🟠'] ? '🔴 ' + st['🔴'] + ', 🟠 ' + st['🟠'] : '', ''];
  }).sort((a, b) => a[0].localeCompare(b[0]) || String(a[2]).localeCompare(String(b[2])));
}

/** Przenosi „wnioski” trenera do nowych wierszy; blok, który zniknął z planu, zostaje z wnioskami. */
function keepNotes_(rows, old) {
  const W = BLOK_HEADERS.indexOf('wnioski'), seen = {}, prev = {};
  (old || []).forEach(r => { if (String(r.wnioski || '').trim()) prev[String(r.klient) + '|' + String(r.blok)] = r; });
  const out = rows.map(r => { const k = r[0] + '|' + r[1]; seen[k] = 1; const c = r.slice(); if (prev[k]) c[W] = prev[k].wnioski; return c; });
  Object.keys(prev).filter(k => !seen[k]).forEach(k => out.push(BLOK_HEADERS.map(h => prev[k][h] === undefined ? '' : prev[k][h])));
  return out;
}

/* ================== WCZYTYWANIE PLANÓW Z DRIVE ==================
 * Plik JSON w „Trening – Klienci/_plany/”: lista wierszy planu (klucze = PLAN_HEADERS; data, dod_serie, drop, grupa,
 * zamienniki, blok opcjonalne). Poprawny plik → podmiana wierszy klientów z pliku w zakładce Plan, plik przeniesiony
 * do „_plany/wczytane”. Jednostki już zrobione (wpis w Sesjach) zostają z dotychczasowego planu; plik, który
 * nadpisałby zrobioną jednostkę innego bloku (ten sam tydzień i jednostka), trafia do „_plany/bledy”.
 * Każdy import zapisuje wiersz w zakładce „Import”.
 */
const PLAN_HEADERS = ['klient', 'tydzien', 'jednostka', 'tytul', 'data', 'nr', 'cwiczenie', 'prio', 'serie', 'powt',
  'procent', 'kg', 'rpe_max', 'uwagi', 'dod_serie', 'drop', 'grupa', 'zamienniki', 'blok'];
const PLAN_REQUIRED = ['klient', 'tydzien', 'jednostka', 'nr', 'cwiczenie', 'serie', 'powt'];

function wczytajPlany() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const dir = child_(rootFolder_(), '_plany'), ok = child_(dir, 'wczytane'), bad = child_(dir, 'bledy');
    const it = dir.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (!/\.json$/i.test(f.getName())) continue;
      let rows, errs;
      try {
        rows = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
        if (!Array.isArray(rows)) rows = rows && rows.rows;
        errs = validatePlan_(rows);
      } catch (e) { errs = ['JSON: ' + e.message]; }
      if (errs.length) {
        f.moveTo(bad);
        importLog_(f.getName(), 'BŁĄD', 0, '', errs.slice(0, 10).join(' | '));
        continue;
      }
      const m = mergePlan_(tableOf_('Plan'), rows, tableOf_('Sesje'));
      if (m.errors.length) {
        f.moveTo(bad);
        importLog_(f.getName(), 'BŁĄD', 0, m.clients.join(', '), m.errors.slice(0, 10).join(' | '));
        continue;
      }
      writePlanRows_(m.rows);
      f.moveTo(ok);
      importLog_(f.getName(), m.warnings.length ? 'OK (uwagi)' : 'OK', rows.length, m.clients.join(', '), m.warnings.slice(0, 10).join(' | '));
    }
  } finally { lock.releaseLock(); }
}

/** Zwraca listę błędów (pusta = OK). Czysta funkcja – testowana w tests/. */
function validatePlan_(rows) {
  const e = [];
  if (!Array.isArray(rows) || !rows.length) return ['Plik nie zawiera listy wierszy planu'];
  const seen = {};
  rows.forEach((r, i) => {
    const w = 'wiersz ' + (i + 1) + ': ';
    PLAN_REQUIRED.forEach(k => { if (r[k] === undefined || r[k] === null || r[k] === '') e.push(w + 'brak „' + k + '”'); });
    if (r.data && !/^\d{4}-\d{2}-\d{2}$/.test(String(r.data))) e.push(w + 'data nie w formacie RRRR-MM-DD');
    if (r.serie !== undefined && !(Number(r.serie) >= 1)) e.push(w + 'serie musi być ≥ 1');
    if (r.tydzien !== undefined && !(Number(r.tydzien) >= 1)) e.push(w + 'tydzien musi być ≥ 1');
    if (r.prio && ['A', 'B', 'K'].indexOf(String(r.prio)) < 0) e.push(w + 'prio tylko A/B/K');
    if (r.procent !== undefined && r.procent !== '' && !(Number(r.procent) > 0 && Number(r.procent) <= 1.3)) e.push(w + 'procent jako ułamek (np. 0.75)');
    if (r.grupa && GROUPS.indexOf(String(r.grupa).toUpperCase()) < 0) e.push(w + 'grupa tylko R/P/CR/CP/PS/I');
    const id = [String(r.klient).toLowerCase(), r.tydzien, r.jednostka, r.nr].join('|');
    if (seen[id]) e.push(w + 'powtórzony nr ' + r.nr + ' w ' + r.jednostka + ' tyg. ' + r.tydzien);
    seen[id] = 1;
  });
  return e;
}

/**
 * Czysta funkcja: nowy plan klientów z pliku + reszta zakładki Plan.
 * Zrobione jednostki (Sesje) klientów z pliku zostają z dotychczasowego planu; wiersze pliku dla nich są pomijane
 * (uwaga), a gdy blok w pliku i w planie się różni — błąd (tygodnie trzeba numerować ciągle).
 */
function mergePlan_(existing, incoming, ses) {
  const lc = v => String(v === undefined || v === null ? '' : v).toLowerCase();
  const blk = r => String(r.blok === undefined || r.blok === null ? '' : r.blok).trim();
  const unit = r => [lc(r.klient), r.tydzien, r.jednostka].join('|');
  const clients = [...new Set(incoming.map(r => lc(r.klient)))];
  const done = {};
  ses.forEach(s => { done[unit(s)] = 1; });
  const others = [], kept = [], keptBlock = {};
  existing.forEach(r => {
    if (r.klient === '' || r.klient === undefined) return;
    if (clients.indexOf(lc(r.klient)) < 0) others.push(r);
    else if (done[unit(r)]) { kept.push(r); keptBlock[unit(r)] = blk(r); }
  });
  const errors = [], warnings = [], fresh = [], skipped = {};
  incoming.forEach(r => {
    const u = unit(r);
    if (!(u in keptBlock)) { fresh.push(r); return; }
    if (blk(r) && keptBlock[u] !== blk(r)) {                              // plik z blokiem ≠ blok zrobionej jednostki
      const was = keptBlock[u] || NO_BLOCK;
      if (!skipped[u]) errors.push(lc(r.klient) + ' tyg. ' + r.tydzien + ' ' + r.jednostka + ': już zrobiona w bloku ' + was +
        ', plik ma blok ' + blk(r) + ' — numeruj tygodnie dalej (np. od ' + (Math.max(...existing.filter(e => lc(e.klient) === lc(r.klient)).map(e => Number(e.tydzien) || 0)) + 1) + ')');
    } else if (!skipped[u]) warnings.push(lc(r.klient) + ' tyg. ' + r.tydzien + ' ' + r.jednostka + ': zrobiona, zostaje bez zmian');
    skipped[u] = 1;
  });
  return { rows: others.concat(kept, fresh), clients, errors, warnings };
}

/** Zapisuje całą zakładkę Plan (wiersze z mergePlan_); kolumny układane wg PLAN_HEADERS (starsze arkusze też). */
function writePlanRows_(all0) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Plan') || ss.insertSheet('Plan');
  const toRow = r => PLAN_HEADERS.map(h => {
    let v = r[h] === undefined || r[h] === null ? '' : r[h];
    if (h === 'klient') v = String(v).toLowerCase();
    if (h === 'powt' || h === 'data') v = v instanceof Date ? fmtDate_(v) : String(v);
    return v;
  });
  const all = [PLAN_HEADERS].concat(all0.map(toRow));
  sh.clearContents();
  ['E:E', 'J:J', 'L:L'].forEach(a => sh.getRange(a).setNumberFormat('@'));   // przed zapisem: „6-8” nie zmieni się w datę
  sh.getRange(1, 1, all.length, PLAN_HEADERS.length).setValues(all);
  sh.setFrozenRows(1);
}

function importLog_(file, status, n, clients, msg) {
  const sh = sheet_('Import', ['kiedy', 'plik', 'status', 'wierszy', 'klienci', 'bledy']);
  sh.appendRow([new Date(), file, status, n, clients, msg]);
}
