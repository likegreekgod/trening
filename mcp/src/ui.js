/**
 * Karty w Claude (MCP Apps, D2, 27.11.2026): HTML wyświetlany przez claude.ai w ramce obok wyniku narzędzia.
 * Karta „Dziś” = ekran Dziś panelu w skrócie: kto trenuje, decyzje o propozycjach asystentów AI (Zatwierdź / Odrzuć / Przeczytane / Cofnij)
 * i to, co wymaga uwagi. Bez bibliotek i bez sieci: dane przychodzą z wyniku narzędzia „dzis” (postMessage, protokół ui/* 2026-01-26),
 * a przyciski wołają narzędzie „decyzja_asystent” przez gospodarza (tools/call), więc idą tą samą drogą co zapis z czatu.
 */

export const UI_MIME = 'text/html;profile=mcp-app';
export const UI_DZIS = 'ui://sila-z-ruchu/dzis.html';
export const UI_KLIENT = 'ui://sila-z-ruchu/klient.html';
export const UI_FILM = 'ui://sila-z-ruchu/film.html';
export const PANEL = 'https://likegreekgod.github.io/trening/trener.html';   // panel trenera (GitHub Pages), linki z kart przez ui/open-link

const CSS = `
:root{color-scheme:light dark;
 --bg:var(--color-background-primary,#fff);--bg2:var(--color-background-secondary,#f4f2ee);--tx:var(--color-text-primary,#1d1b18);
 --tx2:var(--color-text-secondary,#6b665e);--bd:var(--color-border-tertiary,#e4e0d8);--ac:#d9622b;--ok:#2f8a4e;--warn:#c27a12;--bad:#c23b2b;
 --r:var(--border-radius-md,8px);--font:var(--font-sans,system-ui,-apple-system,"Segoe UI",sans-serif)}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:var(--color-background-primary,#1f1e1c);--bg2:var(--color-background-secondary,#2a2926);
 --tx:var(--color-text-primary,#f2efe9);--tx2:var(--color-text-secondary,#a9a39a);--bd:var(--color-border-tertiary,#3a3834);--ac:#ef7a43;--ok:#5cbf7c;--warn:#e3a33c;--bad:#ef6b5a}}
:root[data-theme=dark]{--bg:var(--color-background-primary,#1f1e1c);--bg2:var(--color-background-secondary,#2a2926);
 --tx:var(--color-text-primary,#f2efe9);--tx2:var(--color-text-secondary,#a9a39a);--bd:var(--color-border-tertiary,#3a3834);--ac:#ef7a43;--ok:#5cbf7c;--warn:#e3a33c;--bad:#ef6b5a}
*{box-sizing:border-box}
html,body{margin:0;background:transparent;color:var(--tx);font:14px/1.4 var(--font)}
#app{padding:12px 14px 14px}
.hd{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:10px}
.hd b{font-size:17px}.hd span{color:var(--tx2);font-size:12px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}
.st{background:var(--bg2);border-radius:var(--r);padding:7px 8px}.st b{display:block;font-size:18px}.st span{font-size:12px;color:var(--tx2)}
h3{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--tx2);margin:14px 0 6px;font-weight:600}
.row{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--bd)}
.row:first-of-type{border-top:0}
.nm{font-weight:600;min-width:0}.sub{color:var(--tx2);font-size:12px}
.grow{flex:1;min-width:0}
.pill{font-size:12px;border-radius:999px;padding:2px 8px;white-space:nowrap;border:1px solid var(--bd)}
.p-wait{color:var(--tx2)}.p-live{color:var(--ac);border-color:var(--ac)}.p-done{color:var(--ok);border-color:var(--ok)}
.bar{height:4px;background:var(--bd);border-radius:2px;margin-top:4px;overflow:hidden}.bar i{display:block;height:100%;background:var(--ac)}
.card{background:var(--bg2);border-radius:var(--r);padding:9px 10px;margin-bottom:6px}
.card .co{margin:3px 0}.card .why{color:var(--tx2);font-size:12px}
.tag{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--tx2)}.tag.hot{color:var(--bad)}
.btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
button{font:inherit;font-size:13px;min-height:32px;padding:4px 12px;border-radius:var(--r);border:1px solid var(--bd);background:var(--bg);color:var(--tx);cursor:pointer}
button.pri{background:var(--ac);border-color:var(--ac);color:#fff}
button:disabled{opacity:.5;cursor:default}
textarea{width:100%;font:inherit;font-size:13px;border:1px solid var(--bd);border-radius:var(--r);background:var(--bg);color:var(--tx);padding:6px;margin-top:6px;min-height:54px;resize:vertical}
label.ck{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--tx2);margin-top:4px}
.done{color:var(--ok);font-size:13px;margin-top:6px}.err{color:var(--bad);font-size:13px;margin-top:6px}
.sig{padding:5px 0;border-top:1px solid var(--bd)}.sig:first-of-type{border-top:0}
.sig .s{font-size:13px}
.empty{color:var(--tx2);font-size:13px;padding:4px 0}
.more{background:none;border:0;color:var(--ac);padding:4px 0;min-height:0}
@media (max-width:420px){.stats{grid-template-columns:repeat(2,1fr)}}
`;

