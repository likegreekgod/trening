// Czyste funkcje aplikacji z web/lib.js.
const test = require('node:test'), assert = require('node:assert');
const L = require('../web/lib.js');

test('repsDefault: kompleksy i zapisy powtórzeń', () => {
  assert.equal(L.repsDefault('1+1'), 2);
  assert.equal(L.repsDefault('2 + 1'), 3);
  assert.equal(L.repsDefault('8/str'), 8);
  assert.equal(L.repsDefault('6-8'), 6);
  assert.ok(isNaN(L.repsDefault('max')));
});

test('num, fmtKg, floor25, dropDefault: kilogramy', () => {
  assert.equal(L.num('97,5'), 97.5);
  assert.equal(L.num('BW'), 'BW');
  assert.equal(L.fmtKg(97.5), '97,5');
  assert.equal(L.fmtKg(''), '');
  assert.equal(L.floor25(83.9), 82.5);
  assert.deepEqual(L.dropDefault(100, 90), { kg: 70, reps: '' });      // 80% z 90 = 72 → 70
  assert.deepEqual(L.dropDefault(100), { kg: 80, reps: '' });
  assert.deepEqual(L.dropDefault('BW'), { kg: '', reps: '' });
});

test('plural, setKey, esc', () => {
  assert.equal(L.plural(1, 'seria', 'serie', 'serii'), 'seria');
  assert.equal(L.plural(3, 'seria', 'serie', 'serii'), 'serie');
  assert.equal(L.plural(12, 'seria', 'serie', 'serii'), 'serii');
  assert.equal(L.plural(22, 'seria', 'serie', 'serii'), 'serie');
  assert.equal(L.setKey('3'), 3);
  assert.equal(L.setKey('R1'), 'R1');
  assert.equal(L.esc('<b>"x"&</b>'), '&lt;b&gt;&quot;x&quot;&amp;&lt;/b&gt;');
});

test('effortVal: RPE → przycisk trybu PROSTY', () => {
  assert.deepEqual(['', 6, 7, '8,5', 9.5, 10].map(L.effortVal), ['', '6', '7.5', '9', '9', '10']);
});

test('RPE ↔ RIR: RIR = 10 − RPE, 5+ = RPE 5, recepta z ceil', () => {
  assert.deepEqual([10, 9, 8.5, 8, 7, 5, 4].map(L.rirOfRpe), [0, 1, 1.5, 2, 3, 5, 5]);
  assert.deepEqual(L.RIR_OPTS.map(L.rpeOfRir), [10, 9, 8, 7, 6, 5]);
  assert.equal(L.rpeOfRir('5+'), 5);
  assert.equal(L.rirOfRpe(''), '');
  assert.equal(L.rirMin(8), 2);
  assert.equal(L.rirMin(7.5), 3);     // RPE ≤ 7,5 → RIR ≥ 3 (nie 2,5)
  assert.equal(L.rirMin('8,5'), 2);
  assert.equal(L.rirMin(10), 0);
});

test('plateZone: kolor talerza wg % 1RM', () => {
  assert.deepEqual([0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, null].map(L.plateZone),
    ['p5', 'p10', 'p10', 'p15', 'p15', 'p20', 'p20', 'p25', '']);
});

