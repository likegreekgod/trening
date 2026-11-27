// Testy pośrednika MCP (czyste funkcje, dane syntetyczne): node --test mcp/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, run, d10, dzis, klient, jednostka, kalendarz, setTxt, light, ZAPIS, klientNowy, karta, e1rm, filmy, filmRef, refParse, tor } from '../src/tools.js';
import { handle, handleBody, VERSIONS, rec } from '../src/mcp.js';
import { UI_DZIS, UI_KLIENT, UI_FILM, UI_TOR, KLIENT_HTML, FILM_HTML, TOR_HTML } from '../src/ui.js';

const PULPIT = {
  today: '2026-11-27', at: '2026-11-27T06:00:00Z',
  clients: [
    { id: 'ania', name: 'Ania', urg: 4, signals: [{ lv: 'bad', t: 'ból kolana 5/10' }, { lv: 'warn', t: 'FAIL' }], last: '2026-11-26', week: '2/3', late: 0, planLeft: 12, status: 'OK', note: '', filmsNew: 2, pkg: { left: 3 } },
    { id: 'olek', name: 'Olek', urg: 0, signals: [], last: '2026-11-20', week: '0/3', late: 1, planLeft: 40, status: '', note: 'kolano', filmsNew: 0 },
  ],
  dzis: [{ id: 'ania', name: 'Ania', week: 3, day: 'B', title: 'Dół', st: 'live', sets: 16, done: 5, rpe: null, min: null }],
  agent: [{ pid: 'ania|p|1', name: 'Ania', at: '2026-11-27', zgl: false, pilne: false, text: 'ciężar Przysiad: 80 → 82,5 kg', why: 'same 🟢' }],
  agentAuto: [{ pid: 'ania|a|9', name: 'Ania', at: '2026-11-26T18:00:00Z', text: 'skrócony trening Dół: Wykroki pominięte', why: 'brak czasu' }],
  blocks: [{ id: 'olek', name: 'Olek', block: 'B1', to: '2026-11-25' }],
  replies: [{ id: 'ania', name: 'Ania', at: '2026-11-26', title: 'Przysiad · seria 2', kom: 'Kolana na zewnątrz', text: 'ok' }],
  dysk: { free: 1.5e9, low: true },
  videos: [{ link: 'https://drive.google.com/file/d/x' }],
};

const KLIENT = {
  cfg: { id: 'ania', name: 'Ania', simple: false, scale: 'RPE', swap: 'TRENER' },
  plan: [
    { week: 3, day: 'A', title: 'Góra', date: '2026-11-25', order: 1, name: 'Wyciskanie', prio: 'A', sets: 3, reps: '5', kg: 50, pct: null, rpe: 8, note: '' },
    { week: 3, day: 'B', title: 'Dół', date: '2026-11-27', order: 1, name: 'Przysiad', prio: 'A', sets: 4, reps: '5', kg: 80, pct: 0.75, rpe: 8, note: '', unote: 'Spokojnie' },
    { week: 3, day: 'B', title: 'Dół', date: '2026-11-27', order: 2, name: 'Wykroki', prio: 'B', sets: 3, reps: '8/str', kg: 'BW', pct: null, rpe: null, note: '', section: 'G' },
    { week: 4, day: 'A', title: 'Góra', date: '', order: 1, name: 'Wyciskanie', prio: 'A', sets: 3, reps: '5', kg: 52.5, pct: null, rpe: 8, note: '' },
    { week: 3, day: 'W1', title: 'Własny', date: '2026-11-24', order: 1, name: 'Bieg', prio: 'A', sets: 1, reps: '20 s', own: true },
  ],
  logs: [
    { tydzien: 3, jednostka: 'A', nr_cw: 1, cwiczenie: 'Wyciskanie', seria: 'R1', kg: 20, powt: 8, wykonane: 'TAK' },
    { tydzien: 3, jednostka: 'A', nr_cw: 1, cwiczenie: 'Wyciskanie', seria: '1', kg: 50, powt: 5, rpe: 7, wykonane: 'TAK', uwagi: 'lekko' },
    { tydzien: 3, jednostka: 'A', nr_cw: 1, cwiczenie: 'Wyciskanie', seria: '2', kg: 50, powt: 5, rpe: 9, wykonane: 'TAK', uwagi: 'lekko' },
    { tydzien: 3, jednostka: 'A', nr_cw: 1, cwiczenie: 'Wyciskanie', seria: '3', kg: 50, powt: 3, rpe: '', typ: 'FAIL', wykonane: '', uwagi: 'lekko', komentarz_trenera: 'Łokcie niżej' },
  ],
  sessions: [{ tydzien: 3, jednostka: 'A', start: '2026-11-25T17:00:00Z', rpe_sesji: 8, samopoczucie: 4, czas_min: 55, bol: 'bark:2', uwagi: '', komentarz_trenera: '' }],
  summary: [{ week: '2026-11-23', status: 'OK', why: '', done: 0.8, ton: 4200 }],
  blocks: [{ blok: 'B2', od: '2026-11-09', do: '2026-12-06', wnioski: '', dla_klienta: '' }],
  pkg: { n: 10, left: 3, to: '2026-12-31' },
};

