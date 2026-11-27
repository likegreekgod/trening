/**
 * Narzędzia MCP „Siła z Ruchu – trener” (D1, 27.11.2026): definicje dla Claude i przekład na funkcje panelu (TR_FNS w Apps Script).
 * Czyste funkcje bez Cloudflare: testy w test/tools.test.js. `api(fn, ...args)` woła /exec z biletem trenera (src/index.js).
 * Odpowiedzi są skracane (bez linków z kluczami klientów, bez ścieżek VBT), żeby Claude dostawał tylko to, co potrzebne do decyzji.
 */

import { UI_DZIS } from './ui.js';

const ST_DZIS = { wait: 'czeka', live: 'w trakcie', done: 'zrobione' };
const SEKCJA = { R: 'Rozgrzewka', G: 'Główne', K: 'Korekcyjne' };   // kolumna Planu `sekcja` (litera), jak SEKCJE w Code.gs
const ST_KAL = { wait: 'zaplanowana', live: 'w trakcie', done: 'zrobiona', late: 'zaległa' };
export const ZAPIS = ['trJednostka', 'trKomentarz', 'trPlan', 'trPropozycja', 'trPrzesun'];   // zapisy: serwer wpisuje je do zakładki API

const s = v => (v === undefined || v === null ? '' : String(v)).trim();
const num = v => { const x = typeof v === 'number' ? v : parseFloat(s(v).replace(',', '.')); return isFinite(x) ? x : null; };
const d10 = v => s(v).slice(0, 10);
const nz = o => { Object.keys(o).forEach(k => { const v = o[k]; if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)) delete o[k]; }); return o; };

/** Światło z RPE (jak w aplikacji, lib `lightOf`): ≤ 7,5 🟢, 8–8,5 🟡, ≥ 9 🔴, FAIL ✖, puste = bez oceny. */
export function light(rpe, typ) {
  if (/FAIL/.test(s(typ))) return '✖';
  const r = num(rpe);
  if (r === null) return '';
  return r <= 7.5 ? '🟢' : r < 9 ? '🟡' : '🔴';
}

/** Seria w skrócie: „80×5 🟢”, „BW×10”, „pominięte (powód)”. */
export function setTxt(l) {
  if (s(l.seria) === '0') return 'pominięte' + (s(l.uwagi) ? ' (' + s(l.uwagi) + ')' : '');
  const kg = s(l.kg), reps = s(l.powt), done = s(l.wykonane) === 'TAK' || /FAIL/.test(s(l.typ));
  const base = (kg ? kg + '×' : '') + (reps || '?');
  const tag = /^D/.test(s(l.seria)) || /DROP/.test(s(l.typ)) ? ' drop' : '';
  return (base + tag + (light(l.rpe, l.typ) ? ' ' + light(l.rpe, l.typ) : '') + (done ? '' : ' (nieodhaczona)')).trim();
}

/** Ekran Dziś: kto trenuje, skrzynka, asystent AI. p = wynik trPulpit. */
export function dzis(p) {
  p = p || {};
  const clients = p.clients || [];
  return nz({
    dzien: p.today, dane_przeliczone: p.at,
    trenuja_dzis: (p.dzis || []).map(u => nz({ klient: u.name, id: u.id, tydzien: u.week, jednostka: u.day, tytul: u.title, stan: ST_DZIS[u.st] || u.st,
      serie: u.done + '/' + u.sets, rpe_sesji: u.rpe, min: u.min })),
    sygnaly: clients.filter(c => (c.signals || []).length).map(c => ({ klient: c.name, id: c.id,
      sygnaly: c.signals.map(x => (x.lv === 'bad' ? '🔴 ' : '🟠 ') + x.t) })),
    asystent_czeka: (p.agent || []).map(a => nz({ pid: a.pid, klient: a.name, data: a.at, rodzaj: a.zgl ? 'zgłoszenie' : 'propozycja', pilne: a.pilne || '',
      co: a.text, powod_klienta: a.why })),
    asystent_zrobil_sam: (p.agentAuto || []).map(a => nz({ pid: a.pid, klient: a.name, kiedy: d10(a.at), co: a.text, powod_klienta: a.why })),
    filmy_bez_komentarza: clients.filter(c => c.filmsNew > 0).map(c => ({ klient: c.name, id: c.id, ile: c.filmsNew })),
    bloki_do_zamkniecia: (p.blocks || []).map(b => ({ klient: b.name, id: b.id, blok: b.block, koniec: b.to })),
    odpowiedzi_klientow: (p.replies || []).slice(0, 10).map(r => nz({ klient: r.name, id: r.id, data: r.at, do: r.title, komentarz_trenera: r.kom, odpowiedz: r.text })),
    dysk: p.dysk && p.dysk.low ? 'Mało miejsca na Dysku: ' + Math.round((p.dysk.free || 0) / 1e9 * 10) / 10 + ' GB wolnego' : '',
  });
}

