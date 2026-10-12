const test = require('node:test'), assert = require('node:assert');
const C = require('./load-code')();

test('repsOf_: kompleksy i zapisy powtórzeń', () => {
  assert.equal(C.repsOf_('1+1'), 2);
  assert.equal(C.repsOf_('2+2+1'), 5);
  assert.equal(C.repsOf_('8/str'), 8);
  assert.equal(C.repsOf_('6-8'), 6);
  assert.equal(C.repsOf_('10 m'), 10);
});

test('groupOf_: rozpoznanie grup po nazwie', () => {
  const g = {
    'Rwanie': 'R', 'Power snatch + OHS': 'R', 'Ciąg rwaniowy': 'CR', 'Snatch pull': 'CR',
    'Zarzut i podrzut': 'P', 'Ciąg zarzutowy': 'CP', 'Clean pull': 'CP', 'Przysiad przedni': 'PS',
    'Martwy ciąg rumuński': 'I', 'Wyciskanie żołnierskie': 'I', 'Hip thrust': 'I'
  };
  for (const [n, exp] of Object.entries(g)) assert.equal(C.groupOf_('', n), exp, n);
  assert.equal(C.groupOf_('cp', 'Cokolwiek'), 'CP');
});

test('validatePlan_: poprawny plan i typowe błędy', () => {
  const ok = [{ klient: 'robert', tydzien: 1, jednostka: 'T1', data: '2026-10-06', nr: 1, cwiczenie: 'Przysiad', prio: 'A', serie: 4, powt: '6-8', procent: '', kg: 80, rpe_max: 8, uwagi: '' }];
  assert.deepEqual(Array.from(C.validatePlan_(ok)), []);
  const bad = [
    { klient: 'robert', tydzien: 1, jednostka: 'T1', data: '06.10.2026', nr: 1, cwiczenie: 'X', prio: 'Z', serie: 0, powt: '5', procent: 75 },
    { klient: 'robert', tydzien: 1, jednostka: 'T1', data: '2026-10-06', nr: 1, cwiczenie: 'Y', serie: 3, powt: '5', grupa: 'Q' }
  ];
  const e = C.validatePlan_(bad).join('\n');
  for (const frag of ['RRRR-MM-DD', 'prio', 'serie', 'procent', 'grupa', 'powtórzony']) assert.match(e, new RegExp(frag));
  assert.equal(C.validatePlan_([]).length, 1);
});

// --- podsumowanie: syntetyczne tygodnie ---
const start = Date.UTC(2026, 7, 3);
const d = (w, k) => new Date(start + (7 * (w - 1) + k) * 864e5).toISOString().slice(0, 10);

test('computeSummary_: przeciążenie → 🔴, deload z planu → nie „za lekko”', () => {
  const plan = [], log = [], ses = [];
  for (let w = 1; w <= 7; w++) for (const [k, day] of [[0, 'T1'], [2, 'T2'], [4, 'T3']]) {
    const kg = 80 + 2.5 * w, serie = w === 7 ? 2 : 4;
    plan.push({ klient: 'robert', tydzien: w, jednostka: day, data: d(w, k), nr: 1, cwiczenie: 'Przysiad', prio: 'A', serie, powt: '5', procent: 0.75, kg, rpe_max: 8 });
    const sets = w === 5 ? 6 : serie;
    for (let s = 1; s <= sets; s++) {
      const fail = w === 5 && s >= 4;
      log.push({ klient: 'robert', tydzien: w, jednostka: day, data: d(w, k), nr_cw: 1, cwiczenie: 'Przysiad', seria: s,
        kg: w === 5 ? kg - 5 : kg, powt: fail ? 2 : 5, rpe: fail ? '' : (w === 5 ? 9.5 : w >= 6 ? 6.5 : 7.5 + 0.1 * w), wykonane: 'TAK', typ: fail ? 'FAIL' : '' });
    }
    ses.push({ klient: 'robert', data: d(w, k), samopoczucie: w === 5 ? 2 : 4, czas_min: w === 5 ? 95 : 60, rpe_sesji: w === 5 ? 9 : 6, bol_max: w === 5 ? 4 : '' });
  }
  const r = C.computeSummary_(plan, log, ses, []);
  const H = C.SUM_HEADERS, st = r.rows.map(x => x[H.indexOf('status')]);
  assert.equal(st[4], '🔴 za dużo');
  assert.ok(r.rows[4][H.indexOf('ACWR')] > 1.5);
  assert.match(r.rows[6][H.indexOf('powody')], /lżejszy z planu/);
  assert.notEqual(st[6], '🔵 za lekko');
});

