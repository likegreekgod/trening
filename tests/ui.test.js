// Test interfejsu: web/ serwowane lokalnie, API Apps Script podmienione atrapą (page.route).
const test = require('node:test'), assert = require('node:assert');
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const WEB = path.join(__dirname, '..', 'web');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
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
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, colorScheme: opt.scheme || 'light', reducedMotion: opt.motion ? 'no-preference' : 'reduce' }, opt.ua ? { userAgent: opt.ua } : {}, opt.touch ? { hasTouch: true } : {}));
  const data = opt.data || DATA;
  await ctx.route('**/macros/**', async r => {
    if (offline) return r.abort();
    const b = JSON.parse(r.request().postData() || '{}'); calls.push(b);
    await r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, result: b.fn === 'getData' ? data : (opt.api && opt.api(b)) || { ok: true } }) });
  });
  // podpowiedzi przy pierwszym użyciu zasłaniają część karty: domyślnie obejrzane, opt.tips je włącza
  if (!opt.tips) await ctx.addInitScript(() => { try { ['kabc', 'k0123456789a', 'kABCDEF01234'].forEach(k => localStorage.setItem('tip_' + k, '["seria","wiecej","kamera","dzien"]')); } catch (e) {} });
  // ekran powitalny przy wejściu z linku (?k=) zasłania aplikację: domyślnie obejrzany, opt.wel go włącza
  if (!opt.wel) await ctx.addInitScript(() => { try { ['kabc', 'k0123456789a', 'kABCDEF01234'].forEach(k => localStorage.setItem('wel_' + k, '1')); } catch (e) {} });
  // animacja otwarcia zasłania ekran przez 3 s: domyślnie aplikacja „była na ekranie przed chwilą” (znacznik z roku 2100 działa też w testach z przestawionym zegarem),
  // opt.intro ją włącza (pokazuje się tylko z opt.motion)
  if (!opt.intro) await ctx.addInitScript(() => { try { localStorage.setItem('intro', '4102444800000'); } catch (e) {} });
  const p = await ctx.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  p.external = []; p.on('request', q => { if (!q.url().startsWith(base) && !/\/macros\//.test(q.url())) p.external.push(q.url()); });
  return { ctx, p };
}
// pole serii: wartość wpisana albo propozycja (placeholder z planu / poprzedniej serii)
const fval = (p, sel) => p.$eval(sel, i => i.value || i.dataset.ph || '');
// telefon chowa aplikację (inna aplikacja, blokada ekranu) albo pokazuje ją z powrotem: przeglądarka testowa sama tego nie robi,
// więc podmieniamy stan widoczności strony i wysyłamy to samo zdarzenie, które wysyła telefon
const setHidden = (p, hid) => p.evaluate(h => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
}, hid);
const PRO = Object.assign({}, DATA, { cfg: Object.assign({}, DATA.cfg, { simple: false }) });

test('bez klucza (iOS z ekranu głównego): wklejenie linku od trenera → klucz zapamiętany, plan wczytany', async () => {
  const calls = [];
  const { ctx, p } = await page(calls);
  await p.goto(base); await p.waitForSelector('#key-in');
  assert.match(await p.textContent('#main'), /Wklej link od trenera lub kod/);
  assert.equal(calls.length, 0);                                  // bez klucza nic nie idzie do API
  await p.fill('#key-in', 'zły tekst'); await p.click('#key-go');
  assert.match(await p.textContent('#key-err'), /Nie rozpoznaję/);
  await p.fill('#key-in', '  https://trener.example/trening/?k=k0123456789a  ');
  await p.click('#key-go'); await p.waitForSelector('.set[data-o="1"]');
  assert.equal(await p.evaluate(() => localStorage.getItem('key')), 'k0123456789a');
  assert.equal(calls.find(c => c.fn === 'getData').key, 'k0123456789a');
  assert.equal(await p.textContent('#title'), 'FBW A');
  assert.doesNotMatch(p.url(), /k0123456789a/);                   // klucz zapamiętany i usunięty z paska adresu
  await p.goto(base + '?x=1&k=k0123456789a#plan'); await p.waitForSelector('.set[data-o="1"]');
  assert.equal(new URL(p.url()).search + new URL(p.url()).hash, '?x=1#plan');   // inne parametry i # zostają
  await p.goto(base); await p.waitForSelector('.set[data-o="1"]');      // kolejne uruchomienie bez ?k=
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('bez klucza: sam kod też działa', async () => {
  const calls = [];
  const { ctx, p } = await page(calls);
  await p.goto(base); await p.waitForSelector('#key-in');
  await p.fill('#key-in', 'kABCDEF01234'); await p.press('#key-in', 'Enter');
  await p.waitForSelector('.set[data-o="1"]');
  assert.equal(calls.find(c => c.fn === 'getData').key, 'kABCDEF01234');
  await ctx.close();
});

test('z kluczem: plan, tryb prosty, kompleks 1+1 = 2, zapis serii przez API', async () => {
  const calls = [];
  const { ctx, p } = await page(calls);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  assert.equal(await p.title(), 'Siła z Ruchu – Robert');
  assert.equal(await p.getAttribute('meta[name="color-scheme"]', 'content'), 'light dark');   // bez przyciemniania przez system (Samsung)
  assert.equal(await p.textContent('#title'), 'FBW A');
  assert.match(await p.textContent('#eyebrow'), /Tydz\. 1 · T1 · wt 06\.10/);
  assert.equal(await fval(p, '.set[data-o="2"][data-s="1"] .reps'), '2');
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

test('Nagłówek: chowa się przy przewijaniu w dół, wraca przy przewijaniu w górę i po zmianie zakładki', async () => {
  const { ctx, p } = await page([]);
  await p.goto(base + '?k=k0123456789a'); await p.waitForSelector('.set[data-o="1"]');
  await p.evaluate(() => { document.querySelector('#main').style.minHeight = '3000px'; });
  const hid = () => p.evaluate(() => document.querySelector('header').classList.contains('hid'));
  const to = async (y, want) => { await p.evaluate(v => window.scrollTo(0, v), y); await p.waitForFunction(w => document.querySelector('header').classList.contains('hid') === w, want); };
  assert.equal(await hid(), false);
  await to(600, true);                                            // w dół → schowany
  await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.querySelector('header').getBoundingClientRect().bottom <= 0));
  await to(560, false);                                           // trochę w górę → wraca
  await to(900, true);
  await p.click('#nav [data-tab="plan"]');                        // zmiana zakładki przewija na górę
  await p.waitForFunction(() => !document.querySelector('header').classList.contains('hid'));
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

test('Plan: dolne menu, pasek tygodnia Pn–Nd, tydzień bloku, lżejszy tydzień, przejście do treningu', async () => {
  const { ctx, p } = await page([], false, { data: PLANNED });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="plan"]'); await p.waitForSelector('.unit');
  assert.equal(await p.getAttribute('#nav [data-tab="plan"]', 'aria-current'), 'page');
  // tydzień kalendarzowy bieżącej jednostki (8 T2, 14.10): nagłówek z numerem tygodnia bloku, nie z arkusza
  assert.match(await p.textContent('#plan .wk-t'), /Blok B2 · tydz\. bloku 2\s*12–18\.10/);
  assert.match(await p.textContent('#stats'), /tydzień lżejszy/);
  assert.equal(await p.$$eval('#plan .wk-d', d => d.length), 7);
  await p.click('#plan [data-wkd="-1"]');
  assert.match(await p.textContent('#title'), /Blok B2 · tydz\. bloku 1/);
  assert.ok(await p.$('#plan .wk-d[data-date="2026-10-05"] .wk-u.st-done'));
  assert.ok(await p.$('#plan .wk-d[data-date="2026-10-07"] .wk-u.st-late'));          // po terminie, bez sesji
  assert.ok(await p.$('#plan .wk-d[data-date="2026-10-06"].free'));
  assert.equal(await p.$$eval('.unit', s => s.map(x => x.className.trim()).join()), 'unit done,unit');
  assert.equal(await p.$('#u-7-T1 [data-mv]'), null);                       // zrobionej nie przesuwamy
  await p.click('#u-7-T2 [data-go]'); await p.waitForSelector('#main:not([hidden]) .set');
  assert.match(await p.textContent('#eyebrow'), /Blok B2 · tydz\. 1 · T2/);
  assert.equal(await p.textContent('#st-sets'), '0/8');
  // pasek na Treningu: dotknięcie dnia otwiera jednostkę
  await p.click('#main .wk-d[data-date="2026-10-05"]'); await p.waitForTimeout(100);
  assert.match(await p.textContent('#eyebrow'), /T1 · pn 05\.10 · zrobiona/);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Plan: „Dodaj do kalendarza” (link Google bez klucza, plik .ics z przypomnieniem, cały tydzień), tylko niezrobione od dziś', async () => {
  const { ctx, p } = await page([], false, { data: PLANNED });
  await p.clock.install({ time: new Date('2026-10-07T09:00:00') });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="plan"]'); await p.waitForSelector('#u-7-T2');
  assert.equal(await p.$('#u-7-T1 [data-cal]'), null);                       // zrobiona (i minęła): bez przycisku
  await p.click('#u-7-T2 [data-cal]'); await p.waitForSelector('#kal-g');
  assert.match(await p.textContent('#kal-sub'), /T2 · .* · śr 07\.10 · ok\. \d+ min/);
  assert.equal(await p.$('[data-kall]'), null);                              // jedyny niezrobiony w tym tygodniu: bez „Cały tydzień”
  await p.fill('#kal-t', '07:30'); await p.dispatchEvent('#kal-t', 'change');
  await p.click('#sheet [data-kal="30"]');
  await p.evaluate(() => { window.__open = []; window.open = url => { window.__open.push(url); }; });   // bez sieci do Google: tylko adres
  await p.click('#kal-g');
  const url = (await p.evaluate(() => window.__open))[0], u = new URL(url);
  assert.equal(u.host, 'calendar.google.com');
  assert.equal(u.searchParams.get('action'), 'TEMPLATE');
  assert.match(u.searchParams.get('dates'), /^20261007T073000\/20261007T\d{6}$/);
  assert.match(u.searchParams.get('text'), /^Trening · /);
  assert.match(u.searchParams.get('details'), /1\. .+ – \d+×/);
  assert.doesNotMatch(url + u.searchParams.get('details'), /kabc/);   // klucz klienta nie trafia do kalendarza
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('kal_kabc'))), { t: '07:30', a: 30 });
  // plik .ics: godzina i przypomnienie zapamiętane
  await p.click('#u-7-T2 [data-cal]'); await p.waitForSelector('#kal-i');
  assert.equal(await p.inputValue('#kal-t'), '07:30');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#kal-i')]);
  assert.equal(dl.suggestedFilename(), 'trening-2026-10-07.ics');
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  assert.match(ics, /BEGIN:VEVENT\r\nUID:trening-7-T2@[^\r]+\r\n/);
  assert.match(ics, /DTSTART:20261007T073000\r\n/);
  assert.match(ics, /TRIGGER:-PT30M/);
  assert.doesNotMatch(ics, /kabc/);
  // Trening → „⋯”: cały tydzień (następny tydzień ma dwie niezrobione) = jeden plik z dwoma wydarzeniami, Google wyłączony
  await p.click('#plan [data-wkd="1"]'); await p.click('#u-8-T1 [data-cal]'); await p.waitForSelector('[data-kall="1"]');
  await p.click('[data-kall="1"]');
  assert.equal(await p.isDisabled('#kal-g'), true);
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('#kal-i')]);
  const ics2 = fs.readFileSync(await dl2.path(), 'utf8');
  assert.equal((ics2.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics2, /DTSTART:20261012T073000[\s\S]*DTSTART:20261014T073000/);
  await p.click('#nav [data-tab="trening"]'); await p.click('#umore'); await p.waitForSelector('#u-cal');
  await p.click('#u-cal'); await p.waitForSelector('#kal-sub');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Plan: zmiana dnia jednostki (widoczne dni, komunikat), „przesuń też kolejne”, offline przez kolejkę', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: PLANNED, api: b => b.fn === 'przesunJednostke' ? { ok: true, moved: b.args[0], skipped: [] } : null });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="plan"]'); await p.click('#plan [data-wkd="-1"]');
  await p.click('#u-7-T2 [data-mv]'); await p.waitForSelector('#sheet .mv-d');
  assert.equal(await p.$$eval('#sheet .mv-d', b => b.length), 21);
  await p.click('#sheet [data-to="2026-10-08"]'); await p.waitForSelector('[data-shift]');
  assert.deepEqual(calls.filter(c => c.fn === 'przesunJednostke').map(c => c.args[0]), [[{ week: 7, day: 'T2', date: '2026-10-08' }]]);
  await p.waitForTimeout(100);
  assert.match(await p.textContent('#toast'), /T2: nowy dzień cz 08\.10 ✓/);
  assert.match(await p.textContent('[data-shift]'), /\+1 dzień/);
  // przytrzymanie dnia w pasku = zmiana dnia; zrobionej nie przesuwamy (komunikat zamiast martwego przycisku)
  await p.dispatchEvent('#plan .wk-d[data-date="2026-10-05"]', 'pointerdown'); await p.waitForTimeout(700);
  assert.match(await p.textContent('#toast'), /zrobiona/);
  // bez sieci: kolejne jednostki przesunięte lokalnie i w kolejce
  await ctx.unroute('**/macros/**'); await ctx.route('**/macros/**', r => r.abort());
  await p.click('[data-shift]'); await p.waitForTimeout(200);
  const q = await p.evaluate(() => JSON.parse(localStorage.getItem('q_kabc')));
  assert.deepEqual(q.map(x => x.fn + ':' + x.payload.map(m => m.week + m.day + '→' + m.date).join(',')),
    ['przesunJednostke:8T1→2026-10-13,8T2→2026-10-15']);
  // po ponownym otwarciu (dane z pamięci + kolejka) nowe daty zostają
  await p.goto(base); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="plan"]');
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
/** wysiłek serii światłem: „oceń” → światło (L/S/W/X) albo dokładne RPE (v); wybór od razu zapisuje serię */
const light = async (p, row, q, v) => { await p.click(row + ' .ef'); await p.click(v !== undefined ? `.efp [data-v="${v}"]` : `.efp [data-q="${q}"]`); await p.waitForTimeout(100); };
const SERIES = Object.assign({}, PRO, {
  cfg: Object.assign({}, PRO.cfg, { scale: 'RIR' }),
  plan: [{ week: 2, day: 'T1', title: 'FBW A', date: '2026-10-13', order: 1, name: 'Przysiad', prio: 'A', sets: 3, reps: '5', pct: 0.7, kg: 70, rpe: 8, note: '', extra: 0, drop: 0, block: '', group: '', swaps: [] }],
  logs: [1, 2].map(s => ({ id: `robert|1|T1|1|${s}`, zapisano: '2026-10-06T10:00:00.000Z', cwiczenie: 'Przysiad', tydzien: 1, jednostka: 'T1', seria: s, kg: s === 1 ? 65 : 67.5, powt: 5, rpe: s === 1 ? 7 : 8.5, wykonane: 'TAK', typ: '' }))
});

test('Światła przy skali RIR: podpisy „RIR ≥ 3 / 2 / 0–1”, przy RPE „zapas …” (23.11)', async () => {
  const { ctx, p } = await page([], false, { data: SERIES });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  const hints = async () => { await p.click('.set[data-o="1"][data-s="1"] .ef'); const h = await p.$$eval('.efp [data-q] small', a => a.map(x => x.textContent)); await p.click('.set[data-o="1"][data-s="1"] .ef'); return h; };
  const r = await hints();
  assert.match(r[0], /^RIR ≥ 3 · /); assert.match(r[1], /^RIR 2 · /); assert.match(r[2], /^RIR 0–1 · /); assert.equal(r[3], 'Seria nie wyszła');
  await p.click('[data-sc="RPE"]'); await p.waitForSelector('.set[data-o="1"]');
  assert.match((await hints())[0], /zapas ≥ 3/);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Serie: ✓ → ✕ (FAIL) → puste, poprawka zapisanej serii zapisuje od razu', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: PRO });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  const row = '.set[data-o="1"][data-s="1"]';
  await p.click(row + ' .ok'); await p.waitForTimeout(100);
  assert.deepEqual((({ done, typ, rpe }) => ({ done, typ, rpe }))(lastSet(calls)), { done: true, typ: '', rpe: '' });
  assert.match(await p.textContent(row + ' .ef'), /oceń/);                // ✓ bez światła: brak oceny, nigdy domyślne 7
  await light(p, row, 'S');
  assert.deepEqual((({ done, typ, rpe }) => ({ done, typ, rpe }))(lastSet(calls)), { done: true, typ: '', rpe: 8 });   // 🟡 → RPE 8
  assert.equal(await p.textContent(row + ' .ef b'), '8');
  await light(p, row, 'W'); await light(p, row, '', 9.5);                 // korekta: to samo okienko, dokładne RPE
  assert.equal(lastSet(calls).rpe, 9.5);
  assert.equal(await p.$eval(row + ' .ef .d', d => d.classList.contains('r')), true);   // 9,5 → 🔴
  await light(p, row, 'W'); await light(p, row, '', 8.5);                   // 🔴 + korekta 8,5 → 🟡
  assert.equal(lastSet(calls).rpe, 8.5);
  assert.equal(await p.$eval(row + ' .ef .d', d => d.classList.contains('y')), true);
  await p.click(row + ' .ef'); await p.click('.efp .rclr'); await p.waitForTimeout(100);   // „Bez oceny”: seria zostaje zrobiona, RPE puste
  assert.deepEqual((({ done, rpe }) => ({ done, rpe }))(lastSet(calls)), { done: true, rpe: '' });
  await light(p, row, 'S');
  await p.fill(row + ' .kg', '52,5'); await p.press(row + ' .kg', 'Tab'); await p.waitForTimeout(100);
  assert.equal(lastSet(calls).kg, 52.5);
  await p.click(row + ' .ok'); await p.waitForTimeout(100);
  assert.deepEqual((({ done, typ, rpe }) => ({ done, typ, rpe }))(lastSet(calls)), { done: true, typ: 'FAIL', rpe: '' });
  assert.equal(await p.textContent(row + ' .ok'), '✕');
  assert.equal(await p.$eval(row + ' .kg', e => getComputedStyle(e).textDecorationLine), 'line-through');
  await p.click(row + ' .ok'); await p.waitForTimeout(100);
  assert.deepEqual((({ done, typ }) => ({ done, typ }))(lastSet(calls)), { done: false, typ: '' });
  assert.equal(await p.getAttribute(row, 'data-st'), '');
  assert.match(await p.textContent(row + ' .ef'), /oceń/);                // wyczyszczona seria: bez światła
  await light(p, row, 'X');                                                // ✖ = nieudana: FAIL, RPE puste
  assert.deepEqual((({ done, typ, rpe }) => ({ done, typ, rpe }))(lastSet(calls)), { done: true, typ: 'FAIL', rpe: '' });
  assert.equal(await p.getAttribute(row, 'data-st'), 'x');
  assert.equal(await p.$('.set[data-k="w"] .ef'), null);                  // rozgrzewka bez świateł
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

  assert.ok(await p.$('.rx .zone.p10'));                                   // 70% → zielony talerz
  assert.equal((await p.textContent('.last')).trim(), 'Ostatnio: 67,5 kg × 5 · RIR 1,5');
  await light(p, '.set[data-s="1"]', 'S');
  assert.equal(lastSet(calls).rpe, 8);                                    // arkusz dostaje RPE
  assert.equal(await p.textContent('.set[data-s="1"] .ef b'), 'RIR 2');
  await p.click('.set[data-s="1"] .ef');
  assert.match(await p.textContent('.efp .fine'), /Dokładniej, RIR: 2,5\s*2\s*1,5\s*1/);    // korekta w RIR, zapis w RPE
  await p.click('.efp [data-v="8.5"]'); await p.waitForTimeout(100);
  assert.equal(lastSet(calls).rpe, 8.5);
  await p.click('[data-sc="RPE"]');
  assert.match(await p.textContent('.rx'), /RPE ≤8/);
  assert.equal(await p.textContent('.set[data-s="1"] .ef b'), '8,5');
  assert.equal(await p.evaluate(() => localStorage.getItem('sc_kabc')), 'RPE');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Światła = RPE z Logu: stare 7 → 🟢, 8,5 → 🟡, 9,5 → 🔴, FAIL → ✖, puste → „oceń”; PROSTY słowami; bez sieci światło zostaje po ponownym otwarciu', async () => {
  const L = (s, rpe, typ) => ({ id: `robert|2|T1|1|${s}`, zapisano: '2026-10-13T10:00:00.000Z', cwiczenie: 'Przysiad', tydzien: 2, jednostka: 'T1', seria: s, kg: 70, powt: 5, rpe, wykonane: 'TAK', typ: typ || '' });
  const plan = [Object.assign({}, SERIES.plan[0], { sets: 5 })];
  const logs = [L(1, 7), L(2, '8,5'), L(3, 9.5), L(4, '', 'FAIL')];
  for (const simple of [false, true]) {
    const calls = [];
    const { ctx, p } = await page(calls, false, { data: Object.assign({}, PRO, { plan, logs, cfg: Object.assign({}, PRO.cfg, { simple }) }) });
    await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
    const dots = await p.$$eval('.set[data-o="1"]:not(.set-head) .ef .d', d => d.map(x => x.className.replace('d', '').trim()));
    assert.deepEqual(dots, ['g', 'y', 'r', 'x', '']);
    const txt = await p.$$eval('.set[data-o="1"]:not(.set-head) .ef', d => d.map(x => x.textContent.trim()));
    assert.deepEqual(txt, simple ? ['Lekko', 'Średnio', 'Ciężko', '✕nieudana', 'oceń'] : ['7', '8,5', '9,5', '✕fail', 'oceń']);
    if (simple) {
      await p.click('.set[data-s="5"] .ef');
      assert.equal(await p.$('.efp .fine'), null);                          // PROSTY: bez dokładnego RPE
      assert.equal(await p.$$eval('.efp [data-q]', b => b.length), 4);
      await p.screenshot({ path: path.join(SCREENS, 'swiatla-prosty.png') });
    } else {
      await ctx.unroute('**/macros/**'); await ctx.route('**/macros/**', r => r.abort());
      await light(p, '.set[data-o="1"][data-s="5"]', 'S');
      assert.equal(await p.$eval('.set[data-s="5"] .ok', b => b.classList.contains('pend')), true);
      await p.goto(base); await p.waitForSelector('.set[data-o="1"]', { state: 'attached' });   // z kolejki offline (karta zrobiona = zwinięta)
      assert.equal(await p.$eval('.set[data-s="5"] .ef .d', d => d.classList.contains('y')), true);
      assert.equal(await p.textContent('.set[data-s="5"] .ef b'), '8');
      const q = await p.evaluate(() => JSON.parse(localStorage.getItem('q_kabc') || '[]').filter(i => i.fn === 'logSet').map(i => i.payload.rpe));
      assert.deepEqual(q, [8]);
    }
    assert.deepEqual(p.errors, []);
    await ctx.close();
  }
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
  assert.deepEqual(await p.evaluate(() => window.__vib.filter(v => Array.isArray(v) && v.join() === '300,150,300,150,600').length), 1);   // koniec: mocny wzór wibracji
  assert.ok(await p.evaluate(() => document.body.classList.contains('flash')));                          // i mignięcie ekranu
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
  // wariant b (22.11): w PRO zwykłe Łatwo (RPE 7) nie otwiera „max dziś”; dopiero Dokładniej ≤ 6,5
  assert.match(await p.textContent('.sug'), /Łatwo: zostań przy 70 kg\. Do 75 kg dokładasz tylko po bardzo łatwym/);
  await p.click('.set[data-s="1"] .lt');
  assert.match(await p.textContent('.rate .fine'), /Dokładniej, RPE: 5\s*5,5\s*6\s*6,5\s*7\s*7,5/);
  assert.match(await p.textContent('.rate .fine .fe'), /RPE ≤ 6,5 = bardzo łatwo: otwiera „max dziś”/);
  await p.click('.rate [data-v="6"]'); await p.waitForTimeout(80);
  assert.deepEqual((({ ocena, rpe }) => ({ ocena, rpe }))(lastSet(calls)), { ocena: 'L', rpe: 6 });
  assert.match(await p.textContent('.sug'), /Łatwo: możesz dołożyć 2,5 kg\. Sufit dziś 75 kg/);
  await p.click('[data-setkg="72.5"]');
  assert.deepEqual(await p.$$eval('.set.oly .kg', i => i.map(x => x.value)), ['70', '72,5', '72,5', '72,5']);
  await rate(p, 2, 'L'); await p.click('.set[data-s="2"] .lt'); await p.click('.rate [data-v="6.5"]'); await p.waitForTimeout(80);
  assert.equal(await p.$eval('.sug [data-setkg]', b => b.dataset.setkg), '75');
  assert.equal((await p.$$('.sug')).length, 1);                                  // tylko pod ostatnio ocenionym
  await p.click('[data-setkg="75"]');
  await rate(p, 3, 'W');                                                         // Walka = RPE 9 (jedna skala z resztą aplikacji)
  assert.deepEqual((({ ocena, rpe }) => ({ ocena, rpe }))(lastSet(calls)), { ocena: 'W', rpe: 9 });
  await p.click('.set[data-s="3"] .lt'); await p.click('.rate [data-v="9.5"]'); await p.waitForTimeout(80);   // korekta w PRO: ocena zostaje
  assert.deepEqual((({ ocena, rpe }) => ({ ocena, rpe }))(lastSet(calls)), { ocena: 'W', rpe: 9.5 });
  await rate(p, 3, 'L');
  assert.equal(lastSet(calls).rpe, 7);
  assert.match(await p.textContent('.sug'), /to sufit dnia \(75 kg\)/);
  assert.equal(await p.$('.sug [data-setkg]'), null);
  await rate(p, 4, 'X');
  assert.deepEqual((({ ocena, rpe, typ }) => ({ ocena, rpe, typ }))(lastSet(calls)), { ocena: 'X', rpe: '', typ: 'FAIL' });
  assert.match(await p.textContent('.sug'), /\+ drop set 67,5 kg/);             // brak serii do zrobienia: po ✖ podpowiedź drop setu (−10%)
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
  await off.p.click('[data-more="1"]'); await off.p.waitForSelector('#sheet [data-mnote]');
  assert.equal(await off.p.$('[data-swap]'), null);                               // zamiana = NIE
  await off.ctx.close();

  const calls = [];
  const { ctx, p } = await page(calls, false, { data: SWAPD });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('[data-more="1"]'); await p.click('#sheet [data-swap="1"]');
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

test('Zamiana DOWOLNA: cała baza i własna nazwa; TRENER bez własnej nazwy; na innym telefonie zamiana odtworzona z Logu', async () => {
  const data = Object.assign({}, SWAPD, { cfg: Object.assign({}, SWAPD.cfg, { swap: 'DOWOLNA' }), logs: [{ id: 'robert|1|T1|1|1', zapisano: '2026-10-06T10:00:00.000Z', cwiczenie: 'Goblet squat', tydzien: 1, jednostka: 'T1', seria: 1, kg: 30, powt: 10, rpe: 7, wykonane: 'TAK', typ: '', zamiana: 'Przysiad tylny → Goblet squat | Brak sprzętu' }] });
  const { ctx, p } = await page([], false, { data, api: b => b.fn === 'getExNames' ? [['Bulgarian Split Squat', 'https://x'], ['Box Squat', '']] : null });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  assert.equal(await p.textContent('.cn'), 'Goblet squat');
  assert.match(await p.textContent('.swapped'), /Brak sprzętu/);
  await p.click('[data-unswap="1"]'); await p.click('[data-more="1"]'); await p.click('#sheet [data-swap="1"]');
  await p.fill('#sw-q', 'bulgar'); await p.waitForSelector('#sw-res [data-to="Bulgarian Split Squat"]');   // baza z getExNames
  await p.fill('#sw-q', 'Przysiad na skrzynię'); await p.click('#sw-res .ow-new'); await p.click('#sheet [data-why="Inny powód"]'); await p.click('#sw-ok');
  assert.equal(await p.textContent('.cn'), 'Przysiad na skrzynię');
  assert.deepEqual(p.errors, []);
  await ctx.close();
  // TRENER (dawne TAK): tylko zamienniki z planu, bez wyszukiwarki i własnej nazwy
  const t = await page([], false, { data: SWAPD });
  await t.p.goto(base + '?k=kabc'); await t.p.waitForSelector('[data-more="1"]'); await t.p.click('[data-more="1"]'); await t.p.click('#sheet [data-swap="1"]');
  assert.equal(await t.p.$('#sw-q'), null);
  assert.deepEqual(await t.p.$$eval('#sheet [data-to]', b => b.map(x => x.dataset.to)), ['Leg press', 'Hack']);
  await t.ctx.close();
});

test('Zamiana po zapisanej serii: seria zapisuje się ponownie pod nową nazwą; szukanie po aliasie; „Podobne ćwiczenia” (22.11)', async () => {
  const calls = [], data = Object.assign({}, SWAPD, { cfg: Object.assign({}, SWAPD.cfg, { swap: 'DOWOLNA' }),
    plan: [Object.assign({}, SWAPD.plan[0], { name: 'Dumbbell Incline Bench Row', swaps: [], kg: 20, reps: '10' })] });
  const api = b => b.fn === 'getExNames' ? [['Bent Row', 'https://example.test/br', 'plecy', 'Wiosłowanie sztangą w opadzie; Bent Over Barbell Row'], ['Box Squat', '', 'nogi', '']] : null;
  const { ctx, p } = await page(calls, false, { data, api });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('.set[data-s="1"] .ok'); await p.waitForTimeout(100);
  assert.equal(lastSet(calls).name, 'Dumbbell Incline Bench Row');
  await p.click('[data-more="1"]'); await p.click('#sheet [data-swap="1"]');
  assert.match(await p.textContent('#sheet'), /Podobne ćwiczenia/);
  assert.deepEqual(await p.$$eval('#sheet [aria-label="Zamiennik"] [data-to]', b => b.map(x => x.dataset.to)), ['Wiosłowanie hantlem', 'Wiosłowanie na wyciągu', 'Ściąganie drążka wyciągu']);
  await p.fill('#sw-q', 'wiosłowanie sztangą'); await p.waitForSelector('#sw-res [data-to="Bent Row"]');
  assert.match(await p.textContent('#sw-res [data-to="Bent Row"] .ow-a'), /Wiosłowanie sztangą w opadzie/);
  await p.click('#sw-res [data-to="Bent Row"]'); await p.click('#sheet [data-why="Brak sprzętu"]');
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'zamiana-alias.png') }); }
  const n0 = calls.length; await p.click('#sw-ok'); await p.waitForTimeout(100);
  const re = calls.slice(n0).filter(c => c.fn === 'logSet').map(c => c.args[0]);
  assert.equal(re.length, 1);                                                       // seria 1 zapisana przed zamianą idzie jeszcze raz
  assert.deepEqual((({ set, name, swap, done }) => ({ set, name, swap, done }))(re[0]), { set: 1, name: 'Bent Row', swap: 'Dumbbell Incline Bench Row → Bent Row | Brak sprzętu', done: true });
  const n1 = calls.length; await p.click('[data-unswap="1"]'); await p.waitForTimeout(100);
  const back = calls.slice(n1).filter(c => c.fn === 'logSet').map(c => c.args[0]);
  assert.deepEqual(back.map(x => [x.set, x.name, x.swap]), [[1, 'Dumbbell Incline Bench Row', '']]);   // cofnięcie też trafia do Logu
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// --- PR 8: kamera przy serii, prędkość z urządzenia, komunikat bez sieci ---
const DRIVE = b => b.fn === 'startUpload' ? { uploadId: 'u1', chunk: 4194304, url: null }
  : b.fn === 'uploadChunk' ? { done: true, id: 'f1', link: 'https://drive.google.com/file/d/f1/view' } : null;
const MP4 = { name: 'seria.mp4', mimeType: 'video/mp4', buffer: Buffer.from('x'.repeat(2000)) };