test('światła i serie w skrócie', () => {
  assert.equal(light(7), '🟢'); assert.equal(light(8.5), '🟡'); assert.equal(light(9), '🔴'); assert.equal(light('', 'FAIL'), '✖'); assert.equal(light(''), '');
  assert.equal(setTxt({ seria: '1', kg: 80, powt: 5, rpe: 8, wykonane: 'TAK' }), '80×5 🟡');
  assert.equal(setTxt({ seria: '2', kg: '', powt: 10, wykonane: '' }), '10 (nieodhaczona)');
  assert.equal(setTxt({ seria: 'D1', kg: 60, powt: 8, typ: 'DROP', wykonane: 'TAK' }), '60×8 drop');
  assert.equal(setTxt({ seria: '0', uwagi: 'brak czasu' }), 'pominięte (brak czasu)');
});

test('dzis: kto trenuje, sygnały, asystent, bez linków', () => {
  const d = dzis(PULPIT);
  assert.deepEqual(d.trenuja_dzis, [{ klient: 'Ania', id: 'ania', tydzien: 3, jednostka: 'B', tytul: 'Dół', stan: 'w trakcie', serie: '5/16' }]);
  assert.deepEqual(d.sygnaly[0].sygnaly, ['🔴 ból kolana 5/10', '🟠 FAIL']);
  assert.equal(d.sygnaly.length, 1);
  assert.equal(d.asystent_czeka[0].pid, 'ania|p|1');
  assert.equal(d.asystent_zrobil_sam[0].kiedy, '2026-11-26');
  assert.deepEqual(d.filmy_bez_komentarza, [{ klient: 'Ania', id: 'ania', ile: 2 }]);
  assert.match(d.dysk, /1,5|1\.5/);
  assert.ok(!JSON.stringify(d).includes('drive.google.com'), 'bez linków do filmów');
});

test('klient: nadchodzące niezrobione jednostki, ostatnie sesje bez rozgrzewki', () => {
  const k = klient(KLIENT, { today: '2026-11-27' });
  assert.deepEqual(k.nadchodzace_jednostki.map(u => u.tydzien + u.jednostka), ['3B', '4A'], 'bez zrobionej 3A i bez własnego W1');
  assert.equal(k.nadchodzace_jednostki[0].notatka_do_jednostki, 'Spokojnie');
  assert.equal(k.nadchodzace_jednostki[0].cwiczenia[1].sekcja, 'Główne');
  assert.deepEqual(k.nadchodzace_jednostki[0].cwiczenia[0], { nr: 1, cwiczenie: 'Przysiad', prio: 'A', serie: 4, powt: '5', kg: 80, procent: '75%', rpe_max: 8 });
  const s = k.ostatnie_sesje[0];
  assert.equal(s.tytul, 'Góra'); assert.equal(s.data, '2026-11-25'); assert.equal(s.bol, 'bark:2');
  assert.deepEqual(s.cwiczenia, [{ nr: 1, cwiczenie: 'Wyciskanie', serie: '50×5 🟢, 50×5 🔴, 50×3 ✖', uwagi_klienta: 'lekko', komentarz_trenera: 'Łokcie niżej' }]);
  assert.deepEqual(k.pakiet, { kupione: 10, zostalo: 3, waznosc: '2026-12-31' });
});

test('jednostka i kalendarz', () => {
  const j = jednostka(KLIENT, 3, 'A');
  assert.equal(j.zrobiona, 'tak'); assert.equal(j.sesja.rpe_sesji, 8); assert.equal(j.plan.length, 1);
  assert.equal(jednostka(KLIENT, 3, 'B').zrobiona, 'nie');
  assert.match(jednostka(KLIENT, 9, 'Z').blad, /Nie ma jednostki/);
  const k = kalendarz({ from: '2026-11-23', to: '2026-11-29', today: '2026-11-27', units: [{ date: '2026-11-25', name: 'Ania', id: 'ania', week: 3, day: 'A', title: 'Góra', st: 'late', ex: 1, done: 0, sets: 3, rpe: null }], undated: [] });
  assert.equal(k.jednostki[0].stan, 'zaległa');
  assert.equal(k.bez_daty, undefined);
});

test('data sesji w strefie trenera (Europe/Warsaw), nie UTC', () => {
  assert.equal(d10('2026-11-26T23:00:00.000Z'), '2026-11-27', 'północ w Polsce = 23:00 UTC dnia wcześniej');
  assert.equal(d10('2026-11-27T22:30:00.000Z'), '2026-11-27', '23:30 w Polsce zostaje tym samym dniem');
  assert.equal(d10('2026-06-30T22:30:00.000Z'), '2026-07-01', 'czas letni: UTC+2');
  assert.equal(d10('2026-11-27'), '2026-11-27', 'data bez godziny bez zmian');
  assert.equal(d10(''), ''); assert.equal(d10(null), '');
  // Maciek, tydz. 1, S1: sesja zamknięta bez startu, data z arkusza jako północ → klient i jednostka pokazują 27.11
  const d = Object.assign({}, KLIENT, { sessions: [{ tydzien: 3, jednostka: 'A', start: '', data: '2026-11-26T23:00:00.000Z', rpe_sesji: 8 }] });
  assert.equal(jednostka(d, 3, 'A').sesja.data, '2026-11-27');
  assert.equal(klient(d, { today: '2026-11-28' }).ostatnie_sesje[0].data, '2026-11-27');
  d.sessions = [{ tydzien: 3, jednostka: 'A', start: '2026-11-26T23:00:00.000Z', data: '2026-11-25' }];
  assert.equal(jednostka(d, 3, 'A').sesja.data, '2026-11-27', 'start ma pierwszeństwo przed datą z planu');
});

