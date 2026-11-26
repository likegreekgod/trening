/* ---------- Agent AI klienta: API dla własnego bota klienta (26.11.2026, PR 1 z 3) ----------
 * Bot klienta (WhatsApp, ChatGPT, Claude) wysyła POST na adres /exec z osobnym kluczem API zamiast klucza z linku:
 *   {fn: 'plan', api: '<klucz>', args: [{…}]}   albo   POST /exec/plan?api=<klucz> z treścią {…} (OpenAPI, e.pathInfo).
 * Apps Script nie czyta nagłówków, więc klucz idzie w treści albo w adresie. Odpowiedź jak reszta API: {ok, result} | {ok:false, error}.
 *
 * Bot może mówić, co chce, ale do arkusza wchodzi tylko to, co przepuści serwer:
 * - klucz: Klienci X api_klucz = SHA-256 klucza (pełny klucz trener widzi raz, przy tworzeniu), Y api_ustawienia (JSON:
 *   on, read, write, prop, limit), Z ograniczenia_ai (część klienta z „Zasad trenerskich”, sekcja 5);
 * - zasady trenera (sekcje 1–4 i 6, bez danych klientów): zakładka Zasady_AI (tekst + limity), panel → Ustawienia;
 * - twarde reguły z zasad pilnuje kod (numery reguł w komunikatach): 1.1 sufit RPE, 1.2 / 1.12 sufit w bojach (sufit_oly,
 *   dyspozycja „Uwaga” / „Zmęczenie” = plan), 1.4 po żółtej serii bez dokładania, 1.5 bez serii dodatkowych w bojach,
 *   1.6 bez maksów, 1.8 najwyżej 1 seria dodatkowa, 1.9 +2,5 kg tylko po tygodniu ≤ rpe_max, 3.1 / 3.4 / 3.7 zamiany,
 *   3.2 ćwiczenia tylko z bazy, 4.2 / 6.3 zmiany planu = propozycja do akceptacji, 4.4 jedna jednostka dziennie,
 *   4.6 tydzień przed startem, 4.12 jednostki trenera tylko do zapisu, 5.42 bez planu tylko zgłoszenie;
 * - ból i dyspozycja: bot ich nie czyta (ustalenie 26.11); ból może zgłosić (zglos → zakładka Stan i „Wymaga uwagi”);
 * - limity dzienne (CacheService), każde zapytanie w zakładce „API” (bez treści serii).
 * Propozycje i zgłoszenia: zakładka Propozycje (status czeka / odrzucona). Kolejka do zatwierdzania w panelu: PR 2.
 */
const AG_COL = { hash: 23, ust: 24, ogr: 25 };                      // Klienci X, Y, Z (indeksy od 0)
const AG_DOMYSLNE = { on: false, read: true, write: true, prop: true, limit: 200 };
const AG_LIMITY = { skok_kg: 2.5, zapisy: 50, propozycje: 5, zgloszenia: 10 };
const AG_LIMIT_MAX = 500, AG_TEKST_MAX = 45000, AG_OGR_MAX = 5000, AG_OPIS_MAX = 600;
const AG_PLAN_DNI = 14, AG_HIST_DNI = 90, AG_TRENING_SERIE = 80, AG_DZIENNIK = 3000;
const AG_LOG_HEADERS = ['czas', 'klient', 'akcja', 'wynik', 'powod'];
const ZASADY_HEADERS = ['klucz', 'wartosc', 'zapisano'];
const PROP_HEADERS = ['id', 'zapisano', 'klient', 'zrodlo', 'typ', 'tydzien', 'jednostka', 'nr', 'cwiczenie', 'tresc', 'powod_klienta',
  'status', 'uwaga_serwera', 'decyzja_at', 'komentarz_trenera'];