test('Film: kamera przy każdej serii (nie przy rozgrzewce), wgranie do wybranej serii, prędkość z urządzenia', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: PRO, api: DRIVE });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.click('[data-warm="1"]');
  assert.equal(await p.$('.set[data-s="R1"] .cam'), null);
  assert.equal((await p.$$('.set[data-o="1"]:not([data-k="w"]) .cam')).length, 3);
  assert.ok(await p.$('.set.oly .cam'));                                         // boje też
  assert.equal(await p.$('[data-vo]'), null);                                    // nie ma już „Dodaj film” na ćwiczenie
  await p.click('.set[data-o="1"][data-s="2"] .ok'); await p.waitForTimeout(80);
  await p.click('.set[data-o="1"][data-s="2"] .cam');
  assert.match(await p.textContent('#sheet-t'), /Film · seria S2/);
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'film.png') }); }
  await p.fill('#cam-vbt', '0,85'); await p.click('#cam-vsave'); await p.waitForTimeout(80);
  assert.deepEqual((({ set, vbt, done }) => ({ set, vbt, done }))(lastSet(calls)), { set: 2, vbt: 0.85, done: true });
  assert.equal(await p.$eval('.set[data-o="1"][data-s="2"] .cam', b => b.classList.contains('has')), true);
  await p.click('.set[data-o="1"][data-s="2"] .cam');
  assert.deepEqual(await p.$$eval('#sheet input[type=file]', i => i.map(x => [x.id, x.accept, x.getAttribute('capture')])), [['cam-rec', 'video/*', 'environment'], ['cam-file', 'video/*', null]]);   // osobno aparat i wybór pliku
  await p.setInputFiles('#cam-file', MP4); await p.waitForSelector('#sheet', { state: 'hidden' });   // okno zamyka się od razu, film idzie w tle
  await p.waitForFunction(() => /Film wysłany/.test(document.querySelector('#toast').textContent));
  assert.equal(calls.find(c => c.fn === 'startUpload').args[0].set, 2);
  assert.deepEqual(calls.find(c => c.fn === 'logVideo').args[0], { link: 'https://drive.google.com/file/d/f1/view', week: 1, day: 'T1', order: 1, set: 2, name: calls.find(c => c.fn === 'startUpload').args[0].name, date: calls.find(c => c.fn === 'startUpload').args[0].date });
  assert.deepEqual((({ set, vbt, done }) => ({ set, vbt, done }))(lastSet(calls)), { set: 2, vbt: 0.85, done: true });   // film nie kasuje prędkości ani ✓
  assert.equal(await p.$eval('.set[data-o="1"][data-s="2"] .cam', b => b.className), 'cam has');
  await p.click('.set[data-o="1"][data-s="2"] .ok'); await p.waitForTimeout(80);         // ✓ → ✕ zachowuje film
  assert.equal(lastSet(calls).video, 'https://drive.google.com/file/d/f1/view');
  await p.click('.set[data-o="1"][data-s="2"] .cam');
  assert.equal(await p.getAttribute('#sheet a.btn', 'href'), 'https://drive.google.com/file/d/f1/view');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Film: bez sieci czytelny komunikat zamiast błędu; tryb PROSTY bez pola prędkości', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: DATA, api: DRIVE });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.click('.set[data-o="1"][data-s="1"] .cam');
  assert.equal(await p.$('#cam-vbt'), null);
  await ctx.setOffline(true);
  await p.setInputFiles('#cam-file', MP4);
  await p.waitForSelector('#sheet', { state: 'hidden' });
  assert.match(await p.textContent('#toast'), /Brak sieci: film poczeka w telefonie/);
  assert.equal(calls.filter(c => c.fn === 'startUpload').length, 0);
  assert.equal(await p.$eval('.set[data-o="1"][data-s="1"] .cam', b => b.classList.contains('pend')), true);
  assert.match(await p.textContent('#sync'), /filmy w kolejce: 1/);
  await p.click('.set[data-o="1"][data-s="1"] .cam'); await p.waitForSelector('#cam-q .vq');
  assert.match(await p.textContent('#cam-q'), /Film czeka w kolejce \(brak sieci\)/);
  assert.deepEqual(await a11y(p), []);
  await p.click('#sheet [data-close]');
  await ctx.setOffline(false);                                                    // sieć wraca → film wysyła się sam
  await p.waitForFunction(() => /Film wysłany/.test(document.querySelector('#toast').textContent));
  assert.deepEqual(calls.filter(c => /Upload|uploadChunk|logVideo/.test(c.fn)).map(c => c.fn), ['startUpload', 'uploadChunk', 'logVideo']);
  assert.equal(await p.$eval('.set[data-o="1"][data-s="1"] .cam', b => b.classList.contains('pend')), false);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// --- PR 9: ścieżka sztangi i VBT z filmu ---
const SY = require('./synth');
// talerz narysowany na klatce: ciemny krążek z jasną piastą i paskiem na tle w pasy (żeby dopasowanie wzorca miało fakturę)
const DRAW_PLATE = `(ctx, x, y, R, W, H) => {
  for (let i = 0; i < 24; i++) { ctx.fillStyle = i % 2 ? '#7b8077' : '#969b92'; ctx.fillRect(0, i * H / 24, W, H / 24 + 1); }
  ctx.fillStyle = '#1c1c1c'; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
  ctx.fillStyle = '#d0d0d0'; ctx.beginPath(); ctx.arc(x, y, R * 0.25, 0, 7); ctx.fill();
  ctx.fillStyle = '#c8372d'; ctx.fillRect(x - R * 0.8, y - 2, R * 1.6, 4);
}`;

test('Śledzenie talerza: obraz syntetyczny → v max i uniesienie jak w ruchu wzorcowym', async () => {
  const { ctx, p } = await page([], false, { data: OLY });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  const R = 60, PXM = 2 * R / 0.45, dur = 1.5;                                  // ciąg + wejście pod sztangę
  const frames = Array.from({ length: Math.round(dur * 30) + 1 }, (_, k) => { const q = SY.snatchAt(k / 30); return [360 + q.x * PXM, 1000 - q.y * PXM]; });
  const r = await p.evaluate(async ({ frames, R, draw }) => {
    const plate = eval(draw);
    const src = { w: 720, h: 1280, t0: 0, t1: (frames.length - 1) / 30,
      draw: async (c, t, W, H) => { const [x, y] = frames[Math.min(frames.length - 1, Math.round(t * 30))], k = W / 720; plate(c, x * k, y * k, R * k, W, H); } };
    const pts = await track(src, { x: frames[0][0], y: frames[0][1] }, R, null, {});
    const res = TL.analyse(pts, 'R'), out = TL.vbtOut(res);
    return { n: pts.length, reps: res.reps.length, vmax: res.vmax, h: res.h, path: out.path.length, top: Math.max(...pts.map(q => q.y)) };
  }, { frames, R, draw: DRAW_PLATE });
  const vTrue = SY.trueVmax(SY.snatchAt, 0.95);
  assert.equal(r.n, frames.length);
  assert.equal(r.reps, 1);
  assert.ok(Math.abs(r.vmax - vTrue) <= 0.08, `v max ${r.vmax.toFixed(2)} vs ${vTrue.toFixed(2)} m/s`);
  assert.ok(Math.abs(r.h - 96) <= 3, 'uniesienie ' + r.h + ' cm');
  assert.ok(Math.abs(r.top - 0.96) <= 0.02, 'najwyższy punkt ' + r.top.toFixed(3) + ' m');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Okno kamery: „Film + ścieżka + VBT” na nagranym pliku → wynik, zapis analizy i filmu', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: OLY, api: DRIVE });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await rate(p, 1, 'S');
  await p.click('.set[data-s="1"] .cam'); await p.click('#sheet [data-m="vbt"]');
  assert.equal(await p.isVisible('#cam-tip'), true);
  // film 360×640 nagrany w przeglądarce: 0,5 s bezruchu, potem ciąg jak w ruchu wzorcowym (talerz r = 30 px)
  await p.evaluate(async ({ draw, pos }) => {
    const plate = eval(draw), c = document.createElement('canvas'); c.width = 360; c.height = 640;
    const g = c.getContext('2d'), rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp8' }), parts = [];
    rec.ondataavailable = e => parts.push(e.data);
    const done = new Promise(r => rec.onstop = r);
    plate(g, pos[0][0], pos[0][1], 30, 360, 640); rec.start();
    const t0 = performance.now();
    await new Promise(res => { const step = () => { const k = Math.min(pos.length - 1, Math.floor((performance.now() - t0) / 1000 * 30));
      plate(g, pos[k][0], pos[k][1], 30, 360, 640); if (k >= pos.length - 1) res(); else requestAnimationFrame(step); }; step(); });
    rec.stop(); await done;
    const dt = new DataTransfer(); dt.items.add(new File([new Blob(parts, { type: 'video/webm' })], 'rwanie.webm', { type: 'video/webm' }));
    const inp = document.querySelector('#cam-file'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  }, { draw: DRAW_PLATE, pos: Array.from({ length: 61 }, (_, k) => { const q = SY.snatchAt(Math.max(0, k / 30 - 0.5)); return [180 + q.x * 133.3, 520 - q.y * 133.3]; }) });
  await p.waitForFunction(() => /dotknij środka talerza/.test(document.querySelector('#vhint').textContent), null, { timeout: 15000 });
  const box = await p.$eval('#vc', c => ({ k: c.getBoundingClientRect().width / c.width }));
  await p.click('#vc', { position: { x: 180 * box.k, y: 520 * box.k } });
  assert.match(await p.textContent('#vhint'), /krawędzi talerza/);
  await p.click('#vc', { position: { x: 210 * box.k, y: 520 * box.k } });
  assert.match(await p.textContent('#vhint'), /(59|60|61) px = 450 mm/);
  await p.click('#vgo');
  await p.waitForSelector('#vsave', { timeout: 60000 });
  const m = await p.$$eval('.metric b', b => b.map(x => parseFloat(x.textContent.replace(',', '.'))));
  assert.ok(m[0] > 1.2 && m[0] < 3.2, 'v max ' + m[0]);                          // nagranie w czasie rzeczywistym: tylko rząd wielkości
  assert.ok(m[1] > 80 && m[1] < 112, 'uniesienie ' + m[1]);
  assert.ok(await p.$('#vres svg.path .trace'));
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'vbt.png'), fullPage: false }); }
  await p.click('#vsave'); await p.waitForSelector('#sheet', { state: 'hidden', timeout: 15000 });
  const sets = calls.filter(c => c.fn === 'logSet').map(c => c.args[0]);
  const an = sets.find(s => s.path), last = sets[sets.length - 1];
  assert.ok(an.vbt > 1.2 && an.vbtPeak >= an.vbt && an.height > 80 && JSON.parse(an.path).length > 5);
  assert.deepEqual((({ ocena, rpe, done }) => ({ ocena, rpe, done }))(an), { ocena: 'S', rpe: 8, done: true });   // ocena boju zachowana
  await p.waitForFunction(() => /Film wysłany/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 });
  assert.equal(calls.find(c => c.fn === 'logVideo').args[0].link, 'https://drive.google.com/file/d/f1/view');
  assert.equal(last.path, an.path);                                              // film nie kasuje analizy
  await p.click('.set[data-s="1"] .cam');
  assert.match(await p.textContent('.saved'), /Zapisana analiza: v max/);
  assert.ok(await p.$('.saved svg.path'));
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// --- PR 10: dyspozycja dnia ---
const HIST = Object.assign({}, PRO, { readiness: [1, 2, 3, 4, 5, 6].map(i => ({ id: 'robert|2026-09-0' + i, klient: 'robert', data: '2026-09-0' + i, cmj_sr: 40, hooper_suma: 12, vbt_test: 1, werdykt: 'Dobra dyspozycja' })) });
const hooper = async (p, v) => { for (const q of ['sen', 'stres', 'zmeczenie', 'bolesnosc']) await p.click(`#dysp .scale[data-q="${q}"] [data-v="${v}"]`); };

test('Dyspozycja: ankieta, skoki i prędkość → werdykt wg progów, zapis, baner na treningu', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: HIST });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  assert.match(await p.textContent('#go-dysp'), /Nie zmierzono dziś/);
  await p.click('#go-dysp'); await p.waitForSelector('#dysp .verdict');
  assert.equal(await p.getAttribute('#nav [data-tab="dysp"]', 'aria-current'), 'page');
  assert.equal(await p.textContent('.verdict h2'), 'Brak pomiaru');
  // historia: ostatnie zapisane dni pod formularzem (najnowszy na górze)
  assert.equal(await p.$$eval('#dysp .rhist .kv', k => k.length), 6);
  assert.match(await p.$eval('#dysp .rhist .kv', k => k.textContent), /06\.09 · Dobra dyspozycja.*ankieta 12 · CMJ 40 cm · 1 m\/s/);
  // sen ma odwrócony widok (7 = bardzo dobry), zapis bez zmian (1 = dobrze): przycisk „7” zapisuje 1; pozostałe pytania wprost
  const scale = q => p.$$eval(`#dysp .scale[data-q="${q}"] button`, b => b.map(x => x.textContent + '→' + x.dataset.v).join(' '));
  assert.equal(await scale('sen'), '1→7 2→6 3→5 4→4 5→3 6→2 7→1');
  assert.equal(await scale('stres'), '1→1 2→2 3→3 4→4 5→5 6→6 7→7');
  assert.match(await p.textContent('#dysp'), /Sen: wyżej = lepiej/);
  await p.click('#dysp .scale[data-q="sen"] button:text-is("7")');
  assert.equal(await p.getAttribute('#dysp .scale[data-q="sen"] [data-v="1"]', 'aria-pressed'), 'true');
  await hooper(p, 4);                                                           // suma 16 = średnia 12 + 4 → uwaga
  assert.equal(await p.textContent('.verdict h2'), 'Uwaga');
  for (const i of [0, 1, 2]) { await p.fill(`#dysp input[data-j="${i}"]`, '38'); await p.press(`#dysp input[data-j="${i}"]`, 'Tab'); }
  assert.equal(await p.textContent('.verdict h2'), 'Uwaga');                    // dwa pomarańczowe
  assert.match(await p.textContent('.verdict'), /CMJ -5% vs Twoja średnia \(38 vs 40 cm\)/);
  await p.fill('#rd-vbt', '0,9'); await p.press('#rd-vbt', 'Tab');
  assert.equal(await p.textContent('.verdict h2'), 'Zmęczenie');                // czerwony + pomarańczowe
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'dyspozycja.png'), fullPage: true }); }
  await p.click('#rd-save'); await p.waitForTimeout(100);
  const s = calls.find(c => c.fn === 'saveDyspozycja').args[0];
  assert.deepEqual({ cmj: s.cmj, cmjAvg: s.cmjAvg, hooper: s.hooper, vbt: s.vbt, verdict: s.verdict, n: s.reasons.length },
    { cmj: [38, 38, 38], cmjAvg: 38, hooper: { sen: 4, stres: 4, zmeczenie: 4, bolesnosc: 4, suma: 16 }, vbt: 0.9, verdict: 'Zmęczenie', n: 3 });
  assert.match(s.date, /^\d{4}-\d{2}-\d{2}$/);
  await p.click('#nav [data-tab="trening"]');
  assert.match(await p.textContent('#go-dysp'), /Zmęczenie.*Napisz do trenera/);
  assert.equal(await p.$eval('#go-dysp', b => b.className), 'ready lv-bad');
  await p.reload(); await p.waitForSelector('.set');                            // dzisiejsze pomiary zostają w telefonie
  await p.click('#nav [data-tab="dysp"]');
  // po zapisie: werdykt na górze, ankieta i skoki zwinięte do jednej linii z „Edytuj”
  assert.match(await p.textContent('#dysp .dsum'), /Ankieta 16 · CMJ 38 cm · 0,9 m\/s/);
  assert.equal(await p.$('#dysp .scale'), null);
  await p.click('#rd-edit');
  assert.equal(await p.inputValue('#rd-vbt'), '0,9');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Dyspozycja: bez sieci zapis czeka w kolejce i baner działa; bez historii „Zbieram Twoją średnią” zamiast oceny', async () => {
  const { ctx, p } = await page([], false, { data: PRO });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await ctx.unroute('**/macros/**'); await ctx.route('**/macros/**', r => r.abort());
  await p.click('#nav [data-tab="dysp"]'); await hooper(p, 7);
  assert.equal(await p.textContent('.verdict h2'), 'Zbieram Twoją średnią');     // brak historii ≠ dobra dyspozycja
  assert.equal(await p.$eval('.verdict', e => e.className.trim()), 'verdict lv-none');
  assert.match(await p.textContent('.verdict'), /0\/5 pomiarów/);
  await p.click('#rd-save'); await p.waitForTimeout(200);
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('q_kabc')).map(x => x.fn)), ['saveDyspozycja']);
  assert.match(await p.textContent('.verdict'), /1\/5 pomiarów/);
  await p.goto(base); await p.waitForSelector('.set');
  assert.match(await p.textContent('#go-dysp'), /Zbieram Twoją średnią.*1\/5/);
  assert.equal(await p.$eval('#go-dysp', b => b.className), 'ready lv-none');
  await ctx.close();
});

test('Dyspozycja: skok odstający > 8% od mediany → komunikat, wykluczenie ze średniej, zapis oznaczony; układ 360 i 412 px', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: HIST, scheme: 'dark' });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="dysp"]'); await hooper(p, 3);
  for (const [i, v] of [[0, '41,7'], [1, '45,9'], [2, '41,1']]) { await p.fill(`#dysp input[data-j="${i}"]`, v); await p.press(`#dysp input[data-j="${i}"]`, 'Tab'); }
  assert.match(await p.textContent('#dysp .hint'), /Skok 2 odstaje o ponad 8% od mediany \(41,7 cm\)/);
  await p.click('#dysp [data-ex="1"]');
  assert.match(await p.$$eval('#dysp .card', c => c[1].textContent), /bez wykluczonych\)\s*41,4 cm/);
  assert.equal(await p.$('#dysp .hint[role=alert]'), null);
  for (const w of [360, 412]) {                                                  // werdykt w przepływie: nie nachodzi na ankietę
    await p.setViewportSize({ width: w, height: 800 });
    const [v, a, last, over] = await p.evaluate(() => { const v = document.querySelector('#dysp .verdict'), c = document.querySelector('#dysp .card');
      return [v.getBoundingClientRect(), c.getBoundingClientRect(), v.lastElementChild.getBoundingClientRect(), v.scrollHeight - v.clientHeight]; });
    assert.ok(a.top - v.bottom >= 16, w + ' px: odstęp ' + (a.top - v.bottom));
    assert.ok(over <= 1 && last.bottom <= v.bottom, w + ' px: treść werdyktu wychodzi poza kartę');         // karta rośnie z treścią (17.10: nachodziła na ankietę)
    assert.equal(await p.$eval('#dysp .verdict li', li => getComputedStyle(li).color === getComputedStyle(document.querySelector('#dysp .verdict p')).color || getComputedStyle(li).opacity === '1'), true);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  }
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.setViewportSize({ width: 360, height: 800 }); await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: path.join(SCREENS, 'dyspozycja-360-ciemny.png'), fullPage: false }); }
  await p.click('#rd-save'); await p.waitForTimeout(100);
  const s = calls.find(c => c.fn === 'saveDyspozycja').args[0];
  assert.deepEqual({ cmj: s.cmj, cmjAvg: s.cmjAvg, excl: s.excl }, { cmj: [41.7, 45.9, 41.1], cmjAvg: 41.4, excl: [false, true, false] });
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Dyspozycja: pomyłka w skoku (0,4 zamiast 24) → poprawka w polu przed i po zapisie', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: HIST });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="dysp"]'); await hooper(p, 3);
  const jump = async (i, v) => { await p.fill(`#dysp input[data-j="${i}"]`, v); await p.press(`#dysp input[data-j="${i}"]`, 'Tab'); };
  for (const [i, v] of [[0, '25,1'], [1, '23,5'], [2, '0,4']]) await jump(i, v);
  assert.match(await p.textContent('#dysp .hint'), /^Skok 3 odstaje .*dotknij pola i popraw wynik/);
  await jump(2, '24,1');
  assert.equal(await p.$('#dysp .hint[role=alert]'), null);
  assert.match(await p.$$eval('#dysp .card', c => c[1].textContent), /Średnia dziś\s*24,2 cm/);
  await p.click('#rd-save'); await p.waitForTimeout(100);
  assert.deepEqual(calls.filter(c => c.fn === 'saveDyspozycja').pop().args[0].cmj, [25.1, 23.5, 24.1]);
  await p.click('#rd-edit'); await jump(2, '24,3');                               // po zapisie: Edytuj → poprawka → Zapisz zmiany
  await p.click('#rd-save'); await p.waitForTimeout(100);
  const s = calls.filter(c => c.fn === 'saveDyspozycja').pop().args[0];
  assert.deepEqual({ cmj: s.cmj, cmjAvg: s.cmjAvg }, { cmj: [25.1, 23.5, 24.3], cmjAvg: 24.3 });
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('CMJ z filmu: instrukcja, odbicie i lądowanie → czas lotu → wysokość, klatkaż, zapis jako skok, film na Dysk', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: PRO, api: DRIVE });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="dysp"]');
  for (const [i, v] of [[0, '26,7'], [1, '23,5'], [2, '0,4']]) { await p.fill(`#dysp input[data-j="${i}"]`, v); await p.press(`#dysp input[data-j="${i}"]`, 'Tab'); }
  await p.click('#cmj-vid');
  assert.match(await p.textContent('.cmj-how'), /pierwsza klatka, na której oba palce są już nad podłożem/);
  assert.equal(await p.$$eval('svg.cmj-ex', e => e.length), 2);
  await p.evaluate(async () => {                                                // krótki film nagrany w przeglądarce (treść bez znaczenia)
    const c = document.createElement('canvas'); c.width = 160; c.height = 120; const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm;codecs=vp8' }), parts = [];
    rec.ondataavailable = e => parts.push(e.data); const done = new Promise(r => rec.onstop = r);
    rec.start(); const t0 = performance.now();
    await new Promise(res => { const step = () => { const t = performance.now() - t0; g.fillStyle = '#888'; g.fillRect(0, 0, 160, 120); g.fillStyle = '#111'; g.fillRect(20 + t / 20, 40, 20, 40); t > 1500 ? res() : requestAnimationFrame(step); }; step(); });
    rec.stop(); await done;
    const dt = new DataTransfer(); dt.items.add(new File([new Blob(parts, { type: 'video/webm' })], 'skok.webm', { type: 'video/webm' }));
    const inp = document.querySelector('#cmj-file'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForFunction(() => { const v = document.querySelector('#cmj-v'); return v && isFinite(v.duration) && v.readyState >= 2; }, null, { timeout: 15000 });
  assert.match(await p.textContent('#cmj-stage .det'), /Nie odczytałem klatkażu/);           // webm bez moov
  assert.deepEqual(await p.$$eval('#cmj-fps option', o => o.map(x => x.value)), ['30', '60', '120', '200', '240']);
  assert.deepEqual(await p.$$eval('#sheet [data-step]', b => b.map(x => x.textContent)), ['◀◀', '◀', '▶', '▶▶']);
  const seek = async f => { await p.evaluate(x => new Promise(res => { const v = document.querySelector('#cmj-v'), s = document.querySelector('#cmj-s'); v.addEventListener('seeked', res, { once: true }); s.value = x; s.dispatchEvent(new Event('input')); setTimeout(res, 2000); }), f); };
  assert.equal(await p.isDisabled('#cmj-save'), true);
  await seek(200); await p.click('#cmj-k');
  await seek(600); await p.click('#cmj-l');
  const t = await p.evaluate(() => { const v = document.querySelector('#cmj-v'); return v.currentTime; });
  const kv = await p.$$eval('#cmj-out .kv b', b => b.map(x => parseFloat(x.textContent.replace(',', '.'))));
  assert.ok(Math.abs(kv[1] - t) < 0.002 && kv[1] > kv[0]);
  const flight = kv[1] - kv[0], h = 1.22625 * flight * flight * 100;
  assert.ok(Math.abs(parseFloat((await p.textContent('#cmj-h')).replace(',', '.')) - h) <= 0.3, 'wysokość ' + h.toFixed(1));   // czasy na ekranie zaokrąglone do 0,001 s
  assert.deepEqual(await a11y(p), []);
  // wszystkie skoki wpisane → domyślnie ten najdalej od mediany (pomyłka 0,4); wybór skoku zmienia cel zapisu
  assert.equal(await p.textContent('#cmj-slot [aria-pressed="true"]'), 'Skok 3 · 0,4');
  await p.click('#cmj-slot [data-slot="0"]');
  assert.equal(await p.textContent('#cmj-save'), 'Zapisz jako skok 1');
  const shown = (await p.textContent('#cmj-h')).trim();
  if (h <= 90) {
    await p.click('#cmj-save'); assert.equal(await p.inputValue('#dysp input[data-j="0"]'), shown);
    await p.waitForFunction(() => /Film skoku 1 wysłany/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 });
    assert.equal(calls.find(c => c.fn === 'startUpload').args[0].kind, 'cmj');
    assert.deepEqual((({ link, n }) => ({ link, n }))(calls.find(c => c.fn === 'logReadyVideo').args[0]), { link: 'https://drive.google.com/file/d/f1/view', n: 1 });
  }
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// --- PR 11: postęp ---
// 8 tygodni historii syntetycznej do dziś: przysiad (e1RM rośnie, tydz. 5 słabszy), rwanie, sesje z faktyczną datą, dyspozycja
// PROG_SHIFT=3 przesuwa historię o 3 dni wstecz: sprawdzenie w dowolny dzień, że testy nie zależą od dnia tygodnia
const PROG_SHIFT = +process.env.PROG_SHIFT || 0;
const PROG = (() => {
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n - PROG_SHIFT); const z = x => String(x).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); };
  const plan = [], logs = [], sessions = [], readiness = [];
  for (let w = 1; w <= 8; w++) {
    const date = day(-7 * (8 - w) - 1), block = w <= 4 ? 'B1' : 'B2', sq = 100 + 2.5 * w - (w === 5 ? 7.5 : 0), sn = 60 + 2.5 * w;
    plan.push({ week: w, day: 'T1', title: 'Siła', date, order: 1, name: 'Przysiad tylny', prio: 'A', sets: 3, reps: '5', pct: 0.8, kg: sq, rpe: 8, note: '', extra: 0, drop: 0, block, group: '', swaps: [] },
      { week: w, day: 'T1', title: 'Siła', date, order: 2, name: 'Rwanie', prio: 'A', sets: 3, reps: '2', pct: w === 8 ? 0.92 : 0.75, kg: sn, rpe: '', note: '', extra: 0, drop: 0, block, group: 'R', swaps: [] });
    if (w === 8) continue;                                                       // bieżący tydzień jeszcze niezrobiony
    for (let s = 1; s <= 3; s++) {
      logs.push({ id: `robert|${w}|T1|1|${s}`, zapisano: date + 'T17:00:00.000Z', cwiczenie: 'Przysiad tylny', tydzien: w, jednostka: 'T1', data: date, nr_cw: 1, seria: s, kg: sq, powt: 5, rpe: 8, wykonane: 'TAK', typ: '' });
      logs.push({ id: `robert|${w}|T1|2|${s}`, zapisano: date + 'T17:20:00.000Z', cwiczenie: 'Rwanie', tydzien: w, jednostka: 'T1', data: date, nr_cw: 2, seria: s, kg: sn, powt: 2, rpe: 8, ocena: 'S', wykonane: 'TAK', typ: w === 3 && s === 3 ? 'FAIL' : '' });
    }
    sessions.push({ id: `robert|${w}|T1`, tydzien: w, jednostka: 'T1', data: date, start: date + 'T16:00:00.000Z', samopoczucie: 4, czas_min: w === 4 ? 80 : 60, rpe_sesji: w === 4 ? 9 : 6 });
    readiness.push({ id: 'robert|' + date, klient: 'robert', data: date, cmj_sr: 40 + (w === 5 ? -3 : w * 0.3), hooper_suma: 12, vbt_test: 1 + w / 100, werdykt: 'Dobra dyspozycja' });
  }
  return Object.assign({}, PRO, { plan, logs, sessions, readiness });
})();

for (const scheme of ['light', 'dark']) test(`Postęp ${scheme}: siła z rekordami, objętość ze strefami i kalendarzem, dyspozycja`, async () => {
  const { ctx, p } = await page([], false, { data: PROG, scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="postep"]'); await p.click('[data-pt="sila"]'); await p.waitForSelector('#postep svg.chart');
  const shot = async n => { if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `postep-${n}-${scheme}.png`), fullPage: true }); } };
  // Siła: 7 punktów, rekordy = każdy nowy szczyt (tydz. 5 słabszy → nie rekord), blok B2 zaznaczony
  assert.deepEqual(await p.$$eval('#p-ex option', o => o.map(x => x.textContent)), ['Przysiad tylny', 'Rwanie']);
  assert.equal((await p.$$('svg.chart .pt')).length, 7);
  assert.equal((await p.$$('svg.chart .pt.pr')).length, 6);
  assert.match(await p.textContent('.stat'), /Najlepsze e1RM\s*144,9/);             // 117,5 kg × (1 + 7/30)
  assert.ok((await p.textContent('svg.chart')).includes('B2'));
  await p.click('svg.chart .hit >> nth=4', { force: true });
  assert.match(await p.textContent('.tip'), /· 129,5 kg$/);                          // tydz. 5: 105 kg × 5 @ RPE 8
  assert.equal((await p.$$('details.tbl tbody tr')).length, 7);
  assert.deepEqual(await a11y(p), []); await shot('sila');
  await p.selectOption('#p-ex', 'Rwanie');
  assert.match(await p.textContent('.stat'), /Najlepsze zaliczone\s*77,5/);
  // Objętość
  await p.click('[data-pt="obj"]');
  assert.equal((await p.$$('svg.chart .tbar')).length, 7);                           // 7 tygodni z treningiem z 12
  assert.ok(await p.$eval('svg.chart .tbar', b => { const r = b.getBoundingClientRect(); return r.height > 40 && r.width > 15 && getComputedStyle(b).display !== 'none'; }), 'słupki widoczne');
  assert.equal((await p.$$('.calg i')).length, 84);
  assert.equal((await p.$$('.calg i.h4')).length, 1);                                // najcięższy dzień: RPE 9 × 80 min
  assert.match(await p.textContent('#postep'), /61–70%.*71–80%/s);
  const z = await p.$$eval('.zbar i', s => s.map(x => x.className));
  assert.deepEqual(z, ['p15']);                                                      // przysiad 80% i rwanie 75% → żółty
  await p.click('.calg i.h4'); assert.match(await p.textContent('.card:last-of-type .tip'), /obciążenie 720/);
  assert.deepEqual(await a11y(p), []); await shot('objetosc');
  // Dyspozycja
  await p.click('[data-pt="dys"]');
  assert.equal((await p.$$('svg.chart')).length, 2);
  assert.ok(await p.$('svg.chart .band'));
  assert.deepEqual(await a11y(p), []); await shot('dyspozycja');
  assert.deepEqual(p.external, []); assert.deepEqual(p.errors, []);
  await ctx.close();
});

// plan z trzema tygodniami bloku B1 i jednym B2; flaga „edycja” włącza zmiany w jednostce trenera
const EDROW = (week, order, name) => ({ week, day: 'T1', title: 'Siła – dół', date: '2026-12-0' + week, order, name, prio: order === 1 ? 'A' : 'B', sets: 3, reps: '5', pct: null, kg: 100, rpe: 8, note: '', extra: null, drop: 0, block: week <= 3 ? 'B1' : 'B2', group: '', swaps: [], infos: [], parts: [] });
const EDIT = Object.assign({}, PRO, { cfg: Object.assign({}, PRO.cfg, { edit: true, swap: 'DOWOLNA' }), removed: [],
  plan: [].concat(...[1, 2, 3, 4].map(w => [EDROW(w, 1, 'Przysiad ze sztangą'), EDROW(w, 2, 'Wypychanie nóg na suwnicy')])) });
const EXNAMES = [['Wykroki z hantlami', 'https://example.com/wykroki', 'czworogłowe; pośladki'], ['Wykroki chodzone', '', 'pośladki'], ['Goblet squat', '', 'czworogłowe']];

test('Zmiany w jednostce bez flagi „edycja”: nie ma „+ ćwiczenie” ani „Usuń z treningu”', async () => {
  const { ctx, p } = await page([], false, { data: Object.assign({}, EDIT, { cfg: Object.assign({}, EDIT.cfg, { edit: false }) }) });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  assert.equal(await p.$('#ed-add'), null);
  await p.click('.card[data-card="2"] [data-more]'); await p.waitForSelector('#sheet [data-skip]');
  assert.equal(await p.$('#sheet [data-del]'), null);
  await p.click('#sheet [data-swap]'); await p.waitForSelector('#sw-ok');
  assert.equal(await p.$('#sheet [data-len]'), null);                               // zamiana bez pytania „na jak długo”
  await ctx.close();
});

