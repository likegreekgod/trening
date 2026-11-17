/* ================== PANEL TRENERA (web/trener.html) ==================
 * Osobna strona na GitHub Pages dla trenera: pulpit wszystkich klientów, karta klienta, filmy.
 * Rozmawia z tym samym /exec co aplikacja klientów, ale funkcje z TR_FNS nie przyjmują klucza klienta:
 * każde zapytanie niesie bilet logowania Google (ID token), który trAuth_ sprawdza u Google i porównuje
 * z adresem trenera we właściwościach skryptu (TRENER_EMAIL, kilka po przecinku) i identyfikatorem
 * klienta OAuth (TRENER_CLIENT_ID). Obie wartości ustawia menu „Trening → Ustaw panel trenera”;
 * nie trafiają do repozytorium ani do arkusza. Bez nich panel odpowiada „nie jest skonfigurowany”.
 * PR 1 panelu: tylko odczyt (trPulpit, trKlient, trPrzelicz). Zapisy trenera i Claude API w kolejnych PR-ach.
 */
const TR_FNS = { trConfig, trPulpit, trKlient, trPrzelicz };
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
  const v = SpreadsheetApp.getActive().getSheetByName('Klienci').getDataRange().getValues();
  const row = v.slice(1).find(r => String(r[1]).trim().toLowerCase() === id);
  if (!id || !row) throw new Error('Nie ma klienta „' + id + '”.');
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