test('computeSummary_: ciężarowiec masters – spalone < 85% i VBT', () => {
  const plan = [], log = [], ses = [];
  const EX = [['Rwanie', [0.75, 0.8, 0.85], 90, '2'], ['Zarzut i podrzut', [0.75, 0.8, 0.85], 115, '1+1'], ['Przysiad przedni', [0.8], 140, '3']];
  for (let w = 1; w <= 4; w++) for (const [k, day] of [[0, 'T1'], [2, 'T2'], [4, 'T3']]) {
    let nr = 0;
    EX.forEach(([name, pcts, rm, powt]) => pcts.forEach(p => {
      nr++; const kg = Math.floor(rm * p / 2.5) * 2.5;
      plan.push({ klient: 'damian', tydzien: w, jednostka: day, data: d(w, k), nr, cwiczenie: name, prio: 'A', serie: 2, powt, procent: p, kg, rpe_max: '' });
      for (let s = 1; s <= 2; s++) {
        const miss = w === 4 && p <= 0.8 && s === 2 && name !== 'Przysiad przedni';
        log.push({ klient: 'damian', tydzien: w, jednostka: day, data: d(w, k), nr_cw: nr, cwiczenie: name, seria: s, kg,
          powt: miss ? 0 : C.repsOf_(powt), rpe: name.startsWith('Prz') ? 8 : '', vbt_ms: p >= 0.8 && p <= 0.9 ? (w === 4 ? 1.38 : 1.48) : '', wykonane: 'TAK', typ: miss ? 'FAIL' : '' });
      }
    }));
    ses.push({ klient: 'damian', data: d(w, k), samopoczucie: 4, czas_min: 90, rpe_sesji: 7 });
  }
  const r = C.computeSummary_(plan, log, ses, [{ klient_id: 'damian', masters: 'TAK' }]);
  const O = C.OLY_HEADERS, last = r.olyRows[3];
  assert.equal(r.olyRows[0][O.indexOf('NL_P')], 36);                       // „1+1” liczone jako 2
  assert.equal(last[O.indexOf('spal_<85_%')], 50);
  assert.ok(last[O.indexOf('VBT_80-90_zm_ms')] <= -0.05);
  assert.equal(r.rows[3][C.SUM_HEADERS.indexOf('status')], '🔴 za dużo');
  assert.equal(r.rows[0][C.SUM_HEADERS.indexOf('fail_%')], 0);              // spalone boje nie wchodzą do fail_%
});

test('fillDates_: plan bez dat → data z Sesji albo dzisiejsza', () => {
  const rows = [{ week: 1, day: 'T1', date: '' }, { week: 1, day: 'T2', date: '' }, { week: 1, day: 'T3', date: '2026-10-08' }];
  C.fillDates_(rows, [{ tydzien: 1, jednostka: 'T1', data: '2026-10-05' }], '2026-10-09');
  assert.deepEqual(rows.map(r => r.date), ['2026-10-05', '2026-10-09', '2026-10-08']);
  assert.equal(C.sesDay_(''), '');
});

test('computeSummary_: plan bez dat → tydzień z daty Sesji, jednostki niezrobione pominięte', () => {
  const plan = [1, 2].map(w => ({ klient: 'robert', tydzien: w, jednostka: 'T1', data: '', nr: 1, cwiczenie: 'Przysiad', prio: 'A', serie: 3, powt: '5', kg: 80 }));
  const log = [1, 2, 3].map(s => ({ klient: 'robert', tydzien: 1, jednostka: 'T1', data: d(1, 0), nr_cw: 1, cwiczenie: 'Przysiad', seria: s, kg: 80, powt: 5, rpe: 7, wykonane: 'TAK' }));
  const ses = [{ klient: 'robert', tydzien: 1, jednostka: 'T1', data: d(1, 0), samopoczucie: 4, czas_min: 60, rpe_sesji: 6 }];
  const r = C.computeSummary_(plan, log, ses, []);
  const H = C.SUM_HEADERS;
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0][H.indexOf('tydzien_od')], d(1, 0));
  assert.equal(r.rows[0][H.indexOf('wykonanie_%')], 100);
});

// --- backend v2 ---
test('olyCeil_: sufit_oly jako ułamek albo procent, domyślnie 0,05', () => {
  assert.equal(C.olyCeil_(''), 0.05);
  assert.equal(C.olyCeil_(undefined), 0.05);
  assert.equal(C.olyCeil_('0,05'), 0.05);
  assert.equal(C.olyCeil_(0.1), 0.1);
  assert.equal(C.olyCeil_(5), 0.05);
  assert.equal(C.olyCeil_('7%'), 0.07);
  assert.equal(C.olyCeil_('abc'), 0.05);
});

test('logV2_: kolumny Log v2, stara aplikacja = puste', () => {
  assert.deepEqual(Array.from(C.logV2_({})), ['', '', '', '', '']);
  const r = C.logV2_({ ocena: 'w', vbtPeak: 1.92, height: 0, path: [[0, 0], [1.5, 40]], swap: 'Przysiad → Leg press | Sprzęt zajęty' });
  assert.deepEqual(Array.from(r), ['W', 1.92, 0, '[[0,0],[1.5,40]]', 'Przysiad → Leg press | Sprzęt zajęty']);
  assert.equal(C.logV2_({ ocena: 'Z' })[0], '');
  assert.equal(C.logV2_({ path: 'x'.repeat(50000) })[3], '');
});

