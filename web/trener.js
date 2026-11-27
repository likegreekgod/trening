// Panel trenera (web/trener.html). Osobny plik, bo strona ma blokadę obcych skryptów (Content-Security-Policy bez 'unsafe-inline').
'use strict';
/* Panel trenera (docs/plan-panel.md). Dane tylko z serwera, nic o klientach nie zostaje w przeglądarce poza biletem logowania. */
const TL = window.TL, $ = s => document.querySelector(s);
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nf = v => { const x = Number(String(v === undefined || v === null ? '' : v).replace(',', '.').replace(/\s/g, '')); return v === '' || v === null || v === undefined || !isFinite(x) ? NaN : x; };
const pl = n => String(n).replace('.', ',');
const fmt1 = v => isFinite(v) ? pl(Math.round(v * 10) / 10) : '–';
const dm = d => d ? d.slice(8, 10) + '.' + d.slice(5, 7) : '';
const DOW = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];
const dowDm = d => d ? DOW[new Date(d + 'T12:00:00Z').getUTCDay()] + ' ' + dm(d) : '';
const TOKEN = 'tr_tok';
let PUL = null, CUR = null, CID = '', VSEL = '', VALL = false;
const CK = {};                  // karty klientów pobrane w tej sesji (tylko w pamięci strony)

/* ---------- logowanie: bilet Google (ID token) w localStorage do końca ważności ---------- */
function tokenGet(){
  try { const t = localStorage.getItem(TOKEN) || ''; const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return p.exp * 1000 > Date.now() + 60e3 ? t : ''; } catch (e) { return ''; }
}
function tokenSet(t){ try { if (t) localStorage.setItem(TOKEN, t); else localStorage.removeItem(TOKEN); } catch (e) {} }
async function api(fn, ...args){
  const r = await fetch(window.API_URL, { method: 'POST', body: JSON.stringify({ fn, token: tokenGet(), args }) });
  const j = await r.json();
  if (!j.ok) { const e = new Error(j.error || 'Błąd serwera'); e.auth = /^Logowanie: /.test(j.error || ''); throw e; }
  return j.result;
}
let GCFG = null;
async function login(msg){
  $('#app').hidden = true; $('#login').hidden = false;
  if (msg) $('#login-msg').textContent = msg;
  try { GCFG = GCFG || await api('trConfig'); } catch (e) { $('#login-msg').textContent = 'Nie mogę połączyć się z serwerem: ' + e.message; return; }
  if (!GCFG.ready) { $('#login-msg').textContent = 'Panel nie jest jeszcze skonfigurowany: w arkuszu wybierz menu Trening → Ustaw panel trenera.'; return; }
  const go = () => {
    google.accounts.id.initialize({ client_id: GCFG.clientId, auto_select: true, callback: r => { tokenSet(r.credential); start(); } });
    google.accounts.id.renderButton($('#gbtn'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'pl' });
    google.accounts.id.prompt();
  };
  if (window.google && google.accounts) return go();
  const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = go;
  s.onerror = () => { $('#login-msg').textContent = 'Nie udało się wczytać logowania Google. Sprawdź połączenie.'; };
  document.head.appendChild(s);
}
async function guard(p){
  $('#busy').hidden = false;
  try { return await p; }
  catch (e) { if (e.auth) { tokenSet(''); login(e.message.replace(/^Logowanie: /, '')); } throw e; }
  finally { $('#busy').hidden = true; }
}