for (const scheme of ['light', 'dark']) test(`Zmiany w jednostce ${scheme}: dodanie na stałe, usunięcie i przywrócenie, zamiana na stałe`, async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: EDIT, scheme, api: b => b.fn === 'getExNames' ? EXNAMES : null });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  const edits = () => calls.filter(c => c.fn === 'editPlan').map(c => c.args[0]);
  // 1. dodanie ćwiczenia z bazy, na stałe: ten trening i dwa kolejne tygodnie bloku B1 (tydz. 4 to już B2)
  await p.click('#ed-add'); await p.waitForSelector('#ed-q');
  assert.equal(await p.$eval('#ed-ok', b => b.disabled), true);
  await p.waitForFunction(() => EXN.list.length > 0);
  await p.fill('#ed-q', 'wykr'); await p.dispatchEvent('#ed-q', 'input');
  assert.deepEqual(await p.$$eval('#ed-res .opt', b => b.map(x => x.textContent.trim())), ['Wykroki z hantlamifilm', 'Wykroki chodzone', '+ Własna nazwa: „wykr”']);
  await p.click('#ed-res [data-n="Wykroki z hantlami"]');
  assert.equal(await p.textContent('#ed-sel'), 'Wybrane: Wykroki z hantlami');
  await p.fill('#ed-sets', '2'); await p.fill('#ed-kg', '12,5');
  await p.click('#sheet [data-len="1"]');
  assert.equal(await p.getAttribute('#sheet [data-len="1"]', 'aria-pressed'), 'true');
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `edycja-dodaj-${scheme}.png`) }); }
  await p.click('#ed-ok'); await p.waitForSelector('.card[data-card="51"]');
  assert.equal(await p.textContent('#toast'), 'Dodano: Wykroki z hantlami (ten trening i 2 kolejne).');
  const add = edits()[0];
  assert.deepEqual([add.op, add.week, add.day, add.name, add.sets, add.reps, add.kg, add.forever], ['add', 1, 'T1', 'Wykroki z hantlami', '2', '10', '12,5', true]);
  assert.deepEqual(await p.evaluate(() => PLAN.filter(r => r.added).map(r => [r.week, r.order, r.sets, r.kg])), [[1, 51, 2, 12.5], [2, 51, 2, 12.5], [3, 51, 2, 12.5]]);
  assert.ok(await p.$('.card[data-card="51"] .infb'));                              // film „Jak wykonać” z bazy od razu
  assert.equal(await p.textContent('#st-sets'), '0/8');                             // 3 + 3 + 2 serie
  // serię dodanego ćwiczenia zapisuje się jak każdą inną
  await p.click('.set[data-o="51"][data-s="1"] .ok'); await p.waitForTimeout(100);
  const ls = calls.filter(c => c.fn === 'logSet').pop().args[0];
  assert.deepEqual([ls.order, ls.set, ls.name, ls.kg, ls.reps], [51, 1, 'Wykroki z hantlami', 12.5, 10]);
  await p.evaluate(() => stopRest());
  // 2. usunięcie ćwiczenia z planu, tylko ten trening: karta znika, na dole „Przywróć”
  await p.click('.card[data-card="2"] [data-more]'); await p.click('#sheet [data-del]'); await p.waitForSelector('#ed-del');
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') await p.screenshot({ path: path.join(SCREENS, `edycja-usun-${scheme}.png`) });
  await p.click('#ed-del'); await p.waitForSelector('.ed-rm');
  assert.equal(await p.$('.card[data-card="2"]'), null);
  assert.deepEqual(edits()[1], { op: 'del', week: 1, day: 'T1', order: 2, forever: false });
  assert.match(await p.textContent('.ed-rm'), /Usunięte z tego treningu\s*Wypychanie nóg na suwnicy\s*Przywróć/);
  assert.equal(await p.evaluate(() => PLAN.filter(r => r.name === 'Wypychanie nóg na suwnicy').length), 3);   // w kolejnych tygodniach zostało
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { await p.$eval('.ed-rm', e => { document.querySelector('#toast').style.display = 'none'; e.scrollIntoView({ block: 'center' }); }); await p.screenshot({ path: path.join(SCREENS, `edycja-usuniete-${scheme}.png`) }); }
  await p.click('[data-undel="2"]'); await p.waitForSelector('.card[data-card="2"]');
  assert.equal(await p.$('.ed-rm'), null);
  assert.deepEqual(edits()[2], { op: 'undel', week: 1, day: 'T1', order: 2 });
  // 3. zamiana na stałe: dziś przez Log (jak dotąd), w kolejnych tygodniach bloku inna nazwa w planie
  await p.click('.card[data-card="1"] [data-more]'); await p.click('#sheet [data-swap]'); await p.waitForSelector('#sw-q');
  await p.fill('#sw-q', 'gob'); await p.dispatchEvent('#sw-q', 'input'); await p.click('#sw-res [data-to="Goblet squat"]');
  await p.click('#sheet [data-why]'); await p.click('#sheet [data-len="1"]'); await p.click('#sw-ok');
  await p.waitForSelector('#sheet', { state: 'hidden' });
  assert.match(await p.textContent('#toast'), /Zamieniono na: Goblet squat\. Także w kolejnych tygodniach: 2\./);
  const sw = edits()[3];
  assert.deepEqual([sw.op, sw.week, sw.day, sw.order, sw.to, sw.forever], ['swap', 1, 'T1', 1, 'Goblet squat', true]);
  assert.deepEqual(await p.evaluate(() => PLAN.filter(r => r.order === 1).map(r => r.week + ':' + r.name)), ['1:Przysiad ze sztangą', '2:Goblet squat', '3:Goblet squat', '4:Przysiad ze sztangą']);
  assert.match(await p.textContent('.card[data-card="1"] .cn'), /Goblet squat/);    // bieżąca jednostka: zamiana jak dotąd
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Zmiany w jednostce bez sieci: kolejka, po ponownym otwarciu zmiana zostaje; ostatniego ćwiczenia nie da się usunąć', async () => {
  const { ctx, p } = await page([], false, { data: EDIT, api: b => b.fn === 'getExNames' ? EXNAMES : null });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await ctx.unroute('**/macros/**'); await ctx.route('**/macros/**', r => r.abort());
  await p.click('#ed-add'); await p.fill('#ed-q', 'Plank boczny'); await p.dispatchEvent('#ed-q', 'input'); await p.click('#ed-res .ow-new');
  await p.fill('#ed-sets', '0'); await p.click('#ed-ok');
  assert.equal(await p.textContent('#ed-err'), 'Serie 1–40 i powtórzenia.');        // błąd w oknie, nic nie wysłane
  await p.fill('#ed-sets', '2'); await p.fill('#ed-reps', '30 s'); await p.click('#ed-ok'); await p.waitForSelector('.card[data-card="51"]');
  await p.click('.card[data-card="2"] [data-more]'); await p.click('#sheet [data-del]'); await p.click('#sheet [data-len="1"]'); await p.click('#ed-del');
  await p.waitForSelector('.ed-rm');
  // wpis trafia do kolejki dopiero po odrzuconym zapytaniu (send → catch), czyli chwilę po zmianie na ekranie
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem('q_kabc') || '[]')).length >= 2);
  assert.deepEqual((await p.evaluate(() => JSON.parse(localStorage.getItem('q_kabc')))).map(x => x.fn + ':' + x.payload.op + ':' + !!x.payload.forever), ['editPlan:add:false', 'editPlan:del:true']);
  await p.goto(base); await p.waitForSelector('.set[data-o="1"]');                  // dane z pamięci telefonu + kolejka
  assert.deepEqual(await p.$$eval('.card[data-card]', c => c.map(x => x.dataset.card)), ['1', '51']);
  // dodane i od razu usunięte bez sieci: po kolejnym otwarciu nie wraca i nie dubluje się
  await p.click('#ed-add'); await p.fill('#ed-q', 'Mostek'); await p.dispatchEvent('#ed-q', 'input'); await p.click('#ed-res .ow-new'); await p.click('#ed-ok'); await p.waitForSelector('.card[data-card="52"]');
  await p.click('.card[data-card="52"] [data-more]'); await p.click('#sheet [data-del]'); await p.click('#ed-del'); await p.waitForSelector('.card[data-card="52"]', { state: 'detached' });
  await p.goto(base); await p.waitForSelector('.set[data-o="1"]');
  assert.deepEqual(await p.$$eval('.card[data-card]', c => c.map(x => x.dataset.card)), ['1', '51']);
  assert.equal(await p.evaluate(() => PLAN.filter(r => r.name === 'Wypychanie nóg na suwnicy').map(r => r.week).join()), '4');   // na stałe: zostało tylko w bloku B2
  assert.match(await p.textContent('.card[data-card="51"]'), /sek\./);              // ćwiczenie na czas
  // zostaje jedno ćwiczenie z planu i jedno dodane: po usunięciu dodanego ostatniego już się nie da
  await p.click('.card[data-card="51"] [data-more]'); await p.click('#sheet [data-del]'); await p.click('#ed-del'); await p.waitForSelector('.card[data-card="51"]', { state: 'detached' });
  await p.click('.card[data-card="1"] [data-more]'); await p.click('#sheet [data-del]');
  assert.match(await p.textContent('#toast'), /jedyne ćwiczenie/);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

for (const scheme of ['light', 'dark']) test(`Przypięta nazwa ćwiczenia ${scheme}: przy przewijaniu długiej karty nazwa zostaje u góry bez zmiany wyglądu i znika z końcem karty`, async () => {
  const row = (order, name, sets) => ({ week: 1, day: 'T1', title: 'Siła', date: '2026-12-01', order, name, prio: 'A', sets, reps: '3', pct: null, kg: 60, rpe: 8, note: '', extra: null, drop: 0, group: '', swaps: [], infos: [], parts: [] });
  const data = Object.assign({}, PRO, { plan: [row(1, 'Hang power snatch poniżej kolan z pauzą', 12), row(2, 'Przysiad', 12)] });
  const { ctx, p } = await page([], false, { data, scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  const st = () => p.evaluate(() => [...document.querySelectorAll('.card[data-card] > .ch')].map(ch => { const r = ch.getBoundingClientRect(), n = ch.querySelector('.cn').getBoundingClientRect();
    return { stuck: ch.classList.contains('stuck'), top: Math.round(r.top), h: Math.round(r.height), nameH: Math.round(n.height), head: Math.round(Math.max(0, document.querySelector('header').getBoundingClientRect().bottom)) }; }));
  const cardTop = n => p.evaluate(o => Math.round(document.querySelector(`.card[data-card="${o}"]`).getBoundingClientRect().top + scrollY), n);
  const to = async y => { await p.evaluate(v => window.scrollTo(0, v), y); await p.waitForTimeout(350); };
  let s = await st();
  assert.deepEqual(s.map(x => x.stuck), [false, false]);                            // na górze strony nic nie jest przypięte
  assert.ok(s[0].nameH > 40);                                                       // długa nazwa w karcie w dwóch liniach
  // granica przypięcia (zgłoszenie 22.11): tuż przed i tuż po przypięciu nazwa wygląda tak samo i stoi w tym samym miejscu
  const shot = async n => { if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `przypieta-${n}-${scheme}.png`) }); } };
  const name = () => p.evaluate(() => { const n = document.querySelector('.card[data-card="1"] .ch .cn'), r = n.getBoundingClientRect(), cs = getComputedStyle(n);
    return { y: Math.round(r.top), h: Math.round(r.height), fs: cs.fontSize, ell: n.scrollWidth > n.clientWidth }; });
  await to(await cardTop(1) - 2); const n0 = await name(); s = await st(); assert.equal(s[0].stuck, false); await shot('przed');
  await to(await cardTop(1) + 2); const n1 = await name(); s = await st(); assert.equal(s[0].stuck, true); await shot('po');
  assert.deepEqual([n1.fs, n1.h, n1.ell], [n0.fs, n0.h, false], JSON.stringify([n0, n1]));
  assert.ok(n1.y <= n0.y && n0.y - n1.y <= 4, JSON.stringify([n0, n1]));          // przesunięcie najwyżej o przewinięte 4 px
  const firstRow = () => p.evaluate(() => Math.round(document.querySelector('.card[data-card="1"] .rx').getBoundingClientRect().top));
  await to(await cardTop(1) + 60); const r0 = await firstRow(); await to(await cardTop(1) + 64); assert.equal(await firstRow(), r0 - 4);   // treść pod nazwą jedzie równo
  // przewinięcie w dół w środek pierwszej karty: górny pasek schowany, nazwa na samej górze, cała (dwie linie, bez wielokropka)
  await to(await cardTop(1) + 400); s = await st();
  assert.deepEqual([s[0].stuck, s[0].top, s[0].head, s[1].stuck], [true, 0, 0, false]);
  assert.deepEqual([s[0].nameH, (await name()).ell], [n0.h, false], JSON.stringify(s[0]));
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `przypieta-${scheme}.png`) }); }
  // ikony w przypiętym pasku działają: „⋯” otwiera akcje tego ćwiczenia
  await p.click('.card[data-card="1"] .ch [data-more]'); await p.waitForSelector('#sheet [data-mnote]');
  assert.match(await p.textContent('#sheet-t'), /Hang power snatch/);
  await p.click('#sheet [data-close]');
  // lekko w górę: górny pasek wraca, nazwa siedzi tuż pod nim
  await to(await cardTop(1) + 340); s = await st();
  assert.ok(s[0].head > 40 && s[0].stuck && Math.abs(s[0].top - s[0].head) <= 1, JSON.stringify(s[0]));
  // dalej w dół, do drugiej karty: pierwsza nazwa odjechała z kartą, przypięta jest druga
  await to(await cardTop(2) + 300); s = await st();
  assert.deepEqual([s[0].stuck, s[1].stuck, s[1].top], [false, true, 0]);
  assert.ok(s[0].top < 0);
  // zwinięta karta nie przypina nazwy
  await p.click('.card[data-card="2"] .ch .fold-c'); await p.waitForTimeout(100);
  assert.equal((await st())[1].stuck, false);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

for (const scheme of ['light', 'dark']) test(`Historia ćwiczenia ${scheme}: „Ostatnio” otwiera okno z wykresem i 5 ostatnimi treningami`, async () => {
  const { ctx, p } = await page([], false, { data: PROG, scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  assert.equal((await p.textContent('.card[data-card="1"] .last')).trim(), 'Ostatnio: 117,5 kg × 5 · RPE 8');
  assert.deepEqual(await a11y(p), []);                                              // przycisk „Ostatnio” ma ≥ 44 px
  await p.click('.card[data-card="1"] .last'); await p.waitForSelector('#sheet .hx-r');
  assert.match(await p.textContent('#sheet .sub'), /Przysiad tylny · ostatnie 5 treningów/);
  assert.equal((await p.$$('#sheet .hx-r')).length, 5);                             // z 7 zrobionych tygodni pokazujemy 5
  assert.equal((await p.$$('#sheet svg.chart .pt')).length, 5);
  assert.equal((await p.$$('#sheet svg.chart .pt.pr')).length, 4);                  // tydz. 5 był słabszy → nie rekord; liczone z całej historii
  const first = (await p.textContent('#sheet .hx-r')).replace(/\s+/g, ' ').trim();
  assert.match(first, /117,5 × 5 · 5 · 5 117,5 kg × 5 ?RPE 8$/);
  assert.equal((await p.$$('#sheet .hx-r .key.pr')).length, 4);
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `historia-${scheme}.png`) }); }
  await p.click('#sheet [data-close]');
  // boje: najlepsze zaliczone kg zamiast e1RM, ocena podejścia słownie, nieudana jako ✕
  await p.click('.card[data-card="2"] .last'); await p.waitForSelector('#sheet .hx-r');
  assert.match(await p.textContent('#sheet .dn-s'), /Najlepsze zaliczone/);
  assert.match((await p.textContent('#sheet .hx-r')).replace(/\s+/g, ' '), /77,5 × 2 · 2 · 2 77,5 kg × 2 ?Średnio/);
  assert.match(await p.textContent('#sheet'), /67,5 × 2 · 2 · ✕/);                   // tydz. 3: trzecie podejście spalone
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Historia ćwiczenia: bez wcześniejszych treningów nie ma „Ostatnio”; jeden trening = lista bez wykresu; PROSTY słownie', async () => {
  const none = await page([]);
  await none.p.goto(base + '?k=kabc'); await none.p.waitForSelector('.set[data-o="1"]');
  assert.equal(await none.p.$('.last'), null);
  await none.ctx.close();
  const data = Object.assign({}, DATA, { plan: DATA.plan.concat(DATA.plan.map(r => Object.assign({}, r, { week: 2, date: '2026-10-13' }))),
    logs: [{ id: 'robert|1|T1|1|1', zapisano: '2026-10-06T17:00:00.000Z', cwiczenie: 'Wyciskanie sztangi na ławce płaskiej', tydzien: 1, jednostka: 'T1', data: '2026-10-06', nr_cw: 1, seria: 1, kg: 50, powt: 8, rpe: 9, wykonane: 'TAK', typ: '' }],
    sessions: [{ id: 'robert|1|T1', tydzien: 1, jednostka: 'T1', data: '2026-10-06', czas_min: 50 }] });
  const { ctx, p } = await page([], false, { data });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.click('.last'); await p.waitForSelector('#sheet .hx-r');
  assert.match(await p.textContent('#sheet .sub'), /ostatni trening/);
  assert.equal(await p.$('#sheet svg.chart'), null);
  assert.match((await p.textContent('#sheet .hx-r')).replace(/\s+/g, ' '), /wt 06\.10 50 × 8 50 kg × 8 ?Ciężko/);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

for (const scheme of ['light', 'dark']) test(`Trening zrobiony ${scheme}: okno po zapisie jednostki, porównanie z poprzednią T1, rekord, przejście do Postępu`, async () => {
  const calls = [];
  const data = Object.assign({}, PROG, { sessions: PROG.sessions.slice() });       // atrapa pamięta zapisaną jednostkę jak serwer
  const { ctx, p } = await page(calls, false, { data, scheme, api: b => { if (b.fn === 'logSession') data.sessions.push({ id: 'robert|8|T1', tydzien: 8, jednostka: 'T1', czas_min: b.args[0].minutes, start: b.args[0].start }); } });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  assert.match(await p.textContent('#eyebrow'), /tydz\. 4 · T1/);                    // tydz. 8 = 4. tydzień bloku B2
  for (const n of [1, 2, 3]) await light(p, `.set[data-o="1"][data-s="${n}"]`, 'S');
  await p.evaluate(() => stopRest());
  await p.click('#saveSess'); await p.waitForSelector('#sheet .dn-t');
  assert.equal(calls.filter(c => c.fn === 'logSession').length, 1);
  assert.match(await p.textContent('#sheet-t'), /Trening zrobiony/);
  const tiles = await p.$$eval('#sheet .dn-t div', d => d.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  assert.match(tiles[0], /^Czas1 min▼ 59 min$/);                                    // poprzednio 60 min
  assert.match(tiles[1], /^Serie3 \/ 6$/);
  assert.match(tiles[2], /^Tonaż1\s?800 kg▼ 19%$/);                                  // 3 × 120 × 5 wobec 2 228 kg tydzień wcześniej
  assert.match(await p.textContent('#sheet .dn-cmp'), /Porównanie z poprzednim razem: T1, /);
  assert.match((await p.textContent('#sheet .kv')).replace(/\s+/g, ' '), /Przysiad tylny · e1RM, \+3,1 kg ?148 kg/);   // 120 × (1 + 7/30) wobec 144,9
  assert.equal((await p.$$('#sheet .kv')).length, 1);                               // rwanie bez podejść: bez rekordu
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `zrobiony-${scheme}.png`) }); }
  await p.click('#dn-go'); await p.waitForSelector('#postep .card');
  await p.waitForTimeout(200);
  assert.equal(calls.filter(c => c.fn === 'getData').length, 2);                    // Postęp dociąga świeże dane z serwera
  assert.equal(await p.$eval('#sheet', e => e.hidden), true);
  assert.equal(await p.$eval('[data-pt="tyd"]', b => b.getAttribute('aria-selected')), 'true');
  // poprawka zapisanej jednostki: bez okna, sam komunikat
  await p.click('#nav [data-tab="trening"]'); await p.fill('#smin', '62'); await p.click('#saveSess'); await p.waitForTimeout(200);
  assert.equal(await p.$eval('#sheet', e => e.hidden), true);
  assert.equal(await p.textContent('#toast'), 'Zmiany zapisane.');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Trening zrobiony bez sieci: okno z dopiskiem, zapis w kolejce; pierwsza jednostka bez porównania i rekordów', async () => {
  const { ctx, p } = await page([]);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.waitForTimeout(100);
  await ctx.unroute('**/macros/**'); await ctx.route('**/macros/**', r => r.abort());
  await p.evaluate(() => stopRest());
  await p.click('#saveSess'); await p.waitForSelector('#sheet .dn-t');
  assert.match(await p.textContent('#sheet'), /Brak sieci: zapiszę, gdy wróci połączenie\./);
  assert.equal(await p.$('#sheet .kv'), null);
  assert.equal(await p.$$eval('#sheet .dn-t small', x => x.length), 0);
  assert.deepEqual((await p.evaluate(() => JSON.parse(localStorage.getItem('q_kabc')))).map(x => x.fn), ['logSession']);
  await p.click('#sheet [data-close]');
  assert.equal(await p.$eval('#sheet', e => e.hidden), true);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