const AG_ZGLOS = ['czerwona_flaga', 'bol', 'plan', 'ciezar', 'status', 'fail', 'pominiete', 'dieta', 'cel', 'zawody', 'inne'];
// światła aplikacji (lib EFF): zielone = RPE 7, żółte = 8, czerwone = 9, nieudana = FAIL (RPE puste)
const AG_SWIATLA = { zielone: 7, lekko: 7, latwo: 7, zolte: 8, srednio: 8, czerwone: 9, ciezko: 9, walka: 9 };
const agTxt_ = (v, n) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 200);
const agFold_ = v => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();
const agNum_ = v => { const n = Number(String(v === undefined || v === null ? '' : v).replace(',', '.')); return String(v === undefined || v === null ? '' : v).trim() === '' || !isFinite(n) ? null : n; };
const agAddDays_ = (d, n) => { const x = new Date(String(d).slice(0, 10) + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const agOly_ = r => { const g = groupOf_(r.group, r.name); return g === 'R' || g === 'P'; };
const agErr_ = (txt, rule) => ({ error: txt + (rule ? ' (reguła ' + rule + ')' : '') });

/** Czysta: klucz API ma postać sz_ + 32 znaki szesnastkowe. */
function agKeyOk_(k) { return /^sz_[0-9a-f]{32}$/.test(String(k || '')); }

/** Czysta: Klienci X (JSON) → ustawienia API z domyślnymi; on tylko z zapisanym kluczem. */
function agUst_(json, hasKey) {
  let o = {}; try { o = JSON.parse(String(json || '{}')) || {}; } catch (e) { o = {}; }
  const lim = Math.round(Number(o.limit));
  return { on: !!(o.on && hasKey), read: o.read !== false, write: o.write !== false, prop: o.prop !== false,
    limit: lim >= 10 && lim <= AG_LIMIT_MAX ? lim : AG_DOMYSLNE.limit, at: String(o.at || ''), end: String(o.end || '') };
}

/** Czysta: limity z zakładki Zasady_AI (JSON) → liczby w dozwolonych zakresach. */
function agLimity_(json) {
  let o = {}; try { o = JSON.parse(String(json || '{}')) || {}; } catch (e) { o = {}; }
  const pick = (k, mn, mx, st) => { const n = Number(o[k]); return isFinite(n) && n >= mn && n <= mx && Math.abs(n / st - Math.round(n / st)) < 1e-9 ? n : AG_LIMITY[k]; };
  return { skok_kg: pick('skok_kg', 0, 10, 2.5), zapisy: pick('zapisy', 10, 200, 1), propozycje: pick('propozycje', 0, 20, 1), zgloszenia: pick('zgloszenia', 1, 30, 1) };
}

/** Czysta: wiersze Klienci → indeks aktywnego klienta z tym skrótem klucza (kolumna X) albo -1. */
function agFindRow_(rows, hash) {
  if (!/^[0-9a-f]{64}$/.test(String(hash || ''))) return -1;
  return (rows || []).findIndex(r => String(r[AG_COL.hash] || '').trim() === hash && String(r[0] || '').trim() && String(r[3]).trim().toUpperCase() !== 'NIE');
}

/** Czysta: światło / RPE z zapisu bota → {rpe, typ} albo {error}. Brak oceny = puste RPE (reguła 1.7: to nie RPE 7). */
function agLight_(v) {
  if (v === undefined || v === null || String(v).trim() === '') return { rpe: '', typ: '' };
  const f = agFold_(v).replace(/[^a-z0-9.,]/g, '');
  if (/^(nieudana|fail|spalone|x)$/.test(f)) return { rpe: '', typ: 'FAIL' };
  if (AG_SWIATLA[f] !== undefined) return { rpe: AG_SWIATLA[f], typ: '' };
  const n = agNum_(f);
  if (n !== null && n >= 5 && n <= 10 && Math.round(n * 2) === n * 2) return { rpe: n, typ: '' };
  return { error: 'Ocena serii: zielone / żółte / czerwone / nieudana albo RPE 5–10 co 0,5.' };
}
/** Czysta: RPE z Logu → światło (jak lib lightOf: ≤ 7,5 zielone, 8–8,5 żółte, ≥ 9 czerwone; FAIL = nieudana; puste = brak oceny). */
function agLightOf_(rpe, typ) {
  if (/FAIL/i.test(String(typ || ''))) return 'nieudana';
  const n = agNum_(rpe); if (n === null) return 'brak oceny';
  return n <= 7.5 ? 'zielone' : n < 9 ? 'żółte' : 'czerwone';
}

/** Czysta: wiersze planu klienta (clientData_) → jednostki {week, day, title, date, block, coach, own, unote, rows} w kolejności. */
function agUnits_(plan) {
  const m = {}, out = [];
  (plan || []).forEach(r => {
    const k = r.week + '|' + r.day;
    if (!m[k]) { m[k] = { week: r.week, day: r.day, title: r.title, date: r.date || '', block: r.block || '', coach: false, own: !!r.own, unote: '', rows: [] }; out.push(m[k]); }
    const u = m[k]; u.rows.push(r);
    if (r.coach || /^T\d/.test(String(r.day))) u.coach = true;
    if (r.unote && !u.unote) u.unote = r.unote;
    if (!u.date && r.date) u.date = r.date;
  });
  out.forEach(u => u.rows.sort((a, b) => a.order - b.order));
  return out.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.week - b.week || String(a.day).localeCompare(String(b.day)));
}
/** Czysta: zrobione jednostki klienta (ta sama reguła co unitsDone_) → zbiór „tydzień|jednostka”. */
function agDone_(id, d) {
  const plan = (d.plan || []).map(r => ({ klient: id, tydzien: r.week, jednostka: r.day, nr: r.order, prio: r.prio }));
  const done = unitsDone_(plan, (d.sessions || []).map(s => Object.assign({}, s, { klient: id })), (d.logs || []).map(l => Object.assign({}, l, { klient: id })));
  const out = {}; Object.keys(done).forEach(k => { out[k.split('|').slice(1).join('|')] = 1; });
  return out;
}

/** Czysta: plan dla bota: niezrobione jednostki od tygodnia temu do today + dni, zrobione dziś, notatki trenera dla klienta. */
function agPlan_(d, o) {
  const today = o.today, days = Math.min(Math.max(Math.round(Number(o.days)) || AG_PLAN_DNI, 1), 31), end = agAddDays_(today, days);
  const units = agUnits_(d.plan), done = o.done || {}, swap = d.cfg && d.cfg.swap;
  const pick = units.filter(u => { const k = u.week + '|' + u.day, dt = u.date;
    if (done[k]) return o.doneToday && o.doneToday[k];
    return !dt || (dt >= agAddDays_(today, -7) && dt <= end); }).slice(0, 12);
  const blocks = {}; pick.forEach(u => { if (u.block) blocks[u.block] = 1; });
  return {
    dzis: today, klient: d.cfg ? d.cfg.name : '', zasady_wersja: o.version || '',
    instrukcja: 'Przed radą pobierz „zasady”. Ciężar na dziś licz akcją „ciezarNaDzis”, nie sam. Zmiany planu tylko przez „zaproponuj”, sprawy z sekcji 6 przez „zglos”.',
    dla_klienta: Object.keys(blocks).map(b => ({ blok: b, tekst: (d.blockNotes || {})[b] || '' })).filter(x => x.tekst),
    jednostki: pick.map(u => {
      const k = u.week + '|' + u.day;
      return { tydzien: u.week, jednostka: u.day, tytul: u.title, data: u.date || '', blok: u.block,
        stan: done[k] ? 'zrobiona' : !u.date ? 'bez daty' : u.date < today ? 'zaległa' : u.date === today ? 'dziś' : 'zaplanowana',
        prowadzi_trener: u.coach, wlasna: u.own, uwagi_trenera: u.unote,
        cwiczenia: u.rows.map(r => ({ nr: r.order, nazwa: r.name, prio: r.prio, serie: r.sets, powt: r.reps,
          kg: r.kg === '' ? null : r.kg, procent: r.pct === null || r.pct === undefined || !isFinite(r.pct) ? null : Math.round(r.pct * 1000) / 10,
          rpe_max: r.rpe === '' ? null : r.rpe, uwagi: r.note || '', dod_serie: agOly_(r) ? 0 : Math.min(1, r.extra === null || r.extra === undefined ? (d.cfg.extra || 0) : r.extra),
          boj: agOly_(r), zamienniki: swap ? (r.swaps || []).slice(0, 6) : [] })) };
    })
  };
}

/** Czysta: historia dla bota: zapisane serie z ostatnich dni (bez bólu, dyspozycji, filmów i notatek trenera), jednostkami. */
function agHistoria_(d, o) {
  const today = o.today, days = Math.min(Math.max(Math.round(Number(o.days)) || 30, 1), AG_HIST_DNI), from = agAddDays_(today, -days);
  const title = {}; (d.plan || []).forEach(r => { title[r.week + '|' + r.day] = r.title; });
  const ses = {}; (d.sessions || []).forEach(s => { ses[s.tydzien + '|' + s.jednostka] = s; });
  const U = {}, out = [];
  (d.logs || []).forEach(l => {
    const dt = String(l.data || '').slice(0, 10), se = String(l.seria === undefined || l.seria === null ? '' : l.seria).trim();
    if (!dt || dt < from || dt > today || !se) return;
    const k = l.tydzien + '|' + l.jednostka;
    if (!U[k]) { const s = ses[k] || {}; U[k] = { data: dt, tydzien: Number(l.tydzien), jednostka: String(l.jednostka), tytul: title[k] || '',
      rpe_sesji: s.rpe_sesji === '' || s.rpe_sesji === undefined ? null : s.rpe_sesji, czas_min: s.czas_min === '' || s.czas_min === undefined ? null : s.czas_min, ex: {}, cwiczenia: [] }; out.push(U[k]); }
    const u = U[k], nr = Number(l.nr_cw);
    if (!u.ex[nr]) { u.ex[nr] = { nr: nr, nazwa: String(l.cwiczenie), serie: [] }; u.cwiczenia.push(u.ex[nr]); }
    if (se === '0') { u.ex[nr].pominiete = agTxt_(l.uwagi, 120) || 'pominięte'; return; }
    if (String(l.wykonane || '').toUpperCase() !== 'TAK' && !/FAIL/i.test(String(l.typ || ''))) return;
    u.ex[nr].serie.push({ seria: se, kg: l.kg === '' ? null : l.kg, powt: l.powt === '' ? null : l.powt, rpe: l.rpe === '' ? null : l.rpe, swiatlo: /^R/i.test(se) ? 'rozgrzewka' : agLightOf_(l.rpe, l.typ), typ: String(l.typ || '') });
  });
  out.forEach(u => { u.cwiczenia.sort((a, b) => a.nr - b.nr); delete u.ex; });
  return { od: from, do: today, jednostki: out.sort((a, b) => b.data.localeCompare(a.data)) };
}

/** Czysta: pierwsza niezrobiona jednostka (dziś, potem zaległa najnowsza, potem najbliższa, potem bez daty). */
function agNext_(units, done, today) {
  const open = units.filter(u => !done[u.week + '|' + u.day]);
  return open.find(u => u.date === today) || open.filter(u => u.date && u.date < today).pop() || open.find(u => u.date > today) || open.find(u => !u.date) || null;
}

/**
 * Czysta: ciężar na dziś wg zasad (1.1–1.12). Dla każdego ćwiczenia jednostki z liczbą kg w planie:
 * poprzednie wykonanie tego ćwiczenia (najnowsza wcześniejsza jednostka z zaliczoną serią roboczą):
 * wszystkie serie ocenione i ≤ rpe_max, bez FAIL → kg z planu (reguła 1.9); inaczej powtórka poprzedniego ciężaru (nie więcej niż plan);
 * seria bez oceny → powtórka i prośba o RPE (1.7). Boje: sufit = plan + sufit_oly × maks (z %), przy „Uwaga” / „Zmęczenie” = plan (1.2);
 * pozostałe ćwiczenia: sufit = ciężar na dziś. o = {week, day, today, verdict, olyCeil}.
 */
function agCiezar_(d, o) {
  const units = agUnits_(d.plan), done = o.done || {};
  const u = o.week !== undefined && o.day !== undefined ? units.find(x => Number(x.week) === Number(o.week) && String(x.day) === String(o.day)) : agNext_(units, done, o.today);
  if (!u) return agErr_('Nie ma takiej jednostki w planie.');
  const prevOf = (name, ex) => {
    const key = exKey_(name), before = (d.logs || []).filter(l => exKey_(l.cwiczenie) === key && !(Number(l.tydzien) === Number(u.week) && String(l.jednostka) === String(u.day)) &&
      /^\d+$/.test(String(l.seria)) && String(l.seria) !== '0' && (String(l.wykonane || '').toUpperCase() === 'TAK' || /FAIL/i.test(String(l.typ || ''))) &&
      (Number(l.tydzien) < Number(u.week) || String(l.data || '') < String(u.date || o.today)));
    if (!before.length) return null;
    const last = before.reduce((a, l) => (String(l.data) + '|' + String(l.tydzien).padStart(3, '0')) > a ? String(l.data) + '|' + String(l.tydzien).padStart(3, '0') : a, '');
    const sets = before.filter(l => String(l.data) + '|' + String(l.tydzien).padStart(3, '0') === last);
    const pr = (d.plan || []).find(r => Number(r.week) === Number(sets[0].tydzien) && String(r.day) === String(sets[0].jednostka) && exKey_(r.name) === key) || ex;
    return { sets: sets, rpeMax: pr.rpe === '' ? null : agNum_(pr.rpe), date: String(sets[0].data).slice(0, 10) };
  };
  const tired = /uwaga|zmęcz|zmecz/i.test(String(o.verdict || ''));
  return { tydzien: u.week, jednostka: u.day, tytul: u.title, data: u.date || '', dyspozycja_obniza: tired,
    cwiczenia: u.rows.map(r => {
      const plan = typeof r.kg === 'number' ? r.kg : null, oly = agOly_(r), base = { nr: r.order, nazwa: r.name, kg_plan: plan, rpe_max: r.rpe === '' ? null : r.rpe };
      if (plan === null) return Object.assign(base, { kg_dzis: null, sufit: null, powod: 'Plan nie ma liczby kg: ciężar dobierz do RPE z planu.' });
      const p = prevOf(r.name, r);
      let kg = plan, why = 'Pierwsze wykonanie: ciężar z planu.';
      if (p) {
        const work = p.sets.filter(l => !/^R/i.test(String(l.seria)));
        const top = Math.max.apply(null, work.map(l => agNum_(l.kg)).filter(x => x !== null).concat([0]));
        const fail = work.some(l => /FAIL/i.test(String(l.typ || ''))), unrated = work.some(l => !/FAIL/i.test(String(l.typ || '')) && agNum_(l.rpe) === null);
        const over = p.rpeMax !== null && work.some(l => agNum_(l.rpe) !== null && agNum_(l.rpe) > p.rpeMax);
        if (fail || over || unrated) {
          kg = top > 0 ? Math.min(plan, top) : plan;
          why = (fail ? 'Ostatnio (' + p.date + ') była seria nieudana' : over ? 'Ostatnio (' + p.date + ') seria ponad RPE ' + p.rpeMax : 'Ostatnio (' + p.date + ') seria bez oceny: zapytaj o RPE (reguła 1.7)') +
            ', więc ' + (kg < plan ? 'powtórka ' + kg + ' kg zamiast ' + plan + ' kg' : 'ciężar z planu, bez dokładania') + ' (reguła 1.9).';
        } else why = 'Ostatnio (' + p.date + ') wszystkie serie ≤ RPE ' + (p.rpeMax === null ? 'z planu' : p.rpeMax) + ': ciężar z planu (reguła 1.9).';
      }
      let cap = kg;
      if (oly && !tired && kg === plan && r.pct > 0 && o.olyCeil > 0) cap = Math.floor((plan + o.olyCeil * plan / r.pct) / 2.5 + 1e-9) * 2.5;
      const capWhy = oly ? (tired ? ' Dyspozycja dnia: sufitem jest ciężar z planu (reguła 1.2).' : cap > kg ? ' Ponad plan po 2,5 kg, tylko po zielonej serii, do ' + cap + ' kg; po żółtej koniec dokładania (reguły 1.12, 1.4).' : ' Sufitem jest ciężar z planu (reguła 1.2).')
        : ' Bez dokładania ponad ten ciężar; RPE nie wyżej niż ' + (r.rpe === '' ? 'z planu' : r.rpe) + ' (reguła 1.1).';
      return Object.assign(base, { kg_dzis: kg, sufit: cap, powod: why + capWhy });
    }) };
}

/** Czysta: zapis serii przez bota → payload logSet albo {error}. s = {tydzien, jednostka, nr, seria, kg, powt, swiatlo|rpe}; old = dotychczasowy wiersz Logu. */
function agSet_(s, d, o) {
  s = s || {};
  const week = Number(s.tydzien), day = agTxt_(s.jednostka, 20), nr = Number(s.nr), se = agTxt_(s.seria, 4).toUpperCase();
  const ex = (d.plan || []).find(r => Number(r.week) === week && String(r.day) === day && Number(r.order) === nr);
  if (!ex) return agErr_('Nie ma takiego ćwiczenia w planie (tydzień, jednostka, nr z akcji „plan”).');
  const oly = agOly_(ex), extra = oly ? 0 : Math.min(1, ex.extra === null || ex.extra === undefined ? ((d.cfg && d.cfg.extra) || 0) : ex.extra);
  if (/^\d+$/.test(se)) {
    const n = Number(se);
    if (n < 1) return agErr_('Seria od 1.');
    if (n > ex.sets + extra) return oly ? agErr_('W bojach bez serii dodatkowych', '1.5') : agErr_('Najwyżej ' + extra + ' seria dodatkowa ponad plan', '1.8');
  } else if (/^R[1-9]$/.test(se)) { /* rozgrzewka */ } else if (/^D[1-9]$/.test(se)) { if (!(ex.drop > 0)) return agErr_('Drop set tylko tam, gdzie jest w planie.'); }
  else return agErr_('Seria: numer (1, 2…), R1… rozgrzewka albo D1… drop set.');
  const kg = s.kg === undefined || s.kg === null || String(s.kg).trim() === '' ? '' : agNum_(s.kg);
  if (kg !== '' && !(kg !== null && kg >= 0 && kg <= 500)) return agErr_('Ciężar: liczba kg 0–500 albo puste (masa ciała).');
  const reps = s.powt === undefined || s.powt === null || String(s.powt).trim() === '' ? '' : agNum_(s.powt);
  if (reps !== '' && !(reps !== null && reps >= 0 && reps <= 300 && Math.round(reps) === reps)) return agErr_('Powtórzenia: liczba całkowita (sekundy przy ćwiczeniu na czas).');
  const L = agLight_(s.swiatlo !== undefined ? s.swiatlo : s.rpe); if (L.error) return L;
  const old = o && o.old || {}, keep = k => old[k] === undefined || old[k] === null ? '' : old[k];
  const typ = /^D/.test(se) ? (L.typ ? 'DROP+FAIL' : 'DROP') : L.typ;
  return { set: { week: week, day: day, order: nr, set: /^\d+$/.test(se) ? Number(se) : se, date: o && o.today, name: keep('zamiana') ? keep('cwiczenie') : ex.name,
    kg: kg, reps: reps, rpe: /^R/.test(se) ? '' : L.rpe, done: !L.typ, typ: typ, vbt: keep('vbt_ms'), video: keep('film_link'), note: keep('uwagi'),
    ocena: keep('ocena'), vbtPeak: keep('vbt_peak'), height: keep('wysokosc_cm'), path: keep('sciezka'), swap: keep('zamiana') },
    ponad: typeof ex.kg === 'number' && kg !== '' && kg > ex.kg, rpeMax: ex.rpe };
}

/** Czysta: zbiór dni, w których klient już trenował (Sesje.start / data, Log.data serii roboczych) → reguła 4.4. */
function agBusyDays_(d, dayOf) {
  const out = {}, day = dayOf || sesDay_;                          // dayOf: w testach bez strefy czasowej Apps Script
  (d.sessions || []).forEach(s => { const t = day(s.start) || String(s.data || '').slice(0, 10); if (t) out[t] = 1; });
  (d.logs || []).forEach(l => { if (doneWork_(l)) out[String(l.data || '').slice(0, 10)] = 1; });
  return out;
}

/**
 * Czysta: własny trening z bota → {unit (dla ownRows_), sets} albo {error}.
 * t = {data, tytul, cwiczenia: [{nazwa, serie: [{kg, powt, swiatlo}]}], rpe_sesji, czas_min, uwagi}; o = {today, find(nazwa) → nazwa z bazy | null, busy, taper}.
 */
function agTrening_(t, d, o) {
  t = t || {};
  const date = String(t.data || o.today).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > o.today || date < agAddDays_(o.today, -7)) return agErr_('Data treningu: dziś albo do 7 dni wstecz (RRRR-MM-DD).');
  if (o.busy && o.busy[date]) return agErr_('Tego dnia jest już zapisany trening: jedna jednostka dziennie', '4.4');
  if (o.taper && date >= o.taper[0] && date <= o.taper[1]) return agErr_('Tydzień przed startem: tylko jednostki z planu', '4.6');
  const list = [].concat(t.cwiczenia || []);
  if (!list.length) return agErr_('Dodaj co najmniej jedno ćwiczenie.');
  if (list.length > OWN_MAX) return agErr_('Najwyżej ' + OWN_MAX + ' ćwiczeń.');
  const bad = [], ex = [];
  let n = 0;
  for (const e of list) {
    const name = o.find(agTxt_(e && e.nazwa, 80));
    if (!name) { bad.push(agTxt_(e && e.nazwa, 80) || '(bez nazwy)'); continue; }
    const sets = [];
    for (const s of [].concat(e.serie || [])) {
      const kg = s && agNum_(s.kg), reps = s && agNum_(s.powt), L = agLight_(s && (s.swiatlo !== undefined ? s.swiatlo : s.rpe));
      if (L.error) return L;
      if (s && String(s.kg === undefined || s.kg === null ? '' : s.kg).trim() !== '' && !(kg !== null && kg >= 0 && kg <= 500)) return agErr_('Ciężar: liczba kg 0–500 albo puste.');
      if (!(reps !== null && reps >= 0 && reps <= 300 && Math.round(reps) === reps)) return agErr_('Powtórzenia przy każdej serii (liczba całkowita).');
      sets.push({ kg: kg === null ? '' : kg, reps: reps, rpe: L.rpe, typ: L.typ });
    }
    if (!sets.length) return agErr_('Ćwiczenie „' + name + '” bez serii.');
    n += sets.length; ex.push({ name: name, sets: sets });
  }
  if (bad.length) return agErr_('Tych ćwiczeń nie ma w bazie: ' + bad.join(', ') + '. Sprawdź nazwę akcją „cwiczenia”', '3.2');
  if (n > AG_TRENING_SERIE) return agErr_('Najwyżej ' + AG_TRENING_SERIE + ' serii w treningu.');
  // tydzień jak w aplikacji: tydzień najnowszej jednostki planu z datą ≤ dnia treningu; dzień W<n> = następny wolny
  const dated = (d.plan || []).filter(r => !r.own && r.date && r.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  const week = dated.length ? Number(dated[dated.length - 1].week) : Math.max.apply(null, (d.plan || []).map(r => Number(r.week) || 1).concat([1]));
  const used = (d.plan || []).filter(r => Number(r.week) === week && /^W\d+$/.test(String(r.day))).map(r => Number(String(r.day).slice(1)));
  const day = 'W' + (Math.max.apply(null, used.concat([0])) + 1);
  const rpeS = agNum_(t.rpe_sesji), min = agNum_(t.czas_min);
  if (rpeS !== null && !(rpeS >= 0 && rpeS <= 10)) return agErr_('RPE sesji 0–10.');
  if (min !== null && !(min > 0 && min <= 300)) return agErr_('Czas treningu 1–300 min.');
  return { unit: { week: week, day: day, date: date, title: agTxt_(t.tytul, 30) || 'Z bota', exercises: ex.map(e => ({ name: e.name, sets: e.sets.length, reps: String(e.sets[0].reps), kg: e.sets[0].kg })) },
    exercises: ex, session: { week: week, day: day, date: date, start: date, rpeSession: rpeS === null ? undefined : rpeS, minutes: min === null ? '' : min, note: agTxt_(t.uwagi, 300) } };
}

/**
 * Czysta: propozycja zmiany planu → {row: wiersz Propozycji bez id i czasu, status} — odrzucona z powodem albo „czeka” na trenera.
 * p = {typ: zamiana | ciezar | serie | trening, tydzien, jednostka, nr, na, kg, serie, data, opis, powod, na_stale};
 * o = {today, done, swap, find, taper, busy, limity, ciezar(week, day) → wynik agCiezar_}.
 */
function agProp_(p, d, o) {
  p = p || {};
  const typ = agFold_(p.typ), why = agTxt_(p.powod, 300), rej = (txt, rule) => ({ status: 'odrzucona', uwaga: txt + (rule ? ' (reguła ' + rule + ')' : '') });
  const maxWords = /\b(max\w*|maks\w*|test\w*|rekord\w*|pr|1rm)\b/i;
  const base = { typ: typ, tydzien: '', jednostka: '', nr: '', cwiczenie: '', tresc: '', powod: why };
  if (['zamiana', 'ciezar', 'serie', 'trening'].indexOf(typ) < 0) return Object.assign(base, rej('Typ propozycji: zamiana, ciezar, serie albo trening. Inne sprawy zgłoś akcją „zglos”.'));
  if (!(d.plan || []).some(r => !r.own)) return Object.assign(base, rej('Bez planu od trenera nie ma propozycji: zgłoś sprawę trenerowi', '5.42'));
  if (typ === 'trening') {
    const date = String(p.data || '').slice(0, 10), opis = agTxt_(p.opis, 300);
    Object.assign(base, { tresc: JSON.stringify({ data: date, opis: opis }) });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < o.today) return Object.assign(base, rej('Data dodatkowego treningu: dziś albo później (RRRR-MM-DD).'));
    if (!opis) return Object.assign(base, rej('Opisz trening (opis).'));
    if (maxWords.test(opis)) return Object.assign(base, rej('Bez maksów, testów i prób rekordu poza planem', '1.6'));
    if (o.taper && date >= o.taper[0] && date <= o.taper[1]) return Object.assign(base, rej('Tydzień przed startem: tylko jednostki z planu', '4.6'));
    if ((o.planDays || {})[date] || (o.busy || {})[date]) return Object.assign(base, rej('Tego dnia jest już trening: jedna jednostka dziennie', '4.4'));
    return Object.assign(base, { status: 'czeka', uwaga: '' });
  }
  const week = Number(p.tydzien), day = agTxt_(p.jednostka, 20), nr = Number(p.nr);
  const ex = (d.plan || []).find(r => Number(r.week) === week && String(r.day) === day && Number(r.order) === nr);
  Object.assign(base, { tydzien: week || '', jednostka: day, nr: nr || '', cwiczenie: ex ? ex.name : '' });
  if (!ex) return Object.assign(base, rej('Nie ma takiego ćwiczenia w planie (tydzień, jednostka, nr z akcji „plan”).'));
  const k = week + '|' + day;
  if ((o.done || {})[k]) return Object.assign(base, rej('Ta jednostka jest już zrobiona.'));
  if (ex.coach || /^T\d/.test(day)) return Object.assign(base, rej('To trening na żywo z trenerem: tylko zapis wykonania', '4.12'));
  if (ex.own) return Object.assign(base, rej('To własny trening klienta: zmień go w aplikacji.'));
  if (o.taper && ex.date && ex.date >= o.taper[0] && ex.date <= o.taper[1]) return Object.assign(base, rej('Tydzień przed startem: plan bez zmian', '4.6'));
  if (typ === 'zamiana') {
    const na = agTxt_(p.na, 80), found = na ? o.find(na) : null;
    base.tresc = JSON.stringify({ na: found || na, na_stale: !!p.na_stale });
    if (!d.cfg || !d.cfg.swap) return Object.assign(base, rej('Ten klient nie ma zamian ćwiczeń', '3.1'));
    if (!why) return Object.assign(base, rej('Zamiana zawsze z powodem (powod)', '3.1'));
    if (p.na_stale) return Object.assign(base, rej('Zamiana tylko „w tym treningu”: o planie decyduje trener', '3.7'));
    if (agOly_(ex)) return Object.assign(base, rej('Boje nie mają zamienników: przy problemie spada ciężar', '3.4'));
    if (!found) return Object.assign(base, rej('Zamiennika „' + na + '” nie ma w bazie ćwiczeń', '3.2'));
    if (maxWords.test(found)) return Object.assign(base, rej('Bez maksów i testów poza planem', '1.6'));
    if (exKey_(found) === exKey_(ex.name)) return Object.assign(base, rej('To to samo ćwiczenie.'));
    return Object.assign(base, { status: 'czeka', uwaga: '' });
  }
  if (typ === 'ciezar') {
    const kg = agNum_(p.kg);
    base.tresc = JSON.stringify({ kg: kg });
    if (!(kg !== null && kg > 0 && kg <= 500)) return Object.assign(base, rej('Podaj ciężar w kg (kg).'));
    if (typeof ex.kg !== 'number') return Object.assign(base, rej('Plan nie ma tu liczby kg: ciężar dobiera się do RPE z planu.'));
    const c = o.ciezar ? o.ciezar(week, day) : null, row = c && c.cwiczenia ? c.cwiczenia.find(x => x.nr === nr) : null;
    const top = row && row.kg_dzis !== null && row.kg_dzis !== undefined ? row.kg_dzis : ex.kg;
    if (kg > ex.kg && row && row.kg_dzis !== null && row.kg_dzis < ex.kg) return Object.assign(base, rej('Ostatnio nie wszystkie serie były ≤ rpe_max, więc ciężar z planu jeszcze nie: ' + row.kg_dzis + ' kg', '1.9'));
    if (agOly_(ex) && kg > ex.kg) return Object.assign(base, rej('W bojach kg z planu jest punktem wyjścia; ponad plan tylko w trakcie sesji do sufitu, po zielonej serii', '1.2'));
    if (kg > top + o.limity.skok_kg + 1e-9) return Object.assign(base, rej('Najwyżej +' + String(o.limity.skok_kg).replace('.', ',') + ' kg ponad ' + top + ' kg na tydzień', '1.9'));
    return Object.assign(base, { status: 'czeka', uwaga: '' });
  }
  // serie
  const n = Math.round(Number(p.serie));
  base.tresc = JSON.stringify({ serie: n });
  if (!(n >= 1 && n <= SETS_MAX)) return Object.assign(base, rej('Liczba serii 1–' + SETS_MAX + '.'));
  if (n > ex.sets && agOly_(ex)) return Object.assign(base, rej('W bojach bez serii dodatkowych', '1.5'));
  if (n > ex.sets + 1) return Object.assign(base, rej('Najwyżej 1 seria więcej niż w planie', '1.8'));
  if (n === ex.sets) return Object.assign(base, rej('Tyle serii już jest w planie.'));
  return Object.assign(base, { status: 'czeka', uwaga: '' });
}

