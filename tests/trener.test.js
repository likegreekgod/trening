// Test panelu trenera (web/trener.html): web/ serwowane lokalnie, API i logowanie Google podmienione atrapami.
// Dane wyłącznie syntetyczne.
const test = require('node:test'), assert = require('node:assert');
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const WEB = path.join(__dirname, '..', 'web');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const SCREENS = path.join(__dirname, 'screens');
const FILM = fs.readFileSync(path.join(__dirname, 'fixtures', 'film.webm'));   // syntetyczny film 2 s (ffmpeg testsrc2)
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
    { id: 'ania', name: 'Ania', at: addDays(TODAY, -5), week: 11, day: 'T2', order: 2, ex: 'Wyciskanie na ławce', set: 2, kg: 45, reps: 6, rpe: 9, ocena: '', typ: 'FAIL', note: '', file: 'film3', link: 'https://drive.google.com/file/d/film3/view', kom: '0:04 łokcie za szeroko', komD: '0:04 łokcie za szeroko', komT: '' },
    { id: 'bartek', name: 'Bartek', at: addDays(TODAY, -6), week: 4, day: 'T1', order: 1, ex: 'Rwanie', set: 2, kg: 60, reps: 1, rpe: '', ocena: 'S', typ: '', note: '', file: 'film4', link: 'https://drive.google.com/file/d/film4/view', kom: 'Dobra pozycja startowa', komD: '', komT: 'Dobra pozycja startowa',
      rep: 'Dzięki, w końcu poczułem start z podłogi', repAt: addDays(TODAY, -1) }
  ],
  replies: [   // odpowiedzi klientów na komentarze trenera (trPulpit_), najnowsze pierwsze
    { kind: 'S', id: 'ania', name: 'Ania', at: TODAY, week: 10, day: 'T1', order: '', set: '', title: 'Trening T1', film: false, file: '', kom: 'Bardzo równe serie, tak trzymaj.', text: 'Dzięki! Kolano dziś <b>1/10</b>.' },
    { kind: 'L', id: 'bartek', name: 'Bartek', at: addDays(TODAY, -1), week: 4, day: 'T1', order: 1, set: '2', title: 'Rwanie · seria 2', film: true, file: 'film4', kom: 'Dobra pozycja startowa', text: 'Dzięki, w końcu poczułem start z podłogi' }
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
      sessions.push({ id: 'ania|' + wk + '|' + day, tydzien: wk, jednostka: day, data: date, start: date + 'T16:00:00.000Z', czas_min: 55 + (wk % 3) * 5, samopoczucie: 4, rpe_sesji: date === TODAY ? 8 : 7, bol: date === TODAY ? 'kolano:5' : '', bol_max: date === TODAY ? 5 : 0, uwagi: date === TODAY ? 'Kolano po przysiadach trochę ćmi' : '', komentarz_trenera: wk === 10 && day === 'T1' ? 'Bardzo równe serie, tak trzymaj.' : '',
        odpowiedz_klienta: wk === 10 && day === 'T1' ? 'Dzięki! Kolano dziś <b>1/10</b>.' : '', odpowiedz_at: wk === 10 && day === 'T1' ? TODAY + 'T07:30:00.000Z' : '' });
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

const KL1 = { scale: 'RPE', pain: false, masters: false, extra: 0, oly: 5, own: true, edit: false, email: '', mail: false };
const KLIENCI = [   // panel → Klienci (trKlienci): ustawienia z zakładki Klienci, dane syntetyczne
  Object.assign({}, KL1, { id: 'ania', name: 'Ania', on: true, mode: 'PRO', swap: 'DOWOLNA', pain: true, edit: true, extra: 2, link: 'https://example.com/trening/?k=kaaaaaaaaaa1' }),
  Object.assign({}, KL1, { id: 'bartek', name: 'Bartek', on: true, mode: 'PROSTY', swap: 'TRENER', extra: 1, link: 'https://example.com/trening/?k=kbbbbbbbbbb2' }),
  Object.assign({}, KL1, { id: 'ewa', name: 'Ewa', on: false, mode: 'PRO', swap: 'NIE', link: 'https://example.com/trening/?k=keeeeeeeeee3' })
];
const BLOK_SZKIC = {   // syntetyczny szkic AI zamknięcia bloku
  wnioski: 'Wykonanie 100% (11 z 11), ale sRPE rosło z 700 do 790, a w tyg. 12 dyspozycja „Uwaga” i kolano 5/10. Przysiad e1RM 74 → 80 kg (+8%), wyciskanie stoi na 46 kg od tyg. 9. Kolano pojawia się tylko po T1 z przysiadem powyżej 85%. Następny blok: przysiad 3×5 od 62,5 kg z pauzą, wyciskanie 5×3 na 42,5 kg z dokładaniem 1,25 kg tygodniowo, deload w tyg. 4.',
  dla_klienta: 'Zrobione wszystkie 11 treningów z bloku, a przysiad urósł o 6 kg szacowanego maksimum. Wyciskanie od trzech tygodni stoi, więc w następnym bloku zmieniamy mu schemat. Kolano dało znać przy najcięższych przysiadach: zaczynamy lżej, z pauzą na dole, i wracamy do ciężaru po 3 tygodniach.' };
const BLOK_KROCEJ = { wnioski: 'Przysiad +8%, wyciskanie stoi od tyg. 9, kolano 5/10 po ciężkich T1. Następny blok: przysiad z pauzą od 62,5 kg, wyciskanie 5×3 na 42,5 kg.', dla_klienta: 'Komplet 11 treningów i przysiad +6 kg. Teraz ruszamy wyciskanie i oszczędzamy kolano.' };

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

// klient nagrał / wpisał serie dzisiejszej sesji, ale żadnej nie odhaczył (wykonane puste, jak po samym filmie)
const untick = d => { d.logs.forEach(l => { if (l.data === TODAY) { l.wykonane = ''; if (l.film_link) { l.kg = ''; l.powt = ''; l.rpe = ''; } } }); return d; };
// syntetyczny fragment „moov” MP4: tabela stsd z jednym wpisem wideo (fourcc, szerokość, wysokość), opcjonalnie hvcC (profil) i colr nclx (krzywa)
const mp4Stsd = (cc, w, h, prof, tr) => {
  const e = Buffer.alloc(120); e.write('stsd', 0); e.writeUInt32BE(1, 8); e.writeUInt32BE(110, 12); e.write(cc, 16); e.writeUInt16BE(w, 44); e.writeUInt16BE(h, 46);
  if (prof) { e.write('hvcC', 90); e[94] = 1; e[95] = prof; }
  if (tr) { e.write('colrnclx', 100); e.writeUInt16BE(9, 108); e.writeUInt16BE(tr, 110); e.writeUInt16BE(9, 112); }
  return Buffer.concat([Buffer.from('....ftypisomavc1mp41....mdat'), Buffer.alloc(64), e]);   // „avc1” w ftyp nie może zmylić
};
async function page(calls, opt = {}) {
  const ctx = await browser.newContext({ viewport: opt.vp || { width: 1440, height: 900 }, colorScheme: opt.scheme || 'light', reducedMotion: 'reduce', ...(opt.ua ? { userAgent: opt.ua } : {}) });
  const st = { authFail: 0 };
  await ctx.route('**/macros/**', async r => {
    const b = JSON.parse(r.request().postData() || '{}'); calls.push(b);
    let out;
    if (b.fn === 'trConfig') out = { ok: true, result: { clientId: 'test.apps.googleusercontent.com', ready: opt.ready !== false } };
    else if (!b.token) out = { ok: false, error: 'Logowanie: brak biletu' };
    else if (st.authFail > 0) { st.authFail--; out = { ok: false, error: 'Logowanie: bilet wygasł' }; }
    else if (b.fn === 'trPulpit' || b.fn === 'trPrzelicz') out = { ok: true, result: Object.assign({}, PULPIT, b.fn === 'trPrzelicz' ? { at: TODAY + 'T09:30:00.000Z' } : {}) };
    else if (b.fn === 'trKlient') out = b.args[0] === 'ania' ? { ok: true, result: opt.noSets ? Object.assign(klient(), { logs: [] }) : opt.unticked ? untick(klient()) : klient() } : { ok: false, error: 'Nie ma klienta: ' + b.args[0] };
    else if (b.fn === 'trKomentarz') out = { ok: true, result: { text: String(b.args[3]).trim(), at: TODAY + 'T19:52:00.000Z' } };
    else if (b.fn === 'trSzkic') { st.ai = (st.ai || 0) + 1; await new Promise(res => setTimeout(res, 150));
      out = opt.ai === false ? { ok: false, error: 'Szkic AI nie jest jeszcze włączony: wklej klucz Claude API w panelu → Ustawienia (klucz z console.anthropic.com).' }
        : { ok: true, result: { text: (b.args[3] && b.args[3].tweak === 'krocej' ? 'Krótko: ' : '') + SZKIC, cost: 0.024, n: st.ai, limit: 30, model: 'claude-opus-5-5' } }; }
    else if (b.fn === 'trBlokSzkic') { st.ai = (st.ai || 0) + 1; await new Promise(res => setTimeout(res, 150));
      out = { ok: true, result: Object.assign({}, b.args[2] && b.args[2].tweak === 'krocej' ? BLOK_KROCEJ : BLOK_SZKIC, { cost: 0.031, n: st.ai, limit: 30, model: 'claude-opus-5-5' }) }; }
    else if (b.fn === 'trBlok') { await new Promise(res => setTimeout(res, 100)); out = { ok: true, result: { wnioski: String(b.args[2]).trim(), dla_klienta: String(b.args[3]).trim() } }; }
    else if (b.fn === 'trAI') out = { ok: true, result: st.key ? { set: true, end: '…' + st.key.slice(-4), limit: 30, n: 2, model: 'claude-opus-5-5' } : { set: false, end: '', limit: 30, n: 0, model: 'claude-opus-5-5' } };
    else if (b.fn === 'trUstawAI') { await new Promise(res => setTimeout(res, 150)); const k = String(b.args[0] || '').trim();
      if (k && !/^sk-ant-/.test(k)) out = { ok: false, error: 'To nie wygląda na klucz Claude API (zaczyna się od sk-ant-). Nic nie zmieniono.' };
      else { st.key = k; out = { ok: true, result: Object.assign(k ? { set: true, end: '…' + k.slice(-4), limit: 30, n: 0 } : { set: false, end: '', limit: 30, n: 0 }, { checked: true }) }; } }
    else if (b.fn === 'trFilm') { st.nFilm = (st.nFilm || 0) + 1; if (st.nFilm > 1) st.fresh = true; out = { ok: true, result: { token: 'tok-film', exp: Date.now() + 3e6 } }; }
    else if (b.fn === 'trKomentarzFilm') { await new Promise(res => setTimeout(res, 100)); out = { ok: true, result: { text: String(b.args[5]).trim(), at: TODAY + 'T20:00:00.000Z' } }; }
    else if (b.fn === 'trKlienci') { st.kl = st.kl || KLIENCI.map(k => Object.assign({}, k)); out = { ok: true, result: st.kl }; }
    else if (b.fn === 'trKlientUstaw') { await new Promise(res => setTimeout(res, 100)); const f = b.args[1], i = st.kl.findIndex(k => k.id === b.args[0]);
      if (f.extra > 5) out = { ok: false, error: 'Dodatkowe serie: liczba 0–5.' };
      else { st.kl[i] = Object.assign({}, st.kl[i], f, { link: st.kl[i].link }); out = { ok: true, result: st.kl[i] }; } }
    else if (b.fn === 'trKlientNowy') { await new Promise(res => setTimeout(res, 100)); const f = b.args[0];
      if (st.kl.some(k => k.id === f.id)) out = { ok: false, error: 'Klient „' + f.id + '” już istnieje — wybierz inne ID (np. ' + f.id + '-2).' };
      else { const k = { id: f.id, name: f.imie, on: true, mode: f.mode, scale: 'RPE', swap: f.swap, pain: false, masters: f.masters, extra: 0, oly: 5, own: true, edit: false, link: 'https://example.com/trening/?k=knowy0000001' }; out = { ok: true, result: k }; } }
    else if (b.fn === 'trKlientLink') { const i = st.kl.findIndex(k => k.id === b.args[0]); st.kl[i] = Object.assign({}, st.kl[i], { link: 'https://example.com/trening/?k=knowylink001' }); out = { ok: true, result: st.kl[i] }; }
    else if (b.fn === 'trMail') out = { ok: true, result: { hour: st.hour || 6, hours: [5, 6, 7, 8, 9], trigger: true, quota: 97,
      day: { day: TODAY, at: TODAY + 'T05:02:00.000Z', names: ['Ania', 'Bartek'] }, log: { ania: { at: TODAY + 'T05:02:00.000Z', day: TODAY, title: 'Siła B' } } } };
    else if (b.fn === 'trMailUstaw') { await new Promise(res => setTimeout(res, 100)); st.hour = b.args[0];
      out = { ok: true, result: { hour: st.hour, hours: [5, 6, 7, 8, 9], trigger: true, quota: 97, day: null, log: {} } }; }
    else if (b.fn === 'trMailProba') { await new Promise(res => setTimeout(res, 100)); out = { ok: true, result: { day: addDays(TODAY, 2), title: 'Trening A' } }; }
    else out = { ok: false, error: 'Nieznana funkcja: ' + b.fn };
    await r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify(out) });
  });
  await ctx.route('https://accounts.google.com/**', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/javascript' }, body: GSI }));
  await ctx.route('https://www.googleapis.com/drive/v3/files/**', r => {               // Dysk: rozmiar i film, bilet w nagłówku, kawałki (Range)
    const u = new URL(r.request().url()), id = decodeURIComponent(u.pathname.split('/').pop()), h = r.request().headers();
    const tok = h.authorization ? h.authorization.replace(/^Bearer /, '') : '';      // jak prawdziwy Dysk: bilet tylko w nagłówku, nie w adresie
    st.drive = (st.drive || []).concat([{ id, tok, alt: u.searchParams.get('alt'), range: h.range || '' }]);
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (tok !== 'tok-film' || (opt.mediaExpired && u.searchParams.get('alt') === 'media' && !st.fresh)) return r.fulfill({ status: 401, headers: cors, body: '' });
    if (opt.film404) return r.fulfill({ status: 404, headers: cors, body: '' });
    if (opt.sniff && /^bytes=0-\d+$/.test(h.range || '')) return r.fulfill({ status: 206, headers: { ...cors, 'Content-Type': 'video/mp4' }, body: opt.sniff });   // początek pliku do odczytu formatu
    if (u.searchParams.get('alt') !== 'media') return r.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ size: String(opt.filmSize || FILM.length), mimeType: 'video/webm' }) });
    const m = /bytes=(\d+)-(\d*)/.exec(h.range || '');
    if (!m) return r.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': String(FILM.length) }, body: FILM });
    const a = Number(m[1]), b = m[2] ? Math.min(Number(m[2]), FILM.length - 1) : FILM.length - 1;
    return r.fulfill({ status: 206, headers: { ...cors, 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': 'bytes ' + a + '-' + b + '/' + FILM.length, 'Content-Length': String(b - a + 1) }, body: FILM.subarray(a, b + 1) });
  });
  await ctx.route('https://drive.google.com/**', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body: '<body style="margin:0;background:#222;color:#bbb;font:14px sans-serif;display:grid;place-items:center;height:100vh">podgląd filmu (atrapa)</body>' }));
  const exp = Math.floor(Date.now() / 1000) + 3600;
  if (opt.noPic) await ctx.addInitScript(() => { for (const k of ['videoWidth', 'videoHeight']) Object.defineProperty(HTMLVideoElement.prototype, k, { get: () => 0 }); });
  await ctx.addInitScript(([j, tok]) => { window.__jwt = j; if (tok) try { localStorage.setItem('tr_tok', j); } catch (e) {} }, [JWT(exp), !!opt.loggedIn]);
  const p = await ctx.newPage(); p.errors = []; p.on('pageerror', e => p.errors.push(e.message));
  // blokada obcych skryptów (CSP w trener.html): każde jej naruszenie to błąd testu, żeby nowy adres zewnętrzny nie przepadł po cichu
  p.on('console', m => { if (/Content Security Policy/i.test(m.text())) p.errors.push(m.text()); });
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
  assert.match(txt, /Blok B2[\s\S]*Wnioski \(tylko Ty\)[\s\S]*Szkic AI[\s\S]*Blok B1[\s\S]*Dobra adaptacja/);
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
  const { ctx, p } = await page(calls, { loggedIn: true, filmSize: 87 * 1048576 });
  await p.goto(base + 'trener.html#filmy'); await p.waitForSelector('.vi');
  assert.equal(await p.$$eval('.vi', a => a.length), 2);
  await p.waitForSelector('.pv[data-file="film1"] video');
  assert.match(await p.getAttribute('.pv video', 'src'), /^(blob:|film-strumien\/film1\?t=tok-film$)/);   // film z Dysku, nie okienko Dysku
  await p.waitForFunction(() => document.querySelector('#pvv').duration > 1);
  assert.match(await p.textContent('#main'), /plik 87 MB/);                          // rozmiar pliku z Dysku
  assert.match(await p.textContent('#main'), /Komentarz klienta\s*Ostatnie powtórzenie wolne/);
  await p.click('.vi:nth-child(2)');
  await p.waitForSelector('.pv[data-file="film2"] video');
  const meta = p.st.drive.filter(d => d.alt !== 'media'), media = p.st.drive.filter(d => d.alt === 'media');
  assert.deepEqual(meta.map(d => [d.id, d.tok]), [['film1', 'tok-film'], ['film2', 'tok-film']]);   // przed filmem tylko pytanie o rozmiar
  assert.ok(media.some(d => d.id === 'film1') && media.every(d => d.tok === 'tok-film'));
  assert.equal(calls.filter(c => c.fn === 'trFilm').length, 1);                     // bilet pobrany raz na kilka filmów
  await p.click('[data-vall="1"]');
  assert.equal(await p.$$eval('.vi', a => a.length), 4);
  await p.click('.vi:nth-child(3)');
  assert.match(await p.textContent('.kom'), /0:04 łokcie za szeroko/);                // komentarz z Dysku osobno, tylko do odczytu
  assert.match(await p.textContent('#main'), /Z komentarzy na Dysku/);
  assert.equal(await p.inputValue('#kf-txt'), '');
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
  assert.match(await p.textContent('details.ses[open] .kedit .err'), /panelu → Ustawienia/);
  assert.ok(await p.$('details.ses[open] .kedit .err a[href="#ustawienia"]'));     // link prosto do wklejenia klucza
  assert.equal(await p.inputValue('details.ses[open] .kedit textarea'), 'Mój tekst');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390));
  await p.$eval('details.ses[open] .kedit', e => e.scrollIntoView());
  await p.screenshot({ path: path.join(SCREENS, 'trener-szkic-ai-telefon-ciemny.png') });
  assert.deepEqual(p.errors, []);
  await ctx.close();
  // sesja bez zapisanych serii (klient tylko kliknął „Zakończ”): bez przycisku AI, więc bez zapytania i opłaty; komentarz da się zapisać
  const c2 = [], s2 = await page(c2, { loggedIn: true, noSets: true });
  await s2.p.goto(base + 'trener.html#k/ania/sesje'); await s2.p.waitForSelector('details.ses[open] .kedit textarea');
  assert.equal(await s2.p.$('details.ses[open] .kedit button.ai'), null);
  assert.match(await s2.p.textContent('details.ses[open] .kedit .hint'), /Brak zapisanych serii, więc bez szkicu AI/);
  assert.ok(await s2.p.$('details.ses[open] .kedit button[data-k="save"]'));
  assert.equal(c2.filter(c => c.fn === 'trSzkic').length, 0);
  assert.deepEqual(s2.p.errors, []);
  await s2.ctx.close();
  // serie nagrane albo wpisane bez ✓ (np. boje z filmem): widać je na szaro z objaśnieniem, a szkic AI jest dostępny
  const s3 = await page([], { loggedIn: true, unticked: true });
  await s3.p.goto(base + 'trener.html#k/ania/sesje'); await s3.p.waitForSelector('details.ses[open] .kedit textarea');
  assert.ok(await s3.p.$('details.ses[open] .kedit button.ai'));
  assert.ok((await s3.p.$$('details.ses[open] .sets .nd')).length >= 3);
  assert.match(await s3.p.textContent('details.ses[open]'), /s\. 1 ▶[\s\S]*klient nagrał albo wpisał serię, ale jej nie odhaczył/);
  await s3.p.goto(base + 'trener.html#k/ania/przeglad'); await s3.p.waitForSelector('.sets');
  assert.deepEqual(s3.p.errors, []);
  await s3.ctx.close();
});

