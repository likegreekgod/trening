/* ================== PANEL TRENERA (web/trener.html) ==================
 * Osobna strona na GitHub Pages dla trenera: pulpit wszystkich klientów, karta klienta, filmy.
 * Rozmawia z tym samym /exec co aplikacja klientów, ale funkcje z TR_FNS nie przyjmują klucza klienta:
 * każde zapytanie niesie bilet logowania Google (ID token), który trAuth_ sprawdza u Google i porównuje
 * z adresem trenera we właściwościach skryptu (TRENER_EMAIL, kilka po przecinku) i identyfikatorem
 * klienta OAuth (TRENER_CLIENT_ID). Obie wartości ustawia menu „Trening → Ustaw panel trenera”;
 * nie trafiają do repozytorium ani do arkusza. Bez nich panel odpowiada „nie jest skonfigurowany”.
 * Odczyt: trPulpit, trKlient, trPrzelicz. Zapis: trKomentarz (komentarz do sesji). Claude API: trSzkic (szkic komentarza,
 * klucz CLAUDE_API_KEY we właściwościach skryptu, dzienny limit, każde wywołanie w zakładce „AI”). AI tylko szkicuje, zapisuje trener.
 * Klucz ustawia trAI / trUstawAI (panel → Ustawienia, działa też na telefonie) albo menu „Ustaw klucz Claude API”; panel widzi tylko 4 ostatnie znaki.
 */
const TR_FNS = { trConfig, trPulpit, trKlient, trPrzelicz, trKomentarz, trSzkic, trAI, trUstawAI };
const TR_ISS = ['accounts.google.com', 'https://accounts.google.com'];
const TR_AUTH = 'Logowanie: ';         // początek błędów logowania: panel wtedy prosi o ponowne zalogowanie
const TR_FILM_DNI = 14;                // filmy w panelu: ostatnie 14 dni
const TR_TYG = 12;                     // obciążenie na pulpicie: 12 tygodni

/** Ustawienia panelu z właściwości skryptu. */
function trCfg_() {
  const p = PropertiesService.getScriptProperties();
  return { clientId: String(p.getProperty('TRENER_CLIENT_ID') || '').trim(),
    emails: String(p.getProperty('TRENER_EMAIL') || '').split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean) };
}

/** Publiczne: identyfikator klienta OAuth do przycisku „Zaloguj przez Google” (jest jawny, widać go w każdej stronie z logowaniem). */
function trConfig() {
  const c = trCfg_();
  return { clientId: c.clientId, ready: !!(c.clientId && c.emails.length) };
}

/**
 * Czy odpowiedź Google (tokeninfo) to ważny bilet trenera → '' albo powód odmowy.
 * info: {aud, iss, email, email_verified, exp (sekundy)}; cfg: {clientId, emails}; now: ms.
 */
function trTokenOk_(info, cfg, now) {
  if (!cfg || !cfg.clientId || !cfg.emails || !cfg.emails.length) return 'panel trenera nie jest skonfigurowany';
  if (!info || typeof info !== 'object') return 'brak biletu';
  if (String(info.aud) !== cfg.clientId) return 'bilet z innej aplikacji';
  if (TR_ISS.indexOf(String(info.iss)) < 0) return 'bilet nie pochodzi od Google';
  if (!(Number(info.exp) * 1000 > now)) return 'bilet wygasł';
  if (String(info.email_verified) !== 'true') return 'adres niepotwierdzony';
  if (cfg.emails.indexOf(String(info.email || '').toLowerCase()) < 0) return 'to konto nie ma dostępu do panelu';
  return '';
}

/** Sprawdza bilet trenera; wynik trzymany w pamięci podręcznej do końca ważności biletu (najwyżej godzinę). */
function trAuth_(token) {
  const cfg = trCfg_();
  if (!cfg.clientId || !cfg.emails.length) throw new Error(TR_AUTH + 'panel trenera nie jest skonfigurowany (arkusz: menu Trening → Ustaw panel trenera).');
  token = String(token || '');
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw new Error(TR_AUTH + 'zaloguj się.');
  const cache = CacheService.getScriptCache();
  const ck = 'tr_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 43);
  const hit = cache.get(ck);
  if (hit) { const info = JSON.parse(hit); if (!trTokenOk_(info, cfg, Date.now())) return info.email; }
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error(TR_AUTH + 'bilet wygasł albo jest nieprawidłowy, zaloguj się ponownie.');
  const info = JSON.parse(r.getContentText()), why = trTokenOk_(info, cfg, Date.now());
  if (why) throw new Error(TR_AUTH + why + '.');
  const keep = { aud: info.aud, iss: info.iss, email: info.email, email_verified: info.email_verified, exp: info.exp };
  cache.put(ck, JSON.stringify(keep), Math.max(1, Math.min(3600, Math.floor(Number(info.exp) - Date.now() / 1000))));
  return info.email;
}

