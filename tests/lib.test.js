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

test('localDate: data w strefie telefonu', () => {
  assert.equal(L.localDate(new Date(2026, 9, 10, 0, 30)), '2026-10-10');
  assert.match(L.localDate(), /^\d{4}-\d{2}-\d{2}$/);
});