test('run: zapisy przekładają się na funkcje panelu', async () => {
  const calls = [], api = async (fn, ...args) => { calls.push([fn, ...args]); return fn === 'trPrzesun' ? { date: args[1].date, n: 3 } : fn === 'trPlan' ? { n: 2, weeks: [3] } : {}; };
  assert.deepEqual(await run('przesun', { id: 'Ania', tydzien: 3, jednostka: 'B', data: '2026-11-28' }, api), { zapisano: true, nowa_data: '2026-11-28', wierszy: 3 });
  await run('zmien_plan', { id: 'ania', tydzien: 3, jednostka: 'B', zmiany: [{ nr: 1, kg: '82.5', sekcja: 'Rozgrzewka' }, { nr: 2, serie: 2, uwagi: '' }], kolejne_tygodnie: true }, api);
  await run('decyzja_asystent', { pid: 'ania|a|9', decyzja: 'cofnij', zasada: true }, api);
  await run('komentarz_sesji', { id: 'ania', tydzien: 3, jednostka: 'A', tekst: 'Dobra robota' }, api);
  assert.deepEqual(calls, [
    ['trPrzesun', 'ania', { week: 3, day: 'B', date: '2026-11-28' }],
    ['trPlan', 'ania', { week: 3, day: 'B', ex: [{ order: 1, kg: '82.5', section: 'Rozgrzewka' }, { order: 2, sets: '2', note: '' }], next: true }],
    ['trPropozycja', 'ania|a|9', { mode: 'cofnij', why: '', zasada: false }],
    ['trKomentarz', 'ania', 3, 'A', 'Dobra robota'],
  ]);
  await assert.rejects(run('decyzja_asystent', { pid: 'x', decyzja: 'nie' }, api), /powód/);
  await assert.rejects(run('zmien_plan', { id: 'ania', tydzien: 3, jednostka: 'B' }, api), /Nie ma czego zmienić/);
  await assert.rejects(run('przesun', { id: 'ania', tydzien: 3, jednostka: 'B' }, api), /data/);
  // każde narzędzie zapisujące woła funkcję z listy ZAPIS (serwer wpisuje ją do zakładki API)
  calls.forEach(c => assert.ok(ZAPIS.includes(c[0]), c[0]));
});

test('MCP: initialize, tools/list, tools/call, błędy jako wynik', async () => {
  const api = async fn => { if (fn === 'trPrzesun') throw new Error('Ta jednostka jest już zrobiona – dzień bierze się z jej zapisu.'); return PULPIT; };
  const ctx = { api, today: '2026-11-27' };
  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't' } } }, ctx);
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.ok(init.result.capabilities.tools);
  const odd = await handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, ctx);
  assert.equal(odd.result.protocolVersion, VERSIONS[0]);
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx), null);
  const list = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, ctx);
  assert.deepEqual(list.result.tools.map(t => t.name), TOOLS.map(t => t.name));
  list.result.tools.forEach(t => { assert.equal(t.inputSchema.type, 'object'); assert.ok(t.description.length > 30, t.name); });
  const call = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'dzis', arguments: {} } }, ctx);
  assert.equal(call.result.structuredContent.trenuja_dzis[0].klient, 'Ania');
  assert.equal(JSON.parse(call.result.content[0].text).dzien, '2026-11-27');
  const bad = await handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'przesun', arguments: { id: 'ania', tydzien: 3, jednostka: 'A', data: '2026-11-28' } } }, ctx);
  assert.equal(bad.result.isError, true); assert.match(bad.result.content[0].text, /zrobiona/);
  assert.equal((await handle({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'nie_ma' } }, ctx)).error.code, -32602);
  assert.equal((await handle({ jsonrpc: '2.0', id: 7, method: 'resources/nie_ma' }, ctx)).error.code, -32601);
  assert.equal((await handle({ id: 8 }, ctx)).error.code, -32600);
  const batch = await handleBody([{ jsonrpc: '2.0', id: 9, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }], ctx);
  assert.deepEqual(batch, [{ jsonrpc: '2.0', id: 9, result: {} }]);
  // błąd logowania nie jest zwykłym wynikiem: index.js odpowiada wtedy 401
  const auth = Object.assign(new Error('Logowanie: bilet wygasł'), { auth: true });
  await assert.rejects(handle({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'dzis' } }, { api: async () => { throw auth; } }), /Logowanie/);
});

test('structuredContent zawsze jest obiektem: „klienci” jako { klienci: [...] }, tablica z innego narzędzia → { wynik }', async () => {
  const ctx = { api: async () => PULPIT, today: '2026-11-27' };
  const r = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'klienci', arguments: {} } }, ctx);
  const sc = r.result.structuredContent;
  assert.ok(sc && typeof sc === 'object' && !Array.isArray(sc), 'klient MCP odrzuca tablicę („expected record, received array”)');
  assert.deepEqual(sc.klienci.map(k => k.id), ['ania', 'olek']);
  assert.equal(sc.klienci[0].sygnaly[0], '🔴 ból kolana 5/10');
  assert.deepEqual(JSON.parse(r.result.content[0].text), sc, 'tekst = to samo co structuredContent');
  for (const name of ['dzis', 'klienci', 'filmy']) {                // narzędzia czytające sam pulpit
    const x = (await handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: {} } }, ctx)).result.structuredContent;
    assert.ok(x && typeof x === 'object' && !Array.isArray(x), name);
  }
  assert.deepEqual(rec([1, 2]), { wynik: [1, 2] }); assert.deepEqual(rec(null), { wynik: null }); assert.deepEqual(rec('ok'), { wynik: 'ok' });
  const o = { a: 1 }; assert.equal(rec(o), o);
});