/** Czysta: zgłoszenie z bota (sekcja 6 zasad) → {typ, opis, stan (wpis Ból / napięcie albo null)} albo {error}. */
function agZglos_(z, today) {
  z = z || {};
  const temat = agFold_(z.temat).replace(/\s+/g, '_'), opis = agTxt_(z.opis, AG_OPIS_MAX);
  if (AG_ZGLOS.indexOf(temat) < 0) return agErr_('Temat zgłoszenia: ' + AG_ZGLOS.join(', ') + '.');
  if (!opis) return agErr_('Opisz sprawę (opis): co, kiedy, ile w skali 0–10.');
  const score = agNum_(z.ocena), place = agTxt_(z.miejsce, 40);
  if ((temat === 'bol' || temat === 'czerwona_flaga') && place && !(score !== null && score >= 0 && score <= 10 && Math.round(score) === score)) return agErr_('Ból: ocena 0–10 (liczba całkowita).');
  const side = /^[lp]$/i.test(String(z.strona || '').trim()) ? String(z.strona).trim().toUpperCase() : '';
  return { typ: 'zgloszenie:' + temat, opis: opis, stan: (temat === 'bol' || temat === 'czerwona_flaga') && place ? { date: today, place: place, side: side, score: score, context: '', note: opis.slice(0, 300) } : null };
}