/* Skrypt karty: wykonuje się w ramce gospodarza, bez dostępu do sieci. Treść z danych zawsze przez textContent. */
/* Wspólna część kart: protokół ui/* (postMessage do gospodarza), motyw, pomocnicze funkcje rysowania. Karta dokłada własne draw(). */
const JS_TOP = `
(function(){
var P = window.parent, N = 0, WAIT = {}, D = null, READY = false, OPEN = {}, MORE = false;
function send(m){ P.postMessage(m, '*'); }
function req(method, params){ return new Promise(function(ok, no){ var id = ++N; WAIT[id] = {ok: ok, no: no}; send({jsonrpc: '2.0', id: id, method: method, params: params || {}}); }); }
function note(method, params){ send({jsonrpc: '2.0', method: method, params: params || {}}); }
window.addEventListener('message', function(ev){
  var m = ev.data; if (!m || m.jsonrpc !== '2.0') return;
  if (m.id !== undefined && WAIT[m.id] && !m.method){ var w = WAIT[m.id]; delete WAIT[m.id]; if (m.error) w.no(new Error(m.error.message || 'błąd')); else w.ok(m.result); return; }
  if (m.method === 'ui/notifications/tool-result') { data(m.params); }
  else if (m.method === 'ui/notifications/host-context-changed') { ctx(m.params); }
  else if (m.method === 'ui/resource-teardown' && m.id !== undefined) { send({jsonrpc: '2.0', id: m.id, result: {}}); }
  else if (m.method === 'ping' && m.id !== undefined) { send({jsonrpc: '2.0', id: m.id, result: {}}); }
});
function ctx(c){
  if (!c) return;
  if (c.theme) document.documentElement.setAttribute('data-theme', c.theme);
  var v = c.styles && c.styles.variables; if (v) Object.keys(v).forEach(function(k){ if (v[k]) document.documentElement.style.setProperty(k, v[k]); });
}
function out(r){ if (!r) return null; if (r.structuredContent) return r.structuredContent; try { return JSON.parse(r.content[0].text); } catch (e) { return null; } }
function data(r){ var x = out(r); if (r && r.isError) { D = {blad: (r.content && r.content[0] && r.content[0].text) || 'Błąd'}; } else if (x) D = x; draw(); }
function el(t, cls, txt){ var e = document.createElement(t); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = String(txt); return e; }
function add(p){ for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }
var DNI = ['niedziela','poniedziałek','wtorek','środa','czwartek','piątek','sobota'];
function dayTxt(d){ var m = /^(\\d{4})-(\\d\\d)-(\\d\\d)/.exec(d || ''); if (!m) return ''; var x = new Date(+m[1], +m[2] - 1, +m[3]); return DNI[x.getDay()] + ' ' + (+m[3]) + '.' + m[2]; }
function hm(iso){ var x = new Date(iso); return isNaN(x) ? '' : ('0' + x.getHours()).slice(-2) + ':' + ('0' + x.getMinutes()).slice(-2); }
var ST = {'czeka': 'p-wait', 'w trakcie': 'p-live', 'zrobione': 'p-done'};
function stat(n, t){ return add(el('div', 'st'), el('b', '', n), el('span', '', t)); }

`;

const JS_BOT = `var LH = 0;
function size(){ if (!READY) return; var h = Math.ceil(document.documentElement.getBoundingClientRect().height); if (h !== LH) { LH = h; note('ui/notifications/size-changed', {height: h}); } }
if (window.ResizeObserver) new ResizeObserver(size).observe(document.documentElement);
draw();
function start(n){
  req('ui/initialize', {protocolVersion: '2026-01-26', appInfo: {name: '@@NAME@@', version: '1.1.0'}, appCapabilities: {}}).then(function(r){
    ctx(r && r.hostContext); READY = true; note('ui/notifications/initialized', {}); size();
  }).catch(function(){ if (n < 4) setTimeout(function(){ start(n + 1); }, 300 * Math.pow(2, n)); else { D = {blad: 'Karta nie połączyła się z Claude. Zapytaj ponownie.'}; draw(); } });
}
start(0);
})();
`;

