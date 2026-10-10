// Test interfejsu: web/ serwowane lokalnie, API Apps Script podmienione atrapą (page.route).
const test = require('node:test'), assert = require('node:assert');
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const WEB = path.join(__dirname, '..', 'web');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const SCREENS = path.join(__dirname, 'screens');   // zrzuty 390×844 do przejrzenia (poza repo, .gitignore)
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

async function page(calls, offline, opt = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: opt.scheme || 'light' });
  const data = opt.data || DATA;
  await ctx.route('**/macros/**', async r => {
    if (offline) return r.abort();
    const b = JSON.parse(r.request().postData() || '{}'); calls.push(b);
    await r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, result: b.fn === 'getData' ? data : { ok: true } }) });
  });
  const p = await ctx.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  p.external = []; p.on('request', q => { if (!q.url().startsWith(base) && !/\/macros\//.test(q.url())) p.external.push(q.url()); });
  return { ctx, p };
}
const PRO = Object.assign({}, DATA, { cfg: Object.assign({}, DATA.cfg, { simple: false }) });

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
  assert.equal(await p.title(), 'Trening – Robert');
  assert.equal(await p.textContent('#title'), 'FBW A');
  assert.match(await p.textContent('#eyebrow'), /Tydz\. 1 · T1 · wt 06\.10/);
  assert.equal(await p.inputValue('.set[data-o="2"][data-s="1"] .reps'), '2');
  assert.ok(await p.$('[data-extra="1"]'));                      // limit z cfg.extra
  assert.equal(await p.$('[data-extra="2"]'), null);             // plan dod_serie = 0 blokuje
  assert.equal(await p.textContent('#st-sets'), '0/5');
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.waitForTimeout(200);
  const ls = calls.find(c => c.fn === 'logSet');
  assert.equal(ls.key, 'kabc'); assert.equal(ls.args[0].set, 1);
  assert.equal(await p.textContent('#st-sets'), '1/5');
  assert.equal(await p.textContent('#st-ton'), '300');           // 50 kg × 6
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

// plan z blokiem B2 (tygodnie 7–8, tydz. 8 lżejszy), tydz. 7 T1 zrobiona
const ROW = (week, day, date, order, kg) => ({ week, day, title: 'Siła ' + day, date, order, name: 'Przysiad ' + order, prio: 'A', sets: 4, reps: '5', pct: null, kg, rpe: 8, note: '', extra: null, drop: 0, block: 'B2', group: '', swaps: [] });
const PLANNED = Object.assign({}, PRO, {
  plan: [ROW(7, 'T1', '2026-10-05', 1, 100), ROW(7, 'T2', '2026-10-07', 1, 100), ROW(7, 'T2', '2026-10-07', 2, 80),
    ROW(8, 'T1', '2026-10-12', 1, 60), ROW(8, 'T2', '2026-10-14', 1, 60)],
  sessions: [{ id: 'robert|7|T1', tydzien: 7, jednostka: 'T1', samopoczucie: 4, czas_min: 60 }]
});

test('Plan: dolne menu, tygodnie bloku, lżejszy tydzień, przejście do treningu', async () => {
  const { ctx, p } = await page([], false, { data: PLANNED });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="plan"]'); await p.waitForSelector('.unit');
  assert.equal(await p.getAttribute('#nav [data-tab="plan"]', 'aria-current'), 'page');
  assert.deepEqual(await p.$$eval('[data-pw]', bs => bs.map(b => b.textContent)), ['Tydz. 1B2', 'Tydz. 2B2 · lżejszy']);
  await p.click('[data-pw="7"]');
  assert.match(await p.textContent('#title'), /Blok B2 · tydz\. 1/);
  assert.equal(await p.$$eval('.unit', s => s.map(x => x.className).join()), 'unit done,unit ');
  assert.equal(await p.$('#u-7-T1 input[data-mv]'), null);                  // zrobionej nie przesuwamy
  await p.click('#u-7-T2 [data-go]'); await p.waitForSelector('#main:not([hidden]) .set');
  assert.match(await p.textContent('#eyebrow'), /Blok B2 · tydz\. 1 · T2/);
  assert.equal(await p.textContent('#st-sets'), '0/8');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Plan: zmiana daty jednostki i „przesuń też kolejne”, offline przez kolejkę', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: PLANNED });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="plan"]'); await p.click('[data-pw="7"]');
  await p.fill('#u-7-T2 input[data-mv]', '2026-10-08'); await p.waitForSelector('[data-shift]');
  assert.deepEqual(calls.filter(c => c.fn === 'przesunJednostke').map(c => c.args[0]), [[{ week: 7, day: 'T2', date: '2026-10-08' }]]);
  assert.match(await p.textContent('[data-shift]'), /\+1 dzień/);
  // bez sieci: kolejne jednostki przesunięte lokalnie i w kolejce
  await ctx.unroute('**/macros/**'); await ctx.route('**/macros/**', r => r.abort());
  await p.click('[data-shift]'); await p.waitForTimeout(200);
  const q = await p.evaluate(() => JSON.parse(localStorage.getItem('q_kabc')));
  assert.deepEqual(q.map(x => x.fn + ':' + x.payload.map(m => m.week + m.day + '→' + m.date).join(',')),
    ['przesunJednostke:8T1→2026-10-13,8T2→2026-10-15']);
  // po ponownym otwarciu (dane z pamięci + kolejka) nowe daty zostają
  await p.goto(base); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="plan"]'); await p.click('[data-pw="8"]');
  assert.deepEqual(await p.$$eval('.unit .dd b', b => b.map(x => x.textContent)), ['13', '15']);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// Pomost: tokeny jasny/ciemny, czcionki lokalne, etykiety ≥ 12 px, cele dotyku ≥ 44 px; zrzuty do tests/screens/
const BG = { light: 'rgb(237, 244, 242)', dark: 'rgb(15, 22, 18)' };
const a11y = p => p.evaluate(() => {
  const out = [], vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'); };
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e) || e.classList.contains('sr') || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 12) out.push('etykieta ' + fs + 'px: ' + e.textContent.trim().slice(0, 20));
  }
  for (const e of document.querySelectorAll('button, select, input:not([type=file]), textarea, label.btn, summary')) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.height < 44 - 0.5 || (e.tagName === 'BUTTON' && r.width < 44 - 0.5)) out.push('cel ' + Math.round(r.width) + '×' + Math.round(r.height) + ': ' + (e.className || e.tagName) + ' ' + (e.textContent || '').trim().slice(0, 15));
  }
  if (document.documentElement.scrollWidth > innerWidth) out.push('poziome przewijanie');
  return out;
});
for (const scheme of ['light', 'dark']) for (const [mode, data] of [['PROSTY', DATA], ['PRO', PLANNED]]) {
  test(`Pomost ${mode} ${scheme}: kolory, czcionki, rozmiary, zrzut`, async () => {
    const { ctx, p } = await page([], false, { scheme, data });
    await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
    await p.click('[data-warm="1"]');                                           // wiersz z ✕ też musi mieć cel 44 px
    await p.evaluate(() => document.fonts.ready);
    assert.equal(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), BG[scheme]);
    assert.ok(await p.evaluate(() => document.fonts.check('700 20px "Big Shoulders Display"') && document.fonts.check('16px "Instrument Sans"')
      && [...document.fonts].some(f => f.family.includes('Big Shoulders') && f.status === 'loaded')), 'czcionki z web/fonts');
    assert.deepEqual(await a11y(p), []);
    fs.mkdirSync(SCREENS, { recursive: true });
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: path.join(SCREENS, `${mode}-${scheme}.png`) });
    await p.screenshot({ path: path.join(SCREENS, `${mode}-${scheme}-cala.png`), fullPage: true });
    // ekran Plan
    await p.click('#nav [data-tab="plan"]'); await p.waitForSelector('.unit');
    await p.click('.unit details summary');
    assert.deepEqual(await a11y(p), [], 'Plan');
    await p.screenshot({ path: path.join(SCREENS, `${mode}-${scheme}-plan.png`) });
    assert.deepEqual(p.external, [], 'bez zapytań do zewnętrznych serwerów (Google Fonts itp.)');
    assert.deepEqual(p.errors, []);
    await ctx.close();
  });
}

test('offline: czcionki i lib.js z pamięci service workera', async () => {
  const { ctx, p } = await page([]);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.evaluate(() => navigator.serviceWorker.ready);
  const cached = await p.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).map(r => new URL(r.url).pathname); });
  for (const f of ['/lib.js', '/fonts/big-shoulders-display-latin-wght-normal.woff2', '/fonts/instrument-sans-latin-ext-wght-normal.woff2'])
    assert.ok(cached.includes(f), 'w pamięci: ' + f);
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