test('panel: Ustawienia, klucz Claude API wklejany w panelu (też na telefonie), bez pokazywania całego klucza', async () => {
  for (const [scheme, vp] of [['light', null], ['dark', { width: 390, height: 844 }]]) {
    const calls = [];
    const { ctx, p } = await page(calls, { loggedIn: true, scheme, vp });
    await p.goto(base + 'trener.html#ustawienia'); await p.waitForSelector('#aikey-card');
    assert.match(await p.textContent('#aikey-card .kstat'), /Brak klucza/);
    assert.equal(await p.$('#aikey-del'), null);
    assert.equal(await p.getAttribute('#aikey', 'type'), 'password');             // klucz nie widać na ekranie
    await p.fill('#aikey', 'sk-proj-zly-klucz');                                    // klucz innej firmy: komunikat, nic nie zapisane
    await p.click('#aikey-save'); await p.waitForSelector('#aikey-card .err');
    assert.match(await p.textContent('#aikey-card .err'), /sk-ant-/);
    const key = 'sk-ant-api03-' + 'q'.repeat(40) + 'AbCd';
    await p.fill('#aikey', '  ' + key + ' ');
    await p.click('#aikey-save'); await p.waitForSelector('#aikey-card .saved');
    assert.equal(calls.filter(c => c.fn === 'trUstawAI').pop().args[0], key);     // bez spacji z wklejania
    assert.match(await p.textContent('#aikey-card .saved'), /Klucz działa/);
    assert.match(await p.textContent('#aikey-card .kstat'), /Klucz ustawiony …AbCd/);
    assert.ok(!(await p.content()).includes(key), 'cały klucz nie zostaje na stronie');
    if (vp) { assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390)); await shot(p, 'trener-ustawienia-telefon-ciemny.png'); }
    else await shot(p, 'trener-ustawienia-jasny.png');
    await p.click('#aikey-del'); assert.match(await p.textContent('#aikey-del'), /Na pewno/);   // usunięcie: drugie dotknięcie
    await p.click('#aikey-del'); await p.waitForSelector('#aikey-card .saved');
    assert.match(await p.textContent('#aikey-card .kstat'), /Brak klucza/);
    assert.equal(calls.filter(c => c.fn === 'trUstawAI').pop().args[0], '');
    assert.deepEqual(p.errors, []);
    await ctx.close();
  }
});

