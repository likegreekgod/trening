// Karta „Dziś” w atrapie gospodarza (Playwright): uzgodnienie ui/initialize, wynik narzędzia, Zatwierdź / Odrzuć → tools/call, zrzuty jasny/ciemny.
// Uruchom: node test/karta.mjs [katalog_na_zrzuty]   (potrzebny Playwright z przeglądarką; nie jest częścią npm test)
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { DZIS_HTML, KLIENT_HTML, FILM_HTML, TOR_HTML } from '../src/ui.js';
import { readFileSync } from 'node:fs';
import { dzis, klient, tor } from '../src/tools.js';
const { chromium } = createRequire(import.meta.url)('playwright');

const out = process.argv[2] || '.';
const PULPIT = {
  today: '2026-11-27', at: '2026-11-27T06:00:00Z',
  clients: [{ id: 'ania', name: 'Ania', signals: [{ lv: 'bad', t: 'ból kolana 5/10' }], filmsNew: 3 }, { id: 'olek', name: 'Olek', signals: [{ lv: 'warn', t: 'brak treningu od 12 dni' }], filmsNew: 0 }],
  dzis: [{ id: 'ania', name: 'Ania', week: 3, day: 'B', title: 'Dół', st: 'live', sets: 16, done: 5 }, { id: 'olek', name: 'Olek', week: 2, day: 'A', title: 'Góra', st: 'wait', sets: 12, done: 0 },
    { id: 'ewa', name: 'Ewa', week: 1, day: 'T2', title: 'TP1', st: 'done', sets: 19, done: 19, rpe: 3, min: 50 }],
  agent: [{ pid: 'ania|p|1', name: 'Ania', at: '2026-11-27', zgl: false, text: 'ciężar Przysiad: 80 → 82,5 kg', why: 'same 🟢 w zeszłym tygodniu' },
    { pid: 'olek|z|2', name: 'Olek', at: '2026-11-26', zgl: true, pilne: true, text: 'ból barku przy wyciskaniu', why: '' }],
  agentAuto: [{ pid: 'ania|a|9', name: 'Ania', at: '2026-11-26T18:00:00Z', text: 'skrócony trening Dół: Wykroki pominięte', why: 'brak czasu' }],
  blocks: [{ id: 'olek', name: 'Olek', block: 'B1', to: '2026-11-25' }], replies: [{ id: 'ania', name: 'Ania', at: '2026-11-26', title: 'x', kom: 'y', text: 'ok' }],
};
const data = dzis(PULPIT);

const HOST = `<!doctype html><body style="margin:0;background:BG"><iframe id="f" sandbox="allow-scripts" style="width:100%;border:0;height:300px"></iframe><script>
const f = document.getElementById('f'); window.LOG = []; window.CTX = CTXJSON;
window.addEventListener('message', e => { const m = e.data; if (e.source !== f.contentWindow || !m) return; LOG.push(m);
  const reply = r => f.contentWindow.postMessage({ jsonrpc: '2.0', id: m.id, result: r }, '*');
  if (m.method === 'ui/initialize') reply({ protocolVersion: '2026-01-26', hostInfo: { name: 'atrapa', version: '1' }, hostCapabilities: {}, hostContext: CTX });
  if (m.method === 'ui/notifications/initialized') f.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [{ type: 'text', text: 'x' }], structuredContent: DATA } }, '*');
  if (m.method === 'ui/open-link' || m.method === 'ui/message') reply({});
  if (m.method === 'ui/notifications/size-changed') f.style.height = m.params.height + 'px';
  if (m.method === 'tools/call' && m.params.name === 'klatki_zapisz') reply({ content: [{ type: 'text', text: '{}' }], structuredContent: { klatki_id: 'c'.repeat(32), ile: m.params.arguments.klatki.length } });
  else if (m.method === 'tools/call' && m.params.name === 'komentarz_filmu') reply({ content: [{ type: 'text', text: '{}' }], structuredContent: { zapisano: true } });
  else if (m.method === 'tools/call') reply(m.params.arguments.pid === 'olek|z|2' ? { content: [{ type: 'text', text: 'Nie ma już tej propozycji.' }], isError: true } : { content: [{ type: 'text', text: '{}' }], structuredContent: { zapisano: true } });
});
f.srcdoc = HTML;
</script>`;

