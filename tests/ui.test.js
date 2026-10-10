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
    // stany do zrzutu: S1 ✓, S2 ✕, S3 drop
    await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.click('.set[data-o="1"][data-s="2"] .ok'); await p.click('.set[data-o="1"][data-s="2"] .ok');
    await p.click('.set[data-o="1"][data-s="3"] .nt');
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

// --- PR 4: serie ✓/✕, typ pod numerem, RPE/RIR, „Ostatnio”, kolor talerza ---
const lastSet = calls => calls.filter(c => c.fn === 'logSet').map(c => c.args[0]).pop();
const SERIES = Object.assign({}, PRO, {
  cfg: Object.assign({}, PRO.cfg, { scale: 'RIR' }),
  plan: [{ week: 2, day: 'T1', title: 'FBW A', date: '2026-10-13', order: 1, name: 'Przysiad', prio: 'A', sets: 3, reps: '5', pct: 0.7, kg: 70, rpe: 8, note: '', extra: 0, drop: 0, block: '', group: '', swaps: [] }],
  logs: [1, 2].map(s => ({ id: `robert|1|T1|1|${s}`, zapisano: '2026-10-06T10:00:00.000Z', cwiczenie: 'Przysiad', tydzien: 1, jednostka: 'T1', seria: s, kg: s === 1 ? 65 : 67.5, powt: 5, rpe: s === 1 ? 7 : 8.5, wykonane: 'TAK', typ: '' }))
});

test('Serie: ✓ → ✕ (FAIL) → puste, poprawka zapisanej serii zapisuje od razu', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: PRO });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  const row = '.set[data-o="1"][data-s="1"]';
  await p.click(row + ' .ok'); await p.waitForTimeout(100);
  assert.deepEqual((({ done, typ, rpe }) => ({ done, typ, rpe }))(lastSet(calls)), { done: true, typ: '', rpe: '' });
  await p.selectOption(row + ' .rpe', '8'); await p.waitForTimeout(100);
  assert.equal(lastSet(calls).rpe, '8');                                  // zmiana RPE po ✓ → nowy zapis
  await p.fill(row + ' .kg', '52,5'); await p.press(row + ' .kg', 'Tab'); await p.waitForTimeout(100);
  assert.equal(lastSet(calls).kg, 52.5);
  await p.click(row + ' .ok'); await p.waitForTimeout(100);
  assert.deepEqual((({ done, typ, rpe }) => ({ done, typ, rpe }))(lastSet(calls)), { done: true, typ: 'FAIL', rpe: '' });
  assert.equal(await p.textContent(row + ' .ok'), '✕');
  assert.equal(await p.$eval(row + ' .kg', e => getComputedStyle(e).textDecorationLine), 'line-through');
  await p.click(row + ' .ok'); await p.waitForTimeout(100);
  assert.deepEqual((({ done, typ }) => ({ done, typ }))(lastSet(calls)), { done: false, typ: '' });
  assert.equal(await p.getAttribute(row, 'data-st'), '');
  assert.equal(await p.$$eval('.rpe option', o => o.filter(x => /✗|Fail/.test(x.textContent)).length), 0);   // FAIL już nie w liście
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Serie: dotknięcie numeru zwykła → drop → nieudana, drop zapisuje typ DROP', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: PRO });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  const row = '.set[data-o="1"][data-s="2"]';
  await p.click(row + ' .nt'); await p.waitForTimeout(100);
  assert.equal(calls.filter(c => c.fn === 'logSet').length, 0);           // niezapisana: tylko zmiana typu
  assert.match(await p.textContent(row + ' .nt'), /S2/);
  assert.equal(await p.$eval(row, r => r.classList.contains('t-d')), true);
  await p.click(row + ' .ok'); await p.waitForTimeout(100);
  assert.equal(lastSet(calls).typ, 'DROP');
  await p.click(row + ' .nt'); await p.waitForTimeout(100);
  assert.deepEqual((({ done, typ }) => ({ done, typ }))(lastSet(calls)), { done: true, typ: 'FAIL' });
  await p.click(row + ' .nt'); await p.waitForTimeout(100);
  assert.deepEqual((({ done, typ }) => ({ done, typ }))(lastSet(calls)), { done: false, typ: '' });
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Serie: skala RIR z flagi klienta, przełącznik w nagłówku, „Ostatnio”, kolor talerza', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: SERIES });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  assert.match(await p.textContent('.rx'), /RIR ≥2/);
  assert.equal(await p.textContent('.set-head .lbl:nth-child(4)'), 'RIR');
  assert.deepEqual(await p.$$eval('.set[data-s="1"] .rpe option', o => o.map(x => x.textContent)), ['–', '0', '1', '2', '3', '4', '5+']);
  assert.ok(await p.$('.rx .zone.p10'));                                   // 70% → zielony talerz
  assert.equal((await p.textContent('.last')).trim(), 'Ostatnio: 67,5 kg × 5 · RIR 1,5');
  await p.selectOption('.set[data-s="1"] .rpe', '2'); await p.click('.set[data-s="1"] .ok'); await p.waitForTimeout(100);
  assert.equal(lastSet(calls).rpe, 8);                                    // arkusz dostaje RPE
  await p.click('[data-sc="RPE"]');
  assert.match(await p.textContent('.rx'), /RPE ≤8/);
  assert.equal(await p.$eval('.set[data-s="1"] .rpe', s => s.value), '8');
  assert.equal(await p.evaluate(() => localStorage.getItem('sc_kabc')), 'RPE');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Serie: bez sieci pole żółte, także po ponownym otwarciu', async () => {
  const { ctx, p } = await page([], false, { data: PRO });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await ctx.unroute('**/macros/**'); await ctx.route('**/macros/**', r => r.abort());
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.waitForTimeout(200);
  assert.equal(await p.$eval('.set[data-o="1"][data-s="1"] .ok', b => b.classList.contains('pend')), true);
  await p.goto(base); await p.waitForSelector('.set[data-o="1"]');
  assert.equal(await p.$eval('.set[data-o="1"][data-s="1"] .ok', b => b.classList.contains('pend')), true);
  assert.equal(await p.getAttribute('.set[data-o="1"][data-s="1"]', 'data-st'), 'ok');
  await ctx.close();
});

