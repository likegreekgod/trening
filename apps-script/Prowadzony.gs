/* ---------- Trening prowadzony przez Claude (pośrednik MCP, 27.11.2026, docs/zmiany/2026-11-27-trening-prowadzony.md) ----------
 * Trener prowadzi trening na żywo i dyktuje Claude ćwiczenia i wyniki. Jednostka P1, P2… (kolejne u klienta, Plan.zrodlo = „prowadzony”,
 * led_ w Code.gs) jest poza planem: nie liczy się do wykonania planu, Bloków ani zaległych, import planu jej nie rusza, a tonaż,
 * obciążenie, partie, e1RM i Postęp tak. Zapis wprost do arkusza (Plan + Log + Sesje), bez pliku JSON w _plany.
 *   trProwadzonyStart  → nowa jednostka P (albo niezamknięta P z tym dniem: ponowne wywołanie nie robi duplikatu)
 *   trProwadzonyCw     → ćwiczenia z seriami w otwartej P (ten sam nr i seria nadpisują: id Logu)
 *   trSerie            → serie w jednostce planu trenera (S/T…), gdy klient robi plan z trenerem obok
 *   trZakoncz          → wpis w Sesjach (prowadzil = trener), pakiet −1 (P domyślnie, plan też domyślnie, wyłącza zdejmij = false)
 *   trZPlanu           → jednostka planu przeniesiona do P (Plan, Log, Sesje, Pakiety; jednorazowe porządki)
 */
const LED_EX_MAX = 30;              // ćwiczeń w jednej jednostce prowadzonej
const LED_NOTE_MAX = 300;
const LED_CACHE_H = 6;              // dzień i tytuł jednostki bez ćwiczeń (start bez listy) czekają w CacheService
const LED_SW = { lekko: 7, latwo: 7, '🟢': 7, srednio: 8, '🟡': 8, ciezko: 9, walka: 9, '🔴': 9 };

const ledLc_ = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
const ledBlank_ = v => v === undefined || v === null || String(v).trim() === '';
const ledFold_ = v => ledLc_(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
const ledD10_ = v => v instanceof Date ? fmtDate_(v) : String(v === undefined || v === null ? '' : v).slice(0, 10);

/**
 * Czysta: wysiłek serii → {rpe, typ} albo {error}. x = {swiatlo?, rpe?, typ?}; światła jak w aplikacji (lekko 7, średnio 8, ciężko 9,
 * nieudana = RPE puste + FAIL). RPE liczbą tylko u klientów PRO: u PROSTYCH zaokrąglone do światła (te same stopnie co w aplikacji).
 */
function ledEffort_(x, simple) {
  x = x || {};
  let typ = String(x.typ === undefined || x.typ === null ? '' : x.typ).toUpperCase().replace(/\s/g, ''), rpe = '';
  if (typ && !/^(DROP|FAIL|DROP\+FAIL)$/.test(typ)) return { error: 'typ: DROP, FAIL albo DROP+FAIL' };
  const sw = ledFold_(x.swiatlo);
  if (sw) {
    if (/^(nieudana|nieudany|fail|spalone|✖|x)$/.test(sw)) typ = typ === 'DROP' ? 'DROP+FAIL' : typ || 'FAIL';
    else if (LED_SW[sw] !== undefined) rpe = LED_SW[sw];
    else return { error: 'światło: lekko, średnio, ciężko albo nieudana' };
  }
  if (!ledBlank_(x.rpe) && !/FAIL/.test(typ)) {
    const r = Number(String(x.rpe).replace(',', '.'));
    if (!(r >= 1 && r <= 10)) return { error: 'RPE od 1 do 10' };
    rpe = simple ? (r <= 7.5 ? 7 : r < 9 ? 8 : 9) : Math.round(r * 2) / 2;
  }
  if (/FAIL/.test(typ)) rpe = '';
  return { rpe: rpe, typ: typ };
}

/** Czysta: powtórzenia serii → {reps, timed} albo {error}: liczba 1–200 albo „30 s” (ćwiczenie na czas, sekundy). */
function ledReps_(v) {
  const t = String(v === undefined || v === null ? '' : v).trim().replace(',', '.');
  let m = /^(\d{1,3})$/.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 200) return { reps: +m[1], timed: false };
  m = /^(\d{1,4})\s*(s|sek|sek\.)$/i.exec(t);
  if (m && +m[1] >= 1) return { reps: +m[1], timed: true };
  return { error: 'powt: liczba powtórzeń (albo „30 s” na czas)' };
}
/** Czysta: ciężar serii → {kg, bw} albo {error}: liczba ≥ 0, „BW” / puste = bez ciężaru. */
function ledKg_(v) {
  const t = String(v === undefined || v === null ? '' : v).trim().replace(',', '.');
  if (!t || /^(bw|0)$/i.test(t)) return { kg: '', bw: /^bw$/i.test(t) };
  const x = Number(t);
  if (!(isFinite(x) && x > 0 && x <= 500)) return { error: 'kg: liczba (albo BW)' };
  return { kg: Math.round(x * 100) / 100, bw: false };
}
/** Czysta: seria w skrócie do odpowiedzi: „30×12 🔴”, „R1 20×10”, „D1 25×8 drop”. */
function ledSetTxt_(x) {
  const l = /FAIL/.test(x.typ) ? '✖' : x.rpe === '' || x.rpe === undefined ? '' : x.rpe <= 7.5 ? '🟢' : x.rpe < 9 ? '🟡' : '🔴';
  return ((/^\d+$/.test(x.set) ? '' : x.set + ' ') + (x.kg !== '' ? String(x.kg).replace('.', ',') + '×' : '') + x.reps + (x.timed ? ' s' : '') + (l ? ' ' + l : '') + (/^D/.test(x.set) ? ' drop' : '')).trim();
}