/** Czysta: otwarte sprawy od botów z ostatnich dni (zakładka Propozycje, status „czeka”) → lista dla pulpitu panelu. */
function agOpen_(rows, names, today, days) {
  const from = agAddDays_(today, -(days || 7)), d10 = v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10);
  return (rows || []).filter(r => String(r.status) === 'czeka' && d10(r.zapisano) >= from).map(r => {
    const t = String(r.typ || ''), tr = (() => { try { return JSON.parse(String(r.tresc || '{}')); } catch (e) { return {}; } })();
    const what = /^zgloszenie:/.test(t) ? String(r.powod_klienta || '') : t === 'zamiana' ? r.cwiczenie + ' → ' + (tr.na || '') : t === 'ciezar' ? r.cwiczenie + ': ' + tr.kg + ' kg' : t === 'serie' ? r.cwiczenie + ': ' + tr.serie + ' serie' : 'dodatkowy trening ' + (tr.data || '') + ': ' + (tr.opis || '');
    return { id: String(r.klient).toLowerCase(), name: names[String(r.klient).toLowerCase()] || String(r.klient), at: d10(r.zapisano), typ: t.replace(/^zgloszenie:/, ''), zgl: /^zgloszenie:/.test(t),
      pilne: t === 'zgloszenie:czerwona_flaga', text: agTxt_(what, 160) };
  }).sort((a, b) => (b.pilne - a.pilne) || b.at.localeCompare(a.at));
}

