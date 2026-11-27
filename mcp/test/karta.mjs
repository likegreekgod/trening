// Karta „Dziś” w atrapie gospodarza (Playwright): uzgodnienie ui/initialize, wynik narzędzia, Zatwierdź / Odrzuć → tools/call, zrzuty jasny/ciemny.
// Uruchom: node test/karta.mjs [katalog_na_zrzuty]   (potrzebny Playwright z przeglądarką; nie jest częścią npm test)
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { DZIS_HTML } from '../src/ui.js';
import { dzis } from '../src/tools.js';
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
  if (m.method === 'ui/notifications/size-changed') f.style.height = m.params.height + 'px';
  if (m.method === 'tools/call') reply(m.params.arguments.pid === 'olek|z|2' ? { content: [{ type: 'text', text: 'Nie ma już tej propozycji.' }], isError: true } : { content: [{ type: 'text', text: '{}' }], structuredContent: { zapisano: true } });
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
await browser.close();
console.log('karta Dziś: ok');