/** Czysta: serie z MCP → [{set, kg, reps, rpe, typ, timed, bw}] albo {error}. Seria domyślnie 1…n, „R1” rozgrzewka, „D1” drop. */
function ledSets_(list, simple) {
  const out = [], seen = {};
  let w = 0;
  for (const x of [].concat(list || [])) {
    if (!x) continue;
    let lab = ledBlank_(x.seria) ? '' : String(x.seria).trim().toUpperCase();
    if (lab && !/^([1-9]\d?|[RD][1-9]\d?)$/.test(lab)) return { error: 'seria „' + x.seria + '”: 1, 2, … (robocza), R1… (rozgrzewka) albo D1… (drop)' };
    const r = ledReps_(x.powt); if (r.error) return r;
    const k = ledKg_(x.kg); if (k.error) return k;
    const e = ledEffort_(x, simple); if (e.error) return e;
    if (!lab) lab = String(++w); else if (/^\d+$/.test(lab)) w = Math.max(w, +lab);
    if (+lab > SETS_MAX) return { error: 'najwyżej ' + SETS_MAX + ' serii' };
    if (seen[lab]) return { error: 'seria ' + lab + ' podana dwa razy' };
    seen[lab] = 1;
    let typ = e.typ;
    if (/^D/.test(lab) && !/DROP/.test(typ)) typ = typ ? 'DROP+' + typ : 'DROP';
    out.push({ set: lab, kg: k.kg, bw: k.bw, reps: r.reps, timed: r.timed, rpe: e.rpe, typ: typ });
  }
  return out;
}

/**
 * Czysta: ćwiczenia do jednostki prowadzonej → {rows (cała jednostka po zmianie, wg nr), sets: [{order, name, set, kg, reps, rpe, typ}], warn, out}
 * albo {error}. u = {week, day, date, title, rows (obecne wiersze Planu tej jednostki)}; list = [{nr?, cwiczenie, uwagi?, grupa?, obwod?, sekcja?, prio?, serie: [...]}];
 * ix = exIndex_ bazy ćwiczeń (alias → nazwa z bazy; spoza bazy = zapis z ostrzeżeniem). Ten sam nr = nowe dane tego ćwiczenia.
 */