/* Karta „Dziś”. */
const JS_DZIS = `function decide(a, mode, box){
  var why = box.querySelector('textarea'), z = box.querySelector('input[type=checkbox]');
  var args = {pid: a.pid, decyzja: mode};
  if (why && why.value.trim()) args.powod = why.value.trim();
  if (z && z.checked) args.zasada = true;
  if (mode === 'nie' && !args.powod) { msg(box, 'Wpisz powód: bot klienta go dostanie.', true); return; }
  [].forEach.call(box.querySelectorAll('button'), function(b){ b.disabled = true; });
  req('tools/call', {name: 'decyzja_asystent', arguments: args}).then(function(r){
    if (r && r.isError) throw new Error((r.content && r.content[0] && r.content[0].text) || 'Nie udało się zapisać.');
    a._done = {tak: '✓ Zatwierdzone, plan zmieniony', nie: '✕ Odrzucone', czytane: '✓ Przeczytane', cofnij: '↶ Cofnięte'}[mode];
    draw();
  }).catch(function(e){ [].forEach.call(box.querySelectorAll('button'), function(b){ b.disabled = false; }); msg(box, e.message || String(e), true); });
}
function msg(box, t, bad){ var m = box.querySelector('.err,.done'); if (m) m.remove(); box.appendChild(el('div', bad ? 'err' : 'done', t)); size(); }

function agentCard(a, auto){
  var c = el('div', 'card');
  var tg = auto ? 'zrobił sam' + (a.kiedy ? ' · ' + dayTxt(a.kiedy) : '') : (a.rodzaj || 'propozycja') + (a.data ? ' · ' + dayTxt(a.data) : '');
  add(c, el('div', 'tag' + (a.pilne ? ' hot' : ''), a.klient + ' · ' + tg + (a.pilne ? ' · pilne' : '')), el('div', 'co', a.co), a.powod_klienta ? el('div', 'why', 'Klient: ' + a.powod_klienta) : null);
  if (a._done) { c.appendChild(el('div', 'done', a._done)); return c; }
  var b = el('div', 'btns');
  if (auto) { var u = el('button', '', '↶ Cofnij'); u.onclick = function(){ decide(a, 'cofnij', c); }; b.appendChild(u); }
  else if (a.rodzaj === 'zgłoszenie') { var r = el('button', 'pri', '✓ Przeczytane'); r.onclick = function(){ decide(a, 'czytane', c); }; b.appendChild(r); }
  else {
    var t = el('button', 'pri', '✓ Zatwierdź'); t.onclick = function(){ decide(a, 'tak', c); };
    var n = el('button', '', OPEN[a.pid] ? 'Odrzuć z powodem' : '✕ Odrzuć');
    n.onclick = function(){ if (!OPEN[a.pid]) { OPEN[a.pid] = 1; draw(); var x = document.querySelector('[data-pid="' + a.pid.replace(/"/g, '') + '"] textarea'); if (x) x.focus(); } else decide(a, 'nie', c); };
    add(b, t, n);
  }
  c.setAttribute('data-pid', a.pid);
  c.appendChild(b);
  if (OPEN[a.pid] && !auto) {
    var ta = el('textarea'); ta.placeholder = 'Powód (bot klienta go dostanie)';
    var lb = el('label', 'ck'); var z = el('input'); z.type = 'checkbox'; add(lb, z, el('span', '', 'Zapamiętaj jako stałą zasadę dla tego klienta'));
    add(c, ta, lb);
  }
  return c;
}

function draw(){
  var app = document.getElementById('app'); app.textContent = '';
  if (!D) { app.appendChild(el('div', 'empty', 'Wczytuję dane z panelu…')); size(); return; }
  if (D.blad) { app.appendChild(el('div', 'err', D.blad)); size(); return; }
  var tr = D.trenuja_dzis || [], sg = D.sygnaly || [], ag = D.asystent_czeka || [], au = D.asystent_zrobil_sam || [], fl = D.filmy_bez_komentarza || [];
  var films = fl.reduce(function(s, f){ return s + (f.ile || 0); }, 0);
  add(app, add(el('div', 'hd'), el('b', '', 'Dziś' + (D.dzien ? ' · ' + dayTxt(D.dzien) : '')), D.dane_przeliczone ? el('span', '', 'dane z ' + hm(D.dane_przeliczone)) : null));
  add(app, add(el('div', 'stats'), stat(tr.length, 'trenuje dziś'), stat(ag.filter(function(a){ return !a._done; }).length, 'od asystenta'),
    stat(sg.filter(function(c){ return c.sygnaly.some(function(s){ return s.indexOf('🔴') === 0; }); }).length, 'czerwone'), stat(films, 'filmy bez kom.')));

  app.appendChild(el('h3', '', 'Dziś trenują'));
  if (!tr.length) app.appendChild(el('div', 'empty', 'Nikt nie ma dziś treningu w planie.'));
  tr.forEach(function(u){
    var p = String(u.serie || '0/0').split('/'), pc = +p[1] ? Math.min(100, Math.round(+p[0] / +p[1] * 100)) : 0;
    var g = add(el('div', 'grow'), el('div', 'nm', u.klient), el('div', 'sub', u.jednostka + ' · ' + (u.tytul || '') + ' · serie ' + u.serie + (u.rpe_sesji !== undefined ? ' · RPE ' + u.rpe_sesji : '') + (u.min ? ' · ' + u.min + ' min' : '')));
    if (u.stan === 'w trakcie') { var b = el('div', 'bar'), i = el('i'); i.style.width = pc + '%'; g.appendChild(add(b, i)); }
    app.appendChild(add(el('div', 'row'), g, el('span', 'pill ' + (ST[u.stan] || ''), u.stan)));
  });

  if (ag.length || au.length) {
    app.appendChild(el('h3', '', 'Od asystenta AI'));
    ag.forEach(function(a){ app.appendChild(agentCard(a, false)); });
    au.forEach(function(a){ app.appendChild(agentCard(a, true)); });
  }

  var uw = [];
  sg.forEach(function(c){ c.sygnaly.forEach(function(s){ uw.push([s.indexOf('🔴') === 0 ? 0 : 1, c.klient, s]); }); });
  uw.sort(function(a, b){ return a[0] - b[0]; });
  fl.forEach(function(f){ uw.push([2, f.klient, '🎞 ' + f.ile + ' film' + (f.ile === 1 ? '' : (f.ile % 10 >= 2 && f.ile % 10 <= 4 && (f.ile % 100 < 10 || f.ile % 100 >= 20) ? 'y' : 'ów')) + ' bez komentarza']); });
  (D.bloki_do_zamkniecia || []).forEach(function(b){ uw.push([3, b.klient, '▣ blok ' + b.blok + ' do zamknięcia']); });
  if (D.dysk) uw.unshift([0, 'Dysk', '🔴 ' + D.dysk]);
  if (uw.length) {
    app.appendChild(el('h3', '', 'Wymaga uwagi'));
    var LIM = 6;
    uw.slice(0, MORE ? uw.length : LIM).forEach(function(x){ app.appendChild(add(el('div', 'sig'), el('div', 'nm', x[1]), el('div', 's', x[2]))); });
    if (uw.length > LIM) { var m = el('button', 'more', MORE ? 'Pokaż mniej' : 'Pokaż wszystkie (' + uw.length + ')'); m.onclick = function(){ MORE = !MORE; draw(); }; app.appendChild(m); }
  }
  var od = D.odpowiedzi_klientow || [];
  if (od.length) app.appendChild(el('div', 'sub', '↩ Odpowiedzi klientów na komentarze: ' + od.length + ' (zapytaj Claude, żeby je pokazał)'));
  size();
}
`;