/* ---------- część z usługami Google ---------- */
const agHash_ = k => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(k)).map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');

/** Zasady trenera (zakładka Zasady_AI): {tekst, limity, at}. */
function agZasady_() {
  const rows = tableOf_('Zasady_AI'), get = k => rows.find(r => String(r.klucz) === k) || {};
  const t = get('tekst');
  return { tekst: String(t.wartosc || ''), limity: agLimity_(get('limity').wartosc), at: t.zapisano instanceof Date ? t.zapisano.toISOString() : String(t.zapisano || '') };
}

/** Licznik dzienny (CacheService, klucz z dniem): przekroczony = błąd. */
function agCount_(id, kind, max) {
  const c = CacheService.getScriptCache(), k = 'ag|' + id + '|' + today_() + '|' + kind, n = Number(c.get(k)) || 0;
  if (n >= max) throw new Error('Dzienny limit „' + kind + '” (' + max + ') wyczerpany. Spróbuj jutro.');
  c.put(k, String(n + 1), 21600);
  return n + 1;
}
function agLog_(id, fn, ok, why) {
  try {
    const sh = sheet_('API', AG_LOG_HEADERS);
    sh.appendRow(plainRow_([new Date(), id, String(fn).slice(0, 30), ok ? 'ok' : 'odmowa', String(why || '').slice(0, 200)]));
    if (sh.getLastRow() > AG_DZIENNIK + 1) sh.deleteRows(2, sh.getLastRow() - AG_DZIENNIK - 1);
  } catch (e) { /* dziennik nie może zablokować odpowiedzi */ }
}

/** Kontekst klienta dla akcji: dane jak getData (bez notatek trenera), ustawienia API, sufit, start (taper), dyspozycja dnia. */
function agCtx_(row) {
  const c = clientOf_(row), d = liveView_(clientData_(c, Date.now()), false), today = today_();
  const ust = agUst_(row[AG_COL.ust], true), start = String(row[18] instanceof Date ? fmtDate_(row[18]) : row[18] || '').slice(0, 10);
  const ix = exIndex_(cwRowsCached_()), find = n => { const e = n ? exFind_(ix, n) : null; return e ? e.name : null; };
  const done = agDone_(c.id, d), rd = (d.readiness || []).find(r => String(r.data).slice(0, 10) === today);
  const planDays = {}; (d.plan || []).forEach(r => { if (!r.own && r.date) planDays[r.date] = 1; });
  return { c: c, d: d, ust: ust, today: today, find: find, done: done, verdict: rd ? String(rd.werdykt || '') : '', planDays: planDays, busy: agBusyDays_(d),
    taper: /^\d{4}-\d{2}-\d{2}$/.test(start) ? [agAddDays_(start, -7), start] : null, ogr: String(row[AG_COL.ogr] || '') };
}

const AGENT_FNS = {   // po jednej nazwie w linii, alfabetycznie; nazwy dla bota (OpenAPI: /exec/<nazwa>)
  ciezarNaDzis: (x, a) => agCiezar_(x.d, { week: a.tydzien, day: a.jednostka, today: x.today, done: x.done, verdict: x.verdict, olyCeil: x.c.olyCeil }),
  cwiczenia: (x, a) => { const q = agTxt_(a.q || a.nazwa, 80); if (!q) throw new Error('Podaj nazwę (q).');
    const hit = x.find(q), f = agFold_(q), more = exNames_(cwRowsCached_()).filter(r => agFold_(r[0] + ' ' + r[3]).indexOf(f) >= 0).slice(0, 10).map(r => r[0]);
    return { pasuje: hit, podobne: more.filter(n => n !== hit) }; },
  historia: (x, a) => agHistoria_(x.d, { today: x.today, days: a.dni }),
  plan: (x, a) => agPlan_(x.d, { today: x.today, days: a.dni, done: x.done, version: agZasady_().at }),
  zapiszSerie: null,
  zapiszTrening: null,
  zaproponuj: null,
  zasady: x => { const z = agZasady_(); return { wersja: z.at, zasady_trenera: z.tekst, ograniczenia_klienta: x.ogr,
    limity: z.limity, klient: { imie: x.c.name, zamiana: x.c.swap || 'NIE', skala: x.c.scale, wlasne_treningi: x.c.own } }; },
  zglos: null,
};
const AG_WRITE = { zapiszSerie: 'zapisy', zapiszTrening: 'zapisy' }, AG_PROP = { zaproponuj: 'propozycje' };

/** Wejście z doPost: klucz API → klient → akcja (z limitami i dziennikiem). */
function agentDo_(fn, key, a) {
  key = String(key || '').trim(); fn = String(fn || '').replace(/^\/+|\/+$/g, '');
  if (!agKeyOk_(key)) throw new Error('Brak dostępu.');
  const rows = klRows_(klSheet_()), i = agFindRow_(rows, agHash_(key));
  if (i < 0) throw new Error('Brak dostępu.');
  const row = rows[i], id = String(row[1]).trim().toLowerCase(), ust = agUst_(row[AG_COL.ust], true);
  if (!ust.on) throw new Error('API wyłączone przez trenera.');
  if (!Object.prototype.hasOwnProperty.call(AGENT_FNS, fn)) { agLog_(id, fn, false, 'nieznana akcja'); throw new Error('Nieznana akcja: ' + fn + '. Dostępne: ' + Object.keys(AGENT_FNS).join(', ') + '.'); }
  try {
    if (AG_WRITE[fn] && !ust.write) throw new Error('Zapis wyłączony przez trenera.');
    if (AG_PROP[fn] && !ust.prop) throw new Error('Propozycje wyłączone przez trenera.');
    if (!AG_WRITE[fn] && !AG_PROP[fn] && fn !== 'zglos' && !ust.read) throw new Error('Odczyt wyłączony przez trenera.');
    agCount_(id, 'zapytania', ust.limit);
    const lim = agZasady_().limity;
    if (AG_WRITE[fn]) agCount_(id, 'zapisy', lim.zapisy);
    if (AG_PROP[fn]) agCount_(id, 'propozycje', lim.propozycje);
    if (fn === 'zglos') agCount_(id, 'zgloszenia', lim.zgloszenia);
    const x = agCtx_(row);
    const res = AGENT_FNS[fn] ? AGENT_FNS[fn](x, a || {}) : agWrite_(fn, x, a || {}, lim);
    if (res && res.error) throw new Error(res.error);
    agLog_(id, fn, true, '');
    return res;
  } catch (e) { agLog_(id, fn, false, e && e.message || e); throw e; }
}

