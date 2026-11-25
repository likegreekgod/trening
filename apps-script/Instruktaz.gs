/**
 * Panel → Ćwiczenia (punkt 7 przeglądu v80): ćwiczenia z planów aktywnych klientów bez filmu „Jak wykonać”,
 * pole na link trenera (zapis do zakładki Ćwiczenia, kolumna instruktaz) i kontrola martwych linków.
 *
 * trCwiczenia  → lista (czysta trCwiczenia_)
 * trCwFilm     → zapis linku (czysta cwFilm_), pusty link usuwa film z wiersza
 * trCwSprawdz  → sprawdzenie linków teraz (sprawdzLinki) + lista
 * sprawdzLinki → z wyzwalacza co tydzień (poniedziałek ok. 4:00, linkiWyzwalacz_) albo z panelu: każdy link z kolumny instruktaz;
 *                YouTube przez oEmbed (bez klucza API), inne adresy zwykłym GET. Wynik we właściwościach CW_MARTWE / CW_LINKI_AT / CW_LINKI_N.
 */
const LINK_MAX = 500;                  // najdłuższy link do filmu
const LINKI_PACZKA = 40;               // tyle zapytań naraz (UrlFetchApp.fetchAll)
const LINKI_CZAS_MS = 270000;          // sprawdzanie przerywa się po 4,5 min (limit Apps Script to 6 min), reszta przy następnym razie
const LINKI_MARTWE_MAX = 150;          // tyle martwych zapamiętujemy (limit rozmiaru właściwości skryptu)

const cwLc_ = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
const cwDay_ = v => v instanceof Date ? v.toISOString().slice(0, 10) : /^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : '';
const linkOk_ = u => typeof u === 'string' && u.length <= LINK_MAX && /^https?:\/\/[^\s"<>]+$/i.test(u);

/** Czysta funkcja: adres, pod którym sprawdzamy link (YouTube → oEmbed, bo strona filmu zwraca 200 także dla usuniętego). */
function linkProbe_(u) {
  const s = String(u || '').trim();
  if (/^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch|shorts\/|embed\/)|youtu\.be\/)/i.test(s)) return 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(s);
  return s;
}
/** Czysta funkcja: kod odpowiedzi → 'brak' (usunięty), 'prywatny' (bez dostępu), '' (działa) albo null (nie wiadomo: błąd serwera, limit, brak odpowiedzi). */
function linkStan_(code) {
  const c = Number(code);
  if (c >= 200 && c < 400) return '';
  if (c === 404 || c === 410 || c === 400) return 'brak';
  if (c === 401 || c === 403) return 'prywatny';
  return null;
}

/**
 * Czysta funkcja: lista do panelu.
 * plan: wiersze Planu (klient, cwiczenie, data, zrodlo), cw: wiersze Ćwiczeń, klienci: wiersze Klientów, martwe: [{u, s, at}] z ostatniego sprawdzenia.
 * → {missing: [{name, inBase, n, clients, last, as: [nazwy z planu]}], dead: [{name, url, why, n}], links}
 * missing: nazwa z bazy (albo z planu, gdy bazy brak) bez filmu, od najczęściej używanych (klienci, potem wiersze planu);
 * kompleks „A + B” daje osobne części; usunięte przez klienta i wiersze nieaktywnych klientów pominięte.
 */
function trCwiczenia_(plan, cw, klienci, martwe) {
  const act = {}; (klienci || []).forEach(k => { const id = cwLc_(k.klient_id); if (id && String(k.aktywny).trim().toUpperCase() !== 'NIE') act[id] = 1; });
  const ix = exIndex_(cw), M = {}, use = {};
  (plan || []).forEach(r => {
    const id = cwLc_(r.klient), raw = exStr_(r.cwiczenie).trim().replace(/\s+/g, ' ');
    if (!act[id] || !raw || /^usuniete/.test(cwLc_(r.zrodlo))) return;
    const whole = exFind_(ix, raw), parts = whole ? [{ e: whole, n: raw }] : raw.split(/\s\+\s/).map(p => ({ e: exFind_(ix, p), n: p.trim() }));
    const day = cwDay_(r.data);
    parts.forEach(p => {
      const name = p.e ? p.e.name : p.n, k = exKey_(name);
      const u = use[k] = use[k] || { n: 0, cl: {}, last: '' }; u.n++; u.cl[id] = 1; if (day > u.last) u.last = day;
      if (p.e && p.e.info) return;
      const m = M[k] = M[k] || { name: name, inBase: !!p.e, as: [] };
      if (exKey_(raw) !== k && m.as.length < 3 && m.as.indexOf(raw) < 0) m.as.push(raw);
    });
  });
  const stat = k => ({ n: use[k].n, clients: Object.keys(use[k].cl).length, last: use[k].last });
  const missing = Object.keys(M).map(k => Object.assign(M[k], stat(k)))
    .sort((a, b) => b.clients - a.clients || b.n - a.n || a.name.localeCompare(b.name, 'pl'));
  const why = {}; (martwe || []).forEach(x => { if (x && x.u) why[x.u] = x.s; });
  const dead = [], seen = {};
  let links = 0;
  (cw || []).forEach(r => {
    const name = exStr_(r.cwiczenie).trim(), u = exStr_(r.instruktaz).trim(), k = exKey_(name);
    if (!name || !u || exStr_(r.glowna).trim() || seen[k]) return; seen[k] = 1; links++;
    if (why[u]) dead.push({ name: name, url: u, why: why[u], n: use[k] ? use[k].n : 0 });
  });
  dead.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'pl'));
  return { missing: missing, dead: dead, links: links };
}