// --- PR 5: przerwa, Wake Lock, talerze ---
const KPLAN = Object.assign({}, PRO, { plan: PRO.plan.concat([{ week: 1, day: 'T1', title: 'FBW A', date: '2026-10-06', order: 3, name: 'Plank', prio: 'K', sets: 2, reps: '30 s', pct: null, kg: 'BW', rpe: '', note: '', extra: 0, drop: 0 }]) });

test('Przerwa: start po ✓ (A 2:00, K 1:00), ±15 s, Pomiń, koniec z wibracją; nie po rozgrzewce', async () => {
  const { ctx, p } = await page([], false, { data: KPLAN });
  await p.clock.install({ time: new Date('2026-10-06T16:00:00') });
  await p.addInitScript(() => { window.__vib = []; navigator.vibrate = v => { window.__vib.push(v); return true; }; });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.click('[data-warm="1"]'); await p.fill('.set[data-s="R1"] .kg', '20'); await p.click('.set[data-s="R1"] .ok');
  assert.equal(await p.isHidden('#rest'), true);                                  // rozgrzewka bez przerwy
  await p.click('.set[data-o="1"][data-s="1"] .ok');
  assert.equal(await p.isVisible('#rest'), true);
  assert.equal(await p.textContent('#rtime'), '2:00');
  assert.match(await p.textContent('#rlbl'), /Wyciskanie/);
  await p.click('[data-r="15"]'); assert.equal(await p.textContent('#rtime'), '2:15');
  await p.click('[data-r="-15"]'); await p.click('[data-r="-15"]'); assert.equal(await p.textContent('#rtime'), '1:45');
  await p.clock.runFor(30300); assert.equal(await p.textContent('#rtime'), '1:15');   // wyświetlacz odświeża się co 250 ms
  await p.click('.set[data-o="1"][data-s="1"] .ok');                             // ✓ → ✕: przerwa się nie restartuje
  assert.equal(await p.textContent('#rtime'), '1:15');
  await p.click('[data-r="0"]'); assert.equal(await p.isHidden('#rest'), true);
  await p.click('.set[data-o="3"][data-s="1"] .ok');                             // K → 1:00
  assert.equal(await p.textContent('#rtime'), '1:00');
  await p.clock.runFor(61000);
  assert.equal(await p.isHidden('#rest'), true);
  assert.deepEqual(await p.evaluate(() => window.__vib.filter(v => Array.isArray(v) && v[0] === 200).length), 1);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Wake Lock: ekran nie gaśnie od pierwszego wpisu do „Zakończ”', async () => {
  const { ctx, p } = await page([], false, { data: PRO });
  await p.addInitScript(() => {
    window.__wl = [];
    Object.defineProperty(navigator, 'wakeLock', { value: { request: async t => { window.__wl.push('request:' + t);
      return { release: async () => { window.__wl.push('release'); }, addEventListener() {} }; } } });
  });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  assert.deepEqual(await p.evaluate(() => window.__wl), []);
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.click('.set[data-o="1"][data-s="2"] .ok'); await p.waitForTimeout(100);
  assert.deepEqual(await p.evaluate(() => window.__wl), ['request:screen']);
  await p.click('#saveSess'); await p.waitForTimeout(200);
  assert.deepEqual(await p.evaluate(() => window.__wl), ['request:screen', 'release']);
  await ctx.close();
});