/** Menu Trening → Ustaw panel trenera: adres(y) trenera i identyfikator klienta OAuth we właściwościach skryptu. */
function ustawPanel() {
  const ui = SpreadsheetApp.getUi(), p = PropertiesService.getScriptProperties(), c = trCfg_();
  const a = ui.prompt('Panel trenera (1/2)', 'Adres Google, którym logujesz się do panelu (kilka po przecinku). Puste = panel wyłączony.\n\nTeraz: ' +
    (c.emails.join(', ') || 'brak'), ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const emails = a.getResponseText().split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  if (emails.some(v => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) { alert_('Panel trenera', 'To nie wygląda na adres e-mail. Nic nie zmieniono.'); return; }
  if (!emails.length) { p.deleteProperty('TRENER_EMAIL'); alert_('Panel trenera', 'Panel wyłączony.'); return; }
  const b = ui.prompt('Panel trenera (2/2)', 'Identyfikator klienta OAuth z Google Cloud (kończy się na .apps.googleusercontent.com).\n\nTeraz: ' +
    (c.clientId || 'brak'), ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  const id = b.getResponseText().trim() || c.clientId;
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) { alert_('Panel trenera', 'Identyfikator powinien kończyć się na .apps.googleusercontent.com. Nic nie zmieniono.'); return; }
  p.setProperty('TRENER_EMAIL', emails.join(','));
  p.setProperty('TRENER_CLIENT_ID', id);
  alert_('Panel trenera', 'Zapisano. Panel wpuści: ' + emails.join(', ') + '.');
}

/* ---------- odczyt ---------- */

/** Pulpit: Przegląd, obciążenie tygodni, bloki do zamknięcia, filmy z 14 dni. */
function trPulpit() {
  const tz = Session.getScriptTimeZone(), localDay = t => Utilities.formatDate(new Date(t), tz, 'yyyy-MM-dd');
  const log = pgTable_('Log', ['klient', 'zapisano', 'tydzien', 'jednostka', 'nr_cw', 'cwiczenie', 'seria', 'kg', 'powt', 'rpe', 'film_link',
    'uwagi', 'typ', 'ocena', 'komentarz_trenera', 'komentarz_dysk']);
  return trPulpit_({ prz: tableOf_('Przegląd'), sum: tableOf_('Podsumowanie'), bloki: tableOf_('Bloki'), klienci: tableOf_('Klienci'), log: log },
    { today: today_(), localDay: localDay, at: PropertiesService.getScriptProperties().getProperty('PODSUM_AT') || '' });
}

/** Przelicza podsumowanie (jak menu „Odśwież podsumowanie”) i zwraca świeży pulpit. */
function trPrzelicz() {
  podsumowanie();
  return trPulpit();
}

/**
 * Czysta funkcja pulpitu. t: {prz, sum, bloki, klienci, log} jako wiersze-obiekty z zakładek (tableOf_),
 * o: {today 'RRRR-MM-DD', localDay, at}. → {today, at, clients, blocks, videos}
 */
function trPulpit_(t, o) {
  const localDay = o.localDay || localDayDefault_, lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  const d10 = v => blank_(v) ? '' : v instanceof Date ? localDay(v.toISOString()) : /T/.test(String(v)) ? localDay(String(v)) : String(v).slice(0, 10);
  const num = v => { const x = blank_(v) ? NaN : n_(String(v).replace(/\s/g, '')); return isFinite(x) ? x : null; };
  const names = {}; (t.klienci || []).forEach(k => { if (!blank_(k.klient_id)) names[lc(k.klient_id)] = String(k.imie || k.klient_id); });
  const weeks = []; for (let i = TR_TYG - 1; i >= 0; i--) { const d = day_(weekOf_(o.today)); d.setUTCDate(d.getUTCDate() - 7 * i); weeks.push(iso_(d)); }

  const clients = (t.prz || []).filter(r => !blank_(r.klient)).map(r => {
    const id = lc(r.klient), nRed = Number(r.czerwone) || 0;
    const sig = String(r.do_reakcji || '').split(';').map(s => s.trim()).filter(Boolean).map((s, i) => ({ lv: i < nRed ? 'bad' : 'warn', t: s }));
    const S = {}; (t.sum || []).filter(s => lc(s.klient) === id).forEach(s => { S[d10(s.tydzien_od)] = s; });
    const load = weeks.map(w => { const s = S[w]; return { week: w, srpe: s ? num(s.sRPE_TL_AU) : null, ton: s ? num(s.tonaz_kg) : null,
      status: s ? String(s.status || '').replace(/^[^\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ–-]+/, '').trim() : '' }; });
    return { id: id, name: String(r.imie || names[id] || id), urg: Number(r.pilnosc) || 0, red: nRed, signals: sig,
      last: d10(r.ostatni_trening), ago: num(r.dni_temu), week: String(r.ten_tydzien || ''), late: Number(r.zalegle) || 0,
      status: String(r.status_tygodnia || '').replace(/^[^\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ–-]+/, '').trim(), note: String(r.uwagi_klienta || ''),
      films: Number(r.filmy_7dni) || 0, filmsNew: Number(r.filmy_bez_kom_7dni) || 0, planLeft: num(r.koniec_planu_dni), own: Number(r.wlasne_7dni) || 0,
      errors: Number(r.bledy_7dni) || 0, load: load };
  });

  // bloki do zamknięcia: koniec w przeszłości albo w ciągu 7 dni, bez wniosków trenera
  const blocks = (t.bloki || []).filter(b => !blank_(b.klient) && String(b.blok) !== NO_BLOCK && names[lc(b.klient)] !== undefined).map(b => ({
    id: lc(b.klient), name: names[lc(b.klient)], block: String(b.blok), from: d10(b.od), to: d10(b.do),
    wnioski: !blank_(b.wnioski) && String(b.wnioski).trim() !== '', dlaKlienta: !blank_(b.dla_klienta) && String(b.dla_klienta).trim() !== '' }))
    .filter(b => b.to && Math.round((day_(b.to) - day_(o.today)) / 864e5) <= 7 && !b.wnioski)
    .sort((a, b) => a.to.localeCompare(b.to));

  // filmy z ostatnich 14 dni (po dniu zapisu), najnowsze pierwsze
  const videos = (t.log || []).filter(l => !blank_(l.film_link) && fileIdOf_(l.film_link)).map(l => ({
    id: lc(l.klient), name: names[lc(l.klient)] || String(l.klient), at: d10(l.zapisano), week: l.tydzien, day: String(l.jednostka || ''),
    order: l.nr_cw, ex: String(l.cwiczenie || ''), set: String(l.seria), kg: l.kg === '' ? '' : l.kg, reps: String(l.powt === undefined ? '' : l.powt),
    rpe: l.rpe === '' ? '' : l.rpe, ocena: String(l.ocena || ''), typ: String(l.typ || ''), note: String(l.uwagi || ''),
    file: fileIdOf_(l.film_link), link: String(l.film_link), kom: [l.komentarz_dysk, l.komentarz_trenera].filter(x => !blank_(x)).map(String).join('\n') }))
    .filter(v => v.at && Math.round((day_(o.today) - day_(v.at)) / 864e5) < TR_FILM_DNI && Math.round((day_(o.today) - day_(v.at)) / 864e5) >= 0)
    .sort((a, b) => b.at.localeCompare(a.at) || a.name.localeCompare(b.name) || Number(a.order) - Number(b.order) || a.set.localeCompare(b.set));

  return { today: o.today, at: o.at || '', weeks: weeks, clients: clients, blocks: blocks, videos: videos };
}

/** Karta klienta: to samo co getData klienta (bez klucza), plus jego Bloki z wnioskami i tygodnie z Podsumowania. */
function trKlient(id) {
  id = String(id || '').trim().toLowerCase();
  const row = trRow_(id);
  const c = clientOf_(row), d = clientData_(c, Date.now()), lc = x => String(x === undefined || x === null ? '' : x).toLowerCase();
  const tz = Session.getScriptTimeZone(), day = x => x instanceof Date ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : String(x || '').slice(0, 10);
  d.cfg.id = c.id;
  d.cfg.active = String(row[3]).toUpperCase() !== 'NIE';
  d.cfg.masters = String(row[8] || '').trim().toUpperCase() === 'TAK';
  d.blocks = tableOf_('Bloki').filter(b => lc(b.klient) === c.id).map(b => Object.assign({}, b, { od: day(b.od), do: day(b.do) }));
  d.summary = tableOf_('Podsumowanie').filter(s => lc(s.klient) === c.id).map(s => ({ week: day(s.tydzien_od), srpe: s.sRPE_TL_AU, acwr: s.ACWR,
    ton: s.tonaz_kg, done: s['wykonanie_%'], hard: s.serie_twarde, status: String(s.status || ''), why: String(s.powody || '') }));
  return d;
}

/** Wiersz klienta z zakładki Klienci po klient_id (małe litery). */
function trRow_(id) {
  const v = SpreadsheetApp.getActive().getSheetByName('Klienci').getDataRange().getValues();
  const row = v.slice(1).find(r => String(r[1]).trim().toLowerCase() === id);
  if (!id || !row) throw new Error('Nie ma klienta „' + id + '”.');
  return row;
}

/* ---------- zapis: komentarz trenera do sesji (Sesje.komentarz_trenera; klient widzi go w zakładce Trener) ---------- */

const TR_KOM_MAX = 3000;

/** Zapisuje (albo czyści, gdy tekst pusty) komentarz trenera do zakończonej jednostki klienta. */
function trKomentarz(id, week, day, text) {
  id = String(id || '').trim().toLowerCase();
  text = String(text === undefined || text === null ? '' : text).replace(/\r\n?/g, '\n').trim();
  if (text.length > TR_KOM_MAX) throw new Error('Komentarz jest za długi (najwyżej ' + TR_KOM_MAX + ' znaków).');
  trRow_(id);
  const sid = [id, Number(week), String(day)].join('|');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_('Sesje', SES_HEADERS);
    const col = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].indexOf('komentarz_trenera') + 1;
    const hit = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).createTextFinder(sid).matchEntireCell(true).findNext();
    if (!hit || col < 1) throw new Error('Nie ma tej jednostki w zakładce Sesje (' + sid + '). Komentarz da się dodać po „Zakończ i zapisz” u klienta.');
    sh.getRange(hit.getRow(), col).setValue(text);
  } finally { lock.releaseLock(); }
  return { text: text, at: new Date().toISOString() };
}