/** Lista aktywnych klientów z sygnałami (z Przeglądu). */
export function klienci(p) {
  return ((p && p.clients) || []).map(c => nz({ id: c.id, klient: c.name, pilnosc: c.urg, sygnaly: (c.signals || []).map(x => (x.lv === 'bad' ? '🔴 ' : '🟠 ') + x.t),
    ostatni_trening: c.last, ten_tydzien: c.week, zalegle: c.late, koniec_planu_dni: c.planLeft, status_tygodnia: c.status, uwagi_klienta: c.note,
    filmy_bez_komentarza: c.filmsNew, pakiet_zostalo: c.pkg ? c.pkg.left : null }));
}

/** Kalendarz: jednostki aktywnych klientów w zakresie dat. k = wynik trKalendarz. */
export function kalendarz(k) {
  const u = x => nz({ data: x.date, klient: x.name, id: x.id, tydzien: x.week, jednostka: x.day, tytul: x.title, blok: x.block, stan: ST_KAL[x.st] || x.st,
    wlasny: x.own || '', prowadzona: x.led || '', cwiczenia: x.ex, serie: x.done + '/' + x.sets, rpe_sesji: x.rpe, min: x.min });
  return nz({ od: k.from, do: k.to, dzis: k.today, jednostki: (k.units || []).map(u), bez_daty: (k.undated || []).map(u) });
}

const key = (w, d) => Number(w) + '|' + s(d);
/** Jednostki zrobione: wpis w Sesjach albo seria robocza z ✓ / FAIL (przybliżenie reguły `unitsDone_` bez rozróżnienia priorytetów). */
function doneSet(d) {
  const out = {};
  (d.sessions || []).forEach(x => { out[key(x.tydzien, x.jednostka)] = 1; });
  (d.logs || []).forEach(l => { if (/^\d+$/.test(s(l.seria)) && s(l.seria) !== '0' && (s(l.wykonane) === 'TAK' || /FAIL/.test(s(l.typ)))) out[key(l.tydzien, l.jednostka)] = 1; });
  return out;
}
const exRow = r => nz({ nr: r.order, cwiczenie: r.name, prio: r.prio, serie: r.sets, powt: r.reps, kg: r.kg, procent: r.pct !== null && r.pct !== undefined ? Math.round(r.pct * 1000) / 10 + '%' : '',
  rpe_max: r.rpe, uwagi: r.note, sekcja: SEKCJA[r.section] || '', obwod: r.circuit, tryb: r.mode, od_trenera_na_zywo: r.coach || '', dodane_przez_klienta: r.added || '' });

/** Wykonanie jednostki z Logu: ćwiczenia po numerze, serie w skrócie (bez rozgrzewki). */
function doneEx(logs) {
  const by = {};
  logs.filter(l => !/^R/.test(s(l.seria))).forEach(l => { (by[Number(l.nr_cw)] = by[Number(l.nr_cw)] || []).push(l); });
  return Object.keys(by).map(Number).sort((a, b) => a - b).map(n => {
    const ls = by[n].sort((a, b) => s(a.seria).localeCompare(s(b.seria), 'pl', { numeric: true })), f = ls[0];
    const any = k => (ls.find(l => s(l[k])) || {})[k];
    return nz({ nr: n, cwiczenie: s(f.cwiczenie), serie: ls.map(setTxt).join(', '), zamiana: s(any('zamiana')), uwagi_klienta: s(any('uwagi')),
      komentarz_trenera: [s(any('komentarz_trenera')), s(any('komentarz_dysk'))].filter(Boolean).join(' | ') });
  });
}
const sesTxt = x => nz({ data: d10(x.start) || d10(x.data), rpe_sesji: num(x.rpe_sesji), samopoczucie: num(x.samopoczucie), czas_min: num(x.czas_min),
  bol: s(x.bol), uwagi_klienta: s(x.uwagi), komentarz_trenera: s(x.komentarz_trenera), odpowiedz_klienta: s(x.odpowiedz_klienta), prowadzil_trener: s(x.prowadzil) === 'trener' || '' });