test('Talerze: na stronę z gryfem 20/15 kg i zamkami, ciężar następnej serii, okno dostępne', async () => {
  const { ctx, p } = await page([], false, { data: PRO });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.click('.set[data-o="1"][data-s="1"] .ok');
  await p.fill('.set[data-o="1"][data-s="2"] .kg', '60');
  await p.click('[data-plates="1"]');
  assert.equal(await p.inputValue('#pl-kg'), '60');                              // pierwsza niezrobiona seria
  assert.equal((await p.textContent('.pl-txt')).trim(), '15 + 2,5 kg');
  await p.click('[data-bar="15"]'); assert.equal((await p.textContent('.pl-txt')).trim(), '20 kg');
  await p.click('#pl-col'); assert.equal((await p.textContent('.pl-txt')).trim(), '20 + 2,5 kg');
  await p.fill('#pl-kg', '14'); assert.match(await p.textContent('#pl-out'), /Mniej niż gryf/);
  await p.fill('#pl-kg', '142,5'); assert.deepEqual(await p.$$eval('.pp', s => s.map(x => x.className)), ['pp p25', 'pp p25', 'pp p10', 'pp ps', 'pp ps']);
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'talerze.png') }); }
  await p.keyboard.press('Escape'); assert.equal(await p.isHidden('#sheet'), true);
  await p.click('[data-plates="1"]');
  assert.equal(await p.getAttribute('[data-bar="15"]', 'aria-pressed'), 'true');     // gryf zapamiętany
  await p.click('[data-close]'); assert.equal(await p.isHidden('#sheet'), true);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// --- PR 6: boje – światła, ocena, propozycja, max dziś ---