test('panel: zamknięcie bloku (wnioski i notatka dla klienta, szkic AI obu naraz, zapis)', async () => {
  for (const [vp, scheme, nm] of [[{ width: 390, height: 844 }, 'dark', 'telefon-ciemny'], [null, 'light', 'jasny']]) {
    const calls = [], { ctx, p } = await page(calls, Object.assign({ loggedIn: true, scheme }, vp ? { vp } : {}));
    await p.goto(base + 'trener.html#bloki'); await p.waitForSelector('#main table');
    assert.equal(await p.getAttribute('text=Zamknij blok ›', 'href'), '#k/bartek/bloki');     // z listy prosto do karty klienta
    if (!vp) await shot(p, 'trener-bloki-lista-jasny.png');
    await p.goto(base + 'trener.html#k/ania/bloki'); await p.waitForSelector('.bedit[data-b="B2"] textarea');
    assert.match(await p.textContent('.bedit[data-b="B1"]'), /Dobra adaptacja/);                // zapisane wnioski: tekst i „Edytuj”
    assert.ok(await p.$('.bedit[data-b="B1"] [data-k="edit"]'));
    await p.click('.bedit[data-b="B2"] [data-k="ai"]'); await p.waitForSelector('.bedit[data-b="B2"] .aiflag');
    assert.deepEqual(calls.filter(c => c.fn === 'trBlokSzkic').map(c => c.args.slice(0, 2)), [['ania', 'B2']]);   // jedno zapytanie na oba pola
    assert.match(await p.inputValue('.bedit[data-b="B2"] [data-k="w"]'), /Następny blok: przysiad 3×5 od 62,5 kg/);
    assert.match(await p.inputValue('.bedit[data-b="B2"] [data-k="k"]'), /Zrobione wszystkie 11 treningów/);
    assert.match(await p.textContent('.bedit[data-b="B2"]'), /koszt szkicu 0,031 \$ · dziś 1 z 30/);
    await p.click('.bedit[data-b="B2"] [data-t="krocej"]'); await p.waitForFunction(() => /^Przysiad \+8%/.test(document.querySelector('.bedit[data-b="B2"] [data-k="w"]').value));
    const tw = calls.filter(c => c.fn === 'trBlokSzkic').pop().args[2];
    assert.equal(tw.tweak, 'krocej'); assert.match(tw.draft.w, /Wykonanie 100%/); assert.match(tw.draft.k, /Zrobione wszystkie/);   // poprawka dostaje poprzedni szkic
    await p.fill('.bedit[data-b="B2"] [data-k="k"]', 'Komplet treningów. Teraz wyciskanie.');
    const card = p.locator('.card', { has: p.locator('.bedit[data-b="B2"]') });
    await card.screenshot({ path: path.join(SCREENS, 'trener-blok-szkic-' + nm + '.png') });
    await p.click('.bedit[data-b="B2"] [data-k="save"]'); await p.waitForSelector('.bedit[data-b="B2"] .saved');
    const sv = calls.filter(c => c.fn === 'trBlok').pop().args;
    assert.deepEqual(sv.slice(0, 2), ['ania', 'B2']); assert.match(sv[2], /^Przysiad \+8%/); assert.equal(sv[3], 'Komplet treningów. Teraz wyciskanie.');
    assert.match(await p.textContent('.bedit[data-b="B2"]'), /Postęp → Blok/);
    assert.deepEqual(p.errors, []);
    await ctx.close();
  }
});