const page = (title, name, css, js) => '<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<title>' + title + '</title><style>' + CSS + css + '</style></head><body><div id="app"></div><script>' + JS_TOP + js + JS_BOT.replace('@@NAME@@', name) + '</script></body></html>';

export const DZIS_HTML = page('Dziś', 'sila-z-ruchu-dzis', '', JS_DZIS);


/* Karta klienta (D3): jak przegląd w karcie klienta panelu. Linki do panelu otwiera gospodarz (ui/open-link), sama karta nie ma sieci. */
const CSS_KLIENT = `
.eb{font-size:12px;color:var(--tx2);text-transform:uppercase;letter-spacing:.05em}
.pills{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px}
.pl{font-size:12px;border-radius:999px;padding:2px 8px;border:1px solid var(--bd)}.pl.bad{color:var(--bad);border-color:var(--bad)}.pl.warn{color:var(--warn);border-color:var(--warn)}.pl.ok{color:var(--ok);border-color:var(--ok)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}
.sg{display:grid;grid-template-columns:1fr auto;gap:0 8px;align-items:center;padding:5px 0;border-top:1px solid var(--bd)}
.sg:first-of-type{border-top:0}.sg .v{font-weight:600;text-align:right}.sg .d{font-size:12px;text-align:right;color:var(--tx2)}.sg .d.up{color:var(--ok)}.sg .d.dn{color:var(--bad)}
.sg svg{width:100%;height:22px;color:var(--ac);display:block}
.ln{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.u{background:var(--bg2);border-radius:var(--r);padding:7px 9px;margin-bottom:6px}.u .t{display:flex;justify-content:space-between;gap:6px;align-items:baseline}
@media (max-width:520px){.g2{grid-template-columns:1fr}}
`;
const JS_KLIENT = `
var DN = ['nd.','pn.','wt.','śr.','czw.','pt.','sob.'];
function dShort(d){ var m = /^(\\d{4})-(\\d\\d)-(\\d\\d)/.exec(d || ''); if (!m) return ''; var x = new Date(+m[1], +m[2] - 1, +m[3]); return DN[x.getDay()] + ' ' + (+m[3]) + '.' + m[2]; }
function pl(n){ return String(n).replace('.', ','); }
function spark(p){
  var ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 100 22'); s.setAttribute('preserveAspectRatio', 'none');
  if (!p || p.length < 2) return s;
  var lo = Math.min.apply(null, p), hi = Math.max.apply(null, p), r = hi - lo || 1;
  var l = document.createElementNS(ns, 'polyline'); l.setAttribute('fill', 'none'); l.setAttribute('stroke', 'currentColor'); l.setAttribute('stroke-width', '1.8'); l.setAttribute('vector-effect', 'non-scaling-stroke');
  l.setAttribute('points', p.map(function(v, i){ return (i / (p.length - 1) * 100).toFixed(1) + ',' + (19 - (v - lo) / r * 16).toFixed(1); }).join(' '));
  s.appendChild(l); return s;
}
function exLine(e){
  var t = e.cwiczenie, x = [];
  if (e.kg !== undefined && e.kg !== '') x.push(pl(e.kg) + (isNaN(+String(e.kg).replace(',', '.')) ? '' : ' kg'));
  if (e.procent) x.push(e.procent);
  t += ' ' + [x.join(' '), (e.serie || '?') + '×' + (e.powt || '?')].filter(Boolean).join(' · ');
  if (e.rpe_max) t += ' · RPE ≤ ' + pl(e.rpe_max);
  return t;
}
function link(path){ req('ui/open-link', {url: '` + PANEL + `' + path}).catch(function(){}); }
function draw(){
  var app = document.getElementById('app'); app.textContent = '';
  if (!D) { app.appendChild(el('div', 'empty', 'Wczytuję dane klienta…')); size(); return; }
  if (D.blad) { app.appendChild(el('div', 'err', D.blad)); size(); return; }
  var L = D.liczby || {};
  if (D.naglowek) app.appendChild(el('div', 'eb', D.naglowek));
  add(app, add(el('div', 'hd'), el('b', '', D.klient || D.id), D.aktywny === 'NIE' ? el('span', '', 'nieaktywny') : null));
  var ps = el('div', 'pills');
  (D.sygnaly || []).forEach(function(s){ ps.appendChild(el('span', 'pl ' + (s.indexOf('🔴') === 0 ? 'bad' : 'warn'), s.replace(/^\\S+\\s/, ''))); });
  if (D.pakiet && D.pakiet.zostalo !== undefined) ps.appendChild(el('span', 'pl' + (D.pakiet.zostalo <= 2 ? ' warn' : ''), 'pakiet: zostało ' + D.pakiet.zostalo));
  if (!ps.childNodes.length) ps.appendChild(el('span', 'pl ok', 'bez sygnałów'));
  app.appendChild(ps);
  add(app, add(el('div', 'stats'),
    stat(L.ten_tydzien || '–', 'ten tydzień'),
    stat(L.sr_rpe_sesji !== undefined ? pl(L.sr_rpe_sesji) : '–', 'śr. RPE sesji'),
    stat(L.tonaz_tydzien_t !== undefined ? pl(L.tonaz_tydzien_t) + ' t' : '–', 'tonaż tyg.' + (L.tonaz_zmiana_proc !== undefined ? ' (' + (L.tonaz_zmiana_proc > 0 ? '+' : '') + L.tonaz_zmiana_proc + '%)' : '')),
    stat(L.filmy_bez_komentarza_14dni || 0, 'filmy bez kom.')));
  var g = el('div', 'g2'), c1 = el('div'), c2 = el('div');
  c1.appendChild(el('h3', '', 'Siła (e1RM)'));
  var S = D.sila || [];
  if (!S.length) c1.appendChild(el('div', 'empty', 'Za mało serii w ćwiczeniach A.'));
  S.forEach(function(x){
    var z = x.zmiana_kg || 0, d = el('span', 'd' + (z > 0 ? ' up' : z < 0 ? ' dn' : ''), (z > 0 ? '+' : '') + pl(z) + ' kg · ' + x.punkty.length + ' tyg.');
    c1.appendChild(add(el('div', 'sg'), el('span', '', x.cwiczenie), el('span', 'v', pl(x.e1rm_kg) + ' kg'), spark(x.punkty), d));
  });
  c2.appendChild(el('h3', '', 'Ostatnie sesje'));
  var SS = (D.ostatnie_sesje || []).slice(0, 4);
  if (!SS.length) c2.appendChild(el('div', 'empty', 'Jeszcze bez zapisanych treningów.'));
  SS.forEach(function(x){
    var ex = (x.cwiczenia || []).slice(0, 2).map(function(e){ return e.cwiczenie + ' ' + (e.serie || ''); }).join(' · ');
    var u = x.uwagi_klienta ? ' · „' + x.uwagi_klienta + '”' : '';
    var g1 = add(el('div', 'grow'), el('div', 'nm', dShort(x.data) + ' · ' + (x.tytul || x.jednostka)), el('div', 'sub ln', ex + u));
    c2.appendChild(add(el('div', 'row'), g1, x.rpe_sesji !== undefined ? el('span', 'sub', 'RPE ' + pl(x.rpe_sesji)) : null));
  });
  add(g, c1, c2); app.appendChild(g);
  var N = (D.nadchodzace_jednostki || []).slice(0, 3);
  app.appendChild(el('h3', '', 'Najbliższe w planie'));
  if (!N.length) app.appendChild(el('div', 'empty', 'Brak niezrobionych jednostek w planie.'));
  N.forEach(function(u){
    var exs = (u.cwiczenia || []).filter(function(e){ return e.sekcja !== 'Rozgrzewka'; }).map(exLine);
    var box = el('div', 'u');
    add(box, add(el('div', 't'), el('span', 'nm', (u.data ? dShort(u.data) : 'bez daty') + ' · ' + (u.tytul || u.jednostka)), el('span', 'sub', 'tydz. ' + u.tydzien + ' · ' + u.jednostka)),
      el('div', 'sub ln', exs.join(' · ')), u.notatka_do_jednostki ? el('div', 'sub', '✎ ' + u.notatka_do_jednostki) : null);
    app.appendChild(box);
  });
  var b = el('div', 'btns'), p1 = el('button', 'pri', '▶ Prowadź'), p2 = el('button', '', 'Otwórz w panelu ›');
  p1.onclick = function(){ link('#prowadz/' + encodeURIComponent(D.id)); };
  p2.onclick = function(){ link('#k/' + encodeURIComponent(D.id) + '/przeglad'); };
  if (D.id) { add(b, p1, p2); app.appendChild(b); }
  size();
}
`;