/* ---------- start i nawigacja (#dzis, #filmy, #bloki, #klienci[/nowy|/<id>], #k/<id>/<zakładka>) ---------- */
async function start(){
  if (!tokenGet()) return login();
  $('#login').hidden = true; $('#app').hidden = false;
  $('#main').innerHTML = '<div class="pg"><div class="es">Ładowanie…</div></div>';
  try { PUL = await guard(api('trPulpit')); } catch (e) { if (!e.auth) $('#main').innerHTML = errBox(e); return; }
  try { localStorage.setItem('tr_dev', '1'); } catch (e) {}   // to urządzenie trenera: aplikacja pokaże „Panel trenera” (zostaje po wylogowaniu)
  route();
}
function errBox(e){ return '<div class="pg"><div class="card es"><b>Nie udało się wczytać danych</b><span class="err">' + esc(e.message) + '</span><p><button class="b" data-retry>Spróbuj ponownie</button></p></div></div>'; }
function route(){
  if (!PUL) return;
  document.body.classList.remove('pvfs');
  let h = (location.hash || '#dzis').slice(1).split('/'), v = h[0];
  if (v === 'prowadz' && h[1]) { location.replace(liveHref(decodeURIComponent(h[1]))); return; }   // powrót z aplikacji po ponownym zalogowaniu
  if (v === 'pulpit' || !v) v = 'dzis';                          // stary adres pulpitu = ekran Dziś
  const kid = v === 'k' ? decodeURIComponent(h[1] || '') : '';
  const sec = v === 'k' ? 'klienci' : v;                         // karta klienta należy do „Klienci”
  document.querySelectorAll('#nav a').forEach(a => a.setAttribute('aria-current', a.dataset.v === sec ? 'page' : 'false'));
  $('#set').setAttribute('aria-current', v === 'ustawienia' ? 'page' : 'false');
  $('#prow').setAttribute('aria-current', v === 'prowadzone' ? 'page' : 'false');
  document.querySelectorAll('#bnav a').forEach(a => a.setAttribute('aria-current', a.dataset.v === (['wiecej', 'bloki', 'ustawienia', 'prowadzone', 'cwiczenia'].includes(v) ? 'wiecej' : sec) ? 'page' : 'false'));
  const nv = PUL.videos.filter(x => !x.kom).length || '';
  $('#n-filmy').textContent = nv; $('#n-filmy-m').textContent = nv;
  $('#n-bloki').textContent = PUL.blocks.length || '';
  railDraw(kid);
  const t = PUL.at ? new Date(PUL.at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '';
  $('#at').textContent = PUL.at ? 'dane z ' + (PUL.at.slice(0, 10) === PUL.today ? '' : dowDm(PUL.at.slice(0, 10)) + ', ') + t : 'jeszcze nie przeliczone';
  $('#at-m').textContent = PUL.at ? (PUL.at.slice(0, 10) === PUL.today ? t : dm(PUL.at.slice(0, 10))) : '–';
  $('#av').textContent = meInit();
  if (v === 'k') return renderKlient(kid, h[2] || 'przeglad');
  if (v === 'filmy') return renderFilmy(h[1] || '');
  if (v === 'bloki') return renderBloki();
  if (v === 'ustawienia') return renderUstawienia();
  if (v === 'klienci') return renderKlienci(decodeURIComponent(h[1] || ''));
  if (v === 'wiecej') return renderWiecej();
  if (v === 'prowadzone') return renderProwadzone(decodeURIComponent(h[1] || ''));
  if (v === 'cwiczenia') return renderCwiczenia();
  renderDzis();
}
/** lista klientów w menu po lewej (komputer): kropka = najpilniejszy sygnał, alfabetycznie */
function railDraw(kid){
  const cl = PUL.clients.slice().sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  $('#rail-lb').hidden = !cl.length;
  $('#rail-kl').innerHTML = cl.map(c => '<a href="#k/' + encodeURIComponent(c.id) + '" aria-current="' + (c.id === kid ? 'page' : 'false') + '"><span class="dot ' + lvOf(c) + '"></span>' + esc(c.name) + '</a>').join('');
}
/** inicjały zalogowanego trenera z biletu Google (imię i nazwisko, inaczej pierwsza litera adresu) */
function meInit(){
  try { const q = JSON.parse(decodeURIComponent(escape(atob(tokenGet().split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
    const n = String(q.name || '').trim().split(/\s+/).filter(Boolean);
    return (n.length ? n.slice(0, 2).map(x => x[0]).join('') : String(q.email || '?')[0]).toUpperCase(); } catch (e) { return '?'; }
}
window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
// Bez powiększania dwoma palcami (26.11): Safari na iPhonie ignoruje user-scalable=no, a gest zatrzymuje dopiero gesturestart / gesturechange (tylko iOS).
// Własne powiększanie (np. odtwarzacz w panelu) działa na zdarzeniach pointer, więc tego nie dotyczy.
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('click', e => {
  const r = e.target.closest('tr.row[data-k]'); if (r && !e.target.closest('a,button')) location.hash = '#k/' + encodeURIComponent(r.dataset.k);
  if (e.target.closest('[data-retry]')) start();
});
async function recalc(){ try { PUL = await guard(api('trPrzelicz')); Object.keys(CK).forEach(k => delete CK[k]); route(); } catch (e) { if (!e.auth) alertBox(e); } }
function logout(){ tokenSet(''); try { google.accounts.id.disableAutoSelect(); } catch (e) {} PUL = null; login('Wylogowano.'); }
$('#recalc').onclick = recalc; $('#recalc-m').onclick = recalc; $('#logout').onclick = logout;
function alertBox(e){ const d = document.createElement('div'); d.className = 'card err'; d.textContent = e.message; $('#main').prepend(d); setTimeout(() => d.remove(), 6000); }

/* ---------- małe wykresy SVG ---------- */
function spark(vals, w = 72, h = 26){
  const v = vals.map(x => x === null || x === undefined ? NaN : x), ok = v.filter(isFinite);
  if (ok.length < 2) return '<span class="muted">–</span>';
  const mx = Math.max(...ok), mn = Math.min(...ok), pts = [];
  v.forEach((x, i) => { if (isFinite(x)) pts.push((i * w / (v.length - 1)).toFixed(1) + ',' + (h - 3 - (x - mn) / (mx - mn || 1) * (h - 6)).toFixed(1)); });
  return '<svg class="spk" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="var(--primary)" stroke-width="2" points="' + pts.join(' ') + '"/></svg>';
}
function line(pts, label){
  if (pts.length < 2) return '<p class="muted">Za mało wyników na wykres.</p>';
  const w = 360, h = 140, vs = pts.map(p => p.v), mx = Math.max(...vs), mn = Math.min(...vs);
  const X = i => 16 + i * (w - 32) / (pts.length - 1), Y = v => h - 24 - (v - mn) / (mx - mn || 1) * (h - 56);
  const last = pts[pts.length - 1];
  return '<svg class="ch" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label) + '"><polyline fill="none" stroke="var(--primary)" stroke-width="2.5" points="' +
    pts.map((p, i) => X(i).toFixed(1) + ',' + Y(p.v).toFixed(1)).join(' ') + '"/>' +
    pts.map((p, i) => '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="' + (p.pr ? 4 : 2.5) + '" fill="' + (p.pr ? 'var(--accent)' : 'var(--primary)') + '"/>').join('') +
    '<text x="' + (w - 16) + '" y="' + Math.max(12, Y(last.v) - 10).toFixed(1) + '" text-anchor="end">' + esc(fmt1(last.v)) + ' kg</text>' +
    '<text x="16" y="' + (h - 4) + '">' + esc(dm(pts[0].date)) + '</text><text x="' + (w - 16) + '" y="' + (h - 4) + '" text-anchor="end">' + esc(dm(last.date)) + '</text></svg>';
}
function bars(rows, label){
  const w = 360, h = 140, mx = Math.max(1, ...rows.map(r => r.v)), bw = (w - 32) / rows.length;
  return '<svg class="ch" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label) + '">' + rows.map((r, i) => {
    const bh = r.v / mx * (h - 44); return '<rect x="' + (16 + i * bw + 3).toFixed(1) + '" y="' + (h - 20 - bh).toFixed(1) + '" width="' + (bw - 6).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="3" fill="' + (i === rows.length - 1 ? 'var(--accent)' : 'var(--h2)') + '"/>'; }).join('') +
    '<text x="16" y="' + (h - 4) + '">' + esc(dm(rows[0].week)) + '</text><text x="' + (w - 16) + '" y="' + (h - 4) + '" text-anchor="end">ten tydz.</text>' +
    '<text x="' + (w - 16) + '" y="14" text-anchor="end">' + esc(fmt1(rows[rows.length - 1].v / 1000)) + ' t</text></svg>';
}

/* ---------- pulpit ---------- */
const lvOf = c => c.red > 0 ? 'lv-bad' : c.urg > 0 ? 'lv-warn' : 'lv-ok';
const agoTxt = c => c.ago === null || c.ago === undefined || c.ago === '' ? 'brak' : c.ago === 0 ? 'dziś' : c.ago === 1 ? 'wczoraj' : c.ago + ' dni temu';
const stLv = s => /dużo/.test(s) ? 'lv-bad' : /uwaga|lekko/.test(s) ? 'lv-warn' : /OK/.test(s) ? 'lv-ok' : '';
function frac(s){ const m = /^(\d+)\/(\d+)$/.exec(String(s || '')); return m ? [+m[1], +m[2]] : [0, 0]; }
function head(eb, title, tools){ return '<div class="top"><div><div class="eb">' + eb + '</div><h1>' + esc(title) + '</h1></div><div class="tools">' + (tools || '') + '</div></div>'; }
/** aplikacja klienta w trybie trenera („Prowadź trening”): ?prowadz=<klient_id>, opcjonalnie &j=<tydzień>|<jednostka> */
const liveHref = (id, week, day) => './?prowadz=' + encodeURIComponent(id) + (week ? '&j=' + encodeURIComponent(week + '|' + day) : '');
const go = (href, t, cls) => '<a class="sb' + (cls ? ' ' + cls : '') + '" href="' + href + '">' + t + '</a>';
const kHref = (id, tab) => '#k/' + encodeURIComponent(id) + (tab ? '/' + tab : '');
const plN = (n, one, few, many) => n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;
const DOWL = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
/** „Wymaga uwagi” na ekranie Dziś: czerwone sygnały, filmy bez komentarza, bloki do zamknięcia, koniec planu (odpowiedzi klientów: osobna karta pod spodem) */
function todoItems(){
  const out = [];
  const dy = PUL.dysk; if (dy && dy.low) out.push({ o: 0, lv: 'lv-bad', t: 'Na Dysku zostało ' + gb(dy.free) + ' GB', d: 'pełny Dysk = filmy i kopie przestają się zapisywać', a: go('#ustawienia', 'Sprawdź') });
  PUL.clients.forEach(c => c.signals.filter(s => s.lv === 'bad').forEach(s => out.push({ o: 0, lv: 'lv-bad', t: c.name + ': ' + s.t, d: 'czerwony sygnał', a: go(kHref(c.id), 'Otwórz') })));
  const nv = {}; PUL.videos.filter(v => !v.kom).forEach(v => { (nv[v.id] = nv[v.id] || []).push(v); });
  PUL.clients.forEach(c => { const v = nv[c.id]; if (!v) return;
    const ex = [...new Set(v.map(x => x.ex))], od = v.map(x => x.at).sort()[0];
    out.push({ o: 1, lv: 'lv-warn', t: c.name + ': ' + v.length + ' ' + plN(v.length, 'film', 'filmy', 'filmów') + ' bez komentarza', d: ex.slice(0, 2).join(', ') + (ex.length > 2 ? ' i inne' : '') + ' · od ' + dowDm(od), a: go('#filmy/' + encodeURIComponent(c.id), 'Filmy') }); });
  PUL.clients.forEach(c => { const k = c.pkg; if (!k) return;   // pakiet treningów: kończy się, wygasa albo trening poza pakietem
    const ref = go(kHref(c.id), 'Pakiet'), info = 'kupiony ' + dm(k.from) + (k.to ? ' · ważny do ' + dm(k.to) : '');
    if (k.left < 0) out.push({ o: 0, lv: 'lv-bad', t: c.name + ': ' + -k.left + ' ' + plN(-k.left, 'trening', 'treningi', 'treningów') + ' poza pakietem', d: 'pakiet ' + k.n + ' wykorzystany · czas na nowy', a: ref });
    else if (k.left === 0) out.push({ o: 2, lv: 'lv-warn', t: c.name + ': pakiet wykorzystany', d: 'wszystkie ' + k.n + ' treningów · ' + info, a: ref });
    else if (k.to && k.to < PUL.today) out.push({ o: 2, lv: 'lv-warn', t: c.name + ': pakiet wygasł ' + dm(k.to), d: 'niewykorzystane: ' + k.left + ' z ' + k.n, a: ref });
    else if (k.left <= PKG_LOW) out.push({ o: 2, lv: 'lv-warn', t: c.name + ': ' + (k.left === 1 ? 'został 1 trening' : 'zostały ' + k.left + ' treningi') + ' z pakietu', d: info, a: ref });
    else if (k.to && k.to <= TL.addDays(PUL.today, PKG_DAYS)) out.push({ o: 2, lv: 'lv-warn', t: c.name + ': pakiet ważny do ' + dowDm(k.to), d: 'zostało ' + k.left + ' z ' + k.n + ' treningów', a: ref }); });
  (PUL.agent || []).filter(x => x.pilne).forEach(x => out.push({ o: 0, lv: 'lv-bad', t: x.name + ': ' + (AG_TEMAT[x.typ] || 'zgłoszenie') + ' od asystenta AI',
    d: x.text + ' · ' + dowDm(x.at), a: '<button class="sb" type="button" data-asygo>Otwórz</button>' }));   // Agent.gs: czerwona flaga od bota; reszta spraw w karcie „Od asystenta AI” (asyCard)
  PUL.blocks.forEach(b => out.push({ o: 3, lv: 'lv-warn', t: b.name + ': blok ' + b.block + ' do zamknięcia', d: (b.to < PUL.today ? 'skończył się ' : 'kończy się ') + dowDm(b.to) + ' · brak wniosków', a: go(kHref(b.id, 'bloki'), 'Zamknij') }));
  PUL.clients.forEach(c => { if (c.planLeft !== null && c.planLeft >= 0 && c.planLeft <= 7) out.push({ o: 4, lv: 'lv-warn', t: c.name + ': plan kończy się ' + (c.planLeft === 0 ? 'dziś' : 'za ' + c.planLeft + ' ' + plN(c.planLeft, 'dzień', 'dni', 'dni')), d: 'czas na kolejny blok', a: go(kHref(c.id, 'bloki'), 'Następny') }); });
  return out.sort((a, b) => a.o - b.o);
}
/** „Dziś trenują”: jednostki z datą na dziś albo zaczęte dziś (trPulpit_ → dzis), w trakcie na górze */
function dzisRow(u){
  const c = PUL.clients.find(x => x.id === u.id) || { red: 0, urg: 0 };
  const exN = u.ex ? u.ex + ' ' + plN(u.ex, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń') : '';
  const st = u.st === 'done' ? 'zrobiony' + (u.min ? ', ' + pl(u.min) + ' min' : '') + (u.rpe !== null && u.rpe !== undefined ? ', RPE ' + pl(u.rpe) : '')
    : u.st === 'live' ? 'w trakcie, ' + u.done + (u.sets ? ' z ' + u.sets : '') + ' ' + plN(u.sets || u.done, 'serii', 'serii', 'serii') : 'czeka';
  const sub = [u.title, u.st === 'wait' ? exN : '', st, c.pkg ? 'pakiet ' + pkgLeft(c.pkg) : ''].filter(Boolean).join(' · ');
  const bar = u.st === 'live' && u.sets ? '<span class="dbar"><i style="width:' + Math.min(100, Math.round(u.done / u.sets * 100)) + '%"></i></span>' : '';
  // „▶ Prowadź”: aplikacja klienta w trybie trenera (zapis serii, notatki, ćwiczenia) na tę jednostkę
  const act = u.st === 'done' ? go(kHref(u.id, 'sesje'), 'Sesja') : go(liveHref(u.id, u.week, u.day), '▶ Prowadź', 'acc');
  return '<div class="dr" data-dz="' + esc(u.id + '|' + u.week + '|' + u.day) + '"><span class="ini ' + lvOf(c) + '">' + esc((u.name || '?')[0].toUpperCase()) + '<i></i></span>' +
    '<div class="tx"><b>' + esc(u.name) + '</b><small>' + esc(sub) + '</small>' + bar + '</div>' + act + '</div>';
}
function renderDzis(){
  const cl = PUL.clients, wk = cl.reduce((a, c) => { const f = frac(c.week); return [a[0] + f[0], a[1] + f[1]]; }, [0, 0]);
  const red = cl.reduce((a, c) => a + c.red, 0), nov = PUL.videos.filter(v => !v.kom).length, idle = cl.filter(c => c.ago !== null && c.ago >= 7).length;
  const st = (lv, v, t, href, extra) => { const tag = href ? 'a' : 'div'; return '<' + tag + ' class="st ' + lv + (extra || '') + '"' + (href ? ' href="' + href + '"' : '') + '><b>' + v + '</b><span>' + t + '</span></' + tag + '>'; };
  const stats = '<div class="stats" aria-label="Ten tydzień w liczbach">' +
    st('', wk[0] + '/' + wk[1], 'treningi w tym tygodniu') +
    st(red ? 'lv-bad' : '', red, plN(red, 'czerwony sygnał', 'czerwone sygnały', 'czerwonych sygnałów')) +
    st(nov ? 'lv-warn' : '', nov, 'filmy bez komentarza', '#filmy') +
    st(PUL.blocks.length ? 'lv-warn' : '', PUL.blocks.length, 'bloki do zamknięcia', '#bloki') +
    st(idle ? 'lv-warn' : '', idle, 'bez treningu 7+ dni', '', ' st5') + '</div>';
  const dz = PUL.dzis || [];
  const today = '<div class="card dz-tr"><h2>Dziś trenują · ' + dz.length + '</h2>' + (dz.length ? '<div class="drs">' + dz.map(dzisRow).join('') + '</div>'
    : '<p class="muted">Nikt nie ma dziś treningu w planie i nikt jeszcze nic nie zapisał.</p>') + '</div>';
  const td = todoItems(), todo = '<div class="card todo"><h2>Wymaga uwagi · ' + td.length + '</h2>' + (td.length ? td.map(t =>
    '<div class="it"><span class="dot ' + t.lv + '"></span><div class="tx"><b>' + esc(t.t) + '</b><small>' + esc(t.d) + '</small></div>' + t.a + '</div>').join('') : '<p class="muted">Nic pilnego.</p>') + '</div>';
  const rows = cl.map(c => {
    const f = frac(c.week), sg = (c.status && stLv(c.status) !== 'lv-ok' ? '<span class="pill ' + stLv(c.status) + '">' + esc(c.status) + '</span>' : '') +
      c.signals.slice(0, 3).map(s => '<span class="pill ' + (s.lv === 'bad' ? 'lv-bad' : 'lv-warn') + '">' + esc(s.t) + '</span>').join('') +
      (c.signals.length > 3 ? '<span class="pill">+' + (c.signals.length - 3) + '</span>' : '');
    return '<tr class="row" data-k="' + esc(c.id) + '"><td><a class="who ' + lvOf(c) + '" href="' + kHref(c.id) + '"><span class="dot"></span>' + esc(c.name) + '</a></td>' +
      '<td class="nw hide-m">' + agoTxt(c) + '</td>' +
      '<td class="nw"><span class="prog"><i style="width:' + (f[1] ? Math.round(f[0] / f[1] * 100) : 0) + '%"></i></span><span class="mono">' + esc(c.week || '–') + '</span></td>' +
      '<td class="sigs">' + (sg || '<span class="pill lv-ok">bez sygnałów</span>') + '</td>' +
      '<td class="nw hide-m">' + (c.planLeft === null ? '–' : c.planLeft < 0 ? 'skończony' : 'za ' + c.planLeft + ' dni') + '</td></tr>';
  }).join('');
  const table = '<div class="card"><h2>Klienci · najpilniejsi na górze</h2><div class="tw"><table class="kt"><thead><tr><th>Klient</th><th class="hide-m">Ostatnio</th><th>Ten tydzień</th><th>Sygnały</th><th class="hide-m">Koniec planu</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="5" class="muted">Brak aktywnych klientów w Przeglądzie. Użyj „przelicz”.</td></tr>') + '</tbody></table></div></div>';
  const heat = '<details class="card heatc"><summary><h2>Obciążenie · 12 tygodni</h2></summary><div class="heat" role="img" aria-label="sRPE tygodnia każdego klienta w ostatnich 12 tygodniach">' + cl.map(c => {
    const mx = Math.max(0, ...c.load.map(x => x.srpe || 0));
    return '<span title="' + esc(c.name) + '">' + esc(c.name) + '</span>' + c.load.map(x => { const v = x.srpe || 0, lv = !mx || !v ? '' : 'h' + Math.min(4, Math.ceil(v / mx * 4));
      return '<i class="' + lv + '" title="' + esc(c.name + ' · tydz. od ' + dm(x.week) + ': ' + (x.srpe === null ? 'brak' : x.srpe + ' AU') + (x.status ? ' · ' + x.status : '')) + '"></i>'; }).join('');
  }).join('') + '</div><div class="legend">sRPE tygodnia względem najcięższego tygodnia tej osoby; puste = brak danych. Od ' + esc(dm(PUL.weeks[0])) + ' do ' + esc(dm(PUL.weeks[11])) + '.</div></details>';
  const d = new Date(PUL.today + 'T12:00:00Z');
  $('#main').innerHTML = head(DOWL[d.getUTCDay()] + ' ' + dm(PUL.today) + ' · tydzień ' + dm(PUL.weeks[11]) + '–' + dm(TL.addDays(PUL.weeks[11], 6)), 'Dziś') +
    '<div class="pg">' + stats + '<div class="dz"><div class="stack dz-l">' + today + table + heat + '</div><div class="stack dz-r">' + todo + asyCard() + repliesCard() + '</div></div></div>';
  document.querySelectorAll('[data-rvk]').forEach(a => a.onclick = () => { VALL = true; VSEL = a.dataset.rvk; });   // skomentowany film: lista „Wszystkie”, od razu ten film
  document.querySelectorAll('[data-asygo]').forEach(b => b.onclick = () => { const c = document.getElementById('asy'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  asyBind();
}
/* „Od asystenta AI” (Agent.gs trPropozycja): propozycje botów klientów do zatwierdzenia jednym kliknięciem, zgłoszenia do przeczytania.
   Stan pól (powód odmowy, „zapamiętaj”) tylko w pamięci strony: ASY[pid] = {rej, why, mem, busy, err}; ASYM = komunikat ostatniej decyzji. */
let ASY = {}, ASYM = '';
function asyItem(x){
  const st = ASY[x.pid] || {}, dis = st.busy ? ' disabled' : '', pid = esc(x.pid);
  const meta = [dowDm(x.at), x.week ? 'tydz. ' + x.week + ' · ' + x.day : '', x.date ? 'na ' + dowDm(x.date) : ''].filter(Boolean).join(' · ');
  const tag = '<span class="atag' + (x.pilne ? ' bad' : '') + '">' + esc(x.zgl ? (AG_TEMAT[x.typ] || 'zgłoszenie') : (AG_TYP[x.typ] || x.typ)) + '</span>';
  const mem = '<label class="amem"><input type="checkbox" data-asy-mem="' + pid + '"' + (st.mem ? ' checked' : '') + dis + '> Zapamiętaj jako zasadę dla tego klienta</label>';
  const what = x.typ === 'zamiana' ? '<b>' + esc(x.ex) + '</b> → <b>' + esc(x.to) + '</b> · tylko w tej jednostce' : esc(x.text);
  let act;
  if (x.zgl) act = '<div class="row2"><button class="b p" type="button" data-asy-read="' + pid + '"' + dis + '>' + (st.busy ? 'Zapisuję…' : '✓ Przeczytane') + '</button>' + go(kHref(x.id), 'Karta klienta') + '</div>';
  else if (st.rej) act = '<label class="legend" for="asy-why-' + pid + '">Powód odmowy (asystent przekaże klientowi)</label><textarea class="awhy" id="asy-why-' + pid + '" data-asy-why="' + pid + '" rows="2" maxlength="300"' + dis + '>' + esc(st.why || '') + '</textarea>' + mem +
    '<div class="row2"><button class="b p" type="button" data-asy-nogo="' + pid + '"' + dis + '>' + (st.busy ? 'Zapisuję…' : 'Odrzuć i wyślij powód') + '</button><button class="cp" type="button" data-asy-cancel="' + pid + '"' + dis + '>Anuluj</button></div>';
  else act = mem + '<div class="row2"><button class="b p" type="button" data-asy-ok="' + pid + '"' + dis + '>' + (st.busy ? 'Zapisuję…' : x.typ === 'trening' ? '✓ Zgoda' : '✓ Zatwierdź i zmień plan') + '</button>' +
    '<button class="cp" type="button" data-asy-no="' + pid + '"' + dis + '>Odrzuć…</button></div>' + (x.typ === 'trening' ? '<p class="legend">Plan bez zmian: klient zapisze ten trening sam, gdy go zrobi.</p>' : '');
  return '<div class="api" data-asy="' + pid + '"><div class="aph"><a href="' + kHref(x.id) + '"><b>' + esc(x.name) + '</b></a><span class="muted">' + esc(meta) + '</span>' + tag + '</div>' +
    '<p class="apw">' + what + '</p>' + (x.why ? '<p class="apr">Powód klienta: „' + esc(x.why) + '”</p>' : '') + act + (st.err ? '<p class="err" role="alert">' + esc(st.err) + '</p>' : '') + '</div>';
}
function asyCard(){
  const list = PUL.agent || [], odrz = PUL.agentOdrz || [];
  if (!list.length && !odrz.length && !ASYM) return '';
  return '<div class="card asy" id="asy"><h2>Od asystenta AI · ' + list.length + '</h2>' + (ASYM ? '<p class="saved" role="status">' + esc(ASYM) + '</p>' : '') +
    (list.length ? list.map(asyItem).join('') : '<p class="muted">Nic nie czeka na decyzję.</p>') +
    (odrz.length ? '<details class="aodrz"><summary class="muted">Odrzucone przez serwer · ' + odrz.length + '</summary><ul>' + odrz.map(r => '<li><b>' + esc(r.name) + '</b>, ' + esc(dowDm(r.at)) + ': ' + esc(r.text) + (r.uwaga ? ' <span class="muted">· ' + esc(r.uwaga) + '</span>' : '') + '</li>').join('') + '</ul></details>' : '') +
    '<p class="legend">Bot dostaje Twoje ostatnie decyzje u klienta (z powodem), więc nie proponuje drugi raz tego samego. „Zapamiętaj” dopisuje decyzję do ograniczeń klienta.</p></div>';
}
function asyBind(){
  const re = () => { const el = document.getElementById('asy'), h = asyCard(); if (el) { if (h) el.outerHTML = h; else el.remove(); asyBind(); } };
  const st = pid => ASY[pid] = ASY[pid] || {};
  const send = async (pid, mode) => {
    const s = st(pid), x = (PUL.agent || []).find(a => a.pid === pid); if (!x || s.busy) return;
    if (mode === 'nie' && !String(s.why || '').trim()) { s.err = 'Napisz powód: asystent przekaże go klientowi.'; return re(); }
    s.busy = true; s.err = ''; re();
    try {
      const r = await guard(api('trPropozycja', pid, { mode, why: mode === 'nie' ? s.why : '', zasada: !!s.mem && mode !== 'czytane' }));
      PUL.agent = PUL.agent.filter(a => a.pid !== pid); delete ASY[pid];
      ASYM = x.name + ': ' + (mode === 'tak' ? (r.rows ? 'zatwierdzone, plan zmieniony' : 'zgoda zapisana') : mode === 'nie' ? 'odrzucone, powód pójdzie do klienta' : 'zgłoszenie przeczytane') +
        (r.memo ? ' · dopisane do ograniczeń' : '') + (r.memoErr ? ' · nie dopisano do ograniczeń: ' + r.memoErr : '') + '.';
      if (mode === 'czytane' && x.pilne) return renderDzis();   // czerwona flaga znika też z „Wymaga uwagi”
    } catch (e) { s.busy = false; s.err = e.auth ? '' : e.message; }
    re();
  };
  document.querySelectorAll('[data-asy-ok]').forEach(b => b.onclick = () => send(b.dataset.asyOk, 'tak'));
  document.querySelectorAll('[data-asy-read]').forEach(b => b.onclick = () => send(b.dataset.asyRead, 'czytane'));
  document.querySelectorAll('[data-asy-nogo]').forEach(b => b.onclick = () => send(b.dataset.asyNogo, 'nie'));
  document.querySelectorAll('[data-asy-no]').forEach(b => b.onclick = () => { st(b.dataset.asyNo).rej = true; st(b.dataset.asyNo).err = ''; re(); const t = document.querySelector('[data-asy-why="' + b.dataset.asyNo + '"]'); if (t) t.focus(); });
  document.querySelectorAll('[data-asy-cancel]').forEach(b => b.onclick = () => { const s = st(b.dataset.asyCancel); s.rej = false; s.err = ''; re(); });
  document.querySelectorAll('[data-asy-why]').forEach(t => t.oninput = () => { st(t.dataset.asyWhy).why = t.value; });
  document.querySelectorAll('[data-asy-mem]').forEach(c => c.onchange = () => { st(c.dataset.asyMem).mem = c.checked; });
}
/** „Więcej” (telefon): bloki, ustawienia, mój trening, przeliczenie, wylogowanie */
function renderWiecej(){
  const ic = n => document.querySelector('#nav a[data-v="' + n + '"] svg, #' + n + ' svg') ? document.querySelector('#nav a[data-v="' + n + '"] svg, #' + n + ' svg').outerHTML : '';
  $('#main').innerHTML = head('Panel trenera', 'Więcej') + '<div class="pg"><div class="card mo">' +
    '<a href="#bloki">' + ic('bloki') + 'Bloki do zamknięcia<em>' + (PUL.blocks.length || '') + '</em></a>' +
    '<a href="#prowadzone">' + ic('prow') + 'Prowadzone treningi</a>' +
    '<a href="#cwiczenia">' + ic('cwiczenia') + 'Ćwiczenia bez filmu</a>' +
    '<a href="#ustawienia">' + ic('set') + 'Ustawienia</a>' +
    '<a href="./">' + ic('mine') + 'Mój trening ›</a>' +
    '<button type="button" id="recalc-w">' + $('#recalc-m svg').outerHTML + 'Przelicz dane teraz<small>' + esc($('#at').textContent) + '</small></button>' +
    '<button type="button" id="logout-w"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H6a2 2 0 00-2 2v10a2 2 0 002 2h4M15 8l4 4-4 4M19 12H9"/></svg>Wyloguj</button></div></div>';
  $('#recalc-w').onclick = recalc; $('#logout-w').onclick = logout;
}
/** odpowiedź klienta na komentarz trenera (Log / Sesje odpowiedz_klienta), pokazywana pod komentarzem */
const repBox = (text, at, name) => text ? '<div class="rep"><div class="eb">↩ ' + esc(name || 'Klient') + ' odpowiada' + (at ? ' · ' + esc(dowDm(String(at).slice(0, 10))) : '') + '</div><p>' + esc(text) + '</p></div>' : '';
function repliesCard(){
  const rs = PUL.replies || [];
  const go = r => r.film ? '#filmy/' + encodeURIComponent(r.id) : '#k/' + encodeURIComponent(r.id) + '/sesje';
  return '<div class="card reps"><h2>Odpowiedzi klientów · 14 dni</h2>' + (rs.length ? rs.map(r => '<div class="it"><div class="h"><b>' + esc(r.name) + '</b> <span class="muted">· ' + esc(dowDm(r.at)) + ' · tydz. ' + esc(r.week) + ' · ' + esc(r.title) + '</span></div>' +
    (r.kom ? '<p class="q">' + esc(r.kom.length > 140 ? r.kom.slice(0, 140) + '…' : r.kom) + '</p>' : '') + '<p class="a">' + esc(r.text) + '</p>' +
    '<a class="sb" href="' + go(r) + '"' + (r.film ? ' data-rvk="' + esc(r.file + '|' + r.set) + '"' : '') + ' style="display:inline-flex;align-items:center;text-decoration:none">' + (r.film ? 'Film ›' : 'Sesja ›') + '</a></div>').join('')
    : '<p class="muted">Klienci nie odpowiadali na komentarze w ostatnich 14 dniach.</p>') + '</div>';
}
/* ---------- filmy ---------- */
/* ---------- filmy: własny odtwarzacz (film z Drive API przez bilet trFilm) i komentarz z sekundą (trKomentarzFilm) ---------- */
const FPS = 30;                                  // krok „klatka” (filmy z telefonu: zwykle 30 kl./s)
const FT = { token: '', exp: 0 };                // bilet Google do pobrania filmu, tylko w pamięci strony
const FB = {};                                   // plik → {st: 'load'|'ok'|'err', mode: 'sw'|'blob', url, size, mime, pct, err}; pobrane w całości: najwyżej 4
const FBQ = [];
const KF = {};                                   // seria → szkic komentarza (tylko w pamięci strony)
const KEEP = {};                                 // seria skomentowana w tej sesji: zostaje na liście „Bez komentarza”
let VSPD = 1, VLOOP = true;
const vKey = v => v.file + '|' + v.set;
const tFmt = (s, tenth) => { s = Math.max(0, s || 0); if (tenth) s = Math.round(s * 10) / 10; const m = Math.floor(s / 60), x = s - m * 60; return m + ':' + (tenth ? (x < 10 ? '0' : '') + x.toFixed(1).replace('.', ',') : String(Math.floor(x)).padStart(2, '0')); };
const komTimes = t => String(t || '').split('\n').map(l => /^\s*(\d{1,2}):([0-5]\d)(?:[.,](\d))?\b/.exec(l)).filter(Boolean).map(m => Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 10 : 0));
async function filmToken(force){
  if (!force && FT.token && FT.exp > Date.now() + 60000) return FT.token;
  const r = await guard(api('trFilm')); FT.token = r.token; FT.exp = r.exp || Date.now() + 45 * 60000; return FT.token;
}
const DRV = (file, q) => 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file) + '?' + q;
// Dysk wydaje treść filmu tylko z biletem w nagłówku (bilet w adresie odrzuca), a <video> nagłówka nie wyśle.
// Dlatego: z service workerem <video> gra od razu z adresu na tej stronie, a sw.js dokłada nagłówek i przekazuje kawałki (Range);
// bez niego (pierwsze wejście) albo gdy strumień zawiedzie, film pobiera się w całości do pamięci strony.
const fswOk = () => !!(navigator.serviceWorker && navigator.serviceWorker.controller);
const filmUrl = file => { const f = FB[file] || {}; return f.mode === 'sw' ? 'film-strumien/' + encodeURIComponent(file) + '?t=' + encodeURIComponent(FT.token) : f.url || ''; };
async function filmGet(file, q, extra, signal){
  const go = async force => fetch(DRV(file, q), { headers: Object.assign({ Authorization: 'Bearer ' + await filmToken(force) }, extra || {}), signal });
  let r = await go(); if (r.status === 401) r = await go(true); return r;
}
async function filmWhy(r){                                   // powód odmowy Dysku słowami, z kodem do zgłoszenia
  let why = ''; try { const j = await r.json(); why = (((j.error || {}).errors || [])[0] || {}).reason || (j.error || {}).message || ''; } catch (e) {}
  return r.status === 404 ? 'Filmu nie ma już na Dysku.' : 'Dysk nie oddał filmu (' + r.status + (why ? ', ' + why : '') + ').';
}
async function filmLoad(file, redraw, blob){
  const f = FB[file];
  if (!blob && f && (f.st === 'ok' || f.st === 'load')) return;
  const prev = f || {};
  FB[file] = { st: 'load', pct: 0, size: prev.size || 0, mime: prev.mime || '' }; redraw();
  try {
    if (!prev.size) { const r = await filmGet(file, 'fields=size,mimeType'); if (!r.ok) throw new Error(await filmWhy(r));
      const m = await r.json().catch(() => ({})); FB[file].size = Number(m.size) || 0; FB[file].mime = m.mimeType || ''; }
    if (!blob && fswOk()) { FB[file] = Object.assign(FB[file], { st: 'ok', mode: 'sw' }); return redraw(); }
    const r = await filmGet(file, 'alt=media');
    if (!r.ok) throw new Error(await filmWhy(r));
    const len = Number(r.headers.get('Content-Length')) || FB[file].size, parts = [];
    if (r.body && r.body.getReader) { const rd = r.body.getReader(); let got = 0, last = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length;
        if (len && Date.now() - last > 150) { last = Date.now(); FB[file].pct = Math.round(got / len * 100); const b = document.querySelector('.pv[data-file="' + CSS.escape(file) + '"] .ld b'); if (b) b.style.width = FB[file].pct + '%'; } } }
    else parts.push(new Uint8Array(await r.arrayBuffer()));
    FB[file] = Object.assign(FB[file], { st: 'ok', mode: 'blob', url: URL.createObjectURL(new Blob(parts, { type: r.headers.get('Content-Type') || FB[file].mime || 'video/mp4' })) });
    FBQ.push(file); while (FBQ.length > 4) { const o = FBQ.shift(); if (o !== file && FB[o] && FB[o].url) { URL.revokeObjectURL(FB[o].url); delete FB[o]; } }
  } catch (e) { if (e.auth) { delete FB[file]; return; } FB[file] = { st: 'err', err: e instanceof TypeError ? 'Nie udało się połączyć z Dyskiem (' + e.message + '). Sprawdź internet i spróbuj ponownie.' : e.message || 'Nie udało się połączyć z Dyskiem.', size: FB[file] && FB[file].size }; }
  redraw();
}
function renderFilmy(who){
  document.body.classList.remove('pvfs'); PVK.v = null;
  const all = PUL.videos.filter(v => !who || v.id === who), list = VALL ? all : all.filter(v => !v.kom || KEEP[vKey(v)]);
  if (!list.some(v => vKey(v) === VSEL)) VSEL = list.length ? vKey(list[0]) : '';
  const ix = list.findIndex(v => vKey(v) === VSEL), cur = list[ix];
  const what = v => (v.kg !== '' ? pl(v.kg) + ' kg × ' : '') + esc(v.reps) + (v.ocena ? ' · ocena ' + esc(v.ocena) : v.rpe !== '' ? ' · RPE ' + pl(v.rpe) : '') + (/FAIL/.test(v.typ) ? ' · nieudana' : '');
  const badge = v => v.kom ? (KEEP[vKey(v)] ? '<span class="new done">✓ skomentowany</span>' : '') : '<span class="new">bez komentarza</span>';
  const items = list.map(v => '<button class="vi" type="button" data-vk="' + esc(vKey(v)) + '" aria-current="' + (vKey(v) === VSEL) + '"><b>' + esc(v.name) + ' · ' + esc(v.ex) + badge(v) + '</b>' +
    '<span class="d">' + esc(dowDm(v.at)) + ' · ' + esc(v.day) + ' · seria ' + esc(v.set) + ' · ' + what(v) + '</span></button>').join('');
  const who1 = who ? (PUL.clients.find(c => c.id === who) || {}).name || who : '';
  const sw = cur && list.length > 1 ? '<div class="vsw"><button class="ib" type="button" data-vgo="-1" aria-label="Poprzedni film"' + (ix ? '' : ' disabled') + '>‹</button><div class="t"><b>Film ' + (ix + 1) + ' z ' + list.length + (cur.kom ? '' : ' · bez komentarza') + '</b><span>' + esc(cur.name) + ' · ' + esc(cur.ex) + ' · seria ' + esc(cur.set) + '</span></div><button class="ib" type="button" data-vgo="1" aria-label="Następny film"' + (ix < list.length - 1 ? '' : ' disabled') + '>›</button></div>' : '';
  const view = cur ? '<div class="card">' + playerHtml(cur) +
    '<h2 style="margin-top:14px">' + esc(cur.name) + ' · ' + esc(cur.ex) + '</h2><p class="muted">' + esc(dowDm(cur.at)) + ' · tydz. ' + esc(cur.week) + ' · ' + esc(cur.day) + ' · seria ' + esc(cur.set) + ' · ' + what(cur) + (FB[cur.file] && FB[cur.file].size ? ' · plik ' + pl((FB[cur.file].size / 1048576).toFixed(FB[cur.file].size < 10485760 ? 1 : 0)) + ' MB' : '') + '</p>' +
    (FB[cur.file] && FB[cur.file].st === 'ok' ? '<details class="pvh" id="pvh"><summary>Czarny obraz, a słychać dźwięk?</summary><div id="pvh-b" class="hint">Sprawdzam plik…</div></details>' : '') +
    (cur.swap && TL.parseSwap(cur.swap) ? '<p class="note">' + swapTxt(TL.parseSwap(cur.swap)) + '</p>' : '') +
    (cur.note ? '<div class="eb">Komentarz klienta</div><p class="note">' + esc(cur.note) + '</p>' : '') +
    (cur.komD ? '<div class="eb">Z komentarzy na Dysku</div><p class="kom">' + esc(cur.komD) + '</p>' : '') +
    '<div class="kfw" id="kfw"></div>' +
    '<p class="row2"><a class="b" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="' + esc(cur.link) + '">Otwórz na Dysku</a> <a class="b" style="display:inline-flex;align-items:center;text-decoration:none" href="#k/' + encodeURIComponent(cur.id) + '/sesje">Karta klienta</a></p>' +
    '<p class="hint kbd">Klawiatura: spacja = start / pauza, ← → = klatka, 1 / 2 / 3 = ¼× ½× 1×, F = pełny ekran.</p></div>'
    : '<div class="card es"><b>' + (all.length ? 'Wszystkie filmy skomentowane' : 'Brak filmów z 14 dni') + '</b>' + (all.length ? 'Przełącz na „Wszystkie”, żeby obejrzeć skomentowane.' : '') + '</div>';
  $('#main').innerHTML = head('Ostatnie 14 dni' + (who1 ? ' · ' + esc(who1) : ''), 'Filmy', '<div class="chips"><button class="chip" type="button" data-vall="0" aria-pressed="' + !VALL + '">Bez komentarza</button><button class="chip" type="button" data-vall="1" aria-pressed="' + VALL + '">Wszystkie</button>' + (who ? '<a class="chip" style="display:inline-flex;align-items:center;text-decoration:none" href="#filmy">Wszyscy klienci</a>' : '') + '</div>') +
    '<div class="pg">' + sw + '<div class="vids' + (items ? '' : ' one') + '">' + (items ? '<div class="vlist">' + items + '</div>' : '') + view + '</div></div>';
  const redraw = () => { if (location.hash.startsWith('#filmy')) renderFilmy(who); };
  document.querySelectorAll('[data-vk]').forEach(b => b.onclick = () => { VSEL = b.dataset.vk; redraw(); });
  document.querySelectorAll('[data-vgo]').forEach(b => b.onclick = () => { const n = list[ix + Number(b.dataset.vgo)]; if (n) { VSEL = vKey(n); redraw(); window.scrollTo(0, 0); } });
  document.querySelectorAll('[data-vall]').forEach(b => b.onclick = () => { VALL = b.dataset.vall === '1'; redraw(); });
  if (!cur) return;
  const f = FB[cur.file];
  if (!f) filmLoad(cur.file, redraw);
  else if (f.st === 'ok') playerBind(cur, redraw);
  else if (f.st === 'err') { const r = $('#pv-retry'); if (r) r.onclick = () => { delete FB[cur.file]; filmLoad(cur.file, redraw); }; }
  // pomoc: wymiary obrazu w przeglądarce i porady od razu, format pliku dopisywany, gdy się wczyta
  const ph = $('#pvh'); if (ph) ph.ontoggle = async () => { if (!ph.open) return;
    const draw = fmt => { const vid = $('#pvv'), b = $('#pvh-b'); if (!b) return; const hevc = fmt && /HEVC/.test(fmt.codec);
      b.innerHTML = '<p>Plik: ' + (fmt ? esc(fmtTxt(fmt) || (fmt.read ? 'formatu nie rozpoznano' : 'nie udało się odczytać formatu (Dysk nie odpowiedział)')) : 'sprawdzam format…') + '. ' +
        (vid && vid.videoWidth ? 'Przeglądarka widzi obraz ' + vid.videoWidth + '×' + vid.videoHeight + ', więc go dekoduje, a czarny ekran to zwykle grafika komputera.' : 'Przeglądarka nie widzi obrazu.') + '</p><ul>' +
        (hevc ? '<li>Film jest w HEVC (H.265). W Edge pomaga rozszerzenie „HEVC Video Extensions” ze Sklepu Microsoft.</li>' : '') + '<li>' + esc(VSRTIP) + '</li><li>' + esc(HWTIP) + '</li><li>„Otwórz na Dysku” zawsze pokaże film.</li></ul>'; };
    draw(null); draw(await filmFmt(cur.file, (FB[cur.file] || {}).size || 0)); };
  komFilmDraw(cur, who);
}
/** format obrazu z początku (256 KB) i końca (3 MB) pliku na Dysku: kodek, wymiary, 10 bitów, HDR (TL.videoCodec); pamięć na czas wizyty */
const FMT = {};
async function filmFmt(file, size){
  if (FMT[file]) return FMT[file];
  const head = 262144, tail = 3145728;
  // kawałek pliku: czytany strumieniem i ucinany po limicie (gdyby Dysk zignorował Range i oddał cały film), najwyżej 20 s;
  // koniec pliku tylko z odpowiedzi 206, bo 200 = początek, nie koniec
  const part = async (from, n, tailOnly) => {
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 20000), buf = new Uint8Array(n); let got = 0;
    try {
      const r = await filmGet(file, 'alt=media', { Range: 'bytes=' + from + '-' + (from + n - 1) }, ac.signal);
      if (!r.ok || (tailOnly && r.status !== 206)) return null;
      const rd = r.body.getReader();
      while (got < n) { const { done, value } = await rd.read(); if (done) break; const k = Math.min(value.length, n - got); buf.set(value.subarray(0, k), got); got += k; }
      rd.cancel().catch(() => {});
      return buf.subarray(0, got);
    } catch (e) { return got ? buf.subarray(0, got) : null; } finally { clearTimeout(to); ac.abort(); }
  };
  const a = await part(0, Math.min(head, size || head)), b = size > head ? await part(Math.max(head, size - tail), Math.min(tail, size - head), true) : null;
  const fmt = TL.videoCodec(a, b); fmt.read = !!(a || b);
  if (fmt.read) FMT[file] = fmt;
  return fmt;
}
const fmtTxt = fmt => [fmt.codec, fmt.w && fmt.h ? fmt.w + '×' + fmt.h + (Math.max(fmt.w, fmt.h) >= 3840 ? ' (4K)' : '') : '', fmt.bits10 ? '10 bitów' : '', fmt.hdr ? 'HDR (' + fmt.hdr + ')' : ''].filter(Boolean).join(', ');
const VSRTIP = 'Edge: Ustawienia → System i wydajność → wyłącz „Rozszerz klipy wideo” i przeładuj panel. To najczęstsza przyczyna czarnego obrazu z dźwiękiem tylko na niektórych stronach.';
const HWTIP = 'Przyspieszenie sprzętowe: w Edge Ustawienia → System i wydajność → wyłącz przyspieszenie graficzne (sprzętowe), uruchom Edge ponownie i sprawdź film jeszcze raz. To częsta przyczyna czarnego obrazu z dźwiękiem.';
/** komunikat „dźwięk bez obrazu” z formatem filmu (TL.videoCodec) i podpowiedzią, co zrobić */
function picMsg(fmt){
  const ms = t => !!(window.MediaSource && MediaSource.isTypeSupported && MediaSource.isTypeSupported(t)), edge = /Edg\//.test(navigator.userAgent);
  const hevc = /HEVC/.test(fmt.codec), big = fmt.w * fmt.h > 2073600;
  const what = fmtTxt(fmt);
  const why = hevc ? (ms('video/mp4; codecs="hvc1.1.6.L93.B0"') ? (fmt.bits10 || fmt.hdr ? 'Ta przeglądarka zna HEVC, ale nie dekoduje wersji 10-bitowej / HDR.' : 'Ta przeglądarka zna HEVC, ale karta graficzna nie dekoduje tego filmu' + (big ? ' w tej rozdzielczości' : '') + '.')
        : 'Ta przeglądarka nie obsługuje HEVC.' + (edge ? ' W Edge pomaga rozszerzenie „HEVC Video Extensions” ze Sklepu Microsoft (potem uruchom Edge ponownie).' : ''))
    : fmt.codec ? 'Przeglądarka nie dekoduje obrazu tego filmu' + (big ? ' w tej rozdzielczości' : '') + (fmt.bits10 || fmt.hdr ? ' (10 bitów / HDR)' : '') + '.'
    : 'Nie udało się odczytać formatu pliku.';
  return { err: 'Słychać dźwięk, ale ta przeglądarka nie pokaże obrazu tego filmu.',
    more: [what ? 'Format: ' + what + '.' : '', why, hevc ? '' : HWTIP, 'Na Dysku film zagra: Dysk sam go przekonwertuje.',
      hevc || big || fmt.bits10 || fmt.hdr ? 'Na przyszłość: w aparacie telefonu klienta wideo 1080p, bez „wydajnego wideo” (HEVC) i bez HDR. Filmy będą mniejsze i zagrają wszędzie.' : ''].filter(Boolean) };
}
function playerHtml(v){
  const f = FB[v.file] || { st: 'load', pct: 0 };
  const stage = f.st === 'ok' ? '<video id="pvv" src="' + esc(filmUrl(v.file)) + '" playsinline preload="auto"' + (VLOOP ? ' loop' : '') + '></video><span class="zoom" hidden></span><span class="buf" hidden>Wczytuję…</span><button class="fsb" type="button" data-pv="fs" aria-label="Pełny ekran">⤢</button>'
    : f.st === 'err' ? '<div class="pmsg"><b>' + esc(f.err) + '</b>' + (f.more ? '<div class="more">' + f.more.map(x => '<span>' + esc(x) + '</span>').join('') + '</div>' : '') + '<span>' + (f.codec ? '' : '<button class="b" type="button" id="pv-retry">Spróbuj ponownie</button> ') + '<a class="b" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="' + esc(v.link) + '">Otwórz na Dysku</a></span></div>'
    : '<div class="pmsg"><b>' + (f.pct ? 'Pobieram film…' : 'Łączę z Dyskiem…') + '</b><span class="ld"><b style="width:' + (f.pct || 0) + '%"></b></span></div>';
  const dis = f.st === 'ok' ? '' : ' disabled';
  return '<div class="pv" data-file="' + esc(v.file) + '"><div class="stage">' + stage + '</div><div class="ctl">' +
    '<div class="tl"><span id="pvt">0:00,0</span><div class="bar"><input type="range" id="pvr" min="0" max="1" step="0.01" value="0" aria-label="Chwila filmu"' + dis + '><span class="mk" id="pvm"></span></div><span id="pvd">–</span></div>' +
    '<div class="btns"><button class="ib" type="button" data-pv="back" aria-label="Klatka wstecz"' + dis + '>‹ klatka</button><button class="ib big" type="button" data-pv="play" aria-label="Odtwarzaj"' + dis + '>▶</button><button class="ib" type="button" data-pv="fwd" aria-label="Klatka naprzód"' + dis + '>klatka ›</button><span class="sp"></span>' +
    '<div class="spd" role="group" aria-label="Prędkość">' + [[0.25, '¼×'], [0.5, '½×'], [1, '1×']].map(x => '<button class="ib" type="button" data-spd="' + x[0] + '" aria-pressed="' + (VSPD === x[0]) + '"' + dis + '>' + x[1] + '</button>').join('') + '</div>' +
    '<button class="ib" type="button" data-pv="loop" aria-pressed="' + VLOOP + '" aria-label="Pętla" title="Pętla"' + dis + '>⟲</button><button class="ib fsx" type="button" data-pv="fs" aria-label="Zamknij pełny ekran">✕</button></div>' +
    '<div class="hint tch">Powiększ dwoma palcami, przesuń jednym. Dwa dotknięcia = z powrotem 1×.</div></div></div>';
}
function playerBind(v, redraw){
  const pv = document.querySelector('.pv'), vid = $('#pvv'), rng = $('#pvr'), st = pv.querySelector('.stage'), zl = pv.querySelector('.zoom');
  vid.playbackRate = VSPD;
  const Z = { s: 1, x: 0, y: 0 };
  const apply = () => { Z.s = Math.min(6, Math.max(1, Z.s)); if (Z.s === 1) { Z.x = 0; Z.y = 0; }
    const mx = (Z.s - 1) * st.clientWidth / 2, my = (Z.s - 1) * st.clientHeight / 2; Z.x = Math.min(mx, Math.max(-mx, Z.x)); Z.y = Math.min(my, Math.max(-my, Z.y));
    vid.style.transform = Z.s === 1 ? '' : 'translate(' + Z.x + 'px,' + Z.y + 'px) scale(' + Z.s + ')';
    zl.hidden = Z.s === 1; zl.textContent = pl(Z.s.toFixed(1)) + '× · dotknij dwa razy, żeby wrócić'; };
  const tick = () => { if (!vid.isConnected || !$('#pvt')) return; const d = vid.duration || 0; $('#pvt').textContent = tFmt(vid.currentTime, true); if (d) { rng.max = d; rng.value = vid.currentTime; rng.style.setProperty('--p', (vid.currentTime / d * 100) + '%'); }
    pv.querySelector('[data-pv="play"]').textContent = vid.paused ? '▶' : '❚❚'; pv.querySelector('[data-pv="play"]').setAttribute('aria-label', vid.paused ? 'Odtwarzaj' : 'Pauza');
    const w = $('#kf-ins'); if (w) w.textContent = '⏱ Wstaw chwilę ' + tFmt(vid.currentTime, true); };
  let raf = 0; const loop = () => { tick(); raf = vid.paused ? 0 : requestAnimationFrame(loop); };
  // rozmiar filmu liczony z jego wymiarów i wpisany w piksele: Edge potrafi zignorować object-fit i rozciągnąć obraz na całą scenę
  const fit = () => { const vw = vid.videoWidth, vh = vid.videoHeight, sw = st.clientWidth, sh = st.clientHeight;
    if (!vw || !vh || !sw || !sh) { vid.style.width = vid.style.height = ''; return; }
    let w = sw, h = sw * vh / vw; if (h > sh) { h = sh; w = sh * vw / vh; }
    vid.style.width = Math.round(w) + 'px'; vid.style.height = Math.round(h) + 'px'; };
  if (window.ResizeObserver) new ResizeObserver(fit).observe(st);
  vid.addEventListener('resize', fit);
  vid.addEventListener('loadedmetadata', () => { if (!vid.isConnected || !$('#pvd')) return; $('#pvd').textContent = tFmt(vid.duration, true); fit(); marks(); tick(); noPic(); });
  vid.addEventListener('loadeddata', noPic);
  vid.addEventListener('play', () => { if (!raf) raf = requestAnimationFrame(loop); tick(); });
  vid.addEventListener('pause', tick); vid.addEventListener('seeked', tick);
  // strumień: „Wczytuję…” przy czekaniu na kawałek; zły bilet (po godzinie) = nowy bilet i ta sama chwila; inny błąd = komunikat
  const buf = pv.querySelector('.buf'); let bt = 0;
  vid.addEventListener('waiting', () => { clearTimeout(bt); bt = setTimeout(() => { buf.hidden = false; }, 300); });
  ['canplay', 'playing', 'seeked'].forEach(e => vid.addEventListener(e, () => { clearTimeout(bt); buf.hidden = true; }));
  // błąd odtwarzania: strumień → raz nowy bilet, potem pobranie w całości; pobrany plik też nie gra = format (z typem pliku)
  let again = false;
  vid.addEventListener('error', async () => {
    const f = FB[v.file] || {}, at = vid.currentTime, code = vid.error ? vid.error.code : 0;
    if (f.mode === 'sw' && !again) { again = true; try { await filmToken(true); } catch (e) { return; } vid.src = filmUrl(v.file); if (at) vid.currentTime = at; return; }
    if (f.mode === 'sw') return filmLoad(v.file, redraw, true);
    FB[v.file] = { st: 'err', size: f.size, err: 'Przeglądarka nie odtwarza tego filmu' + (f.mime ? ' (' + f.mime + ')' : '') + ', kod ' + code + '. Otwórz go na Dysku.' };
    redraw();
  });
  // dźwięk bez obrazu: przeglądarka nie ma dekodera ścieżki wideo (zwykle HEVC / 10 bitów / HDR z telefonu), wymiary obrazu = 0;
  // format odczytany z początku i końca pliku (TL.videoCodec), żeby komunikat mówił, co dokładnie nie gra
  let picChecked = false;
  async function noPic(){
    if (picChecked || vid.videoWidth || vid.videoHeight || !(vid.duration > 0) || !FB[v.file] || FB[v.file].st !== 'ok') return;
    picChecked = true; vid.pause();
    const f = FB[v.file], fmt = await filmFmt(v.file, f.size);
    FB[v.file] = Object.assign({ st: 'err', codec: true, size: f.size }, picMsg(fmt));
    if (location.hash.startsWith('#filmy')) redraw();
  }
  rng.oninput = () => { vid.pause(); vid.currentTime = Number(rng.value); tick(); };
  const step = n => { vid.pause(); vid.currentTime = Math.min(vid.duration || 0, Math.max(0, vid.currentTime + n / FPS)); };
  const fs = on => { pv.classList.toggle('fs', on === undefined ? !pv.classList.contains('fs') : on); document.body.classList.toggle('pvfs', pv.classList.contains('fs')); Z.s = 1; apply(); };
  pv.querySelectorAll('[data-pv]').forEach(b => b.onclick = () => { const k = b.dataset.pv;
    if (k === 'play') vid.paused ? vid.play() : vid.pause();
    if (k === 'back') step(-1); if (k === 'fwd') step(1);
    if (k === 'loop') { VLOOP = !VLOOP; vid.loop = VLOOP; b.setAttribute('aria-pressed', VLOOP); }
    if (k === 'fs') fs(); });
  pv.querySelectorAll('[data-spd]').forEach(b => b.onclick = () => { VSPD = Number(b.dataset.spd); vid.playbackRate = VSPD; pv.querySelectorAll('[data-spd]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  // powiększanie: dwa palce = skala, jeden palec przy powiększeniu = przesunięcie, dwa dotknięcia = 1×; na komputerze kółko myszy
  const P = new Map(); let g = null, lastTap = 0;
  const dist = () => { const a = [...P.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
  st.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; st.setPointerCapture(e.pointerId); P.set(e.pointerId, { x: e.clientX, y: e.clientY });
    g = P.size === 2 ? { d: dist(), s: Z.s } : { x: e.clientX, y: e.clientY, zx: Z.x, zy: Z.y, moved: false }; });
  st.addEventListener('pointermove', e => { if (!P.has(e.pointerId) || !g) return; P.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (P.size === 2 && g.d) { Z.s = g.s * dist() / g.d; apply(); }
    else if (P.size === 1 && g.zx !== undefined) { if (Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 6) g.moved = true; if (Z.s > 1) { Z.x = g.zx + e.clientX - g.x; Z.y = g.zy + e.clientY - g.y; apply(); } } });
  const up = e => { const was = g; P.delete(e.pointerId);
    if (!P.size && was && was.zx !== undefined && !was.moved) { const now = Date.now(); if (now - lastTap < 320) { Z.s = 1; apply(); lastTap = 0; } else lastTap = now; }
    g = P.size === 1 ? (() => { const a = [...P.values()][0]; return { x: a.x, y: a.y, zx: Z.x, zy: Z.y, moved: true }; })() : null; };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
  st.addEventListener('wheel', e => { e.preventDefault(); Z.s *= e.deltaY < 0 ? 1.15 : 1 / 1.15; apply(); }, { passive: false });
  PVK.v = vid; PVK.step = step; PVK.fs = fs;
  tick();
}
const PVK = {};                                   // klawiatura w widoku Filmy
document.addEventListener('keydown', e => {
  if (!location.hash.startsWith('#filmy') || !PVK.v || !document.contains(PVK.v) || e.target.closest('textarea,input:not([type=range]),select') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key, v = PVK.v;
  if (k === ' ') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
  else if (k === 'ArrowLeft' || k === ',') { e.preventDefault(); PVK.step(-1); }
  else if (k === 'ArrowRight' || k === '.') { e.preventDefault(); PVK.step(1); }
  else if (k === '1' || k === '2' || k === '3') { const b = document.querySelector('[data-spd="' + ({ 1: 0.25, 2: 0.5, 3: 1 })[k] + '"]'); if (b) b.click(); }
  else if (k === 'f' || k === 'F') PVK.fs();
  else if (k === 'Escape' && document.querySelector('.pv.fs')) PVK.fs(false);
});
function marks(){
  const vid = $('#pvv'), m = $('#pvm'), t = $('#kf-txt'); if (!vid || !m || !vid.duration) { if (m) m.innerHTML = ''; return; }
  m.innerHTML = komTimes(t ? t.value : '').filter(s => s <= vid.duration).map(s => '<button type="button" style="left:' + (s / vid.duration * 100) + '%" data-seek="' + s + '" aria-label="Przejdź do ' + tFmt(s, true) + '" title="' + tFmt(s, true) + '"></button>').join('');
  m.querySelectorAll('[data-seek]').forEach(b => b.onclick = () => { vid.pause(); vid.currentTime = Number(b.dataset.seek); });
}
function komFilmDraw(v, who){
  const k = vKey(v), st = KF[k] || {}, w = $('#kfw'); if (!w) return;
  const text = st.text !== undefined ? st.text : v.komT, dis = st.busy ? ' disabled' : '';
  w.innerHTML = '<div class="eb" style="margin:14px 0 6px">Twój komentarz</div><textarea id="kf-txt" aria-label="Twój komentarz do filmu" placeholder="Np. 0:03,5 Łokcie wyżej przy wejściu pod sztangę."' + dis + '>' + esc(text) + '</textarea>' +
    '<div class="row2"><button class="b" type="button" id="kf-ins"' + (FB[v.file] && FB[v.file].st === 'ok' ? '' : ' disabled') + '>⏱ Wstaw chwilę 0:00,0</button><span class="sp"></span>' +
    (st.ok ? '<span class="saved">✓ Zapisano</span>' : '') + '<button class="b p" type="button" id="kf-save"' + dis + '>' + (st.busy ? 'Zapisuję…' : 'Zapisz') + '</button></div>' +
    (st.err ? '<p class="err" role="alert">' + esc(st.err) + '</p>' : '') + repBox(v.rep, v.repAt, v.name) +
    '<p class="hint" style="margin-top:8px">Klient zobaczy komentarz przy tej serii w zakładce Trener. Linia zaczynająca się od „0:03,5” (albo „0:03”) to chwila filmu z dokładnością do 1/10 s: w panelu pokazuje się jako kreska na pasku, którą możesz kliknąć.</p>';
  const ta = $('#kf-txt');
  ta.oninput = () => { (KF[k] = KF[k] || {}).text = ta.value; KF[k].ok = false; marks(); };
  $('#kf-ins').onclick = () => { const vid = $('#pvv'); if (!vid) return; vid.pause();
    const tag = tFmt(vid.currentTime, true) + ' ', a = ta.selectionStart, pre = ta.value.slice(0, a), lineStart = pre.lastIndexOf('\n') + 1;
    const nl = pre.slice(lineStart).trim() ? '\n' : '';
    ta.value = pre + nl + tag + ta.value.slice(a); const pos = (pre + nl + tag).length; ta.focus(); ta.setSelectionRange(pos, pos); ta.oninput(); };
  $('#kf-save').onclick = async () => {
    const s = KF[k] = KF[k] || {}; s.busy = true; s.err = ''; s.text = ta.value; komFilmDraw(v, who);
    try { const r = await guard(api('trKomentarzFilm', v.id, v.week, v.day, v.order, v.set, s.text));
      v.komT = r.text; v.kom = [v.komD, v.komT].filter(Boolean).join('\n'); KEEP[k] = true; KF[k] = { ok: true }; }
    catch (e) { s.busy = false; if (!e.auth) s.err = e.message; }
    if (location.hash.startsWith('#filmy') && VSEL === k) { komFilmDraw(v, who); document.querySelectorAll('[data-vk="' + CSS.escape(k) + '"] b').forEach(b => { const n = b.querySelector('.new'); if (n && v.kom) { n.className = 'new done'; n.textContent = '✓ skomentowany'; } }); marks(); }
  };
  marks();
}

/* ---------- bloki ---------- */
function renderBloki(){
  const rows = PUL.blocks.map(b => '<tr class="row" data-k="' + esc(b.id) + '"><td><a class="who" href="#k/' + encodeURIComponent(b.id) + '/bloki">' + esc(b.name) + '</a></td><td class="mono">' + esc(b.block) + '</td><td class="nw">' + esc(dm(b.from)) + '–' + esc(dm(b.to)) + '</td><td>' + (b.to < PUL.today ? 'skończony' : 'kończy się ' + esc(dm(b.to))) + '</td><td>' + (b.dlaKlienta ? 'jest' : '<span class="muted">brak</span>') + '</td><td class="nw"><a class="b" style="display:inline-flex;align-items:center;text-decoration:none" href="#k/' + encodeURIComponent(b.id) + '/bloki">Zamknij blok ›</a></td></tr>').join('');
  $('#main').innerHTML = head('Koniec w ciągu 7 dni albo już po, bez wniosków', 'Bloki do zamknięcia') + '<div class="pg"><div class="card">' +
    (rows ? '<div class="tw"><table><thead><tr><th>Klient</th><th>Blok</th><th>Daty</th><th>Stan</th><th>Dla klienta</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div><p class="legend">„Zamknij blok” otwiera kartę klienta: wnioski i notatkę „dla klienta” wpiszesz sam albo zaczniesz od szkicu AI.</p>'
      : '<div class="es"><b>Wszystkie bloki zamknięte</b>Wnioski są wpisane.</div>') + '</div></div>';
}

/* ---------- Więcej → Prowadzone (punkt 16 przeglądu v80): treningi z trybu „Prowadź” w miesiącu, CSV do rozliczeń (trProwadzone) ---------- */
const PRW = {};   // miesiąc → odpowiedź trProwadzone, tylko w pamięci strony
const hMin = m => m >= 60 ? Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '') : m + ' min';
const MIES = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const miesTxt = m => MIES[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
async function renderProwadzone(mies){
  const k = mies || '_';
  if (!PRW[k]) { $('#main').innerHTML = head('Panel trenera', 'Prowadzone treningi') + '<div class="pg"><div class="es">Ładowanie…</div></div>';
    try { PRW[k] = await guard(api('trProwadzone', mies)); } catch (e) { if (!e.auth) $('#main').innerHTML = head('Panel trenera', 'Prowadzone treningi') + errBox(e); return; }
    if (!location.hash.startsWith('#prowadzone')) return; }
  const r = PRW[k];
  const rows = r.clients.map(c => '<tr class="row" data-k="' + esc(c.id) + '"><td><a class="who" href="#k/' + encodeURIComponent(c.id) + '/sesje">' + esc(c.name) + '</a></td><td class="mono">' + c.n + '</td><td class="nw">' + (c.min ? esc(hMin(c.min)) : '–') + '</td>' +
    '<td><div class="pw-d">' + c.items.map(i => '<span title="' + esc(i.title + ' · tydz. ' + i.week) + '">' + esc(dowDm(i.date)) + (i.min ? ' · ' + i.min + ' min' : '') + '</span>').join('') + '</div></td></tr>').join('');
  $('#main').innerHTML = head('Treningi zapisane w trybie „Prowadź”', 'Prowadzone treningi') + '<div class="pg"><div class="card">' +
    '<div class="pw-f"><label>Miesiąc<select id="pw-m">' + r.months.map(m => '<option value="' + m + '"' + (m === r.mies ? ' selected' : '') + '>' + esc(miesTxt(m)) + '</option>').join('') + '</select></label>' +
    (r.n ? '<button class="b" type="button" id="pw-csv">Pobierz CSV</button>' : '') + '</div>' +
    (r.n ? '<p class="kstat" id="pw-sum"><b>' + r.n + ' ' + plN(r.n, 'trening', 'treningi', 'treningów') + '</b> · ' + esc(hMin(r.min)) + ' · ' + r.clients.length + ' ' + plN(r.clients.length, 'klient', 'klientów', 'klientów') + '</p>' +
      '<div class="tw"><table><thead><tr><th>Klient</th><th>Treningi</th><th>Czas</th><th>Daty</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="legend">Liczą się treningi zakończone w trybie „Prowadź” (Sesje: prowadził = trener), dzień według startu treningu. Czas to minuty zapisane w podsumowaniu jednostki.</p>'
      : '<div class="es"><b>Brak prowadzonych treningów</b>W ' + esc(miesTxt(r.mies)) + ' nie zakończyłeś żadnego treningu w trybie „Prowadź”.</div>') + '</div></div>';
  $('#pw-m').onchange = e => { location.hash = '#prowadzone/' + e.target.value; };
  const cb = $('#pw-csv'); if (cb) cb.onclick = () => {
    const q = v => { const t = String(v); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const lines = [['klient', 'data', 'tydzien', 'jednostka', 'tytul', 'minuty']].concat(...r.clients.map(c => c.items.map(i => [c.name, i.date, i.week, i.day, i.title, i.min || ''])), [['RAZEM', r.mies, '', '', r.n + ' treningów', r.min]]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.map(l => l.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'prowadzone-' + r.mies + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
}

/* ---------- Ćwiczenia (punkt 7 przeglądu v80): ćwiczenia z planów bez filmu „Jak wykonać”, link trenera, martwe linki (apps-script/Instruktaz.gs) ---------- */
let CW = null, CWD = {}, CWM = { busy: '', ok: {}, err: {}, chk: false, chkErr: '' }, CWQ = '';   // lista, szkice linków, stan zapisu; tylko w pamięci strony
const cwOkUrl = u => /^https?:\/\/[^\s"<>]+$/i.test(u) && u.length <= 500;
async function renderCwiczenia(){
  if (!CW) { $('#main').innerHTML = head('Panel trenera', 'Ćwiczenia') + '<div class="pg"><div class="es">Ładowanie…</div></div>';
    try { CW = await guard(api('trCwiczenia')); } catch (e) { if (!e.auth) $('#main').innerHTML = head('Panel trenera', 'Ćwiczenia') + errBox(e); return; }
    if (!location.hash.startsWith('#cwiczenia')) return; }
  cwDraw();
}
function cwRow(x, k, dead){
  const d = CWD[k] !== undefined ? CWD[k] : '', bad = d.trim() && !cwOkUrl(d.trim()), busy = CWM.busy === k;
  const meta = dead ? (dead.why === 'brak' ? 'Film usunięty albo zły adres' : 'Film prywatny albo bez dostępu') + (x.n ? ' · ' + x.n + ' ' + plN(x.n, 'wiersz', 'wiersze', 'wierszy') + ' planu' : '')
    : x.clients + ' ' + plN(x.clients, 'klient', 'klientów', 'klientów') + ' · ' + x.n + ' ' + plN(x.n, 'wiersz', 'wiersze', 'wierszy') + ' planu' + (x.last ? ' · ostatnio ' + dowDm(x.last) : '');
  return '<li class="cwr" data-cwk="' + esc(k) + '"><div class="cwn"><b>' + esc(x.name) + '</b>' + (x.inBase === false ? '<span class="pill">nowe w bazie</span>' : '') +
    '<small>' + esc(meta) + (x.as && x.as.length ? ' · w planie: ' + esc(x.as.join(', ')) : '') + '</small>' +
    (dead ? '<a class="lnk" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.url) + '</a>' : '') + '</div>' +
    (x.done ? '' : '<div class="cwf"><input type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://youtu.be/…" aria-label="Link do filmu: ' + esc(x.name) + '" data-cwu="' + esc(k) + '" value="' + esc(d) + '"' + (bad ? ' aria-invalid="true"' : '') + '>' +
    '<button class="b" type="button" data-cws="' + esc(k) + '"' + (busy || !d.trim() || bad ? ' disabled' : '') + '>' + (busy ? 'Zapisuję…' : 'Zapisz') + '</button></div>') +
    (CWM.ok[k] ? '<p class="saved" role="status">' + esc(CWM.ok[k]) + '</p>' : '') + (CWM.err[k] ? '<p class="err" role="alert">' + esc(CWM.err[k]) + '</p>' : '') +
    '<p class="err" data-cwbad="' + esc(k) + '"' + (bad ? '' : ' hidden') + '>Link musi zaczynać się od https://</p></li>';
}
function cwDraw(){
  const r = CW, q = CWQ.trim().toLowerCase(), fit = x => !q || (x.name + ' ' + (x.as || []).join(' ')).toLowerCase().includes(q);
  const miss = r.missing.filter(fit), dead = r.dead.filter(fit), nm = r.missing.filter(x => !x.done).length, nd = r.dead.filter(x => !x.done).length;
  const at = r.at ? dowDm(r.at.slice(0, 10)) + ', ' + new Date(r.at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '';
  const chk = '<div class="fr"><div><b>Kontrola linków</b><small>' + (at ? 'Sprawdzone ' + esc(at) + ', ' + r.checked + ' ' + plN(r.checked, 'link', 'linki', 'linków') + '.' : 'Linki nie były jeszcze sprawdzane.') +
    (r.trigger === false ? ' Cotygodniowe sprawdzanie wyłączone.' : ' Samo sprawdza co poniedziałek ok. 4:00.') + '</small></div>' +
    '<button class="b" type="button" id="cw-chk"' + (CWM.chk ? ' disabled' : '') + '>' + (CWM.chk ? 'Sprawdzam… (do 2 min)' : 'Sprawdź teraz') + '</button></div>' +
    (CWM.chkErr ? '<p class="err" role="alert">' + esc(CWM.chkErr) + '</p>' : '');
  $('#main').innerHTML = head('Filmy „Jak wykonać” do ćwiczeń z planów', 'Ćwiczenia') + '<div class="pg"><div class="stack" style="max-width:820px">' +
    '<div class="card"><div class="pw-f"><label>Szukaj<input type="search" id="cw-q" value="' + esc(CWQ) + '" placeholder="nazwa ćwiczenia" autocomplete="off"></label></div>' +
    '<p id="cw-sum" style="margin:0 0 4px;font-size:15px"><b>' + nm + ' ' + plN(nm, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń') + ' bez filmu</b> · ' + nd + ' ' + plN(nd, 'martwy link', 'martwe linki', 'martwych linków') + ' · ' + r.links + ' z filmem w bazie</p>' + chk + '</div>' +
    (r.dead.length ? '<div class="card" id="cw-dead"><h2>Martwe linki</h2><ul class="cwl">' + (dead.length ? dead.map(x => cwRow(x, 'd:' + x.name, x)).join('') : '<li class="legend">Nic nie pasuje do wyszukiwania.</li>') + '</ul>' +
      '<p class="legend">Klient widzi przy tych ćwiczeniach link, który nie działa. Wklej nowy albo popraw adres w zakładce Ćwiczenia w arkuszu.</p></div>' : '') +
    '<div class="card" id="cw-miss"><h2>Bez filmu</h2>' + (r.missing.length ? '<ul class="cwl">' + (miss.length ? miss.map(x => cwRow(x, 'm:' + x.name)).join('') : '<li class="legend">Nic nie pasuje do wyszukiwania.</li>') + '</ul>' +
      '<p class="legend">Ćwiczenia z planów aktywnych klientów, przy których klient nie ma Twojego filmu (części kompleksu osobno), od najczęściej używanych. Link trafia do zakładki Ćwiczenia (kolumna instruktaz); klient zobaczy go przy następnym otwarciu planu. Do czasu filmu aplikacja pokazuje zdjęcia i opis z bazy, jeśli są.</p>'
      : '<div class="es"><b>Wszystkie ćwiczenia z planów mają film</b>Nowe nazwy pojawią się tu po wczytaniu planu.</div>') + '</div></div></div>';
  const qi = $('#cw-q'); qi.oninput = e => { CWQ = e.target.value; const p = e.target.selectionStart; cwDraw(); const n = $('#cw-q'); n.focus(); try { n.setSelectionRange(p, p); } catch (er) {} };
  document.querySelectorAll('[data-cwu]').forEach(i => i.oninput = () => {
    const k = i.dataset.cwu, v = i.value.trim(); CWD[k] = i.value; delete CWM.ok[k]; delete CWM.err[k];
    const b = document.querySelector('[data-cws="' + CSS.escape(k) + '"]'); if (b) b.disabled = !v || !cwOkUrl(v);
    i.setAttribute('aria-invalid', v && !cwOkUrl(v) ? 'true' : 'false'); });
  // zły link: komunikat po wyjściu z pola (bez przerysowania listy, żeby nie zgubić kliknięcia „Zapisz”)
  document.querySelectorAll('[data-cwu]').forEach(i => i.onchange = () => { const v = i.value.trim(), e = document.querySelector('[data-cwbad="' + CSS.escape(i.dataset.cwu) + '"]'); if (e) e.hidden = !v || cwOkUrl(v); });
  document.querySelectorAll('[data-cws]').forEach(b => b.onclick = () => cwSave(b.dataset.cws));
  $('#cw-chk').onclick = async () => {
    CWM.chk = true; CWM.chkErr = ''; cwDraw();
    try { CW = await guard(api('trCwSprawdz')); } catch (e) { if (e.auth) return; CWM.chkErr = e.message; }
    CWM.chk = false; if (location.hash.startsWith('#cwiczenia')) cwDraw();
  };
}
async function cwSave(k){
  const name = k.slice(2), url = String(CWD[k] || '').trim();
  if (!cwOkUrl(url) || CWM.busy) return;
  CWM.busy = k; cwDraw();
  try { const r = await guard(api('trCwFilm', name, url));
    const keep = k[0] === 'd' ? CW.dead.find(x => x.name === name) : CW.missing.find(x => x.name === name);   // zapisane zostaje na liście do odświeżenia
    CW = r; if (keep) { const L = k[0] === 'd' ? CW.dead : CW.missing; if (!L.some(x => x.name === name)) L.unshift(Object.assign({}, keep, { done: true })); }
    CWM.ok[k] = '✓ Zapisano. Klient zobaczy film przy następnym otwarciu planu.'; delete CWD[k];
  } catch (e) { if (e.auth) { CWM.busy = ''; return; } CWM.err[k] = e.message; }
  CWM.busy = ''; if (location.hash.startsWith('#cwiczenia')) cwDraw();
}

/* ---------- ustawienia: klucz Claude API (trAI, trUstawAI); panel widzi tylko końcówkę klucza ---------- */
let AIS = null, AIM = { ok: '', err: '', busy: false, del: false };
async function renderUstawienia(){
  if (!AIS) { $('#main').innerHTML = head('Panel trenera', 'Ustawienia') + '<div class="pg"><div class="es">Ładowanie…</div></div>';
    try { [AIS, MS, DY, ZS] = await Promise.all([guard(api('trAI')), guard(api('trMail')), guard(api('trDysk')), guard(api('trZasady'))]); ZD = null; } catch (e) { if (!e.auth) $('#main').innerHTML = head('Panel trenera', 'Ustawienia') + errBox(e); return; }
    if (!location.hash.startsWith('#ustawienia')) return; }
  const a = AIS, m = AIM, dis = m.busy ? ' disabled' : '';
  $('#main').innerHTML = head('Panel trenera', 'Ustawienia') + '<div class="pg"><div class="card" id="aikey-card" style="max-width:640px"><h2>Szkic AI · klucz Claude API</h2>' +
    '<p class="kstat"><span class="dot' + (a.set ? ' on' : '') + '"></span>' + (a.set ? '<span>Klucz ustawiony <span class="mono">' + esc(a.end) + '</span> · dziś ' + a.n + ' z ' + a.limit + ' szkiców</span>' : '<span>Brak klucza: „✦ Szkic AI” jest wyłączony.</span>') + '</p>' +
    '<div class="keyf"><label for="aikey">' + (a.set ? 'Nowy klucz (zastąpi obecny)' : 'Klucz') + '</label><input id="aikey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-ant-…"' + dis + '></div>' +
    '<div class="row"><button class="b p" type="button" id="aikey-save"' + dis + '>' + (m.busy ? 'Sprawdzam klucz…' : 'Zapisz klucz') + '</button>' +
    (a.set ? '<button class="b" type="button" id="aikey-del"' + dis + '>' + (m.del ? 'Na pewno usunąć?' : 'Usuń klucz') + '</button>' : '') + '</div>' +
    (m.ok ? '<p class="saved" role="status">' + esc(m.ok) + '</p>' : '') + (m.err ? '<p class="err" role="alert">' + esc(m.err) + '</p>' : '') +
    '<p class="legend">Klucz założysz na <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> → API Keys → Create Key. Przed zapisem sprawdzam go w Anthropic (bez opłaty). ' +
    'Klucz trafia do ustawień skryptu arkusza, nie do arkusza ani do tej strony: tutaj widać tylko 4 ostatnie znaki.</p></div>' + zasadyCard() + mailCard() + dyskCard() + '</div>';
  const save = async key => {
    Object.assign(AIM, { busy: true, ok: '', err: '', del: false }); renderUstawienia();
    try { const r = await guard(api('trUstawAI', key)); AIS = r;
      AIM.ok = !key ? 'Klucz usunięty. Szkic AI jest wyłączony.' : r.checked ? '✓ Zapisano. Klucz działa, możesz robić szkice.' : 'Zapisano, ale Anthropic nie odpowiedział, więc klucza nie udało się sprawdzić. Spróbuj szkicu.'; }
    catch (e) { if (!e.auth) AIM.err = e.message; }
    AIM.busy = false; if (location.hash.startsWith('#ustawienia')) renderUstawienia();
  };
  $('#aikey-save').onclick = () => { const k = $('#aikey').value.trim(); if (!k) { Object.assign(AIM, { err: 'Wklej klucz.', ok: '' }); renderUstawienia(); return; } save(k); };
  const del = $('#aikey-del'); if (del) del.onclick = () => { if (!AIM.del) { Object.assign(AIM, { del: true, ok: '', err: '' }); renderUstawienia(); return; } save(''); };
  zasadyBind();
  const kb = $('#kopia-go'); if (kb) kb.onclick = async () => {
    if (DYM.busy) return; DYM = { busy: true, ok: '', err: '' }; renderUstawienia();
    try { DY = await guard(api('trKopia')); DYM = { busy: false, ok: '✓ Kopia zapisana.', err: '' }; }
    catch (e) { DYM = { busy: false, ok: '', err: e.auth ? '' : e.message }; }
    if (location.hash.startsWith('#ustawienia')) renderUstawienia();
  };
  document.querySelectorAll('[data-hour]').forEach(b => b.onclick = async () => {
    const h = Number(b.dataset.hour); if (!MS || h === MS.hour || MH.busy) return;
    MH = { busy: true, ok: '', err: '' }; renderUstawienia();
    try { MS = await guard(api('trMailUstaw', h)); MH = { busy: false, ok: '✓ Zapisano. Mail wychodzi teraz ok. ' + h + ':00.', err: '' }; }
    catch (e) { MH = { busy: false, ok: '', err: e.auth ? '' : e.message }; }
    if (location.hash.startsWith('#ustawienia')) renderUstawienia();
  });
}
let MH = { busy: false, ok: '', err: '' };
/* ---------- asystent AI klienta (Agent.gs): zasady trenera w Ustawieniach, klucz API i uprawnienia w ustawieniach klienta ---------- */
let ZS = null, ZD = null, ZM = { busy: false, ok: '', err: '' };      // zasady (trZasady), szkic, stan zapisu; tylko w pamięci strony
const AGS = {}, AGD = {};                                               // klient → ustawienia API (trAgent) i szkic zmian
let AGM = { id: '', busy: '', ok: '', err: '', sure: '', key: '', cp: '' };
const AG_LIM = { skok_kg: [0, 10, 2.5], zapisy: [10, 200, 10], propozycje: [0, 20, 1], zgloszenia: [1, 30, 1], limit: [10, 500, 10] };
const AG_TEMAT = { czerwona_flaga: 'czerwona flaga', bol: 'ból', plan: 'pytanie o plan', ciezar: 'pytanie o ciężar', status: 'sygnał w podsumowaniu', fail: 'nieudane serie', pominiete: 'pominięte treningi', dieta: 'dieta', cel: 'zmiana celu', zawody: 'zawody', inne: 'zgłoszenie' };
const AG_TYP = { zamiana: 'zamiana', ciezar: 'ciężar', serie: 'serie', trening: 'dodatkowy trening' };
const agNumH = (f, v, u) => { const [mn, mx, st] = AG_LIM[f]; return '<div class="num"><button type="button" data-agnum="' + f + '" data-d="-' + st + '"' + (v <= mn ? ' disabled' : '') + ' aria-label="mniej">−</button><output>' + pl(v) + (u || '') +
  '</output><button type="button" data-agnum="' + f + '" data-d="' + st + '"' + (v >= mx ? ' disabled' : '') + ' aria-label="więcej">+</button></div>'; };
const agSwH = (f, v, lbl) => '<button type="button" class="sw" role="switch" data-agsw="' + f + '" aria-checked="' + !!v + '" aria-label="' + esc(lbl) + '"></button>';
function agCtl(st, re){   // osobne atrybuty: na stronie klienta data-sw / data-num należą do formularza klienta (klCtl)
  document.querySelectorAll('[data-agsw]').forEach(b => b.onclick = () => { st[b.dataset.agsw] = !st[b.dataset.agsw]; re(); });
  document.querySelectorAll('[data-agnum]').forEach(b => b.onclick = () => { const f = b.dataset.agnum, l = AG_LIM[f]; st[f] = Math.min(l[1], Math.max(l[0], Math.round((st[f] + Number(b.dataset.d)) * 10) / 10)); re(); });
}
const zsCh = () => { const z = ZS || {}, d = ZD; return !!d && (d.t !== (z.tekst || '') || Object.keys(d.l).some(k => d.l[k] !== (z.limity || {})[k])); };
function zasadyCard(){
  const z = ZS || { tekst: '', limity: { skok_kg: 2.5, zapisy: 50, propozycje: 5, zgloszenia: 10 }, at: '' };
  const d = ZD = ZD || { t: z.tekst, l: Object.assign({}, z.limity) }, dis = ZM.busy ? ' disabled' : '';
  return '<div class="card" id="zasady-card" style="max-width:640px"><h2>Asystent AI klienta · zasady trenera</h2>' +
    '<p class="kstat"><span class="dot' + (z.tekst ? ' on' : '') + '"></span><span>' + (z.tekst ? 'Zapisane ' + esc(mailAt(z.at)) + ' · ' + z.tekst.length + ' znaków' : 'Brak zasad: bot klienta zna tylko twarde reguły serwera.') + '</span></p>' +
    '<div class="agta"><label for="zs-t">Zasady z projektu trenera: sekcje 1–4 i 6</label><textarea id="zs-t" rows="10" spellcheck="false"' + dis + '>' + esc(d.t) + '</textarea></div>' +
    '<p class="legend">Ten tekst dostaje bot każdego klienta, więc bez imion i bez sekcji 5. Ograniczenia jednej osoby (zdrowie, kontuzje) wklejasz w jej ustawieniach: Klienci → Ustawienia → Asystent AI.</p>' +
    '<div class="frm">' +
    frH('Skok ciężaru', 'Najwyżej tyle kg ponad ciężar na dziś w propozycji bota (reguła 1.9).', agNumH('skok_kg', d.l.skok_kg, ' kg')) +
    frH('Zapisy dziennie', 'Serie i treningi zapisane przez bota jednego klienta.', agNumH('zapisy', d.l.zapisy)) +
    frH('Propozycje dziennie', 'Zmiany planu do Twojej akceptacji. 0 = bot nie proponuje.', agNumH('propozycje', d.l.propozycje)) +
    frH('Zgłoszenia dziennie', 'Ból, czerwone flagi i pytania do Ciebie.', agNumH('zgloszenia', d.l.zgloszenia)) + '</div>' +
    '<div class="row2" style="margin-top:12px"><button class="b p" type="button" id="zs-save"' + (zsCh() && !ZM.busy ? '' : ' disabled') + '>' + (ZM.busy ? 'Zapisuję…' : 'Zapisz zasady') + '</button>' +
    (ZM.ok ? '<span class="saved" role="status">' + esc(ZM.ok) + '</span>' : '') + '</div>' + (ZM.err ? '<p class="err" role="alert">' + esc(ZM.err) + '</p>' : '') + '</div>';
}
function zasadyBind(){
  const re = () => { ZM.ok = ''; if (location.hash.startsWith('#ustawienia')) renderUstawienia(); };
  agCtl(ZD.l, re);
  const t = $('#zs-t'); if (t) t.oninput = () => { ZD.t = t.value; const b = $('#zs-save'); if (b && !ZM.busy) b.disabled = !zsCh(); };
  const b = $('#zs-save'); if (b) b.onclick = async () => {
    ZM = { busy: true, ok: '', err: '' }; renderUstawienia();
    try { ZS = await guard(api('trZasadyUstaw', ZD.t, ZD.l)); ZD = null; ZM = { busy: false, ok: '✓ Zapisano. Boty klientów dostaną nowe zasady przy następnym pytaniu.', err: '' }; }
    catch (e) { ZM = { busy: false, ok: '', err: e.auth ? '' : e.message }; }
    if (location.hash.startsWith('#ustawienia')) renderUstawienia();
  };
}
const AG_F = ['read', 'write', 'prop', 'limit', 'ogr'];
function agentCard(k){
  const a = AGS[k.id], m = AGM.id === k.id ? AGM : { busy: '', ok: '', err: '', sure: '', key: '', cp: '' }, dis = m.busy ? ' disabled' : '';
  const h = '<div class="card" id="agent"><h2>Asystent AI klienta (API)</h2>';
  if (!a) return h + (m.err ? '<p class="err" role="alert">' + esc(m.err) + '</p>' : '<p class="muted">Ładowanie…</p>') + '</div>';
  const d = AGD[k.id] = AGD[k.id] || { read: a.read, write: a.write, prop: a.prop, limit: a.limit, ogr: a.ogr }, ch = AG_F.some(f => d[f] !== a[f]);
  const stat = a.on ? 'Włączony · klucz …' + esc(a.end) + (a.at ? ' od ' + esc(dm(a.at.slice(0, 10))) : '') + ' · dziś ' + a.dzis + ' z ' + a.limit + ' zapytań' : 'Wyłączony: bot klienta nie ma dostępu.';
  const url = String(window.API_URL || '');
  return h + '<p class="kstat"><span class="dot' + (a.on ? ' on' : '') + '"></span><span>' + stat + '</span></p>' +
    (m.key ? '<div class="okbox" role="status"><b>Klucz dla bota ' + esc(k.name) + '</b>Pokazuję go tylko teraz. Klient wpisuje go w ustawieniach swojego bota (nie w czacie).' +
      '<div class="linkbox mono agkey" id="ag-key">' + esc(m.key) + '</div><button class="cp' + (m.cp === 'key' ? ' done' : '') + '" type="button" id="ag-cpkey">' + (m.cp === 'key' ? '✓ Skopiowano' : '⧉ Kopiuj klucz') + '</button></div>' : '') +
    '<div class="row2"><button class="cp" type="button" id="ag-new"' + dis + '>' + (m.busy === 'nowy' ? 'Tworzę…' : m.sure === 'nowy' ? 'Na pewno? Stary klucz przestanie działać' : a.has ? 'Nowy klucz' : 'Utwórz klucz i włącz') + '</button>' +
    (a.has ? '<button class="cp danger" type="button" id="ag-off"' + dis + '>' + (m.busy === 'wylacz' ? 'Wyłączam…' : m.sure === 'wylacz' ? 'Na pewno wyłączyć?' : 'Wyłącz dostęp') + '</button>' : '') + '</div>' +
    '<div class="frm">' +
    frH('Odczyt', 'Zasady, plan, historia serii, ciężar na dziś. Bez bólu i dyspozycji.', agSwH('read', d.read, 'Odczyt')) +
    frH('Zapis', 'Serie z planu i własne treningi (jak w aplikacji).', agSwH('write', d.write, 'Zapis')) +
    frH('Propozycje zmian planu', 'Zamiana, ciężar, serie, dodatkowy trening: czekają na Ciebie, plan bez zmian.', agSwH('prop', d.prop, 'Propozycje zmian planu')) +
    frH('Zapytania dziennie', 'Wszystkie akcje bota tego klienta razem.', agNumH('limit', d.limit)) + '</div>' +
    '<div class="agta"><label for="ag-ogr">Ograniczenia tego klienta (jego część sekcji 5)</label><textarea id="ag-ogr" rows="4"' + dis + '>' + esc(d.ogr) + '</textarea></div>' +
    '<p class="legend">To dane o zdrowiu: widzi je tylko bot tego klienta, zostają w arkuszu.</p>' +
    '<div class="row2" style="margin-top:10px"><button class="b p" type="button" id="ag-save"' + (ch && !m.busy ? '' : ' disabled') + '>' + (m.busy === 'save' ? 'Zapisuję…' : 'Zapisz') + '</button>' +
    (m.ok ? '<span class="saved" role="status">' + esc(m.ok) + '</span>' : '') + '</div>' + (m.err ? '<p class="err" role="alert">' + esc(m.err) + '</p>' : '') +
    '<div class="sec" style="border:0">Dla bota</div><div class="row2"><button class="cp' + (m.cp === 'ins' ? ' done' : '') + '" type="button" id="ag-ins">' + (m.cp === 'ins' ? '✓ Skopiowano' : '⧉ Kopiuj instrukcję dla bota') + '</button>' +
    '<a class="cp" ' + klLink + ' id="ag-oapi" download="sila-z-ruchu-api.json" href="data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(TL.agOpenApi(url), null, 2)) + '">⇩ Opis API (OpenAPI)</a></div>' +
    '<p class="legend">Klucz idzie w adresie (?api=…), bo skrypt Google nie czyta nagłówków. Wystarczy to botom pisanym samodzielnie i automatyzacjom (Make, n8n). ChatGPT i Claude jako „narzędzie” dojdą w następnym kroku.</p>' +
    (a.dziennik && a.dziennik.length ? '<div class="sec" style="border:0">Ostatnie zapytania</div><ul class="aglog">' + a.dziennik.map(l => '<li><span class="mono">' + esc(mailAt(l.at)) + '</span> <b>' + esc(l.fn) + '</b> ' +
      (l.ok ? '<span class="saved">ok</span>' : '<span class="err">odmowa</span>' + (l.why ? ' · ' + esc(l.why) : '')) + '</li>').join('') + '</ul>' : '') + '</div>';
}
function agentBind(k, re){
  const id = k.id, set = x => { AGM = Object.assign({ id, busy: '', ok: '', err: '', sure: '', key: AGM.id === id ? AGM.key : '', cp: '' }, x); re(); };
  if (!AGS[id]) { if (AGM.id !== id || !AGM.busy) { AGM = { id, busy: 'load', ok: '', err: '', sure: '', key: '', cp: '' };
    guard(api('trAgent', id)).then(r => { AGS[id] = r; AGM.busy = ''; re(); }).catch(e => { AGM.busy = ''; AGM.err = e.auth ? '' : e.message; re(); }); } return; }
  const d = AGD[id];
  agCtl(d, () => { AGM.ok = ''; re(); });
  const t = $('#ag-ogr'); if (t) t.oninput = () => { d.ogr = t.value; const b = $('#ag-save'); if (b && !AGM.busy) b.disabled = !AG_F.some(f => d[f] !== AGS[id][f]); };
  const key = async mode => {
    if ((mode === 'wylacz' || AGS[id].has) && !(AGM.id === id && AGM.sure === mode)) return set({ sure: mode });   // drugie dotknięcie
    set({ busy: mode, key: '' });
    try { const r = await guard(api('trAgentKlucz', id, mode)); AGS[id] = r; delete AGD[id];
      set({ key: r.key || '', ok: mode === 'wylacz' ? 'Dostęp wyłączony. Bot klienta dostaje teraz „Brak dostępu”.' : '' }); }
    catch (e) { set({ err: e.auth ? '' : e.message }); }
  };
  const nb = $('#ag-new'); if (nb) nb.onclick = () => key('nowy');
  const ob = $('#ag-off'); if (ob) ob.onclick = () => key('wylacz');
  const ck = $('#ag-cpkey'); if (ck) ck.onclick = async () => { if (await copyTxt(AGM.key)) { AGM.cp = 'key'; re(); } };
  const ci = $('#ag-ins'); if (ci) ci.onclick = async () => { if (await copyTxt(TL.agInstrukcja(String(window.API_URL || ''), k.name))) { AGM = Object.assign({}, AGM, { id, cp: 'ins' }); re(); } };
  const sv = $('#ag-save'); if (sv) sv.onclick = async () => {
    set({ busy: 'save' });
    try { AGS[id] = await guard(api('trAgentUstaw', id, d)); delete AGD[id]; set({ ok: '✓ Zapisano.' }); }
    catch (e) { set({ err: e.auth ? '' : e.message }); }
  };
}
/* czat „Wypróbuj asystenta” (trAsystent, apps-script/Agent.gs): trener pisze jako klient; rozmowa tylko w pamięci strony */
let ACH = { id: '', msgs: [], busy: false, err: '', real: false, draft: '', cost: 0 };
function agChatCard(k){
  const c = ACH.id === k.id ? ACH : { msgs: [], busy: false, err: '', real: false, draft: '', cost: 0 }, dis = c.busy ? ' disabled' : '';
  const steps = st => st && st.length ? '<ul class="acst">' + st.map(x => '<li class="' + (x.ok ? 'ok' : 'no') + '"><span class="mono">' + esc(x.fn) + '</span>' + (x.args ? ' <small>' + esc(x.args) + '</small>' : '') +
    (x.ok ? ' ✓' : ' ✕ ' + esc(x.info)) + '</li>').join('') + '</ul>' : '';
  const bub = m => '<div class="acm ' + (m.role === 'user' ? 'u' : 'a') + '"><div class="acb">' + esc(m.text).replace(/\n/g, '<br>') + '</div>' + steps(m.steps) + (m.cost ? '<small class="acx">ok. ' + esc(pl(Math.round(m.cost * 1000) / 1000)) + ' USD</small>' : '') + '</div>';
  const open = c.open || c.msgs.length || c.busy || c.draft;   // zwinięty do jednej linii, dopóki trener go nie otworzy (sprawdzenie po zmianie zasad)
  return '<details class="card achd" id="agchat"' + (open ? ' open' : '') + '><summary><h2>Wypróbuj asystenta</h2><span class="muted">po zmianie zasad</span></summary>' +
    '<p class="legend" style="margin-top:0;font-size:13px;line-height:1.5">Piszesz jako ' + esc(k.name) + '. Asystent widzi plan, historię, Twoje zasady i ograniczenia tego klienta, tak jak bot klienta. Płacisz z klucza Claude API panelu (Ustawienia).</p>' +
    frH('Zapisuj naprawdę', c.real ? 'Serie, treningi, propozycje i zgłoszenia trafiają do arkusza.' : 'Wyłączone: serwer sprawdza zapisy regułami, ale nic nie zapisuje.',
      '<button class="sw" type="button" role="switch" id="ach-real" aria-label="Zapisuj naprawdę" aria-checked="' + !!c.real + '"' + dis + '></button>') +
    '<div class="acl" id="ach-list" aria-live="polite">' + (c.msgs.length ? c.msgs.map(bub).join('') : '<p class="muted">Napisz np. „Co mam dziś?”, „Zrobiłem 3×5 po 100 kg, ciężko” albo „Boli mnie kolano”.</p>') +
    (c.busy ? '<p class="muted acw">Asystent myśli…</p>' : '') + '</div>' +
    (c.err ? '<p class="err" role="alert">' + esc(c.err) + '</p>' : '') +
    '<div class="agta"><label for="ach-in">Wiadomość od klienta</label><textarea id="ach-in" rows="3"' + dis + '>' + esc(c.draft) + '</textarea></div>' +
    '<div class="row2" style="margin-top:10px"><button class="b p" type="button" id="ach-go"' + (c.busy || !c.draft.trim() ? ' disabled' : '') + '>Wyślij</button>' +
    (c.msgs.length ? '<button class="cp" type="button" id="ach-clr"' + dis + '>Nowa rozmowa</button>' : '') +
    (c.cost ? '<span class="legend">Koszt rozmowy ok. ' + esc(pl(Math.round(c.cost * 100) / 100)) + ' USD</span>' : '') + '</div></details>';
}
function agChatBind(k, re){
  const id = k.id;
  if (ACH.id !== id) ACH = { id, msgs: [], busy: false, err: '', real: false, draft: '', cost: 0 };
  const dt = $('#agchat'); if (dt) dt.ontoggle = () => { ACH.open = dt.open; };
  const l = $('#ach-list'); if (l) l.scrollTop = l.scrollHeight;
  const t = $('#ach-in'); if (t) t.oninput = () => { ACH.draft = t.value; const b = $('#ach-go'); if (b) b.disabled = ACH.busy || !t.value.trim(); };
  const rl = $('#ach-real'); if (rl) rl.onclick = () => { ACH.real = !ACH.real; re(); };
  const cl = $('#ach-clr'); if (cl) cl.onclick = () => { ACH = { id, msgs: [], busy: false, err: '', real: ACH.real, draft: '', cost: 0, open: true }; re(); };
  const go = $('#ach-go'); if (go) go.onclick = async () => {
    const txt = ACH.draft.trim(); if (!txt || ACH.busy) return;
    ACH.msgs.push({ role: 'user', text: txt }); ACH.draft = ''; ACH.busy = true; ACH.err = ''; re();
    try {
      const r = await guard(api('trAsystent', id, ACH.msgs.map(m => ({ role: m.role, text: m.text, steps: m.steps })), { real: ACH.real }));
      if (ACH.id !== id) return;
      ACH.msgs.push({ role: 'assistant', text: r.text, steps: r.steps || [], cost: Number(r.cost) || 0 }); ACH.cost += Number(r.cost) || 0;
    } catch (e) { if (ACH.id !== id) return; ACH.msgs.pop(); ACH.draft = txt; ACH.err = e.auth ? '' : e.message; }
    ACH.busy = false; re();
  };
}
let DY = null, DYM = { busy: false, ok: '', err: '' };   // miejsce na Dysku i kopie arkusza (trDysk, trKopia; apps-script/Kopia.gs)
const gb = b => pl(Math.round(b / 1024 / 1024 / 102.4) / 10);
function dyskCard(){
  const d = DY || {}, s = d.dysk, k = d.kopie || [];
  const pct = s && s.limit ? Math.min(100, Math.round(s.used / s.limit * 100)) : 0;
  const space = !s ? '<p class="mstat">Google nie podał miejsca na Dysku.</p>' : !s.limit ? '<p class="mstat">Zajęte ' + gb(s.used) + ' GB, Dysk bez limitu.</p>'
    : '<div class="fr"><div><b>Miejsce na Dysku</b><small>Zajęte ' + gb(s.used) + ' z ' + gb(s.limit) + ' GB · wolne ' + gb(s.free) + ' GB</small></div></div>' +
      '<div class="dbar' + (s.low ? ' low' : '') + '" role="progressbar" aria-label="Zajęte miejsce na Dysku" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      (s.low ? '<p class="err">Zostało mniej niż 2 GB. Gdy Dysk się zapełni, filmy klientów i kopie przestaną się zapisywać: usuń stare filmy albo dokup miejsce.</p>' : '');
  const last = k[0] ? dm(k[0].at.slice(0, 10)) : '';
  return '<div class="card" id="dysk-card" style="max-width:640px"><h2>Dysk i kopie arkusza</h2>' + space +
    '<div class="fr"><div><b>Kopia arkusza</b><small>' + (k.length ? 'Ostatnia ' + esc(last) + ' · ' + k.length + ' z ' + (d.ile || 8) + ' kopii w „Trening – Klienci/_kopie”' : 'Jeszcze nie ma kopii.') +
    (d.trigger === false ? ' · cotygodniowa kopia wyłączona' : ' · co niedzielę ok. 3:00') + '</small></div>' +
    '<button class="b" type="button" id="kopia-go"' + (DYM.busy ? ' disabled' : '') + '>' + (DYM.busy ? 'Kopiuję…' : 'Zrób kopię teraz') + '</button></div>' +
    (DYM.ok ? '<p class="saved" role="status">' + esc(DYM.ok) + '</p>' : '') + (DYM.err ? '<p class="err" role="alert">' + esc(DYM.err) + '</p>' : '') +
    '<p class="legend">Kopia to cały arkusz z jednego dnia. Starsze niż ' + (d.ile || 8) + ' ostatnich idą do kosza Dysku. Filmy nie są kopiowane, bo już leżą na Dysku. Klient nie wyśle filmu większego niż 1 GB ani pliku, który nie jest filmem.</p></div>';
}
function mailCard(){   // panel → Ustawienia: godzina porannego maila (trMailUstaw) i wynik ostatniej wysyłki
  const m = MS || { hour: 6, hours: [5, 6, 7, 8, 9] }, d = m.day;
  const names = d && d.names && d.names.length ? d.names.join(', ') : '';
  const stat = !d ? 'Jeszcze nic nie wysłano.' : (d.day === (PUL && PUL.today) ? 'Dziś' : dm(d.day)) + ' o ' + esc(mailAt(d.at).split(', ')[1] || '') + ': ' +
    (names ? 'wysłano ' + d.names.length + ' ' + (d.names.length === 1 ? 'mail' : d.names.length < 5 ? 'maile' : 'maili') + ' (' + esc(names) + ').' : 'nikt nie miał treningu z datą, nic nie wysłano.');
  return '<div class="card" id="mail-card" style="max-width:640px"><h2>Poranny mail do klientów</h2>' +
    '<p class="legend" style="margin-top:0;font-size:13px;line-height:1.5">Klient dostaje rano plan dnia i przycisk do aplikacji. Włączasz go osobno dla każdego klienta w <a href="#klienci">Klienci</a> → Ustawienia.</p>' +
    '<div class="fr"><div><b>Godzina</b><small>Google uruchamia wysyłkę w ciągu kwadransa od tej godziny.</small></div><div class="seg" role="group">' +
    m.hours.map(h => '<button type="button" data-hour="' + h + '" aria-pressed="' + (h === m.hour) + '"' + (MH.busy ? ' disabled' : '') + '>' + h + ':00</button>').join('') + '</div></div>' +
    (MH.ok ? '<p class="saved" role="status">' + esc(MH.ok) + '</p>' : '') + (MH.err ? '<p class="err" role="alert">' + esc(MH.err) + '</p>' : '') +
    (m.trigger === false ? '<p class="err">Wysyłka nie jest włączona: wybierz godzinę albo w arkuszu uruchom menu Trening → Ustawienia (raz) → Zainstaluj albo napraw wyzwalacze.</p>' : '') +
    '<div class="mstat">' + stat + (m.quota !== null && m.quota !== undefined ? ' Zostało dziś w limicie Google: ' + m.quota + ' adresów.' : '') + '</div></div>';
}

/* ---------- klienci: lista, ustawienia (trKlientUstaw), nowy klient (trKlientNowy), nowy link (trKlientLink) ----------
 * Flagi z zakładki Klienci w jednym miejscu (menu „Dodaj klienta” w arkuszu nie działa na telefonie). Usuwania nie ma: „Aktywny” wyłączony
 * zostawia historię. Lista i szkice ustawień żyją tylko w pamięci strony. */
let KL = null, KLD = {}, KLM = { ok: '', err: '', busy: false, rekey: '' }, KLC = '', NK = null;
let MS = null, MT = { id: '', busy: false, ok: '', err: '' };   // poranny mail: ustawienia (trMail) i mail próbny (trMailProba)
const mailAt = iso => { const d = new Date(iso); return isNaN(d) ? '' : DOW[d.getDay()] + ' ' + d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0') + ', ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
const mailHour = () => MS ? MS.hour : 6;
const slug = s => String(s || '').replace(/[łŁ]/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const KL_F = ['on', 'mode', 'scale', 'swap', 'pain', 'masters', 'extra', 'oly', 'own', 'edit', 'email', 'mail', 'mailKom', 'body'];
const klLink = 'style="display:inline-flex;align-items:center;text-decoration:none"';
const klFlags = k => [k.mode === 'PROSTY' ? 'Prosty' : 'PRO', k.mode === 'PRO' && k.scale === 'RIR' ? 'RIR' : '', k.swap === 'DOWOLNA' ? 'zamiana dowolna' : k.swap === 'TRENER' ? 'zamiana od trenera' : '',
  k.edit ? 'zmiany w treningu' : '', k.masters ? 'masters' : '', k.pain ? 'ból zawsze' : '', k.extra ? '+' + k.extra + (k.extra === 1 ? ' seria' : ' serie') : '', k.own ? '' : 'bez własnych',
  k.oly !== 5 ? 'sufit ' + pl(k.oly) + '%' : '', k.mail ? 'mail rano' : '', k.mailKom ? 'mail po komentarzu' : '', k.body ? 'pomiary ciała' : ''].filter(Boolean).join(' · ');
/** „ostatnio otwarta” (Klienci U/V, punkt 13 przeglądu v80): kiedy klient otworzył aplikację i na ilu telefonach (60 dni); 3+ = uwaga */
function seenTxt(k){
  if (!k.seen) return '<span class="muted">aplikacja: brak danych o otwarciu</span>';
  const m = Math.max(0, Math.round((Date.now() - Date.parse(k.seen)) / 60000)), ago = m < 2 ? 'przed chwilą' : m < 60 ? m + ' min temu' : m < 1440 ? Math.round(m / 60) + ' h temu' : Math.round(m / 1440) === 1 ? 'wczoraj' : Math.round(m / 1440) + ' dni temu';
  const d = k.devs || 0, dev = d ? d + ' ' + plN(d, 'telefon', 'telefony', 'telefonów') : '';
  return 'otwarta ' + ago + (dev ? ' · ' + (d >= 3 ? '<b class="warn" title="Ten sam link na 3 lub więcej telefonach w 60 dni: może poszedł dalej? „Wygeneruj nowy link” w ustawieniach klienta.">⚠ ' + dev + '</b>' : dev) : '');
}
// lista klientów: każde ustawienie osobno (na telefonie jako „pigułki”), kropki tylko na komputerze
const klFlagsH = k => (k.on ? [] : ['<b>nieaktywny</b>']).concat(klFlags(k).split(' · ').map(esc)).map(t => '<span class="fl">' + t + '</span>').join('<span class="sp"> · </span>');
async function copyTxt(t){
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
  const a = document.createElement('textarea'); a.value = t; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} a.remove(); return ok;
}
const cpBtn = (k, cls) => k.link ? '<button class="cp' + (KLC === k.id ? ' done' : '') + (cls || '') + '" type="button" data-copy="' + esc(k.id) + '">' + (KLC === k.id ? '✓ Skopiowano' : '⧉ Kopiuj link') + '</button>' +
  (navigator.share ? '<button class="cp" type="button" data-share="' + esc(k.id) + '">↗ Wyślij…</button>' : '') : '';
function klBind(){
  document.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
    const k = KL.find(x => x.id === b.dataset.copy); if (!k) return;
    if (await copyTxt(k.link)) { KLC = k.id; renderKlienci(curSub()); setTimeout(() => { if (KLC === k.id) { KLC = ''; if (location.hash.startsWith('#klienci')) renderKlienci(curSub()); } }, 2500); }
    else alertBox(new Error('Nie udało się skopiować. Zaznacz link i skopiuj ręcznie: ' + k.link));
  });
  document.querySelectorAll('[data-share]').forEach(b => b.onclick = () => {
    const k = KL.find(x => x.id === b.dataset.share); if (!k) return;
    navigator.share({ title: 'Siła z Ruchu', text: 'Twój link do aplikacji treningowej:', url: k.link }).catch(() => {});
  });
}
const curSub = () => decodeURIComponent((location.hash.split('/')[1]) || '');
async function renderKlienci(sub){
  if (!KL) { $('#main').innerHTML = head('Panel trenera', 'Klienci') + '<div class="pg"><div class="es">Ładowanie…</div></div>';
    try { KL = await guard(api('trKlienci')); } catch (e) { if (!e.auth) $('#main').innerHTML = head('Panel trenera', 'Klienci') + errBox(e); return; }
    if (!location.hash.startsWith('#klienci')) return; }
  if (sub === 'nowy') return renderNowyKlient();
  if (sub) return renderKlientUst(sub);
  const gone = KLM.gone ? KLM.ok : '';                                 // komunikat po usunięciu danych klienta (RODO)
  NK = null; KLD = {}; KLM = { ok: '', err: '', busy: false, rekey: '' };
  const on = KL.filter(k => k.on).length, off = KL.length - on;
  const rows = KL.slice().sort((a, b) => (b.on - a.on) || a.name.localeCompare(b.name, 'pl')).map(k => {
    const c = PUL.clients.find(x => x.id === k.id);
    return '<tr class="' + (k.on ? '' : 'off') + '"><td><a class="who" href="' + (k.on ? kHref(k.id) : '#klienci/' + encodeURIComponent(k.id)) + '"><span class="dot ' + (k.on ? 'lv-ok' : '') + '"></span>' + esc(k.name) + '</a><div class="flags mono">' + esc(k.id) + '</div>' + (k.on ? '<div class="seen">' + seenTxt(k) + '</div>' : '') +
      (k.on ? '<div class="km">Ostatni trening: <b>' + (c ? agoTxt(c) : '–') + '</b>' + (c && c.planLeft !== null ? ' · plan ' + (c.planLeft < 0 ? '<b>skończony</b>' : 'jeszcze <b>' + c.planLeft + ' ' + plN(c.planLeft, 'dzień', 'dni', 'dni') + '</b>') : '') + '</div>' : '') + '</td>' +
      '<td class="flags">' + klFlagsH(k) + '</td>' +
      '<td class="nw hide-m">' + (c ? agoTxt(c) : '–') + '</td><td class="nw hide-m">' + (!c || c.planLeft === null ? '–' : c.planLeft < 0 ? 'skończony' : 'za ' + c.planLeft + ' dni') + '</td>' +
      '<td class="nw"><span class="lk">' + (k.on ? cpBtn(k) : '') + '<a class="cp" href="#klienci/' + encodeURIComponent(k.id) + '">Ustawienia ›</a></span></td></tr>';
  }).join('');
  $('#main').innerHTML = head(on + ' ' + (on === 1 ? 'aktywny' : 'aktywnych') + (off ? ' · ' + off + ' ' + (off === 1 ? 'nieaktywny' : 'nieaktywnych') : ''), 'Klienci', '<a class="b p" ' + klLink + ' href="#klienci/nowy">+ Nowy klient</a>') +
    '<div class="pg">' + (gone ? '<div class="card"><p class="saved" role="status" id="kl-gone" style="margin:0">' + esc(gone) + '</p></div>' : '') + '<div class="card">' + (rows ? '<div class="tw"><table class="kl"><thead><tr><th>Klient</th><th>Ustawienia</th><th class="hide-m">Ostatni trening</th><th class="hide-m">Koniec planu</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="legend">Imię otwiera kartę klienta (plan, sesje, bloki). „Kopiuj link” kopiuje link do aplikacji tej osoby, gotowy do wklejenia w SMS albo WhatsApp. Nieaktywny klient nie wejdzie do aplikacji, ale jego dane zostają.</p>'
      : '<div class="es"><b>Nie ma jeszcze klientów</b>Dodaj pierwszego przyciskiem „+ Nowy klient”.</div>') + '</div></div>';
  klBind();
}
const segH = (f, opts, v) => '<div class="seg" role="group">' + opts.map(([k, t]) => '<button type="button" data-seg="' + f + '" data-val="' + k + '" aria-pressed="' + (k === v) + '">' + t + '</button>').join('') + '</div>';
const swH = (f, v, lbl) => '<button type="button" class="sw" role="switch" data-sw="' + f + '" aria-checked="' + !!v + '" aria-label="' + esc(lbl) + '"></button>';
const numH = (f, v, mn, mx, st, u) => '<div class="num"><button type="button" data-num="' + f + '" data-d="-' + st + '"' + (v <= mn ? ' disabled' : '') + ' aria-label="mniej">−</button><output>' + pl(v) + (u || '') + '</output><button type="button" data-num="' + f + '" data-d="' + st + '"' + (v >= mx ? ' disabled' : '') + ' aria-label="więcej">+</button></div>';
const frH = (t, d, ctl) => '<div class="fr"><div><b>' + t + '</b><small>' + d + '</small></div>' + ctl + '</div>';
const KL_LIM = { extra: [0, 5, 1], oly: [0, 20, 2.5] };
function klCtl(st, re){   // przełączniki formularza zmieniają stan st i rysują stronę od nowa
  document.querySelectorAll('[data-seg]').forEach(b => b.onclick = () => { st[b.dataset.seg] = b.dataset.val; re(); });
  document.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => { st[b.dataset.sw] = !st[b.dataset.sw]; re(); });
  document.querySelectorAll('[data-num]').forEach(b => b.onclick = () => { const f = b.dataset.num, l = KL_LIM[f]; st[f] = Math.min(l[1], Math.max(l[0], Math.round((st[f] + Number(b.dataset.d)) * 10) / 10)); re(); });
}
function mailTestH(k, ch){   // „Wyślij próbny do mnie” (zapisany adres, bez niezapisanych zmian) + ostatnia wysyłka
  const t = MT.id === k.id ? MT : { busy: false, ok: '', err: '' }, last = MS && MS.log && MS.log[k.id];
  const why = ch ? 'Zapisz zmiany, potem wyślij próbę.' : !k.email ? 'Najpierw wpisz e-mail klienta i zapisz.' : 'Najbliższy trening ' + esc(k.name) + ' przyjdzie na Twój adres, klient nic nie dostanie.';
  return '<div class="fr fr1"><div class="mrow"><button class="cp" type="button" id="kl-mailtest"' + (!k.email || ch || t.busy ? ' disabled' : '') + '>' + (t.busy ? 'Wysyłam…' : '✉ Wyślij próbny do mnie') + '</button>' +
    (t.ok ? '<span class="saved" role="status">' + esc(t.ok) + '</span>' : '<span class="hint">' + why + '</span>') + '</div>' +
    (t.err ? '<p class="err" role="alert">' + esc(t.err) + '</p>' : '') +
    (last ? '<div class="mstat">Ostatnio wysłany: <b>' + esc(mailAt(last.at)) + (last.title ? ' (' + esc(last.title) + ')' : '') + '</b></div>' : '') + '</div>';
}
function renderKlientUst(id){
  const k = KL.find(x => x.id === id);
  if (!k) { $('#main').innerHTML = head('Klienci', 'Nie ma klienta') + '<div class="pg"><div class="card es"><b>Nie ma klienta „' + esc(id) + '”</b><a href="#klienci">Wróć do listy</a></div></div>'; return; }
  const d = KLD[id] = KLD[id] || Object.assign({}, k), m = KLM, ch = KL_F.filter(f => d[f] !== k[f]).length, dis = m.busy ? ' disabled' : '';
  const f = '<div class="frm">' +
    frH('Aktywny', 'Wyłączony nie wejdzie do aplikacji. Dane i historia zostają.', swH('on', d.on, 'Aktywny')) +
    '<div class="sec">Wygląd aplikacji</div>' +
    frH('Tryb', 'Prosty: słowa i duże przyciski, bez % i prędkości. PRO: liczby RPE, % i VBT.', segH('mode', [['PROSTY', 'Prosty'], ['PRO', 'PRO']], d.mode)) +
    frH('Skala wysiłku', 'Tylko widok w PRO. Arkusz zawsze zapisuje RPE.', segH('scale', [['RPE', 'RPE'], ['RIR', 'RIR']], d.scale)) +
    frH('Ból zawsze widoczny', 'Pytanie o ból przy każdym podsumowaniu treningu.', swH('pain', d.pain, 'Ból zawsze widoczny')) +
    frH('Pomiary ciała', 'Postęp → Ciało: masa i obwody (talia, biodra, klatka, ramię, udo) raz w tygodniu, z wykresem. Dla klientów sylwetkowych; widzisz je w karcie klienta.', swH('body', d.body, 'Pomiary ciała')) +
    '<div class="sec">Co klient może zmieniać</div>' +
    frH('Zamiana ćwiczenia', 'Od trenera: tylko zamienniki z planu i bazy. Dowolna: cała baza i własna nazwa.', segH('swap', [['NIE', 'Nie'], ['TRENER', 'Od trenera'], ['DOWOLNA', 'Dowolna']], d.swap)) +
    frH('Zmiany w treningu trenera', 'Dodanie i usunięcie ćwiczenia w Twojej jednostce, też na stałe.', swH('edit', d.edit, 'Zmiany w treningu trenera')) +
    frH('Własne treningi', 'Kreator własnego treningu poza planem.', swH('own', d.own, 'Własne treningi')) +
    frH('Dodatkowe serie', 'Ile serii ponad plan klient może dodać w ćwiczeniu (gdy plan nie mówi inaczej).', numH('extra', d.extra, 0, 5, 1)) +
    '<div class="sec">Obciążenie</div>' +
    frH('Masters', 'Ostrzejsze progi „za dużo / uwaga” w podsumowaniu.', swH('masters', d.masters, 'Masters')) +
    frH('Sufit w bojach', 'O ile ponad plan (w % maksa) klient może pójść w rwaniu i podrzucie.', numH('oly', d.oly, 0, 20, 2.5, '%')) +
    '<div class="sec">Maile do klienta</div>' +
    '<div class="fr fr1"><div><b>E-mail klienta</b><small>Tylko do maili z aplikacji (poranny, po komentarzu). Zostaje w arkuszu (zakładka Klienci), nie w aplikacji.</small></div>' +
    '<input class="inp" id="kl-email" type="email" autocomplete="off" spellcheck="false" placeholder="adres@przyklad.pl" value="' + esc(d.email || '') + '"' + dis + '></div>' +
    frH('Mail w dniu treningu', 'Ok. ' + mailHour() + ':00, gdy plan ma na dziś trening z datą, a klient go jeszcze nie zaczął. Bez daty w planie, w dni wolne i przy własnych treningach mail nie idzie.', swH('mail', d.mail, 'Mail w dniu treningu')) +
    mailTestH(k, ch) +
    frH('Mail po komentarzu', 'Ok. 20:00, gdy tego dnia skomentowałeś jego trening (sesja, ćwiczenie, film): pierwsze zdanie i przycisk do zakładki Trener. Najwyżej jeden dziennie.', swH('mailKom', d.mailKom, 'Mail po komentarzu')) + '</div>' +
    '<div class="row2" style="margin-top:14px"><button class="b p" type="button" id="kl-save"' + (ch && !m.busy ? '' : ' disabled') + '>' + (m.busy === 'save' ? 'Zapisuję…' : 'Zapisz zmiany') + '</button>' +
    (ch ? '<button class="b" type="button" id="kl-undo"' + dis + '>Cofnij</button><span class="hint">Zmienione: ' + ch + '</span>' : m.ok ? '<span class="saved" role="status">' + esc(m.ok) + '</span>' : '') + '</div>' +
    (m.err ? '<p class="err" role="alert">' + esc(m.err) + '</p>' : '');
  const side = '<div class="card"><h2>Link do aplikacji</h2>' + (k.link ? '<div class="linkbox mono" id="kl-link">' + esc(k.link) + '</div><div class="row2">' + cpBtn(k) + '</div>' +
      '<p class="mstat" id="kl-seen">' + seenTxt(k) + '</p>' +
      '<p class="legend">„Wyślij…” (na telefonie) otwiera SMS, WhatsApp albo mail. Na iPhonie klient po dodaniu aplikacji do ekranu głównego wkleja ten link jeszcze raz.</p>'
      : '<p class="muted">Brak adresu aplikacji: ustaw właściwość skryptu PWA_URL.</p>') +
    '<div class="sec" style="border:0">Nowy link</div><p class="legend" style="font-size:13px">Gdy link trafił do niewłaściwej osoby. Stary link przestaje działać, a klient musi dostać nowy. Treningi i historia zostają.</p>' +
    '<button class="cp danger" type="button" id="kl-rekey"' + dis + '>' + (m.busy === 'rekey' ? 'Generuję…' : m.rekey === id ? 'Na pewno? Stary link przestanie działać' : 'Wygeneruj nowy link') + '</button></div>' +
    '<div class="card"><h2>W planach JSON</h2><p class="legend" style="font-size:13px;margin-top:0">„klient”: <span class="mono">"' + esc(k.id) + '"</span></p></div>' + importCard(k) + agentCard(k) + agChatCard(k) + rodoCard(k);
  $('#main').innerHTML = head('<a href="#klienci" style="color:inherit">Klienci</a> › ustawienia', k.name, '<a class="b" ' + klLink + ' href="#k/' + encodeURIComponent(id) + '">Karta klienta ›</a>') +
    '<div class="pg"><div class="kgrid"><div class="card" id="kl-form">' + f + '</div><div class="stack">' + side + '</div></div></div>';
  const re = () => { KLM = { ok: '', err: '', busy: false, rekey: '' }; renderKlientUst(id); };
  klCtl(d, re); klBind(); importBind(k, () => { if (location.hash === '#klienci/' + encodeURIComponent(id)) renderKlientUst(id); });
  const agRe = () => { const el = document.getElementById('agent'); if (!el || location.hash !== '#klienci/' + encodeURIComponent(id)) return;   // tylko ta karta: formularz klienta obok zostaje
    el.outerHTML = agentCard(k); agentBind(k, agRe); };
  agentBind(k, agRe);
  const achRe = () => { const el = document.getElementById('agchat'); if (!el || location.hash !== '#klienci/' + encodeURIComponent(id)) return;
    el.outerHTML = agChatCard(k); agChatBind(k, achRe); };
  agChatBind(k, achRe);
  const em = $('#kl-email');
  if (em) em.oninput = () => { d.email = em.value.trim(); const n = KL_F.filter(f => d[f] !== k[f]).length, sv = $('#kl-save'); if (sv && !KLM.busy) sv.disabled = !n; };
  const mt = $('#kl-mailtest');
  if (mt) mt.onclick = async () => {
    MT = { id, busy: true, ok: '', err: '' }; renderKlientUst(id);
    try { const r = await guard(api('trMailProba', id)); MT = { id, busy: false, ok: '✓ Wysłano do Ciebie: ' + r.title + ' (' + dm(r.day) + ').', err: '' }; }
    catch (e) { MT = { id, busy: false, ok: '', err: e.auth ? '' : e.message }; }
    if (location.hash.startsWith('#klienci/')) renderKlientUst(id);
  };
  if (!MS) guard(api('trMail')).then(r => { MS = r; if (location.hash === '#klienci/' + encodeURIComponent(id)) renderKlientUst(id); }).catch(() => {});
  const u = $('#kl-undo'); if (u) u.onclick = () => { KLD[id] = Object.assign({}, k); re(); };
  $('#kl-save').onclick = async () => {
    KLM = { ok: '', err: '', busy: 'save', rekey: '' }; renderKlientUst(id);
    try { const r = await guard(api('trKlientUstaw', id, d)); KL[KL.indexOf(k)] = r; KLD[id] = Object.assign({}, r); delete CK[id];
      KLM = { ok: '✓ Zapisano. Klient zobaczy zmiany przy następnym otwarciu aplikacji.', err: '', busy: false, rekey: '' }; }
    catch (e) { KLM = { ok: '', err: e.auth ? '' : e.message, busy: false, rekey: '' }; }
    if (location.hash.startsWith('#klienci/')) renderKlientUst(id);
  };
  rodoBind(k);
  $('#kl-rekey').onclick = async () => {
    if (KLM.rekey !== id) { KLM = { ok: '', err: '', busy: false, rekey: id }; renderKlientUst(id); return; }
    KLM = { ok: '', err: '', busy: 'rekey', rekey: '' }; renderKlientUst(id);
    try { const r = await guard(api('trKlientLink', id)); KL[KL.findIndex(x => x.id === id)] = r; KLC = '';
      KLM = { ok: 'Nowy link gotowy. Stary już nie działa: wyślij klientowi ten z prawej.', err: '', busy: false, rekey: '' }; }
    catch (e) { KLM = { ok: '', err: e.auth ? '' : e.message, busy: false, rekey: '' }; }
    if (location.hash.startsWith('#klienci/')) renderKlientUst(id);
  };
}
/* ---------- historia z innej aplikacji: plik CSV czytany w przeglądarce (lib importParse / importPick), dopasowanie do bazy i zapis w skrypcie (trImport) ---------- */
let HV = null;                                   // {id, file, text, P, from, lbs, withTaken, srv, busy, err, ok, sure}; tylko w pamięci strony
const HV_FROM = [['all', 'Cała historia'], ['12', '12 mies.'], ['6', '6 mies.']];
const dmy = d => d ? dm(d) + '.' + d.slice(0, 4) : '';
const hvFrom = f => { if (f === 'all') return ''; const d = new Date(); d.setMonth(d.getMonth() - Number(f)); return d.toISOString().slice(0, 10); };
const hvN = n => n + ' ' + plN(n, 'trening', 'treningi', 'treningów');
const hvPick = h => TL.importPick(h.P, { from: hvFrom(h.from || '12'), taken: new Set((h.srv && h.srv.taken) || []), withTaken: h.withTaken });
const HV_TPL = 'data:text/csv;charset=utf-8,' + encodeURIComponent('﻿' + TL.IMPORT_TEMPLATE);
function importCard(k){
  const h = HV && HV.id === k.id ? HV : { id: k.id }, srv = h.srv || {}, prev = srv.prev, pick = h.P && !h.P.error ? hvPick(h) : null;
  const top = '<div class="card hv" id="import"><h2>Historia z innej aplikacji</h2>';
  const prevH = prev ? '<div class="hvprev"><span>' + esc(prev.src || 'Import') + ' w aplikacji: <b>' + hvN(prev.n) + '</b>, ' + dmy(prev.first) + ' – ' + dmy(prev.last) + '</span>' +
    '<button class="cp danger" type="button" id="hv-undo"' + (h.busy ? ' disabled' : '') + '>' + (h.busy === 'undo' ? 'Usuwam…' : h.sure === 'undo' ? 'Na pewno? Usuń wczytaną historię' : 'Cofnij import') + '</button></div>' : '';
  const msg = (h.ok ? '<div class="okbox" role="status">' + h.ok + '</div>' : '') + (h.err ? '<p class="err" role="alert">' + esc(h.err) + '</p>' : '');
  if (!pick) return top + msg + prevH + '<p class="legend" style="font-size:13px;margin-top:0">' + esc(k.name) + ' eksportuje treningi i wysyła Ci plik CSV. Przed zapisem zobaczysz podgląd.</p>' +
    '<ul class="hvh"><li><b>Hevy:</b> Profil → ⚙ → Export &amp; Import Data → Export Workouts</li><li><b>Strong:</b> Profil → ⚙ → Export Strong Data</li>' +
    '<li><b>Inna aplikacja albo zeszyt:</b> <a href="' + HV_TPL + '" download="szablon-treningi.csv">szablon CSV</a> (jedna linia = jedna seria, otwiera się w Excelu)</li></ul>' +
    '<label class="cp hvf' + (h.busy ? ' dis' : '') + '">' + (h.busy === 'look' ? 'Czytam plik…' : '📂 Wybierz plik CSV') + '<input type="file" id="hv-file" accept=".csv,text/csv"' + (h.busy ? ' disabled' : '') + ' hidden></label></div>';
  const M = srv.match || {}, miss = pick.names.filter(([n]) => !M[n]), hit = pick.names.filter(([n]) => M[n]);
  const exRow = ([n, c], m) => '<li><span class="hvn">' + esc(n) + '</span>' + (m ? '<span class="hva">→ ' + esc(m) + '</span>' : '<span class="hva no">zostaje pod tą nazwą</span>') + '<span class="hvc">' + c + '×</span></li>';
  return top + msg +
    '<div class="hvfile"><b>' + esc(h.file) + '</b><span>Rozpoznano: ' + esc(h.P.src) + ' · ' + hvN(pick.all) + ' w pliku' + (h.P.lbs && !h.P.unitAsk ? ' · funty przeliczone na kg' : '') + '</span></div>' +
    (h.P.bad.length ? '<p class="legend" style="font-size:13px">Pominięte wiersze bez daty albo ćwiczenia: ' + h.P.bad.length + ' (np. linia ' + h.P.bad.slice(0, 3).join(', ') + ').</p>' : '') +
    (h.P.unitAsk ? '<div class="fr fr1"><div><b>Ciężar w pliku</b><small>Strong nie zapisuje jednostki. Sprawdź jedną serię: 80 kg czy 80 lb?</small></div><div class="seg">' +
      [[false, 'kg'], [true, 'funty (lb)']].map(([v, t]) => '<button type="button" data-hvlbs="' + v + '" aria-pressed="' + (!!h.lbs === v) + '">' + t + '</button>').join('') + '</div></div>' : '') +
    '<div class="fr fr1"><div><b>Od kiedy</b><small>Starsza historia też liczy się do rekordów, ale wydłuża ładowanie aplikacji klienta (ok. 0,5 MB na rok przy 3 treningach w tygodniu).</small></div>' +
      '<div class="seg">' + HV_FROM.map(([v, t]) => '<button type="button" data-hvfrom="' + v + '" aria-pressed="' + ((h.from || '12') === v) + '">' + t + '</button>').join('') + '</div></div>' +
    '<div class="hvst"><div><b>' + pick.n + '</b><span>' + plN(pick.n, 'trening', 'treningi', 'treningów') + '</span></div><div><b>' + pick.work.toLocaleString('pl-PL') + '</b><span>serii roboczych</span></div><div><b>' + pick.names.length + '</b><span>ćwiczeń</span></div></div>' +
    (pick.n ? '<p class="legend" style="font-size:13px">Od ' + dmy(pick.first) + ' do ' + dmy(pick.last) + '</p>' : '<p class="legend" style="font-size:13px">W tym okresie nie ma treningów do wczytania.</p>') +
    (pick.dup ? '<div class="fr"><div><b>' + pick.dup + ' ' + plN(pick.dup, 'dzień', 'dni', 'dni') + ' już w aplikacji</b><small>W tym dniu klient ma już trening w aplikacji, więc z pliku go pomijam, żeby nie liczyć dwa razy.</small></div>' + swH('hv-taken', !!h.withTaken, 'Wczytaj też te dni') + '</div>' : '') +
    '<div class="sec">Ćwiczenia</div>' +
    (miss.length ? '<p class="legend" style="font-size:13px;margin-top:0"><b>' + miss.length + ' bez odpowiednika w bazie.</b> Wczytają się pod nazwą z pliku. Gdy dopiszesz ją jako alias w zakładce Ćwiczenia i wczytasz plik jeszcze raz, połączy się z resztą historii.</p><ul class="hvl">' + miss.map(x => exRow(x, '')).join('') + '</ul>' : '') +
    (hit.length ? '<details class="hvd"' + (miss.length ? '' : ' open') + '><summary>Dopasowane do bazy: ' + hit.length + ' z ' + pick.names.length + '</summary><ul class="hvl">' + hit.map(x => exRow(x, M[x[0]])).join('') + '</ul></details>' : '') +
    '<p class="legend" style="font-size:13px">Każdy trening wejdzie jako własny trening klienta z RPE i notatkami. Liczy się do rekordów, wykresu Siły i objętości, nie zmienia wykonania planu.' + (prev ? ' Ponowny import zastępuje poprzedni.' : '') + '</p>' +
    '<div class="row2"><button class="b p" type="button" id="hv-go"' + (pick.n && !h.busy ? '' : ' disabled') + '>' + (h.busy === 'go' ? 'Wczytuję…' : h.sure === 'go' ? 'Na pewno? Wczytaj ' + pick.n : 'Wczytaj ' + hvN(pick.n)) + '</button>' +
    '<button class="b" type="button" id="hv-x"' + (h.busy ? ' disabled' : '') + '>Anuluj</button></div></div>';
}
function importBind(k, re){
  const set = o => { HV = Object.assign({}, HV && HV.id === k.id ? HV : { id: k.id }, o); re(); };
  const isoOf = t => t ? new Date(t).toISOString() : '';            // czas z pliku = czas lokalny trenera
  const look = async (text, file, lbs) => {
    const P = TL.importParse(text, { lbs });
    if (P.error) return set({ P: null, err: P.error, ok: '', busy: '' });
    const names = [...new Set([].concat(...P.workouts.map(w => w.ex.map(e => e.name))))], dates = [...new Set(P.workouts.map(w => w.date))];
    set({ busy: 'look', err: '', ok: '', sure: '' });
    try { const r = await guard(api('trImport', k.id, { mode: 'podglad', names, dates })); set({ file, text, P, lbs, srv: r, busy: '' }); }
    catch (e) { set({ P: null, err: e.auth ? '' : e.message, busy: '' }); }
  };
  const f = $('#hv-file');
  if (f) f.onchange = async () => { const file = f.files && f.files[0]; if (!file) return; HV = Object.assign({}, HV, { from: '12', withTaken: false }); await look(await file.text(), file.name, false); };
  document.querySelectorAll('[data-hvfrom]').forEach(b => b.onclick = () => set({ from: b.dataset.hvfrom, sure: '' }));
  document.querySelectorAll('[data-hvlbs]').forEach(b => b.onclick = () => { const P = TL.importParse(HV.text, { lbs: b.dataset.hvlbs === 'true' }); if (!P.error) set({ P, lbs: b.dataset.hvlbs === 'true', sure: '' }); });
  const tk = document.querySelector('[data-sw="hv-taken"]'); if (tk) tk.onclick = () => set({ withTaken: !HV.withTaken, sure: '' });
  const x = $('#hv-x'); if (x) x.onclick = () => set({ P: null, text: '', file: '', sure: '', err: '' });
  const go = $('#hv-go');
  if (go) go.onclick = async () => {
    if (HV.sure !== 'go') return set({ sure: 'go' });
    const pick = hvPick(HV), src = HV.P.fmt;
    set({ busy: 'go', sure: '' });
    try { const r = await guard(api('trImport', k.id, { mode: 'wczytaj', src, workouts: pick.workouts.map(w => Object.assign({}, w, { start: isoOf(w.start), end: isoOf(w.end) })) }));
      delete CK[k.id];
      set({ busy: '', P: null, text: '', srv: { prev: r.prev }, ok: '<b>✓ Wczytano ' + hvN(r.units) + ' (' + r.sets.toLocaleString('pl-PL') + ' serii).</b> ' + esc(k.name) + ' zobaczy je w Postępie i w historii ćwiczeń przy następnym otwarciu aplikacji. Podsumowania w arkuszu policzą się przy najbliższym przeliczeniu.' }); }
    catch (e) { set({ busy: '', err: e.auth ? '' : e.message }); }
  };
  const u = $('#hv-undo');
  if (u) u.onclick = async () => {
    if (HV.sure !== 'undo') return set({ sure: 'undo' });
    set({ busy: 'undo', sure: '' });
    try { const r = await guard(api('trImport', k.id, { mode: 'cofnij' })); delete CK[k.id]; set({ busy: '', srv: { prev: null }, ok: '✓ Usunięto ' + hvN(r.units) + ' z importu.' }); }
    catch (e) { set({ busy: '', err: e.auth ? '' : e.message }); }
  };
  if (!HV || HV.id !== k.id) { HV = { id: k.id, srv: {} }; guard(api('trImport', k.id, { mode: 'stan' })).then(r => { if (HV.id === k.id && !HV.P) set({ srv: Object.assign({}, HV.srv, r) }); }).catch(() => {}); }
}
/* ---------- RODO (punkt 11 przeglądu v80): pobranie i usunięcie danych klienta (apps-script/Rodo.gs); stan tylko w pamięci strony ---------- */
let RD = { id: '', busy: '', ok: '', err: '', open: false, name: '' };
function rodoCard(k){
  const r = RD.id === k.id ? RD : { busy: '', ok: '', err: '', open: false, name: '' }, match = r.name.trim().toLowerCase() === k.name.trim().toLowerCase();
  return '<div class="card" id="rodo-card"><h2>Dane klienta (RODO)</h2>' +
    '<p class="legend" style="font-size:13px;margin-top:0">Na prośbę klienta: kopia jego danych w pliku ZIP (CSV z każdej zakładki arkusza i lista filmów) albo usunięcie wszystkiego.</p>' +
    '<div class="row2"><button class="b" type="button" id="rodo-dl"' + (r.busy ? ' disabled' : '') + '>' + (r.busy === 'dl' ? 'Przygotowuję plik…' : 'Pobierz dane (ZIP)') + '</button>' +
    (r.open ? '' : '<button class="cp danger" type="button" id="rodo-del"' + (r.busy ? ' disabled' : '') + '>Usuń dane klienta…</button>') + '</div>' +
    (r.open ? '<div class="rodo-x" role="group" aria-labelledby="rodo-h"><b id="rodo-h">Usunąć wszystkie dane: ' + esc(k.name) + '?</b>' +
      '<p class="legend" style="font-size:13px">Znikną jego wiersze ze wszystkich zakładek arkusza (plan, serie, sesje, dyspozycja, ból, pomiary, podsumowania), wiersz w Klientach (link przestanie działać) i folder z filmami (do kosza Dysku, 30 dni). Nie da się tego cofnąć w panelu. Najpierw pobierz dane, jeśli klient o nie prosi. Cotygodniowe kopie arkusza zostają do ich wymiany (8 tygodni).</p>' +
      '<label class="lab" for="rodo-name">Wpisz imię klienta: ' + esc(k.name) + '</label><input class="inp" id="rodo-name" autocomplete="off" spellcheck="false" value="' + esc(r.name) + '"' + (r.busy ? ' disabled' : '') + '>' +
      '<div class="row2" style="margin-top:10px"><button class="cp danger" type="button" id="rodo-go"' + (match && !r.busy ? '' : ' disabled') + '>' + (r.busy === 'del' ? 'Usuwam…' : 'Usuń na zawsze') + '</button><button class="b" type="button" id="rodo-no"' + (r.busy ? ' disabled' : '') + '>Anuluj</button></div></div>' : '') +
    (r.ok ? '<p class="saved" role="status">' + esc(r.ok) + '</p>' : '') + (r.err ? '<p class="err" role="alert">' + esc(r.err) + '</p>' : '') + '</div>';
}
function rodoBind(k){
  const id = k.id, re = () => { if (location.hash.startsWith('#klienci/')) renderKlientUst(id); };
  if (RD.id !== id) RD = { id, busy: '', ok: '', err: '', open: false, name: '' };
  $('#rodo-dl').onclick = async () => {
    Object.assign(RD, { busy: 'dl', ok: '', err: '' }); re();
    try { const r = await guard(api('trKlientEksport', id)), bin = atob(r.b64), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: 'application/zip' })); a.download = r.name;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      const n = Object.keys(r.tabs).reduce((x, t) => x + r.tabs[t], 0);
      Object.assign(RD, { busy: '', ok: '✓ Pobrano ' + r.name + ': ' + n + ' ' + plN(n, 'wiersz', 'wiersze', 'wierszy') + ' z ' + Object.keys(r.tabs).length + ' ' + plN(Object.keys(r.tabs).length, 'zakładki', 'zakładek', 'zakładek') + ', ' + r.films + ' ' + plN(r.films, 'film', 'filmy', 'filmów') + ' na liście.' }); }
    catch (e) { Object.assign(RD, { busy: '', err: e.auth ? '' : e.message }); }
    re();
  };
  const del = $('#rodo-del'); if (del) del.onclick = () => { Object.assign(RD, { open: true, ok: '', err: '', name: '' }); re(); const i = $('#rodo-name'); if (i) i.focus(); };
  const no = $('#rodo-no'); if (no) no.onclick = () => { Object.assign(RD, { open: false, name: '' }); re(); };
  const nm = $('#rodo-name'); if (nm) nm.oninput = () => { RD.name = nm.value; const g = $('#rodo-go'); if (g) g.disabled = nm.value.trim().toLowerCase() !== k.name.trim().toLowerCase(); };
  const go = $('#rodo-go'); if (go) go.onclick = async () => {
    Object.assign(RD, { busy: 'del', err: '' }); re();
    try { const r = await guard(api('trKlientUsun', id, RD.name));
      KL = KL.filter(x => x.id !== id); delete KLD[id]; delete CK[id];
      RD = { id: '', busy: '', ok: '', err: '', open: false, name: '' };
      KLM = { ok: '✓ Usunięto dane: ' + r.name + ' (' + r.rows + ' ' + plN(r.rows, 'wiersz', 'wiersze', 'wierszy') + '; filmy: ' + (r.folder === 'kosz' ? 'folder w koszu Dysku' : r.folder === 'wspólny' ? 'folder zostaje, bo ma go też inny klient o tym imieniu: usuń filmy ręcznie' : 'brak folderu') + ').', err: '', busy: false, rekey: '', gone: true };
      PUL.clients = PUL.clients.filter(c => c.id !== id);
      location.hash = '#klienci'; return; }
    catch (e) { Object.assign(RD, { busy: '', err: e.auth ? '' : e.message }); }
    re();
  };
}
function renderNowyKlient(){
  const n = NK = NK || { imie: '', id: '', touched: false, mode: 'PROSTY', swap: 'TRENER', masters: false, err: '', busy: false, done: null };
  const top = head('<a href="#klienci" style="color:inherit">Klienci</a>', 'Nowy klient');
  if (n.done) {
    const k = n.done;
    $('#main').innerHTML = top + '<div class="pg"><div class="card" style="max-width:640px"><div class="okbox" role="status"><b>✓ Dodano: ' + esc(k.name) + '</b>W planach JSON: „klient”: <span class="mono">"' + esc(k.id) + '"</span>. Folder na filmy jest gotowy.</div>' +
      (k.link ? '<span class="lab">Link do aplikacji</span><div class="linkbox mono" id="kl-link">' + esc(k.link) + '</div><div class="row2">' + cpBtn(k) + '</div>' : '<p class="err">Brak adresu aplikacji: ustaw właściwość skryptu PWA_URL, potem link będzie w ustawieniach klienta.</p>') +
      '<div class="sec" style="border:0">Co dalej</div><ol class="steps"><li>Wyślij link (' + esc(k.name) + ' otwiera go na telefonie i dodaje aplikację do ekranu głównego).</li><li>Przygotuj plan z „klient”: "' + esc(k.id) + '".</li>' +
      '<li>Do czasu planu aplikacja pokazuje „Jeszcze nie masz planu”. Na pulpicie osoba pojawi się po „Przelicz teraz”.</li></ol>' +
      '<div class="row2" style="margin-top:14px"><a class="b" ' + klLink + ' href="#klienci/' + encodeURIComponent(k.id) + '">Ustawienia: ' + esc(k.name) + ' ›</a><button class="b" type="button" id="kl-next">Dodaj kolejnego</button></div></div></div>';
    klBind(); $('#kl-next').onclick = () => { NK = null; renderNowyKlient(); };
    return;
  }
  const dis = n.busy ? ' disabled' : '';
  $('#main').innerHTML = top + '<div class="pg"><div class="card" style="max-width:640px" id="kl-new">' +
    '<label class="lab" for="kl-imie" style="margin-top:0">Imię <span class="muted">(widzi je klient w aplikacji)</span></label><input class="inp" id="kl-imie" autocomplete="off" value="' + esc(n.imie) + '"' + dis + '>' +
    '<label class="lab" for="kl-id">ID w planach <span class="muted">(podpowiada się samo z imienia)</span></label><input class="inp mono" id="kl-id" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(n.id) + '"' + dis + '>' +
    '<div class="frm" style="margin-top:8px">' +
    frH('Tryb', 'Prosty dla początkujących, PRO dla tych, którzy znają RPE.', segH('mode', [['PROSTY', 'Prosty'], ['PRO', 'PRO']], n.mode)) +
    frH('Zamiana ćwiczenia', 'Od trenera: zamienniki z planu i bazy. Dowolna: cała baza i własna nazwa.', segH('swap', [['NIE', 'Nie'], ['TRENER', 'Od trenera'], ['DOWOLNA', 'Dowolna']], n.swap)) +
    frH('Masters', 'Ostrzejsze progi obciążenia.', swH('masters', n.masters, 'Masters')) + '</div>' +
    '<p class="legend" style="font-size:13px">Pozostałe ustawienia (skala, ból, dodatkowe serie, zmiany w treningu, sufit w bojach) mają wartości domyślne i zmienisz je po dodaniu.</p>' +
    '<div class="row2" style="margin-top:12px"><button class="b p" type="button" id="kl-add"' + dis + '>' + (n.busy ? 'Dodaję…' : 'Dodaj klienta') + '</button><a class="b" ' + klLink + ' href="#klienci">Anuluj</a></div>' +
    (n.err ? '<p class="err" role="alert">' + esc(n.err) + '</p>' : '') + '</div></div>';
  $('#kl-imie').oninput = e => { n.imie = e.target.value; if (!n.touched) { n.id = slug(n.imie); $('#kl-id').value = n.id; } };
  $('#kl-id').oninput = e => { n.id = e.target.value; n.touched = !!n.id; };
  klCtl(n, () => { n.err = ''; renderNowyKlient(); });
  $('#kl-add').onclick = async () => {
    if (!n.imie.trim()) { n.err = 'Podaj imię.'; renderNowyKlient(); $('#kl-imie').focus(); return; }
    n.busy = true; n.err = ''; renderNowyKlient();
    try { const k = await guard(api('trKlientNowy', { imie: n.imie.trim(), id: n.id.trim(), mode: n.mode, swap: n.swap, masters: n.masters })); KL.push(k); n.done = k; }
    catch (e) { n.err = e.auth ? '' : e.message; }
    n.busy = false; if (location.hash === '#klienci/nowy') renderNowyKlient();
  };
}

/* ---------- karta klienta (v87: nagłówek z sygnałami i „Prowadź trening”, przegląd jak na telefonie) ---------- */
/** faktyczny dzień jednostki z Sesje.start (klucz tydzień|jednostka) */
function sesDates(d){ const o = {}; (d.sessions || []).forEach(s => { if (/T/.test(String(s.start || ''))) o[uKey(s.tydzien, s.jednostka)] = TL.localDate(new Date(s.start)); }); return o; }
async function renderKlient(id, tab){
  const c = PUL.clients.find(x => x.id === id) || { id, name: id, signals: [], load: [], week: '' };
  if (CID !== id || !CK[id]) {
    $('#main').innerHTML = head('Klient', c.name) + '<div class="pg"><div class="es">Ładowanie…</div></div>';
    try { CK[id] = await guard(api('trKlient', id)); } catch (e) { if (!e.auth) $('#main').innerHTML = errBox(e); return; }
    CID = id;
    if (!location.hash.startsWith('#k/' + encodeURIComponent(id))) return;
  }
  CUR = CK[id];
  const d = CUR, today = PUL.today, dates = sesDates(d);
  const sets = TL.doneSets(d.logs || [], d.plan || [], dates);
  const cur = (d.plan || []).filter(r => !r.own).map(r => ({ r, dt: dates[uKey(r.week, r.day)] || r.date })).filter(x => x.dt && x.dt <= today).sort((a, b) => a.dt.localeCompare(b.dt)).pop();
  const blk = cur && cur.r.block, bw = blk ? [...new Set((d.plan || []).filter(r => r.block === blk && !r.own).map(r => r.week))].sort((a, b) => a - b) : [];
  const eb = [blk ? 'Blok ' + esc(blk) + ' · tydz. ' + (bw.indexOf(cur.r.week) + 1) + ' z ' + bw.length : 'Bez bloku', d.cfg.simple ? 'Prosty' : 'PRO']
    .concat(!d.cfg.simple && d.cfg.scale === 'RIR' ? ['RIR'] : []).concat(d.cfg.masters ? ['masters'] : []).concat(d.cfg.active === false ? ['nieaktywny'] : []).join(' · ');
  // sygnały z Przeglądu + dyspozycja z ostatnich 3 dni, gdy nie „OK”
  const rd = (d.readiness || []).slice().sort((a, b) => String(a.data).localeCompare(String(b.data))).pop();
  const rdOn = rd && String(rd.data).slice(0, 10) >= TL.addDays(today, -2) && /uwaga|zmęcz/i.test(rd.werdykt || '');
  const pills = (c.signals || []).map(s => '<span class="pill ' + (s.lv === 'bad' ? 'lv-bad' : 'lv-warn') + '">' + esc(s.t) + '</span>').join('') +
    (rdOn ? '<span class="pill ' + (/zmęcz/i.test(rd.werdykt) ? 'lv-bad' : 'lv-warn') + '">dyspozycja: ' + esc(String(rd.werdykt).toLowerCase()) + '</span>' : '') +
    (d.pkg ? '<a class="pill pkp ' + pkgLv(d.pkg) + '" href="#pakiet" data-pkgo>pakiet ' + pkgLeft(d.pkg) + '</a>' : '');
  const nv = PUL.videos.filter(v => v.id === id && !v.kom).length;
  // bez konkretnej jednostki: na treningu personalnym często robimy coś innego niż w planie (jednostkę z planu otwiera „▶ Prowadź” w zakładce Plan)
  const live = '<a class="kgo" href="' + liveHref(id) + '"><span>▶ Prowadź trening</span></a>';
  const kh = '<div class="kh"><a class="kback" href="#klienci">‹ Klienci</a><div class="kht"><div class="eb">' + eb + '</div><h1>' + esc(d.cfg.name || c.name) + '</h1>' +
    (pills ? '<div class="kpl">' + pills + '</div>' : '') + '</div><div class="kha">' + live + '<div class="khs">' +
    go('#filmy/' + encodeURIComponent(id), 'Filmy' + (nv ? ' · ' + nv : '')) + go('#klienci/' + encodeURIComponent(id), 'Ustawienia') + '</div></div></div>';
  const T = [['przeglad', 'Przegląd'], ['plan', 'Plan'], ['sesje', 'Sesje'], ['bloki', 'Bloki'], ['dyspozycja', 'Dyspozycja']];
  const tabs = '<nav class="tabs" aria-label="Karta klienta">' + T.map(t => '<a href="#k/' + encodeURIComponent(id) + '/' + t[0] + '" aria-current="' + (t[0] === tab ? 'page' : 'false') + '">' + t[1] + '</a>').join('') + '</nav>';
  let body = '';
  if (tab === 'sesje') body = sesList(d, dates, 0);
  else if (tab === 'plan') body = planList(d, dates, today);
  else if (tab === 'bloki') body = blokList(d);
  else if (tab === 'dyspozycja') body = dyspList(d);
  else body = przeglad(d, c, sets, dates, today, rd);
  $('#main').innerHTML = kh + tabs + '<div class="pg">' + body + '</div>';
  pkgBind(id);
}
/* ---------- pakiet treningów personalnych (apps-script/Pakiety.gs) ----------
 * Zakładka Pakiety = księga: zakup (+n), trening (−1, z sesji „Prowadź”), korekta (±1, trening poza aplikacją albo zwrot).
 * Zostało = suma od ostatniego zakupu (reszta poprzedniego pakietu przechodzi). trKlient → d.pkg, trPulpit → clients[].pkg.
 */
const PKG_LOW = 2, PKG_DAYS = 7;
const pkgLeft = k => k.left < 0 ? '0 z ' + k.n + ' (+' + -k.left + ' poza)' : k.left + ' z ' + k.n;
const pkgLv = k => k.left < 0 ? 'lv-bad' : k.left <= PKG_LOW || (k.to && k.to <= TL.addDays(PUL.today, PKG_DAYS)) ? 'lv-warn' : 'lv-ok';
const zl = v => pl(Math.round(v * 100) / 100) + ' zł';
let PKF = null;   // formularz: {id, mode: 'nowy' | 'korekta', …}, tylko w pamięci strony
function pkgForm(d){
  const f = PKF, k = d.pkg, today = PUL.today;
  if (f.mode === 'korekta') return '<div class="pkf"><div class="sec" style="border:0;margin-top:0">Trening poza aplikacją albo poprawka</div>' +
    frH('Co', '„Trening” zdejmuje 1 wejście z datą. „Oddaj” zwraca 1 wejście, np. za trening odwołany z winy trenera.', segH('pk-k', [['-1', 'Trening −1'], ['1', 'Oddaj +1']], f.k)) +
    '<div class="pk2"><label>Data<input class="inp" type="date" id="pk-date" value="' + esc(f.date || today) + '"></label><label>Notatka<input class="inp" id="pk-note" placeholder="np. trening w parku" value="' + esc(f.note || '') + '"></label></div>' +
    '<div class="row2"><button class="b p" type="button" id="pk-save">Zapisz</button><button class="b" type="button" id="pk-x">Anuluj</button></div></div>';
  const carry = k && k.left > 0 && !(k.to && k.to < today) ? k.left : 0;
  return '<div class="pkf"><div class="sec" style="border:0;margin-top:0">Nowy pakiet</div>' +
    frH('Liczba treningów', carry ? 'Niewykorzystane z obecnego (' + carry + ') przejdą do nowego: razem ' + (f.n + carry) + '.' : 'Każdy trening zakończony w „Prowadź” zdejmuje 1.', segH('pk-n', [['5', '5'], ['8', '8'], ['10', '10'], ['12', '12'], ['20', '20']], String(f.n))) +
    '<div class="pk2"><label>Kupiony<input class="inp" type="date" id="pk-from" value="' + esc(f.from || today) + '"></label>' +
    '<label>Ważny do <small>(opcjonalnie)</small><input class="inp" type="date" id="pk-to" value="' + esc(f.to || '') + '"></label>' +
    '<label>Cena <small>(opcjonalnie)</small><input class="inp" id="pk-price" inputmode="decimal" placeholder="zł" value="' + esc(f.price || '') + '"></label>' +
    '<label>Notatka<input class="inp" id="pk-note" placeholder="np. przelew 03.11" value="' + esc(f.note || '') + '"></label></div>' +
    '<div class="row2"><button class="b p" type="button" id="pk-save">Dodaj pakiet</button><button class="b" type="button" id="pk-x">Anuluj</button></div></div>';
}
function pkgCard(d){
  const k = d.pkg, id = d.cfg.id, f = PKF && PKF.id === id ? PKF : null;
  const btns = '<div class="row2 pkb"><button class="cp" type="button" data-pkf="nowy">+ Nowy pakiet</button>' + (k ? '<button class="cp" type="button" data-pkf="korekta">± Trening poza aplikacją</button>' : '') + '</div>';
  if (!k) return '<div class="card pkg" id="pakiet"><div class="hrow"><h2>Pakiet treningów</h2></div>' + (f ? pkgForm(d) : '<p class="muted">Klient nie ma pakietu. Gdy go dodasz, każdy trening zakończony w „Prowadź” zdejmie 1 wejście.</p>' + btns) + '</div>';
  const cells = Array.from({ length: Math.max(k.n, k.used) }, (_, i) => '<i class="' + (i < k.used ? (i >= k.n ? 'x' : 'u') : '') + '"></i>').join('');
  const meta = ['kupiony ' + dm(k.from), k.to ? (k.to < PUL.today ? 'wygasł ' : 'ważny do ') + dm(k.to) : 'bez terminu', k.price ? zl(k.price) + (k.n ? ' · ' + zl(k.price / k.n) + ' / trening' : '') : ''].filter(Boolean).join(' · ');
  const hist = (k.hist || []).slice(0, 6).map(h => '<li><span class="mono">' + esc(dm(h.date)) + '</span><span>' + esc(h.txt) + (h.over ? ' <b class="bad">poza pakietem</b>' : '') + '</span><b class="mono ' + (h.d > 0 ? 'plus' : '') + '">' + (h.d > 0 ? '+' : '−') + Math.abs(h.d) + '</b></li>').join('');
  return '<div class="card pkg ' + pkgLv(k) + '" id="pakiet"><div class="hrow"><h2>Pakiet treningów</h2><span class="pkv">Klient widzi licznik<button type="button" class="sw" role="switch" id="pk-show" aria-checked="' + !!k.show + '" aria-label="Klient widzi licznik pakietu w aplikacji"></button></span></div>' +
    '<div class="pkn"><b>' + Math.max(0, k.left) + '</b><span>z ' + k.n + ' zostało' + (k.left < 0 ? '<br><em class="bad">' + -k.left + ' ' + plN(-k.left, 'trening', 'treningi', 'treningów') + ' poza pakietem</em>' : '') + '</span></div>' +
    '<div class="pkc" aria-hidden="true">' + cells + '</div><p class="legend">' + esc(meta) + '</p>' +
    (f ? pkgForm(d) : btns) +
    (hist ? '<details class="pkh"' + (f ? '' : ' open') + '><summary>Historia</summary><ul>' + hist + '</ul></details>' : '') + '</div>';
}
function pkgBind(id){
  const re = () => renderKlient(id, 'przeglad');
  document.querySelectorAll('[data-pkf]').forEach(b => b.onclick = () => { PKF = { id, mode: b.dataset.pkf, n: 10, k: '-1' }; re(); });
  document.querySelectorAll('[data-pkgo]').forEach(a => a.onclick = e => { e.preventDefault(); const c = $('#pakiet'); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
  const sh = $('#pk-show');   // licznik u klienta (zakładka Trener): kolumna „widoczny” w wierszu zakupu
  if (sh) sh.onclick = async () => { const on = sh.getAttribute('aria-checked') !== 'true'; sh.disabled = true;
    try { CK[id].pkg = await guard(api('trPakiet', id, { mode: 'widok', show: on })); re(); }
    catch (e) { sh.disabled = false; if (!e.auth) pkgErr(e); } };
  if (!PKF || PKF.id !== id) return;
  const keep = () => ['from', 'to', 'price', 'note', 'date'].forEach(f => { const el = $('#pk-' + f); if (el) PKF[f] = el.value; });
  document.querySelectorAll('[data-seg^="pk-"]').forEach(b => b.onclick = () => { keep(); PKF[b.dataset.seg.slice(3)] = b.dataset.val; if (b.dataset.seg === 'pk-n') PKF.n = +b.dataset.val; re(); });
  const x = $('#pk-x'); if (x) x.onclick = () => { PKF = null; re(); };
  const sv = $('#pk-save'); if (sv) sv.onclick = async () => { keep(); sv.disabled = true; sv.textContent = 'Zapisuję…';
    try { const r = await guard(api('trPakiet', id, Object.assign({}, PKF, { id: undefined }))); CK[id].pkg = r; PKF = null; re(); }
    catch (e) { sv.disabled = false; sv.textContent = 'Zapisz'; if (!e.auth) pkgErr(e); } };
}
const pkgErr = e => { const c = $('#pakiet'); if (c) c.insertAdjacentHTML('beforeend', '<p class="err" role="alert">' + esc(e.message) + '</p>'); };
function painOf(s){
  let top = ['', NaN];
  String(s.bol || '').split(';').forEach(x => { const q = x.split(':'), v = nf((q[1] || '').trim()); if (v > (isFinite(top[1]) ? top[1] : -1)) top = [(q[0] || '').trim(), v]; });
  if (!isFinite(top[1])) [['kolano', nf(s.bol_kolano)], ['bark', nf(s.bol_bark)], ['', nf(s.bol_max)]].forEach(q => { if (q[1] > (isFinite(top[1]) ? top[1] : -1)) top = q; });
  return top;
}
function sessRows(d, dates){
  const P = {}; (d.plan || []).forEach(r => { const k = uKey(r.week, r.day); P[k] = P[k] || r; });
  return (d.sessions || []).map(s => { const u = uKey(s.tydzien, s.jednostka); return { s, u, day: dates[u] || String(s.data || '').slice(0, 10), title: (P[u] || {}).title || '' }; })
    .sort((a, b) => b.day.localeCompare(a.day) || String(b.s.tydzien).localeCompare(String(a.s.tydzien)));
}
// seria robocza w Logu: odhaczona albo nagrana / wpisana bez ✓ (jak trLogged_ w Trener.gs); bez rozgrzewki i pominięć
const sv = v => v === undefined || v === null ? '' : String(v).trim();
const ticked = l => sv(l.wykonane).toUpperCase() === 'TAK';
const logged = l => { const se = sv(l.seria); return !!se && se !== '0' && !/^R/i.test(se) && !/SKIP/.test(sv(l.typ)) && (ticked(l) || sv(l.kg) !== '' || sv(l.powt) !== '' || sv(l.film_link) !== ''); };
const uKey = (w, j) => Number(w) + '|' + sv(j);
function setsOf(d, u){
  const P = {}; (d.plan || []).forEach(r => { P[uKey(r.week, r.day) + '|' + r.order] = r; });
  const by = {};
  (d.logs || []).filter(l => uKey(l.tydzien, l.jednostka) === u && logged(l)).forEach(l => {
    const k = l.nr_cw, r = P[u + '|' + k] || {}; const e = by[k] = by[k] || { name: String(l.cwiczenie || r.name || ''), prio: r.prio || '', sets: [], note: String(l.uwagi || ''), swap: null };
    e.sets.push(l); if (!e.swap && sv(l.zamiana)) { e.swap = TL.parseSwap(l.zamiana); if (e.swap) e.name = e.swap.to; } });
  return Object.keys(by).sort((a, b) => a - b).map(k => by[k]);
}
const setTxt = l => { const t = (nf(l.kg) > 0 ? pl(l.kg) + '×' : '') + esc(l.powt) + (l.ocena ? ' ' + esc(l.ocena) : nf(l.rpe) >= 0 ? ' @' + pl(l.rpe) : '') + (/FAIL/.test(l.typ || '') ? ' ✕' : '');
  return ticked(l) ? t + (l.film_link ? ' ▶' : '') : '<span class="nd" title="Seria nie odhaczona w aplikacji">' + (t || 's. ' + esc(sv(l.seria))) + (l.film_link ? ' ▶' : '') + '</span>'; };
/** serie w skrócie: ten sam ciężar i powtórzenia co poprzednia = sama ocena („84×5 @7,5 · @8 · @8,5”) */
const setsShort = ss => ss.map((l, i) => { const p = ss[i - 1];
  if (!p || sv(p.kg) !== sv(l.kg) || sv(p.powt) !== sv(l.powt) || !(l.ocena || nf(l.rpe) >= 0)) return setTxt(l);
  const t = (l.ocena ? esc(l.ocena) : '@' + pl(l.rpe)) + (/FAIL/.test(l.typ || '') ? ' ✕' : '') + (l.film_link ? ' ▶' : '');
  return ticked(l) ? t : '<span class="nd" title="Seria nie odhaczona w aplikacji">' + t + '</span>'; }).join(' · ');
/** zamiana ćwiczenia przez klienta (Log „zamiana” = „oryginał → zamiennik | powód”) */
const swapTxt = sw => sw ? '<span class="swp">⇄ zamiast ' + esc(sw.from) + (sw.why ? ' · ' + esc(sw.why) : '') + '</span>' : '';
const ndNote = ex => ex.some(e => e.sets.some(l => !ticked(l))) ? '<p class="hint" style="margin:6px 0 0"><span class="nd">szare</span> = klient nagrał albo wpisał serię, ale jej nie odhaczył w aplikacji.</p>' : '';
function przeglad(d, c, sets, dates, today, rd){
  const ss = sessRows(d, dates), wk = ss.filter(x => x.day >= TL.addDays(today, -6) && x.day <= today);
  let pain = ['', NaN, '']; wk.forEach(x => { const p = painOf(x.s); if (p[1] > (isFinite(pain[1]) ? pain[1] : -1)) pain = [p[0], p[1], x.s.jednostka]; });
  const sm = (d.summary || []).slice().sort((a, b) => String(a.week).localeCompare(String(b.week))).pop();
  const ton = TL.weeklyTonnage(sets, today, 12), tw = ton[11].ton, prev = ton.slice(7, 11).filter(x => x.ton > 0), avg = prev.length ? prev.reduce((a, x) => a + x.ton, 0) / prev.length : 0;
  const smSt = String(sm && sm.status || '').replace(/^[^\wąćęłńóśźż–]+/i, '');
  const st = (lv, v, t, title, extra) => '<div class="st ' + lv + (extra || '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '><b>' + v + '</b><span>' + t + '</span></div>';
  const stats = '<div class="stats" aria-label="Ten tydzień w liczbach">' +
    st('', esc(c.week || '–'), 'ten tydzień') +
    st(pain[1] > 3 ? 'lv-bad' : pain[1] > 0 ? 'lv-warn' : '', isFinite(pain[1]) ? pl(pain[1]) + '/10' : '–', isFinite(pain[1]) && pain[1] > 0 ? 'ból, ' + esc(pain[0] || pain[2]) : 'ból 7 dni', isFinite(pain[1]) && pain[1] > 0 ? 'Ból max 7 dni: ' + (pain[0] || 'bez miejsca') + ' · ' + pain[2] : '') +
    st(/dużo/.test(smSt) ? 'lv-bad' : /uwaga|lekko/.test(smSt) ? 'lv-warn' : '', sm && nf(sm.srpe) >= 0 ? Math.round(nf(sm.srpe)) : '–', 'sRPE' + (smSt ? ', ' + esc(smSt.toLowerCase()) : ''), sm ? (nf(sm.acwr) > 0 ? 'ACWR ' + fmt1(nf(sm.acwr)) + ' · ' : '') + 'tydzień od ' + dm(String(sm.week)) : '') +
    st('', tw ? fmt1(tw / 1000) + ' t' : '–', 'tonaż' + (avg ? ' ' + (tw >= avg ? '+' : '−') + Math.abs(Math.round((tw / avg - 1) * 100)) + '%' : ''), avg ? 'względem średniej 4 poprzednich tygodni' : '') +
    st(rd && /zmęcz/i.test(rd.werdykt) ? 'lv-bad' : rd && /uwaga/i.test(rd.werdykt) ? 'lv-warn' : '', rd ? esc(rd.werdykt || '–') : '–', 'dyspozycja' + (rd ? ' ' + esc(dm(String(rd.data).slice(0, 10))) : ''), '', ' st5') + '</div>';
  const sesH = '<div class="card ksl"><div class="hrow"><h2>Ostatnie sesje</h2><a href="#k/' + encodeURIComponent(d.cfg.id) + '/sesje">Wszystkie ' + ss.length + ' ›</a></div>' + (ss.length ? ss.slice(0, 5).map(x => {
    const p = painOf(x.s), main = setsOf(d, x.u).filter(e => e.prio === 'A').slice(0, 3);
    const meta = [x.s.czas_min ? esc(x.s.czas_min) + ' min' : '', nf(x.s.rpe_sesji) >= 0 ? 'RPE ' + pl(x.s.rpe_sesji) : '',
      isFinite(p[1]) && p[1] > 0 ? '<span class="' + (p[1] > 3 ? 'bad' : 'warn') + '">ból ' + pl(p[1]) + (p[0] ? ' ' + esc(p[0]) : '') + '</span>' : 'bez bólu'].filter(Boolean).join(' · ');
    return '<a class="sr" href="#k/' + encodeURIComponent(d.cfg.id) + '/sesje"><b>' + esc(dowDm(x.day)) + ' · ' + esc(x.s.jednostka) + (x.title ? ' ' + esc(x.title) : '') + '</b><small>' + meta + '</small>' +
      main.map(e => '<span class="sx"><i>' + esc(e.name) + '</i> ' + setsShort(e.sets) + (e.swap ? ' ' + swapTxt(e.swap) : '') + '</span>').join('') +
      (x.s.uwagi ? '<q>' + esc(x.s.uwagi) + '</q>' : '') + '</a>'; }).join('') : '<p class="muted">Brak zapisanych sesji.</p>') + '</div>';
  const recs = TL.records(sets).slice(0, 4);
  const sila = '<div class="card"><h2>Siła · ' + (recs.some(r => !r.oly) ? 'szacowane maksimum' : 'najlepsze kg') + '</h2>' + (recs.length ? recs.map(r => {
    const ser = TL.strengthSeries(sets, r.name).slice(-12), f = ser[0], l = ser[ser.length - 1], dv = l.v - f.v;
    return '<div class="sg"><div><b>' + esc(r.name) + '</b><small>' + (ser.length > 1 ? 'od ' + esc(dm(f.date)) + ': ' + (dv >= 0 ? '+' : '−') + esc(fmt1(Math.abs(dv))) + ' kg' : 'jeden wynik') + (r.oly ? ' · najlepsze kg' : '') + '</small></div>' +
      spark(ser.map(p => p.v), 110, 32) + '<span class="mono">' + esc(fmt1(l.v)) + ' kg</span></div>'; }).join('') : '<p class="muted">Brak wyników ćwiczeń głównych (prio A).</p>') + '</div>';
  const tonC = '<div class="card"><h2>Tonaż tygodniowy</h2>' + bars(ton.map(x => ({ week: x.week, v: x.ton })), 'Tonaż w 12 tygodniach') + '</div>';
  return stats + '<div class="kov"><div class="stack">' + pkgCard(d) + sesH + '</div><div class="stack">' + sila + tonC + cialoCard(d, today) + '</div></div>';
}
/** Ciało (punkt 15 przeglądu v80): masa z wykresem i obwody ze zmianą w 12 tygodniach; tylko klient z Klienci W „cialo” = TAK */
function cialoCard(d, today){
  if (!d.cfg || !d.cfg.body) return '';
  const list = TL.cialoList(d.cialo), ms = list.filter(o => o.masa !== null).map(o => ({ date: o.date, v: o.masa })).slice(-16);
  if (!list.length) return '<div class="card" id="k-cialo"><h2>Ciało</h2><p class="muted">Klient nie zapisał jeszcze pomiaru (aplikacja → Postęp → Ciało).</p></div>';
  const sg = x => (x > 0 ? '+' : x < 0 ? '−' : '±') + pl(Math.abs(x));
  const pills = TL.CIALO.map(([k, n, u]) => [n, u, TL.cialoDelta(list, k, today)]).filter(x => x[2])
    .map(([n, u, x]) => '<span class="pill">' + esc(n) + ' ' + pl(x.now) + ' ' + u + (x.since !== x.date ? ' · ' + sg(x.d) + ' od ' + esc(dm(x.since)) : '') + '</span>').join('');
  return '<div class="card" id="k-cialo"><h2>Ciało · ostatni pomiar ' + esc(dowDm(list[list.length - 1].date)) + '</h2>' + (ms.length > 1 ? line(ms, 'Masa ciała') : '') + '<div style="margin-top:8px">' + pills + '</div></div>';
}
function sesList(d, dates){
  const ss = sessRows(d, dates);
  if (!ss.length) return '<div class="card es"><b>Brak sesji</b>Klient nie zakończył jeszcze żadnej jednostki.</div>';
  return '<div class="card"><h2>Sesje (' + ss.length + ')</h2>' + ss.map((x, i) => {
    const p = painOf(x.s), ex = setsOf(d, x.u);
    return '<details class="ses"' + (i === 0 || TN[x.u] ? ' open' : '') + '><summary>' + sesHead(x) +
      '<span class="muted">' + [x.s.czas_min ? x.s.czas_min + ' min' : '', nf(x.s.rpe_sesji) >= 0 ? 'RPE ' + pl(x.s.rpe_sesji) : '', nf(x.s.samopoczucie) > 0 ? 'samopoczucie ' + x.s.samopoczucie + '/5' : '', isFinite(p[1]) && p[1] > 0 ? 'ból ' + pl(p[1]) + (p[0] ? ' ' + p[0] : '') : '', sv(x.s.odpowiedz_klienta) ? '↩ odpowiedź klienta' : ''].filter(Boolean).map(esc).join(' · ') + '</span></summary>' +
      snBox(x) +
      '<div class="tw"><table><tbody>' + ex.map(e => '<tr><td><b>' + esc(e.name) + '</b> <span class="muted">' + esc(e.prio) + '</span>' + (e.swap ? '<br>' + swapTxt(e.swap) : '') + '</td><td class="sets">' + e.sets.map(setTxt).join(', ') + '</td><td>' + esc(e.note) + '</td></tr>').join('') + '</tbody></table></div>' + ndNote(ex) +
      (x.s.uwagi ? '<p class="note"><span class="eb">Uwagi klienta</span><br>' + esc(x.s.uwagi) + '</p>' : '') +
      komBox(x.s, ex.length) + '</details>';
  }).join('') + '</div>';
}
/* ---------- nazwa sesji (trTytul → Plan.tytul całej jednostki; klient widzi ją w aplikacji); szkic tylko w pamięci strony ---------- */
const TN = {};                  // tydzień|jednostka → {text, busy, err} (otwarte pole nazwy)
const TITLE_MAX = 40;
const ownTitle = t => String(t || '').replace(/^Własny( · )?/, '');
const sesHead = x => '<span class="sh"><b>' + esc(dowDm(x.day)) + ' · tydz. ' + esc(x.s.tydzien) + ' · ' + esc(x.s.jednostka) + (x.title ? ' · ' + esc(x.title) : '') + '</b>' +
  '<button type="button" class="sren" data-sren="' + esc(x.u) + '" aria-label="Zmień nazwę sesji" title="Zmień nazwę sesji">✎</button></span>';
function snBox(x){
  const st = TN[x.u]; if (!st) return '';
  const r0 = (CUR.plan || []).find(r => uKey(r.week, r.day) === x.u) || {};
  return '<div class="snm" data-u="' + esc(x.u) + '"><label class="eb" for="sn-in">Nazwa sesji</label>' +
    '<div class="snr"><input id="sn-in" maxlength="' + TITLE_MAX + '" value="' + esc(st.text) + '" placeholder="' + esc(x.s.jednostka) + '"' + (st.busy ? ' disabled' : '') + '>' +
    '<button type="button" class="b p" data-sn="save"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? 'Zapisuję…' : 'Zapisz') + '</button><button type="button" class="b" data-sn="cancel"' + (st.busy ? ' disabled' : '') + '>Anuluj</button></div>' +
    '<p class="muted">Klient zobaczy nową nazwę w aplikacji (Trening, Plan, komentarze). ' + (r0.own ? 'To własny trening klienta: przed nazwą zostaje „Własny”. ' : '') + 'Tydzień i ' + esc(x.s.jednostka) + ' zostają.</p>' +
    (st.err ? '<p class="err" role="alert">' + esc(st.err) + '</p>' : '') + '</div>';
}
function snRedraw(u, focus){
  const d = CUR; if (!d) return;
  const el = [...document.querySelectorAll('details.ses')].find(x => x.querySelector('[data-sren="' + CSS.escape(u) + '"]')); if (!el) return;
  const x = sessRows(d, sesDates(d)).find(y => y.u === u); if (!x) return;
  el.querySelector('summary > .sh').outerHTML = sesHead(x);
  const old = el.querySelector('.snm'), html = snBox(x);
  if (old) { if (html) old.outerHTML = html; else old.remove(); } else if (html) el.querySelector('summary').insertAdjacentHTML('afterend', html);
  if (focus) { const i = el.querySelector('#sn-in'); if (i) { i.focus(); i.select(); } }
}
async function snSave(u){
  const st = TN[u]; if (!st || st.busy) return;
  const [w, day] = [u.split('|')[0], u.split('|').slice(1).join('|')], cid = CID, text = String(st.text).replace(/\s+/g, ' ').trim();
  st.busy = true; st.err = ''; snRedraw(u);
  try {
    const r = await guard(api('trTytul', cid, { week: Number(w), day, title: text }));
    (CUR.plan || []).forEach(p => { if (uKey(p.week, p.day) === u) p.title = r.title; });
    delete TN[u];
    if (CID === cid) { snRedraw(u); const b = document.querySelector('[data-sren="' + CSS.escape(u) + '"]'); if (b) b.focus(); }
  } catch (err) { st.busy = false; if (!err.auth) st.err = err.message; if (CID === cid) snRedraw(u); }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-sren]');
  if (b && CUR) {
    e.preventDefault(); e.stopPropagation();
    const u = b.dataset.sren, r0 = (CUR.plan || []).find(r => uKey(r.week, r.day) === u) || {};
    if (!TN[u]) TN[u] = { text: r0.own ? ownTitle(r0.title) : String(r0.title || '') };
    b.closest('details').open = true; snRedraw(u, true); return;
  }
  const s = e.target.closest('.snm [data-sn]'); if (!s) return;
  const u = s.closest('.snm').dataset.u;
  if (s.dataset.sn === 'cancel') { delete TN[u]; snRedraw(u); return; }
  snSave(u);
});
document.addEventListener('input', e => { const i = e.target.closest('.snm input'); if (i && TN[i.closest('.snm').dataset.u]) TN[i.closest('.snm').dataset.u].text = i.value; });
document.addEventListener('keydown', e => {
  const i = e.target.closest && e.target.closest('.snm input'); if (!i) return;
  const u = i.closest('.snm').dataset.u;
  if (e.key === 'Enter') { e.preventDefault(); snSave(u); }
  if (e.key === 'Escape') { e.preventDefault(); delete TN[u]; snRedraw(u); const b = document.querySelector('[data-sren="' + CSS.escape(u) + '"]'); if (b) b.focus(); }
});
/* ---------- komentarz do sesji: zapis (trKomentarz) i szkic AI (trSzkic); stan pola tylko w pamięci strony ---------- */
const KD = {};                  // klient|tydzień|jednostka → {text, edit, ai, busy, ok, err, cost, n, limit}
const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor"/></svg>';
const kdKey = s => CID + '|' + s.tydzien + '|' + s.jednostka;
function komBox(s, nSets){
  if (nSets === undefined) nSets = setsOf(CUR, uKey(s.tydzien, s.jednostka)).length;
  const u = s.tydzien + '|' + s.jednostka, st = KD[kdKey(s)] || {}, saved = String(s.komentarz_trenera || '');
  const box = inner => '<div class="kedit" data-u="' + esc(u) + '"><div class="eb" style="margin-bottom:6px">Twój komentarz do sesji</div>' + inner + (st.err ? '<p class="err" role="alert">' + esc(st.err) + (/Ustawienia/.test(st.err) ? ' <a href="#ustawienia">Otwórz Ustawienia</a>' : '') + '</p>' : '') + '</div>';
  const nm = (PUL && (PUL.clients.find(c => c.id === CID) || {}).name) || (CUR && CUR.cfg && CUR.cfg.name) || '', rp = repBox(s.odpowiedz_klienta, s.odpowiedz_at, nm);
  if (saved && !st.edit) return box('<p class="kom" style="margin:0">' + esc(saved) + '</p>' + rp + '<div class="row">' +
    (st.ok ? '<span class="saved">✓ Zapisano · klient zobaczy komentarz w aplikacji, w zakładce Trener</span>' : '') + '<span class="sp"></span><button class="b" type="button" data-k="edit">Edytuj</button></div>');
  const text = st.text !== undefined ? st.text : saved, dis = st.busy ? ' disabled' : '';
  const flag = st.ai ? '<div class="aiflag">' + SPARK + '<div><b>Szkic AI. Przeczytaj i popraw przed zapisem.</b>Klient nie zobaczy niczego, dopóki nie klikniesz „Zapisz”.</div></div>' : '';
  const chips = st.ai ? '<div class="row"><span class="hint">Popraw szkic:</span><div class="chips">' +
    [['krocej', 'Krócej'], ['cieplej', 'Cieplej'], ['technicznie', 'Bardziej technicznie'], ['inny', 'Inny szkic']].map(c => '<button class="chip" type="button" data-k="ai" data-t="' + c[0] + '"' + dis + '>' + c[1] + '</button>').join('') + '</div></div>' : '';
  const hint = st.busy ? 'AI pisze szkic, to trwa kilka–kilkanaście sekund…' : st.ai && st.cost !== undefined ? 'koszt szkicu ' + pl(st.cost.toFixed(3)) + ' $ · dziś ' + st.n + ' z ' + st.limit : !nSets ? 'Brak zapisanych serii, więc bez szkicu AI. Klient zobaczy komentarz w zakładce Trener.' : 'Klient zobaczy komentarz w aplikacji, w zakładce Trener.';
  return box(rp + flag + '<textarea aria-label="Komentarz do sesji ' + esc(u.replace('|', ' ')) + '" placeholder="Napisz klientowi, jak poszło…" data-k="txt"' + dis + '>' + esc(text) + '</textarea>' + chips +
    '<div class="row">' + (st.ai || !nSets ? '' : '<button class="b ai" type="button" data-k="ai"' + dis + '>' + SPARK + (st.busy ? 'Piszę szkic…' : 'Szkic AI') + '</button>') +
    '<span class="hint">' + hint + '</span><span class="sp"></span>' + (saved ? '<button class="b" type="button" data-k="cancel"' + dis + '>Anuluj</button>' : '') +
    '<button class="b p" type="button" data-k="save"' + dis + '>Zapisz</button></div>' +
    '<details class="ctx"><summary>Co dostaje AI (bez imienia klienta)</summary><ul><li>ta jednostka: plan i wykonane serie, RPE, czas, samopoczucie, ból, uwagi i komentarze klienta</li>' +
    '<li>3 poprzednie takie same jednostki do porównania</li><li>dyspozycja z dnia treningu i następna jednostka z planu</li><li>Twoje ostatnie komentarze do tej osoby, żeby pisało Twoim stylem</li></ul></details>');
}
function komDraw(s){
  const el = document.querySelector('.kedit[data-u="' + CSS.escape(s.tydzien + '|' + s.jednostka) + '"]'); if (!el) return;
  const focus = document.activeElement && el.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA';
  el.outerHTML = komBox(s);
  if (focus) { const t = document.querySelector('.kedit[data-u="' + CSS.escape(s.tydzien + '|' + s.jednostka) + '"] textarea'); if (t) t.focus(); }
}
const sesOf = el => { const u = el.closest('.kedit').dataset.u.split('|'); return (CUR.sessions || []).find(s => String(s.tydzien) === u[0] && String(s.jednostka) === u[1]); };
document.addEventListener('input', e => { const t = e.target.closest('.kedit:not(.bedit):not(.nbk) textarea'); if (!t || !CUR) return; const s = sesOf(t); (KD[kdKey(s)] = KD[kdKey(s)] || {}).text = t.value; });
document.addEventListener('click', async e => {
  const b = e.target.closest('.kedit:not(.bedit):not(.nbk) [data-k]'); if (!b || b.tagName === 'TEXTAREA' || !CUR) return;
  const s = sesOf(b), k = kdKey(s), st = KD[k] = KD[k] || {}, saved = String(s.komentarz_trenera || ''), cid = CID;
  const cur = () => st.text !== undefined ? st.text : saved;
  st.err = '';
  if (b.dataset.k === 'edit') { Object.assign(st, { edit: true, ok: false, text: saved, ai: false }); komDraw(s); return; }
  if (b.dataset.k === 'cancel') { KD[k] = {}; komDraw(s); return; }
  if (b.dataset.k === 'save') {
    st.busy = true; komDraw(s);
    try { const r = await guard(api('trKomentarz', cid, s.tydzien, s.jednostka, cur())); s.komentarz_trenera = r.text; KD[k] = r.text ? { ok: true } : {}; }
    catch (err) { st.busy = false; if (!err.auth) st.err = err.message; }
    if (CID === cid) komDraw(s);
    return;
  }
  if (b.dataset.k === 'ai') {
    const tweak = b.dataset.t || '';
    st.busy = true; komDraw(s);
    try { const r = await guard(api('trSzkic', cid, s.tydzien, s.jednostka, { tweak, draft: tweak ? cur() : '' }));
      Object.assign(st, { text: r.text, ai: true, edit: true, cost: r.cost, n: r.n, limit: r.limit }); }
    catch (err) { if (!err.auth) st.err = err.message; }
    finally { st.busy = false; }
    if (CID === cid) komDraw(s);
  }
});
function blokList(d){
  const bl = (d.blocks || []).filter(b => String(b.blok) !== '(bez bloku)').sort((a, b) => String(b.od).localeCompare(String(a.od)));
  if (!bl.length) return '<div class="card es"><b>Brak bloków</b>Zakładka Bloki w arkuszu nie ma jeszcze wierszy tego klienta (liczy je „Przelicz teraz”).</div>';
  const f = (k, v) => v === '' || v === null || v === undefined ? '' : '<div><span class="eb">' + k + '</span><br>' + esc(v) + '</div>';
  return nbCard(d, bl[0]) + bl.map(b => '<div class="card"><h2>Blok ' + esc(b.blok) + ' · ' + esc(dm(b.od)) + '–' + esc(dm(b.do)) + '</h2><div class="g3" style="font-size:14px">' +
    f('Tygodnie / jednostki', [b.tygodnie, b.jednostki].filter(x => x !== '').join(' / ')) + f('Wykonanie', b['wykonanie_%'] !== '' ? b['wykonanie_%'] + '%' : '') + f('Tonaż', nf(b.tonaz_kg) > 0 ? fmt1(nf(b.tonaz_kg) / 1000) + ' t' : '') +
    f('Zmiana e1RM', b.e1RM_zm) + f('Najlepsze boje', b.najlepsze_boje) + f('sRPE śr. / samopoczucie', [b.sRPE_sr, b.samopocz_sr].filter(x => x !== '').join(' / ')) +
    f('Dyspozycja', b.dyspozycja) + f('Ból max', b.bol_max) + f('Statusy', b.statusy) + '</div>' +
    blokBox(b) + '</div>').join('');
}
/* ---------- karta klienta → Bloki: szkic następnego bloku z AI (trBlokPlan) i wczytanie do planu (trBlokWczytaj) ----------
 * AI dostaje ostatni blok (plan i wykonanie tydzień po tygodniu, światła, nieudane, pominięte, ból, wnioski trenera) i zwraca
 * wiersze planu; serwer dokłada klienta, blok, tygodnie (ciągła numeracja), daty, sprawdza je validatePlan_ jak plik z Dysku.
 * Szkic (NB) tylko w pamięci strony; do arkusza trafia dopiero po „Wczytaj do planu” (plik w _plany/ i import od razu). */
const NB = {};                                   // klient → {weeks, start, hint, fix, busy, err, draft, sure, done}
const NB_FIX = [['lzej', 'Lżej'], ['ciezej', 'Ciężej'], ['mniej', 'Mniej serii'], ['inny', 'Inny szkic']];
function nbDefaults(d, b){
  const rows = (d.plan || []).filter(r => !r.own && String(r.block || '') === String(b.blok));
  const weeks = [...new Set(rows.map(r => r.week))], last = rows.map(r => r.date).filter(Boolean).sort().pop() || PUL.today;
  const from = last > PUL.today ? last : PUL.today, dow = (new Date(from + 'T12:00:00Z').getUTCDay() + 6) % 7;
  return { weeks: Math.min(8, Math.max(1, weeks.length || 4)), start: TL.addDays(from, 7 - dow) };
}
function nbCell(r, w){
  const lb = '<i class="lb">Tydz. ' + esc(w) + '</i>';
  if (!r) return '<td class="nbe">' + lb + '–</td>';
  const kg = r.kg === '' || r.kg === undefined ? '' : typeof r.kg === 'number' ? pl(r.kg) + ' kg' : esc(r.kg);
  const pct = r.procent ? ' · ' + pl(Math.round(r.procent * 1000) / 10) + '%' : '';
  return '<td>' + lb + '<b>' + esc(r.serie) + '×' + esc(r.powt) + '</b>' + (kg || pct ? '<br>' + kg + pct : '') + (r.rpe_max ? '<br><span class="muted">RPE ' + pl(r.rpe_max) + '</span>' : '') + '</td>';
}
const LIGHT = { L: '🟢', S: '🟡', W: '🔴', X: '✖' };
function nbPrev(p){
  if (!p) return '<td class="nbp muted"><i class="lb">Ostatnio</i>nowe</td>';
  return '<td class="nbp"><i class="lb">Ostatnio</i>' + esc(p.sets) + '×' + esc(p.reps) + (p.kg !== '' && p.kg !== undefined ? ' · ' + (typeof p.kg === 'number' ? pl(p.kg) + ' kg' : esc(p.kg)) : '') +
    (p.lights ? '<br><span class="lt" aria-label="wysiłek serii">' + p.lights.split('').map(c => LIGHT[c] || '·').join('') + '</span>' : '') + '</td>';
}
function nbDiff(r, p){
  if (!p) return '<span class="dif new">nowe</span>';
  const a = typeof r.kg === 'number' ? r.kg : NaN, b = typeof p.kg === 'number' ? p.kg : NaN;
  if (isFinite(a) && isFinite(b) && a !== b) return '<span class="dif ' + (a > b ? 'up' : 'dn') + '">' + (a > b ? '+' : '−') + pl(Math.abs(Math.round((a - b) * 10) / 10)) + ' kg</span>';
  if (Number(r.serie) !== Number(p.sets)) return '<span class="dif">' + esc(p.sets) + '→' + esc(r.serie) + ' serii</span>';
  return '<span class="dif same">bez zmian</span>';
}
function nbDraft(st, b){
  const dr = st.draft, dis = st.busy ? ' disabled' : '';
  const units = {};
  dr.rows.forEach(r => { const u = units[r.jednostka] = units[r.jednostka] || { day: r.jednostka, title: r.tytul, first: r.data || '9', ex: {}, order: [], unote: {} };
    if (r.data && r.data < u.first) u.first = r.data; if (r.uwagi_jedn) u.unote[r.tydzien] = r.uwagi_jedn;
    if (!u.ex[r.cwiczenie]) { u.ex[r.cwiczenie] = { name: r.cwiczenie, prio: r.prio, nr: r.nr, uwagi: r.uwagi, w: {} }; u.order.push(r.cwiczenie); }
    u.ex[r.cwiczenie].w[r.tydzien] = r; });
  const W = dr.weeks;
  const tables = Object.values(units).sort((a, c) => a.first.localeCompare(c.first)).map(u => {
    const days = W.map(w => (dr.rows.find(r => r.jednostka === u.day && r.tydzien === w) || {}).data).filter(Boolean);
    const rows = u.order.map(n => u.ex[n]).sort((a, c) => a.nr - c.nr).map(e => { const p = (dr.prev || {})[u.day + '|' + e.name], f = e.w[W[0]];
      return '<tr><th scope="row"><span class="pp pp-' + esc(e.prio) + '">' + esc(e.prio) + '</span> ' + esc(e.name) + (f ? '<br>' + nbDiff(f, p) : '') + (e.uwagi ? '<br><span class="muted nbu">' + esc(e.uwagi) + '</span>' : '') + '</th>' +
        nbPrev(p) + W.map(w => nbCell(e.w[w], w)).join('') + '</tr>'; }).join('');
    return '<div class="nbu-c"><div class="eb">' + esc(u.day) + (days[0] ? ' · ' + esc(DOW[new Date(days[0] + 'T12:00:00Z').getUTCDay()]) + ' od ' + esc(dm(days[0])) : '') + '</div><h3>' + esc(u.title || u.day) + '</h3>' +
      Object.keys(u.unote).sort((a, c) => a - c).map(w => '<p class="note"><span class="eb">Od trenera · tydz. ' + esc(w) + '</span><br>' + esc(u.unote[w]) + '</p>').join('') +
      '<div class="nbt-w"><table class="nbt"><thead><tr><th scope="col">Ćwiczenie</th><th scope="col">Ostatnio · tydz. ' + esc(dr.prevWeek) + '</th>' + W.map((w, i) => '<th scope="col">Tydz. ' + w + (i === W.length - 1 && dr.deload === w ? ' · lżej' : '') + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }).join('');
  const nUnits = new Set(dr.rows.map(r => r.tydzien + '|' + r.jednostka)).size;
  const flag = '<div class="aiflag">' + SPARK + '<div><b>Szkic AI. Przejrzyj przed wczytaniem.</b>Klient nie zobaczy niczego, dopóki nie klikniesz „Wczytaj do planu”. Pojedyncze liczby poprawisz potem w zakładce Plan.</div></div>';
  const why = '<div class="nbwhy"><div class="eb">Dlaczego tak</div><p class="kom">' + esc(dr.why) + '</p></div>';
  const warn = (dr.warnings || []).length ? '<p class="note lv-warn">' + dr.warnings.map(esc).join('<br>') + '</p>' : '';
  const fix = '<div class="row"><span class="hint">Popraw szkic:</span><div class="chips">' + NB_FIX.map(c => '<button class="chip" type="button" data-nb="fix" data-t="' + c[0] + '"' + dis + '>' + c[1] + '</button>').join('') + '</div></div>' +
    '<div class="row nbfix"><input data-nbf="fix" value="' + esc(st.fix || '') + '" maxlength="300" placeholder="Własna poprawka, np. „przysiad 3 razy w tygodniu”, „bez rwania z zawieszenia”"' + dis + ' aria-label="Własna poprawka szkicu"><button class="b" type="button" data-nb="fixtxt"' + (st.fix && st.fix.trim() && !st.busy ? '' : ' disabled') + '>Popraw</button></div>';
  const go = st.sure
    ? '<span class="err">Wczytać blok ' + esc(dr.blok) + ' do planu? Klient zobaczy go w aplikacji od razu.</span><span class="sp"></span><button class="b" type="button" data-nb="nosure"' + dis + '>Nie</button><button class="b p" type="button" data-nb="load"' + dis + '>' + (st.busy ? 'Wczytuję…' : 'Tak, wczytaj') + '</button>'
    : '<span class="hint">' + (st.busy ? 'AI układa blok, to trwa do minuty…' : 'koszt szkicu ' + pl(dr.cost.toFixed(2)) + ' $ · dziś ' + dr.n + ' z ' + dr.limit) + '</span><span class="sp"></span>' +
      '<button class="b" type="button" data-nb="json"' + dis + '>Pobierz JSON</button><button class="b" type="button" data-nb="drop"' + dis + '>Odrzuć</button><button class="b p" type="button" data-nb="sure"' + dis + '>Wczytaj do planu</button>';
  return flag + '<h2 style="margin:6px 0 2px">Blok ' + esc(dr.blok) + ' · tyg. ' + W[0] + '–' + W[W.length - 1] + ' · od ' + esc(dowDm(dr.start)) + '</h2>' +
    '<p class="hint" style="margin:0 0 8px">' + nUnits + ' jednostek · ' + Object.keys(units).length + ' w tygodniu · ' + dr.rows.length + ' wierszy planu, sprawdzone jak plik z Dysku</p>' +
    why + warn + tables + fix + '<div class="row">' + go + '</div>';
}
function nbCard(d, b){
  const st = NB[CID] = NB[CID] || Object.assign({}, nbDefaults(d, b)), dis = st.busy ? ' disabled' : '';
  const err = st.err ? '<p class="err" role="alert">' + esc(st.err) + (/Ustawienia/.test(st.err) ? ' <a href="#ustawienia">Otwórz Ustawienia</a>' : '') + '</p>' : '';
  let inner;
  if (st.done) inner = '<p class="saved">✓ ' + esc(st.done) + '</p><div class="row"><a class="b" href="#k/' + encodeURIComponent(CID) + '/plan" style="display:inline-flex;align-items:center;text-decoration:none">Otwórz Plan ›</a></div>';
  else if (st.draft) inner = nbDraft(st, b);
  else inner = '<p class="hint" style="margin:0 0 10px">AI układa blok ' + esc(nextBlok(b.blok)) + ' na podstawie bloku ' + esc(b.blok) + ': co wyszło (światła, nieudane, pominięte), ból, Twoje wnioski. Te same jednostki i ćwiczenia, chyba że wpiszesz inaczej.</p>' +
    '<div class="nbform"><label><span class="eb">Tygodnie</span><input type="number" min="1" max="8" data-nbf="weeks" value="' + esc(st.weeks) + '"' + dis + '></label>' +
    '<label><span class="eb">Start (poniedziałek)</span><input type="date" data-nbf="start" value="' + esc(st.start) + '"' + dis + '></label>' +
    '<label class="nbh"><span class="eb">Wskazówki dla AI (opcjonalnie)</span><textarea data-nbf="hint" rows="2" maxlength="600" placeholder="np. więcej pracy nad rwaniem, ostatni tydzień lżejszy, bez martwego ciągu (plecy)"' + dis + '>' + esc(st.hint || '') + '</textarea></label></div>' +
    '<div class="row"><button class="b p ai" type="button" data-nb="go"' + dis + '>' + SPARK + (st.busy ? 'Układam blok…' : 'Szkic następnego bloku') + '</button><span class="hint">' + (st.busy ? 'to trwa do minuty…' : 'ok. 0,10–0,20 $ za szkic') + '</span></div>' +
    '<details class="ctx"><summary>Co dostaje AI (bez imienia klienta)</summary><ul><li>plan bloku ' + esc(b.blok) + ' tydzień po tygodniu i wykonanie: najlepsza seria, światła, nieudane, pominięte</li><li>ból z miejscem, dyspozycja, RPE sesji, komentarze klienta</li>' +
    '<li>Twoje wnioski po bloku i Twoje zasady: kg w dół do 2,5, po samych 🟢 +2,5 kg (małe ciężary: najpierw powtórzenia), rpe_max to sufit, K = korekcyjne, boje bez serii dodatkowych</li><li>tryb (PRO / PROSTY), skala, masters, sufit w bojach</li></ul></details>';
  return '<div class="card nb" id="nb"><h2>Następny blok</h2><div class="kedit nbk" style="border:0;margin:0;padding:0">' + inner + err + '</div></div>';
}
function nextBlok(b){ const m = /^(.*?)(\d+)$/.exec(String(b || '')); return m ? m[1] + (Number(m[2]) + 1) : String(b || 'B') + '2'; }
function nbDraw(){ const el = document.getElementById('nb'); if (!el || !CUR) return; const b = blokLast(CUR); if (b) el.outerHTML = nbCard(CUR, b); }
const blokLast = d => (d.blocks || []).filter(b => String(b.blok) !== '(bez bloku)').sort((a, b) => String(b.od).localeCompare(String(a.od)))[0];
document.addEventListener('input', e => { const t = e.target.closest('#nb [data-nbf]'); if (!t || !CID) return; const st = NB[CID]; st[t.dataset.nbf] = t.dataset.nbf === 'weeks' ? Number(t.value) : t.value;
  if (t.dataset.nbf === 'fix') { const b = document.querySelector('#nb [data-nb="fixtxt"]'); if (b) b.disabled = !t.value.trim(); } });
document.addEventListener('click', async e => {
  const el = e.target.closest('#nb [data-nb]'); if (!el || !CUR) return;
  const k = el.dataset.nb, cid = CID, st = NB[cid], b = blokLast(CUR);
  st.err = '';
  if (k === 'sure') { st.sure = true; return nbDraw(); }
  if (k === 'nosure') { st.sure = false; return nbDraw(); }
  if (k === 'drop') { NB[cid] = Object.assign({}, nbDefaults(CUR, b), { weeks: st.weeks, start: st.start, hint: st.hint }); return nbDraw(); }
  if (k === 'json') {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(st.draft.rows, null, 1)], { type: 'application/json' }));
    a.download = cid + '_' + st.draft.blok + '_szkic.json'; document.body.appendChild(a); a.click(); a.remove(); return;
  }
  if (k === 'go' || k === 'fix' || k === 'fixtxt') {
    if (k === 'go' && !(st.weeks >= 1 && st.weeks <= 8)) { st.err = 'Tygodnie: 1–8.'; return nbDraw(); }
    const opt = { blok: b.blok, weeks: st.weeks, start: st.start, hint: (st.hint || '').trim() };
    if (k !== 'go') { opt.tweak = k === 'fix' ? el.dataset.t : 'tekst'; opt.text = k === 'fixtxt' ? st.fix.trim() : ''; opt.draft = st.draft.rows; }
    st.busy = true; nbDraw();
    try { st.draft = await guard(api('trBlokPlan', cid, opt)); st.fix = ''; }
    catch (err) { if (!err.auth) st.err = err.message; }
    st.busy = false; if (CID === cid) nbDraw();
    return;
  }
  if (k === 'load') {
    st.busy = true; nbDraw();
    try { const r = await guard(api('trBlokWczytaj', cid, st.draft.rows)); NB[cid] = { done: r.text }; delete CK[cid]; }
    catch (err) { st.busy = false; st.sure = false; if (!err.auth) st.err = err.message; }
    if (CID === cid) nbDraw();
  }
});

/* ---------- zamknięcie bloku: wnioski (tylko trener) i „dla klienta” (Postęp → Blok w aplikacji), szkic AI obu naraz (trBlokSzkic), zapis trBlok ---------- */
const BD = {};                                   // klient|blok → {w, k, ai, busy, err, ok, edit, cost, n, limit}; tylko w pamięci strony
const bdKey = b => CID + '|' + b.blok;
function blokBox(b){
  const st = BD[bdKey(b)] || {}, sw = String(b.wnioski || '').trim(), sk = String(b.dla_klienta || '').trim(), dis = st.busy ? ' disabled' : '';
  const box = inner => '<div class="kedit bedit" data-b="' + esc(b.blok) + '">' + inner + (st.err ? '<p class="err" role="alert">' + esc(st.err) + (/Ustawienia/.test(st.err) ? ' <a href="#ustawienia">Otwórz Ustawienia</a>' : '') + '</p>' : '') + '</div>';
  if ((sw || sk) && !st.edit) return box('<div class="eb">Wnioski (tylko Ty)</div>' + (sw ? '<p class="kom">' + esc(sw) + '</p>' : '<p class="muted">Brak.</p>') +
    '<div class="eb" style="margin-top:10px">Dla klienta</div>' + (sk ? '<p class="kom">' + esc(sk) + '</p>' : '<p class="muted">Brak.</p>') +
    '<div class="row">' + (st.ok ? '<span class="saved">✓ Zapisano · klient zobaczy notatkę w aplikacji: Postęp → Blok</span>' : '') + '<span class="sp"></span><button class="b" type="button" data-k="edit">Edytuj</button></div>');
  const w = st.w !== undefined ? st.w : sw, k = st.k !== undefined ? st.k : sk;
  const flag = st.ai ? '<div class="aiflag">' + SPARK + '<div><b>Szkic AI. Przeczytaj i popraw przed zapisem.</b>Klient nie zobaczy niczego, dopóki nie klikniesz „Zapisz”.</div></div>' : '';
  const chips = st.ai ? '<div class="row"><span class="hint">Popraw szkic:</span><div class="chips">' +
    [['krocej', 'Krócej'], ['cieplej', 'Cieplej (dla klienta)'], ['inny', 'Inny szkic']].map(c => '<button class="chip" type="button" data-k="ai" data-t="' + c[0] + '"' + dis + '>' + c[1] + '</button>').join('') + '</div></div>' : '';
  const hint = st.busy ? 'AI pisze szkic, to trwa kilka–kilkanaście sekund…' : st.ai && st.cost !== undefined ? 'koszt szkicu ' + pl(st.cost.toFixed(3)) + ' $ · dziś ' + st.n + ' z ' + st.limit : 'Jeden szkic pisze oba pola.';
  return box(flag + '<div class="eb" style="margin-bottom:6px">Wnioski (tylko Ty)</div><textarea data-k="w" aria-label="Wnioski z bloku ' + esc(b.blok) + '" placeholder="Co zadziałało, co nie, co zmieniasz w następnym bloku…"' + dis + '>' + esc(w) + '</textarea>' +
    '<div class="eb" style="margin:10px 0 6px">Dla klienta <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· zobaczy w aplikacji: Postęp → Blok</span></div><textarea data-k="k" aria-label="Notatka dla klienta do bloku ' + esc(b.blok) + '" placeholder="Kilka zdań do klienta o tym bloku…"' + dis + '>' + esc(k) + '</textarea>' + chips +
    '<div class="row">' + (st.ai ? '' : '<button class="b ai" type="button" data-k="ai"' + dis + '>' + SPARK + (st.busy ? 'Piszę szkic…' : 'Szkic AI') + '</button>') +
    '<span class="hint">' + hint + '</span><span class="sp"></span>' + (sw || sk ? '<button class="b" type="button" data-k="cancel"' + dis + '>Anuluj</button>' : '') +
    '<button class="b p" type="button" data-k="save"' + dis + '>Zapisz</button></div>' +
    '<details class="ctx"><summary>Co dostaje AI (bez imienia klienta)</summary><ul><li>liczby z tego bloku (jak w karcie wyżej) i z poprzedniego bloku do porównania</li>' +
    '<li>tydzień po tygodniu: wykonanie, tonaż, sRPE, samopoczucie, ból, dyspozycja</li><li>ćwiczenia A: e1RM na początku i na końcu, boje: najlepsze zaliczone i spalone</li><li>komentarze klienta i pominięte ćwiczenia, plan następnego bloku, jeśli już jest</li><li>Twoje wcześniejsze wnioski, żeby pisało Twoim stylem</li></ul></details>');
}
function blokDraw(blok){
  const b = ((CUR && CUR.blocks) || []).find(x => String(x.blok) === blok), el = document.querySelector('.bedit[data-b="' + CSS.escape(blok) + '"]'); if (!b || !el) return;
  el.outerHTML = blokBox(b);
}
document.addEventListener('input', e => { const t = e.target.closest('.bedit textarea'); if (!t || !CUR) return; const blok = t.closest('.bedit').dataset.b, b = CUR.blocks.find(x => String(x.blok) === blok);
  (BD[bdKey(b)] = BD[bdKey(b)] || {})[t.dataset.k] = t.value; });
document.addEventListener('click', async e => {
  const el = e.target.closest('.bedit [data-k]'); if (!el || el.tagName === 'TEXTAREA' || !CUR) return;
  const blok = el.closest('.bedit').dataset.b, b = CUR.blocks.find(x => String(x.blok) === blok), st = BD[bdKey(b)] = BD[bdKey(b)] || {}, cid = CID;
  const cur = f => st[f] !== undefined ? st[f] : String((f === 'w' ? b.wnioski : b.dla_klienta) || '');
  st.err = ''; st.ok = false;
  if (el.dataset.k === 'edit') { st.edit = true; return blokDraw(blok); }
  if (el.dataset.k === 'cancel') { BD[bdKey(b)] = {}; return blokDraw(blok); }
  if (el.dataset.k === 'save') {
    st.busy = true; blokDraw(blok);
    try { const r = await guard(api('trBlok', cid, blok, cur('w'), cur('k'))); b.wnioski = r.wnioski; b.dla_klienta = r.dla_klienta; BD[bdKey(b)] = { ok: true };
      const pb = PUL.blocks.find(x => x.id === cid && x.block === blok); if (pb && String(r.wnioski).trim()) PUL.blocks.splice(PUL.blocks.indexOf(pb), 1); }
    catch (err) { st.busy = false; if (!err.auth) st.err = err.message; }
    if (CID === cid) blokDraw(blok);
    return;
  }
  if (el.dataset.k === 'ai') {
    const tweak = el.dataset.t || '';
    st.busy = true; blokDraw(blok);
    try { const r = await guard(api('trBlokSzkic', cid, blok, { tweak, draft: tweak ? { w: cur('w'), k: cur('k') } : null }));
      Object.assign(st, { w: r.wnioski, k: r.dla_klienta, ai: true, edit: true, cost: r.cost, n: r.n, limit: r.limit }); }
    catch (err) { if (!err.auth) st.err = err.message; }
    finally { st.busy = false; }
    if (CID === cid) blokDraw(blok);
  }
});

/* ---------- karta klienta → Plan: szybka zmiana serii, powt., kg, %, RPE, uwag i notatki do jednostki (trPlan) ----------
 * Tylko niezrobione jednostki trenera (bez wpisu w Sesjach i bez serii w Logu); własne treningi klienta pominięte.
 * Szkic zmian (PD) tylko w pamięci strony; po zapisie wiersze CUR.plan dostają wartości potwierdzone przez serwer. */
const PD = {};                                  // klient|tydzień|jednostka → {edit, v: {nr: {pole: tekst}}, unote, next, busy, ok, err, all}
const PE_F = [['sets', 'Serie'], ['reps', 'Powt.'], ['kg', 'kg'], ['pct', '%'], ['rpe', 'RPE max'], ['note', 'Uwagi']];
const pdKey = u => CID + '|' + u;
const PE_OLD = 14;                              // zaległe starsze niż 14 dni nie są już pokazywane
const peTxt = (r, f) => { const v = r[f];
  if (v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v))) return '';
  if (f === 'pct') return pl(Math.round(Number(v) * 1000) / 10);
  return typeof v === 'number' ? pl(v) : String(v); };
const peNum = v => { const x = Number(String(v).replace(',', '.').trim()); return String(v).trim() !== '' && isFinite(x) ? x : NaN; };
// ta sama reguła co trPlanVal_ w Trener.gs (komunikat albo '')
function peBad(f, v){
  v = String(v === undefined || v === null ? '' : v).trim(); const x = peNum(v);
  if (f === 'sets') return Number.isInteger(x) && x >= 1 && x <= 40 ? '' : 'Serie: liczba 1–40.';
  if (f === 'reps') return v && v.length <= 12 ? '' : 'Powtórzenia: np. 5, 6-8, 8/str, 30 s.';
  if (f === 'kg') return !v || (isFinite(x) ? x >= 0 && x <= 500 : v.length <= 10) ? '' : 'kg: liczba 0–500 albo krótki tekst (BW, guma).';
  if (f === 'pct') return !v || (x > 0 && x <= 150) ? '' : '%: liczba 1–150 albo puste.';
  if (f === 'rpe') return !v || (x >= 5 && x <= 10 && Math.round(x * 2) === x * 2) ? '' : 'RPE: 5–10 co 0,5 albo puste.';
  if (f === 'note') return v.length <= 300 ? '' : 'Uwagi: najwyżej 300 znaków.';
  return '';
}
function planUnits(d, dates){
  const done = TL.doneUnits(d.plan, d.sessions, d.logs);                     // Sesje albo seria A/B (jak unitsDone_ w Code.gs)
  const by = {};
  (d.plan || []).filter(r => !r.own).forEach(r => { const u = uKey(r.week, r.day); (by[u] = by[u] || { u, week: r.week, day: r.day, title: r.title, block: r.block, date: dates[u] || r.date, rows: [] }).rows.push(r); });
  return Object.values(by).map(x => Object.assign(x, { done: !!done[x.u], rows: x.rows.sort((a, b) => a.order - b.order), unote: (x.rows.find(r => r.unote) || {}).unote || '' }))
    .sort((a, b) => a.week - b.week || String(a.date || '9').localeCompare(String(b.date || '9')) || String(a.day).localeCompare(String(b.day)));
}
// kolejne tygodnie tej samej jednostki w tym samym bloku, niezrobione (jak w trPlanEdit_)
const peLater = (units, x) => units.filter(y => !y.done && y.day === x.day && y.week > x.week && String(y.block || '') === String(x.block || '')).map(y => y.week);
function peChanges(x, st){
  const out = [];
  x.rows.forEach(r => { const v = (st.v || {})[r.order] || {}; Object.keys(v).forEach(f => { if (String(v[f]).trim() !== peTxt(r, f)) out.push([r.order, f]); }); });
  return out;
}
function planList(d, dates, today){
  // niezrobione; opuszczone dawniej niż 14 dni temu pomijamy (już ich nikt nie zrobi); zrobione z tych samych tygodni jako jedna linia
  const units = planUnits(d, dates), open = units.filter(x => !x.done && !(x.date && x.date < TL.addDays(today, -PE_OLD)));
  if (!open.length) return '<div class="card es"><b>Brak niezrobionych jednostek</b>Wszystko z planu jest zrobione. Nowy blok przygotujesz w zakładce Bloki („Następny blok”) albo wczytasz plikiem planu (folder _plany na Dysku).</div>';
  const st0 = PD[pdKey('*')] || {}, w0 = open[0].week, show = st0.all ? open : open.filter(x => x.week < w0 + 2 || PD[pdKey(x.u)] && PD[pdKey(x.u)].edit);
  const rest = open.length - show.length, weeks = [...new Set(show.map(x => x.week))];
  const id = encodeURIComponent(d.cfg.id);
  return weeks.map(w => {
    const all = units.filter(x => x.week === w), ds = all.map(x => x.date).filter(Boolean).sort(), mon = ds.length ? TL.mondayOf(ds[0]) : '';
    const blk = (all.find(x => x.block) || {}).block, nDone = all.filter(x => x.done).length;
    const wh = '<div class="wkh"><h2>Tydzień ' + esc(w) + '</h2><span class="muted">' + [mon ? dm(mon) + '–' + dm(TL.addDays(mon, 6)) : '', blk ? 'blok ' + esc(blk) : '', nDone + ' z ' + all.length + ' zrobione'].filter(Boolean).join(' · ') + '</span></div>';
    const done = all.filter(x => x.done).map(x => '<a class="pdn" href="#k/' + id + '/sesje"><span class="ok">✓</span><b>' + esc(x.day) + (x.title ? ' · ' + esc(x.title) : '') + '</b><span class="muted">zrobiona' + (x.date ? ' ' + esc(dowDm(x.date)) : '') + '</span><span class="sp"></span><span class="muted">Sesja ›</span></a>').join('');
    return wh + done + show.filter(x => x.week === w).map(x => '<div class="card pu" data-u="' + esc(x.u) + '">' + puInner(x, units, today) + '</div>').join('');
  }).join('') +
    (rest > 0 ? '<p><button class="b" type="button" data-pall>Pokaż dalsze jednostki (' + rest + ')</button></p>' : '') +
    '<p class="legend">Zmiana trafia od razu do arkusza; klient zobaczy ją przy następnym otwarciu aplikacji. Zrobione jednostki są zablokowane. Ponowny import pliku z tym samym blokiem nadpisze zmiany w niezrobionych jednostkach.</p>';
}
/** ćwiczenie w widoku (bez edycji): „3 × 5 · 47 kg · 75% · RPE ≤ 8” w jednej linii, uwagi pod spodem */
function puLine(r){
  const t = f => peTxt(r, f), sr = [t('sets'), t('reps')].filter(Boolean).join(' × ');
  const rx = [sr, t('kg') && t('kg') !== '0' ? t('kg') + (/^[\d,.]+$/.test(t('kg')) ? ' kg' : '') : '', t('pct') ? t('pct') + '%' : '', t('rpe') ? 'RPE ≤ ' + t('rpe') : ''].filter(Boolean).map(esc).join(' · ');
  return '<div class="pxl"><span class="pp pp-' + esc(String(r.prio || '').toUpperCase()) + '">' + esc(r.prio || '') + '</span><div class="pxt"><b>' + esc(r.name) + (r.added ? ' <span class="muted">· dodane przez klienta</span>' : '') + (r.coach ? ' <span class="muted">· dodane w „Prowadź”</span>' : '') + '</b>' +
    '<span class="mono">' + (rx || '–') + '</span>' + (t('note') ? '<small>' + esc(t('note')) + '</small>' : '') + '</div></div>';
}
function puInner(x, units, today){
  const st = PD[pdKey(x.u)] || {}, ed = !!st.edit, dis = st.busy ? ' disabled' : '';
  const pill = !x.date ? '<span class="pill">bez daty</span>' : x.date < today ? '<span class="pill lv-warn">zaległa</span>' : x.date === today ? '<span class="pill lv-ok">dziś</span>' : '';
  const eb = esc(x.date ? dowDm(x.date) : 'bez daty');            // tydzień i blok są w nagłówku tygodnia
  const hd = '<div class="puh"><div><div class="eb">' + eb + '</div><h2>' + esc(x.day) + (x.title ? ' · ' + esc(x.title) : '') + '</h2></div><span class="sp"></span>' + pill +
    (ed ? '' : go(liveHref(CID, x.week, x.day), '▶ Prowadź', 'acc') + '<button class="b" type="button" data-pe="edit">Edytuj</button>') + '</div>';
  const un = ed ? '<label class="pun"><span class="eb">Od trenera · notatka do całej jednostki</span><textarea data-pf="unote" rows="2" maxlength="500" placeholder="np. Przysiad: pauza 2 s na dole, ostatnia seria bez walki."' + dis + '>' + esc(st.unote !== undefined ? st.unote : x.unote) + '</textarea></label>'
    : x.unote ? '<p class="note pun"><span class="eb">Od trenera</span><br>' + esc(x.unote) + '</p>' : '';
  const head = '<div class="per peh"><span></span><span>Ćwiczenie</span>' + PE_F.map(f => '<span>' + f[1] + '</span>').join('') + '</div>';
  if (!ed) return hd + un + '<div class="pxs">' + x.rows.map(puLine).join('') + '</div>' + puFoot(x, units, st);
  const rows = x.rows.map(r => {
    const v = (st.v || {})[r.order] || {};
    const cell = f => { const old = peTxt(r, f[0]);
      if (!ed) return '<span class="pv-' + f[0] + (old ? '' : ' muted') + '"><i class="lb">' + f[1] + '</i>' + (old ? esc(old) : '–') + '</span>';
      const val = v[f[0]] !== undefined ? v[f[0]] : old, chg = String(val).trim() !== old, bad = peBad(f[0], val);
      return '<label class="pc pv-' + f[0] + (chg ? ' chg' : '') + (bad ? ' bad' : '') + '"><i class="lb">' + f[1] + '</i><input data-pf="' + f[0] + '" data-o="' + r.order + '" value="' + esc(val) + '"' +
        (f[0] === 'note' ? ' maxlength="300"' : ' inputmode="' + (f[0] === 'reps' || f[0] === 'kg' ? 'text' : 'decimal') + '"') + ' aria-label="' + esc(r.name + ': ' + f[1]) + '"' + (bad ? ' aria-invalid="true" title="' + esc(bad) + '"' : '') + dis + '>' +
        '<small class="was">' + (chg ? 'było ' + esc(old || '–') : '') + '</small></label>'; };
    return '<div class="per"><span class="pp pp-' + esc(String(r.prio || '').toUpperCase()) + '">' + esc(r.prio || '') + '</span><b class="pn">' + esc(r.name) + (r.added ? ' <span class="muted">· dodane przez klienta</span>' : '') + '</b>' + PE_F.map(cell).join('') + '</div>';
  }).join('');
  return hd + un + '<div class="pet' + (ed ? ' ed' : '') + '">' + head + rows + '</div>' + puFoot(x, units, st);
}
function puFoot(x, units, st){
  const ed = !!st.edit, dis = st.busy ? ' disabled' : '';
  let foot = '';
  if (ed) {
    const ch = peChanges(x, st), un = st.unote !== undefined && st.unote.trim() !== x.unote.trim(), n = ch.length + (un ? 1 : 0);
    const bad = x.rows.some(r => PE_F.some(f => { const v = ((st.v || {})[r.order] || {})[f[0]]; return v !== undefined && peBad(f[0], v); }));
    const later = peLater(units, x);
    foot = '<div class="pef">' + (later.length ? '<label class="pnx"><input type="checkbox" data-pf="next"' + (st.next ? ' checked' : '') + dis + '><span><b>Także kolejne tygodnie tej jednostki</b> (tydz. ' + esc(later.length > 1 ? later[0] + '–' + later[later.length - 1] : later[0]) + ', ten sam blok, niezrobione): kg i % o tę samą różnicę, serie, powt., RPE i uwagi tak samo.</span></label>' : '') +
      '<div class="row">' + (st.err ? '<span class="err" role="alert">' + esc(st.err) + '</span>' : bad ? '<span class="err">Popraw zaznaczone pola.</span>' : '') + '<span class="sp"></span>' +
      '<button class="b" type="button" data-pe="cancel"' + dis + '>Anuluj</button><button class="b p" type="button" data-pe="save"' + (n && !bad && !st.busy ? '' : ' disabled') + '>' + (st.busy ? 'Zapisuję…' : 'Zapisz zmiany' + (n ? ' (' + n + ')' : '')) + '</button></div></div>';
  } else if (st.ok) foot = '<p class="saved" style="margin:8px 0 0">✓ ' + esc(st.ok) + '</p>';
  return '<div class="pfw">' + foot + '</div>';
}
function puUnit(u){
  const units = planUnits(CUR, sesDates(CUR)), unit = units.find(y => y.u === u);
  return unit ? { unit, units } : null;
}
function puDraw(u, focus){
  const el = document.querySelector('.pu[data-u="' + CSS.escape(u) + '"]'); if (!el || !CUR) return;
  const x = puUnit(u); if (!x) return;
  el.innerHTML = puInner(x.unit, x.units, PUL.today);
  if (focus) { const i = el.querySelector(focus); if (i) { i.focus(); try { const n = i.value.length; i.setSelectionRange(n, n); } catch (e) {} } }
}
const puOf = el => { const c = el.closest('.pu'); return c && c.dataset.u; };
document.addEventListener('input', e => {
  const t = e.target.closest('.pu [data-pf]'); if (!t || !CUR) return;
  const u = puOf(t), st = PD[pdKey(u)] = PD[pdKey(u)] || {}, f = t.dataset.pf;
  st.err = '';
  if (f === 'next') { st.next = t.checked; return; }
  if (f === 'unote') st.unote = t.value; else ((st.v = st.v || {})[t.dataset.o] = st.v[t.dataset.o] || {})[f] = t.value;
  const x = puUnit(u); if (!x) return;
  if (f !== 'unote') {          // tylko ta komórka i stopka: bez przerysowania karty, żeby nie gubić kursora i klawiatury telefonu
    const r = x.unit.rows.find(y => String(y.order) === t.dataset.o), old = peTxt(r, f), chg = t.value.trim() !== old, bad = peBad(f, t.value), c = t.closest('.pc');
    c.classList.toggle('chg', chg); c.classList.toggle('bad', !!bad); c.querySelector('.was').textContent = chg ? 'było ' + (old || '–') : '';
    if (bad) { t.setAttribute('aria-invalid', 'true'); t.title = bad; } else { t.removeAttribute('aria-invalid'); t.removeAttribute('title'); }
  }
  t.closest('.pu').querySelector('.pfw').outerHTML = puFoot(x.unit, x.units, st);
});
document.addEventListener('click', async e => {
  if (e.target.closest('[data-pall]')) { PD[pdKey('*')] = { all: true }; route(); return; }
  const b = e.target.closest('.pu [data-pe]'); if (!b || !CUR) return;
  const u = puOf(b), k = pdKey(u), cid = CID, st = PD[k] = PD[k] || {};
  if (b.dataset.pe === 'edit') { PD[k] = { edit: true, v: {} }; puDraw(u, '[data-pf="kg"]'); return; }
  if (b.dataset.pe === 'cancel') { PD[k] = {}; puDraw(u); return; }
  if (b.dataset.pe !== 'save') return;
  const [week, day] = [Number(u.split('|')[0]), u.split('|').slice(1).join('|')];
  const rows = (CUR.plan || []).filter(r => uKey(r.week, r.day) === u);
  const ex = rows.map(r => { const v = (st.v || {})[r.order] || {}, o = { order: r.order };
    Object.keys(v).forEach(f => { if (String(v[f]).trim() !== peTxt(r, f)) o[f] = String(v[f]).trim(); }); return o; }).filter(o => Object.keys(o).length > 1);
  const unote0 = (rows.find(r => r.unote) || {}).unote || '';
  const req = { week, day, ex, next: !!st.next };
  if (st.unote !== undefined && st.unote.trim() !== unote0.trim()) req.unote = st.unote.trim();
  st.busy = true; st.err = ''; puDraw(u);
  try {
    const r = await guard(api('trPlan', cid, req));
    (r.rows || []).forEach(c => { const row = (CK[cid].plan || []).find(p => p.week === c.week && p.day === c.day && p.order === c.order); if (row) Object.assign(row, c.f); });
    PD[k] = { ok: 'Zapisano ' + r.n + (r.n === 1 ? ' zmianę' : r.n % 10 >= 2 && r.n % 10 <= 4 && (r.n % 100 < 12 || r.n % 100 > 14) ? ' zmiany' : ' zmian') + (r.weeks && r.weeks.length > 1 ? ' w tyg. ' + r.weeks.join(', ') : '') + ' · klient zobaczy je przy następnym otwarciu aplikacji' };
    if (CID === cid && r.weeks && r.weeks.length > 1) { route(); return; }
  } catch (err) { st.busy = false; if (!err.auth) st.err = err.message; }
  if (CID === cid) puDraw(u);
});

function dyspList(d){
  const rd = (d.readiness || []).slice().sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 30);
  if (!rd.length) return '<div class="card es"><b>Brak wpisów dyspozycji</b>Klient jeszcze nie zapisał dyspozycji dnia.</div>';
  return '<div class="card"><h2>Dyspozycja · ostatnie wpisy</h2><div class="tw"><table><thead><tr><th>Dzień</th><th>Werdykt</th><th>CMJ śr.</th><th>Hooper</th><th>Prędkość</th><th>Powody</th></tr></thead><tbody>' + rd.map(r =>
    '<tr><td class="nw">' + esc(dowDm(String(r.data).slice(0, 10))) + '</td><td><span class="pill ' + (/zmęcz/i.test(r.werdykt) ? 'lv-bad' : /uwaga/i.test(r.werdykt) ? 'lv-warn' : /ok/i.test(r.werdykt) ? 'lv-ok' : '') + '">' + esc(r.werdykt || '–') + '</span></td>' +
    '<td class="mono">' + (nf(r.cmj_sr) > 0 ? fmt1(nf(r.cmj_sr)) + ' cm' : '–') + '</td><td class="mono">' + esc(r.hooper_suma || '–') + '</td><td class="mono">' + (nf(r.vbt_test) > 0 ? pl(r.vbt_test) + ' m/s' : '–') + '</td><td>' + esc(r.powody || '') + '</td></tr>').join('') + '</tbody></table></div></div>';
}

start();
// service worker (ten sam co w aplikacji): filmy strumieniem z nagłówkiem biletu (film-strumien/ w sw.js)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