test('panel: odtwarzacz filmu (klatka, prędkość, pętla, powiększenie, pełny ekran) i komentarz z chwilą filmu', async () => {
  // telefon, ciemny: przełącznik „Film n z m” zamiast listy
  const calls = [];
  const { ctx, p } = await page(calls, { loggedIn: true, scheme: 'dark', vp: { width: 390, height: 844 } });
  await p.goto(base + 'trener.html#filmy'); await p.waitForSelector('.pv video');
  await p.waitForFunction(() => document.querySelector('#pvv').duration > 1);
  assert.equal(await p.isVisible('.vlist'), false);
  assert.match(await p.textContent('.vsw'), /Film 1 z 2 · bez komentarza/);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390));
  // klatka po klatce: pauza i krok 1/30 s
  await p.click('[data-pv="fwd"]'); await p.click('[data-pv="fwd"]');
  assert.ok(Math.abs(await p.$eval('#pvv', v => v.currentTime) - 2 / 30) < 0.005);
  await p.click('[data-pv="back"]');
  assert.ok(Math.abs(await p.$eval('#pvv', v => v.currentTime) - 1 / 30) < 0.005);
  // prędkość i pętla
  await p.click('[data-spd="0.25"]');
  assert.equal(await p.$eval('#pvv', v => v.playbackRate), 0.25);
  assert.equal(await p.getAttribute('[data-spd="0.25"]', 'aria-pressed'), 'true');
  assert.equal(await p.$eval('#pvv', v => v.loop), true);
  await p.click('[data-pv="loop"]');
  assert.equal(await p.$eval('#pvv', v => v.loop), false);
  // suwak → „Wstaw chwilę” dopisuje sekundę na początku linii
  await p.$eval('#pvr', r => { r.value = '1.2'; r.dispatchEvent(new Event('input')); });
  await p.waitForFunction(() => /0:01,2/.test(document.querySelector('#pvt').textContent));
  assert.match(await p.textContent('#kf-ins'), /Wstaw chwilę 0:01/);
  await p.click('#kf-ins');
  await p.type('#kf-txt', 'Kolana na zewnątrz.');
  assert.equal(await p.inputValue('#kf-txt'), '0:01 Kolana na zewnątrz.');
  assert.equal(await p.$$eval('#pvm button', a => a.length), 1);                     // kreska na pasku w tej chwili
  await p.$eval('#pvr', r => { r.value = '0'; r.dispatchEvent(new Event('input')); });
  await p.click('#pvm button');
  assert.ok(Math.abs(await p.$eval('#pvv', v => v.currentTime) - 1) < 0.05);       // kreska przewija film
  await p.click('#kf-ins');                                                           // druga chwila w nowej linii
  assert.equal(await p.inputValue('#kf-txt'), '0:01 Kolana na zewnątrz.\n0:01 ');
  await p.fill('#kf-txt', '0:01 Kolana na zewnątrz.');
  await shot(p, 'trener-filmy-telefon-ciemny.png');
  await p.click('#kf-save'); await p.waitForSelector('#kfw .saved');
  const save = calls.find(c => c.fn === 'trKomentarzFilm');
  assert.deepEqual(save.args, ['ania', 12, 'T1', 1, 3, '0:01 Kolana na zewnątrz.']);   // klient, tydzień, jednostka, ćwiczenie, seria, tekst
  assert.match(await p.textContent('.vsw'), /Film 1 z 2/);                           // skomentowany zostaje na liście do końca wizyty
  // pełny ekran i powiększenie
  await p.click('.fsb');
  assert.ok(await p.$('.pv.fs'));
  const box = await p.$eval('.pv.fs', e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  assert.deepEqual(box, [390, 844]);
  await p.dispatchEvent('.pv .stage', 'wheel', { deltaY: -100 });
  await p.dispatchEvent('.pv .stage', 'wheel', { deltaY: -100 });
  await p.dispatchEvent('.pv .stage', 'wheel', { deltaY: -100 });
  await p.dispatchEvent('.pv .stage', 'wheel', { deltaY: -100 });
  assert.match(await p.textContent('.pv .zoom'), /^1,7× · dotknij dwa razy/);
  assert.match(await p.$eval('#pvv', v => v.style.transform), /scale\(1\.7/);
  await p.screenshot({ path: path.join(SCREENS, 'trener-filmy-pelny-ekran.png') });
  for (let i = 0; i < 2; i++) { await p.dispatchEvent('.pv .stage', 'pointerdown', { pointerId: 1, clientX: 200, clientY: 300, isPrimary: true }); await p.dispatchEvent('.pv .stage', 'pointerup', { pointerId: 1, clientX: 200, clientY: 300, isPrimary: true }); }
  assert.equal(await p.$eval('#pvv', v => v.style.transform), '');                  // dwa dotknięcia = 1×
  await p.keyboard.press('Escape');
  assert.equal(await p.$('.pv.fs'), null);
  // następny film
  await p.click('[data-vgo="1"]'); await p.waitForSelector('.pv[data-file="film2"] video');
  assert.match(await p.textContent('.vsw'), /Film 2 z 2/);
  assert.deepEqual(p.errors, []);
  await ctx.close();
  // komputer, jasny: lista, klawiatura; film, którego nie ma na Dysku = komunikat i link
  const c2 = [], s2 = await page(c2, { loggedIn: true });
  await s2.p.goto(base + 'trener.html#filmy'); await s2.p.waitForSelector('.pv video');
  await s2.p.waitForFunction(() => document.querySelector('#pvv').duration > 1);
  await s2.p.keyboard.press('ArrowRight'); await s2.p.keyboard.press('ArrowRight');
  assert.ok(Math.abs(await s2.p.$eval('#pvv', v => v.currentTime) - 2 / 30) < 0.005);
  await s2.p.keyboard.press('2');
  assert.equal(await s2.p.$eval('#pvv', v => v.playbackRate), 0.5);
  await s2.p.keyboard.press('f'); assert.ok(await s2.p.$('.pv.fs')); await s2.p.keyboard.press('f'); assert.equal(await s2.p.$('.pv.fs'), null);
  assert.equal(await s2.p.isVisible('.vsw'), false);
  await shot(s2.p, 'trener-filmy-odtwarzacz-jasny.png');
  // film ma proporcje pliku (rozmiar w pikselach z wymiarów filmu), a nie sceny
  assert.ok(await s2.p.evaluate(() => { const v = document.querySelector('#pvv'), r = v.getBoundingClientRect(); return v.videoWidth > 0 && Math.abs(r.width / r.height - v.videoWidth / v.videoHeight) < 0.02; }));
  assert.deepEqual(s2.p.errors, []);
  await s2.ctx.close();
  // drugie wejście (service worker już działa): film gra od razu z film-strumien/, sw.js dokłada nagłówek i przekazuje Range
  const c5 = [], s5 = await page(c5, { loggedIn: true });
  await s5.p.goto(base + 'trener.html#filmy'); await s5.p.evaluate(() => navigator.serviceWorker.ready);
  await s5.p.reload(); await s5.p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await s5.p.waitForSelector('.pv video');
  assert.match(await s5.p.getAttribute('.pv video', 'src'), /^film-strumien\/film1\?t=tok-film$/);
  await s5.p.waitForFunction(() => document.querySelector('#pvv').duration > 1);
  await s5.p.keyboard.press('ArrowRight'); await s5.p.keyboard.press('ArrowRight');
  await s5.p.waitForFunction(() => Math.abs(document.querySelector('#pvv').currentTime - 2 / 30) < 0.005);
  const sm = s5.p.st.drive.filter(d => d.alt === 'media');
  assert.ok(sm.length && sm.every(d => d.tok === 'tok-film') && sm.some(d => d.range));   // bilet w nagłówku i zapytania o kawałek
  // „Czarny obraz, a słychać dźwięk?”: format z pliku i wymiary obrazu w przeglądarce, porady
  await s5.p.click('#pvh summary'); await s5.p.waitForFunction(() => /Plik: VP8/.test(document.querySelector('#pvh-b').textContent));
  assert.match(await s5.p.textContent('#pvh-b'), /Plik: VP8\. Przeglądarka widzi obraz \d+×\d+[\s\S]*Rozszerz klipy wideo[\s\S]*przyspieszenie graficzne[\s\S]*Otwórz na Dysku/);
  assert.deepEqual(s5.p.errors, []);
  await s5.ctx.close();
  // bilet wygasł w trakcie oglądania: nowy bilet i film gra dalej, bez komunikatu
  const c4 = [], s4 = await page(c4, { loggedIn: true, mediaExpired: true });
  await s4.p.goto(base + 'trener.html#filmy'); await s4.p.waitForSelector('.pv video');
  await s4.p.waitForFunction(() => document.querySelector('#pvv') && document.querySelector('#pvv').duration > 1);
  assert.equal(c4.filter(c => c.fn === 'trFilm').length, 2);
  assert.equal(await s4.p.$('#pv-retry'), null);
  assert.deepEqual(s4.p.errors, []);
  await s4.ctx.close();
  // dźwięk bez obrazu (HEVC bez dekodera): komunikat z „Otwórz na Dysku”, bez „Spróbuj ponownie”
  const s6 = await page([], { loggedIn: true, noPic: true });
  await s6.p.goto(base + 'trener.html#filmy'); await s6.p.waitForSelector('.pv .pmsg a');
  assert.match(await s6.p.textContent('.pv .pmsg'), /Słychać dźwięk, ale ta przeglądarka nie pokaże obrazu tego filmu\.Format: VP8\.Przeglądarka nie dekoduje obrazu tego filmu\.Przyspieszenie sprzętowe: w Edge.*Na Dysku film zagra/);
  assert.equal(await s6.p.$('#pv-retry'), null);
  assert.doesNotMatch(await s6.p.textContent('.pv .pmsg'), /Sklepu Microsoft/);   // podpowiedź o rozszerzeniu tylko w Edge
  assert.equal(await s6.p.getAttribute('.pv .pmsg a', 'href'), 'https://drive.google.com/file/d/film1/view');
  assert.deepEqual(await s6.p.evaluate(() => [tFmt(9.96, true), tFmt(69.97, true), tFmt(70.04, true), tFmt(59.99)]), ['0:10,0', '1:10,0', '1:10,0', '0:59']);
  assert.deepEqual(s6.p.errors, []);
  await s6.ctx.close();
  // Edge na Windows bez dekodera HEVC: podpowiedź o rozszerzeniu ze Sklepu Microsoft
  const s7 = await page([], { loggedIn: true, noPic: true, sniff: mp4Stsd('hvc1', 3840, 2160, 2, 18), ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0' });
  await s7.p.addInitScript(() => { if (window.MediaSource) MediaSource.isTypeSupported = t => !/hvc1/.test(t); });
  await s7.p.goto(base + 'trener.html#filmy'); await s7.p.waitForSelector('.pv .pmsg a');
  await s7.p.screenshot({ path: path.join(SCREENS, 'trener-film-bez-obrazu.png') });
  assert.match(await s7.p.textContent('.pv .pmsg'), /Format: HEVC \(H\.265\), 3840×2160 \(4K\), 10 bitów, HDR \(HLG\)\.Ta przeglądarka nie obsługuje HEVC\. W Edge pomaga rozszerzenie „HEVC Video Extensions”.*Na Dysku film zagra.*wideo 1080p, bez „wydajnego wideo”/);
  assert.deepEqual(s7.p.errors, []);
  await s7.ctx.close();
  const s3 = await page([], { loggedIn: true, film404: true });
  await s3.p.goto(base + 'trener.html#filmy'); await s3.p.waitForSelector('#pv-retry');
  assert.match(await s3.p.textContent('.pv .pmsg'), /Filmu nie ma już na Dysku/);
  assert.equal(await s3.p.getAttribute('.pv .pmsg a', 'href'), 'https://drive.google.com/file/d/film1/view');
  assert.deepEqual(s3.p.errors, []);
  await s3.ctx.close();
});

test('panel: Klienci (lista, kopiowanie linku, ustawienia klienta, nowy link, nowy klient)', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, { loggedIn: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await p.goto(base + 'trener.html#klienci');
  await p.waitForSelector('table.kl');
  assert.equal(await p.getAttribute('#nav a[data-v="klienci"]', 'aria-current'), 'page');
  const txt = await p.textContent('#main');
  assert.match(txt, /2 aktywnych · 1 nieaktywny/);
  assert.match(txt, /Ania.*PRO · zamiana dowolna · zmiany w treningu · ból zawsze · \+2 serie/s);
  assert.match(txt, /Bartek.*Prosty · zamiana od trenera · \+1 seria/s);
  assert.match(txt, /Ewa.*nieaktywny/s);
  assert.equal(await p.$$eval('table.kl tbody tr', t => t.map(r => r.querySelector('.who').textContent.trim())).then(a => a.join()), 'Ania,Bartek,Ewa');   // aktywni najpierw
  assert.equal(await p.$('tr.off [data-copy]'), null, 'nieaktywny bez kopiowania linku');
  // kopiowanie linku do schowka
  await p.click('[data-copy="bartek"]');
  await p.waitForSelector('[data-copy="bartek"].done');
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), 'https://example.com/trening/?k=kbbbbbbbbbb2');
  await shot(p, 'trener-klienci-jasny.png');
  // ustawienia Bartka: zmiana trybu, zamiany, dodatkowych serii i sufitu, zapis
  await p.click('a.cp[href="#klienci/bartek"]');
  await p.waitForSelector('#kl-form');
  assert.equal(await p.isDisabled('#kl-save'), true, 'bez zmian nie ma czego zapisać');
  await p.click('[data-seg="mode"][data-val="PRO"]');
  await p.click('[data-seg="swap"][data-val="DOWOLNA"]');
  await p.click('[data-sw="masters"]');
  await p.click('[data-num="extra"][data-d="1"]');
  await p.click('[data-num="oly"][data-d="2.5"]');
  assert.match(await p.textContent('#kl-form'), /Zmienione: 5/);
  await p.click('[data-num="extra"][data-d="-1"]');
  assert.match(await p.textContent('#kl-form'), /Zmienione: 4/, 'powrót do starej wartości nie liczy się jako zmiana');
  await p.click('#kl-save');
  await p.waitForSelector('#kl-form .saved');
  const u = calls.filter(c => c.fn === 'trKlientUstaw').pop();
  assert.equal(u.args[0], 'bartek');
  assert.deepEqual([u.args[1].mode, u.args[1].swap, u.args[1].masters, u.args[1].extra, u.args[1].oly, u.args[1].on, u.args[1].own], ['PRO', 'DOWOLNA', true, 1, 7.5, true, true]);
  assert.ok(u.token && !u.key, 'zapis tylko z biletem trenera');
  assert.match(await p.textContent('#kl-form'), /Zapisano/);
  assert.equal(await p.isDisabled('#kl-save'), true);
  await shot(p, 'trener-klient-ustawienia-jasny.png');
  // nowy link: dopiero po drugim dotknięciu
  await p.click('#kl-rekey');
  assert.match(await p.textContent('#kl-rekey'), /Na pewno/);
  assert.equal(calls.filter(c => c.fn === 'trKlientLink').length, 0);
  await p.click('#kl-rekey');
  await p.waitForFunction(() => /knowylink001/.test(document.querySelector('#kl-link').textContent));
  assert.match(await p.textContent('#kl-form'), /Stary już nie działa/);
  // lista pokazuje nowe ustawienia
  await p.click('a[href="#klienci"]');
  await p.waitForSelector('table.kl');
  assert.match(await p.textContent('#main'), /Bartek.*PRO · zamiana dowolna · masters · \+1 seria · sufit 7,5%/s);
  // nowy klient: ID z imienia, błąd z serwera, potem sukces z linkiem
  await p.click('a[href="#klienci/nowy"]');
  await p.waitForSelector('#kl-new');
  await p.click('#kl-add');
  assert.match(await p.textContent('#kl-new .err'), /Podaj imię/);
  assert.equal(calls.filter(c => c.fn === 'trKlientNowy').length, 0);
  await p.fill('#kl-imie', 'Ania');
  assert.equal(await p.inputValue('#kl-id'), 'ania');
  await p.click('#kl-add');
  await p.waitForSelector('#kl-new .err');
  assert.match(await p.textContent('#kl-new .err'), /już istnieje/);
  await p.fill('#kl-imie', 'Żaneta Łoś');
  assert.equal(await p.inputValue('#kl-id'), 'zaneta-los');
  await p.click('[data-sw="masters"]');
  await p.click('#kl-add');
  await p.waitForSelector('.okbox');
  const n = calls.filter(c => c.fn === 'trKlientNowy').pop().args[0];
  assert.deepEqual(n, { imie: 'Żaneta Łoś', id: 'zaneta-los', mode: 'PROSTY', swap: 'TRENER', masters: true });
  assert.match(await p.textContent('#main'), /Dodano: Żaneta Łoś.*"zaneta-los".*knowy0000001/s);
  await p.click('[data-copy="zaneta-los"]');
  await p.waitForSelector('[data-copy="zaneta-los"].done');
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), 'https://example.com/trening/?k=knowy0000001');
  await p.click('a[href="#klienci"]');
  await p.waitForSelector('table.kl');
  assert.match(await p.textContent('#main'), /3 aktywnych · 1 nieaktywny/);
  // karta klienta prowadzi do ustawień
  await p.goto(base + 'trener.html#k/ania');
  await p.waitForSelector('a.b[href="#klienci/ania"]');
  assert.deepEqual(p.errors, []);
  await ctx.close();
  // telefon, ciemny motyw
  for (const [scheme, nm] of [['dark', 'ciemny'], ['light', 'jasny']]) {
    const s2 = await page([], { loggedIn: true, vp: { width: 390, height: 844 }, scheme });
    await s2.p.goto(base + 'trener.html#klienci/bartek');
    await s2.p.waitForSelector('#kl-form');
    assert.equal(await s2.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'bez przewijania w bok');
    await shot(s2.p, 'trener-klient-ustawienia-telefon-' + nm + '.png');
    await s2.p.goto(base + 'trener.html#klienci');
    await s2.p.waitForSelector('table.kl');
    assert.equal(await s2.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'lista bez przewijania w bok');
    await shot(s2.p, 'trener-klienci-telefon-' + nm + '.png');
    assert.deepEqual(s2.p.errors, []);
    await s2.ctx.close();
  }
});