/** Karta klienta. d = wynik trKlient; o = {today, units (ile nadchodzących jednostek), sessions (ile ostatnich sesji)}. */
export function klient(d, o) {
  o = Object.assign({ units: 6, sessions: 5 }, o);
  const done = doneSet(d), U = {};
  (d.plan || []).forEach(r => { const k = key(r.week, r.day); (U[k] = U[k] || []).push(r); });
  const from = o.today ? new Date(Date.parse(o.today) - 14 * 864e5).toISOString().slice(0, 10) : '';
  const next = Object.keys(U).filter(k => !done[k] && !U[k].some(r => r.own) && Number(U[k][0].week) > 0)
    .map(k => U[k].sort((a, b) => a.order - b.order))
    .filter(rs => !rs[0].date || rs[0].date >= from)
    .sort((a, b) => (a[0].date || '9999').localeCompare(b[0].date || '9999') || a[0].week - b[0].week || s(a[0].day).localeCompare(s(b[0].day)))
    .slice(0, o.units)
    .map(rs => nz({ tydzien: rs[0].week, jednostka: rs[0].day, tytul: rs[0].title, data: rs[0].date, blok: rs[0].block, notatka_do_jednostki: (rs.find(r => r.unote) || {}).unote,
      cwiczenia: rs.map(exRow) }));
  const title = (w, dd) => ((U[key(w, dd)] || [])[0] || {}).title || '';
  const ses = (d.sessions || []).slice().sort((a, b) => (s(b.start) || s(b.data)).localeCompare(s(a.start) || s(a.data))).slice(0, o.sessions)
    .map(x => Object.assign({ tydzien: Number(x.tydzien), jednostka: s(x.jednostka), tytul: title(x.tydzien, x.jednostka) }, sesTxt(x),
      { cwiczenia: doneEx((d.logs || []).filter(l => key(l.tydzien, l.jednostka) === key(x.tydzien, x.jednostka))) }));
  const c = d.cfg || {};
  return nz({
    id: c.id, klient: c.name, tryb: c.simple ? 'PROSTY' : 'PRO', skala: c.scale, zamiana: c.swap || 'NIE', aktywny: c.active === false ? 'NIE' : '', masters: c.masters || '',
    nadchodzace_jednostki: next, ostatnie_sesje: ses,
    tygodnie: (d.summary || []).slice(-4).map(w => nz({ od: d10(w.week), status: w.status, powody: w.why, wykonanie: w.done, tonaz_kg: w.ton, sRPE: w.srpe, ACWR: w.acwr, serie_twarde: w.hard })),
    bloki: (d.blocks || []).slice(-3).map(b => nz({ blok: s(b.blok), od: b.od, do: b.do, wnioski_trenera: s(b.wnioski), dla_klienta: s(b.dla_klienta) })),
    pakiet: d.pkg ? nz({ kupione: d.pkg.n, zostalo: d.pkg.left, waznosc: d.pkg.to }) : '',
  });
}

/** Jedna jednostka klienta: plan i (jeśli była) wykonanie z Logu i Sesji. */
export function jednostka(d, week, day) {
  const k = key(week, day), rows = (d.plan || []).filter(r => key(r.week, r.day) === k).sort((a, b) => a.order - b.order);
  const logs = (d.logs || []).filter(l => key(l.tydzien, l.jednostka) === k), x = (d.sessions || []).find(y => key(y.tydzien, y.jednostka) === k);
  if (!rows.length && !logs.length) return { blad: 'Nie ma jednostki tydz. ' + week + ' „' + day + '” u tego klienta.' };
  const r0 = rows[0] || {};
  return nz({ klient: (d.cfg || {}).name, tydzien: Number(week), jednostka: s(day), tytul: r0.title, data: r0.date, blok: r0.block,
    zrobiona: doneSet(d)[k] ? 'tak' : 'nie', notatka_do_jednostki: (rows.find(r => r.unote) || {}).unote,
    plan: rows.map(exRow), wykonanie: doneEx(logs), sesja: x ? sesTxt(x) : '' });
}

/* ---------- definicje narzędzi ---------- */

