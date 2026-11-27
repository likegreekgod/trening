/**
 * Narzędzia MCP „Siła z Ruchu – trener” (D1, 27.11.2026): definicje dla Claude i przekład na funkcje panelu (TR_FNS w Apps Script).
 * Czyste funkcje bez Cloudflare: testy w test/tools.test.js. `api(fn, ...args)` woła /exec z biletem trenera (src/index.js).
 * Odpowiedzi są skracane (bez linków z kluczami klientów, bez ścieżek VBT), żeby Claude dostawał tylko to, co potrzebne do decyzji.
 */

import { UI_DZIS, UI_KLIENT, UI_FILM, UI_TOR } from './ui.js';

const ST_DZIS = { wait: 'czeka', live: 'w trakcie', done: 'zrobione' };
const SEKCJA = { R: 'Rozgrzewka', G: 'Główne', K: 'Korekcyjne' };   // kolumna Planu `sekcja` (litera), jak SEKCJE w Code.gs
const ST_KAL = { wait: 'zaplanowana', live: 'w trakcie', done: 'zrobiona', late: 'zaległa' };
export const ZAPIS = ['trJednostka', 'trKomentarz', 'trKomentarzFilm', 'trPlan', 'trPropozycja', 'trPrzesun'];   // zapisy: serwer wpisuje je do zakładki API

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

/** Lista aktywnych klientów z sygnałami (z Przeglądu). Obiekt, nie tablica: structuredContent MCP musi być obiektem. */
export function klienci(p) {
  return { klienci: ((p && p.clients) || []).map(c => nz({ id: c.id, klient: c.name, pilnosc: c.urg, sygnaly: (c.signals || []).map(x => (x.lv === 'bad' ? '🔴 ' : '🟠 ') + x.t),
    ostatni_trening: c.last, ten_tydzien: c.week, zalegle: c.late, koniec_planu_dni: c.planLeft, status_tygodnia: c.status, uwagi_klienta: c.note,
    filmy_bez_komentarza: c.filmsNew, pakiet_zostalo: c.pkg ? c.pkg.left : null })) };
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
  const k = karta(d, o.today, next, done);
  return nz({
    id: c.id, klient: c.name, naglowek: k.naglowek, sygnaly: k.sygnaly, liczby: k.liczby, sila: k.sila, tryb: c.simple ? 'PROSTY' : 'PRO', skala: c.scale, zamiana: c.swap || 'NIE', aktywny: c.active === false ? 'NIE' : '', masters: c.masters || '',
    nadchodzace_jednostki: next, ostatnie_sesje: ses,
    tygodnie: (d.summary || []).slice(-4).map(w => nz({ od: d10(w.week), status: w.status, powody: w.why, wykonanie: w.done, tonaz_kg: w.ton, sRPE: w.srpe, ACWR: w.acwr, serie_twarde: w.hard })),
    bloki: (d.blocks || []).slice(-3).map(b => nz({ blok: s(b.blok), od: b.od, do: b.do, wnioski_trenera: s(b.wnioski), dla_klienta: s(b.dla_klienta) })),
    pakiet: d.pkg ? nz({ kupione: d.pkg.n, zostalo: d.pkg.left, waznosc: d.pkg.to }) : '',
  });
}

/* ---------- karta klienta (D3): nagłówek, sygnały, liczby i siła, liczone z danych trKlient ---------- */

const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const monday = iso => { const x = new Date(iso + 'T12:00:00Z'), w = (x.getUTCDay() + 6) % 7; return addDays(iso, -w); };
const r1 = x => Math.round(x * 10) / 10;

/** e1RM jak w aplikacji (wykres Siły): Epley z RIR = 10 − RPE, seria bez RPE liczona jak RPE 10, FAIL i ponad 12 powt. pominięte. */
export function e1rm(kg, reps, rpe) {
  kg = num(kg); reps = num(reps);
  if (!kg || !reps || reps < 1 || reps > 12) return null;
  const r = num(rpe), rir = r === null ? 0 : Math.max(0, 10 - r);
  return reps + rir <= 1 ? kg : kg * (1 + (reps + rir) / 30);
}

