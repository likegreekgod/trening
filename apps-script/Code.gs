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
  const cwIx = exIndex_(tableOf_('Ćwiczenia')), memo = {}, pm = {};
  const dxOf = n => { const k = exKey_(n); if (!k) return exInfo_(cwIx, ''); if (!memo[k]) { memo[k] = exInfo_(cwIx, n); if (memo[k].parts.length) pm[k] = memo[k].parts; } return memo[k]; };
  const rows = plan.filter(r => String(r[idx('klient')]).toLowerCase() === client.id)
    .map(r => { const dx = dxOf(r[idx('cwiczenie')]), own = opt(r, 'zamienniki').split(';').map(s => s.trim()).filter(Boolean); return {
      week: Number(r[idx('tydzien')]), day: String(r[idx('jednostka')]), title: String(r[idx('tytul')]),
      date: fmtDate_(r[idx('data')]), order: Number(r[idx('nr')]), name: String(r[idx('cwiczenie')]),
      prio: String(r[idx('prio')]), sets: Number(r[idx('serie')]) || 1, reps: txt_(r[idx('powt')]),
      pct: r[idx('procent')] === '' ? null : Number(String(r[idx('procent')]).replace(',', '.')),
      kg: numOr_(txt_(r[idx('kg')])), rpe: numOr_(r[idx('rpe_max')]), note: String(r[idx('uwagi')]),
      extra: ix < 0 || r[ix] === '' || r[ix] === null ? null : (Number(r[ix]) || 0),
      drop: idr < 0 ? 0 : (Number(r[idr]) || 0),
      group: opt(r, 'grupa').toUpperCase() || dx.group || '', block: opt(r, 'blok'),
      swaps: own.length ? own : dx.swaps, infos: dx.infos, parts: dx.parts
    }; });
  const sessions = readRows_('Sesje', SES_HEADERS, client.id), logs = readRows_('Log', LOG_HEADERS, client.id);
  logs.forEach(l => dxOf(l.cwiczenie));
  rows.forEach(r => r.swaps.forEach(dxOf));
  fillDates_(rows, sessions, today_());
  return { cfg: { name: client.name, pain: client.pain, simple: client.simple, extra: client.extra,
      swap: client.swap, scale: client.scale, olyCeil: client.olyCeil },
    plan: rows, logs: logs, sessions: sessions,
    readiness: readRows_('Dyspozycja', DYS_HEADERS, client.id),
    parts: pm };
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
  sheet_('Ćwiczenia', CW_HEADERS);
  const f = rootFolder_();
  UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  Logger.log('OK. Folder na filmy: ' + f.getUrl());
}

function newKey_() {
  return 'k' + Utilities.getUuid().replace(/-/g, '').slice(0, 11);
}

/** Adres, pod który prowadzą linki klientów (PWA albo /exec). Pusty = brak wdrożenia. */
function linkBase_() {
  // Adres z Zarządzaj wdrożeniami → „URL aplikacji internetowej”, zapisany we Właściwościach skryptu jako WEBAPP_URL.
  // getService().getUrl() potrafi zwrócić adres wersji testowej (head), który po zamianie /dev→/exec wymaga logowania.
  const props = PropertiesService.getScriptProperties();
  const pwa = String(props.getProperty('PWA_URL') || '').trim();   // np. https://login.github.io/trening/
  const saved = props.getProperty('WEBAPP_URL');
  const url = String(saved || ScriptApp.getService().getUrl() || '').trim().replace(/\?.*$/, '').replace(/\/dev$/, '/exec');
  if (!pwa && url && !saved) Logger.log('UWAGA: brak WEBAPP_URL we Właściwościach skryptu — link może nie działać dla klientów.');
  return pwa || url;
}

/** Po wdrożeniu: uruchom, aby wypisać linki dla klientów (Dziennik wykonania). */
function linki() {
  const base = linkBase_();
  if (!base) { Logger.log('Brak wdrożenia — najpierw Wdróż → Nowe wdrożenie.'); return; }
  const sh = SpreadsheetApp.getActive().getSheetByName('Klienci');
  if (!sh) { Logger.log('Brak zakładki Klienci — uruchom najpierw setup.'); return; }
  sh.getRange(1, 5).setValue('link');
  const v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    const link = base + '?k=' + v[i][0];
    sh.getRange(i + 1, 5).setValue(link);
    Logger.log(v[i][2] + ': ' + link);
  }
}

/* ================== NOWY KLIENT (menu Trening → Dodaj klienta) ================== */

/** „Mikołaj Góral” → „mikolaj-goral”: małe litery, bez polskich znaków, tylko a–z 0–9 i „-”. */
function slugId_(name) {
  const map = { 'ł': 'l', 'Ł': 'l' };
  return String(name || '').replace(/[łŁ]/g, c => map[c]).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Sprawdza formularz i buduje wiersz Klienci (A–I). Czysta funkcja: {row, id} albo {error}. */
function buildClientRow_(f, existingIds, key) {
  f = f || {};
  const name = String(f.imie || '').trim();
  if (!name) return { error: 'Podaj imię.' };
  const id = slugId_(String(f.id || '').trim() || name);
  if (!id) return { error: 'ID klienta może zawierać tylko litery i cyfry.' };
  if ((existingIds || []).map(x => String(x).toLowerCase()).indexOf(id) >= 0)
    return { error: 'Klient „' + id + '” już istnieje — wybierz inne ID (np. ' + id + '-2).' };
  const extra = String(f.dod_serie === undefined ? '' : f.dod_serie).trim();
  if (extra !== '' && !(Number(extra) >= 0 && Number(extra) <= 5)) return { error: 'Dodatkowe serie: liczba 0–5.' };
  return { id: id, row: [key, id, name, 'TAK', '', f.bol ? 'TAK' : '', f.prosty ? 'PROSTY' : '',
    extra === '' ? '' : Number(extra), f.masters ? 'TAK' : ''] };
}

function dodajKlienta() {
  const html = HtmlService.createHtmlOutput(DODAJ_KLIENTA_HTML_).setWidth(380).setHeight(470);
  SpreadsheetApp.getUi().showModalDialog(html, 'Nowy klient');
}

/** Wywoływane z okna „Nowy klient”. Zwraca {ok, id, link} albo {error}. */
function dodajKlientaZapisz(f) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_('Klienci', ['klucz', 'klient_id', 'imie', 'aktywny', 'link', 'bol', 'tryb', 'dod_serie', 'masters']);
    const ids = sh.getLastRow() > 1 ? sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().map(r => r[0]) : [];
    const res = buildClientRow_(f, ids, newKey_());
    if (res.error) return res;
    const base = linkBase_();
    if (base) res.row[4] = base + '?k=' + res.row[0];
    const r = sh.getLastRow() + 1;
    sh.getRange(r, 1).setNumberFormat('@');                       // klucz zawsze jako tekst
    sh.getRange(r, 1, 1, res.row.length).setValues([res.row]);
    rootFolder_();                                                // folder na filmy (Trening – Klienci) istnieje
    return { ok: true, id: res.id, link: res.row[4] || '' };
  } finally { lock.releaseLock(); }
}

