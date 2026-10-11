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
  assert.deepEqual(L.lastTop(logs, ' przysiad ', 3, 'T1'), { kg: 105, reps: 5, rpe: 9, ocena: '' });   // tydz. 3 = bieżąca jednostka
  assert.equal(L.lastTop(logs, 'Wyciskanie', 3, 'T1'), null);
  assert.deepEqual(L.lastTop([l(1, 'T1', 1, 'BW', 10)], 'Przysiad', 2, 'T1'), { kg: 'BW', reps: 10, rpe: 8, ocena: '' });
});

test('restSec i fmtClock: przerwa A/B/K', () => {
  assert.deepEqual(['A', 'B', 'K', 'k', ''].map(L.restSec), [120, 90, 60, 60, 90]);
  assert.deepEqual([120, 95, 9, 0.2, -5].map(L.fmtClock), ['2:00', '1:35', '0:09', '0:01', '0:00']);
});

test('plates: talerze na stronę, gryf i zamki', () => {
  assert.deepEqual(L.plates(60), { side: [15, 2.5], rest: 0, under: false });             // (60 − 20 − 5) / 2 = 17,5
  assert.deepEqual(L.plates(60, 15).side, [20]);
  assert.deepEqual(L.plates('142,5').side, [25, 25, 5, 2.5, 1.25]);                       // 58,75 na stronę
  assert.deepEqual(L.plates(21), { side: [], rest: 0, under: true });
  assert.deepEqual(L.plates(26), { side: [], rest: 1, under: false });                    // 0,5 na stronę – nie ma takiego talerza
  assert.deepEqual(L.plates(20, 20, 0), { side: [], rest: 0, under: false });
  assert.deepEqual(L.plates(''), { side: [], rest: 0, under: false });
});

test('groupOf / isOly: boje rozpoznane po nazwie albo z kolumny grupa', () => {
  assert.deepEqual(['Rwanie', 'Zarzut i podrzut', 'Squat jerk zza karku', 'Ciąg rwaniowy', 'Przysiad przedni', 'Martwy ciąg'].map(n => L.groupOf('', n)),
    ['R', 'P', 'P', 'CR', 'PS', 'I']);
  assert.equal(L.groupOf('i', 'Rwanie z zawisu'), 'I');                       // kolumna planu wygrywa
  assert.deepEqual([{ name: 'Rwanie' }, { name: 'Przysiad' }, { name: 'X', group: 'P' }].map(L.isOly), [true, false, true]);
});

test('rateOf: ocena z kolumny „ocena”, a dla starszych wpisów z FAIL / RPE', () => {
  const T = (o) => Object.assign({ wykonane: 'TAK' }, o);
  assert.deepEqual([T({ ocena: 'w' }), T({ typ: 'FAIL' }), T({ rpe: 7 }), T({ rpe: '8,5' }), T({ rpe: 9.5 }), T({}), { ocena: 'L' }].map(L.rateOf),
    ['W', 'X', 'L', 'S', 'W', '', '']);
});

test('olyCap: sufit dnia', () => {
  assert.equal(L.olyCap(70, 0.7, 0.05), 75);                                  // 1RM 100 × 0,75
  assert.equal(L.olyCap(77.5, 0.75, 0.05, false), 82.5);                      // 1RM 103,3 × 0,8 = 82,67 → 82,5
  assert.equal(L.olyCap(70, 0.7, 0.05, true), 70);                            // słaba dyspozycja = plan
  assert.equal(L.olyCap(70, null, 0.05), null);
});

test('sugOly: propozycje wg tabeli ocen', () => {
  const R = (kg, rate, done = true) => ({ kg, rate, done });
  const open = R(70, '', false);
  const s = (rows, i, o) => { const x = L.sugOly(rows, i, Object.assign({ cap: 75, one: 100 }, o)); return x && [x.lvl, x.kg]; };
  assert.deepEqual(s([R(70, 'L'), open], 0), ['up', 72.5]);
  assert.deepEqual(s([R(75, 'L'), open], 0), ['stay', 75]);                   // sufit
  assert.match(L.sugOly([R(70, 'L'), open], 0, { cap: 70, weak: true, why: 'uwaga' }).txt, /dyspozycja dnia: uwaga/);
  assert.deepEqual(s([R(70, 'L'), open], 0, { cap: null }), ['up', 72.5]);   // bez % w planie
  assert.deepEqual(s([R(70, 'S'), open], 0), ['stay', 70]);
  assert.deepEqual(s([R(70, 'W'), open], 0), ['stay', 70]);
  assert.deepEqual(s([R(70, 'W'), R(70, 'W'), open], 1), ['down', 67.5]);
  assert.deepEqual(s([R(70, 'X'), open], 0), ['stay', 70]);
  assert.deepEqual(s([R(70, 'X'), R(70, 'X'), open], 1), ['down', 65]);       // −5% 1RM
  assert.deepEqual(s([R(72.5, 'X'), R(70, 'X'), open], 1), ['stay', 70]);    // inne ciężary – liczy się od nowa
  assert.deepEqual(s([R(70, 'L'), R(72.5, 'S'), open], 0), null);             // nie ostatnie ocenione
  assert.deepEqual(s([R(70, 'L'), R(72.5, 'S')], 1), null);                   // brak serii do zrobienia
});