function ledExRows_(clientId, u, list, ix, simple) {
  list = [].concat(list || []).filter(Boolean);
  if (!list.length) return { error: 'Podaj co najmniej jedno ćwiczenie.' };
  const rows = (u.rows || []).map(r => Object.assign({}, r));
  let next = Math.max(0, ...rows.map(r => Number(r.nr) || 0));
  const sets = [], warn = [], out = [], used = {};
  for (const e of list) {
    const raw = String(e.cwiczenie === undefined || e.cwiczenie === null ? '' : e.cwiczenie).trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!raw) return { error: 'Każde ćwiczenie potrzebuje nazwy.' };
    let nr;
    if (ledBlank_(e.nr)) nr = ++next;
    else { nr = Number(e.nr); if (!(Number.isInteger(nr) && nr >= 1 && nr <= 99)) return { error: raw + ': nr od 1 do 99.' }; next = Math.max(next, nr); }
    if (used[nr]) return { error: 'nr ' + nr + ' podany dwa razy.' };
    used[nr] = 1;
    const hit = ix && ix.k ? ix.k[exKey_(raw)] : null, name = hit ? hit.name : raw;
    if (!(ix && exInfo_(ix, name).found)) warn.push(name + ': nie ma w bazie ćwiczeń, więc brak filmu i partii');
    const S = ledSets_(e.serie, simple);
    if (S.error) return { error: name + ': ' + S.error + '.' };
    const work = S.filter(x => /^\d+$/.test(x.set)).sort((a, b) => +a.set - +b.set);
    if (!work.length) return { error: name + ': podaj co najmniej jedną serię roboczą.' };
    const sek = sekcja_(e.sekcja);
    if (sek === null) return { error: name + ': sekcja R (rozgrzewka), G (główne) albo K (korekcyjne).' };
    const ob = circuit_(e.obwod);
    if (!ledBlank_(e.obwod) && !ob) return { error: name + ': obwod jako jedna litera A–Z.' };
    const grp = String(e.grupa === undefined || e.grupa === null ? '' : e.grupa).trim().toUpperCase();
    if (grp && GROUPS.indexOf(grp) < 0) return { error: name + ': grupa R / P / CR / CP / PS / I.' };
    const prio = ledBlank_(e.prio) ? (sek === 'K' ? 'K' : 'A') : String(e.prio).trim().toUpperCase();
    if (['A', 'B', 'K'].indexOf(prio) < 0) return { error: name + ': prio A, B albo K.' };
    const rs = work.map(x => x.reps + (x.timed ? ' s' : '')), kgs = work.map(x => x.kg).filter(k => k !== '');
    const base = rows.find(r => Number(r.nr) === nr), r = {};
    PLAN_HEADERS.forEach(k => { const v = base ? base[k] : ''; r[k] = v === undefined || v === null || v instanceof Date ? '' : v; });
    Object.assign(r, { klient: clientId, tydzien: u.week, jednostka: u.day, tytul: u.title, data: u.date, nr: nr, cwiczenie: name, prio: prio,
      serie: work.length, powt: rs.every(v => v === rs[0]) ? rs[0] : rs.join(','), kg: kgs.length ? Math.max(...kgs) : work.some(x => x.bw) ? 'BW' : '',
      procent: '', rpe_max: '', grupa: grp, uwagi: ledBlank_(e.uwagi) ? r.uwagi : String(e.uwagi).trim().slice(0, LED_NOTE_MAX), obwod: ob, sekcja: sek || '',
      blok: '', zrodlo: 'prowadzony', tryb: '', ciecie: '', serie_min: '', dod_serie: '', drop: '' });
    if (base) rows[rows.indexOf(base)] = r; else rows.push(r);
    S.forEach(x => sets.push({ order: nr, name: name, set: x.set, kg: x.kg, reps: x.reps, rpe: x.rpe, typ: x.typ }));
    out.push(nr + ' ' + name + ': ' + S.map(ledSetTxt_).join(', '));
  }
  if (rows.length > LED_EX_MAX) return { error: 'Najwyżej ' + LED_EX_MAX + ' ćwiczeń w jednostce.' };
  rows.sort((a, b) => Number(a.nr) - Number(b.nr));
  const byC = {}; rows.forEach(r => { if (r.obwod) byC[r.obwod] = (byC[r.obwod] || 0) + 1; });
  Object.keys(byC).forEach(c => { if (byC[c] < 2) warn.push('obwód ' + c + ' ma jedno ćwiczenie: dopisz drugie z tą samą literą'); });
  return { rows: rows, sets: sets, warn: warn, out: out };
}