for (const scheme of ['light', 'dark']) test(`Postęp → Blok ${scheme}: raport po bloku, ◀ ▶ między blokami, notatka trenera do bloku`, async () => {
  const data = Object.assign({}, PROG, { blockNotes: { B1: 'Dobry blok: przysiad rośnie równo.\nW B2 więcej rwania.' } });
  const { ctx, p } = await page([], false, { data, scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="postep"]'); await p.click('[data-pt="blok"]'); await p.waitForSelector('#postep .dn-t');
  const kv = () => p.$$eval('#postep .kv', r => r.map(x => x.querySelector('span').textContent + ' = ' + x.querySelector('b').textContent).join('\n'));
  // domyślnie ostatni blok: B2, ostatni dzień planu (tydz. 8, wczoraj) minął bez treningu → zakończony, 3 z 4
  assert.match(await p.textContent('#postep .wk-t'), /Blok B2 · zakończony.*tydz\. 5–8/s);
  assert.match(await p.textContent('#postep .dn-t'), /Wykonanie\s*75 %\s*3 z 4 treningów/);
  assert.equal(await p.$eval('[data-pb]', b => b.dataset.pb), 'B1');
  assert.equal(await p.$eval('.wk-a[aria-label="Następny blok"]', b => b.disabled), true);
  assert.equal(await p.$('#postep .bl-note'), null);                                 // B2 bez notatki trenera
  await p.click('[data-pb="B1"]');
  assert.match(await p.textContent('#postep .wk-t'), /Blok B1 · zakończony.*tydz\. 1–4/s);
  assert.match(await p.textContent('#postep .dn-t'), /Wykonanie\s*100 %\s*4 z 4 treningów/);
  assert.match(await p.textContent('#postep .dn-t'), /Czas\s*4 h 20\s*4 × ok\. 65 min/);   // 60 + 60 + 60 + 80 min
  const t = await kv();
  assert.match(t, /^ Przysiad tylny · e1RM, \+7,3% = 126 → 136 kg$/m);              // 102,5 → 110 kg × 5 @ 8
  assert.match(t, /^ Rwanie · najcięższe zaliczone = 70 kg$/m);
  assert.match(t, /^RPE sesji · 6 · 6 · 6 · 9 = śr\. 6,8$/m);
  assert.match(t, /^Dyspozycja = 4× dobra$/m);
  assert.equal((await p.$$('#postep svg.chart .pt')).length, 4);
  assert.equal(await p.textContent('#postep .bl-note'), 'Dobry blok: przysiad rośnie równo.\nW B2 więcej rwania.');
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') await p.screenshot({ path: path.join(SCREENS, `postep-blok-${scheme}.png`), fullPage: true });
  await p.click('[data-pt="sila"]'); await p.click('[data-pt="blok"]');
  assert.match(await p.textContent('#postep .wk-t'), /Blok B1/);                     // wybrany blok zostaje przy zmianie zakładki
  assert.deepEqual(p.external, []); assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Postęp → Blok: plan bez bloków = karta z przejściem do treningu', async () => {
  const { ctx, p } = await page([]);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="postep"]'); await p.click('[data-pt="blok"]');
  assert.match(await p.textContent('#postep .es'), /Tu będzie raport z bloku/);
  await p.click('#postep [data-go="trening"]'); await p.waitForSelector('.set');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

for (const scheme of ['light', 'dark']) test(`Notatka trenera do jednostki ${scheme}: karta „Od trenera” nad treningiem, w trybie skupienia tylko na pierwszym kroku`, async () => {
  const note = 'Dziś lżej w przysiadzie.\nJeśli kolano boli > 3/10, zamień na goblet <b>.';
  const data = Object.assign({}, PRO, { plan: PRO.plan.map(r => Object.assign({}, r, r.order === 2 ? { unote: note } : {})) });
  const { ctx, p } = await page([], false, { data, scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  assert.equal(await p.textContent('#unote p'), note);                                // tekst, nie HTML
  assert.ok(await p.$eval('#unote', e => e.compareDocumentPosition(document.querySelector('#today')) & Node.DOCUMENT_POSITION_FOLLOWING));
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') await p.screenshot({ path: path.join(SCREENS, `notatka-jednostki-${scheme}.png`) });
  await p.click('#umore'); await p.click('#fx-sw'); await p.waitForSelector('#fx-next');
  assert.equal(await p.isVisible('#unote'), true);
  await p.click('#fx-next'); assert.equal(await p.isVisible('#unote'), false);
  assert.deepEqual(p.errors, []);
  await ctx.close();
  const { ctx: c2, p: p2 } = await page([], false, { data: PRO });                  // jednostka bez notatki: bez karty
  await p2.goto(base + '?k=kabc'); await p2.waitForSelector('.set');
  assert.equal(await p2.$('#unote'), null);
  await c2.close();
});

for (const scheme of ['light', 'dark']) test(`Postęp → Tydzień ${scheme}: wykonanie, rekordy, odczucia, przełączanie tygodni`, async () => {
  // każdy tydzień kalendarzowy ma dokładnie jedną jednostkę PROG (co 7 dni); ostatnia zrobiona (tydz. 7) jest sprzed 8 dni,
  // czyli zwykle w poprzednim tygodniu kalendarzowym, a w poniedziałek dwa tygodnie wstecz (26.10 test przez to nie przechodził)
  const mon = d => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; };
  const back = Math.round((mon(new Date()) - mon(PROG.sessions[6].data + 'T12:00:00')) / (7 * 864e5));
  const data = Object.assign({}, PROG, { sessions: PROG.sessions.map(x => Object.assign({}, x, { bol: 'kolano:2' })),
    logs: PROG.logs.concat(PROG.sessions.map(x => ({ id: x.id.replace('|T1', '|T1') + '|3|0', tydzien: x.tydzien, jednostka: 'T1', data: x.data, nr_cw: 3, cwiczenie: 'Face pull', seria: 0, typ: 'SKIP', uwagi: 'brak czasu', wykonane: '' }))) });
  const { ctx, p } = await page([], false, { data, scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="postep"]');
  assert.equal(await p.$eval('[data-pt="tyd"]', b => b.getAttribute('aria-selected')), 'true');
  assert.equal(await p.$eval('[data-pw="1"]', b => b.disabled), true);              // dalej niż bieżący tydzień się nie da
  for (let i = 0; i < back; i++) await p.click('[data-pw="-1"]');
  const t = (await p.$$eval('#postep .kv', r => r.map(x => x.querySelector('span').textContent + ' = ' + x.querySelector('b').textContent))).join('\n');
  assert.match(t, /^Jednostki z planu · T1 ✓ = 1 z 1$/m);
  assert.match(t, /^Serie · w planie = 6 z 6$/m);
  assert.match(t, /^Tonaż · ▲ \d+% wobec śr\. 4 tyg\. = [\d\s]+ kg$/m);
  assert.match(t, /^Czas = 1 h 0 min$/m);
  assert.deepEqual(await p.$$eval('#postep .card', c => c.map(x => x.querySelector('.cn').textContent)), ['Wykonanie', 'Rekordy tygodnia', 'Jak było', 'Do zauważenia']);
  assert.match(t, / Przysiad tylny · e1RM, \+[\d,]+ kg = [\d,]+ kg$/m); assert.match(t, / Rwanie · zaliczone, \+2,5 kg = 7\d,5 kg$/m);
  assert.match(t, /^RPE sesji · 6 = śr\. 6$/m); assert.match(t, /^Ból · kolano = max 2\/10$/m); assert.match(t, /^Dyspozycja = 1× dobra$/m);
  assert.match(t, /^Pominięte: Face pull · brak czasu = T1$/m);
  assert.equal(await p.$eval('[data-pw="0"]', b => b.getAttribute('aria-pressed')), null);
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') await p.screenshot({ path: path.join(SCREENS, `postep-tydzien-${scheme}.png`), fullPage: true });
  await p.click('[data-pw="0"]');
  assert.equal(await p.$eval('[data-pw="0"]', b => b.getAttribute('aria-pressed')), 'true');
  assert.deepEqual(p.external, []); assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Postęp: bez historii czytelne komunikaty zamiast pustych wykresów', async () => {
  const { ctx, p } = await page([], false, { data: PRO });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="postep"]');
  assert.match(await p.textContent('#postep'), /W tym tygodniu jeszcze nic/);              // domyślnie Tydzień
  await p.click('[data-pt="sila"]');
  assert.match(await p.textContent('#postep'), /Wykres pojawi się po pierwszych treningach/);
  await p.click('[data-pt="obj"]'); assert.match(await p.textContent('#postep'), /Objętość pojawi się/);
  await p.click('[data-pt="dys"]'); assert.match(await p.textContent('#postep'), /po pierwszych zapisach na ekranie Dyspozycja/);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// --- uwagi klientów 12.10: „Wszystko jak w planie” i przypadkowy start czasu ---
test('„Wszystko jak w planie”: znika po ręcznym odhaczeniu serii, wraca po wyczyszczeniu, nigdy „0 serii”', async () => {
  const calls = [];
  const { ctx, p } = await page(calls);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  assert.equal(await p.isVisible('[data-all="1"]'), true);
  for (const s of [1, 2, 3]) await p.click(`.set[data-o="1"][data-s="${s}"] .ok`);
  assert.equal(await p.isHidden('[data-all="1"]'), true);                        // wszystko odhaczone ręcznie → przycisk znika
  await p.click('.set[data-o="1"][data-s="2"] .ok'); await p.click('.set[data-o="1"][data-s="2"] .ok');   // ✓ → ✕ → puste
  assert.equal(await p.isVisible('[data-all="1"]'), true);
  const before = calls.filter(c => c.fn === 'logSet').length;
  await p.click('[data-all="1"]'); await p.waitForTimeout(100);
  assert.equal(await p.textContent('#toast'), 'Zapisano 1 serię.');
  assert.equal(calls.filter(c => c.fn === 'logSet').length, before + 1);
  assert.equal(await p.isHidden('[data-all="1"]'), true);
  await p.reload(); await p.waitForSelector('.set[data-o="1"]');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Czas treningu: przypadkowy start 2 h wcześniej → liczy od pierwszej zapisanej serii; „Licz czas od teraz”; ręczna poprawka minut', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: PRO });
  await p.clock.install({ time: new Date('2026-10-06T14:00:00') });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.fill('.set[data-o="1"][data-s="1"] .kg', '55');                        // przypadkowe dotknięcie pola: czas rusza
  await p.clock.fastForward(2 * 3600 * 1000); await p.clock.runFor(1100);
  assert.match(await p.textContent('#stats .clock'), /^2:00:0\d$/);
  await p.click('.set[data-o="1"][data-s="1"] .ok');                             // pierwsza seria po 2 h
  assert.equal(await p.textContent('#toast'), 'Czas treningu liczę od teraz.');
  await p.clock.runFor(1100);
  assert.match(await p.textContent('#stats .clock'), /^00:0[0-2]$/);
  await p.clock.fastForward(40 * 60000);
  await p.click('.set[data-o="1"][data-s="2"] .ok');                             // kolejne serie już nie zerują
  await p.clock.runFor(1100);
  assert.match(await p.textContent('#stats .clock'), /^40:0\d$/);
  // ręczne „Licz czas od teraz”: dwa dotknięcia
  await p.click('#t-reset'); assert.match(await p.textContent('#t-reset'), /Na pewno/);
  await p.click('#t-reset'); await p.clock.fastForward(5 * 60000); await p.clock.runFor(1100);
  assert.match(await p.textContent('#stats .clock'), /^05:0\d$/);
  await p.click('#saveSess'); await p.waitForTimeout(0); await p.clock.runFor(300);
  assert.equal(calls.find(c => c.fn === 'logSession').args[0].minutes, 5);
  // po zapisaniu: poprawka minut ręcznie
  await p.click('#sheet [data-close]');                                          // okno „Trening zrobiony”
  await p.waitForSelector('#smin'); assert.equal(await p.inputValue('#smin'), '5');
  assert.equal(await p.$('#t-reset'), null);
  await p.fill('#smin', '62'); await p.click('#saveSess'); await p.clock.runFor(300);
  assert.equal(calls.filter(c => c.fn === 'logSession').pop().args[0].minutes, 62);
  assert.deepEqual(await a11y(p), []);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// --- v3 PR 3: zakładka Ćwiczenia – instruktaż i partie ---
test('Ćwiczenia: „Jak wykonać” z linkiem z bazy, kompleks z filmem każdej części, serie twarde na partię w Postęp → Objętość', async () => {
  const data = Object.assign({}, PROG, { cfg: Object.assign({}, PROG.cfg, { swap: true }), parts: { 'przysiad tylny': ['nogi'], 'rwanie': ['całe ciało'] },
    plan: PROG.plan.map(r => Object.assign({}, r, r.name === 'Przysiad tylny' ? { infos: [{ n: 'Back Squat', u: 'https://example.test/przysiad' }], parts: ['nogi'] }
      : { infos: [{ n: 'Hang Snatch', u: 'https://example.test/hs' }, { n: 'Overhead Squat', u: 'https://example.test/ohs' }], parts: ['całe ciało'] })) });
  const { ctx, p } = await page([], false, { data });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  const inf = () => p.$$eval('a.inf', a => a.map(x => [x.getAttribute('href'), x.target, x.rel, x.textContent.trim() || x.getAttribute('aria-label'), Math.round(x.getBoundingClientRect().height) >= 44]));
  assert.deepEqual(await inf(), [['https://example.test/przysiad', '_blank', 'noopener', 'Jak wykonać: Przysiad tylny', true]]);   // jeden film = ikona-link w nagłówku
  await p.click('[data-inf]');                                                    // kompleks: lista z filmem każdej części
  assert.deepEqual((await inf()).slice(1), [['https://example.test/hs', '_blank', 'noopener', '▶Hang Snatch', true], ['https://example.test/ohs', '_blank', 'noopener', '▶Overhead Squat', true]]);
  await p.click('#sheet [data-close]');
  // ikony nagłówka w tym samym miejscu w każdej karcie, niezależnie od długości nazwy i od tego, czy jest film
  const xs = await p.$$eval('.card[data-card] .more', b => b.map(x => Math.round(x.getBoundingClientRect().left)));
  assert.equal(new Set(xs).size, 1);
  await p.click('[data-more="1"]'); await p.click('#sheet [data-swap="1"]'); await p.click('#sheet [data-to]'); await p.click('#sheet [data-why="Brak sprzętu"]'); await p.click('#sw-ok');
  assert.equal((await p.$$('a.inf')).length, 0); assert.equal((await p.$$('[data-inf]')).length, 1);                                 // po zamianie instruktaż oryginału znika
  await p.click('[data-unswap="1"]');
  await p.click('#nav [data-tab="postep"]'); await p.click('[data-pt="obj"]');
  const hp = await p.$$eval('.hp', r => r.map(x => [x.querySelector('span').textContent, x.querySelector('.hpb').getAttribute('aria-label')]));
  assert.deepEqual(hp.map(x => x[0]).sort(), ['całe ciało', 'nogi']);
  assert.match(hp.find(x => x[0] === 'nogi')[1], /^nogi: \d+ serii twardych, średnio [\d,]+$/);
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.$eval('.hp', e => e.scrollIntoView({ block: 'center' })); await p.screenshot({ path: path.join(SCREENS, 'partie.png') }); }
  assert.deepEqual(p.external, []); assert.deepEqual(p.errors, []);
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
  assert.ok(await p.evaluate(async () => !!(await navigator.serviceWorker.ready)));   // czeka na rejestrację zamiast zgadywać czas
  await ctx.close();
});

// --- v4: komentarze trenera ---
test('Komentarze trenera: karta z nowymi, „Przeczytane”, zakładka Trener z wszystkimi, kropka w menu, zmieniony komentarz wraca', async () => {
  const mk = txt => Object.assign({}, PROG, { logs: PROG.logs.map((l, i) => i === 0 ? Object.assign({}, l, { komentarz_dysk: txt }) : l),
    sessions: PROG.sessions.map((s, i) => i === 0 ? Object.assign({}, s, { komentarz_trenera: 'Dobry trening <b>!</b>' }) : s) });
  const { ctx, p } = await page([], false, { data: mk('0:15 Łokcie wyżej\nOgólnie dobrze') });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.cnote');
  assert.equal(await p.$eval('.cnote h3', e => e.textContent), 'Trener skomentował');
  const items = await p.$$eval('.cnote .cn-l li', li => li.map(x => [x.querySelector('.cn-h').textContent.replace(/ · \d\d\.\d\d$/, ''), [...x.querySelectorAll('p')].map(q => q.textContent)]));
  assert.deepEqual(items.sort(), [['Przysiad tylny · seria 1', ['0:15 Łokcie wyżej', 'Ogólnie dobrze']], ['Trening T1', ['Dobry trening <b>!</b>']]]);   // treść jako tekst, nie HTML
  assert.equal(await p.$eval('.cnote .cn-t', e => e.textContent), '0:15');
  assert.ok(await p.$('#nav [data-tab="trener"] .nd'));                         // kropka: są nieprzeczytane
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'komentarze.png') }); }
  await p.click('#cn-ok');
  assert.equal(await p.$('.cnote'), null);
  assert.equal(await p.$('#nav [data-tab="trener"] .nd'), null);
  await p.click('#nav [data-tab="trener"]');
  assert.equal(await p.$eval('#title', e => e.textContent), 'Trener');
  assert.equal((await p.$$('#trener .cn-l li')).length, 2);
  assert.equal(await p.$('#trener .cw-new'), null);                              // przeczytane wcześniej: bez „NOWE”
  // komentarz do całego treningu na początku jednostki, potem serie
  assert.deepEqual(await p.$$eval('#trener .cn-l li .cn-h', h => h.map(x => x.textContent)), ['Trening T1', 'Przysiad tylny · seria 1']);
  assert.deepEqual(await a11y(p), []);
  await ctx.close();
  // nowy komentarz: kropka, wejście w zakładkę = „NOWE” do wyjścia, potem przeczytane
  const t3 = await page([], false, { data: mk('0:20 Kolana na zewnątrz') });
  await t3.p.goto(base + '?k=kabc'); await t3.p.waitForSelector('.cnote');
  await t3.p.click('#cn-all');
  assert.equal(await t3.p.$eval('#title', e => e.textContent), 'Trener');
  assert.equal((await t3.p.$$('#trener .cw-new')).length, 2);
  assert.equal(await t3.p.$('#nav [data-tab="trener"] .nd'), null);
  for (const dark of [false, true]) {
    await t3.p.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
    if (process.env.SCREENS !== '0') await t3.p.screenshot({ path: path.join(SCREENS, 'trener-' + (dark ? 'ciemny' : 'jasny') + '.png') });
  }
  await t3.p.click('#nav [data-tab="trening"]'); await t3.p.click('#nav [data-tab="trener"]');
  assert.equal(await t3.p.$('#trener .cw-new'), null);
  await t3.p.reload(); await t3.p.waitForSelector('.set');                      // przeczytane zostają przeczytane
  assert.equal(await t3.p.$('.cnote'), null);
  assert.deepEqual(t3.p.external, []); assert.deepEqual(t3.p.errors, []);
  await t3.ctx.close();
  const t2 = await page([], false, { data: PROG });                             // bez komentarzy: nic się nie pojawia
  await t2.p.goto(base + '?k=kabc'); await t2.p.waitForSelector('.set');
  assert.deepEqual([await t2.p.$('.cnote'), await t2.p.$('#nav [data-tab="trener"] .nd')], [null, null]);
  await t2.p.click('#nav [data-tab="trener"]');
  assert.match(await t2.p.$eval('#trener', e => e.textContent), /Tu pojawią się komentarze/);
  await t2.ctx.close();
});

test('Odpowiedź na komentarz trenera: pisanie, wysyłka (replyNote), zmiana, usunięcie, bez sieci przez kolejkę', async () => {
  const data = Object.assign({}, PROG, { logs: PROG.logs.map((l, i) => i === 0 ? Object.assign({}, l, { komentarz_trenera: '0:15 Łokcie wyżej' }) : l),
    sessions: PROG.sessions.map((s, i) => i === 0 ? Object.assign({}, s, { komentarz_trenera: 'Dobry trening', odpowiedz_klienta: 'Dzięki <b>!</b>', odpowiedz_at: '2026-10-01T10:00:00.000Z' }) : s) });
  const calls = [];
  const { ctx, p } = await page(calls, false, { data });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.cnote');
  await p.click('#nav [data-tab="trener"]'); await p.waitForSelector('#trener .cn-rep');
  const sesId = data.sessions[0].id, logId = data.logs[0].id;
  const rep = id => '#trener .cn-rep[data-rk="' + id + '"]';
  // wcześniejsza odpowiedź jako tekst (nie HTML), z „Zmień”; komentarz bez odpowiedzi ma „↩ Odpowiedz”
  assert.match(await p.textContent(rep('S|' + sesId)), /Twoja odpowiedź · 01\.10\s*Dzięki <b>!<\/b>\s*Zmień/);
  assert.equal(await p.textContent(rep('L|' + logId) + ' button'), '↩ Odpowiedz');
  await p.click(rep('L|' + logId) + ' [data-rep-ed]');
  assert.ok(await p.$eval(rep('L|' + logId) + ' textarea', t => t === document.activeElement));   // pole od razu gotowe do pisania
  await p.keyboard.type('Spróbuję z pauzą');
  assert.equal(await p.textContent(rep('L|' + logId) + ' .cnt'), '16/600');
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'odpowiedz-pisanie.png') }); }
  await p.click(rep('L|' + logId) + ' [data-rep-go]');
  await p.waitForFunction(() => document.querySelector('#toast').textContent === 'Wysłano trenerowi.');
  assert.deepEqual(calls.filter(c => c.fn === 'replyNote').map(c => c.args[0]), [{ kind: 'L', id: logId, text: 'Spróbuję z pauzą' }]);
  assert.match(await p.textContent(rep('L|' + logId)), /Twoja odpowiedź · \d\d\.\d\d\s*Spróbuję z pauzą/);
  // zmiana: pole z dotychczasowym tekstem, „Anuluj” nic nie wysyła, „Usuń” czyści odpowiedź
  await p.click(rep('S|' + sesId) + ' [data-rep-ed]');
  assert.equal(await p.inputValue(rep('S|' + sesId) + ' textarea'), 'Dzięki <b>!</b>');
  await p.click(rep('S|' + sesId) + ' [data-rep-x]');
  assert.equal(calls.filter(c => c.fn === 'replyNote').length, 1);
  await p.click(rep('S|' + sesId) + ' [data-rep-ed]'); await p.click(rep('S|' + sesId) + ' [data-rep-del]');
  assert.deepEqual(calls.filter(c => c.fn === 'replyNote').pop().args[0], { kind: 'S', id: sesId, text: '' });
  assert.equal(await p.textContent(rep('S|' + sesId) + ' button'), '↩ Odpowiedz');
  // pusta odpowiedź nic nie wysyła
  await p.click(rep('S|' + sesId) + ' [data-rep-ed]'); await p.click(rep('S|' + sesId) + ' [data-rep-go]');
  assert.equal(calls.filter(c => c.fn === 'replyNote').length, 2);
  assert.deepEqual(p.errors, []);
  await ctx.close();
  // bez sieci: odpowiedź czeka w kolejce i jest widoczna po ponownym otwarciu (dane z pamięci telefonu bez odpowiedzi)
  const t2 = await page([], false, { data });
  await t2.p.goto(base + '?k=kabc'); await t2.p.waitForSelector('.cnote');
  await t2.ctx.unroute('**/macros/**'); await t2.ctx.route('**/macros/**', r => r.abort());
  await t2.p.click('.cnote .cn-rep[data-rk="L|' + logId + '"] [data-rep-ed]');
  await t2.p.keyboard.type('Bez sieci');
  await t2.p.click('.cnote .cn-rep[data-rk="L|' + logId + '"] [data-rep-go]');
  await t2.p.waitForFunction(() => /Brak sieci/.test(document.querySelector('#toast').textContent));
  await t2.p.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.logs[0].odpowiedz_klienta = ''; localStorage.setItem(k, JSON.stringify(d)); }, 'd_kabc');
  await t2.p.reload(); await t2.p.waitForSelector('.cnote');
  assert.match(await t2.p.textContent('.cnote .cn-rep[data-rk="L|' + logId + '"]'), /Bez sieci/);
  assert.equal(await t2.p.evaluate(() => JSON.parse(localStorage.getItem('q_kabc')).filter(q => q.fn === 'replyNote').length), 1);
  assert.deepEqual(t2.p.errors, []);
  await t2.ctx.close();
});

// --- kolejka filmów: wysyłka kawałkami prosto do Google, przerwana i wznowiona po ponownym otwarciu ---
test('Film w kolejce: kawałki po 8 MB, przerwa w połowie, wznowienie po ponownym otwarciu od miejsca przerwania', async () => {
  const calls = [], UP = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink&upload_id=ABC-123';
  const api = b => b.fn === 'startUpload' ? { uploadId: 'u1', chunk: 4194304, url: UP } : b.fn === 'uploadStatus' ? { next: 8388608 } : null;
  const { ctx, p } = await page(calls, false, { data: PRO, api });
  const puts = []; let cut = true;
  await ctx.route('https://www.googleapis.com/upload/**', async r => {
    const q = r.request(), cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT', 'Access-Control-Allow-Headers': 'Content-Range, Content-Type' };
    if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    const range = q.headers()['content-range'] || '', len = (q.postDataBuffer() || Buffer.alloc(0)).length;
    puts.push([range, len]);
    if (/^bytes 0-/.test(range)) return r.fulfill({ status: 308, headers: cors });
    if (cut) { cut = false; return r.abort('internetdisconnected'); }               // przerwa: telefon w kieszeni, brak zasięgu
    return r.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: JSON.stringify({ id: 'f9', webViewLink: 'https://drive.google.com/file/d/f9/view' }) });
  });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.click('.set[data-o="1"][data-s="1"] .cam');
  const BIG = { name: 'duzy.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(9 * 1048576 + 123, 7) };
  await p.setInputFiles('#cam-file', BIG); await p.waitForSelector('#sheet', { state: 'hidden' });
  for (let i = 0; i < 100 && puts.length < 2; i++) await p.waitForTimeout(100);     // czeka na drugi kawałek (do 10 s) zamiast sztywnych 1,5 s: na wolniejszym komputerze 8 MB szło dłużej i test padał bez powodu
  await p.waitForTimeout(300);                                                      // chwila na obsługę przerwanej wysyłki
  assert.deepEqual(puts, [['bytes 0-8388607/9437307', 8388608], ['bytes 8388608-9437306/9437307', 1048699]]);
  assert.equal(calls.filter(c => c.fn === 'logVideo').length, 0);
  assert.equal(await p.$eval('.set[data-o="1"][data-s="1"] .cam', b => b.classList.contains('pend')), true);
  await p.reload(); await p.waitForSelector('.set[data-o="1"]');                   // aplikacja otwarta ponownie: plik czekał w telefonie
  await p.waitForFunction(() => /Film wysłany/.test(document.querySelector('#toast').textContent), null, { timeout: 10000 });
  assert.deepEqual(calls.filter(c => c.fn === 'uploadStatus').map(c => c.args), [[UP, 9437307]]);
  assert.deepEqual(puts.slice(2), [['bytes 8388608-9437306/9437307', 1048699]]);    // tylko brakujący kawałek, nie od zera
  assert.equal(calls.filter(c => c.fn === 'startUpload').length, 1);
  assert.equal(calls.find(c => c.fn === 'logVideo').args[0].link, 'https://drive.google.com/file/d/f9/view');
  assert.equal(await p.$eval('.set[data-o="1"][data-s="1"] .cam', b => b.classList.contains('pend')), false);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// --- układ: zwijanie ćwiczeń, opcje w tabeli, zmiana przechodzi na kolejne serie, zapomniany start zegara ---
test('Karta ćwiczenia: wiersze „+”, kg → talerze, zmiana na kolejne serie, zwijanie samo i ręcznie, zegar po 4 h', async () => {
  const calls = [];
  const { ctx, p } = await page(calls);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  assert.equal(await p.$('[data-copy]'), null);                                   // „Jak 1. seria” zastąpione
  assert.deepEqual(await p.$$eval('.card[data-card="1"] .ghost', b => b.map(x => x.textContent.trim().replace(/\s+/g, ' '))), ['+ rozgrzewka', '+ seria (1)', '+ drop set']);
  await p.click('.card[data-card="1"] .kgb'); assert.equal(await p.textContent('#sheet-t'), 'Talerze'); await p.click('#sheet [data-close]');
  await p.fill('.set[data-o="1"][data-s="1"] .kg', '55'); await p.dispatchEvent('.set[data-o="1"][data-s="1"] .kg', 'change');
  assert.deepEqual(await p.$$eval('.set[data-o="1"][data-k="p"] .kg', i => i.map(x => x.value || x.dataset.ph)), ['55', '55', '55']);
  await p.fill('.set[data-o="1"][data-s="3"] .kg', '50'); await p.dispatchEvent('.set[data-o="1"][data-s="3"] .kg', 'change');
  await p.fill('.set[data-o="1"][data-s="1"] .kg', '60'); await p.dispatchEvent('.set[data-o="1"][data-s="1"] .kg', 'change');
  assert.deepEqual(await p.$$eval('.set[data-o="1"][data-k="p"] .kg', i => i.map(x => x.value || x.dataset.ph)), ['60', '60', '50']);   // inną wartość zostawia
  await p.evaluate(() => { const m = tGet(); m[skey()] = Date.now() - 6 * 864e5; tSet(m); tick(); });      // start sprzed 6 dni
  assert.equal(await p.textContent('#stats .clock'), '–');
  await p.click('[data-all="1"]');
  assert.match(await p.textContent('#stats .clock'), /^00:0\d$/);                 // pierwsza zapisana seria liczy od teraz
  await p.waitForSelector('.card[data-card="1"].fold', { timeout: 3000 });        // ostatnia seria → ćwiczenie się zwija
  assert.match(await p.textContent('.card[data-card="1"] .fsum'), /^3 z 3 serii · [\d ]+ kg · ✓ · ★ pierwszy wynik$/);
  assert.equal(await p.getAttribute('.card[data-card="1"] .fold-b', 'aria-expanded'), 'false');
  assert.equal(await p.isVisible('.set[data-o="1"][data-s="1"]'), false);
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.$eval('.card[data-card="1"]', e => { e.scrollIntoView({ block: 'center' }); document.querySelector('#toast').style.display = 'none'; }); await p.screenshot({ path: path.join(SCREENS, 'zwiniete.png') }); }
  await p.click('.card[data-card="1"] .fold-b');                                   // otwarcie ręczne zostaje po ponownym wejściu
  assert.equal(await p.isVisible('.set[data-o="1"][data-s="1"]'), true);
  await p.reload(); await p.waitForSelector('.set[data-o="1"]');
  assert.equal(await p.$('.card[data-card="1"].fold'), null);
  await p.click('.card[data-card="2"] .fold-b');                                   // niezrobione też można zwinąć
  assert.equal(await p.$eval('.card[data-card="2"]', c => c.classList.contains('fold')), true);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Pasek skoku ciężaru i „jak poprzednia”: +2,5 / +5 / przytrzymanie +1, ✓ przenosi na kolejne, ręczne wartości zostają', async () => {
  const calls = [];
  const { ctx, p } = await page(calls);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.step[data-o="1"]');
  const kgs = () => p.$$eval('.set[data-o="1"][data-k="p"] .kg', i => i.map(x => x.value || x.dataset.ph + '*'));
  assert.deepEqual(await kgs(), ['50*', '50*', '50*']);                         // * = propozycja w placeholderze (szara), pole puste
  assert.deepEqual(await p.$$eval('.set[data-o="1"][data-k="p"] .kg', i => i.map(x => x.placeholder + '|' + x.inputMode)), ['50|decimal', '50|decimal', '50|decimal']);
  assert.equal(await p.$eval('.step[data-o="1"]', s => s.previousElementSibling.dataset.s), '1');
  await p.click('.step[data-o="1"] [data-d="2.5"]');
  assert.deepEqual(await kgs(), ['52,5', '52,5*', '52,5*']);
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.waitForTimeout(80);
  assert.equal(await p.$eval('.step[data-o="1"]', s => s.previousElementSibling.dataset.s), '2');   // pasek przechodzi do następnej serii
  assert.equal(await p.textContent('.step[data-o="1"] b'), '52,5 kg');
  await p.click('.step[data-o="1"] [data-d="5"]');
  assert.deepEqual(await kgs(), ['52,5', '57,5', '57,5*']);
  const b = await p.$('.step[data-o="1"] [data-d="-2.5"]'), r = await b.boundingBox();
  await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await p.mouse.down(); await p.waitForTimeout(650); await p.mouse.up();
  assert.deepEqual(await kgs(), ['52,5', '56,5', '56,5*']);                       // przytrzymanie = −1 kg
  await p.fill('.set[data-o="1"][data-s="3"] .kg', '40'); await p.dispatchEvent('.set[data-o="1"][data-s="3"] .kg', 'change');
  await p.fill('.set[data-o="1"][data-s="2"] .reps', '6'); await p.dispatchEvent('.set[data-o="1"][data-s="2"] .reps', 'change');
  await p.click('.set[data-o="1"][data-s="2"] .ok'); await p.waitForTimeout(80);
  assert.deepEqual(await kgs(), ['52,5', '56,5', '40']);                          // ręczne 40 zostaje
  assert.equal(await fval(p, '.set[data-o="1"][data-s="3"] .reps'), '6');    // powtórzenia poszły za serią 2
  assert.equal(await p.textContent('.step[data-o="1"] b'), '40 kg');
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.$eval('.step[data-o="1"]', e => e.scrollIntoView({ block: 'center' })); await p.screenshot({ path: path.join(SCREENS, 'skok.png') }); }
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Pasek przerwy leży na menu, nie nachodzi na nie', async () => {
  const { ctx, p } = await page([]);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.waitForSelector('#rest:not([hidden])');
  const g = await p.evaluate(() => { const r = document.querySelector('#rest').getBoundingClientRect(), n = document.querySelector('.nav').getBoundingClientRect(); return [Math.round(r.bottom * 2) / 2, Math.round(n.top * 2) / 2]; });
  assert.equal(g[0], g[1]);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'przerwa.png'), clip: { x: 0, y: 844 - 160, width: 390, height: 160 } }); }
  await ctx.close();
});

// --- własny trening klienta ---
test('Własny trening: Plan → wyszukiwarka z bazy, własna nazwa, zapis W1, trening jak każdy, „+ ćwiczenie”, ponowne otwarcie', async () => {
  const calls = [], data = Object.assign({}, DATA, { plan: DATA.plan.slice(), exNames: [['Hammer Curl', 'https://example.test/hc', 'biceps'], ['EZ-Curl', 'https://example.test/ez', 'biceps'], ['Barbell Curl', '', 'biceps'], ['Pull-up', 'https://example.test/pu', 'plecy; biceps'], ['Plank', '', 'brzuch']] });
  const api = b => {                                                             // serwer: zapis jednostki do Planu
    if (b.fn === 'getExNames') return data.exNames;
    if (b.fn !== 'addOwnUnit') return null;
    const u = b.args[0];
    data.plan = data.plan.filter(r => !(r.week === u.week && r.day === u.day)).concat(u.exercises.map((e, i) => ({ week: u.week, day: u.day, title: 'Własny · ' + u.title, date: u.date, order: i + 1,
      name: e.name, prio: 'A', sets: e.sets, reps: e.reps, pct: null, kg: e.kg === '' ? '' : Number(e.kg.replace(',', '.')), rpe: '', note: '', extra: null, drop: 0, group: '', block: '', swaps: [], infos: [], parts: [], own: true })));
    return { ok: true };
  };
  const { ctx, p } = await page(calls, false, { data, api });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.click('#nav [data-tab="plan"]'); await p.click('#own-new');
  assert.equal(await p.textContent('#sheet-t'), 'Własny trening');
  assert.match(await p.textContent('#ow-res'), /Twoje ćwiczenia/);                // pusto: ćwiczenia z planu
  await p.waitForFunction(() => EXN.list.length > 0);                          // nazwy z bazy pobrane dopiero teraz
  await p.fill('#ow-q', 'curl'); await p.dispatchEvent('#ow-q', 'input');
  assert.deepEqual(await p.$$eval('#ow-res .ow-add', b => b.map(x => x.textContent.trim())), ['Hammer Curlfilm', 'EZ-Curlfilm', 'Barbell Curl', '+ Dodaj „curl” jako nowe ćwiczenie']);
  await p.click('#ow-res .ow-add[data-n="Hammer Curl"]');
  await p.fill('#ow-q', 'Wznosy z gumą'); await p.dispatchEvent('#ow-q', 'input');
  await p.click('#ow-res .ow-new');
  await p.fill('#ow-list [data-i="1"][data-f="sets"]', '2'); await p.dispatchEvent('#ow-list [data-i="1"][data-f="sets"]', 'input');
  await p.fill('#ow-list [data-i="0"][data-f="kg"]', '12,5'); await p.dispatchEvent('#ow-list [data-i="0"][data-f="kg"]', 'input');
  await p.fill('#ow-title', 'Ramiona');
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'wlasny.png') }); }
  await p.click('#ow-save');
  await p.waitForSelector('#sheet', { state: 'hidden' });
  const u = calls.find(c => c.fn === 'addOwnUnit').args[0];
  assert.deepEqual([u.week, u.day, u.title, u.exercises], [1, 'W1', 'Ramiona', [{ name: 'Hammer Curl', sets: 3, reps: '10', kg: '12,5' }, { name: 'Wznosy z gumą', sets: 2, reps: '10', kg: '' }]]);
  assert.match(await p.textContent('#eyebrow'), /W1/);
  assert.equal(await p.textContent('#title'), 'Własny · Ramiona');
  assert.deepEqual(await p.$$eval('.card .fold-b .cn', e => e.map(x => x.textContent)), ['Hammer Curl', 'Wznosy z gumą']);
  assert.equal(await fval(p, '.set[data-o="1"][data-s="1"] .kg'), '12,5');
  assert.equal(await p.getAttribute('.card[data-card="1"] a.inf', 'href'), 'https://example.test/hc');   // film „Jak wykonać” od razu, bez czekania na serwer
  assert.equal((await p.$$('.card[data-card="2"] a.inf')).length, 0);
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.waitForTimeout(80);
  assert.deepEqual((({ day, order, set, name }) => ({ day, order, set, name }))(lastSet(calls)), { day: 'W1', order: 1, set: 1, name: 'Hammer Curl' });
  await p.click('#own-add');
  assert.equal(await p.textContent('#sheet-t'), 'Dodaj ćwiczenie');
  assert.equal((await p.$$('#ow-list .ow-it.old')).length, 2);                   // istniejących nie da się usunąć
  await p.fill('#ow-q', 'pull'); await p.dispatchEvent('#ow-q', 'input'); await p.click('#ow-res .ow-add[data-n="Pull-up"]');
  // szukanie po partii mięśniowej i ćwiczenie na czas
  assert.deepEqual(await p.$$eval('#ow-parts .ow-pt', b => b.map(x => x.textContent)), ['biceps', 'brzuch', 'plecy']);
  await p.click('#ow-parts [data-pt="biceps"]');
  assert.deepEqual(await p.$$eval('#ow-res .ow-add', b => b.map(x => x.dataset.n)), ['Hammer Curl', 'EZ-Curl', 'Barbell Curl', 'Pull-up']);
  await p.click('#ow-parts [data-pt="brzuch"]'); await p.click('#ow-res .ow-add[data-n="Plank"]');
  await p.click('#ow-list [data-tm="3"]');
  assert.equal(await p.inputValue('#ow-list [data-i="3"][data-f="reps"]'), '30');
  assert.match(await p.textContent('#ow-list .ow-it:last-child'), /sek\./);
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') await p.screenshot({ path: path.join(SCREENS, 'wlasny-partie-czas.png') });
  await p.click('#ow-save'); await p.waitForSelector('#sheet', { state: 'hidden' });
  assert.equal((await p.$$('.card[data-card]')).length, 4);
  assert.equal(calls.filter(c => c.fn === 'addOwnUnit').pop().args[0].exercises[3].reps, '30 s');
  assert.match(await p.textContent('.card[data-card="4"] .set-head'), /sek\./);
  assert.equal(await p.getAttribute('.set[data-o="4"][data-s="1"] .reps', 'placeholder'), '30');
  assert.equal(await p.getAttribute('.card[data-card="3"] a.inf', 'href'), 'https://example.test/pu');
  assert.equal(await p.getAttribute('.card[data-card="1"] a.inf', 'href'), 'https://example.test/hc');   // dopisanie ćwiczenia nie gubi filmu wcześniejszych
  if (process.env.SCREENS !== '0') await p.screenshot({ path: path.join(SCREENS, 'wlasny-czas-trening.png'), fullPage: true });
  await p.reload(); await p.waitForSelector('.set');                            // po ponownym otwarciu trening jest (z serwera)
  await p.click('#nav [data-tab="plan"]');
  assert.match(await p.textContent('#plan'), /W1.*Własny · Ramiona.*własny.*4 ćwiczenia/s);
  assert.deepEqual(await a11y(p), []);
  // zapis, który nie doszedł (brak sieci), czeka w kolejce i jest widoczny po ponownym otwarciu, zanim serwer go dostanie
  await p.evaluate(() => { const q = qGet(); q.push({ fn: 'addOwnUnit', payload: { week: 1, day: 'W2', date: '2026-10-08', title: '', exercises: [{ name: 'Plank', sets: 3, reps: '30 s', kg: '' }] } }); qSet(q); });
  const before = calls.filter(c => c.fn === 'addOwnUnit').length;
  await p.reload(); await p.waitForSelector('.set'); await p.click('#nav [data-tab="plan"]');
  await p.evaluate(() => { WK = mondayOf('2026-10-08'); render(); });            // tydzień tej jednostki w pasku
  assert.match(await p.textContent('#plan'), /W2 Własny/);
  await p.waitForFunction(n => true, null); await p.waitForTimeout(300);
  assert.equal(calls.filter(c => c.fn === 'addOwnUnit').length, before + 1);      // kolejka wysłana po połączeniu
  assert.deepEqual(p.errors, []);
  await ctx.close();
  const off = Object.assign({}, data, { cfg: Object.assign({}, DATA.cfg, { own: false }) });   // Klienci „wlasne” = NIE
  const t2 = await page([], false, { data: off });
  await t2.p.goto(base + '?k=kabc'); await t2.p.waitForSelector('.set'); await t2.p.click('#nav [data-tab="plan"]');
  assert.equal(await t2.p.$('#own-new'), null);
  await t2.ctx.close();
});

test('Błędy aplikacji: zgłoszenie do arkusza, ten sam błąd raz dziennie', async () => {
  const calls = [];
  const { ctx, p } = await page(calls);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.evaluate(() => { setTimeout(() => { throw new Error('test błędu'); }, 0); setTimeout(() => { throw new Error('test błędu'); }, 5); });
  await p.waitForTimeout(300);
  const e = calls.filter(c => c.fn === 'logError').map(c => c.args[0]);
  assert.equal(e.length, 1);
  assert.equal(e[0].kind, 'js'); assert.match(e[0].msg, /test błędu/);
  await ctx.close();
});

