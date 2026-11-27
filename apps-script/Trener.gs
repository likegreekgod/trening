/* ================== PANEL TRENERA (web/trener.html) ==================
 * Osobna strona na GitHub Pages dla trenera: pulpit wszystkich klientów, karta klienta, filmy.
 * Rozmawia z tym samym /exec co aplikacja klientów, ale funkcje z TR_FNS nie przyjmują klucza klienta:
 * każde zapytanie niesie bilet logowania Google (ID token), który trAuth_ sprawdza u Google i porównuje
 * z adresem trenera we właściwościach skryptu (TRENER_EMAIL, kilka po przecinku) i identyfikatorem
 * klienta OAuth (TRENER_CLIENT_ID). Obie wartości ustawia menu „Trening → Ustaw panel trenera”;
 * nie trafiają do repozytorium ani do arkusza. Bez nich panel odpowiada „nie jest skonfigurowany”.
 * Odczyt: trPulpit, trKlient, trPrzelicz. Zapis: trKomentarz (komentarz do sesji), trKomentarzFilm (komentarz do serii z filmem). Filmy: trFilm (bilet do Drive API). Claude API: trSzkic (szkic komentarza,
 * klucz CLAUDE_API_KEY we właściwościach skryptu, dzienny limit, każde wywołanie w zakładce „AI”). AI tylko szkicuje, zapisuje trener.
 * Zamknięcie bloku: trBlok (Bloki.wnioski i dla_klienta), trBlokSzkic (szkic AI obu naraz).
 * Plan: trPlan (szybka zmiana serii, powt., kg, %, RPE, uwag i notatki do jednostki w niezrobionej jednostce, opcjonalnie też w kolejnych tygodniach).
 * Klienci: trKlienci (lista z ustawieniami i linkiem), trKlientUstaw (flagi z zakładki Klienci), trKlientNowy (nowy klient), trKlientLink (nowy klucz = nowy link).
 * Klucz ustawia trAI / trUstawAI (panel → Ustawienia, działa też na telefonie) albo menu „Ustaw klucz Claude API”; panel widzi tylko 4 ostatnie znaki.
 */
const TR_FNS = {   // po jednej nazwie w linii, alfabetycznie: równoległe PR-y dopisują w różnych miejscach
  trAgent,
  trAgentKlucz,
  trAgentUstaw,
  trAI,
  trAsystent,
  trBlok,
  trBlokPlan,
  trBlokSzkic,
  trBlokWczytaj,
  trConfig,
  trCwFilm,
  trCwiczenia,
  trCwNazwy,
  trCwSprawdz,
  trDysk,
  trFilm,
  trFilmSeria,
  trFilmWgraj,
  trImport,
  trJednostka,
  trKalendarz,
  trKlienci,
  trKlient,
  trKlientEksport,
  trKlientLink,
  trKlientNowy,
  trKlientUstaw,
  trKlientUsun,
  trKomentarz,
  trKomentarzFilm,
  trKopia,
  trKopiuj,
  trMail,
  trMailProba,
  trMailUstaw,
  trNastepna,
  trPakiet,
  trPakiety,
  trPlan,
  trPropozycja,
  trProwadzone,
  trPrzelicz,
  trPrzesun,
  trPulpit,
  trSzablon,
  trSzablony,
  trSzkic,
  trTytul,
  trUstawAI,
  trZasady,
  trZasadyUstaw,
};
const TR_ISS = ['accounts.google.com', 'https://accounts.google.com'];
const TR_AUTH = 'Logowanie: ';         // początek błędów logowania: panel wtedy prosi o ponowne zalogowanie
const TR_FILM_DNI = 14;                // filmy w panelu: ostatnie 14 dni
const TR_TYG = 12;                     // obciążenie na pulpicie: 12 tygodni
const TR_ODP_DNI = 14;                // odpowiedzi klientów na komentarze na pulpicie: ostatnie 14 dni

/* ---------- panel w Claude (pośrednik MCP na Cloudflare, mcp/, 27.11.2026) ----------
 * Pośrednik woła te same TR_FNS z biletem trenera i dopisuje src: 'mcp'. Zapisy z tej listy trafiają do zakładki API
 * (jak akcje botów klientów), żeby było widać, co zmienił Claude. Odczyty nie są zapisywane.
 */
const TR_MCP_ZAPIS = ['trJednostka', 'trKlientNowy', 'trKomentarz', 'trKomentarzFilm', 'trPlan', 'trPropozycja', 'trPrzesun'];   // = ZAPIS w mcp/src/tools.js
/** Czysta: zapytanie → wiersz dziennika API [klient, akcja, ok, opis] albo null (nie z Claude albo odczyt). */
function mcpLogRow_(req, ok, why) {
  if (!req || req.src !== 'mcp' || TR_MCP_ZAPIS.indexOf(req.fn) < 0) return null;
  const a = Array.isArray(req.args) ? req.args : [], f = a[0] && typeof a[0] === 'object' ? a[0] : null;   // trKlientNowy: pierwszy argument to formularz
  const id = f ? slugId_(String(f.id || '').trim() || f.imie) : String(a[0] === undefined || a[0] === null ? '' : a[0]).split('|')[0].toLowerCase();
  let opis = String(why || '');
  if (!opis) { try { opis = JSON.stringify(f ? a : a.slice(1)); } catch (e) { opis = ''; } }
  return [id, 'claude: ' + req.fn, !!ok, opis.slice(0, 200)];
}
function mcpLog_(req, ok, why) {
  const r = mcpLogRow_(req, ok, why);
  if (r) agLog_(r[0], r[1], r[2], r[3]);
}

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
    'uwagi', 'typ', 'ocena', 'komentarz_trenera', 'komentarz_dysk', 'odpowiedz_klienta', 'odpowiedz_at', 'wykonane', 'zamiana']);
  const ses = pgTable_('Sesje', ['klient', 'tydzien', 'jednostka', 'start', 'czas_min', 'rpe_sesji', 'komentarz_trenera', 'odpowiedz_klienta', 'odpowiedz_at']);
  const plan = pgTable_('Plan', ['klient', 'tydzien', 'jednostka', 'tytul', 'data', 'cwiczenie', 'serie', 'zrodlo']);
  const pk = pkgAll_(tableOf_('Pakiety'));
  const out = trPulpit_({ prz: tableOf_('Przegląd'), sum: tableOf_('Podsumowanie'), bloki: tableOf_('Bloki'), klienci: tableOf_('Klienci'), log: log, ses: ses, plan: plan },
    { today: today_(), localDay: localDay, at: PropertiesService.getScriptProperties().getProperty('PODSUM_AT') || '' });
  out.dysk = dysk_();                    // miejsce na Dysku: mało = czerwony wpis w „Wymaga uwagi” (Kopia.gs)
  out.clients.forEach(c => { if (pk[c.id]) c.pkg = pk[c.id]; });
  const names = {}; out.clients.forEach(c => { names[c.id] = c.name; });
  const prop = tableOf_('Propozycje');
  out.agent = agOpen_(prop, names, today_(), 7);   // zgłoszenia i propozycje botów klientów (Agent.gs) → karta „Od asystenta AI”
  out.agentOdrz = agOdrz_(prop, names, today_(), 7);
  out.agentAuto = agAuto_(prop, names, today_(), 7);   // zmiany zrobione samodzielnie przez boty (skrót, zamiana) → „Zrobił sam” z Cofnij
  return out;
}

/* ---------- panel → Więcej → Prowadzone (punkt 16 przeglądu v80, 23.11.2026) ----------
 * Treningi zapisane w trybie „Prowadź” (Sesje.prowadzil = trener) w wybranym miesiącu, na klienta: liczba, daty, minuty.
 * Dzień = Sesje.start w strefie skryptu (inaczej Sesje.data). Tylko odczyt; CSV składa panel.
 */
/** Czysta funkcja: → {mies, months: ['RRRR-MM' malejąco], clients: [{id, name, n, min, items: [{date, week, day, title, min}]}], n, min} */
function trProwadzone_(ses, klienci, plan, mies, today, localDay) {
  const lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase(), N = {}, T = {};
  (klienci || []).forEach(k => { const id = lc(k.klient_id); if (id) N[id] = String(k.imie || '').trim() || id; });
  (plan || []).forEach(r => { const k = [lc(r.klient), r.tydzien, String(r.jednostka).trim()].join('|'); if (!T[k] && String(r.tytul || '').trim()) T[k] = String(r.tytul).trim(); });
  const led = [];
  (ses || []).forEach(s => {
    if (lc(s.prowadzil) !== 'trener') return;
    const st = s.start instanceof Date ? s.start.toISOString() : String(s.start || ''), d0 = s.data instanceof Date ? s.data.toISOString().slice(0, 10) : String(s.data || '').slice(0, 10);
    const date = /^\d{4}-\d{2}-\d{2}T/.test(st) ? (localDay || localDayDefault_)(st) : /^\d{4}-\d{2}-\d{2}$/.test(d0) ? d0 : '';
    if (!date) return;
    const id = lc(s.klient), m = Number(s.czas_min);
    led.push({ id, date, week: Number(s.tydzien), day: String(s.jednostka).trim(), title: T[[id, s.tydzien, String(s.jednostka).trim()].join('|')] || String(s.jednostka).trim(), min: isFinite(m) && m > 0 ? Math.round(m) : 0 });
  });
  const months = [...new Set(led.map(x => x.date.slice(0, 7)).concat([String(today || '').slice(0, 7)]).filter(Boolean))].sort().reverse();
  const mm = /^\d{4}-\d{2}$/.test(String(mies || '')) ? String(mies) : months[0] || '';
  const C = {};
  led.filter(x => x.date.slice(0, 7) === mm).sort((a, b) => a.date.localeCompare(b.date)).forEach(x => {
    const c = C[x.id] = C[x.id] || { id: x.id, name: N[x.id] || x.id, n: 0, min: 0, items: [] };
    c.n++; c.min += x.min; c.items.push({ date: x.date, week: x.week, day: x.day, title: x.title, min: x.min });
  });
  const clients = Object.keys(C).map(k => C[k]).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'pl'));
  return { mies: mm, months: months, clients: clients, n: clients.reduce((a, c) => a + c.n, 0), min: clients.reduce((a, c) => a + c.min, 0) };
}
function trProwadzone(mies) {
  const tz = Session.getScriptTimeZone(), localDay = t => Utilities.formatDate(new Date(t), tz, 'yyyy-MM-dd');
  return trProwadzone_(pgTable_('Sesje', ['klient', 'tydzien', 'jednostka', 'data', 'start', 'czas_min', 'prowadzil']), tableOf_('Klienci'),
    pgTable_('Plan', ['klient', 'tydzien', 'jednostka', 'tytul']), mies, today_(), localDay);
}

/* ---------- Biblioteka → Szablony (v2 PR 5, 27.11.2026): te same szablony co „Zapisz jako szablon” w „Prowadź” ---------- */
/** Lista szablonów (zakładka Szablony, tplList_). */
function trSzablony() {
  return templates_();
}
/** Zapis szablonu z panelu: {name, ex, old (poprzednia nazwa)} albo {name, del: true}. Zwraca listę. */
function trSzablon(t) {
  return tplSave_(t || {});
}

/** Przelicza podsumowanie (jak menu „Odśwież podsumowanie”) i zwraca świeży pulpit. */
function trPrzelicz() {
  podsumowanie();
  return trPulpit();
}

/**
 * Czysta funkcja pulpitu. t: {prz, sum, bloki, klienci, log, ses} jako wiersze-obiekty z zakładek (tableOf_ / pgTable_),
 * o: {today 'RRRR-MM-DD', localDay, at}. → {today, at, clients, blocks, videos, replies, dzis}
 * dzis: „Dziś trenują” (trDzis_): jednostki aktywnych klientów z datą na dziś albo zaczęte / zapisane dziś, ze stanem
 * replies: odpowiedzi klientów na komentarze trenera z TR_ODP_DNI dni (Log i Sesje odpowiedz_klienta), najnowsze pierwsze
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
      last: d10(r.ostatni_trening), ago: num(r.dni_temu), week: frac_(r.ten_tydzien), late: Number(r.zalegle) || 0,
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
    rpe: l.rpe === '' ? '' : l.rpe, ocena: String(l.ocena || ''), typ: String(l.typ || ''), note: String(l.uwagi || ''), swap: String(l.zamiana || ''),
    file: fileIdOf_(l.film_link), link: String(l.film_link), kom: [l.komentarz_dysk, l.komentarz_trenera].filter(x => !blank_(x)).map(String).join('\n'),
    komT: blank_(l.komentarz_trenera) ? '' : String(l.komentarz_trenera), komD: blank_(l.komentarz_dysk) ? '' : String(l.komentarz_dysk),
    rep: blank_(l.odpowiedz_klienta) ? '' : String(l.odpowiedz_klienta).trim(), repAt: d10(l.odpowiedz_at) }))
    .filter(v => v.at && Math.round((day_(o.today) - day_(v.at)) / 864e5) < TR_FILM_DNI && Math.round((day_(o.today) - day_(v.at)) / 864e5) >= 0)
    .sort((a, b) => b.at.localeCompare(a.at) || a.name.localeCompare(b.name) || Number(a.order) - Number(b.order) || a.set.localeCompare(b.set));

  // odpowiedzi klientów na komentarze trenera (seria albo cały trening), z ostatnich TR_ODP_DNI dni
  const age = d => Math.round((day_(o.today) - day_(d)) / 864e5), rep = r => !blank_(r.odpowiedz_klienta) && String(r.odpowiedz_klienta).trim() !== '';
  const kom = r => [r.komentarz_dysk, r.komentarz_trenera].filter(x => !blank_(x)).map(String).join('\n');
  const replies = (t.log || []).filter(rep).map(l => ({ kind: 'L', id: lc(l.klient), week: l.tydzien, day: String(l.jednostka || ''), order: l.nr_cw, set: String(l.seria),
    title: String(l.cwiczenie || '') + ' · seria ' + String(l.seria), film: !blank_(l.film_link) && !!fileIdOf_(l.film_link), file: blank_(l.film_link) ? '' : fileIdOf_(l.film_link) || '', kom: kom(l), text: String(l.odpowiedz_klienta).trim(), at: d10(l.odpowiedz_at) }))
    .concat((t.ses || []).filter(rep).map(x => ({ kind: 'S', id: lc(x.klient), week: x.tydzien, day: String(x.jednostka || ''), order: '', set: '',
      title: 'Trening ' + String(x.jednostka || ''), film: false, file: '', kom: kom(x), text: String(x.odpowiedz_klienta).trim(), at: d10(x.odpowiedz_at) })))
    .filter(r => names[r.id] !== undefined && r.at && age(r.at) >= 0 && age(r.at) < TR_ODP_DNI)
    .map(r => Object.assign(r, { name: names[r.id] }))
    .sort((a, b) => b.at.localeCompare(a.at) || a.name.localeCompare(b.name));

  return { today: o.today, at: o.at || '', weeks: weeks, clients: clients, blocks: blocks, videos: videos, replies: replies,
    dzis: trDzis_(t.klienci, t.plan, t.log, t.ses, o.today, d10) };
}

/**
 * Czysta: „Dziś trenują” na ekranie Dziś panelu. Jednostka trafia na listę, gdy (aktywny klient z zakładki Klienci):
 * plan ma ją z datą na dziś (bez własnych, dodanych i usuniętych wierszy), klient zapisał dziś serię (Log.zapisano)
 * albo zaczął ją dziś (Sesje.start). Stan: „done” = jest w Sesjach, „live” = są serie, brak Sesji, „wait” = nic.
 * Serie: zaplanowane z Planu (własny trening: z jego wierszy), zrobione = robocze i dodatkowe (numer), jak trLogged_.
 * d10: komórka → „RRRR-MM-DD”. → [{id, name, week, day, title, own, ex, sets, done, st, rpe, min}]: w trakcie, czeka, zrobione; potem imię.
 */
function trDzis_(klienci, plan, log, ses, today, d10) {
  const lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  const names = {};
  (klienci || []).forEach(k => { if (!blank_(k.klient_id) && String(k.aktywny || '').trim().toUpperCase() !== 'NIE') names[lc(k.klient_id)] = String(k.imie || k.klient_id).trim(); });
  const U = {}, key = r => lc(r.klient) + '|' + Number(r.tydzien) + '|' + String(r.jednostka === undefined || r.jednostka === null ? '' : r.jednostka).trim();
  const unit = r => { const k = key(r); return U[k] = U[k] || { id: lc(r.klient), week: Number(r.tydzien), day: String(r.jednostka).trim(), title: '', own: false, names: {}, sets: 0, done: 0, today: false, ses: null }; };
  const P = {};
  (plan || []).forEach(r => { if (names[lc(r.klient)] === undefined || blank_(r.jednostka) || removed_(r) || added_(r)) return; (P[key(r)] = P[key(r)] || []).push(r); });
  Object.keys(P).forEach(k => { if (P[k].some(r => !own_(r) && !blank_(r.data) && d10(r.data) === today)) unit(P[k][0]).today = true; });
  (log || []).forEach(l => { if (names[lc(l.klient)] !== undefined && !blank_(l.zapisano) && d10(l.zapisano) === today) unit(l).today = true; });
  (ses || []).forEach(x => { if (names[lc(x.klient)] === undefined) return; const k = key(x);
    if (!blank_(x.start) && d10(x.start) === today) unit(x).today = true;
    if (U[k] || P[k]) unit(x).ses = x; });
  const out = Object.keys(U).filter(k => U[k].today).map(k => {
    const u = U[k], rows = P[k] || [];
    rows.forEach(r => { u.title = u.title || String(r.tytul || '').trim(); u.own = u.own || own_(r); if (!blank_(r.cwiczenie)) u.names[String(r.cwiczenie).trim()] = 1; u.sets += Number(r.serie) || 0; });
    (log || []).forEach(l => { if (key(l) === k && trLogged_(l) && /^\d+$/.test(String(l.seria).trim())) u.done++; });
    const s = u.ses, num = v => { const x = blank_(v) ? NaN : n_(v); return isFinite(x) ? x : null; };
    return { id: u.id, name: names[u.id], week: u.week, day: u.day, title: u.title || (u.own ? 'Własny trening' : 'Trening ' + u.day), own: u.own,
      ex: Object.keys(u.names).length, sets: u.sets, done: u.done, st: s ? 'done' : u.done ? 'live' : 'wait',
      rpe: s ? num(s.rpe_sesji) : null, min: s ? num(s.czas_min) : null };
  });
  const rank = { live: 0, wait: 1, done: 2 };
  return out.sort((a, b) => rank[a.st] - rank[b.st] || a.name.localeCompare(b.name, 'pl') || a.week - b.week || a.day.localeCompare(b.day));
}