const DODAJ_KLIENTA_HTML_ = `<!doctype html><html><head><base target="_top"><style>
body{font:14px/1.4 Arial,sans-serif;margin:0;padding:4px 2px}label{display:block;margin:10px 0 4px;font-weight:bold}
input[type=text],input[type=number]{width:100%;box-sizing:border-box;padding:7px;font-size:14px}
.chk{display:flex;gap:8px;align-items:center;margin:8px 0;font-weight:normal}small{color:#666;font-weight:normal}
button{margin-top:14px;padding:8px 16px;font-size:14px;cursor:pointer}#msg{margin-top:12px}.err{color:#b00020}
.ok{background:#e6f4ea;padding:10px;border-radius:4px;word-break:break-all}</style></head><body>
<form id="f" onsubmit="go(event)">
<label>Imię <small>(widoczne w aplikacji)</small></label><input type="text" name="imie" id="imie" required oninput="sug()">
<label>ID klienta <small>(w planach JSON: „klient”)</small></label><input type="text" name="id" id="id" placeholder="np. mikolaj">
<label class="chk"><input type="checkbox" name="prosty"> Tryb prosty <small>(słowa zamiast RPE)</small></label>
<label class="chk"><input type="checkbox" name="bol"> Ból kolana/barku zawsze widoczny</label>
<label class="chk"><input type="checkbox" name="masters"> Masters <small>(ostrzejsze progi)</small></label>
<label>Dodatkowe serie <small>(domyślny limit, puste = brak)</small></label><input type="number" name="dod_serie" min="0" max="5">
<button type="submit" id="b">Dodaj klienta</button></form><div id="msg"></div>
<script>
var touched=false;document.getElementById('id').addEventListener('input',function(){touched=true});
function slug(s){return s.replace(/[łŁ]/g,'l').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}
function sug(){if(!touched)document.getElementById('id').value=slug(document.getElementById('imie').value)}
function go(e){e.preventDefault();var f=e.target,b=document.getElementById('b'),m=document.getElementById('msg');
 var d={imie:f.imie.value,id:f.id.value,prosty:f.prosty.checked,bol:f.bol.checked,masters:f.masters.checked,dod_serie:f.dod_serie.value};
 b.disabled=true;m.textContent='Zapisuję…';m.className='';
 google.script.run.withSuccessHandler(function(r){b.disabled=false;
  if(r.error){m.textContent=r.error;m.className='err';return}
  f.style.display='none';m.className='ok';
  m.innerHTML='Dodano: <b>'+r.id+'</b><br><br>'+(r.link?'Link dla klienta:<br><input type="text" readonly value="'+r.link+'" onclick="this.select()" style="width:100%;margin-top:4px">':'Brak wdrożenia — uruchom <b>linki</b> po wdrożeniu.')+'<br><br>W planach JSON użyj: "klient": "'+r.id+'"';
 }).withFailureHandler(function(err){b.disabled=false;m.textContent=String(err.message||err);m.className='err'}).dodajKlientaZapisz(d);}
</script></body></html>`;

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
    .addItem('Przegląd klientów', 'przeglad')
    .addItem('Wczytaj plany z Drive', 'wczytajPlany')
    .addItem('Odśwież podsumowanie', 'podsumowanie')
    .addSeparator()
    .addItem('Dodaj klienta', 'dodajKlienta')
    .addItem('Odśwież linki klientów', 'menuLinki')
    .addSeparator()
    .addItem('Wczytaj bazę ćwiczeń', 'wczytajBazeCwiczen')
    .addItem('Uzupełnij listę ćwiczeń', 'uzupelnijCwiczenia')
    .addItem('Sprawdź arkusz', 'sprawdzArkusz')
    .addItem('Usuń plany bez klienta', 'usunPlanyBezKlienta')
    .addItem('Zainstaluj wyzwalacze', 'menuWyzwalacze')
    .addItem('Ustaw adres alertu', 'ustawAlert')
    .addToUi();
}

/* ---------- menu Trening: to, co dotąd wymagało edytora Apps Script ---------- */
function alert_(title, text) { SpreadsheetApp.getUi().alert(title, text, SpreadsheetApp.getUi().ButtonSet.OK); }

function menuLinki() {
  if (!linkBase_()) { alert_('Linki klientów', 'Brak adresu aplikacji: ustaw właściwość skryptu PWA_URL.'); return; }
  linki();
  const n = Math.max(0, SpreadsheetApp.getActive().getSheetByName('Klienci').getLastRow() - 1);
  alert_('Linki klientów', 'Odświeżono linki w kolumnie E: ' + n + '.');
}

function menuWyzwalacze() {
  instalujWyzwalacze();
  alert_('Wyzwalacze', 'Zainstalowano: podsumowanie i przegląd codziennie ok. 5:00, plany z Drive co 15 min.');
}

/**
 * Czysta funkcja: lista uwag do arkusza, [['błąd' | 'uwaga' | 'info', tekst], …]; pusta = wszystko w porządku.
 * d: {klienci, plan (tableOf_), pwaUrl, triggers (nazwy funkcji), bledy, czeka (liczba plików w _plany/bledy i _plany), today}
 */