/** GET /exec/<akcja>?api=…&dni=… : tylko akcje odczytu (zapis wyłącznie przez POST). */
function agentGet_(e) {
  let out;
  try {
    const fn = String(e.pathInfo || e.parameter.fn || '');
    if (!AGENT_FNS[fn]) throw new Error('GET tylko dla odczytu: ' + Object.keys(AGENT_FNS).filter(k => AGENT_FNS[k]).join(', ') + '. Zapis przez POST.');
    const a = Object.assign({}, e.parameter); delete a.api; delete a.fn;
    out = { ok: true, result: agentDo_(fn, e.parameter.api, a) };
  } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Akcje z zapisem do arkusza. dry = próba z czatu w panelu: te same reguły, bez zapisu. */
function agWrite_(fn, x, a, lim, dry) {
  const PR = 'próba: nic nie zapisano';
  const c = x.c;
  if (fn === 'zapiszSerie') {
    const id = [c.id, a.tydzien, agTxt_(a.jednostka, 20), a.nr, agTxt_(a.seria, 4).toUpperCase()].join('|');
    const old = (x.d.logs || []).find(l => String(l.id) === id);
    const r = agSet_(a, x.d, { today: x.today, old: old });
    if (r.error) return r;
    if (!dry) logSet(c.key, r.set);
    return { zapisano: dry ? PR : id, uwaga: r.ponad ? 'Ciężar ponad plan: trener zobaczy to w podsumowaniu.' : r.set.rpe === '' && !r.set.typ && !/^R/.test(String(r.set.set)) ? 'Seria bez oceny: zapytaj klienta o światło (reguła 1.7).' : '' };
  }
  if (fn === 'zapiszTrening') {
    if (!c.own) return agErr_('Własne treningi są wyłączone przez trenera.');
    const r = agTrening_(a, x.d, { today: x.today, find: x.find, busy: x.busy, taper: x.taper });
    if (r.error) return r;
    if (dry) return { zapisano: PR, jednostka: { tydzien: r.unit.week, jednostka: r.unit.day, data: r.unit.date }, cwiczenia: r.exercises.map(e => e.name), serie: r.exercises.reduce((n, e) => n + e.sets.length, 0) };
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try { const res = ownRows_(c.id, r.unit, tableOf_('Plan'), false); if (res.error) return { error: res.error }; ownWrite_(c.id, r.unit.week, r.unit.day, res.rows); }
    finally { lock.releaseLock(); }
    r.exercises.forEach((e, i) => e.sets.forEach((s, j) => logSet(c.key, { week: r.unit.week, day: r.unit.day, order: i + 1, set: j + 1, date: r.unit.date, name: e.name,
      kg: s.kg, reps: s.reps, rpe: s.rpe, done: !s.typ, typ: s.typ })));
    logSession(c.key, r.session);
    cellSet_('Sesje', SES_HEADERS, [c.id, r.unit.week, r.unit.day].join('|'), 'prowadzil', 'agent');
    return { zapisano: { tydzien: r.unit.week, jednostka: r.unit.day, data: r.unit.date }, serie: r.exercises.reduce((n, e) => n + e.sets.length, 0) };
  }
  if (fn === 'zaproponuj') {
    const r = agProp_(a, x.d, { today: x.today, done: x.done, find: x.find, taper: x.taper, busy: x.busy, planDays: x.planDays, limity: lim,
      ciezar: (w, dd) => agCiezar_(x.d, { week: w, day: dd, today: x.today, done: x.done, verdict: x.verdict, olyCeil: c.olyCeil }) });
    if (dry) return r.status === 'odrzucona' ? { error: 'Odrzucone: ' + r.uwaga } : { zapisano: PR, status: 'czekałaby na trenera', typ: r.typ, tresc: r.tresc };
    const id = c.id + '|p|' + Date.now();
    sheet_('Propozycje', PROP_HEADERS).appendRow(plainRow_([id, new Date(), c.id, 'api', r.typ, r.tydzien, r.jednostka, r.nr, r.cwiczenie, r.tresc, r.powod, r.status, r.uwaga, '', '']));
    if (r.status === 'odrzucona') return { error: 'Odrzucone: ' + r.uwaga };
    return { id: id, status: 'czeka na trenera', info: 'Trener zobaczy propozycję w panelu. Do decyzji plan zostaje bez zmian.' };
  }
  if (fn === 'zglos') {
    const z = agZglos_(a, x.today);
    if (z.error) return z;
    if (dry) return { zapisano: PR, typ: z.typ, opis: z.opis };
    const id = c.id + '|z|' + Date.now();
    sheet_('Propozycje', PROP_HEADERS).appendRow(plainRow_([id, new Date(), c.id, 'api', z.typ, '', '', '', '', '', z.opis, 'czeka', '', '', '']));
    if (z.stan) { const rows = stanRows_(c.id, [z.stan], new Date(), x.today); if (rows.length) upsert_('Stan', STAN_HEADERS, rows[0][0], rows[0]); }
    return { id: id, info: z.typ === 'zgloszenie:czerwona_flaga' ? 'Przerwij trening. Trener dostał pilne zgłoszenie; przy czerwonej fladze od razu fizjoterapeuta albo ortopeda (reguła 6.1).' : 'Trener dostał zgłoszenie i zdecyduje.' };
  }
  throw new Error('Nieznana akcja: ' + fn);
}

/* ---------- panel trenera ---------- */
/** Ustawienia API klienta dla panelu (bez klucza; dziennik: 10 ostatnich zapytań, dziś). */
function trAgent(id) {
  id = String(id || '').trim().toLowerCase();
  const rows = klRows_(klSheet_()), r = rows.find(x => String(x[1]).trim().toLowerCase() === id);
  if (!r) throw new Error('Nie ma klienta „' + id + '”.');
  const has = /^[0-9a-f]{64}$/.test(String(r[AG_COL.hash] || '').trim()), u = agUst_(r[AG_COL.ust], has);
  const log = tableOf_('API').filter(l => String(l.klient).toLowerCase() === id), t = today_();
  const at = v => v instanceof Date ? v.toISOString() : String(v || '');
  return Object.assign(u, { has: has, ogr: String(r[AG_COL.ogr] || ''), dzis: log.filter(l => at(l.czas).slice(0, 10) === t).length,
    dziennik: log.slice(-10).reverse().map(l => ({ at: at(l.czas), fn: String(l.akcja), ok: String(l.wynik) === 'ok', why: String(l.powod || '') })) });
}

/** Czysta: ustawienia API z panelu → {ust, ogr} albo {error}. */
function trAgentVals_(f, old) {
  f = f || {};
  const lim = Math.round(Number(f.limit)), ogr = String(f.ogr === undefined || f.ogr === null ? '' : f.ogr).replace(/\r\n/g, '\n').trim();
  if (!(lim >= 10 && lim <= AG_LIMIT_MAX)) return { error: 'Limit zapytań: 10–' + AG_LIMIT_MAX + ' na dzień.' };
  if (ogr.length > AG_OGR_MAX) return { error: 'Ograniczenia klienta: najwyżej ' + AG_OGR_MAX + ' znaków.' };
  return { ust: { on: !!(old && old.on), read: f.read !== false, write: f.write !== false, prop: f.prop !== false, limit: lim, at: old ? old.at : '', end: old ? old.end : '' }, ogr: ogr };
}
function agRowSet_(id, fnRow) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = klSheet_(), rows = klRows_(sh), i = rows.findIndex(r => String(r[1]).trim().toLowerCase() === id);
    if (!id || i < 0) throw new Error('Nie ma klienta „' + id + '”.');
    const r = rows[i].slice(); while (r.length <= AG_COL.ogr) r.push('');
    const out = fnRow(r);
    sh.getRange(i + 2, AG_COL.hash + 1, 1, 3).setValues(plainRows_([[r[AG_COL.hash], r[AG_COL.ust], r[AG_COL.ogr]]]));
    return out;
  } finally { lock.releaseLock(); }
}
/** Zapis ustawień API klienta (uprawnienia, limit, ograniczenia). */
function trAgentUstaw(id, f) {
  id = String(id || '').trim().toLowerCase();
  agRowSet_(id, r => {
    const has = /^[0-9a-f]{64}$/.test(String(r[AG_COL.hash] || '').trim()), v = trAgentVals_(f, agUst_(r[AG_COL.ust], has));
    if (v.error) throw new Error(v.error);
    r[AG_COL.ust] = JSON.stringify(v.ust); r[AG_COL.ogr] = v.ogr;
  });
  return trAgent(id);
}
/** Klucz API: „nowy” (stary przestaje działać; pełny klucz tylko w tej odpowiedzi) albo „wylacz”. */
function trAgentKlucz(id, mode) {
  id = String(id || '').trim().toLowerCase();
  let key = '';
  agRowSet_(id, r => {
    const u = agUst_(r[AG_COL.ust], true);
    if (mode === 'nowy') {
      key = 'sz_' + Utilities.getUuid().replace(/-/g, '').toLowerCase();
      r[AG_COL.hash] = agHash_(key);
      r[AG_COL.ust] = JSON.stringify(Object.assign({}, u, { on: true, at: new Date().toISOString(), end: key.slice(-4) }));
    } else if (mode === 'wylacz') {
      r[AG_COL.hash] = ''; r[AG_COL.ust] = JSON.stringify(Object.assign({}, u, { on: false, end: '' }));
    } else throw new Error('Nieznana operacja.');
  });
  return Object.assign(trAgent(id), key ? { key: key } : {});
}