/* ---------- panel v2 → Kalendarz (27.11.2026): jednostki wszystkich aktywnych klientów w zakresie dat ----------
 * Dzień jednostki: Sesje.start, inaczej pierwsza zapisana seria, inaczej data z planu. Stan: done (Sesja albo serie w minionym dniu),
 * live (serie dziś, bez Sesji), late (data z planu minęła, nic nie zapisane), wait. Bez daty: niezrobione jednostki trenera bez daty
 * z najniższego takiego tygodnia klienta (dalsze tygodnie bez dat pokażą się po kolei). Tylko odczyt.
 */
const TR_KAL_DNI = 62;          // najdłuższy zakres jednego zapytania (miesiąc z marginesem tygodni)
/** Czysta funkcja: → {from, to, today, units: [{id, name, week, day, title, block, date, plan, own, led, ex, sets, done, st, rpe, min}], undated: […]} */
function trKalendarz_(klienci, plan, log, ses, from, to, today, d10) {
  const lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase(), names = {};
  (klienci || []).forEach(k => { if (!blank_(k.klient_id) && String(k.aktywny || '').trim().toUpperCase() !== 'NIE') names[lc(k.klient_id)] = String(k.imie || k.klient_id).trim(); });
  const key = r => lc(r.klient) + '|' + Number(r.tydzien) + '|' + String(r.jednostka === undefined || r.jednostka === null ? '' : r.jednostka).trim();
  const U = {}, unit = r => { const k = key(r); return U[k] = U[k] || { id: lc(r.klient), week: Number(r.tydzien), day: String(r.jednostka).trim(), title: '', block: '', own: false,
    names: {}, sets: 0, done: 0, first: '', plan: '', rows: 0, ses: null }; };
  (plan || []).forEach(r => {
    if (names[lc(r.klient)] === undefined || blank_(r.jednostka) || removed_(r) || added_(r)) return;
    const u = unit(r); u.rows++;
    u.title = u.title || String(r.tytul || '').trim(); u.block = u.block || String(r.blok || '').trim(); u.own = u.own || own_(r);
    if (!blank_(r.cwiczenie)) u.names[String(r.cwiczenie).trim()] = 1;
    u.sets += Number(r.serie) || 0;
    if (!blank_(r.data) && (!u.plan || d10(r.data) < u.plan)) u.plan = d10(r.data);
  });
  (log || []).forEach(l => {
    if (!U[key(l)] || !trLogged_(l) || !/^\d+$/.test(String(l.seria).trim())) return;
    const u = U[key(l)], d = blank_(l.zapisano) ? '' : d10(l.zapisano);
    u.done++; if (d && (!u.first || d < u.first)) u.first = d;
  });
  (ses || []).forEach(x => { if (U[key(x)]) U[key(x)].ses = x; });
  const num = v => { const x = blank_(v) ? NaN : n_(v); return isFinite(x) ? x : null; };
  const all = Object.keys(U).map(k => {
    const u = U[k], s = u.ses, date = s && !blank_(s.start) ? d10(s.start) : u.first || u.plan;
    const st = s || (u.done && date && date < today) ? 'done' : u.done ? 'live' : u.plan && u.plan < today ? 'late' : 'wait';
    return { id: u.id, name: names[u.id], week: u.week, day: u.day, title: u.title || (u.own ? 'Własny trening' : 'Trening ' + u.day), block: u.block, date: date || '', plan: u.plan,
      own: u.own, led: !!(s && lc(s.prowadzil) === 'trener'), ex: Object.keys(u.names).length, sets: u.sets, done: u.done, st,
      rpe: s ? num(s.rpe_sesji) : null, min: s ? num(s.czas_min) : null };
  });
  const order = (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'pl') || a.week - b.week || a.day.localeCompare(b.day);
  const units = all.filter(u => u.date && u.date >= from && u.date <= to && !(u.own && u.st === 'wait')).sort(order);
  const low = {}; all.forEach(u => { if (!u.date && !u.own && u.week > 0 && (low[u.id] === undefined || u.week < low[u.id])) low[u.id] = u.week; });
  const undated = all.filter(u => !u.date && !u.own && u.week === low[u.id]).sort(order);
  return { from, to, today, units, undated };
}
function trKalendarz(from, to) {
  const ok = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  if (!ok(from) || !ok(to) || to < from) throw new Error('Zły zakres dat kalendarza.');
  if ((day_(to) - day_(from)) / 864e5 > TR_KAL_DNI) throw new Error('Za długi zakres kalendarza (najwyżej ' + TR_KAL_DNI + ' dni).');
  const tz = Session.getScriptTimeZone(), localDay = t => Utilities.formatDate(new Date(t), tz, 'yyyy-MM-dd');
  const d10 = v => blank_(v) ? '' : v instanceof Date ? localDay(v.toISOString()) : /T/.test(String(v)) ? localDay(String(v)) : String(v).slice(0, 10);
  return trKalendarz_(tableOf_('Klienci'), pgTable_('Plan', ['klient', 'tydzien', 'jednostka', 'tytul', 'data', 'cwiczenie', 'serie', 'zrodlo', 'blok']),
    pgTable_('Log', ['klient', 'tydzien', 'jednostka', 'seria', 'zapisano', 'wykonane', 'kg', 'powt', 'film_link', 'typ']),
    pgTable_('Sesje', ['klient', 'tydzien', 'jednostka', 'start', 'czas_min', 'rpe_sesji', 'prowadzil']), from, to, today_(), d10);
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
  d.blocks = tableOf_('Bloki').filter(b => lc(b.klient) === c.id).map(b => Object.assign({}, b, { od: day(b.od), do: day(b.do), jednostki: frac_(b.jednostki) }));
  d.summary = tableOf_('Podsumowanie').filter(s => lc(s.klient) === c.id).map(s => ({ week: day(s.tydzien_od), srpe: s.sRPE_TL_AU, acwr: s.ACWR,
    ton: s.tonaz_kg, done: s['wykonanie_%'], hard: s.serie_twarde, near: s.blisko_upadku, status: String(s.status || ''), why: String(s.powody || '') }));
  d.pkg = pkgOf_(c.id);
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
    sh.getRange(hit.getRow(), col).setValue(plain_(text));
  } finally { lock.releaseLock(); }
  return { text: text, at: new Date().toISOString() };
}

/* ---------- nazwa sesji (Plan.tytul całej jednostki; klient widzi ją w aplikacji, 27.11.2026) ----------
 * Zmienia tylko tytuł: tydzień i jednostka (T2, W1 …) zostają, bo są w id serii Logu i Sesji. Działa też w zrobionej jednostce.
 * Własny trening klienta zachowuje przedrostek „Własny · ”; pusty tytuł = sama jednostka (własny: „Własny”).
 */
const TR_TITLE_MAX = 40;

/** Czysta funkcja: e = {week, day, title} → {error} albo {set: [[indeks wiersza Planu od 0, {tytul}]], title (zapisany), own}. */
function trTitle_(plan, clientId, e) {
  e = e || {};
  const week = Number(e.week), day = String(e.day === undefined || e.day === null ? '' : e.day).trim();
  const lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  const rows = []; (plan || []).forEach((r, i) => { if (lc(r.klient) === clientId && Number(r.tydzien) === week && String(r.jednostka).trim() === day) rows.push({ r, i }); });
  if (!(week >= 0) || !day || !rows.some(x => !removed_(x.r))) return { error: 'Nie ma takiej jednostki w planie.' };
  const t = String(e.title === undefined || e.title === null ? '' : e.title).replace(/\s+/g, ' ').trim();
  if (t.length > TR_TITLE_MAX) return { error: 'Nazwa: najwyżej ' + TR_TITLE_MAX + ' znaków.' };
  const own = rows.some(x => own_(x.r)), title = own ? 'Własny' + (t ? ' · ' + t : '') : t;
  return { set: rows.filter(x => String(x.r.tytul === undefined || x.r.tytul === null ? '' : x.r.tytul).trim() !== title).map(x => [x.i, { tytul: title }]), title: title, own: own };
}

/** Nowa nazwa sesji klienta (trTitle_) → Plan.tytul wszystkich wierszy jednostki. */
function trTytul(id, e) {
  id = String(id || '').trim().toLowerCase();
  trRow_(id);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const res = trTitle_(tableOf_('Plan'), id, e);
    if (res.error) throw new Error(res.error);
    trPlanSet_(res.set);
    return { title: res.title, n: res.set.length };
  } finally { lock.releaseLock(); }
}

/* ---------- filmy w panelu: odtwarzacz i komentarz do serii ----------
 * trFilm: krótkotrwały bilet Google skryptu (właściciel arkusza), żeby przeglądarka trenera pobrała film z Drive API
 * (alt=media) do własnego odtwarzacza. Dostaje go tylko zalogowany trener (trAuth_); panel trzyma go tylko w pamięci strony.
 * trKomentarzFilm: komentarz trenera przy serii z filmem → Log.komentarz_trenera (klient widzi go w zakładce Trener).
 * Linie „0:03 treść” = chwila filmu; komentarze z Dysku (komentarz_dysk) zostają bez zmian.
 */
function trFilm() {
  return { token: ScriptApp.getOAuthToken(), exp: Date.now() + 50 * 60 * 1000 };
}

/** Id wiersza Logu dla serii (ten sam format co logSet). */
const trLogId_ = (id, week, day, order, set) => [String(id || '').trim().toLowerCase(), Number(week), String(day), Number(order), String(set)].join('|');

function trKomentarzFilm(id, week, day, order, set, text) {
  id = String(id || '').trim().toLowerCase();
  text = String(text === undefined || text === null ? '' : text).replace(/\r\n?/g, '\n').trim();
  if (text.length > TR_KOM_MAX) throw new Error('Komentarz jest za długi (najwyżej ' + TR_KOM_MAX + ' znaków).');
  trRow_(id);
  const lid = trLogId_(id, week, day, order, set);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_('Log', LOG_HEADERS);
    const col = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].indexOf('komentarz_trenera') + 1;
    const hit = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).createTextFinder(lid).matchEntireCell(true).findNext();
    if (!hit || col < 1) throw new Error('Nie ma tej serii w zakładce Log (' + lid + ').');
    sh.getRange(hit.getRow(), col).setValue(plain_(text));
  } finally { lock.releaseLock(); }
  return { text: text, at: new Date().toISOString() };
}

/* ---------- film z komputera do serii, tor sztangi i wnioski (panel → Filmy → Wgraj z komputera, 27.11.2026) ----------
 * trFilmWgraj: sesja resumable na Dysku w folderze klienta (uploadInit_, jak w aplikacji), plik wysyła przeglądarka trenera
 * prosto do Google (meta.origin = adres panelu). trFilmSeria: link, wynik analizy toru z przeglądarki (vbt_ms, vbt_peak,
 * wysokosc_cm, sciezka) i wnioski trenera (notatka_trenera, klient nie widzi) albo komentarz dla klienta (komentarz_trenera)
 * przy serii; seria, której nie ma w Logu, dopisuje się jako zrobiona (kg, powt., RPE z panelu). Zapisanej serii klienta
 * nie zmienia kg, powt. ani RPE.
 */
const TR_FILM_SET = /^(?:[1-9]\d?|R[1-9]\d?|D[1-9]\d?)$/;

/** Start wysyłki filmu z komputera trenera do serii klienta → {url} sesji resumable (tylko z adresem strony panelu). */
function trFilmWgraj(id, meta) {
  id = String(id || '').trim().toLowerCase();
  meta = Object.assign({}, meta || {});
  if (!/^https:\/\/[\w.-]+(:\d+)?$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(meta.origin || ''))) throw new Error('Brak adresu strony panelu.');
  const e = trFilmSeria_({ week: meta.week, day: meta.day, order: meta.order, set: meta.set, name: meta.name, date: meta.date });
  if (e.error) throw new Error(e.error);
  return { url: uploadInit_(clientOf_(trRow_(id)), meta) };
}

/**
 * Czysta funkcja: dane serii z panelu → {error} albo {key: {week, day, order, set}, base: {date, name, kg, reps, rpe}, set: {kolumna Logu: wartość}}.
 * set zawiera tylko pola, które panel przysłał (link, analiza, wnioski, komentarz dla klienta).
 */
function trFilmSeria_(s) {
  s = s || {};
  const str = v => String(v === undefined || v === null ? '' : v).trim();
  const week = Number(s.week), order = Number(s.order), day = str(s.day), set = str(s.set).toUpperCase(), name = str(s.name);
  if (!(week >= 0) || Math.floor(week) !== week) return { error: 'Zły tydzień.' };
  if (!day || day.length > 20) return { error: 'Zła jednostka.' };
  if (!(order >= 1) || Math.floor(order) !== order || order > 99) return { error: 'Zły numer ćwiczenia.' };
  if (!TR_FILM_SET.test(set)) return { error: 'Zła seria (1…99, R1…, D1…).' };
  if (!name || name.length > 120) return { error: 'Brak nazwy ćwiczenia.' };
  const date = str(s.date);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Zła data.' };
  const num = (v, lo, hi, what) => { if (v === undefined || v === null || v === '') return ''; const n = Number(String(v).replace(',', '.'));
    if (!isFinite(n) || n < lo || n > hi) throw new Error(what); return n; };
  const out = { key: { week: week, day: day, order: order, set: set }, set: {} };
  try {
    out.base = { date: date, name: name, kg: s.kg === 'BW' ? 'BW' : num(s.kg, 0, 600, 'Zły ciężar.'), reps: str(s.reps).slice(0, 12), rpe: num(s.rpe, 1, 10, 'Złe RPE (1–10).') };
    if (s.link !== undefined) {
      if (!/^https:\/\/drive\.google\.com\//.test(str(s.link))) return { error: 'Zły link do filmu.' };
      out.set.film_link = str(s.link);
    }
    if (s.vbt !== undefined) {
      let path = s.path === undefined || s.path === null ? '' : typeof s.path === 'string' ? s.path : JSON.stringify(s.path);
      if (path.length > 45000) path = '';
      Object.assign(out.set, { vbt_ms: num(s.vbt, 0, 10, 'Zła prędkość.'), vbt_peak: num(s.vbtPeak, 0, 15, 'Zła prędkość szczytowa.'),
        wysokosc_cm: num(s.height, 0, 300, 'Zła wysokość.'), sciezka: path });
    }
  } catch (err) { return { error: err.message }; }
  [['note', 'notatka_trenera'], ['forClient', 'komentarz_trenera']].forEach(([k, col]) => {
    if (s[k] === undefined) return;
    const t = String(s[k] === null ? '' : s[k]).replace(/\r\n?/g, '\n').trim();
    if (t.length > TR_KOM_MAX) out.error = 'Tekst jest za długi (najwyżej ' + TR_KOM_MAX + ' znaków).';
    out.set[col] = t;
  });
  if (out.error) return { error: out.error };
  return out;
}

/** Zapis przy serii klienta (trFilmSeria_): istniejący wiersz Logu = tylko przysłane kolumny; brak wiersza = nowa zrobiona seria. */
function trFilmSeria(id, s) {
  id = String(id || '').trim().toLowerCase();
  trRow_(id);
  const e = trFilmSeria_(s);
  if (e.error) throw new Error(e.error);
  const k = e.key, lid = trLogId_(id, k.week, k.day, k.order, k.set);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_('Log', LOG_HEADERS);
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const hit = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).createTextFinder(lid).matchEntireCell(true).findNext();
    if (hit) {
      Object.keys(e.set).forEach(c => { const col = head.indexOf(c) + 1; if (col > 0) sh.getRange(hit.getRow(), col).setValue(plain_(e.set[c])); });
      return { id: lid, added: false };
    }
    const b = e.base, row = LOG_HEADERS.map(() => '');
    const put = (c, v) => { row[LOG_HEADERS.indexOf(c)] = v; };
    [['id', lid], ['zapisano', new Date()], ['klient', id], ['tydzien', k.week], ['jednostka', k.day], ['data', b.date || today_()], ['nr_cw', k.order],
      ['cwiczenie', b.name], ['seria', k.set], ['kg', b.kg], ['powt', b.reps], ['rpe', b.rpe], ['wykonane', 'TAK'], ['typ', /^D/.test(k.set) ? 'DROP' : '']].forEach(x => put(x[0], x[1]));
    Object.keys(e.set).forEach(c => put(c, e.set[c]));
    sh.appendRow(plainRow_(row));
    return { id: lid, added: true };
  } finally { lock.releaseLock(); }
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
  '- Po polsku, w drugiej osobie, jak trener do swojego podopiecznego. Najwyżej 4 krótkie zdania, bez nagłówków, list, emoji i podpisu.',
  '- Nie wyliczaj, co klient zrobił (on to wie). Wybierz jedną, najważniejszą rzecz z tej jednostki (rekord, nieudana seria, wysokie RPE, pominięte ćwiczenie, uwaga klienta) i powiedz, co z niej wynika. Bez ogólników typu „dobra robota”.',
  '- Ostatnie zdanie to jedna konkretna decyzja na następną taką jednostkę, z liczbą (np. „W czwartek przysiad 85 kg, 3×5.”), oparta na planie i danych. Nie dawaj klientowi wyboru i nie asekuruj się („jeśli było za ciężko, zejdź trochę”).',
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
/**
 * Seria robocza zapisana w Logu (czysta): odhaczona (wykonane = TAK) albo nieodhaczona, ale z ciężarem, powtórzeniami albo filmem
 * (klient nagrał serię i nie dotknął ✓). Bez rozgrzewki, pominięć (seria 0, SKIP) i serii odznaczonych bez śladu.
 */