function diagnose_(d) {
  const out = [], lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  const add = (lvl, txt) => out.push([lvl, txt]);
  if (!String(d.pwaUrl || '').trim()) add('błąd', 'Brak właściwości skryptu PWA_URL: linki klientów nie prowadzą do aplikacji.');
  ['podsumowanie', 'wczytajPlany'].forEach(fn => { if ((d.triggers || []).indexOf(fn) < 0) add('błąd', 'Brak wyzwalacza „' + fn + '”: menu Trening → Zainstaluj wyzwalacze.'); });
  const active = (d.klienci || []).filter(k => !blank_(k.klient_id) && String(k.aktywny).toUpperCase() !== 'NIE');
  const ids = {};
  (d.klienci || []).forEach(k => { if (!blank_(k.klient_id)) ids[lc(k.klient_id)] = (ids[lc(k.klient_id)] || 0) + 1; });
  Object.keys(ids).forEach(id => { if (ids[id] > 1) add('błąd', 'Powtórzone klient_id „' + id + '” w zakładce Klienci (' + ids[id] + ' wiersze).'); });
  active.forEach(k => {
    const id = lc(k.klient_id);
    if (!/^k[0-9a-f]{11}$/.test(String(k.klucz))) add('błąd', id + ': brak poprawnego klucza (uruchom setup w edytorze albo dodaj klienta z menu).');
    else if (blank_(k.link) || String(k.link).indexOf(String(k.klucz)) < 0) add('uwaga', id + ': brak aktualnego linku w kolumnie E (menu Trening → Odśwież linki klientów).');
  });
  // plan: klienci bez planu, plan bez klienta, zepsute komórki, koniec planu, brak bloku
  const P = {};
  (d.plan || []).forEach((r, i) => {
    const c = lc(r.klient); if (!c) return;
    const p = P[c] || (P[c] = { n: 0, end: '', noBlock: 0, badReps: [] });
    p.n++;
    if (Object.prototype.toString.call(r.powt) === '[object Date]') p.badReps.push(i + 2);   // Arkusze zamieniły „6-8” w datę
    if (blank_(r.blok)) p.noBlock++;
    const dt = blank_(r.data) ? NaN : day_(r.data); if (!isNaN(dt) && iso_(dt) > p.end) p.end = iso_(dt);
  });
  active.forEach(k => { if (!P[lc(k.klient_id)]) add('uwaga', lc(k.klient_id) + ': aktywny klient bez planu.'); });
  Object.keys(P).forEach(c => {
    const p = P[c];
    if (!ids[c]) add('uwaga', 'Plan dla „' + c + '”, którego nie ma w zakładce Klienci (' + p.n + ' wierszy).');
    if (p.badReps.length) add('błąd', c + ': kolumna powt zamieniona na datę w wierszach Planu ' + p.badReps.slice(0, 5).join(', ') + (p.badReps.length > 5 ? '…' : '') + ' (wczytaj plan ponownie z pliku).');
    if (ids[c] && p.end && d.today) {
      const left = Math.round((day_(p.end) - day_(d.today)) / 864e5);
      if (left < 0) add('uwaga', c + ': plan skończył się ' + p.end + '.'); else if (left <= 7) add('uwaga', c + ': plan kończy się za ' + left + ' dni (' + p.end + ').');
    }
    if (ids[c] && p.noBlock === p.n) add('info', c + ': plan bez kolumny blok; kolejny blok nazwij np. B2 i numeruj tygodnie dalej.');
  });
  if (d.bledy > 0) add('uwaga', 'Pliki w _plany/bledy: ' + d.bledy + ' (opis błędu w zakładce Import).');
  if (d.czeka > 0) add('info', 'Pliki czekające w _plany: ' + d.czeka + ' (menu Trening → Wczytaj plany z Drive).');
  return out;
}

function sprawdzArkusz() {
  let bledy = 0, czeka = 0;
  try {
    const dir = child_(rootFolder_(), '_plany'), count = it => { let n = 0; while (it.hasNext()) { if (/\.json$/i.test(it.next().getName())) n++; } return n; };
    czeka = count(dir.getFiles()); bledy = count(child_(dir, 'bledy').getFiles());
  } catch (e) { /* brak dostępu do Drive: pomijamy tę część */ }
  const res = diagnose_({ klienci: tableOf_('Klienci'), plan: tableOf_('Plan'), today: today_(), bledy: bledy, czeka: czeka,
    pwaUrl: PropertiesService.getScriptProperties().getProperty('PWA_URL'), triggers: ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()) });
  const mark = { 'błąd': '✗', 'uwaga': '!', 'info': '·' };
  alert_('Sprawdzenie arkusza', res.length ? res.map(r => mark[r[0]] + ' ' + r[1]).join('\n') : '✓ Wszystko w porządku.');
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

