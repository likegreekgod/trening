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