function trLogged_(l) {
  const s = v => v === undefined || v === null ? '' : String(v).trim(), se = s(l.seria);
  if (!se || se === '0' || /^R/i.test(se) || /SKIP/.test(s(l.typ))) return false;
  return s(l.wykonane).toUpperCase() === 'TAK' || s(l.kg) !== '' || s(l.powt) !== '' || s(l.film_link) !== '';
}
const trTicked_ = l => String(l.wykonane === undefined || l.wykonane === null ? '' : l.wykonane).trim().toUpperCase() === 'TAK';

function trSzkicSets_(d, week, day) {
  return (d.logs || []).filter(l => Number(l.tydzien) === Number(week) && String(l.jednostka).trim() === String(day).trim() && trLogged_(l)).length;
}

function trSzkicCtx_(d, week, day) {
  const W = Number(week), D = String(day), str = v => v === undefined || v === null ? '' : String(v).trim();
  const ses = (d.sessions || []).find(s => Number(s.tydzien) === W && String(s.jednostka).trim() === D.trim());
  if (!ses) return null;
  const dayOf = s => /T/.test(str(s.start)) ? str(s.start).slice(0, 10) : str(s.data).slice(0, 10);
  const numTxt = v => str(v).replace('.', ',');
  const OC = { L: 'łatwo', S: 'średnio', W: 'walka', X: 'spalone' };
  const setTxt = l => {
    const kg = str(l.kg), rp = str(l.rpe), oc = OC[str(l.ocena).toUpperCase()];
    return (/^D/i.test(str(l.seria)) || /DROP/.test(str(l.typ)) ? 'drop ' : '') + (kg && kg !== '0' ? numTxt(kg) + (isFinite(Number(kg.replace(',', '.'))) ? ' kg' : '') + '×' : '') + str(l.powt) +
      (oc ? ' (' + oc + ')' : rp ? ' @' + numTxt(rp) : '') + (/FAIL/.test(str(l.typ)) ? ' nieudana' : '') +
      (trTicked_(l) ? '' : str(l.kg) || str(l.powt) ? ' (nieodhaczona)' : 'seria ' + str(l.seria) + ' tylko z filmem, bez wpisu');
  };
  const planOf = w => (d.plan || []).filter(r => r.week === w && r.day === D).sort((a, b) => a.order - b.order);
  const exOf = (w, full) => {
    const P = {}; planOf(w).forEach(r => { P[r.order] = r; });
    const by = {};
    (d.logs || []).filter(l => Number(l.tydzien) === w && String(l.jednostka).trim() === D.trim()).forEach(l => {
      const k = Number(l.nr_cw); (by[k] = by[k] || []).push(l); });
    const keys = Object.keys(P).map(Number).concat(Object.keys(by).map(Number)).filter((k, i, a) => a.indexOf(k) === i).sort((a, b) => a - b);
    return keys.map(k => {
      const r = P[k] || {}, ls = (by[k] || []).sort((a, b) => String(a.seria).localeCompare(String(b.seria), 'pl', { numeric: true }));
      const skip = ls.find(l => String(l.seria) === '0' || /SKIP/.test(str(l.typ)));
      const work = ls.filter(trLogged_);
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
  if ((d.logs || []).some(l => Number(l.tydzien) === W && String(l.jednostka).trim() === D.trim() && trLogged_(l) && !trTicked_(l)))
    out.push('Uwaga: część serii klient nagrał albo wpisał, ale nie odhaczył w aplikacji. Traktuj je jako zrobione, bez zgadywania wysiłku, którego nie ma.');
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
  aiPre_();
  const row = trRow_(id), d = clientData_(clientOf_(row), Date.now());
  d.cfg.masters = String(row[8] || '').trim().toUpperCase() === 'TAK';
  const ctx = trSzkicCtx_(d, week, day);
  if (!ctx) throw new Error('Nie ma tej jednostki w zakładce Sesje.');
  if (!trSzkicSets_(d, week, day)) throw new Error('Klient nie zapisał w tej jednostce żadnej serii, więc szkic AI nie ma z czego pisać (bez opłaty).');
  return aiCall_(aiReq_(ctx, opt), ['szkic komentarza' + (opt && AI_POPRAW[opt.tweak] ? ' · ' + opt.tweak : ''), id, Number(week), String(day)]);
}

/** Klucz i dzienny limit przed zapytaniem do AI (wspólne dla szkiców). → {key, limit, today} */
function aiPre_() {
  const props = PropertiesService.getScriptProperties(), key = String(props.getProperty('CLAUDE_API_KEY') || '').trim();
  if (!key) throw new Error('Szkic AI nie jest jeszcze włączony: wklej klucz Claude API w panelu → Ustawienia (klucz z console.anthropic.com).');
  const limit = Number(props.getProperty('AI_LIMIT')) || AI_LIMIT, today = today_();
  if (!aiDay_(props.getProperty('AI_DZIEN'), today, limit).ok) throw new Error('Dzisiejszy limit szkiców AI (' + limit + ') wyczerpany. Jutro znowu.');
  return { key: key, limit: limit, today: today };
}

/** Jedno zapytanie do Messages API → odpowiedź (JSON) albo błąd po polsku. */
function aiFetch_(key, req) {
  let r;
  try {
    r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
      payload: JSON.stringify(req) });
  } catch (e) {   // Apps Script czeka na odpowiedź ograniczony czas (dłuższy szkic bloku może go przekroczyć)
    throw new Error(/time|czas/i.test(String(e && e.message)) ? 'AI nie zdążyło odpowiedzieć w limicie czasu Apps Script. Spróbuj ponownie albo z mniejszą liczbą tygodni.' : 'AI: brak połączenia (' + String(e && e.message).slice(0, 120) + ').');
  }
  const code = r.getResponseCode();
  let j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) { j = {}; }
  if (code !== 200) {
    const m = String(j.error && j.error.message || r.getContentText()).slice(0, 300);
    if (code === 401) throw new Error('Klucz Claude API jest nieprawidłowy. Ustaw go ponownie w panelu → Ustawienia.');
    if (code === 429 || code === 529 || code >= 500) throw new Error('AI jest teraz zajęte, spróbuj za chwilę.');
    if (/credit|balance/i.test(m)) throw new Error('Brak środków na koncie Claude API (console.anthropic.com → Billing).');
    throw new Error('AI: ' + m);
  }
  return j;
}

/** Licznik dnia i wiersz w zakładce „AI” po udanym zapytaniu. → numer zapytania dziś */
function aiNote_(pre, log, model, u, cost) {
  const props = PropertiesService.getScriptProperties(), lock = LockService.getScriptLock();
  u = u || {};
  lock.waitLock(20000);
  try {
    const n = aiDay_(props.getProperty('AI_DZIEN'), pre.today, pre.limit).n + 1;
    props.setProperty('AI_DZIEN', JSON.stringify({ d: pre.today, n: n }));
    sheet_('AI', AI_HEADERS).appendRow(plainRow_([new Date()].concat(log, [String(model || AI_MODEL), Number(u.input_tokens) || 0, Number(u.output_tokens) || 0, cost])));
    return n;
  } finally { lock.releaseLock(); }
}

/** Zapytanie do Messages API, licznik dnia i wiersz w zakładce „AI”. log: [akcja, klient, tydzien, jednostka]. → {text, cost, n, limit, model} */
function aiCall_(req, log) {
  const pre = aiPre_(), j = aiFetch_(pre.key, req);
  if (j.stop_reason === 'refusal') throw new Error('AI nie napisało szkicu. Napisz tekst sam.');
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  if (!text) throw new Error('AI zwróciło pusty szkic. Spróbuj ponownie.');
  const cost = aiCost_(j.model || AI_MODEL, j.usage), n = aiNote_(pre, log, j.model, j.usage, cost);
  return { text: text, cost: cost, n: n, limit: pre.limit, model: String(j.model || AI_MODEL) };
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

/* ---------- zamknięcie bloku: wnioski (tylko trener) i notatka dla klienta (aplikacja: Postęp → Blok) ----------
 * trBlok zapisuje obie kolumny w zakładce Bloki (keepNotes_ przenosi je przy przeliczaniu).
 * trBlokSzkic pisze szkic obu naraz (jedno zapytanie): dane bloku bez imienia (trBlokCtx_), odpowiedź z dwoma znacznikami (aiBlokParse_).
 */
function trBlok(id, blok, wnioski, dla) {
  id = String(id || '').trim().toLowerCase(); blok = String(blok || '').trim();
  const clean = v => String(v === undefined || v === null ? '' : v).replace(/\r\n?/g, '\n').trim();
  wnioski = clean(wnioski); dla = clean(dla);
  if (wnioski.length > TR_KOM_MAX || dla.length > TR_KOM_MAX) throw new Error('Tekst jest za długi (najwyżej ' + TR_KOM_MAX + ' znaków w polu).');
  trRow_(id);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName('Bloki');
    if (!sh) throw new Error('Nie ma zakładki Bloki. Kliknij „Przelicz teraz”.');
    const v = sh.getDataRange().getValues(), h = v[0].map(String), ck = h.indexOf('klient'), cb = h.indexOf('blok'), cw = h.indexOf('wnioski'), cd = h.indexOf('dla_klienta');
    if (ck < 0 || cb < 0 || cw < 0 || cd < 0) throw new Error('Zakładka Bloki nie ma kolumn wnioski i dla_klienta. Kliknij „Przelicz teraz”.');
    const i = v.findIndex((r, k) => k > 0 && String(r[ck]).trim().toLowerCase() === id && String(r[cb]).trim() === blok);
    if (i < 1) throw new Error('Nie ma bloku ' + blok + ' tego klienta w zakładce Bloki. Kliknij „Przelicz teraz”.');
    sh.getRange(i + 1, cw + 1).setValue(plain_(wnioski));
    sh.getRange(i + 1, cd + 1).setValue(plain_(dla));
  } finally { lock.releaseLock(); }
  return { wnioski: wnioski, dla_klienta: dla };
}

const AI_POPRAW_BLOK = {
  krocej: 'Skróć oba teksty: wnioski do 3 zdań, tekst dla klienta do 2 zdań. Zostaw najważniejsze liczby i decyzję.',
  cieplej: 'Tekst dla klienta napisz cieplej i bardziej motywująco, bez lukru i bez wykrzykników w każdym zdaniu. Wnioski zostaw bez zmian.',
  inny: 'Napisz zupełnie inną wersję obu tekstów, z innym akcentem.'
};
const AI_SYSTEM_BLOK = [
  'Jesteś asystentem trenera personalnego (trening siłowy, sylwetka, podnoszenie ciężarów). Piszesz szkic dwóch tekstów po zakończonym bloku treningowym (kilka tygodni) jego podopiecznego.',
  'Trener przeczyta oba teksty, poprawi je i dopiero wtedy zapisze. Klient zobaczy tylko drugi tekst.',
  'Odpowiedz dokładnie w tym układzie, bez niczego przed i po:',
  'WNIOSKI:',
  '<tekst dla trenera>',
  'DLA KLIENTA:',
  '<tekst dla klienta>',
  'Wnioski (tylko dla trenera): najwyżej 5 krótkich zdań, rzeczowo, z liczbami z danych. Co urosło, co stoi albo spadło i co prawdopodobnie za tym stoi (obciążenie, ból, dyspozycja, pominięcia, nieudane serie). Ostatnie zdanie to jedna konkretna decyzja na następny blok z liczbami (ciężary zaokrąglone w dół do 2,5 kg, serie×powtórzenia). Jeśli w danych jest już plan następnego bloku, oceń go w tym zdaniu zamiast wymyślać nowy. Bez asekuracji.',
  'Dla klienta: 3–4 zdania, ciepło i konkretnie, bez żargonu (bez e1RM, sRPE, ACWR, RPE), w drugiej osobie. Nie znasz płci klienta: nie używaj form zależnych od płci (pisz „masz za sobą 11 treningów”, „zrobione wszystkie treningi”, a nie „zrobiłeś”, „zrobiłaś”). Jedna rzecz, z której klient może być dumny, jedna, nad którą pracujecie, i co czeka w następnym bloku.',
  'Ból: przy bólu powyżej 3/10 we wnioskach nazwij go z liczbą i miejscem, w tekście dla klienta spokojnie i bez diagnoz.',
  'Używaj tylko liczb z danych, niczego nie dopisuj. Bez nagłówków poza dwoma znacznikami, bez list, emoji i podpisu. Jeśli są wcześniejsze wnioski trenera, pisz we wnioskach w ich stylu.'
].join('\n');