test('karty MCP Apps: zasób ui:// z kartą Dziś, narzędzie „dzis” wskazuje kartę', async () => {
  const ctx = { api: async () => PULPIT, today: '2026-11-27' };
  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } }, ctx);
  assert.ok(init.result.capabilities.resources);
  const list = await handle({ jsonrpc: '2.0', id: 2, method: 'resources/list' }, ctx);
  assert.deepEqual(list.result.resources.map(r => [r.uri, r.mimeType]), [[UI_DZIS, 'text/html;profile=mcp-app'], [UI_FILM, 'text/html;profile=mcp-app'], [UI_TOR, 'text/html;profile=mcp-app'], [UI_KLIENT, 'text/html;profile=mcp-app']]);
  const read = await handle({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: UI_DZIS } }, ctx);
  const c = read.result.contents[0];
  assert.equal(c.mimeType, 'text/html;profile=mcp-app');
  assert.match(c.text, /^<!doctype html>/); assert.match(c.text, /ui\/initialize/); assert.match(c.text, /decyzja_asystent/);
  assert.doesNotMatch(c.text, /https?:\/\/(?!www\.w3)/, 'karta nie sięga do sieci');
  assert.deepEqual(c._meta.ui.csp.connectDomains, []);
  assert.equal((await handle({ jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: 'ui://nie/ma' } }, ctx)).error.code, -32002);
  const tools = (await handle({ jsonrpc: '2.0', id: 5, method: 'tools/list' }, ctx)).result.tools;
  assert.equal(tools.find(t => t.name === 'dzis')._meta.ui.resourceUri, UI_DZIS);
  // skrypt karty da się przetworzyć (bez błędu składni)
  new Function(c.text.match(/<script>([\s\S]*)<\/script>/)[1]);
  // wszystkie decyzje z karty są dozwolone w narzędziu
  const enumD = TOOLS.find(t => t.name === 'decyzja_asystent').inputSchema.properties.decyzja.enum;
  ['tak', 'nie', 'czytane', 'cofnij'].forEach(d => { assert.ok(enumD.includes(d)); assert.match(c.text, new RegExp("'" + d + "'")); });
});