/* Karta filmu (D3 część 2): odtwarzacz z pliku przez pośrednika (bilet /film/<k>, 45 min), klatki z zaznaczonego fragmentu → klatki_zapisz → wiadomość do Claude, komentarz → komentarz_filmu. */
const CSS_FILM = `
.vw{position:relative;background:#141311;border-radius:var(--r);overflow:hidden}
video{display:block;width:100%;max-height:62vh;background:#141311}
.ctl{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}
.ctl .tm{margin-left:auto;font-size:12px;color:var(--tx2);font-variant-numeric:tabular-nums}
button.on{border-color:var(--ac);color:var(--ac)}
.tl{position:relative;height:26px;background:var(--bg2);border-radius:6px;margin-top:8px;cursor:pointer;touch-action:none}
.tl .sel{position:absolute;top:0;bottom:0;background:color-mix(in srgb,var(--ac) 28%,transparent);border:2px solid var(--ac);border-radius:6px;pointer-events:none}
.tl .ph{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--tx);pointer-events:none}
.fr{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin-top:8px}
.fr img{width:100%;border-radius:4px;display:block}
.fr div{position:relative}.fr span{position:absolute;left:3px;bottom:2px;font-size:10px;color:#fff;text-shadow:0 0 3px #000}
.mt{font-size:12px;color:var(--tx2);margin-top:6px}
@media (max-width:520px){.fr{grid-template-columns:repeat(4,1fr)}}
`;
const JS_FILM = `
var V = null, SEL = null, N_FR = 8, FR = [], BUSY = false, ST_MSG = null;
function mmss(t){ t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + ('0' + Math.floor(s)).slice(-2) + ',' + Math.floor((s % 1) * 10); }
function ref(){ return D && D.ref; }
function grab(t){ return new Promise(function(ok, no){
  var done = function(){ V.removeEventListener('seeked', done); try {
    var k = Math.min(1, 768 / Math.max(V.videoWidth, V.videoHeight)), c = document.createElement('canvas');
    c.width = Math.round(V.videoWidth * k); c.height = Math.round(V.videoHeight * k); c.getContext('2d').drawImage(V, 0, 0, c.width, c.height);
    ok({t: Math.round(t * 100) / 100, url: c.toDataURL('image/jpeg', 0.72)});
  } catch (e) { no(e); } };
  V.addEventListener('seeked', done); V.currentTime = t;
}); }
function frames(){
  if (BUSY || !V || !V.duration) return;
  var a = SEL ? SEL[0] : 0, b = SEL ? SEL[1] : V.duration, n = N_FR, ts = [];
  for (var i = 0; i < n; i++) ts.push(a + (b - a) * i / (n - 1));
  BUSY = true; V.pause(); FR = []; ST_MSG = {t: 'Wycinam klatki…'}; draw();
  var chain = Promise.resolve();
  ts.forEach(function(t){ chain = chain.then(function(){ return grab(Math.min(t, V.duration - 0.05)).then(function(f){ FR.push(f); }); }); });
  chain.then(function(){
    status('Wysyłam ' + FR.length + ' klatek do Claude…');
    return req('tools/call', {name: 'klatki_zapisz', arguments: {ref: ref(), klatki: FR.map(function(f){ return {t: f.t, jpg: f.url.split(',')[1]}; })}});
  }).then(function(r){
    if (r && r.isError) throw new Error((r.content && r.content[0] && r.content[0].text) || 'Nie udało się zapisać klatek.');
    var x = (r && r.structuredContent) || {}; try { if (!x.klatki_id) x = JSON.parse(r.content[0].text); } catch (e) {}
    var txt = 'Oceń technikę na klatkach ' + x.klatki_id + ' (' + D.klient + ', ' + D.cwiczenie + ', seria ' + D.seria + ', fragment ' + mmss(ts[0]) + '–' + mmss(ts[ts.length - 1]) + ').';
    return req('ui/message', {role: 'user', content: {type: 'text', text: txt}}).then(function(){ status('✓ Klatki są u Claude, odpowiedź pojawi się w czacie.'); },
      function(){ status('Napisz w czacie: „' + txt + '”'); });
  }).catch(function(e){ status((e && e.message) || String(e), true); }).then(function(){ BUSY = false; draw(); });
}
function status(t, bad){ ST_MSG = {t: t, bad: bad}; var m = document.getElementById('st'); if (m) { m.className = bad ? 'err' : 'mt'; m.textContent = t; } size(); }
function saveKom(ta, box){
  var b = box.querySelector('button.pri'); b.disabled = true;
  req('tools/call', {name: 'komentarz_filmu', arguments: {ref: ref(), tekst: ta.value}}).then(function(r){
    if (r && r.isError) throw new Error((r.content && r.content[0] && r.content[0].text) || 'Nie udało się zapisać.');
    D.komentarz_trenera = ta.value.trim(); msg(box, ta.value.trim() ? '✓ Zapisane, klient zobaczy komentarz przy filmie.' : '✓ Komentarz usunięty.');
  }).catch(function(e){ msg(box, e.message || String(e), true); }).then(function(){ b.disabled = false; });
}
function msg(box, t, bad){ var m = box.querySelector('.err,.done'); if (m) m.remove(); box.appendChild(el('div', bad ? 'err' : 'done', t)); size(); }
function tl(){
  var bar = document.getElementById('tl'); if (!bar || !V) return;
  var d = V.duration || 0, sel = bar.querySelector('.sel'), ph = bar.querySelector('.ph');
  if (d && SEL) { sel.style.display = ''; sel.style.left = (SEL[0] / d * 100) + '%'; sel.style.width = ((SEL[1] - SEL[0]) / d * 100) + '%'; } else sel.style.display = 'none';
  ph.style.left = d ? (V.currentTime / d * 100) + '%' : '0';
  var tm = document.getElementById('tm'); if (tm) tm.textContent = mmss(V.currentTime) + ' / ' + mmss(d) + (SEL ? ' · zaznaczone ' + mmss(SEL[0]) + '–' + mmss(SEL[1]) : '');
}
function draw(){
  var app = document.getElementById('app');
  if (!D) { app.textContent = ''; app.appendChild(el('div', 'empty', 'Wczytuję film…')); size(); return; }
  if (D.blad) { app.textContent = ''; app.appendChild(el('div', 'err', D.blad)); size(); return; }
  if (!V) {
    app.textContent = '';
    add(app, add(el('div', 'hd'), el('b', '', D.klient + ' · ' + D.cwiczenie + ' · seria ' + D.seria), el('span', '', [D.data ? dayTxt(D.data) : '', D.wykonanie].filter(Boolean).join(' · '))));
    if (D.uwagi_klienta || D.zamiana) app.appendChild(el('div', 'sub', [D.zamiana ? '⇄ ' + D.zamiana : '', D.uwagi_klienta ? 'Klient: „' + D.uwagi_klienta + '”' : ''].filter(Boolean).join(' · ')));
    var vw = el('div', 'vw'); V = document.createElement('video'); V.crossOrigin = 'anonymous'; V.playsInline = true; V.preload = 'auto'; V.muted = true;
    V.src = (D._ui && D._ui.src) || ''; vw.appendChild(V); app.appendChild(vw);
    V.addEventListener('loadedmetadata', function(){ tl(); size(); });
    V.addEventListener('timeupdate', tl); V.addEventListener('seeked', tl);
    V.addEventListener('play', function(){ var p = document.getElementById('pp'); if (p) p.textContent = '❚❚'; });
    V.addEventListener('pause', function(){ var p = document.getElementById('pp'); if (p) p.textContent = '▶'; });
    V.addEventListener('error', function(){ status('Nie udało się wczytać filmu. Dostęp do filmu działa 45 minut: poproś Claude, żeby otworzył go jeszcze raz.', true); });
    var c = el('div', 'ctl'), b1 = el('button', '', '‹ klatka'), pp = el('button', '', '▶'), b2 = el('button', '', 'klatka ›');
    pp.id = 'pp';
    b1.onclick = function(){ V.pause(); V.currentTime = Math.max(0, V.currentTime - 1 / 30); };
    b2.onclick = function(){ V.pause(); V.currentTime = Math.min(V.duration || 0, V.currentTime + 1 / 30); };
    pp.onclick = function(){ if (V.paused) V.play(); else V.pause(); };
    add(c, b1, pp, b2);
    [['¼×', .25], ['½×', .5], ['1×', 1]].forEach(function(x){ var b = el('button', x[1] === 1 ? 'on' : '', x[0]); b.setAttribute('data-rate', x[1]);
      b.onclick = function(){ V.playbackRate = x[1]; [].forEach.call(c.querySelectorAll('[data-rate]'), function(y){ y.className = y === b ? 'on' : ''; }); }; c.appendChild(b); });
    var tm = el('span', 'tm'); tm.id = 'tm'; c.appendChild(tm); app.appendChild(c);
    var bar = el('div', 'tl'); bar.id = 'tl'; add(bar, el('span', 'sel'), el('span', 'ph'));
    bar.onpointerdown = function(e){ var r = bar.getBoundingClientRect(); if (V.duration) V.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * V.duration; };
    app.appendChild(bar);
    var c2 = el('div', 'ctl'), s1 = el('button', '', '⇤ Początek tu'), s2 = el('button', '', 'Koniec tu ⇥'), s3 = el('button', '', 'Cały film');
    s1.onclick = function(){ var t = V.currentTime; SEL = [t, SEL && SEL[1] > t ? SEL[1] : Math.min(V.duration, t + 2)]; tl(); };
    s2.onclick = function(){ var t = V.currentTime; SEL = [SEL && SEL[0] < t ? SEL[0] : Math.max(0, t - 2), t]; tl(); };
    s3.onclick = function(){ SEL = null; tl(); };
    add(app, add(c2, s1, s2, s3));
    var box0 = el('div'); box0.id = 'frbox'; app.appendChild(box0);
    var kb0 = el('div'); kb0.id = 'kombox'; app.appendChild(kb0);
  }
  var box = document.getElementById('frbox'); box.textContent = '';
  var bb = el('div', 'btns'), go = el('button', 'pri', BUSY ? 'Pracuję…' : 'Pokaż Claude\\u2019owi ' + N_FR + ' klatek'); go.disabled = BUSY;
  go.onclick = frames;
  bb.appendChild(go);
  [8, 16].forEach(function(n){ var b = el('button', N_FR === n ? 'on' : '', n + ' klatek'); b.onclick = function(){ N_FR = n; draw(); }; bb.appendChild(b); });
  box.appendChild(bb);
  var st = el('div', ST_MSG && ST_MSG.bad ? 'err' : 'mt', ST_MSG ? ST_MSG.t : 'Zaznacz fragment („Początek tu” / „Koniec tu”), np. jedno powtórzenie. Bez zaznaczenia klatki idą z całego filmu.'); st.id = 'st'; box.appendChild(st);
  if (FR.length) { var fr = el('div', 'fr'); FR.forEach(function(f){ var d = el('div'), i = el('img'); i.src = f.url; i.alt = 'klatka ' + f.t + ' s'; add(d, i, el('span', '', mmss(f.t))); fr.appendChild(d); }); box.appendChild(fr); }
  var kb = document.getElementById('kombox');
  if (!kb.childNodes.length) {
    kb.appendChild(el('h3', '', 'Komentarz dla klienta'));
    if (D.komentarz_z_dysku) kb.appendChild(el('div', 'sub', 'Z komentarzy na Dysku: ' + D.komentarz_z_dysku));
    var ta = el('textarea'); ta.value = D.komentarz_trenera || ''; ta.placeholder = '0:05,0 kolano ucieka do środka…'; ta.rows = 3; kb.appendChild(ta);
    var b3 = el('div', 'btns'), ins = el('button', '', '⏱ Wstaw chwilę'), sv = el('button', 'pri', 'Zapisz komentarz');
    ins.onclick = function(){ var p = ta.selectionStart || 0, v = ta.value, ls = v.lastIndexOf('\\n', p - 1) + 1, tx = mmss(V.currentTime) + ' ';
      ta.value = v.slice(0, ls) + tx + v.slice(ls); ta.focus(); ta.selectionStart = ta.selectionEnd = ls + tx.length; };
    sv.onclick = function(){ saveKom(ta, kb); };
    add(kb, add(b3, ins, sv));
    if (D.odpowiedz_klienta) kb.appendChild(el('div', 'sub', '↩ Klient odpowiedział: ' + D.odpowiedz_klienta));
  }
  tl(); size();
}
`;

