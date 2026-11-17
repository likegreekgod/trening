// Test panelu trenera (web/trener.html): web/ serwowane lokalnie, API i logowanie Google podmienione atrapami.
// Dane wyłącznie syntetyczne.
const test = require('node:test'), assert = require('node:assert');
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const WEB = path.join(__dirname, '..', 'web');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const SCREENS = path.join(__dirname, 'screens');
const TODAY = '2026-11-17';
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const MON = addDays(TODAY, -1);                               // poniedziałek bieżącego tygodnia
const WEEKS = Array.from({ length: 12 }, (_, i) => addDays(MON, -7 * (11 - i)));

// ---------- dane syntetyczne ----------
const load = (base, statusAt) => WEEKS.map((w, i) => ({ week: w, srpe: base ? Math.round(base * (0.7 + 0.05 * i) + (i % 3) * 40) : null, ton: base ? base * 10 + i * 300 : 0, status: i === statusAt ? 'za dużo' : base ? 'OK' : '' }));
const PULPIT = {
  today: TODAY, at: TODAY + 'T06:10:00.000Z', weeks: WEEKS,
  clients: [
    { id: 'ania', name: 'Ania', urg: 4, red: 1, signals: [{ lv: 'bad', t: 'ból 5/10 kolano' }, { lv: 'warn', t: '2 serie FAIL' }], last: TODAY, ago: 0, week: '1/2', late: 0, status: 'za dużo', note: 'Kolano po przysiadach trochę ćmi', films: 3, filmsNew: 2, planLeft: 26, own: 0, errors: 0, load: load(900, 11) },
    { id: 'bartek', name: 'Bartek', urg: 2, red: 0, signals: [{ lv: 'warn', t: 'zaległa jednostka' }, { lv: 'warn', t: 'koniec planu za 5 dni' }], last: addDays(TODAY, -4), ago: 4, week: '0/3', late: 1, status: 'uwaga', note: '', films: 1, filmsNew: 0, planLeft: 5, own: 0, errors: 0, load: load(700, -1) },
    { id: 'celina', name: 'Celina', urg: 0, red: 0, signals: [], last: addDays(TODAY, -1), ago: 1, week: '1/2', late: 0, status: 'OK', note: '', films: 0, filmsNew: 0, planLeft: 40, own: 1, errors: 0, load: load(500, -1) },
    { id: 'darek', name: 'Darek', urg: 1, red: 0, signals: [{ lv: 'warn', t: 'brak treningu 9 dni' }], last: addDays(TODAY, -9), ago: 9, week: '0/2', late: 0, status: '', note: '', films: 0, filmsNew: 0, planLeft: null, own: 0, errors: 0, load: load(0, -1) }
  ],
  blocks: [{ id: 'bartek', name: 'Bartek', block: 'B1', from: addDays(TODAY, -40), to: addDays(TODAY, -2), wnioski: '', dlaKlienta: '' }],
  videos: [
    { id: 'ania', name: 'Ania', at: TODAY, week: 12, day: 'T1', order: 1, ex: 'Przysiad tylny', set: 3, kg: 80, reps: 5, rpe: 8.5, ocena: '', typ: '', note: 'Ostatnie powtórzenie wolne', file: 'film1', link: 'https://drive.google.com/file/d/film1/view', kom: '' },
    { id: 'ania', name: 'Ania', at: TODAY, week: 12, day: 'T1', order: 1, ex: 'Przysiad tylny', set: 1, kg: 80, reps: 5, rpe: 7.5, ocena: '', typ: '', note: '', file: 'film2', link: 'https://drive.google.com/file/d/film2/view', kom: '' },
    { id: 'ania', name: 'Ania', at: addDays(TODAY, -5), week: 11, day: 'T2', order: 2, ex: 'Wyciskanie na ławce', set: 2, kg: 45, reps: 6, rpe: 9, ocena: '', typ: 'FAIL', note: '', file: 'film3', link: 'https://drive.google.com/file/d/film3/view', kom: '0:04 łokcie za szeroko' },
    { id: 'bartek', name: 'Bartek', at: addDays(TODAY, -6), week: 4, day: 'T1', order: 1, ex: 'Rwanie', set: 2, kg: 60, reps: 1, rpe: '', ocena: 'S', typ: '', note: '', file: 'film4', link: 'https://drive.google.com/file/d/film4/view', kom: 'Dobra pozycja startowa' }
  ]
};
const SZKIC = 'Przysiad 84 kg na 3×5 to Twój najlepszy wynik w tym bloku, a ostatnia seria była ciężka, ale czysta. W czwartek zostajemy przy tym ciężarze.\n\nKolano 5/10 traktuję poważnie: dłuższa rozgrzewka, a jeśli ból wróci powyżej 3/10, zejdź o 10% i napisz mi.';
function klient() {
  const plan = [], logs = [], sessions = [], readiness = [], summary = [];
  WEEKS.forEach((mon, i) => {
    const wk = i + 1, block = wk <= 6 ? 'B1' : 'B2';
    [['T1', 1, 'Nogi'], ['T2', 3, 'Góra']].forEach(([day, off, title]) => {
      const date = addDays(mon, off);
      const ex = day === 'T1' ? [['Przysiad tylny', 'A', 60 + wk * 2], ['Wiosłowanie hantlą', 'B', 20]] : [['Wyciskanie na ławce', 'A', 35 + wk], ['Podciąganie', 'B', 0]];
      ex.forEach(([name, prio, kg], k) => plan.push({ week: wk, day, title, date, order: k + 1, name, prio, sets: 3, reps: '5', kg, rpe: 8, block, group: '' }));
      if (date > TODAY || (date === TODAY && day !== 'T1')) return;
      if (wk === 5 && day === 'T2') return;                    // jedna opuszczona jednostka
      ex.forEach(([name, , kg], k) => { for (let s = 1; s <= 3; s++) logs.push({ id: ['ania', wk, day, k + 1, s].join('|'), zapisano: date + 'T17:00:00.000Z', tydzien: wk, jednostka: day, data: date, nr_cw: k + 1, cwiczenie: name, seria: s, kg: kg || 'BW', powt: 5, rpe: 7 + s * 0.5, wykonane: 'TAK', typ: wk === 11 && k === 0 && s === 3 ? 'FAIL' : '', film_link: date === TODAY && k === 0 && s !== 2 ? 'https://drive.google.com/file/d/x/view' : '', uwagi: date === TODAY && k === 0 ? 'Ostatnie powtórzenie wolne' : '' }); });
      sessions.push({ id: 'ania|' + wk + '|' + day, tydzien: wk, jednostka: day, data: date, start: date + 'T16:00:00.000Z', czas_min: 55 + (wk % 3) * 5, samopoczucie: 4, rpe_sesji: date === TODAY ? 8 : 7, bol: date === TODAY ? 'kolano:5' : '', bol_max: date === TODAY ? 5 : 0, uwagi: date === TODAY ? 'Kolano po przysiadach trochę ćmi' : '', komentarz_trenera: wk === 10 && day === 'T1' ? 'Bardzo równe serie, tak trzymaj.' : '' });
    });
    summary.push({ week: mon, srpe: 700 + i * 40, acwr: 1 + i * 0.03, ton: 5000 + i * 200, done: 100, hard: 6, status: i === 11 ? '🔴 za dużo' : '🟢 OK', why: '' });
    readiness.push({ data: addDays(mon, 1), werdykt: i === 11 ? 'Uwaga' : 'OK', cmj_sr: 31 + (i % 4) * 0.5, hooper_suma: 12 + (i % 3), vbt_test: 0.92, powody: i === 11 ? 'CMJ −6%' : '' });
  });
  return {
    cfg: { name: 'Ania', id: 'ania', active: true, masters: false, simple: false, scale: 'RPE', pain: true },
    plan, logs, sessions, readiness, summary, removed: [], blockNotes: {},
    blocks: [{ blok: 'B1', od: WEEKS[0], do: addDays(WEEKS[5], 6), tygodnie: 6, jednostki: 11, 'wykonanie_%': 92, tonaz_kg: 41250, e1RM_zm: 'Przysiad tylny +8%', najlepsze_boje: '', sRPE_sr: 720, samopocz_sr: 4, dyspozycja: 'OK', bol_max: 2, statusy: 'OK ×6', wnioski: 'Dobra adaptacja, więcej objętości na górę.', dla_klienta: 'Świetny blok, przysiad +8%.' },
      { blok: 'B2', od: WEEKS[6], do: addDays(WEEKS[11], 13), tygodnie: 6, jednostki: 11, 'wykonanie_%': 100, tonaz_kg: 30100, e1RM_zm: '', najlepsze_boje: '', sRPE_sr: 790, samopocz_sr: 4, dyspozycja: 'Uwaga ×1', bol_max: 5, statusy: 'OK ×5, za dużo ×1', wnioski: '', dla_klienta: '' }]
  };
}