/** Czysta: tydzień dla jednostki prowadzonej z datą: jak ownWeek w aplikacji (ostatni tydzień planu, który zaczął się nie później), bez planu 1. */
function ledWeek_(plan, clientId, date) {
  const first = {};
  (plan || []).forEach(r => {
    if (ledLc_(r.klient) !== clientId || offPlan_(r)) return;
    const w = Number(r.tydzien), d = ledD10_(r.data);
    if (!(w >= 1) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    if (!first[w] || d < first[w]) first[w] = d;
  });
  const ws = Object.keys(first).map(Number).sort((a, b) => a - b);
  if (!ws.length) return Math.max(1, ...(plan || []).filter(r => ledLc_(r.klient) === clientId && !offPlan_(r)).map(r => Number(r.tydzien) || 0));
  return ws.filter(w => first[w] <= date).pop() || ws[0];
}
/** Czysta: kolejny kod jednostki prowadzonej klienta (P1, P2…, numeracja ciągła u klienta, niezależna od tygodnia). */
function ledNextDay_(plan, clientId) {
  const n = (plan || []).filter(r => ledLc_(r.klient) === clientId).map(r => (/^P(\d{1,3})$/.exec(String(r.jednostka).trim()) || [])[1]).filter(Boolean).map(Number);
  return 'P' + ((n.length ? Math.max(...n) : 0) + 1);
}
/** Czysta: niezamknięta (bez wpisu w Sesjach) jednostka prowadzona klienta z tym dniem → {week, day, date, title} albo null (najnowsza). */
function ledOpen_(plan, ses, clientId, date) {
  const closed = {}; (ses || []).forEach(s => { if (ledLc_(s.klient) === clientId) closed[Number(s.tydzien) + '|' + String(s.jednostka).trim()] = 1; });
  const U = {};
  (plan || []).forEach(r => {
    if (ledLc_(r.klient) !== clientId || !led_(r) || ledD10_(r.data) !== date) return;
    const k = Number(r.tydzien) + '|' + String(r.jednostka).trim();
    if (!closed[k] && !U[k]) U[k] = { week: Number(r.tydzien), day: String(r.jednostka).trim(), date: date, title: String(r.tytul || '').trim() || LED_TITLE };
  });
  const list = Object.values(U).sort((a, b) => Number(b.day.slice(1)) - Number(a.day.slice(1)));
  return list[0] || null;
}

/**
 * Czysta: serie w jednostce planu trenera → {sets, out} albo {error}. rows = wiersze Planu tej jednostki; list = [{nr, seria, kg?, powt?, swiatlo?, rpe?, typ?, uwagi?}];
 * all = wszystkie serie robocze wg planu (kg i powt z planu, podane w list nadpisują). Zakres („6-8”) albo drabinka w planie bez podanej liczby = błąd.
 */
function trSerieRows_(rows, list, all, simple) {
  const act = (rows || []).filter(r => !removed_(r)).sort((a, b) => Number(a.nr) - Number(b.nr));
  if (!act.length) return { error: 'Nie ma takiej jednostki w planie.' };
  if (act.some(own_)) return { error: 'To własny trening klienta: serie zapisuje klient.' };
  const want = {}, order = [];
  const put = (nr, set, x) => { const k = nr + '|' + set; if (!want[k]) { want[k] = { nr: nr, set: set }; order.push(k); } Object.assign(want[k], x || {}); };
  if (all) act.forEach(r => { const n = Number(r.serie) || 0; for (let i = 1; i <= n; i++) put(Number(r.nr), String(i)); });
  for (const x of [].concat(list || []).filter(Boolean)) {
    const nr = Number(x.nr), set = String(x.seria === undefined || x.seria === null ? '' : x.seria).trim().toUpperCase();
    if (!Number.isInteger(nr) || nr < 1) return { error: 'Każda seria potrzebuje numeru ćwiczenia „nr”.' };
    if (!/^([1-9]\d?|[RD][1-9]\d?)$/.test(set)) return { error: 'nr ' + nr + ': seria 1, 2, … (robocza), R1… (rozgrzewka) albo D1… (drop).' };
    put(nr, set, x);
  }
  if (!order.length) return { error: 'Nie ma czego zapisać: podaj „serie” albo „wszystkie_wg_planu”.' };
  const sets = [], out = {};
  for (const k of order) {
    const x = want[k], r = act.find(p => Number(p.nr) === x.nr);
    if (!r) return { error: 'Nie ma ćwiczenia nr ' + x.nr + ' w tej jednostce.' };
    const name = String(r.cwiczenie).trim(), pr = String(r.powt === undefined || r.powt === null ? '' : r.powt).trim();
    const reps = ledReps_(ledBlank_(x.powt) ? pr : x.powt);
    if (reps.error) return { error: name + ' (seria ' + x.set + '): ' + (ledBlank_(x.powt) ? 'w planie „' + pr + '”, podaj liczbę powtórzeń (powt).' : reps.error + '.') };
    const pk = r.kg === undefined || r.kg === null ? '' : r.kg, planKg = ledKg_(pk), kgIn = ledBlank_(x.kg) ? null : ledKg_(x.kg);
    if (kgIn && kgIn.error) return { error: name + ' (seria ' + x.set + '): ' + kgIn.error + '.' };
    if (!kgIn && (planKg.error || (planKg.kg === '' && !planKg.bw && !ledBlank_(r.procent)))) return { error: name + ' (seria ' + x.set + '): w planie „' + (String(pk).trim() || Math.round(Number(r.procent) * 100) + '%') + '”, podaj kg.' };
    const kg = kgIn || planKg, e = ledEffort_(x, simple);
    if (e.error) return { error: name + ' (seria ' + x.set + '): ' + e.error + '.' };
    let typ = e.typ; if (/^D/.test(x.set) && !/DROP/.test(typ)) typ = typ ? 'DROP+' + typ : 'DROP';
    const s = { order: x.nr, name: name, set: x.set, kg: kg.kg, reps: reps.reps, timed: reps.timed, rpe: e.rpe, typ: typ, note: ledBlank_(x.uwagi) ? null : String(x.uwagi).trim().slice(0, LED_NOTE_MAX) };
    sets.push(s);
    (out[x.nr] = out[x.nr] || { n: name, s: [] }).s.push(ledSetTxt_(s));
  }
  return { sets: sets, out: Object.keys(out).map(Number).sort((a, b) => a - b).map(n => n + ' ' + out[n].n + ': ' + out[n].s.join(', ')) };
}

/**
 * Czysta: zamknięcie jednostki → wartości wiersza Sesji albo {error}. o = {samopoczucie?, rpe_sesji?, czas_min?, start?, koniec?, bol?: [{miejsce, ocena}], uwagi?};
 * first = chwila pierwszej serii w Logu (ISO) albo ''; now = ISO. Koniec domyślnie teraz, start = koniec − czas albo pierwsza seria.
 */
function ledSession_(o, first, now) {
  o = o || {};
  const int = (v, lo, hi, nm) => { if (ledBlank_(v)) return ''; const x = Number(String(v).replace(',', '.')); return Number.isInteger(x) && x >= lo && x <= hi ? x : { error: nm }; };
  const feel = int(o.samopoczucie, 1, 5, 'samopoczucie od 1 do 5'); if (feel.error) return feel;
  const rpe = int(o.rpe_sesji, 0, 10, 'RPE sesji od 0 do 10'); if (rpe.error) return rpe;
  const min0 = int(o.czas_min, 1, 600, 'czas_min od 1 do 600'); if (min0.error) return min0;
  const t = v => { if (ledBlank_(v)) return null; const x = Date.parse(String(v)); return isFinite(x) ? x : NaN; };
  const end = t(o.koniec) === null ? Date.parse(now) : t(o.koniec), st0 = t(o.start);
  if (isNaN(end) || (st0 !== null && isNaN(st0))) return { error: 'start / koniec jako data i godzina (ISO, np. 2026-11-27T18:00:00+01:00)' };
  const f = first ? Date.parse(first) : NaN;
  const start = st0 !== null ? st0 : min0 !== '' ? end - min0 * 60000 : isFinite(f) && f < end ? f : end;
  if (start > end) return { error: 'start po końcu' };
  const minutes = min0 !== '' ? min0 : Math.round((end - start) / 60000) || '';
  const pain = [], R = {};
  for (const p of [].concat(o.bol || []).filter(Boolean)) {
    const place = String(p.miejsce === undefined || p.miejsce === null ? '' : p.miejsce).replace(/[:;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40), sc = Number(p.ocena);
    if (!place || !(Number.isInteger(sc) && sc >= 0 && sc <= 10)) return { error: 'ból: miejsce i ocena 0–10' };
    pain.push(place + ':' + sc);
    if (/kolan/i.test(place)) R.knee = Math.max(R.knee || 0, sc);
    if (/bark/i.test(place)) R.shoulder = Math.max(R.shoulder || 0, sc);
  }
  const scores = pain.map(x => Number(x.split(':').pop()));
  return { feel: feel, rpe: rpe, minutes: minutes, start: new Date(start).toISOString(), end: new Date(end).toISOString(), pain: pain.join('; '),
    painMax: scores.length ? Math.max(...scores) : '', knee: R.knee === undefined ? '' : R.knee, shoulder: R.shoulder === undefined ? '' : R.shoulder,
    note: String(o.uwagi === undefined || o.uwagi === null ? '' : o.uwagi).trim().slice(0, 1000) };
}

/** Czysta: jednostka planu → trening prowadzony: {day (P…), set: [[indeks wiersza Planu, {jednostka, zrodlo, blok}]]} albo {error}. */
function ledFromPlan_(plan, clientId, week, day) {
  const hit = []; (plan || []).forEach((r, i) => { if (ledLc_(r.klient) === clientId && Number(r.tydzien) === week && String(r.jednostka).trim() === day) hit.push([i, r]); });
  if (!hit.length) return { error: 'Nie ma jednostki ' + day + ' w tyg. ' + week + '.' };
  if (hit.some(x => led_(x[1]))) return { error: 'To już jest trening prowadzony.' };
  if (hit.some(x => own_(x[1]))) return { error: 'To własny trening klienta.' };
  const to = ledNextDay_(plan, clientId);
  return { day: to, set: hit.map(x => [x[0], { jednostka: to, zrodlo: removed_(x[1]) ? zr_(x[1]) : 'prowadzony', blok: '' }]) };
}

/* ---------- zapisy do arkusza (pod blokadą skryptu wołającego) ---------- */

function ledClient_(id) {
  id = String(id || '').trim().toLowerCase();
  const c = clientOf_(trRow_(id));
  return c;
}
/** Serie do Logu jednym odczytem kolumny id: istniejący wiersz dostaje nowe kg / powt. / RPE / typ (film, VBT i komentarze zostają), nowy na końcu. */
function ledLogWrite_(clientId, week, day, date, sets) {
  if (!sets.length) return;
  const sh = sheet_('Log', LOG_HEADERS), n = sh.getLastRow();
  const at = {}; if (n > 1) sh.getRange(2, 1, n - 1, 1).getValues().forEach((r, i) => { at[String(r[0])] = i + 2; });
  const add = [], now = new Date();
  sets.forEach(s => {
    const id = [clientId, week, day, s.order, s.set].join('|');
    const head = [id, now, clientId, week, day, date, s.order, s.name, s.set, s.kg, s.reps, s.rpe];
    const i = at[id];
    if (i) {
      sh.getRange(i, 1, 1, head.length).setValues(plainRows_([head]));
      sh.getRange(i, 14).setValue(plain_('TAK'));
      sh.getRange(i, 17).setValue(plain_(s.typ || ''));
      if (s.note !== null && s.note !== undefined) sh.getRange(i, 16).setValue(plain_(s.note));
    } else add.push(head.concat(['', 'TAK', '', s.note || '', s.typ || '']).concat(logV2_({})));
  });
  if (add.length) sh.getRange(n + 1, 1, add.length, add[0].length).setValues(plainRows_(add));
}
/** Ćwiczenia z seriami w jednostce prowadzonej (Plan: cała jednostka od nowa, Log: serie). */
function ledWrite_(c, plan, u, list) {
  const cur = plan.filter(r => ledLc_(r.klient) === c.id && Number(r.tydzien) === u.week && String(r.jednostka).trim() === u.day);
  if (cur.some(r => !led_(r))) throw new Error('Tydz. ' + u.week + ' ' + u.day + ' to nie jest trening prowadzony.');
  const res = ledExRows_(c.id, Object.assign({}, u, { rows: cur }), list, exIndex_(cwRowsCached_()), c.simple);
  if (res.error) throw new Error(res.error);
  ownWrite_(c.id, u.week, u.day, res.rows);
  ledLogWrite_(c.id, u.week, u.day, u.date, res.sets);
  return { cwiczenia: res.out, ostrzezenia: res.warn };
}
const ledCacheKey_ = (id, day) => 'led|' + id + '|' + day;

/** Panel / Claude: nowa jednostka prowadzona (albo niezamknięta z tym dniem). o = {date?, title?, ex?: [jak trProwadzonyCw]}. */
function trProwadzonyStart(id, o) {
  const c = ledClient_(id); o = o || {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(o.date || '')) ? String(o.date) : today_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const plan = tableOf_('Plan'), ses = readRows_('Sesje', SES_HEADERS, c.id);
    let u = ledOpen_(plan, ses, c.id, date), made = false;
    if (!u) {
      u = { week: ledWeek_(plan, c.id, date), day: ledNextDay_(plan, c.id), date: date, title: String(o.title || '').trim().replace(/\s+/g, ' ').slice(0, 40) || LED_TITLE };
      made = true;
      CacheService.getScriptCache().put(ledCacheKey_(c.id, u.day), JSON.stringify(u), LED_CACHE_H * 3600);
    }
    const ex = [].concat(o.ex || []).length ? ledWrite_(c, plan, u, o.ex) : null;
    return Object.assign({ week: u.week, day: u.day, date: u.date, title: u.title, made: made, name: c.name }, ex || {});
  } finally { lock.releaseLock(); }
}

/** Jednostka prowadzona do dopisania: z Planu, a bez wierszy (start bez ćwiczeń) z pamięci podręcznej; zamknięta = błąd. */
function ledUnit_(c, plan, week, day) {
  if (!LED_DAY.test(day)) throw new Error('Jednostka prowadzona ma kod P1, P2… (z „prowadzony_start”). Serie w jednostce planu: „zapisz_serie”.');
  if (readRows_('Sesje', SES_HEADERS, c.id).some(s => Number(s.tydzien) === week && String(s.jednostka).trim() === day)) throw new Error('Jednostka tydz. ' + week + ' ' + day + ' jest już zamknięta.');
  const r0 = plan.find(r => ledLc_(r.klient) === c.id && Number(r.tydzien) === week && String(r.jednostka).trim() === day);
  if (r0) return { week: week, day: day, date: ledD10_(r0.data) || today_(), title: String(r0.tytul || '').trim() || LED_TITLE };
  if (plan.some(r => ledLc_(r.klient) === c.id && String(r.jednostka).trim() === day)) throw new Error(day + ' jest w innym tygodniu (sprawdź „tydzien”).');
  let k = null; try { k = JSON.parse(CacheService.getScriptCache().get(ledCacheKey_(c.id, day)) || 'null'); } catch (e) { k = null; }
  if (k && Number(k.week) !== week) throw new Error(day + ' założono w tyg. ' + k.week + '.');
  return { week: week, day: day, date: k && k.date || today_(), title: k && k.title || LED_TITLE };
}

/** Panel / Claude: ćwiczenia z seriami w otwartej jednostce prowadzonej. o = {week, day, ex: [{nr?, cwiczenie, uwagi?, grupa?, obwod?, sekcja?, prio?, serie}]}. */
function trProwadzonyCw(id, o) {
  const c = ledClient_(id); o = o || {};
  const week = Number(o.week), day = String(o.day || '').trim().toUpperCase();
  if (!(week >= 1)) throw new Error('Podaj tydzień jednostki.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const plan = tableOf_('Plan'), u = ledUnit_(c, plan, week, day);
    return Object.assign({ week: week, day: day, name: c.name }, ledWrite_(c, plan, u, o.ex));
  } finally { lock.releaseLock(); }
}

/** Panel / Claude: serie w jednostce planu (jak logSet z aplikacji). o = {week, day, sets: [...], all}. */
function trSerie(id, o) {
  const c = ledClient_(id); o = o || {};
  const week = Number(o.week), day = String(o.day || '').trim();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const plan = tableOf_('Plan').filter(r => ledLc_(r.klient) === c.id && Number(r.tydzien) === week && String(r.jednostka).trim() === day);
    const res = trSerieRows_(plan, o.sets, !!o.all, c.simple);
    if (res.error) throw new Error(res.error);
    const date = ledD10_((plan[0] || {}).data) || today_();
    ledLogWrite_(c.id, week, day, date, res.sets);
    return { week: week, day: day, name: c.name, n: res.sets.length, cwiczenia: res.out };
  } finally { lock.releaseLock(); }
}