// --- 17.10: placeholder z planu, komentarz do ćwiczenia, EMOM, pominięcia i „Skróć trening”, zwijanie A/B/K, pasek tygodnia, sygnał ---
const R17 = (order, name, prio, sets, reps, kg, x) => Object.assign({ week: 1, day: 'T1', title: 'FBW', date: '2026-10-06', order, name, prio, sets, reps, pct: null, kg, rpe: 8, note: '', extra: 0, drop: 0, block: 'B1', group: '', swaps: [], infos: [] }, x || {});
const D17 = Object.assign({}, PRO, { plan: [R17(1, 'Przysiad', 'A', 2, '5', 100, { cut: 2, setsMin: 1 }), R17(2, 'Face Pull', 'B', 2, '12', 20), R17(3, 'EMOM Power Snatch from blocks', 'A', 3, '1', 60, { group: 'R' }),
  R17(4, 'Dead bug', 'K', 2, '10/str', 'BW'), R17(5, 'Plank', 'K', 2, '30 s', '', { cut: 1 })] });

test('Pole kg: propozycja z planu jako placeholder, ✓ przy pustym zapisuje plan, wpisana cyfra = nowa wartość, zaznaczenie przy fokusie', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: D17 });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  assert.deepEqual(await p.$eval('.set[data-o="1"][data-s="1"] .kg', i => [i.value, i.placeholder, i.classList.contains('ph')]), ['', '100', true]);
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.waitForTimeout(80);
  assert.deepEqual((({ kg, reps }) => ({ kg, reps }))(lastSet(calls)), { kg: 100, reps: 5 });
  assert.equal(await p.inputValue('.set[data-o="1"][data-s="1"] .kg'), '100');   // zrobiona: faktyczna wartość w pełnym kolorze
  await p.click('.set[data-o="1"][data-s="2"] .kg'); await p.keyboard.type('97.5');
  assert.equal(await p.inputValue('.set[data-o="1"][data-s="2"] .kg'), '97.5');  // bez kasowania propozycji
  await p.click('.set[data-o="1"][data-s="2"] .ok'); await p.waitForTimeout(80);
  assert.equal(lastSet(calls).kg, 97.5);                                         // kropka i przecinek
  await p.click('.set[data-o="1"][data-s="1"] .kg'); await p.waitForTimeout(50);
  assert.deepEqual(await p.$eval('.set[data-o="1"][data-s="1"] .kg', i => [i.selectionStart, i.selectionEnd]), [0, 3]);   // całość zaznaczona
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Komentarz do ćwiczenia: zapis z serią (uwagi) i poprawka wszystkich serii (logNote), po ponownym otwarciu z Logu', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: D17 });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="2"]');
  // pusty komentarz: „⋯” → Komentarz otwiera okno, w karcie nic nie ma
  assert.equal(await p.isHidden('.card[data-card="2"] .exn'), true);
  await p.click('[data-more="2"]'); await p.click('#sheet [data-mnote]'); await p.waitForSelector('#nt');
  assert.equal(await p.textContent('#nt-ok'), 'Zapisz komentarz');
  assert.equal(await p.$('#nt-del'), null);
  assert.equal(await p.evaluate(() => document.activeElement.id), 'nt');
  await p.fill('.set[data-o="2"][data-s="2"] .kg', '22,5');                        // wpisana, niezapisana seria ma przetrwać zapis komentarza
  await p.fill('#nt', 'face pull 3×10 na TRX'); await p.click('#nt-ok'); await p.waitForSelector('#sheet', { state: 'hidden' });
  assert.equal(calls.filter(c => c.fn === 'logNote').length, 0);                 // bez zapisanej serii: pójdzie z pierwszą
  assert.equal(await p.textContent('.card[data-card="2"] .exn-x'), 'face pull 3×10 na TRX');
  assert.equal(await p.inputValue('.set[data-o="2"][data-s="2"] .kg'), '22,5');
  await p.click('.set[data-o="2"][data-s="1"] .ok'); await p.waitForTimeout(80);
  assert.equal(lastSet(calls).note, 'face pull 3×10 na TRX');
  // komentarz już jest: dotknięcie tekstu w karcie otwiera okno z tym samym komentarzem i go poprawia (nie dodaje drugiego)
  await p.click('.card[data-card="2"] .exn'); await p.waitForSelector('#nt');
  assert.equal(await p.inputValue('#nt'), 'face pull 3×10 na TRX');
  assert.equal(await p.textContent('#nt-ok'), 'Zapisz zmiany');
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'komentarz-okno.png') }); }
  await p.fill('#nt', 'face pull 3×10 na TRX, guma'); await p.click('#nt-ok'); await p.waitForTimeout(80);
  assert.deepEqual(calls.find(c => c.fn === 'logNote').args[0], { week: 1, day: 'T1', order: 2, note: 'face pull 3×10 na TRX, guma' });
  assert.equal((await p.$$('.card[data-card="2"] .exn')).length, 1);
  assert.equal(await p.textContent('.card[data-card="2"] .exn-x'), 'face pull 3×10 na TRX, guma');
  // bez zmian w oknie = bez wysyłki; „Anuluj” też nic nie zmienia; „Usuń komentarz” czyści go w Logu i chowa w karcie
  await p.click('.card[data-card="2"] .exn'); await p.click('#nt-ok'); await p.waitForTimeout(50);
  await p.click('.card[data-card="2"] .exn'); await p.fill('#nt', 'coś innego'); await p.click('#sheet [data-close]'); await p.waitForTimeout(50);
  assert.equal(calls.filter(c => c.fn === 'logNote').length, 1);
  await p.click('.card[data-card="2"] .exn'); await p.click('#nt-del'); await p.waitForTimeout(80);
  assert.deepEqual(calls.filter(c => c.fn === 'logNote').pop().args[0], { week: 1, day: 'T1', order: 2, note: '' });
  assert.equal(await p.isHidden('.card[data-card="2"] .exn'), true);
  const again = Object.assign({}, D17, { logs: [{ id: 'robert|1|T1|2|1', cwiczenie: 'Face Pull', tydzien: 1, jednostka: 'T1', seria: 1, kg: 20, powt: 12, wykonane: 'TAK', typ: '', uwagi: 'z Logu' }] });
  const t = await page([], false, { data: again });
  await t.p.goto(base + '?k=kabc'); await t.p.waitForSelector('.card[data-card="2"] .exn');
  assert.equal(await t.p.textContent('.card[data-card="2"] .exn-x'), 'z Logu');
  assert.equal(await t.p.$eval('.card[data-card="2"] .exn', d => !d.hidden), true);
  await t.ctx.close();
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('EMOM: liczba rund = serie robocze (− / +), pełny ekran po starcie, ocena zapisuje rundę, koniec zegara po ostatniej minucie', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: D17 });
  await p.clock.install({ time: new Date('2026-10-06T16:00:00') });
  await p.addInitScript(() => { window.__vib = []; navigator.vibrate = v => { window.__vib.push(v); return true; }; });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.emom[data-emom="3"]');
  const box = '.emom[data-emom="3"]';
  assert.equal(await p.textContent(box + ' .em-of'), '/ 3');
  assert.equal(await p.isDisabled(box + ' .em-minus'), true);                    // nie mniej niż w planie
  await p.click(box + ' .em-plus');                                              // 4 rundy = 4 serie robocze
  assert.equal(await p.textContent(box + ' .em-cnt'), '4');
  assert.equal(await p.textContent(box + ' .em-of'), '/ 4');
  assert.equal((await p.$$('.set[data-o="3"][data-k="x"]')).length, 1);
  await p.click(box + ' .em-minus');
  assert.equal((await p.$$('.set[data-o="3"][data-k="x"]')).length, 0);
  await p.click(box + ' .em-plus');
  await p.click('[data-warm="3"]');                                              // rozgrzewka nie liczy się do rund
  assert.equal(await p.textContent(box + ' .em-cnt'), '4');
  await p.click(box + ' .em-go');                                                // start → pełny ekran
  await p.waitForSelector('#emfs');
  assert.match(await p.textContent('#emfs .ef-clk'), /1:00|0:5\d/);
  assert.equal(await p.textContent('#emfs .em-cnt'), '4');
  assert.deepEqual(await p.$$eval('#emfs [data-emrate]', b => b.map(x => x.textContent.trim())), ['● Łatwo', '● Średnio', '● Walka', '✖ Spalone']);
  await p.click('#emfs [data-emrate="L"]'); await p.clock.runFor(60000);
  await p.click('#emfs [data-emkg="2.5"]');                                      // następna runda 62,5 kg
  await p.click('#emfs [data-emrate="S"]'); await p.clock.runFor(60000);
  await p.click('#emfs [data-emrate="X"]'); await p.clock.runFor(60300);
  assert.equal(await p.textContent('#emfs .ef-m'), '4');
  assert.deepEqual(await p.$$eval('#emfs .ef-seg i', l => l.map(x => x.className)), ['g', 'y', 'x', 'now']);
  assert.equal(await p.textContent(box + ' .em-n'), '3');
  assert.equal(await p.isHidden('#rest'), true);                                 // EMOM ma zegar minut zamiast przerwy
  const sets = calls.filter(c => c.fn === 'logSet' && c.args[0].order === 3 && /^\d+$/.test(String(c.args[0].set))).map(c => c.args[0]);
  assert.deepEqual(sets.map(s => s.set + ':' + s.kg + '×' + s.reps + ':' + (s.done ? '✓' : '') + s.rpe + s.ocena + s.typ), ['1:60×1:✓7L', '2:62.5×1:✓8S', '3:60×1:✓XFAIL']);   // 🟡 nad planem → wracasz do planu (zejście po ocenie)
  assert.ok(await p.evaluate(() => window.__vib.filter(v => Array.isArray(v) && v[0] === 250).length >= 3));   // sygnał co minutę
  // czwarta minuta mija → koniec zegara (4 rundy), widok końca z „+ 1 runda”
  await p.clock.runFor(60000);
  await p.waitForSelector('#emfs.end');
  assert.match(await p.textContent('#emfs .ef-r'), /Zrobione rundy3 · 60–62,5 kg/);
  assert.equal(await p.textContent(box + ' .em-t'), '–');
  await p.click('#emfs [data-emmore="1"]');                                      // +1 runda: zegar wraca od minuty 5
  assert.equal(await p.$eval('#emfs', e => e.className), '');
  assert.equal(await p.textContent('#emfs .ef-m'), '5');
  assert.equal(await p.textContent(box + ' .em-of'), '/ 5');
  await p.click('#emfs [data-emrate="L"]');
  await p.click('#emfs [data-emrate="L"]');
  assert.equal(await p.textContent(box + ' .em-n'), '5');
  await p.click('#emfs .ef-x');                                                  // zmniejsz
  assert.equal(await p.$('#emfs'), null);
  await p.click(box + ' .em-go');                                                // stop
  assert.equal(await p.textContent(box + ' .em-t'), '–');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Pominięcie: B bez powodu, A/K z powodem; „Skróć trening” wg ciecie i serie_min; przywrócenie; zwijanie A/B/K', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: D17 });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('[data-more="2"]');
  assert.equal(await p.$('.card [data-skip]'), null);                             // v4: rzadkie akcje pod „⋯”, nie w karcie
  await p.click('[data-more="2"]');
  assert.equal(await p.textContent('#sheet [data-skip="2"]'), '✕Pomiń');
  await p.click('#sheet [data-skip="2"]'); await p.waitForTimeout(80);
  assert.equal(await p.isHidden('#sheet'), true);
  assert.deepEqual((({ set, typ, done, note }) => ({ set, typ, done, note }))(lastSet(calls)), { set: 0, typ: 'SKIP', done: false, note: '' });
  assert.equal(await p.$eval('.card[data-card="2"]', c => c.className.includes('skip') && c.className.includes('fold')), true);
  assert.equal(await p.textContent('.card[data-card="2"] .fsum'), 'pominięte');
  await p.click('[data-more="4"]'); assert.match(await p.textContent('#sheet [data-skip="4"]'), /Pomiń…/);
  await p.click('#sheet [data-skip="4"]'); assert.equal(await p.isDisabled('#sk-ok'), true);
  await p.click('#sheet [data-why="ból"]'); await p.fill('#sk-txt', 'kolano'); await p.click('#sk-ok'); await p.waitForTimeout(80);
  assert.equal(lastSet(calls).note, 'ból: kolano');
  // Skróć: Plank (ciecie 1) cały, Przysiad (ciecie 2) do serie_min 1
  await p.click('#umore'); await p.click('#cut'); await p.fill('#ct-min', '11'); await p.dispatchEvent('#ct-min', 'input');
  assert.deepEqual(await p.$$eval('#ct-out li', l => l.map(x => x.textContent)), ['Plank pomiń', 'Przysiad 2 → 1 seria']);
  await p.click('#ct-ok'); await p.waitForTimeout(80);
  const sk = calls.filter(c => c.fn === 'logSet' && c.args[0].typ === 'SKIP').map(c => c.args[0].order + ':' + c.args[0].note);
  assert.deepEqual(sk.slice(-2), ['5:brak czasu', '1:skrócone do 1 z 2 serii · brak czasu']);
  assert.equal((await p.$$('.set[data-o="1"][data-k="p"]')).length, 1);
  assert.match(await p.textContent('.card[data-card="1"] .skipped'), /Skrócone do 1 z 2/);
  assert.equal(await p.textContent('#st-sets'), '0/4');                          // 1 przysiad + 3 EMOM
  await p.click('.card[data-card="2"] .fold-b'); await p.click('[data-unskip="2"]'); await p.waitForTimeout(80);
  assert.deepEqual(calls.filter(c => c.fn === 'deleteSet').map(c => c.args[0].order + ':' + c.args[0].set), ['2:0']);
  assert.equal(await p.$('.card[data-card="2"].skip'), null);
  // zwijanie: K jak A/B — sama po ostatniej serii, także po ręcznym rozwinięciu, stan po odświeżeniu
  await p.click('.card[data-card="4"] .fold-b'); await p.click('[data-unskip="4"]'); await p.waitForTimeout(80);
  await p.click('.card[data-card="4"] .fold-b'); await p.click('.card[data-card="4"] .fold-b');   // ręcznie zwinięte i rozwinięte
  for (const s of [1, 2]) { await p.click(`.set[data-o="4"][data-s="${s}"] .ok`); await p.waitForTimeout(50); }
  await p.waitForSelector('.card[data-card="4"].fold', { timeout: 3000 });
  assert.match(await p.textContent('.card[data-card="4"] .fsum'), /2 z 2 serii · ✓/);
  for (const s of [1, 2]) { await p.click(`.set[data-o="2"][data-s="${s}"] .ok`); await p.waitForTimeout(50); }
  await p.$eval('.card[data-card="2"]', c => c.classList.remove('fold'));
  assert.equal(await p.$('.utools'), null);                                       // v39: akcje jednostki pod „⋯” w górnym pasku
  await p.click('#umore'); await p.click('#fold-all');
  assert.equal(await p.$eval('.card[data-card="2"]', c => c.classList.contains('fold')), true);
  await p.reload(); await p.waitForSelector('.card[data-card="4"]');
  assert.equal(await p.$eval('.card[data-card="4"]', c => c.classList.contains('fold')), true);
  assert.deepEqual(await a11y(p), []);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

for (const w of [360, 412]) test(`Pasek tygodnia przy ${w} px: 7 dni bez przewijania, dni ≥ 44 px, ◀ ▶, Dziś; sygnał przerwy w ustawieniach`, async () => {
  const { ctx, p } = await page([], false, { data: D17, scheme: w === 360 ? 'dark' : 'light' });
  await p.setViewportSize({ width: w, height: 800 });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#main .wk');
  const cells = await p.$$eval('#main .wk-d', c => c.map(x => x.getBoundingClientRect()).map(r => [r.width, r.right]));
  assert.equal(cells.length, 7);
  assert.ok(cells.every(c => c[0] >= 44 && c[1] <= innerWidthOf()), JSON.stringify(cells));
  function innerWidthOf(){ return w; }
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.match(await p.textContent('#main .wk-t'), /Blok B1 · tydz\. bloku 1\s*05–11\.10/);
  await p.click('#main [data-wkd="1"]');
  assert.match(await p.textContent('#main .wk-t'), /12–18\.10/);
  await p.click('#main [data-wkd="0"]');
  assert.equal(await p.getAttribute('#main [data-wkd="0"]', 'aria-pressed'), 'true');
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.evaluate(() => { WK = null; render(); }); await p.screenshot({ path: path.join(SCREENS, `tydzien-${w}.png`) }); }
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.click('#r-set');
  assert.equal(await p.textContent('#sheet-t'), 'Sygnał przerwy');
  assert.equal(await p.getAttribute('#sheet [data-sg="sound"]', 'aria-pressed'), 'true');
  await p.click('#sheet [data-sg="pre"]');
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('sg_kabc')).pre), true);
  await p.click('#sg-test');
  assert.ok(await p.evaluate(() => document.body.classList.contains('flash')));
  assert.deepEqual(await a11y(p), []);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Samsung Internet: podpowiedź „otwórz w Chrome”, „Rozumiem” chowa ją na stałe; w Chrome jej nie ma', async () => {
  const ua = 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
  const { ctx, p } = await page([], false, { ua });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  assert.match(await p.textContent('.sbnote'), /otwórz link od trenera w Chrome/);
  assert.deepEqual(await a11y(p), []);
  await p.click('#sb-ok');
  assert.equal(await p.$('.sbnote'), null);
  await p.reload(); await p.waitForSelector('.set');
  assert.equal(await p.$('.sbnote'), null);
  await ctx.close();
  const c = await page([]);
  await c.p.goto(base + '?k=kabc'); await c.p.waitForSelector('.set');
  assert.equal(await c.p.$('.sbnote'), null);
  await c.ctx.close();
});

test('Bez planu: klient z dostępem robi własny trening, menu i zakładki działają', async () => {
  const calls = [], data = Object.assign({}, DATA, { plan: [], logs: [], sessions: [], exNames: [['Hammer Curl', 1], ['Back Squat', 1]] });
  const api = b => b.fn === 'getExNames' ? data.exNames : null;
  const { ctx, p } = await page(calls, false, { data, api });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#own-first');
  assert.match(await p.textContent('#main'), /Jeszcze nie masz planu/);
  assert.equal(await p.isVisible('#nav'), true);
  for (const t of ['plan', 'dysp', 'postep', 'trening']) { await p.click(`#nav [data-tab="${t}"]`); await p.waitForTimeout(60); }
  assert.deepEqual(await a11y(p), []);
  await p.click('#own-first'); await p.waitForFunction(() => EXN.list.length > 0);
  await p.fill('#ow-q', 'squat'); await p.dispatchEvent('#ow-q', 'input'); await p.click('#ow-res .ow-add[data-n="Back Squat"]');
  await p.click('#ow-save'); await p.waitForSelector('.set[data-o="1"]');
  assert.deepEqual((({ week, day }) => ({ week, day }))(calls.find(c => c.fn === 'addOwnUnit').args[0]), { week: 1, day: 'W1' });
  assert.match(await p.textContent('#title'), /Własny/);
  await p.click('#nav [data-tab="plan"]'); assert.match(await p.textContent('#plan'), /Własny/);
  assert.deepEqual(p.errors, []);
  await ctx.close();
  const off = Object.assign({}, data, { cfg: Object.assign({}, DATA.cfg, { own: false }) });
  const t2 = await page([], false, { data: off });
  await t2.p.goto(base + '?k=kabc'); await t2.p.waitForSelector('.es');
  assert.match(await t2.p.textContent('#main'), /Jeszcze nie masz planu/);
  assert.equal(await t2.p.isVisible('#nav'), false);
  await t2.ctx.close();
});

test('Własny trening: kompleks z dwóch ćwiczeń (jedno „A + B”, powt. „1+2”), rozłączenie, filmy obu części', async () => {
  const calls = [], api = b => b.fn === 'getExNames' ? [['Hammer Curl', 'https://example.test/hc', 'biceps'], ['Pull-up', 'https://example.test/pu', 'plecy; biceps'], ['Plank', '', 'brzuch']] : null;
  const { ctx, p } = await page(calls, false, { data: Object.assign({}, PRO, { cfg: Object.assign({}, PRO.cfg, { own: true }) }), api });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.click('#nav [data-tab="plan"]'); await p.click('#own-new'); await p.waitForFunction(() => EXN.list.length > 0);
  const add = async n => { await p.fill('#ow-q', n); await p.dispatchEvent('#ow-q', 'input'); await p.click(`#ow-res .ow-add[data-n="${n}"]`); };
  const type = async (sel, v) => { await p.fill(sel, v); await p.dispatchEvent(sel, 'input'); };
  await add('Hammer Curl'); await add('Pull-up'); await add('Plank');
  assert.equal((await p.$$('#ow-list [data-link]')).length, 2);                    // pierwsze nie ma poprzedniego
  await p.click('#ow-list [data-tm="2"]'); await p.click('#ow-list [data-link="2"]');
  assert.deepEqual(await p.$$eval('#ow-list .ow-ch .opt b', b => b.map(x => x.textContent)), ['Obwód / superseria']);   // ćwiczenia na czas nie łączymy w kompleks
  const join = async i => { await p.click(`#ow-list [data-link="${i}"]`); await p.click(`#ow-list [data-join="${i}"]`); };
  await type('#ow-list [data-i="0"][data-f="kg"]', '20');
  await join(1);
  assert.deepEqual(await p.$$eval('#ow-list .ow-it b', b => b.map(x => x.textContent)), ['Hammer Curl + Pull-up', 'Plank']);
  assert.match(await p.textContent('#ow-list .ow-it'), /kompleks/);
  assert.equal(await p.inputValue('#ow-list [data-i="0"][data-f="reps"]'), '1+1');
  assert.equal(await p.inputValue('#ow-list [data-i="0"][data-f="kg"]'), '20');
  await p.click('#ow-list [data-split="0"]');                                    // rozłącz i połącz ponownie
  assert.deepEqual(await p.$$eval('#ow-list .ow-it b', b => b.map(x => x.textContent)), ['Hammer Curl', 'Pull-up', 'Plank']);
  await join(1);
  await type('#ow-list [data-i="0"][data-f="reps"]', '3');
  await p.click('#ow-save'); assert.match(await p.textContent('#ow-err'), /powtórzenia każdej części/);
  await type('#ow-list [data-i="0"][data-f="reps"]', '1+2');
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'wlasny-kompleks.png') }); }
  await p.click('#ow-save'); await p.waitForSelector('#sheet', { state: 'hidden' });
  assert.deepEqual(calls.find(c => c.fn === 'addOwnUnit').args[0].exercises, [{ name: 'Hammer Curl + Pull-up', sets: 3, reps: '1+2', kg: '20' }, { name: 'Plank', sets: 3, reps: '30 s', kg: '' }]);
  assert.deepEqual(await p.$$eval('.card[data-card="1"] a.inf', a => a.length), 0);
  await p.click('[data-inf="1"]');                                                // kompleks: filmy części w oknie
  assert.deepEqual(await p.$$eval('#sheet a.inf', a => a.map(x => x.getAttribute('href'))), ['https://example.test/hc', 'https://example.test/pu']);
  await p.click('#sheet [data-close]');
  assert.equal(await p.getAttribute('.set[data-o="1"][data-s="1"] .reps', 'placeholder'), '3');     // 1+2 = 3 powtórzenia w serii
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.waitForTimeout(80);
  assert.deepEqual((({ order, set, name, kg, reps }) => ({ order, set, name, kg, reps }))(lastSet(calls)), { order: 1, set: 1, name: 'Hammer Curl + Pull-up', kg: 20, reps: 3 });
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// --- obwód / superseria ---
const CIRC = (() => {
  const R = (o, name, x) => Object.assign({ week: 1, day: 'T1', title: 'FBW', date: '2026-10-06', order: o, name, prio: 'B', sets: 2, reps: '10', pct: null, kg: 20, rpe: 8, note: '', extra: 0, drop: 0, group: '', block: 'B1', swaps: [] }, x || {});
  return Object.assign({}, PRO, { plan: [R(1, 'Przysiad', { prio: 'A' }), R(2, 'Pompki', { circuit: 'A', kg: '' }), R(3, 'Wiosłowanie hantlem', { circuit: 'A' }), R(4, 'Plank', { circuit: 'A', reps: '30 s', kg: '' }), R(5, 'Hammer Curl')] });
})();