/* ---------- Claude API: szkic komentarza do sesji ----------
 * Klucz: właściwość skryptu CLAUDE_API_KEY (menu „Trening → Ustaw klucz Claude API” albo edytor Apps Script). Nigdy w repo ani w arkuszu.
 * Do AI idą dane jednostki bez imienia i klucza klienta (trSzkicCtx_). Limit dzienny AI_LIMIT (właściwość AI_LIMIT nadpisuje),
 * licznik dnia we właściwości AI_DZIEN, każde wywołanie (tokeny, koszt w USD) w zakładce „AI”.
 */
const AI_MODEL = 'claude-opus-5-5';
const AI_LIMIT = 30;
const AI_CENY = { 'claude-opus-5-5': [4, 20], 'claude-opus-5': [5, 25], 'claude-opus-4-8': [5, 25], 'claude-sonnet-5-5': [2, 10] };   // USD za 1 mln tokenów: wejście, wyjście
const AI_HEADERS = ['czas', 'akcja', 'klient', 'tydzien', 'jednostka', 'model', 'tokeny_we', 'tokeny_wy', 'koszt_usd'];
const AI_POPRAW = {
  krocej: 'Skróć szkic do 2–3 zdań, zostaw najważniejsze.',
  cieplej: 'Napisz to cieplej i bardziej motywująco, bez lukru i bez wykrzykników w każdym zdaniu.',
  technicznie: 'Napisz bardziej technicznie: konkretne liczby, technika, RPE i co zmienić w następnej jednostce.',
  inny: 'Napisz zupełnie inną wersję, z innym początkiem i innym akcentem.'
};
const AI_SYSTEM = [
  'Jesteś asystentem trenera personalnego (trening siłowy, sylwetka, podnoszenie ciężarów). Piszesz szkic komentarza trenera do jednej zakończonej jednostki treningowej jego podopiecznego.',
  'Trener przeczyta szkic, poprawi go i dopiero wtedy wyśle klientowi do aplikacji.',
  'Zasady:',
  '- Po polsku, w drugiej osobie, jak trener do swojego podopiecznego. 2–5 zdań, bez nagłówków, list, emoji i podpisu.',
  '- Zacznij od konkretu z tej jednostki (ciężar, serie, porównanie z poprzednimi takimi samymi jednostkami). Bez ogólników typu „dobra robota”.',
  '- Jedna rzecz do uwagi albo do poprawy na następną jednostkę, jeśli dane coś takiego pokazują (nieudana seria, wysokie RPE, pominięte ćwiczenie, uwaga klienta).',
  '- Ból: przy bólu powyżej 3/10 albo powtarzającym się bólu napisz spokojnie, że trener chce o tym wiedzieć, i zaproponuj ostrożność (lżej, bez bólu). Nie stawiaj diagnoz i nie lecz.',
  '- Odpowiedz na uwagi i komentarze klienta, jeśli są.',
  '- Używaj tylko liczb z danych. Niczego nie dopisuj od siebie. Jeśli danych jest mało, napisz krócej.',
  '- Jeśli są wcześniejsze komentarze trenera, pisz w ich stylu (długość, ton, słownictwo).',
  '- Zwróć wyłącznie treść komentarza.'
].join('\n');