/** Panel / Claude: zamknięcie jednostki (Sesje, prowadzil = trener) i pakiet. o = {week, day, …ledSession_, pkg (domyślnie true)}. */
function trZakoncz(id, o) {
  const c = ledClient_(id); o = o || {};
  const week = Number(o.week), day = String(o.day || '').trim();
  const plan = tableOf_('Plan').filter(r => ledLc_(r.klient) === c.id && Number(r.tydzien) === week && String(r.jednostka).trim() === day);
  const logs = readRows_('Log', LOG_HEADERS, c.id).filter(l => Number(l.tydzien) === week && String(l.jednostka).trim() === day);
  if (!plan.length && !logs.length) throw new Error('Nie ma jednostki ' + day + ' w tyg. ' + week + '.');
  const warn = [];
  if (!logs.some(l => String(l.wykonane).toUpperCase() === 'TAK' && String(l.seria) !== '0')) warn.push('W tej jednostce nie ma zapisanych serii.');
  const firsts = logs.map(l => l.zapisano instanceof Date ? l.zapisano.toISOString() : String(l.zapisano || '')).filter(x => isFinite(Date.parse(x))).sort();
  const s = ledSession_(o, firsts[0] || '', new Date().toISOString());
  if (s.error) throw new Error(s.error);
  const date = ledD10_((plan[0] || {}).data) || sesDay_(s.start) || today_(), sid = [c.id, week, day].join('|');
  upsert_('Sesje', SES_HEADERS, sid, [sid, new Date(), c.id, week, day, date, s.knee, s.shoulder, s.feel, s.minutes, s.note, s.start, s.end, s.pain, s.painMax, s.rpe]);
  cellSet_('Sesje', SES_HEADERS, sid, 'prowadzil', 'trener');
  const before = pkgOf_(c.id), on = o.pkg === undefined || o.pkg === null ? true : !!o.pkg;
  if (before) pkgSession_(c.id, { week: week, day: day, pkg: on ? 1 : 0, start: s.start, title: String((plan[0] || {}).tytul || '').trim() || (LED_DAY.test(day) ? LED_TITLE : 'Trening ' + day) });
  const after = before ? pkgOf_(c.id) : null;
  return { week: week, day: day, name: c.name, led: LED_DAY.test(day), feel: s.feel, rpe: s.rpe, minutes: s.minutes, start: s.start, end: s.end, pain: s.pain,
    pkg: before ? { before: before.left, after: after ? after.left : null, on: on } : null, warn: warn };
}