/** Dwa teksty z odpowiedzi AI (czysta). Bez znaczników całość trafia do wniosków. → {wnioski, dla_klienta} */
function aiBlokParse_(t) {
  t = String(t || '').replace(/\r\n?/g, '\n');
  const m = /(?:^|\n)[\s*#_]*WNIOSKI[\s*#_]*:[\s*#_]*([\s\S]*?)\n[\s*#_]*DLA KLIENTA[\s*#_]*:[\s*#_]*([\s\S]*)$/i.exec(t);
  if (!m) return { wnioski: t.trim(), dla_klienta: '' };
  return { wnioski: m[1].trim(), dla_klienta: m[2].trim() };
}

/** Treść zapytania o szkic bloku (czysta). opt: {tweak, draft: {w, k}}. */
function aiBlokReq_(ctx, opt) {
  opt = opt || {};
  let msg = 'Dane bloku:\n\n' + ctx;
  const tw = AI_POPRAW_BLOK[opt.tweak], dr = opt.draft || {};
  if (tw) msg += (String(dr.w || dr.k || '').trim() ? '\n\nPoprzedni szkic:\nWNIOSKI:\n' + String(dr.w || '').trim().slice(0, TR_KOM_MAX) + '\nDLA KLIENTA:\n' + String(dr.k || '').trim().slice(0, TR_KOM_MAX) : '') + '\n\nPopraw szkic: ' + tw;
  else msg += '\n\nNapisz szkic wniosków i tekstu dla klienta po tym bloku.';
  return { model: AI_MODEL, max_tokens: 4000, system: AI_SYSTEM_BLOK, messages: [{ role: 'user', content: msg }],
    output_config: { effort: 'low' }, fallbacks: 'default' };
}

/** Zapisane serie robocze w tygodniach bloku (0 = nie ma z czego pisać, bez zapytania do AI). */
function trBlokSets_(d, blok) {
  const W = {}; (d.plan || []).forEach(r => { if (String(r.block || '') === String(blok) && !r.own) W[Number(r.week)] = 1; });
  return (d.logs || []).filter(l => W[Number(l.tydzien)] && trLogged_(l)).length;
}

/**
 * Dane bloku do szkicu (czysta). d: wynik clientData_ z blocks (wiersze Bloków) → tekst albo null (brak bloku).
 * Bez imienia, klucza i linków: wiersz Bloków, tydzień po tygodniu, ćwiczenia A (najlepsza seria pierwszego i ostatniego tygodnia),
 * nieudane i pominięte, komentarze klienta, poprzedni blok z wnioskami trenera (styl), pierwszy tydzień następnego bloku.
 */
function trBlokCtx_(d, blok) {
  const str = v => v === undefined || v === null ? '' : String(v).trim(), num = v => str(v).replace('.', ','), B = String(blok);
  const rows = (d.blocks || []).filter(b => str(b.blok) && str(b.blok) !== NO_BLOCK).sort((a, b) => str(a.od).localeCompare(str(b.od)));
  const bi = rows.findIndex(b => str(b.blok) === B); if (bi < 0) return null;
  const b = rows[bi], prev = rows[bi - 1], next = rows[bi + 1];
  const line = x => [str(x.od) && str(x.do) ? str(x.od) + '–' + str(x.do) : '', str(x.tygodnie) ? 'tygodnie ' + str(x.tygodnie) : '', str(x.jednostki) ? 'jednostki zrobione/plan ' + str(x.jednostki) : '',
    str(x['wykonanie_%']) ? 'wykonanie serii z planu ' + str(x['wykonanie_%']) + '%' : '', Number(x.tonaz_kg) > 0 ? 'tonaż ' + Math.round(Number(x.tonaz_kg)) + ' kg' : '',
    str(x.e1RM_zm) ? 'szacowane maksimum (e1RM): ' + str(x.e1RM_zm) : '', str(x.najlepsze_boje) ? 'najlepsze boje: ' + str(x.najlepsze_boje) : '',
    str(x.sRPE_sr) ? 'średnie RPE sesji ' + num(x.sRPE_sr) : '', str(x.samopocz_sr) ? 'samopoczucie śr. ' + num(x.samopocz_sr) + '/5' : '',
    str(x.dyspozycja) ? 'dyspozycja: ' + str(x.dyspozycja) : '', str(x.bol_max) !== '' ? 'ból max ' + num(x.bol_max) + '/10' : '', str(x.statusy) ? 'statusy tygodni: ' + str(x.statusy) : ''].filter(Boolean).join(', ');
  const plan = (d.plan || []).filter(r => str(r.block) === B && !r.own);
  const weeks = plan.map(r => Number(r.week)).filter((w, i, a) => a.indexOf(w) === i).sort((x, y) => x - y), inB = w => weeks.indexOf(Number(w)) >= 0;
  const P = {}; plan.forEach(r => { P[r.week + '|' + r.day + '|' + r.order] = r; });
  const logs = (d.logs || []).filter(l => inB(l.tydzien)), work = l => str(l.wykonane) === 'TAK' && !/^R/i.test(str(l.seria)) && str(l.seria) !== '0';
  const ses = (d.sessions || []).filter(s => inB(s.tydzien));
  const out = [];
  out.push('Osoba: tryb ' + (d.cfg && d.cfg.simple ? 'PROSTY' : 'PRO') + ', skala ' + (d.cfg && d.cfg.scale || 'RPE') + (d.cfg && d.cfg.masters ? ', masters' : '') + '.');
  out.push('Blok ' + B + ': ' + line(b) + '.');
  if (weeks.length) {
    out.push('', 'Tydzień po tygodniu:');
    weeks.forEach(w => {
      const days = plan.filter(r => Number(r.week) === w).map(r => r.day).filter((x, i, a) => a.indexOf(x) === i);
      const sw = ses.filter(s => Number(s.tydzien) === w), lw = logs.filter(l => Number(l.tydzien) === w && work(l));
      const ton = lw.reduce((a, l) => { const kg = Number(str(l.kg).replace(',', '.')), r = Number(str(l.powt).replace(',', '.')); return a + (kg > 0 && r > 0 && !/s$/.test(str(l.powt)) ? kg * r : 0); }, 0);
      const rp = sw.map(s => Number(s.rpe_sesji)).filter(x => x >= 0 && str(x) !== ''), fe = sw.map(s => Number(s.samopoczucie)).filter(x => x > 0), pm = sw.map(s => Number(s.bol_max)).filter(x => x >= 0);
      const avg = a => num(Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10);
      out.push('- tydzień ' + w + ': jednostki ' + sw.filter(s => days.indexOf(s.jednostka) >= 0).length + '/' + days.length + (ton ? ', tonaż ' + Math.round(ton) + ' kg' : '') +
        (rp.length ? ', RPE sesji śr. ' + avg(rp) : '') + (fe.length ? ', samopoczucie ' + avg(fe) + '/5' : '') + (pm.length && Math.max(...pm) > 0 ? ', ból max ' + num(Math.max(...pm)) + '/10' : ''));
    });
  }
  const setTxt = l => num(l.kg) + (isFinite(Number(str(l.kg).replace(',', '.'))) ? ' kg' : '') + '×' + str(l.powt) + (str(l.rpe) ? ' @' + num(l.rpe) : '');
  const e1 = l => { const kg = Number(str(l.kg).replace(',', '.')), r = Number(str(l.powt).replace(',', '.')), rp = Number(str(l.rpe).replace(',', '.')) || 10; return kg > 0 && r > 0 ? e1rm_(kg, r, rp) : 0; };
  const A = {}; plan.filter(r => str(r.prio) === 'A').forEach(r => { A[str(r.name)] = 1; });
  const aLines = Object.keys(A).map(n => {
    const ls = logs.filter(l => work(l) && !/FAIL/.test(str(l.typ)) && str(l.cwiczenie) === n), ws = ls.map(l => Number(l.tydzien)).filter((w, i, a) => a.indexOf(w) === i).sort((x, y) => x - y);
    if (!ws.length) return '';
    const top = w => ls.filter(l => Number(l.tydzien) === w).sort((x, y) => e1(y) - e1(x))[0];
    const f = top(ws[0]), t = top(ws[ws.length - 1]);
    return '- ' + n + ': ' + setTxt(f) + ' (tydz. ' + ws[0] + ')' + (ws.length > 1 ? ' → ' + setTxt(t) + ' (tydz. ' + ws[ws.length - 1] + ')' : '');
  }).filter(Boolean);
  if (aLines.length) { out.push('', 'Ćwiczenia główne (A), najlepsza seria pierwszego → ostatniego tygodnia:'); aLines.forEach(x => out.push(x)); }
  const fails = {}; logs.filter(l => /FAIL/.test(str(l.typ))).forEach(l => { fails[str(l.cwiczenie)] = (fails[str(l.cwiczenie)] || 0) + 1; });
  if (Object.keys(fails).length) out.push('', 'Nieudane serie/podejścia: ' + Object.keys(fails).map(k => k + ' ' + fails[k]).join(', ') + '.');
  const skips = logs.filter(l => str(l.seria) === '0' || /SKIP/.test(str(l.typ))).map(l => (P[l.tydzien + '|' + l.jednostka + '|' + l.nr_cw] || {}).name || str(l.cwiczenie));
  if (skips.length) out.push('Pominięte albo skrócone ćwiczenia: ' + skips.join(', ') + '.');
  const unPlanned = weeks.map(w => plan.filter(r => Number(r.week) === w).map(r => r.day).filter((x, i, a) => a.indexOf(x) === i).filter(dd => !ses.some(s => Number(s.tydzien) === w && s.jednostka === dd) && !logs.some(l => Number(l.tydzien) === w && l.jednostka === dd)).map(dd => 'tydz. ' + w + ' ' + dd)).reduce((a, x) => a.concat(x), []);
  if (unPlanned.length) out.push('Niezrobione jednostki: ' + unPlanned.join(', ') + '.');
  const notes = [];
  logs.forEach(l => { const t = str(l.uwagi); if (t && !/SKIP/.test(str(l.typ)) && str(l.seria) !== '0' && notes.indexOf(str(l.cwiczenie) + ': „' + t + '”') < 0) notes.push(str(l.cwiczenie) + ': „' + t + '”'); });
  ses.forEach(s => { if (str(s.uwagi)) notes.push('sesja tydz. ' + s.tydzien + ' ' + s.jednostka + ': „' + str(s.uwagi) + '”'); });
  if (notes.length) { out.push('', 'Komentarze klienta:'); notes.slice(-8).forEach(x => out.push('- ' + x)); }
  const pains = ses.filter(s => str(s.bol)).map(s => 'tydz. ' + s.tydzien + ' ' + s.jednostka + ': ' + str(s.bol).split(';').map(x => x.split(':')).filter(x => Number(x[1]) > 0).map(x => (str(x[0]) || 'bez miejsca') + ' ' + num(x[1]) + '/10').join(', ')).filter(x => !/: $/.test(x));
  if (pains.length) out.push('Ból zgłoszony: ' + pains.join('; ') + '.');
  if (prev) {
    out.push('', 'Poprzedni blok ' + str(prev.blok) + ': ' + line(prev) + '.');
    if (str(prev.wnioski)) out.push('Wnioski trenera po bloku ' + str(prev.blok) + ' (styl): „' + str(prev.wnioski) + '”');
  }
  const nb = next ? str(next.blok) : '', np = (d.plan || []).filter(r => !r.own && str(r.block) && str(r.block) !== B && Number(r.week) > Math.max(0, ...weeks));
  const nBlok = nb || (np[0] ? str(np[0].block) : '');
  if (nBlok) {
    const nw = (d.plan || []).filter(r => str(r.block) === nBlok && !r.own), w0 = Math.min(...nw.map(r => Number(r.week)));
    if (isFinite(w0)) out.push('', 'Plan następnego bloku ' + nBlok + ', pierwszy tydzień (' + w0 + '): ' + nw.filter(r => Number(r.week) === w0).sort((x, y) => str(x.day).localeCompare(str(y.day)) || x.order - y.order)
      .map(r => r.day + ' ' + r.name + ' ' + r.sets + '×' + str(r.reps) + (str(r.kg) ? ' ' + num(r.kg) + (typeof r.kg === 'number' ? ' kg' : '') : '')).join(', ') + '.');
  } else out.push('', 'Planu następnego bloku jeszcze nie ma.');
  return out.join('\n');
}

/** Szkic wniosków i tekstu dla klienta po bloku. → {wnioski, dla_klienta, cost, n, limit, model} */
function trBlokSzkic(id, blok, opt) {
  id = String(id || '').trim().toLowerCase(); blok = String(blok || '').trim();
  aiPre_();
  const row = trRow_(id), c = clientOf_(row), d = clientData_(c, Date.now());
  d.cfg.masters = String(row[8] || '').trim().toUpperCase() === 'TAK';
  const tz = Session.getScriptTimeZone(), day = x => x instanceof Date ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : String(x || '').slice(0, 10);
  d.blocks = tableOf_('Bloki').filter(b => String(b.klient).trim().toLowerCase() === c.id).map(b => Object.assign({}, b, { od: day(b.od), do: day(b.do), jednostki: frac_(b.jednostki) }));
  const ctx = trBlokCtx_(d, blok);
  if (!ctx) throw new Error('Nie ma bloku ' + blok + ' tego klienta w zakładce Bloki. Kliknij „Przelicz teraz”.');
  if (!trBlokSets_(d, blok)) throw new Error('W tym bloku nie ma zapisanych serii, więc szkic AI nie ma z czego pisać (bez opłaty).');
  const r = aiCall_(aiBlokReq_(ctx, opt), ['szkic bloku' + (opt && AI_POPRAW_BLOK[opt.tweak] ? ' · ' + opt.tweak : ''), id, '', blok]);
  const p = aiBlokParse_(r.text);
  return { wnioski: p.wnioski, dla_klienta: p.dla_klienta, cost: r.cost, n: r.n, limit: r.limit, model: r.model };
}

/* ---------- szkic następnego bloku (AI) i wczytanie go do planu ----------
 * trBlokPlan: dane ostatniego bloku (trPlanCtx_, bez imienia) → Claude API (structured outputs, zwarte komórki „serie x powt | kg | % | RPE”)
 * → trPlanRows_ dokłada klienta, nazwę bloku (B+1), ciągłe tygodnie, daty, przenosi grupę, zamienniki, dod_serie itd. z poprzedniego
 * bloku i sprawdza wiersze validatePlan_ (jak plik z Dysku). Nic nie trafia do arkusza.
 * trBlokWczytaj: wiersze ze szkicu (po stronie panelu) → plik JSON w „_plany” → importPlanFile_ od razu (Import, mergePlan_).
 */
const PLAN_TYG_MAX = 8;                  // najwyżej 8 tygodni w jednym szkicu
const PLAN_POPRAW = {
  lzej: 'Zrób cały blok lżejszym: ciężary niżej (ok. 2,5–5 kg w ćwiczeniach ze sztangą, mniej w pozostałych) albo niższe RPE max, bez zmiany liczby serii.',
  ciezej: 'Zrób cały blok cięższym: ciężary wyżej o jeden krok (2,5 kg w ćwiczeniach ze sztangą), bez przekraczania tego, co uzasadniają wyniki.',
  mniej: 'Zmniejsz objętość: o jedną serię mniej w ćwiczeniach B i K, ćwiczenia A bez zmian.',
  inny: 'Napisz inną wersję bloku: inna progresja (np. falowa zamiast liniowej), te same ćwiczenia.'
};
const AI_SYSTEM_PLAN = [
  'Jesteś asystentem trenera personalnego (trening siłowy, sylwetka, podnoszenie ciężarów). Układasz szkic NASTĘPNEGO bloku treningowego podopiecznego na podstawie zakończonego bloku. Trener przejrzy szkic i dopiero wtedy wczyta go do aplikacji klienta.',
  'Zasady trenera (obowiązują zawsze):',
  '- Te same jednostki (nazwy, tytuły, dni tygodnia) i te same ćwiczenia w tej samej kolejności co ostatni tydzień bloku, chyba że wskazówki trenera, ból albo wyniki wyraźnie mówią inaczej. Zmianę ćwiczenia uzasadnij.',
  '- Ciężary w kg zaokrąglone w dół do 2,5 kg (ćwiczenia ze sztangą i maszyny). Hantle i kettle: realne ciężary (co 1–2 kg).',
  '- Małe ciężary (hantle, kettle, wyciągi i maszyny w ćwiczeniach izolowanych albo ciężar poniżej 20 kg): skok 2,5 kg to za dużo (przy 10 kg to +25%). Tam najpierw powtórzenia: po samych lekkich seriach +1 powtórzenie w serii do górnej granicy zakresu (np. 8 → 10 przy „8-10”; bez zakresu najwyżej +2 powt.), dopiero potem najmniejszy realny skok ciężaru (hantle +1–2 kg, wyciąg o jedno pole) i powrót do dolnej granicy powtórzeń.',
  '- Progresja z wyników ostatniego tygodnia ćwiczenia (większe ciężary): same lekkie serie (RPE ≤ 7,5) = +2,5 kg; średnie (RPE 8–8,5) = ten sam ciężar albo +2,5 kg, jeśli wszystkie powtórzenia zrobione; ciężkie (RPE ≥ 9) albo nieudane = ten sam ciężar albo mniej, ewentualnie więcej serii przy tym samym ciężarze. Seria bez RPE = brak danych, decyduj po reszcie.',
  '- rpe_max to sufit wysiłku (np. 8), nie cel. Ćwiczenia korekcyjne mają priorytet K. Priorytety A/B/K zostają jak w bloku, chyba że zmieniasz ćwiczenie.',
  '- Boje olimpijskie i ich warianty: % z maksa przy każdym ćwiczeniu specjalnym, jeśli był w bloku; kg zgodne z %; bez RPE max (puste). Po spalonych podejściach najpierw stabilizuj ciężar, potem podnoś.',
  '- Ból powyżej 3/10 albo powtarzający się w tym samym miejscu: oszczędź to miejsce (lżej, zamiennik, mniej serii) i napisz to w uzasadnieniu.',
  '- Tygodnie zwykle rosną; ostatni tydzień lżejszy (ok. −10% i mniej serii) tylko, gdy trener o to prosi albo blok ma ≥ 5 tygodni i było ciężko (wysokie RPE sesji, nieudane serie, słaba dyspozycja).',
  'Format odpowiedzi (JSON wg schematu):',
  '- "dlaczego": najwyżej 4 krótkie zdania dla trenera, konkretne decyzje z liczbami (co rośnie, co stoi i dlaczego). Bez ogólników.',
  '- "jednostki": każda z polami jednostka (np. T1), tytul, dzien (0 = poniedziałek … 6 = niedziela), notatki (lista długości = liczba tygodni; notatka trenera do całej jednostki w danym tygodniu albo ""; zwykle puste, wpisz tylko coś ważnego dla klienta), cwiczenia.',
  '- ćwiczenie: cwiczenie (nazwa jak w bloku), prio (A/B/K), uwagi (krótka wskazówka techniczna dla klienta albo ""), tygodnie: lista długości = liczba tygodni, każdy element to tekst "serie x powt | kg | procent | rpe_max", np. "4 x 5 | 92.5 | | 8", "5 x 2 | 62.5 | 75 | ", "3 x 8/str | 24 | | 9", "2 x 12/str | guma | | ". Powtórzenia tak jak w bloku (np. 6-8, 8/str, 1+1, 30 s). kg: liczba z kropką albo tekst (BW, guma) albo puste. procent: liczba 1–130 albo puste. rpe_max: 5–10 albo puste.',
  'Używaj tylko danych z wiadomości, niczego nie zmyślaj. Bez imion.'
].join('\n');
const AI_SCHEMA_PLAN = {
  type: 'object', additionalProperties: false, required: ['dlaczego', 'jednostki'],
  properties: {
    dlaczego: { type: 'string' },
    jednostki: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['jednostka', 'tytul', 'dzien', 'notatki', 'cwiczenia'],
      properties: { jednostka: { type: 'string' }, tytul: { type: 'string' }, dzien: { type: 'integer' }, notatki: { type: 'array', items: { type: 'string' } },
        cwiczenia: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['cwiczenie', 'prio', 'uwagi', 'tygodnie'],
          properties: { cwiczenie: { type: 'string' }, prio: { type: 'string', enum: ['A', 'B', 'K'] }, uwagi: { type: 'string' }, tygodnie: { type: 'array', items: { type: 'string' } } } } } } } }
  }
};

/** Nazwa następnego bloku (czysta): B2 → B3, wolna wśród nazw klienta. */
function trBlokNext_(blok, names) {
  const m = /^(.*?)(\d+)$/.exec(String(blok || '').trim()), base = m ? m[1] : (String(blok || '').trim() || 'B');
  let n = m ? Number(m[2]) + 1 : 2;
  while ((names || []).indexOf(base + n) >= 0) n++;
  return base + n;
}

const trDow_ = d => (new Date(String(d).slice(0, 10) + 'T12:00:00Z').getUTCDay() + 6) % 7;   // 0 = pn
const planWork_ = l => { const s = String(l.seria === undefined || l.seria === null ? '' : l.seria).trim(); return /^\d+$/.test(s) && s !== '0' && !/SKIP/.test(String(l.typ || '')); };
/** Światło serii jako znak (czysta): L lekko, S średnio, W ciężko, X nieudana, · bez oceny. */
function trLight_(l) {
  if (/FAIL/.test(String(l.typ || ''))) return 'X';
  const r = Number(String(l.rpe === undefined || l.rpe === null ? '' : l.rpe).replace(',', '.'));
  if (String(l.rpe === undefined || l.rpe === null ? '' : l.rpe).trim() === '' || !isFinite(r)) return '·';
  return r <= 7.5 ? 'L' : r < 9 ? 'S' : 'W';
}

/**
 * Ostatni tydzień każdej jednostki bloku (czysta): {prevWeek, weeks, days: [{day, title, dow, week}], prev: {„T1|nazwa”: {sets, reps, kg, lights}}}.
 * Światła z serii roboczych tej jednostki (po numerze ćwiczenia, kolejno po serii); null = brak bloku.
 */