/**
 * Czysta funkcja: zapis linku do zakładki Ćwiczenia → {i: indeks wiersza danych (od 0), value} albo {add: nowy wiersz}.
 * Wiersz = dokładna nazwa ćwiczenia (bez wierszy z „glowna”); nazwy spoza bazy dostają nowy wiersz. Pusty link = usunięcie filmu z wiersza.
 */
function cwFilm_(rows, name, url) {
  const n = exStr_(name).trim().replace(/\s+/g, ' '), u = exStr_(url).trim();
  if (!n || n.length > 120) throw new Error('Brak nazwy ćwiczenia.');
  if (u && !linkOk_(u)) throw new Error('Link musi zaczynać się od https:// (najwyżej ' + LINK_MAX + ' znaków).');
  const i = (rows || []).findIndex(r => exKey_(r.cwiczenie) === exKey_(n) && !exStr_(r.glowna).trim());
  if (i >= 0) return { i: i, value: u };
  if (!u) throw new Error('Nie ma takiego ćwiczenia w bazie.');
  return { add: CW_HEADERS.map(h => h === 'cwiczenie' ? n : h === 'instruktaz' ? u : '') };
}

function trCwiczenia() {
  const p = PropertiesService.getScriptProperties();
  let martwe = []; try { martwe = JSON.parse(p.getProperty('CW_MARTWE') || '[]'); } catch (e) {}
  return Object.assign(trCwiczenia_(pgTable_('Plan', ['klient', 'cwiczenie', 'data', 'zrodlo']), tableOf_('Ćwiczenia'), tableOf_('Klienci'), martwe), {
    at: p.getProperty('CW_LINKI_AT') || '', checked: Number(p.getProperty('CW_LINKI_N')) || 0,
    trigger: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'sprawdzLinki') });
}

function trCwFilm(name, url) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = sheet_('Ćwiczenia', CW_HEADERS), w = cwFilm_(tableOf_('Ćwiczenia'), name, url);
    if (w.add) sh.appendRow(plainRow_(w.add));
    else sh.getRange(w.i + 2, CW_HEADERS.indexOf('instruktaz') + 1).setValue(plain_(w.value));
    cwCacheClear_();
  } finally { lock.releaseLock(); }
  return trCwiczenia();
}

function trCwSprawdz() {
  sprawdzLinki();
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'sprawdzLinki')) linkiWyzwalacz_();
  return trCwiczenia();
}

/** Sprawdza linki z kolumny instruktaz (każdy adres raz); martwe zapisuje we właściwościach. */
function sprawdzLinki() {
  const t0 = Date.now(), urls = [...new Set(tableOf_('Ćwiczenia').filter(r => !exStr_(r.glowna).trim()).map(r => exStr_(r.instruktaz).trim()).filter(linkOk_))];
  const dead = []; let n = 0;
  for (let i = 0; i < urls.length && Date.now() - t0 < LINKI_CZAS_MS; i += LINKI_PACZKA) {
    const part = urls.slice(i, i + LINKI_PACZKA);
    let res = [];
    try { res = UrlFetchApp.fetchAll(part.map(u => ({ url: linkProbe_(u), muteHttpExceptions: true, followRedirects: true }))); } catch (e) { continue; }
    res.forEach((r, j) => { n++; const s = linkStan_(r.getResponseCode()); if (s) dead.push({ u: part[j], s: s }); });
  }
  const p = PropertiesService.getScriptProperties();
  p.setProperty('CW_MARTWE', JSON.stringify(dead.slice(0, LINKI_MARTWE_MAX)));
  p.setProperty('CW_LINKI_AT', new Date().toISOString());
  p.setProperty('CW_LINKI_N', String(n));
  return { n: n, dead: dead.length };
}

function linkiWyzwalacz_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sprawdzLinki').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sprawdzLinki').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(4).create();
}