/** Czysta: zasady z panelu → {tekst, limity} albo {error}. Sekcja 5 (dane klientów) nie należy do zasad ogólnych. */
function trZasadyVals_(tekst, limity) {
  const t = String(tekst === undefined || tekst === null ? '' : tekst).replace(/\r\n/g, '\n').trim();
  if (t.length > AG_TEKST_MAX) return { error: 'Zasady: najwyżej ' + AG_TEKST_MAX + ' znaków.' };
  if (/^#{1,3}\s*5\.\s*Ograniczenia per klient/im.test(t)) return { error: 'Usuń sekcję 5 (ograniczenia per klient): ten tekst dostaje bot każdego klienta. Część klienta wklej w jego ustawieniach.' };
  const l = agLimity_(JSON.stringify(limity || {}));
  return { tekst: t, limity: l };
}
function trZasady() { return agZasady_(); }
function trZasadyUstaw(tekst, limity) {
  const v = trZasadyVals_(tekst, limity);
  if (v.error) throw new Error(v.error);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = sheet_('Zasady_AI', ZASADY_HEADERS), now = new Date();
    if (sh.getLastRow() < 1) sh.appendRow(plainRow_(ZASADY_HEADERS));
    sh.getRange(1, 1, 1, 3).setValues(plainRows_([ZASADY_HEADERS]));
    sh.getRange(2, 1, 2, 3).setValues(plainRows_([['tekst', v.tekst, now], ['limity', JSON.stringify(v.limity), now]]));
  } finally { lock.releaseLock(); }
  return agZasady_();
}

/* ---------- czat „Wypróbuj asystenta” w panelu (trAsystent): trener rozmawia jak klient ----------
 * Te same akcje i reguły co bot klienta, przez Claude API z kluczem panelu (CLAUDE_API_KEY, limit dzienny AI_LIMIT).
 * Domyślnie próba: zapisy przechodzą przez reguły, ale nic nie trafia do arkusza (agWrite_ z dry). */
const AG_CHAT_MAX = 20, AG_CHAT_TXT = 2000, AG_CHAT_KROKI = 5, AG_CHAT_CZAS = 240000;
// Akcje dla modelu: te same nazwy, opisy i pola co lib AG_READ + AG_WRITE (test pilnuje zgodności)
const AG_TOOLS = [
  ['zasady', 'Zasady trenera, ograniczenia tego klienta i limity. Pobierz na początku rozmowy.', {}],
  ['plan', 'Plan na najbliższe dni: jednostki, ćwiczenia, serie, kg, RPE max, notatki trenera dla klienta.', { dni: ['integer', 'Ile dni do przodu (1–31, domyślnie 14)'] }],
  ['historia', 'Zapisane serie z ostatnich dni (bez bólu i dyspozycji).', { dni: ['integer', 'Ile dni wstecz (1–90, domyślnie 30)'] }],
  ['ciezarNaDzis', 'Ciężar i sufit na dziś wg zasad trenera (reguła 1.9, sufit w bojach). Nie licz ciężaru sam.', { tydzien: ['integer', 'Tydzień z planu (puste = najbliższa jednostka)'], jednostka: ['string', 'Jednostka z planu'] }],
  ['cwiczenia', 'Szukaj ćwiczenia w bazie trenera (nazwy do zapisu i propozycji).', { q: ['string', 'Nazwa albo jej część'] }],
  ['zapiszSerie', 'Zapisz jedną serię ćwiczenia z planu.', { tydzien: ['integer'], jednostka: ['string'], nr: ['integer', 'Numer ćwiczenia z planu'], seria: ['string', '1, 2… robocze, R1… rozgrzewka, D1… drop set'],
    kg: ['number'], powt: ['integer', 'Powtórzenia (sekundy przy ćwiczeniu na czas)'], swiatlo: ['string', 'zielone / żółte / czerwone / nieudana albo RPE 5–10; puste = bez oceny'] }, ['tydzien', 'jednostka', 'nr', 'seria']],
  ['zapiszTrening', 'Zapisz własny trening klienta poza planem (dziś albo do 7 dni wstecz, ćwiczenia tylko z bazy).', { data: ['string', 'RRRR-MM-DD'], tytul: ['string'], rpe_sesji: ['number'], czas_min: ['integer'], uwagi: ['string'],
    cwiczenia: ['array', 'Lista {nazwa, serie: [{kg, powt, swiatlo}]}'] }, ['cwiczenia']],
  ['zaproponuj', 'Propozycja zmiany planu do akceptacji trenera. Do decyzji plan zostaje bez zmian.', { typ: ['string', 'zamiana / ciezar / serie / trening'], tydzien: ['integer'], jednostka: ['string'], nr: ['integer'],
    na: ['string', 'Zamiennik (typ zamiana)'], kg: ['number', 'Nowy ciężar (typ ciezar)'], serie: ['integer', 'Nowa liczba serii (typ serie)'], data: ['string', 'Dzień dodatkowego treningu (typ trening)'], opis: ['string'], powod: ['string', 'Powód od klienta'] }, ['typ', 'powod']],
  ['zglos', 'Zgłoszenie do trenera (ból, czerwona flaga, pytanie o plan, dietę, cel…).', { temat: ['string', 'czerwona_flaga / bol / plan / ciezar / status / fail / pominiete / dieta / cel / zawody / inne'], opis: ['string'],
    miejsce: ['string', 'Przy bólu: miejsce'], strona: ['string', 'L / P'], ocena: ['integer', 'Przy bólu: 0–10'] }, ['temat', 'opis']]
];

/** Czysta: akcje → narzędzia Messages API. */
function agTools_() {
  return AG_TOOLS.map(([n, d, p, req]) => {
    const props = {};
    Object.keys(p).forEach(k => { const [t, ds] = p[k];
      props[k] = Object.assign(t === 'array' ? { type: 'array', items: { type: 'object' } } : { type: t }, ds ? { description: ds } : {}); });
    return { name: n, description: d, input_schema: { type: 'object', properties: props, required: req || [] } };
  });
}