/** e: zdarzenie wyzwalacza czasowego (wtedy idzie też alert mailowy); z menu bez argumentu. */
function podsumowanie(e) {
  const localDay = t => Utilities.formatDate(new Date(t), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const plan = tableOf_('Plan'), log = tableOf_('Log'), ses = tableOf_('Sesje');
  const klienci = tableOf_('Klienci'), dys = tableOf_('Dyspozycja');
  const res = computeSummary_(plan, log, ses, klienci, { localDay });
  const bl = computeBlocks_(plan, log, ses, dys, res.rows, { localDay });
  const ov = computeOverview_(plan, log, ses, klienci, dys, res.rows, { today: today_(), localDay });
  writeTable_('Przegląd', PRZ_HEADERS, ov, (sh, n) => {
    if (!n) return;
    const c = PRZ_HEADERS.indexOf('pilnosc') + 1;
    sh.getRange(2, c, n, 1).setBackgrounds(ov.map(r => [r[c - 1] >= 3 ? '#f8c9c4' : r[c - 1] >= 1 ? '#fde2b8' : '#cdebd3']));
    ['do_reakcji', 'uwagi_klienta'].forEach(k => sh.getRange(2, PRZ_HEADERS.indexOf(k) + 1, n, 1).setWrap(true));
  });
  if (e && e.triggerUid) { try { alertRano_(ov); } catch (err) { Logger.log('alert: ' + err); } }
  writeTable_('Bloki', BLOK_HEADERS, keepNotes_(bl, tableOf_('Bloki')));
  writeTable_('Podsumowanie', SUM_HEADERS, res.rows, (sh, n) => {
    const col = SUM_HEADERS.indexOf('status') + 1;
    if (n) sh.getRange(2, col, n, 1).setBackgrounds(res.rows.map(r => [STATUS_BG[r[col - 1]] || '#ffffff']));
  });
  writeTable_('Podsumowanie_cw', SUMX_HEADERS, res.exRows);
  writeTable_('Podsumowanie_OLY', OLY_HEADERS, res.olyRows);
  writeTable_('Podsumowanie_partie', PART_HEADERS, computeParts_(plan, log, ses, tableOf_('Ćwiczenia'), { localDay }));
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

/* ================== ĆWICZENIA (baza: instruktaż, partie, zamienniki, grupa) ==================
 * Zakładka „Ćwiczenia”: jeden wiersz na ćwiczenie. Start: menu Trening → Wczytaj bazę ćwiczeń (CW_BAZA w Cwiczenia.gs).
 * instruktaz = link (film / opis) pod przyciskiem „Jak wykonać”; partia = partie mięśniowe („;”) do liczenia serii twardych;
 * aliasy („;”) = inne nazwy tego samego ćwiczenia używane w planach; zamienniki („;”) i grupa (R/P/CR/CP/PS/I) działają,
 * gdy plan ich nie podaje. Plan ma zawsze pierwszeństwo.
 * Dopasowanie nazwy z planu (exFind_): 1) dokładna nazwa lub alias, 2) nazwa podstawowa (bez nawiasów, „– TEST”,
 * „z pauzą…”, „, tempo …”), 3) te same słowa w innej kolejności i skróty (DB, SL, RDL…). Kompleks „A + B” bez własnego wiersza
 * dostaje instruktaż każdej rozpoznanej części. Wiersz z samą nazwą (bez danych) nie bierze udziału w dopasowaniu. „… 1¼” szuka najpierw wariantu „1-1/4 …”, potem ćwiczenia bez dopisku.
 */
const CW_HEADERS = ['cwiczenie', 'aliasy', 'instruktaz', 'partia', 'zamienniki', 'grupa'];
const PART_HEADERS = ['klient', 'tydzien_od', 'partia', 'serie', 'serie_twarde', 'tonaz_kg'];
const EX_ABBR = { db: 'dumbbell', kb: 'kettlebell', bb: 'barbell', sl: 'single leg', rdl: 'romanian deadlift', ohs: 'overhead squat' };
const EX_STOP = ['and', 'from', 'the', 'a', 'on', 'with', 'to'];
const exStr_ = v => String(v === undefined || v === null ? '' : v);
const exKey_ = v => exStr_(v).trim().replace(/\s+/g, ' ').toLowerCase();
/** nazwa podstawowa: bez nawiasów i dopisków z planu */
const exBase_ = v => exKey_(exStr_(v).replace(/\(.*?\)/g, ' ').replace(/\s[–-]\s*test\b.*$/i, '').replace(/\sz pauzą.*$/i, '').replace(/\s*,?\s*tempo\s.*$/i, '').replace(/1\s?¼/g, ' 1-1/4 '));
/** słowa nazwy podstawowej: skróty rozwinięte, liczba pojedyncza, kolejność bez znaczenia */
function exTok_(v) {
  return exBase_(v).replace(/(push|pull|chin|sit|step)-?up/g, '$1 up').replace(/[^a-z0-9ąćęłńóśźż ]/g, ' ').split(' ')
    .map(w => EX_ABBR[w] || w).join(' ').split(' ').filter(w => w && EX_STOP.indexOf(w) < 0)
    .map(w => w.replace(/ies$/, 'y').replace(/s$/, '')).sort().join(' ');
}

/** Czysta funkcja: wiersze zakładki Ćwiczenia → indeks {k: dokładne nazwy i aliasy, b: nazwy podstawowe, t: słowa}. Link tylko http(s). */
function exIndex_(rows) {
  const ix = { k: {}, b: {}, t: {} };
  (rows || []).forEach(r => {
    const name = exStr_(r.cwiczenie).trim().replace(/\s+/g, ' '); if (!name || cwEmpty_(r)) return;
    const url = exStr_(r.instruktaz).trim(), g = exStr_(r.grupa).trim().toUpperCase();
    const e = { name: name, info: /^https?:\/\/\S+$/i.test(url) ? url : '',
      parts: exStr_(r.partia).split(/[;,]/).map(s => s.trim().toLowerCase()).filter(Boolean),
      swaps: exStr_(r.zamienniki).split(';').map(s => s.trim()).filter(Boolean), group: GROUPS.indexOf(g) >= 0 ? g : '' };
    [name].concat(exStr_(r.aliasy).split(';')).forEach(n => {
      const k = exKey_(n), b = exBase_(n), t = exTok_(n); if (!k) return;
      ix.k[k] = e; if (b && !ix.b[b]) ix.b[b] = e; if (t && !ix.t[t]) ix.t[t] = e;
    });
  });
  return ix;
}

/** Czysta funkcja: wiersz bazy dla nazwy z planu albo null. */
function exFind_(ix, name) {
  const k = exKey_(name); if (!k) return null;
  const b = exBase_(name);
  return ix.k[k] || ix.k[b] || ix.b[b] || ix.t[exTok_(name)] || (/1-1\/4/.test(b) ? exFind_(ix, b.replace(/1-1\/4/g, ' ')) : null);
}

/** Czysta funkcja: {found, infos: [{n, u}], parts, swaps, group} dla nazwy z planu; kompleks „A + B” składa się z części. */
function exInfo_(ix, name) {
  const whole = exFind_(ix, name), infos = [], parts = [];
  const comps = whole ? [whole] : exStr_(name).split(/\s\+\s/).map(p => exFind_(ix, p)).filter(Boolean);
  comps.forEach(e => {
    if (e.info && !infos.some(i => i.u === e.info)) infos.push({ n: e.name, u: e.info });
    e.parts.forEach(p => { if (parts.indexOf(p) < 0) parts.push(p); });
  });
  return { found: comps.length > 0, infos: infos.slice(0, 4), parts: parts, swaps: whole ? whole.swaps : [], group: whole ? whole.group : '' };
}

/** Czysta funkcja: nazwy ćwiczeń z Planu, których nie da się dopasować do bazy (do dopisania albo aliasu), alfabetycznie. */
function missingExercises_(plan, dictRows) {
  const ix = exIndex_(dictRows), seen = {}, out = [];
  (plan || []).forEach(r => { const k = exKey_(r.cwiczenie); if (k && !seen[k]) { seen[k] = 1; if (!exInfo_(ix, r.cwiczenie).found) out.push(exStr_(r.cwiczenie).trim().replace(/\s+/g, ' ')); } });
  return out.sort((a, b) => a.localeCompare(b, 'pl'));
}

/** Czysta funkcja: baza do wczytania = CW_BAZA z aliasami z CW_ALIASY + CW_DODATKI + CW_FEDB → [nazwa, id filmu, partie, aliasy]. */
function cwBaza_(baza, aliasy, dodatki, fedb) {
  const al = aliasy || {};
  return (baza || []).map(b => [b[0], b[1], b[2], [b[3], al[b[0]]].filter(Boolean).join('; ')])
    .concat((dodatki || []).map(d => [d[0], '', d[2], d[1]])).concat((fedb || []).map(f => [f[0], '', f[1], '']));
}

/** wiersz-zaślepka: sama nazwa dopisana przez „Uzupełnij listę ćwiczeń”, bez żadnych danych */
const cwEmpty_ = r => ['aliasy', 'instruktaz', 'partia', 'zamienniki', 'grupa'].every(h => !exStr_(r[h]).trim());
const cwList_ = v => exStr_(v).split(';').map(s => s.trim()).filter(Boolean);

/**
 * Czysta funkcja: co zrobić w zakładce Ćwiczenia, żeby miała całą bazę → {add, aliases, drop}.
 * add: nowe wiersze; aliases: [{i, value}] – nowa wartość kolumny aliasy (dopisane brakujące, usunięte wycofane;
 * pozostałych ręcznych nie rusza);
 * drop: indeksy wierszy-zaślepek, których nazwa ma już dopasowanie gdzie indziej. Indeksy liczone od pierwszego wiersza danych.
 */
function cwSync_(baza, dictRows, wycofane) {
  const rows = dictRows || [], byKey = {}, add = [], aliases = [], drop = [];
  rows.forEach((r, i) => { const k = exKey_(r.cwiczenie); if (k && !cwEmpty_(r)) byKey[k] = i; });
  (baza || []).forEach(b => {
    if (!b[0]) return;
    const i = byKey[exKey_(b[0])], want = cwList_(b[3]);
    if (i === undefined) { add.push([b[0], want.join('; '), b[1] ? 'https://www.youtube.com/watch?v=' + b[1] : '', b[2] || '', '', '']); return; }
    const out = cwList_((wycofane || {})[b[0]]).map(exKey_), old = cwList_(rows[i].aliasy), have = old.filter(a => out.indexOf(exKey_(a)) < 0);
    const hk = have.map(exKey_), extra = want.filter(a => hk.indexOf(exKey_(a)) < 0);
    if (extra.length || have.length < old.length) aliases.push({ i: i, value: have.concat(extra).join('; ') });
  });
  const after = rows.map((r, i) => { const a = aliases.filter(x => x.i === i)[0]; return a ? Object.assign({}, r, { aliasy: a.value }) : r; })
    .concat(add.map(a => ({ cwiczenie: a[0], aliasy: a[1], instruktaz: a[2], partia: a[3] })));
  const ix = exIndex_(after);
  rows.forEach((r, i) => { if (exKey_(r.cwiczenie) && cwEmpty_(r) && exInfo_(ix, r.cwiczenie).found) drop.push(i); });
  return { add: add, aliases: aliases, drop: drop };
}

function appendCw_(rows) {
  const sh = sheet_('Ćwiczenia', CW_HEADERS);
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, CW_HEADERS.length).setValues(rows);
  sh.activate();
}

/**
 * Menu Trening → Wczytaj bazę ćwiczeń: dopisuje brakujące ćwiczenia z bazy i aliasy, usuwa puste wiersze-zaślepki,
 * które mają już dopasowanie. Linków, partii, zamienników ani ręcznie wpisanych aliasów nie zmienia.
 */
function wczytajBazeCwiczen() {
  const sh = sheet_('Ćwiczenia', CW_HEADERS), s = cwSync_(cwBaza_(CW_BAZA, CW_ALIASY, CW_DODATKI, CW_FEDB), tableOf_('Ćwiczenia'), CW_WYCOFANE);
  const col = CW_HEADERS.indexOf('aliasy') + 1;
  s.aliases.forEach(a => sh.getRange(a.i + 2, col).setValue(a.value));
  s.drop.slice().sort((a, b) => b - a).forEach(i => sh.deleteRow(i + 2));
  appendCw_(s.add);
  const left = missingExercises_(tableOf_('Plan'), tableOf_('Ćwiczenia')).length;
  alert_('Ćwiczenia', 'Nowe ćwiczenia: ' + s.add.length + ', wiersze ze zmienionymi aliasami: ' + s.aliases.length + ', usunięte puste wiersze: ' + s.drop.length +
    '.\nĆwiczenia z planów nadal bez dopasowania: ' + left + (left ? ' (menu „Uzupełnij listę ćwiczeń” pokaże je na dole zakładki).' : '.'));
}

/** Menu Trening → Uzupełnij listę ćwiczeń: dopisuje nazwy z Planu, których nie udało się dopasować do bazy. */
function uzupelnijCwiczenia() {
  const dict = tableOf_('Ćwiczenia'), have = {};
  dict.forEach(r => { have[exKey_(r.cwiczenie)] = 1; });
  const miss = missingExercises_(tableOf_('Plan'), dict), fresh = miss.filter(n => !have[exKey_(n)]);
  appendCw_(fresh.map(n => [n, '', '', '', '', '']));
  alert_('Ćwiczenia', miss.length ? 'Ćwiczenia z planów bez dopasowania: ' + miss.length + ' (nowo dopisane na dole: ' + fresh.length + '). Uzupełnij przy nich link i partię albo usuń wiersz i dopisz nazwę jako alias przy właściwym ćwiczeniu.' : 'Wszystkie ćwiczenia z planów mają dopasowanie w bazie.');
}

/**
 * Czysta funkcja: serie na partię mięśniową (klient × tydzień × partia). Partie z nazwy wykonanego ćwiczenia
 * (po zamianie liczy się zamiennik), a gdy nie ma go w bazie – z nazwy z planu. Ćwiczenie z kilkoma partiami liczy się
 * do każdej. Serie twarde jak w podsumowaniu: RPE ≥ 7, FAIL albo DROP. Bez rozgrzewki; tydzień wg faktycznej daty treningu.
 */
function computeParts_(plan, log, ses, dictRows, opts) {
  const ix = exIndex_(dictRows), key = (...a) => a.map(String).join('|'), AD = unitDates_(ses, opts && opts.localDay), P = {}, B = {}, memo = {};
  const partsOf = n => { const k = exKey_(n); return !k ? [] : memo[k] || (memo[k] = exInfo_(ix, n).parts); };
  plan.forEach(r => { P[key(String(r.klient).toLowerCase(), r.tydzien, r.jednostka, r.nr)] = r; });
  log.forEach(l => {
    if (String(l.wykonane).toUpperCase() !== 'TAK') return;
    const c = String(l.klient).toLowerCase(), s = String(l.seria), w = weekOf_(AD[key(c, l.tydzien, l.jednostka)] || l.data);
    if (!c || !w || /^R/i.test(s)) return;
    const pr = P[key(c, l.tydzien, l.jednostka, l.nr_cw)] || {};
    let parts = partsOf(l.cwiczenie); if (!parts.length) parts = partsOf(pr.cwiczenie);
    const typ = String(l.typ || ''), kg = n_(l.kg), reps = n_(l.powt), rpe = n_(l.rpe);
    parts.forEach(part => {
      const b = B[key(c, w, part)] || (B[key(c, w, part)] = [c, w, part, 0, 0, 0]);
      b[3]++;
      if (/FAIL/.test(typ) || /DROP/.test(typ) || /^D/i.test(s) || rpe >= 7) b[4]++;
      if (kg > 0 && reps > 0) b[5] += kg * reps;
    });
  });
  return Object.values(B).map(b => { b[5] = Math.round(b[5]); return b; })
    .sort((a, b) => a[0].localeCompare(b[0]) || String(a[1]).localeCompare(String(b[1])) || a[2].localeCompare(b[2], 'pl'));
}

/* ================== PRZEGLĄD (klient × dziś: komu trzeba się przyjrzeć) ==================
 * Liczony razem z podsumowaniem (codziennie ok. 5:00, menu Trening → Przegląd klientów). Jeden wiersz na aktywnego klienta,
 * najpilniejsi na górze. pilnosc = 3 × sygnały czerwone + sygnały pomarańczowe (flagi do decyzji trenera, nie diagnoza).
 * Czerwone (ostatnie 7 dni): ból > 3/10, ≥ 2 FAIL w ćwiczeniu poza bojami w jednej jednostce, dyspozycja „Zmęczenie” (3 dni).
 * Pomarańczowe: samopoczucie ≤ 2, ≥ 2 spalone boje < 85% w jednostce, zamiana z powodu bólu, dyspozycja „Uwaga”,
 * jednostka zaległa (≥ 2 dni po dacie z planu, do 28 dni wstecz), brak treningu ≥ 7 dni, plan kończy się za ≤ 7 dni albo brak planu.
 */
const PRZ_HEADERS = ['klient', 'imie', 'pilnosc', 'do_reakcji', 'ostatni_trening', 'dni_temu', 'ten_tydzien', 'zalegle', 'status_tygodnia',
  'uwagi_klienta', 'filmy_7dni', 'koniec_planu_dni', 'czerwone'];
const PRZ = { late: 2, lateMax: 28, window: 7, readyDays: 3, idle: 7, planEnd: 7 };

function computeOverview_(plan, log, ses, klienci, dys, sumRows, opts) {
  const today = opts.today, localDay = (opts && opts.localDay) || localDayDefault_;
  const key = (...a) => a.map(String).join('|'), lc = v => String(v === undefined || v === null ? '' : v).toLowerCase();
  const dayOf = v => blank_(v) ? '' : v instanceof Date ? localDay(v.toISOString()) : /T/.test(String(v)) ? localDay(String(v)) : String(v).slice(0, 10);
  const planDay = v => { if (blank_(v)) return ''; const d = day_(v); return isNaN(d) ? '' : iso_(d); };
  const diff = (a, b) => Math.round((day_(a) - day_(b)) / 864e5);          // a − b w dniach
  const dm = d => d ? d.slice(8, 10) + '.' + d.slice(5, 7) : '';
  const AD = unitDates_(ses, localDay), ws = weekOf_(today), SI = SUM_HEADERS.indexOf('status');
  const P = {}; plan.forEach(r => { P[key(lc(r.klient), r.tydzien, r.jednostka, r.nr)] = r; });

  return (klienci || []).filter(k => !blank_(k.klient_id) && String(k.aktywny).toUpperCase() !== 'NIE').map(k => {
    const c = lc(k.klient_id), red = [], amb = [];
    // jednostki z planu: data z planu, czy zrobiona, faktyczny dzień
    const U = {};
    plan.forEach(r => { if (lc(r.klient) !== c) return; const u = key(c, r.tydzien, r.jednostka); if (!U[u]) U[u] = { name: String(r.jednostka), date: planDay(r.data), done: false, act: '' }; });
    const mine = ses.filter(s => lc(s.klient) === c).map(s => { const u = key(c, s.tydzien, s.jednostka); return { s, u, act: AD[u] || planDay(s.data) }; });
    mine.forEach(m => { if (U[m.u]) { U[m.u].done = true; U[m.u].act = m.act; } });
    const units = Object.values(U);
    const logs = log.filter(l => lc(l.klient) === c && String(l.wykonane).toUpperCase() === 'TAK').map(l => {
      const u = key(c, l.tydzien, l.jednostka); return { l, u, day: AD[u] || dayOf(l.zapisano) || planDay(l.data) }; });
    const recent = d => d && diff(today, d) >= 0 && diff(today, d) < PRZ.window;

    // ostatni trening
    const last = mine.map(m => m.act).concat(logs.map(x => x.day)).filter(d => d && d <= today).sort().pop() || '';
    const ago = last ? diff(today, last) : '';

    // sesje z ostatnich 7 dni: ból, samopoczucie
    mine.filter(m => recent(m.act)).forEach(m => {
      let top = ['', -1];
      String(m.s.bol || '').split(';').forEach(x => { const q = x.split(':'), v = n_((q[1] || '').trim()); if (v > top[1]) top = [(q[0] || '').trim(), v]; });
      if (top[1] < 0) [['kolano', n_(m.s.bol_kolano)], ['bark', n_(m.s.bol_bark)], ['', n_(m.s.bol_max)]].forEach(q => { if (q[1] > top[1]) top = q; });
      if (top[1] > 3) red.push('ból' + (top[0] ? ' ' + top[0] : '') + ' ' + top[1] + '/10 (' + dm(m.act) + ')');
      const feel = n_(m.s.samopoczucie); if (feel > 0 && feel <= 2) amb.push('samopoczucie ' + feel + '/5 (' + dm(m.act) + ')');
    });
    // serie z ostatnich 7 dni: FAIL poza bojami, spalone boje < 85%, zamiany z powodu bólu
    const fails = {}, burns = {}, swaps = {};
    logs.filter(x => recent(x.day)).forEach(x => {
      const l = x.l, pr = P[key(c, l.tydzien, l.jednostka, l.nr_cw)] || {}, name = String(l.cwiczenie), g = groupOf_(pr.grupa, name);
      if (/FAIL/.test(String(l.typ || ''))) {
        const id = x.u + '|' + name, pct = n_(pr.procent), pkg = n_(pr.kg), kg = n_(l.kg), rel = pct > 0 && pkg > 0 && kg > 0 ? kg / (pkg / pct) : NaN;
        if (g === 'R' || g === 'P') { if (rel < 0.85) burns[id] = (burns[id] || 0) + 1; } else fails[id] = (fails[id] || 0) + 1;
      }
      const z = String(l.zamiana || ''); if (/\|\s*ból/i.test(z)) swaps[z.replace(/\s*\|.*$/, '')] = 1;
    });
    Object.keys(fails).forEach(id => { if (fails[id] >= 2) red.push(fails[id] + '× FAIL: ' + id.split('|').pop()); });
    Object.keys(burns).forEach(id => { if (burns[id] >= 2) amb.push(burns[id] + '× spalone < 85%: ' + id.split('|').pop()); });
    Object.keys(swaps).forEach(z => amb.push('zamiana (ból): ' + z));
    // dyspozycja z ostatnich 3 dni (najnowszy wpis)
    const rd = (dys || []).filter(r => lc(r.klient) === c).map(r => ({ d: dayOf(r.data), w: String(r.werdykt || '') }))
      .filter(r => r.d && diff(today, r.d) >= 0 && diff(today, r.d) < PRZ.readyDays).sort((a, b) => a.d.localeCompare(b.d)).pop();
    if (rd && /zmęcz/i.test(rd.w)) red.push('dyspozycja: Zmęczenie (' + dm(rd.d) + ')'); else if (rd && /uwaga/i.test(rd.w)) amb.push('dyspozycja: Uwaga (' + dm(rd.d) + ')');

    // ten tydzień, zaległe, koniec planu
    const inWeek = d => d && d >= ws && diff(d, ws) < 7;
    const wk = units.filter(u => inWeek(u.done ? u.act : u.date));
    const late = units.filter(u => !u.done && u.date && diff(today, u.date) >= PRZ.late && diff(today, u.date) <= PRZ.lateMax).sort((a, b) => a.date.localeCompare(b.date));
    if (late.length) amb.push('zaległe: ' + late.map(u => u.name + ' ' + dm(u.date)).join(', '));
    const end = units.map(u => u.date).filter(Boolean).sort().pop() || '', left = end ? diff(end, today) : '';
    if (!units.length) amb.push('brak planu');
    else if (left !== '' && left < 0 && !units.some(u => !u.done)) amb.push('plan skończony');
    else if (left !== '' && left >= 0 && left <= PRZ.planEnd) amb.push('plan kończy się za ' + left + ' dni');
    if (units.length && ago !== '' && ago >= PRZ.idle) amb.push('brak treningu od ' + ago + ' dni');

    const sr = (sumRows || []).filter(r => r[0] === c).sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const st = sr.filter(r => r[1] === ws).pop() || sr.pop();
    const note = mine.filter(m => !blank_(m.s.uwagi) && m.act).sort((a, b) => a.act.localeCompare(b.act)).pop();
    return [c, String(k.imie || ''), 3 * red.length + amb.length, red.concat(amb).join('; '), last, ago,
      wk.filter(u => u.done).length + '/' + wk.length, late.length || '', st ? st[SI] + (st[1] === ws ? '' : ' (tydz. od ' + dm(st[1]) + ')') : '',
      note ? dm(note.act) + ': ' + String(note.s.uwagi).replace(/\s+/g, ' ').slice(0, 300) : '',
      logs.filter(x => !blank_(x.l.film_link) && recent(x.day)).length || '', left, red.length || ''];
  }).sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));
}

