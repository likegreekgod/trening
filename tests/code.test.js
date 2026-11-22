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

test('mergePlan_: zastepuje zamyka niezrobione jednostki bloku od pierwszej daty z pliku', () => {
  const R = (k, w, j, data, blok, x) => Object.assign({ klient: k, tydzien: w, jednostka: j, data, nr: 1, cwiczenie: 'X', serie: 3, powt: '5', blok }, x);
  const existing = [
    R('robert', 1, 'T1', '2026-10-05', 'B1'),                    // zrobiona → zostaje
    R('robert', 1, 'T2', '2026-10-07', 'B1'),                    // przed datą z pliku, niezrobiona
    R('robert', 2, 'T1', '2026-10-12', 'B1'),                    // zamknięta
    R('robert', 2, 'T2', '2026-10-14', 'B1'),                    // zamknięta
    R('robert', 2, 'W1', '2026-10-13', 'B1', { zrodlo: 'klient' }), // własny trening → zostaje
    R('ewa', 1, 'T1', '2026-10-12', 'B1')                        // inny klient → zostaje
  ];
  const ses = [{ klient: 'robert', tydzien: 1, jednostka: 'T1' }];
  const inc = [R('robert', 3, 'T1', '2026-10-12', 'B2', { zastepuje: 'B1' }), R('robert', 3, 'T2', '2026-10-14', 'B2')];
  let m = C.mergePlan_(existing, inc, ses);
  assert.equal(m.errors.length, 0);
  assert.deepEqual(Array.from(m.notes), ['robert: zamknięto 2 jedn. bloku B1']);
  // tyg. 1 T2 (B1, przed datą z pliku) zostaje: plik ma tylko blok B2, a zastepuje zamyka od daty pliku
  assert.deepEqual(m.rows.map(r => r.klient + r.tydzien + r.jednostka), ['ewa1T1', 'robert1T1', 'robert1T2', 'robert2W1', 'robert3T1', 'robert3T2']);
  assert.deepEqual(m.removed.map(g => g.text), ['usunięto: robert tydz. 2 jednostka T1 (blok B1)', 'usunięto: robert tydz. 2 jednostka T2 (blok B1)']);
  assert.equal(C.importStatus_(m), 'OK (usunięto 2)');
  // nieistniejący blok = uwaga, nie błąd
  m = C.mergePlan_(existing, [R('robert', 3, 'T1', '2026-10-12', 'B2', { zastepuje: 'B9' })], ses);
  assert.deepEqual([m.errors.length, m.notes.length], [0, 0]);
  assert.match(m.warnings.join(), /B9.*nie ma takiego bloku/);
  // bez zastepuje: bez notatek
  assert.equal(C.mergePlan_(existing, [R('robert', 3, 'T1', '2026-10-12', 'B2')], ses).notes.length, 0);
});