/** Panel / Claude: jednostka planu → trening prowadzony P… (Plan, Log, Sesje i pakiet; zrobiona sesja zdejmuje 1 z pakietu, jeśli jeszcze nie). */
function trZPlanu(id, o) {
  const c = ledClient_(id); o = o || {};
  const week = Number(o.week), day = String(o.day || '').trim();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let res, ses, title;
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName('Plan'), plan = tableOf_('Plan');
    res = ledFromPlan_(plan, c.id, week, day);
    if (res.error) throw new Error(res.error);
    const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim());
    ['jednostka', 'zrodlo', 'blok'].forEach(k => { if (h.indexOf(k) < 0) { sh.getRange(1, h.length + 1).setValue(plain_(k)); h.push(k); } });
    res.set.forEach(([i, v]) => Object.keys(v).forEach(k => sh.getRange(i + 2, h.indexOf(k) + 1).setValue(plain_(v[k]))));
    title = String((plan[res.set[0][0]] || {}).tytul || '').trim();
    const pre = [c.id, week, day].join('|'), now = [c.id, week, res.day].join('|');
    [['Log', LOG_HEADERS], ['Sesje', SES_HEADERS]].forEach(([name, hd]) => {
      const s2 = sheet_(name, hd), n = s2.getLastRow(); if (n < 2) return;
      const hh = s2.getRange(1, 1, 1, s2.getLastColumn()).getValues()[0].map(x => String(x).trim()), jc = hh.indexOf('jednostka') + 1;
      s2.getRange(2, 1, n - 1, 1).getValues().forEach((r, i) => {
        const v = String(r[0]);
        if (v === pre || v.indexOf(pre + '|') === 0) { s2.getRange(i + 2, 1).setValue(plain_(now + v.slice(pre.length))); s2.getRange(i + 2, jc).setValue(plain_(res.day)); }
      });
    });
    ses = readRows_('Sesje', SES_HEADERS, c.id).find(s => Number(s.tydzien) === week && String(s.jednostka).trim() === res.day);
  } finally { lock.releaseLock(); }
  // pakiet: wpis treningu starej jednostki przechodzi na nową; zamknięta, a bez wpisu = −1
  const before = pkgOf_(c.id);
  let pk = null;
  if (before) {
    const sh = pkgSheet_(), old = [c.id, 's', week, day].join('|'), hit = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).createTextFinder(old).matchEntireCell(true).findNext();
    if (hit && hit.getRow() > 1) { hit.setValue(plain_([c.id, 's', week, res.day].join('|'))); sh.getRange(hit.getRow(), 10).setValue(plain_(week + '|' + res.day)); }
    else if (ses) pkgSession_(c.id, { week: week, day: res.day, pkg: 1, start: ses.start, title: title || LED_TITLE });
    pk = { before: before.left, after: (pkgOf_(c.id) || {}).left };
  }
  return { week: week, from: day, day: res.day, rows: res.set.length, closed: !!ses, pkg: pk, name: c.name };
}