test('karta klienta: sygnały, liczby tygodnia, siła z e1RM ćwiczeń A', () => {
  assert.equal(e1rm(100, 5, 8), 100 * (1 + 7 / 30));
  assert.equal(e1rm(100, 1, 10), 100);
  assert.equal(e1rm(100, 5, ''), 100 * (1 + 5 / 30), 'bez RPE = RPE 10, jak w aplikacji');
  assert.equal(e1rm(100, 15, 8), null);
  const L = (w, kg, rpe, extra) => Object.assign({ tydzien: w, jednostka: 'A', nr_cw: 1, cwiczenie: 'Przysiad', seria: '1', kg, powt: 5, rpe, wykonane: 'TAK', data: '2026-11-' + String(w + 10).padStart(2, '0') }, extra);
  const d = {
    cfg: { id: 'ola', name: 'Ola', simple: false },
    plan: [
      { week: 9, day: 'A', order: 1, name: 'Przysiad', prio: 'A', block: 'B3', date: '2026-11-25' },
      { week: 9, day: 'B', order: 1, name: 'Martwy ciąg', prio: 'A', block: 'B3', date: '2026-11-28' },
      { week: 12, day: 'A', order: 1, name: 'Przysiad', prio: 'A', block: 'B3', date: '2026-12-16' },
      { week: 9, day: 'R', order: 1, name: 'Rozgrzewka', prio: 'A', section: 'R', block: 'B3', date: '2026-11-25' },
    ],
    logs: [L(7, 90, 8), L(8, 92.5, 8), L(9, 95, 9, { film_link: 'https://x', data: '2026-11-25' }), L(9, 95, '', { typ: 'FAIL', wykonane: '', seria: '2' }), L(9, 40, 7, { seria: 'R1' })],
    sessions: [{ tydzien: 9, jednostka: 'A', start: '2026-11-25T17:00:00', rpe_sesji: 8, bol_max: 4, bol: 'kolano:4' }, { tydzien: 8, jednostka: 'A', start: '2026-11-18T17:00:00', rpe_sesji: 7 }],
    readiness: [{ data: '2026-11-26', werdykt: 'Uwaga' }, { data: '2026-11-10', werdykt: 'Zmęczenie' }],
    stan: [{ data: '2026-11-20', miejsce: 'Bark', strona: 'P', ocena: 2 }],
    summary: [{ week: '2026-11-17', ton: 12000, status: '🟢 OK' }, { week: '2026-11-24', ton: 13200, status: '🟠 uwaga', why: 'skok obciążenia' }],
  };
  const k = klient(d, { today: '2026-11-27' });
  assert.equal(k.naglowek, 'Blok B3 · tydz. 9 z 12 · PRO');
  assert.deepEqual(k.sygnaly, ['🟠 tydzień: uwaga (skok obciążenia)', '🟠 ból kolano 4/10 (25.11)', '🟠 dyspozycja: uwaga']);
  assert.deepEqual(k.liczby, { ten_tydzien: '1/3', sr_rpe_sesji: 7.5, tonaz_tydzien_t: 13.2, tonaz_zmiana_proc: 10, filmy_bez_komentarza_14dni: 1 });
  assert.equal(k.sila.length, 1, 'Martwy bez serii w Logu, rozgrzewka (sekcja R) poza siłą');
  assert.deepEqual(k.sila[0].tygodnie, [7, 8, 9]);
  assert.equal(k.sila[0].e1rm_kg, Math.round(95 * (1 + 6 / 30) * 2) / 2, 'FAIL i rozgrzewka R1 pominięte');
  assert.equal(k.sila[0].zmiana_kg, Math.round((k.sila[0].e1rm_kg - k.sila[0].punkty[0]) * 10) / 10);
  // karta bez danych: bez wyjątku
  assert.deepEqual(karta({ cfg: {} }, '2026-11-27', [], {}).sygnaly, []);
  // narzędzie wskazuje kartę, karta nie sięga do sieci poza linkiem do panelu przez gospodarza
  assert.equal(TOOLS.find(t => t.name === 'klient')._meta.ui.resourceUri, UI_KLIENT);
  assert.match(KLIENT_HTML, /ui\/open-link/);
  assert.deepEqual(KLIENT_HTML.match(/https?:\/\/[^'"\s]+/g).filter(u => !/www\.w3\.org/.test(u)), ['https://likegreekgod.github.io/trening/trener.html']);
  new Function(KLIENT_HTML.match(/<script>([\s\S]*)<\/script>/)[1]);
});

test('filmy: lista bez linków, karta filmu z biletem tylko dla karty, klatki jako zdjęcia, komentarz', async () => {
  const V = { id: 'ola', name: 'Ola', at: '2026-11-25', week: 9, day: 'A', order: 1, ex: 'Przysiad', set: '4', kg: 95, reps: '5', rpe: 9, typ: '', note: 'kolano', swap: '',
    file: 'FILE_abcdefghijklmnopqrstuv', link: 'https://drive.google.com/file/d/FILE_abcdefghijklmnopqrstuv/view', kom: '', komT: '', komD: '', rep: '' };
  const V2 = Object.assign({}, V, { set: '3', kom: 'ok', komT: 'ok' }), P = { videos: [V, V2, Object.assign({}, V, { id: 'ewa', name: 'Ewa' })] };
  const f = filmy(P, 'ola');
  assert.deepEqual(f, { filmy: [{ ref: 'ola|9|A|1|4', klient: 'Ola', data: '2026-11-25', cwiczenie: 'Przysiad', seria: '4', wykonanie: '95×5 🔴', uwagi_klienta: 'kolano' }], razem: 1 });
  assert.equal(filmy(P, '', true).razem, 3);
  assert.doesNotMatch(JSON.stringify(filmy(P, '', true)), /drive|FILE_/);
  assert.deepEqual(refParse('ola|9|A|1|4'), { id: 'ola', week: 9, day: 'A', order: 1, set: '4' });
  assert.throws(() => refParse('ola|9|A'), /Zły identyfikator/);
  assert.equal(filmRef(V), 'ola|9|A|1|4');
  // film: bilet przez o.ticket, w treści dla Claude bez adresu
  const calls = [], api = async (fn, ...a) => { calls.push([fn, ...a]); return fn === 'trPulpit' ? P : fn === 'trFilm' ? { token: 'TOK' } : { text: a[5] }; };
  const store = {}, ctx = { api, today: '2026-11-27', origin: 'https://p.example', ticket: async (file, tok) => 'https://p.example/film/' + file + '/' + tok,
    store: async x => { store.k = x; return 'a'.repeat(32); }, load: async k => (k === 'a'.repeat(32) ? store.k : null) };
  const r = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'film', arguments: { ref: 'ola|9|A|1|4' } } }, ctx);
  assert.equal(r.result.structuredContent._ui.src, 'https://p.example/film/FILE_abcdefghijklmnopqrstuv/TOK');
  assert.doesNotMatch(r.result.content[0].text, /p\.example|TOK|FILE_/);
  assert.match((await handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'film', arguments: { ref: 'ola|1|A|1|1' } } }, ctx)).result.content[0].text, /Nie ma filmu/);
  // klatki: zapis (tylko karta) → odczyt jako zdjęcia
  const jpg = Buffer.from('jpeg').toString('base64');
  const z = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'klatki_zapisz', arguments: { ref: 'ola|9|A|1|4', klatki: [{ t: 4.234, jpg }, { t: 5, jpg }] } } }, ctx);
  assert.equal(z.result.structuredContent.klatki_id, 'a'.repeat(32));
  assert.match((await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'klatki_zapisz', arguments: { ref: 'ola|9|A|1|4', klatki: [{ t: 1, jpg: '<script>' }] } } }, ctx)).result.content[0].text, /base64/);
  const k = await handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'klatki', arguments: { klatki_id: 'a'.repeat(32) } } }, ctx);
  const imgs = k.result.content.filter(c => c.type === 'image');
  assert.equal(imgs.length, 2); assert.equal(imgs[0].mimeType, 'image/jpeg'); assert.equal(imgs[0].data, jpg);
  assert.match(k.result.content[0].text, /Przysiad/); assert.deepEqual(k.result.structuredContent.chwile_s, [4.23, 5]);
  assert.match((await handle({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'klatki', arguments: { klatki_id: 'b'.repeat(32) } } }, ctx)).result.content[0].text, /wygasły/);
  // komentarz → trKomentarzFilm (zapis w dzienniku API)
  await handle({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'komentarz_filmu', arguments: { ref: 'ola|9|A|1|4', tekst: '0:05,0 kolano' } } }, ctx);
  assert.deepEqual(calls[calls.length - 1], ['trKomentarzFilm', 'ola', 9, 'A', 1, '4', '0:05,0 kolano']);
  assert.ok(ZAPIS.includes('trKomentarzFilm'));
  // narzędzia i karta
  const T = n => TOOLS.find(t => t.name === n);
  assert.equal(T('film')._meta.ui.resourceUri, UI_FILM);
  assert.deepEqual(T('klatki_zapisz')._meta.ui.visibility, ['app']);
  const rr = await handle({ jsonrpc: '2.0', id: 8, method: 'resources/read', params: { uri: UI_FILM } }, ctx);
  assert.deepEqual(rr.result.contents[0]._meta.ui.csp.resourceDomains, ['https://p.example']);
  assert.match(FILM_HTML, /klatki_zapisz/); assert.match(FILM_HTML, /ui\/message/); assert.match(FILM_HTML, /komentarz_filmu/);
  assert.doesNotMatch(FILM_HTML, /https?:\/\/(?!www\.w3)/);
  new Function(FILM_HTML.match(/<script>([\s\S]*)<\/script>/)[1]);
});