function trPlanPrev_(d, blok) {
  const B = String(blok), plan = (d.plan || []).filter(r => !r.own && !r.added && String(r.block || '') === B);
  if (!plan.length) return null;
  const weeks = plan.map(r => Number(r.week)).filter((w, i, a) => a.indexOf(w) === i).sort((a, b) => a - b);
  const days = {};
  plan.forEach(r => { const x = days[r.day]; if (!x || Number(r.week) > x.week || (Number(r.week) === x.week && r.date && !x.date)) days[r.day] = { day: r.day, title: r.title, week: Number(r.week), date: r.date || '' }; });
  const prev = {};
  Object.keys(days).forEach(k => {
    const u = days[k];
    plan.filter(r => r.day === k && Number(r.week) === u.week).sort((a, b) => a.order - b.order).forEach(r => {
      const ls = (d.logs || []).filter(l => Number(l.tydzien) === u.week && String(l.jednostka) === String(k) && Number(l.nr_cw) === Number(r.order) && planWork_(l))
        .sort((a, b) => Number(a.seria) - Number(b.seria));
      prev[k + '|' + r.name] = { sets: r.sets, reps: String(r.reps), kg: r.kg === null || r.kg === undefined ? '' : r.kg, lights: ls.map(trLight_).join('') };
    });
  });
  const list = Object.keys(days).map(k => Object.assign(days[k], { dow: days[k].date ? trDow_(days[k].date) : null }))
    .sort((a, b) => (a.dow === null ? 9 : a.dow) - (b.dow === null ? 9 : b.dow) || String(a.day).localeCompare(String(b.day)));
  return { prevWeek: weeks[weeks.length - 1], weeks: weeks, days: list, prev: prev };
}

/**
 * Dane do szkicu następnego bloku (czysta). d: clientData_ z blocks; opt: {weeks, w0, start, hint}. → tekst albo null.
 * trBlokCtx_ (liczby bloku, tydzień po tygodniu, A, nieudane, pominięte, komentarze, ból, poprzedni blok) + wnioski trenera po tym bloku
 * + plan i wykonanie każdej jednostki tydzień po tygodniu + stan ciała z czasu bloku + to, o co prosi trener. Bez imienia i linków.
 */
function trPlanCtx_(d, blok, opt) {
  const base = trBlokCtx_(d, blok), pv = trPlanPrev_(d, blok);
  if (!base || !pv) return null;
  const str = v => v === undefined || v === null ? '' : String(v).trim(), num = v => str(v).replace('.', ','), B = String(blok);
  const out = [base];
  const b = (d.blocks || []).find(x => str(x.blok) === B) || {};
  if (str(b.wnioski)) out.push('', 'Wnioski trenera po bloku ' + B + ' (ważne, trzymaj się decyzji z nich): „' + str(b.wnioski) + '”');
  const plan = (d.plan || []).filter(r => !r.own && !r.added && str(r.block) === B);
  const DN = ['pn', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];
  out.push('', 'Plan i wykonanie bloku ' + B + ' (plan: serie×powt kg %, RPE max → serie robocze kg×powt@RPE; FAIL = nieudana):');
  pv.days.forEach(u => {
    out.push('', u.day + ' „' + str(u.title) + '”' + (u.dow !== null ? ' (' + DN[u.dow] + ')' : '') + ':');
    const rows = plan.filter(r => r.day === u.day), names = [];
    rows.slice().sort((a, b2) => a.week - b2.week || a.order - b2.order).forEach(r => { if (names.indexOf(r.name) < 0) names.push(r.name); });
    names.forEach(n => {
      const rs = rows.filter(r => r.name === n).sort((a, b2) => a.week - b2.week), f = rs[0];
      const head = '- [' + str(f.prio) + '] ' + n + (str(f.group) ? ' (grupa ' + str(f.group) + ')' : '') + (str(f.note) ? ' · uwagi: ' + str(f.note) : '') + ':';
      const wk = rs.map(r => {
        const pl = r.sets + '×' + str(r.reps) + (str(r.kg) ? ' ' + num(r.kg) + (typeof r.kg === 'number' ? ' kg' : '') : '') + (r.pct ? ' ' + num(Math.round(r.pct * 1000) / 10) + '%' : '') + (str(r.rpe) ? ' @' + num(r.rpe) : '');
        const ls = (d.logs || []).filter(l => Number(l.tydzien) === Number(r.week) && String(l.jednostka) === String(r.day) && Number(l.nr_cw) === Number(r.order) && planWork_(l))
          .sort((a, b2) => Number(a.seria) - Number(b2.seria));
        const skip = (d.logs || []).some(l => Number(l.tydzien) === Number(r.week) && String(l.jednostka) === String(r.day) && Number(l.nr_cw) === Number(r.order) && (str(l.seria) === '0' || /SKIP/.test(str(l.typ))));
        const done = (d.sessions || []).some(s => Number(s.tydzien) === Number(r.week) && String(s.jednostka) === String(r.day)) || ls.length;
        const ex = ls.map(l => /FAIL/.test(str(l.typ)) ? num(l.kg) + '×' + str(l.powt) + ' FAIL' : num(l.kg) + '×' + str(l.powt) + (str(l.rpe) ? '@' + num(l.rpe) : '')).join(', ');
        return 'tydz. ' + r.week + ': ' + pl + ' → ' + (ex || (skip ? 'pominięte' : done ? 'brak zapisanych serii' : 'jednostka niezrobiona')) + (skip && ex ? ' (skrócone)' : '');
      });
      out.push(head, '  ' + wk.join('; '));
    });
  });
  const ds = plan.map(r => str(r.date)).filter(Boolean).sort(), od = ds[0] || '', doo = ds[ds.length - 1] || '';
  const st = (d.stan || []).filter(s => { const t = str(s.data).slice(0, 10); return od && t >= od && t <= (doo || t) && Number(s.ocena) > 0; });
  if (st.length) out.push('', 'Stan ciała (ból / napięcie zgłoszone poza treningiem): ' + st.slice(-12).map(s => str(s.data).slice(0, 10) + ' ' + str(s.miejsce) + (str(s.strona) ? ' ' + str(s.strona) : '') + ' ' + num(s.ocena) + '/10' + (str(s.kontekst) ? ' (' + str(s.kontekst) + (str(s.cwiczenie) ? ': ' + str(s.cwiczenie) : '') + ')' : '')).join('; ') + '.');
  opt = opt || {};
  out.push('', 'Zadanie: ułóż następny blok: ' + opt.weeks + ' tyg. (numery tygodni ' + opt.w0 + '–' + (opt.w0 + opt.weeks - 1) + '), start w poniedziałek ' + str(opt.start) + '. Każda lista "tygodnie" i "notatki" ma dokładnie ' + opt.weeks + ' elementów.');
  if (str(opt.hint)) out.push('Wskazówki trenera (mają pierwszeństwo przed zasadami ogólnymi): „' + str(opt.hint) + '”');
  return out.join('\n');
}

/** Zwarta postać wierszy szkicu do poprawki (czysta): jednostka → ćwiczenie → komórki tygodni. */
function trPlanCompact_(rows) {
  const s = v => v === undefined || v === null ? '' : String(v), u = {}, order = [];
  (rows || []).slice().sort((a, b) => a.tydzien - b.tydzien || a.nr - b.nr).forEach(r => {
    if (!u[r.jednostka]) { u[r.jednostka] = { t: r.tytul, ex: {}, names: [] }; order.push(r.jednostka); }
    const x = u[r.jednostka];
    if (!x.ex[r.cwiczenie]) { x.ex[r.cwiczenie] = []; x.names.push(r.cwiczenie); }
    x.ex[r.cwiczenie].push('tydz. ' + r.tydzien + ' "' + s(r.serie) + ' x ' + s(r.powt) + ' | ' + s(r.kg) + ' | ' + (r.procent ? Math.round(r.procent * 1000) / 10 : '') + ' | ' + s(r.rpe_max) + '"');
  });
  return order.map(k => k + ' „' + s(u[k].t) + '”:\n' + u[k].names.map(n => '- ' + n + ': ' + u[k].ex[n].join(', ')).join('\n')).join('\n');
}

/** Zapytanie o szkic bloku (czyste). opt: {tweak, text, draft: wiersze poprzedniego szkicu}. */
function aiPlanReq_(ctx, opt) {
  opt = opt || {};
  let msg = 'Dane:\n\n' + ctx;
  const tw = opt.tweak === 'tekst' ? String(opt.text || '').trim().slice(0, 300) : PLAN_POPRAW[opt.tweak];
  if (tw) msg += (opt.draft && opt.draft.length ? '\n\nPoprzedni szkic:\n' + trPlanCompact_(opt.draft) : '') + '\n\nPopraw szkic (zostaw resztę bez zmian, uzasadnienie napisz od nowa): ' + tw;
  else msg += '\n\nUłóż szkic następnego bloku.';
  return { model: AI_MODEL, max_tokens: 16000, system: AI_SYSTEM_PLAN, messages: [{ role: 'user', content: msg }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: AI_SCHEMA_PLAN } }, fallbacks: 'default' };
}

/** Komórka „4 x 5 | 92.5 | 75 | 8” (czysta) → {serie, powt, kg, procent, rpe_max} albo null. */
function trPlanCell_(c) {
  const p = String(c === undefined || c === null ? '' : c).split('|').map(x => x.trim());
  const m = /^(\d+)\s*[x×]\s*(.+)$/i.exec(p[0] || '');
  if (!m || !m[2].trim()) return null;
  const n = v => { const x = Number(String(v).replace(',', '.')); return String(v).trim() !== '' && isFinite(x) ? x : NaN; };
  const kg = n(p[1] || ''), pc = n(p[2] || ''), rpe = n(p[3] || '');
  return { serie: Number(m[1]), powt: m[2].trim(), kg: isFinite(kg) ? Math.round(kg * 100) / 100 : String(p[1] || '').slice(0, 20),
    procent: isFinite(pc) && pc > 0 ? Math.round((pc > 1.3 ? pc / 100 : pc) * 1000) / 1000 : '', rpe_max: isFinite(rpe) && rpe >= 5 && rpe <= 10 ? rpe : '' };
}

/**
 * Wiersze planu ze szkicu AI (czysta). ai: {dlaczego, jednostki}; base: {klient, blok, w0, weeks, start (pn), prevRows: wiersze Planu
 * poprzedniego bloku (nazwy kolumn arkusza)}. Z poprzedniego bloku (ta sama jednostka i nazwa, inaczej ta sama nazwa) przechodzą: grupa,
 * zamienniki, dod_serie, drop, tryb, obwod, ciecie, serie_min. Obwód, który się rozsypał, jest usuwany. → {rows, why, errors}
 */
