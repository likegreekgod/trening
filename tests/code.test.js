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
    extra: 2, oly: 7.5, own: true, edit: true, link: 'https://x.github.io/trening/?k=kabc', email: '', mail: false, mailKom: false, seen: '', devs: 0, body: false, snatch: '', cj: '', start: '' });
  // pusty wiersz = wartości domyślne; bez adresu aplikacji link z kolumny E
  const d = C.trKlientOf_(['k1', 'bo', 'Bo', 'NIE', 'link-E'], '');
  assert.equal(d.on, false); assert.equal(d.mode, 'PRO'); assert.equal(d.swap, 'NIE'); assert.equal(d.oly, 5); assert.equal(d.own, true); assert.equal(d.link, 'link-E');
  // panel → kolumny D, F–N
  const v = C.trKlientVals_({ on: false, mode: 'PRO', scale: 'RPE', swap: 'DOWOLNA', pain: true, masters: false, extra: 3, oly: 7.5, own: false, edit: true });
  assert.deepEqual(JSON.parse(JSON.stringify(v.vals)), { 3: 'NIE', 5: 'TAK', 6: 'PRO', 7: 3, 8: '', 9: 'DOWOLNA', 10: 'RPE', 11: 0.075, 12: 'NIE', 13: 'TAK', 14: '', 15: '', 19: '', 22: '' });
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
  // Q–S (maksy, start): tylko gdy panel je przysłał (starszy panel bez tych pól ich nie czyści)
  assert.equal(16 in C.trKlientVals_(base).vals, false);
  const q = C.trKlientVals_(Object.assign({}, base, { snatch: '82,5', cj: 105, start: '2027-03-14' })).vals;
  assert.deepEqual([q[16], q[17], q[18]], [82.5, 105, '2027-03-14']);
  const qe = C.trKlientVals_(Object.assign({}, base, { snatch: '', cj: '', start: '' })).vals;
  assert.deepEqual([qe[16], qe[17], qe[18]], ['', '', ''], 'puste pola czyszczą');
  assert.match(C.trKlientVals_(Object.assign({}, base, { snatch: 'dużo' })).error, /Max rwanie/);
  assert.match(C.trKlientVals_(Object.assign({}, base, { cj: 500 })).error, /Max podrzut/);
  assert.match(C.trKlientVals_(Object.assign({}, base, { start: '2027-02-30' })).error, /Start/);
  assert.match(C.trKlientVals_(Object.assign({}, base, { start: '14.03.2027' })).error, /Start/);
  const r4 = ['k', 'x', 'X']; Object.keys(q).forEach(i => { r4[i] = q[i]; });
  assert.deepEqual((({ snatch, cj, start }) => [snatch, cj, start])(C.trKlientOf_(r4, '')), [82.5, 105, '2027-03-14']);
  const r5 = ['k', 'x', 'X']; r5[16] = 0; r5[17] = 'brak'; r5[18] = new Date('2027-03-14T00:00:00Z');
  assert.deepEqual((({ snatch, cj }) => [snatch, cj])(C.trKlientOf_(r5, '')), ['', ''], 'zero i tekst = brak maksa');
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
  const ok = { klienci: [K('anna', 'k0123456789a')], plan: [R('anna', '2026-11-30')], pwaUrl: 'https://example.test/', triggers: ['podsumowanie', 'wczytajPlany', 'kopiaArkusza'], bledy: 0, czeka: 0, today: '2026-10-12' };
  assert.deepEqual(Array.from(C.diagnose_(ok)), []);
  const bad = C.diagnose_({ today: '2026-10-12', pwaUrl: '', triggers: ['podsumowanie'], bledy: 2, czeka: 1,
    klienci: [K('anna', 'k0123456789a', { link: '' }), K('bob', 12345), K('bob', 'k0123456789b'), K('cel', 'k0123456789c'), K('stary', '', { aktywny: 'NIE' })],
    plan: [R('anna', '2026-10-15', { blok: '' }), R('anna', '2026-10-10', { blok: '', powt: new Date(2026, 5, 8) }), R('duch', '2026-10-20'), R('bob', '2026-09-01')] });
  const txt = bad.map(r => r[0] + ': ' + r[1]).join('\n');
  for (const frag of ['błąd: Brak właściwości skryptu PWA_URL', 'błąd: Brak wyzwalacza „wczytajPlany”', 'błąd: Powtórzone klient_id „bob”', 'błąd: bob: brak poprawnego klucza',
    'uwaga: anna: brak aktualnego linku', 'uwaga: cel: aktywny klient bez planu', 'uwaga: Plan dla „duch”', 'błąd: anna: kolumna powt zamieniona na datę w wierszach Planu 3',
    'uwaga: anna: plan kończy się za 3 dni', 'uwaga: Brak cotygodniowej kopii arkusza', 'uwaga: bob: plan skończył się 2026-09-01', 'info: anna: plan bez kolumny blok', 'uwaga: Pliki w _plany/bledy: 2', 'info: Pliki czekające w _plany: 1'])
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

test('kopia arkusza i limit filmu (Kopia.gs): filmOk_, kopieDoUsuniecia_, dyskStan_', () => {
  const GB = 1024 * 1024 * 1024;
  assert.equal(C.filmOk_({ size: 50e6, mimeType: 'video/mp4', fileName: 'a.mp4' }), '');
  assert.equal(C.filmOk_({ size: 50e6, mimeType: 'video/quicktime', fileName: 'IMG_1.MOV' }), '');
  assert.equal(C.filmOk_({ size: GB, mimeType: 'video/mp4' }), '');                                      // dokładnie 1 GB przechodzi
  assert.match(C.filmOk_({ size: 1.5 * GB, mimeType: 'video/mp4' }), /1,5 GB, a limit to 1 GB/);
  assert.match(C.filmOk_({ size: 2e6, mimeType: 'image/jpeg', fileName: 'x.jpg' }), /^To nie jest film/);
  assert.equal(C.filmOk_({ size: 2e6, mimeType: 'application/octet-stream', fileName: 'x.mov' }), '');   // typ nieznany, rozszerzenie filmu
  assert.equal(C.filmOk_({ size: 2e6, mimeType: '', fileName: '' }), '');                                // stara aplikacja bez nazwy
  assert.match(C.filmOk_({ size: 0, mimeType: 'video/mp4' }), /Pusty/);
  const F = (id, d) => ({ id, name: C.KOPIA_PREFIX + d, at: Date.parse(d) });
  const files = ['2026-09-06', '2026-11-22', '2026-10-04', '2026-11-15', '2026-09-27', '2026-10-25', '2026-11-08', '2026-10-11', '2026-10-18', '2026-11-01']
    .map((d, i) => F('f' + i, d)).concat([{ id: 'obcy', name: 'Notatki', at: 0 }]);
  assert.deepEqual(Array.from(C.kopieDoUsuniecia_(files, 8)), ['f4', 'f0']);                         // dwie najstarsze, obcy plik zostaje
  assert.deepEqual(Array.from(C.kopieDoUsuniecia_(files.slice(0, 3), 8)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(C.dyskStan_(14 * GB, 15 * GB))), { used: 14 * GB, limit: 15 * GB, free: GB, low: true });
  assert.equal(C.dyskStan_(5 * GB, 15 * GB).low, false);
  assert.equal(C.dyskStan_(5 * GB, -1).free, null);                                                     // bez limitu
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
  // seria w Logu (z ✓, w ćwiczeniu A/B) też znaczy „zaczęty”; wyzerowana seria nie (23.11)
  assert.equal(C.rannyDo_(kl, plan, [{ klient: 'Ania', tydzien: '8', jednostka: 'A', nr_cw: 1, seria: 1, wykonane: 'TAK' }], ses, today).length, 0);
  assert.equal(C.rannyDo_(kl, plan, [{ klient: 'Ania', tydzien: '8', jednostka: 'A', nr_cw: 1, seria: 1, wykonane: '' }], ses, today).length, 1);
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
  assert.deepEqual(plain(C.exInfo_(ix, 'Hang Clean (nad kolanem) + Jerk')), { found: true, infos: [{ n: 'Hang Clean', u: 'https://example.test/hc' }, { n: 'Jerk', u: 'https://example.test/jerk' }], parts: [], swaps: [], group: '', fx: [] });
  assert.deepEqual(plain(C.exInfo_(ix, 'Hang Clean + Hang Clean + Nieznane').infos), [{ n: 'Hang Clean', u: 'https://example.test/hc' }]);
  assert.deepEqual(plain(C.exInfo_(ix, 'Przysiad tylny + SL RDL').parts), ['czworogłowe', 'pośladki', 'dwugłowe uda']);
  assert.deepEqual(plain(C.exInfo_(ix, 'Back Squat')), { found: true, infos: [{ n: 'Przysiad tylny', u: 'https://example.test/przysiad' }], parts: ['czworogłowe', 'pośladki'], swaps: ['Leg press', 'Hack'], group: 'PS', fx: [] });
  assert.deepEqual(plain(C.exInfo_(ix, 'Nieznane + Inne')), { found: false, infos: [], parts: [], swaps: [], group: '', fx: [] });
  // bez filmu: nazwa z bazy do zdjęć i opisu w aplikacji (w kompleksie tylko części bez filmu, link „javascript:” to brak filmu)
  assert.deepEqual(plain(C.exInfo_(ix, 'SL RDL').fx), ['Single-Leg RDL']);
  assert.deepEqual(plain(C.exInfo_(ix, 'Hang Clean + Wiosłowanie hantlem + Leg press').fx), ['Wiosłowanie hantlem', 'Leg press']);
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
  assert.deepEqual(plain(C.cwBaza_([['A', 'id1', 'p']], { A: 'y' }, [['D', 'd1', 'łydki']], [['F', 'klatka']], { A: 'Stara A', D: 'Stara D', F: 'Stara F; F2' })),
    [['A', 'id1', 'p', 'y; Stara A'], ['D', '', 'łydki', 'd1; Stara D'], ['F', '', 'klatka', 'Stara F; F2']]);
});

test('cwSync_: scalone duplikaty, dawny wiersz znika tylko bez ręcznych wpisów', () => {
  const sc = { 'Hamstring Curl': 'Lying Leg Curls; Leg Curl Old', Crunch: 'Crunches', Glute: 'Bridge' };
  const baza = C.cwBaza_([['Hamstring Curl', 'abcdefghijk', 'dwugłowe uda'], ['Crunch', 'bcdefghijkl', 'brzuch'], ['Glute', 'cdefghijklm', 'pośladki']], {}, [], [], sc);
  const sheet = [
    { cwiczenie: 'Hamstring Curl', aliasy: 'Uginanie nóg leżąc', instruktaz: 'https://www.youtube.com/watch?v=abcdefghijk', partia: 'dwugłowe uda' },
    { cwiczenie: 'Lying Leg Curls', partia: 'dwugłowe uda' },                                   // jak z bazy: znika
    { cwiczenie: 'Crunch', instruktaz: 'https://www.youtube.com/watch?v=bcdefghijkl', partia: 'brzuch' },
    { cwiczenie: 'Crunches', partia: 'brzuch', instruktaz: 'https://example.test/moj-film' },     // link trenera: zostaje
    { cwiczenie: 'Leg Curl Old' },                                                              // zaślepka: znika jak dotąd
    { cwiczenie: 'Bridge', partia: 'pośladki', glowna: 'Glute' }];                               // już wskazuje główne: zostaje dla cwMerge_
  const s = plain(C.cwSync_(baza, sheet, {}, sc));
  assert.deepEqual(s.add, [['Glute', 'Bridge', 'https://www.youtube.com/watch?v=cdefghijklm', 'pośladki', '', '']]);
  assert.deepEqual(s.aliases, [{ i: 0, value: 'Uginanie nóg leżąc; Lying Leg Curls; Leg Curl Old' }, { i: 2, value: 'Crunches' }]);
  assert.deepEqual([s.drop.slice().sort(), s.merged, s.kept], [[1, 4], 1, ['Crunches → Crunch']]);
  const after = sheet.map((r, i) => (s.aliases.find(a => a.i === i) ? Object.assign({}, r, { aliasy: s.aliases.find(a => a.i === i).value }) : r)).filter((r, i) => s.drop.indexOf(i) < 0);
  const ix = C.exIndex_(after);
  assert.equal(C.exFind_(ix, 'Lying Leg Curls').name, 'Hamstring Curl');
  assert.equal(C.exFind_(ix, 'Crunches').info, 'https://example.test/moj-film');              // wiersz z wpisem trenera działa jak dotąd
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
  const F = Array.from(C.CW_FEDB), all = C.cwBaza_(B, C.CW_ALIASY, D, F, C.CW_SCALONE), s = C.cwSync_(all, []);
  assert.equal(s.add.length, 624 + D.length + F.length);
  assert.equal(F.length, 697); F.forEach(x => { assert.equal(x.length, 2); assert.ok(x[0] && x[1], x[0]); });
  const rows = plain(s.add).map(r => Object.fromEntries(C.CW_HEADERS.map((h, i) => [h, r[i]]))), ix = C.exIndex_(rows), f = n => (C.exFind_(ix, n) || {}).name || null;
  const keys = {}; rows.forEach(r => [r.cwiczenie].concat(r.aliasy.split(';')).map(C.exKey_).filter(Boolean).forEach(k => { assert.ok(!keys[k], 'powtórzona nazwa lub alias: ' + k); keys[k] = 1; }));
  assert.deepEqual(plain(C.cwSync_(all, rows, {}, C.CW_SCALONE)), { add: [], aliases: [], drop: [], merged: 0, kept: [] });   // drugie wczytanie nic nie zmienia
  assert.deepEqual(['Snatch Pull', 'Power Clean from Block', 'Chin Up', 'DB Lateral Raise', 'SL RDL', 'Block Power Snatch (nad kolanem)', 'Jerk Dip z pauzą 3 s', 'Back Squat 1¼'].map(f),
    ['Snatch Pull', 'Block Power Clean', 'Chin-up', 'Dumbbell Lateral Raise', 'Single-Leg RDL', 'Block Power Snatch', 'Jerk Dip', '1-1/4 Back Squat']);
  assert.deepEqual(['Przysiad tylny', 'Ciąg rwaniowy (z podłogi, do pełnego wyprostu)', 'Wykroki bułgarskie (hantle), tempo 3-1-X', 'Sotts Press', 'Wypychanie na suwnicy', 'Power jerk z rack — 2 s pauza w dipie + 3 s fiksacja'].map(f),
    ['Back Squat', 'Snatch Pull', 'Bulgarian Split Squat', 'Press In Snatch (Sots Press)', 'Leg Press', 'Pause Power Jerk']);
  // polskie nazwy (punkt 5 przeglądu v80): plan po polsku trafia w ćwiczenie z bazy
  assert.deepEqual(['Martwy ciąg', 'Rwanie siłowe z zawisu', 'Zarzut z bloków', 'Wybicie nożycowe', 'Podciąganie podchwytem', 'Wyciskanie francuskie leżąc', 'Spacer farmera', 'Martwy robak', 'Deska', 'Przysiad z hantlą przy klatce', 'Szrugsy z hantlami'].map(f),
    ['Deadlift', 'Hang Power Snatch', 'Block Clean', 'Split Jerk', 'Chin-up', 'Skullcrusher', 'Farmer Carry', 'Dead Bug', 'Plank', 'Goblet Squat', 'Dumbbell Shrug']);
  assert.deepEqual(['Ring Dips', 'Hanging Knee Raise', 'Pin OHS', 'Pushup Hold (jak najgłębiej)', 'Pause Clean (2 s pod kolanem)'].map(f), ['Ring Dip', 'Hanging Knee Raise', 'Pin Overhead Squat', 'Push-Up Hold', 'Segment Clean']);   // regresja i inny sprzęt to osobne ćwiczenia
  Object.keys(C.CW_WYCOFANE).forEach(k => { assert.ok(names.includes(k)); C.CW_WYCOFANE[k].split(';').forEach(a => assert.ok(!((C.CW_ALIASY[k] || '').split(';').map(C.exKey_).includes(C.exKey_(a))), a)); });
  const old = rows.map(r => r.cwiczenie === 'Dip' ? Object.assign({}, r, { aliasy: 'Ring Dips; Dipy' }) : r);
  assert.deepEqual(plain(C.cwSync_(all, old, C.CW_WYCOFANE)), { add: [], aliases: [{ i: old.findIndex(r => r.cwiczenie === 'Dip'), value: 'Dipy; Pompki na poręczach; Parallel Bar Dip' }], drop: [], merged: 0, kept: [] });
  const own = names.concat(D.map(x => x[0]), F.map(x => x[0])).map(C.exKey_);                       // scalone duplikaty: zostaje nazwa z bazy, dawna jest tylko aliasem
  Object.keys(C.CW_SCALONE).forEach(k => { assert.ok(own.includes(C.exKey_(k)), 'scalone do nieistniejącego ćwiczenia: ' + k); C.CW_SCALONE[k].split('; ').forEach(a => { assert.ok(!own.includes(C.exKey_(a)), 'dawna nazwa nadal jest wierszem: ' + a); assert.equal(f(a), k); }); });
  assert.equal([].concat(...Object.values(C.CW_SCALONE).map(v => v.split('; '))).length, 65);
  assert.deepEqual(['Lying Leg Curls', 'Barbell Full Squat', 'Crunches', 'Farmer\'s Walk', 'Rope Crunch', 'Butt Lift (Bridge)', 'Rack Delivery'].map(f), ['Hamstring Curl', 'Back Squat', 'Crunch', 'Farmer Carry', 'Cable Crunch', 'Glute Bridge', 'Clean Rack Delivery']);
  assert.ok(C.exInfo_(ix, 'Lying Leg Curls').infos.length === 1);                                   // dawna nazwa dostaje film ćwiczenia, które zostaje
  assert.deepEqual(['Slow Snatch', 'Single Arm Cable Pull (fixed on bench)', 'Barbell Squat', 'Jerk from blocks (cluster)', 'Dumbbell Bench Press'].map(f), ['Slow-Motion Snatch', 'Single-Arm Pulldown', 'Back Squat', 'Jerk From Blocks', 'Dumbbell Bench Press']);
  assert.deepEqual(['Snatch Pull z haka', 'Rot. wewn. biodra z gumą (siad na skrzyni)'].map(f), Array(2).fill(null));   // bez zgadywania: alias albo własny wiersz
  assert.deepEqual(C.exInfo_(ix, 'Hang Clean (nad kolanem) + Jerk').infos.map(i => i.n), ['Hang Clean', 'Split Jerk']);   // „Jerk” to alias Split Jerk
  assert.deepEqual([C.exInfo_(ix, 'Snatch').parts.length, C.exInfo_(ix, 'Back Squat').parts.length > 0, C.exInfo_(ix, 'Suwnica').infos.length], [0, true, 0]);   // boje bez partii, dodatki bez filmu
});

test('opisy ćwiczeń (web/cw/opisy.json): każde ćwiczenie free-exercise-db ma 4 kroki po polsku i dwa zdjęcia, bez nazw spoza bazy', () => {
  const fs = require('node:fs'), path = require('node:path'), dir = path.join(__dirname, '..', 'web', 'cw');
  const O = JSON.parse(fs.readFileSync(path.join(dir, 'opisy.json'), 'utf8'));
  const F = Array.from(C.CW_FEDB).map(x => x[0]), D = Array.from(C.CW_DODATKI).map(x => x[0]), known = new Set(F.concat(D));
  Object.keys(O).forEach(n => assert.ok(known.has(n), 'opis ćwiczenia spoza bazy: ' + n));
  F.forEach(n => assert.ok(O[n], 'brak opisu: ' + n));
  const ids = new Set();
  Object.entries(O).forEach(([n, o]) => {
    assert.ok(Array.isArray(o.k) && o.k.length === 4 && o.k.every(s => typeof s === 'string' && s.length > 3 && s.length < 200), 'kroki: ' + n);
    if (!o.i) return;
    assert.match(o.i, /^[\w-]+$/, n); ids.add(o.i);
    [0, 1].forEach(k => { const f = path.join(dir, o.i, k + '.jpg'); assert.ok(fs.existsSync(f) && fs.statSync(f).size < 120000, 'zdjęcie: ' + f); });
  });
  assert.deepEqual(fs.readdirSync(dir).filter(f => f !== 'opisy.json' && !ids.has(f)), [], 'zdjęcia bez opisu');
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
    ['robert', d(1, 0), 'czworogłowe', 5, 4, 500 + 500 + 500 + 1000 + 400, 2],   // 5 serii (bez R1 i niewykonanej), twarde: RPE 8, FAIL, RPE 9, drop; blisko upadku: FAIL, RPE 9
    ['robert', d(1, 0), 'plecy', 2, 1, 300, 0],                                 // „Nieznane” liczone wg nazwy z planu (nr 2)
    ['robert', d(1, 0), 'pośladki', 4, 3, 500 + 500 + 500 + 400, 1]]);             // przysiad liczy się do obu partii, leg press tylko do czworogłowych
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
  // mało miejsca na Dysku (Kopia.gs, dyskStan_): osobny sygnał, raz do zmiany
  const low = C.dyskStan_(13.5 * 1024 ** 3, 15 * 1024 ** 3), d1 = C.alertMail_([], '', '', low);
  assert.deepEqual([d1.send, d1.subject, d1.sig], [true, 'Trening: mało miejsca na Dysku', '_dysk|low']);
  assert.match(d1.body, /Dysk Google: zostało 1,5 GB wolnego/);
  assert.equal(C.alertMail_([], d1.sig, '', low).send, false);                                    // następnego dnia to samo → bez maila
  assert.equal(C.alertMail_(ov, '', '', low).subject, 'Trening: 2 klientów do reakcji, mało miejsca na Dysku');
  assert.equal(C.alertMail_([], '', '', C.dyskStan_(1e9, 15 * 1024 ** 3)).send, false);         // dość miejsca
  assert.equal(C.alertMail_(ov, m.sig, '', null).send, false);                                     // Google nie podał miejsca
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
  assert.equal(C.commentLines_([{ content: 'Biodra', anchor: real }]).text, '0:05,1 Biodra');
  assert.deepEqual([0, 9.96, 23.5, 24.1, 59.97, 75].map(C.mmss_), ['0:00', '0:10', '0:23,5', '0:24,1', '1:00', '1:15']);   // dziesiąte tylko, gdy są
  assert.deepEqual([sec('to nie json'), sec('{"page":3}'), sec(''), sec(null), sec('{"time":"jutro"}')], [null, null, null, null, null]);
  const c = C.commentLines_([{ content: ' Łokcie wyżej\nprzy 2. powtórzeniu ', anchor: '{"timestamp":75}', createdTime: '2026-10-12T10:00:00Z' },
    { content: 'Dobre zejście', anchor: '{"timestamp":15}', createdTime: '2026-10-12T10:05:00Z' }, { content: 'Ogólnie lepiej niż tydzień temu', createdTime: '2026-10-12T09:00:00Z' },
    { content: 'usunięty', deleted: true, anchor: '{"timestamp":1}' }, { content: 'załatwione', resolved: true }, { content: '   ' }, { content: 'bez czasu', anchor: '{"strona":2}', createdTime: '2026-10-12T11:00:00Z' }]);
  assert.equal(c.text, '0:15 Dobre zejście\n1:15 Łokcie wyżej przy 2. powtórzeniu\nOgólnie lepiej niż tydzień temu\nbez czasu');
  assert.equal(c.raw, '{"strona":2}');                                           // nierozpoznana kotwica wraca do pokazania w menu
  assert.deepEqual(plain(C.commentLines_([])), { text: '', raw: '' });
  // kolumny komentarzy zostają na swoich miejscach, odpowiedź klienta dopisana na końcu (stare wiersze się nie przesuwają)
  assert.deepEqual([C.LOG_HEADERS.slice(22), C.SES_HEADERS.slice(16), C.LOG_HEADERS.length, C.SES_HEADERS.length].map(x => plain(x)),
    [['komentarz_trenera', 'komentarz_dysk', 'odpowiedz_klienta', 'odpowiedz_at', 'notatka_trenera'], ['komentarz_trenera', 'odpowiedz_klienta', 'odpowiedz_at', 'prowadzil'], 27, 20]);
});

test('filmPart: kawałki filmu tylko dla serii klienta (v98)', () => {
  const M = 4 * 1024 * 1024;
  assert.deepEqual(plain(C.filmPartRange_(0, 10 * M)), { a: 0, b: M - 1 });
  assert.deepEqual(plain(C.filmPartRange_(8 * M, 10 * M)), { a: 8 * M, b: 9 * M - 1 });
  assert.deepEqual(plain(C.filmPartRange_(9 * M + 5, 10 * M)), { a: 9 * M + 5, b: 10 * M - 1 });
  assert.deepEqual(plain(C.filmPartRange_(-5, 100)), { a: 0, b: 99 });
  assert.throws(() => C.filmPartRange_(100, 100), /Poza końcem/);
  assert.ok(C.API_FNS.filmPart); assert.ok(!C.LIVE_FNS.filmPart);
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
  assert.deepEqual(Array.from(C.PLAN_HEADERS.slice(-7)), ['zrodlo', 'tryb', 'ciecie', 'serie_min', 'obwod', 'uwagi_jedn', 'sekcja']);   // nowe kolumny na końcu
});

test('unitsDone_: zrobiona = Sesje albo seria A/B z ✓ lub FAIL; korekcja K, rozgrzewka, pominięcie i wyzerowana seria się nie liczą', () => {
  const P = (j, nr, prio, x) => Object.assign({ klient: 'damian', tydzien: 12, jednostka: j, nr, cwiczenie: 'C' + nr, prio }, x || {});
  const plan = [P('S1', 1, 'K'), P('S1', 2, 'A'), P('S1', 3, 'B'), P('S2', 1, 'K'), P('S3', 1, 'A'), P('S4', 1, 'A'), P('S5', 1, 'A')];
  const L = (j, nr, seria, x) => Object.assign({ klient: 'Damian', tydzien: '12', jednostka: j, nr_cw: nr, seria }, x || {});
  const log = [
    L('S1', 1, 1, { wykonane: 'TAK' }),                 // 22.11: sama korekcja K → S1 dalej niezrobiona
    L('S2', 1, 1, { wykonane: 'TAK' }),                 // jednostka z samymi K → zrobiona
    L('S3', 1, 1, { wykonane: '' }), L('S3', 1, 'R1', { wykonane: 'TAK' }), L('S3', 1, 0, { typ: 'SKIP' }),   // wyzerowana, rozgrzewka, pominięcie
    L('S4', 1, 2, { wykonane: '', typ: 'FAIL' }),       // nieudana seria A = zaczęta
    L('S5', 1, 1, { wykonane: '', film_link: 'https://drive.google.com/x' }),   // sam film bez ✓
    L('S6', 4, 'D1', { wykonane: 'TAK' })               // spoza planu (np. dodane) = liczy się
  ];
  const ses = [{ klient: 'damian', tydzien: 12, jednostka: 'S5' }];
  const d = C.unitsDone_(plan, ses, log);
  assert.deepEqual(plain(d), { 'damian|12|S2': 'L', 'damian|12|S4': 'L', 'damian|12|S5': 'S', 'damian|12|S6': 'L' });
  // seria A w S1 → zrobiona
  assert.equal(C.unitsDone_(plan, [], log.concat([L('S1', 2, 1, { wykonane: 'TAK' })]))['damian|12|S1'], 'L');
  // import: poprawka planu na jednostkę z samą serią K wchodzi (uwaga zamiast „zrobiona, zostaje bez zmian”)
  const m = C.mergePlan_(plan, [P('S1', 1, 'K'), P('S1', 2, 'A', { kg: 100 }), P('S1', 3, 'B')], [], log);
  assert.equal(m.rows.find(r => r.jednostka === 'S1' && r.nr === 2).kg, 100);
  assert.ok(!m.warnings.some(w => /12 S1: zrobiona/.test(w)));
  // inne ćwiczenie pod numerem z zapisaną serią K = uwaga w Import
  const m2 = C.mergePlan_(plan, [P('S1', 1, 'K', { cwiczenie: 'Inne' }), P('S1', 2, 'A')], [], log);
  assert.ok(m2.warnings.some(w => /tyg\. 12 S1: seria w Logu pod nr 1 \(C1\), w pliku pod tym numerem Inne/.test(w)));
  assert.equal(C.doneKey_(' Damian ', '12', ' S1 '), 'damian|12|S1');
});