/* ---------- alert mailowy: raz dziennie rano, tylko gdy pojawił się nowy czerwony sygnał ---------- */
/**
 * Czysta funkcja: wiersze Przeglądu + podpis poprzedniego alertu → {send, subject, body, sig}.
 * Mail idzie tylko, gdy któryś klient ma czerwony sygnał, którego nie było w poprzednim alercie (ten sam ból nie wraca co rano).
 * sig = aktualne czerwone sygnały („klient|sygnał”, po jednym w wierszu) do zapamiętania we właściwości skryptu ALERT_SIG.
 */
function alertMail_(ov, prev, url) {
  const ix = k => PRZ_HEADERS.indexOf(k), old = String(prev || '').split('\n'), sig = [], fresh = [], rest = [];
  (ov || []).forEach(r => {
    const n = Number(r[ix('czerwone')]) || 0; if (!n) return;
    const all = String(r[ix('do_reakcji')]).split('; '), red = all.slice(0, n), keys = red.map(s => r[ix('klient')] + '|' + s);
    keys.forEach(k => sig.push(k));
    const line = '• ' + (r[ix('imie')] || r[ix('klient')]) + ': ' + red.join('; ') + (all.length > n ? '\n   poza tym: ' + all.slice(n).join('; ') : '');
    (keys.some(k => old.indexOf(k) < 0) ? fresh : rest).push(line);
  });
  if (!fresh.length) return { send: false, subject: '', body: '', sig: sig.join('\n') };
  const n = fresh.length, word = n === 1 ? 'klient' : 'klientów';
  return { send: true, sig: sig.join('\n'), subject: 'Trening: ' + n + ' ' + word + ' do reakcji',
    body: 'Nowe sygnały do reakcji:\n' + fresh.join('\n') + (rest.length ? '\n\nBez zmian od poprzedniego alertu:\n' + rest.join('\n') : '') +
      '\n\nSzczegóły w zakładce Przegląd' + (url ? ':\n' + url : '.') +
      '\n\nTo flagi do Twojej decyzji, nie diagnoza. Adres zmienisz albo wyłączysz w menu Trening → Ustaw adres alertu.' };
}