function trPlanRows_(ai, base) {
  const errors = [], rows = [], s = v => v === undefined || v === null ? '' : String(v).trim();
  const units = (ai && ai.jednostki) || [], N = base.weeks;
  if (!units.length) return { rows: [], why: '', errors: ['AI nie zwróciło żadnej jednostki.'] };
  const prevOf = (day, name) => { const ps = (base.prevRows || []).filter(r => s(r.cwiczenie) === name).sort((a, b) => Number(b.tydzien) - Number(a.tydzien));
    return ps.find(r => s(r.jednostka) === day) || ps[0] || null; };
  const KEEP = ['grupa', 'zamienniki', 'dod_serie', 'drop', 'tryb', 'obwod', 'ciecie', 'serie_min'];
  const seen = {};
  units.forEach(u => {
    const day = s(u.jednostka).slice(0, 20), dz = Math.min(6, Math.max(0, Math.round(Number(u.dzien)) || 0));
    if (!day || seen[day]) { errors.push('Jednostka „' + day + '” pusta albo powtórzona.'); return; }
    seen[day] = 1;
    (u.cwiczenia || []).forEach((e, i) => {
      const name = s(e.cwiczenie).slice(0, 120), prev = prevOf(day, name);
      for (let k = 0; k < N; k++) {
        const c = trPlanCell_((e.tygodnie || [])[k]);
        if (!c) { errors.push(day + ' ' + name + ' tydz. ' + (base.w0 + k) + ': brak serii i powtórzeń.'); continue; }
        const r = { klient: base.klient, tydzien: base.w0 + k, jednostka: day, tytul: s(u.tytul).slice(0, 80), data: trAddDays_(base.start, 7 * k + dz), nr: i + 1, cwiczenie: name,
          prio: ['A', 'B', 'K'].indexOf(s(e.prio)) >= 0 ? s(e.prio) : 'B', serie: Math.min(SETS_MAX, Math.max(1, c.serie)), powt: c.powt, procent: c.procent, kg: c.kg, rpe_max: c.rpe_max,
          uwagi: s(e.uwagi).slice(0, 300), blok: base.blok };
        KEEP.forEach(h => { if (prev && !blank_(prev[h])) r[h] = prev[h]; });
        if (!blank_(r.serie_min) && Number(r.serie_min) > r.serie) delete r.serie_min;
        const nt = s((u.notatki || [])[k]);
        if (nt && i === 0) r.uwagi_jedn = nt.slice(0, 500);
        rows.push(r);
      }
    });
  });
  let v = validatePlan_(rows);
  if (v.some(x => /obwod/.test(x))) { rows.forEach(r => { delete r.obwod; }); v = validatePlan_(rows); }
  return { rows: rows, why: s(ai.dlaczego).slice(0, 1500), errors: errors.concat(v) };
}
const trAddDays_ = (d, n) => new Date(Date.parse(String(d).slice(0, 10) + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/** Szkic następnego bloku. opt: {blok, weeks, start, hint, tweak, text, draft}. → {blok, weeks, start, prevWeek, rows, prev, why, warnings, cost, n, limit} */
function trBlokPlan(id, opt) {
  id = String(id || '').trim().toLowerCase(); opt = opt || {};
  const blok = String(opt.blok || '').trim(), N = Math.round(Number(opt.weeks));
  if (!(N >= 1 && N <= PLAN_TYG_MAX)) throw new Error('Tygodnie: od 1 do ' + PLAN_TYG_MAX + '.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(opt.start || ''))) throw new Error('Podaj datę startu.');
  const start = trAddDays_(opt.start, (7 - trDow_(opt.start)) % 7);           // poniedziałek w dniu startu albo po nim
  aiPre_();
  const row = trRow_(id), c = clientOf_(row), d = clientData_(c, Date.now());
  d.cfg.masters = String(row[8] || '').trim().toUpperCase() === 'TAK';
  const tz = Session.getScriptTimeZone(), day = x => x instanceof Date ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : String(x || '').slice(0, 10);
  d.blocks = tableOf_('Bloki').filter(b => String(b.klient).trim().toLowerCase() === c.id).map(b => Object.assign({}, b, { od: day(b.od), do: day(b.do), jednostki: frac_(b.jednostki) }));
  if (!trBlokSets_(d, blok)) throw new Error('W bloku ' + blok + ' nie ma zapisanych serii, więc AI nie ma z czego układać następnego (bez opłaty).');
  const all = tableOf_('Plan').filter(r => String(r.klient).trim().toLowerCase() === c.id);
  const w0 = Math.max(0, ...all.map(r => Number(r.tydzien) || 0)) + 1;
  const nb = trBlokNext_(blok, all.map(r => String(r.blok || '').trim()));
  const ctx = trPlanCtx_(d, blok, { weeks: N, w0: w0, start: start, hint: String(opt.hint || '').slice(0, 600) });
  if (!ctx) throw new Error('Nie ma bloku ' + blok + ' tego klienta w zakładce Bloki. Kliknij „Przelicz teraz”.');
  const r = aiCall_(aiPlanReq_(ctx, opt), ['szkic planu' + (opt.tweak ? ' · ' + opt.tweak : ''), id, w0, nb]);
  let ai; try { ai = JSON.parse(r.text); } catch (e) { throw new Error('AI zwróciło szkic w złym formacie. Spróbuj ponownie (koszt ' + r.cost + ' $).'); }
  const pr = trPlanRows_(ai, { klient: c.id, blok: nb, w0: w0, weeks: N, start: start,
    prevRows: all.filter(x => String(x.blok || '').trim() === blok && !/^(klient|dodane|usuniete)/.test(String(x.zrodlo || ''))) });
  if (!pr.rows.length) throw new Error('AI nie ułożyło planu: ' + pr.errors.slice(0, 3).join(' ') + ' Spróbuj ponownie.');
  const pv = trPlanPrev_(d, blok);
  return { blok: nb, weeks: Array.from({ length: N }, (x, i) => w0 + i), start: start, prevWeek: pv.prevWeek, rows: pr.rows, prev: pv.prev, why: pr.why,
    warnings: pr.errors.slice(0, 8), cost: r.cost, n: r.n, limit: r.limit, model: r.model };
}

/** Wczytanie szkicu do planu: plik JSON w „_plany” i import od razu (jak plik z Dysku). → {text, status} */
function trBlokWczytaj(id, rows) {
  id = String(id || '').trim().toLowerCase();
  trRow_(id);
  if (!Array.isArray(rows) || !rows.length || rows.length > 2000) throw new Error('Szkic jest pusty.');
  const allowed = PLAN_HEADERS.filter(h => h !== 'zrodlo');
  rows = rows.map(r => { const o = {}; allowed.forEach(h => { if (r && r[h] !== undefined && r[h] !== null && r[h] !== '') o[h] = r[h]; }); o.klient = id; return o; });
  const errs = validatePlan_(rows);
  if (errs.length) throw new Error('Szkic nie przechodzi sprawdzenia: ' + errs.slice(0, 3).join(' | '));
  const blok = String(rows[0].blok || ''), weeks = rows.map(r => Number(r.tydzien)), w0 = Math.min(...weeks), w1 = Math.max(...weeks);
  const units = rows.map(r => r.tydzien + '|' + r.jednostka).filter((x, i, a) => a.indexOf(x) === i).length;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let res;
  try {
    const dir = child_(rootFolder_(), '_plany');
    const f = dir.createFile(id + '_' + blok + '_szkic-ai_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm') + '.json', JSON.stringify(rows, null, 1), 'application/json');
    res = importPlanFile_(f, dir);
  } finally { lock.releaseLock(); }
  if (!res.ok) throw new Error('Import się nie udał (plik w _plany/bledy): ' + res.msg);
  const first = rows.map(r => r.data).filter(Boolean).sort()[0];
  return { status: res.status, text: 'Wczytano blok ' + blok + ': ' + units + ' jednostek, tydz. ' + (w0 === w1 ? w0 : w0 + '–' + w1) + (first ? ' (od ' + first.slice(8, 10) + '.' + first.slice(5, 7) + ')' : '') +
    '. Import: ' + res.status + (res.msg ? ' · ' + res.msg : '') + '. Klient widzi plan w aplikacji.' };
}

/* ---------- klienci: lista, ustawienia (flagi z zakładki Klienci), nowy klient, nowy link ----------
 * Kolumny Klienci po pozycji (jak clientOf_): A klucz, B klient_id, C imie, D aktywny, E link, F bol, G tryb, H dod_serie, I masters,
 * J zamiana, K skala, L sufit_oly, M wlasne, N edycja, O email, P mail_rano (TAK = poranny mail, Mail.gs); dalej KL_EXTRA (Q–Z; X–Z = API bota klienta, Agent.gs).
 * Usuwania nie ma: „nieaktywny” zostawia historię.
 */
const KL_HEAD = ['klucz', 'klient_id', 'imie', 'aktywny', 'link', 'bol', 'tryb', 'dod_serie', 'masters', 'zamiana', 'skala', 'sufit_oly', 'wlasne', 'edycja', 'email', 'mail_rano'];
const KL_KOM = 19;                     // T mail_kom: panel zapisuje A–P i T; U „otwarta” i V „urzadzenia” pisze tylko seen_ (Code.gs)
const KL_CIALO = 22;                   // W cialo (TAK = pomiary ciała): panel zapisuje też W
const KL_SUFIT_MAX = 20;               // sufit w bojach: najwyżej 20% maksa ponad plan
const KL_MAX_KG = 400;                 // Q max_rwanie, R max_podrzut: najwyżej 400 kg

/** Czysta: wiersz Klienci → ustawienia dla panelu; base = adres aplikacji (link liczony z klucza, bo kolumna E bywa nieaktualna). */
function trKlientOf_(r, base) {
  const c = clientOf_(r), up = i => String(r[i] === undefined || r[i] === null ? '' : r[i]).trim().toUpperCase();
  return { id: c.id, name: c.name, on: up(3) !== 'NIE', mode: c.simple ? 'PROSTY' : 'PRO', scale: c.scale, swap: c.swap || 'NIE',
    pain: c.pain, masters: up(8) === 'TAK', extra: c.extra, oly: Math.round(c.olyCeil * 1000) / 10, own: c.own, edit: c.edit,
    link: base && c.key ? base + '?k=' + c.key : String(r[4] || '').trim(), email: String(r[14] === undefined || r[14] === null ? '' : r[14]).trim(), mail: up(15) === 'TAK',
    mailKom: up(KL_KOM) === 'TAK', seen: r[20] instanceof Date ? r[20].toISOString() : String(r[20] === undefined || r[20] === null ? '' : r[20]).trim(), devs: devsOf_(r[21]), body: up(KL_CIALO) === 'TAK',
    snatch: klKg_(r[16]), cj: klKg_(r[17]), start: dayStr_(r[18]) || '',
    ai: agUst_(r[AG_COL.ust], /^[0-9a-f]{64}$/.test(String(r[AG_COL.hash] || '').trim())).on };   // asystent AI: tylko z kluczem i włączony (Agent.gs)
}
/** Czysta: maks z kolumny Q / R → liczba kg albo '' (pusto, zero i tekst = brak). */
function klKg_(v) { const x = n_(v); return x > 0 ? Math.round(x * 10) / 10 : ''; }
/** Czysta: kolumna V „urzadzenia” → liczba telefonów z ostatnich SEEN_DNI dni (lista jest przycinana przy zapisie) */
function devsOf_(v) {
  try { const a = JSON.parse(String(v || '[]')); return Array.isArray(a) ? a.length : 0; } catch (e) { return 0; }
}

/** Czysta: ustawienia z panelu → {vals: {indeks kolumny: wartość}} (D, F–P, T, W; Q–S tylko gdy panel je przysłał) albo {error}. */
function trKlientVals_(f) {
  f = f || {};
  const extra = Number(f.extra), oly = Number(f.oly), swap = String(f.swap || ''), mode = String(f.mode || ''), scale = String(f.scale || '');
  if (!(Number.isInteger(extra) && extra >= 0 && extra <= 5)) return { error: 'Dodatkowe serie: liczba 0–5.' };
  if (!(isFinite(oly) && oly >= 0 && oly <= KL_SUFIT_MAX)) return { error: 'Sufit w bojach: 0–' + KL_SUFIT_MAX + '%.' };
  if (['NIE', 'TRENER', 'DOWOLNA'].indexOf(swap) < 0) return { error: 'Zamiana ćwiczenia: Nie, Od trenera albo Dowolna.' };
  if (['PROSTY', 'PRO'].indexOf(mode) < 0) return { error: 'Tryb: Prosty albo PRO.' };
  if (['RPE', 'RIR'].indexOf(scale) < 0) return { error: 'Skala: RPE albo RIR.' };
  const email = String(f.email || '').trim();
  if (email && (!mailOk_(email) || email.length > 200)) return { error: 'E-mail klienta: to nie wygląda na adres e-mail.' };
  if (f.mail && !email) return { error: 'Poranny mail: wpisz najpierw e-mail klienta.' };
  if (f.mailKom && !email) return { error: 'Mail po komentarzu: wpisz najpierw e-mail klienta.' };
  const q = {};
  if ('snatch' in f || 'cj' in f || 'start' in f) {                // starszy panel bez tych pól nie czyści Q–S
    const kg = (x, nm) => { const t = String(x === undefined || x === null ? '' : x).trim().replace(',', '.'); if (!t) return '';
      const v = Number(t); return isFinite(v) && v > 0 && v <= KL_MAX_KG ? Math.round(v * 10) / 10 : { error: nm + ': liczba kg 1–' + KL_MAX_KG + ' albo puste.' }; };
    const sn = kg(f.snatch, 'Max rwanie'), cj = kg(f.cj, 'Max podrzut'), st = String(f.start || '').trim();
    if (sn.error) return sn; if (cj.error) return cj;
    if (st && !(/^\d{4}-\d{2}-\d{2}$/.test(st) && !isNaN(new Date(st + 'T00:00:00Z')) && new Date(st + 'T00:00:00Z').toISOString().slice(0, 10) === st)) return { error: 'Start: data RRRR-MM-DD albo puste.' };
    q[16] = sn; q[17] = cj; q[18] = st;
  }
  return { vals: Object.assign(q, { 3: f.on === false ? 'NIE' : 'TAK', 5: f.pain ? 'TAK' : '', 6: mode, 7: extra, 8: f.masters ? 'TAK' : '', 9: swap, 10: scale,
    11: Math.round(oly * 10) / 1000, 12: f.own === false ? 'NIE' : 'TAK', 13: f.edit ? 'TAK' : '',
    14: email, 15: f.mail ? 'TAK' : '', [KL_KOM]: f.mailKom ? 'TAK' : '', [KL_CIALO]: f.body ? 'TAK' : '' }) };
}

/** Domyślne ustawienia nowego klienta (jak pusty wiersz w arkuszu). */
const KL_DOMYSLNE = { on: true, mode: 'PRO', scale: 'RPE', swap: 'NIE', pain: false, masters: false, extra: 0, oly: 5, own: true, edit: false, email: '', mail: false, mailKom: false, body: false };

/**
 * Kolumny Klienci za P. Q–S wpisuje trener w arkuszu albo w panelu (ustawienia klienta → Aplikacja, od 27.11): Q max_rwanie, R max_podrzut [kg] (K-value
 * w Podsumowanie_OLY), S start (RRRR-MM-DD, tekst; przy zawodach dwudniowych pierwszy dzień; kontrola taperu). 25.11.2026.
 * T mail_kom (TAK = wieczorny mail po komentarzu, zapisuje panel), U otwarta (ostatnie otwarcie aplikacji), V urzadzenia (JSON, seen_),
 * W cialo (TAK = pomiary ciała, zapisuje panel).
 */
const KL_EXTRA = ['max_rwanie', 'max_podrzut', 'start', 'mail_kom', 'otwarta', 'urzadzenia', 'cialo', 'api_klucz', 'api_ustawienia', 'ograniczenia_ai'];   // X–Z: Agent.gs

/** Arkusz Klienci; brakujące nagłówki (puste komórki A1–Z1) dopisuje, istniejących nie zmienia. Kolumna „start” jako tekst. */
function klSheet_() {
  const sh = sheet_('Klienci', KL_HEAD.slice(0, 9)), all = KL_HEAD.concat(KL_EXTRA);
  const h = sh.getRange(1, 1, 1, all.length).getValues()[0];
  if (h.some((x, i) => String(x).trim() === '')) {
    const si = all.indexOf('start');
    if (String(h[si]).trim() === '') sh.getRange(1, si + 1, Math.max(sh.getMaxRows(), 2), 1).setNumberFormat('@');
    sh.getRange(1, 1, 1, all.length).setValues(plainRows_([h.map((x, i) => String(x).trim() === '' ? all[i] : x)]));
  }
  return sh;
}
function klRows_(sh) {
  const n = sh.getLastRow() - 1;
  const w = KL_HEAD.length + KL_EXTRA.length, mc = sh.getMaxColumns ? sh.getMaxColumns() : w;
  return n > 0 ? sh.getRange(2, 1, n, Math.min(w, mc)).getValues() : [];
}

/** Lista wszystkich klientów (też nieaktywnych) z ustawieniami i linkiem. */
function trKlienci() {
  const base = linkBase_(), sh = SpreadsheetApp.getActive().getSheetByName('Klienci');
  if (!sh) return [];
  return klRows_(sh).filter(r => String(r[1]).trim()).map(r => trKlientOf_(r, base));
}

/** Zapisuje ustawienia klienta (D, F–P, T, W, Q–S) i odświeża link w kolumnie E. */
function trKlientUstaw(id, f) {
  id = String(id || '').trim().toLowerCase();
  const v = trKlientVals_(f);
  if (v.error) throw new Error(v.error);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = klSheet_(), rows = klRows_(sh), i = rows.findIndex(r => String(r[1]).trim().toLowerCase() === id);
    if (!id || i < 0) throw new Error('Nie ma klienta „' + id + '”.');
    const r = rows[i].slice(), base = linkBase_();
    Object.keys(v.vals).forEach(k => { r[k] = v.vals[k]; });
    if (base) r[4] = base + '?k=' + String(r[0]).trim();
    sh.getRange(i + 2, 15).setNumberFormat('@');                  // e-mail jako tekst
    sh.getRange(i + 2, 4, 1, KL_HEAD.length - 3).setValues(plainRows_([r.slice(3, KL_HEAD.length)]));
    sh.getRange(i + 2, KL_KOM + 1).setValues(plainRows_([[v.vals[KL_KOM]]]));
    sh.getRange(i + 2, KL_CIALO + 1).setValues(plainRows_([[v.vals[KL_CIALO]]]));
    if (16 in v.vals) {                                           // Q–S: maksy i start (start jako tekst, przed zapisem)
      sh.getRange(i + 2, 19).setNumberFormat('@');
      sh.getRange(i + 2, 17, 1, 3).setValues(plainRows_([[v.vals[16], v.vals[17], v.vals[18]]]));
    }
    if (v.vals[KL_KOM] === 'TAK' && !ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'wieczornyMail')) komWyzwalacz_();
    return trKlientOf_(r, base);
  } finally { lock.releaseLock(); }
}

/**
 * Nowy klient z panelu albo z Claude (narzędzie MCP „dodaj_klienta”): imię, ID (z imienia), tryb, zamiana, masters; reszta domyślna.
 * Inne ustawienia z KL_DOMYSLNE (np. scale) tylko, gdy przyszły (`trKlientNowyUst_`). Zwraca ustawienia z linkiem.
 */
function trKlientNowy(f) {
  f = f || {};
  const s = trKlientNowyUst_(f);
  const v = trKlientVals_(s);
  if (v.error) throw new Error(v.error);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = klSheet_(), ids = klRows_(sh).map(r => r[1]);
    const res = buildClientRow_({ imie: f.imie, id: f.id }, ids, newKey_());
    if (res.error) throw new Error(res.error);
    const r = res.row.slice(); while (r.length <= KL_KOM) r.push('');
    Object.keys(v.vals).forEach(k => { r[k] = v.vals[k]; });
    const base = linkBase_();
    if (base) r[4] = base + '?k=' + r[0];
    const n = sh.getLastRow() + 1;
    sh.getRange(n, 1).setNumberFormat('@');                       // klucz zawsze jako tekst
    sh.getRange(n, 1, 1, r.length).setValues(plainRows_([r]));
    rootFolder_();                                                // folder na filmy (Trening – Klienci) istnieje
    if (v.vals[KL_KOM] === 'TAK' && !ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'wieczornyMail')) komWyzwalacz_();
    return trKlientOf_(r, base);
  } finally { lock.releaseLock(); }
}
/** Czysta: formularz nowego klienta → pełne ustawienia (KL_DOMYSLNE + to, co przyszło; brak trybu = PRO jak w panelu). */
function trKlientNowyUst_(f) {
  f = f || {};
  const s = Object.assign({}, KL_DOMYSLNE);
  Object.keys(KL_DOMYSLNE).forEach(k => { if (f[k] !== undefined && f[k] !== null && f[k] !== '') s[k] = f[k]; });
  s.masters = !!f.masters;
  return s;
}

/** Nowy klucz klienta: stary link przestaje działać (dane w Logu i Sesjach są po klient_id, więc zostają). */
function trKlientLink(id) {
  id = String(id || '').trim().toLowerCase();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = klSheet_(), rows = klRows_(sh), i = rows.findIndex(r => String(r[1]).trim().toLowerCase() === id);
    if (!id || i < 0) throw new Error('Nie ma klienta „' + id + '”.');
    const r = rows[i].slice(), base = linkBase_();
    r[0] = newKey_();
    r[4] = base ? base + '?k=' + r[0] : '';
    sh.getRange(i + 2, 1).setNumberFormat('@');
    sh.getRange(i + 2, 1).setValue(plain_(r[0]));
    sh.getRange(i + 2, 5).setValue(plain_(r[4]));
    return trKlientOf_(r, base);
  } finally { lock.releaseLock(); }
}

/* ---------- poranny mail (Mail.gs): godzina, wynik dnia, mail próbny do trenera ---------- */
/** Ustawienia porannego maila dla panelu: godzina, wynik ostatniej wysyłki, ostatni mail każdego klienta, dzienny limit. */
function trMail() {
  const p = PropertiesService.getScriptProperties();
  let day = null; try { day = JSON.parse(p.getProperty('MAIL_DZIEN') || 'null'); } catch (e) {}
  let quota = null; try { quota = MailApp.getRemainingDailyQuota(); } catch (e) {}
  return { hour: mailGodz_(), hours: MAIL_GODZINY, day: day, log: mailLog_(), quota: quota,
    trigger: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'porannyMail') };
}

/** Nowa godzina wysyłki: zapis we właściwości MAIL_GODZ i nowy wyzwalacz porannyMail. */
function trMailUstaw(h) {
  h = Number(h);
  if (MAIL_GODZINY.indexOf(h) < 0) throw new Error('Godzina: ' + MAIL_GODZINY.join(', ') + '.');
  PropertiesService.getScriptProperties().setProperty('MAIL_GODZ', String(h));
  mailWyzwalacz_(h);
  return trMail();
}

/** Mail próbny: najbliższy niezaczęty trening klienta z datą (od dziś) idzie na adres trenera (TRENER_EMAIL), nie do klienta. */
function trMailProba(id) {
  id = String(id || '').trim().toLowerCase();
  const to = String(PropertiesService.getScriptProperties().getProperty('TRENER_EMAIL') || '').trim();
  if (!mailOk_(to)) throw new Error('Brak adresu trenera (menu Trening → Ustaw panel trenera).');
  const row = klRows_(klSheet_()).find(r => String(r[1]).trim().toLowerCase() === id);
  if (!row) throw new Error('Nie ma klienta „' + id + '”.');
  const c = clientOf_(row), plan = tableOf_('Plan'), dayOf = mailDayOf_(), today = today_();
  const lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  const started = unitsDone_(plan, pgTable_('Sesje', ['klient', 'tydzien', 'jednostka']), pgTable_('Log', DONE_LOG_COLS));
  const days = plan.filter(r => lc(r.klient) === c.id && !offPlan_(r) && r.data && dayOf(r.data) >= today && !started[doneKey_(c.id, r.tydzien, r.jednostka)])
    .map(r => dayOf(r.data)).sort();
  if (!days.length) throw new Error('Klient nie ma w planie treningu z datą od dziś, więc nie ma czego wysłać.');
  const units = rannyUnits_(c.id, plan, days[0], dayOf).filter(u => !started[doneKey_(c.id, u[0].tydzien, u[0].jednostka)]).map(u => rannyUnit_(u, plan));
  const base = linkBase_();
  mailSend_(to, rannyMail_(c, units, { url: base ? base + '?k=' + c.key : '', day: days[0], test: true }));
  return { day: days[0], title: units[0].title };
}