test('tor: postęp prędkości i toru ćwiczenia (liczby dla Claude, tory tylko dla karty)', async () => {
  const L = (data, seria, kg, v, x, note) => ({ tydzien: 1, jednostka: 'T1', data, nr_cw: 1, cwiczenie: 'Przysiad tylny', seria, kg, powt: 5, vbt_ms: v, vbt_peak: v + 0.4, wysokosc_cm: 58,
    sciezka: JSON.stringify([[0, 0], [x, 30], [x / 2, 58]]), notatka_trenera: note || '', film_link: 'https://drive.google.com/file/d/a/view' });
  const d = { cfg: { name: 'Ania' }, logs: [L('2026-11-03', 2, 80, 0.55, 3), L('2026-11-03', 3, 80, 0.5, 4), L('2026-11-10', 2, 82, 0.58, 2.5, 'kolana lepiej'),
    { cwiczenie: 'Przysiad tylny', seria: 1, data: '2026-11-10', vbt_ms: '' }, { cwiczenie: 'Rwanie', seria: 1, data: '2026-11-12', vbt_ms: 1.7, kg: 60 }] };
  const a = tor(d, '');
  assert.deepEqual(a.cwiczenia.map(c => [c.cwiczenie, c.analiz]), [['Rwanie', 1], ['Przysiad tylny', 3]]);
  const b = tor(d, 'przysiad tylny');
  assert.equal(b.cwiczenie, 'Przysiad tylny'); assert.match(b.miara, /^MCV/);
  assert.deepEqual(b.najlepsza_dnia, [{ data: '2026-11-03', predkosc_ms: 0.55, kg: 80 }, { data: '2026-11-10', predkosc_ms: 0.58, kg: 82 }]);
  assert.deepEqual(b.serie.map(x => [x.seria, x.odchylenie_toru_cm]), [['2', 3], ['3', 4], ['2', 2.5]]);
  assert.equal(b.serie[2].wnioski_trenera, 'kolana lepiej');
  assert.equal(b._ui.tory.length, 3); assert.equal(b._ui.oly, false);
  assert.match(tor(d, 'Rwanie').miara, /^v max/);
  assert.match(tor(d, 'Martwy ciąg').uwaga, /Brak analizy/);
  const out = await run('tor', { id: 'Ania', cwiczenie: 'Przysiad tylny' }, async (fn, id) => { assert.equal(fn, 'trKlient'); assert.equal(id, 'ania'); return d; });
  assert.equal(out.serie.length, 3);
  assert.equal(TOOLS.find(t => t.name === 'tor')._meta.ui.resourceUri, UI_TOR);
  assert.doesNotMatch(TOR_HTML, /https?:\/\/(?!www\.w3)/);
  new Function(TOR_HTML.match(/<script>([\s\S]*)<\/script>/)[1]);
});