test('planMoves_: przesuwa tylko niezrobione jednostki klienta', () => {
  const plan = [
    { klient: 'robert', tydzien: 1, jednostka: 'T1', nr: 1 }, { klient: 'robert', tydzien: 1, jednostka: 'T1', nr: 2 },
    { klient: 'robert', tydzien: 1, jednostka: 'T2', nr: 1 }, { klient: 'ewa', tydzien: 1, jednostka: 'T2', nr: 1 }];
  const ses = [{ tydzien: 1, jednostka: 'T1' }];
  const r = C.planMoves_(plan, ses, 'robert', [
    { week: 1, day: 'T1', date: '2026-10-10' }, { week: 1, day: 'T2', date: '2026-10-11' },
    { week: 1, day: 'T3', date: '2026-10-12' }, { week: 1, day: 'T2', date: '11.10.2026' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(r.rows)), [[2, '2026-10-11']]);
  assert.deepEqual(r.skipped.map(s => s.why), ['jednostka zrobiona', 'brak w planie', 'zła data']);
});

test('validatePlan_: data opcjonalna, ale wpisana musi być RRRR-MM-DD', () => {
  const row = { klient: 'robert', tydzien: 7, jednostka: 'T1', nr: 1, cwiczenie: 'Przysiad', serie: 3, powt: '5', blok: 'B2' };
  assert.deepEqual(Array.from(C.validatePlan_([row])), []);
  assert.match(C.validatePlan_([Object.assign({}, row, { data: '7.10' })]).join(), /RRRR-MM-DD/);
});

test('mergePlan_: zrobione jednostki zostają, kolizja bloków = błąd', () => {
  const R = (k, w, j, nr, blok) => ({ klient: k, tydzien: w, jednostka: j, nr, cwiczenie: 'X' + nr, serie: 3, powt: '5', blok: blok || '' });
  const existing = [R('robert', 1, 'T1', 1), R('robert', 1, 'T2', 1), R('ewa', 1, 'T1', 1)];
  const ses = [{ klient: 'robert', tydzien: 1, jednostka: 'T1' }];
  // poprawka bieżącego planu (bez bloku): zrobiona T1 zostaje, T2 z pliku
  let m = C.mergePlan_(existing, [R('robert', 1, 'T1', 1), R('robert', 1, 'T1', 2), R('robert', 1, 'T2', 5)], ses);
  assert.equal(m.errors.length, 0);
  assert.equal(m.warnings.length, 1);
  assert.deepEqual(m.rows.map(r => r.klient + r.jednostka + r.nr), ['ewaT11', 'robertT11', 'robertT25']);
  // nowy blok B2 znów od tygodnia 1 → błąd z podpowiedzią numeracji
  m = C.mergePlan_(existing, [R('robert', 1, 'T1', 1, 'B2')], ses);
  assert.equal(m.errors.length, 1);
  assert.match(m.errors[0], /\(bez bloku\).*B2.*od 2/);
  // B2 numerowany dalej → OK, zrobiona jednostka B1 zostaje
  m = C.mergePlan_([R('robert', 1, 'T1', 1, 'B1')], [R('robert', 2, 'T1', 1, 'B2')], ses);
  assert.deepEqual([m.errors.length, m.rows.length], [0, 2]);
});

test('computeSummary_: tydzień wg faktycznej daty treningu (Sesje.start)', () => {
  const plan = [{ klient: 'robert', tydzien: 1, jednostka: 'T1', data: '2026-10-05', nr: 1, cwiczenie: 'Przysiad', prio: 'A', serie: 1, powt: '5', kg: 100 }];
  const log = [{ klient: 'robert', tydzien: 1, jednostka: 'T1', data: '2026-10-05', nr_cw: 1, cwiczenie: 'Przysiad', seria: 1, kg: 100, powt: 5, rpe: 8, wykonane: 'TAK' }];
  const ses = [{ klient: 'robert', tydzien: 1, jednostka: 'T1', data: '2026-10-05', start: '2026-09-28T15:51:43.380Z', samopoczucie: 4, czas_min: 60, rpe_sesji: 7 }];
  const r = C.computeSummary_(plan, log, ses, []);
  assert.deepEqual(r.rows.map(x => x[1]), ['2026-09-28']);
  assert.equal(C.unitDates_([{ klient: 'a', tydzien: 1, jednostka: 'T1', start: '2026-09-28T22:30:00Z' }])['a|1|T1'], '2026-09-29'); // Warszawa
});

test('computeBlocks_ i keepNotes_: historia bloków z wnioskami trenera', () => {
  const plan = [], log = [], ses = [];
  [[1, 'B1', 100], [2, 'B1', 105], [3, 'B2', 110]].forEach(([w, blok, kg]) => {
    plan.push({ klient: 'robert', tydzien: w, jednostka: 'T1', data: d(w, 0), nr: 1, cwiczenie: 'Przysiad', prio: 'A', serie: 2, powt: '5', kg, blok });
    plan.push({ klient: 'robert', tydzien: w, jednostka: 'T1', data: d(w, 0), nr: 2, cwiczenie: 'Rwanie', prio: 'A', serie: 1, powt: '1', kg: kg - 20, blok, grupa: 'R' });
    if (w === 3) return;                                                    // tydzień 3 jeszcze niezrobiony
    for (let s = 1; s <= 2; s++) log.push({ klient: 'robert', tydzien: w, jednostka: 'T1', data: d(w, 0), nr_cw: 1, cwiczenie: 'Przysiad', seria: s, kg, powt: 5, rpe: 8, wykonane: 'TAK' });
    log.push({ klient: 'robert', tydzien: w, jednostka: 'T1', data: d(w, 0), nr_cw: 2, cwiczenie: 'Rwanie', seria: 1, kg: kg - 20, powt: 1, wykonane: 'TAK' });
    ses.push({ klient: 'robert', tydzien: w, jednostka: 'T1', data: d(w, 0), samopoczucie: 4, czas_min: 60, rpe_sesji: 7, bol_max: w });
  });
  const dys = [{ klient: 'robert', data: d(1, 0), werdykt: 'Dobra dyspozycja' }, { klient: 'robert', data: d(2, 0), werdykt: 'Uwaga' }];
  const sum = C.computeSummary_(plan, log, ses, []);
  const H = C.BLOK_HEADERS, rows = C.computeBlocks_(plan, log, ses, dys, sum.rows);
  const b1 = rows.find(r => r[1] === 'B1'), b2 = rows.find(r => r[1] === 'B2');
  const v = (r, h) => r[H.indexOf(h)];
  assert.equal(v(b1, 'tygodnie'), '1–2');
  assert.equal(v(b1, 'jednostki'), '2/2');
  assert.equal(v(b1, 'wykonanie_%'), 100);
  assert.equal(v(b1, 'tonaz_kg'), 2 * 5 * 100 + 80 + 2 * 5 * 105 + 85);
  assert.match(v(b1, 'e1RM_zm'), /^Przysiad 123→130 \(\+5%\)$/);
  assert.equal(v(b1, 'najlepsze_boje'), 'R 85 kg (Rwanie)');
  assert.equal(v(b1, 'dyspozycja'), 'Dobra dyspozycja 1, Uwaga 1');
  assert.equal(v(b1, 'bol_max'), 2);
  assert.deepEqual([v(b2, 'jednostki'), v(b2, 'wykonanie_%')], ['0/1', 0]);
  const old = [{ klient: 'robert', blok: 'B1', wnioski: 'Przysiad +5%, zostaw objętość' }, { klient: 'robert', blok: 'B0', od: '2026-06-01', wnioski: 'stary blok' }];
  const out = C.keepNotes_(rows, old), W = H.indexOf('wnioski');
  assert.equal(out.find(r => r[1] === 'B1')[W], 'Przysiad +5%, zostaw objętość');
  assert.equal(out.find(r => r[1] === 'B2')[W], '');
  assert.equal(out.find(r => r[1] === 'B0')[W], 'stary blok');
});

test('slugId_ i buildClientRow_: nowy klient z menu', () => {
  assert.equal(C.slugId_('Mikołaj Góral'), 'mikolaj-goral');
  assert.equal(C.slugId_('  Żaneta  '), 'zaneta');
  const ok = C.buildClientRow_({ imie: 'Mikołaj', prosty: true, masters: true, dod_serie: '1' }, ['damian'], 'kabc123def45');
  assert.equal(ok.id, 'mikolaj');
  assert.deepEqual(Array.from(ok.row), ['kabc123def45', 'mikolaj', 'Mikołaj', 'TAK', '', '', 'PROSTY', 1, 'TAK']);
  assert.match(C.buildClientRow_({ imie: 'Robert' }, ['Robert'], 'k').error, /już istnieje/);
  assert.match(C.buildClientRow_({ imie: '' }, [], 'k').error, /imię/);
  assert.match(C.buildClientRow_({ imie: 'A', dod_serie: '9' }, [], 'k').error, /0–5/);
  assert.equal(C.buildClientRow_({ imie: 'Ewa', id: 'Ewa K' }, [], 'k').id, 'ewa-k');
});

test('computeOverview_: przegląd klientów – sygnały, zaległe, koniec planu, kolejność wg pilności', () => {
  const today = '2026-10-12';                                                  // poniedziałek
  const P = (k, j, data, nr, cw, x) => Object.assign({ klient: k, tydzien: 1, jednostka: j, data, nr, cwiczenie: cw, prio: 'A', serie: 3, powt: '5', kg: 80 }, x || {});
  const L = (k, j, nr, cw, s, x) => Object.assign({ klient: k, tydzien: 1, jednostka: j, data: '2026-10-05', nr_cw: nr, cwiczenie: cw, seria: s, kg: 80, powt: 5, rpe: 8, wykonane: 'TAK', typ: '', zapisano: new Date('2026-10-06T17:00:00Z') }, x || {});
  const klienci = [{ klient_id: 'anna', imie: 'Anna', aktywny: 'TAK' }, { klient_id: 'bob', imie: 'Bob', aktywny: 'TAK' }, { klient_id: 'cel', imie: 'Cel', aktywny: 'NIE' },
    { klient_id: 'dan', imie: 'Dan', aktywny: '' }, { klient_id: 'ewa', imie: 'Ewa', aktywny: 'TAK' }];
  const plan = [P('anna', 'T1', '2026-10-05', 1, 'Przysiad'), P('anna', 'T1', '2026-10-05', 2, 'Wiosłowanie'), P('anna', 'T2', '2026-10-08', 1, 'Przysiad'),
    P('anna', 'T3', '2026-10-14', 1, 'Przysiad'), P('anna', 'T4', '2026-10-16', 1, 'Przysiad'), P('cel', 'T1', '2026-10-01', 1, 'Przysiad'),
    P('dan', 'T1', '2026-09-01', 1, 'Przysiad'), P('ewa', 'T1', '2026-10-10', 1, 'Rwanie', { procent: 0.8, grupa: 'R' })];
  const log = [L('anna', 'T1', 1, 'Przysiad', 1), L('anna', 'T1', 1, 'Przysiad', 2, { typ: 'FAIL', rpe: '' }), L('anna', 'T1', 1, 'Przysiad', 3, { typ: 'FAIL', rpe: '', film_link: 'https://drive.example/f1' }),
    L('anna', 'T1', 2, 'Wiosłowanie hantlem', 1, { zamiana: 'Wiosłowanie → Wiosłowanie hantlem | Ból' }),
    L('dan', 'T1', 1, 'Przysiad', 1, { data: '2026-09-01', zapisano: new Date('2026-09-01T10:30:00Z') }),
    L('ewa', 'T1', 1, 'Rwanie', 1, { typ: 'FAIL', rpe: '', data: '2026-10-10', zapisano: new Date('2026-10-10T17:00:00Z') }),
    L('ewa', 'T1', 1, 'Rwanie', 2, { typ: 'FAIL', rpe: '', data: '2026-10-10', zapisano: new Date('2026-10-10T17:05:00Z') })];
  const ses = [{ klient: 'anna', tydzien: 1, jednostka: 'T1', data: '2026-10-05', start: '2026-10-06T16:00:00.000Z', samopoczucie: 2, czas_min: 60, rpe_sesji: 8, bol: 'kolano:5; bark:1', bol_max: 5, uwagi: 'Kolano boli\npo schodach.' },
    { klient: 'dan', tydzien: 1, jednostka: 'T1', data: '2026-09-01', start: '2026-09-01T10:00:00.000Z', samopoczucie: 4, czas_min: 50 }];
  const dys = [{ klient: 'anna', data: '2026-10-11', werdykt: 'Zmęczenie' }, { klient: 'anna', data: '2026-10-01', werdykt: 'Uwaga' }, { klient: 'ewa', data: '2026-10-12', werdykt: 'Uwaga' }];
  const sum = [Object.assign(new Array(C.SUM_HEADERS.length).fill(''), { 0: 'anna', 1: '2026-10-05', [C.SUM_HEADERS.indexOf('status')]: '🟠 uwaga' })];
  const rows = C.computeOverview_(plan, log, ses, klienci, dys, sum, { today });
  const H = C.PRZ_HEADERS, v = (r, h) => r[H.indexOf(h)];
  assert.deepEqual(rows.map(r => [r[0], v(r, 'pilnosc')]), [['anna', 13], ['ewa', 3], ['dan', 2], ['bob', 1]]);   // nieaktywny „cel” pominięty
  const a = rows[0];
  assert.equal(v(a, 'do_reakcji'), 'ból kolano 5/10 (06.10); 2× FAIL: Przysiad; dyspozycja: Zmęczenie (11.10); samopoczucie 2/5 (06.10); ' +
    'zamiana (ból): Wiosłowanie → Wiosłowanie hantlem; zaległe: T2 08.10; plan kończy się za 4 dni');
  assert.deepEqual([v(a, 'ostatni_trening'), v(a, 'dni_temu'), v(a, 'ten_tydzien'), v(a, 'zalegle'), v(a, 'filmy_7dni'), v(a, 'koniec_planu_dni')],
    ['2026-10-06', 6, '0/2', 1, 1, 4]);                                          // faktyczny dzień z Sesje.start, nie data z planu
  assert.equal(v(a, 'status_tygodnia'), '🟠 uwaga (tydz. od 05.10)');
  assert.equal(v(a, 'uwagi_klienta'), '06.10: Kolano boli po schodach.');
  assert.equal(v(rows[1], 'do_reakcji'), '2× spalone < 85%: Rwanie; dyspozycja: Uwaga (12.10); zaległe: T1 10.10');   // serie bez zamkniętej sesji: dzień z „zapisano”
  assert.equal(v(rows[1], 'ostatni_trening'), '2026-10-10');
  assert.equal(v(rows[2], 'do_reakcji'), 'plan skończony; brak treningu od 41 dni');
  assert.equal(v(rows[3], 'do_reakcji'), 'brak planu');
});

test('diagnose_: sprawdzenie arkusza z menu Trening', () => {
  const K = (id, klucz, x) => Object.assign({ klient_id: id, imie: id, aktywny: 'TAK', klucz, link: klucz ? 'https://example.test/?k=' + klucz : '' }, x || {});
  const R = (k, data, x) => Object.assign({ klient: k, tydzien: 1, jednostka: 'T1', data, nr: 1, powt: '5', blok: 'B1' }, x || {});
  const ok = { klienci: [K('anna', 'k0123456789a')], plan: [R('anna', '2026-11-30')], pwaUrl: 'https://example.test/', triggers: ['podsumowanie', 'wczytajPlany'], bledy: 0, czeka: 0, today: '2026-10-12' };
  assert.deepEqual(Array.from(C.diagnose_(ok)), []);
  const bad = C.diagnose_({ today: '2026-10-12', pwaUrl: '', triggers: ['podsumowanie'], bledy: 2, czeka: 1,
    klienci: [K('anna', 'k0123456789a', { link: '' }), K('bob', 12345), K('bob', 'k0123456789b'), K('cel', 'k0123456789c'), K('stary', '', { aktywny: 'NIE' })],
    plan: [R('anna', '2026-10-15', { blok: '' }), R('anna', '2026-10-10', { blok: '', powt: new Date(2026, 5, 8) }), R('duch', '2026-10-20'), R('bob', '2026-09-01')] });
  const txt = bad.map(r => r[0] + ': ' + r[1]).join('\n');
  for (const frag of ['błąd: Brak właściwości skryptu PWA_URL', 'błąd: Brak wyzwalacza „wczytajPlany”', 'błąd: Powtórzone klient_id „bob”', 'błąd: bob: brak poprawnego klucza',
    'uwaga: anna: brak aktualnego linku', 'uwaga: cel: aktywny klient bez planu', 'uwaga: Plan dla „duch”', 'błąd: anna: kolumna powt zamieniona na datę w wierszach Planu 3',
    'uwaga: anna: plan kończy się za 3 dni', 'uwaga: bob: plan skończył się 2026-09-01', 'info: anna: plan bez kolumny blok', 'uwaga: Pliki w _plany/bledy: 2', 'info: Pliki czekające w _plany: 1'])
    assert.ok(txt.includes(frag), 'brak: ' + frag + '\n' + txt);
  assert.ok(!/stary/.test(txt));                                                 // nieaktywny klient bez uwag
  assert.ok(!/Brak wyzwalacza „podsumowanie”/.test(txt));
});

// --- zakładka Ćwiczenia: baza, dopasowanie nazw, kompleksy, serie na partię ---
const CW = [{ cwiczenie: ' Przysiad  tylny ', aliasy: 'Back Squat; Siad', instruktaz: 'https://example.test/przysiad', partia: 'Czworogłowe; pośladki', zamienniki: 'Leg press; Hack', grupa: 'ps' },
  { cwiczenie: 'Leg press', instruktaz: 'javascript:alert(1)', partia: 'czworogłowe', grupa: 'Q' }, { cwiczenie: 'Wiosłowanie hantlem', partia: 'plecy' }, { cwiczenie: '' },
  { cwiczenie: 'Hang Clean', instruktaz: 'https://example.test/hc' }, { cwiczenie: 'Jerk', instruktaz: 'https://example.test/jerk' },
  { cwiczenie: 'Dumbbell Incline Bench Press', instruktaz: 'https://example.test/dibp', partia: 'klatka' }, { cwiczenie: 'Romanian Deadlift (RDL)', partia: 'dwugłowe uda' },
  { cwiczenie: 'Single-Leg RDL', partia: 'dwugłowe uda; pośladki' }, { cwiczenie: '1-1/4 Front Squat', instruktaz: 'https://example.test/fs114' },
  { cwiczenie: 'Front Squat', instruktaz: 'https://example.test/fs' }];
const plain = v => JSON.parse(JSON.stringify(v));

test('exFind_: dokładna nazwa, alias, nazwa podstawowa, te same słowa', () => {
  const ix = C.exIndex_(CW), f = n => (C.exFind_(ix, n) || {}).name || null;
  assert.equal(C.exKey_('  PRZYSIAD   Tylny '), 'przysiad tylny');
  assert.deepEqual(plain(C.exFind_(ix, 'PRZYSIAD tylny')), { name: 'Przysiad tylny', info: 'https://example.test/przysiad', parts: ['czworogłowe', 'pośladki'], swaps: ['Leg press', 'Hack'], group: 'PS' });
  assert.deepEqual([C.exFind_(ix, 'Leg press').info, C.exFind_(ix, 'Leg press').group], ['', '']);   // link tylko http(s), grupa tylko z listy
  assert.deepEqual(['siad', 'Back Squat (pauza 2 s)', 'Przysiad tylny – TEST', 'Back Squat 1¼'].map(f), Array(4).fill('Przysiad tylny'));
  assert.equal(f('Hang Clean z pauzą 2 s nad kolanem'), 'Hang Clean');
  assert.equal(f('Romanian Deadlift (chwyt do zarzutu)'), 'Romanian Deadlift (RDL)');
  assert.deepEqual(['Incline DB Bench Press', 'SL RDL', 'Front Squat 1¼', 'Front Squats'].map(f), ['Dumbbell Incline Bench Press', 'Single-Leg RDL', '1-1/4 Front Squat', 'Front Squat']);
  assert.deepEqual(['Clean', 'Jerk Dip', 'Power Jerk', 'Incline DB Press', '', null].map(f), Array(6).fill(null));   // podobne słowa to za mało
});

test('exInfo_ i missingExercises_: kompleksy składają się z części', () => {
  const ix = C.exIndex_(CW);
  assert.deepEqual(plain(C.exInfo_(ix, 'Hang Clean (nad kolanem) + Jerk')), { found: true, infos: [{ n: 'Hang Clean', u: 'https://example.test/hc' }, { n: 'Jerk', u: 'https://example.test/jerk' }], parts: [], swaps: [], group: '' });
  assert.deepEqual(plain(C.exInfo_(ix, 'Hang Clean + Hang Clean + Nieznane').infos), [{ n: 'Hang Clean', u: 'https://example.test/hc' }]);
  assert.deepEqual(plain(C.exInfo_(ix, 'Przysiad tylny + SL RDL').parts), ['czworogłowe', 'pośladki', 'dwugłowe uda']);
  assert.deepEqual(plain(C.exInfo_(ix, 'Back Squat')), { found: true, infos: [{ n: 'Przysiad tylny', u: 'https://example.test/przysiad' }], parts: ['czworogłowe', 'pośladki'], swaps: ['Leg press', 'Hack'], group: 'PS' });
  assert.deepEqual(plain(C.exInfo_(ix, 'Nieznane + Inne')), { found: false, infos: [], parts: [], swaps: [], group: '' });
  const plan = [{ cwiczenie: 'Przysiad tylny' }, { cwiczenie: 'Żuraw' }, { cwiczenie: 'martwy ciąg' }, { cwiczenie: 'Martwy  ciąg' }, { cwiczenie: 'Back Squat (wysoko)' }, { cwiczenie: 'Jerk + Żuraw' }, { cwiczenie: '' }];
  assert.deepEqual(Array.from(C.missingExercises_(plan, CW)), ['martwy ciąg', 'Żuraw']);
  assert.deepEqual(Array.from(C.missingExercises_(plan, [])), ['Back Squat (wysoko)', 'Jerk + Żuraw', 'martwy ciąg', 'Przysiad tylny', 'Żuraw']);
});

test('cwSync_: nowe wiersze, dopisane aliasy, usuwane zaślepki; ręczne wpisy zostają', () => {
  const baza = [['Front Squat', 'abcdefghijk', 'czworogłowe', 'Przysiad przedni; FS'], ['Nowe', 'IDID_123-xy', 'barki; triceps', 'Nowe 2'], ['Bez filmu', '', 'łydki', ''], ['', 'x', '', '']];
  const sheet = CW.concat([{ cwiczenie: 'Przysiad przedni (pauza)' }, { cwiczenie: 'Żuraw' }, { cwiczenie: 'Front Squat' }]);
  sheet[10] = Object.assign({}, sheet[10], { aliasy: 'fs; Mój alias' });
  const s = plain(C.cwSync_(baza, sheet));
  assert.deepEqual(s.add, [['Nowe', 'Nowe 2', 'https://www.youtube.com/watch?v=IDID_123-xy', 'barki; triceps', '', ''], ['Bez filmu', '', '', 'łydki', '', '']]);
  assert.deepEqual(s.aliases, [{ i: 10, value: 'fs; Mój alias; Przysiad przedni' }]);   // ręczny alias zostaje, „FS” już jest
  assert.deepEqual(s.drop, [11, 13]);                                            // zaślepki z dopasowaniem; „Żuraw” zostaje do uzupełnienia
  assert.deepEqual(plain(C.cwSync_(baza, [])).add.length, 3);
  assert.deepEqual(plain(C.cwSync_(baza, sheet, { 'Front Squat': 'FS; inny' })).aliases, [{ i: 10, value: 'Mój alias; Przysiad przedni; FS' }]);   // wycofany alias znika… i wraca tylko, gdy nadal jest w bazie
  assert.deepEqual(plain(C.cwSync_([['Front Squat', 'abcdefghijk', '', '']], sheet, { 'Front Squat': 'fs' })).aliases, [{ i: 10, value: 'Mój alias' }]);
  assert.deepEqual(plain(C.cwBaza_([['A', 'id1', 'p', 'x'], ['B', 'id2', '']], { A: 'y; z', B: 'b' }, [['D', 'd1; d2', 'łydki']])),
    [['A', 'id1', 'p', 'x; y; z'], ['B', 'id2', '', 'b'], ['D', '', 'łydki', 'd1; d2']]);
});

test('zaślepka nie zasłania aliasu, „tempo” to dopisek', () => {
  const rows = [{ cwiczenie: 'Split Squat', aliasy: 'Split Stance Squat', instruktaz: 'https://example.test/ss' }, { cwiczenie: 'Split Stance Squat' }];
  const ix = C.exIndex_(rows);
  assert.equal(C.exFind_(ix, 'Split Stance Squat').name, 'Split Squat');
  assert.equal(C.exFind_(ix, 'Split squat (tylna stopa na podłodze), tempo 3-1-1').name, 'Split Squat');
  assert.deepEqual(Array.from(C.missingExercises_([{ cwiczenie: 'Split Stance Squat' }, { cwiczenie: 'Żuraw' }], rows.concat([{ cwiczenie: 'Żuraw' }]))), ['Żuraw']);
});

test('CW_BAZA, CW_ALIASY, CW_DODATKI: baza ćwiczeń do wczytania', () => {
  const B = Array.from(C.CW_BAZA), PARTS = ['pośladki', 'dwugłowe uda', 'czworogłowe', 'barki', 'prostowniki grzbietu', 'brzuch', 'plecy', 'triceps', 'skośne brzucha', 'kapturowe', 'biceps', 'klatka', 'przywodziciele', 'przedramiona'];
  assert.equal(B.length, 624);
  assert.equal(new Set(B.map(b => C.exKey_(b[0]))).size, B.length);
  B.forEach(b => { assert.ok(b.length === 3 || b.length === 4); assert.match(b[1], /^[\w-]{6,20}$/); b[2].split('; ').filter(Boolean).forEach(p => assert.ok(PARTS.includes(p), b[0] + ': ' + p)); });
  const names = B.map(b => b[0]), D = Array.from(C.CW_DODATKI);
  Object.keys(C.CW_ALIASY).forEach(k => assert.ok(names.includes(k), 'alias do nieistniejącego ćwiczenia: ' + k));
  D.forEach(d => { assert.equal(d.length, 3); assert.ok(!names.includes(d[0]), d[0]); assert.ok(d[2]); });
  const all = C.cwBaza_(B, C.CW_ALIASY, D), s = C.cwSync_(all, []);
  assert.equal(s.add.length, 624 + D.length);
  const rows = plain(s.add).map(r => Object.fromEntries(C.CW_HEADERS.map((h, i) => [h, r[i]]))), ix = C.exIndex_(rows), f = n => (C.exFind_(ix, n) || {}).name || null;
  const keys = {}; rows.forEach(r => [r.cwiczenie].concat(r.aliasy.split(';')).map(C.exKey_).filter(Boolean).forEach(k => { assert.ok(!keys[k], 'powtórzona nazwa lub alias: ' + k); keys[k] = 1; }));
  assert.deepEqual(plain(C.cwSync_(all, rows)), { add: [], aliases: [], drop: [] });   // drugie wczytanie nic nie zmienia
  assert.deepEqual(['Snatch Pull', 'Power Clean from Block', 'Chin Up', 'DB Lateral Raise', 'SL RDL', 'Block Power Snatch (nad kolanem)', 'Jerk Dip z pauzą 3 s', 'Back Squat 1¼'].map(f),
    ['Snatch Pull', 'Block Power Clean', 'Chin-up', 'Dumbbell Lateral Raise', 'Single-Leg RDL', 'Block Power Snatch', 'Jerk Dip', '1-1/4 Back Squat']);
  assert.deepEqual(['Przysiad tylny', 'Ciąg rwaniowy (z podłogi, do pełnego wyprostu)', 'Wykroki bułgarskie (hantle), tempo 3-1-X', 'Sotts Press', 'Wypychanie na suwnicy', 'Power jerk z rack — 2 s pauza w dipie + 3 s fiksacja'].map(f),
    ['Back Squat', 'Snatch Pull', 'Bulgarian Split Squat', 'Press In Snatch (Sots Press)', 'Leg Press', 'Pause Power Jerk']);
  assert.deepEqual(['Ring Dips', 'Hanging Knee Raise', 'Pin OHS'].map(f), ['Ring Dip', 'Hanging Knee Raise', 'Pin Overhead Squat']);   // regresja i inny sprzęt to osobne ćwiczenia
  Object.keys(C.CW_WYCOFANE).forEach(k => { assert.ok(names.includes(k)); C.CW_WYCOFANE[k].split(';').forEach(a => assert.ok(!((C.CW_ALIASY[k] || '').split(';').map(C.exKey_).includes(C.exKey_(a))), a)); });
  const old = rows.map(r => r.cwiczenie === 'Dip' ? Object.assign({}, r, { aliasy: 'Ring Dips; Dipy' }) : r);
  assert.deepEqual(plain(C.cwSync_(all, old, C.CW_WYCOFANE)), { add: [], aliases: [{ i: old.findIndex(r => r.cwiczenie === 'Dip'), value: 'Dipy' }], drop: [] });
  assert.deepEqual(['Slow Snatch', 'Ring Y-Raise', 'Drop Squat to Jump'].map(f), Array(3).fill(null));   // bez zgadywania: alias albo własny wiersz
  assert.deepEqual(C.exInfo_(ix, 'Hang Clean (nad kolanem) + Jerk').infos.map(i => i.n), ['Hang Clean', 'Split Jerk']);   // „Jerk” to alias Split Jerk
  assert.deepEqual([C.exInfo_(ix, 'Snatch').parts.length, C.exInfo_(ix, 'Back Squat').parts.length > 0, C.exInfo_(ix, 'Suwnica').infos.length], [0, true, 0]);   // boje bez partii, dodatki bez filmu
});

test('computeParts_: serie i serie twarde na partię, zamiana liczy zamiennik', () => {
  const plan = [{ klient: 'robert', tydzien: 1, jednostka: 'T1', nr: 1, cwiczenie: 'Przysiad tylny' }, { klient: 'robert', tydzien: 1, jednostka: 'T1', nr: 2, cwiczenie: 'Wiosłowanie hantlem' },
    { klient: 'robert', tydzien: 1, jednostka: 'T1', nr: 3, cwiczenie: 'Plank' }];
  const L = (nr, cw, s, x) => Object.assign({ klient: 'robert', tydzien: 1, jednostka: 'T1', data: d(1, 0), nr_cw: nr, cwiczenie: cw, seria: s, kg: 100, powt: 5, rpe: 6, wykonane: 'TAK', typ: '' }, x || {});
  const log = [L(1, 'Przysiad tylny', 'R1'), L(1, 'Przysiad tylny', 1), L(1, 'Back Squat (pauza)', 2, { rpe: 8 }), L(1, 'Przysiad tylny', 3, { typ: 'FAIL', rpe: '' }),
    L(1, 'Leg press', 4, { rpe: 9, kg: 200 }), L(1, 'Przysiad tylny', 'D1', { kg: 80 }), L(1, 'Przysiad tylny', 5, { wykonane: '' }),
    L(2, 'Wiosłowanie hantlem', 1, { kg: 30, rpe: 7 }), L(2, 'Nieznane', 2, { kg: 30 }), L(3, 'Plank', 1, { kg: 'BW' })];
  const rows = C.computeParts_(plan, log, [], CW);
  assert.deepEqual(plain(rows), [
    ['robert', d(1, 0), 'czworogłowe', 5, 4, 500 + 500 + 500 + 1000 + 400],      // 5 serii (bez R1 i niewykonanej), twarde: RPE 8, FAIL, RPE 9, drop
    ['robert', d(1, 0), 'plecy', 2, 1, 300],                                    // „Nieznane” liczone wg nazwy z planu (nr 2)
    ['robert', d(1, 0), 'pośladki', 4, 3, 500 + 500 + 500 + 400]]);             // przysiad liczy się do obu partii, leg press tylko do czworogłowych
  assert.deepEqual(Array.from(C.computeParts_(plan, log, [], [])), []);          // pusta baza = brak wierszy
});

// --- alert mailowy: tylko nowe czerwone sygnały ---
test('alertMail_: mail tylko przy nowym czerwonym sygnale, bez powtórek', () => {
  const H = C.PRZ_HEADERS, row = o => H.map(h => o[h] === undefined ? '' : o[h]);
  const ov = [row({ klient: 'anna', imie: 'Anna', pilnosc: 7, czerwone: 2, do_reakcji: 'ból kolano 5/10 (06.10); 2× FAIL: Przysiad; zaległe: T1 10.10' }),
    row({ klient: 'ewa', imie: '', pilnosc: 3, czerwone: 1, do_reakcji: 'dyspozycja: Zmęczenie (11.10)' }),
    row({ klient: 'dan', imie: 'Dan', pilnosc: 4, czerwone: 0, do_reakcji: 'plan skończony; brak treningu od 41 dni; brak planu; zaległe: T2 01.10' })];
  const m = C.alertMail_(ov, '', 'https://example.test/arkusz');
  assert.equal(m.send, true);
  assert.equal(m.subject, 'Trening: 2 klientów do reakcji');
  assert.equal(m.sig, 'anna|ból kolano 5/10 (06.10)\nanna|2× FAIL: Przysiad\newa|dyspozycja: Zmęczenie (11.10)');
  assert.match(m.body, /^Nowe sygnały do reakcji:\n• Anna: ból kolano 5\/10 \(06\.10\); 2× FAIL: Przysiad\n   poza tym: zaległe: T1 10\.10\n• ewa: dyspozycja: Zmęczenie \(11\.10\)\n\nSzczegóły w zakładce Przegląd:\nhttps:\/\/example\.test\/arkusz\n/);
  assert.ok(!/Dan|plan skończony/.test(m.body));                                 // same pomarańczowe sygnały nie trafiają do maila
  assert.deepEqual([C.alertMail_(ov, m.sig).send, C.alertMail_(ov, m.sig).sig], [false, m.sig]);   // następnego dnia to samo → bez maila
  const m2 = C.alertMail_(ov, 'anna|ból kolano 5/10 (06.10)\newa|dyspozycja: Zmęczenie (11.10)');   // doszedł FAIL u Anny
  assert.equal(m2.subject, 'Trening: 1 klient do reakcji');
  assert.match(m2.body, /^Nowe sygnały do reakcji:\n• Anna: [^\n]+\n[^\n]+\n\nBez zmian od poprzedniego alertu:\n• ewa: [^\n]+\n\nSzczegóły w zakładce Przegląd\.\n/);
  assert.deepEqual(plain(C.alertMail_([ov[2]], 'stary|sygnał')), { send: false, subject: '', body: '', sig: '' });
  assert.equal(C.alertMail_([], '').send, false);
});