/* ---------- karta klienta → Plan: szybka zmiana niezrobionej jednostki (trPlan) ----------
 * Pola z panelu → kolumny Planu. Zrobiona jednostka (wpis w Sesjach albo seria w Logu, jak w mergePlan_) jest zablokowana.
 * next = także kolejne tygodnie tej jednostki w tym samym bloku, niezrobione (ćwiczenie po nazwie):
 * kg i % o tę samą różnicę (gdy obie wartości są liczbami), pozostałe pola tak samo. Notatka do jednostki tylko w tym tygodniu.
 */
const TR_PLAN_F = { sets: 'serie', reps: 'powt', kg: 'kg', pct: 'procent', rpe: 'rpe_max', note: 'uwagi', prio: 'prio', circuit: 'obwod', section: 'sekcja' };
const TR_UNOTE_MAX = 500;

/** Czysta funkcja: wartość z panelu → {v: do arkusza, c: do wiersza planu w panelu} albo {error}. */
function trPlanVal_(f, raw) {
  const t = String(raw === undefined || raw === null ? '' : raw).trim(), x = t === '' ? NaN : Number(t.replace(',', '.'));
  if (f === 'sets') return Number.isInteger(x) && x >= 1 && x <= SETS_MAX ? { v: x, c: x } : { error: 'Serie: liczba 1–' + SETS_MAX + '.' };
  if (f === 'reps') return t && t.length <= 12 ? { v: t, c: t } : { error: 'Powtórzenia: np. 5, 6-8, 8/str, 30 s.' };
  if (f === 'kg') { if (!t) return { v: '', c: '' }; if (isFinite(x)) return x >= 0 && x <= 500 ? { v: x, c: x } : { error: 'kg: liczba 0–500.' };
    return t.length <= 10 ? { v: t, c: t } : { error: 'kg: liczba albo krótki tekst (BW, guma).' }; }
  if (f === 'pct') { if (!t) return { v: '', c: null }; if (!(x > 0 && x <= 150)) return { error: '%: liczba 1–150 albo puste.' };
    const fr = Math.round(x * 100) / 10000; return { v: fr, c: fr }; }
  if (f === 'rpe') { if (!t) return { v: '', c: '' }; return x >= 5 && x <= 10 && Math.round(x * 2) === x * 2 ? { v: x, c: x } : { error: 'RPE: 5–10 co 0,5 albo puste.' }; }
  if (f === 'note') return t.length <= 300 ? { v: t, c: t } : { error: 'Uwagi: najwyżej 300 znaków.' };
  if (f === 'prio') return /^[ABK]$/i.test(t) ? { v: t.toUpperCase(), c: t.toUpperCase() } : { error: 'Priorytet: A, B albo K.' };
  if (f === 'section') { const x = sekcja_(t); return x === null ? { error: 'Sekcja: Rozgrzewka, Główne, Korekcyjne albo puste.' } : { v: x, c: x }; }
  if (f === 'circuit') return !t || /^[A-Z]$/i.test(t) ? { v: t.toUpperCase(), c: t.toUpperCase() } : { error: 'Obwód: jedna litera A–Z albo puste.' };
  return { error: 'Nieznane pole: ' + f };
}

/**
 * Czysta funkcja: e = {week, day, ex: [{order, sets?, reps?, kg?, pct?, rpe?, note?}], unote?, next?}
 * → {error} albo {set: [[indeks wiersza Planu od 0, {kolumna: wartość}]], rows: [{week, day, order, f: {pola panelu}}], n, weeks}.
 */
function trPlanEdit_(plan, ses, log, clientId, e) {
  e = e || {};
  const week = Number(e.week), day = String(e.day === undefined || e.day === null ? '' : e.day).trim();
  const lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  const mine = []; (plan || []).forEach((r, i) => { if (lc(r.klient) === clientId) mine.push({ r, i }); });
  const unitOf = w => mine.filter(x => Number(x.r.tydzien) === w && String(x.r.jednostka).trim() === day && !removed_(x.r));
  const cur = unitOf(week);
  if (!(week >= 1) || !day || !cur.length) return { error: 'Nie ma takiej jednostki w planie.' };
  if (cur.some(x => own_(x.r))) return { error: 'To własny trening klienta – nie zmienia się go w panelu.' };
  const done = {}, dk = unitsDone_(plan, ses, log);                                   // zrobiona: Sesje albo seria A/B (unitsDone_)
  Object.keys(dk).forEach(k => { const p = k.split('|'); if (p[0] === clientId) done[Number(p[1]) + '|' + p.slice(2).join('|')] = 1; });
  // live = zmiana z prowadzonego treningu (aplikacja w trybie trenera): bieżąca jednostka może być zaczęta
  if (done[week + '|' + day] && !e.live) return { error: 'Ta jednostka jest już zrobiona (albo klient zaczął ją zapisywać) – zmiany tylko w niezrobionych.' };
  const blok = lc(cur[0].r.blok);
  const later = !e.next ? [] : [...new Set(mine.filter(x => Number(x.r.tydzien) > week && String(x.r.jednostka).trim() === day && lc(x.r.blok) === blok && !own_(x.r) && !done[Number(x.r.tydzien) + '|' + day])
    .map(x => Number(x.r.tydzien)))].sort((a, b) => a - b);
  const set = {}, rows = {}, weeks = {};
  const put = (x, col, v, f, c) => {
    const norm = y => y === undefined || y === null || y instanceof Date ? '' : String(y).trim(), o = norm(x.r[col]);
    const same = typeof v === 'number' ? o !== '' && Number(o.replace(',', '.')) === v : o === v;
    if (same) return false;
    (set[x.i] = set[x.i] || {})[col] = v;
    const k = x.i; rows[k] = rows[k] || { week: Number(x.r.tydzien), day: day, order: Number(x.r.nr), f: {} }; rows[k].f[f] = c;
    weeks[Number(x.r.tydzien)] = 1;
    return true;
  };
  let n = 0;
  for (const ch of [].concat(e.ex || [])) {
    const hit = cur.find(x => Number(x.r.nr) === Number(ch.order));
    if (!hit) return { error: 'Nie ma takiego ćwiczenia w jednostce (nr ' + ch.order + ').' };
    for (const f of Object.keys(TR_PLAN_F)) {
      if (!(f in ch)) continue;
      const val = trPlanVal_(f, ch[f]); if (val.error) return { error: hit.r.cwiczenie + ': ' + val.error };
      const col = TR_PLAN_F[f], oldN = n_(hit.r[col]);
      if (put(hit, col, val.v, f, val.c)) n++;
      if (f === 'circuit') continue;                                              // obwód tylko w tej jednostce (sąsiedzi w kolejnych tygodniach bywają inni)
      const delta = (f === 'kg' || f === 'pct') && typeof val.v === 'number' && isFinite(oldN) && String(hit.r[col]).trim() !== '' ? val.v - oldN : null;
      later.forEach(w => unitOf(w).filter(x => lc(x.r.cwiczenie) === lc(hit.r.cwiczenie)).forEach(x => {
        const o = n_(x.r[col]);
        if (delta !== null && isFinite(o) && String(x.r[col]).trim() !== '') {
          const v = Math.max(0, Math.round((o + delta) * (f === 'pct' ? 10000 : 100)) / (f === 'pct' ? 10000 : 100));
          put(x, col, v, f, v);
        } else if (delta === null) put(x, col, val.v, f, val.c);
      }));
    }
  }
  if (e.unote !== undefined && e.unote !== null) {
    const t = String(e.unote).replace(/\r\n?/g, '\n').trim();
    if (t.length > TR_UNOTE_MAX) return { error: 'Notatka do jednostki: najwyżej ' + TR_UNOTE_MAX + ' znaków.' };
    const first = cur.slice().sort((a, b) => Number(a.r.nr) - Number(b.r.nr))[0];
    let any = put(first, 'uwagi_jedn', t, 'unote', t);
    cur.forEach(x => { if (x !== first && String(x.r.uwagi_jedn === undefined || x.r.uwagi_jedn === null ? '' : x.r.uwagi_jedn).trim()) any = put(x, 'uwagi_jedn', '', 'unote', '') || any; });
    if (any) n++;
  }
  return { set: Object.keys(set).map(i => [Number(i), set[i]]), rows: Object.keys(rows).map(k => rows[k]), n: n, weeks: Object.keys(weeks).map(Number).sort((a, b) => a - b) };
}

/** Zapis zmian jednostki z panelu do zakładki Plan (format tekstowy powt. i kg ustawiony przed zapisem). */
function trPlan(id, e) {
  id = String(id || '').trim().toLowerCase();
  trRow_(id);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const res = trPlanEdit_(tableOf_('Plan'), pgTable_('Sesje', ['klient', 'tydzien', 'jednostka']), pgTable_('Log', DONE_LOG_COLS), id, e);
    if (res.error) throw new Error(res.error);
    trPlanSet_(res.set);
    return { n: res.n, weeks: res.weeks, rows: res.rows };
  } finally { lock.releaseLock(); }
}

/** zmiany komórek Planu z trPlanEdit_ ([[indeks wiersza od 0, {kolumna: wartość}]]) do arkusza */
function trPlanSet_(set) {
  if (!set.length) return;
  const sh = SpreadsheetApp.getActive().getSheetByName('Plan');
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim());
  PLAN_HEADERS.forEach(k => { if (h.indexOf(k) < 0) { sh.getRange(1, h.length + 1).setValue(plain_(k)); h.push(k); } });
  planTextCols_();
  set.forEach(([i, o]) => Object.keys(o).forEach(k => sh.getRange(i + 2, h.indexOf(k) + 1).setValue(plain_(o[k]))));
}

/* ---------- „Zaplanuj następną” (prowadzony trening, punkt 3c przeglądu v80, 23.11.2026) ----------
 * Po „Zakończ” w trybie „Prowadź” aplikacja proponuje tę samą jednostkę w tyg. + 1 (kg z dzisiejszych świateł, lib nextUnit).
 * Jest już w planie → zmiana jak „✎ zmień plan” (trPlanEdit_, tylko niezrobiona). Nie ma → nowa jednostka trenera: kopia dzisiejszej
 * (wszystkie kolumny planu, bez ćwiczeń dodanych / usuniętych przez klienta), tydzień + 1, data + 7 dni, Plan.zrodlo = trener.
 */
const TR_NEXT_F = { sets: 'serie', reps: 'powt', kg: 'kg', rpe: 'rpe_max' };

/** Czysta funkcja: u = {week, day, ex: [{order (dzisiejszy nr), sets?, reps?, kg?, rpe?}]} → {error} | {mode: 'edit', week, edit} | {mode: 'new', week, rows} */
function trNextUnit_(plan, clientId, u) {
  u = u || {};
  const week = Number(u.week), day = String(u.day === undefined || u.day === null ? '' : u.day).trim(), lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  const mine = (plan || []).filter(r => lc(r.klient) === clientId && String(r.jednostka).trim() === day);
  const src = mine.filter(r => Number(r.tydzien) === week && !removed_(r) && zr_(r) !== 'dodane').sort((a, b) => Number(a.nr) - Number(b.nr));
  if (!(week >= 1) || !day || !src.length) return { error: 'Nie ma takiej jednostki w planie.' };
  if (src.some(own_)) return { error: 'To własny trening klienta – nie planuje się go dalej.' };
  const next = week + 1, target = mine.filter(r => Number(r.tydzien) === next && !removed_(r));
  if (target.some(own_)) return { error: 'W tyg. ' + next + ' ta jednostka to własny trening klienta.' };
  const ex = [].concat(u.ex || []);
  if (target.length) {
    const out = [];
    for (const ch of ex) {
      const s = src.find(r => Number(r.nr) === Number(ch.order)); if (!s) return { error: 'Nie ma takiego ćwiczenia w jednostce (nr ' + ch.order + ').' };
      const t = target.find(r => lc(r.cwiczenie) === lc(s.cwiczenie)) || target.find(r => Number(r.nr) === Number(s.nr) && !src.some(x => lc(x.cwiczenie) === lc(r.cwiczenie)));
      if (!t) continue;                                         // ćwiczenia nie ma w tamtym tygodniu: nie dopisujemy
      const o = { order: Number(t.nr) }; Object.keys(TR_NEXT_F).forEach(f => { if (f in ch) o[f] = ch[f]; }); out.push(o);
    }
    return { mode: 'edit', week: next, edit: { week: next, day: day, ex: out } };
  }
  const d = String(src[0].data || '').trim(), date = /^\d{4}-\d{2}-\d{2}$/.test(String(u.date || '')) ? String(u.date)
    : /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(Date.parse(d + 'T12:00:00Z') + 7 * 864e5).toISOString().slice(0, 10) : '';
  const rows = [];
  for (const s of src) {
    const r = {}; PLAN_HEADERS.forEach(k => { const v = s[k]; r[k] = v === undefined || v === null || v instanceof Date ? '' : v; });
    Object.assign(r, { tydzien: next, data: date, zrodlo: 'trener' });
    const ch = ex.find(x => Number(x.order) === Number(s.nr));
    if (ch) for (const f of Object.keys(TR_NEXT_F)) {
      if (!(f in ch)) continue;
      const val = trPlanVal_(f, ch[f]); if (val.error) return { error: s.cwiczenie + ': ' + val.error };
      r[TR_NEXT_F[f]] = val.v;
    }
    rows.push(r);
  }
  return { mode: 'new', week: next, rows: rows };
}

/** Prowadzony trening → „Zapisz w planie”: zmiana jednostki w tyg. + 1 albo nowa jednostka trenera. */
function trNastepna(id, u) {
  id = String(id || '').trim().toLowerCase();
  trRow_(id);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const plan = tableOf_('Plan'), res = trNextUnit_(plan, id, u);
    if (res.error) throw new Error(res.error);
    if (res.mode === 'new') { ownWrite_(id, res.week, String(u.day).trim(), res.rows); return { mode: 'new', week: res.week, n: res.rows.length }; }
    const e = trPlanEdit_(plan, pgTable_('Sesje', ['klient', 'tydzien', 'jednostka']), pgTable_('Log', DONE_LOG_COLS), id, res.edit);
    if (e.error) throw new Error(e.error);
    trPlanSet_(e.set);
    return { mode: 'edit', week: res.week, n: e.n };
  } finally { lock.releaseLock(); }
}

/* ---------- okno jednostki w kalendarzu: edycja całej jednostki i przesunięcie na inny dzień (panel v2 PR 3, 27.11.2026) ----------
 * trJednostka: panel wysyła całą listę ćwiczeń w nowej kolejności (items). Ćwiczenie z order = wiersz Planu o tym nr, bez order = nowe
 * (Plan.zrodlo = trener), brak na liście = usunięte (wiersz znika z Planu). Numery nr rozdane od nowa 1…n; ćwiczenie z wpisem w Logu
 * (rozgrzewka, seria K w niezrobionej jednostce) zostaje na swoim numerze i nie da się go usunąć. Zrobiona jednostka zablokowana.
 * next = także kolejne tygodnie tej jednostki w bloku, niezrobione (po nazwie ćwiczenia, jak trPlanEdit_): pola (kg i % o tę samą różnicę),
 * nowa nazwa, usunięte i dodane ćwiczenia; kolejność tylko tam, gdzie po zmianach są te same ćwiczenia. Obwód i data tylko w tej jednostce.
 * trPrzesun: nowa data niezrobionej jednostki (przeciągnięcie w kalendarzu albo „zmień dzień” w oknie).
 */
const TR_UNIT_MAX = 30;
const TR_UNIT_F = ['prio', 'sets', 'reps', 'kg', 'pct', 'rpe', 'note'];

/**
 * Czysta funkcja: e = {week, day, items: [{order?, name, prio, sets, reps, kg, pct, rpe, note, circuit}], unote?, date?, next?};
 * done = unitsDone_; logged = {'tydzień|nr': 1} ćwiczeń z wpisem w Logu (ta jednostka i kolejne tygodnie)
 * → {error} albo {set: [[indeks wiersza Planu, {kolumna: wartość}]], add: [wiersze Planu], del: [indeksy], n, weeks}.
 */