// ---------- serwer, przeglądarka, atrapy ----------
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

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const JWT = (exp) => b64({ alg: 'RS256' }) + '.' + b64({ email: 'trener@example.com', exp }) + '.podpis';
// atrapa Google Identity Services: przycisk „Zaloguj (atrapa)” oddaje bilet przez callback
const GSI = `window.google = { accounts: { id: {
  initialize(o){ window.__gcb = o.callback; window.__gcfg = o; },
  renderButton(el){ el.innerHTML = '<button id="fake-g" type="button">Zaloguj (atrapa)</button>'; el.querySelector('button').onclick = () => window.__gcb({ credential: window.__jwt }); },
  prompt(){}, disableAutoSelect(){ window.__noauto = true; } } } };`;

async function page(calls, opt = {}) {
  const ctx = await browser.newContext({ viewport: opt.vp || { width: 1440, height: 900 }, colorScheme: opt.scheme || 'light', reducedMotion: 'reduce' });
  const st = { authFail: 0 };
  await ctx.route('**/macros/**', async r => {
    const b = JSON.parse(r.request().postData() || '{}'); calls.push(b);
    let out;
    if (b.fn === 'trConfig') out = { ok: true, result: { clientId: 'test.apps.googleusercontent.com', ready: opt.ready !== false } };
    else if (!b.token) out = { ok: false, error: 'Logowanie: brak biletu' };
    else if (st.authFail > 0) { st.authFail--; out = { ok: false, error: 'Logowanie: bilet wygasł' }; }
    else if (b.fn === 'trPulpit' || b.fn === 'trPrzelicz') out = { ok: true, result: Object.assign({}, PULPIT, b.fn === 'trPrzelicz' ? { at: TODAY + 'T09:30:00.000Z' } : {}) };
    else if (b.fn === 'trKlient') out = b.args[0] === 'ania' ? { ok: true, result: klient() } : { ok: false, error: 'Nie ma klienta: ' + b.args[0] };
    else if (b.fn === 'trKomentarz') out = { ok: true, result: { text: String(b.args[3]).trim(), at: TODAY + 'T19:52:00.000Z' } };
    else if (b.fn === 'trSzkic') { st.ai = (st.ai || 0) + 1; await new Promise(res => setTimeout(res, 150));
      out = opt.ai === false ? { ok: false, error: 'Szkic AI nie jest jeszcze włączony: w arkuszu wybierz Trening → Ustaw klucz Claude API (klucz z console.anthropic.com).' }
        : { ok: true, result: { text: (b.args[3] && b.args[3].tweak === 'krocej' ? 'Krótko: ' : '') + SZKIC, cost: 0.024, n: st.ai, limit: 30, model: 'claude-opus-5-5' } }; }
    else out = { ok: false, error: 'Nieznana funkcja: ' + b.fn };
    await r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify(out) });
  });
  await ctx.route('https://accounts.google.com/**', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/javascript' }, body: GSI }));
  await ctx.route('https://drive.google.com/**', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: '<body style="margin:0;background:#222;color:#bbb;font:14px sans-serif;display:grid;place-items:center;height:100vh">podgląd filmu (atrapa)</body>' }));
  const exp = Math.floor(Date.now() / 1000) + 3600;
  await ctx.addInitScript(([j, tok]) => { window.__jwt = j; if (tok) try { localStorage.setItem('tr_tok', j); } catch (e) {} }, [JWT(exp), !!opt.loggedIn]);
  const p = await ctx.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  p.st = st;
  return { ctx, p };
}
const shot = async (p, name) => { fs.mkdirSync(SCREENS, { recursive: true }); await p.screenshot({ path: path.join(SCREENS, name), fullPage: true }); };