for (const scheme of ['light', 'dark']) test(`Obwód ${scheme}: ramka A1–A3, „Teraz / Potem”, przerwa dopiero po rundzie, zapis serii bez zmian`, async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: CIRC, scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  assert.deepEqual(await p.$$eval('.grp .card', c => c.map(x => x.dataset.card + ':' + x.querySelector('.gl').textContent)), ['2:A1', '3:A2', '4:A3']);
  assert.equal((await p.$$('.card[data-card="1"] .gl, .card[data-card="5"] .gl')).length, 0);
  assert.equal(await p.textContent('.grp-h b'), 'Obwód A');
  assert.equal(await p.textContent('.grp-r'), 'runda 1 z 2 · przerwa po rundzie');
  assert.equal(await p.textContent('.grp-now'), 'Teraz: A1 · Pompki. Potem A2 · Wiosłowanie hantlem.');
  const now = () => p.$$eval('.set.nowrow', r => r.map(x => x.dataset.o + '/' + x.dataset.s));
  assert.deepEqual(await now(), ['2/1']);
  await p.click('.set[data-o="2"][data-s="1"] .ok'); await p.waitForTimeout(80);
  assert.equal(await p.isHidden('#rest'), true);                                 // w środku rundy bez przerwy
  assert.equal(await p.textContent('.grp-now'), 'Teraz: A2 · Wiosłowanie hantlem. Potem A3 · Plank.');
  assert.deepEqual(await now(), ['3/1']);
  await p.click('.set[data-o="3"][data-s="1"] .ok'); await p.waitForTimeout(80);
  assert.equal(await p.isHidden('#rest'), true);
  assert.equal(await p.textContent('.grp-now'), 'Teraz: A3 · Plank. Potem przerwa.');
  await p.click('.set[data-o="4"][data-s="1"] .ok'); await p.waitForTimeout(80);
  assert.equal(await p.isVisible('#rest'), true);                                // koniec rundy → przerwa 1:30
  assert.equal(await p.textContent('#rlbl'), 'Przerwa · Obwód A · przed rundą 2');
  assert.match(await p.textContent('#rtime'), /^1:(30|29)$/);
  assert.equal(await p.textContent('.grp-r'), 'runda 2 z 2 · przerwa po rundzie');
  assert.deepEqual(await now(), ['2/2']);
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.evaluate(() => document.querySelector('.grp').scrollIntoView()); await p.screenshot({ path: path.join(SCREENS, `obwod-${scheme}.png`), fullPage: true }); }
  await p.click('#rest [data-r="0"]');
  await p.click('.set[data-o="2"][data-s="1"] .ok'); await p.click('.set[data-o="2"][data-s="1"] .ok'); await p.waitForTimeout(80);   // ✓ → ✕ → puste: wraca do A1 w rundzie 1
  assert.equal(await p.textContent('.grp-now'), 'Teraz: A1 · Pompki. Potem przerwa.');
  await p.click('.set[data-o="2"][data-s="1"] .ok');
  for (const o of [2, 3, 4]) { await p.click(`.set[data-o="${o}"][data-s="2"] .ok`); await p.waitForTimeout(60); }
  assert.equal(await p.textContent('.grp-r'), 'zrobione ✓');
  assert.equal(await p.textContent('#rlbl'), 'Przerwa · Obwód A');
  await p.click('#rest [data-r="0"]');
  await p.click('.set[data-o="5"][data-s="1"] .ok'); await p.waitForTimeout(80);   // poza obwodem jak dotąd: przerwa B 1:30 po każdej serii
  assert.equal(await p.textContent('#rlbl'), 'Przerwa · Hammer Curl');
  const sets = calls.filter(c => c.fn === 'logSet').map(c => c.args[0]);
  assert.deepEqual((({ week, day, order, set, name, reps, kg, done }) => ({ week, day, order, set, name, reps, kg, done }))(sets.find(x => x.order === 4 && x.set === 1)),
    { week: 1, day: 'T1', order: 4, set: 1, name: 'Plank', reps: 30, kg: '', done: true });       // payload serii jak w zwykłym ćwiczeniu
  assert.deepEqual(p.external, []); assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Obwód: superseria z 2 ćwiczeń, tryb PROSTY i „Wszystko jak w planie”; litera przy jednym ćwiczeniu = zwykłe', async () => {
  const calls = [], plan = CIRC.plan.filter(r => r.order !== 4).map(r => r.order === 5 ? Object.assign({}, r, { circuit: 'B' }) : r);
  const { ctx, p } = await page(calls, false, { data: Object.assign({}, CIRC, { cfg: DATA.cfg, plan }) });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  assert.equal(await p.textContent('.grp-h b'), 'Superseria A');
  assert.equal((await p.$$('.grp')).length, 1); assert.equal((await p.$$('.card[data-card="5"] .gl')).length, 0);
  await p.click('[data-all="2"]'); await p.waitForTimeout(100);
  assert.equal(await p.textContent('.grp-now'), 'Teraz: A2 · Wiosłowanie hantlem. Potem przerwa.');
  await p.click('[data-all="3"]'); await p.waitForTimeout(100);
  assert.equal(await p.textContent('.grp-r'), 'zrobione ✓');
  assert.equal(calls.filter(c => c.fn === 'logSet').length, 4);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Własny trening: obwód z kreatora (wspólne rundy, A1–A3, rozłączenie), zapis `circuit`, ramka na Treningu, „+ ćwiczenie” zachowuje obwód', async () => {
  const calls = [], api = b => b.fn === 'getExNames' ? [['Pompki', '', 'klatka'], ['Wiosłowanie hantlem', '', 'plecy'], ['Plank', '', 'brzuch'], ['Hammer Curl', '', 'biceps']] : null;
  const { ctx, p } = await page(calls, false, { data: Object.assign({}, PRO, { cfg: Object.assign({}, PRO.cfg, { own: true }) }), api });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.click('#nav [data-tab="plan"]'); await p.click('#own-new'); await p.waitForFunction(() => EXN.list.length > 0);
  const add = async n => { await p.fill('#ow-q', n); await p.dispatchEvent('#ow-q', 'input'); await p.click(`#ow-res .ow-add[data-n="${n}"]`); };
  const type = async (sel, v) => { await p.fill(sel, v); await p.dispatchEvent(sel, 'input'); };
  const circ = async i => { await p.click(`#ow-list [data-link="${i}"]`); await p.click(`#ow-list [data-circ="${i}"]`); };
  const names = () => p.$$eval('#ow-list .ow-it b', b => b.map(x => x.textContent));
  for (const n of ['Hammer Curl', 'Pompki', 'Wiosłowanie hantlem', 'Plank']) await add(n);
  await p.click('#ow-list [data-link="2"]');
  assert.deepEqual(await p.$$eval('#ow-list .ow-ch .opt b', b => b.map(x => x.textContent)), ['Kompleks', 'Obwód / superseria']);
  await p.click('#ow-list [data-circ="2"]');
  assert.equal(await p.textContent('#ow-list .ow-gh b'), 'Superseria A · na zmianę');
  await circ(3);                                                                 // trzecie dołącza do tego samego obwodu
  assert.equal(await p.textContent('#ow-list .ow-gh b'), 'Obwód A · na zmianę');
  assert.deepEqual(await names(), ['Hammer Curl', 'A1 · Pompki', 'A2 · Wiosłowanie hantlem', 'A3 · Plank']);
  assert.equal((await p.$$('#ow-list .ow-grp [data-f="sets"]')).length, 0);        // w obwodzie jedno pole „rundy”
  await p.click('#ow-list [data-uncirc="A"]'); assert.deepEqual(await names(), ['Hammer Curl', 'Pompki', 'Wiosłowanie hantlem', 'Plank']);
  await circ(2); await circ(3);
  await type('#ow-list [data-rounds="A"]', '4'); await p.click('#ow-list [data-tm="3"]');
  await type('#ow-list [data-i="2"][data-f="kg"]', '20');
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'wlasny-obwod.png') }); }
  await p.click('#ow-save'); await p.waitForSelector('#sheet', { state: 'hidden' });
  assert.deepEqual(calls.find(c => c.fn === 'addOwnUnit').args[0].exercises, [{ name: 'Hammer Curl', sets: 3, reps: '10', kg: '' },
    { name: 'Pompki', sets: 4, reps: '10', kg: '', circuit: 'A' }, { name: 'Wiosłowanie hantlem', sets: 4, reps: '10', kg: '20', circuit: 'A' }, { name: 'Plank', sets: 4, reps: '30 s', kg: '', circuit: 'A' }]);
  assert.deepEqual(await p.$$eval('.grp .card .gl', c => c.map(x => x.textContent)), ['A1', 'A2', 'A3']);
  assert.equal(await p.textContent('.grp-r'), 'runda 1 z 4 · przerwa po rundzie');
  await p.click('#own-add');                                                     // dopisanie ćwiczenia nie gubi obwodu
  assert.match(await p.textContent('#ow-list'), /Obwód A · na zmianę.*4 rundy.*A1 · Pompki/s);
  await add('Hammer Curl'); await p.click('#ow-save'); await p.waitForSelector('#sheet', { state: 'hidden' });
  assert.deepEqual(calls.filter(c => c.fn === 'addOwnUnit').pop().args[0].exercises.map(e => e.circuit || ''), ['', 'A', 'A', 'A', '']);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Karta v4: „+ seria (n)” wyszarza się po zużyciu limitu, pusty komentarz schowany do „⋯”, „⋯” i strzałka zwijają i otwierają', async () => {
  const { ctx, p } = await page([]);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  assert.equal((await p.textContent('[data-extra="1"]')).trim(), '+ seria (1)');
  assert.equal(await p.isDisabled('[data-extra="1"]'), false);
  await p.click('[data-extra="1"]');
  assert.equal(await p.textContent('[data-extra="1"]'), '+ seria (0)');
  assert.equal(await p.isVisible('[data-extra="1"]'), true);                      // zostaje w miejscu, tylko wyszarzony
  assert.equal(await p.isDisabled('[data-extra="1"]'), true);
  await p.click('.set[data-o="1"][data-s="4"] .del'); await p.click('.set[data-o="1"][data-s="4"] .del');
  assert.equal(await p.isDisabled('[data-extra="1"]'), false);
  // przyciski dodawania w jednym rzędzie, tekst w jednej linii
  const tops = await p.$$eval('.card[data-card="1"] .adds .ghost', b => b.map(x => [Math.round(x.getBoundingClientRect().top), Math.round(x.getBoundingClientRect().height)]));
  assert.equal(new Set(tops.map(t => t[0])).size, 1); assert.ok(tops.every(t => t[1] === 44));
  // komentarz: pusty niewidoczny, „⋯” → Komentarz otwiera okno z polem
  assert.equal(await p.isHidden('.card[data-card="1"] .exn'), true);
  await p.click('[data-more="1"]'); await p.click('#sheet [data-mnote]');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'nt');
  await p.click('#sheet [data-close]');
  // strzałka w kolumnie ikon zwija kartę tak samo jak nazwa
  await p.click('.card[data-card="1"] .fold-c');
  assert.equal(await p.getAttribute('.card[data-card="1"] .fold-c', 'aria-expanded'), 'false');
  await p.click('.card[data-card="1"] .fold-b');
  assert.equal(await p.getAttribute('.card[data-card="1"] .fold-b', 'aria-expanded'), 'true');
  // v39: etykieta priorytetu bez własnego rzędu: otwarta karta = na początku recepty, zwinięta = w linii z wynikiem
  assert.equal(await p.isHidden('.card[data-card="1"] .ft .badge'), true);
  assert.match((await p.textContent('.card[data-card="1"] .rx')).trim(), /^główne/);
  await p.click('.card[data-card="1"] .fold-c');
  const ys = await p.$eval('.card[data-card="1"] .ft', f => [f.querySelector('.badge'), f.querySelector('.fsum')].map(e => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }));
  assert.ok(Math.abs(ys[0] - ys[1]) <= 3, 'etykieta i wynik w jednej linii: ' + ys);
  assert.equal(await p.isHidden('.card[data-card="1"] .rx'), true);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Rekord po zamknięciu ćwiczenia (nie między seriami): pasek pod najlepszą serią ćwiczenia głównego (PRO z liczbami, PROSTY bez), znika po cofnięciu', async () => {
  const N = 'Wyciskanie sztangi na ławce płaskiej';
  const R = (w, d, o, name, x) => Object.assign({ week: w, day: 'T1', title: 'FBW A', date: d, order: o, name, prio: 'A', sets: 3, reps: '6–8', pct: null, kg: 50, rpe: 8, note: '', extra: null, drop: 0 }, x || {});
  const G = (o, name, s, kg) => ({ id: `robert|1|T1|${o}|${s}`, zapisano: '2026-11-08T17:00:00.000Z', cwiczenie: name, tydzien: 1, jednostka: 'T1', data: '2026-11-08', nr_cw: o, seria: s, kg, powt: 8, rpe: 8, wykonane: 'TAK', typ: '' });
  const mk = simple => ({ cfg: { name: 'Robert', pain: false, simple, extra: 1 },
    plan: [R(1, '2026-11-08', 1, N), R(1, '2026-11-08', 2, 'Uginanie ramion', { prio: 'B', kg: 10 }),
      R(2, '2026-11-15', 1, N, { kg: 52.5 }), R(2, '2026-11-15', 2, 'Uginanie ramion', { prio: 'B', kg: 12.5 })],
    logs: [G(1, N, 1, 50), G(2, 'Uginanie ramion', 1, 10)], sessions: [{ id: 'robert|1|T1', tydzien: 1, jednostka: 'T1', data: '2026-11-08', czas_min: 50 }] });
  const row = (o, s) => `.set[data-o="${o}"][data-s="${s}"]`;
  // PRO
  let calls = [], { ctx, p } = await page(calls, false, { data: mk(false) });
  await p.goto(base + '?k=k0123456789a'); await p.waitForSelector(row(1, 1));
  await p.fill(row(1, 1) + ' .reps', '8'); await light(p, row(1, 1), 'S');
  assert.equal(await p.$('.rec'), null);                                                          // między seriami bez paska
  await p.fill(row(2, 1) + ' .reps', '8'); await light(p, row(2, 1), 'S'); await p.waitForSelector('.rec');   // przejście do następnego ćwiczenia = zamknięte
  assert.match((await p.textContent('.rec')).replace(/\s+/g, ' '), /★ Rekord.*szacowane maks\. 70 kg · było 66,7/);
  assert.ok(await p.$eval(row(1, 1), r => r.classList.contains('isrec') && r.nextElementSibling.classList.contains('rec')));
  const ls = calls.filter(c => c.fn === 'logSet' && c.args[0].order === 1).pop().args[0];
  assert.deepEqual([ls.kg, ls.reps, ls.rpe, ls.done, ls.typ], [52.5, 8, 8, true, '']);          // zapis serii bez zmian
  await p.screenshot({ path: path.join(SCREENS, 'rekord-pro-jasny.png') });
  // lepsza seria 2 → pasek przechodzi pod nią (jeden na ćwiczenie)
  await p.fill(row(1, 2) + ' .kg', '55'); await p.fill(row(1, 2) + ' .reps', '8'); await light(p, row(1, 2), 'S');
  await p.waitForFunction(() => /73,3/.test((document.querySelector('.rec') || {}).textContent || ''));
  assert.equal(await p.$$eval('.rec', x => x.length), 1);
  assert.ok(await p.$eval(row(1, 2), r => r.nextElementSibling.classList.contains('rec')));
  // seria 2 nieudana → rekord wraca pod serię 1; obie cofnięte → brak paska
  await p.click(row(1, 2) + ' .ok'); await p.waitForFunction(() => /70 kg/.test((document.querySelector('.rec') || {}).textContent || ''));
  await p.click(row(1, 1) + ' .ok'); await p.click(row(1, 1) + ' .ok'); await p.waitForFunction(() => !document.querySelector('.rec'));
  // ćwiczenie uzupełniające (B): bez paska mimo lepszego wyniku
  await p.fill(row(2, 1) + ' .reps', '8'); await light(p, row(2, 1), 'S'); await p.waitForTimeout(100);
  assert.equal(await p.$('.rec'), null);
  // bez RPE seria liczy się jak RPE 10: 55 × 8 = 69,7 > 66,7 → rekord; po wszystkich seriach karta się zwija i w wyniku jest „★ rekord”
  await p.fill(row(1, 1) + ' .kg', '55'); await p.fill(row(1, 1) + ' .reps', '8');
  await p.click(row(1, 1) + ' .ok'); await p.waitForSelector('.rec');
  assert.match((await p.textContent('.rec')).replace(/\s+/g, ' '), /szacowane maks\. 69,7 kg · było 66,7/);
  assert.equal(calls.filter(c => c.fn === 'logSet').pop().args[0].rpe, '');                       // arkusz dalej dostaje puste RPE
  await p.click(row(1, 2) + ' .ok'); await p.click(row(1, 2) + ' .ok'); await p.click(row(1, 3) + ' .ok');   // seria 2 nieudana, 3 zrobiona
  await p.waitForSelector('.card[data-card="1"].fold');
  assert.match(await p.textContent('.card[data-card="1"] .fsum'), /★ rekord$/);
  assert.doesNotMatch(await p.textContent('.card[data-card="2"] .fsum'), /rekord/);
  assert.deepEqual(p.errors, []);
  await ctx.close();
  // PROSTY, ciemny: bez liczb; pasek jest też po ponownym otwarciu (z kolejki / pamięci telefonu)
  calls = []; ({ ctx, p } = await page(calls, false, { data: mk(true), scheme: 'dark' }));
  await p.goto(base + '?k=k0123456789a'); await p.waitForSelector(row(1, 1));
  await p.fill(row(1, 1) + ' .reps', '8'); await light(p, row(1, 1), 'S');
  assert.equal(await p.$('.rec'), null);
  await light(p, row(2, 1), 'S'); await p.waitForSelector('.rec');
  assert.equal(await p.textContent(row(1, 1) + ' .ef b'), 'Średnio');                          // PROSTY: słowo zamiast liczby
  assert.equal(calls.filter(c => c.fn === 'logSet').pop().args[0].rpe, 8);
  assert.match(await p.textContent('.rec'), /Najlepszy wynik w tym ćwiczeniu/);
  assert.doesNotMatch(await p.textContent('.rec'), /\d/);
  await p.screenshot({ path: path.join(SCREENS, 'rekord-prosty-ciemny.png') });
  await p.click('[data-warm="1"]'); await p.waitForTimeout(100);                               // nowy wiersz nie rozdziela serii i paska
  assert.ok(await p.$eval(row(1, 1), r => r.nextElementSibling.classList.contains('rec')));
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// v45 (plan v4 PR 5): karta „dziś” nad paskiem tygodnia
for (const scheme of ['light', 'dark']) test('Karta „dziś” (' + scheme + '): przed startem ćwiczenia / serie / minuty i „Zacznij”, w trakcie postęp i „Dalej”, po seriach „Zakończ”, po zapisie jednostki znika', async () => {
  const d = new Date(), iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const data = Object.assign({}, DATA, { plan: DATA.plan.map(r => Object.assign({}, r, { date: iso })) });
  const { ctx, p } = await page([], false, { data, scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#today:not([hidden])');
  const txt = async s => (await p.textContent(s)).replace(/\s+/g, ' ').trim();
  assert.match(await txt('#today .td-e'), /^Dziś · /);
  assert.equal(await txt('#today .td-t'), 'FBW A');
  assert.equal(await txt('#today .td-s'), '2 ćwiczenia · 5 serii · ok. 15 min');     // 5 serii A × (45 s + 2:00) ≈ 14 min → do 5 min
  assert.equal(await txt('#td-go'), 'Zacznij');
  assert.equal(await p.$('#today .td-pb'), null);
  assert.equal(await p.$('#main .wk .wk-hint'), null);                              // pasek tygodnia na Treningu bez podpowiedzi
  assert.ok((await p.$eval('#td-go', b => b.getBoundingClientRect().height)) >= 44);
  assert.ok(await p.$eval('#today', t => t.nextElementSibling.nextElementSibling.classList.contains('wk')));   // między nimi #wkm (schowana linia z punktu 9)
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `dzis-${scheme}.png`) }); }
  // „Zacznij” przewija do pierwszego niezrobionego ćwiczenia
  await p.click('#td-go');
  await p.waitForFunction(() => { const r = document.querySelector('.card[data-card="1"]').getBoundingClientRect(); return window.scrollY > 0 && r.top < 200; });
  // w trakcie: wszystkie serie pierwszego ćwiczenia → postęp i następne
  for (const s of [1, 2, 3]) await p.click(`.set[data-o="1"][data-s="${s}"] .ok`);
  await p.waitForFunction(() => /Zrobione 3 z 5/.test(document.querySelector('#today').textContent));
  await p.waitForSelector('.card[data-card="1"].fold');                             // zrobione ćwiczenie zwija się samo (z opóźnieniem)
  // punkt 9 v80: od 1. serii karta „dziś”, pasek tygodnia i baner = jedna linia #wkm; ▾ rozwija do końca jednostki
  assert.ok(await p.$eval('#main', m => m.classList.contains('slim')));
  assert.ok(await p.isVisible('#wkm')); assert.ok(!(await p.isVisible('#today'))); assert.ok(!(await p.isVisible('#main .wk')));
  assert.match(await txt('#wkm .mut'), /ok\. 5 min$/);
  assert.ok((await p.$eval('#wkm-x', b => b.getBoundingClientRect().height)) >= 44);
  if (process.env.SCREENS !== '0') { await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('#toast').style.display = 'none'; }); await p.waitForTimeout(300); await p.screenshot({ path: path.join(SCREENS, `dzis-linia-${scheme}.png`) }); }
  await p.click('#wkm-x');
  assert.ok(await p.isVisible('#today')); assert.ok(await p.isVisible('#main .wk')); assert.ok(!(await p.isVisible('#wkm')));
  await p.evaluate(() => document.querySelector('#toast').style.display = '');
  assert.equal(await txt('#today .td-s'), 'Zrobione 3 z 5 serii · zostało ok. 5 min');
  assert.equal(await txt('#today .td-n'), 'Następne: Zarzut i podrzut');
  assert.equal(await p.getAttribute('#today .td-pb', 'aria-valuenow'), '3');
  assert.equal(await txt('#td-go'), 'Dalej');
  if (process.env.SCREENS !== '0') { await p.evaluate(() => { window.scrollTo(0, 0); document.querySelector('#toast').style.display = 'none'; }); await p.waitForTimeout(300); await p.screenshot({ path: path.join(SCREENS, `dzis-w-trakcie-${scheme}.png`) }); }
  // „Dalej” otwiera zwinięte ćwiczenie i przewija do niego
  await p.click('.card[data-card="2"] .fold-c');
  await p.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme });           // bez płynnego przewijania: skok od razu
  await p.evaluate(() => window.scrollTo(0, 0)); await p.click('#td-go');
  assert.equal(await p.getAttribute('.card[data-card="2"] .fold-c', 'aria-expanded'), 'true');
  await p.click('.card[data-card="1"] .fold-c');                                    // zrobione ćwiczenie zwinęło się samo: otwórz
  // cofnięcie serii zmniejsza postęp
  await p.click('.set[data-o="1"][data-s="3"] .ok'); await p.click('.set[data-o="1"][data-s="3"] .ok');
  await p.waitForFunction(() => /Zrobione 2 z 5/.test(document.querySelector('#today').textContent));
  assert.equal(await txt('#today .td-n'), 'Następne: Wyciskanie sztangi na ławce płaskiej');
  assert.ok(!(await p.$eval('#main', m => m.classList.contains('slim'))));          // rozwinięte zostaje do końca jednostki
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Karta „dziś”: jednostka z innego dnia = „Zaległy”, po zapisaniu jednostki karty nie ma', async () => {
  const { ctx, p } = await page([]);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#today:not([hidden])');
  assert.equal((await p.textContent('#today .td-e')).trim(), 'Zaległy · wt 06.10');
  await ctx.close();
  const done = Object.assign({}, DATA, { sessions: [{ id: 'robert|1|T1', tydzien: 1, jednostka: 'T1', start: '2026-10-06T10:00:00.000Z' }] });
  const t2 = await page([], false, { data: done });
  await t2.p.goto(base + '?k=kabc'); await t2.p.waitForSelector('.set[data-o="1"]');
  assert.equal(await t2.p.$('#today'), null);
  await t2.ctx.close();
});

// Plan v4 PR 6: timer z grubym paskiem u góry i czerwoną końcówką, puste stany jako karty, ruch przy zwijaniu i ✓
test('Timer przerwy: pasek na górnej krawędzi, ostatnie 10 s na czerwono z „Zaraz koniec”, +15 cofa', async () => {
  const { ctx, p } = await page([]);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.waitForSelector('#rest:not([hidden])');
  const g = await p.evaluate(() => { const r = document.querySelector('#rest').getBoundingClientRect(), b = document.querySelector('.rbar').getBoundingClientRect(); return [Math.round(b.top - r.top), Math.round(b.height), Math.round(b.width - r.width)]; });
  assert.deepEqual(g, [0, 8, 0]);                                              // pasek: sama góra, 8 px, cała szerokość
  assert.match(await p.textContent('#rlbl'), /^Przerwa · /);
  assert.equal(await p.$eval('#rest', e => e.classList.contains('end')), false);
  const amber = await p.$eval('#rtime', e => getComputedStyle(e).color);
  await p.evaluate(() => { REST.end = Date.now() + 8400; restTick(); });       // zostało 8 s
  assert.equal(await p.$eval('#rest', e => e.classList.contains('end')), true);
  assert.match(await p.textContent('#rlbl'), /^Zaraz koniec · /);
  assert.notEqual(await p.$eval('#rtime', e => getComputedStyle(e).color), amber);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.$eval('#toast', e => e.style.display = 'none'); await p.screenshot({ path: path.join(SCREENS, 'przerwa-koniec.png'), clip: { x: 0, y: 844 - 170, width: 390, height: 170 } }); }
  await p.click('#rest [data-r="15"]');                                        // +15 s → znów zwykła przerwa
  assert.equal(await p.$eval('#rest', e => e.classList.contains('end')), false);
  assert.match(await p.textContent('#rlbl'), /^Przerwa · /);
  await p.click('#rest [data-r="0"]');
  assert.equal(await p.$eval('#rest', e => e.classList.contains('end')), false);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Puste stany: karta z ikoną i przyciskiem (brak planu → ponowne sprawdzenie, Postęp → przejście do treningu, Trener)', async () => {
  const calls = [];
  const none = { cfg: Object.assign({}, DATA.cfg, { own: false }), plan: [], logs: [], sessions: [] };
  const { ctx, p } = await page(calls, false, { data: none });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#main .es');
  assert.equal(await p.$$eval('#main .es svg, #main .es .cn, #main .es .sub, #main #es-again', e => e.length), 4);
  const n0 = calls.filter(c => c.fn === 'getData').length;
  await p.click('#es-again'); await p.waitForFunction(() => /Planu jeszcze nie ma/.test(document.querySelector('#toast').textContent));
  assert.equal(calls.filter(c => c.fn === 'getData').length, n0 + 1);          // przycisk naprawdę pyta serwer
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'pusty-plan.png') }); }
  await ctx.close();
  for (const scheme of ['light', 'dark']) {
    const t = await page([], false, { scheme });
    await t.p.goto(base + '?k=kabc'); await t.p.waitForSelector('.set[data-o="1"]');
    await t.p.click('#nav [data-tab="postep"]');
    for (const [k, re] of [['sila', /Tu będzie Twoja siła/], ['obj', /Tu będzie Twoja objętość/], ['dys', /Tu będzie Twoja dyspozycja/]]) {
      await t.p.click(`[data-pt="${k}"]`); await t.p.waitForSelector('#postep .es');
      assert.match(await t.p.textContent('#postep .es'), re);
      assert.ok(await t.p.$eval('#postep .es .btn', b => b.getBoundingClientRect().height) >= 44);
    }
    if (process.env.SCREENS !== '0') await t.p.screenshot({ path: path.join(SCREENS, `pusty-postep-${scheme}.png`) });
    await t.p.click('#postep .es [data-go="dysp"]');
    assert.equal(await t.p.isVisible('#dysp'), true);
    await t.p.click('#nav [data-tab="postep"]'); await t.p.click('[data-pt="sila"]'); await t.p.click('#postep .es [data-go="trening"]');
    assert.equal(await t.p.isVisible('.set[data-o="1"]'), true);
    await t.p.click('#nav [data-tab="trener"]'); await t.p.waitForSelector('#trener .es');
    assert.match(await t.p.textContent('#trener .es'), /Jeszcze bez komentarzy/);
    assert.equal(await t.p.$('#trener .es .btn'), null);
    assert.deepEqual(t.p.errors, []);
    await t.ctx.close();
  }
});

test('Ruch: karta zwija się płynnie (stan od razu, wysokość w 0,2 s), ✓ dostaje krótki ruch; przy ograniczeniu ruchu nic się nie animuje', async () => {
  const run = async motion => {
    const { ctx, p } = await page([], false, { motion });
    await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
    const card = '.card[data-card="1"]';
    assert.equal(await p.$eval(card, c => c.classList.contains('folding')), false);   // pierwsze rysowanie bez animacji
    const h0 = await p.$eval(card, c => c.offsetHeight);
    const r = await p.evaluate(() => { const c = document.querySelector('.card[data-card="1"]'); c.querySelector('[data-fold]').click();
      return [c.classList.contains('fold'), c.classList.contains('folding'), c.getAnimations().length, Math.round(c.getBoundingClientRect().height)]; });
    assert.equal(r[0], true);                                                  // zwinięta od razu, niezależnie od animacji
    if (motion) { assert.equal(r[1], true); assert.equal(r[2], 1); assert.equal(r[3], h0); }   // start animacji z pełnej wysokości
    else { assert.equal(r[1], false); assert.equal(r[2], 0); assert.ok(r[3] < h0); }
    await p.waitForFunction(() => !document.querySelector('.card[data-card="1"]').classList.contains('folding'));
    const h1 = await p.$eval(card, c => c.offsetHeight); assert.ok(h1 < h0);
    await p.click(card + ' [data-fold]');
    await p.waitForFunction(() => !document.querySelector('.card[data-card="1"]').classList.contains('folding'));
    assert.equal(await p.$eval(card, c => c.offsetHeight), h0);                // po rozwinięciu ta sama wysokość, bez resztek stylu
    assert.equal(await p.$eval(card, c => c.style.height), '');
    await p.click('.set[data-o="1"][data-s="1"] .ok');
    assert.equal(await p.$eval('.set[data-o="1"][data-s="1"] .ok', b => b.classList.contains('pop')), true);
    assert.equal(await p.$eval('.set[data-o="1"][data-s="1"] .ok', b => getComputedStyle(b).animationName), motion ? 'pop' : 'none');
    assert.deepEqual(p.errors, []);
    await ctx.close();
  };
  await run(true); await run(false);
});

test('Marka „Siła z Ruchu”: nazwa pod ikoną na ekranie głównym, w karcie przeglądarki i w nagłówku przed wczytaniem planu', async () => {
  const man = JSON.parse(fs.readFileSync(path.join(WEB, 'manifest.json'), 'utf8'));
  assert.deepEqual([man.name, man.short_name], ['Siła z Ruchu', 'Siła z Ruchu']);
  assert.ok(man.short_name.length <= 12);                                      // dłuższą nazwę Android ucina pod ikoną
  assert.equal(man.id, './');                                                  // ta sama aplikacja co dotąd: telefon ją odświeży, a nie zainstaluje drugiej obok
  const { ctx, p } = await page([]);
  await p.goto(base); await p.waitForSelector('#key-in');                      // bez klucza: nagłówek z samą marką
  assert.equal(await p.title(), 'Siła z Ruchu');
  assert.equal(await p.textContent('#title'), 'Siła z Ruchu');
  assert.equal(await p.getAttribute('meta[name="apple-mobile-web-app-title"]', 'content'), 'Siła z Ruchu');   // nazwa pod ikoną na iPhonie
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Ikona „Siła z Ruchu”: pliki mają rozmiary obiecane w manifeście i są tym, co rysuje tools/make-icons.js (talerz z nazwą na obwodzie); znak wczytuje się w nagłówku w obu motywach', async () => {
  const man = JSON.parse(fs.readFileSync(path.join(WEB, 'manifest.json'), 'utf8'));
  const icon = f => fs.readFileSync(path.join(WEB, 'icons', f));
  const size = f => { const b = icon(f); assert.equal(b.toString('latin1', 1, 4), 'PNG', f); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };   // szerokość i wysokość z nagłówka pliku PNG
  // rozmiary: każdy plik PNG z manifestu ma tyle pikseli, ile manifest obiecuje telefonowi; do tego ikona iPhone'a i karty przeglądarki
  for (const i of man.icons.filter(i => i.type === 'image/png')) assert.equal(size(i.src.replace('icons/', '')), i.sizes, i.src);
  assert.deepEqual(['apple-touch-icon.png', 'favicon-32.png', 'favicon-16.png'].map(size), ['180x180', '32x32', '16x16']);
  assert.deepEqual(man.icons.map(i => i.purpose).sort(), ['any', 'any', 'maskable', 'maskable', 'monochrome']);
  // pliki w repo są dokładnie tym, co rysuje narzędzie (nikt nie poprawił ikony ręcznie)
  const gen = require('../tools/make-icons.js').files();
  for (const [name, text] of Object.entries(gen.svg)) assert.equal(icon(name).toString('utf8'), text, name + ' różni się od narzędzia: uruchom node tools/make-icons.js');
  assert.deepEqual(gen.png.map(f => f[0]).sort(), fs.readdirSync(path.join(WEB, 'icons')).filter(f => f.endsWith('.png')).sort());
  // ikona jednobarwna (Android koloruje ją sam i bierze tylko kształt): w pliku jest sama czerń, bez półprzezroczystości
  const mono = icon('icon-mono.svg').toString('utf8');
  assert.deepEqual([...new Set(mono.match(/#[0-9a-f]{3,8}\b/gi))], ['#000']); assert.ok(!/opacity/.test(mono));
  // obraz w plikach PNG: piksel po pikselu ten sam rysunek, który rysuje narzędzie; kolory marki są na miejscu (ciemne tło, pomarańczowy talerz, jasna piasta),
  // ikony na ekran główny są pełnym kwadratem bez przezroczystości
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const { ctx, p } = await page([]);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  const px = await p.evaluate(async ([list, C, probe]) => { const out = {};
    const pix = async (src, n) => { const im = new Image(); im.src = src; await im.decode();
      const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'); g.drawImage(im, 0, 0, n, n);
      return { nat: [im.naturalWidth, im.naturalHeight], d: g.getImageData(0, 0, n, n).data }; };
    const near = (d, i, k) => d[i + 3] === 255 && Math.abs(d[i] - k[0]) + Math.abs(d[i + 1] - k[1]) + Math.abs(d[i + 2] - k[2]) < 30;
    for (const [name, n, markup] of list) {
      const { nat, d } = await pix('icons/' + name, n), w = (await pix('data:image/svg+xml,' + encodeURIComponent(markup), n)).d;   // d = plik z repo, w = rysunek narzędzia
      const share = k => { let m = 0; for (let i = 0; i < d.length; i += 4) if (near(d, i, k)) m++; return m / (n * n); };
      let off = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - w[i]) + Math.abs(d[i + 1] - w[i + 1]) + Math.abs(d[i + 2] - w[i + 2]) + Math.abs(d[i + 3] - w[i + 3]) > 60) off++;
      const at = q => { const i = (Math.round(q[1] * n / 512) * n + Math.round(q[0] * n / 512)) * 4; return near(d, i, C.bg) ? 'bg' : near(d, i, C.acc) ? 'acc' : near(d, i, C.ink) ? 'ink' : '?'; };
      const pts = name === 'icon-512.png' ? probe : name === 'icon-maskable-512.png' ? probe.mono : null;
      // ikona „maskable”: Android może ją przyciąć do koła o promieniu 40% boku, więc poza tym kołem ma być samo tło (cut = piksele rysunku poza kołem)
      let cut = 0; if (/maskable/.test(name)) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x + .5 - n / 2, y + .5 - n / 2) > n * .4 + 1 && !near(d, (y * n + x) * 4, C.bg)) cut++;
      out[name] = { nat, corners: [0, n - 1, n * (n - 1), n * n - 1].map(q => d[q * 4 + 3]), bg: share(C.bg), acc: share(C.acc), ink: share(C.ink), off: off / (n * n), cut,
        name: pts && [at(pts.stem), at(pts.gap)] };
    }
    // ikona jednobarwna narysowana w 512 px: czy widoczne piksele są czarne i co jest w punktach kontrolnych (0 = wycięte na wylot, 255 = pełne)
    const m = (await pix('icons/icon-mono.svg', 512)).d; let colored = 0, solid = 0;
    for (let i = 0; i < m.length; i += 4) { if (m[i + 3] > 0 && m[i] + m[i + 1] + m[i + 2] > 0) colored++; if (m[i + 3] === 255) solid++; }
    const alpha = q => m[(Math.round(q[1]) * 512 + Math.round(q[0])) * 4 + 3];
    out.mono = { colored, solid: solid / (512 * 512), stem: alpha(probe.mono.stem), gap: alpha(probe.mono.gap), hole: alpha(probe.mono.hole), ring: alpha(probe.mono.solid) };
    return out; }, [gen.png, { bg: rgb(gen.colors.bg), acc: rgb(gen.colors.acc), ink: rgb(gen.colors.ink) }, gen.probe]);
  for (const [name, n] of gen.png) {
    const q = px[name], small = /^favicon/.test(name);
    assert.deepEqual(q.nat, [n, n], name);
    assert.ok(q.off < 0.005, name + ' różni się od rysunku narzędzia (' + (q.off * 100).toFixed(2) + '% pikseli): uruchom node tools/make-icons.js');
    // pomarańczowy talerz zajmuje dużą część pola (w ikonie „maskable” jest pomniejszony, więc trochę mniejszą), piasta jest jasna, wokół zostaje ciemne tło
    assert.ok(q.acc > (/maskable/.test(name) ? 0.25 : 0.3) && q.ink > 0.02 && q.bg > (small ? 0.15 : 0.4), name + ' ' + JSON.stringify(q));
    if (q.name) assert.deepEqual(q.name, ['bg', 'acc'], name + ': napis na obwodzie');     // kreska litery „I” jest ciemna, przerwa między wyrazami pomarańczowa
    assert.equal(q.cut, 0, name + ': talerz wychodzi poza koło, do którego Android przycina ikonę');
    if (small) assert.ok(q.corners.every(a => a < 128), name + ' ' + q.corners);                   // znak w karcie przeglądarki ma zaokrąglone rogi
    else assert.deepEqual(q.corners, [255, 255, 255, 255], name);                                  // telefon sam przycina rogi: przezroczystość dałaby czarne narożniki
  }
  // ikona w kolorach motywu Androida: sam czarny kształt; napis, otwór na gryf są wycięte na wylot, a talerz między nimi jest pełny
  assert.equal(px.mono.colored, 0);
  assert.deepEqual([px.mono.stem, px.mono.gap, px.mono.hole, px.mono.ring], [0, 255, 0, 255], JSON.stringify(px.mono));
  assert.ok(px.mono.solid > 0.3 && px.mono.solid < 0.6, JSON.stringify(px.mono));
  await ctx.close();
  // znak w nagłówku aplikacji: wczytany, 20 × 20 px, w jasnym i ciemnym motywie
  for (const scheme of ['light', 'dark']) {
    const a = await page([], false, { scheme });
    await a.p.goto(base + '?k=kabc'); await a.p.waitForSelector('.set[data-o="1"]');
    const logo = await a.p.$eval('header .logo', i => { const r = i.getBoundingClientRect(); return { ok: i.complete && i.naturalWidth > 0, src: i.getAttribute('src'), box: [r.width, r.height] }; });
    assert.deepEqual(logo, { ok: true, src: 'icons/favicon.svg', box: [20, 20] }, scheme);
    assert.deepEqual(a.p.errors, []);
    await a.ctx.close();
  }
});