export const FILM_HTML = page('Film', 'sila-z-ruchu-film', CSS_FILM, JS_FILM);
export const KLIENT_HTML = page('Klient', 'sila-z-ruchu-klient', CSS_KLIENT, JS_KLIENT);

/** Zasoby ui:// (resources/list i resources/read). */
export const RESOURCES = [
  { uri: UI_DZIS, name: 'karta-dzis', title: 'Dziś w panelu', description: 'Karta ekranu Dziś: kto trenuje, decyzje o propozycjach asystentów AI, co wymaga uwagi.', mimeType: UI_MIME },
  { uri: UI_FILM, name: 'karta-film', title: 'Film serii', description: 'Odtwarzacz filmu serii (¼× / ½×, klatka po klatce), klatki dla Claude, komentarz dla klienta.', mimeType: UI_MIME },
  { uri: UI_KLIENT, name: 'karta-klient', title: 'Karta klienta', description: 'Karta klienta: sygnały, liczby tygodnia, siła, ostatnie sesje, najbliższe jednostki.', mimeType: UI_MIME },
];
const META = { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] } } };

/** CSP karty filmu: film idzie z adresu pośrednika (origin zapytania). */
const metaFilm = origin => ({ ui: { prefersBorder: true, csp: { connectDomains: origin ? [origin] : [], resourceDomains: origin ? [origin] : [], frameDomains: [], baseUriDomains: [] } } });

export function readResource(uri, origin) {
  if (uri === UI_FILM) return { contents: [{ uri: UI_FILM, mimeType: UI_MIME, text: FILM_HTML, _meta: metaFilm(origin) }] };
  if (uri === UI_DZIS) return { contents: [{ uri: UI_DZIS, mimeType: UI_MIME, text: DZIS_HTML, _meta: META }] };
  if (uri === UI_KLIENT) return { contents: [{ uri: UI_KLIENT, mimeType: UI_MIME, text: KLIENT_HTML, _meta: META }] };
  return null;
}