const OLY = Object.assign({}, PRO, {
  cfg: Object.assign({}, PRO.cfg, { olyCeil: 0.05 }),
  plan: [{ week: 2, day: 'T1', title: 'Technika', date: '2026-10-13', order: 1, name: 'Rwanie', prio: 'A', sets: 4, reps: '2', pct: 0.7, kg: 70, rpe: '', note: '', extra: 0, drop: 0, block: '', group: 'R', swaps: [] }],
  logs: [{ id: 'robert|1|T1|1|1', zapisano: '2026-10-06T10:00:00.000Z', cwiczenie: 'Rwanie', tydzien: 1, jednostka: 'T1', seria: 1, kg: 67.5, powt: 2, rpe: 9.5, ocena: 'W', wykonane: 'TAK', typ: '' }],
  readiness: []
});
const rate = async (p, s, q) => { await p.click(`.set[data-s="${s}"] .lt`); await p.click(`.rate [data-q="${q}"]`); await p.waitForTimeout(80); };

test('Boje: światła zamiast RPE, ocena → zapis, propozycja i „Ustaw X kg”, max dziś', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: OLY });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set.oly');
  assert.match(await p.textContent('.rx'), /max dziś 75 kg/);                 // 1RM 100 × (0,7 + 0,05)
  assert.equal((await p.textContent('.last')).trim(), 'Ostatnio: 67,5 kg × 2 · Walka');
  assert.equal(await p.$('.set.oly .rpe'), null);
  assert.equal(await p.$('.set.oly .ok'), null);
  await p.click('.set[data-s="1"] .lt');
  assert.deepEqual(await p.$$eval('.rate [data-q]', b => b.map(x => x.dataset.q)), ['L', 'S', 'W', 'X']);
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'boje-ocena.png') }); }
  await p.click('.rate [data-q="L"]'); await p.waitForTimeout(80);
  assert.deepEqual((({ ocena, rpe, typ, done }) => ({ ocena, rpe, typ, done }))(lastSet(calls)), { ocena: 'L', rpe: 7, typ: '', done: true });
  assert.equal(await p.getAttribute('.set[data-s="1"]', 'data-rate'), 'L');
  assert.match(await p.textContent('.sug'), /Łatwo: możesz dołożyć 2,5 kg\. Sufit dziś 75 kg/);
  await p.click('[data-setkg="72.5"]');
  assert.deepEqual(await p.$$eval('.set.oly .kg', i => i.map(x => x.value)), ['70', '72,5', '72,5', '72,5']);
  await rate(p, 2, 'L');
  assert.equal(await p.$eval('.sug [data-setkg]', b => b.dataset.setkg), '75');
  assert.equal((await p.$$('.sug')).length, 1);                                  // tylko pod ostatnio ocenionym
  await p.click('[data-setkg="75"]');
  await rate(p, 3, 'L');
  assert.match(await p.textContent('.sug'), /to sufit dnia \(75 kg\)/);
  assert.equal(await p.$('.sug [data-setkg]'), null);
  await rate(p, 4, 'X');
  assert.deepEqual((({ ocena, rpe, typ }) => ({ ocena, rpe, typ }))(lastSet(calls)), { ocena: 'X', rpe: '', typ: 'FAIL' });
  assert.equal(await p.$('.sug'), null);                                         // brak serii do zrobienia
  await p.click('.set[data-s="4"] .lt'); await p.click('.rate .rclr'); await p.waitForTimeout(80);
  assert.deepEqual((({ ocena, done }) => ({ ocena, done }))(lastSet(calls)), { ocena: '', done: false });
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Boje: dwie spalone na tym samym ciężarze → −5% 1RM; słaba dyspozycja dnia → sufit = plan', async () => {
  const today = await (async () => { const d = new Date(); const z = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); })();
  const data = Object.assign({}, OLY, { readiness: [{ klient: 'robert', data: today, werdykt: 'Uwaga' }] });
  const { ctx, p } = await page([], false, { data });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set.oly');
  assert.match(await p.textContent('.rx'), /max dziś 70 kg/);
  await rate(p, 1, 'L');
  assert.match(await p.textContent('.sug'), /dyspozycja dnia: uwaga/);
  await rate(p, 2, 'X'); await rate(p, 3, 'X');
  assert.match(await p.textContent('.sug'), /Dwie spalone na 70 kg: zejdź o ok\. 5% 1RM do 65 kg/);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// --- PR 7: zamiana ćwiczenia ---