test('dodaj_klienta: domyślnie PROSTY, flagi do trKlientNowy, odpowiedź z id, linkiem i flagami', async () => {
  const calls = [];
  const api = async (fn, ...a) => { calls.push([fn, ...a]); const f = a[0];
    return { id: 'ola-k', name: 'Ola K.', on: true, mode: f.mode, scale: f.scale || 'RPE', swap: f.swap || 'NIE', masters: f.masters, extra: f.extra || 0, pain: !!f.pain,
      oly: f.oly === undefined ? 5 : f.oly, own: f.own !== false, edit: !!f.edit, link: 'https://x/?k=kabcdef12345' }; };
  const r = await run('dodaj_klienta', { imie: ' Ola K. ' }, api);
  assert.deepEqual(calls[0], ['trKlientNowy', { imie: 'Ola K.', mode: 'PROSTY', masters: false }]);
  assert.equal(r.klient_id, 'ola-k'); assert.equal(r.link, 'https://x/?k=kabcdef12345');
  assert.deepEqual(r.flagi, { tryb: 'PROSTY', dod_serie: 0, masters: false, zamiana: 'NIE', skala: 'RPE', bol: false, sufit_oly: 5, wlasne: true, edycja: false, aktywny: true });
  await run('dodaj_klienta', { imie: 'Jan', klient_id: 'jan-2', tryb: 'pro', dod_serie: 2, masters: true, zamiana: 'DOWOLNA', skala: 'RIR', bol: true, sufit_oly: 0, wlasne: false, edycja: true }, api);
  assert.deepEqual(calls[1], ['trKlientNowy', { imie: 'Jan', id: 'jan-2', mode: 'PRO', extra: 2, masters: true, swap: 'DOWOLNA', scale: 'RIR', pain: true, oly: 0, own: false, edit: true }]);
  await assert.rejects(run('dodaj_klienta', {}, api), /imie/);
  await assert.rejects(run('dodaj_klienta', { imie: 'A', zamiana: 'TAK' }, api), /Zamiana/);
  await assert.rejects(run('dodaj_klienta', { imie: 'A', dod_serie: 9 }, api), /Dodatkowe serie/);
  await assert.rejects(run('dodaj_klienta', { imie: 'A', sufit_oly: -1 }, api), /Sufit/);
  assert.equal(calls.length, 2, 'błędne dane nie idą do serwera');
  calls.forEach(c => assert.ok(ZAPIS.includes(c[0]), c[0]));
  assert.ok(TOOLS.find(t => t.name === 'dodaj_klienta').inputSchema.required.includes('imie'));
});

test('pakiet: dodaj (domyślnie) / ustaw przez trPakiet, ile zostało, walidacja', async () => {
  const calls = [];
  const api = async (fn, ...a) => { calls.push([fn, ...a]); if (a[0] === 'nikt') throw new Error('Nie ma klienta „nikt”.');
    return { n: 10, left: 6, used: 4, from: '2026-11-01', to: '2026-12-31', prev: a[1].mode === 'ustaw' ? 4 : null }; };
  const r = await run('pakiet', { id: 'Maciek', treningi: 2 }, api);
  assert.deepEqual(calls[0], ['trPakiet', 'maciek', { mode: 'dodaj', n: 2 }]);
  assert.equal(r.zostalo, 6); assert.equal(r.bylo, undefined, 'bez pakietu przed = brak „bylo”');
  const u = await run('pakiet', { id: 'maciek', treningi: 6, tryb: 'ustaw', notatka: 'gotówka', data: '2026-11-27' }, api);
  assert.deepEqual(calls[1], ['trPakiet', 'maciek', { mode: 'ustaw', n: 6, note: 'gotówka', date: '2026-11-27' }]);
  assert.equal(u.bylo, 4); assert.equal(u.zostalo, 6); assert.equal(u.klient_widzi, 'nie');
  await run('pakiet', { id: 'maciek', treningi: 2, widoczny: true }, api);
  assert.deepEqual(calls[2], ['trPakiet', 'maciek', { mode: 'dodaj', n: 2, show: true }]);
  for (const t of [0, -2, 1.5]) await assert.rejects(run('pakiet', { id: 'maciek', treningi: t }, api), /Liczba treningów/);
  await assert.rejects(run('pakiet', { id: 'maciek', treningi: 1, tryb: 'zabierz' }, api), /Tryb/);
  await assert.rejects(run('pakiet', { id: 'nikt', treningi: 1 }, api), /Nie ma klienta/);
  calls.forEach(c => assert.ok(ZAPIS.includes(c[0]), c[0]));
});