test('panel: logowanie przyciskiem Google → pulpit z klientami, sygnałami i listą do zrobienia', async () => {
  const calls = [];
  const { ctx, p } = await page(calls);
  await p.goto(base + 'trener.html');
  await p.waitForSelector('#fake-g');
  assert.equal(await p.isVisible('#app'), false);
  assert.deepEqual(calls.map(c => c.fn), ['trConfig']);           // przed zalogowaniem tylko konfiguracja
  assert.equal(await p.evaluate(() => window.__gcfg.client_id), 'test.apps.googleusercontent.com');
  assert.equal(await p.evaluate(() => localStorage.getItem('tr_dev')), null);
  await p.click('#fake-g');
  await p.waitForSelector('tr.row[data-k="ania"]');
  assert.equal(await p.evaluate(() => localStorage.getItem('tr_dev')), '1');   // urządzenie trenera: aplikacja pokaże „Panel trenera”
  assert.equal(await p.getAttribute('#mine', 'href'), './');                   // „Mój trening” = aplikacja z kluczem zapamiętanym w telefonie
  const pul = calls.find(c => c.fn === 'trPulpit');
  assert.ok(pul.token && pul.token.split('.').length === 3, 'bilet idzie z każdym zapytaniem');
  assert.equal(pul.key, undefined, 'panel nie używa klucza klienta');
  const txt = await p.textContent('#main');
  assert.match(txt, /Treningi w tym tyg\.\s*2\/9/);
  assert.match(txt, /Czerwone sygnały\s*1\s*Ania/);
  assert.match(txt, /Filmy bez komentarza\s*2/);
  assert.match(txt, /Ania: ból 5\/10 kolano/);                   // do zrobienia: czerwony sygnał
  assert.match(txt, /Bartek: koniec bloku B1/);
  assert.match(txt, /Bartek: plan kończy się za 5 dni/);
  assert.equal(await p.textContent('#n-filmy'), '2');
  assert.equal(await p.$$eval('.heat i', a => a.length), 48);    // 4 klientów × 12 tygodni
  assert.match(await p.textContent('#at'), /Przeliczone/);
  await shot(p, 'trener-pulpit-jasny.png');
  // odświeżenie strony: bilet zapamiętany, bez ponownego logowania
  await p.reload(); await p.waitForSelector('tr.row[data-k="ania"]');
  assert.equal(await p.isVisible('#login'), false);
  // przeliczenie
  await p.click('#recalc'); await p.waitForFunction(() => /09:30|10:30/.test(document.querySelector('#at').textContent));
  assert.ok(calls.some(c => c.fn === 'trPrzelicz'));
  // wylogowanie
  await p.click('#logout'); await p.waitForSelector('#login:not([hidden])');
  assert.match(await p.textContent('#login-msg'), /Wylogowano/);
  assert.equal(await p.evaluate(() => localStorage.getItem('tr_tok')), null);
  assert.equal(await p.evaluate(() => localStorage.getItem('tr_dev')), '1');   // przycisk w aplikacji zostaje po wylogowaniu
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('panel: karta klienta (przegląd, sesje, bloki, dyspozycja)', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, { loggedIn: true });
  await p.goto(base + 'trener.html');
  await p.click('tr.row[data-k="ania"] td.nw');                  // klik w wiersz tabeli
  await p.waitForSelector('.tabs');
  assert.equal(calls.find(c => c.fn === 'trKlient').args[0], 'ania');
  let txt = await p.textContent('#main');
  assert.match(txt, /Blok B2 · tydz\. 6 z 6 · tryb PRO/);
  assert.match(txt, /Ból max 7 dni\s*5\/10\s*kolano · T1/);
  assert.match(txt, /sRPE tygodnia\s*1140\s*ACWR 1,3 · za dużo/);
  assert.match(txt, /Ostatnia uwaga klienta: Kolano/);
  assert.equal(await p.$$eval('svg.ch', a => a.length), 3);      // 2 ćwiczenia główne + tonaż
  assert.match(txt, /Przysiad tylny: 84×5 @7,5 ▶, 84×5 @8, 84×5 @8,5 ▶/);
  await shot(p, 'trener-klient-jasny.png');
  await p.click('.tabs a[href$="/sesje"]'); await p.waitForSelector('details.ses');
  txt = await p.textContent('#main');
  assert.match(txt, /Sesje \(22\)/);                             // 12 tygodni × 2 − opuszczona − jutrzejsza
  assert.match(txt, /Bardzo równe serie/);
  assert.equal(await p.$$eval('details.ses[open]', a => a.length), 1);
  await p.click('.tabs a[href$="/bloki"]'); await p.waitForFunction(() => /Wnioski \(tylko Ty\)/.test(document.querySelector('#main').textContent));
  txt = await p.textContent('#main');
  assert.match(txt, /Blok B2[\s\S]*Brak\. Na razie wpisz w arkuszu[\s\S]*Blok B1[\s\S]*Dobra adaptacja/);
  await p.click('.tabs a[href$="/dyspozycja"]'); await p.waitForSelector('#main table');
  assert.match(await p.textContent('#main'), /Uwaga\s*32,5 cm/);
  assert.equal(calls.filter(c => c.fn === 'trKlient').length, 1, 'karta pobrana raz, zakładki bez nowych zapytań');
  // klient, którego serwer nie zna: błąd i „Spróbuj ponownie”, bez wylogowania
  await p.goto(base + 'trener.html#k/nikt'); await p.waitForSelector('[data-retry]');
  assert.match(await p.textContent('#main'), /Nie ma klienta: nikt/);
  assert.equal(await p.isVisible('#login'), false);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('panel: filmy bez komentarza i bloki do zamknięcia', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, { loggedIn: true });
  await p.goto(base + 'trener.html#filmy'); await p.waitForSelector('.vi');
  assert.equal(await p.$$eval('.vi', a => a.length), 2);
  assert.equal(await p.getAttribute('.player iframe', 'src'), 'https://drive.google.com/file/d/film1/preview');
  assert.match(await p.textContent('#main'), /Komentarz klienta\s*Ostatnie powtórzenie wolne/);
  await p.click('.vi:nth-child(2)');
  assert.equal(await p.getAttribute('.player iframe', 'src'), 'https://drive.google.com/file/d/film2/preview');
  await p.click('[data-vall="1"]');
  assert.equal(await p.$$eval('.vi', a => a.length), 4);
  await p.click('.vi:nth-child(3)');
  assert.match(await p.textContent('.kom'), /0:04 łokcie za szeroko/);
  assert.match(await p.textContent('#main'), /45 kg × 6 · RPE 9 · nieudana/);
  await shot(p, 'trener-filmy-jasny.png');
  // filmy jednego klienta
  await p.goto(base + 'trener.html#filmy/bartek'); await p.waitForSelector('.vi');
  assert.equal(await p.$$eval('.vi', a => a.length), 1);
  assert.match(await p.textContent('#main'), /60 kg × 1 · ocena S/);
  await p.goto(base + 'trener.html#bloki'); await p.waitForSelector('#main table');
  assert.match(await p.textContent('#main'), /Bartek\s*B1.*skończony/);
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('panel: wygasły bilet wraca do logowania, brak konfiguracji = instrukcja', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, { loggedIn: true });
  p.st.authFail = 1;
  await p.goto(base + 'trener.html'); await p.waitForSelector('#login:not([hidden])');
  assert.match(await p.textContent('#login-msg'), /bilet wygasł/);
  assert.equal(await p.evaluate(() => localStorage.getItem('tr_tok')), null);
  await p.waitForSelector('#fake-g'); await p.click('#fake-g');
  await p.waitForSelector('tr.row[data-k="ania"]');
  await ctx.close();
  const c2 = await page([], { ready: false });
  await c2.p.goto(base + 'trener.html'); await c2.p.waitForFunction(() => /skonfigurowany/.test(document.querySelector('#login-msg').textContent));
  assert.match(await c2.p.textContent('#login-msg'), /Ustaw panel trenera/);
  await c2.ctx.close();
});