/** Sygnały, liczby i siła do karty klienta. today = RRRR-MM-DD (strefa trenera). */
export function karta(d, today, next, done) {
  today = today || new Date().toISOString().slice(0, 10);
  const logs = d.logs || [], ses = d.sessions || [], plan = d.plan || [];
  const work = l => /^\d+$/.test(s(l.seria)) && s(l.seria) !== '0' && s(l.wykonane) === 'TAK' && !/FAIL/.test(s(l.typ));
  const sygnaly = [];
  const sum = (d.summary || []).slice(-1)[0];
  if (sum && /🔴|🟠|za dużo|uwaga/i.test(sum.status)) sygnaly.push({ lv: /🔴|za dużo/i.test(sum.status) ? 'bad' : 'warn', t: ('tydzień: ' + sum.status.replace(/^[^\p{L}]+/u, '') + (sum.why ? ' (' + sum.why + ')' : '')).slice(0, 90) });
  const from14 = addDays(today, -14), from3 = addDays(today, -3);
  const pain = [];
  ses.forEach(x => { const day = d10(x.start) || d10(x.data); if (day >= from14 && num(x.bol_max) > 3) pain.push([num(x.bol_max), s(x.bol).split(';')[0].replace(/:\s*\d+.*/, ''), day]); });
  (d.stan || []).forEach(x => { if (d10(x.data) >= from14 && num(x.ocena) > 3) pain.push([num(x.ocena), (s(x.miejsce) + ' ' + s(x.strona)).trim(), d10(x.data)]); });
  pain.sort((a, b) => b[0] - a[0] || b[2].localeCompare(a[2]));
  if (pain.length) sygnaly.push({ lv: pain[0][0] >= 6 ? 'bad' : 'warn', t: 'ból ' + (pain[0][1] ? pain[0][1] + ' ' : '') + pain[0][0] + '/10 (' + pain[0][2].slice(8, 10) + '.' + pain[0][2].slice(5, 7) + ')' });
  const rd = (d.readiness || []).filter(x => d10(x.data) >= from3 && /uwaga|zm[eę]czenie/i.test(s(x.werdykt))).sort((a, b) => d10(b.data).localeCompare(d10(a.data)))[0];
  if (rd) sygnaly.push({ lv: /zm[eę]czenie/i.test(s(rd.werdykt)) ? 'bad' : 'warn', t: 'dyspozycja: ' + s(rd.werdykt).toLowerCase() });
  const mon = monday(today), sun = addDays(mon, 6), U = {};
  plan.forEach(r => { if (!r.own && Number(r.week) > 0 && r.date >= mon && r.date <= sun) U[key(r.week, r.day)] = 1; });
  const wk = Object.keys(U), wkDone = wk.filter(x => done[x]).length;
  const last = ses.slice().sort((a, b) => (s(b.start) || s(b.data)).localeCompare(s(a.start) || s(a.data))).slice(0, 5).map(x => num(x.rpe_sesji)).filter(x => x !== null);
  const films = logs.filter(l => s(l.film_link) && !s(l.komentarz_trenera) && !s(l.komentarz_dysk) && (d10(l.data) || d10(l.zapisano)) >= addDays(today, -14)).length;
  const sm = (d.summary || []).filter(w => num(w.ton) !== null);
  const tonNow = sm.length ? num(sm[sm.length - 1].ton) : null, tonPrev = sm.length > 1 ? num(sm[sm.length - 2].ton) : null;
  const liczby = nz({ ten_tydzien: wk.length ? wkDone + '/' + wk.length : '', sr_rpe_sesji: last.length ? r1(last.reduce((a, b) => a + b, 0) / last.length) : null,
    tonaz_tydzien_t: tonNow !== null ? r1(tonNow / 1000) : null, tonaz_zmiana_proc: tonNow !== null && tonPrev ? Math.round((tonNow / tonPrev - 1) * 100) : null,
    filmy_bez_komentarza_14dni: films });
  // siła: ćwiczenia A z planu (najczęstsze w Logu), najlepsze e1RM w każdym tygodniu, 8 ostatnich punktów
  const A = {};
  plan.forEach(r => { if (s(r.prio) === 'A' && r.section !== 'R') A[s(r.name).toLowerCase()] = s(r.name); });
  const by = {};
  logs.filter(work).forEach(l => {
    const n = s(l.cwiczenie).toLowerCase(); if (!A[n]) return;
    const e = e1rm(l.kg, l.powt, l.rpe); if (e === null) return;
    const w = Number(l.tydzien); (by[n] = by[n] || { n: 0, w: {} }).n++; by[n].w[w] = Math.max(by[n].w[w] || 0, e);
  });
  const sila = Object.keys(by).sort((a, b) => by[b].n - by[a].n).slice(0, 4).map(n => {
    const ws = Object.keys(by[n].w).map(Number).sort((a, b) => a - b).slice(-8), pts = ws.map(w => Math.round(by[n].w[w] * 2) / 2);
    return { cwiczenie: A[n], e1rm_kg: pts[pts.length - 1], zmiana_kg: r1(pts[pts.length - 1] - pts[0]), tygodnie: ws, punkty: pts };
  });
  const n0 = (next || [])[0], blk = n0 && n0.blok;
  const wMax = blk ? Math.max.apply(null, plan.filter(r => r.block === blk).map(r => Number(r.week)).concat([0])) : 0;
  const c = d.cfg || {};
  const naglowek = [blk ? 'Blok ' + blk : '', n0 ? 'tydz. ' + n0.tydzien + (wMax ? ' z ' + wMax : '') : '', c.simple ? 'PROSTY' : 'PRO'].filter(Boolean).join(' · ');
  return { naglowek, sygnaly: sygnaly.map(x => (x.lv === 'bad' ? '🔴 ' : '🟠 ') + x.t), liczby, sila };
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

/* ---------- filmy (D3 część 2): lista, karta z odtwarzaczem, klatki dla Claude, komentarz ---------- */

/** Ref filmu = id wiersza Logu (klient|tydzień|jednostka|nr|seria). */
export const filmRef = v => [s(v.id).toLowerCase(), Number(v.week), s(v.day), Number(v.order), s(v.set)].join('|');
export function refParse(ref) {
  const p = s(ref).split('|');
  if (p.length !== 5 || !p[0] || !isFinite(Number(p[1])) || !p[2] || !isFinite(Number(p[3])) || !p[4]) throw new Error('Zły identyfikator filmu „' + s(ref) + '” (klient|tydzień|jednostka|nr|seria, z narzędzia „filmy”).');
  return { id: p[0], week: Number(p[1]), day: p[2], order: Number(p[3]), set: p[4] };
}
const filmTxt = v => nz({ ref: filmRef(v), klient: v.name, data: v.at, cwiczenie: v.ex, seria: v.set,
  wykonanie: setTxt({ seria: v.set, kg: v.kg, powt: v.reps, rpe: v.rpe, typ: v.typ, wykonane: 'TAK' }), zamiana: v.swap, uwagi_klienta: v.note,
  komentarz_trenera: v.komT, komentarz_z_dysku: v.komD, odpowiedz_klienta: v.rep });

/** Filmy z 14 dni (trPulpit.videos), bez linków. id = jeden klient; wszystkie = też skomentowane. */
export function filmy(p, id, wszystkie) {
  const v = ((p && p.videos) || []).filter(x => (!id || x.id === s(id).toLowerCase()) && (wszystkie || !x.kom));
  return { filmy: v.slice(0, 40).map(filmTxt), razem: v.length };
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
    description: 'Karta klienta: ustawienia, najbliższe niezrobione jednostki z ćwiczeniami (serie, powt., kg, %, RPE max), ostatnie sesje z wykonaniem (seria jako „kg×powt. światło”: 🟢 lekko RPE 7, 🟡 średnio 8, 🔴 ciężko 9, ✖ nieudana), tygodnie z Podsumowania, bloki, pakiet, sygnały (ból, dyspozycja, status tygodnia), liczby tygodnia i siła (e1RM ćwiczeń A tydzień po tygodniu). Użyj, gdy trener mówi „pokaż Olę” albo pyta o konkretnego klienta. Trener widzi wynik jako kartę klienta, więc nie przepisuj jej: odpowiedz na pytanie trenera i wskaż, co z danych za tym stoi.',
    inputSchema: { type: 'object', properties: { id: ID }, required: ['id'], additionalProperties: false }, annotations: RO, _meta: { ui: { resourceUri: UI_KLIENT } } },
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

TOOLS.push(
  { name: 'filmy', title: 'Filmy',
    description: 'Filmy serii z ostatnich 14 dni (domyślnie tylko bez komentarza trenera): ref do narzędzia „film”, klient, ćwiczenie, wykonanie serii ze światłem, uwaga klienta. Bez linków.',
    inputSchema: { type: 'object', properties: { id: Object.assign({}, ID, { description: 'klient_id; puste = wszyscy' }), wszystkie: { type: 'boolean', description: 'także skomentowane' } }, additionalProperties: false },
    annotations: RO },
  { name: 'film', title: 'Film serii',
    description: 'Otwiera film serii w karcie z odtwarzaczem (¼× / ½×, klatka po klatce). Trener zaznacza fragment i wysyła klatki do Ciebie: przyjdą jako wiadomość z „klatki_id”, wtedy wołasz „klatki”. Sam filmu nie widzisz, dopóki nie dostaniesz klatek. Komentarz trener zapisuje w karcie albo przez „komentarz_filmu”.',
    inputSchema: { type: 'object', properties: { ref: { type: 'string', description: 'ref z narzędzia „filmy” (klient|tydzień|jednostka|nr|seria)' } }, required: ['ref'], additionalProperties: false },
    annotations: RO, _meta: { ui: { resourceUri: UI_FILM } } },
  { name: 'klatki', title: 'Klatki filmu',
    description: 'Klatki wycięte przez trenera z filmu (zdjęcia w kolejności czasu, z chwilą w sekundach) i dane serii. Oceń technikę na tym, co widać (pozycja kolan, pleców, tor sztangi), i powiedz, na których klatkach. Klatki wygasają po godzinie.',
    inputSchema: { type: 'object', properties: { klatki_id: { type: 'string' } }, required: ['klatki_id'], additionalProperties: false }, annotations: RO },
  { name: 'klatki_zapisz', title: 'Zapisz klatki (karta filmu)',
    description: 'Tylko dla karty filmu: zapisuje klatki na godzinę i zwraca klatki_id.',
    inputSchema: { type: 'object', properties: { ref: { type: 'string' }, klatki: { type: 'array', maxItems: 24, items: { type: 'object', properties: { t: { type: 'number' }, jpg: { type: 'string', description: 'JPEG w base64' } }, required: ['t', 'jpg'], additionalProperties: false } } },
      required: ['ref', 'klatki'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }, _meta: { ui: { visibility: ['app'] } } },
  { name: 'komentarz_filmu', title: 'Komentarz do filmu serii',
    description: 'Zapisuje komentarz trenera do serii z filmem (klient zobaczy go w aplikacji przy filmie; „m:ss,d” na początku linii = chwila w filmie). Pusty tekst usuwa komentarz. Przed zapisem pokaż trenerowi tekst, jeśli sam go nie podyktował.',
    inputSchema: { type: 'object', properties: { ref: { type: 'string' }, tekst: { type: 'string' } }, required: ['ref', 'tekst'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
);

TOOLS.push(
  { name: 'tor', title: 'Tor sztangi i prędkość',
    description: 'Postęp prędkości i toru sztangi w jednym ćwiczeniu klienta (z analiz filmów w aplikacji i w panelu): dzień, seria, ciężar, prędkość (MCV albo v max w bojach), uniesienie, odchylenie toru od pionu startu, wnioski trenera. Karta rysuje wykres prędkości i nałożone tory. Bez nazwy ćwiczenia: lista ćwiczeń z analizą.',
    inputSchema: { type: 'object', properties: { id: ID, cwiczenie: { type: 'string', description: 'nazwa jak w planie; puste = lista ćwiczeń z analizą toru' } }, required: ['id'], additionalProperties: false },
    annotations: RO, _meta: { ui: { resourceUri: UI_TOR } } },
);

const OLY_RE = /rwani|podrzut|zarzut|snatch|clean|jerk|ciąg rwan|ciąg podrz/i;
/** Czysta: Log klienta (trKlient) → postęp prędkości i toru ćwiczenia. Tory (cm, co 2 klatki) tylko w _ui dla karty, Claude dostaje liczby. */
export function tor(d, nazwa) {
  const logs = (d.logs || []).filter(l => num(l.vbt_ms) > 0 && s(l.seria) !== '0');
  const by = {}; logs.forEach(l => { const n = s(l.cwiczenie); (by[n.toLowerCase()] = by[n.toLowerCase()] || { n, ile: 0, ost: '' }).ile++; const dd = d10(l.data); if (dd > by[n.toLowerCase()].ost) by[n.toLowerCase()].ost = dd; });
  const lista = Object.values(by).sort((a, b) => b.ost.localeCompare(a.ost)).map(x => ({ cwiczenie: x.n, analiz: x.ile, ostatnia: x.ost }));
  const head = { klient: s(d.cfg && d.cfg.name) };
  if (!s(nazwa)) return Object.assign(head, { cwiczenia: lista, uwaga: lista.length ? 'Podaj „cwiczenie”, żeby zobaczyć postęp.' : 'Klient nie ma jeszcze analizy toru z filmu.' });
  const key = s(nazwa).toLowerCase(), oly = OLY_RE.test(key);
  const rows = logs.filter(l => s(l.cwiczenie).toLowerCase() === key).map(l => {
    let p = []; try { p = JSON.parse(s(l.sciezka) || '[]'); } catch (e) { p = []; }
    p = Array.isArray(p) ? p.filter(q => Array.isArray(q) && isFinite(q[0]) && isFinite(q[1])) : [];
    const dev = p.length ? Math.max(...p.map(q => Math.abs(q[0]))) : null;
    return { l, p, dev, data: d10(l.data) || d10(l.zapisano) };
  }).sort((a, b) => a.data.localeCompare(b.data) || s(a.l.seria).localeCompare(s(b.l.seria)));
  if (!rows.length) return Object.assign(head, { cwiczenie: s(nazwa), serie: [], uwaga: 'Brak analizy toru dla tego ćwiczenia.', cwiczenia: lista });
  const serie = rows.map(r => nz({ data: r.data, tydzien: r.l.tydzien, jednostka: s(r.l.jednostka), seria: s(r.l.seria), kg: num(r.l.kg) === null ? s(r.l.kg) : num(r.l.kg), powt: s(r.l.powt),
    predkosc_ms: num(r.l.vbt_ms), szczyt_ms: num(r.l.vbt_peak), uniesienie_cm: num(r.l.wysokosc_cm), odchylenie_toru_cm: r.dev === null ? '' : Math.round(r.dev * 10) / 10,
    wnioski_trenera: s(r.l.notatka_trenera), film: s(r.l.film_link) ? 'tak' : '' }));
  const byDay = {}; rows.forEach(r => { const v = num(r.l.vbt_ms); if (!byDay[r.data] || v > byDay[r.data].v) byDay[r.data] = { data: r.data, v, kg: num(r.l.kg) }; });
  const dni = Object.values(byDay).sort((a, b) => a.data.localeCompare(b.data));
  const tory = rows.filter(r => r.p.length > 1).slice(-4).map(r => ({ data: r.data, kg: num(r.l.kg), p: r.p.filter((q, i) => i % Math.ceil(r.p.length / 60) === 0) }));
  return Object.assign(head, { cwiczenie: s(rows[rows.length - 1].l.cwiczenie), miara: oly ? 'v max (m/s), boje: szczytowa prędkość ciągu' : 'MCV (m/s), średnia prędkość koncentryczna',
    serie: serie.slice(-20), najlepsza_dnia: dni.slice(-12).map(x => nz({ data: x.data, predkosc_ms: x.v, kg: x.kg })),
    _ui: { tory, dni: dni.slice(-12), oly } });
}

export const KLATKI_MAX = 24, KLATKA_MAX = 400000;   // klatek w paczce, znaków base64 na klatkę (~300 kB)

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
    case 'tor': return tor(await api('trKlient', cid(a)), s(a.cwiczenie));
    case 'filmy': return filmy(await api('trPulpit'), a.id ? cid(a) : '', !!a.wszystkie);
    case 'film': {
      const r = refParse(need(a, 'ref')), p = await api('trPulpit');
      const v = (p.videos || []).find(x => filmRef(x) === filmRef(r));
      if (!v) throw new Error('Nie ma filmu ' + filmRef(r) + ' z ostatnich 14 dni (lista: narzędzie „filmy”).');
      if (!o.ticket) throw new Error('Odtwarzacz niedostępny.');
      const tok = await api('trFilm');
      return Object.assign(filmTxt(v), { _ui: { src: await o.ticket(v.file, tok.token) } });
    }
    case 'klatki_zapisz': {
      const ref = filmRef(refParse(need(a, 'ref'))), k = Array.isArray(a.klatki) ? a.klatki : [];
      if (!k.length || k.length > KLATKI_MAX) throw new Error('Od 1 do ' + KLATKI_MAX + ' klatek.');
      k.forEach(x => { if (typeof x.jpg !== 'string' || x.jpg.length > KLATKA_MAX || !/^[A-Za-z0-9+/=]+$/.test(x.jpg)) throw new Error('Klatka nie jest małym JPEG-iem w base64.'); });
      if (!o.store) throw new Error('Brak miejsca na klatki.');
      return { klatki_id: await o.store({ ref, klatki: k.map(x => ({ t: Math.round(Number(x.t) * 100) / 100, jpg: x.jpg })) }), ile: k.length };
    }
    case 'klatki': {
      const x = o.load ? await o.load(s(need(a, 'klatki_id'))) : null;
      if (!x) throw new Error('Te klatki wygasły (godzina). Poproś trenera, żeby wysłał je jeszcze raz z karty filmu.');
      const r = refParse(x.ref), p = await api('trPulpit'), v = (p.videos || []).find(y => filmRef(y) === x.ref);
      const head = Object.assign({ klatek: x.klatki.length, chwile_s: x.klatki.map(k => k.t) }, v ? filmTxt(v) : { ref: x.ref });
      const content = [{ type: 'text', text: JSON.stringify(head) }];
      x.klatki.forEach(k => { content.push({ type: 'text', text: 'klatka ' + String(k.t).replace('.', ',') + ' s' }); content.push({ type: 'image', data: k.jpg, mimeType: 'image/jpeg' }); });
      return { __content: content, __structured: head };
    }
    case 'komentarz_filmu': {
      const r = refParse(need(a, 'ref'));
      const x = await api('trKomentarzFilm', r.id, r.week, r.day, r.order, r.set, String(a.tekst === undefined ? '' : a.tekst));
      return { zapisano: true, tekst: x && x.text };
    }
    default: throw new Error('Nieznane narzędzie: ' + name);
  }
}