test('trening prowadzony: start, ćwiczenie (drabinka), serie w planie, zakończenie, przeniesienie; P oznaczone w kalendarzu, karcie i jednostce', async () => {
  const calls = [];
  const api = async (fn, ...a) => { calls.push([fn, ...a]);
    if (fn === 'trProwadzonyStart') return { week: 3, day: 'P2', date: '2026-11-27', title: 'Trening z trenerem', made: !!a[1].ex, name: 'Maciek', cwiczenia: a[1].ex ? ['1 Z-Press: 30×12'] : undefined, ostrzezenia: [] };
    if (fn === 'trProwadzonyCw') return { week: 3, day: 'P2', cwiczenia: ['2 Front Squat: 30×9, 30×8', '3 Push-Up: 1, 2'], ostrzezenia: ['Pompki X: nie ma w bazie ćwiczeń, więc brak filmu i partii'] };
    if (fn === 'trSerie') return { n: 4, cwiczenia: ['1 Przysiad: 80×5 🟢, 80×5 🟢'] };
    if (fn === 'trZakoncz') return { week: 3, day: 'P2', name: 'Maciek', led: true, feel: 4, rpe: 9, minutes: 50, pain: '', pkg: { before: 1, after: 0, on: true }, warn: [] };
    if (fn === 'trZPlanu') return { week: 1, from: 'S1', day: 'P1', rows: 3, closed: true, pkg: { before: 2, after: 1 }, name: 'Maciek' };
  };
  const st = await run('prowadzony_start', { id: 'Maciek' }, api);
  assert.deepEqual(calls[0], ['trProwadzonyStart', 'maciek', {}]);
  assert.equal(st.jednostka, 'P2'); assert.equal(st.tydzien, 3); assert.match(st.nowa, /otwarta/); assert.match(st.podglad, /#k\/maciek\/sesje$/);
  const st2 = await run('prowadzony_start', { id: 'maciek', cwiczenia: [{ cwiczenie: 'Z-Press', serie: [{ kg: '30', powt: '12' }] }] }, api);
  assert.deepEqual(calls[1][2].ex, [{ cwiczenie: 'Z-Press', serie: [{ kg: '30', powt: '12' }] }]); assert.equal(st2.nowa, 'tak');
  const lad = [9, 8].map(p => ({ kg: 30, powt: p })), pu = [1, 2].map(p => ({ powt: p, swiatlo: 'lekko' }));
  const cw = await run('prowadzony_cwiczenie', { id: 'maciek', tydzien: 3, jednostka: 'P2', cwiczenia: [{ cwiczenie: 'Front Squat', obwod: 'A', serie: lad }, { cwiczenie: 'Push-Up', obwod: 'A', serie: pu }] }, api);
  assert.deepEqual(calls[2], ['trProwadzonyCw', 'maciek', { week: 3, day: 'P2', ex: [
    { cwiczenie: 'Front Squat', obwod: 'A', serie: [{ kg: '30', powt: '9' }, { kg: '30', powt: '8' }] },
    { cwiczenie: 'Push-Up', obwod: 'A', serie: [{ powt: '1', swiatlo: 'lekko' }, { powt: '2', swiatlo: 'lekko' }] }] }]);
  assert.equal(cw.cwiczenia.length, 2); assert.equal(cw.ostrzezenia.length, 1);
  await assert.rejects(run('zapisz_serie', { id: 'maciek', tydzien: 3, jednostka: 'S1' }, api), /serie/);
  const zs = await run('zapisz_serie', { id: 'maciek', tydzien: 3, jednostka: 'S1', wszystkie_wg_planu: true, serie: [{ nr: 1, seria: '2', swiatlo: 'ciezko' }] }, api);
  assert.deepEqual(calls[3], ['trSerie', 'maciek', { week: 3, day: 'S1', sets: [{ nr: 1, seria: '2', swiatlo: 'ciezko' }], all: true }]); assert.equal(zs.serii, 4);
  const z = await run('zakoncz_jednostke', { id: 'maciek', tydzien: 3, jednostka: 'P2', samopoczucie: 4, rpe_sesji: 9 }, api);
  assert.deepEqual(calls[4], ['trZakoncz', 'maciek', { week: 3, day: 'P2', samopoczucie: 4, rpe_sesji: 9 }], 'bez zdejmij_z_pakietu: serwer bierze domyślne (tak)');
  assert.equal(z.pakiet, 'było 1 → zostało 0'); assert.match(z.rodzaj, /prowadzony/);
  await run('zakoncz_jednostke', { id: 'maciek', tydzien: 3, jednostka: 'S1', zdejmij_z_pakietu: false }, api);
  assert.equal(calls[5][2].pkg, false);
  const m = await run('prowadzony_z_planu', { id: 'maciek', tydzien: 1, jednostka: 'S1' }, api);
  assert.equal(m.jest, 'P1'); assert.equal(m.pakiet, 'było 2 → zostało 1');
  calls.forEach(c => assert.ok(ZAPIS.includes(c[0]), c[0]));
  ['prowadzony_start', 'prowadzony_cwiczenie', 'zapisz_serie', 'zakoncz_jednostke', 'prowadzony_z_planu'].forEach(n => {
    const t = TOOLS.find(x => x.name === n); assert.ok(t, n); assert.match(t.description, /wyraźną prośbę trenera/);
    assert.equal(t.annotations.readOnlyHint, false); assert.equal(t.annotations.destructiveHint, false);
  });
  ['prowadzony_cwiczenie', 'zapisz_serie'].forEach(n => assert.equal(TOOLS.find(x => x.name === n).annotations.idempotentHint, true));
  // oznaczenie P: kalendarz, jednostka, karta (nie w „nadchodzących” planu)
  const kal = kalendarz({ from: '2026-11-24', to: '2026-11-30', units: [{ date: '2026-11-27', name: 'Maciek', id: 'maciek', week: 3, day: 'P2', st: 'done', prow: true, led: true, ex: 2, done: 10, sets: 10 }] });
  assert.match(kal.jednostki[0].rodzaj, /prowadzony/);
  const d = { cfg: { id: 'maciek', name: 'Maciek' }, plan: [{ week: 3, day: 'P2', order: 1, name: 'Z-Press', sets: 4, reps: '12,12,9,8', date: '2026-11-28', led: true, title: 'Trening z trenerem' }], logs: [], sessions: [] };
  assert.match(jednostka(d, 3, 'P2').rodzaj, /prowadzony/);
  assert.equal(klient(d, { today: '2026-11-27' }).nadchodzace_jednostki, undefined, 'P nie jest nadchodzącą jednostką planu');
});