test('mergePlan_: plik usuwa niezrobione jednostki tylko z bloków, które sam zawiera; zrobiona = Sesje albo Log', () => {
  const R = (w, j, blok, x) => Object.assign({ klient: 'damian', tydzien: w, jednostka: j, nr: 1, cwiczenie: 'Rwanie', serie: 3, powt: '2', blok }, x || {});
  const H1 = [R(9, 'S1', 'H1'), R(9, 'S2', 'H1'), R(10, 'S1', 'H1'), R(10, 'S2', 'H1')];
  const H2 = [11, 12, 13, 14, 15].flatMap(w => [R(w, 'S1', 'H2'), R(w, 'S2', 'H2'), R(w, 'S1', 'H2', { nr: 2, cwiczenie: 'Przysiad' })]);
  const own = R(10, 'W1', '', { zrodlo: 'klient' }), ewa = Object.assign(R(1, 'T1', 'B1'), { klient: 'ewa' });
  const plan = H1.concat(H2, [own, ewa]);
  const ses = [{ klient: 'damian', tydzien: 9, jednostka: 'S1' }, { klient: 'damian', tydzien: 10, jednostka: 'S1' }];
  const log = [{ klient: 'damian', tydzien: 9, jednostka: 'S2', nr_cw: 1, seria: 1, wykonane: 'TAK' }];   // serie w Logu, sesja niezakończona
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
  assert.deepEqual(plain(C.exNames_(rows)), [['Hammer Curl', 'https://example.test/hc', 'biceps', ''], ['Pull-up', '', 'plecy', 'podciąganie']]);
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
  assert.equal(X[X.length - 1], 'pominiete'); assert.deepEqual(H.slice(-4), ['opcjonalne', 'blisko_upadku', 'ponad_plan_%', 'ponad_plan_max']);
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

test('cialoRow_: pomiar ciała (masa i obwody) → wiersz zakładki Ciało, zakresy, kolumna W „cialo” włącza pomiary', () => {
  const r = C.cialoRow_('anna', { date: '2026-11-23', masa: '72,4', talia: 81, biodra: '', klatka: ' ', ramie: '31.25', udo: null }, 'T', '2026-11-23');
  assert.deepEqual(plain(r.row), ['anna|2026-11-23', 'T', 'anna', '2026-11-23', 72.4, 81, '', '', 31.3, '']);
  assert.equal(C.cialoRow_('anna', { masa: 70 }, 'T', '2026-11-23').row[3], '2026-11-23', 'bez daty = dziś');
  assert.match(C.cialoRow_('anna', { date: '2026-11-23' }, 'T', '2026-11-23').error, /co najmniej jeden/);
  assert.match(C.cialoRow_('anna', { masa: '7,2' }, 'T', '2026-11-23').error, /Masa ciała: 25–300 kg/);
  assert.match(C.cialoRow_('anna', { talia: 'dużo' }, 'T', '2026-11-23').error, /talia: 30–250 cm/);
  assert.match(C.cialoRow_('anna', { date: '2026-11-30', masa: 70 }, 'T', '2026-11-23').error, /przyszłości/);
  assert.ok(C.cialoRow_('anna', { date: '2026-11-24', masa: 70 }, 'T', '2026-11-23').row, 'jutro (strefa czasowa telefonu) przechodzi');
  assert.deepEqual(plain(C.CIALO_HEADERS), ['id', 'zapisano', 'klient', 'data', 'masa', 'talia', 'biodra', 'klatka', 'ramie', 'udo']);
  const row = ['k', 'a', 'A']; row[22] = 'tak';
  assert.equal(C.clientOf_(row).body, true); assert.equal(C.clientOf_(['k', 'a', 'A']).body, false);
  assert.equal(C.trKlientOf_(row, '').body, true);
  assert.equal(C.trKlientVals_(Object.assign({}, C.KL_DOMYSLNE, { body: true })).vals[22], 'TAK');
  ['saveCialo', 'deleteCialo'].forEach(f => { assert.ok(C.API_FNS[f], f); assert.ok(!C.TR_FNS[f] && !C.LIVE_FNS[f], f); });
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
  assert.deepEqual(plain(parts).map(r => r.slice(2)), [['czworogłowe', 4, 4, 1000, 0], ['pośladki', 4, 4, 1000, 0]]);
});

test('obwod: walidacja planu (litera, ≥ 2 ćwiczenia po sobie, bez EMOM) i własny trening', () => {
  const R = (nr, x) => Object.assign({ klient: 'robert', tydzien: 1, jednostka: 'T1', tytul: 'A', data: d(1, 0), nr, cwiczenie: 'Ćw ' + nr, prio: 'B', serie: 3, powt: '10' }, x || {});
  assert.deepEqual(Array.from(C.validatePlan_([R(1), R(2, { obwod: 'A' }), R(3, { obwod: 'a' }), R(4, { obwod: 'B' }), R(5, { obwod: 'B' })])), []);
  assert.match(C.validatePlan_([R(1, { obwod: 'A' }), R(2)])[0], /obwod A ma jedno ćwiczenie/);
  assert.match(C.validatePlan_([R(1, { obwod: 'A' }), R(2), R(3, { obwod: 'A' })])[0], /muszą iść po sobie/);
  assert.match(C.validatePlan_([R(1, { obwod: 'AB' }), R(2, { obwod: 'AB' })])[0], /jedna litera/);
  assert.match(C.validatePlan_([R(1, { obwod: 'A', tryb: 'EMOM' }), R(2, { obwod: 'A' })])[0], /EMOM/);
  assert.deepEqual(Array.from(C.validatePlan_([R(1, { obwod: 'A' }), R(2, { obwod: 'A' }), R(1, { jednostka: 'T2', obwod: 'A' }), R(2, { jednostka: 'T2', obwod: 'A' })])), []);   // litera liczy się w obrębie jednostki
  assert.equal(C.PLAN_HEADERS[C.PLAN_HEADERS.length - 3], 'obwod');                // nowe kolumny na końcu (potem uwagi_jedn, sekcja)
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

test('trDzis_: kto dziś trenuje (plan z datą, serie zapisane dziś, sesja zaczęta dziś) i w jakim stanie', () => {
  const today = '2026-11-22', d10 = v => String(v).slice(0, 10);
  const kl = [{ klient_id: 'ania', imie: 'Ania' }, { klient_id: 'bartek', imie: 'Bartek' }, { klient_id: 'celina', imie: 'Celina' },
    { klient_id: 'darek', imie: 'Darek' }, { klient_id: 'ewa', imie: 'Ewa', aktywny: 'NIE' }];
  const P = (klient, tydzien, jednostka, data, cw, serie, extra) => Object.assign({ klient, tydzien, jednostka, tytul: jednostka === 'T1' ? 'Nogi' : 'Góra', data, cwiczenie: cw, serie, zrodlo: '' }, extra || {});
  const plan = [
    P('ania', 12, 'T1', today, 'Przysiad', 4), P('ania', 12, 'T1', today, 'Wiosłowanie', 3), P('ania', 12, 'T1', today, 'Dodane', 3, { zrodlo: 'dodane' }),
    P('ania', 12, 'T2', '2026-11-24', 'Wyciskanie', 3),                                   // inny dzień: nie dziś
    P('bartek', 4, 'T1', today, 'Rwanie', 5), P('bartek', 4, 'T1', today, 'Usunięte', 3, { zrodlo: 'usuniete' }),
    P('celina', 7, 'T2', '2026-11-20', 'Wyciskanie', 3), P('celina', 7, 'T2', '2026-11-20', 'Podciąganie', 3),   // przesunięta: zaczęta dziś
    P('darek', 3, 'W1', today, 'Pompki', 3, { zrodlo: 'klient', tytul: '' }),             // własny z datą dziś, ale bez serii: nie
    P('ewa', 2, 'T1', today, 'Przysiad', 3)                                               // nieaktywna
  ];
  const L = (klient, tydzien, jednostka, seria, extra) => Object.assign({ klient, tydzien, jednostka, seria, zapisano: today + 'T09:00:00Z', wykonane: 'TAK', kg: 60, powt: 5, typ: '' }, extra || {});
  const log = [
    L('celina', 7, 'T2', 1), L('celina', 7, 'T2', 2), L('celina', 7, 'T2', 'R1'), L('celina', 7, 'T2', 'D1'), L('celina', 7, 'T2', 3, { wykonane: '', kg: '', powt: '' }),
    L('bartek', 4, 'T1', 1), L('bartek', 4, 'T1', 0, { typ: 'SKIP' }),
    L('darek', 1, 'W1', 1, { zapisano: '2026-11-15T09:00:00Z' })
  ];
  const ses = [{ klient: 'bartek', tydzien: 4, jednostka: 'T1', start: today + 'T07:00:00Z', czas_min: 55, rpe_sesji: 8 },
    { klient: 'ania', tydzien: 11, jednostka: 'T1', start: '2026-11-18T07:00:00Z', czas_min: 50, rpe_sesji: 7 }];
  const r = C.trDzis_(kl, plan, log, ses, today, d10);
  assert.deepEqual(plain(r.map(u => [u.name, u.week + u.day, u.title, u.st, u.ex, u.sets, u.done, u.rpe, u.min])), [
    ['Celina', '7T2', 'Góra', 'live', 2, 6, 2, null, null],      // w trakcie na górze; rozgrzewka, drop i nieodhaczona pusta nie liczą się
    ['Ania', '12T1', 'Nogi', 'wait', 2, 7, 0, null, null],       // dodane przez klienta nie liczy się do planu
    ['Bartek', '4T1', 'Nogi', 'done', 1, 5, 1, 8, 55]
  ]);
  assert.deepEqual(C.trDzis_(kl, [], [], [], today, d10), []);
});

test('trKalendarz_: jednostki wszystkich klientów w zakresie dat (dzień faktyczny, stan, bez daty)', () => {
  const today = '2026-11-17', d10 = v => String(v).slice(0, 10);
  const kl = [{ klient_id: 'ania', imie: 'Ania' }, { klient_id: 'bartek', imie: 'Bartek' }, { klient_id: 'ewa', imie: 'Ewa', aktywny: 'NIE' }];
  const P = (klient, tydzien, jednostka, data, cw, extra) => Object.assign({ klient, tydzien, jednostka, tytul: 'Góra', data, cwiczenie: cw, serie: 3, zrodlo: '', blok: 'B1' }, extra || {});
  const plan = [
    P('ania', 4, 'T1', '2026-11-16', 'Przysiad'), P('ania', 4, 'T1', '2026-11-16', 'Wiosłowanie'), P('ania', 4, 'T1', '2026-11-16', 'Dodane', { zrodlo: 'dodane' }),
    P('ania', 4, 'T2', '2026-11-17', 'Wyciskanie'),                       // dziś, serie dziś bez Sesji = w trakcie
    P('ania', 4, 'T3', '2026-11-19', 'Martwy'),                           // przyszła
    P('ania', 5, 'T1', '', 'Przysiad'), P('ania', 6, 'T1', '', 'Przysiad'), // bez daty: tylko najniższy niezrobiony tydzień (5)
    P('bartek', 2, 'T1', '2026-11-12', 'Rwanie'),                          // zrobiona przesunięta: dzień z Sesji (16.11)
    P('bartek', 2, 'T2', '2026-11-14', 'Podrzut'),                         // zaległa sprzed zakresu: poza zakresem
    P('bartek', 3, 'T1', '2026-11-15', 'Rwanie'),                          // zaległa w zakresie
    P('bartek', 1, 'W1', '', 'Pompki', { zrodlo: 'klient', tytul: '' }),   // własny bez daty i bez serii: nigdzie
    P('bartek', 1, 'W2', '', 'Pompki', { zrodlo: 'klient', tytul: '' }),   // własny z sesją 18.11
    P('ewa', 4, 'T1', '2026-11-16', 'Przysiad')                            // nieaktywna
  ];
  const L = (klient, tydzien, jednostka, seria, zapisano, extra) => Object.assign({ klient, tydzien, jednostka, seria, zapisano, wykonane: 'TAK', kg: 60, powt: 5, typ: '' }, extra || {});
  const log = [L('ania', 4, 'T1', 1, '2026-11-16T09:00:00Z'), L('ania', 4, 'T1', 'R1', '2026-11-16T08:50:00Z'), L('ania', 4, 'T2', 1, '2026-11-17T09:00:00Z'),
    L('bartek', 2, 'T1', 1, '2026-11-16T07:10:00Z')];
  const ses = [{ klient: 'ania', tydzien: 4, jednostka: 'T1', start: '2026-11-16T08:45:00Z', czas_min: 50, rpe_sesji: 8, prowadzil: 'trener' },
    { klient: 'bartek', tydzien: 2, jednostka: 'T1', start: '2026-11-16T07:00:00Z', czas_min: 40, rpe_sesji: 7 },
    { klient: 'bartek', tydzien: 1, jednostka: 'W2', start: '2026-11-18T07:00:00Z', czas_min: 30 }];
  const r = C.trKalendarz_(kl, plan, log, ses, '2026-11-15', '2026-11-21', today, d10);
  assert.deepEqual(plain(r.units.map(u => [u.date, u.name, u.week + u.day, u.st, u.ex, u.sets, u.done, u.plan, u.led, u.own, u.min])), [
    ['2026-11-15', 'Bartek', '3T1', 'late', 1, 3, 0, '2026-11-15', false, false, null],
    ['2026-11-16', 'Ania', '4T1', 'done', 2, 6, 1, '2026-11-16', true, false, 50],     // dodane przez klienta i rozgrzewka się nie liczą
    ['2026-11-16', 'Bartek', '2T1', 'done', 1, 3, 1, '2026-11-12', false, false, 40],  // dzień z Sesji, data z planu w „plan”
    ['2026-11-17', 'Ania', '4T2', 'live', 1, 3, 1, '2026-11-17', false, false, null],
    ['2026-11-18', 'Bartek', '1W2', 'done', 1, 3, 0, '', false, true, 30],
    ['2026-11-19', 'Ania', '4T3', 'wait', 1, 3, 0, '2026-11-19', false, false, null]]);
  assert.equal(r.units[1].title, 'Góra'); assert.equal(r.units[1].block, 'B1'); assert.equal(r.units[4].title, 'Własny trening');
  assert.deepEqual(plain(r.undated.map(u => [u.name, u.week + u.day])), [['Ania', '5T1']]);
  assert.deepEqual(plain(C.trKalendarz_(kl, [], [], [], '2026-11-15', '2026-11-21', today, d10)), { from: '2026-11-15', to: '2026-11-21', today, units: [], undated: [] });
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
test('trPlanPrev_, trPlanCtx_, aiPlanReq_: szkic następnego bloku (dane bez imienia, światła ostatniego tygodnia, zadanie)', () => {
  const d = szkicData();
  d.blocks = [{ blok: 'B2', od: '2026-11-03', do: '2026-11-19', tygodnie: '10–12', jednostki: '3/4', 'wykonanie_%': 80, tonaz_kg: 3700, e1RM_zm: '', najlepsze_boje: '', sRPE_sr: 7.3, samopocz_sr: 4, dyspozycja: '', bol_max: 5, statusy: '', wnioski: 'Przysiad +2,5 kg na tydzień.', dla_klienta: '' }];
  d.stan = [{ data: '2026-11-12', miejsce: 'Kolano', strona: 'L', ocena: 4, kontekst: 'w ćwiczeniu', cwiczenie: 'Przysiad tylny' }, { data: '2026-08-01', miejsce: 'Bark', strona: '', ocena: 6 }];
  const pv = C.trPlanPrev_(d, 'B2');
  assert.equal(pv.prevWeek, 12);
  assert.deepEqual(plain(pv.days.map(x => [x.day, x.week, x.dow])), [['T1', 12, 1], ['T2', 12, 3]]);
  assert.deepEqual(plain(pv.prev['T1|Przysiad tylny']), { sets: 3, reps: '5', kg: 84, lights: 'LSS' });   // RPE 7,5 / 8 / 8,5; rozgrzewka pominięta
  assert.equal(pv.prev['T1|Wiosłowanie hantlą'].lights, '');                                          // pominięte
  assert.equal(C.trPlanPrev_(d, 'B9'), null);
  assert.equal(C.trLight_({ typ: 'FAIL', rpe: '' }), 'X'); assert.equal(C.trLight_({ rpe: '' }), '·'); assert.equal(C.trLight_({ rpe: 9 }), 'W');
  const t = C.trPlanCtx_(d, 'B2', { weeks: 4, w0: 13, start: '2026-11-30', hint: 'ostatni tydzień lżejszy' });
  assert.doesNotMatch(t, /Ania|drive\.google|tajne/);
  assert.match(t, /Wnioski trenera po bloku B2 \(ważne.*„Przysiad \+2,5 kg na tydzień\.”/);
  assert.match(t, /T1 „Nogi” \(wt\):\n- \[A\] Przysiad tylny:\n  tydz\. 10: 3×5 80 kg @8 → 80×5@7,5, 80×5@8, 80×5@8,5; tydz\. 11: 3×5 82 kg @8 → 82×5@7,5, 82×5@8, 82×5 FAIL; tydz\. 12/);
  assert.match(t, /Wiosłowanie hantlą:\n.*tydz\. 12: 3×8\/str 20 kg → pominięte/);
  assert.match(t, /Stan ciała .*: 2026-11-12 Kolano L 4\/10 \(w ćwiczeniu: Przysiad tylny\)\./);
  assert.doesNotMatch(t, /Bark/);                                                                       // spoza bloku
  assert.match(t, /4 tyg\. \(numery tygodni 13–16\), start w poniedziałek 2026-11-30\. Każda lista "tygodnie" i "notatki" ma dokładnie 4 elementów/);
  assert.match(t, /Wskazówki trenera .*„ostatni tydzień lżejszy”/);
  const r = C.aiPlanReq_('KTX', {});
  assert.equal(r.model, 'claude-opus-5-5'); assert.equal(r.fallbacks, 'default'); assert.equal(r.output_config.effort, 'low');
  assert.equal(r.output_config.format.type, 'json_schema'); assert.equal(r.output_config.format.schema.additionalProperties, false);
  assert.match(r.system, /zaokrąglone w dół do 2,5 kg/); assert.match(r.system, /RPE ≤ 7,5\) = \+2,5 kg/); assert.match(r.system, /rpe_max to sufit/);
  assert.match(r.messages[0].content, /KTX[\s\S]*Ułóż szkic następnego bloku\./);
  const r2 = C.aiPlanReq_('K', { tweak: 'tekst', text: 'bez rwania', draft: [{ tydzien: 13, jednostka: 'T1', tytul: 'Nogi', nr: 1, cwiczenie: 'Przysiad tylny', serie: 4, powt: '5', kg: 85, procent: '', rpe_max: 8 }] });
  assert.match(r2.messages[0].content, /Poprzedni szkic:\nT1 „Nogi”:\n- Przysiad tylny: tydz\. 13 "4 x 5 \| 85 \|  \| 8"\n\nPopraw szkic .*: bez rwania$/);
  assert.match(C.aiPlanReq_('K', { tweak: 'lzej' }).messages[0].content, /Popraw szkic .*: Zrób cały blok lżejszym/);
  assert.ok(C.TR_FNS.trBlokPlan && C.TR_FNS.trBlokWczytaj && !C.API_FNS.trBlokPlan && !C.API_FNS.trBlokWczytaj);
});
test('trPlanCell_, trPlanRows_, trBlokNext_: wiersze planu ze szkicu AI (tygodnie, daty, cechy z poprzedniego bloku, walidacja)', () => {
  assert.deepEqual(plain(C.trPlanCell_('4 x 5 | 92.5 | | 8')), { serie: 4, powt: '5', kg: 92.5, procent: '', rpe_max: 8 });
  assert.deepEqual(plain(C.trPlanCell_('5×2|62,5|75|')), { serie: 5, powt: '2', kg: 62.5, procent: 0.75, rpe_max: '' });
  assert.deepEqual(plain(C.trPlanCell_('2 x 12/str | guma | | ')), { serie: 2, powt: '12/str', kg: 'guma', procent: '', rpe_max: '' });
  assert.equal(C.trPlanCell_('cztery serie'), null);
  assert.equal(C.trBlokNext_('B2', ['B1', 'B2']), 'B3'); assert.equal(C.trBlokNext_('B2', ['B2', 'B3']), 'B4'); assert.equal(C.trBlokNext_('Siła', []), 'Siła2');
  const prevRows = [{ klient: 'ania', tydzien: 12, jednostka: 'T1', cwiczenie: 'Rwanie', grupa: 'R', dod_serie: 0, zamienniki: 'Rwanie z zawieszenia', obwod: '' },
    { klient: 'ania', tydzien: 12, jednostka: 'T1', cwiczenie: 'Pallof press', obwod: 'A', grupa: '' }, { klient: 'ania', tydzien: 12, jednostka: 'T1', cwiczenie: 'Dead bug', obwod: 'A' }];
  const ai = { dlaczego: 'Rwanie stoi, przysiad +2,5 kg.', jednostki: [{ jednostka: 'T1', tytul: 'Nogi', dzien: 1, notatki: ['', 'Lżej, bez walki.'],
    cwiczenia: [{ cwiczenie: 'Rwanie', prio: 'A', uwagi: 'Szybko pod sztangę.', tygodnie: ['5 x 2 | 62.5 | 75 | ', '4 x 2 | 55 | 66 | '] },
      { cwiczenie: 'Pallof press', prio: 'K', uwagi: '', tygodnie: ['2 x 12/str | guma | | ', '2 x 12/str | guma | | '] },
      { cwiczenie: 'Przysiad przedni', prio: 'X', uwagi: '', tygodnie: ['4 x 5 | 70 | | 8', 'źle'] }] }] };
  const out = C.trPlanRows_(ai, { klient: 'ania', blok: 'B3', w0: 13, weeks: 2, start: '2026-11-30', prevRows });
  assert.equal(out.why, 'Rwanie stoi, przysiad +2,5 kg.');
  assert.equal(out.rows.length, 5);                                                                     // zła komórka pominięta
  assert.match(out.errors.join(' '), /T1 Przysiad przedni tydz\. 14: brak serii/);
  const rw = out.rows.find(r => r.cwiczenie === 'Rwanie' && r.tydzien === 13);
  assert.deepEqual(plain(rw), { klient: 'ania', tydzien: 13, jednostka: 'T1', tytul: 'Nogi', data: '2026-12-01', nr: 1, cwiczenie: 'Rwanie', prio: 'A', serie: 5, powt: '2', procent: 0.75, kg: 62.5, rpe_max: '',
    uwagi: 'Szybko pod sztangę.', blok: 'B3', grupa: 'R', zamienniki: 'Rwanie z zawieszenia', dod_serie: 0 });
  assert.equal(out.rows.find(r => r.cwiczenie === 'Rwanie' && r.tydzien === 14).uwagi_jedn, 'Lżej, bez walki.');   // notatka w wierszu nr 1
  assert.equal(out.rows.find(r => r.cwiczenie === 'Przysiad przedni').prio, 'B');                    // zły priorytet → B
  assert.ok(out.rows.every(r => r.obwod === undefined));                                              // obwód z jednym ćwiczeniem → usunięty
  assert.deepEqual(plain(C.validatePlan_(out.rows)), []);
  assert.deepEqual(plain(C.trPlanRows_({ jednostki: [] }, { weeks: 1 }).errors), ['AI nie zwróciło żadnej jednostki.']);
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

test('trPlanEdit_, trPlanVal_: szybka zmiana planu z panelu (tylko niezrobione, kolejne tygodnie o tę samą różnicę)', () => {
  const R = (w, d, nr, name, o) => Object.assign({ klient: 'ania', tydzien: w, jednostka: d, nr, cwiczenie: name, serie: 4, powt: '5', kg: '', procent: '', rpe_max: 8, uwagi: '', blok: 'B2', zrodlo: '', uwagi_jedn: '' }, o);
  const plan = [
    R(9, 'T1', 1, 'Przysiad', { kg: '90', procent: 0.7 }), R(9, 'T1', 2, 'Pallof', { kg: 'guma', powt: '12/str' }),
    R(10, 'T1', 1, 'Przysiad', { kg: '92.5', procent: 0.72, uwagi_jedn: 'stara' }), R(10, 'T1', 2, 'Pallof', { kg: 'guma' }), R(10, 'T1', 3, 'Przysiad', { kg: 50, zrodlo: 'usuniete' }),
    R(11, 'T1', 1, 'Przysiad', { kg: '95', procent: 0.74 }), R(11, 'T1', 2, 'Pallof', { kg: 'guma' }),
    R(12, 'T1', 1, 'Przysiad', { kg: '97,5', blok: 'B3' }),                      // inny blok: bez zmian
    R(8, 'T1', 1, 'Przysiad', { kg: '85' }),                                     // zrobiona (Sesje)
    R(13, 'T1', 1, 'Przysiad', { kg: '100' }),                                   // zaczęta (seria w Logu)
    R(9, 'W1', 1, 'Bieg', { zrodlo: 'klient' }),                                  // własny trening klienta
    R(9, 'T1', 1, 'Przysiad', { klient: 'bartek', kg: '60' })];
  const ses = [{ klient: 'ania', tydzien: 8, jednostka: 'T1' }], log = [{ klient: 'Ania', tydzien: '13', jednostka: 'T1', nr_cw: 1, seria: 1, wykonane: 'TAK' }];
  const ed = e => JSON.parse(JSON.stringify(C.trPlanEdit_(plan, ses, log, 'ania', e)));
  // walidacja pól (ta sama reguła co peBad w panelu)
  assert.deepEqual(JSON.parse(JSON.stringify(C.trPlanVal_('kg', '92,5'))), { v: 92.5, c: 92.5 });
  assert.equal(C.trPlanVal_('kg', 'BW').v, 'BW');
  assert.equal(C.trPlanVal_('pct', '75').v, 0.75);                               // % z panelu → ułamek w arkuszu
  assert.match(C.trPlanVal_('sets', '0').error, /1–40/);
  assert.match(C.trPlanVal_('rpe', '8,3').error, /0,5/);
  assert.equal(C.trPlanVal_('rpe', '').v, '');
  // zmiana w jednej jednostce: tylko zmienione komórki, wiersze panelu z nowymi wartościami
  let r = ed({ week: 9, day: 'T1', ex: [{ order: 1, kg: '92,5', sets: '4' }, { order: 2, note: 'wolno' }] });
  assert.deepEqual(r.set, [[0, { kg: 92.5 }], [1, { uwagi: 'wolno' }]]);          // serie 4 = bez zmiany
  assert.equal(r.n, 2); assert.deepEqual(r.weeks, [9]);
  assert.deepEqual(r.rows[0], { week: 9, day: 'T1', order: 1, f: { kg: 92.5 } });
  // kolejne tygodnie: kg i % o tę samą różnicę, reszta tak samo; inny blok, usunięte i zaczęte bez zmian
  r = ed({ week: 9, day: 'T1', next: true, ex: [{ order: 1, kg: '92.5', pct: '72', reps: '4' }, { order: 2, kg: 'mini guma' }] });
  const at = i => (r.set.find(x => x[0] === i) || [])[1];
  assert.deepEqual(at(0), { kg: 92.5, procent: 0.72, powt: '4' });
  assert.deepEqual(at(2), { kg: 95, procent: 0.74, powt: '4' });
  assert.deepEqual(at(5), { kg: 97.5, procent: 0.76, powt: '4' });
  assert.deepEqual(at(3), { kg: 'mini guma' }); assert.deepEqual(at(6), { kg: 'mini guma' });
  [4, 7, 8, 9, 11].forEach(i => assert.equal(at(i), undefined, 'wiersz ' + i));
  assert.deepEqual(r.weeks, [9, 10, 11]);
  // notatka do jednostki: w pierwszym wierszu, inne wiersze jednostki czyszczone, tylko ten tydzień
  r = ed({ week: 10, day: 'T1', ex: [], unote: ' Ostatnia seria bez walki ', next: true });
  assert.deepEqual(r.set, [[2, { uwagi_jedn: 'Ostatnia seria bez walki' }]]); assert.equal(r.n, 1);
  // blokady
  assert.match(ed({ week: 8, day: 'T1', ex: [{ order: 1, kg: '80' }] }).error, /zrobiona/);
  assert.match(ed({ week: 13, day: 'T1', ex: [{ order: 1, kg: '80' }] }).error, /zrobiona/);   // seria w Logu wystarczy
  assert.match(ed({ week: 9, day: 'W1', ex: [{ order: 1, reps: '5' }] }).error, /własny/);
  assert.match(ed({ week: 9, day: 'T9', ex: [] }).error, /Nie ma takiej jednostki/);
  assert.match(ed({ week: 9, day: 'T1', ex: [{ order: 7, kg: '1' }] }).error, /nr 7/);
  assert.match(ed({ week: 9, day: 'T1', ex: [{ order: 1, sets: '50' }] }).error, /Przysiad: Serie/);
  assert.ok(C.TR_FNS.trPlan && !C.API_FNS.trPlan);                                 // tylko zalogowany trener
});

test('trUnitEdit_, trMove_: cała jednostka z okna kalendarza (kolejność, nowe, usunięte, kolejne tygodnie) i przesunięcie dnia', () => {
  const R = (w, d, nr, name, o) => Object.assign({ klient: 'ania', tydzien: w, jednostka: d, tytul: 'Góra', data: '2026-11-1' + (w - 8), nr, cwiczenie: name, prio: 'A', serie: 4, powt: '5', kg: '', procent: '', rpe_max: 8, uwagi: '', blok: 'B2', zrodlo: '', obwod: '', uwagi_jedn: '' }, o);
  const plan = [
    R(9, 'T2', 1, 'Wyciskanie', { kg: '60' }), R(9, 'T2', 2, 'Podciąganie', { kg: 'BW', prio: 'B' }), R(9, 'T2', 3, 'Face pull', { prio: 'K', kg: 'guma' }),
    R(10, 'T2', 1, 'Wyciskanie', { kg: '62.5' }), R(10, 'T2', 2, 'Podciąganie', { kg: 'BW', prio: 'B' }), R(10, 'T2', 3, 'Face pull', { prio: 'K', kg: 'guma' }),
    R(11, 'T2', 1, 'Wyciskanie', { kg: '65' }), R(11, 'T2', 2, 'Dipy', { kg: 'BW' }),                     // inny skład: bez zmiany kolejności
    R(12, 'T2', 1, 'Wyciskanie', { kg: '70', blok: 'B3' }),                                                 // inny blok
    R(8, 'T2', 1, 'Wyciskanie', { kg: '57.5' }),                                                           // zrobiona
    R(9, 'W1', 1, 'Bieg', { zrodlo: 'klient' })];
  const done = { 'ania|8|T2': 1 };
  const ed = (e, logged) => JSON.parse(JSON.stringify(C.trUnitEdit_(plan, done, logged || {}, 'ania', e)));
  const it = (order, name, o) => Object.assign({ order, name, prio: 'A', sets: '4', reps: '5', kg: '', pct: '', rpe: '8', note: '' }, o);
  const base = [it(1, 'Wyciskanie', { kg: '60' }), it(2, 'Podciąganie', { kg: 'BW', prio: 'B' }), it(3, 'Face pull', { prio: 'K', kg: 'guma' })];
  // bez zmian = nic
  let r = ed({ week: 9, day: 'T2', items: base });
  assert.equal(r.n, 0); assert.deepEqual(r.set, []); assert.deepEqual(r.add, []); assert.deepEqual(r.del, []);
  // kolejność, kg, nowe ćwiczenie w obwodzie z poprzednim, usunięte ćwiczenie
  r = ed({ week: 9, day: 'T2', items: [it(2, 'Podciąganie', { kg: 'BW', prio: 'B', circuit: 'A' }), it(1, 'Wyciskanie', { kg: '62,5' }), { name: 'Wyciskanie hantli nad głowę', prio: 'B', sets: '3', reps: '10', kg: '14', circuit: 'b' }] });
  const at = i => (r.set.find(x => x[0] === i) || [])[1];
  assert.deepEqual(at(1), { nr: 1 });                                    // pojedyncza litera obwodu = zwykłe ćwiczenie
  assert.deepEqual(at(0), { nr: 2, kg: 62.5 });
  assert.equal(r.add.length, 1);
  assert.deepEqual([r.add[0].nr, r.add[0].cwiczenie, r.add[0].prio, r.add[0].serie, r.add[0].powt, r.add[0].kg, r.add[0].zrodlo, r.add[0].obwod, r.add[0].blok, r.add[0].data, r.add[0].tytul], [3, 'Wyciskanie hantli nad głowę', 'B', 3, '10', 14, 'trener', '', 'B2', '2026-11-11', 'Góra']);
  assert.deepEqual(r.del, [2]); assert.equal(r.n, 4); assert.deepEqual(r.weeks, [9]);
  // obwód z sąsiadem
  r = ed({ week: 9, day: 'T2', items: [base[0], it(2, 'Podciąganie', { kg: 'BW', prio: 'B', circuit: 'A' }), it(3, 'Face pull', { prio: 'K', kg: 'guma', circuit: 'A' })] });
  assert.deepEqual(r.set, [[1, { obwod: 'A' }], [2, { obwod: 'A' }]]);
  assert.match(ed({ week: 9, day: 'T2', items: [it(1, 'Wyciskanie', { circuit: 'A' }), base[1], it(3, 'Face pull', { prio: 'K', circuit: 'A' }), it(undefined, 'X', { circuit: 'A' })] }).error, /Obwód A musi zostać razem/);
  // data i notatka do jednostki
  r = ed({ week: 9, day: 'T2', items: base, date: '2026-11-13', unote: 'pauza 1 s' });
  assert.deepEqual(r.set, [[0, { data: '2026-11-13', uwagi_jedn: 'pauza 1 s' }], [1, { data: '2026-11-13' }], [2, { data: '2026-11-13' }]]); assert.equal(r.n, 2);
  // kolejne tygodnie: kg o tę samą różnicę, nazwa, usunięte i dodane po nazwie; kolejność tylko przy tym samym składzie; inny blok bez zmian
  r = ed({ week: 9, day: 'T2', next: true, items: [it(2, 'Podciąganie nachwytem', { kg: 'BW', prio: 'B' }), it(1, 'Wyciskanie', { kg: '62.5' }), { name: 'Pompki', prio: 'B', sets: '3', reps: '8', kg: 'BW' }] });
  assert.deepEqual(at(3), { nr: 2, kg: 65 });
  assert.deepEqual(at(4), { nr: 1, cwiczenie: 'Podciąganie nachwytem' });
  assert.deepEqual(at(6), { kg: 67.5 });                                  // tydz. 11: bez Podciągania i z Dipami = bez zmiany kolejności
  assert.equal(at(8), undefined); assert.equal(at(9), undefined);
  assert.deepEqual(r.del, [5, 2]);
  assert.deepEqual(r.add.map(x => [x.tydzien, x.nr, x.cwiczenie]), [[9, 3, 'Pompki'], [10, 3, 'Pompki'], [11, 3, 'Pompki']]);
  assert.deepEqual(r.weeks, [9, 10, 11]);
  // wpis w Logu: ćwiczenie zostaje na swoim numerze i nie da się go usunąć
  assert.match(ed({ week: 9, day: 'T2', items: [base[1], base[0], base[2]] }, { '9|1': 1 }).error, /Wyciskanie: ma zapisane serie, zostaje/);
  assert.match(ed({ week: 9, day: 'T2', items: [base[0], base[1]] }, { '9|3': 1 }).error, /Face pull: ma zapisane serie, nie da/);
  r = ed({ week: 9, day: 'T2', items: [base[0], base[2], base[1]] }, { '9|1': 1 });
  assert.deepEqual(r.set, [[1, { nr: 3 }], [2, { nr: 2 }]]);
  // blokady
  assert.match(ed({ week: 8, day: 'T2', items: base }).error, /zrobiona/);
  assert.match(ed({ week: 9, day: 'W1', items: base }).error, /własny/);
  assert.match(ed({ week: 9, day: 'T2', items: [] }).error, /co najmniej jedno/);
  assert.match(ed({ week: 9, day: 'T2', items: [it(7, 'X')] }).error, /odśwież/);
  assert.match(ed({ week: 9, day: 'T2', items: [base[0], base[0]] }).error, /dwa razy/);
  assert.match(ed({ week: 9, day: 'T2', items: [it(1, 'Wyciskanie', { sets: '0' })] }).error, /Wyciskanie: Serie/);
  assert.match(ed({ week: 9, day: 'T2', items: base, date: '13.11' }).error, /Zła data/);
  // przesunięcie dnia
  assert.deepEqual(JSON.parse(JSON.stringify(C.trMove_(plan, done, 'ania', { week: 9, day: 'T2', date: '2026-11-12' }))), { rows: [[0, '2026-11-12'], [1, '2026-11-12'], [2, '2026-11-12']], date: '2026-11-12' });
  assert.match(C.trMove_(plan, done, 'ania', { week: 8, day: 'T2', date: '2026-11-12' }).error, /zrobiona/);
  assert.match(C.trMove_(plan, done, 'ania', { week: 9, day: 'W1', date: '2026-11-12' }).error, /własny/);
  assert.match(C.trMove_(plan, done, 'ania', { week: 9, day: 'T2', date: '' }).error, /Zła data/);
  assert.ok(C.TR_FNS.trJednostka && C.TR_FNS.trPrzesun && C.TR_FNS.trCwNazwy && !C.API_FNS.trJednostka);
});

test('trCopy_: kopia jednostki i tygodnia w planie bloku (nowy tydzień, data, wolny kod dnia)', () => {
  const R = (w, d, nr, name, o) => Object.assign({ klient: 'ania', tydzien: w, jednostka: d, tytul: 'Góra', data: '', nr, cwiczenie: name, prio: 'A', serie: 4, powt: '5', kg: 60, procent: '', rpe_max: 8, uwagi: '', blok: 'B2', zrodlo: '', obwod: '', uwagi_jedn: '' }, o);
  const plan = [
    R(9, 'T1', 1, 'Przysiad', { data: '2026-11-09', tytul: 'Nogi', uwagi_jedn: 'pauza' }), R(9, 'T1', 2, 'RDL', { data: '2026-11-09', tytul: 'Nogi' }), R(9, 'T1', 51, 'Pompki', { zrodlo: 'dodane', data: '2026-11-09' }),
    R(9, 'T1', 3, 'Wykroki', { zrodlo: 'usuniete', data: '2026-11-09' }),
    R(9, 'T2', 1, 'Wyciskanie', { data: '2026-11-11' }),
    R(10, 'T1', 1, 'Przysiad', { data: '2026-11-16' }), R(10, 'T3', 1, 'Martwy', { data: '2026-11-18' }),
    R(9, 'W1', 1, 'Bieg', { zrodlo: 'klient' }), R(9, 'T1', 1, 'Przysiad', { klient: 'bartek' })];
  const cp = e => JSON.parse(JSON.stringify(C.trCopy_(plan, 'ania', e)));
  // jedna jednostka do nowego tygodnia: data + 7 dni, bez usuniętych i dodanych przez klienta, notatka do jednostki zostaje
  let r = cp({ units: [{ week: 9, day: 'T1' }], toWeek: 11 });
  assert.deepEqual(r.made, [{ week: 11, day: 'T1', from: '9|T1', date: '2026-11-23' }]);
  assert.deepEqual(r.rows.map(x => [x.tydzien, x.jednostka, x.nr, x.cwiczenie, x.data, x.tytul, x.blok, x.uwagi_jedn, x.kg]), [[11, 'T1', 1, 'Przysiad', '2026-11-23', 'Nogi', 'B2', 'pauza', 60], [11, 'T1', 2, 'RDL', '2026-11-23', 'Nogi', 'B2', '', 60]]);
  // zajęty kod dnia → następny wolny numer; własna data
  r = cp({ units: [{ week: 9, day: 'T1' }], toWeek: 10, date: '2026-11-20' });
  assert.deepEqual(r.made, [{ week: 10, day: 'T4', from: '9|T1', date: '2026-11-20' }]);
  // cały tydzień z przesunięciem
  r = cp({ units: [{ week: 9, day: 'T1' }, { week: 9, day: 'T2' }], toWeek: 12, shift: 21 });
  assert.deepEqual(r.made.map(x => [x.day, x.date]), [['T1', '2026-11-30'], ['T2', '2026-12-02']]);
  // błędy
  assert.match(cp({ units: [{ week: 9, day: 'W1' }], toWeek: 10 }).error, /Własnego/);
  assert.match(cp({ units: [{ week: 9, day: 'T9' }], toWeek: 10 }).error, /Nie ma jednostki T9/);
  assert.match(cp({ units: [], toWeek: 10 }).error, /Wybierz/);
  assert.match(cp({ units: [{ week: 9, day: 'T1' }], toWeek: 0 }).error, /tydzień/);
  assert.match(cp({ units: [{ week: 9, day: 'T1' }, { week: 9, day: 'T2' }], toWeek: 10, date: '2026-11-20' }).error, /Zła data/);
  assert.ok(C.TR_FNS.trKopiuj && !C.API_FNS.trKopiuj);
});

// --- zapis do arkusza: tekst zostaje tekstem ---
test('plain_: tekst zaczynający się jak formuła dostaje apostrof, liczby i zwykły tekst zostają bez zmian', () => {
  for (const v of ['=1+1', '=IMPORTRANGE("x";"Klienci!A:C")', ' =A1', '\t=A1', '\n=A1', '+SUM(A1)', '-A1', '- bolało kolano', '+48 600 100 200', '@x', '--', '-%'])
    assert.equal(C.plain_(v), "'" + v, JSON.stringify(v));
  for (const v of ['', 'Przysiad', '6-8', '8/str', '1+1', '30 s', 'BW', 'guma', '-', '+', '-5', '+10', '-2,5', '- 5', '-.5', '-5%', ' -5', '\t+10 ', "'=1+1", 'a=b', '2026-11-22', 'https://drive.google.com/file/d/x/view',
    'https://youtu.be/abc-def?v=1', 'jan@example.com', 'x =A1', '(8-10)', '(=A1', '"=A1"', ':-)', '[[-0.3,1.2],[0,0]]', '{"a":"=1"}', 'RPE 8 - lekko', 'żółw - wolno', 'Łydki + brzuch', 'привет - мир', '🟢 Lekko', '(lewa strona)', "'tekst", '— brak', '→ 100 kg'])
    assert.equal(C.plain_(v), v, JSON.stringify(v));
  for (const v of [0, 7.5, -3, true, false, null, undefined, new Date(0)]) assert.strictEqual(C.plain_(v), v);
  // przed znakiem = + - @ stoi coś, co arkusz mógłby pominąć (odstęp, znak niewidoczny albo sterujący, symbol spoza ASCII): też apostrof
  for (const v of ['\u200b=A1', '\u200d=A1', '\u2060=A1', '\ufeff=A1', '\u00a0=A1', '\u00ad=A1', '\u202e=A1', '\u0600=A1', '\ue000=A1', '\ufe0f=A1', '\u0301=A1', '\u3000=A1', '\u0000=A1', '\u007f=A1', '\u0085=A1', '\r\n =A1', '\u200b-5',
    '„=A1”', '😀=A1', '日本=A1', '• - punkt', '→ +2,5 kg', '\ud83d=A1'])
    assert.equal(C.plain_(v), "'" + v, JSON.stringify(v));
  // odmiany znaków: pełna szerokość, małe, indeksy, minus typograficzny
  for (const v of ['\uff1d1+1', '\uff0bSUM(A1)', '\uff0dA1', '\uff20x', '\ufe66A1', '\ufe62A1', '\ufe63A1', '\ufe6bx', '\u2212A1', '\u207aA1', '\u207bA1', '\u207cA1', '\u208aA1', '\u208bA1', '\u208cA1', '\u2a75A1', '\u2a76A1', '\ufb29A1', ' \uff1dA1', '\u200b\uff1dA1'])
    assert.equal(C.plain_(v), "'" + v, JSON.stringify(v));
  // tablica albo obiekt w miejscu wartości: zawsze tekst (JSON), nigdy coś, co arkusz sam zamieni na „=…”
  assert.strictEqual(C.plain_(['=1+1']), '["=1+1"]');
  assert.strictEqual(C.plain_([['=1+1']]), '[["=1+1"]]');
  assert.strictEqual(C.plain_(['x', 5]), '["x",5]');
  assert.strictEqual(C.plain_({ a: '=1+1' }), '{"a":"=1+1"}');
  assert.strictEqual(C.plain_(JSON.parse('{"toString":1,"valueOf":1,"toJSON":1}')), '{"toString":1,"valueOf":1,"toJSON":1}');
  assert.strictEqual(C.plain_(() => 1), '');
  const cyc = []; cyc.push(cyc);
  assert.strictEqual(C.plain_(cyc), '');
  assert.strictEqual(C.plain_(new Date(0)).getTime(), 0);                         // data z innego kontekstu zostaje datą
  for (const v of [['=1+1'], { a: 1 }, [], {}]) assert.equal(typeof C.plain_(v), 'string');
  assert.deepEqual(Array.from(C.plainRow_(['=1', 5, 'x'])), ["'=1", 5, 'x']);
  assert.deepEqual(C.plainRows_([['=1'], ['-a', 2]]).map(r => Array.from(r)), [["'=1"], ["'-a", 2]]);
});

test('zapis do arkusza: każdy setValue / setValues / appendRow w apps-script/ idzie przez plain_', () => {
  const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', 'apps-script'), bad = [];
  const raw = /\.(?:setValues\((?!plainRows_\()|setValue\((?!plain_\()|appendRow\((?!plainRow_\()|setFormulas?(?:R1C1)?\(|setRichTextValues?\(|replaceAllWith\(|replaceWith\()/g;
  for (const f of fs.readdirSync(dir).filter(f => /\.gs$/.test(f)))
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => { const hit = line.match(raw); if (hit) bad.push(f + ':' + (i + 1) + ' ' + hit.join(' ')); });
  assert.deepEqual(bad, []);
});

// Atrapa Arkuszy: komórka przyjmuje wpis jak prawdziwy arkusz przy zapisie ze skryptu: „=…” (oraz „+…” / „-…”, które nie są liczbą)
// staje się formułą {f}, „'…” zwykłym tekstem bez apostrofu, reszta zostaje bez zmian. Tam, gdzie zachowania Arkuszy nie znamy,
// atrapa przyjmuje najgorszy przypadek: tablicę albo obiekt zamienia na tekst (jak String()), pomija z przodu wszystko, co nie jest
// widocznym znakiem ASCII ani literą (odstępy, znaki niewidoczne i sterujące, symbole spoza ASCII), a odmiany znaków
// (np. „＝” pełnej szerokości, minus typograficzny) traktuje jak zwykłe = + -.
function fakeSheets(tabs) {
  const sign = c => { const n = c.normalize('NFKC').replace(/^\u2212/, '-').charAt(0); return n === '=' || n === '+' || n === '-' ? n : ''; };
  const solid = (c, k) => (k > 32 && k < 127) || (k > 127 && c.toLowerCase() !== c.toUpperCase());
  const enter = v => {
    if (v === null || v === undefined || typeof v === 'number' || typeof v === 'boolean' || Object.prototype.toString.call(v) === '[object Date]') return v;
    if (typeof v !== 'string') { try { v = String(v); } catch (e) { v = '[object Object]'; } }
    if (v.charAt(0) === "'") return v.slice(1);
    let i = 0;
    while (i < v.length && !solid(v.charAt(i), v.charCodeAt(i)) && !sign(v.charAt(i))) i++;
    const g = i < v.length ? sign(v.charAt(i)) : '';
    if (!g) return v;                                                              // pierwszy jest zwykły znak: zwykły wpis
    return g === '=' || !/^[+-]\s*(?:(?:\d+(?:[.,]\d*)?|[.,]\d+)\s*%?)?\s*$/.test(g + v.slice(i + 1)) ? { f: v } : v;
  };
  const isF = c => !!c && typeof c === 'object' && !(c instanceof Date) && 'f' in c;
  const val = c => isF(c) ? '#WYNIK FORMUŁY' : (c === undefined ? '' : c);
  const sheets = {};
  const mk = (name, rows) => {
    const g = rows.map(r => r.slice());
    const width = () => g.reduce((m, r) => Math.max(m, r.length), 0);
    const cell = (r, c) => (g[r - 1] || [])[c - 1];
    const grid = (r, c, nr, nc, fn) => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => fn(cell(r + i, c + j))));
    const put = (r, c, x) => { while (g.length < r) g.push([]); g[r - 1][c - 1] = enter(x); };
    const range = (r, c, nr, nc) => ({
      getValues: () => grid(r, c, nr, nc, val), getFormulas: () => grid(r, c, nr, nc, x => isF(x) ? x.f : ''), getValue: () => val(cell(r, c)), getRow: () => r,
      setValues(v) { v.forEach((row, i) => row.forEach((x, j) => put(r + i, c + j, x))); return this; },
      setValue(x) { put(r, c, x); return this; },
      setNumberFormat() { return this; }, setFontWeight() { return this; }, clearContent() { return this; },
      createTextFinder: t => ({ matchEntireCell() { return this; }, findNext() { for (let i = 0; i < nr; i++) if (String(val(cell(r + i, c))) === String(t)) return { getRow: () => r + i }; return null; } })
    });
    return sheets[name] = { grid: g, getLastRow: () => g.length, getLastColumn: width, getMaxRows: () => 1000,
      getDataRange: () => range(1, 1, Math.max(g.length, 1), Math.max(width(), 1)),
      getRange: (r, c, nr, nc) => typeof r === 'string' ? { setNumberFormat() { return this; } } : range(r, c, nr || 1, nc || 1),
      appendRow(row) { g.push(row.map(enter)); return this; }, deleteRow(r) { g.splice(r - 1, 1); }, deleteRows(r, n) { g.splice(r - 1, n); },
      setFrozenRows() {}, clear() { g.length = 0; }, clearContents() { g.length = 0; }, activate() {} };
  };
  Object.keys(tabs).forEach(n => mk(n, tabs[n]));
  return { sheets, ss: { getSheetByName: n => sheets[n] || null, insertSheet: n => mk(n, []), getSheets: () => Object.values(sheets) },
    formulas: () => Object.keys(sheets).flatMap(n => sheets[n].grid.flatMap((r, i) => r.map((c, j) => isF(c) ? n + ' w' + (i + 1) + ' k' + (j + 1) + ': ' + c.f : '').filter(Boolean))) };
}

test('zapis do arkusza: zapisy klienta z tekstem jak formuła zostają tekstem (atrapa arkusza), liczby zostają liczbami', () => {
  const S = require('./load-code')(), KEY = 'k0123456789a', evil = '=IMPORTRANGE("x";"Klienci!A:C")', plus = '+SUM(Klienci!A:A)', minus = '-Klienci!A2';
  const head = n => S[n].slice ? Array.from(S[n]) : [];
  const planRow = (week, nr, name) => Array.from(S.PLAN_HEADERS).map(h => ({ klient: 'anna', tydzien: week, jednostka: 'A', tytul: 'Siła', data: '2026-11-2' + week, nr: nr, cwiczenie: name, prio: 'A', serie: 3, powt: '6-8', kg: 100, blok: 'B1' })[h] === undefined ? '' : ({ klient: 'anna', tydzien: week, jednostka: 'A', tytul: 'Siła', data: '2026-11-2' + week, nr: nr, cwiczenie: name, prio: 'A', serie: 3, powt: '6-8', kg: 100, blok: 'B1' })[h]);
  const F = fakeSheets({
    Klienci: [['klucz', 'klient_id', 'imie', 'aktywny', 'link', 'bol', 'tryb', 'dod_serie', 'masters', 'zamiana', 'skala', 'sufit_oly', 'wlasne', 'edycja'],
      [KEY, 'anna', 'Anna', 'TAK', '', '', 'PRO', '', '', 'DOWOLNA', '', '', '', 'TAK']],
    Plan: [head('PLAN_HEADERS'), planRow(1, 1, 'Przysiad'), planRow(2, 1, 'Przysiad')]
  });
  S.SpreadsheetApp = { getActive: () => F.ss };
  S.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  S.Utilities = { formatDate: d => d.toISOString().slice(0, 10) };
  S.Session = { getScriptTimeZone: () => 'Europe/Warsaw' };
  // atrapa naprawdę zamienia „=…” w formułę: zapis obok plain_ byłoby widać
  F.sheets.Klienci.getRange(3, 1).setValue('=1+1');
  assert.equal(F.formulas().length, 1);
  F.sheets.Klienci.deleteRow(3);

  S.logSet(KEY, { week: 1, day: 'A', order: 1, set: 1, name: evil, kg: 100, reps: '8', rpe: 8, done: true, note: minus, typ: evil, ocena: 'L', swap: evil, date: evil, video: evil, vbt: plus, vbtPeak: evil, height: evil, path: evil });
  S.logSet(KEY, { week: 1, day: 'A', order: 1, set: 2, name: 'Przysiad', kg: '-2,5', reps: '6-8', rpe: '', done: true });
  S.logSet(KEY, { week: 1, day: 'A', order: 1, set: 1, name: evil, kg: 102.5, reps: '8', rpe: 9, done: true, note: minus });          // poprawka tej samej serii = ten sam wiersz
  S.logNote(KEY, { week: 1, day: 'A', order: 1, note: evil });
  S.logVideo(KEY, { week: 1, day: evil, order: 2, set: 1, name: plus, date: evil, link: 'https://drive.google.com/file/d/x/view' });
  S.logSession(KEY, { week: 1, day: 'A', date: evil, knee: evil, shoulder: evil, feel: 4, minutes: 55, note: evil, start: evil, end: evil, pain: evil, painMax: evil, rpeSession: plus });
  S.replyNote(KEY, { kind: 'L', id: 'anna|1|A|1|1', text: evil });
  S.replyNote(KEY, { kind: 'S', id: 'anna|1|A', text: minus });
  S.saveStan(KEY, [{ date: '2026-11-22', place: evil, side: 'L', score: 3, context: 'w ćwiczeniu', exercise: evil, note: plus }]);
  S.saveDyspozycja(KEY, { date: '2026-11-22', cmj: [evil, 30, 31], cmjAvg: evil, hooper: { sen: evil, stres: 2, zmeczenie: 2, bolesnosc: 2, suma: plus }, vbt: evil, verdict: evil, reasons: [evil, minus], excl: [evil] });
  S.logError(KEY, { kind: 'js', msg: evil, ver: evil, ua: plus });
  S.addOwnUnit(KEY, { week: 1, day: 'W1', date: '2026-11-22', title: evil, exercises: [{ name: evil, sets: 3, reps: '=1+1', kg: '=Log!A2' }, { name: 'Face pull', sets: 2, reps: '12', kg: 15 }] });
  S.editPlan(KEY, { op: 'add', week: 1, day: 'A', name: evil, sets: 2, reps: '+1', kg: '=A1' });
  S.editPlan(KEY, { op: 'swap', week: 1, day: 'A', order: 1, to: evil, forever: true });
  assert.deepEqual(F.formulas(), []);

  // tekst wraca do aplikacji dokładnie taki, jak wpisał klient (bez apostrofu), a liczby zostają liczbami
  const log = S.readRows_('Log', S.LOG_HEADERS, 'anna'), s1 = log.find(r => r.id === 'anna|1|A|1|1'), s2 = log.find(r => r.id === 'anna|1|A|1|2');
  assert.equal(log.length, 3);
  assert.equal(s1.cwiczenie, evil); assert.equal(s1.uwagi, evil); assert.equal(s1.odpowiedz_klienta, evil);
  assert.strictEqual(s1.kg, 102.5); assert.strictEqual(s1.rpe, 9);
  assert.strictEqual(s2.kg, '-2,5'); assert.strictEqual(s2.powt, '6-8');
  assert.equal(S.readRows_('Sesje', S.SES_HEADERS, 'anna')[0].uwagi, evil);
  assert.equal(S.readRows_('Stan', S.STAN_HEADERS, 'anna')[0].notatka, plus);
  const plan = S.tableOf_('Plan');
  assert.equal(plan.filter(r => r.zrodlo === 'klient')[0].cwiczenie, evil);
  assert.equal(plan.filter(r => r.zrodlo === 'dodane')[0].cwiczenie, evil);
  assert.equal(plan.find(r => r.tydzien === 2 && r.nr === 1).cwiczenie, evil);

  // wartości, których aplikacja nie wysyła, ale ktoś mógłby: tablica albo obiekt w miejscu tekstu / liczby, „＝” pełnej szerokości, znak niewidoczny z przodu
  const wide = '\uff1dIMPORTRANGE("x";"Klienci!A:C")', hid = '\u200b' + evil;
  for (const x of [[evil], [[evil]], { a: evil }, wide, hid, [wide], '\uff0bSUM(Klienci!A:A)', '\u2212Klienci!A2']) {
    S.logSet(KEY, { week: 1, day: 'A', order: 3, set: 1, name: x, kg: x, reps: x, rpe: x, vbt: x, done: true, video: x, note: x, typ: x, date: x, vbtPeak: x, height: x, swap: x });
    S.logSet(KEY, { week: x, day: x, order: x, set: x, name: 'Przysiad', kg: 100, reps: '8', done: true });
    S.logNote(KEY, { week: 1, day: 'A', order: 3, note: x });
    S.logSession(KEY, { week: 1, day: 'B', date: x, knee: x, shoulder: x, feel: x, minutes: x, note: x, start: x, end: x, pain: x, painMax: x, rpeSession: x });
    S.saveDyspozycja(KEY, { date: '2026-11-21', cmj: [x, x, x], cmjAvg: x, hooper: { sen: x, stres: x, zmeczenie: x, bolesnosc: x, suma: x }, vbt: x, verdict: x, reasons: [x], excl: x });
    S.logError(KEY, { kind: x, msg: x, ver: x, ua: x });
    assert.deepEqual(F.formulas(), [], JSON.stringify(x));
  }
  assert.equal(S.readRows_('Log', S.LOG_HEADERS, 'anna').find(r => r.id === 'anna|1|A|3|1').uwagi, '\u2212Klienci!A2');   // tekst wraca bez apostrofu

  // drugi obieg: dane odczytane z arkusza (już bez apostrofu) i zapisane jeszcze raz też nie tworzą formuł
  S.writeTable_('Kopia', Array.from(S.LOG_HEADERS), S.readRows_('Log', S.LOG_HEADERS, 'anna').map(r => Array.from(S.LOG_HEADERS).map(h => r[h])));
  const sh = F.sheets.Plan, all = sh.getDataRange().getValues();
  sh.getRange(1, 1, all.length, all[0].length).setValues(S.plainRows_(all));
  assert.deepEqual(F.formulas(), []);
  assert.equal(F.sheets.Kopia.getRange(2, 8).getValue(), evil);
});

test('diagnose_, formulaCells_: formuła w danych od klientów = błąd, w Planie = uwaga', () => {
  const base = { today: '2026-11-22', pwaUrl: 'https://example.github.io/trening/', triggers: ['podsumowanie', 'wczytajPlany', 'kopiaArkusza'], klienci: [], plan: [] };
  assert.deepEqual(Array.from(C.diagnose_(base)), []);
  assert.deepEqual(Array.from(C.diagnose_(Object.assign({ formuly: [] }, base))), []);
  const out = C.diagnose_(Object.assign({ formuly: [{ tab: 'Log', cells: ['P12', 'P13', 'Q2', 'R2', 'S2', 'T2'] }, { tab: 'Plan', cells: ['L7'] }, { tab: 'Sesje', cells: [] }] }, base)).map(r => Array.from(r));
  assert.equal(out.length, 2);
  assert.equal(out[0][0], 'błąd'); assert.match(out[0][1], /Formuły w zakładce Log \(6\): P12, P13, Q2, R2, S2…/);
  assert.equal(out[1][0], 'uwaga'); assert.match(out[1][1], /Formuły w zakładce Plan \(1\): L7\./);
  assert.deepEqual(Array.from(C.formulaCells_([['', '=1+1'], ['', ''], ['=A1', '']])), ['B2', 'A4']);
  assert.deepEqual([1, 26, 27, 52, 703].map(n => C.colA1_(n)), ['A', 'Z', 'AA', 'AZ', 'AAA']);
  assert.ok(Array.from(C.DANE_TABS).indexOf('Log') >= 0 && Array.from(C.DANE_TABS).indexOf('Sesje') >= 0);
});

test('Prowadź trening: doPost z biletem trenera i klient_id woła API klienta w trybie trenera; klient sam tego trybu nie włączy', () => {
  const saved = { trAuth_: C.trAuth_, ContentService: C.ContentService, clientById_: C.clientById_, LIVE_FNS: C.LIVE_FNS, API_FNS: C.API_FNS };
  C.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) };
  let authed = 0;
  C.trAuth_ = tok => { authed++; if (tok !== 'a.b.c') throw new Error(C.TR_AUTH + 'zaloguj się.'); return 't@example.com'; };
  C.clientById_ = id => id === 'ania' ? { key: 'kaaaaaaaaaa1', id: 'ania' } : null;
  const seen = [];
  const fake = name => (key, ...a) => { seen.push([name, key, C.LIVE_].concat(a)); return name; };
  C.LIVE_FNS = { getData: fake('getData'), liveNote: fake('liveNote') };
  C.API_FNS = Object.assign({}, saved.API_FNS, { getData: fake('getData') });
  const post = b => { C.LIVE_ = false; return C.doPost({ postData: { contents: JSON.stringify(b) } }); };
  try {
    assert.deepEqual(post({ fn: 'getData', token: 'a.b.c', as: 'ania' }), { ok: true, result: 'getData' });
    assert.deepEqual(seen.pop(), ['getData', 'kaaaaaaaaaa1', true]);              // klucz z zakładki Klienci, tryb trenera włączony
    assert.match(post({ fn: 'getData', token: 'x', as: 'ania' }).error, /^Logowanie: /);
    assert.match(post({ fn: 'getData', token: 'a.b.c', as: 'ewa' }).error, /Nie ma takiego klienta/);
    assert.match(post({ fn: 'trPulpit', token: 'a.b.c', as: 'ania', args: [] }).ok ? 'x' : 'ok', /ok|x/);
    assert.match(post({ fn: 'saveStan', token: 'a.b.c', as: 'ania' }).error, /Nieznana funkcja/);   // tylko funkcje z LIVE_FNS
    assert.deepEqual(post({ fn: 'getData', key: 'kaaaaaaaaaa1' }), { ok: true, result: 'getData' });
    assert.deepEqual(seen.pop(), ['getData', 'kaaaaaaaaaa1', false]);             // klient z kluczem: zwykły tryb
    assert.match(post({ fn: 'liveNote', key: 'kaaaaaaaaaa1' }).error, /Nieznana funkcja/);   // notatki trenera nie ma w API klienta
  } finally { Object.assign(C, saved); C.LIVE_ = false; }
  assert.equal(saved.API_FNS.liveNote, undefined);
  for (const k of Object.keys(C.LIVE_FNS)) { assert.equal(C.TR_FNS[k], undefined, k); if (k !== 'liveNote' && k !== 'saveTemplate') assert.ok(C.API_FNS[k], k); }
  assert.equal(C.LOG_HEADERS[C.LOG_HEADERS.length - 1], 'notatka_trenera');       // nowe kolumny na końcu
  assert.equal(C.SES_HEADERS[C.SES_HEADERS.length - 1], 'prowadzil');
  try { C.LIVE_ = false; assert.throws(() => C.liveNote('k', {}), /Brak dostępu/); } finally { C.LIVE_ = false; }
});

test('liveView_, liveNoteRow_: prywatna notatka trenera nie trafia do klienta; wiersz notatki w ćwiczeniu', () => {
  const d = () => ({ cfg: { name: 'Ania', simple: true, edit: false, own: false, swap: false, scale: 'RIR' }, logs: [{ id: 'a|1|T1|1|1', notatka_trenera: 'tylko ja', komentarz_trenera: 'dla klienta' }] });
  const cl = C.liveView_(d(), false);
  assert.equal('notatka_trenera' in cl.logs[0], false);
  assert.equal(cl.logs[0].komentarz_trenera, 'dla klienta');
  assert.equal(cl.cfg.live, undefined);
  const tr = plain(C.liveView_(d(), true));
  assert.equal(tr.logs[0].notatka_trenera, 'tylko ja');
  assert.deepEqual([tr.cfg.live, tr.cfg.simple, tr.cfg.edit, tr.cfg.own, tr.cfg.swap, tr.cfg.scale], [true, false, true, true, 'DOWOLNA', 'RIR']);
  const R = (seria, p, k) => ({ seria, notatka_trenera: p || '', komentarz_trenera: k || '' });
  assert.equal(C.liveNoteRow_([R('R1'), R(2), R(1), R('D1')]), 2);                  // najniższa seria robocza
  assert.equal(C.liveNoteRow_([R(1), R(2, '', 'film: kolana'), R(3, 'x')]), 1);     // pierwszy wiersz z notatką albo komentarzem
  assert.equal(C.liveNoteRow_([R('R1'), R('R2')]), 0);                            // same rozgrzewki: pierwsza
  assert.equal(C.liveNoteRow_([R(0)]), -1);                                       // samo pominięcie: nie ma gdzie
  assert.equal(C.liveNoteRow_([]), -1);
});

test('Prowadź trening: ćwiczenie i jednostka trenera w planie (zrodlo „trener”), zmiana planu w zaczętej jednostce', () => {
  const R = (w, j, nr, cw, x) => Object.assign({ klient: 'ania', tydzien: w, jednostka: j, tytul: 'Nogi', data: '2026-11-2' + w, nr, cwiczenie: cw, prio: 'A', serie: 3, powt: '5', kg: 85, blok: 'B2', uwagi: '' }, x || {});
  const plan = [R(1, 'T1', 1, 'Przysiad'), R(1, 'T1', 2, 'RDL'), R(2, 'T1', 1, 'Przysiad'), R(2, 'T1', 2, 'RDL'), R(1, 'W1', 1, 'Bieg', { zrodlo: 'klient' })];
  let r = plain(C.planEdit_(plan, [], 'ania', { op: 'add', week: 1, day: 'T1', name: 'Wykrok w tył', sets: 3, reps: 10, kg: '', trainer: true }));
  assert.deepEqual(r.add.map(a => [a.tydzien, a.nr, a.cwiczenie, a.prio, a.zrodlo]), [[1, 3, 'Wykrok w tył', 'B', 'trener']]);
  const after = plan.concat([R(1, 'T1', 3, 'Wykrok w tył', { zrodlo: 'trener' })]);
  assert.equal(C.planEdit_(after, [], 'ania', { op: 'add', week: 1, day: 'T1', name: 'wykrok w tył', sets: 3, reps: 10, trainer: true }).n, 0);   // ponowiona wysyłka nic nie dubluje
  assert.equal(C.planEdit_(after, [], 'ania', { op: 'add', week: 1, day: 'T1', name: 'Wykrok w tył', sets: 3, reps: 10 }).add[0].zrodlo, 'dodane');   // klient dalej „dodane”
  // trener: priorytet z okna i „połącz z poprzednim” = obwód z ostatnim ćwiczeniem (litera wolna w jednostce, istniejąca zostaje)
  r = plain(C.planEdit_(plan, [], 'ania', { op: 'add', week: 1, day: 'T1', name: 'Plank', sets: 3, reps: '30 s', kg: 'BW', trainer: true, prio: 'A', link: true }));
  assert.deepEqual(r.add.map(a => [a.nr, a.prio, a.obwod, a.kg, a.powt]), [[3, 'A', 'A', 'BW', '30 s']]);
  assert.deepEqual(r.set, [[1, { obwod: 'A' }]]);
  r = plain(C.planEdit_(after.map(x => x.cwiczenie === 'Wykrok w tył' ? Object.assign({}, x, { obwod: 'C' }) : x), [], 'ania', { op: 'add', week: 1, day: 'T1', name: 'Plank', sets: 3, reps: 10, trainer: true, prio: 'K', link: true }));
  assert.deepEqual([r.add[0].prio, r.add[0].obwod, r.set.length], ['K', 'C', 0]);
  assert.equal(C.planEdit_(plan, [], 'ania', { op: 'add', week: 1, day: 'T1', name: 'Plank', sets: 3, reps: 10, link: true, prio: 'K' }).add[0].obwod, '');   // klient: bez obwodu, prio A
  assert.equal(C.planEdit_(plan, [], 'ania', { op: 'add', week: 1, day: 'T1', name: 'Plank', sets: 3, reps: 10, link: true, prio: 'K' }).add[0].prio, 'A');
  assert.deepEqual(plain(C.trPlanVal_('prio', 'k')), { v: 'K', c: 'K' });
  assert.equal(C.trPlanVal_('prio', 'X').error, 'Priorytet: A, B albo K.');
  assert.deepEqual(plain(C.trPlanVal_('circuit', '')), { v: '', c: '' });
  assert.deepEqual(plain(C.trPlanVal_('section', 'Rozgrzewka')), { v: 'R', c: 'R' });
  assert.deepEqual(plain(C.trPlanVal_('section', '')), { v: '', c: '' });
  assert.match(C.trPlanVal_('section', 'cardio').error, /Sekcja/);
  assert.ok(C.trPlanVal_('circuit', 'AB').error);
  // nowa jednostka trenera: T<n>, zwykły tytuł, zrodlo „trener”; nie nadpisze jednostki z planu, ponowny zapis własnej tak
  const u = { week: 1, day: 'T2', date: '2026-11-22', title: ' Pośladki ', exercises: [{ name: 'Hip thrust', sets: 3, reps: 10, kg: 60 }] };
  r = plain(C.ownRows_('ania', u, plan, true));
  assert.deepEqual(r.rows.map(x => [x.jednostka, x.tytul, x.zrodlo, x.blok]), [['T2', 'Pośladki', 'trener', 'B2']]);
  assert.equal(C.ownRows_('ania', Object.assign({}, u, { title: '' }), plan, true).rows[0].tytul, 'Trening');
  assert.equal(C.ownRows_('ania', Object.assign({}, u, { day: 'T1' }), plan, true).error, 'Taka jednostka już jest w planie.');
  assert.equal(C.ownRows_('ania', u, plan.concat([R(1, 'T2', 1, 'Hip thrust', { zrodlo: 'trener' })]), true).error, undefined);
  assert.equal(C.ownRows_('ania', Object.assign({}, u, { day: 'W2' }), plan, true).error, 'Zła jednostka.');
  assert.equal(C.ownRows_('ania', u, plan).error, 'Zła jednostka.');               // klient nie zrobi jednostki T<n>
  // zmiana planu: z panelu zaczęta jednostka zablokowana, z prowadzonego treningu (live) nie
  const log = [{ klient: 'ania', tydzien: 1, jednostka: 'T1', nr_cw: 1, seria: 1, wykonane: 'TAK' }];
  assert.match(C.trPlanEdit_(plan, [], log, 'ania', { week: 1, day: 'T1', ex: [{ order: 1, kg: '87,5' }] }).error, /już zrobiona/);
  r = plain(C.trPlanEdit_(plan, [], log, 'ania', { week: 1, day: 'T1', live: true, next: true, ex: [{ order: 1, kg: '87,5' }] }));
  assert.deepEqual(r.rows.map(x => [x.week, x.f.kg]), [[1, 87.5], [2, 87.5]]);
});

test('pkgState_, pkgRow_, pkgAll_: pakiet treningów (zakup, treningi, korekty, przeniesienie reszty, poza pakietem)', () => {
  const r = (typ, data, ile, x) => Object.assign({ id: typ + data, zapisano: '2026-11-' + data.slice(8) + 'T10:00:00Z', klient: 'ania', data: data, typ: typ, ile: ile }, x || {});
  assert.equal(C.pkgState_([]), null, 'bez zakupu = brak pakietu');
  assert.equal(C.pkgState_([r('trening', '2026-11-03', -1)]), null);
  const rows = [
    r('zakup', '2026-10-01', 5, { cena: 500 }), r('trening', '2026-10-05', -1),            // poprzedni pakiet: 4 zostały
    r('zakup', '2026-11-01', 10, { przeniesione: 4, waznosc: '2026-12-31', cena: '1200', widoczny: 'TAK', notatka: 'przelew' }),
    r('trening', '2026-11-03', -1, { notatka: 'Siła A' }), r('korekta', '2026-11-05', -1, { notatka: 'park' }), r('korekta', '2026-11-06', 1)
  ];
  const k = C.pkgState_(rows);
  assert.equal(k.n, 14); assert.equal(k.bought, 10); assert.equal(k.carry, 4);
  assert.equal(k.used, 1); assert.equal(k.left, 13);
  assert.equal(k.from, '2026-11-01'); assert.equal(k.to, '2026-12-31'); assert.equal(k.price, 1200); assert.equal(k.show, true);
  assert.deepEqual(Array.from(k.hist, h => h.d), [1, -1, -1, 10], 'historia od najnowszych, zakup na końcu');
  assert.match(k.hist[2].txt, /Siła A · prowadzony/); assert.match(k.hist[1].txt, /park · dopisany ręcznie/); assert.match(k.hist[3].txt, /\+4 z poprzedniego/);
  // poza pakietem: więcej treningów niż wejść
  const over = C.pkgState_([r('zakup', '2026-11-01', 1), r('trening', '2026-11-02', -1), r('trening', '2026-11-04', -1)]);
  assert.equal(over.left, -1); assert.equal(over.hist[0].over, true); assert.equal(over.hist[1].over, false);
  assert.deepEqual(JSON.parse(JSON.stringify(C.pkgShort_(over))), { n: 1, left: -1, used: 2, from: '2026-11-01', to: '', show: false });

  // nowy pakiet: reszta przechodzi, chyba że stary wygasł przed datą zakupu
  const nw = C.pkgRow_('ania', { mode: 'nowy', n: 8, from: '2026-11-20', price: '960 zł', note: ' =SUM(A1) ', show: true }, k, '2026-11-20', 7);
  assert.equal(nw.row[0], 'ania|z|7'); assert.equal(nw.row[4], 'zakup'); assert.equal(nw.row[5], 8); assert.equal(nw.row[7], 960);
  assert.equal(nw.row[8], 13, 'przeniesione'); assert.equal(nw.row[10], '=SUM(A1)'); assert.equal(nw.row[11], 'TAK');
  const expired = Object.assign({}, k, { to: '2026-11-10' });
  assert.equal(C.pkgRow_('ania', { mode: 'nowy', n: 8 }, expired, '2026-11-20', 1).row[8], '', 'wygasły pakiet nie przechodzi');
  assert.equal(C.pkgRow_('ania', { mode: 'nowy', n: 8 }, k, '2026-11-20', 1).row[11], 'TAK', 'widoczność z poprzedniego pakietu');
  for (const [f, e] of [[{ n: 0 }, /Liczba/], [{ n: 101 }, /Liczba/], [{ n: 5, to: '31.12' }, /Ważność/], [{ n: 5, from: '2026-11-20', to: '2026-11-01' }, /przed datą/], [{ n: 5, price: 'dużo' }, /Cena/]])
    assert.match(C.pkgRow_('ania', Object.assign({ mode: 'nowy' }, f), null, '2026-11-20', 1).error, e);
  // korekta
  const kr = C.pkgRow_('ania', { mode: 'korekta', k: '-1', date: '2026-11-21', note: 'park' }, k, '2026-11-22', 9);
  assert.deepEqual([kr.row[0], kr.row[3], kr.row[4], kr.row[5]], ['ania|k|9', '2026-11-21', 'korekta', -1]);
  assert.match(C.pkgRow_('ania', { mode: 'korekta', k: -1 }, null, '2026-11-22', 1).error, /nie ma pakietu/);
  assert.match(C.pkgRow_('ania', { mode: 'korekta', k: 2 }, k, '2026-11-22', 1).error, /−1/);
  assert.match(C.pkgRow_('ania', { mode: 'korekta', k: 1, date: '2026-10-20' }, k, '2026-11-22', 1).error, /przed zakupem/);
  // pulpit: wielu klientów z jednej zakładki
  const all = C.pkgAll_(rows.concat([Object.assign(r('zakup', '2026-11-10', 5), { klient: 'Bartek' }), Object.assign(r('trening', '2026-11-11', -1), { klient: 'kasia' })]));
  assert.deepEqual(Object.keys(all).sort(), ['ania', 'bartek']); assert.equal(all.ania.left, 13); assert.equal(all.bartek.left, 5);
});

test('Pakiety: trPakiet tylko w panelu trenera (nie w API klienta ani w „Prowadź”)', () => {
  for (const n of ['trPakiet', 'trPakiety']) { assert.ok(C.TR_FNS[n], n); assert.ok(!C.API_FNS[n]); assert.ok(!C.LIVE_FNS[n]); }
});

test('pkgList_: Rozliczenia → pakiety wszystkich klientów (najmniej zostało na górze, nieaktywni na końcu)', () => {
  const r = (kl, typ, data, ile, x) => Object.assign({ id: kl + typ + data, zapisano: data + 'T10:00:00Z', klient: kl, data: data, typ: typ, ile: ile }, x || {});
  const rows = [r('ania', 'zakup', '2026-11-01', 10, { cena: 1200, waznosc: '2026-12-31' }), r('ania', 'trening', '2026-11-03', -1), r('ania', 'korekta', '2026-11-08', 1),
    r('bo', 'zakup', '2026-11-02', 2), r('bo', 'trening', '2026-11-04', -1), r('bo', 'trening', '2026-11-06', -1), r('bo', 'trening', '2026-11-09', -1),
    r('ewa', 'zakup', '2026-10-01', 4), r('nikt', 'zakup', '2026-10-01', 4)];
  const kl = [{ id: 'ania', name: 'Ania', on: true }, { id: 'bo', name: 'Bo', on: true }, { id: 'ewa', name: 'Ewa', on: false }, { id: 'zoe', name: 'Zoe', on: true }];
  const L = plain(C.pkgList_(rows, kl));
  assert.deepEqual(L.map(x => [x.name, x.n, x.used, x.left, x.last, x.on]), [['Bo', 2, 3, -1, '2026-11-09', true], ['Ania', 10, 0, 10, '2026-11-03', true], ['Ewa', 4, 0, 4, '', false]]);
  assert.deepEqual([L[1].price, L[1].from, L[1].to], [1200, '2026-11-01', '2026-12-31']);
  assert.deepEqual(plain(C.pkgList_([], kl)), []);
});

test('Pakiety (atrapa arkusza): nowy pakiet, trening z „Prowadź” zdejmuje raz, odhaczenie usuwa, korekta, widoczność; klient widzi licznik tylko po włączeniu', () => {
  const S = require('./load-code')(), KEY = 'k0123456789a';
  const F = fakeSheets({
    Klienci: [['klucz', 'klient_id', 'imie', 'aktywny', 'link', 'bol', 'tryb', 'dod_serie', 'masters', 'zamiana', 'skala', 'sufit_oly', 'wlasne', 'edycja'],
      [KEY, 'anna', 'Anna', 'TAK', '', '', 'PRO', '', '', '', '', '', '', '']]
  });
  S.SpreadsheetApp = { getActive: () => F.ss };
  S.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  S.Utilities = { formatDate: d => d.toISOString().slice(0, 10) };
  S.Session = { getScriptTimeZone: () => 'Europe/Warsaw' };
  assert.throws(() => S.trPakiet('nikt', { mode: 'nowy', n: 5 }), /Nie ma klienta/);
  assert.throws(() => S.trPakiet('anna', { mode: 'korekta', k: -1 }), /nie ma pakietu/);
  let k = S.trPakiet('anna', { mode: 'nowy', n: 10, from: '2026-11-01', to: '2026-12-31', price: '1200', note: '=1+1' });
  assert.equal(k.left, 10); assert.equal(k.show, false);
  assert.deepEqual(F.formulas(), [], 'notatka „=1+1” zostaje tekstem');
  const sess = { week: 3, day: 'A', start: '2026-11-03T17:00:00.000Z', title: 'Siła A', pkg: 1, feel: 4 };
  S.LIVE_ = true;
  S.logSession(KEY, sess); S.logSession(KEY, sess);                     // ponowny zapis tej samej jednostki nie zdejmuje drugi raz
  assert.equal(S.pkgOf_('anna').left, 9);
  S.logSession(KEY, Object.assign({}, sess, { pkg: 0 }));               // odhaczone („gratis”) = wpis usunięty
  assert.equal(S.pkgOf_('anna').left, 10);
  S.logSession(KEY, sess);
  S.LIVE_ = false;
  S.logSession(KEY, Object.assign({}, sess, { week: 4 }));              // klient sam: bez pakietu, nawet z pkg w danych
  assert.equal(S.pkgOf_('anna').left, 9);
  k = S.trPakiet('anna', { mode: 'korekta', k: -1, date: '2026-11-05', note: 'park' });
  assert.equal(k.left, 8); assert.match(k.hist[0].txt, /park/);
  k = S.trPakiet('anna', { mode: 'widok', show: true });
  assert.equal(k.show, true);
  k = S.trPakiet('anna', { mode: 'nowy', n: 5, from: '2026-11-20' });
  assert.deepEqual([k.n, k.carry, k.left, k.show], [13, 8, 13, true], 'reszta i widoczność przechodzą do nowego pakietu');
  assert.deepEqual(S.pkgAll_(S.tableOf_('Pakiety')).anna.left, 13);
});

test('trNextUnit_: „Zaplanuj następną” – zmiana jednostki w tyg. + 1 albo nowa jednostka trenera (kopia dzisiejszej)', () => {
  const J = x => JSON.parse(JSON.stringify(x));
  const R = (w, d, nr, name, o) => Object.assign({ klient: 'ania', tydzien: w, jednostka: d, tytul: 'Dół', data: '2026-11-23', nr, cwiczenie: name, prio: 'A', serie: 4, powt: '5', kg: 100, procent: '', rpe_max: 8,
    uwagi: 'kolana na zewnątrz', grupa: '', zamienniki: 'Front Squat', blok: 'B2', zrodlo: '', obwod: '', uwagi_jedn: 'notatka' }, o);
  const plan = [R(7, 'T1', 1, 'Back Squat'), R(7, 'T1', 2, 'RDL', { prio: 'B', kg: 80 }), R(7, 'T1', 51, 'Curl', { zrodlo: 'dodane' }), R(7, 'T1', 3, 'Row', { zrodlo: 'usuniete' }),
    R(7, 'T2', 1, 'Bench'), R(8, 'T2', 1, 'Bench', { kg: 70, data: '' }), R(8, 'T2', 2, 'Dip', { kg: 'BW' }), R(7, 'W1', 1, 'Bieg', { zrodlo: 'klient' }), R(7, 'T1', 1, 'Back Squat', { klient: 'bartek' })];
  // tyg. 8 bez T1: nowa jednostka trenera, kopia bez dodanych i usuniętych, data + 7, zmiany pól
  const n = J(C.trNextUnit_(plan, 'ania', { week: 7, day: 'T1', ex: [{ order: 1, kg: '102,5' }, { order: 2, sets: '3', reps: '6', rpe: '' }] }));
  assert.equal(n.mode, 'new'); assert.equal(n.week, 8);
  assert.deepEqual(n.rows.map(r => [r.tydzien, r.jednostka, r.nr, r.cwiczenie, r.serie, r.powt, r.kg, r.rpe_max, r.data, r.zrodlo, r.blok, r.zamienniki, r.uwagi_jedn]), [
    [8, 'T1', 1, 'Back Squat', 4, '5', 102.5, 8, '2026-11-30', 'trener', 'B2', 'Front Squat', 'notatka'],
    [8, 'T1', 2, 'RDL', 3, '6', 80, '', '2026-11-30', 'trener', 'B2', 'Front Squat', 'notatka']]);
  assert.equal(n.rows[0].klient, 'ania'); assert.equal(n.rows[0].uwagi, 'kolana na zewnątrz');
  assert.equal(C.trNextUnit_(plan, 'ania', { week: 7, day: 'T1', date: '2026-12-01', ex: [] }).rows[0].data, '2026-12-01');
  // tyg. 8 z T2 już w planie: zmiana jak „zmień plan”, dopasowanie po nazwie
  const e = J(C.trNextUnit_(plan, 'ania', { week: 7, day: 'T2', ex: [{ order: 1, kg: '72,5', sets: '4' }] }));
  assert.deepEqual(e, { mode: 'edit', week: 8, edit: { week: 8, day: 'T2', ex: [{ order: 1, kg: '72,5', sets: '4' }] } });
  // błędy
  assert.match(C.trNextUnit_(plan, 'ania', { week: 7, day: 'W1', ex: [] }).error, /własny trening/);
  assert.match(C.trNextUnit_(plan, 'ania', { week: 9, day: 'T1', ex: [] }).error, /Nie ma takiej jednostki/);
  assert.match(C.trNextUnit_(plan, 'ania', { week: 7, day: 'T1', ex: [{ order: 1, kg: 'x'.repeat(20) }] }).error, /Back Squat: kg/);
  assert.ok(C.TR_FNS.trNastepna && !C.LIVE_FNS.trNastepna && !C.API_FNS.trNastepna);
});

// ---------- import historii z innej aplikacji (Import.gs), dane syntetyczne ----------
const CW_TEST = [['Bench Press', 'Wyciskanie leżąc'], ['Dumbbell Bench Press', ''], ['Back Squat', 'Barbell Squat'], ['Lat Pulldown', ''], ['Press', 'Wyciskanie żołnierskie'], ['Plank', '']]
  .map(([n, a]) => ({ cwiczenie: n, aliasy: a, instruktaz: 'https://example.com/' + n.length, partia: '', zamienniki: '', grupa: '', glowna: '' }));

test('importFind_ / importMatch_: sprzęt z nawiasu przed nazwą, hantle nie łączą się ze sztangą, słownik CW_IMPORT', () => {
  const m = C.importMatch_(CW_TEST, ['Bench Press (Barbell)', 'Bench Press (Dumbbell)', 'Squat (Barbell)', 'Lat Pulldown (Cable)', 'Overhead Press (Barbell)', 'Plank', 'Incline Bench Press (Dumbbell)', 'Zercher Hold', '']);
  assert.deepEqual(m, { 'Bench Press (Barbell)': 'Bench Press', 'Bench Press (Dumbbell)': 'Dumbbell Bench Press', 'Squat (Barbell)': 'Back Squat', 'Lat Pulldown (Cable)': 'Lat Pulldown',
    'Overhead Press (Barbell)': 'Press', 'Plank': 'Plank', 'Incline Bench Press (Dumbbell)': '', 'Zercher Hold': '' });
  const full = C.cwBaza_(C.CW_BAZA, C.CW_ALIASY, C.CW_DODATKI, C.CW_FEDB, C.CW_SCALONE).map(b => ({ cwiczenie: b[0], aliasy: b[3], instruktaz: b[1] ? 'https://example.com/' + b[1] : '', partia: b[2], zamienniki: '', grupa: '', glowna: '' }));
  const ix = C.exIndex_(full);
  Object.keys(C.CW_IMPORT).forEach(k => assert.ok(C.exFind_(ix, C.CW_IMPORT[k]), 'cel słownika jest w bazie: ' + C.CW_IMPORT[k]));
  assert.equal(C.importFind_(ix, 'Bench Press (Dumbbell)').name, 'Dumbbell Bench Press');
});

test('importRows_: wiersze Planu, Logu i Sesji (tydzień 0, H<rrmmdd>, rozgrzewka, drop, superseria, na czas), błędy', () => {
  const W = [{ date: '2026-03-03', day: 'H260303', start: '2026-03-03T17:05:00.000Z', end: '2026-03-03T18:10:00.000Z', title: 'Nogi', note: '=1+1',
    ex: [{ name: 'Squat (Barbell)', sup: '', note: 'kolano', sets: [{ t: 'R', kg: 40, reps: 8 }, { t: 'W', kg: 100, reps: 5, rpe: 8 }, { t: 'W', kg: 100, reps: 4, rpe: 10 }, { t: 'D', kg: 80, reps: 6 }] },
      { name: 'Bench Press (Dumbbell)', sup: '0', sets: [{ t: 'W', kg: 26, reps: 10, rpe: 11 }] }, { name: 'Lat Pulldown (Cable)', sup: '0', sets: [{ t: 'W', kg: 55, reps: 10 }] },
      { name: 'Plank', sup: '', sets: [{ t: 'W', kg: '', reps: '', sec: 60 }] }] },
    { date: '2026-03-03', day: 'H260303b', start: '', end: '', title: '', ex: [{ name: 'Zercher Hold', sets: [{ t: 'W', kg: 60, reps: '', sec: 20 }] }] }];
  const r = C.importRows_('anna', W, { 'Squat (Barbell)': 'Back Squat', 'Bench Press (Dumbbell)': 'Dumbbell Bench Press' }, 'hevy', '2026-11-24T12:00:00.000Z');
  assert.deepEqual([r.units, r.sets, r.plan.length, r.log.length, r.ses.length], [2, 8, 5, 8, 2]);
  assert.deepEqual(r.plan.map(p => [p.jednostka, p.nr, p.cwiczenie, p.serie, p.powt, p.obwod, p.uwagi, p.tytul]), [
    ['H260303', 1, 'Back Squat', 2, '5', '', 'Hevy: Squat (Barbell)', 'Hevy · Nogi'], ['H260303', 2, 'Dumbbell Bench Press', 1, '10', 'A', 'Hevy: Bench Press (Dumbbell)', 'Hevy · Nogi'],
    ['H260303', 3, 'Lat Pulldown (Cable)', 1, '10', 'A', '', 'Hevy · Nogi'], ['H260303', 4, 'Plank', 1, '60 s', '', '', 'Hevy · Nogi'], ['H260303b', 1, 'Zercher Hold', 1, '20 s', '', '', 'Hevy · Trening']]);
  assert.ok(r.plan.every(p => p.tydzien === 0 && p.zrodlo === 'klient' && p.prio === 'A' && p.blok === '' && C.own_(p)));
  assert.deepEqual(r.log.slice(0, 4).map(l => [l.id, l.seria, l.kg, l.powt, l.rpe, l.typ, l.uwagi, l.wykonane]), [
    ['anna|0|H260303|1|R1', 'R1', 40, 8, '', '', 'kolano', 'TAK'], ['anna|0|H260303|1|1', 1, 100, 5, 8, '', 'kolano', 'TAK'],
    ['anna|0|H260303|1|2', 2, 100, 4, 10, '', 'kolano', 'TAK'], ['anna|0|H260303|1|D1', 'D1', 80, 6, '', 'DROP', 'kolano', 'TAK']]);
  assert.equal(r.log[4].rpe, '', 'RPE ponad 10 odrzucone');
  assert.equal(r.log[6].powt, 60, 'seria na czas: sekundy w powt');
  assert.deepEqual([r.ses[0].czas_min, r.ses[0].start, r.ses[0].uwagi, r.ses[1].czas_min, r.log[7].zapisano], [65, '2026-03-03T17:05:00.000Z', '=1+1', '', '2026-11-24T12:00:00.000Z']);
  assert.match(C.importRows_('anna', [], {}, 'hevy', '').error, /Brak treningów/);
  assert.match(C.importRows_('anna', [Object.assign({}, W[0], { day: 'H260304' })], {}, 'hevy', '').error, /Zła data/);
  assert.match(C.importRows_('anna', [W[0], W[0]], {}, 'hevy', '').error, /tym samym oznaczeniem/);
  assert.match(C.importRows_('anna', [Object.assign({}, W[0], { day: 'W1' })], {}, 'hevy', '').error, /Zła data/);
  assert.equal(C.importRows_('anna', W, {}, 'szablon', '').plan[0].tytul, 'Import · Nogi');
});

test('importTaken_ / importState_: dni z treningiem w aplikacji (bez importu), stan poprzedniego importu', () => {
  const log = [{ klient: 'anna', tydzien: 3, jednostka: 'A', data: '2026-03-03', wykonane: 'TAK' }, { klient: 'anna', tydzien: 3, jednostka: 'B', data: '2026-03-05', wykonane: '' },
    { klient: 'anna', tydzien: 0, jednostka: 'H260306', data: '2026-03-06', wykonane: 'TAK' }, { klient: 'bartek', tydzien: 1, jednostka: 'A', data: '2026-03-07', wykonane: 'TAK' }];
  const ses = [{ klient: 'anna', tydzien: 4, jednostka: 'A', data: '2026-03-09', start: '2026-03-10T17:00:00.000Z' }];
  assert.deepEqual(Object.keys(C.importTaken_(log, ses, 'anna', t => t.slice(0, 10))).sort(), ['2026-03-03', '2026-03-10']);
  const plan = [{ klient: 'anna', tydzien: 0, jednostka: 'H260306', data: '2026-03-06', tytul: 'Hevy · Nogi' }, { klient: 'anna', tydzien: 0, jednostka: 'H260301', data: '2026-03-01', tytul: 'Hevy · Góra' },
    { klient: 'anna', tydzien: 0, jednostka: 'H260301', data: '2026-03-01', tytul: 'Hevy · Góra' }, { klient: 'anna', tydzien: 1, jednostka: 'W1', data: '2026-03-02', zrodlo: 'klient' }];
  assert.deepEqual(C.importState_(plan, 'anna'), { n: 2, first: '2026-03-01', last: '2026-03-06', src: 'Hevy' });
  assert.equal(C.importState_(plan, 'bartek'), null);
  assert.ok(C.TR_FNS.trImport && !C.API_FNS.trImport && !C.LIVE_FNS.trImport);
});

test('Import (atrapa arkusza): trImport wczytuje, ponowny import zastępuje, cofnięcie usuwa tylko import; zwykły trening zostaje', () => {
  const S = require('./load-code')();
  const F = fakeSheets({
    Klienci: [['klucz', 'klient_id', 'imie', 'aktywny'], ['k0123456789a', 'anna', 'Anna', 'TAK']],
    Plan: [S.PLAN_HEADERS, S.PLAN_HEADERS.map(h => ({ klient: 'anna', tydzien: 1, jednostka: 'A', tytul: 'Siła', data: '2026-03-03', nr: 1, cwiczenie: 'Back Squat', prio: 'A', serie: 3, powt: '5' }[h] || ''))],
    Log: [S.LOG_HEADERS, S.LOG_HEADERS.map(h => ({ id: 'anna|1|A|1|1', klient: 'anna', tydzien: 1, jednostka: 'A', data: '2026-03-03', nr_cw: 1, cwiczenie: 'Back Squat', seria: 1, kg: 90, powt: 5, wykonane: 'TAK' }[h] || ''))],
    Sesje: [S.SES_HEADERS], 'Ćwiczenia': [S.CW_HEADERS].concat(CW_TEST.map(r => S.CW_HEADERS.map(h => r[h])))
  });
  S.SpreadsheetApp = { getActive: () => F.ss };
  S.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  S.CacheService = { getScriptCache: () => ({ get: () => null, getAll: () => ({}), putAll() {}, remove() {} }) };
  S.Utilities = { formatDate: d => d.toISOString().slice(0, 10) };
  S.Session = { getScriptTimeZone: () => 'Europe/Warsaw' };
  assert.throws(() => S.trImport('nikt', { mode: 'stan' }), /Nie ma aktywnego klienta/);
  assert.deepEqual(S.trImport('anna', { mode: 'stan' }), { prev: null });
  const look = S.trImport('anna', { mode: 'podglad', names: ['Squat (Barbell)', 'Moje ćwiczenie'], dates: ['2026-03-03', '2026-03-04'] });
  assert.deepEqual(look.match, { 'Squat (Barbell)': 'Back Squat', 'Moje ćwiczenie': '' });
  assert.deepEqual(look.taken, ['2026-03-03']);
  const w = (d, n) => ({ date: d, day: 'H' + d.slice(2).replace(/-/g, ''), start: d + 'T17:00:00.000Z', end: d + 'T18:00:00.000Z', title: 'Nogi', note: '',
    ex: [{ name: 'Squat (Barbell)', sets: Array.from({ length: n }, (_, i) => ({ t: 'W', kg: 100, reps: 5, rpe: i ? 8 : '' })) }] });
  let r = S.trImport('anna', { mode: 'wczytaj', src: 'hevy', workouts: [w('2026-03-04', 2), w('2026-03-06', 3)] });
  assert.deepEqual([r.units, r.sets, r.prev.n, r.prev.src], [2, 5, 2, 'Hevy']);
  assert.equal(S.tableOf_('Log').length, 6); assert.equal(S.tableOf_('Sesje').length, 2); assert.equal(S.tableOf_('Plan').length, 3);
  assert.equal(S.tableOf_('Plan')[1].cwiczenie, 'Back Squat');
  r = S.trImport('anna', { mode: 'wczytaj', src: 'hevy', workouts: [w('2026-03-08', 1)] });
  assert.deepEqual([r.units, S.tableOf_('Log').length, S.tableOf_('Sesje').length, S.tableOf_('Plan').length], [1, 2, 1, 2], 'ponowny import zastępuje poprzedni');
  assert.throws(() => S.trImport('anna', { mode: 'wczytaj', src: 'hevy', workouts: [Object.assign(w('2026-03-09', 1), { day: 'A' })] }), /Zła data/);
  assert.equal(S.tableOf_('Log').length, 2, 'błąd = nic nie usunięte');
  assert.deepEqual(S.trImport('anna', { mode: 'cofnij' }), { units: 1 });
  assert.deepEqual(S.tableOf_('Log').map(l => l.id), ['anna|1|A|1|1']);
  assert.equal(S.tableOf_('Plan').length, 1); assert.equal(S.tableOf_('Sesje').length, 0);
  assert.deepEqual(F.formulas(), []);
});

// --- metodyka 24.11.2026: singiel w e1RM, próg spadku e1RM, ACWR jako „skok obciążenia”, serie blisko upadku ---
test('e1rm_: Epley z zapasem, singiel do upadku = sam ciężar', () => {
  assert.equal(Math.round(C.e1rm_(80, 5, 8) * 10) / 10, 98.7);                    // 80 × (1 + 7/30)
  assert.equal(C.e1rm_(150, 1, 10), 150);                                         // nie 155 (Epley dawałby 103,3%)
  assert.equal(Math.round(C.e1rm_(150, 1, 9.5) * 10) / 10, 157.5);                // 1 + 0,5 zapasu = 1,5 do upadku
  assert.equal(Math.round(C.e1rm_(100, 2, 10) * 10) / 10, 106.7);
});

test('computeSummary_: spadek e1RM 🟠 od −5%, 🔴 od −8% albo drugi tydzień z rzędu; −3% bez sygnału', () => {
  const run = kgs => {
    const plan = [], log = [];
    kgs.forEach((kg, i) => {
      const w = i + 1;
      plan.push({ klient: 'ola', tydzien: w, jednostka: 'T1', data: d(w, 0), nr: 1, cwiczenie: 'Przysiad', prio: 'A', serie: 3, powt: '5', kg: 100 });
      for (let s = 1; s <= 3; s++) log.push({ klient: 'ola', tydzien: w, jednostka: 'T1', data: d(w, 0), nr_cw: 1, cwiczenie: 'Przysiad', seria: s, kg, powt: 5, rpe: 8, wykonane: 'TAK', typ: '' });
    });
    const r = C.computeSummary_(plan, log, [], []), H = C.SUM_HEADERS;
    return r.rows.map(x => [x[H.indexOf('status')], x[H.indexOf('powody')]]);
  };
  let r = run([100, 100, 97]);                                                     // −3%: szum jednego światła
  assert.equal(r[2][0], '🟢 OK');
  r = run([100, 100, 95]);
  assert.equal(r[2][0], '🟠 uwaga'); assert.match(r[2][1], /e1RM −5%/);
  r = run([100, 100, 90]);
  assert.match(r[2][1], /e1RM −8%/);
  r = run([100, 100, 95, 90]);                                                     // drugi tydzień ≤ −5% (90 vs śr. 97,5 = −7,7%)
  assert.match(r[3][1], /e1RM −5% drugi tydzień/);
});

test('computeSummary_: ACWR tylko jako 🟠 „skok obciążenia”, deload z planu poza średnią', () => {
  const plan = [], log = [], ses = [];
  // tyg. 1–4 normalnie, tyg. 5 deload z planu (−50% tonażu, krótko), tyg. 6 wraca do normy, tyg. 7 duży skok
  const mins = [60, 60, 60, 60, 25, 60, 140];
  mins.forEach((mn, i) => {
    const w = i + 1, serie = w === 5 ? 2 : 4;
    plan.push({ klient: 'ola', tydzien: w, jednostka: 'T1', data: d(w, 0), nr: 1, cwiczenie: 'Przysiad', prio: 'A', serie, powt: '5', kg: 100 });
    for (let s = 1; s <= serie; s++) log.push({ klient: 'ola', tydzien: w, jednostka: 'T1', data: d(w, 0), nr_cw: 1, cwiczenie: 'Przysiad', seria: s, kg: 100, powt: 5, rpe: 8, wykonane: 'TAK', typ: '' });
    ses.push({ klient: 'ola', tydzien: w, jednostka: 'T1', data: d(w, 0), samopoczucie: 4, czas_min: mn, rpe_sesji: 7 });
  });
  const r = C.computeSummary_(plan, log, ses, []), H = C.SUM_HEADERS, col = (i, h) => r.rows[i][H.indexOf(h)];
  assert.equal(col(5, 'ACWR'), 1);                                                 // tydzień po deloadzie: średnia bez deloadu = 420, nie skok
  assert.equal(col(5, 'status'), '🟢 OK');
  assert.ok(col(6, 'ACWR') > 2);
  assert.equal(col(6, 'status'), '🟠 uwaga');                                      // sam skok to nie 🔴
  assert.match(col(6, 'powody'), /skok obciążenia \(ACWR 2,33\)/);
});

test('computeSummary_: blisko_upadku = RPE ≥ 9 albo FAIL, serie twarde bez zmian', () => {
  const plan = [{ klient: 'ola', tydzien: 1, jednostka: 'T1', data: d(1, 0), nr: 1, cwiczenie: 'Przysiad', prio: 'A', serie: 5, powt: '5', kg: 100 }];
  const L = (s, rpe, typ) => ({ klient: 'ola', tydzien: 1, jednostka: 'T1', data: d(1, 0), nr_cw: 1, cwiczenie: 'Przysiad', seria: s, kg: 100, powt: 5, rpe, wykonane: 'TAK', typ: typ || '' });
  const log = [L(1, 7), L(2, 8), L(3, 9), L(4, 9.5), L(5, '', 'FAIL'), L('R1', 9)];
  const row = C.computeSummary_(plan, log, [], []).rows[0], H = C.SUM_HEADERS;
  assert.equal(row[H.indexOf('serie_twarde')], 5);
  assert.equal(row[H.indexOf('blisko_upadku')], 3);
  assert.equal(H[H.indexOf('blisko_upadku') + 1], 'ponad_plan_%');                // nowe kolumny tylko na końcu
});

// --- 25.11.2026: poprawki liczenia (próg 90%, NL prób, ponad plan, K-value) i kontrola taperu ---
const OLYW = (klient, nr, name, grupa, pct, kg, sets, extra) => {
  const plan = { klient, tydzien: 1, jednostka: 'T1', data: d(1, 0), nr, cwiczenie: name, prio: 'A', serie: sets.length, powt: '2', procent: pct, kg, grupa };
  const log = sets.map((x, i) => Object.assign({ klient, tydzien: 1, jednostka: 'T1', data: d(1, 0), nr_cw: nr, cwiczenie: name, seria: x.s || i + 1,
    kg: x.kg === undefined ? kg : x.kg, powt: x.powt === undefined ? 2 : x.powt, rpe: '', wykonane: 'TAK', typ: x.typ || '' }, extra || {}));
  return { plan, log };
};

test('zoneIx_ i nl90: seria dokładnie na 90% (i na granicach stref) bez błędu zaokrąglenia', () => {
  assert.deepEqual([0.6, 0.6000000001, 0.7, 0.8, 0.9, 0.9000000001, 0.8999999999, 1, 1.0000000001, 1.01].map(C.zoneIx_), [0, 0, 1, 2, 3, 3, 3, 4, 4, 5]);
  const a = OLYW('ola', 1, 'Rwanie', 'R', 0.9, 90, [{}, {}]);                     // 90 kg ÷ (90 / 0,9) = 0,9 ± ε
  const r = C.computeSummary_([a.plan], a.log, [], []), O = C.OLY_HEADERS;
  assert.equal(r.olyRows[0][O.indexOf('NL>90')], 4);
  assert.equal(r.olyRows[0][O.indexOf('z81-90')], 4);
});

test('NL_prob: spalona dwójka w R nie zmienia NL_R, NL_prob_R +2 (też bez wpisanych powtórzeń)', () => {
  const a = OLYW('ola', 1, 'Rwanie', 'R', 0.8, 80, [{}, {}, { typ: 'FAIL' }]);
  const b = OLYW('ola', 2, 'Podrzut', 'P', 0.8, 100, [{}, { typ: 'FAIL', powt: '' }]);
  const r = C.computeSummary_([a.plan, b.plan], a.log.concat(b.log), [], []), O = C.OLY_HEADERS, row = r.olyRows[0];
  assert.equal(row[O.indexOf('NL_R')], 4);
  assert.equal(row[O.indexOf('NL_prob_R')], 6);
  assert.equal(row[O.indexOf('NL_P')], 2);
  assert.equal(row[O.indexOf('NL_prob_P')], 4);                                  // spalona bez powt. = powt. z planu
  assert.equal(O.indexOf('NL_prob_R'), O.indexOf('sygnaly') + 1);                 // nowe kolumny na końcu
});

test('ponad plan: 102,5 przy 100 kg = ponad plan; BW, rozgrzewka, drop set i zamiana pominięte; 🟠 przy ≥ 10% albo boju', () => {
  const P = (nr, name, kg, serie) => ({ klient: 'ola', tydzien: 1, jednostka: 'T1', data: d(1, 0), nr, cwiczenie: name, prio: 'A', serie, powt: '5', kg });
  const L = (nr, name, s, kg, x) => Object.assign({ klient: 'ola', tydzien: 1, jednostka: 'T1', data: d(1, 0), nr_cw: nr, cwiczenie: name, seria: s, kg, powt: 5, rpe: 8, wykonane: 'TAK', typ: '' }, x || {});
  const plan = [P(1, 'Przysiad', 100, 4), P(2, 'Pompki', 'BW', 3), P(3, 'Wiosłowanie', 60, 6)];
  const log = [L(1, 'Przysiad', 1, 102.5), L(1, 'Przysiad', 2, 100), L(1, 'Przysiad', 3, 100), L(1, 'Przysiad', 4, 100),
    L(1, 'Przysiad', 'R1', 120), L(1, 'Przysiad', 'D1', 110, { typ: 'DROP' }), L(2, 'Pompki', 1, 10), L(2, 'Pompki', 2, 10),
    L(3, 'Hantle', 1, 80, { zamiana: 'Wiosłowanie → Hantle | sprzęt' })].concat([1, 2, 3, 4, 5, 6].map(s => L(3, 'Wiosłowanie', s + 1, 60)));
  const H = C.SUM_HEADERS, row = C.computeSummary_(plan, log, [], []).rows[0];
  assert.equal(row[H.indexOf('ponad_plan_%')], 10);                              // 1 z 10 serii (4 przysiad + 6 wiosłowanie)
  assert.equal(row[H.indexOf('ponad_plan_max')], '+2,5 kg (Przysiad)');
  assert.match(row[H.indexOf('powody')], /ciężar ponad plan: 1 z 10 serii/);
  // 1 z 11 (< 10%) bez bojów: bez sygnału; jedna seria rwania ponad plan: sygnał
  const plan2 = [plan[0], plan[1], P(3, 'Wiosłowanie', 60, 7)], log2 = log.concat([L(3, 'Wiosłowanie', 8, 60)]);
  const r2 = C.computeSummary_(plan2, log2, [], []).rows[0];
  assert.equal(r2[H.indexOf('ponad_plan_%')], 9.1);
  assert.doesNotMatch(r2[H.indexOf('powody')], /ponad plan/);
  const a = OLYW('ola', 1, 'Rwanie', 'R', 0.8, 80, [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, { kg: 82.5 }]);
  const r3 = C.computeSummary_([a.plan], a.log, [], []).rows[0];
  assert.match(r3[H.indexOf('powody')], /ciężar ponad plan: 1 z 12 serii \(także boje\)/);
});

test('K-value: średni ciężar zaliczonych powt. ≥ 60% ÷ (max rwanie + max podrzut); bez maksów puste', () => {
  const a = OLYW('ola', 1, 'Rwanie', 'R', 0.8, 80, [{}, { typ: 'FAIL' }]);       // 2 powt. × 80 (spalona poza)
  const b = OLYW('ola', 2, 'Przysiad przedni', 'PS', 0.8, 120, [{}]);             // 2 × 120
  const c = OLYW('ola', 3, 'Rwanie z zawisu', 'R', 0.5, 50, [{}]);                // 50% poza K-value
  const plan = [a.plan, b.plan, c.plan], log = a.log.concat(b.log, c.log), O = C.OLY_HEADERS;
  const r = C.computeSummary_(plan, log, [], [{ klient_id: 'ola', max_rwanie: 100, max_podrzut: '125' }]);
  assert.equal(r.olyRows[0][O.indexOf('K_value')], 44.4);                         // 100 / 225 × 100
  const e = C.computeSummary_(plan, log, [], [{ klient_id: 'ola' }]).olyRows[0];
  for (const h of ['K_value', 'dni_do_startu', 'ost_R_100', 'ost_P_100']) assert.equal(e[O.indexOf(h)], '', h);
  assert.doesNotMatch(e[O.indexOf('sygnaly')], /taper/);
});

test('taperCheck_: limity Romana (P 100% ≥ 9 dni, R 100% ≥ 7 dni przed startem)', () => {
  const T = (grp, day, rel) => C.taperCheck_([{ grp, rel: rel || 1, day, src: 'plan' }], '2026-12-12');
  assert.equal(T('P', '2026-12-05').length, 1);
  assert.equal(T('P', '2026-12-05')[0].text, 'taper: P 100% na 7 dni przed startem (limit 9) · plan 05.12');
  assert.equal(T('P', '2026-12-03').length, 0);
  assert.equal(T('R', '2026-12-05').length, 0);
  assert.match(T('R', '2026-12-06')[0].text, /R 100% na 6 dni przed startem \(limit 7\)/);
  assert.match(T('P', '2026-12-06', 0.95)[0].text, /P 95% na 6 dni .*limit 7/);
  assert.equal(T('P', '2026-12-07', 0.9).length, 0);                             // 90%: limit 5, 5 dni = w porządku
  assert.equal(T('P', '2026-12-08', 0.9).length, 1);                             // 4 dni
  assert.match(T('R', '2026-12-11')[0].text, /na 1 dzień przed/);
  assert.equal(T('P', '2026-12-11', 0.85).length, 0);                            // poniżej 90% bez limitu
  assert.equal(T('P', '2026-12-12').length + T('P', '2026-12-13').length, 0);    // dzień startu i później pomijane
  assert.equal(C.taperCheck_([{ grp: 'P', rel: 1, day: '2026-12-05' }], '').length, 0);
});

test('taper w Podsumowanie_OLY (wiersz bieżącego tygodnia) i w imporcie planu', () => {
  const kl = [{ klient_id: 'ola', start: '2026-12-12' }], O = C.OLY_HEADERS, today = '2026-11-30';
  const P = (data, name, grupa, pct, kg, j) => ({ klient: 'ola', tydzien: 9, jednostka: j, data, nr: 1, cwiczenie: name, prio: 'A', serie: 1, powt: '1', procent: pct, kg, grupa });
  const plan = [P('2026-11-30', 'Rwanie', 'R', 1, 100, 'T1'), P('2026-12-05', 'Podrzut', 'P', 1, 125, 'T2'), P('2026-12-03', 'Podrzut', 'P', 1, 125, 'T3')];
  const log = [{ klient: 'ola', tydzien: 9, jednostka: 'T1', data: '2026-11-30', nr_cw: 1, cwiczenie: 'Rwanie', seria: 1, kg: 100, powt: 1, rpe: '', wykonane: 'TAK', typ: '' }];
  const r = C.computeSummary_(plan, log, [], kl, { today });
  const row = r.olyRows.find(x => x[1] === '2026-11-30');
  assert.match(row[O.indexOf('sygnaly')], /^🔴 taper: P 100% na 7 dni przed startem \(limit 9\) · plan 05\.12$/);
  assert.equal(row[O.indexOf('dni_do_startu')], 12);
  assert.equal(row[O.indexOf('ost_R_100')], '2026-11-30');
  assert.equal(row[O.indexOf('ost_P_100')], '');
  // start za > 28 dni: bez sprawdzania
  assert.doesNotMatch(C.computeSummary_(plan, log, [], kl, { today: '2026-11-01' }).olyRows[0][O.indexOf('sygnaly')], /taper/);
  // bez treningu w tym tygodniu: osobny wiersz bieżącego tygodnia
  const r2 = C.computeSummary_(plan, [], [], kl, { today });
  assert.equal(r2.olyRows.length, 1);
  assert.equal(r2.olyRows[0][1], '2026-11-30');
  assert.match(r2.olyRows[0][O.indexOf('sygnaly')], /taper: P 100%/);
  assert.equal(r2.olyRows[0].length, O.length);
  // import: ostrzeżenie (nie błąd)
  assert.deepEqual(Array.from(C.taperImport_(plan, kl, today)), ['ola: taper: P 100% na 7 dni przed startem (limit 9) · plan 05.12']);
  assert.equal(C.taperImport_(plan, [{ klient_id: 'ola' }], today).length, 0);
  assert.equal(C.taperImport_(plan, kl, '2026-10-01').length, 0);
});

test('tplRows_ / tplList_: szablony jednostek trenera (bez kg i imion klientów)', () => {
  const r = plain(C.tplRows_({ name: '  Full  body A ', ex: [{ name: 'Bench', sets: '4', reps: 8 }, { name: 'Plank', sets: 2, reps: '30 s', circuit: 'a' }, { name: '' }] }, '2026-11-23T10:00:00.000Z'));
  assert.deepEqual(r, { name: 'Full body A', rows: [['Full body A', 1, 'Bench', 4, '8', '', '2026-11-23T10:00:00.000Z'], ['Full body A', 2, 'Plank', 2, '30 s', 'A', '2026-11-23T10:00:00.000Z']] });
  assert.match(C.tplRows_({ name: '', ex: [{ name: 'x', sets: 1, reps: 1 }] }).error, /Nazwa/);
  assert.match(C.tplRows_({ name: 'A', ex: [] }).error, /bez ćwiczeń/);
  assert.match(C.tplRows_({ name: 'A', ex: [{ name: 'x', sets: 0, reps: 5 }] }).error, /Serie/);
  const H = C.SZ_HEADERS, row = a => Object.fromEntries(H.map((h, i) => [h, a[i]]));
  assert.deepEqual(plain(C.tplList_([row(['Rozruch', 2, 'Plank', 2, '30 s', '', '']), row(['Rozruch', 1, 'Goblet Squat', 3, '10', '', '']), row(['Full body A', 1, 'Bench', 4, '8', '', '']), row(['', 1, 'x', 1, '1', '', ''])])), [
    { name: 'Full body A', ex: [{ name: 'Bench', sets: 4, reps: '8', circuit: '' }] },
    { name: 'Rozruch', ex: [{ name: 'Goblet Squat', sets: 3, reps: '10', circuit: '' }, { name: 'Plank', sets: 2, reps: '30 s', circuit: '' }] }]);
  assert.ok(C.LIVE_FNS.saveTemplate && !C.API_FNS.saveTemplate && !C.TR_FNS.saveTemplate);
  try { C.LIVE_ = false; assert.throws(() => C.saveTemplate('k', {}), /Brak dostępu/); } finally { C.LIVE_ = false; }
  for (const n of ['trSzablon', 'trSzablony']) { assert.ok(C.TR_FNS[n], n); assert.ok(!C.API_FNS[n] && !C.LIVE_FNS[n], n); }
});

test('Szablony (atrapa arkusza): panel zapisuje, zmienia nazwę i usuwa; to samo widzi „Prowadź”', () => {
  const S = require('./load-code')(), F = fakeSheets({});
  S.SpreadsheetApp = { getActive: () => F.ss };
  S.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  let L = S.trSzablon({ name: 'Rozruch', ex: [{ name: 'Goblet Squat', sets: 3, reps: '6-8' }, { name: 'Plank', sets: 2, reps: '30 s' }] });
  assert.deepEqual(plain(L).map(t => [t.name, t.ex.length]), [['Rozruch', 2]]);
  L = S.trSzablon({ name: 'Full body', ex: [{ name: '=Bench', sets: 4, reps: 8 }] });
  assert.deepEqual(F.formulas(), [], 'nazwa „=Bench” zostaje tekstem');
  L = S.trSzablon({ name: 'Rozruch B', old: 'rozruch', ex: [{ name: 'Goblet Squat', sets: 4, reps: '6-8' }] });
  assert.deepEqual(plain(L).map(t => [t.name, t.ex[0].sets, t.ex[0].reps]), [['Full body', 4, '8'], ['Rozruch B', 4, '6-8']]);
  L = S.trSzablon({ name: 'Full body', del: true });
  assert.deepEqual(plain(S.trSzablony()).map(t => t.name), ['Rozruch B']);
  assert.throws(() => S.trSzablon({ name: 'X', ex: [] }), /bez ćwiczeń/);
});

test('trProwadzone_: treningi prowadzone przez trenera w miesiącu, na klienta (liczba, daty, minuty)', () => {
  const S = (klient, w, d, start, min, pr, data) => ({ klient, tydzien: w, jednostka: d, start, czas_min: min, prowadzil: pr, data: data || '' });
  const ses = [S('ania', 12, 'T1', '2026-11-03T16:00:00.000Z', 55, 'trener'), S('Ania', 13, 'T1', '2026-11-10T16:00:00.000Z', '', 'trener'), S('bartek', 4, 'T2', '2026-11-05T07:00:00.000Z', 60, 'trener'),
    S('ania', 14, 'T1', '2026-11-12T16:00:00.000Z', 50, ''), S('ewa', 2, 'T1', '', 45, 'trener', '2026-10-28'), S('ania', 11, 'T1', '2026-10-27T16:00:00.000Z', 40, 'trener')];
  const kl = [{ klient_id: 'ania', imie: 'Ania' }, { klient_id: 'bartek', imie: 'Bartek' }, { klient_id: 'ewa', imie: 'Ewa' }];
  const plan = [{ klient: 'ania', tydzien: 12, jednostka: 'T1', tytul: 'Dół' }, { klient: 'bartek', tydzien: 4, jednostka: 'T2', tytul: 'FBW' }];
  const r = plain(C.trProwadzone_(ses, kl, plan, '', '2026-11-23', t => t.slice(0, 10)));
  assert.deepEqual([r.mies, r.months, r.n, r.min], ['2026-11', ['2026-11', '2026-10'], 3, 115]);
  assert.deepEqual(r.clients.map(c => [c.name, c.n, c.min, c.items.map(i => [i.date, i.title, i.min])]), [
    ['Ania', 2, 55, [['2026-11-03', 'Dół', 55], ['2026-11-10', 'T1', 0]]], ['Bartek', 1, 60, [['2026-11-05', 'FBW', 60]]]]);
  const o = plain(C.trProwadzone_(ses, kl, plan, '2026-10', '2026-11-23', t => t.slice(0, 10)));
  assert.deepEqual(o.clients.map(c => [c.name, c.n, c.min]), [['Ania', 1, 40], ['Ewa', 1, 45]]);   // bez startu: data z Sesji
  assert.deepEqual(plain(C.trProwadzone_([], kl, [], '', '2026-11-23')), { mies: '2026-11', months: ['2026-11'], clients: [], n: 0, min: 0 });
  assert.ok(C.TR_FNS.trProwadzone);
});

test('mniej konfliktów: VERSION w sw.js nadaje publikacja, listy funkcji API po jednej w linii', () => {
  const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
  const sw = fs.readFileSync(path.join(root, 'web', 'sw.js'), 'utf8');
  assert.match(sw, /^const VERSION = 'dev';$/m, "w repo VERSION = 'dev' (pages.yml podmienia go przy publikacji)");
  const yml = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
  assert.match(yml, /sed -i "s\/\^const VERSION = 'dev';\//, 'publikacja podmienia VERSION');
  [['Code.gs', 'API_FNS'], ['Code.gs', 'LIVE_FNS'], ['Trener.gs', 'TR_FNS']].forEach(([f, n]) => {
    const src = fs.readFileSync(path.join(root, 'apps-script', f), 'utf8');
    const body = src.match(new RegExp('const ' + n + ' = \\{[^\\n]*\\n([\\s\\S]*?)\\n\\};'))[1].split('\n').map(l => l.trim());
    assert.ok(body.every(l => /^\w+,$/.test(l)), n + ': jedna nazwa w linii');
    const names = body.map(l => l.slice(0, -1));
    assert.deepEqual(names, names.slice().sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())), n + ': alfabetycznie');
    assert.equal(names.length, Object.keys(C[n]).length);
  });
});

test('trCwiczenia_: ćwiczenia z planów aktywnych klientów bez filmu (części kompleksu osobno), od najczęstszych; martwe linki z ostatniego sprawdzenia', () => {
  const cw = [{ cwiczenie: 'Back Squat', aliasy: 'Przysiad tylny', instruktaz: 'https://www.youtube.com/watch?v=aaaaaaaaaaa' },
    { cwiczenie: 'Goblet Squat', aliasy: 'Przysiad goblet', partia: 'czworogłowe' },
    { cwiczenie: 'Hang Clean', instruktaz: 'https://youtu.be/bbbbbbbbbbb' },
    { cwiczenie: 'Face Pull', partia: 'barki' },
    { cwiczenie: 'Przysiad tylny stary', glowna: 'Back Squat' }];
  const kl = [{ klient_id: 'anna', aktywny: 'TAK' }, { klient_id: 'bartek', aktywny: 'TAK' }, { klient_id: 'stary', aktywny: 'NIE' }];
  const plan = [
    { klient: 'anna', cwiczenie: 'Przysiad tylny', data: '2026-11-20' }, { klient: 'anna', cwiczenie: 'Przysiad goblet', data: '2026-11-21' },
    { klient: 'bartek', cwiczenie: 'Goblet Squat', data: '2026-11-25' }, { klient: 'bartek', cwiczenie: 'Hang Clean + Face Pull', data: '2026-11-24' },
    { klient: 'anna', cwiczenie: 'Wymyślone ćwiczenie', data: '' }, { klient: 'anna', cwiczenie: 'Face Pull', zrodlo: 'usuniete' },
    { klient: 'stary', cwiczenie: 'Nieaktywny ruch', data: '2026-11-01' }];
  const r = plain(C.trCwiczenia_(plan, cw, kl, [{ u: 'https://youtu.be/bbbbbbbbbbb', s: 'brak' }, { u: 'https://inny.test/x', s: 'prywatny' }]));
  assert.deepEqual(r.missing, [
    { name: 'Goblet Squat', inBase: true, as: ['Przysiad goblet'], n: 2, clients: 2, last: '2026-11-25' },
    { name: 'Face Pull', inBase: true, as: ['Hang Clean + Face Pull'], n: 1, clients: 1, last: '2026-11-24' },
    { name: 'Wymyślone ćwiczenie', inBase: false, as: [], n: 1, clients: 1, last: '' }]);
  assert.deepEqual(r.dead, [{ name: 'Hang Clean', url: 'https://youtu.be/bbbbbbbbbbb', why: 'brak', n: 1 }]);
  assert.equal(r.links, 2);
  assert.deepEqual(plain(C.trCwiczenia_([], [], [], [])), { missing: [], dead: [], links: 0 });
});

test('RODO (Rodo.gs): rodoCol_, rodoPick_, rodoRuns_, csvOf_, rodoFile_ – wiersze klienta z każdej zakładki, usuwanie od dołu', () => {
  assert.equal(C.rodoCol_(['id', 'zapisano', 'klient']), 2); assert.equal(C.rodoCol_(['klucz', 'klient_id', 'imie', 'klient']), 1); assert.equal(C.rodoCol_(['cwiczenie']), -1);
  const v = [['id', 'klient', 'x'], ['1', 'ania', 'a'], ['2', 'Ania ', 'b'], ['3', 'bartek', 'c'], ['4', 'ania', 'd'], ['5', 'aniaa', 'e']];
  const p = plain(C.rodoPick_(v, 'ANIA'));
  assert.deepEqual(p.idx, [0, 1, 3]); assert.deepEqual(p.rows.map(r => r[0]), ['1', '2', '4']); assert.deepEqual(p.head, ['id', 'klient', 'x']);
  assert.deepEqual(plain(C.rodoPick_(v, '')).idx, []); assert.deepEqual(plain(C.rodoPick_([['a'], ['ania']], 'ania')).idx, [], 'bez kolumny klienta nic');
  assert.deepEqual(plain(C.rodoRuns_([0, 1, 3, 7, 8, 9, 1])), [[9, 3], [5, 1], [2, 2]]);   // wiersze arkusza (nagłówek = 1), od dołu
  assert.deepEqual(plain(C.rodoRuns_([])), []);
  assert.equal(C.csvOf_([['a', 'b;c', 'd"e'], [new Date('2026-11-23T10:00:00Z'), 'x\ny', null]]), '﻿a;"b;c";"d""e"\r\n2026-11-23T10:00:00.000Z;"x\ny";');
  assert.equal(C.rodoFile_('Podsumowanie_OLY'), 'Podsumowanie_OLY.csv'); assert.equal(C.rodoFile_('Ćwiczenia'), 'Cwiczenia.csv'); assert.equal(C.rodoFile_('Błędy'), 'Bledy.csv'); assert.equal(C.rodoFile_('Ciało'), 'Cialo.csv');
  assert.deepEqual(plain(C.RODO_POMIN), ['klucz', 'link', 'urzadzenia', 'api_klucz']);
  ['trKlientEksport', 'trKlientUsun'].forEach(f => { assert.ok(C.TR_FNS[f], f); assert.ok(!C.API_FNS[f] && !C.LIVE_FNS[f], f); });
});

test('cwFilm_, linkProbe_, linkStan_: zapis linku trenera do bazy i ocena odpowiedzi przy sprawdzaniu', () => {
  const rows = [{ cwiczenie: 'Back Squat' }, { cwiczenie: 'Stary', glowna: 'Back Squat' }, { cwiczenie: 'Face  Pull' }];
  assert.deepEqual(plain(C.cwFilm_(rows, 'face pull', ' https://youtu.be/x ')), { i: 2, value: 'https://youtu.be/x' });
  assert.deepEqual(plain(C.cwFilm_(rows, 'Back Squat', '')), { i: 0, value: '' });                 // pusty = usuń film
  assert.deepEqual(plain(C.cwFilm_(rows, 'Nowe  ćwiczenie', 'https://a.test/v')).add, ['Nowe ćwiczenie', '', 'https://a.test/v', '', '', '', '']);
  assert.deepEqual(plain(C.cwFilm_(rows, 'Stary', 'https://a.test/v')).add[0], 'Stary');           // wiersz z „glowna” nie dostaje filmu
  assert.throws(() => C.cwFilm_(rows, 'Back Squat', 'javascript:alert(1)'), /https/);
  assert.throws(() => C.cwFilm_(rows, 'Back Squat', '=HYPERLINK("x")'), /https/);
  assert.throws(() => C.cwFilm_(rows, 'Back Squat', 'https://a.test/' + 'x'.repeat(600)), /https/);
  assert.throws(() => C.cwFilm_(rows, 'Nie ma', ''), /Nie ma/);
  assert.throws(() => C.cwFilm_(rows, ' ', 'https://a.test'), /nazwy/);
  assert.equal(C.linkProbe_('https://www.youtube.com/watch?v=abc&t=3'), 'https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc%26t%3D3');
  assert.match(C.linkProbe_('https://youtu.be/abc'), /^https:\/\/www\.youtube\.com\/oembed\?/);
  assert.match(C.linkProbe_('https://youtube.com/shorts/abc'), /oembed/);
  assert.equal(C.linkProbe_('https://vimeo.com/1'), 'https://vimeo.com/1');
  assert.deepEqual([200, 302, 404, 410, 400, 401, 403, 429, 500, 0].map(C.linkStan_), ['', '', 'brak', 'brak', 'brak', 'prywatny', 'prywatny', null, null, null]);
  ['trCwiczenia', 'trCwFilm', 'trCwSprawdz'].forEach(f => { assert.ok(C.TR_FNS[f], f); assert.ok(!C.API_FNS[f] && !C.LIVE_FNS[f], f); });
});

test('wieczorny mail po komentarzu (komNowe_, komMail_, komPierwsze_) i „ostatnio otwarta” (seenUpd_, devsOf_, kolumny T–V)', () => {
  const kl = (key, id, name, email, kom, on) => { const r = [key, id, name, on || '', '', '', '', '', '', '', '', '', '', '', email, '', '', '', '', kom]; return r; };
  const klienci = [kl('kaaaaaaaaaa1', 'ania', 'Ania', 'ania@example.com', 'TAK'), kl('kbbbbbbbbbb2', 'bartek', 'Bartek', 'b@example.com', ''), kl('kcccccccccc3', 'ewa', 'Ewa', '', 'TAK')];
  const today = '2026-11-23';
  const log = [{ klient: 'ania', tydzien: 12, jednostka: 'T1', data: '2026-11-22', komentarz_trenera: '0:12 Kolana na zewnątrz. Reszta super!', komentarz_dysk: '' },
    { klient: 'ania', tydzien: 12, jednostka: 'T1', data: '2026-11-22', komentarz_trenera: '0:12 Kolana na zewnątrz. Reszta super!', komentarz_dysk: '' },   // ta sama treść w drugiej serii
    { klient: 'ania', tydzien: 10, jednostka: 'T1', data: '2026-11-12', komentarz_trenera: 'Stary komentarz.', komentarz_dysk: '' },
    { klient: 'ania', tydzien: 1, jednostka: 'T1', data: '2026-09-01', komentarz_trenera: 'Bardzo stary.', komentarz_dysk: '' },
    { klient: 'bartek', tydzien: 3, jednostka: 'T1', data: '2026-11-22', komentarz_trenera: 'Bez maila (wyłączony).', komentarz_dysk: '' }];
  const ses = [{ klient: 'ania', tydzien: 12, jednostka: 'T2', data: '2026-11-23', start: '2026-11-23T07:00:00.000Z', komentarz_trenera: 'Dobra sesja' }];
  const plan = [{ klient: 'ania', tydzien: 12, jednostka: 'T1', tytul: 'Dół' }, { klient: 'ania', tydzien: 12, jednostka: 'T2', tytul: 'Góra' }];
  // pierwszy wieczór: tylko komentarze do treningów z wczoraj i dziś; ewa bez adresu, bartek wyłączony
  const r1 = plain(C.komNowe_(klienci, log, ses, plan, {}, today, v => String(v).slice(0, 10)));
  assert.deepEqual(r1.send.map(x => [x.c.id, x.email, x.units.map(u => [u.title, u.day, u.items])]), [['ania', 'ania@example.com', [['Góra', '2026-11-23', ['Dobra sesja']], ['Dół', '2026-11-22', ['Kolana na zewnątrz.']]]]]);
  assert.deepEqual(Object.keys(r1.sig), ['ania']);
  assert.equal(r1.sig.ania.length, 3);                                      // stary (12.11) też zapamiętany, bardzo stary poza oknem
  // następny wieczór bez nowych: nic; nowy komentarz: tylko on
  assert.deepEqual(plain(C.komNowe_(klienci, log, ses, plan, r1.sig, today)).send, []);
  const log2 = log.concat([{ klient: 'ania', tydzien: 10, jednostka: 'T1', data: '2026-11-12', komentarz_trenera: 'Dopisek do starego treningu', komentarz_dysk: '' }]);
  const r2 = plain(C.komNowe_(klienci, log2, ses, plan, r1.sig, today));
  assert.deepEqual(r2.send[0].units.map(u => [u.title, u.items]), [['T1', ['Dopisek do starego treningu']]]);
  assert.equal(C.komPierwsze_('1:05 Biodra wyżej! Potem łokcie.'), 'Biodra wyżej!');
  assert.ok(C.komPierwsze_('x'.repeat(300)).length <= 160);
  const m = C.komMail_({ name: 'Ania' }, r1.send[0].units, { url: 'https://x.test/?k=kaaaaaaaaaa1&t=trener' });
  assert.equal(m.subject, 'Trener skomentował Twój trening');
  assert.match(m.html, /Przeczytaj w aplikacji/); assert.match(m.html, /t=trener/); assert.match(m.body, /niedziela 22\.11 · Dół\n— Kolana na zewnątrz\./);
  assert.equal(C.komMail_({ name: 'A' }, [r1.send[0].units[1]], {}).subject, 'Trener skomentował Twój trening: Dół');
  assert.equal(C.komMail_({ name: '<b>' }, r1.send[0].units).html.indexOf('<b>!'), -1);       // imię uciekane w HTML
  // ostatnio otwarta: lista urządzeń
  const s1 = C.seenUpd_('', 'abcd1234', '2026-11-23T10:00:00.000Z');
  assert.deepEqual(JSON.parse(s1), [['abcd1234', '2026-11-23T10:00:00.000Z']]);
  const s2 = C.seenUpd_(JSON.stringify([['ffff0000', '2026-08-01T10:00:00.000Z'], ['abcd1234', '2026-11-20T10:00:00.000Z'], ['eeee1111', '2026-11-21T10:00:00.000Z']]), 'abcd1234', '2026-11-23T10:00:00.000Z');
  assert.deepEqual(JSON.parse(s2), [['abcd1234', '2026-11-23T10:00:00.000Z'], ['eeee1111', '2026-11-21T10:00:00.000Z']]);   // starsze niż 60 dni odpadają
  assert.equal(C.seenUpd_('zepsute', 'a1b2c3d4', '2026-11-23T10:00:00.000Z').length > 0, true);
  assert.equal(C.devsOf_(s2), 2); assert.equal(C.devsOf_(''), 0); assert.equal(C.devsOf_('x'), 0);
  const k = C.trKlientOf_(['k', 'a', 'A', '', '', '', '', '', '', '', '', '', '', '', 'a@b.pl', '', 100, 120, '2027-01-10', 'TAK', '2026-11-23T10:00:00.000Z', s2], '');
  assert.deepEqual([k.mailKom, k.seen, k.devs], [true, '2026-11-23T10:00:00.000Z', 2]);
  assert.equal(C.trKlientVals_(Object.assign({}, C.KL_DOMYSLNE, { email: 'a@b.pl', mailKom: true })).vals[19], 'TAK');
  assert.match(C.trKlientVals_(Object.assign({}, C.KL_DOMYSLNE, { mailKom: true })).error, /Mail po komentarzu/);
  assert.deepEqual(C.KL_HEAD.concat(C.KL_EXTRA).slice(15), ['mail_rano', 'max_rwanie', 'max_podrzut', 'start', 'mail_kom', 'otwarta', 'urzadzenia', 'cialo', 'api_klucz', 'api_ustawienia', 'ograniczenia_ai']);
  // „Sprawdź arkusz”: mail po komentarzu bez wyzwalacza = błąd
  const dg = C.diagnose_({ pwaUrl: 'x', triggers: ['podsumowanie', 'wczytajPlany', 'kopiaArkusza'], klienci: [{ klucz: 'kaaaaaaaaaa1', klient_id: 'ania', imie: 'Ania', aktywny: 'TAK', mail_kom: 'TAK', email: 'a@b.pl' }], plan: [], log: [] });
  assert.ok(dg.some(x => /wieczornyMail/.test(x[1])), JSON.stringify(dg));
});

test('unitEdit_: kolejność i nazwy ćwiczeń jednostki (trener: każda, klient: własny trening)', () => {
  const R = (week, day, nr, cw, x) => Object.assign({ klient: 'ania', tydzien: week, jednostka: day, nr, cwiczenie: cw, blok: 'B1', zrodlo: '', obwod: '' }, x || {});
  const plan = [R(1, 'T1', 1, 'Przysiad'), R(1, 'T1', 2, 'Wiosło', { obwod: 'A' }), R(1, 'T1', 3, 'Pompki', { obwod: 'A' }), R(1, 'T1', 4, 'Plnak'),
    R(1, 'T1', 5, 'Stary', { zrodlo: 'usuniete' }), R(2, 'T1', 1, 'Przysiad'), R(2, 'T1', 4, 'plnak'), R(3, 'T1', 4, 'Plnak'),
    R(1, 'W1', 1, 'Curl', { zrodlo: 'klient' }), R(1, 'W1', 2, 'Plank', { zrodlo: 'klient' }), Object.assign(R(1, 'T1', 1, 'Inny'), { klient: 'olek' })];
  const E = (e, o) => plain(C.unitEdit_(plan, (o || {}).done || {}, (o || {}).logged || {}, 'ania', e, (o || {}).tr !== false));
  // plnak na górę: przeskakuje cały obwód A i przysiad; numery 1–4 rozdane od nowa, usunięty (nr 5) bez zmian
  let r = E({ week: 1, day: 'T1', seq: [4, 1, 2, 3] });
  assert.deepEqual(r.set, [[0, { nr: 2 }], [1, { nr: 3 }], [2, { nr: 4 }], [3, { nr: 1 }]]);
  assert.deepEqual(r.rows.find(x => x.order === 4), { order: 4, to: 1, name: 'Plnak' });
  assert.equal(r.n, 4);
  assert.match(E({ week: 1, day: 'T1', seq: [2, 1, 3, 4] }).error, /Obwód A/);            // obwód rozdzielony
  assert.match(E({ week: 1, day: 'T1', seq: [4, 1, 2] }).error, /odśwież/);                // brakuje ćwiczenia
  assert.match(E({ week: 1, day: 'T1', seq: [4, 1, 2, 3] }, { logged: { 1: 1 } }).error, /zapisane serie/);
  r = E({ week: 1, day: 'T1', seq: [1, 3, 2, 4] }, { logged: { 1: 1, 4: 1 } });             // zapisane stoją, reszta się zamienia
  assert.deepEqual(r.set, [[1, { nr: 3 }], [2, { nr: 2 }]]);
  // nazwa: ta jednostka, a z next także kolejne niezrobione tygodnie (po starej nazwie, bez rozróżniania wielkości liter)
  r = E({ week: 1, day: 'T1', names: [{ order: 4, name: '  Plank  boczny ' }], next: true }, { done: { 'ania|3|T1': 1 }, logged: { 4: 1 } });
  assert.deepEqual(r.set, [[3, { cwiczenie: 'Plank boczny' }], [6, { cwiczenie: 'Plank boczny' }]]);
  assert.deepEqual(r.logRen, [{ order: 4, name: 'Plank boczny' }]);
  assert.deepEqual(r.weeks, [2]);
  assert.equal(E({ week: 1, day: 'T1', names: [{ order: 4, name: 'Plnak' }] }).n, 0);       // bez zmian
  assert.match(E({ week: 1, day: 'T1', names: [{ order: 4, name: ' ' }] }).error, /pusta/);
  assert.match(E({ week: 1, day: 'T1', names: [{ order: 9, name: 'X' }] }).error, /Nie ma takiego/);
  // klient: tylko własny trening, bez kolejnych tygodni
  assert.match(E({ week: 1, day: 'T1', seq: [4, 1, 2, 3] }, { tr: false }).error, /własnym treningu/);
  r = E({ week: 1, day: 'W1', seq: [2, 1], names: [{ order: 1, name: 'Uginanie' }], next: true }, { tr: false });
  assert.deepEqual(r.set, [[8, { nr: 2, cwiczenie: 'Uginanie' }], [9, { nr: 1 }]]);
  assert.deepEqual(r.weeks, []);
  assert.match(E({ week: 1, day: 'X9' }).error, /Nie ma takiej jednostki/);
});

/* ---------- Agent AI klienta (Agent.gs, PR 1) ---------- */
const agD = () => {
  const P = (week, day, order, name, x) => Object.assign({ week, day, order, name, title: 'Siła', date: '', prio: 'A', sets: 3, reps: '5', pct: null, kg: '', rpe: 8, note: '',
    extra: null, drop: 0, group: '', block: 'B2', swaps: ['Przysiad przedni'], own: false, added: false, coach: false, unote: '' }, x || {});
  const L = (week, day, nr, seria, x) => Object.assign({ id: ['ania', week, day, nr, seria].join('|'), tydzien: week, jednostka: day, nr_cw: nr, seria, data: '2026-11-19',
    cwiczenie: 'Przysiad', kg: 100, powt: 5, rpe: 7, wykonane: 'TAK', typ: '', uwagi: '', film_link: '' }, x || {});
  return {
    cfg: { name: 'Ania', extra: 1, swap: 'TRENER', olyCeil: 0.05 },
    plan: [P(7, 'A', 1, 'Przysiad', { date: '2026-11-19', kg: 100 }), P(7, 'A', 2, 'Rwanie', { date: '2026-11-19', kg: 70, pct: 0.7, group: 'R', rpe: 8 }),
      P(8, 'A', 1, 'Przysiad', { date: '2026-11-26', kg: 102.5 }), P(8, 'A', 2, 'Rwanie', { date: '2026-11-26', kg: 72.5, pct: 0.725, group: 'R', rpe: 8, unote: 'Spokojnie' }),
      P(8, 'A', 3, 'Plank', { date: '2026-11-26', reps: '30 s', prio: 'K' }), P(8, 'T1', 1, 'Przysiad', { date: '2026-11-27', kg: 100, coach: true }),
      P(8, 'W1', 1, 'Curl', { date: '2026-11-24', own: true, block: '' })],
    logs: [L(7, 'A', 1, 1), L(7, 'A', 1, 2), L(7, 'A', 1, 3, { rpe: 8 }), L(7, 'A', 1, 'R1', { kg: 60, rpe: '' }),
      L(7, 'A', 2, 1, { cwiczenie: 'Rwanie', kg: 70, rpe: 7 }), L(7, 'A', 2, 2, { cwiczenie: 'Rwanie', kg: 70, rpe: 9 })],
    sessions: [{ tydzien: 7, jednostka: 'A', data: '2026-11-19', start: '2026-11-19T17:00:00Z', rpe_sesji: 7, czas_min: 60, bol: 'kolano:3', uwagi: 'ok' }],
    readiness: [{ data: '2026-11-26', werdykt: 'Zmęczenie' }], stan: [{ miejsce: 'Kolano' }], blockNotes: { B2: 'Dobra robota' }
  };
};

test('agent: klucz, ustawienia, limity, wiersz klienta', () => {
  assert.ok(C.agKeyOk_('sz_' + 'a'.repeat(32)));
  assert.ok(!C.agKeyOk_('k123') && !C.agKeyOk_('sz_' + 'A'.repeat(32)) && !C.agKeyOk_(''));
  assert.equal(C.agUst_('{"on":true}', false).on, false);                       // bez klucza nigdy włączone
  assert.deepEqual(plain(C.agUst_('{"on":true,"read":false,"limit":5}', true)), { on: true, read: false, write: true, prop: true, auto: false, limit: 200, at: '', end: '' });
  assert.equal(C.agUst_('{"auto":true}', true).auto, true);                    // „Sam skraca i zamienia” tylko wprost włączone
  assert.equal(C.agUst_('{"auto":"tak"}', true).auto, false);
  assert.equal(C.agUst_('zepsute', true).limit, 200);
  assert.deepEqual(plain(C.agLimity_('{"skok_kg":5,"zapisy":9,"propozycje":3,"zgloszenia":"x"}')), { skok_kg: 5, zapisy: 50, propozycje: 3, zgloszenia: 10 });
  assert.equal(C.agLimity_('{"skok_kg":3}').skok_kg, 2.5);                       // tylko co 2,5 kg
  const h = 'ab'.repeat(32), row = (k, akt, hash) => { const r = new Array(26).fill(''); r[0] = k; r[1] = 'x'; r[3] = akt; r[C.AG_COL.hash] = hash; return r; };
  assert.equal(C.agFindRow_([row('k1', 'TAK', 'cd'.repeat(32)), row('k2', 'TAK', h)], h), 1);
  assert.equal(C.agFindRow_([row('k2', 'NIE', h)], h), -1);                     // nieaktywny
  assert.equal(C.agFindRow_([row('', 'TAK', h)], h), -1);                       // bez klucza z linku
  assert.equal(C.agFindRow_([row('k2', 'TAK', '')], ''), -1);                   // pusty skrót nie pasuje do pustej komórki
});

test('agent: światła i RPE z bota (1.7: brak oceny ≠ RPE 7)', () => {
  assert.deepEqual(plain(C.agLight_('zielone')), { rpe: 7, typ: '' });
  assert.deepEqual(plain(C.agLight_('Żółte')), { rpe: 8, typ: '' });
  assert.deepEqual(plain(C.agLight_('nieudana')), { rpe: '', typ: 'FAIL' });
  assert.deepEqual(plain(C.agLight_('8,5')), { rpe: 8.5, typ: '' });
  assert.deepEqual(plain(C.agLight_('')), { rpe: '', typ: '' });
  assert.ok(C.agLight_('8.3').error && C.agLight_('super').error);
  assert.equal(C.agLightOf_(7.5, ''), 'zielone'); assert.equal(C.agLightOf_(8.5, ''), 'żółte'); assert.equal(C.agLightOf_('', 'FAIL'), 'nieudana'); assert.equal(C.agLightOf_('', ''), 'brak oceny');
});

test('agent: plan i historia (bez bólu, dyspozycji, filmów)', () => {
  const d = agD(), done = C.agDone_('ania', d);
  assert.deepEqual(Object.keys(done), ['7|A']);
  const day = v => String(v || '').slice(0, 10);
  const p = plain(C.agPlan_(d, { today: '2026-11-26', done: done, version: 'v1', dayOf: day }));
  assert.deepEqual(p.jednostki.map(u => u.jednostka + u.tydzien + ':' + u.stan), ['W18:zaległa', 'A8:dziś', 'T18:zaplanowana']);
  const a = p.jednostki[1];
  assert.equal(a.uwagi_trenera, 'Spokojnie');
  assert.deepEqual(a.cwiczenia.map(c => [c.nazwa, c.boj, c.dod_serie, c.procent]), [['Przysiad', false, 1, null], ['Rwanie', true, 0, 72.5], ['Plank', false, 1, null]]);
  assert.equal(p.jednostki[2].prowadzi_trener, true);
  assert.deepEqual(p.dla_klienta, [{ blok: 'B2', tekst: 'Dobra robota' }]);
  const h = plain(C.agHistoria_(d, { today: '2026-11-26', days: 30, dayOf: day }));
  const s = JSON.stringify(h);
  assert.equal(h.jednostki[0].data, '2026-11-19');
  assert.ok(!/kolano|bol|werdykt|Zmęczenie|film/i.test(s), s);
  assert.equal(h.jednostki[0].rpe_sesji, 7);
  assert.deepEqual(h.jednostki[0].cwiczenia[0].serie.map(x => x.swiatlo), ['zielone', 'zielone', 'żółte', 'rozgrzewka']);
  // jednostka z planu na wczoraj zrobiona (przesunięta) dziś: dzień z Sesji, nie z planu
  const d2 = agD(); d2.sessions[0].start = '2026-11-26T17:00:00Z';
  const p2 = plain(C.agPlan_(d2, { today: '2026-11-26', done: done, dayOf: day }));
  assert.deepEqual(p2.jednostki.filter(u => u.stan === 'zrobiona').map(u => [u.tydzien, u.jednostka, u.data]), [[7, 'A', '2026-11-26']]);
  assert.equal(plain(C.agHistoria_(d2, { today: '2026-11-26', dayOf: day })).jednostki[0].data, '2026-11-26');
  // bez Sesji: dzień ostatniego zapisu serii
  const d3 = agD(); d3.sessions = []; d3.logs.forEach(l => { l.zapisano = '2026-11-25 18:00:00'; });
  assert.equal(plain(C.agHistoria_(d3, { today: '2026-11-26', dayOf: day })).jednostki[0].data, '2026-11-25');
});

test('agent: ciężar na dziś (1.9, sufit w bojach, dyspozycja)', () => {
  const d = agD(), done = C.agDone_('ania', d);
  let r = plain(C.agCiezar_(d, { today: '2026-11-26', done: done, verdict: '', olyCeil: 0.05 }));
  assert.equal(r.jednostka, 'A'); assert.equal(r.tydzien, 8);
  const sq = r.cwiczenia[0], sn = r.cwiczenia[1];
  assert.equal(sq.kg_dzis, 102.5); assert.match(sq.powod, /1\.9/);              // wszystkie ≤ RPE 8
  assert.equal(sn.kg_dzis, 70); assert.match(sn.powod, /ponad RPE 8/);         // rwanie: seria RPE 9 > 8 → powtórka
  assert.equal(r.cwiczenia[2].kg_dzis, null);
  d.logs[4].rpe = 7; d.logs[5].rpe = 8;                                         // rwanie ok → plan + sufit 5% z 100 kg
  r = plain(C.agCiezar_(d, { today: '2026-11-26', done: done, verdict: '', olyCeil: 0.05 }));
  assert.equal(r.cwiczenia[1].kg_dzis, 72.5); assert.equal(r.cwiczenia[1].sufit, 77.5);
  r = plain(C.agCiezar_(d, { today: '2026-11-26', done: done, verdict: 'Zmęczenie', olyCeil: 0.05 }));
  assert.equal(r.cwiczenia[1].sufit, 72.5); assert.ok(r.dyspozycja_obniza);   // 1.2
  assert.equal(plain(C.agCiezar_(d, { today: '2026-11-26', done: done, olyCeil: 0 })).cwiczenia[1].sufit, 72.5);   // sufit_oly 0
  d.logs[2].rpe = '';                                                           // seria bez oceny → powtórka i pytanie o RPE
  r = plain(C.agCiezar_(d, { today: '2026-11-26', done: done, olyCeil: 0.05 }));
  assert.equal(r.cwiczenia[0].kg_dzis, 100); assert.match(r.cwiczenia[0].powod, /1\.7/);
  assert.ok(C.agCiezar_(d, { week: 9, day: 'A', today: '2026-11-26', done: done }).error);
});

test('agent: zapis serii (limity serii, stare pola zostają)', () => {
  const d = agD(), S = (x, old) => plain(C.agSet_(Object.assign({ tydzien: 8, jednostka: 'A', nr: 1, seria: '1', kg: 102.5, powt: 5, swiatlo: 'zielone' }, x), d, { today: '2026-11-26', old: old }));
  let r = S({});
  assert.equal(r.set.rpe, 7); assert.equal(r.set.done, true); assert.equal(r.set.name, 'Przysiad'); assert.equal(r.ponad, false);
  assert.equal(S({ seria: '4' }).set.set, 4);                                  // 1 dodatkowa (cfg.extra 1)
  assert.match(S({ seria: '5' }).error, /1\.8/);
  assert.match(S({ nr: 2, seria: '4' }).error, /1\.5/);                         // boje bez dodatkowych
  assert.match(S({ seria: 'D1' }).error, /Drop set/);
  assert.equal(S({ seria: 'r1', swiatlo: 'czerwone' }).set.rpe, '');             // rozgrzewka bez oceny
  assert.equal(S({ kg: 110 }).ponad, true);
  assert.equal(S({ swiatlo: 'nieudana' }).set.typ, 'FAIL');
  r = S({}, { film_link: 'https://x', uwagi: 'kolano ok', zamiana: 'Przysiad → Przysiad przedni | sprzęt', cwiczenie: 'Przysiad przedni' });
  assert.equal(r.set.video, 'https://x'); assert.equal(r.set.note, 'kolano ok'); assert.equal(r.set.name, 'Przysiad przedni');
  assert.match(S({ nr: 9 }).error, /Nie ma takiego/);
  assert.match(S({ powt: 2.5 }).error, /Powtórzenia/);
});

test('agent: własny trening (baza, 4.4, 4.6)', () => {
  const d = agD(), find = n => /^(przysiad|wiosłowanie)$/i.test(n) ? n[0].toUpperCase() + n.slice(1).toLowerCase() : null;
  const o = x => Object.assign({ today: '2026-11-26', find: find, busy: C.agBusyDays_(d, v => String(v || '').slice(0, 10)), taper: null }, x);
  const T = (x, oo) => plain(C.agTrening_(Object.assign({ data: '2026-11-25', tytul: 'Plecy', cwiczenia: [{ nazwa: 'wiosłowanie', serie: [{ kg: 40, powt: 10, swiatlo: 'zielone' }, { kg: 40, powt: 10 }] }], rpe_sesji: 6 }, x), d, o(oo)));
  const r = T({});
  assert.equal(r.unit.week, 7); assert.equal(r.unit.day, 'W1');        // tydzień ostatniej jednostki planu przed tym dniem assert.equal(r.unit.exercises[0].name, 'Wiosłowanie');
  assert.deepEqual(r.exercises[0].sets.map(s => s.rpe), [7, '']);
  assert.equal(r.session.rpeSession, 6);
  assert.match(T({ data: '2026-11-19' }).error, /4\.4/);                        // dzień z treningiem
  assert.match(T({ data: '2026-11-27' }).error, /Data/);                        // przyszłość
  assert.match(T({}, { taper: ['2026-11-24', '2026-12-01'] }).error, /4\.6/);
  assert.match(T({ cwiczenia: [{ nazwa: 'Bieg po górach', serie: [{ powt: 1 }] }] }).error, /3\.2/);
  assert.match(T({ cwiczenia: [{ nazwa: 'Przysiad', serie: [] }] }).error, /bez serii/);
});

test('agent: propozycje zmian planu (reguły serwera)', () => {
  const d = agD(), done = C.agDone_('ania', d), find = n => /przysiad przedni|max przysiad/i.test(n) ? n : null;
  const ciezar = (w, dd) => C.agCiezar_(d, { week: w, day: dd, today: '2026-11-26', done: done, olyCeil: 0.05 });
  const Pr = (x, oo) => plain(C.agProp_(Object.assign({ tydzien: 8, jednostka: 'A', nr: 1, powod: 'kolano' }, x), d,
    Object.assign({ today: '2026-11-26', done: done, find: find, ciezar: ciezar, limity: C.agLimity_(''), planDays: { '2026-11-26': 1 }, busy: {} }, oo)));
  assert.equal(Pr({ typ: 'zamiana', na: 'Przysiad przedni' }).status, 'czeka');
  assert.match(Pr({ typ: 'zamiana', na: 'Przysiad przedni', powod: '' }).uwaga, /3\.1/);
  assert.match(Pr({ typ: 'zamiana', na: 'Przysiad przedni', na_stale: true }).uwaga, /3\.7/);
  assert.match(Pr({ typ: 'zamiana', nr: 2, na: 'Przysiad przedni' }).uwaga, /3\.4/);
  assert.match(Pr({ typ: 'zamiana', na: 'Leg press' }).uwaga, /3\.2/);
  assert.match(Pr({ typ: 'zamiana', na: 'Max przysiad' }).uwaga, /1\.6/);
  assert.equal(Pr({ typ: 'ciezar', kg: 105 }).status, 'czeka');                // +2,5 ponad 102,5
  assert.match(Pr({ typ: 'ciezar', kg: 107.5 }).uwaga, /1\.9/);
  assert.match(Pr({ typ: 'ciezar', nr: 2, kg: 75 }).uwaga, /1\.9|1\.2/);
  assert.match(Pr({ typ: 'serie', serie: 5 }).uwaga, /1\.8/);
  assert.equal(Pr({ typ: 'serie', serie: 2 }).status, 'czeka');
  assert.match(Pr({ typ: 'serie', nr: 2, serie: 4 }).uwaga, /1\.5/);
  assert.match(Pr({ typ: 'zamiana', jednostka: 'T1', na: 'Przysiad przedni' }).uwaga, /4\.12/);
  assert.match(Pr({ typ: 'zamiana', tydzien: 7, na: 'Przysiad przedni' }).uwaga, /zrobiona/);
  assert.match(Pr({ typ: 'ciezar', kg: 102.5 }, { taper: ['2026-11-20', '2026-11-27'] }).uwaga, /4\.6/);
  assert.equal(Pr({ typ: 'trening', data: '2026-11-28', opis: 'Mobilność 30 min' }).status, 'czeka');
  assert.match(Pr({ typ: 'trening', data: '2026-11-26', opis: 'Mobilność' }).uwaga, /4\.4/);
  assert.match(Pr({ typ: 'trening', data: '2026-11-28', opis: 'Test maksa w przysiadzie' }).uwaga, /1\.6/);
  assert.match(Pr({ typ: 'dieta' }).uwaga, /zglos/);
  const bez = agD(); bez.plan = bez.plan.filter(r => r.own);
  assert.match(plain(C.agProp_({ typ: 'serie' }, bez, { today: '2026-11-26' })).uwaga, /5\.42/);
});

test('agent: zgłoszenia, lista dla pulpitu, zasady i ustawienia z panelu', () => {
  const z = plain(C.agZglos_({ temat: 'Ból', opis: 'Kolano kłuje przy przysiadzie', miejsce: 'Kolano', strona: 'l', ocena: 4 }, '2026-11-26'));
  assert.equal(z.typ, 'zgloszenie:bol'); assert.deepEqual(z.stan, { date: '2026-11-26', place: 'Kolano', side: 'L', score: 4, context: '', note: 'Kolano kłuje przy przysiadzie' });
  assert.equal(C.agZglos_({ temat: 'dieta', opis: 'Pytanie o białko' }, '2026-11-26').stan, null);
  assert.ok(C.agZglos_({ temat: 'pogoda', opis: 'x' }).error && C.agZglos_({ temat: 'bol', opis: '' }).error);
  assert.match(C.agZglos_({ temat: 'bol', opis: 'x', miejsce: 'Bark', ocena: 11 }).error, /0–10/);
  const rows = [{ status: 'czeka', zapisano: '2026-11-25', klient: 'ania', typ: 'zamiana', cwiczenie: 'Przysiad', tresc: '{"na":"Przysiad przedni"}' },
    { status: 'czeka', zapisano: '2026-11-24', klient: 'ania', typ: 'zgloszenie:czerwona_flaga', powod_klienta: 'Drętwienie ręki' },
    { status: 'odrzucona', zapisano: '2026-11-25', klient: 'ania', typ: 'serie' }, { status: 'czeka', zapisano: '2026-11-01', klient: 'ania', typ: 'serie' }];
  const o = plain(C.agOpen_(rows, { ania: 'Ania' }, '2026-11-26', 7));
  assert.deepEqual(o.map(x => [x.typ, x.pilne, x.text]), [['czerwona_flaga', true, 'Drętwienie ręki'], ['zamiana', false, 'Przysiad → Przysiad przedni']]);
  assert.match(C.trZasadyVals_('## 1. Zasady\n...\n## 5. Ograniczenia per klient\nAnia: kolano').error, /sekcję 5/);
  assert.equal(C.trZasadyVals_('  ## 1. Ciężar \r\n tekst ', { skok_kg: 5 }).tekst, '## 1. Ciężar \n tekst');
  assert.match(C.trAgentVals_({ limit: 5 }).error, /10–500/);
  const v = plain(C.trAgentVals_({ limit: 100, read: true, write: false, prop: true, ogr: ' bez skoków ' }, { on: true, at: 'x', end: 'abcd' }));
  assert.deepEqual(v, { ust: { on: true, read: true, write: false, prop: true, auto: false, limit: 100, at: 'x', end: 'abcd' }, ogr: 'bez skoków' });
  // nazwy akcji bota nie kolidują z akcjami aplikacji i panelu
  Object.keys(C.AGENT_FNS).forEach(k => { assert.equal(C.API_FNS[k], undefined, k); assert.equal(C.TR_FNS[k], undefined, k); });
  ['trAgent', 'trAgentKlucz', 'trAgentUstaw', 'trZasady', 'trZasadyUstaw'].forEach(k => assert.ok(C.TR_FNS[k], k));
});

test('asystent: decyzje trenera (zatwierdź zmienia plan, odrzuć, pamięć decyzji, zapamiętaj jako zasadę)', () => {
  const P = (nr, name, o) => Object.assign({ klient: 'ania', tydzien: 12, jednostka: 'D1', tytul: 'Nogi', nr: nr, cwiczenie: name, prio: 'A', serie: 3, powt: '5', kg: 80, blok: 'B2', zrodlo: '', uwagi: '' }, o || {});
  const plan = [P(1, 'Przysiad tylny'), P(2, 'Wyciskanie leżąc', { prio: 'B', uwagi: 'pauza' }), P(1, 'Przysiad tylny', { klient: 'bartek' })];
  const prop = o => Object.assign({ id: 'ania|p|1', klient: 'ania', tydzien: 12, jednostka: 'D1', status: 'czeka', zapisano: '2026-11-26' }, o);
  // ciężar i serie: przez trPlanEdit_ (te same reguły co edycja w panelu)
  assert.deepEqual(plain(C.agApply_(prop({ typ: 'ciezar', nr: 1, cwiczenie: 'Przysiad tylny', tresc: '{"kg":82.5}' }), plan, [], []).set), [[0, { kg: 82.5 }]]);
  assert.deepEqual(plain(C.agApply_(prop({ typ: 'serie', nr: 2, cwiczenie: 'Wyciskanie leżąc', tresc: '{"serie":4}' }), plan, [], []).set), [[1, { serie: 4 }]]);
  // zamiana: tylko ta jednostka, ślad w uwagach
  const z = plain(C.agApply_(prop({ typ: 'zamiana', nr: 2, cwiczenie: 'Wyciskanie leżąc', tresc: '{"na":"Wyciskanie hantli"}', powod_klienta: 'bark' }), plan, [], []));
  assert.deepEqual(z.set, [[1, { cwiczenie: 'Wyciskanie hantli', uwagi: 'pauza · zamiana (asystent): Wyciskanie leżąc → Wyciskanie hantli | bark' }]]);
  // dodatkowy trening: bez zmiany planu
  assert.deepEqual(plain(C.agApply_(prop({ typ: 'trening', tresc: '{"data":"2026-11-29","opis":"góra"}' }), plan, [], [])), { set: [] });
  // plan się zmienił albo jednostka zrobiona = odmowa
  assert.match(C.agApply_(prop({ typ: 'ciezar', nr: 1, cwiczenie: 'Martwy ciąg', tresc: '{"kg":100}' }), plan, [], []).error, /Plan się zmienił/);
  assert.match(C.agApply_(prop({ typ: 'ciezar', nr: 1, cwiczenie: 'Przysiad tylny', tresc: '{"kg":82.5}' }), plan, [{ klient: 'ania', tydzien: 12, jednostka: 'D1' }], []).error, /zrobiona/);
  // lista na pulpit: id wiersza i szczegóły; odrzucone przez serwer osobno
  const rows = [prop({ typ: 'ciezar', nr: 1, cwiczenie: 'Przysiad tylny', tresc: '{"kg":82.5}', powod_klienta: 'lekko' }),
    prop({ id: 'ania|p|2', typ: 'serie', nr: 2, cwiczenie: 'Wyciskanie leżąc', tresc: '{"serie":5}', status: 'odrzucona', uwaga_serwera: 'Najwyżej 1 seria więcej (reguła 1.8)' }),
    prop({ id: 'ania|p|3', typ: 'zamiana', nr: 2, cwiczenie: 'Wyciskanie leżąc', tresc: '{"na":"Pompki"}', status: 'odrzucona', decyzja_at: '2026-11-26T10:00:00Z', komentarz_trenera: 'najpierw technika', zapisano: '2026-11-25' }),
    prop({ id: 'ania|p|4', typ: 'ciezar', nr: 1, cwiczenie: 'Przysiad tylny', tresc: '{"kg":80}', status: 'zatwierdzona', decyzja_at: '2026-11-24', zapisano: '2026-11-23' }),
    prop({ id: 'ania|z|5', typ: 'zgloszenie:bol', powod_klienta: 'kolano', status: 'przeczytane', decyzja_at: '2026-11-25' })];
  const o = plain(C.agOpen_(rows, { ania: 'Ania' }, '2026-11-26', 7));
  assert.deepEqual(o.map(x => [x.pid, x.typ, x.kg, x.week, x.day, x.nr, x.why]), [['ania|p|1', 'ciezar', 82.5, 12, 'D1', 1, 'lekko']]);
  assert.deepEqual(plain(C.agOdrz_(rows, { ania: 'Ania' }, '2026-11-26', 7)), [{ name: 'Ania', at: '2026-11-26', text: 'Wyciskanie leżąc: 5 serie', uwaga: 'Najwyżej 1 seria więcej (reguła 1.8)' }]);
  // pamięć bota: decyzje trenera i czekające, bez odrzuconych przez serwer i bez zgłoszeń, najstarsze pierwsze
  const d = plain(C.agDecyzje_(rows, 'ania', 20));
  assert.deepEqual(d, [{ data: '2026-11-24', co: 'Przysiad tylny: 80 kg', status: 'zatwierdzona przez trenera' },
    { data: '2026-11-26', co: 'Wyciskanie leżąc → Pompki', status: 'odrzucona przez trenera', komentarz: 'najpierw technika' },
    { data: '2026-11-26', co: 'Przysiad tylny: 82,5 kg', status: 'czeka na trenera' }]);
  assert.equal(C.agDecyzje_(rows, 'ania', 1).length, 1);
  const sp = C.agChatSystem_({ decyzje: d });
  assert.match(sp, /## Ostatnie decyzje trenera/); assert.match(sp, /Pompki · odrzucona przez trenera · „najpierw technika”/);
  // zapamiętaj jako zasadę: dopisana linia, limit długości
  assert.equal(C.agMemo_('kolano: bez skoków\n', '27.11 trener odrzucił: Pompki.').ogr, 'kolano: bez skoków\n- 27.11 trener odrzucił: Pompki.');
  assert.equal(C.agMemo_('', 'x').ogr, '- x');
  assert.match(C.agMemo_('a'.repeat(5000), 'x').error, /pełne/);
  assert.ok(C.TR_FNS.trPropozycja);
});

test('asystent: sam skraca i zamienia (B od końca, A i K zostają), cofnięcie, „Zrobił sam”', () => {
  const C = require('./load-code')();
  const plain = x => JSON.parse(JSON.stringify(x));
  const R = (order, name, prio, sets, o) => Object.assign({ week: 12, day: 'D1', title: 'Nogi', order: order, name: name, prio: prio, sets: sets, setsMin: null, circuit: '' }, o || {});
  const d = { plan: [R(1, 'Przysiad tylny', 'A', 4), R(2, 'Wykroki', 'B', 3), R(3, 'Uginanie nóg', 'B', 3, { setsMin: 2 }), R(4, 'Wspięcia na palce', 'B', 3), R(5, 'Plank', 'K', 2),
    R(1, 'Przysiad', 'A', 3, { week: 13, day: 'T1', coach: true })] };
  // skrót: tylko B, od końca, mniej serii niż w planie, nie poniżej serie_min, z powodem
  const ok = plain(C.agSkrot_({ tydzien: 12, jednostka: 'D1', zmiany: [{ nr: 4, serie: 0 }, { nr: 3, serie: 2 }], powod: 'mam 45 minut' }, d, {}));
  assert.deepEqual(JSON.parse(ok.row.tresc).zmiany, [{ nr: 3, cw: 'Uginanie nóg', z: 3, na: 2 }, { nr: 4, cw: 'Wspięcia na palce', z: 3, na: 0 }]);
  assert.equal(ok.row.typ, 'skrot'); assert.equal(ok.row.cwiczenie, 'Nogi');
  const e = z => C.agSkrot_(Object.assign({ tydzien: 12, jednostka: 'D1', powod: 'czas' }, z), d, { done: {} }).error;
  assert.match(e({ zmiany: [{ nr: 1, serie: 2 }] }), /A i K zostają/);
  assert.match(e({ zmiany: [{ nr: 5, serie: 1 }] }), /A i K zostają/);
  assert.match(e({ zmiany: [{ nr: 2, serie: 1 }] }), /od końca: najpierw „Uginanie nóg”/);
  assert.match(e({ zmiany: [{ nr: 4, serie: 3 }] }), /serie 0–2/);
  assert.match(e({ zmiany: [{ nr: 4, serie: 0 }, { nr: 3, serie: 1 }] }), /najmniej 2/);
  assert.match(e({ zmiany: [] }), /Podaj zmiany/);
  assert.match(C.agSkrot_({ tydzien: 12, jednostka: 'D1', zmiany: [{ nr: 4, serie: 0 }] }, d, {}).error, /powodem/);
  assert.match(C.agSkrot_({ tydzien: 12, jednostka: 'D1', zmiany: [{ nr: 4, serie: 0 }], powod: 'x' }, d, { done: { '12|D1': 1 } }).error, /zrobiona albo zaczęta/);
  assert.match(C.agSkrot_({ tydzien: 13, jednostka: 'T1', zmiany: [{ nr: 1, serie: 0 }], powod: 'x' }, d, {}).error, /reguła 4.12/);
  const dc = { plan: [R(1, 'Przysiad tylny', 'A', 4), R(2, 'Wykroki', 'B', 3, { circuit: 'A' }), R(3, 'Wspięcia', 'B', 3, { circuit: 'A' })] };
  assert.match(C.agSkrot_({ tydzien: 12, jednostka: 'D1', zmiany: [{ nr: 3, serie: 0 }], powod: 'x' }, dc, {}).error, /obwodzie/);
  // zapis do Planu: serie albo zrodlo = usuniete, z tym, co było; zmieniony plan = odmowa
  const P = (nr, name, prio, serie, o) => Object.assign({ klient: 'ania', tydzien: 12, jednostka: 'D1', tytul: 'Nogi', nr: nr, cwiczenie: name, prio: prio, serie: serie, powt: '8', kg: 40, blok: 'B2', zrodlo: '', uwagi: '' }, o || {});
  const plan = [P(1, 'Przysiad tylny', 'A', 4), P(2, 'Wykroki', 'B', 3), P(3, 'Uginanie nóg', 'B', 3), P(4, 'Wspięcia na palce', 'B', 3)];
  const st = plain(C.agSkrotSet_('ania', 12, 'D1', JSON.parse(ok.row.tresc), plan, [], []));
  assert.deepEqual(st.set, [[2, { serie: 2 }], [3, { zrodlo: 'usuniete' }]]);
  assert.equal(st.tresc.zmiany[1].zr, '');
  assert.match(C.agSkrotSet_('ania', 12, 'D1', { zmiany: [{ nr: 3, cw: 'Uginanie nóg', z: 4, na: 2 }] }, plan, [], []).error, /Plan się zmienił/);
  assert.match(C.agSkrotSet_('ania', 12, 'D1', JSON.parse(ok.row.tresc), plan, [{ klient: 'ania', tydzien: 12, jednostka: 'D1' }], []).error, /zrobiona/);
  // cofnięcie skrótu: plan po zmianie → stan sprzed
  const after = plan.map(r => Object.assign({}, r)); after[2].serie = 2; after[3].zrodlo = 'usuniete';
  const pr = { id: 'ania|a|1', klient: 'ania', typ: 'skrot', tydzien: 12, jednostka: 'D1', cwiczenie: 'Nogi', tresc: JSON.stringify(st.tresc), status: 'auto', zapisano: '2026-11-27', powod_klienta: 'mam 45 minut' };
  assert.deepEqual(plain(C.agUndo_(pr, after, [], [])).set, [[2, { serie: 3 }], [3, { zrodlo: '' }]]);
  assert.match(C.agUndo_(pr, plan, [], []).error, /Plan się zmienił/);
  assert.match(C.agUndo_(pr, after, [{ klient: 'ania', tydzien: 12, jednostka: 'D1' }], []).error, /już zaczął/);
  // cofnięcie zamiany: nazwa i uwagi sprzed
  const az = plan.map(r => Object.assign({}, r)); az[1].cwiczenie = 'Wykroki z hantlami'; az[1].uwagi = 'zamiana (asystent): Wykroki → Wykroki z hantlami';
  const pz = { id: 'ania|a|2', klient: 'ania', typ: 'zamiana', tydzien: 12, jednostka: 'D1', nr: 2, cwiczenie: 'Wykroki', tresc: '{"na":"Wykroki z hantlami","z":"Wykroki","uwagi_z":""}', status: 'auto', zapisano: '2026-11-26' };
  assert.deepEqual(plain(C.agUndo_(pz, az, [], [])).set, [[1, { cwiczenie: 'Wykroki', uwagi: '' }]]);
  assert.match(C.agUndo_(pz, plan, [], []).error, /Plan się zmienił/);
  // „Zrobił sam”: tylko status auto z 7 dni, najnowsze pierwsze; opis zmiany
  const rows = [pr, pz, Object.assign({}, pz, { id: 'ania|a|3', status: 'cofnieta', decyzja_at: '2026-11-27' }), Object.assign({}, pz, { id: 'ania|a|4', zapisano: '2026-11-10' })];
  const au = plain(C.agAuto_(rows, { ania: 'Ania' }, '2026-11-27', 7));
  assert.deepEqual(au.map(x => [x.pid, x.typ, x.text]), [['ania|a|1', 'skrot', 'skrócony trening Nogi: Uginanie nóg 3 → 2 serie, Wspięcia na palce pominięte'], ['ania|a|2', 'zamiana', 'Wykroki → Wykroki z hantlami']]);
  assert.equal(au[0].why, 'mam 45 minut');
  // pamięć bota: zmiany samodzielne i cofnięte
  const dz = plain(C.agDecyzje_(rows, 'ania', 20)).map(x => x.status);
  assert.ok(dz.indexOf('zrobione samodzielnie (trener może cofnąć)') >= 0 && dz.indexOf('cofnięte przez trenera') >= 0);
  // instrukcja i narzędzia
  assert.match(C.agChatSystem_({ auto: true }), /pozwolił Ci samemu skracać/);
  assert.match(C.agChatSystem_({}), /„skroc” i „zamien” są wyłączone/);
  assert.ok(C.AGENT_FNS.hasOwnProperty('skroc') && C.AGENT_FNS.hasOwnProperty('zamien'));
});

test('czat „Wypróbuj asystenta”: narzędzia, historia, pętla akcji, instrukcja', () => {
  const C = require('./load-code')();
  const plain = x => JSON.parse(JSON.stringify(x));
  // narzędzia = akcje bota
  const t = plain(C.agTools_());
  assert.deepEqual(t.map(x => x.name).sort(), Object.keys(C.AGENT_FNS).sort());
  const zs = t.find(x => x.name === 'zapiszSerie');
  assert.deepEqual(zs.input_schema.required, ['tydzien', 'jednostka', 'nr', 'seria']);
  assert.equal(zs.input_schema.properties.kg.type, 'number');
  assert.equal(t.find(x => x.name === 'zapiszTrening').input_schema.properties.cwiczenia.items.type, 'object');
  assert.deepEqual(t.find(x => x.name === 'plan').input_schema.required, []);
  // historia z panelu: zaczyna i kończy klient, role na zmianę, przycięcie
  assert.ok(C.agChatMsgs_([]).error && C.agChatMsgs_([{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }]).error);
  const m = plain(C.agChatMsgs_([{ role: 'assistant', text: 'x' }, { role: 'user', text: ' Co dziś? ' }, { role: 'user', text: 'I jutro' }, { role: 'assistant', text: 'Przysiad' }, { role: 'hacker', text: 'y'.repeat(3000) }]));
  assert.deepEqual(m.msgs.map(x => x.role), ['user', 'assistant', 'user']);
  assert.equal(m.msgs[0].content, 'Co dziś?\n\nI jutro');
  assert.equal(m.msgs[2].content.length, C.AG_CHAT_TXT);
  // wykonane akcje wracają do historii, żeby asystent nie zgłaszał drugi raz
  const h = plain(C.agChatMsgs_([{ role: 'user', text: 'Boli kolano' }, { role: 'assistant', text: 'Zgłosiłem trenerowi.', steps: [{ fn: 'zglos', ok: true }, { fn: 'plan', ok: false }] }, { role: 'user', text: 'Co dalej?' }]));
  assert.equal(h.msgs[1].content, 'Zgłosiłem trenerowi.\n\n(Wykonane akcje: zglos ✓, plan ✕)');
  assert.match(C.agChatSystem_({}), /najwyżej raz na sprawę/);
  // pętla: akcja → wynik → odpowiedź; błąd akcji wraca jako is_error
  const sent = [];
  const replies = [
    { model: 'claude-opus-5-5', stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 10 }, content: [{ type: 'thinking', thinking: '' }, { type: 'tool_use', id: 't1', name: 'plan', input: { dni: 3 } }, { type: 'tool_use', id: 't2', name: 'zapiszSerie', input: { kg: 120 } }] },
    { model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 200, output_tokens: 20 }, content: [{ type: 'text', text: 'Dziś przysiad. ' }, { type: 'text', text: '120 kg odpada (reguła 1.9).' }] }
  ];
  const out = plain(C.agChatLoop_({ model: 'm', messages: [{ role: 'user', content: 'Co dziś?' }] }, r => { sent.push(plain(r)); return replies[sent.length - 1]; },
    (fn, a) => { if (fn === 'zapiszSerie') throw new Error('Najwyżej 110 kg (reguła 1.9)'); return { dni: a.dni }; }, 5));
  assert.equal(out.text, 'Dziś przysiad. 120 kg odpada (reguła 1.9).');
  assert.deepEqual(out.steps, [{ fn: 'plan', args: 'dni: 3', ok: true, info: '' }, { fn: 'zapiszSerie', args: 'kg: 120', ok: false, info: 'Najwyżej 110 kg (reguła 1.9)' }]);
  assert.equal(out.usage.length, 2);
  const m2 = sent[1].messages;
  assert.equal(m2.length, 3);
  assert.equal(m2[1].content[0].type, 'thinking');                                // odpowiedź modelu wraca w całości
  assert.deepEqual(m2[2].content.map(r => [r.tool_use_id, !!r.is_error]), [['t1', false], ['t2', true]]);   // oba wyniki w jednej wiadomości
  assert.equal(sent[0].messages.length, 1);                                       // zapytanie nie zmienia historii poprzedniego
  // limit kroków i odmowa
  const loop = { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'x', name: 'plan', input: {} }] };
  const cut = C.agChatLoop_({ messages: [{ role: 'user', content: 'a' }] }, () => loop, () => ({}), 3);
  assert.ok(cut.cut); assert.equal(cut.steps.length, 3);
  assert.ok(C.agChatLoop_({ messages: [{ role: 'user', content: 'a' }] }, () => ({ stop_reason: 'refusal', content: [] }), () => ({}), 3).refusal);
  // instrukcja: zasady i ograniczenia w środku, tryb próby opisany, bez imienia
  const sp = C.agChatSystem_({ zasady: '## 1. Ciężar\nreguła 1.9', ogr: 'bez skoków', today: '2026-11-26' });
  assert.match(sp, /reguła 1\.9/); assert.match(sp, /bez skoków/); assert.match(sp, /trybie próby/); assert.match(sp, /trener nic nie dostaje/); assert.match(sp, /2026-11-26/);
  assert.match(C.agChatSystem_({ real: true }), /Zapisy są prawdziwe/);
  assert.match(C.agChatSystem_({}), /nie wkleił jeszcze zasad/);
  assert.ok(C.TR_FNS.trAsystent);
});

test('trTitle_: nazwa sesji z panelu (Plan.tytul całej jednostki, własny trening z przedrostkiem)', () => {
  const R = (w, d, nr, o) => Object.assign({ klient: 'ania', tydzien: w, jednostka: d, tytul: 'TP1', nr, cwiczenie: 'X' + nr, zrodlo: '' }, o);
  const plan = [R(1, 'T2', 1), R(1, 'T2', 2), R(1, 'T2', 3, { zrodlo: 'usuniete' }), R(2, 'T2', 1), R(1, 'T2', 1, { klient: 'bartek' }),
    R(1, 'W1', 1, { tytul: 'Własny · Ramiona', zrodlo: 'klient' }), R(1, 'T3', 1, { zrodlo: 'usuniete' })];
  const t = e => JSON.parse(JSON.stringify(C.trTitle_(plan, 'ania', e)));
  // cała jednostka (też ślad usuniętego ćwiczenia), bez innych tygodni i klientów; odstępy ścięte
  assert.deepEqual(t({ week: 1, day: 'T2', title: '  Trening   personalny 1 ' }),
    { set: [[0, { tytul: 'Trening personalny 1' }], [1, { tytul: 'Trening personalny 1' }], [2, { tytul: 'Trening personalny 1' }]], title: 'Trening personalny 1', own: false });
  assert.deepEqual(t({ week: 1, day: 'T2', title: 'TP1' }).set, []);                       // bez zmian = nic do zapisu
  assert.deepEqual(t({ week: 1, day: 'T2', title: '' }).set.map(x => x[1].tytul), ['', '', '']);
  // własny trening klienta: przedrostek zostaje
  assert.deepEqual(t({ week: 1, day: 'W1', title: 'Plecy' }), { set: [[5, { tytul: 'Własny · Plecy' }]], title: 'Własny · Plecy', own: true });
  assert.equal(t({ week: 1, day: 'W1', title: '' }).title, 'Własny');
  assert.match(t({ week: 1, day: 'T9', title: 'a' }).error, /Nie ma takiej jednostki/);
  assert.match(t({ week: 1, day: 'T3', title: 'a' }).error, /Nie ma takiej jednostki/);  // same usunięte
  assert.match(t({ week: 1, day: 'T2', title: 'x'.repeat(41) }).error, /40 znaków/);
});

test('textCols_, frac_: „zrobione/plan” zostaje tekstem (Arkusze robiły z „1/4” datę), stara data w odczycie = puste', () => {
  assert.deepEqual(Array.from(C.textCols_([['anna', 3, '1/4', '', '2026-11-23'], ['ola', 0, '', '0/2', 'x/y']])), [2, 3]);
  assert.deepEqual(Array.from(C.textCols_([])), []);
  assert.deepEqual(Array.from(C.textCols_([['6-8', '1+1', 12.5, '1/4/2026']])), []);
  const fmt = [];
  const sh = { clear() {}, setFrozenRows() {}, getRange: (r, c, nr, nc) => ({ setValues() { return this; }, setFontWeight() { return this; }, setNumberFormat(f) { fmt.push([r, c, nr, f]); return this; } }) };
  const S = require('./load-code')();
  S.SpreadsheetApp = { getActive: () => ({ getSheetByName: () => sh }) };
  S.writeTable_('Przegląd', ['klient', 'ten_tydzien'], [['anna', '1/4'], ['ola', '2/3']]);
  assert.deepEqual(fmt, [[2, 2, 2, '@']]);
  assert.equal(C.frac_(new Date(2026, 0, 4)), '');
  assert.equal(C.frac_('1/4'), '1/4');
  assert.equal(C.frac_(null), '');
});

test('wyzwalaczeOpis_: siedem zadań po ludzku, brakujące ✗, obce i powtórzone widać', () => {
  const all = ['wczytajPlany', 'odswiezPodglad', 'podsumowanie', 'porannyMail', 'wieczornyMail', 'kopiaArkusza', 'sprawdzLinki'];
  const ok = Array.from(C.wyzwalaczeOpis_(all, 6));
  assert.equal(ok.length, 7);
  assert.ok(ok.every(l => l.startsWith('✓ ')), ok.join('\n'));
  assert.ok(ok[1].includes('co 30 min'), ok[1]);                                  // podgląd dla Claude co 30 min (27.11)
  assert.ok(ok[3].includes('ok. 6:00') && ok[4].includes('ok. 20:00') && ok[5].includes('8 ostatnich'), ok.join('\n'));
  const bad = Array.from(C.wyzwalaczeOpis_(['podsumowanie', 'podsumowanie', 'stary'], 7));
  assert.ok(bad[0].startsWith('✗ co 15 min'), bad[0]);
  assert.ok(bad[2].startsWith('✓ codziennie ok. 5:00') && bad[2].endsWith('(2×)'), bad[2]);
  assert.equal(bad[bad.length - 1], '? stary: spoza listy');
  // każdy wyzwalacz z listy ma funkcję w skrypcie, a każda instalacja w kodzie jest na liście
  const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', 'apps-script');
  const src = fs.readdirSync(dir).filter(f => /\.gs$/.test(f)).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  C.WYZWALACZE.forEach(w => assert.equal(typeof C[w.fn], 'function', w.fn));
  const made = [...src.matchAll(/newTrigger\('(\w+)'\)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(made)].sort(), all.slice().sort());
  assert.ok(/everyMinutes\(PODGLAD_CO\)/.test(src) && !/odswiezPodglad'\)\.timeBased\(\)\.everyMinutes\(10\)/.test(src));
});

test('zakladkiPlan_: grupy w kolejności, obce na końcu bez zmian, choć jedna widoczna', () => {
  const p = Array.from(C.zakladkiPlan_([{ name: 'Moje' , hidden: true }, { name: 'Log' }, { name: 'AI' }, { name: 'Klienci' }, { name: 'Przegląd' }, { name: 'Plan' }, { name: 'Notatki' }]));
  assert.deepEqual(p.map(x => x.name), ['Klienci', 'Plan', 'Log', 'Przegląd', 'AI', 'Moje', 'Notatki']);
  assert.deepEqual(p.map(x => x.hidden), [false, false, false, false, true, true, false]);
  assert.equal(p[0].color, '#4a86e8');
  assert.equal(p[2].color, '#6aa84f');
  assert.equal(p[5].color, null);                                                 // zakładka spoza listy: kolor bez zmian
  assert.equal(C.zakladkiPlan_([{ name: 'AI' }, { name: 'API' }])[0].hidden, false);
  assert.deepEqual(Array.from(C.zakladkiPlan_([])), []);
  // żadna zakładka nie jest w dwóch grupach
  const all = C.ZAKLADKI.flatMap(g => g.tabs);
  assert.equal(new Set(all).size, all.length);
});

test('rozmiarOpis_: komórki, największe zakładki, ścieżki i czas wczytania', () => {
  const out = Array.from(C.rozmiarOpis_({ tabs: [{ name: 'Log', rows: 12000, cols: 26 }, { name: 'Plan', rows: 900, cols: 25 }, { name: 'Pusta', rows: 0, cols: 0 }],
    pathKb: 2048.4, time: { client: 'Ania', ms: 5200, logRows: 4100 } }));
  assert.equal(out[0], 'Komórki z danymi: 334 500 (limit Google: 10 000 000).');
  assert.equal(out[1], '· Log: 12 000 wierszy × 26 kolumn');
  assert.equal(out[2], '· Plan: 900 wierszy × 25 kolumn');
  assert.ok(out.includes('· Ścieżki sztangi w Logu: 2 048 KB'), out.join('\n'));
  assert.ok(out[out.length - 1].includes('(Ania, 4 100 serii): 5,2 s – do obserwacji'), out.join('\n'));
  assert.ok(C.rozmiarOpis_({ tabs: [], pathKb: 0, time: { client: 'B', ms: 900, logRows: 10 } }).slice(-1)[0].includes('0,9 s – dobrze'));
  assert.equal(C.rozmiarOpis_({ tabs: [], pathKb: 0, time: null }).length, 1);
});

test('mcpLogRow_: zapisy z Claude (pośrednik MCP) do dziennika API, odczyty i panel pominięte', () => {
  assert.equal(C.mcpLogRow_({ fn: 'trPrzesun', args: ['ania', {}] }, true, ''), null, 'panel bez src');
  assert.equal(C.mcpLogRow_({ src: 'mcp', fn: 'trPulpit', args: [] }, true, ''), null, 'odczyt');
  assert.deepEqual(C.mcpLogRow_({ src: 'mcp', fn: 'trPrzesun', args: ['Ania', { week: 3, day: 'B', date: '2026-11-28' }] }, true, ''),
    ['ania', 'claude: trPrzesun', true, '[{"week":3,"day":"B","date":"2026-11-28"}]']);
  assert.deepEqual(C.mcpLogRow_({ src: 'mcp', fn: 'trPropozycja', args: ['ania|p|1', { mode: 'tak' }] }, false, 'Nie ma już tej propozycji.'),
    ['ania', 'claude: trPropozycja', false, 'Nie ma już tej propozycji.']);
  // lista zapisów serwera = lista w pośredniku
  const mcp = require('fs').readFileSync(require('path').join(__dirname, '..', 'mcp', 'src', 'tools.js'), 'utf8');
  const z = JSON.parse(mcp.match(/export const ZAPIS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  assert.deepEqual(z, C.TR_MCP_ZAPIS);
});

test('sekcja: walidacja planu (R/G/K), obwód w jednej sekcji, ostrzeżenia o pseudo-ćwiczeniach, Biblioteka bez „Rozgrzewki”', () => {
  const R = (nr, x) => Object.assign({ klient: 'robert', tydzien: 1, jednostka: 'T1', tytul: 'A', nr, cwiczenie: 'Ćw ' + nr, prio: 'B', serie: 3, powt: '10' }, x || {});
  assert.equal(C.PLAN_HEADERS[C.PLAN_HEADERS.length - 1], 'sekcja');               // nowa kolumna na końcu
  assert.deepEqual(['R', 'g', ' k ', 'rozgrzewka', 'Główne', 'korekcyjne', ''].map(C.sekcja_), ['R', 'G', 'K', 'R', 'G', 'K', '']);
  assert.equal(C.sekcja_('X'), null);
  assert.deepEqual(Array.from(C.validatePlan_([R(1, { sekcja: 'R', prio: 'K' }), R(2, { sekcja: 'G' }), R(3, { sekcja: 'k' }), R(4)])), []);   // ze sekcją i bez niej
  assert.match(C.validatePlan_([R(1, { sekcja: 'X' })])[0], /sekcja tylko R/);
  // obwód przez dwie sekcje = błąd; puste pole liczy się jak G (A/B) albo K (prio K)
  assert.match(C.validatePlan_([R(1, { sekcja: 'R', obwod: 'A' }), R(2, { obwod: 'A' })]).join(' '), /dwie sekcje/);
  assert.match(C.validatePlan_([R(1, { obwod: 'A' }), R(2, { prio: 'K', obwod: 'A' }), R(3, { sekcja: 'G' })]).join(' '), /dwie sekcje/);
  assert.deepEqual(Array.from(C.validatePlan_([R(1, { obwod: 'A' }), R(2, { prio: 'K', obwod: 'A' })])), []);   // stary plan bez sekcji: obwód A + K dalej dozwolony
  assert.deepEqual(Array.from(C.validatePlan_([R(1, { sekcja: 'R', obwod: 'A' }), R(2, { sekcja: 'R', obwod: 'A' }), R(3, { obwod: 'B' }), R(4, { sekcja: 'G', obwod: 'B' })])), []);
  // ostrzeżenia (nie błędy): nazwa „Rozgrzewka…” / „Aktywacja…” albo 1 × „1” spoza bazy
  const dict = [{ cwiczenie: 'Rwanie', aliasy: '', grupa: 'R' }];
  const w = C.planWarnings_([R(1, { cwiczenie: 'Rozgrzewka + aktywacja pośladków', serie: 1, powt: '1' }), R(2, { cwiczenie: 'Aktywacja pośladków' }),
    R(3, { cwiczenie: 'Mobilizacja X', serie: 1, powt: '1' }), R(4, { cwiczenie: 'Rwanie', serie: 1, powt: '1' }), R(5, { cwiczenie: 'Glute Bridge', serie: 2, powt: '12' })], dict);
  assert.equal(w.length, 3);
  assert.match(w[0], /^wiersz 1: .*opis bloku.*sekcja=R/);
  assert.match(w[2], /^wiersz 3:/);
  assert.deepEqual(Array.from(C.validatePlan_([R(1, { cwiczenie: 'Rozgrzewka + aktywacja pośladków', serie: 1, powt: '1' })])), []);   // nie blokuje importu
  // Biblioteka i „Uzupełnij listę ćwiczeń” pomijają dawne pseudo-ćwiczenia
  const kl = [{ klient_id: 'robert', aktywny: 'TAK' }];
  const res = C.trCwiczenia_([{ klient: 'robert', cwiczenie: 'Rozgrzewka + aktywacja pośladków' }, { klient: 'robert', cwiczenie: 'Rozgrzewka' }, { klient: 'robert', cwiczenie: 'Hip Airplane' }], [], kl, []);
  assert.deepEqual(res.missing.map(m => m.name), ['Hip Airplane']);
  assert.deepEqual(Array.from(C.missingExercises_([{ cwiczenie: 'Rozgrzewka' }, { cwiczenie: 'Hip Airplane' }], [])), ['Hip Airplane']);
  assert.equal(C.sekcjaNazwa_('Rozgrzewka barków z gumą'), false);              // zwykła nazwa zaczynająca się od słowa zostaje ćwiczeniem
});

test('sekcja Rozgrzewka: wykonanie planu tak, tonaż, serie, partie i e1RM nie (decyzja 27.11)', () => {
  const P = (nr, cw, prio, x) => Object.assign({ klient: 'robert', tydzien: 1, jednostka: 'T1', data: d(1, 0), nr, cwiczenie: cw, prio, serie: 2, powt: '10', kg: 20 }, x || {});
  const L = (nr, cw, s, x) => Object.assign({ klient: 'robert', tydzien: 1, jednostka: 'T1', data: d(1, 0), nr_cw: nr, cwiczenie: cw, seria: s, kg: 20, powt: 10, rpe: 8, wykonane: 'TAK', typ: '' }, x || {});
  const mk = sek => {
    const plan = [P(1, 'Przysiad tylny', 'K', { sekcja: sek }), P(2, 'Przysiad tylny', 'A', { kg: 100, powt: '5' })];
    const log = [L(1, 'Przysiad tylny', 1), L(1, 'Przysiad tylny', 2), L(2, 'Przysiad tylny', 1, { kg: 100, powt: 5 }), L(2, 'Przysiad tylny', 2, { kg: 100, powt: 5 })];
    return { s: C.computeSummary_(plan, log, [], []), parts: C.computeParts_(plan, log, [], CW) };
  };
  const H = C.SUM_HEADERS, col = (r, k) => r.s.rows[0][H.indexOf(k)];
  const warm = mk('R'), main = mk('');
  assert.equal(col(main, 'tonaz_kg'), 1400); assert.equal(col(warm, 'tonaz_kg'), 1000);       // 2 × 10 × 20 kg rozgrzewki poza tonażem
  assert.equal(col(main, 'serie_twarde'), 4); assert.equal(col(warm, 'serie_twarde'), 2);
  assert.equal(col(warm, 'wykonanie_%'), col(main, 'wykonanie_%'));                   // wykonanie planu bez zmian (po prio)
  assert.equal(col(warm, 'wykonanie_%'), 100);
  assert.equal(plain(warm.parts)[0][3], 2); assert.equal(plain(main.parts)[0][3], 4);   // serie na partię
});

test('trFilmSeria_: film z komputera trenera do serii (link, tor sztangi, wnioski; tylko przysłane kolumny)', () => {
  const f = s => JSON.parse(JSON.stringify(C.trFilmSeria_(s)));
  const S = x => Object.assign({ week: 9, day: 'T2', order: 1, set: '2', name: 'Rwanie' }, x || {});
  assert.ok(C.TR_FNS.trFilmWgraj && C.TR_FNS.trFilmSeria && !C.API_FNS.trFilmWgraj && !C.API_FNS.trFilmSeria && !C.LIVE_FNS.trFilmSeria);
  const a = f(S({ link: 'https://drive.google.com/file/d/x/view', vbt: '1,62', vbtPeak: 1.9, height: 98, path: [[0, 0], [1.5, 40]], note: ' pętla na wysokości bioder ', kg: '70', reps: '1', rpe: 8 }));
  assert.deepEqual(a.key, { week: 9, day: 'T2', order: 1, set: '2' });
  assert.deepEqual(a.base, { date: '', name: 'Rwanie', kg: 70, reps: '1', rpe: 8 });
  assert.deepEqual(a.set, { film_link: 'https://drive.google.com/file/d/x/view', vbt_ms: 1.62, vbt_peak: 1.9, wysokosc_cm: 98, sciezka: '[[0,0],[1.5,40]]', notatka_trenera: 'pętla na wysokości bioder' });
  assert.deepEqual(f(S({ forClient: 'Łokcie wyżej.' })).set, { komentarz_trenera: 'Łokcie wyżej.' });   // sam komentarz: link i analiza bez zmian
  assert.deepEqual(f(S({ set: 'r1' })).key.set, 'R1');
  assert.equal(f(S({ set: 'D2', kg: 'BW' })).base.kg, 'BW');
  [S({ set: '0' }), S({ set: 'X1' }), S({ order: 0 }), S({ day: '' }), S({ name: '' }), S({ week: -1 }), S({ date: '27.11' }), S({ link: 'https://evil.example/x' }),
    S({ vbt: 50 }), S({ rpe: 11 }), S({ kg: 'dużo' }), S({ note: 'x'.repeat(3001) })].forEach(s => assert.ok(f(s).error, JSON.stringify(s).slice(0, 80)));
  assert.equal(f(S({ vbt: 1, path: 'x'.repeat(45001) })).set.sciezka, '');      // za długa ścieżka nie psuje zapisu
});