test('swapOptions, swapText, parseSwap: zamiana ćwiczenia', () => {
  assert.deepEqual(L.swapOptions({ name: 'Przysiad tylny', swaps: ['Leg press', ' Hack ', 'Leg press', ''] }), ['Leg press', 'Hack']);
  assert.deepEqual(L.swapOptions({ name: 'Przysiad tylny' }).slice(0, 2), ['Goblet squat', 'Wypychanie nogami (leg press)']);
  assert.equal(L.swapOptions({ name: 'Ciąg rwaniowy' })[0], 'Ciąg z zawisu');
  assert.equal(L.swapOptions({ name: 'Rwanie' })[0], 'Rwanie z zawisu');
  assert.equal(L.swapOptions({ name: 'Wyciskanie sztangi na ławce płaskiej' })[0], 'Wyciskanie hantli na ławce');
  assert.deepEqual(L.swapOptions({ name: 'Plank boczny' }), []);
  const s = { from: 'Przysiad tylny', to: 'Leg press', why: 'Sprzęt zajęty' };
  assert.equal(L.swapText(s), 'Przysiad tylny → Leg press | Sprzęt zajęty');
  assert.deepEqual(L.parseSwap(L.swapText(s)), s);
  assert.equal(L.swapText(null), '');
  assert.equal(L.parseSwap(''), null);
});

// --- ścieżka i VBT na ruchu syntetycznym (tests/synth.js) ---
const SY = require('./synth');
test('analyse: rwanie → v max, uniesienie, ścieżka przycięta do wejścia pod sztangę', () => {
  const pts = SY.snatch(), r = L.analyse(pts, 'R'), vTrue = SY.trueVmax(SY.snatchAt, 0.95);
  assert.equal(r.kind, 'oly');
  assert.equal(r.reps.length, 1);                                              // wstanie z przysiadu to nie drugi ciąg
  assert.ok(Math.abs(r.vmax - vTrue) <= 0.06, `v max ${r.vmax.toFixed(2)} vs ${vTrue.toFixed(2)}`);
  assert.ok(Math.abs(r.h - 96) <= 2, 'uniesienie ' + r.h);
  assert.ok(pts[r.crop[1]].t < 1.6 && pts[r.crop[1]].t > 1.0, 'koniec ścieżki po wejściu pod sztangę, przed wstaniem');
  const o = L.vbtOut(r);
  assert.equal(o.vbt, Math.round(r.vmax * 100) / 100);
  assert.equal(o.height, r.h);
  assert.ok(o.path.length >= 10 && o.path.length <= 30 && o.path.every(p => p.length === 2));
  assert.ok(JSON.stringify(o.path).length < 1000);                             // mieści się w komórce z zapasem
});

test('analyse: siła → MCV każdego powtórzenia, najlepsze MCV, spadek prędkości', () => {
  const r = L.analyse(SY.strength(), 'PS');
  assert.equal(r.kind, 'str');
  assert.equal(r.reps.length, 3);
  SY.UP.forEach((up, i) => assert.ok(Math.abs(r.reps[i].mcv - SY.ROM / up) <= 0.04, `powt. ${i + 1}: ${r.reps[i].mcv.toFixed(2)} vs ${(SY.ROM / up).toFixed(2)}`));
  assert.ok(Math.abs(r.mcv - SY.ROM / 0.6) <= 0.04);
  assert.ok(Math.abs(r.loss - 25) <= 4, 'spadek ' + r.loss.toFixed(1));       // (0,833 − 0,625) / 0,833
  assert.ok(Math.abs(r.h - 50) <= 3);
  const o = L.vbtOut(r);
  assert.ok(o.vbtPeak >= o.vbt);
});

test('analyse / vbtOut / pathSVG: brak ruchu i rysunek', () => {
  const still = Array.from({ length: 60 }, (_, k) => ({ t: k / 30, x: 0, y: 0.01 * Math.sin(k) }));
  assert.equal(L.analyse(still, 'PS').reps.length, 0);
  assert.equal(L.vbtOut(L.analyse(still, 'PS')), null);
  const svg = L.pathSVG(L.vbtOut(L.analyse(SY.snatch(), 'R')).path);
  assert.match(svg, /^<svg class="path"[^>]*role="img"/);
  assert.match(svg, /<path class="trace" d="M[\d.]+,[\d.]+L/);
  assert.equal(L.pathSVG([]), '');
});

test('localDate: data w strefie telefonu', () => {
  assert.equal(L.localDate(new Date(2026, 9, 10, 0, 30)), '2026-10-10');
  assert.match(L.localDate(), /^\d{4}-\d{2}-\d{2}$/);
});