/** Czy dzisiejszy limit pozwala na kolejny szkic. raw: zawartość AI_DZIEN ({d, n}) → {n: zużyte dziś, ok}. */
function aiDay_(raw, today, limit) {
  let st = {}; try { st = JSON.parse(raw || '{}') || {}; } catch (e) { st = {}; }
  const n = st.d === today ? Number(st.n) || 0 : 0;
  return { n: n, ok: n < limit };
}

/** Koszt wywołania w USD z usage odpowiedzi (cache: zapis ×1,25, odczyt ×0,1 ceny wejścia). */
function aiCost_(model, u) {
  const c = AI_CENY[model] || AI_CENY[String(model || '').replace(/-\d{8}$/, '')] || AI_CENY[AI_MODEL];
  u = u || {};
  const inp = (Number(u.input_tokens) || 0) + 1.25 * (Number(u.cache_creation_input_tokens) || 0) + 0.1 * (Number(u.cache_read_input_tokens) || 0);
  return Math.round((inp * c[0] + (Number(u.output_tokens) || 0) * c[1]) / 1e6 * 10000) / 10000;
}

/** Treść zapytania do Messages API (czysta). opt: {tweak: krocej|cieplej|technicznie|inny, draft: poprzedni szkic}. */
function aiReq_(ctx, opt) {
  opt = opt || {};
  let msg = 'Dane jednostki:\n\n' + ctx;
  const tw = AI_POPRAW[opt.tweak];
  if (tw) msg += (String(opt.draft || '').trim() ? '\n\nPoprzedni szkic komentarza:\n' + String(opt.draft).trim().slice(0, TR_KOM_MAX) : '') + '\n\nPopraw szkic: ' + tw;
  else msg += '\n\nNapisz szkic komentarza trenera do tej jednostki.';
  return { model: AI_MODEL, max_tokens: 4000, system: AI_SYSTEM, messages: [{ role: 'user', content: msg }],
    output_config: { effort: 'low' }, fallbacks: 'default' };
}

