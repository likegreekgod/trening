// Testy pośrednika MCP (czyste funkcje, dane syntetyczne): node --test mcp/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, run, dzis, klient, jednostka, kalendarz, setTxt, light, ZAPIS } from '../src/tools.js';
import { handle, handleBody, VERSIONS } from '../src/mcp.js';
import { UI_DZIS } from '../src/ui.js';

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

test('karty MCP Apps: zasób ui:// z kartą Dziś, narzędzie „dzis” wskazuje kartę', async () => {
  const ctx = { api: async () => PULPIT, today: '2026-11-27' };
  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } }, ctx);
  assert.ok(init.result.capabilities.resources);
  const list = await handle({ jsonrpc: '2.0', id: 2, method: 'resources/list' }, ctx);
  assert.deepEqual(list.result.resources.map(r => [r.uri, r.mimeType]), [[UI_DZIS, 'text/html;profile=mcp-app']]);
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