test('panel: poranny mail (e-mail i przełącznik klienta, mail próbny, godzina w Ustawieniach)', async () => {
  for (const [scheme, vp] of [['light', null], ['dark', { width: 390, height: 844 }]]) {
    const calls = [];
    const { ctx, p } = await page(calls, { loggedIn: true, scheme, vp });
    await p.goto(base + 'trener.html#klienci/bartek'); await p.waitForSelector('#kl-email');
    assert.equal(await p.isDisabled('#kl-mailtest'), true, 'bez adresu nie ma mail próbnego');
    // włączenie bez adresu: błąd z serwera (atrapa przepuszcza), więc najpierw adres
    await p.fill('#kl-email', ' bartek@example.com ');
    assert.equal(await p.isDisabled('#kl-save'), false, 'wpisany adres = jest co zapisać');
    await p.click('[data-sw="mail"]');
    assert.equal(await p.inputValue('#kl-email'), 'bartek@example.com', 'adres zostaje po przerysowaniu');
    assert.equal(await p.isDisabled('#kl-mailtest'), true, 'przed zapisem bez próby');
    assert.match(await p.textContent('#kl-form'), /Zapisz zmiany, potem wyślij próbę/);
    await p.click('#kl-save'); await p.waitForSelector('#kl-form .saved');
    const sent = calls.filter(c => c.fn === 'trKlientUstaw').pop().args[1];
    assert.equal(sent.email, 'bartek@example.com'); assert.equal(sent.mail, true);
    await p.click('#kl-mailtest'); await p.waitForSelector('#kl-form .mrow .saved');
    assert.deepEqual(calls.filter(c => c.fn === 'trMailProba').pop().args, ['bartek']);
    assert.match(await p.textContent('#kl-form .mrow'), /Wysłano do Ciebie: Trening A/);
    if (vp) { assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390)); await shot(p, 'trener-mail-klient-telefon-ciemny.png'); }
    else await shot(p, 'trener-mail-klient-jasny.png');
    // lista: „mail rano” w skrócie ustawień
    await p.goto(base + 'trener.html#klienci'); await p.waitForSelector('table.kl');
    assert.match(await p.textContent('table.kl'), /Bartek.*mail rano/s);
    // Ustawienia: godzina i wynik dzisiejszej wysyłki
    await p.goto(base + 'trener.html#ustawienia'); await p.waitForSelector('#mail-card');
    assert.match(await p.textContent('#mail-card'), /wysłano 2 maile \(Ania, Bartek\)/);
    assert.equal(await p.getAttribute('[data-hour="6"]', 'aria-pressed'), 'true');
    await p.click('[data-hour="7"]'); await p.waitForSelector('#mail-card .saved');
    assert.deepEqual(calls.filter(c => c.fn === 'trMailUstaw').pop().args, [7]);
    assert.equal(await p.getAttribute('[data-hour="7"]', 'aria-pressed'), 'true');
    assert.match(await p.textContent('#mail-card'), /ok\. 7:00/);
    if (!vp) await shot(p, 'trener-mail-ustawienia-jasny.png');
    assert.deepEqual(p.errors, []);
    await ctx.close();
  }
});