test('validatePlan_: zastepuje tekstem, jeden blok na klienta', () => {
  const row = { klient: 'robert', tydzien: 7, jednostka: 'T1', nr: 1, cwiczenie: 'Przysiad', serie: 3, powt: '5', blok: 'B2', zastepuje: 'B1' };
  assert.deepEqual(Array.from(C.validatePlan_([row, Object.assign({}, row, { nr: 2, zastepuje: '' })])), []);
  assert.match(C.validatePlan_([Object.assign({}, row, { zastepuje: 1 })]).join(), /zastepuje/);
  assert.match(C.validatePlan_([row, Object.assign({}, row, { nr: 2, zastepuje: 'B0' })]).join(), /jeden blok/);
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

test('Bloki „dla_klienta” i notatka do jednostki (uwagi_jedn): nagłówki, przenoszenie przy przeliczeniu, getData, walidacja planu', () => {
  const H = C.BLOK_HEADERS, K = H.indexOf('dla_klienta'), W = H.indexOf('wnioski');
  assert.deepEqual(Array.from(H.slice(-2)), ['wnioski', 'dla_klienta']);            // nowa kolumna na końcu
  const row = b => { const r = H.map(() => ''); r[0] = 'robert'; r[1] = b; return r; };
  const old = [{ klient: 'robert', blok: 'B1', wnioski: '', dla_klienta: 'Dobry blok, w B2 więcej rwania' },
    { klient: 'robert', blok: 'B2', wnioski: 'tylko dla mnie', dla_klienta: '' }, { klient: 'robert', blok: 'B0', wnioski: '', dla_klienta: 'stary' }];
  const out = C.keepNotes_([row('B1'), row('B2')], old), by = b => out.find(r => r[1] === b);
  assert.equal(by('B1')[K], 'Dobry blok, w B2 więcej rwania'); assert.equal(by('B1')[W], '');
  assert.equal(by('B2')[W], 'tylko dla mnie'); assert.equal(by('B2')[K], '');
  assert.equal(by('B0')[K], 'stary');                                              // blok spoza planu zostaje z notatką
  assert.ok(out.every(r => r.length === H.length));
  // do aplikacji idzie tylko „dla_klienta” tego klienta, nigdy „wnioski”
  const tab = old.concat([{ klient: 'Anna', blok: 'B1', dla_klienta: 'cudze' }, { klient: 'robert', blok: 'B3', dla_klienta: '   ' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(C.blockNotes_(tab, 'robert'))), { B1: 'Dobry blok, w B2 więcej rwania', B0: 'stary' });
  assert.deepEqual(JSON.parse(JSON.stringify(C.blockNotes_([], 'robert'))), {});
  // plan: uwagi_jedn opcjonalne, w jednej jednostce jedna treść
  const R = (nr, o) => Object.assign({ klient: 'robert', tydzien: 1, jednostka: 'T1', nr, cwiczenie: 'Przysiad', serie: 3, powt: '5' }, o || {});
  assert.deepEqual(Array.from(C.validatePlan_([R(1, { uwagi_jedn: 'Dziś lżej' }), R(2), R(1, { jednostka: 'T2', uwagi_jedn: 'Inna' })])), []);
  assert.deepEqual(Array.from(C.validatePlan_([R(1, { uwagi_jedn: 'Dziś lżej' }), R(2, { uwagi_jedn: 'Dziś lżej ' })])), []);
  assert.match(C.validatePlan_([R(1, { uwagi_jedn: 'A' }), R(2, { uwagi_jedn: 'B' })])[0], /uwagi_jedn różne/);
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

test('trKlientOf_ i trKlientVals_: klienci w panelu trenera (ustawienia ↔ wiersz Klienci)', () => {
  const row = ['kabc', 'Ania', 'Ania', '', 'stary-link', 'tak', 'PROSTY', 2, 'TAK', 'TAK', 'RIR', 0.075, '', 'TAK'];
  const k = C.trKlientOf_(row, 'https://x.github.io/trening/');
  assert.deepEqual(JSON.parse(JSON.stringify(k)), { id: 'ania', name: 'Ania', on: true, mode: 'PROSTY', scale: 'RIR', swap: 'TRENER', pain: true, masters: true,
    extra: 2, oly: 7.5, own: true, edit: true, link: 'https://x.github.io/trening/?k=kabc', email: '', mail: false });
  // pusty wiersz = wartości domyślne; bez adresu aplikacji link z kolumny E
  const d = C.trKlientOf_(['k1', 'bo', 'Bo', 'NIE', 'link-E'], '');
  assert.equal(d.on, false); assert.equal(d.mode, 'PRO'); assert.equal(d.swap, 'NIE'); assert.equal(d.oly, 5); assert.equal(d.own, true); assert.equal(d.link, 'link-E');
  // panel → kolumny D, F–N
  const v = C.trKlientVals_({ on: false, mode: 'PRO', scale: 'RPE', swap: 'DOWOLNA', pain: true, masters: false, extra: 3, oly: 7.5, own: false, edit: true });
  assert.deepEqual(JSON.parse(JSON.stringify(v.vals)), { 3: 'NIE', 5: 'TAK', 6: 'PRO', 7: 3, 8: '', 9: 'DOWOLNA', 10: 'RPE', 11: 0.075, 12: 'NIE', 13: 'TAK', 14: '', 15: '' });
  // zapis i odczyt dają to samo (np. sufit 7,5% → 0,075 → 7,5)
  const r2 = ['k', 'x', 'X']; Object.keys(v.vals).forEach(i => { r2[i] = v.vals[i]; });
  const back = C.trKlientOf_(r2, '');
  assert.equal(back.oly, 7.5); assert.equal(back.swap, 'DOWOLNA'); assert.equal(back.own, false); assert.equal(back.on, false); assert.equal(back.extra, 3);
  assert.equal(C.trKlientOf_(r2.map((x, i) => i === 11 ? 0 : x), '').oly, 0, 'sufit 0% zostaje zerem');
  const base = Object.assign({}, C.KL_DOMYSLNE);
  assert.ok(C.trKlientVals_(base).vals);
  assert.match(C.trKlientVals_(Object.assign({}, base, { extra: 6 })).error, /0–5/);
  assert.match(C.trKlientVals_(Object.assign({}, base, { extra: 1.5 })).error, /0–5/);
  assert.match(C.trKlientVals_(Object.assign({}, base, { oly: 25 })).error, /0–20/);
  assert.match(C.trKlientVals_(Object.assign({}, base, { swap: 'TAK' })).error, /Zamiana/);
  assert.match(C.trKlientVals_(Object.assign({}, base, { mode: 'X' })).error, /Tryb/);
  assert.match(C.trKlientVals_(Object.assign({}, base, { scale: '' })).error, /Skala/);
  // poranny mail: kolumny O email, P mail_rano; włączony bez adresu albo zły adres = błąd
  const m = C.trKlientVals_(Object.assign({}, base, { email: ' bo@example.com ', mail: true }));
  assert.equal(m.vals[14], 'bo@example.com'); assert.equal(m.vals[15], 'TAK');
  const r3 = ['k', 'x', 'X']; Object.keys(m.vals).forEach(i => { r3[i] = m.vals[i]; });
  assert.equal(C.trKlientOf_(r3, '').email, 'bo@example.com'); assert.equal(C.trKlientOf_(r3, '').mail, true);
  assert.match(C.trKlientVals_(Object.assign({}, base, { mail: true })).error, /wpisz najpierw e-mail/);
  assert.match(C.trKlientVals_(Object.assign({}, base, { email: 'bo@', mail: false })).error, /adres e-mail/);
  assert.equal(C.trKlientVals_(Object.assign({}, base, { email: 'bo@example.com', mail: false })).vals[15], '', 'adres zostaje, mail wyłączony');
  // nazwy akcji panelu nie pokrywają się z akcjami klientów
  ['trKlienci', 'trKlientUstaw', 'trKlientNowy', 'trKlientLink', 'trMail', 'trMailUstaw', 'trMailProba'].forEach(n => { assert.ok(C.TR_FNS[n], n); assert.equal(C.API_FNS[n], undefined); });
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
  assert.equal(v(a, 'filmy_bez_kom_7dni'), 1);                                // film bez komentarza trenera
  const log2 = log.map(l => l.film_link ? Object.assign({}, l, { komentarz_dysk: '0:03 łokcie' }) : l);
  assert.equal(v(C.computeOverview_(plan, log2, ses, klienci, dys, sum, { today })[0], 'filmy_bez_kom_7dni'), '');
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
  assert.ok(!/porannyMail/.test(txt), 'bez włączonego maila nie ma uwagi o wyzwalaczu');
  // poranny mail włączony: brak wyzwalacza = błąd, brak adresu = uwaga
  const m = C.diagnose_(Object.assign({}, ok, { klienci: [K('anna', 'k0123456789a', { mail_rano: 'TAK', email: '' })] })).map(r => r[0] + ': ' + r[1]).join('\n');
  assert.ok(m.includes('błąd: Brak wyzwalacza „porannyMail”'), m);
  assert.ok(m.includes('uwaga: anna: poranny mail włączony, ale brak poprawnego adresu'), m);
  assert.deepEqual(Array.from(C.diagnose_(Object.assign({}, ok, { triggers: ok.triggers.concat('porannyMail'), klienci: [K('anna', 'k0123456789a', { mail_rano: 'TAK', email: 'a@example.com' })] }))), []);
});

test('poranny mail: komu wysłać (rannyDo_), jednostka (rannyUnit_) i treść (rannyMail_)', () => {
  const today = '2026-11-24';
  // A klucz, B id, C imię, D aktywny, … G tryb, … K skala, … O email, P mail_rano
  const K = (id, x) => { const r = ['k0123456789' + id.charAt(0), id, id.charAt(0).toUpperCase() + id.slice(1), 'TAK', '', '', 'PRO', 0, '', '', 'RPE', '', '', '', id + '@example.com', 'TAK'];
    Object.keys(x || {}).forEach(i => { r[i] = x[i]; }); return r; };
  const P = (k, w, j, data, nr, x) => Object.assign({ klient: k, tydzien: w, jednostka: j, tytul: 'Siła ' + j, data, nr, cwiczenie: 'Ćw ' + nr, prio: 'A', serie: 4, powt: '5', kg: '100', procent: 0.75, rpe_max: 8, blok: 'B2' }, x || {});
  const plan = [P('ania', 7, 'A', '2026-11-23', 1), P('ania', 8, 'A', today, 1), P('ania', 8, 'A', today, 2, { prio: 'B', kg: 'guma', procent: '', rpe_max: '', uwagi_jedn: 'Pauza 2 s' }),
    P('ania', 8, 'B', '2026-11-26', 1), P('ania', 8, 'W1', today, 1, { zrodlo: 'klient' }), P('ania', 8, 'A', today, 51, { zrodlo: 'dodane' }),
    P('bartek', 8, 'A', today, 1), P('celina', 8, 'A', '', 1), P('dawid', 8, 'A', today, 1), P('ewa', 8, 'A', today, 1), P('filip', 8, 'A', today, 1)];
  const kl = [K('ania'), K('bartek'), K('celina'), K('dawid', { 15: '' }), K('ewa', { 3: 'NIE' }), K('filip', { 14: '' })];
  const ses = [{ klient: 'bartek', tydzien: 8, jednostka: 'A' }];
  const list = C.rannyDo_(kl, plan, [], ses, today);
  // Bartek już zaczął, Celina bez daty, Dawid bez przełącznika, Ewa nieaktywna, Filip bez adresu
  assert.deepEqual(list.map(x => x.c.id), ['ania']);
  assert.equal(list[0].email, 'ania@example.com');
  assert.equal(list[0].units.length, 1, 'własny trening nie liczy się jako jednostka do maila');
  assert.deepEqual(list[0].units[0].map(r => r.nr), [1, 2], 'bez ćwiczeń dodanych przez klienta');
  // seria w Logu też znaczy „zaczęty”
  assert.equal(C.rannyDo_(kl, plan, [{ klient: 'Ania', tydzien: '8', jednostka: 'A' }], ses, today).length, 0);
  // data jako Date z arkusza przez dayOf
  assert.equal(C.rannyDo_([K('ania')], [P('ania', 8, 'A', new Date(2026, 10, 24), 1)], [], [], today, v => v instanceof Date ? '2026-11-24' : String(v)).length, 1);

  const u = C.rannyUnit_(list[0].units[0], plan);
  assert.equal(u.title, 'Siła A'); assert.equal(u.note, 'Pauza 2 s');
  assert.equal(u.meta, 'Blok B2 · tydz. 2 · 2 ćwiczenia · ok. 20 min');       // tydz. 7 i 8 bloku B2; 4×(45+120) + 4×(45+90) s = 20 min
  assert.equal(C.plDay_(today), 'wtorek 24.11');

  const pro = C.rannyMail_(C.clientOf_(K('ania')), [u], { url: 'https://x.test/?k=k0123456789a', day: today });
  assert.equal(pro.subject, 'Dziś trening: Siła A');
  assert.match(pro.body, /\[A\] Ćw 1: 4 × 5 · 100 kg · 75% · RPE ≤ 8/);
  assert.match(pro.body, /\[B\] Ćw 2: 4 × 5 · guma/);
  assert.match(pro.body, /Od trenera: Pauza 2 s/);
  assert.match(pro.html, /href="https:\/\/x\.test\/\?k=k0123456789a"/);
  assert.match(pro.html, /Cześć Ania!/);
  const rir = C.rannyMail_(C.clientOf_(K('ania', { 10: 'RIR' })), [u], { day: today });
  assert.match(rir.body, /RIR ≥ 2/); assert.ok(!/Otwórz trening/.test(rir.html), 'bez adresu bez przycisku');
  const prosty = C.rannyMail_(C.clientOf_(K('ania', { 6: 'PROSTY' })), [C.rannyUnit_([P('ania', 8, 'A', today, 1, { kg: '62.5', rpe_max: 7.5 })], plan)], { day: today, test: true });
  assert.match(prosty.body, /4 × 5 · 62,5 kg · zapas 2,5 powt\./); assert.ok(!/%/.test(prosty.body.split('Dziś')[1]), 'PROSTY bez %');
  assert.equal(prosty.subject, '[Próba] Dziś trening: Siła A');
  // tekst z arkusza nie wchodzi do HTML jako znaczniki
  const x = C.rannyMail_(C.clientOf_(K('ania', { 2: '<b>A</b>' })), [C.rannyUnit_([P('ania', 8, 'A', today, 1, { cwiczenie: '<img src=x>' })], plan)], { day: today });
  assert.ok(!/<img/.test(x.html) && !/<b>A<\/b>/.test(x.html));
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
  assert.deepEqual(plain(C.cwBaza_([], {}, [], [['F', 'klatka']])), [['F', '', 'klatka', '']]);
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
  D.forEach(d => { assert.equal(d.length, 3); assert.ok(!names.includes(d[0]), d[0]); assert.ok(d[1] || d[2], d[0]); });   // wiersz bez danych byłby zaślepką
  const F = Array.from(C.CW_FEDB), all = C.cwBaza_(B, C.CW_ALIASY, D, F), s = C.cwSync_(all, []);
  assert.equal(s.add.length, 624 + D.length + F.length);
  assert.ok(F.length > 700); F.forEach(x => { assert.equal(x.length, 2); assert.ok(x[0] && x[1], x[0]); });
  const rows = plain(s.add).map(r => Object.fromEntries(C.CW_HEADERS.map((h, i) => [h, r[i]]))), ix = C.exIndex_(rows), f = n => (C.exFind_(ix, n) || {}).name || null;
  const keys = {}; rows.forEach(r => [r.cwiczenie].concat(r.aliasy.split(';')).map(C.exKey_).filter(Boolean).forEach(k => { assert.ok(!keys[k], 'powtórzona nazwa lub alias: ' + k); keys[k] = 1; }));
  assert.deepEqual(plain(C.cwSync_(all, rows)), { add: [], aliases: [], drop: [] });   // drugie wczytanie nic nie zmienia
  assert.deepEqual(['Snatch Pull', 'Power Clean from Block', 'Chin Up', 'DB Lateral Raise', 'SL RDL', 'Block Power Snatch (nad kolanem)', 'Jerk Dip z pauzą 3 s', 'Back Squat 1¼'].map(f),
    ['Snatch Pull', 'Block Power Clean', 'Chin-up', 'Dumbbell Lateral Raise', 'Single-Leg RDL', 'Block Power Snatch', 'Jerk Dip', '1-1/4 Back Squat']);
  assert.deepEqual(['Przysiad tylny', 'Ciąg rwaniowy (z podłogi, do pełnego wyprostu)', 'Wykroki bułgarskie (hantle), tempo 3-1-X', 'Sotts Press', 'Wypychanie na suwnicy', 'Power jerk z rack — 2 s pauza w dipie + 3 s fiksacja'].map(f),
    ['Back Squat', 'Snatch Pull', 'Bulgarian Split Squat', 'Press In Snatch (Sots Press)', 'Leg Press', 'Pause Power Jerk']);
  assert.deepEqual(['Ring Dips', 'Hanging Knee Raise', 'Pin OHS', 'Pushup Hold (jak najgłębiej)', 'Pause Clean (2 s pod kolanem)'].map(f), ['Ring Dip', 'Hanging Knee Raise', 'Pin Overhead Squat', 'Push-Up Hold', 'Segment Clean']);   // regresja i inny sprzęt to osobne ćwiczenia
  Object.keys(C.CW_WYCOFANE).forEach(k => { assert.ok(names.includes(k)); C.CW_WYCOFANE[k].split(';').forEach(a => assert.ok(!((C.CW_ALIASY[k] || '').split(';').map(C.exKey_).includes(C.exKey_(a))), a)); });
  const old = rows.map(r => r.cwiczenie === 'Dip' ? Object.assign({}, r, { aliasy: 'Ring Dips; Dipy' }) : r);
  assert.deepEqual(plain(C.cwSync_(all, old, C.CW_WYCOFANE)), { add: [], aliases: [{ i: old.findIndex(r => r.cwiczenie === 'Dip'), value: 'Dipy' }], drop: [] });
  assert.deepEqual(['Slow Snatch', 'Single Arm Cable Pull (fixed on bench)', 'Barbell Squat', 'Jerk from blocks (cluster)', 'Dumbbell Bench Press'].map(f), ['Slow-Motion Snatch', 'Single-Arm Pulldown', 'Back Squat', 'Jerk From Blocks', 'Dumbbell Bench Press']);
  assert.deepEqual(['Snatch Pull z haka', 'Rot. wewn. biodra z gumą (siad na skrzyni)'].map(f), Array(2).fill(null));   // bez zgadywania: alias albo własny wiersz
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

test('orphanPlans_: wiersze Planu bez klienta w zakładce Klienci', () => {
  const klienci = [{ klient_id: 'Anna' }, { klient_id: 'jan-nowak', aktywny: 'NIE' }, { klient_id: '' }];
  const plan = [{ klient: 'anna' }, { klient: ' ANNA ' }, { klient: 'jan nowak' }, { klient: 'jan-nowak' }, { klient: 'jan' }, { klient: 'jan' }, { klient: '' }];
  assert.deepEqual(plain(C.orphanPlans_(plan, klienci)), { ids: { 'jan nowak': 1, jan: 2 }, n: 3 });   // nieaktywny klient zachowuje plan
  assert.deepEqual(plain(C.orphanPlans_(plan.slice(0, 2), klienci)), { ids: {}, n: 0 });
});

// --- komentarze trenera do filmów na Dysku ---
test('anchorSec_, commentLines_, fileIdOf_: komentarze Dysku z czasem w filmie', () => {
  assert.equal(C.fileIdOf_('https://drive.google.com/file/d/1AbC_def-GHIjklMNOpqrSTUvwxYZ012345/view?usp=drivesdk'), '1AbC_def-GHIjklMNOpqrSTUvwxYZ012345');
  assert.equal(C.fileIdOf_('https://drive.google.com/open?id=1AbC_def-GHIjklMNOpqrSTUvwxYZ012345'), '1AbC_def-GHIjklMNOpqrSTUvwxYZ012345');
  assert.deepEqual(['', 'tekst', 'https://example.test/film.mp4'].map(C.fileIdOf_), ['', '', '']);
  const sec = a => C.anchorSec_(a);
  assert.deepEqual([sec('{"timestamp":15}'), sec('{"r":"head","a":[{"vid":{"timeMs":15400}}]}'), sec({ region: { startTime: '0:15' } }), sec('{"startOffset":"15.5s"}'),
    sec('{"time":"PT75S"}'), sec('{"videoTime":"1:02:03"}'), sec('{"startTime":95000}')], [15, 15.4, 15, 15.5, 75, 3723, 95]);
  const real = '[null,null,null,"0B9xsrVcsVgjpZWp3N015RmlzOEZLVG1qNUU5TFhMVDk1bG13PQ",null,[[5,70999999]]]';   // kotwica z prawdziwego komentarza do filmu
  assert.deepEqual([sec(real), sec('[null,null,null,"x",null,[[75]]]'), sec('[null,null,null,"x",null,[[null,500000000]]]'), sec('[null,null,null,"x",null,[[0,0]]]')], [5.070999999, 75, 0.5, 0]);
  assert.deepEqual([sec('[null,null,null,"x"]'), sec('[]'), sec('[[["a"]]]')], [null, null, null]);
  assert.equal(C.commentLines_([{ content: 'Biodra', anchor: real }]).text, '0:05 Biodra');
  assert.deepEqual([sec('to nie json'), sec('{"page":3}'), sec(''), sec(null), sec('{"time":"jutro"}')], [null, null, null, null, null]);
  const c = C.commentLines_([{ content: ' Łokcie wyżej\nprzy 2. powtórzeniu ', anchor: '{"timestamp":75}', createdTime: '2026-10-12T10:00:00Z' },
    { content: 'Dobre zejście', anchor: '{"timestamp":15}', createdTime: '2026-10-12T10:05:00Z' }, { content: 'Ogólnie lepiej niż tydzień temu', createdTime: '2026-10-12T09:00:00Z' },
    { content: 'usunięty', deleted: true, anchor: '{"timestamp":1}' }, { content: 'załatwione', resolved: true }, { content: '   ' }, { content: 'bez czasu', anchor: '{"strona":2}', createdTime: '2026-10-12T11:00:00Z' }]);
  assert.equal(c.text, '0:15 Dobre zejście\n1:15 Łokcie wyżej przy 2. powtórzeniu\nOgólnie lepiej niż tydzień temu\nbez czasu');
  assert.equal(c.raw, '{"strona":2}');                                           // nierozpoznana kotwica wraca do pokazania w menu
  assert.deepEqual(plain(C.commentLines_([])), { text: '', raw: '' });
  // kolumny komentarzy zostają na swoich miejscach, odpowiedź klienta dopisana na końcu (stare wiersze się nie przesuwają)
  assert.deepEqual([C.LOG_HEADERS.slice(22), C.SES_HEADERS.slice(16), C.LOG_HEADERS.length, C.SES_HEADERS.length].map(x => plain(x)),
    [['komentarz_trenera', 'komentarz_dysk', 'odpowiedz_klienta', 'odpowiedz_at'], ['komentarz_trenera', 'odpowiedz_klienta', 'odpowiedz_at'], 26, 19]);
});

test('replyRow_: odpowiedź klienta tylko w jego wierszu, długość, pusty tekst = usunięcie', () => {
  assert.deepEqual(plain(C.replyRow_('ania', { kind: 'L', id: 'ania|7|T1|1|2', text: '  Dzięki!\r\nJasne  ' })), { kind: 'L', id: 'ania|7|T1|1|2', text: 'Dzięki!\nJasne' });
  assert.deepEqual(plain(C.replyRow_('ania', { kind: 'S', id: 'ania|7|T1', text: '' })), { kind: 'S', id: 'ania|7|T1', text: '' });
  assert.throws(() => C.replyRow_('ania', { kind: 'L', id: 'bartek|7|T1|1|2', text: 'x' }), /Brak dostępu/);   // cudzy wiersz
  assert.throws(() => C.replyRow_('ania', { kind: 'L', id: 'aniak|7|T1|1|2', text: 'x' }), /Brak dostępu/);   // podobne id innego klienta
  assert.throws(() => C.replyRow_('ania', { kind: 'X', id: 'ania|7|T1', text: 'x' }), /Nieznany/);
  assert.throws(() => C.replyRow_('ania', { kind: 'S', id: 'ania|7|T1', text: 'a'.repeat(601) }), /za długa/);
});

test('fillBlocks_: pusty blok = ostatni blok klienta albo B1', () => {
  const plan = [{ klient: 'anna', blok: '' }, { klient: 'Anna', blok: 'B2' }, { klient: 'anna' }, { klient: 'bob', blok: ' ' }, { klient: 'bob', blok: null }, { klient: '', blok: '' }, { klient: 'ewa', blok: 'B1' }];
  assert.deepEqual(plain(C.fillBlocks_(plan)), { rows: [[0, 'B1'], [2, 'B2'], [3, 'B1'], [4, 'B1']], ids: { anna: 2, bob: 2 } });
  assert.deepEqual(plain(C.fillBlocks_([{ klient: 'ewa', blok: 'B1' }])), { rows: [], ids: {} });
});

test('rangeNext_ i adres sesji: wznowienie wysyłki filmu', () => {
  assert.deepEqual(['bytes=0-8388607', 'bytes=0-0', '', undefined, 'zły'].map(C.rangeNext_), [8388608, 1, 0, 0, 0]);
  assert.ok(C.UPLOAD_URL_.test('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink&upload_id=ABC-123_x'));
  assert.ok(!C.UPLOAD_URL_.test('https://example.test/upload/drive/v3/files?upload_id=ABC'));
  assert.ok(!C.UPLOAD_URL_.test('https://www.googleapis.com/drive/v3/files/abc'));
  assert.ok(C.API_FNS.uploadStatus && C.API_FNS.logVideo);
});

// --- własny trening klienta ---
test('ownRows_: walidacja i wiersze Planu własnej jednostki', () => {
  const plan = [{ klient: 'anna', tydzien: 2, jednostka: 'T1', blok: 'B1' }, { klient: 'anna', tydzien: 2, jednostka: 'W1', zrodlo: 'klient', blok: 'B1' }];
  const u = { week: 2, day: 'W2', date: '2026-10-16', title: ' Ramiona ', exercises: [{ name: ' Hammer  Curl ', sets: 3, reps: 10, kg: '12,5' }, { name: 'Pull-up', sets: 3, reps: '6', kg: 'BW' }, { name: '' }] };
  const r = plain(C.ownRows_('anna', u, plan));
  assert.deepEqual(r.rows.map(x => [x.jednostka, x.nr, x.cwiczenie, x.serie, x.powt, x.kg, x.tytul, x.blok, x.zrodlo, x.prio]),
    [['W2', 1, 'Hammer Curl', 3, '10', 12.5, 'Własny · Ramiona', 'B1', 'klient', 'A'], ['W2', 2, 'Pull-up', 3, '6', 'BW', 'Własny · Ramiona', 'B1', 'klient', 'A']]);
  assert.equal(C.ownRows_('anna', Object.assign({}, u, { title: '' }), plan).rows[0].tytul, 'Własny');
  const err = x => C.ownRows_('anna', Object.assign({}, u, x), plan).error;
  assert.deepEqual([err({ day: 'T1' }), err({ day: 'W1x' }), err({ week: 0 }), err({ date: '16.10' }), err({ exercises: [] }), err({ exercises: [{ name: 'X', sets: 0, reps: 5 }] }), err({ exercises: [{ name: 'X', sets: 3, reps: '' }] })],
    ['Zła jednostka.', 'Zła jednostka.', 'Zła jednostka.', 'Zła data.', 'Dodaj co najmniej jedno ćwiczenie.', 'Serie 1–40 i powtórzenia przy każdym ćwiczeniu.', 'Serie 1–40 i powtórzenia przy każdym ćwiczeniu.']);
  assert.equal(err({ exercises: [{ name: 'EMOM Power Snatch', sets: 20, reps: 1 }] }), undefined);       // EMOM 20 rund
  assert.equal(C.ownRows_('anna', Object.assign({}, u, { day: 'W1' }), [{ klient: 'anna', tydzien: 2, jednostka: 'W1' }]).error, 'Ta jednostka jest w planie trenera.');
  assert.equal(C.ownRows_('anna', Object.assign({}, u, { exercises: Array(21).fill({ name: 'X', sets: 1, reps: 1 }) }), plan).error, 'Najwyżej 20 ćwiczeń.');
  assert.ok(C.API_FNS.addOwnUnit);
  assert.deepEqual(Array.from(C.PLAN_HEADERS.slice(-6)), ['zrodlo', 'tryb', 'ciecie', 'serie_min', 'obwod', 'uwagi_jedn']);   // nowe kolumny na końcu
});

test('mergePlan_: plik usuwa niezrobione jednostki tylko z bloków, które sam zawiera; zrobiona = Sesje albo Log', () => {
  const R = (w, j, blok, x) => Object.assign({ klient: 'damian', tydzien: w, jednostka: j, nr: 1, cwiczenie: 'Rwanie', serie: 3, powt: '2', blok }, x || {});
  const H1 = [R(9, 'S1', 'H1'), R(9, 'S2', 'H1'), R(10, 'S1', 'H1'), R(10, 'S2', 'H1')];
  const H2 = [11, 12, 13, 14, 15].flatMap(w => [R(w, 'S1', 'H2'), R(w, 'S2', 'H2'), R(w, 'S1', 'H2', { nr: 2, cwiczenie: 'Przysiad' })]);
  const own = R(10, 'W1', '', { zrodlo: 'klient' }), ewa = Object.assign(R(1, 'T1', 'B1'), { klient: 'ewa' });
  const plan = H1.concat(H2, [own, ewa]);
  const ses = [{ klient: 'damian', tydzien: 9, jednostka: 'S1' }, { klient: 'damian', tydzien: 10, jednostka: 'S1' }];
  const log = [{ klient: 'damian', tydzien: 9, jednostka: 'S2', seria: 1 }];          // serie w Logu, sesja niezakończona
  const key = r => r.tydzien + r.jednostka + ':' + r.nr;
  // 17.11: plik H1 z samą zrobioną tyg. 10 S1 → H2 zostaje w całości, usunięta tylko niezrobiona tyg. 10 S2 bloku H1
  let m = C.mergePlan_(plan, [R(10, 'S1', 'H1')], ses, log);
  assert.equal(m.errors.length, 0);
  assert.equal(m.rows.filter(r => r.blok === 'H2').length, H2.length);
  assert.deepEqual(m.rows.filter(r => r.blok === 'H1').map(key).sort(), ['10S1:1', '9S1:1', '9S2:1']);
  assert.ok(m.rows.includes(own) && m.rows.includes(ewa));                            // własny trening i inny klient nietknięte
  assert.deepEqual(m.removed.map(g => g.text), ['usunięto: damian tydz. 10 jednostka S2 (blok H1)']);
  assert.equal(C.importStatus_(m), 'OK (usunięto 1, uwagi)');
  // tyg. 9 S2 ma tylko serie w Logu → zrobiona: zostaje, z uwagą; tak samo zrobiona tyg. 9 S1 spoza pliku
  assert.ok(m.warnings.some(w => /tyg\. 9 S2: zrobiona \(serie w Logu\), nie ma jej w pliku — zostaje/.test(w)));
  assert.ok(m.warnings.some(w => /tyg\. 9 S1: zrobiona, nie ma jej w pliku — zostaje/.test(w)));
  assert.ok(m.warnings.some(w => /tyg\. 10 S1: zrobiona, zostaje bez zmian/.test(w)));
  // bez Logu ta sama jednostka byłaby niezrobiona i usunięta
  assert.ok(C.mergePlan_(plan, [R(10, 'S1', 'H1')], ses).removed.some(g => g.tydzien === 9 && g.jednostka === 'S2'));
  // plik z jednostką Logu w innym bloku → błąd jak przy zrobionej (tygodnie numeruj dalej)
  assert.match(C.mergePlan_(plan, [R(9, 'S2', 'H3')], ses, log).errors.join(), /tyg\. 9 S2: już zrobiona w bloku H1/);
  // dwa pliki tego samego klienta w jednym przebiegu (najpierw H2, potem H1) → oba bloki w Planie
  const base = H1.concat([own]);
  m = C.mergePlan_(base, H2, ses, log);
  assert.equal(m.removed.length, 0);
  m = C.mergePlan_(m.rows, H1, ses, log);
  assert.deepEqual([m.rows.filter(r => r.blok === 'H1').length, m.rows.filter(r => r.blok === 'H2').length, m.removed.length], [4, H2.length, 0]);
  assert.equal(C.importStatus_({ warnings: [], removed: [] }), 'OK');
  // regresja: poprawka bieżącego bloku (cały plik H2 od nowa, bez tyg. 15) → nowe wiersze, tyg. 15 usunięty, H1 bez zmian
  const H2b = H2.filter(r => r.tydzien < 15).map(r => Object.assign({}, r, { kg: 50 }));
  m = C.mergePlan_(plan, H2b, ses, log);
  assert.equal(m.rows.filter(r => r.blok === 'H2').every(r => r.kg === 50 && r.tydzien < 15), true);
  assert.equal(m.rows.filter(r => r.blok === 'H2').length, H2b.length);
  assert.equal(m.rows.filter(r => r.blok === 'H1').length, 4);
  assert.deepEqual(m.removed.map(g => g.text), ['usunięto: damian tydz. 15 jednostka S1 (blok H2)', 'usunięto: damian tydz. 15 jednostka S2 (blok H2)']);
  // jednostka z pliku o tym samym tygodniu i dniu, ale w innym bloku (niezrobiona) → zastąpiona, uwaga, bez duplikatu
  m = C.mergePlan_(plan, [R(11, 'S1', 'H3')], ses, log);
  assert.deepEqual(m.rows.filter(r => r.tydzien === 11 && r.jednostka === 'S1').map(r => r.blok), ['H3']);
  assert.match(m.warnings.join(), /tyg\. 11 S1: niezrobiona jednostka bloku H2 zastąpiona jednostką z pliku \(blok H3\)/);
  assert.equal(m.rows.filter(r => r.blok === 'H2').length, H2.length - 2);
  // zmiany klienta w jednostce innego bloku zostają razem z nią
  const ed = R(12, 'S1', 'H2', { nr: 51, cwiczenie: 'Wykroki', zrodlo: 'dodane' }), del = R(12, 'S2', 'H2', { nr: 3, cwiczenie: 'Plank', zrodlo: 'usuniete' });
  m = C.mergePlan_(plan.concat([ed, del]), [R(10, 'S1', 'H1')], ses, log);
  assert.ok(m.rows.includes(ed) && m.rows.includes(del));
});

test('mergePlan_ zostawia własne treningi; podsumowanie i bloki liczą ich objętość, ale nie wykonanie planu', () => {
  const R = (j, nr, x) => Object.assign({ klient: 'robert', tydzien: 1, jednostka: j, data: d(1, 0), nr, cwiczenie: 'Przysiad', prio: 'A', serie: 2, powt: '5', kg: 100, blok: 'B1' }, x || {});
  const own = R('W1', 1, { cwiczenie: 'Hammer Curl', kg: 10, zrodlo: 'klient', data: d(1, 1) });
  const m = C.mergePlan_([R('T1', 1), own], [R('T1', 1, { kg: 105 }), R('W1', 1)], []);
  assert.deepEqual(m.rows.map(r => r.jednostka + (r.zrodlo || '') + r.kg), ['W1klient10', 'T1105']);
  assert.match(m.warnings[0], /własny trening klienta/);
  const plan = [R('T1', 1), own];
  const L = (j, nr, s, kg, cw) => ({ klient: 'robert', tydzien: 1, jednostka: j, data: d(1, 0), nr_cw: nr, cwiczenie: cw, seria: s, kg, powt: 5, rpe: 7, wykonane: 'TAK', typ: '' });
  const log = [L('T1', 1, 1, 100, 'Przysiad'), L('W1', 1, 1, 10, 'Hammer Curl'), L('W1', 1, 2, 10, 'Hammer Curl')];
  const H = C.SUM_HEADERS, row = C.computeSummary_(plan, log, [], []).rows[0];
  assert.equal(row[H.indexOf('wykonanie_%')], 50);                                 // 1 z 2 serii planu trenera, własne nie podbijają
  assert.equal(row[H.indexOf('tonaz_kg')], 500 + 100);                            // ale ich tonaż się liczy
  assert.equal(row[H.indexOf('dod+drop')], 0);
  const ses = [{ klient: 'robert', tydzien: 1, jednostka: 'T1', start: d(1, 0) + 'T17:00:00Z' }, { klient: 'robert', tydzien: 1, jednostka: 'W1', start: d(1, 1) + 'T17:00:00Z' }];
  const b = C.computeBlocks_(plan, log, ses, [], [], {}), BH = C.BLOK_HEADERS;
  assert.equal(b[0][BH.indexOf('jednostki')], '1/1');                              // własna jednostka nie jest jednostką planu
  assert.equal(b[0][BH.indexOf('tonaz_kg')], 600);
  assert.equal(C.ownRecent_(plan.concat([R('W2', 1, { zrodlo: 'klient', tytul: 'Własny · Ramiona' })]), ses.concat([{ klient: 'robert', tydzien: 1, jednostka: 'W2', start: d(1, 2) + 'T17:00:00Z' }]), 'robert', d(1, 3), 7),
    'Własny ' + d(1, 1).slice(8, 10) + '.' + d(1, 1).slice(5, 7) + '; Ramiona ' + d(1, 2).slice(8, 10) + '.' + d(1, 2).slice(5, 7));
  assert.equal(C.ownRecent_(plan, ses, 'robert', d(3, 0), 7), '');
});

test('Ćwiczenia: kolumna „glowna” robi z nazwy klienta alias; exNames_ do wyszukiwarki', () => {
  const rows = [{ cwiczenie: 'Hammer Curl', instruktaz: 'https://example.test/hc', partia: 'biceps' }, { cwiczenie: 'młotki', glowna: 'Hammer Curl' },
    { cwiczenie: 'zaślepka' }, { cwiczenie: 'Pull-up', aliasy: 'podciąganie', partia: 'plecy' }, { cwiczenie: 'drążek', glowna: 'podciąganie' }, { cwiczenie: 'coś', glowna: 'Nie ma takiego' }];
  const ix = C.exIndex_(rows);
  assert.deepEqual(['młotki', 'Młotki', 'drążek', 'coś', 'zaślepka'].map(n => (C.exFind_(ix, n) || {}).name || null), ['Hammer Curl', 'Hammer Curl', 'Pull-up', null, null]);
  assert.deepEqual(plain(C.exNames_(rows)), [['Hammer Curl', 'https://example.test/hc', 'biceps'], ['Pull-up', '', 'plecy']]);
  assert.deepEqual(plain(C.cwMerge_(rows)), { aliases: [{ i: 0, value: 'młotki' }, { i: 3, value: 'podciąganie; drążek' }], drop: [1, 4] });
  assert.deepEqual(Array.from(C.missingExercises_([{ cwiczenie: 'młotki' }, { cwiczenie: 'coś' }], rows)), ['coś']);
  assert.equal(C.CW_HEADERS[C.CW_HEADERS.length - 1], 'glowna');
});

test('errRow_, errRecent_: błędy z aplikacji w zakładce Błędy i w Przeglądzie', () => {
  const now = new Date('2026-10-16T10:00:00Z');
  assert.deepEqual(plain(C.errRow_('anna', { kind: 'film', msg: '  Drive\n500 ', ver: 'v24', ua: 'Mozilla/5.0  (Linux)' }, now)), [now.toISOString(), 'anna', 'film', 'Drive 500', 'v24', 'Mozilla/5.0 (Linux)']);
  assert.equal(C.errRow_('anna', { kind: 'cokolwiek', msg: 'x' }, now)[2], 'js');
  assert.equal(C.errRow_('anna', { msg: 'a'.repeat(1000) }, now)[3].length, 400);
  assert.equal(C.errRow_('anna', { msg: ' ' }, now), null);
  const errs = [{ kiedy: new Date('2026-10-15T08:00:00Z'), klient: 'anna', rodzaj: 'zapis' }, { kiedy: '2026-10-14T08:00:00Z', klient: 'Anna', rodzaj: 'zapis' },
    { kiedy: '2026-10-13T08:00:00Z', klient: 'anna', rodzaj: 'film' }, { kiedy: '2026-10-01T08:00:00Z', klient: 'anna', rodzaj: 'js' }, { kiedy: '2026-10-15T08:00:00Z', klient: 'bob', rodzaj: 'js' }];
  assert.equal(C.errRecent_(errs, 'anna', '2026-10-16', 7), '1× film, 2× zapis');
  assert.equal(C.errRecent_([], 'anna', '2026-10-16', 7), '');
  assert.ok(C.API_FNS.getExNames && C.API_FNS.logError && typeof C.onEdit === 'function');
  assert.ok(C.PRZ_HEADERS.includes('bledy_7dni'));
});

// --- 17.10: pominięte ćwiczenia, komentarze do ćwiczeń, EMOM i cięcie w planie ---
test('validatePlan_: serie do 40, tryb EMOM, ciecie i serie_min', () => {
  const R = x => Object.assign({ klient: 'anna', tydzien: 1, jednostka: 'T1', nr: 1, cwiczenie: 'EMOM Power Snatch', serie: 20, powt: '1' }, x);
  assert.deepEqual(Array.from(C.validatePlan_([R({ tryb: 'EMOM', ciecie: 2, serie_min: 10 })])), []);
  const e = C.validatePlan_([R({ serie: 41 }), R({ nr: 2, tryb: 'AMRAP' }), R({ nr: 3, ciecie: 0 }), R({ nr: 4, serie: 3, serie_min: 4 })]).join('\n');
  for (const frag of ['serie od 1 do 40', 'tryb tylko EMOM', 'ciecie', 'serie_min']) assert.match(e, new RegExp(frag));
});

test('computeSummary_: pominięte opcjonalne nie obniżają wykonania, komentarze i pominięcia w Podsumowanie_cw', () => {
  const P = (nr, cw, prio, serie) => ({ klient: 'anna', tydzien: 1, jednostka: 'T1', data: d(1, 0), nr, cwiczenie: cw, prio, serie, powt: '10', kg: 20 });
  const plan = [P(1, 'Przysiad', 'A', 2), P(2, 'Face Pull', 'B', 2), P(3, 'Plank', 'K', 2)];
  const L = (nr, cw, s, x) => Object.assign({ klient: 'anna', tydzien: 1, jednostka: 'T1', data: d(1, 0), nr_cw: nr, cwiczenie: cw, seria: s, kg: 20, powt: 10, rpe: 7, wykonane: 'TAK', typ: '', uwagi: '' }, x || {});
  const log = [L(1, 'Przysiad', 1, { uwagi: 'z samą sztangą nad głową' }), L(1, 'Przysiad', 2, { uwagi: 'z samą sztangą nad głową' }),
    L(2, 'Face Pull', 0, { wykonane: '', typ: 'SKIP', kg: '', powt: '', rpe: '', uwagi: '' }),
    L(3, 'Plank', 0, { wykonane: '', typ: 'SKIP', kg: '', powt: '', rpe: '', uwagi: 'brak czasu' })];
  const r = C.computeSummary_(plan, log, [], []), H = C.SUM_HEADERS, X = C.SUMX_HEADERS;
  assert.equal(r.rows[0][H.indexOf('wykonanie_%')], 50);                          // 2 z 4 (A + K); B poza wykonaniem
  assert.equal(r.rows[0][H.indexOf('opcjonalne')], '0/1');
  const ex = n => r.exRows.find(x => x[2] === n);
  assert.equal(ex('Przysiad')[X.indexOf('uwagi_klienta')], 'z samą sztangą nad głową');
  assert.equal(ex('Face Pull')[X.indexOf('pominiete')], '1× bez powodu');
  assert.equal(ex('Plank')[X.indexOf('pominiete')], '1× brak czasu');
  assert.equal(ex('Plank')[X.indexOf('serie')], 0);
  assert.equal(X[X.length - 1], 'pominiete'); assert.equal(H[H.length - 1], 'opcjonalne');
});

test('computeOverview_: pominięte ćwiczenie główne lub korekcyjne = sygnał, opcjonalne nie', () => {
  const today = '2026-10-17';
  const plan = [{ klient: 'anna', tydzien: 1, jednostka: 'T1', data: '2026-10-16', nr: 1, cwiczenie: 'Plank', prio: 'K', serie: 2 },
    { klient: 'anna', tydzien: 1, jednostka: 'T1', data: '2026-10-16', nr: 2, cwiczenie: 'Face Pull', prio: 'B', serie: 2 },
    { klient: 'anna', tydzien: 2, jednostka: 'T1', data: '2026-10-30', nr: 1, cwiczenie: 'Plank', prio: 'K', serie: 2 }];
  const log = [{ klient: 'anna', tydzien: 1, jednostka: 'T1', data: '2026-10-16', zapisano: '2026-10-16T10:00:00Z', nr_cw: 1, cwiczenie: 'Plank', seria: 0, typ: 'SKIP', uwagi: 'ból', wykonane: '' },
    { klient: 'anna', tydzien: 1, jednostka: 'T1', data: '2026-10-16', zapisano: '2026-10-16T10:00:00Z', nr_cw: 2, cwiczenie: 'Face Pull', seria: 0, typ: 'SKIP', uwagi: '', wykonane: '' }];
  const ses = [{ klient: 'anna', tydzien: 1, jednostka: 'T1', data: '2026-10-16', start: '2026-10-16T09:00:00Z' }];
  const row = C.computeOverview_(plan, log, ses, [{ klient_id: 'anna', imie: 'Anna', aktywny: 'TAK' }], [], [], { today, localDay: s => s.slice(0, 10) })[0];
  const sig = row[C.PRZ_HEADERS.indexOf('do_reakcji')];
  assert.match(sig, /pominięte: Plank \(ból\)/);
  assert.doesNotMatch(sig, /Face Pull/);
});

test('swapMode_ i cmjExcl_: tryb zamiany z Klienci J, wykluczone skoki CMJ', () => {
  assert.deepEqual(['TAK', 'trener', 'DOWOLNA', '', 'NIE'].map(C.swapMode_), ['TRENER', 'TRENER', 'DOWOLNA', false, false]);
  assert.equal(C.cmjExcl_([false, true, false]), '2');
  assert.equal(C.cmjExcl_([1, 3]), '1,3');
  assert.equal(C.cmjExcl_(undefined), '');
  assert.deepEqual(Array.from(C.DYS_HEADERS.slice(-2)), ['cmj_wykluczone', 'film_link']);
  assert.ok(C.API_FNS.logNote && C.API_FNS.logReadyVideo);
});

test('podglad_: 5 ostatnich sesji każdej osoby, plan vs wykonanie, notatki', () => {
  const klienci = [{ klient_id: 'anna', imie: 'Anna' }, { klient_id: 'bob', imie: 'Bob' }];
  const plan = [
    { klient: 'anna', tydzien: 1, jednostka: 'T1', tytul: 'Siła', blok: 'B1', data: '2026-10-05', nr: 1, cwiczenie: 'Przysiad', serie: 3, powt: '5', kg: 100, rpe_max: 8, uwagi: '' },
    { klient: 'anna', tydzien: 1, jednostka: 'T1', tytul: 'Siła', blok: 'B1', data: '2026-10-05', nr: 2, cwiczenie: 'Wiosłowanie', serie: 3, powt: '10', procent: '', kg: '', rpe_max: '', uwagi: 'wolno' },
    { klient: 'anna', tydzien: 1, jednostka: 'T1', tytul: 'Siła', blok: 'B1', data: '2026-10-05', nr: 3, cwiczenie: 'Face pull', serie: 2, powt: '15', kg: '', procent: 0.6 },
    { klient: 'bob', tydzien: 2, jednostka: 'T2', tytul: '', data: '2026-10-07', nr: 1, cwiczenie: 'Rwanie', serie: 4, powt: '2', procent: 0.75 }
  ];
  const L = (k, w, u, nr, cw, seria, kg, powt, rpe, extra) => Object.assign({ zapisano: '2026-10-0' + (w + 4) + 'T10:00:00Z', klient: k, tydzien: w, jednostka: u, data: '2026-10-05', nr_cw: nr, cwiczenie: cw, seria, kg, powt, rpe, wykonane: 'TAK', uwagi: '', typ: '', zamiana: '' }, extra || {});
  const log = [
    L('anna', 1, 'T1', 1, 'Przysiad', 'R1', 60, 5, ''),
    L('anna', 1, 'T1', 1, 'Przysiad', 1, 100, 5, 7.5, { uwagi: 'kolano ok' }),
    L('anna', 1, 'T1', 1, 'Przysiad', 2, 100, 5, 8, { uwagi: 'kolano ok' }),
    L('anna', 1, 'T1', 1, 'Przysiad', 3, 102.5, 4, '', { typ: 'FAIL', uwagi: 'kolano ok' }),
    L('anna', 1, 'T1', 2, 'Wiosłowanie hantlem', 1, 30, 10, 8, { zamiana: 'Wiosłowanie → Wiosłowanie hantlem | zajęte' }),
    L('anna', 1, 'T1', 3, 'Face pull', 0, '', '', '', { wykonane: '', typ: 'SKIP', uwagi: 'brak czasu' }),
    L('bob', 2, 'T2', 1, 'Rwanie', 1, 60, 2, 9.5, { data: '2026-10-07' })
  ];
  const ses = [{ zapisano: '2026-10-05T11:00:00Z', klient: 'anna', tydzien: 1, jednostka: 'T1', data: '2026-10-05', start: '2026-10-06T09:00:00Z', rpe_sesji: 7, samopoczucie: 4, czas_min: 60, uwagi: 'dobrze', bol: 'kolano:5' }];
  const rows = C.podglad_(plan, log, ses, klienci, {});
  assert.ok(rows.every(r => r.length === C.PODGLAD_HEADERS.length));
  const H = k => C.PODGLAD_HEADERS.indexOf(k);
  // osoby alfabetycznie: Anna (dzień z Sesje.start, nie z planu), potem Bob (bez Sesji)
  assert.deepEqual(rows.map(r => r[H('klient')]), ['Anna', 'Anna', 'Anna', 'Anna', 'Bob', 'Bob']);
  const a = rows.slice(0, 4), b = rows.slice(4);
  assert.deepEqual([b[0][H('data')], b[0][H('cwiczenie')]], ['2026-10-07', '— sesja —']);
  assert.match(b[0][H('notatki')], /niezakończona/);
  assert.equal(b[1][H('plan_kg')], '75%');
  assert.deepEqual([a[0][H('data')], a[0][H('sesja')]], ['2026-10-06', 'B1 · tydz. 1 · T1 · Siła']);
  assert.equal(a[0][H('notatki')], 'RPE sesji 7 · samopoczucie 4/5 · 60 min · uwagi: dobrze · ból: kolano 5/10');   // ból z Sesje.bol (od 18.11)
  const sq = a[1];
  assert.deepEqual([sq[H('cwiczenie')], sq[H('plan_kg')], sq[H('plan_serie_x_powt')], sq[H('plan_rpe')]], ['Przysiad', '100', '3×5', '≤8']);
  assert.deepEqual([sq[H('wyk_kg')], sq[H('wyk_serie_x_powt')], sq[H('wyk_rpe')]], ['102,5', '5, 5, 4', '7,5–8']);
  assert.equal(sq[H('wyk_serie')], '100×5 @7,5; 100×5 @8; 102,5×4 FAIL');   // bez rozgrzewki
  assert.equal(sq[H('notatki')], 'klient: kolano ok');
  assert.deepEqual([a[2][H('cwiczenie')], a[2][H('wyk_serie_x_powt')]], ['Wiosłowanie hantlem', '1×10']);
  assert.match(a[2][H('notatki')], /zamiana: Wiosłowanie → Wiosłowanie hantlem \| zajęte · plan: wolno/);
  assert.deepEqual([a[3][H('plan_kg')], a[3][H('wyk_kg')], a[3][H('notatki')]], ['60%', '', 'pominięte: brak czasu']);
  // 5 sesji na osobę: trener z dawnymi sesjami nie znika za klientami z nowszymi; nieaktywni pominięci
  const kl = [{ klient_id: 'anna', imie: 'Anna' }, { klient_id: 'trener', imie: 'Damian' }, { klient_id: 'ola', imie: 'Łucja' },
    { klient_id: 'zenon', imie: 'Zenon' }, { klient_id: 'stary', imie: 'Adam', aktywny: 'NIE' }];
  const many = [];
  for (let w = 1; w <= 12; w++) for (const k of ['anna', 'ola', 'zenon']) many.push(L(k, w, 'T1', 1, 'Przysiad', 1, 100, 5, 8, { data: '2026-10-' + String(w + 10).padStart(2, '0') }));
  for (let w = 1; w <= 7; w++) many.push(L('trener', w, 'T1', 1, 'Przysiad', 1, 100, 5, 8, { data: '2026-09-' + String(w + 10).padStart(2, '0') }));
  many.push(L('stary', 1, 'T1', 1, 'Przysiad', 1, 100, 5, 8, { data: '2026-10-25' }));
  const r2 = C.podglad_([], many, [], kl, {}).filter(r => r[H('cwiczenie')] === '— sesja —');
  assert.deepEqual(r2.map(r => r[H('klient')]).filter((x, i, A) => A.indexOf(x) === i), ['Anna', 'Damian', 'Łucja', 'Zenon']);
  for (const who of ['Anna', 'Damian', 'Łucja', 'Zenon']) assert.equal(r2.filter(r => r[H('klient')] === who).length, 5, who);
  assert.deepEqual(r2.filter(r => r[H('klient')] === 'Damian').map(r => r[H('data')]), ['2026-09-17', '2026-09-16', '2026-09-15', '2026-09-14', '2026-09-13']);
  assert.equal(r2.filter(r => r[H('klient')] === 'Anna')[0][H('data')], '2026-10-22');
  assert.equal(C.podglad_([], many, [], kl, { limit: 2 }).filter(r => r[H('cwiczenie')] === '— sesja —').length, 8);
});

test('pgBol_: Sesje.bol → „miejsce n/10”', () => {
  assert.equal(C.pgBol_('kolano:3; bark:0; biodro L:2,5'), 'kolano 3/10; bark 0/10; biodro L 2,5/10');
  assert.equal(C.pgBol_('kolano:; bark:2'), 'bark 2/10');
  assert.equal(C.pgBol_(''), '');
  assert.equal(C.pgBol_(undefined), '');
});

test('stanRows_: wpisy „Ból / napięcie” → wiersze Stanu (id z miejscem i stroną, walidacja, ćwiczenie tylko „w ćwiczeniu”)', () => {
  const at = new Date('2026-11-18T10:00:00Z');
  const rows = C.stanRows_('anna', [
    { date: '2026-11-18', place: 'Kolano', side: 'L', score: 3, context: 'w ćwiczeniu', exercise: 'Przysiad tylny', note: 'kłucie przy zejściu' },
    { date: '2026-11-18', place: 'Kolano', side: 'P', score: 0, context: 'spoczynek', exercise: 'nie zapisze się' },
    { place: ' Czworoboczny   lędźwi ', side: 'x', score: 5, context: 'zła wartość' },
    { place: 'Bark', side: 'L', score: 11 }, { place: '', score: 2 }, { place: 'Bark', side: 'L', score: '' }, { place: 'Bark', score: 2.5 },
    { date: '2026-11-18', place: 'Kolano', side: 'L', score: 4, context: 'po treningu' }      // drugi raz to samo miejsce: wygrywa ostatni
  ], at, '2026-11-17');
  assert.deepEqual(rows.map(r => r[0]), ['anna|2026-11-18|Kolano P', 'anna|2026-11-17|Czworoboczny lędźwi', 'anna|2026-11-18|Kolano L']);
  assert.ok(rows.every(r => r.length === C.STAN_HEADERS.length));
  const H = k => C.STAN_HEADERS.indexOf(k);
  assert.deepEqual(rows[0].slice(H('miejsce')), ['Kolano', 'P', 0, 'spoczynek', '', '']);
  assert.deepEqual(rows[1].slice(H('data')), ['2026-11-17', 'Czworoboczny lędźwi', '', 5, '', '', '']);
  assert.deepEqual(rows[2].slice(H('ocena')), [4, 'po treningu', '', '']);
  assert.equal(rows[0][1], at);
  const one = C.stanRows_('anna', [{ date: '2026-11-18', place: 'Kolano', side: 'L', score: 3, context: 'w ćwiczeniu', exercise: 'Przysiad tylny', note: 'x'.repeat(400) }], at, '2026-11-18')[0];
  assert.deepEqual([one[H('cwiczenie')], one[H('notatka')].length], ['Przysiad tylny', 300]);
  assert.deepEqual(Array.from(C.STAN_HEADERS), ['id', 'zapisano', 'klient', 'data', 'miejsce', 'strona', 'ocena', 'kontekst', 'cwiczenie', 'notatka']);
  assert.ok(C.API_FNS.saveStan && C.API_FNS.deleteStan);
  assert.ok(!Object.keys(C.TR_FNS).some(k => k in C.API_FNS));
});

test('podgladStan_: „Stan ciała” – ostatnie 28 dni, wszyscy klienci, od najnowszych', () => {
  const kl = [{ klient_id: 'anna', imie: 'Anna' }, { klient_id: 'bob', imie: 'Bob', aktywny: 'NIE' }];
  const S = (klient, data, miejsce, strona, ocena, zapisano, x) => Object.assign({ klient, data, miejsce, strona, ocena, kontekst: 'spoczynek', cwiczenie: '', notatka: '', zapisano }, x || {});
  const rows = C.podgladStan_([
    S('anna', '2026-11-18', 'Kolano', 'L', 3, '2026-11-18T08:00:00Z', { kontekst: 'w ćwiczeniu', cwiczenie: 'Przysiad', notatka: 'kłuje' }),
    S('bob', '2026-11-18', 'Bark', 'P', 2, '2026-11-18T09:00:00Z'),
    S('anna', '2026-10-22', 'Biodro', 'P', 1, '2026-10-22T08:00:00Z'),          // 28. dzień wstecz (licząc dziś) — jest
    S('anna', '2026-10-21', 'Biodro', 'P', 6, '2026-10-21T08:00:00Z'),          // starsze — nie ma
    S('anna', '2026-11-19', 'Bark', 'L', 2, '2026-11-18T08:00:00Z'),            // przyszłość — nie ma
    S('ola', '2026-11-10T00:00:00.000Z', 'Łokieć', 'L', 4, '')               // data jako ISO, klient spoza Klientów
  ], kl, '2026-11-18', 28);
  assert.deepEqual(rows, [
    ['2026-11-18', 'Bob', 'Bark', 'P', '2', 'spoczynek', '', ''],
    ['2026-11-18', 'Anna', 'Kolano', 'L', '3', 'w ćwiczeniu', 'Przysiad', 'kłuje'],
    ['2026-11-10', 'ola', 'Łokieć', 'L', '4', 'spoczynek', '', ''],
    ['2026-10-22', 'Anna', 'Biodro', 'P', '1', 'spoczynek', '', '']
  ]);
  assert.ok(rows.every(r => r.length === C.PODGLAD_STAN_HEADERS.length));
});

test('ćwiczenie na czas („30 s”): seria się liczy, sekundy nie wchodzą do tonażu, e1RM ani NL', () => {
  for (const [v, t] of [['30 s', true], ['45 sek', true], ['2 min', true], ['30s/str', true], ['8', false], ['6-8', false], ['8/str', false], ['10 m', false], ['1+1', false], ['', false], [null, false]])
    assert.equal(C.timed_(v), t, String(v));
  const R = (nr, x) => Object.assign({ klient: 'robert', tydzien: 1, jednostka: 'T1', data: d(1, 0), nr, cwiczenie: 'Przysiad tylny', prio: 'A', serie: 2, powt: '5', kg: 100, procent: 0.8, blok: 'B1' }, x || {});
  const plan = [R(1), R(2, { cwiczenie: 'Spacer farmera', powt: '30 s', kg: 40, procent: 0.5 })];
  const L = (nr, s, kg, powt, cw) => ({ klient: 'robert', tydzien: 1, jednostka: 'T1', data: d(1, 0), nr_cw: nr, cwiczenie: cw, seria: s, kg, powt, rpe: 8, wykonane: 'TAK', typ: '' });
  const log = [L(1, 1, 100, 5, 'Przysiad tylny'), L(1, 2, 100, 5, 'Przysiad tylny'), L(2, 1, 40, 30, 'Spacer farmera'), L(2, 2, 40, 30, 'Spacer farmera')];
  const sum = C.computeSummary_(plan, log, [], []), H = C.SUM_HEADERS, row = sum.rows[0], col = h => row[H.indexOf(h)];
  assert.equal(col('tonaz_kg'), 1000);                                             // bez 2 × 40 kg × 30 s
  assert.equal(col('serie_rob'), 4); assert.equal(col('serie_twarde'), 4); assert.equal(col('wykonanie_%'), 100);
  const XH = C.SUMX_HEADERS, far = sum.exRows.find(r => r[XH.indexOf('cwiczenie')] === 'Spacer farmera');
  assert.deepEqual([far[XH.indexOf('serie')], far[XH.indexOf('tonaz_kg')], far[XH.indexOf('e1RM_max')], far[XH.indexOf('NL')]], [2, 0, '', '']);
  const ses = [{ klient: 'robert', tydzien: 1, jednostka: 'T1', start: d(1, 0) + 'T17:00:00Z' }];
  const b = C.computeBlocks_(plan, log, ses, [], [], {}), BH = C.BLOK_HEADERS;
  assert.equal(b[0][BH.indexOf('tonaz_kg')], 1000); assert.equal(b[0][BH.indexOf('wykonanie_%')], 100);
  const parts = C.computeParts_([R(1), R(2, { powt: '30 s' })], log.map(l => Object.assign({}, l, { cwiczenie: 'Przysiad tylny' })), [], CW);
  assert.deepEqual(plain(parts).map(r => r.slice(2)), [['czworogłowe', 4, 4, 1000], ['pośladki', 4, 4, 1000]]);
});

test('obwod: walidacja planu (litera, ≥ 2 ćwiczenia po sobie, bez EMOM) i własny trening', () => {
  const R = (nr, x) => Object.assign({ klient: 'robert', tydzien: 1, jednostka: 'T1', tytul: 'A', data: d(1, 0), nr, cwiczenie: 'Ćw ' + nr, prio: 'B', serie: 3, powt: '10' }, x || {});
  assert.deepEqual(Array.from(C.validatePlan_([R(1), R(2, { obwod: 'A' }), R(3, { obwod: 'a' }), R(4, { obwod: 'B' }), R(5, { obwod: 'B' })])), []);
  assert.match(C.validatePlan_([R(1, { obwod: 'A' }), R(2)])[0], /obwod A ma jedno ćwiczenie/);
  assert.match(C.validatePlan_([R(1, { obwod: 'A' }), R(2), R(3, { obwod: 'A' })])[0], /muszą iść po sobie/);
  assert.match(C.validatePlan_([R(1, { obwod: 'AB' }), R(2, { obwod: 'AB' })])[0], /jedna litera/);
  assert.match(C.validatePlan_([R(1, { obwod: 'A', tryb: 'EMOM' }), R(2, { obwod: 'A' })])[0], /EMOM/);
  assert.deepEqual(Array.from(C.validatePlan_([R(1, { obwod: 'A' }), R(2, { obwod: 'A' }), R(1, { jednostka: 'T2', obwod: 'A' }), R(2, { jednostka: 'T2', obwod: 'A' })])), []);   // litera liczy się w obrębie jednostki
  assert.equal(C.PLAN_HEADERS[C.PLAN_HEADERS.length - 2], 'obwod');                // nowe kolumny na końcu (potem uwagi_jedn)
  assert.deepEqual(['a', 'B ', 'AB', '', null, 1].map(C.circuit_), ['A', 'B', '', '', '', '']);
  const E = (name, circuit) => ({ name, sets: 3, reps: '10', kg: '', circuit });
  const own = C.ownRows_('robert', { week: 1, day: 'W1', date: d(1, 0), exercises: [E('Pompki', 'A'), E('Wiosłowanie', 'a'), E('Plank', 'B'), E('Curl'), E('Dipy', 'x1')] }, []);
  assert.deepEqual(own.rows.map(r => r.obwod), ['A', 'A', '', '', '']);            // samotna litera i zła wartość = zwykłe ćwiczenie
});

// --- zmiany klienta w jednostce trenera (editPlan) ---
test('planEdit_: dodanie, usunięcie ze śladem, przywrócenie i zamiana na stałe w jednostce trenera', () => {
  const R = (w, j, nr, cw, x) => Object.assign({ klient: 'Robert', tydzien: w, jednostka: j, tytul: 'Siła', data: '2026-11-0' + w, nr, cwiczenie: cw, prio: 'A', serie: 3, powt: '5', kg: 100, blok: w <= 3 ? 'B1' : 'B2', uwagi: '' }, x || {});
  const plan = [R(1, 'T1', 1, 'Przysiad'), R(1, 'T1', 2, 'Suwnica'), R(2, 'T1', 1, 'Przysiad'), R(2, 'T1', 2, 'Suwnica'), R(2, 'T2', 1, 'Suwnica'),
    R(3, 'T1', 1, 'Suwnica', { uwagi: 'wolno' }), R(3, 'T1', 2, 'Przysiad'), R(4, 'T1', 1, 'Suwnica'),                       // tydz. 4 = inny blok
    R(1, 'T1', 1, 'Suwnica', { klient: 'ewa' }), R(2, 'W1', 1, 'Suwnica', { zrodlo: 'klient' })];
  const E = (e, ses) => plain(C.planEdit_(plan, ses || [], 'robert', e));
  // dodanie tylko dziś: jeden wiersz „dodane”, nr od 51, tytuł / data / blok z jednostki
  let r = E({ op: 'add', week: 1, day: 'T1', name: '  Wykroki   z hantlami ', sets: 3, reps: 10, kg: '12,5' });
  assert.deepEqual(r.add.map(a => [a.tydzien, a.jednostka, a.nr, a.cwiczenie, a.serie, a.powt, a.kg, a.zrodlo, a.blok, a.tytul, a.data]),
    [[1, 'T1', 51, 'Wykroki z hantlami', 3, '10', 12.5, 'dodane', 'B1', 'Siła', '2026-11-01']]);
  // na stałe: także tyg. 2 i 3 (ten sam blok), bez tyg. 4 (B2), bez T2 i bez zrobionego tygodnia
  r = E({ op: 'add', week: 1, day: 'T1', name: 'Wykroki', sets: 3, reps: 10, forever: true }, [{ tydzien: 2, jednostka: 'T1' }]);
  assert.deepEqual(r.add.map(a => a.tydzien), [1, 3]);
  assert.equal(E({ op: 'add', week: 1, day: 'T1', name: 'Wykroki', sets: 3, reps: 10, forever: true }).n, 3);
  assert.deepEqual([E({ op: 'add', week: 1, day: 'T1', name: '', sets: 3, reps: 10 }).error, E({ op: 'add', week: 1, day: 'T1', name: 'X', sets: 0, reps: 10 }).error,
    E({ op: 'add', week: 9, day: 'T1', name: 'X', sets: 3, reps: 10 }).error, E({ op: 'add', week: 2, day: 'W1', name: 'X', sets: 3, reps: 10 }).error],
    ['Podaj nazwę ćwiczenia.', 'Serie 1–40 i powtórzenia.', 'Nie ma takiej jednostki w planie.', 'To własny trening – popraw go w kreatorze.']);
  // usunięcie: wiersz zostaje, zmienia się tylko zrodlo; na stałe po nazwie (w tyg. 3 Suwnica ma inny nr)
  assert.deepEqual(E({ op: 'del', week: 1, day: 'T1', order: 2 }).set, [[1, { zrodlo: 'usuniete' }]]);
  assert.deepEqual(E({ op: 'del', week: 1, day: 'T1', order: 2, forever: true }).set, [[1, { zrodlo: 'usuniete' }], [3, { zrodlo: 'usuniete' }], [5, { zrodlo: 'usuniete' }]]);
  assert.equal(E({ op: 'del', week: 1, day: 'T1', order: 7 }).error, 'Nie ma takiego ćwiczenia w jednostce.');
  // ćwiczenie dodane przez klienta po usunięciu pamięta, że było dodane; przywrócenie oddaje poprzedni stan (ten i kolejne tygodnie)
  plan.push(R(1, 'T1', 51, 'Wykroki', { zrodlo: 'dodane' }));
  assert.deepEqual([E({ op: 'add', week: 1, day: 'T1', name: 'wykroki', sets: 3, reps: 10 }).n, E({ op: 'add', week: 1, day: 'T1', name: 'wykroki', sets: 3, reps: 10 }).error], [0, undefined]);   // ponowiona wysyłka nie dubluje
  assert.deepEqual(E({ op: 'del', week: 1, day: 'T1', order: 51 }).set, [[10, { zrodlo: 'usuniete_d' }]]);
  plan[10].zrodlo = 'usuniete_d'; plan[1].zrodlo = 'usuniete'; plan[5].zrodlo = 'usuniete';
  assert.deepEqual(E({ op: 'undel', week: 1, day: 'T1', order: 51 }).set, [[10, { zrodlo: 'dodane' }]]);
  assert.deepEqual(E({ op: 'undel', week: 1, day: 'T1', order: 2 }).set, [[1, { zrodlo: '' }], [5, { zrodlo: '' }]]);
  assert.equal(E({ op: 'undel', week: 1, day: 'T1', order: 1 }).error, 'To ćwiczenie nie jest usunięte.');
  assert.equal(E({ op: 'del', week: 1, day: 'T1', order: 2 }).error, 'To ćwiczenie jest już usunięte.');
  // nowe ćwiczenie po usuniętym dodanym dostaje kolejny numer (stare serie w Logu się nie zderzą)
  assert.equal(E({ op: 'add', week: 1, day: 'T1', name: 'Inne', sets: 2, reps: 8 }).add[0].nr, 52);
  // zamiana na stałe: tylko kolejne tygodnie (bieżąca jednostka idzie przez Log), usunięte pominięte, ślad w uwagach
  plan[1].zrodlo = '';
  assert.deepEqual(E({ op: 'swap', week: 1, day: 'T1', order: 2, to: 'Przysiad bułgarski' }).set,
    [[3, { cwiczenie: 'Przysiad bułgarski', uwagi: 'zamiana klienta: Suwnica → Przysiad bułgarski' }]]);
  plan[5].zrodlo = '';
  assert.equal(E({ op: 'swap', week: 1, day: 'T1', order: 2, to: 'Przysiad bułgarski' }).set[1][1].uwagi, 'wolno · zamiana klienta: Suwnica → Przysiad bułgarski');
  assert.equal(E({ op: 'swap', week: 1, day: 'T1', order: 2, to: ' suwnica ' }).error, 'Podaj inne ćwiczenie.');
  assert.equal(E({ op: 'x', week: 1, day: 'T1', order: 2 }).error, 'Nieznana zmiana.');
  assert.ok(C.API_FNS.editPlan);
});

test('zmiany klienta: poza wykonaniem planu w podsumowaniu i blokach; ponowne wczytanie planu ich nie kasuje', () => {
  const R = (j, nr, cw, x) => Object.assign({ klient: 'robert', tydzien: 1, jednostka: j, data: d(1, 0), nr, cwiczenie: cw, prio: 'A', serie: 2, powt: '5', kg: 100, blok: 'B1' }, x || {});
  const plan = [R('T1', 1, 'Przysiad'), R('T1', 2, 'Suwnica', { zrodlo: 'usuniete' }), R('T1', 51, 'Wykroki', { zrodlo: 'dodane', kg: 20 })];
  const L = (nr, s, kg, cw) => ({ klient: 'robert', tydzien: 1, jednostka: 'T1', data: d(1, 0), nr_cw: nr, cwiczenie: cw, seria: s, kg, powt: 5, rpe: 7, wykonane: 'TAK', typ: '' });
  const log = [L(1, 1, 100, 'Przysiad'), L(1, 2, 100, 'Przysiad'), L(51, 1, 20, 'Wykroki')];
  const H = C.SUM_HEADERS, row = C.computeSummary_(plan, log, [], []).rows[0];
  assert.equal(row[H.indexOf('wykonanie_%')], 100);                                // usunięta Suwnica nie obniża, dodane Wykroki nie podbijają
  assert.equal(row[H.indexOf('tonaz_kg')], 1000 + 100);                           // tonaż dodanego ćwiczenia się liczy
  assert.equal(row[H.indexOf('dod+drop')], 0);
  const ses = [{ klient: 'robert', tydzien: 1, jednostka: 'T1', start: d(1, 0) + 'T17:00:00Z' }];
  const b = C.computeBlocks_(plan, log, ses, [], [], {}), BH = C.BLOK_HEADERS;
  assert.deepEqual([b[0][BH.indexOf('jednostki')], b[0][BH.indexOf('wykonanie_%')], b[0][BH.indexOf('tonaz_kg')]], ['1/1', 100, 1100]);
  // ponowne wczytanie tego samego planu (jednostka niezrobiona): Suwnica dalej usunięta, Wykroki zostają
  const inc = [R('T1', 1, 'Przysiad', { kg: 105 }), R('T1', 2, 'Suwnica'), R('T1', 3, 'Plank')];
  let m = C.mergePlan_(plan, inc, []);
  assert.deepEqual(m.rows.map(r => r.nr + ':' + r.cwiczenie + ':' + (r.zrodlo || '')), ['1:Przysiad:', '2:Suwnica:usuniete', '3:Plank:', '51:Wykroki:dodane']);
  assert.match(m.notes[0], /robert: zachowano 2 zmian klienta/);
  assert.equal(inc[1].zrodlo, undefined);                                           // plik wejściowy bez zmian
  // jednostki nie ma już w pliku → dodane ćwiczenie nie zostaje samo; zrobiona jednostka zostaje w całości jak była
  m = C.mergePlan_(plan, [R('T2', 1, 'Przysiad')], []);
  assert.deepEqual(m.rows.map(r => r.jednostka + r.nr), ['T21']);
  m = C.mergePlan_(plan, inc, ses);
  assert.deepEqual(m.rows.map(r => r.nr + ':' + (r.zrodlo || '')), ['1:', '2:usuniete', '51:dodane']);
});

/* ---------- panel trenera (Trener.gs) ---------- */
test('trTokenOk_: bilet Google trenera – adres, aplikacja, wydawca, ważność', () => {
  const cfg = { clientId: 'abc.apps.googleusercontent.com', emails: ['trener@example.com', 'drugi@example.com'] }, now = Date.parse('2026-11-17T12:00:00Z');
  const ok = { aud: cfg.clientId, iss: 'https://accounts.google.com', email: 'Trener@Example.com', email_verified: 'true', exp: String(now / 1000 + 600) };
  assert.equal(C.trTokenOk_(ok, cfg, now), '');
  assert.equal(C.trTokenOk_(Object.assign({}, ok, { iss: 'accounts.google.com', email_verified: true }), cfg, now), '');
  assert.match(C.trTokenOk_(Object.assign({}, ok, { email: 'klient@example.com' }), cfg, now), /nie ma dostępu/);
  assert.match(C.trTokenOk_(Object.assign({}, ok, { aud: 'inna.apps.googleusercontent.com' }), cfg, now), /innej aplikacji/);
  assert.match(C.trTokenOk_(Object.assign({}, ok, { iss: 'https://evil.example' }), cfg, now), /Google/);
  assert.match(C.trTokenOk_(Object.assign({}, ok, { exp: String(now / 1000 - 1) }), cfg, now), /wygasł/);
  assert.match(C.trTokenOk_(Object.assign({}, ok, { email_verified: 'false' }), cfg, now), /niepotwierdzony/);
  assert.match(C.trTokenOk_(ok, { clientId: '', emails: [] }, now), /nie jest skonfigurowany/);
  assert.match(C.trTokenOk_(null, cfg, now), /brak/);
});

test('doPost: funkcje trenera nie działają z kluczem klienta, a klient nie wywoła funkcji trenera', () => {
  assert.ok(C.TR_FNS.trPulpit && C.TR_FNS.trKlient && C.TR_FNS.trConfig);
  for (const k of Object.keys(C.TR_FNS)) assert.equal(C.API_FNS[k], undefined, k);
  let authed = 0;
  const saved = { trAuth_: C.trAuth_, ContentService: C.ContentService, TR_FNS: C.TR_FNS };
  C.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) };
  C.trAuth_ = tok => { authed++; if (tok !== 'a.b.c') throw new Error(C.TR_AUTH + 'zaloguj się.'); return 'trener@example.com'; };
  C.TR_FNS = Object.assign({}, saved.TR_FNS, { trPulpit: () => 'pulpit', trConfig: () => ({ clientId: 'x' }) });
  const post = b => C.doPost({ postData: { contents: JSON.stringify(b) } });
  try {
    assert.deepEqual(post({ fn: 'trPulpit', token: 'a.b.c' }), { ok: true, result: 'pulpit' });
    const bad = post({ fn: 'trPulpit', key: 'k0123456789a' });
    assert.equal(bad.ok, false); assert.match(bad.error, /^Logowanie: /);
    assert.deepEqual(post({ fn: 'trConfig' }), { ok: true, result: { clientId: 'x' } });   // bez biletu: tylko publiczny identyfikator
    assert.equal(authed, 2);
    assert.match(post({ fn: 'toString', key: 'k' }).error, /Nieznana funkcja/);           // bez dziedziczonych pól obiektu
  } finally { Object.assign(C, saved); }
});

test('trPulpit_: klienci z Przeglądu, sygnały czerwone i pomarańczowe, 12 tygodni obciążenia, bloki i filmy', () => {
  const today = '2026-11-17';
  const t = {
    klienci: [{ klient_id: 'anna', imie: 'Anna' }, { klient_id: 'bartek', imie: 'Bartek' }],
    prz: [
      { klient: 'anna', imie: 'Anna', pilnosc: 4, czerwone: 1, do_reakcji: 'ból kolano 5/10 (17.11); samopoczucie 2/5 (17.11)', ostatni_trening: '2026-11-17', dni_temu: 0,
        ten_tydzien: '2/3', zalegle: '', status_tygodnia: '🔴 za dużo', uwagi_klienta: '17.11: kolano', filmy_7dni: 2, koniec_planu_dni: 30, filmy_bez_kom_7dni: 1 },
      { klient: 'bartek', imie: 'Bartek', pilnosc: 0, czerwone: '', do_reakcji: '', ostatni_trening: '', dni_temu: '', ten_tydzien: '0/0', status_tygodnia: '' }
    ],
    sum: [{ klient: 'anna', tydzien_od: '2026-11-16', sRPE_TL_AU: 1420, tonaz_kg: 18200, status: '🔴 za dużo' },
      { klient: 'anna', tydzien_od: '2026-11-09', sRPE_TL_AU: '1 000', status: '🟢 OK' }, { klient: 'anna', tydzien_od: '2026-08-03', sRPE_TL_AU: 900, status: '🟢 OK' }],
    bloki: [{ klient: 'anna', blok: 'B3', od: '2026-10-06', do: '2026-11-20', wnioski: '', dla_klienta: '' },
      { klient: 'anna', blok: 'B2', od: '2026-08-25', do: '2026-10-05', wnioski: 'dobrze', dla_klienta: '' },
      { klient: 'bartek', blok: 'B1', od: '2026-11-01', do: '2026-12-20', wnioski: '' },
      { klient: 'anna', blok: '(bez bloku)', od: '2026-01-01', do: '2026-01-02' }],
    log: [
      { klient: 'anna', zapisano: '2026-11-17T09:30:00Z', tydzien: 13, jednostka: 'T2', nr_cw: 1, cwiczenie: 'Przysiad', seria: 2, kg: 120, powt: 5, rpe: 8,
        film_link: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view', uwagi: 'kolano', komentarz_dysk: '', komentarz_trenera: '' },
      { klient: 'anna', zapisano: '2026-11-12T09:30:00Z', tydzien: 12, jednostka: 'T1', nr_cw: 1, cwiczenie: 'Rwanie', seria: 1, kg: 70, powt: 1, rpe: 8, ocena: 'S',
        film_link: 'https://drive.google.com/file/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765/view', komentarz_dysk: '0:03 łokcie', komentarz_trenera: 'lepiej',
        odpowiedz_klienta: ' Dzięki, spróbuję ', odpowiedz_at: '2026-11-13T18:00:00Z' },
      { klient: 'anna', zapisano: '2026-10-01T09:30:00Z', tydzien: 5, jednostka: 'T1', nr_cw: 1, cwiczenie: 'Stary', seria: 1, film_link: 'https://drive.google.com/file/d/1OldOldOldOldOldOldOldOldOld0/view' },
      { klient: 'anna', zapisano: '2026-11-17T09:31:00Z', tydzien: 13, jednostka: 'T2', nr_cw: 2, cwiczenie: 'Bez filmu', seria: 1, film_link: '' },
      { klient: 'anna', zapisano: '2026-10-01T09:30:00Z', tydzien: 5, jednostka: 'T1', nr_cw: 2, cwiczenie: 'Stara', seria: 1, komentarz_trenera: 'x', odpowiedz_klienta: 'stara', odpowiedz_at: '2026-10-02T10:00:00Z' }
    ],
    ses: [{ klient: 'bartek', tydzien: 2, jednostka: 'T1', komentarz_trenera: 'Dobra sesja', odpowiedz_klienta: 'Kolano ok', odpowiedz_at: '2026-11-16T20:00:00Z' },
      { klient: 'bartek', tydzien: 2, jednostka: 'T2', komentarz_trenera: 'x', odpowiedz_klienta: '  ', odpowiedz_at: '' },
      { klient: 'obcy', tydzien: 2, jednostka: 'T2', komentarz_trenera: 'x', odpowiedz_klienta: 'nieznany klient', odpowiedz_at: '2026-11-16T20:00:00Z' }]
  };
  const r = C.trPulpit_(t, { today, at: '2026-11-17T04:02:00Z' });
  assert.equal(r.clients.length, 2);
  const a = r.clients[0];
  assert.equal(a.name, 'Anna'); assert.equal(a.urg, 4); assert.equal(a.status, 'za dużo'); assert.equal(a.filmsNew, 1); assert.equal(a.planLeft, 30);
  assert.deepEqual(a.signals.map(s => s.lv), ['bad', 'warn']);
  assert.equal(a.signals[0].t, 'ból kolano 5/10 (17.11)');
  assert.equal(a.load.length, 12); assert.equal(r.weeks[11], '2026-11-16'); assert.equal(r.weeks[0], '2026-08-31');
  assert.deepEqual([a.load[11].srpe, a.load[11].status, a.load[10].srpe, a.load[9].srpe], [1420, 'za dużo', 1000, null]);
  assert.equal(r.clients[1].signals.length, 0); assert.equal(r.clients[1].ago, null);
  assert.deepEqual(r.blocks.map(b => b.name + ' ' + b.block), ['Anna B3']);       // B2 ma wnioski, B1 Bartka kończy się za > 7 dni
  assert.deepEqual(r.videos.map(v => v.ex), ['Przysiad', 'Rwanie']);             // bez filmu sprzed 14 dni i serii bez filmu
  assert.equal(r.videos[0].file, '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'); assert.equal(r.videos[0].kom, ''); assert.equal(r.videos[0].note, 'kolano');
  assert.equal(r.videos[1].kom, '0:03 łokcie\nlepiej');
  assert.equal(r.at, '2026-11-17T04:02:00Z');
  // odpowiedzi klientów: 14 dni, najnowsze pierwsze, bez pustych, starych i spoza Klientów; film = przejście do filmu
  assert.deepEqual(r.videos.map(v => v.rep), ['', 'Dzięki, spróbuję']);
  assert.deepEqual(plain(r.replies.map(x => [x.kind, x.name, x.at, x.title, x.text, x.film, x.kom])),
    [['S', 'Bartek', '2026-11-16', 'Trening T1', 'Kolano ok', false, 'Dobra sesja'], ['L', 'Anna', '2026-11-13', 'Rwanie · seria 1', 'Dzięki, spróbuję', true, '0:03 łokcie\nlepiej']]);
  assert.equal(r.replies[1].file + '|' + r.replies[1].set, '1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765|1');
});

test('doGet: stary link dostaje zwykły tekst (bez strony HtmlService, więc bez google.script.run)', () => {
  // Atrapy usług Google: doGet nie może sięgnąć po HtmlService, bo z takiej strony da się wywołać każdą funkcję skryptu.
  const out = [];
  C.HtmlService = { createHtmlOutput() { throw new Error('HtmlService'); }, createTemplateFromFile() { throw new Error('HtmlService'); } };
  C.ContentService = { createTextOutput(t) { out.push(t); return { text: t }; } };
  C.PropertiesService = { getScriptProperties: () => ({ getProperty: k => k === 'PWA_URL' ? 'https://example.github.io/trening/' : null }) };
  assert.deepEqual(JSON.parse(JSON.stringify(C.doGet({ parameter: { k: 'k0123456789a' } }))), { text: out[0] });
  assert.match(out[0], /wyłączona.*https:\/\/example\.github\.io\/trening\//);
  assert.doesNotMatch(out[0], /k0123456789a/);                          // klucz z linku nie wraca w odpowiedzi
  assert.equal(C.oldLinkText_(''), 'Ta wersja aplikacji jest wyłączona. Używaj nowego linku od trenera.');
  assert.equal(C.oldLinkText_('javascript:x'), 'Ta wersja aplikacji jest wyłączona. Używaj nowego linku od trenera.');
});

// --- panel trenera: szkic komentarza do sesji (Claude API) ---
function szkicData() {
  const plan = [], logs = [], sessions = [];
  [10, 11, 12].forEach((w, i) => {
    const date = ['2026-11-03', '2026-11-10', '2026-11-17'][i];
    plan.push({ week: w, day: 'T1', title: 'Nogi', date, order: 1, name: 'Przysiad tylny', prio: 'A', sets: 3, reps: '5', kg: 80 + i * 2, pct: null, rpe: 8, note: '', block: 'B2', own: false, unote: '' });
    plan.push({ week: w, day: 'T1', title: 'Nogi', date, order: 2, name: 'Wiosłowanie hantlą', prio: 'B', sets: 3, reps: '8/str', kg: 20, pct: null, rpe: '', note: '', block: 'B2', own: false, unote: '' });
    for (let s = 1; s <= 3; s++) logs.push({ tydzien: w, jednostka: 'T1', nr_cw: 1, cwiczenie: 'Przysiad tylny', seria: String(s), kg: 80 + i * 2, powt: 5, rpe: 7 + s * 0.5, wykonane: 'TAK',
      typ: w === 11 && s === 3 ? 'FAIL' : '', uwagi: w === 12 ? 'Ostatnie powtórzenie wolne' : '', zamiana: '', ocena: '', film_link: 'https://drive.google.com/file/d/tajne/view' });
    logs.push({ tydzien: w, jednostka: 'T1', nr_cw: 1, cwiczenie: 'Przysiad tylny', seria: 'R1', kg: 40, powt: 8, rpe: '', wykonane: 'TAK', typ: '', uwagi: '', zamiana: '', ocena: '' });
    if (w === 12) logs.push({ tydzien: w, jednostka: 'T1', nr_cw: 2, cwiczenie: 'Wiosłowanie hantlą', seria: '0', kg: '', powt: '', rpe: '', wykonane: '', typ: 'SKIP', uwagi: 'brak czasu', zamiana: '', ocena: '' });
    sessions.push({ tydzien: w, jednostka: 'T1', data: date, start: date + 'T16:00:00.000Z', czas_min: 55, samopoczucie: 4, rpe_sesji: w === 12 ? 8 : 7,
      bol: w === 12 ? 'kolano:5' : '', bol_max: w === 12 ? 5 : 0, uwagi: w === 12 ? 'Kolano trochę ćmi' : '', komentarz_trenera: w === 10 ? 'Równe serie, tak trzymaj.' : '' });
  });
  plan.push({ week: 12, day: 'T2', title: 'Góra', date: '2026-11-19', order: 1, name: 'Wyciskanie na ławce', prio: 'A', sets: 3, reps: '5', kg: 47.5, rpe: 8, block: 'B2', own: false });
  return { cfg: { name: 'Ania Testowa', simple: false, scale: 'RPE' }, plan, logs, sessions, readiness: [{ data: '2026-11-17', werdykt: 'Uwaga', powody: 'CMJ −6%' }] };
}
test('trSzkicCtx_: dane jednostki do szkicu AI (bez imienia i linków), poprzednie jednostki, następna, styl trenera', () => {
  const t = C.trSzkicCtx_(szkicData(), 12, 'T1');
  assert.doesNotMatch(t, /Ania|drive\.google|tajne/);                          // bez imienia i linków do filmów
  assert.match(t, /tydzień 12, T1 „Nogi”, blok B2, trening 2026-11-17/);
  assert.match(t, /Przysiad tylny \(A\) · plan 3×5 84 kg, RPE do 8 · zrobione: 84 kg×5 @7,5; 84 kg×5 @8; 84 kg×5 @8,5 · komentarz klienta: „Ostatnie powtórzenie wolne”/);
  assert.doesNotMatch(t, /40 kg×8/);                                            // rozgrzewka pominięta
  assert.match(t, /Wiosłowanie hantlą \(B\) · plan 3×8\/str 20 kg · pominięte \(brak czasu\)/);
  assert.match(t, /55 min, RPE sesji 8\/10, samopoczucie 4\/5, ból: kolano 5\/10/);
  assert.match(t, /Uwagi klienta do sesji: „Kolano trochę ćmi”/);
  assert.match(t, /Dyspozycja tego dnia: Uwaga \(CMJ −6%\)/);
  assert.match(t, /- tydzień 11 \(2026-11-10\), RPE sesji 7: Przysiad tylny: 82 kg×5 @7,5, 82 kg×5 @8, 82 kg×5 @8,5 nieudana/);
  assert.ok(t.indexOf('tydzień 11') < t.indexOf('tydzień 10 ('), 'od najnowszej');
  assert.match(t, /Następna jednostka: tydzień 12, T2 „Góra”, 2026-11-19: Wyciskanie na ławce 3×5 47,5 kg/);
  assert.match(t, /Wcześniejsze komentarze trenera.*\n- „Równe serie, tak trzymaj\.”/);
  assert.equal(C.trSzkicCtx_(szkicData(), 12, 'T2'), null);                     // jednostka bez sesji
  assert.equal(C.trSzkicSets_(szkicData(), 12, 'T1'), 3);                        // 3 serie robocze; rozgrzewka i pominięcie się nie liczą
  const empty = szkicData(); empty.logs = empty.logs.filter(l => !(Number(l.tydzien) === 12 && String(l.seria) !== '0' && !/^R/i.test(String(l.seria))));
  assert.equal(C.trSzkicSets_(empty, 12, 'T1'), 0);                              // tylko „Zakończ” + pominięcie = bez szkicu AI
  const simple = szkicData(); simple.cfg.simple = true;
  assert.match(C.trSzkicCtx_(simple, 12, 'T1'), /tryb PROSTY/);
});
test('trLogged_, trSzkicSets_: nagrane albo wpisane serie bez ✓ (boje z filmem) też są serią, szkic AI to zaznacza', () => {
  const d = szkicData();
  // klient nagrał dwa podejścia rwania i wpisał trzecie, żadnego nie odhaczył (wykonane puste, jak po logVideo)
  d.logs = d.logs.filter(l => Number(l.tydzien) !== 12);
  d.logs.push({ tydzien: 12, jednostka: 'T1', nr_cw: 1, cwiczenie: 'Rwanie z zawisu', seria: 1, kg: '', powt: '', rpe: '', wykonane: '', typ: '', ocena: '', film_link: 'https://drive.google.com/file/d/a/view' },
    { tydzien: 12, jednostka: 'T1', nr_cw: 1, cwiczenie: 'Rwanie z zawisu', seria: 2, kg: '', powt: '', rpe: '', wykonane: '', typ: '', ocena: '', film_link: 'https://drive.google.com/file/d/b/view' },
    { tydzien: '12', jednostka: 'T1 ', nr_cw: 1, cwiczenie: 'Rwanie z zawisu', seria: 3, kg: 75, powt: 3, rpe: '', wykonane: '', typ: '', ocena: '', film_link: '' },
    { tydzien: 12, jednostka: 'T1', nr_cw: 1, cwiczenie: 'Rwanie z zawisu', seria: 4, kg: '', powt: '', rpe: '', wykonane: '', typ: '', ocena: '', film_link: '' },   // odznaczona, bez śladu
    { tydzien: 12, jednostka: 'T1', nr_cw: 1, cwiczenie: 'Rwanie z zawisu', seria: 5, kg: 70, powt: 2, rpe: 8, wykonane: 'tak', typ: '', ocena: 'S', film_link: '' });
  assert.equal(C.trSzkicSets_(d, 12, 'T1'), 4);                                  // dawniej 0 → „Brak zapisanych serii”
  const t = C.trSzkicCtx_(d, 12, 'T1');
  assert.match(t, /zrobione: seria 1 tylko z filmem, bez wpisu; seria 2 tylko z filmem, bez wpisu; 75 kg×3 \(nieodhaczona\); 70 kg×2 \(średnio\)/);
  assert.match(t, /nie odhaczył w aplikacji/);
  assert.doesNotMatch(t, /drive\.google/);
  assert.equal(C.trLogged_({ seria: 'R1', kg: 40, wykonane: 'TAK' }), false);    // rozgrzewka
  assert.equal(C.trLogged_({ seria: '0', typ: 'SKIP', uwagi: 'brak czasu' }), false);
  assert.doesNotMatch(C.trSzkicCtx_(szkicData(), 12, 'T1'), /nie odhaczył/);    // wszystko odhaczone = bez dopisku
});
test('trBlokCtx_, trBlokSets_, aiBlokReq_, aiBlokParse_: szkic zamknięcia bloku (bez imienia), dwa teksty z jednej odpowiedzi', () => {
  const d = szkicData();
  d.plan.push({ week: 13, day: 'T1', title: 'Nogi', date: '2026-11-24', order: 1, name: 'Przysiad tylny', prio: 'A', sets: 4, reps: '4', kg: 85, rpe: 8, block: 'B3', own: false });
  d.blocks = [{ blok: 'B1', od: '2026-09-01', do: '2026-10-26', tygodnie: '1–9', jednostki: '18/18', 'wykonanie_%': 95, tonaz_kg: 52000, e1RM_zm: 'Przysiad tylny 90→96 (+6,7%)', najlepsze_boje: '', sRPE_sr: 7, samopocz_sr: 4, dyspozycja: '', bol_max: 0, statusy: '', wnioski: 'Dobra adaptacja, więcej objętości.', dla_klienta: '' },
    { blok: 'B2', od: '2026-11-03', do: '2026-11-19', tygodnie: '10–12', jednostki: '3/4', 'wykonanie_%': 80, tonaz_kg: 3700, e1RM_zm: 'Przysiad tylny 96→100 (+4,2%)', najlepsze_boje: '', sRPE_sr: 7.3, samopocz_sr: 4, dyspozycja: 'Uwaga 1', bol_max: 5, statusy: '', wnioski: '', dla_klienta: '' }];
  const t = C.trBlokCtx_(d, 'B2');
  assert.doesNotMatch(t, /Ania|drive\.google|tajne/);                           // bez imienia i linków do filmów
  assert.match(t, /Blok B2: 2026-11-03–2026-11-19, tygodnie 10–12, jednostki zrobione\/plan 3\/4, wykonanie serii z planu 80%, tonaż 3700 kg, szacowane maksimum \(e1RM\): Przysiad tylny 96→100/);
  assert.match(t, /- tydzień 12: jednostki 1\/2, tonaż 1260 kg, RPE sesji śr\. 8, samopoczucie 4\/5, ból max 5\/10/);
  assert.match(t, /- Przysiad tylny: 80 kg×5 @7,5 \(tydz\. 10\) → 84 kg×5 @7,5 \(tydz\. 12\)/);
  assert.match(t, /Nieudane serie\/podejścia: Przysiad tylny 1\./);
  assert.match(t, /Pominięte albo skrócone ćwiczenia: Wiosłowanie hantlą\./);
  assert.match(t, /Niezrobione jednostki: tydz\. 12 T2\./);
  assert.match(t, /Przysiad tylny: „Ostatnie powtórzenie wolne”/);
  assert.match(t, /sesja tydz\. 12 T1: „Kolano trochę ćmi”/);
  assert.match(t, /Ból zgłoszony: tydz\. 12 T1: kolano 5\/10/);
  assert.match(t, /Poprzedni blok B1: .*\nWnioski trenera po bloku B1 \(styl\): „Dobra adaptacja, więcej objętości\.”/);
  assert.match(t, /Plan następnego bloku B3, pierwszy tydzień \(13\): T1 Przysiad tylny 4×4 85 kg\./);
  assert.equal(C.trBlokCtx_(d, 'B9'), null);
  const d2 = Object.assign({}, d, { plan: d.plan.filter(r => r.block !== 'B3') });
  assert.match(C.trBlokCtx_(d2, 'B2'), /Planu następnego bloku jeszcze nie ma/);
  assert.equal(C.trBlokSets_(d, 'B2'), 9);                                       // serie robocze z 3 tygodni; rozgrzewka i pominięcie się nie liczą
  assert.equal(C.trBlokSets_(d, 'B3'), 0);                                       // blok bez serii = bez zapytania do AI
  const r = C.aiBlokReq_('KONTEKST', {});
  assert.equal(r.model, 'claude-opus-5-5'); assert.equal(r.fallbacks, 'default'); assert.equal(r.output_config.effort, 'low');
  assert.match(r.system, /WNIOSKI:\n<tekst dla trenera>\nDLA KLIENTA:/);
  assert.match(r.system, /najwyżej 5 krótkich zdań/); assert.match(r.system, /nie używaj form zależnych od płci/);
  assert.match(r.messages[0].content, /KONTEKST[\s\S]*Napisz szkic wniosków/);
  assert.match(C.aiBlokReq_('K', { tweak: 'cieplej', draft: { w: 'W1.', k: 'K1.' } }).messages[0].content, /Poprzedni szkic:\nWNIOSKI:\nW1\.\nDLA KLIENTA:\nK1\.\n\nPopraw szkic: Tekst dla klienta napisz cieplej/);
  assert.deepEqual(JSON.parse(JSON.stringify(C.aiBlokParse_('WNIOSKI:\nPrzysiad +4%.\nDecyzja: 85 kg.\n\nDLA KLIENTA:\nŚwietny blok.'))), { wnioski: 'Przysiad +4%.\nDecyzja: 85 kg.', dla_klienta: 'Świetny blok.' });
  assert.deepEqual(JSON.parse(JSON.stringify(C.aiBlokParse_('**Wnioski:** A.\n**Dla klienta:** B.'))), { wnioski: 'A.', dla_klienta: 'B.' });   // znaczniki z ozdobnikami
  assert.deepEqual(JSON.parse(JSON.stringify(C.aiBlokParse_('Sam tekst.'))), { wnioski: 'Sam tekst.', dla_klienta: '' });   // bez znaczników: całość do wniosków
  assert.ok(C.TR_FNS.trBlok && C.TR_FNS.trBlokSzkic && !C.API_FNS.trBlok && !C.API_FNS.trBlokSzkic);   // tylko zalogowany trener
});
test('aiReq_, aiCost_, aiDay_: zapytanie do Claude API, koszt, dzienny limit', () => {
  const r = C.aiReq_('KONTEKST', {});
  assert.equal(r.model, 'claude-opus-5-5');
  assert.equal(r.fallbacks, 'default');
  assert.equal(r.output_config.effort, 'low');
  assert.equal(r.temperature, undefined);
  assert.match(r.system, /Najwyżej 4 krótkie zdania/);                             // Damian 17.11: krócej, bez wyliczania, decyzja z liczbą
  assert.match(r.system, /Nie wyliczaj, co klient zrobił/);
  assert.match(r.system, /jedna konkretna decyzja .* z liczbą/);
  assert.match(r.messages[0].content, /KONTEKST[\s\S]*Napisz szkic/);
  assert.match(r.system, /po polsku|Po polsku/);
  const t = C.aiReq_('KONTEKST', { tweak: 'krocej', draft: 'Stary szkic.' });
  assert.match(t.messages[0].content, /Poprzedni szkic komentarza:\nStary szkic\.\n\nPopraw szkic: Skróć/);
  assert.match(C.aiReq_('K', { tweak: 'zle', draft: 'x' }).messages[0].content, /Napisz szkic/);  // nieznana poprawka = zwykły szkic
  assert.equal(C.aiCost_('claude-opus-5-5', { input_tokens: 3000, output_tokens: 500 }), 0.022);
  assert.equal(C.aiCost_('nieznany', { input_tokens: 1e6, output_tokens: 0 }), 4);
  assert.equal(C.aiCost_('claude-opus-5', { input_tokens: 0, output_tokens: 1000, cache_read_input_tokens: 1e6 }), 0.525);
  assert.deepEqual(JSON.parse(JSON.stringify(C.aiDay_('', '2026-11-17', 30))), { n: 0, ok: true });
  assert.deepEqual(JSON.parse(JSON.stringify(C.aiDay_('{"d":"2026-11-17","n":30}', '2026-11-17', 30))), { n: 30, ok: false });
  assert.deepEqual(JSON.parse(JSON.stringify(C.aiDay_('{"d":"2026-11-16","n":30}', '2026-11-17', 30))), { n: 0, ok: true });
  assert.equal(C.aiDay_('zepsute', '2026-11-17', 30).ok, true);
  assert.ok(C.TR_FNS.trKomentarz && C.TR_FNS.trSzkic && !C.API_FNS.trSzkic);
  assert.ok(C.TR_FNS.trAI && C.TR_FNS.trUstawAI && !C.API_FNS.trUstawAI);          // klucz ustawia tylko zalogowany trener
  assert.ok(C.TR_FNS.trFilm && C.TR_FNS.trKomentarzFilm && !C.API_FNS.trFilm);       // bilet do filmów tylko dla trenera
  assert.equal(C.trLogId_(' Ania ', '12', 'T1', '1', 3), 'ania|12|T1|1|3');           // ten sam format co id w logSet
  const key = 'sk-ant-api03-' + 'x'.repeat(40);
  assert.equal(C.aiKeyOk_(key), '');
  assert.equal(C.aiKeyOk_('  ' + key + '\n'), '');                             // wklejony ze spacją albo nową linią na końcu
  assert.match(C.aiKeyOk_(''), /Wklej/);
  assert.match(C.aiKeyOk_('sk-ant-api03-abc def' + 'x'.repeat(20)), /spacji/);
  assert.match(C.aiKeyOk_('sk-proj-' + 'x'.repeat(40)), /sk-ant-/);           // klucz innej firmy
  assert.equal(C.aiKeyEnd_(key.slice(0, -4) + 'AbCd'), '…AbCd');                 // panel widzi tylko 4 ostatnie znaki
  assert.equal(C.aiKeyEnd_(''), '');
});