test('addDays, dayDiff, ddmm, weekday', () => {
  assert.equal(L.addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(L.addDays('2026-10-25', 1), '2026-10-26');       // zmiana czasu nie przesuwa dnia
  assert.equal(L.dayDiff('2026-10-06', '2026-10-09'), 3);
  assert.equal(L.dayDiff('2026-10-09', '2026-10-06'), -3);
  assert.equal(L.ddmm('2026-10-06'), '06.10');
  assert.equal(L.weekday('2026-10-06'), 'wt');
  assert.equal(L.monthShort('2026-10-06'), 'paź');
  assert.equal(L.monthShort(''), '');
});

const P = (week, day, date, kg, extra) => Object.assign({ week, day, date, title: 'J' + day, sets: 4, reps: '5', kg }, extra || {});
test('units: jednostki planu po dacie', () => {
  const u = L.units([P(1, 'T2', '2026-10-08', 50), P(1, 'T1', '2026-10-06', 50), P(1, 'T1', '2026-10-06', 30)]);
  assert.deepEqual(u.map(x => [x.day, x.rows.length]), [['T1', 2], ['T2', 1]]);
});

test('lightWeeks: tydzień lżejszy z planu', () => {
  const plan = [1, 2, 3, 4].map(w => P(w, 'T1', '', w === 4 ? 60 : 100)).concat([P(2, 'T2', '', 'BW')]);
  assert.deepEqual([...L.lightWeeks(plan)], [4]);
  assert.deepEqual([...L.lightWeeks([P(1, 'T1', '', 50)])], []);
});

test('blockInfo: numer tygodnia w bloku', () => {
  const plan = [P(1, 'T1', '', 50, { block: 'B1' }), P(7, 'T1', '', 50, { block: 'B2' }), P(8, 'T1', '', 50, { block: 'B2' })];
  assert.deepEqual(L.blockInfo(plan, 8), { block: 'B2', n: 2 });
  assert.deepEqual(L.blockInfo(plan, 1), { block: 'B1', n: 1 });
  assert.equal(L.blockInfo([P(1, 'T1', '', 50)], 1), null);
});

test('unitStats: serie zrobione/wszystkie i tonaż bez rozgrzewki', () => {
  const exs = [{ order: 1, sets: 3 }, { order: 2, sets: 2 }];
  const logs = { 1: { R1: { wykonane: 'TAK', kg: 40, powt: 5 }, 1: { wykonane: 'TAK', kg: '50', powt: 5 }, 2: { wykonane: '', kg: 50, powt: 5 }, 4: { wykonane: 'TAK', kg: 50, powt: 5 } },
    2: { D1: { wykonane: 'TAK', kg: '22,5', powt: 10 } } };
  assert.deepEqual(L.unitStats(exs, ex => logs[ex.order]), { done: 1, all: 5, ton: 250 + 250 + 225 });
});

test('lastTop: „Ostatnio” z poprzedniej jednostki, najcięższa zaliczona seria', () => {
  const l = (w, d, s, kg, powt, extra) => Object.assign({ cwiczenie: 'Przysiad', tydzien: w, jednostka: d, seria: s, kg, powt, rpe: 8, wykonane: 'TAK', zapisano: `2026-10-0${w}T10:00:00Z` }, extra || {});
  const logs = [l(1, 'T1', 1, 100, 5), l(1, 'T1', 2, 102.5, 3), l(2, 'T1', 'R1', 140, 1), l(2, 'T1', 1, 105, 5, { rpe: 9 }),
    l(2, 'T1', 2, 110, 2, { typ: 'FAIL' }), l(2, 'T1', 3, 105, 4), l(3, 'T1', 1, 120, 5), l(2, 'T1', 1, 200, 5, { cwiczenie: 'Martwy' }),
    l(2, 'T2', 1, 300, 5, { wykonane: '' })];
  assert.deepEqual(L.lastTop(logs, ' przysiad ', 3, 'T1'), { kg: 105, reps: 5, rpe: 9 });   // tydz. 3 = bieżąca jednostka
  assert.equal(L.lastTop(logs, 'Wyciskanie', 3, 'T1'), null);
  assert.deepEqual(L.lastTop([l(1, 'T1', 1, 'BW', 10)], 'Przysiad', 2, 'T1'), { kg: 'BW', reps: 10, rpe: 8 });
});

test('localDate: data w strefie telefonu', () => {
  assert.equal(L.localDate(new Date(2026, 9, 10, 0, 30)), '2026-10-10');
  assert.match(L.localDate(), /^\d{4}-\d{2}-\d{2}$/);
});