const LIB = require('../web/lib.js');
for (const scheme of ['light', 'dark'])
test(`Animacja otwarcia (${scheme}): pierwsze uruchomienie pokazuje zasłonę z marką, talerz jedzie po torze, napis zostaje na czas czytania, potem zasłona znika; plan ładuje się pod spodem`, async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { motion: true, intro: true, scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#intro', { state: 'visible' });
  // zasłona: cały ekran, kolory marki niezależnie od motywu, napis marki, pasek systemowy w kolorze tła
  const look = await p.evaluate(() => { const S = document.getElementById('intro'), r = S.getBoundingClientRect(), cs = getComputedStyle(S);
    return { rect: [r.left, r.top, r.width, r.height], bg: cs.backgroundColor, acc: getComputedStyle(S.querySelector('.in-wm .a')).color, text: S.querySelector('.in-wm').innerText.replace(/\s+/g, ' '),
      tag: S.querySelector('.in-tag').textContent, tagPx: parseFloat(getComputedStyle(S.querySelector('.in-tag')).fontSize), hid: S.getAttribute('aria-hidden'),
      theme: document.querySelector('meta[name="theme-color"]').content, mark: Number(localStorage.getItem('intro')) }; });
  assert.deepEqual(look.rect, [0, 0, 390, 844]);
  assert.deepEqual([look.bg, look.acc], ['rgb(23, 36, 29)', 'rgb(224, 163, 74)']);
  assert.equal(look.text, 'SIŁA Z RUCHU');
  assert.equal(look.tag, 'trening · plan · postęp'); assert.ok(look.tagPx >= 12);
  assert.equal(look.hid, 'true');                                              // ozdoba: czytnik ekranu od razu ma aplikację
  assert.equal(look.theme, '#17241d');
  assert.ok(look.mark > Date.now() - 10000 && look.mark <= Date.now(), 'znacznik: ' + look.mark);   // „ostatnio na ekranie” zapamiętane od razu, także gdy ktoś zamknie aplikację w trakcie
  // plan wczytuje się w tym czasie pod zasłoną (animacja niczego nie wstrzymuje)
  await p.waitForSelector('.set[data-o="1"]', { state: 'attached' });
  assert.ok(await p.$('#intro'));
  assert.equal(calls.filter(c => c.fn === 'getData').length, 1);
  // czasy z lib: litery po kolei, cały napis stoi ≥ 1,2 s przed zgaszeniem
  const tm = LIB.introTimes(11);
  const an = await p.evaluate(() => { const S = document.getElementById('intro'), t = a => { const g = a.effect.getTiming(); return [g.delay, g.duration]; };
    return { letters: [...S.querySelectorAll('.in-wm span')].map(e => t(e.getAnimations()[0])), fade: S.getAnimations().map(t) }; });
  assert.equal(an.letters.length, 11);
  an.letters.forEach((l, i) => assert.deepEqual(l, [tm.text + i * LIB.INTRO.LETTER, LIB.INTRO.LETTER_IN]));
  assert.deepEqual(an.fade, [[tm.fade, LIB.INTRO.OUT]]);                       // jedyna animacja zasłony (bezpiecznik z CSS wyłączony, gdy ruch ruszył)
  assert.ok(an.fade[0][0] - (an.letters[10][0] + an.letters[10][1]) >= 1200);
  // stoper na zegarze animacji w przeglądarce: od startu ruchu do zniknięcia zasłony
  await p.evaluate(() => { const S = document.getElementById('intro'), a = S.getAnimations()[0], t0 = document.timeline.currentTime - a.currentTime;
    window.__introTook = new Promise(res => new MutationObserver((m, o) => { if (!S.isConnected) { o.disconnect(); res(document.timeline.currentTime - t0); } }).observe(document.body, { childList: true })); });
  // ruch: talerz (pierścień i piasta) jest zawsze na końcu narysowanej części toru, linia się nie cofa, kropka tańca nie spada poniżej talerza
  const snap = () => p.evaluate(() => { const bar = document.getElementById('in-bar'), q = id => { const e = document.getElementById(id); return [+e.getAttribute('cx'), +e.getAttribute('cy')]; };
    const s = 1 - parseFloat(getComputedStyle(bar).strokeDashoffset), pt = bar.getPointAtLength(bar.getTotalLength() * s);
    return { s, on: [pt.x, pt.y], ring: q('in-ring'), hub: q('in-hub'), dot: q('in-dot'), sd: 1 - parseFloat(getComputedStyle(document.getElementById('in-dance')).strokeDashoffset) }; });
  const near = (a, b, eps = 0.5) => Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;
  let fin = { s: -1, sd: -1 }, mids = 0;
  for (let i = 0; i < 80 && fin.s < 1; i++) {                                  // podglądamy ruch co ok. 70 ms, aż tor będzie cały
    if (i) await p.waitForTimeout(70);
    const f = await snap();
    assert.ok(near(f.ring, f.on) && near(f.hub, f.on), JSON.stringify(f));
    assert.ok(f.s >= fin.s && f.sd >= fin.sd, 'cofnięcie: ' + JSON.stringify([fin, f]));
    if (f.s < LIB.INTRO.TEMPO[3][1]) assert.ok(f.dot[1] <= f.ring[1] + 0.5, JSON.stringify(f));
    if (f.s > fin.s && f.s > 0 && f.s < 1) mids++;
    fin = f;
  }
  assert.ok(mids >= 3, 'tor nie rysuje się stopniowo (' + mids + ' pośrednich położeń)');
  // chwyt: cały tor narysowany, talerz i kropka tańca w tym samym punkcie na końcu obu linii
  assert.ok(fin.s === 1 && fin.sd === 1 && near(fin.ring, [113.3, 43.7]) && near(fin.dot, [113.3, 43.7]), JSON.stringify(fin));
  // cały napis na ekranie
  await p.waitForFunction(() => [...document.querySelectorAll('#intro .in-wm span, #intro .in-tag')].every(e => getComputedStyle(e).opacity === '1'));
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `intro-${scheme}.png`) }); }
  // koniec: zasłona usunięta, pasek systemowy wraca do koloru motywu, aplikacja działa
  await p.waitForSelector('#intro', { state: 'detached', timeout: 8000 });
  const took = await p.evaluate(() => window.__introTook);
  assert.ok(took >= tm.end - 20 && took < tm.end + 1500, 'animacja trwała ' + Math.round(took) + ' ms zamiast ' + tm.end);
  assert.equal(await p.$('#intro-tc'), null);
  assert.equal(await p.$$eval('meta[name="theme-color"]', a => a.length), 2);
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.waitForTimeout(200);
  assert.equal(calls.filter(c => c.fn === 'logSet').length, 1);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const UA_AND = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

test('Ekran powitalny (iPhone): pierwsze wejście z linku → 3 kroki, imię, kroki Safari, klucz w adresie i manifeście tylko na czas kroku; drugie wejście bez ekranu; ponownie z zakładki Trener', async () => {
  const { ctx, p } = await page([], false, { wel: true, ua: UA_IOS, touch: true });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#wel:not([hidden]) #wel-t');
  assert.equal(await p.textContent('#wel-t'), 'Cześć, Robert!');
  assert.doesNotMatch(p.url(), /kabc/);                                         // na powitaniu klucz już zniknął z adresu
  await p.screenshot({ path: path.join(SCREENS, 'powitanie-1.png') });
  await p.click('[data-wl="1"]');
  assert.equal(await p.textContent('#wel-t'), 'Dodaj na ekran główny');
  assert.equal(await p.getAttribute('[data-os="ios"]', 'aria-pressed'), 'true');   // system rozpoznany
  assert.match(await p.textContent('#wel'), /Do ekranu początkowego/);
  assert.equal(await p.$('#wl-inst'), null);
  assert.equal(new URL(p.url()).searchParams.get('k'), 'kabc');                // zakładka na ekranie weźmie adres z kluczem
  await p.waitForFunction(() => /^data:/.test(document.querySelector('link[rel="manifest"]').href));
  const man = await p.evaluate(() => JSON.parse(decodeURIComponent(document.querySelector('link[rel="manifest"]').href.replace(/^data:[^,]*,/, ''))));
  assert.equal(new URL(man.start_url).searchParams.get('k'), 'kabc');
  assert.equal(man.name, 'Siła z Ruchu');
  await p.screenshot({ path: path.join(SCREENS, 'powitanie-2-iphone.png') });
  await p.click('[data-os="android"]');
  assert.match(await p.textContent('#wel'), /Dodaj do ekranu głównego/);
  assert.equal(new URL(p.url()).searchParams.get('k'), null);                   // poza krokiem iPhone'a klucza w adresie nie ma
  await p.click('.wl-foot [data-wl="2"]');
  assert.equal(await p.textContent('#wel-t'), 'Jak wygląda trening');
  assert.match(await p.textContent('#wel'), /Lekko.*Średnio.*Ciężko/);
  assert.doesNotMatch(await p.textContent('#wel'), /RPE/);                      // PROSTY bez RPE
  await p.click('#wl-end');
  assert.equal(await p.isHidden('#wel'), true);
  assert.equal(await p.evaluate(() => localStorage.getItem('wel_kabc')), '1');
  assert.doesNotMatch(p.url(), /kabc/);
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]'); await p.waitForTimeout(200);
  assert.equal(await p.isHidden('#wel'), true);                                 // raz na telefon
  await p.click('#nav [data-tab="trener"]'); await p.click('#wel-open');
  assert.equal(await p.textContent('#wel-t'), 'Cześć, Robert!');
  await p.click('#wl-skip'); assert.equal(await p.isHidden('#wel'), true);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Ekran powitalny (Android, PRO, ciemny): przycisk instalacji z okna Chrome; bez linku i z ekranu głównego się nie pokazuje', async () => {
  const { ctx, p } = await page([], false, { wel: true, ua: UA_AND, touch: true, scheme: 'dark', data: PRO });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#wel:not([hidden]) #wel-t');
  await p.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__asked = true; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); dispatchEvent(e); });
  await p.click('[data-wl="1"]');
  assert.equal(await p.getAttribute('[data-os="android"]', 'aria-pressed'), 'true');
  assert.equal(new URL(p.url()).searchParams.get('k'), null);
  assert.equal(await p.evaluate(() => document.querySelector('link[rel="manifest"]').getAttribute('href')), 'manifest.json');   // Android: pamięć wspólna z Chrome, manifest bez klucza
  await p.screenshot({ path: path.join(SCREENS, 'powitanie-2-android-ciemny.png') });
  await p.click('#wl-inst');
  await p.waitForSelector('.wl-ok');
  assert.equal(await p.evaluate(() => window.__asked), true);
  assert.match(await p.textContent('.wl-ok'), /już na ekranie głównym/);
  await p.click('.wl-foot [data-wl="2"]');
  assert.match(await p.textContent('#wel'), /RPE albo RIR/);
  await ctx.close();
  // klucz z pamięci (bez ?k=) = klient już korzysta z aplikacji: bez ekranu
  const b = await page([], false, { wel: true });
  await b.p.addInitScript(() => localStorage.setItem('key', 'kabc'));
  await b.p.goto(base); await b.p.waitForSelector('.set[data-o="1"]'); await b.p.waitForTimeout(200);
  assert.equal(await b.p.isHidden('#wel'), true);
  await b.ctx.close();
  // aplikacja otwarta z ekranu głównego (iPhone: osobna pamięć, start_url z kluczem): bez ekranu
  const c = await page([], false, { wel: true, ua: UA_IOS });
  await c.p.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  await c.p.goto(base + '?k=kabc'); await c.p.waitForSelector('.set[data-o="1"]'); await c.p.waitForTimeout(200);
  assert.equal(await c.p.isHidden('#wel'), true);
  assert.doesNotMatch(c.p.url(), /kabc/);
  await c.ctx.close();
});

test('Animacja otwarcia: dotknięcie albo klawisz pomija i nie trafia w przycisk pod spodem; ponowne otwarcie zaraz potem bez animacji; zapis z v53 (data) liczy się jak dawno temu', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { motion: true, intro: true, touch: true });   // ekran dotykowy: na nim dotknięcie mogłoby „przelecieć” do przycisku pod zasłoną
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#intro', { state: 'visible' });
  await p.waitForSelector('.set[data-o="1"]', { state: 'attached' });
  // dotknięcie dokładnie tam, gdzie pod zasłoną jest ✓ pierwszej serii
  const ok = await p.$eval('.set[data-o="1"][data-s="1"] .ok', b => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  let t0 = Date.now();
  await p.touchscreen.tap(ok[0], ok[1]);
  await p.waitForSelector('#intro', { state: 'detached', timeout: 2000 });
  assert.ok(Date.now() - t0 < 1500, 'pominięcie trwało ' + (Date.now() - t0) + ' ms');
  await p.waitForTimeout(200);
  assert.equal(calls.filter(c => c.fn === 'logSet').length, 0);                // dotknięcie zatrzymała zasłona: seria nieodhaczona
  assert.equal(await p.getAttribute('.set[data-o="1"][data-s="1"]', 'data-st'), '');
  assert.equal(await p.$('#intro-tc'), null);
  await p.touchscreen.tap(ok[0], ok[1]); await p.waitForTimeout(200);          // to samo miejsce po animacji: zwykłe ✓
  assert.equal(calls.filter(c => c.fn === 'logSet').length, 1);
  // ponowne otwarcie zaraz potem: zasłony nie ma już w chwili, gdy strona jest gotowa
  await p.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await p.$('#intro'), null);
  await p.waitForSelector('.set[data-o="1"]');
  assert.equal(await p.$('meta#intro-tc'), null);
  // telefon z v53 ma w pamięci datę zamiast chwili: liczy się jak „dawno temu”, więc animacja wraca; klawisz też ją pomija
  await setHidden(p, true);                                                    // aplikacja schowana: zamknięcie strony nie odświeży znacznika
  await p.evaluate(() => localStorage.setItem('intro', '2026-11-16'));
  await p.reload(); await p.waitForSelector('#intro', { state: 'visible' });
  t0 = Date.now();
  await p.keyboard.press('Escape');
  await p.waitForSelector('#intro', { state: 'detached', timeout: 2000 });
  assert.ok(Date.now() - t0 < 1500);
  const mark = Number(await p.evaluate(() => localStorage.getItem('intro')));
  assert.ok(mark > Date.now() - 10000 && mark <= Date.now(), 'znacznik: ' + mark);   // data zastąpiona chwilą
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Animacja otwarcia po przerwie (uruchomienie aplikacji): 29 minut od schowania = bez animacji, 31 minut = animacja; schowana aplikacja nie odświeża znacznika', async () => {
  const { ctx, p } = await page([], false, { motion: true, intro: true });
  await p.clock.install({ time: new Date('2026-11-17T18:00:00') });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#intro', { state: 'visible' });   // pierwsze uruchomienie: animacja
  assert.equal(await p.evaluate(() => INTRO_GAP), 30 * 60000);                 // próg wybrany przez trenera: 30 minut
  await p.keyboard.press('Escape'); await p.waitForSelector('#intro', { state: 'detached' });
  const age = () => p.evaluate(() => Date.now() - Number(localStorage.getItem('intro')));   // ile temu aplikacja była na ekranie wg pamięci telefonu
  // telefon chowa aplikację: znacznik = chwila schowania i w tle stoi w miejscu
  await setHidden(p, true);
  assert.ok(await age() < 2000);
  await p.clock.fastForward(29 * 60000);
  const a29 = await age(); assert.ok(a29 >= 29 * 60000 && a29 < 29 * 60000 + 5000, 'znacznik sprzed ' + a29 + ' ms');
  // w tym czasie telefon zamknął stronę; uruchomienie po 29 minutach: bez animacji, a znacznik znowu świeży
  await p.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await p.$('#intro'), null);
  await p.waitForSelector('.set[data-o="1"]');
  assert.ok(await age() < 2000);
  // to samo po 31 minutach: animacja
  await setHidden(p, true); await p.clock.fastForward(31 * 60000);
  await p.reload(); await p.waitForSelector('#intro', { state: 'visible' });
  assert.ok(await age() < 2000);                                               // zapamiętane od razu
  await p.keyboard.press('Escape'); await p.waitForSelector('#intro', { state: 'detached' });
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Animacja otwarcia po przerwie (powrót do otwartej aplikacji): po 29 minutach w tle nic, po 31 minutach animacja jeszcze raz i sama znika; schowanie aplikacji w trakcie animacji kończy ją', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { motion: true, intro: true });
  await p.clock.install({ time: new Date('2026-11-17T18:00:00') });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#intro', { state: 'visible' });
  await p.keyboard.press('Escape'); await p.waitForSelector('#intro', { state: 'detached' });
  await p.waitForSelector('.set[data-o="1"]');
  // 29 minut w tle, strona żyje dalej: powrót bez animacji
  await setHidden(p, true); await p.clock.fastForward(29 * 60000); await setHidden(p, false);
  await p.clock.runFor(200);
  assert.equal(await p.$('#intro'), null);
  // 31 minut w tle: ta sama zasłona co przy uruchomieniu, na samej górze strony, pasek systemowy w kolorze tła
  await setHidden(p, true); await p.clock.fastForward(31 * 60000); await setHidden(p, false);
  await p.waitForSelector('#intro', { state: 'visible' });
  const look = await p.evaluate(() => { const S = document.getElementById('intro'), r = S.getBoundingClientRect();
    return { rect: [r.left, r.top, r.width, r.height], first: document.body.firstElementChild === S, n: document.querySelectorAll('#intro').length,
      theme: document.querySelector('meta[name="theme-color"]').content, text: S.querySelector('.in-wm').innerText.replace(/\s+/g, ' '),
      age: Date.now() - Number(localStorage.getItem('intro')) }; });
  assert.deepEqual([look.rect, look.first, look.n, look.theme, look.text], [[0, 0, 390, 844], true, 1, '#17241d', 'SIŁA Z RUCHU']);
  assert.ok(look.age < 2000);
  // animacja gra do końca i znika sama (zegar testu rusza klatki; napis i zgaszenie idą zegarem animacji przeglądarki)
  await p.clock.runFor(300);
  assert.equal(await p.evaluate(() => document.querySelectorAll('#intro .in-wm span').length), 11);
  assert.equal(await p.evaluate(() => document.getElementById('intro').getAnimations().length), 1);   // zgaszenie zaplanowane: ruch ruszył
  await p.waitForSelector('#intro', { state: 'detached', timeout: 8000 });
  assert.equal(await p.$('#intro-tc'), null);
  assert.equal(await p.$$eval('meta[name="theme-color"]', a => a.length), 2);
  // trzeci raz, ale telefon chowa aplikację w trakcie animacji: zasłona znika od razu, po powrocie jest aplikacja
  await setHidden(p, true); await p.clock.fastForward(45 * 60000); await setHidden(p, false);
  await p.waitForSelector('#intro', { state: 'visible' });
  await p.clock.runFor(300);
  await setHidden(p, true);
  assert.equal(await p.$('#intro'), null); assert.equal(await p.$('#intro-tc'), null);
  await p.clock.fastForward(60000); await setHidden(p, false);                 // powrót po minucie: bez animacji
  await p.clock.runFor(200);
  assert.equal(await p.$('#intro'), null);
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.clock.runFor(300);
  assert.equal(calls.filter(c => c.fn === 'logSet').length, 1);                // aplikacja pod spodem działa jak zwykle
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Animacja otwarcia: przeładowanie strony w trakcie treningu nie pokazuje animacji (aplikacja na ekranie odświeża znacznik co minutę)', async () => {
  const { ctx, p } = await page([], false, { motion: true, intro: true });
  await p.clock.install({ time: new Date('2026-11-17T18:00:00') });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#intro', { state: 'visible' });
  await p.keyboard.press('Escape'); await p.waitForSelector('#intro', { state: 'detached' });
  await p.waitForSelector('.set[data-o="1"]');
  for (let i = 0; i < 40; i++) await p.clock.fastForward(60000);               // 40 minut treningu z aplikacją na ekranie, minuta po minucie
  const age = await p.evaluate(() => Date.now() - Number(localStorage.getItem('intro')));
  assert.ok(age >= 0 && age <= 61000, 'znacznik sprzed ' + age + ' ms');
  // telefon zamyka stronę bez ostrzeżenia (żadne zdarzenie nie dociera do aplikacji) i wczytuje ją od nowa
  await p.evaluate(() => ['pagehide', 'visibilitychange'].forEach(n => addEventListener(n, e => e.stopImmediatePropagation(), true)));
  await p.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await p.$('#intro'), null);
  await p.waitForSelector('.set[data-o="1"]');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Animacja otwarcia: przy ograniczeniu ruchu i bez dostępu do pamięci telefonu nie pokazuje się wcale; na niskim ekranie mieści się pomniejszona', async () => {
  // ograniczenie ruchu w systemie: bez zasłony przy uruchomieniu i przy powrocie po przerwie
  const a = await page([], false, { intro: true });
  await a.p.clock.install({ time: new Date('2026-11-17T18:00:00') });
  await a.p.goto(base + '?k=kabc', { waitUntil: 'domcontentloaded' });
  assert.equal(await a.p.$('#intro'), null);
  await a.p.waitForSelector('.set[data-o="1"]');
  await setHidden(a.p, true); await a.p.clock.fastForward(31 * 60000); await setHidden(a.p, false);
  await a.p.clock.runFor(200);
  assert.equal(await a.p.$('#intro'), null);
  assert.deepEqual(a.p.errors, []);
  await a.ctx.close();
  // nie da się zapamiętać chwili (pełna albo zablokowana pamięć) → bez animacji, inaczej wracałaby przy każdym otwarciu
  const b = await page([], false, { motion: true, intro: true });
  await b.ctx.addInitScript(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'intro') throw new Error('pełna pamięć'); return set.call(this, k, v); }; });
  await b.p.clock.install({ time: new Date('2026-11-17T18:00:00') });
  await b.p.goto(base + '?k=kabc', { waitUntil: 'domcontentloaded' });
  assert.equal(await b.p.$('#intro'), null);
  await b.p.waitForSelector('.set[data-o="1"]');
  await setHidden(b.p, true); await b.p.clock.fastForward(31 * 60000); await setHidden(b.p, false);
  await b.p.clock.runFor(200);
  assert.equal(await b.p.$('#intro'), null);
  assert.deepEqual(b.p.errors, []);
  await b.ctx.close();
  // telefon poziomo w przeglądarce (740×360): rysunek i napis pomniejszone mieszczą się na ekranie, podpis (byłby < 12 px) schowany
  const c = await page([], false, { motion: true, intro: true });
  await c.p.setViewportSize({ width: 740, height: 360 });
  await c.p.goto(base + '?k=kabc'); await c.p.waitForSelector('#intro', { state: 'visible' });
  const g = await c.p.evaluate(() => { const S = document.getElementById('intro'), r = S.firstElementChild.getBoundingClientRect();
    return { sm: S.classList.contains('sm'), top: r.top, bottom: r.bottom, left: r.left, right: r.right, tag: getComputedStyle(S.querySelector('.in-tag')).display }; });
  assert.ok(g.sm && g.tag === 'none' && g.top >= 0 && g.bottom <= 360 && g.left >= 0 && g.right <= 740, JSON.stringify(g));
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await c.p.waitForTimeout(2200); await c.p.screenshot({ path: path.join(SCREENS, 'intro-poziomo.png') }); }
  assert.deepEqual(c.p.errors, []);
  await c.ctx.close();
});

for (const [mode, data] of [['prosty', DATA], ['pro', PRO]]) for (const scheme of ['light', 'dark'])
test(`podpowiedzi przy pierwszym użyciu (${mode}, ${scheme}): po kolei, każda raz, „Rozumiem” albo użycie elementu`, async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { tips: true, data, scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#tip:not([hidden])');
  const tip = () => p.$eval('#tip', e => e.hidden ? '' : e.textContent);
  const ring = () => p.$eval('.tipring', e => e.className + '|' + (e.dataset.more || '') + '|' + (e.closest('.set') ? e.closest('.set').dataset.s : ''));
  assert.match(await tip(), /Zrobione\? Dotknij ✓.*1 z 4/);
  assert.match(await ring(), /^ok .*\|1$/);                                   // ramka na ✓ pierwszej serii
  // dymek nad ✓, strzałka wskazuje środek przycisku, mieści się w ekranie
  const geo = await p.evaluate(() => { const t = document.querySelector('#tip').getBoundingClientRect(), o = document.querySelector('.tipring').getBoundingClientRect();
    return { above: t.bottom <= o.top, l: t.left, r: t.right, ax: t.left + parseFloat(getComputedStyle(document.querySelector('#tip')).getPropertyValue('--ax')) + 7, cx: o.left + o.width / 2, bh: document.querySelector('#tip-ok').offsetHeight }; });
  assert.ok(geo.above && geo.l >= 12 && geo.r <= 378 && Math.abs(geo.ax - geo.cx) < 1 && geo.bh >= 44, JSON.stringify(geo));
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `podpowiedz-${mode}-${scheme}.png`) }); }
  if (mode === 'prosty') assert.equal(await p.$eval('details.help', e => e.open), false);   // długa ściągawka zwinięta, na dole
  else assert.equal(await p.$('details.help'), null);
  await p.click('#tip-ok');
  assert.match(await tip(), /Więcej pod „⋯”.*2 z 4/);
  assert.match(await ring(), /\|1\|$/);
  assert.equal(await p.$$eval('.tipring', a => a.length), 1);
  await p.click('.tipring');                                                  // użycie elementu = obejrzane; okno „⋯” się otwiera
  await p.waitForSelector('#sheet:not([hidden])');
  assert.match(await tip(), /Nagraj serię.*3 z 4/);
  await p.evaluate(() => closeSheet());
  await p.reload(); await p.waitForSelector('#tip:not([hidden])');           // po ponownym otwarciu ciąg dalszy, nie od początku; licznik z niewidzianych
  assert.match(await tip(), /Nagraj serię.*1 z 2/);
  await p.click('#tip-ok');
  assert.match(await tip(), /Inny dzień\?.*2 z 2/);
  if (process.env.SCREENS !== '0') await p.screenshot({ path: path.join(SCREENS, `podpowiedz-dzien-${mode}-${scheme}.png`) });
  await p.click('#tip-ok');
  assert.equal(await tip(), '');
  assert.equal(await p.$('.tipring'), null);
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tip_kabc'))), ['seria', 'wiecej', 'kamera', 'dzien']);
  await p.reload(); await p.waitForSelector('.set[data-o="1"]');
  assert.equal(await p.$('#tip:not([hidden])'), null);
  assert.equal(calls.filter(c => c.fn !== 'getData').length, 0);             // podpowiedzi niczego nie zapisują na serwerze
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

for (const [mode, simple, scheme] of [['pro', false, 'light'], ['prosty', true, 'dark']])
test(`„★ Pierwszy wynik” (${mode}, ${scheme}): ćwiczenie główne bez historii, bez porównania; nie trafia do rekordów w „Trening zrobiony”`, async () => {
  const today = new Date().toISOString().slice(0, 10);
  const R = (o, name, x) => Object.assign({ week: 1, day: 'T1', title: 'Boje', date: today, order: o, name, prio: 'A', sets: 2, reps: '3', pct: null, kg: 90, rpe: '', note: '', extra: 0, drop: 0 }, x || {});
  const data = { cfg: { name: 'Robert', pain: false, simple, extra: 1 }, plan: [R(1, 'Hang Power Clean'), R(2, 'Wiosłowanie', { reps: '8', kg: 60 })], logs: [], sessions: [] };
  const { ctx, p } = await page([], false, { data, scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set.oly');
  await p.fill('.set[data-o="1"][data-s="1"] .kg', '100'); await p.click('.set[data-o="1"][data-s="1"] .lt'); await p.click('.rate [data-q="L"]');
  await p.waitForTimeout(100); assert.equal(await p.$('.rec'), null);                         // między seriami bez paska
  await p.fill('.set[data-o="1"][data-s="2"] .kg', '100'); await p.click('.set[data-o="1"][data-s="2"] .lt'); await p.click('.rate [data-q="S"]');
  await p.waitForSelector('.rec.first');                                                       // ostatnia seria = ćwiczenie zamknięte
  const t = (await p.textContent('.rec.first')).replace(/\s+/g, ' ');
  assert.match(t, simple ? /★ Pierwszy wynik.*Od niego liczymy rekordy/ : /★ Pierwszy wynik.*najlepsze zaliczone 100 kg/);
  assert.doesNotMatch(t, /było|Rekord/);
  assert.ok(await p.$eval('.set[data-o="1"][data-s="1"]', r => r.nextElementSibling.classList.contains('rec')));
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.$eval('.rec.first', e => e.scrollIntoView({ block: 'center' })); await p.screenshot({ path: path.join(SCREENS, `pierwszy-wynik-${mode}-${scheme}.png`) }); }
  await p.waitForSelector('.card[data-card="1"].fold');
  assert.match(await p.textContent('.card[data-card="1"] .fsum'), /★ pierwszy wynik$/);
  assert.deepEqual(await p.evaluate(() => doneSummary(30).records), []);           // pierwszy wynik to nie rekord
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

for (const scheme of ['light', 'dark'])
test(`„Wyczyść trening” (${scheme}): pod „⋯” górnego paska, dwa dotknięcia, usuwa serie i pominięcia także z arkusza, zeruje czas`, async () => {
  const calls = [];
  const data = Object.assign({}, PRO, { plan: [PRO.plan[0], Object.assign({}, PRO.plan[0], { order: 2, name: 'Uginanie ramion', prio: 'B', kg: 10, sets: 2 })] });
  const { ctx, p } = await page(calls, false, { data, scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  await p.click('#umore'); await p.waitForSelector('#sheet:not([hidden])');
  assert.equal(await p.$('#u-reset'), null);                                  // nic nie zapisano = nie ma czego czyścić
  await p.evaluate(() => closeSheet());
  await p.click('.set[data-o="1"][data-s="1"] .ok'); await p.click('.set[data-o="1"][data-s="2"] .ok');
  await p.click('[data-more="2"]'); await p.click('[data-skip="2"]');           // B: pominięte od razu
  await p.waitForSelector('.card[data-card="2"].skip');
  await p.click('#umore'); await p.waitForSelector('#u-reset');
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `wyczysc-menu-${scheme}.png`) }); }
  await p.click('#u-reset');
  assert.match(await p.textContent('#sheet'), /usunę 2 zapisane serie i 1 pominięcie, także z arkusza trenera/);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `wyczysc-${scheme}.png`) }); }
  const n0 = calls.length;
  await p.click('#ur-go');                                                    // pierwsze dotknięcie tylko pyta jeszcze raz
  assert.match(await p.textContent('#ur-go'), /Na pewno/);
  assert.equal(calls.length, n0);
  await p.click('#ur-go');
  await p.waitForSelector('#sheet', { state: 'hidden' });
  await p.waitForFunction(() => !document.querySelector('.card[data-card="2"].skip'));
  const del = () => calls.filter(c => c.fn === 'deleteSet').map(c => c.args[0].order + '|' + c.args[0].set).sort();
  for (let i = 0; i < 20 && del().length < 3; i++) await p.waitForTimeout(50);
  assert.deepEqual(del(), ['1|1', '1|2', '2|0']);
  assert.equal(await p.$$eval('.set[data-st="ok"]', a => a.length), 0);
  assert.equal(await p.textContent('.clock'), '00:00');
  assert.equal(await p.$('#rest:not([hidden])'), null);
  await p.reload(); await p.waitForSelector('.set[data-o="1"]');           // po przeładowaniu też czysto (pamięć telefonu)
  assert.equal(await p.$$eval('.set[data-st="ok"]', a => a.length), 0);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('nowa podpowiedź: klient widzi tylko ją, licznik „1 z 1”', async () => {
  const { ctx, p } = await page([], false, { tips: true });
  await p.addInitScript(() => { try { if (!sessionStorage.getItem('t')) { localStorage.setItem('tip_kabc', '["seria","wiecej","kamera"]'); sessionStorage.setItem('t', '1'); } } catch (e) {} });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#tip:not([hidden])');
  assert.match(await p.textContent('#tip'), /Inny dzień\?.*1 z 1/);
  await p.click('#tip-ok');
  assert.equal(await p.$eval('#tip', e => e.hidden), true);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('podpowiedź znika poza Treningiem i idzie za elementem, gdy karta zmienia wysokość', async () => {
  const { ctx, p } = await page([], false, { tips: true });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('#tip:not([hidden])');
  const gap = () => p.evaluate(() => Math.round(document.querySelector('.tipring').getBoundingClientRect().top - document.querySelector('#tip').getBoundingClientRect().bottom));
  assert.equal(await gap(), 16);
  await p.click('.card[data-card="1"] [data-warm]');                         // nowy wiersz rozgrzewki przesuwa ✓ w dół
  await p.waitForFunction(() => Math.round(document.querySelector('.tipring').getBoundingClientRect().top - document.querySelector('#tip').getBoundingClientRect().bottom) === 16);
  await p.click('#nav [data-tab="plan"]');
  assert.equal(await p.$eval('#tip', e => e.hidden), true);
  await p.click('#nav [data-tab="trening"]');
  assert.equal(await p.$eval('#tip', e => e.hidden), false);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Tryb skupienia: jedno ćwiczenie na ekranie, obwód jako jeden krok, „Następne”, podsumowanie, wybór zapamiętany', async () => {
  const calls = [];
  const data = Object.assign({}, CIRC, { logs: [] });                             // atrapa pamięta zapisane serie jak serwer (potrzebne po przeładowaniu)
  const { ctx, p } = await page(calls, false, { data });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  const shown = () => p.$$eval('.card[data-card]', cs => cs.filter(c => c.offsetParent !== null).map(c => +c.dataset.card));
  assert.equal(await p.$('#fx'), null);                                           // domyślnie lista
  assert.deepEqual(await shown(), [1, 2, 3, 4, 5]);
  await p.click('#umore'); await p.click('#fx-sw'); await p.waitForSelector('#fx');
  assert.equal(await p.evaluate(() => localStorage.getItem('fx_kabc')), '1');
  assert.deepEqual(await shown(), [1]);                                           // wszystkie karty są w DOM, widać jedną
  assert.equal(await p.$$eval('.card[data-card]', cs => cs.length), 5);
  assert.equal(await p.textContent('#fx-title'), 'Ćwiczenie 1 z 5');
  assert.equal(await p.$eval('.wk', e => e.offsetParent === null), true);         // pasek tygodnia i karta „dziś” schowane
  assert.equal(await p.$eval('#fx-prev', b => b.disabled), true);
  assert.match(await p.textContent('#fx-next'), /Następne.*Obwód A/s);
  // zapis serii bez zmian; po ostatniej serii karta zostaje (czeka na „Następne”), odcinek paska robi się zielony
  const n = await p.$$eval('.set[data-o="1"][data-k="p"]', r => r.length);
  for (let s = 1; s <= n; s++) { await p.click(`.set[data-o="1"][data-s="${s}"] .ok`); await p.waitForTimeout(60); }
  const ls = calls.filter(c => c.fn === 'logSet');
  assert.equal(ls.length, n); assert.equal(ls[0].args[0].order, 1); assert.equal(ls[0].args[0].set, 1);
  await p.waitForTimeout(1100);                                                   // w liście karta zwinęłaby się po 0,9 s
  assert.deepEqual(await shown(), [1]);
  assert.equal(await p.$eval('.card[data-card="1"]', c => c.classList.contains('fold')), false);
  assert.deepEqual(await p.$$eval('.fx-seg i', a => a.map(i => i.className)), ['d', '', '', '', '']);
  await p.click('#fx-next');
  assert.deepEqual(await shown(), [2, 3, 4]);                                     // obwód = jeden krok, cała ramka
  assert.equal(await p.textContent('#fx-title'), 'Ćwiczenia 2–4 z 5');
  assert.deepEqual(await p.$$eval('.fx-seg i', a => a.map(i => i.className)), ['d', 'c', 'c', 'c', '']);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'skupienie-obwod.png') }); }
  await p.click('#fx-next'); assert.deepEqual(await shown(), [5]);
  assert.match(await p.textContent('#fx-next'), /Dalej.*Podsumowanie/s);
  await p.click('#fx-next');                                                      // ostatni krok: podsumowanie jednostki
  assert.deepEqual(await shown(), []);
  assert.equal(await p.textContent('#fx-title'), 'Podsumowanie');
  assert.equal(await p.$eval('.card.sess', e => e.offsetParent !== null), true);
  assert.equal(await p.$('#fx-next'), null);
  await p.click('#fx-prev'); assert.deepEqual(await shown(), [5]);
  // po przeładowaniu tryb zostaje i otwiera pierwsze niezrobione ćwiczenie (ćw. 1 zrobione → obwód)
  data.logs = [1, 2].map(s => ({ id: `robert|1|T1|1|${s}`, zapisano: '2026-10-06T10:00:00.000Z', cwiczenie: 'Przysiad', tydzien: 1, jednostka: 'T1', seria: s, kg: 20, powt: 10, rpe: 8, wykonane: 'TAK', typ: '' }));
  await p.reload(); await p.waitForSelector('#fx');
  assert.deepEqual(await shown(), [2, 3, 4]);
  // powrót do listy: wszystkie karty, zrobiona zwinięta, „Zwiń zrobione” wraca
  await p.click('#fx-list'); await p.waitForSelector('#wkm');                      // seria już zapisana → zamiast tygodnia jedna linia (punkt 9)
  assert.equal(await p.$('#fx'), null);
  assert.deepEqual(await shown(), [1, 2, 3, 4, 5]);
  assert.equal(await p.$eval('.card[data-card="1"]', c => c.classList.contains('fold')), true);
  assert.equal(await p.evaluate(() => localStorage.getItem('fx_kabc')), '0');
  assert.deepEqual(await a11y(p), []);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('Tryb skupienia: przesunięcie palcem zmienia ćwiczenie; zrzuty PROSTY / PRO w obu motywach', async () => {
  for (const [mode, data] of [['prosty', DATA], ['pro', PRO]]) for (const scheme of ['light', 'dark']) {
    const { ctx, p } = await page([], false, { data, scheme });
    await ctx.addInitScript(() => { try { localStorage.setItem('fx_kabc', '1'); } catch (e) {} });
    await p.goto(base + '?k=kabc'); await p.waitForSelector('#fx');
    const shown = () => p.$$eval('.card[data-card]', cs => cs.filter(c => c.offsetParent !== null).map(c => +c.dataset.card));
    const swipe = dx => p.evaluate(d => { const m = document.querySelector('#main'), t = x => ({ touches: [{ clientX: x, clientY: 300 }], changedTouches: [{ clientX: x, clientY: 300 }] });
      const ev = (n, x) => Object.assign(new Event(n, { bubbles: true }), t(x)); m.dispatchEvent(ev('touchstart', 200)); m.dispatchEvent(ev('touchend', 200 + d)); }, dx);
    assert.deepEqual(await shown(), [1]);
    assert.deepEqual(await a11y(p), []);
    if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `skupienie-${mode}-${scheme}.png`) }); }
    await swipe(-30); assert.deepEqual(await shown(), [1]);                       // za krótki ruch
    await swipe(-120); assert.deepEqual(await shown(), [2]);
    await swipe(-120); assert.deepEqual(await shown(), []);                       // podsumowanie
    await swipe(-120); assert.equal(await p.textContent('#fx-title'), 'Podsumowanie');   // dalej nie ma
    await swipe(120); assert.deepEqual(await shown(), [2]);
    assert.deepEqual(p.errors, []);
    await ctx.close();
  }
});

