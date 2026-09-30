// Test interfejsu: web/ serwowane lokalnie, API Apps Script podmienione atrapą (page.route).
const test = require('node:test'), assert = require('node:assert');
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const WEB = path.join(__dirname, '..', 'web');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const DATA = {
  cfg: { name: 'Robert', pain: false, simple: true, extra: 1 },
  plan: [
    { week: 1, day: 'T1', title: 'FBW A', date: '2026-10-06', order: 1, name: 'Wyciskanie sztangi na ławce płaskiej', prio: 'A', sets: 3, reps: '6–8', pct: null, kg: 50, rpe: 8, note: '', extra: null, drop: 0 },
    { week: 1, day: 'T1', title: 'FBW A', date: '2026-10-06', order: 2, name: 'Zarzut i podrzut', prio: 'A', sets: 2, reps: '1+1', pct: 0.7, kg: 70, rpe: '', note: '', extra: 0, drop: 0 }
  ],
  logs: [], sessions: []
};

let server, base, browser;
test.before(async () => {
  server = http.createServer((req, res) => {
    const p = path.join(WEB, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'text/plain' }); res.end(b); });
  }).listen(0);
  base = 'http://localhost:' + server.address().port + '/';
  browser = await chromium.launch();
});
test.after(async () => { await browser.close(); server.close(); });

async function page(calls, offline) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/macros/**', async r => {
    if (offline) return r.abort();
    const b = JSON.parse(r.request().postData() || '{}'); calls.push(b);
    await r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, result: b.fn === 'getData' ? DATA : { ok: true } }) });
  });
  const p = await ctx.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  return { ctx, p };
}

test('bez klucza: komunikat o linku od trenera', async () => {
  const { ctx, p } = await page([]);
  await p.goto(base); await p.waitForTimeout(300);
  assert.match(await p.textContent('#main'), /linku od trenera/);
  await ctx.close();
});

test('z kluczem: plan, tryb prosty, kompleks 1+1 = 2, zapis serii przez API', async () => {
  const calls = [];
  const { ctx, p } = await page(calls);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  assert.equal(await p.textContent('#title'), 'Trening · Robert');
  assert.equal(await p.inputValue('.set[data-o="2"][data-s="1"] .reps'), '2');
  assert.ok(await p.$('[data-extra="1"]'));                      // limit z cfg.extra
  assert.equal(await p.$('[data-extra="2"]'), null);             // plan dod_serie = 0 blokuje
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.waitForTimeout(200);
  const ls = calls.find(c => c.fn === 'logSet');
  assert.equal(ls.key, 'kabc'); assert.equal(ls.args[0].set, 1);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('offline: po wcześniejszym otwarciu plan z pamięci telefonu', async () => {
  const { ctx, p } = await page([]);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await ctx.unroute('**/macros/**'); await ctx.route('**/macros/**', r => r.abort());
  await p.goto(base); await p.waitForSelector('.set[data-o="1"]');          // bez ?k= – klucz z pamięci
  assert.match(await p.textContent('#sync'), /offline/);
  await ctx.close();
});

test('PWA: manifest i service worker', async () => {
  const { ctx, p } = await page([]);
  await p.goto(base + '?k=kabc'); await p.waitForTimeout(500);
  const m = await p.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  assert.equal(m.display, 'standalone'); assert.ok(m.icons.some(i => i.sizes === '512x512'));
  assert.ok(await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
  await ctx.close();
});