/**
 * Dane jednej jednostki do szkicu (czysta). d: wynik clientData_; week, day → tekst albo null (brak sesji).
 * Bez imienia, klucza i linków do filmów: tryb, jednostka, plan i wykonanie, sesja, ból, dyspozycja dnia,
 * 3 poprzednie takie same jednostki, następna jednostka, 5 ostatnich komentarzy trenera do tej osoby.
 */
/** Liczba zapisanych serii roboczych jednostki (bez rozgrzewki i pominięć). 0 = szkic AI nie ma z czego pisać, więc nie wołamy API. */
function trSzkicSets_(d, week, day) {
  return (d.logs || []).filter(l => Number(l.tydzien) === Number(week) && String(l.jednostka) === String(day) &&
    String(l.wykonane || '').trim() === 'TAK' && !/^R/i.test(String(l.seria)) && String(l.seria) !== '0').length;
}

function trSzkicCtx_(d, week, day) {
  const W = Number(week), D = String(day), str = v => v === undefined || v === null ? '' : String(v).trim();
  const ses = (d.sessions || []).find(s => Number(s.tydzien) === W && String(s.jednostka) === D);
  if (!ses) return null;
  const dayOf = s => /T/.test(str(s.start)) ? str(s.start).slice(0, 10) : str(s.data).slice(0, 10);
  const numTxt = v => str(v).replace('.', ',');
  const OC = { L: 'łatwo', S: 'średnio', W: 'walka', X: 'spalone' };
  const setTxt = l => {
    const kg = str(l.kg), rp = str(l.rpe), oc = OC[str(l.ocena).toUpperCase()];
    return (/^D/i.test(str(l.seria)) || /DROP/.test(str(l.typ)) ? 'drop ' : '') + (kg && kg !== '0' ? numTxt(kg) + (isFinite(Number(kg.replace(',', '.'))) ? ' kg' : '') + '×' : '') + str(l.powt) +
      (oc ? ' (' + oc + ')' : rp ? ' @' + numTxt(rp) : '') + (/FAIL/.test(str(l.typ)) ? ' nieudana' : '');
  };
  const planOf = w => (d.plan || []).filter(r => r.week === w && r.day === D).sort((a, b) => a.order - b.order);
  const exOf = (w, full) => {
    const P = {}; planOf(w).forEach(r => { P[r.order] = r; });
    const by = {};
    (d.logs || []).filter(l => Number(l.tydzien) === w && String(l.jednostka) === D).forEach(l => {
      const k = Number(l.nr_cw); (by[k] = by[k] || []).push(l); });
    const keys = Object.keys(P).map(Number).concat(Object.keys(by).map(Number)).filter((k, i, a) => a.indexOf(k) === i).sort((a, b) => a - b);
    return keys.map(k => {
      const r = P[k] || {}, ls = (by[k] || []).sort((a, b) => String(a.seria).localeCompare(String(b.seria), 'pl', { numeric: true }));
      const skip = ls.find(l => String(l.seria) === '0' || /SKIP/.test(str(l.typ)));
      const work = ls.filter(l => str(l.wykonane) === 'TAK' && !/^R/i.test(str(l.seria)) && String(l.seria) !== '0');
      const swap = ls.map(l => str(l.zamiana)).filter(Boolean)[0] || '', note = ls.map(l => str(l.uwagi)).filter(Boolean)[0] || '';
      const name = swap ? swap.split('|')[0].trim() : str(r.name) || str((ls[0] || {}).cwiczenie);
      if (!full) return work.length ? name + ': ' + work.map(setTxt).join(', ') : '';
      const plan = r.name ? 'plan ' + r.sets + '×' + str(r.reps) + (r.kg !== '' && r.kg !== null && r.kg !== undefined && str(r.kg) !== '' ? ' ' + numTxt(r.kg) + (typeof r.kg === 'number' ? ' kg' : '') : '') +
        (r.pct ? ' (' + Math.round(r.pct * 100) + '% max)' : '') + (r.rpe !== '' && r.rpe !== null && r.rpe !== undefined && str(r.rpe) !== '' ? ', RPE do ' + numTxt(r.rpe) : '') : 'poza planem';
      return '- ' + name + (r.prio ? ' (' + r.prio + ')' : '') + ' · ' + plan + ' · ' +
        (work.length ? 'zrobione: ' + work.map(setTxt).join('; ') : skip ? 'pominięte' : 'brak zapisanych serii') +
        (skip && work.length ? ' · skrócone' : '') + (skip && str(skip.uwagi) ? ' (' + str(skip.uwagi) + ')' : '') +
        (swap ? ' · zamiana: ' + swap : '') + (note && !(skip && note === str(skip.uwagi)) ? ' · komentarz klienta: „' + note + '”' : '') +
        (str(r.note) ? ' · uwagi w planie: ' + str(r.note) : '');
    }).filter(Boolean);
  };
  const p0 = planOf(W)[0] || {}, sd = dayOf(ses);
  const pain = str(ses.bol) ? str(ses.bol).split(';').map(x => x.split(':')).filter(x => str(x[0]) || str(x[1])).map(x => (str(x[0]) || 'bez miejsca') + ' ' + numTxt(x[1]) + '/10').join(', ')
    : Number(ses.bol_max) > 0 ? numTxt(ses.bol_max) + '/10' : '';
  const out = [];
  out.push('Osoba: tryb ' + (d.cfg && d.cfg.simple ? 'PROSTY (zapisuje wysiłek słowami: lekko/średnio/ciężko/max)' : 'PRO') + ', skala ' + (d.cfg && d.cfg.scale || 'RPE') + (d.cfg && d.cfg.masters ? ', masters' : '') + '.');
  out.push('Jednostka: tydzień ' + W + ', ' + D + (p0.title ? ' „' + p0.title + '”' : '') + (p0.block ? ', blok ' + p0.block : '') + (sd ? ', trening ' + sd : '') + (p0.own ? ' (własny trening klienta)' : '') + '.');
  if (p0.unote) out.push('Notatka trenera do jednostki: ' + p0.unote);
  out.push('', 'Plan i wykonanie (seria: kg×powtórzenia @RPE):');
  exOf(W, true).forEach(x => out.push(x));
  out.push('', 'Sesja: ' + [str(ses.czas_min) ? str(ses.czas_min) + ' min' : '', str(ses.rpe_sesji) !== '' ? 'RPE sesji ' + numTxt(ses.rpe_sesji) + '/10' : '',
    Number(ses.samopoczucie) > 0 ? 'samopoczucie ' + ses.samopoczucie + '/5' : '', pain ? 'ból: ' + pain : 'bez bólu'].filter(Boolean).join(', ') + '.');
  if (str(ses.uwagi)) out.push('Uwagi klienta do sesji: „' + str(ses.uwagi) + '”');
  const rd = (d.readiness || []).find(r => str(r.data).slice(0, 10) === sd);
  if (rd && str(rd.werdykt)) out.push('Dyspozycja tego dnia: ' + str(rd.werdykt) + (str(rd.powody) ? ' (' + str(rd.powody) + ')' : '') + '.');
  const prev = (d.sessions || []).filter(s => String(s.jednostka) === D && Number(s.tydzien) < W).sort((a, b) => Number(b.tydzien) - Number(a.tydzien)).slice(0, 3);
  if (prev.length) {
    out.push('', 'Poprzednie jednostki ' + D + ' (od najnowszej):');
    prev.forEach(s => { const ex = exOf(Number(s.tydzien), false).filter(Boolean);
      out.push('- tydzień ' + s.tydzien + (dayOf(s) ? ' (' + dayOf(s) + ')' : '') + (str(s.rpe_sesji) !== '' ? ', RPE sesji ' + numTxt(s.rpe_sesji) : '') + ': ' + (ex.join('; ') || 'brak serii')); });
  }
  const done = {}; (d.sessions || []).forEach(s => { done[Number(s.tydzien) + '|' + s.jednostka] = 1; });
  const next = (d.plan || []).filter(r => !r.own && !done[r.week + '|' + r.day] && str(r.date) && (!sd || str(r.date) > sd))
    .sort((a, b) => str(a.date).localeCompare(str(b.date)) || a.order - b.order)[0];
  if (next) {
    const nx = (d.plan || []).filter(r => r.week === next.week && r.day === next.day).sort((a, b) => a.order - b.order);
    out.push('', 'Następna jednostka: tydzień ' + next.week + ', ' + next.day + (next.title ? ' „' + next.title + '”' : '') + ', ' + next.date + ': ' +
      nx.map(r => r.name + ' ' + r.sets + '×' + str(r.reps) + (str(r.kg) ? ' ' + numTxt(r.kg) + (typeof r.kg === 'number' ? ' kg' : '') : '')).join(', ') + '.');
  }
  const kom = (d.sessions || []).filter(s => str(s.komentarz_trenera) && !(Number(s.tydzien) === W && String(s.jednostka) === D))
    .sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || Number(b.tydzien) - Number(a.tydzien)).slice(0, 5);
  if (kom.length) { out.push('', 'Wcześniejsze komentarze trenera do tej osoby (styl):'); kom.forEach(s => out.push('- „' + str(s.komentarz_trenera) + '”')); }
  return out.join('\n');
}

