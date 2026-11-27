/**
 * Karty w Claude (MCP Apps, D2, 27.11.2026): HTML wyświetlany przez claude.ai w ramce obok wyniku narzędzia.
 * Karta „Dziś” = ekran Dziś panelu w skrócie: kto trenuje, decyzje o propozycjach asystentów AI (Zatwierdź / Odrzuć / Przeczytane / Cofnij)
 * i to, co wymaga uwagi. Bez bibliotek i bez sieci: dane przychodzą z wyniku narzędzia „dzis” (postMessage, protokół ui/* 2026-01-26),
 * a przyciski wołają narzędzie „decyzja_asystent” przez gospodarza (tools/call), więc idą tą samą drogą co zapis z czatu.
 */

export const UI_MIME = 'text/html;profile=mcp-app';
export const UI_DZIS = 'ui://sila-z-ruchu/dzis.html';

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
const JS = `
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

function decide(a, mode, box){
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
var LH = 0;
function size(){ if (!READY) return; var h = Math.ceil(document.documentElement.getBoundingClientRect().height); if (h !== LH) { LH = h; note('ui/notifications/size-changed', {height: h}); } }
if (window.ResizeObserver) new ResizeObserver(size).observe(document.documentElement);
draw();
function start(n){
  req('ui/initialize', {protocolVersion: '2026-01-26', appInfo: {name: 'sila-z-ruchu-dzis', version: '1.0.0'}, appCapabilities: {}}).then(function(r){
    ctx(r && r.hostContext); READY = true; note('ui/notifications/initialized', {}); size();
  }).catch(function(){ if (n < 4) setTimeout(function(){ start(n + 1); }, 300 * Math.pow(2, n)); else { D = {blad: 'Karta nie połączyła się z Claude. Zapytaj ponownie o „dziś”.'}; draw(); } });
}
start(0);
})();
`;

export const DZIS_HTML = '<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<title>Dziś</title><style>' + CSS + '</style></head><body><div id="app"></div><script>' + JS + '</script></body></html>';

/** Zasoby ui:// (resources/list i resources/read). */
export const RESOURCES = [
  { uri: UI_DZIS, name: 'karta-dzis', title: 'Dziś w panelu', description: 'Karta ekranu Dziś: kto trenuje, decyzje o propozycjach asystentów AI, co wymaga uwagi.', mimeType: UI_MIME },
];
const META = { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] } } };

export function readResource(uri) {
  if (uri === UI_DZIS) return { contents: [{ uri: UI_DZIS, mimeType: UI_MIME, text: DZIS_HTML, _meta: META }] };
  return null;
}