// przejście z aplikacji do panelu trenera: tylko na urządzeniu, na którym ktoś zalogował się do panelu (tr_dev)
for (const scheme of ['light', 'dark']) test(`Trener ${scheme}: „Panel trenera” tylko na urządzeniu trenera`, async () => {
  for (const dev of [false, true]) {
    const { ctx, p } = await page([], false, { scheme });
    if (dev) await ctx.addInitScript(() => { try { localStorage.setItem('tr_dev', '1'); } catch (e) {} });
    await p.goto(base + '?k=kabc'); await p.waitForSelector('.card');
    await p.click('#nav [data-tab="trener"]');
    assert.equal(!!(await p.$('#trener .trp')), dev);
    if (dev) {
      assert.equal(await p.getAttribute('#trener .trp', 'href'), 'trener.html');
      assert.ok((await p.$eval('#trener .trp', e => e.getBoundingClientRect().height)) >= 44);
      assert.deepEqual(await a11y(p), []);
      if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, 'trener-przycisk-' + scheme + '.png') }); }
    }
    assert.deepEqual(p.errors, []);
    await ctx.close();
  }
});

// v70: zejście po 🟡 / 🔴 w bojach z „max dziś” (sufit = plan) i podpowiedź drop setu po ostatniej serii
const SNATCH = (simple) => ({ cfg: { name: 'Robert', pain: false, simple, extra: 0, olyCeil: 0.05 },
  plan: [{ week: 1, day: 'S1', title: 'H2', date: '2026-11-17', order: 1, name: 'Snatch', prio: 'A', sets: 5, reps: '2', pct: 0.75, kg: 112.5, rpe: '', note: '', extra: 0, drop: 0, block: 'H2', group: 'R', swaps: [] }],
  logs: [], sessions: [], readiness: [] });
for (const [mode, simple, scheme] of [['pro', false, 'light'], ['pro', false, 'dark'], ['prosty', true, 'light'], ['prosty', true, 'dark']])
test(`Boje (${mode}, ${scheme}): po 🟡 „max dziś” zablokowane i kolejne serie na kg z planu, po 🔴 to samo, po 🔴 na ostatniej „+ drop set” −10%`, async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: SNATCH(simple), scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set.oly');
  const S = n => `.set[data-o="1"][data-s="${n}"]`;
  assert.match(await p.textContent('.rx'), /max dziś 120 kg/);                                    // 1RM 150 × (0,75 + 0,05)
  assert.equal(await p.$('.mxd.lock'), null);
  assert.equal(await p.isVisible('.mxd small'), false);
  await rate(p, 1, 'L');
  assert.match(await p.textContent('.sug'), simple ? /Łatwo: możesz dołożyć 2,5 kg/ : /Łatwo: zostań przy 112,5 kg\. Do 120 kg dokładasz tylko po bardzo łatwym/);   // PRO: wariant b
  // S2 na 120 (sufit dnia) = Średnio → wracasz do planu
  await p.fill(S(2) + ' .kg', '120'); await p.$eval(S(2) + ' .kg', e => e.blur()); await rate(p, 2, 'S');
  assert.deepEqual((({ kg, ocena, rpe }) => ({ kg, ocena, rpe }))(lastSet(calls)), { kg: 120, ocena: 'S', rpe: 8 });   // zapis bez zmian
  assert.equal((await p.textContent('.sug')).trim(), '🟡 → wracasz do planu (112,5 kg).');
  assert.deepEqual(await Promise.all([3, 4, 5].map(n => fval(p, S(n) + ' .kg'))), ['112,5', '112,5', '112,5']);
  assert.deepEqual(await p.$$eval(S(3) + ' .kg', i => i.map(x => x.value)), ['']);                 // podpowiedź, nie wpis: klient może nadpisać
  assert.ok(await p.$('.mxd.lock'));
  assert.match(await p.textContent('.mxd'), /zablokowane/);
  assert.equal(await p.isVisible('.mxd small'), true);
  assert.equal(await p.$('.sug [data-setkg]'), null);                                           // domyślne już ustawione
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `zejscie-${mode}-${scheme}.png`) }); }
  // ręczne nadpisanie: S3 znów 120 i Walka → znów plan (🔴); S4 ✓ na pustym polu = 112,5
  await p.fill(S(3) + ' .kg', '120'); await p.$eval(S(3) + ' .kg', e => e.blur());
  assert.equal(await p.$eval('.sug [data-setkg]', b => b.dataset.setkg), '112.5');             // wpisane ręcznie zostaje, „Ustaw” wraca
  await rate(p, 3, 'W');
  assert.equal(lastSet(calls).kg, 120);
  assert.equal((await p.textContent('.sug')).trim(), '🔴 → wracasz do planu (112,5 kg).');
  await rate(p, 4, 'L');
  assert.equal(lastSet(calls).kg, 112.5);
  assert.match(await p.textContent('.sug'), /Łatwo, ale po 🟡 sufit to plan: zostań przy 112,5 kg/);
  // ostatnia seria Walka → podpowiedź drop setu −10% w dół do 2,5 kg
  await rate(p, 5, 'W');
  assert.match(await p.textContent('.sug'), /🔴 → serie z planu zrobione\. Jeśli chcesz dołożyć: \+ drop set 100 kg \(−10%\)/);
  if (process.env.SCREENS !== '0') { await p.$eval('.sug', e => e.scrollIntoView({ block: 'center' })); await p.screenshot({ path: path.join(SCREENS, `zejscie-drop-${mode}-${scheme}.png`) }); }
  await p.click('.sug [data-dropkg="100"]'); await p.waitForSelector('.set[data-o="1"][data-k="d"]');
  assert.equal(await fval(p, '.set[data-o="1"][data-s="D1"] .kg'), '100');
  assert.equal(await p.$('.sug.drop'), null);                                                    // drop set dodany: podpowiedź znika
  assert.deepEqual(await a11y(p), []);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// v70: Dyspozycja → „Ból / napięcie” w dowolny dzień (zakładka Stan), kilka miejsc naraz, usuwanie, offline przez kolejkę
for (const [mode, simple, scheme] of [['pro', false, 'light'], ['pro', false, 'dark'], ['prosty', true, 'light'], ['prosty', true, 'dark']])
test(`Stan ciała (${mode}, ${scheme}): ból / napięcie poza sesją, lista 14 dni, usuwanie, offline`, async () => {
  const calls = [], d = new Date(), z = n => String(n).padStart(2, '0'), iso = x => x.getFullYear() + '-' + z(x.getMonth() + 1) + '-' + z(x.getDate());
  const today = iso(d), old = iso(new Date(d.getTime() - 20 * 864e5)), week = iso(new Date(d.getTime() - 5 * 864e5));
  const data = Object.assign({}, simple ? DATA : PRO, { readiness: [], stan: [
    { id: 'robert|' + week + '|Biodro P', zapisano: week + 'T08:00:00.000Z', klient: 'robert', data: week, miejsce: 'Biodro', strona: 'P', ocena: 2, kontekst: 'po treningu', cwiczenie: '', notatka: '' },
    { id: 'robert|' + old + '|Bark L', zapisano: old + 'T08:00:00.000Z', klient: 'robert', data: old, miejsce: 'Bark', strona: 'L', ocena: 6, kontekst: '', cwiczenie: '', notatka: '' }] });
  const { ctx, p } = await page(calls, false, { data, scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set');
  await p.click('#nav [data-tab="dysp"]'); await p.waitForSelector('#dysp .stan');
  assert.equal(await p.$$eval('#dysp .stan .st-r', r => r.length), 1);                         // starsze niż 14 dni nie pokazujemy
  assert.match(await p.textContent('#dysp .stan .st-r'), /Biodro P 2\/10 · po treningu/);
  assert.equal(await p.$('#st-save'), null);
  await p.click('#dysp [data-st="Kolano L"]'); await p.click('#dysp [data-st="Bark P"]');
  assert.equal(await p.isDisabled('#st-save'), true);
  const E = k => `#dysp .st-e[data-k="${k}"]`;
  await p.click(E('Kolano L') + ' .pv[data-v="3"]'); await p.click(E('Kolano L') + ' [data-ctx="w ćwiczeniu"]');
  await p.fill(E('Kolano L') + ' .st-ex', 'Przysiad tylny'); await p.fill(E('Kolano L') + ' .st-note', 'kłuje przy zejściu');
  assert.equal((await p.textContent('#st-save')).trim(), 'Zapisz 1 miejsce');
  await p.click(E('Bark P') + ' .pv[data-v="0"]'); await p.click(E('Bark P') + ' [data-ctx="spoczynek"]');
  assert.equal((await p.textContent('#st-save')).trim(), 'Zapisz 2 miejsca');
  assert.deepEqual(await a11y(p), []);
  if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.$eval('#dysp .stan', e => e.scrollIntoView()); await p.screenshot({ path: path.join(SCREENS, `stan-${mode}-${scheme}.png`) }); }
  await p.click('#st-save'); await p.waitForTimeout(150);
  assert.deepEqual(calls.filter(c => c.fn === 'saveStan').map(c => c.args[0]), [[
    { date: today, place: 'Kolano', side: 'L', score: 3, context: 'w ćwiczeniu', exercise: 'Przysiad tylny', note: 'kłuje przy zejściu' },
    { date: today, place: 'Bark', side: 'P', score: 0, context: 'spoczynek', exercise: '', note: '' }]]);
  assert.equal(await p.$('#dysp .st-e'), null);                                                 // formularz wyczyszczony
  assert.equal(await p.$$eval('#dysp .stan .st-r', r => r.length), 3);
  assert.match(await p.textContent('#dysp .stan .st-list'), /Kolano L 3\/10 · w ćwiczeniu: Przysiad tylny · kłuje przy zejściu/);
  // „Inne” z własną nazwą: bez nazwy nie da się zapisać
  await p.click('#dysp [data-st="inne"]'); await p.click(E('inne') + ' .pv[data-v="4"]');
  assert.equal(await p.isDisabled('#st-save'), true);
  await p.fill(E('inne') + ' .st-place', 'stopa'); await p.click(E('inne') + ' [data-side="L"]');
  assert.equal(await p.isDisabled('#st-save'), false);
  // bez sieci: zapis i usunięcie trafiają do kolejki, po ponownym otwarciu lista je pokazuje
  await ctx.unroute('**/macros/**'); await ctx.route('**/macros/**', r => r.abort());
  await p.click('#st-save'); await p.waitForTimeout(200);
  const del = '#dysp [data-del="' + week + '|Biodro P"]';
  await p.click(del); assert.match(await p.textContent(del), /usuń\?/); await p.click(del); await p.waitForTimeout(200);
  assert.deepEqual((await p.evaluate(() => JSON.parse(localStorage.getItem('q_kabc')))).map(x => x.fn + ':' + JSON.stringify(x.payload)),
    ['saveStan:' + JSON.stringify([{ date: today, place: 'stopa', side: 'L', score: 4, context: '', exercise: '', note: '' }]),
     'deleteStan:' + JSON.stringify({ date: week, place: 'Biodro', side: 'P' })]);
  await p.goto(base); await p.waitForSelector('.set', { state: 'attached' });
  await p.click('#nav [data-tab="dysp"]'); await p.waitForSelector('#dysp .stan');
  const txt = await p.textContent('#dysp .stan .st-list');
  assert.match(txt, /stopa L 4\/10/);
  assert.doesNotMatch(txt, /Biodro/);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

// --- rozgrzewka przy ćwiczeniu A: propozycja z ciężaru roboczego, „Wstaw (n)”, „+ rozgrzewka” bierze kolejny krok ---
const WARM = Object.assign({}, PRO, {
  plan: [
    { week: 2, day: 'T1', title: 'Siła A', date: '2026-10-13', order: 1, name: 'Przysiad ze sztangą', prio: 'A', sets: 3, reps: '5', pct: 0.75, kg: 100, rpe: 8, note: '', extra: 0, drop: 0, block: '', group: '', swaps: [] },
    { week: 2, day: 'T1', title: 'Siła A', date: '2026-10-13', order: 2, name: 'Wiosłowanie hantlem', prio: 'B', sets: 3, reps: '10', pct: null, kg: 30, rpe: 8, note: '', extra: 0, drop: 0, block: '', group: '', swaps: [] }
  ],
  logs: []
});
for (const [mode, scheme] of [['PRO', 'light'], ['PROSTY', 'dark']]) test(`Rozgrzewka ${mode} ${scheme}: propozycja przy A, „Wstaw (4)”, ✓ zapisuje R1 z propozycją`, async () => {
  const calls = [], data = mode === 'PRO' ? WARM : Object.assign({}, WARM, { cfg: Object.assign({}, WARM.cfg, { simple: true }) });
  const { ctx, p } = await page(calls, false, { data, scheme });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  const wu = '[data-wu="1"]';
  assert.match(await p.textContent(wu), mode === 'PRO' ? /gryf × 8 · 40 × 5 · 60 × 3 · 80 × 2/ : /sam gryf × 8 · 40 × 5 · 60 × 3 · 80 × 2/);
  assert.match(await p.textContent(wu + ' button'), /Wstaw \(4\)/);
  assert.equal(await p.$('[data-wu="2"]'), null);                          // B: bez propozycji
  const shot = async n => { if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.$eval('[data-card="1"]', e => e.scrollIntoView()); await p.screenshot({ path: path.join(SCREENS, `rozgrzewka-${n}-${mode}-${scheme}.png`) }); } };
  await shot('1');
  await p.click(wu + ' button');
  assert.equal(await p.isHidden(wu), true);
  assert.deepEqual(await p.$$eval('.set[data-o="1"][data-k="w"] .kg', a => a.map(i => i.dataset.ph)), ['20', '40', '60', '80']);
  assert.deepEqual(await p.$$eval('.set[data-o="1"][data-k="w"] .reps', a => a.map(i => i.dataset.ph)), ['8', '5', '3', '2']);
  await p.click('.set[data-o="1"][data-s="R1"] .ok'); await p.waitForTimeout(100);
  assert.deepEqual((({ set, kg, reps, done }) => ({ set, kg, reps, done }))(lastSet(calls)), { set: 'R1', kg: 20, reps: 8, done: true });
  assert.equal(await p.isVisible('#rest'), false);                         // po rozgrzewce bez przerwy
  assert.deepEqual(await p.$$eval('.set[data-o="1"][data-k="p"] .kg', a => a.map(i => i.value || i.dataset.ph)), ['100', '100', '100']);   // robocze bez zmian
  await shot('2');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});
test('Prowadź: ćwiczenie z masą ciała i na czas (+ Ćwiczenie, zmień plan), − / + seria robocza', async () => {
  const day = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const ex = (order, name, prio, kg, reps) => ({ week: 13, day: 'T1', title: 'Nogi', date: day(0), order, name, prio, sets: 3, reps, pct: null, kg, rpe: '', note: '', extra: 1, drop: 0, block: 'B2' });
  const LD = { cfg: { name: 'Ania', pain: true, simple: false, extra: 1, swap: 'DOWOLNA', scale: 'RPE', edit: true, own: true, live: true },
    plan: [ex(1, 'Przysiad tylny', 'A', 85, '5'), ex(2, 'Plank', 'B', 'BW', '30 s')],
    logs: [1, 2, 3].map(s => ({ id: 'ania|13|T1|1|' + s, tydzien: 13, jednostka: 'T1', data: day(0), nr_cw: 1, cwiczenie: 'Przysiad tylny', seria: s, kg: 85, powt: 5, rpe: 8, wykonane: 'TAK', typ: '', zapisano: day(0) + 'T07:00:00.000Z' })),
    sessions: [] };
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const JWT = b64({ alg: 'none' }) + '.' + b64({ exp: Math.floor(Date.now() / 1000) + 3600, email: 't@example.com' }) + '.sig';
  const api = b => b.fn === 'getExNames' ? [['Squat Hold', '', 'uda']] : b.fn === 'trPlan' ? { n: 1, weeks: [13], rows: [{ week: 13, day: 'T1', order: 2, f: { sets: 4 } }] } : null;
  for (const scheme of ['light', 'dark']) {
    const calls = []; const { ctx, p } = await page(calls, false, { data: LD, api, scheme });
    await ctx.addInitScript(j => { try { localStorage.setItem('tr_tok', j); } catch (e) {} }, JWT);
    await p.goto(base + '?prowadz=ania&j=13%7CT1'); await p.waitForSelector('.set[data-o="2"]');
    // serie robocze: przysiad ma zapisane 3 z 3 → „− seria” zablokowane; plank (tryb skupienia zaczyna od niego) „+ seria” zmienia plan
    // wyraźne wyjście: „✕ Wyjdź” w pasku i w „⋯” jednostki, oba do karty klienta w panelu
    assert.equal((await p.textContent('#live-back')).trim(), '✕ Wyjdź');
    assert.match(await p.getAttribute('#live-back', 'href'), /trener\.html#k\/ania$/);
    if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `prowadz-wyjdz-${scheme}.png`), clip: { x: 0, y: 0, width: 390, height: 200 } }); }
    await p.click('#umore'); assert.match(await p.getAttribute('#u-exit', 'href'), /trener\.html#k\/ania$/); await p.click('[data-close]');
    assert.equal(await p.isDisabled('[data-tsets="1"][data-d="-1"]'), true);
    assert.equal(await p.isDisabled('[data-tsets="2"][data-d="-1"]'), false);
    await p.click('[data-tsets="2"][data-d="1"]');
    await p.waitForSelector('.set[data-o="2"][data-s="4"][data-k="p"]');
    assert.deepEqual(calls.find(c => c.fn === 'trPlan').args[1].ex, [{ order: 2, sets: '4' }]);
    // zmień plan: Plank ma już BW i czas
    await p.click('[data-tplan="2"]');
    assert.equal(await p.getAttribute('[data-kbw="1"]', 'aria-pressed'), 'true');
    assert.equal(await p.getAttribute('[data-ktm="1"]', 'aria-pressed'), 'true');
    assert.equal(await p.inputValue('#tp-reps'), '30'); assert.equal(await p.isDisabled('#tp-kg'), true);
    assert.equal(await p.textContent('#tp-rl'), 'Sekundy');
    // priorytet i połączenie z poprzednim (obwód: oba ćwiczenia dostają tę samą literę)
    assert.equal(await p.getAttribute('[data-kpr="B"]', 'aria-pressed'), 'true');
    await p.click('[data-kpr="K"]'); await p.click('[data-klink]'); await p.click('#tp-ok');
    await p.waitForFunction(() => !document.querySelector('#tp-ok'));
    assert.deepEqual(calls.filter(c => c.fn === 'trPlan')[1].args[1].ex, [{ order: 2, prio: 'K', circuit: 'A' }, { order: 1, circuit: 'A' }]);
    // + Ćwiczenie: Squat Hold, masa ciała, na czas 3 × 20 s
    await p.click('#fx-add'); await p.fill('#ed-q', 'squat h'); await p.waitForSelector('#ed-res [data-n]'); await p.click('#ed-res [data-n]');
    await p.click('[data-kbw="1"]'); await p.click('[data-ktm="1"]'); await p.fill('#ed-reps', '20');
    assert.equal(await p.getAttribute('[data-kpr="A"]', 'aria-pressed'), 'true');
    await p.click('[data-klink]');
    assert.equal(await p.textContent('#ed-rl'), 'Sekundy');
    if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `prowadz-bw-czas-${scheme}.png`) }); }
    await p.click('#ed-ok');
    await p.waitForSelector('.set[data-o="3"]');
    const ed = calls.find(c => c.fn === 'editPlan').args[0];
    assert.equal(ed.kg, 'BW'); assert.equal(ed.reps, '20 s'); assert.equal(ed.trainer, true); assert.equal(ed.prio, 'A'); assert.equal(ed.link, true);
    assert.ok(await p.$('.grp .card[data-card="3"], .grp [data-card="3"]'), 'nowe ćwiczenie w ramce serii łączonych');
    assert.equal(await p.getAttribute('.set[data-o="3"][data-s="1"] .kg', 'placeholder'), 'BW');
    assert.equal(await p.getAttribute('.set[data-o="3"][data-s="1"] .reps', 'data-u'), 'sek.');
    if (process.env.SCREENS !== '0') { await p.locator('.card[data-card]').last().scrollIntoViewIfNeeded(); await p.screenshot({ path: path.join(SCREENS, `prowadz-bw-karta-${scheme}.png`) }); }
    assert.deepEqual(p.errors, []);
    await ctx.close();
  }
});
test('Rozgrzewka: „+ rozgrzewka” podsuwa kolejny krok propozycji, potem pusty wiersz; po zapisanej serii roboczej bez propozycji', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, false, { data: WARM });
  await p.goto(base + '?k=kabc'); await p.waitForSelector('.set[data-o="1"]');
  for (let i = 0; i < 5; i++) await p.click('[data-warm="1"]');
  assert.deepEqual(await p.$$eval('.set[data-o="1"][data-k="w"] .kg', a => a.map(i => i.dataset.ph)), ['20', '40', '60', '80', '']);
  assert.equal(await p.isHidden('[data-wu="1"]'), true);
  await ctx.close();
  const done = Object.assign({}, WARM, { logs: [{ id: 'robert|2|T1|1|1', zapisano: '2026-10-13T10:00:00.000Z', cwiczenie: 'Przysiad ze sztangą', tydzien: 2, jednostka: 'T1', seria: 1, kg: 100, powt: 5, rpe: 8, wykonane: 'TAK', typ: '' }] });
  const b = await page([], false, { data: done });
  await b.p.goto(base + '?k=kabc'); await b.p.waitForSelector('.set[data-o="1"]');
  assert.equal(await b.p.isHidden('[data-wu="1"]'), true);
  assert.deepEqual(b.p.errors, []);
  await b.ctx.close();
});

test('Prowadź trening (tryb trenera): bilet trenera zamiast klucza, notatka, zmiana planu, + Ćwiczenie; bez biletu logowanie', async () => {
  const day = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const ex = (week, date, order, name, prio, kg) => ({ week, day: 'T1', title: 'Nogi', date, order, name, prio, sets: 3, reps: '5', pct: null, kg, rpe: 8, note: '', extra: 1, drop: 0, block: 'B2' });
  const LD = { cfg: { name: 'Ania', pain: true, simple: false, extra: 1, swap: 'DOWOLNA', scale: 'RPE', edit: true, own: true, live: true },
    plan: [ex(12, day(-7), 1, 'Przysiad tylny', 'A', 82.5), ex(12, day(-7), 2, 'Martwy ciąg rumuński', 'B', 70), ex(13, day(0), 1, 'Przysiad tylny', 'A', 85), ex(13, day(0), 2, 'Martwy ciąg rumuński', 'B', 70)],
    logs: [1, 2, 3].map(s => ({ id: 'ania|12|T1|1|' + s, tydzien: 12, jednostka: 'T1', data: day(-7), nr_cw: 1, cwiczenie: 'Przysiad tylny', seria: s, kg: 82.5, powt: 5, rpe: 8, wykonane: 'TAK', typ: '', zapisano: day(-7) + 'T17:00:00.000Z', notatka_trenera: '', komentarz_trenera: '' })),
    sessions: [{ id: 'ania|12|T1', tydzien: 12, jednostka: 'T1', data: day(-7), start: day(-7) + 'T16:00:00.000Z', rpe_sesji: 8 }] };
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const JWT = b64({ alg: 'none' }) + '.' + b64({ exp: Math.floor(Date.now() / 1000) + 3600, email: 't@example.com' }) + '.sig';
  const api = b => b.fn === 'getExNames' ? [['Wykrok w tył', '', 'pośladki']] : b.fn === 'trPlan' ? { n: 1, weeks: [13], rows: [{ week: 13, day: 'T1', order: 1, f: { kg: 87.5 } }] } : null;
  // bez biletu: karta logowania, nic nie idzie do API
  {
    const calls = []; const { ctx, p } = await page(calls, false, { data: LD, api });
    await p.goto(base + '?prowadz=ania'); await p.waitForSelector('#main a[href*="trener.html#prowadz/ania"]');
    assert.equal(calls.length, 0);
    await ctx.close();
  }
  for (const scheme of ['light', 'dark']) {
    const calls = []; const { ctx, p } = await page(calls, false, { data: LD, api, scheme });
    await ctx.addInitScript(j => { try { localStorage.setItem('tr_tok', j); localStorage.setItem('key', 'kmojklucz01'); } catch (e) {} }, JWT);
    await p.goto(base + '?prowadz=ania&j=13%7CT1'); await p.waitForSelector('.set[data-o="1"]');
    assert.match(await p.textContent('#eyebrow'), /Prowadzisz · Ania/);
    assert.equal(await p.isVisible('#live-back'), true);
    assert.equal(await p.isHidden('#nav [data-tab="dysp"]'), true);
    assert.equal(await p.isHidden('#nav [data-tab="trener"]'), true);
    await p.click('.set[data-o="1"][data-s="1"] .ok');
    await p.waitForFunction(() => document.querySelector('.tnote textarea'));
    await p.fill('.tnote textarea', 'Kolana lepiej. Zostajemy na 85.'); await p.click('[data-tnp="1"]'); await p.click('[data-tns]');
    await p.click('[data-tplan="1"]'); await p.fill('#tp-kg', '87,5'); await p.click('#tp-ok');
    await p.waitForTimeout(300);
    if (process.env.SCREENS !== '0') { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, `prowadz-${scheme}.png`) }); }
    await p.click('#fx-add'); await p.fill('#ed-q', 'wykr'); await p.waitForSelector('#ed-res [data-n]'); await p.click('#ed-res [data-n]'); await p.click('#ed-ok');
    await p.waitForFunction(() => document.querySelectorAll('.card[data-card]').length >= 3);
    for (const c of calls) { assert.equal(c.key, undefined, c.fn); assert.equal(c.as, 'ania', c.fn); assert.equal(c.token, JWT, c.fn); }
    const note = calls.find(c => c.fn === 'liveNote');
    assert.deepEqual(note.args[0], { week: 13, day: 'T1', order: 1, text: 'Kolana lepiej. Zostajemy na 85.', pub: true });
    const tp = calls.find(c => c.fn === 'trPlan');
    assert.equal(tp.args[0], 'ania'); assert.equal(tp.args[1].live, true); assert.deepEqual(tp.args[1].ex, [{ order: 1, kg: '87,5' }]);
    const ed = calls.find(c => c.fn === 'editPlan');
    assert.equal(ed.args[0].trainer, true); assert.equal(ed.args[0].name, 'Wykrok w tył');
    assert.equal(await p.evaluate(() => localStorage.getItem('key')), 'kmojklucz01');   // klucz trenera-klienta (własny trening) nietknięty
    assert.deepEqual(p.errors, []);
    await ctx.close();
  }
});