test('panel: zrzuty w ciemnym motywie i na telefonie', async () => {
  for (const [scheme, vp, sfx] of [['dark', null, 'ciemny'], ['light', { width: 390, height: 844 }, 'telefon-jasny'], ['dark', { width: 390, height: 844 }, 'telefon-ciemny']]) {
    const { ctx, p } = await page([], { loggedIn: true, scheme, vp });
    await p.goto(base + 'trener.html'); await p.waitForSelector('tr.row[data-k="ania"]');
    await shot(p, 'trener-pulpit-' + sfx + '.png');
    await p.goto(base + 'trener.html#k/ania'); await p.waitForSelector('.tabs');
    await shot(p, 'trener-klient-' + sfx + '.png');
    if (vp) assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'bez przewijania w bok na telefonie');
    assert.deepEqual(p.errors, []);
    await ctx.close();
  }
});

test('panel na telefonie: pasek u góry nie rozciąga się przy krótkiej stronie, puste filmy bez powtórzonego komunikatu', async () => {
  const { ctx, p } = await page([], { loggedIn: true, vp: { width: 390, height: 844 }, scheme: 'dark' });
  await p.route('**/macros/**', r => r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, result: Object.assign({}, PULPIT, { videos: [] }) }) }));
  await p.goto(base + 'trener.html#filmy'); await p.waitForSelector('.vids');
  const h = await p.$eval('aside', a => a.getBoundingClientRect().height);
  assert.ok(h < 160, 'pasek ma ' + h + ' px');
  assert.ok(await p.isVisible('#logout'), 'wylogowanie dostępne na telefonie');
  assert.equal((await p.textContent('#main')).match(/Brak filmów/g).length, 1);
  await shot(p, 'trener-filmy-puste-telefon-ciemny.png');
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('panel: komentarz do sesji ze szkicem AI (szkic, poprawka „Krócej”, zapis, edycja) i bez klucza AI', async () => {
  for (const scheme of ['light', 'dark']) {
    const calls = [];
    const { ctx, p } = await page(calls, { loggedIn: true, scheme });
    await p.goto(base + 'trener.html#k/ania/sesje'); await p.waitForSelector('details.ses[open] .kedit textarea');
    const box = 'details.ses[open] .kedit';
    assert.equal(await p.$(box + ' .aiflag'), null);
    await p.click(box + ' button.ai');
    await p.waitForSelector(box + ' .aiflag');
    const sz = calls.find(c => c.fn === 'trSzkic');
    assert.deepEqual(sz.args.slice(0, 3), ['ania', 12, 'T1']);                 // ostatnia sesja: tydz. 12, T1
    assert.deepEqual(sz.args[3], { tweak: '', draft: '' });
    assert.match(await p.inputValue(box + ' textarea'), /^Przysiad 84 kg/);
    assert.match(await p.textContent(box), /koszt szkicu 0,024 \$ · dziś 1 z 30/);
    assert.equal(calls.filter(c => c.fn === 'trKomentarz').length, 0);          // szkic nie trafia do klienta bez „Zapisz”
    if (scheme === 'light') await shot(p, 'trener-szkic-ai-jasny.png'); else await shot(p, 'trener-szkic-ai-ciemny.png');
    // ręczna poprawka zostaje w szkicu wysyłanym do „Krócej”
    await p.fill(box + ' textarea', 'Mój poprawiony szkic.');
    await p.click(box + ' .chip[data-t="krocej"]');
    await p.waitForFunction(b => /^Krótko:/.test(document.querySelector(b + ' textarea').value), box);
    assert.deepEqual(calls.filter(c => c.fn === 'trSzkic')[1].args[3], { tweak: 'krocej', draft: 'Mój poprawiony szkic.' });
    await p.fill(box + ' textarea', '  Dobra sesja, kolano obserwujemy.  ');
    await p.click(box + ' button[data-k="save"]');
    await p.waitForSelector(box + ' .saved');
    assert.deepEqual(calls.find(c => c.fn === 'trKomentarz').args, ['ania', 12, 'T1', '  Dobra sesja, kolano obserwujemy.  ']);
    assert.equal(await p.textContent(box + ' .kom'), 'Dobra sesja, kolano obserwujemy.');
    if (scheme === 'light') await shot(p, 'trener-komentarz-zapisany.png');
    await p.click(box + ' button[data-k="edit"]');
    assert.equal(await p.inputValue(box + ' textarea'), 'Dobra sesja, kolano obserwujemy.');
    await p.click(box + ' button[data-k="cancel"]');
    await p.waitForSelector(box + ' .kom');
    // sesja z komentarzem w danych: od razu tekst i „Edytuj”
    await p.click('details.ses:has-text("tydz. 10 · T1") summary');
    assert.match(await p.textContent('details.ses:has-text("tydz. 10 · T1") .kedit .kom'), /Bardzo równe serie/);
    assert.deepEqual(p.errors, []);
    await ctx.close();
  }
  // telefon i brak klucza Claude API: czytelny komunikat w polu, bez zgubienia tekstu
  const { ctx, p } = await page([], { loggedIn: true, ai: false, vp: { width: 390, height: 844 }, scheme: 'dark' });
  await p.goto(base + 'trener.html#k/ania/sesje'); await p.waitForSelector('details.ses[open] .kedit textarea');
  await p.fill('details.ses[open] .kedit textarea', 'Mój tekst');
  await p.click('details.ses[open] .kedit button.ai');
  await p.waitForSelector('details.ses[open] .kedit .err');
  assert.match(await p.textContent('details.ses[open] .kedit .err'), /Ustaw klucz Claude API/);
  assert.equal(await p.inputValue('details.ses[open] .kedit textarea'), 'Mój tekst');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390));
  await p.$eval('details.ses[open] .kedit', e => e.scrollIntoView());
  await p.screenshot({ path: path.join(SCREENS, 'trener-szkic-ai-telefon-ciemny.png') });
  assert.deepEqual(p.errors, []);
  await ctx.close();
});