/** Szkic komentarza do sesji przez Claude API. → {text, cost (USD), n (szkice dziś), limit, model} */
function trSzkic(id, week, day, opt) {
  id = String(id || '').trim().toLowerCase();
  const props = PropertiesService.getScriptProperties(), key = String(props.getProperty('CLAUDE_API_KEY') || '').trim();
  if (!key) throw new Error('Szkic AI nie jest jeszcze włączony: wklej klucz Claude API w panelu → Ustawienia (klucz z console.anthropic.com).');
  const limit = Number(props.getProperty('AI_LIMIT')) || AI_LIMIT, today = today_();
  if (!aiDay_(props.getProperty('AI_DZIEN'), today, limit).ok) throw new Error('Dzisiejszy limit szkiców AI (' + limit + ') wyczerpany. Jutro znowu.');
  const row = trRow_(id), d = clientData_(clientOf_(row), Date.now());
  d.cfg.masters = String(row[8] || '').trim().toUpperCase() === 'TAK';
  const ctx = trSzkicCtx_(d, week, day);
  if (!ctx) throw new Error('Nie ma tej jednostki w zakładce Sesje.');
  if (!trSzkicSets_(d, week, day)) throw new Error('Klient nie zapisał w tej jednostce żadnej serii, więc szkic AI nie ma z czego pisać (bez opłaty).');
  const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    payload: JSON.stringify(aiReq_(ctx, opt)) });
  const code = r.getResponseCode();
  let j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) { j = {}; }
  if (code !== 200) {
    const m = String(j.error && j.error.message || r.getContentText()).slice(0, 300);
    if (code === 401) throw new Error('Klucz Claude API jest nieprawidłowy. Ustaw go ponownie (Trening → Ustaw klucz Claude API).');
    if (code === 429 || code === 529 || code >= 500) throw new Error('AI jest teraz zajęte, spróbuj za chwilę.');
    if (/credit|balance/i.test(m)) throw new Error('Brak środków na koncie Claude API (console.anthropic.com → Billing).');
    throw new Error('AI: ' + m);
  }
  if (j.stop_reason === 'refusal') throw new Error('AI nie napisało szkicu do tej sesji. Napisz komentarz sam.');
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  if (!text) throw new Error('AI zwróciło pusty szkic. Spróbuj ponownie.');
  const cost = aiCost_(j.model || AI_MODEL, j.usage), u = j.usage || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let n;
  try {
    n = aiDay_(props.getProperty('AI_DZIEN'), today, limit).n + 1;
    props.setProperty('AI_DZIEN', JSON.stringify({ d: today, n: n }));
    sheet_('AI', AI_HEADERS).appendRow([new Date(), 'szkic komentarza' + (opt && AI_POPRAW[opt.tweak] ? ' · ' + opt.tweak : ''), id, Number(week), String(day),
      String(j.model || AI_MODEL), Number(u.input_tokens) || 0, Number(u.output_tokens) || 0, cost]);
  } finally { lock.releaseLock(); }
  return { text: text, cost: cost, n: n, limit: limit, model: String(j.model || AI_MODEL) };
}