/** Czysta: instrukcja systemowa czatu próbnego. o = {zasady, ogr, today, real}. Bez imienia klienta. */
function agChatSystem_(o) {
  o = o || {};
  return [
    'Jesteś asystentem treningowym klienta w aplikacji trenera Damiana (Siła z Ruchu). Mówisz jak trener: krótko, po polsku, konkretnie. Dziś jest ' + o.today + '.',
    'To rozmowa próbna: trener pisze jako klient i sprawdza, jak się zachowasz. Odpowiadaj dokładnie tak, jak odpowiedziałbyś klientowi.',
    o.real ? 'Zapisy są prawdziwe: trafiają do arkusza trenera.' : 'Akcje zapisu (zapiszSerie, zapiszTrening, zaproponuj, zglos) działają w trybie próby: serwer sprawdza je regułami, ale nic nie zapisuje i trener nic nie dostaje. Gdy akcja przeszła, dopisz „(próba: nie zapisano)”, np. „Zgłosiłbym to trenerowi (próba: nie zapisano)”; gdy serwer odmówił, podaj powód.',
    'Zasady trenera i ograniczenia klienta masz poniżej. Plan sprawdzaj akcją „plan”, ciężar na dziś akcją „ciezarNaDzis” (nie licz go sam).',
    'Planu nie zmieniasz: zmiany idą przez „zaproponuj” i czekają na trenera. Ból, czerwone flagi i sprawy, o których decyduje trener, zgłaszasz akcją „zglos”.',
    'Każdą serię oceniaj światłem (zielone / żółte / czerwone / nieudana). Bez oceny zapytaj klienta, nie zgaduj.',
    'Gdy serwer odmówi, powiedz klientowi powód (numer reguły) i nie próbuj obejść go inną akcją.',
    'Nie diagnozujesz i nie leczysz. Przy czerwonej fladze: przerwij trening, zgłoś („zglos”, temat czerwona_flaga) i odeślij do specjalisty.',
    'Zgłoszenie („zglos”) robisz najwyżej raz na sprawę: jedno wywołanie z całym opisem. Nie zgłaszasz ponownie tego, co już zgłosiłeś w tej rozmowie (patrz „Wykonane akcje” w Twoich wcześniejszych odpowiedziach), i nie zgłaszasz zwykłych informacji o treningu.',
    'Odpowiadaj krótko: najwyżej 4 zdania, bez powtarzania zasad. Wywołuj tylko akcje potrzebne do odpowiedzi.',
    '',
    '## Zasady trenera',
    String(o.zasady || '').trim() || '(Trener nie wkleił jeszcze zasad. Trzymaj się powyższych reguł i planu.)',
    '',
    '## Ograniczenia tego klienta',
    String(o.ogr || '').trim() || '(brak)'
  ].join('\n');
}

/** Czysta: historia czatu z panelu [{role, text}] → messages albo {error}. Zaczyna i kończy się klientem, role na zmianę. */
function agChatMsgs_(list) {
  if (!Array.isArray(list) || !list.length) return { error: 'Napisz wiadomość.' };
  const acts = x => x && x.role === 'assistant' && Array.isArray(x.steps) && x.steps.length   // co asystent już zrobił (np. zgłoszenie): bez tego zgłasza to samo przy każdej wiadomości
    ? '\n\n(Wykonane akcje: ' + x.steps.slice(0, 10).map(s => agTxt_(s && s.fn, 20) + (s && s.ok ? ' ✓' : ' ✕')).join(', ') + ')' : '';
  const m = list.slice(-AG_CHAT_MAX).map(x => ({ role: x && x.role === 'assistant' ? 'assistant' : 'user', content: (String(x && x.text || '').replace(/\r\n/g, '\n').trim().slice(0, AG_CHAT_TXT) + acts(x)).trim() }))
    .filter(x => x.content);
  while (m.length && m[0].role !== 'user') m.shift();
  if (!m.length || m[m.length - 1].role !== 'user') return { error: 'Napisz wiadomość.' };
  const out = [];
  m.forEach(x => { const last = out[out.length - 1]; if (last && last.role === x.role) last.content += '\n\n' + x.content; else out.push(x); });
  return { msgs: out };
}

/** Czysta: krótki opis kroku (akcja + pola) do pokazania pod odpowiedzią. */
function agStep_(fn, a, r) {
  const args = Object.keys(a || {}).filter(k => a[k] !== '' && a[k] !== null && a[k] !== undefined)
    .map(k => k + ': ' + (typeof a[k] === 'object' ? JSON.stringify(a[k]) : String(a[k]))).join(', ');
  return { fn: String(fn), args: args.slice(0, 160), ok: !(r && r.error), info: r && r.error ? String(r.error).slice(0, 200) : '' };
}

/**
 * Pętla narzędzi (czysta, z wstrzykniętym send i run): send(req) → odpowiedź Messages API, run(fn, args) → wynik akcji.
 * Odpowiedź modelu wraca do historii w całości (z blokami myślenia). → {text, steps, usage: [], model, refusal, cut}
 */
function agChatLoop_(req, send, run, max) {
  const msgs = req.messages.slice(), steps = [], usage = [];
  let model = req.model;
  for (let i = 0; i < (max || AG_CHAT_KROKI); i++) {
    const j = send(Object.assign({}, req, { messages: msgs })) || {};
    usage.push(j.usage || {}); model = j.model || model;
    const content = j.content || [], text = content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (j.stop_reason === 'refusal') return { text: text, steps: steps, usage: usage, model: model, refusal: true };
    const uses = content.filter(b => b.type === 'tool_use');
    if (j.stop_reason !== 'tool_use' || !uses.length) return { text: text, steps: steps, usage: usage, model: model };
    msgs.push({ role: 'assistant', content: content });
    msgs.push({ role: 'user', content: uses.map(u => {
      let r;
      try { r = run(u.name, u.input || {}); } catch (e) { r = { error: String(e && e.message || e) }; }
      if (r === undefined || r === null) r = {};
      steps.push(agStep_(u.name, u.input, r));
      return Object.assign({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(r).slice(0, 30000) }, r.error ? { is_error: true } : {});
    }) });
  }
  return { text: '', steps: steps, usage: usage, model: model, cut: true };
}

/** Jedna akcja w czacie: uprawnienia z ustawień API klienta jak u bota, zapis tylko przy real. */
function agChatTool_(fn, x, a, lim, real) {
  if (!Object.prototype.hasOwnProperty.call(AGENT_FNS, fn)) return agErr_('Nieznana akcja: ' + fn + '.');
  const u = x.ust;
  if (AG_WRITE[fn] && !u.write) return agErr_('Zapis wyłączony przez trenera.');
  if (AG_PROP[fn] && !u.prop) return agErr_('Propozycje wyłączone przez trenera.');
  if (!AG_WRITE[fn] && !AG_PROP[fn] && fn !== 'zglos' && !u.read) return agErr_('Odczyt wyłączony przez trenera.');
  if (fn === 'zasady') { const r = AGENT_FNS.zasady(x, a); delete r.klient.imie; return r; }
  return AGENT_FNS[fn] ? AGENT_FNS[fn](x, a) : agWrite_(fn, x, a, lim, !real);
}

/** Panel: wiadomość od „klienta” w czacie próbnym → {text, steps, cost, n, limit, real}. msgs = [{role: user|assistant, text}], opt = {real}. */
function trAsystent(id, msgs, opt) {
  id = String(id || '').trim().toLowerCase();
  const row = klRows_(klSheet_()).find(r => String(r[1]).trim().toLowerCase() === id);
  if (!row) throw new Error('Nie ma klienta „' + id + '”.');
  const m = agChatMsgs_(msgs);
  if (m.error) throw new Error(m.error);
  const real = !!(opt && opt.real), pre = aiPre_(), x = agCtx_(row), z = agZasady_(), t0 = Date.now();
  const req = { model: AI_MODEL, max_tokens: 4000, system: agChatSystem_({ zasady: z.tekst, ogr: x.ogr, today: x.today, real: real }), tools: agTools_(),
    messages: m.msgs, output_config: { effort: 'low' }, fallbacks: 'default', cache_control: { type: 'ephemeral' } };   // zasady i narzędzia z pamięci podręcznej w kolejnych krokach (ok. 10% ceny)
  let zgl = 0;
  const out = agChatLoop_(req, r => {
    if (Date.now() - t0 > AG_CHAT_CZAS) throw new Error('Asystent pracował za długo (limit czasu skryptu Google). Zadaj prostsze pytanie.');
    return aiFetch_(pre.key, r);
  }, (fn, a) => {
    if (fn === 'zglos' && ++zgl > 1) return agErr_('Zgłoszenie już poszło w tej odpowiedzi: jedno na sprawę.');
    const r = agChatTool_(fn, x, a, z.limity, real);
    if (real && (AG_WRITE[fn] || AG_PROP[fn] || fn === 'zglos')) agLog_(id, 'czat:' + fn, !(r && r.error), r && r.error || '');
    return r;
  }, AG_CHAT_KROKI);
  const cost = Math.round(out.usage.reduce((s, u) => s + aiCost_(out.model, u), 0) * 10000) / 10000;
  const tok = out.usage.reduce((s, u) => ({ input_tokens: s.input_tokens + (Number(u.input_tokens) || 0) + (Number(u.cache_creation_input_tokens) || 0) + (Number(u.cache_read_input_tokens) || 0), output_tokens: s.output_tokens + (Number(u.output_tokens) || 0) }), { input_tokens: 0, output_tokens: 0 });
  const n = aiNote_(pre, ['asystent' + (real ? '' : ' (próba)'), id, '', ''], out.model, tok, cost);
  const text = out.refusal ? 'Asystent odmówił odpowiedzi na to pytanie (filtr bezpieczeństwa Claude).' : out.cut ? 'Asystent zrobił ' + out.steps.length + ' kroków i nie skończył. Zadaj prostsze pytanie.' : out.text || '(pusta odpowiedź)';
  return { text: text, steps: out.steps, cost: cost, n: n, limit: pre.limit, real: real };
}