/** Wołane tylko z porannego wyzwalacza. Adres: właściwość skryptu ALERT_EMAIL (pusta = alert wyłączony). */
function alertRano_(ov) {
  const props = PropertiesService.getScriptProperties(), to = String(props.getProperty('ALERT_EMAIL') || '').trim();
  if (!to) return;
  const m = alertMail_(ov, props.getProperty('ALERT_SIG'), SpreadsheetApp.getActive().getUrl());
  if (m.send) MailApp.sendEmail(to, m.subject, m.body);
  props.setProperty('ALERT_SIG', m.sig.slice(0, 8000));
}

/** Menu Trening → Ustaw adres alertu: zapisuje adres we właściwościach skryptu (nie w arkuszu ani w repozytorium). */
function ustawAlert() {
  const ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties(), cur = String(props.getProperty('ALERT_EMAIL') || '').trim();
  const r = ui.prompt('Alert mailowy', 'Adres, na który ok. 5:00 przyjdzie mail, gdy klient ma nowy czerwony sygnał (ból > 3/10, ≥ 2 FAIL w ćwiczeniu, dyspozycja „Zmęczenie”). ' +
    'Puste pole = alert wyłączony.\n\nTeraz: ' + (cur || 'wyłączony'), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const v = r.getResponseText().trim();
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { alert_('Alert mailowy', 'To nie wygląda na adres e-mail. Nic nie zmieniono.'); return; }
  if (v) props.setProperty('ALERT_EMAIL', v); else props.deleteProperty('ALERT_EMAIL');
  props.deleteProperty('ALERT_SIG');
  const left = MailApp.getRemainingDailyQuota();
  alert_('Alert mailowy', v ? 'Zapisano. Mail przyjdzie rano tylko wtedy, gdy pojawi się nowy czerwony sygnał (dzienny limit wysyłki: ' + left + ').' : 'Alert wyłączony.');
}

/** Czysta funkcja: wiersze Planu, których klienta nie ma w zakładce Klienci → {ids: {klient: liczba wierszy}, n}. */
function orphanPlans_(plan, klienci) {
  const lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase(), known = {}, ids = {};
  (klienci || []).forEach(k => { if (lc(k.klient_id)) known[lc(k.klient_id)] = 1; });
  let n = 0;
  (plan || []).forEach(r => { const c = lc(r.klient); if (c && !known[c]) { ids[c] = (ids[c] || 0) + 1; n++; } });
  return { ids: ids, n: n };
}

/** Menu Trening → Usuń plany bez klienta: po potwierdzeniu usuwa z Planu wiersze klientów, których nie ma w zakładce Klienci. */
function usunPlanyBezKlienta() {
  const ui = SpreadsheetApp.getUi(), o = orphanPlans_(tableOf_('Plan'), tableOf_('Klienci'));
  if (!o.n) { alert_('Plany bez klienta', 'Każdy wiersz Planu należy do klienta z zakładki Klienci. Nic do usunięcia.'); return; }
  const list = Object.keys(o.ids).map(id => '• ' + id + ': ' + o.ids[id] + ' wierszy').join('\n');
  const ans = ui.alert('Plany bez klienta', 'W Planie są wiersze klientów, których nie ma w zakładce Klienci:\n' + list +
    '\n\nUsunąć te wiersze z Planu? Log i Sesje zostają bez zmian. Cofniesz to tylko przez Plik → Historia wersji.', ui.ButtonSet.YES_NO);
  if (ans !== ui.Button.YES) return;
  const sh = SpreadsheetApp.getActive().getSheetByName('Plan'), v = sh.getDataRange().getValues(), h = v.shift(), ci = h.indexOf('klient');
  const keep = v.filter(r => !o.ids[String(r[ci]).trim().toLowerCase()]);
  sh.getRange(2, 1, v.length, h.length).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, h.length).setValues(keep);
  alert_('Plany bez klienta', 'Usunięto wierszy: ' + (v.length - keep.length) + '.');
}

/** Menu Trening → Przegląd klientów: przelicza wszystko i otwiera zakładkę. */
function przeglad() {
  podsumowanie();
  const sh = SpreadsheetApp.getActive().getSheetByName('Przegląd');
  if (sh) sh.activate();
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