function trUnitEdit_(plan, done, logged, clientId, e) {
  e = e || {}; done = done || {}; logged = logged || {};
  const week = Number(e.week), day = String(e.day === undefined || e.day === null ? '' : e.day).trim();
  const lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  const norm = y => y === undefined || y === null || y instanceof Date ? '' : String(y).trim();
  const mine = []; (plan || []).forEach((r, i) => { if (lc(r.klient) === clientId) mine.push({ r, i }); });
  const unitOf = w => mine.filter(x => Number(x.r.tydzien) === w && String(x.r.jednostka).trim() === day && !removed_(x.r)).sort((a, b) => Number(a.r.nr) - Number(b.r.nr));
  const cur = unitOf(week);
  if (!(week >= 1) || !day || !cur.length) return { error: 'Nie ma takiej jednostki w planie.' };
  if (cur.some(x => own_(x.r))) return { error: 'To własny trening klienta – nie zmienia się go w panelu.' };
  if (done[doneKey_(clientId, week, day)]) return { error: 'Ta jednostka jest już zrobiona (albo klient zaczął ją zapisywać) – zmiany tylko w niezrobionych.' };
  const items = [].concat(e.items || []);
  if (!items.length) return { error: 'Jednostka musi mieć co najmniej jedno ćwiczenie.' };
  if (items.length > TR_UNIT_MAX) return { error: 'Najwyżej ' + TR_UNIT_MAX + ' ćwiczeń w jednostce.' };
  // walidacja pozycji: nazwa, pola jak w trPlanVal_, obwód = litera sąsiadów
  const its = [];
  for (const it of items) {
    const name = String(it && it.name !== undefined && it.name !== null ? it.name : '').trim().replace(/\s+/g, ' ');
    if (!name) return { error: 'Każde ćwiczenie musi mieć nazwę.' };
    if (name.length > UNIT_NAME_MAX) return { error: 'Nazwa: najwyżej ' + UNIT_NAME_MAX + ' znaków.' };
    const has = it.order !== undefined && it.order !== null && it.order !== '';
    const x = has ? cur.find(y => Number(y.r.nr) === Number(it.order)) : null;
    if (has && !x) return { error: 'Lista ćwiczeń się zmieniła – odśwież i spróbuj jeszcze raz.' };
    if (x && its.some(o => o.x === x)) return { error: 'Ćwiczenie jest dwa razy na liście.' };
    const v = {};
    for (const f of TR_UNIT_F) {
      if (!(f in it) && x) continue;
      const val = trPlanVal_(f, f in it ? it[f] : f === 'prio' ? 'B' : f === 'sets' ? 3 : f === 'reps' ? '8' : '');
      if (val.error) return { error: name + ': ' + val.error };
      v[f] = val.v;
    }
    const c = trPlanVal_('circuit', it.circuit);
    if (c.error) return { error: name + ': ' + c.error };
    its.push({ x, name, v, c: c.v });
  }
  // obwód: ta sama litera tylko u sąsiadów, pojedyncza litera = zwykłe ćwiczenie
  const seen = {};
  for (let k = 0; k < its.length; k++) {
    const c = its[k].c; if (!c) continue;
    if (seen[c] && its[k - 1].c !== c) return { error: 'Obwód ' + c + ' musi zostać razem.' };
    seen[c] = 1;
  }
  its.forEach((o, k) => { if (o.c && (its[k - 1] || {}).c !== o.c && (its[k + 1] || {}).c !== o.c) o.c = ''; });
  // numery: 1…n, ćwiczenie z wpisem w Logu stoi na swoim
  const lg = (w, x) => !!logged[w + '|' + Number(x.r.nr)];
  const fixed = {}; cur.forEach(x => { if (lg(week, x)) fixed[Number(x.r.nr)] = 1; });
  for (const x of cur) if (lg(week, x) && !its.some(o => o.x === x)) return { error: String(x.r.cwiczenie).trim() + ': ma zapisane serie, nie da się go usunąć.' };
  let c0 = 0;
  for (const o of its) {
    if (o.x && lg(week, o.x)) { const nr = Number(o.x.r.nr); if (nr <= c0) return { error: String(o.x.r.cwiczenie).trim() + ': ma zapisane serie, zostaje na swoim miejscu.' }; o.nr = nr; c0 = nr; continue; }
    c0++; while (fixed[c0]) c0++; o.nr = c0;
  }
  const set = {}, add = [], del = [], weeks = {};
  let n = 0;
  const eq = (val, v) => { const o = norm(val); return typeof v === 'number' ? o !== '' && Number(o.replace(',', '.')) === v : o === String(v); };
  const put = (x, col, v) => {
    if (eq(x.r[col], v)) return false;
    (set[x.i] = set[x.i] || {})[col] = v; weeks[Number(x.r.tydzien)] = 1; return true;
  };
  const b = cur[0].r, dateOk = e.date === undefined || e.date === null ? null : String(e.date).trim();
  if (dateOk !== null && dateOk !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(dateOk)) return { error: 'Zła data.' };
  const newRow = (o, w, nr, base) => {
    const r = {}; PLAN_HEADERS.forEach(k => { r[k] = ''; });
    Object.assign(r, { klient: clientId, tydzien: w, jednostka: day, tytul: base.tytul, data: base.data instanceof Date ? fmtDate_(base.data) : norm(base.data), nr: nr, cwiczenie: o.name,
      prio: o.v.prio, serie: o.v.sets, powt: o.v.reps, procent: o.v.pct, kg: o.v.kg, rpe_max: o.v.rpe, uwagi: o.v.note, blok: norm(base.blok), zrodlo: 'trener', obwod: o.c });
    return r;
  };
  // ta jednostka
  for (const o of its) {
    if (!o.x) { add.push(newRow(o, week, o.nr, b)); weeks[week] = 1; n++; continue; }
    let ch = false;
    ch = put(o.x, 'nr', o.nr) || ch;
    if (o.name !== String(o.x.r.cwiczenie).trim()) ch = put(o.x, 'cwiczenie', o.name) || ch;
    Object.keys(o.v).forEach(f => { ch = put(o.x, TR_PLAN_F[f], o.v[f]) || ch; });
    ch = put(o.x, 'obwod', o.c) || ch;
    if (ch) n++;
  }
  cur.forEach(x => { if (!its.some(o => o.x === x)) { del.push(x.i); weeks[week] = 1; n++; } });
  if (dateOk !== null && dateOk !== norm(b.data instanceof Date ? fmtDate_(b.data) : b.data)) {
    cur.forEach(x => put(x, 'data', dateOk)); add.forEach(r => { r.data = dateOk; }); n++;
  }
  if (e.unote !== undefined && e.unote !== null) {
    const t = String(e.unote).replace(/\r\n?/g, '\n').trim();
    if (t.length > TR_UNOTE_MAX) return { error: 'Notatka do jednostki: najwyżej ' + TR_UNOTE_MAX + ' znaków.' };
    const keep = cur.filter(x => its.some(o => o.x === x)), first = keep.slice().sort((a, c) => (its.find(o => o.x === a).nr) - (its.find(o => o.x === c).nr))[0];
    let any = false;
    if (first) { any = put(first, 'uwagi_jedn', t) || any; keep.forEach(x => { if (x !== first && norm(x.r.uwagi_jedn)) any = put(x, 'uwagi_jedn', '') || any; }); }
    else if (t && add.length) { add[0].uwagi_jedn = t; any = true; }
    if (any) n++;
  }
  // kolejne tygodnie: ten sam blok, niezrobione, po nazwie ćwiczenia
  if (e.next) {
    const blok = lc(b.blok);
    const later = [...new Set(mine.filter(x => Number(x.r.tydzien) > week && String(x.r.jednostka).trim() === day && lc(x.r.blok) === blok && !own_(x.r) && !removed_(x.r) && !done[doneKey_(clientId, x.r.tydzien, day)])
      .map(x => Number(x.r.tydzien)))].sort((a, c) => a - c);
    later.forEach(w => {
      const u = unitOf(w), gone = {}, keepNames = [];
      // usunięte w tej jednostce → usunięte po nazwie (bez wpisów w Logu)
      cur.forEach(x => { if (!its.some(o => o.x === x)) u.filter(y => lc(y.r.cwiczenie) === lc(x.r.cwiczenie) && !lg(w, y)).forEach(y => { gone[y.i] = 1; del.push(y.i); weeks[w] = 1; }); });
      const left = u.filter(y => !gone[y.i]);
      its.forEach(o => {
        if (!o.x) {                                                   // nowe ćwiczenie: na końcu jednostki, jeśli jeszcze go tam nie ma
          if (left.some(y => lc(y.r.cwiczenie) === lc(o.name)) || add.some(r => r.tydzien === w && lc(r.cwiczenie) === lc(o.name))) return;
          const nr = Math.max(0, ...left.map(y => Number(y.r.nr) || 0), ...add.filter(r => r.tydzien === w).map(r => r.nr)) + 1;
          const r = newRow(o, w, nr, (left[0] || u[0] || cur[0]).r); r.obwod = ''; add.push(r); weeks[w] = 1; return;
        }
        const old = String(o.x.r.cwiczenie).trim();
        left.filter(y => lc(y.r.cwiczenie) === lc(old)).forEach(y => {
          if (o.name !== old) put(y, 'cwiczenie', o.name);
          Object.keys(o.v).forEach(f => {
            const col = TR_PLAN_F[f], was = n_(o.x.r[col]), v = o.v[f];
            if (eq(o.x.r[col], v)) return;                              // pole bez zmiany w tej jednostce
            const delta = (f === 'kg' || f === 'pct') && typeof v === 'number' && isFinite(was) && norm(o.x.r[col]) !== '' ? v - was : null, yo = n_(y.r[col]);
            if (delta !== null) { if (isFinite(yo) && norm(y.r[col]) !== '') put(y, col, Math.max(0, Math.round((yo + delta) * (f === 'pct' ? 10000 : 100)) / (f === 'pct' ? 10000 : 100))); }
            else put(y, col, v);
          });
        });
      });
      // kolejność: tylko gdy po zmianach to te same ćwiczenia (po nazwie) i żadne nie ma wpisu w Logu
      const names = its.map(o => lc(o.name)), mineW = left.map(y => lc(set[y.i] && set[y.i].cwiczenie !== undefined ? set[y.i].cwiczenie : y.r.cwiczenie)).concat(add.filter(r => r.tydzien === w).map(r => lc(r.cwiczenie)));
      if (names.length === mineW.length && names.slice().sort().join('\n') === mineW.slice().sort().join('\n') && new Set(names).size === names.length && !left.some(y => lg(w, y))) {
        its.forEach((o, k) => {
          const y = left.find(z => lc(set[z.i] && set[z.i].cwiczenie !== undefined ? set[z.i].cwiczenie : z.r.cwiczenie) === lc(o.name));
          if (y) put(y, 'nr', k + 1); else { const r = add.find(q => q.tydzien === w && lc(q.cwiczenie) === lc(o.name)); if (r) r.nr = k + 1; }
        });
      }
    });
  }
  return { set: Object.keys(set).map(i => [Number(i), set[i]]), add, del: [...new Set(del)].sort((a, c) => c - a), n, weeks: Object.keys(weeks).map(Number).sort((a, c) => a - c) };
}

/** Zapis całej jednostki z okna kalendarza (trUnitEdit_): komórki, nowe wiersze na końcu Planu, potem usunięte od dołu. */
function trJednostka(id, e) {
  id = String(id || '').trim().toLowerCase();
  trRow_(id);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const plan = tableOf_('Plan'), log = pgTable_('Log', DONE_LOG_COLS), done = unitsDone_(plan, pgTable_('Sesje', ['klient', 'tydzien', 'jednostka']), log);
    const logged = {};
    log.forEach(l => { if (String(l.klient).trim().toLowerCase() === id && String(l.jednostka).trim() === String(e && e.day).trim()) logged[Number(l.tydzien) + '|' + Number(l.nr_cw)] = 1; });
    const res = trUnitEdit_(plan, done, logged, id, e);
    if (res.error) throw new Error(res.error);
    trPlanSet_(res.set);
    const sh = SpreadsheetApp.getActive().getSheetByName('Plan');
    if (res.add.length) { const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim()); PLAN_HEADERS.forEach(k => { if (h.indexOf(k) < 0) { sh.getRange(1, h.length + 1).setValue(plain_(k)); h.push(k); } }); planAppend_(sh, h, res.add); }
    res.del.forEach(i => sh.deleteRow(i + 2));                      // od dołu, więc wcześniejsze indeksy się nie przesuwają
    return { n: res.n, weeks: res.weeks };
  } finally { lock.releaseLock(); }
}

/** Czysta funkcja: m = {week, day, date} → {error} albo {rows: [[indeks wiersza Planu, data]], date} (planMoves_ z regułą unitsDone_). */
function trMove_(plan, done, clientId, m) {
  m = m || {};
  const week = Number(m.week), day = String(m.day === undefined || m.day === null ? '' : m.day).trim(), date = String(m.date === undefined || m.date === null ? '' : m.date).trim();
  const rows = (plan || []).filter(r => String(r.klient).trim().toLowerCase() === clientId && Number(r.tydzien) === week && String(r.jednostka).trim() === day);
  if (!rows.length) return { error: 'Nie ma takiej jednostki w planie.' };
  if (rows.some(own_)) return { error: 'To własny trening klienta – dzień ustawia klient.' };
  if (done[doneKey_(clientId, week, day)]) return { error: 'Ta jednostka jest już zrobiona – dzień bierze się z jej zapisu.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Zła data.' };
  const res = planMoves_(plan, [], clientId, [{ week: week, day: day, date: date }]);
  return { rows: res.rows, date: date };
}

/** Przesunięcie niezrobionej jednostki klienta na inny dzień (kalendarz w panelu). */
function trPrzesun(id, m) {
  id = String(id || '').trim().toLowerCase();
  trRow_(id);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const plan = tableOf_('Plan'), done = unitsDone_(plan, pgTable_('Sesje', ['klient', 'tydzien', 'jednostka']), pgTable_('Log', DONE_LOG_COLS));
    const res = trMove_(plan, done, id, m);
    if (res.error) throw new Error(res.error);
    const sh = SpreadsheetApp.getActive().getSheetByName('Plan'), h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim());
    planTextCols_();
    const col = h.indexOf('data') + 1;
    res.rows.forEach(([i, d]) => sh.getRange(i + 2, col).setValue(plain_(d)));
    return { date: res.date, n: res.rows.length };
  } finally { lock.releaseLock(); }
}

/** Nazwy ćwiczeń z bazy do wyszukiwarki w oknie jednostki: [[nazwa, film, „partie”, „aliasy”]] (jak getExNames). */
function trCwNazwy() {
  return exNames_(cwRowsCached_());
}

/* ---------- kopiowanie jednostek w planie bloku (panel v2 PR 4, 27.11.2026) ----------
 * Siatka bloku w karcie klienta: jednostka z Shift na inny dzień = kopia, „+ Tydzień” = kopia ostatniego tygodnia bloku,
 * „Kopiuj tydzień…” = wszystkie jednostki trenera z tygodnia do innego tygodnia. Kopia: te same kolumny Planu (bez wierszy usuniętych
 * i dodanych przez klienta, bez własnych treningów), nowy tydzień i data; kod dnia zajęty w docelowym tygodniu → następny wolny numer
 * z tą samą literą (T1 → T4). Log i Sesje bez zmian.
 */
const TR_COPY_MAX = 14;

/**
 * Czysta funkcja: e = {units: [{week, day}], toWeek, date? (jedna jednostka), shift? (dni; domyślnie 7 × różnica tygodni)}
 * → {error} albo {rows: [wiersze Planu], made: [{week, day, from, date}]}.
 */
function trCopy_(plan, clientId, e) {
  e = e || {};
  const lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase(), norm = v => v === undefined || v === null || v instanceof Date ? '' : String(v).trim();
  const mine = (plan || []).filter(r => lc(r.klient) === clientId), toWeek = Number(e.toWeek);
  const units = [].concat(e.units || []);
  if (!units.length) return { error: 'Wybierz jednostkę do skopiowania.' };
  if (units.length > TR_COPY_MAX) return { error: 'Najwyżej ' + TR_COPY_MAX + ' jednostek naraz.' };
  if (!(Number.isInteger(toWeek) && toWeek >= 1 && toWeek <= 200)) return { error: 'Zły tydzień docelowy.' };
  const date1 = e.date === undefined || e.date === null || e.date === '' ? '' : String(e.date).trim();
  if (date1 && (units.length > 1 || !/^\d{4}-\d{2}-\d{2}$/.test(date1))) return { error: 'Zła data.' };
  const shift = e.shift === undefined || e.shift === null || e.shift === '' ? null : Number(e.shift);
  if (shift !== null && !(Number.isInteger(shift) && Math.abs(shift) <= 400)) return { error: 'Złe przesunięcie dni.' };
  const taken = {}; mine.filter(r => Number(r.tydzien) === toWeek).forEach(r => { taken[String(r.jednostka).trim()] = 1; });
  const rows = [], made = [];
  for (const u of units) {
    const week = Number(u && u.week), day = String(u && u.day !== undefined && u.day !== null ? u.day : '').trim();
    const src = mine.filter(r => Number(r.tydzien) === week && String(r.jednostka).trim() === day && !removed_(r) && !added_(r)).sort((a, b) => Number(a.nr) - Number(b.nr));
    if (!src.length) return { error: 'Nie ma jednostki ' + day + ' w tyg. ' + week + '.' };
    if (src.some(own_)) return { error: 'Własnego treningu klienta się nie kopiuje.' };
    let to = day;
    if (taken[to]) { const m = /^(\D*)(\d*)$/.exec(day) || ['', day, ''], pre = m[1] || 'T';
      let n = 1; Object.keys(taken).forEach(k => { const x = new RegExp('^' + pre.replace(/[^\w]/g, '\\$&') + '(\\d+)$').exec(k); if (x) n = Math.max(n, Number(x[1]) + 1); });
      to = pre + n; }
    taken[to] = 1;
    const d0 = norm(src[0].data instanceof Date ? fmtDate_(src[0].data) : src[0].data);
    const date = date1 || (/^\d{4}-\d{2}-\d{2}$/.test(d0) ? new Date(Date.parse(d0 + 'T12:00:00Z') + (shift !== null ? shift : 7 * (toWeek - week)) * 864e5).toISOString().slice(0, 10) : '');
    src.forEach(s => { const r = {}; PLAN_HEADERS.forEach(k => { r[k] = s[k] === undefined || s[k] === null || s[k] instanceof Date ? (k === 'data' ? d0 : '') : s[k]; });
      Object.assign(r, { klient: clientId, tydzien: toWeek, jednostka: to, data: date }); rows.push(r); });
    made.push({ week: toWeek, day: to, from: week + '|' + day, date });
  }
  return { rows, made };
}

/** Kopia jednostek trenera (trCopy_) na koniec Planu. */
function trKopiuj(id, e) {
  id = String(id || '').trim().toLowerCase();
  trRow_(id);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const res = trCopy_(tableOf_('Plan'), id, e);
    if (res.error) throw new Error(res.error);
    const sh = SpreadsheetApp.getActive().getSheetByName('Plan'), h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim());
    PLAN_HEADERS.forEach(k => { if (h.indexOf(k) < 0) { sh.getRange(1, h.length + 1).setValue(plain_(k)); h.push(k); } });
    planAppend_(sh, h, res.rows);
    return { made: res.made, n: res.rows.length };
  } finally { lock.releaseLock(); }
}