const SWAPD = Object.assign({}, PRO, {
  cfg: Object.assign({}, PRO.cfg, { swap: true }),
  plan: [{ week: 1, day: 'T1', title: 'FBW A', date: '2026-10-06', order: 1, name: 'Przysiad tylny', prio: 'A', sets: 3, reps: '5', pct: null, kg: 100, rpe: 8, note: '', extra: 0, drop: 0, block: '', group: '', swaps: ['Leg press', 'Hack'] }]
});

test('Zamiana: tylko z flagą klienta; zamiennik + powód → nazwa i kolumna „zamiana”, cofnięcie', async () => {
  const off = await page([], false, { data: PRO });
  await off.p.goto(base + '?k=kabc'); await off.p.waitForSelector('.set');
  assert.equal(await off.p.$('[data-swap]'), null);                               // zamiana = NIE
  await off.ctx.close();

  const calls = [];
  const { ctx, p } = await page(calls, false, { data: SWAPD });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('[data-swap="1"]');
  assert.deepEqual(await p.$$eval('#sheet [data-to]', b => b.map(x => x.textContent)), ['Leg press', 'Hack']);   // z kolumny planu
  assert.equal(await p.isDisabled('#sw-ok'), true);
  await p.click('#sheet [data-to="Leg press"]'); await p.click('#sheet [data-why="Ból"]');
  assert.equal(await p.isVisible('#sw-hint'), true);
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'zamiana.png') }); }
  await p.click('#sheet [data-why="Sprzęt zajęty"]'); await p.click('#sw-ok');
  assert.equal(await p.textContent('.cn'), 'Leg press');
  assert.match(await p.textContent('.swapped'), /Zamiast: Przysiad tylny · Sprzęt zajęty/);
  await p.click('.set[data-s="1"] .ok'); await p.waitForTimeout(100);
  assert.deepEqual((({ name, swap }) => ({ name, swap }))(lastSet(calls)), { name: 'Leg press', swap: 'Przysiad tylny → Leg press | Sprzęt zajęty' });
  await p.reload(); await p.waitForSelector('.set');                             // zamiana zapamiętana
  assert.equal(await p.textContent('.cn'), 'Leg press');
  await p.click('[data-unswap="1"]');
  assert.equal(await p.textContent('.cn'), 'Przysiad tylny');
  await p.click('.set[data-s="2"] .ok'); await p.waitForTimeout(100);
  assert.deepEqual((({ name, swap }) => ({ name, swap }))(lastSet(calls)), { name: 'Przysiad tylny', swap: '' });
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Zamiana: własna nazwa, a na innym telefonie zamiana odtworzona z Logu', async () => {
  const data = Object.assign({}, SWAPD, { logs: [{ id: 'robert|1|T1|1|1', zapisano: '2026-10-06T10:00:00.000Z', cwiczenie: 'Goblet squat', tydzien: 1, jednostka: 'T1', seria: 1, kg: 30, powt: 10, rpe: 7, wykonane: 'TAK', typ: '', zamiana: 'Przysiad tylny → Goblet squat | Brak sprzętu' }] });
  const { ctx, p } = await page([], false, { data });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  assert.equal(await p.textContent('.cn'), 'Goblet squat');
  assert.match(await p.textContent('.swapped'), /Brak sprzętu/);
  await p.click('[data-unswap="1"]'); await p.click('[data-swap="1"]');
  await p.fill('#sw-own', 'Przysiad na skrzynię'); await p.click('#sheet [data-why="Inny powód"]'); await p.click('#sw-ok');
  assert.equal(await p.textContent('.cn'), 'Przysiad na skrzynię');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

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