/** Czy tekst wygląda na klucz Claude API → '' albo powód odmowy (czysta, z testem). */
function aiKeyOk_(k) {
  k = String(k || '').trim();
  if (!k) return 'Wklej klucz.';
  if (/\s/.test(k)) return 'Klucz nie może mieć spacji ani nowych linii.';
  if (!/^sk-ant-[\w-]{20,}$/.test(k)) return 'To nie wygląda na klucz Claude API (zaczyna się od sk-ant-).';
  return '';
}
/** Końcówka klucza do pokazania w panelu („…AbCd”); całego klucza panel nigdy nie dostaje. */
const aiKeyEnd_ = k => { k = String(k || '').trim(); return k ? '…' + k.slice(-4) : ''; };

/** Panel → Ustawienia: stan szkiców AI (bez klucza). */
function trAI() {
  const p = PropertiesService.getScriptProperties(), k = String(p.getProperty('CLAUDE_API_KEY') || '').trim();
  const limit = Number(p.getProperty('AI_LIMIT')) || AI_LIMIT;
  return { set: !!k, end: aiKeyEnd_(k), limit: limit, n: aiDay_(p.getProperty('AI_DZIEN'), today_(), limit).n, model: AI_MODEL };
}

/** Panel → Ustawienia: zapis klucza (puste = usuń). Klucz sprawdzany bezpłatnie listą modeli, zanim trafi do właściwości. */
function trUstawAI(key) {
  const p = PropertiesService.getScriptProperties(), k = String(key || '').trim();
  if (!k) { p.deleteProperty('CLAUDE_API_KEY'); return trAI(); }
  const bad = aiKeyOk_(k);
  if (bad) throw new Error(bad + ' Nic nie zmieniono.');
  const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/models?limit=1', { method: 'get', muteHttpExceptions: true,
    headers: { 'x-api-key': k, 'anthropic-version': '2026-10-21' } });
  const code = r.getResponseCode();
  if (code === 401 || code === 403) throw new Error('Anthropic odrzucił ten klucz (wyłączony albo przepisany z błędem). Nic nie zmieniono.');
  p.setProperty('CLAUDE_API_KEY', k);
  const out = trAI();
  out.checked = code === 200;          // inna odpowiedź (np. chwilowa awaria) = zapisany, ale niesprawdzony
  return out;
}

/** Menu Trening → Ustaw klucz Claude API: klucz we właściwościach skryptu (puste = szkice AI wyłączone). */
function ustawAI() {
  const ui = SpreadsheetApp.getUi(), p = PropertiesService.getScriptProperties(), has = !!p.getProperty('CLAUDE_API_KEY');
  const a = ui.prompt('Klucz Claude API', 'Wklej klucz z console.anthropic.com (zaczyna się od sk-ant-). Puste = szkice AI wyłączone.\n\nTeraz: ' + (has ? 'ustawiony' : 'brak'), ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const k = a.getResponseText().trim();
  if (!k) { p.deleteProperty('CLAUDE_API_KEY'); alert_('Klucz Claude API', 'Szkice AI wyłączone.'); return; }
  if (aiKeyOk_(k)) { alert_('Klucz Claude API', aiKeyOk_(k) + ' Nic nie zmieniono.'); return; }
  p.setProperty('CLAUDE_API_KEY', k);
  alert_('Klucz Claude API', 'Zapisano. W panelu trenera działa teraz „Szkic AI”.');
}