const browser = await chromium.launch();
for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 640, height: 900 }, colorScheme: theme });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.setContent(HOST.replace('BG', theme === 'dark' ? '#262624' : '#faf9f5').replace('CTXJSON', JSON.stringify({ theme, locale: 'pl-PL' }))
    .replace('DATA', JSON.stringify(data)).replace('HTML', () => JSON.stringify(DZIS_HTML).replace(/</g, '\\u003c')));
  const fr = page.frameLocator('#f');
  await fr.getByText('Dziś trenują').waitFor();
  await fr.getByText('ciężar Przysiad: 80 → 82,5 kg').waitFor();
  if (theme === 'light') {
    await fr.getByRole('button', { name: '✓ Zatwierdź' }).click();
    await fr.getByText('✓ Zatwierdzone, plan zmieniony').waitFor();
    await fr.getByRole('button', { name: '✓ Przeczytane' }).click();
    await fr.getByText('Nie ma już tej propozycji.').waitFor();
    await fr.getByRole('button', { name: '↶ Cofnij' }).click();
    await fr.getByText('↶ Cofnięte').waitFor();
    const calls = (await page.evaluate(() => LOG)).filter(m => m.method === 'tools/call').map(m => m.params);
    assert.deepEqual(calls, [{ name: 'decyzja_asystent', arguments: { pid: 'ania|p|1', decyzja: 'tak' } }, { name: 'decyzja_asystent', arguments: { pid: 'olek|z|2', decyzja: 'czytane' } },
      { name: 'decyzja_asystent', arguments: { pid: 'ania|a|9', decyzja: 'cofnij' } }]);
    const log = await page.evaluate(() => LOG.map(m => m.method).filter(Boolean));
    assert.equal(log[0], 'ui/initialize'); assert.equal(log[1], 'ui/notifications/initialized');
  }
  await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/karta-dzis-' + theme + '.png', fullPage: true });
  assert.deepEqual(errs, []);
  await page.close();
}
// Odrzuć: najpierw pole na powód, bez powodu nie wysyła
{
  const page = await browser.newPage({ viewport: { width: 380, height: 900 } });
  await page.setContent(HOST.replace('BG', '#fff').replace('CTXJSON', '{}').replace('DATA', JSON.stringify(data)).replace('HTML', () => JSON.stringify(DZIS_HTML).replace(/</g, '\\u003c')));
  const fr = page.frameLocator('#f');
  await fr.getByRole('button', { name: '✕ Odrzuć' }).click();
  await fr.getByRole('button', { name: 'Odrzuć z powodem' }).click();
  await fr.getByText('Wpisz powód').waitFor();
  await fr.locator('textarea').fill('Za wcześnie, najpierw technika');
  await fr.locator('input[type=checkbox]').check();
  await fr.getByRole('button', { name: 'Odrzuć z powodem' }).click();
  await fr.getByText('✕ Odrzucone').waitFor();
  const calls = (await page.evaluate(() => LOG)).filter(m => m.method === 'tools/call').map(m => m.params.arguments);
  assert.deepEqual(calls, [{ pid: 'ania|p|1', decyzja: 'nie', powod: 'Za wcześnie, najpierw technika', zasada: true }]);
  await page.screenshot({ path: out + '/karta-dzis-telefon.png', fullPage: true });
  await page.close();
}
// Karta klienta: dane syntetyczne, zrzuty, przyciski → ui/open-link do panelu
{
  const L = (w, n, ex, kg, reps, rpe, x) => Object.assign({ tydzien: w, jednostka: x && x.j || 'A', nr_cw: n, cwiczenie: ex, seria: String(x && x.s || 1), kg, powt: reps, rpe, wykonane: 'TAK',
    data: x && x.d || '2026-11-01' }, x || {});
  const logs = [];
  [[2, 85], [3, 87.5], [4, 87.5], [5, 90], [6, 92.5], [7, 92.5], [8, 95], [9, 95]].forEach(([w, kg], i) => {
    logs.push(L(w, 1, 'Przysiad', kg, 5, [7, 8, 8, 8, 8, 7, 8, 9][i]), L(w, 3, 'Martwy ciąg', kg + 20, 3, 8), L(w, 2, 'Wyciskanie leżąc', 47.5 + (i % 2) * 2.5, 6, 8));
  });
  logs.push(L(9, 1, 'Przysiad', 95, 5, 8, { s: 2, d: '2026-11-25', j: 'A', film_link: 'https://x' }), L(9, 1, 'Przysiad', 95, 5, 9, { s: 3, d: '2026-11-25', j: 'A', uwagi: 'kolano przy 3. serii' }));
  logs.forEach(l => { if (l.tydzien === 9) { l.j = 'A'; l.data = '2026-11-25'; } });
  const P = (w, j, t, date, rows) => rows.map((r, i) => Object.assign({ week: w, day: j, title: t, date, block: 'B3', order: i + 1, prio: 'A' }, r));
  const K = {
    cfg: { id: 'ola', name: 'Ola', simple: false },
    plan: [].concat(
      P(9, 'A', 'Dół A', '2026-11-25', [{ name: 'Przysiad', sets: 4, reps: '5', kg: 95, rpe: 8 }]),
      P(9, 'B', 'Góra', '2026-11-23', [{ name: 'Wyciskanie leżąc', sets: 3, reps: '6', kg: 50 }]),
      P(9, 'C', 'Dół B', '2026-11-28', [{ name: 'Martwy ciąg', sets: 3, reps: '3', kg: 117.5, rpe: 8, unote: 'Pas dopiero od 2. serii' }, { name: 'Przysiad bułgarski', prio: 'B', sets: 3, reps: '8/str', kg: 12 }, { name: 'Plank', prio: 'K', sets: 3, reps: '40 s', kg: 'BW' }]),
      P(10, 'A', 'Dół A', '2026-12-02', [{ name: 'Przysiad', sets: 4, reps: '5', kg: 97.5, rpe: 8 }, { name: 'Wykroki', prio: 'B', sets: 3, reps: '10', kg: 16 }]),
      P(12, 'A', 'Dół A', '2026-12-16', [{ name: 'Przysiad', sets: 3, reps: '3', kg: 102.5 }])),
    logs,
    sessions: [{ tydzien: 9, jednostka: 'A', start: '2026-11-25T17:00:00', rpe_sesji: 8, bol_max: 4, bol: 'kolano L:4', uwagi: 'kolano przy 3. serii' },
      { tydzien: 9, jednostka: 'B', start: '2026-11-23T10:00:00', rpe_sesji: 7 }, { tydzien: 8, jednostka: 'A', start: '2026-11-18T17:00:00', rpe_sesji: 8 }],
    readiness: [{ data: '2026-11-26', werdykt: 'Uwaga' }],
    summary: [{ week: '2026-11-17', ton: 13400, status: '🟢 OK' }, { week: '2026-11-24', ton: 14200, status: '🟢 OK' }],
    pkg: { n: 10, left: 2, to: '2026-12-31' },
  };
  const kd = klient(K, { today: '2026-11-27' });
  for (const [theme, w] of [['light', 640], ['dark', 640], ['telefon', 380]]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 }, colorScheme: theme === 'dark' ? 'dark' : 'light' });
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.setContent(HOST.replace('BG', theme === 'dark' ? '#262624' : '#faf9f5').replace('CTXJSON', JSON.stringify({ theme: theme === 'dark' ? 'dark' : 'light' }))
      .replace('DATA', JSON.stringify(kd)).replace('HTML', () => JSON.stringify(KLIENT_HTML).replace(/</g, '\\u003c')));
    const fr = page.frameLocator('#f');
    await fr.getByText('Siła (e1RM)').waitFor();
    await fr.getByText('Najbliższe w planie').waitFor();
    if (theme === 'light') {
      await fr.getByRole('button', { name: '▶ Prowadź' }).click();
      await fr.getByRole('button', { name: 'Otwórz w panelu ›' }).click();
      await page.waitForTimeout(100);
      const links = (await page.evaluate(() => LOG)).filter(m => m.method === 'ui/open-link').map(m => m.params.url);
      assert.deepEqual(links, ['https://likegreekgod.github.io/trening/trener.html#prowadz/ola', 'https://likegreekgod.github.io/trening/trener.html#k/ola/przeglad']);
    }
    await page.waitForTimeout(200);
    await page.screenshot({ path: out + '/karta-klient-' + theme + '.png', fullPage: true });
    assert.deepEqual(errs, []);
    await page.close();
  }
}
// Karta filmu: syntetyczny film przez atrapę pośrednika (CORS), klatki → klatki_zapisz → ui/message, komentarz
{
  const webm = readFileSync(new URL('../../tests/fixtures/film.webm', import.meta.url));
  const fd = { ref: 'ola|9|A|1|4', klient: 'Ola', data: '2026-11-25', cwiczenie: 'Przysiad', seria: '4', wykonanie: '95×5 🔴', uwagi_klienta: 'kolano przy 3. serii', _ui: { src: 'https://p.example/film/' + 'd'.repeat(32) } };
  for (const [theme, w] of [['light', 640], ['dark', 640], ['telefon', 380]]) {
    const page = await browser.newPage({ viewport: { width: w, height: 1000 }, colorScheme: theme === 'dark' ? 'dark' : 'light' });
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.route('https://p.example/**', r => {           // jak Dysk przez pośrednika: Range → 206
      const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers().range || ''), H = { 'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes' };
      if (!m) return r.fulfill({ status: 200, body: webm, headers: H });
      const a = +m[1], b = m[2] ? +m[2] : webm.length - 1;
      return r.fulfill({ status: 206, body: webm.subarray(a, b + 1), headers: Object.assign(H, { 'Content-Range': 'bytes ' + a + '-' + b + '/' + webm.length }) });
    });
    await page.setContent(HOST.replace('BG', theme === 'dark' ? '#262624' : '#faf9f5').replace('CTXJSON', JSON.stringify({ theme: theme === 'dark' ? 'dark' : 'light' }))
      .replace('DATA', JSON.stringify(fd)).replace('HTML', () => JSON.stringify(FILM_HTML).replace(/</g, '\\u003c')));
    const fr = page.frameLocator('#f');
    await fr.getByText('Ola · Przysiad · seria 4').waitFor();
    await fr.locator('video').evaluate(v => new Promise(ok => (v.readyState >= 1 ? ok() : v.addEventListener('loadedmetadata', ok))));
    if (theme !== 'dark') {
      await fr.getByRole('button', { name: '⇤ Początek tu' }).click();
      await fr.getByRole('button', { name: /Pokaż Claude/ }).click();
      await fr.getByText('✓ Klatki są u Claude').waitFor({ timeout: 20000 });
      assert.equal(await fr.locator('.fr img').count(), 8);
    }
    if (theme === 'light') {
      const log = await page.evaluate(() => LOG);
      const z = log.find(m => m.params && m.params.name === 'klatki_zapisz').params.arguments;
      assert.equal(z.ref, 'ola|9|A|1|4'); assert.equal(z.klatki.length, 8); assert.match(z.klatki[0].jpg, /^\/9j\//, 'JPEG');
      assert.ok(new Set(z.klatki.map(k => k.jpg)).size >= 6, 'klatki z różnych chwil');
      const um = log.find(m => m.method === 'ui/message');
      assert.match(um.params.content.text, new RegExp('klatkach ' + 'c'.repeat(32)));
      await fr.locator('textarea').fill('kolano do środka');
      await fr.getByRole('button', { name: '⏱ Wstaw chwilę' }).click();
      await fr.getByRole('button', { name: 'Zapisz komentarz' }).click();
      await fr.getByText('✓ Zapisane').waitFor();
      const k = (await page.evaluate(() => LOG)).filter(m => m.params && m.params.name === 'komentarz_filmu').map(m => m.params.arguments);
      assert.equal(k.length, 1); assert.match(k[0].tekst, /^\d:\d\d,\d kolano do środka$/);
    }
    await page.waitForTimeout(200);
    await page.screenshot({ path: out + '/karta-film-' + theme + '.png', fullPage: true });
    assert.deepEqual(errs, []);
    await page.close();
  }
}
// Karta toru sztangi: wykres najlepszej serii dnia, nałożone tory, serie z wnioskami (dane syntetyczne)
{
  const logs = [['2026-10-27', 78, 0.52, 4], ['2026-11-03', 80, 0.55, 3.2], ['2026-11-10', 82, 0.57, 2.4], ['2026-11-17', 84, 0.61, 1.5]].map(([data, kg, v, w], i) => ({
    tydzien: 6 + i, jednostka: 'A', data, nr_cw: 1, cwiczenie: 'Przysiad', seria: 2, kg, powt: 5, vbt_ms: v, vbt_peak: v + 0.4, wysokosc_cm: 58,
    sciezka: JSON.stringify(Array.from({ length: 24 }, (_, k) => [Math.round(Math.sin(k / 7.6 * Math.PI / 2) * w * 10) / 10, k * 2.5])), notatka_trenera: i === 3 ? 'Kolana mniej do środka, tor prosty.' : '' }));
  const td = tor({ cfg: { name: 'Ola' }, logs }, 'Przysiad');
  for (const [theme, w] of [['light', 640], ['dark', 640], ['telefon', 380]]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 }, colorScheme: theme === 'dark' ? 'dark' : 'light' });
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.setContent(HOST.replace('BG', theme === 'dark' ? '#262624' : '#faf9f5').replace('CTXJSON', JSON.stringify({ theme: theme === 'dark' ? 'dark' : 'light' }))
      .replace('DATA', JSON.stringify(td)).replace('HTML', () => JSON.stringify(TOR_HTML).replace(/</g, '\\u003c')));
    const fr = page.frameLocator('#f');
    await fr.getByText('Najlepsza seria dnia').waitFor();
    assert.equal(await fr.locator('svg path').count(), 4);
    await fr.getByText('Kolana mniej do środka, tor prosty.', { exact: false }).waitFor();
    await page.waitForTimeout(200);
    await page.screenshot({ path: out + '/karta-tor-' + theme + '.png', fullPage: true });
    assert.deepEqual(errs, []);
    await page.close();
  }
}
await browser.close();
console.log('karty Dziś, klient, film i tor: ok');