const ID = { type: 'string', description: 'klient_id (małe litery, z narzędzia „klienci” albo „dzis”)' };
const WEEK = { type: 'integer', description: 'numer tygodnia planu' };
const DAY = { type: 'string', description: 'jednostka, np. „A”, „B”, „W1”, „T2”' };
const RO = { readOnlyHint: true, openWorldHint: false };
const RW = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const TOOLS = [
  { name: 'dzis', title: 'Dziś',
    description: 'Ekran Dziś panelu trenera: kto dziś trenuje (czeka / w trakcie / zrobione), czerwone i pomarańczowe sygnały klientów, propozycje i zgłoszenia asystentów AI klientów (z pid do decyzji), zmiany zrobione samodzielnie przez boty, filmy bez komentarza, bloki do zamknięcia, odpowiedzi klientów. Zacznij od tego, gdy trener pyta „co dziś?” albo „kto dziś trenuje?”. Trener widzi wynik jako kartę z przyciskami Zatwierdź / Odrzuć przy propozycjach asystentów, więc nie powtarzaj całej listy: podsumuj w 2–3 zdaniach, co najważniejsze.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: RO, _meta: { ui: { resourceUri: UI_DZIS } } },
  { name: 'klienci', title: 'Klienci',
    description: 'Aktywni klienci z identyfikatorami (id do innych narzędzi), sygnałami, ostatnim treningiem, wykonaniem tygodnia i końcem planu. Najpilniejsi pierwsi.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: RO },
  { name: 'kalendarz', title: 'Kalendarz',
    description: 'Jednostki wszystkich aktywnych klientów w zakresie dat (najwyżej 62 dni): dzień, stan (zaplanowana / w trakcie / zrobiona / zaległa), serie; plus najbliższe jednostki bez daty.',
    inputSchema: { type: 'object', properties: { od: { type: 'string', description: 'RRRR-MM-DD' }, do: { type: 'string', description: 'RRRR-MM-DD' } }, required: ['od', 'do'], additionalProperties: false },
    annotations: RO },
  { name: 'klient', title: 'Karta klienta',
    description: 'Karta klienta: ustawienia, najbliższe niezrobione jednostki z ćwiczeniami (serie, powt., kg, %, RPE max), ostatnie sesje z wykonaniem (seria jako „kg×powt. światło”: 🟢 lekko RPE 7, 🟡 średnio 8, 🔴 ciężko 9, ✖ nieudana), tygodnie z Podsumowania, bloki, pakiet.',
    inputSchema: { type: 'object', properties: { id: ID }, required: ['id'], additionalProperties: false }, annotations: RO },
  { name: 'jednostka', title: 'Jednostka',
    description: 'Jedna jednostka klienta: plan ćwiczeń z numerami (nr do „zmien_plan”) i, jeśli zrobiona, wykonanie serii, sesja (RPE sesji, samopoczucie, ból, uwagi) i komentarze.',
    inputSchema: { type: 'object', properties: { id: ID, tydzien: WEEK, jednostka: DAY }, required: ['id', 'tydzien', 'jednostka'], additionalProperties: false }, annotations: RO },
  { name: 'przesun', title: 'Przesuń trening',
    description: 'Przenosi niezrobioną jednostkę trenera na inny dzień (to samo co przeciągnięcie w kalendarzu panelu). Zrobionej i własnego treningu klienta nie da się przesunąć.',
    inputSchema: { type: 'object', properties: { id: ID, tydzien: WEEK, jednostka: DAY, data: { type: 'string', description: 'nowy dzień RRRR-MM-DD' } }, required: ['id', 'tydzien', 'jednostka', 'data'], additionalProperties: false },
    annotations: RW },
  { name: 'zmien_plan', title: 'Zmień plan jednostki',
    description: 'Zmienia ćwiczenia w niezrobionej jednostce (jak „Edytuj” w zakładce Plan panelu): serie, powt., kg, % maksa, RPE max, uwagi, sekcja (Rozgrzewka / Główne / Korekcyjne; Rozgrzewka nie liczy się do tonażu); opcjonalnie notatka do całej jednostki i to samo w kolejnych tygodniach tej jednostki w bloku (kg i % o tę samą różnicę). Puste pole = bez zmian. Konwencje trenera: kg w dół do 2,5 kg, RPE max to sufit.',
    inputSchema: { type: 'object', properties: { id: ID, tydzien: WEEK, jednostka: DAY,
      zmiany: { type: 'array', items: { type: 'object', properties: { nr: { type: 'integer' }, serie: { type: 'integer' }, powt: { type: 'string' }, kg: { type: 'string', description: 'liczba albo BW / guma' },
        procent: { type: 'number', description: '% maksa, np. 75' }, rpe_max: { type: 'number' }, uwagi: { type: 'string' },
        sekcja: { type: 'string', enum: ['Rozgrzewka', 'Główne', 'Korekcyjne', ''], description: 'sekcja w jednostce (nagłówek grupy w aplikacji); pusta = bez sekcji' } }, required: ['nr'], additionalProperties: false } },
      notatka_do_jednostki: { type: 'string' }, kolejne_tygodnie: { type: 'boolean' } }, required: ['id', 'tydzien', 'jednostka'], additionalProperties: false },
    annotations: RW },
  { name: 'decyzja_asystent', title: 'Decyzja o propozycji asystenta',
    description: 'Decyzja trenera o wpisie od asystenta AI klienta (pid z „dzis”): „tak” = zatwierdź (plan zmienia się sam), „nie” = odrzuć z powodem (bot go dostanie), „czytane” = zgłoszenie przeczytane, „cofnij” = cofnij zmianę zrobioną samodzielnie przez bota. zasada = dopisz powód jako stałą zasadę dla tego klienta.',
    inputSchema: { type: 'object', properties: { pid: { type: 'string' }, decyzja: { type: 'string', enum: ['tak', 'nie', 'czytane', 'cofnij'] }, powod: { type: 'string' }, zasada: { type: 'boolean' } },
      required: ['pid', 'decyzja'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'komentarz_sesji', title: 'Komentarz do sesji',
    description: 'Zapisuje komentarz trenera do zrobionej jednostki (klient zobaczy go w aplikacji, w zakładce Trener). Pusty tekst usuwa komentarz. Przed zapisem pokaż trenerowi tekst, jeśli sam go nie podyktował.',
    inputSchema: { type: 'object', properties: { id: ID, tydzien: WEEK, jednostka: DAY, tekst: { type: 'string' } }, required: ['id', 'tydzien', 'jednostka', 'tekst'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
];

const need = (a, k) => { if (a[k] === undefined || a[k] === null || s(a[k]) === '') throw new Error('Brak pola „' + k + '”.'); return a[k]; };
const cid = a => s(need(a, 'id')).toLowerCase();

/** Wykonuje narzędzie. api(fn, ...args) → wynik funkcji panelu; o = {today}. Zwraca obiekt do pokazania Claude. */
export async function run(name, a, api, o) {
  a = a || {}; o = o || {};
  switch (name) {
    case 'dzis': return dzis(await api('trPulpit'));
    case 'klienci': return klienci(await api('trPulpit'));
    case 'kalendarz': return kalendarz(await api('trKalendarz', s(need(a, 'od')), s(need(a, 'do'))));
    case 'klient': return klient(await api('trKlient', cid(a)), { today: o.today });
    case 'jednostka': return jednostka(await api('trKlient', cid(a)), Number(need(a, 'tydzien')), s(need(a, 'jednostka')));
    case 'przesun': {
      const r = await api('trPrzesun', cid(a), { week: Number(need(a, 'tydzien')), day: s(need(a, 'jednostka')), date: s(need(a, 'data')) });
      return { zapisano: true, nowa_data: r.date, wierszy: r.n };
    }
    case 'zmien_plan': {
      const ex = (a.zmiany || []).map(z => { const x = nz({ order: Number(z.nr), sets: z.serie === undefined ? '' : String(z.serie), reps: z.powt === undefined ? '' : String(z.powt),
        kg: z.kg === undefined ? '' : String(z.kg), pct: z.procent === undefined ? '' : String(z.procent), rpe: z.rpe_max === undefined ? '' : String(z.rpe_max) });
        if (z.uwagi !== undefined) x.note = String(z.uwagi);              // pusty tekst = wyczyść uwagi
        if (z.sekcja !== undefined) x.section = String(z.sekcja);          // pusty = bez sekcji
        return x; });
      ex.forEach(x => { if (!x.order) throw new Error('Każda zmiana potrzebuje numeru ćwiczenia „nr”.'); });
      const e = { week: Number(need(a, 'tydzien')), day: s(need(a, 'jednostka')), ex };
      if (a.notatka_do_jednostki !== undefined) e.unote = String(a.notatka_do_jednostki);
      if (a.kolejne_tygodnie) e.next = true;
      if (!ex.length && e.unote === undefined) throw new Error('Nie ma czego zmienić: podaj „zmiany” albo „notatka_do_jednostki”.');
      const r = await api('trPlan', cid(a), e);
      return { zapisano: true, zmienionych_komorek: r.n, tygodnie: r.weeks };
    }
    case 'decyzja_asystent': {
      const mode = s(need(a, 'decyzja'));
      if (mode === 'nie' && !s(a.powod)) throw new Error('Przy odrzuceniu podaj powód: bot klienta go dostanie.');
      const r = await api('trPropozycja', s(need(a, 'pid')), { mode, why: s(a.powod), zasada: !!a.zasada && mode !== 'cofnij' });
      return Object.assign({ zapisano: true }, r && typeof r === 'object' ? { wynik: r.status || r.msg || '' } : {});
    }
    case 'komentarz_sesji': {
      await api('trKomentarz', cid(a), Number(need(a, 'tydzien')), s(need(a, 'jednostka')), String(a.tekst === undefined ? '' : a.tekst));
      return { zapisano: true };
    }
    default: throw new Error('Nieznane narzędzie: ' + name);
  }
}