test('panel: odpowiedzi klientów na komentarze (pulpit, sesja, film)', async () => {
  const calls = [];
  const { ctx, p } = await page(calls, { loggedIn: true });
  await p.goto(base + 'trener.html'); await p.waitForSelector('.reps .it');
  // karta na pulpicie: kto, czego dotyczy, Twój komentarz, odpowiedź (tekst, nie HTML) i przejście
  assert.deepEqual(await p.$$eval('.reps .it', a => a.map(x => [x.querySelector('.h b').textContent, x.querySelector('.q').textContent, x.querySelector('.a').textContent, x.querySelector('.sb').textContent])),
    [['Ania', 'Bardzo równe serie, tak trzymaj.', 'Dzięki! Kolano dziś <b>1/10</b>.', 'Sesja ›'], ['Bartek', 'Dobra pozycja startowa', 'Dzięki, w końcu poczułem start z podłogi', 'Film ›']]);
  assert.equal(await p.getAttribute('.reps .it:nth-of-type(1) .sb', 'href'), '#k/ania/sesje');
  await shot(p, 'trener-odpowiedzi-pulpit.png');
  // „Film ›”: skomentowany film, więc lista „Wszystkie” i od razu ten film z odpowiedzią pod komentarzem
  await p.click('.reps .it:nth-of-type(2) .sb');
  await p.waitForSelector('.pv[data-file="film4"]');
  assert.equal(await p.getAttribute('[data-vall="1"]', 'aria-pressed'), 'true');
  assert.match(await p.textContent('#kfw .rep'), /Bartek odpowiada · pn 16\.11\s*Dzięki, w końcu poczułem start z podłogi/);
  // sesja: odpowiedź pod komentarzem trenera i znak w nagłówku sesji
  await p.goto(base + 'trener.html#k/ania/sesje'); await p.waitForSelector('details.ses');
  const box = 'details.ses:has-text("tydz. 10 · T1")';
  assert.match(await p.textContent(box + ' summary'), /↩ odpowiedź klienta/);
  assert.match(await p.textContent(box + ' .kedit .rep'), /Ania odpowiada · wt 17\.11\s*Dzięki! Kolano dziś <b>1\/10<\/b>\./);
  assert.equal(await p.$(box + ' .rep b'), null);                                     // tekst klienta nie jest HTML-em
  assert.deepEqual(p.errors, []);
  await ctx.close();
});

test('panel: blokada obcych skryptów (CSP) zatrzymuje wstrzyknięty kod', async () => {
  const { ctx, p } = await page([], { loggedIn: true });
  await p.goto(base + 'trener.html'); await p.waitForSelector('tr.row[data-k="ania"]');
  // tak wyglądałby atak przez tekst klienta, gdyby gdzieś zabrakło esc(): obrazek z kodem w onerror i wstawiony <script>
  await p.evaluate(() => {
    const d = document.createElement('div'); d.innerHTML = '<img src="nie-ma.png" onerror="window.__xss = 1">'; document.body.append(d);
    const s = document.createElement('script'); s.textContent = 'window.__xss2 = 1'; document.body.append(s);
  });
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => [window.__xss, window.__xss2].join()), ',');
  assert.ok(p.errors.length >= 2 && p.errors.every(e => /Content Security Policy/i.test(e)), p.errors.join('\n'));   // przeglądarka zgłosiła obie blokady
  await ctx.close();
});
