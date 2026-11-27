/* Aplikacja klienta (Siła z Ruchu). Wydzielona z index.html, żeby index.html mógł blokować obce skrypty (CSP bez 'unsafe-inline' dla skryptów). */
/* ---------- konfiguracja: klucz z linku (?k=…) zapamiętany w telefonie; ustawienia klienta przychodzą z getData ---------- */
const API_URL = window.API_URL;                    // z config.js
// Klucz działa jak hasło: po zapamiętaniu znika z paska adresu (historia przeglądarki, zrzuty ekranu, udostępniony adres).
// Gdy pamięć telefonu nie działa (np. tryb prywatny), klucz zostaje w adresie, bo inaczej przeładowanie zgubiłoby plan.
// Trening prowadzony przez trenera (panel → „▶ Prowadź”): ?prowadz=<klient_id>[&j=<tydzień>|<jednostka>]. Zapytania idą z biletem
// Google trenera (tr_tok, zapisuje go panel) zamiast klucza klienta; klucz trenera-klienta w pamięci („key”) zostaje nietknięty.
const LIVE = (() => { const v = new URLSearchParams(location.search).get('prowadz') || ''; return /^[\w.-]{1,40}$/.test(v) ? v.toLowerCase() : ''; })();
let LIVE_J = LIVE ? new URLSearchParams(location.search).get('j') || '' : '';
const KEY_LINK = !LIVE && !!new URLSearchParams(location.search).get('k');   // wejście z linku od trenera (ekran powitalny)
const KEY = (() => {
  if (LIVE) return 'L_' + LIVE;                    // pamięć telefonu trenera osobno dla każdego prowadzonego klienta
  const k = new URLSearchParams(location.search).get('k');
  try {
    if (k) {
      localStorage.setItem('key', k);
      if (localStorage.getItem('key') === k) history.replaceState(history.state, '', TL.urlNoKey(location.pathname, location.search, location.hash));
    }
    return k || localStorage.getItem('key') || '';
  } catch (e) { return k || ''; }
})();
let PAIN = false;      // Klienci F „bol” = TAK → kolano i bark zawsze zaznaczone
let SIMPLE = false;    // Klienci G „tryb” = PROSTY
let EXTRA_DEF = 0;     // Klienci H „dod_serie”; Plan „dod_serie” nadpisuje
let NAME = '';
let SCALE = 'RPE';     // Klienci K „skala” (RPE/RIR); przełącznik w nagłówku zapamiętany w telefonie (sc_<klucz>)
let OLY_CEIL = 0.05;   // Klienci L „sufit_oly”: ułamek 1RM ponad plan dla bojów
let EDIT = false;    // Klienci N „edycja” = TAK: dodawanie, usuwanie i zamiana na stałe w jednostce trenera
let SWAP = '';         // Klienci J „zamiana”: TRENER (dawne TAK) = zamienniki z planu i bazy, DOWOLNA = cała baza + własna nazwa, '' = brak
function applyCfg(c){
  if (!c) return;
  PAIN = !!c.pain; SIMPLE = !!c.simple; EXTRA_DEF = Number(c.extra) || 0; EDIT = !!c.edit;
  NAME = c.name || ''; document.title = 'Siła z Ruchu – ' + c.name;
  let own = null; try { own = localStorage.getItem('sc_' + KEY); } catch (e) {}
  SCALE = own || (c.scale === 'RIR' ? 'RIR' : 'RPE');
  OLY_CEIL = c.olyCeil >= 0 ? Number(c.olyCeil) : 0.05;
  SWAP = c.swap === true ? 'TRENER' : c.swap === 'TRENER' || c.swap === 'DOWOLNA' ? c.swap : '';
}
let DATA = null, PLAN = [], LOGS = {}, SESS = {}, cur = {week: 1, day: null};
let TAB = !LIVE && new URLSearchParams(location.search).get('t') === 'trener' ? 'trener' : 'trening';   // ekran z dolnego menu: trening | dysp | plan | postep | trener (&t=trener z maila po komentarzu)
/** losowy znacznik telefonu do „ostatnio otwarta” w panelu trenera (bez danych o urządzeniu); trener w trybie „Prowadź” go nie wysyła */
const DEV = (() => { try { let d = localStorage.getItem('dev');
  if (!/^[0-9a-f]{8,16}$/.test(d || '')) { d = Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('dev', d); }
  return d; } catch (e) { return ''; } })();
const dataArgs = () => LIVE || !DEV ? [] : [{ dev: DEV }];
let PT = 'tyd', PEX = '', PWK = null, PBL = null;   // zakładka, ćwiczenie, tydzień (poniedziałek; null = bieżący) i blok (null = ostatni) na ekranie Postęp
let lastMove = null;   // ostatnie przesunięcie jednostki → propozycja „przesuń też kolejne”
const $ = s => document.querySelector(s);
// czyste funkcje z lib.js (testy: tests/lib.test.js)
const { fmtKg, num, esc, blank, plural, nextUnit, likeLast, tplUnit, EFF, EFF_FINE, effFine, effHint, filmOk, EASY_RPE, lightOf, floor25, isNum, setKey, repsDefault, localDate,
  addDays, dayDiff, ddmm, weekday, monthShort, units, lightWeeks, blockInfo, unitStats,
  RIR_OPTS, rirOfRpe, rpeOfRir, rirMin, plateZone, lastTop, exHistory, planEdit, restSec, fmtClock, plates,
  isOly, RATE, rateOf, olyCap, sugOly, olyLocked, SWAP_WHY, swapOptions, swapAuto, swapText, parseSwap,
  PLATE_M, analyse, vbtOut, pathSVG, groupOf,
  cmjHeight, CMJ_PRESETS, HOOPER, readyBase, verdict, READY_ADVICE,
  doneSets, strengthSeries, records, weeklyTonnage, ZONES, zoneReps, loadCalendar, readySeries, mean, hardSetsByPart, coachNotes, notesByWeek, weekSummary, unitSummary, unitRecord, ownWeek, ownNextDay, CIRCUIT_REST, SECTION_NAMES, sectionRuns, volLogs, circuitGroups, circuitState, circuitLetter, circuitTidy, orderMove, isComplex, ownJoin, ownSplit, complexRepsOk, exSearch, exParts, exRegions, exBrowse, EX_REGIONS, EX_PART_SHORT, timeUnit, repsLabel,
  isEmom, SETS_MAX, emomSegs, emomKg, SKIP_WHY, skipText, parseSkip, cutPlan, SET_SEC, cmjSpread, mp4Fps, slowNameLowFps, cmjFlight, CMJ_FPS, CMJ_G, mondayOf, weekDays, pickUnit, todayInfo, nextTip, focusSteps, focusStart, blockReport, icsFile, gcalUrl, STAN_PLACES, STAN_CTX, stanKey, stanRecent, stanApply, stanDrop, CIALO, cialoVal, cialoList, cialoApply, cialoDrop, cialoDelta } = window.TL;

/* ---------- kolejka offline ---------- */
const QK = 'q_' + KEY;
function qGet(){ try { return JSON.parse(localStorage.getItem(QK) || '[]'); } catch(e){ return []; } }
function qSet(q){ try { localStorage.setItem(QK, JSON.stringify(q)); } catch(e){} }
// API Apps Script: POST text/plain (bez preflight CORS) → {ok, result} | {ok:false, error}
function call(fn, ...args){
  const body = LIVE ? { fn, token: liveTok(), as: LIVE, args } : { fn, key: KEY, args };
  return fetch(API_URL, { method: 'POST', redirect: 'follow', body: JSON.stringify(body) })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => { if (!j.ok) { if (LIVE && /^Logowanie: /.test(j.error || '')) liveAuthLost(); throw new Error(j.error || 'błąd serwera'); } return j.result; });
}
/* ---------- tryb trenera (prowadzony trening): bilet Google z panelu ---------- */
/** bilet trenera z panelu (tr_tok), ważny jeszcze co najmniej minutę; inaczej '' */
function liveTok(){
  try { const t = localStorage.getItem('tr_tok') || '', p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return p.exp * 1000 > Date.now() + 60e3 ? t : ''; } catch (e) { return ''; }
}
const LIVE_LOGIN = 'trener.html#prowadz/' + encodeURIComponent(LIVE);
/** bilet wygasł w trakcie treningu: zapisy czekają w kolejce, link do ponownego logowania wraca tu po zalogowaniu */
function liveAuthLost(){
  const a = $('#live-back'); if (a && !a.classList.contains('warn')) { a.textContent = 'Zaloguj się ›'; a.setAttribute('aria-label', 'Zaloguj się ponownie w panelu'); a.href = LIVE_LOGIN; a.classList.add('warn'); toast('Logowanie wygasło. Zapisy czekają w telefonie – zaloguj się ponownie w panelu.'); }
}
/** start bez ważnego biletu: najpierw logowanie w panelu (po nim panel wraca do tego treningu) */
function liveLogin(){
  $('#nav').hidden = true;
  head('Prowadzisz trening', 'Zaloguj się');
  $('#main').innerHTML = `<section class="card first"><div class="cn">Zaloguj się w panelu trenera</div><p class="sub">Prowadzenie treningu działa tylko po zalogowaniu Twoim kontem Google. Po zalogowaniu wrócisz tutaj.</p>
    <a class="btn p" href="${LIVE_LOGIN}">Zaloguj się</a></section>`;
  setSync('');
}
/* ---------- zgłaszanie błędów do zakładki „Błędy” (trener widzi je w Przeglądzie) ----------
 * Najwyżej ERR_DAY zgłoszeń dziennie, ten sam opis raz na dzień; bez kolejki (gdy nie ma sieci, nie ma czego zgłaszać).
 */
const ERR_DAY = 5, ERK = 'err_' + KEY;
const isNet = e => /Failed to fetch|NetworkError|Load failed|HTTP 5|timeout/i.test(String(e && e.message || e));
function reportErr(kind, msg){
  try {
    if (!KEY || navigator.onLine === false || !msg || /Logowanie: /.test(String(msg))) return;
    const day = localDate(), m = JSON.parse(localStorage.getItem(ERK) || '{}'), s = m.day === day ? m : { day, n: 0, seen: [] }, k = kind + '|' + String(msg).slice(0, 120);
    if (s.n >= ERR_DAY || s.seen.indexOf(k) >= 0) return;
    s.n++; s.seen.push(k); localStorage.setItem(ERK, JSON.stringify(s));
    call('logError', { kind, msg: String(msg).slice(0, 400), ua: navigator.userAgent }).catch(() => {});
  } catch (e) {}
}
window.addEventListener('error', e => reportErr('js', (e.message || 'błąd') + ' @' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', e => { const r = e.reason; if (!isNet(r)) reportErr('js', 'obietnica: ' + (r && r.message || r)); });
function send(fn, payload){
  setSync('zapisywanie…');
  return call(fn, payload).then(r => { setSync('zapisano ✓'); return r; })
    .catch(err => { const q = qGet(); q.push({fn, payload, t: Date.now()}); qSet(q); setSync('offline – w kolejce (' + q.length + ')');
      if (!isNet(err)) reportErr('zapis', fn + ': ' + err.message); throw err; });
}
async function flush(){
  const q = qGet(); if (!q.length) return;
  const rest = [];
  for (const it of q) { try { await call(it.fn, it.payload); } catch(e) { rest.push(it); } }
  qSet(rest); setSync(rest.length ? 'offline – w kolejce (' + rest.length + ')' : 'zsynchronizowano ✓');
  const old = rest.filter(it => it.t && Date.now() - it.t > 864e5);           // zapis, który nie przechodzi od ponad doby mimo sieci
  if (old.length && navigator.onLine !== false) reportErr('kolejka', old.length + ' zapisów czeka od ' + Math.round((Date.now() - Math.min(...old.map(it => it.t))) / 36e5) + ' h: ' + [...new Set(old.map(it => it.fn))].join(', '));
  // wysłane serie przestają być żółte
  document.querySelectorAll('.set .ok.pend').forEach(b => {
    const r = b.closest('.set'), ex = PLAN.find(x => x.week === cur.week && x.day === cur.day && x.order === +r.dataset.o);
    if (ex && !queued(ex, r.dataset.s)) b.classList.remove('pend');
  });
}
window.addEventListener('online', flush);
function setSync(t){ $('#sync').textContent = t; }
function toast(t){ const e = $('#toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(e._t); e._t = setTimeout(() => e.style.display = 'none', 2500); }

/* ---------- czas jednostki: od pierwszego wpisu do „Zakończ” ---------- */
const TK = 't_' + KEY;
function tGet(){ try { return JSON.parse(localStorage.getItem(TK) || '{}'); } catch(e){ return {}; } }
function tSet(m){ try { localStorage.setItem(TK, JSON.stringify(m)); } catch(e){} }
const skey = () => cur.week + '|' + cur.day;
function curSess(){
  return SESS['local|' + skey()] || Object.values(SESS).find(x => String(x.id).endsWith('|' + skey())) || {};
}
function startOf(){
  let cand = [];
  const m = tGet(), loc = m[skey()], from = m['r|' + skey()]; if (loc) cand.push(loc);
  // awaryjnie: najwcześniejszy zapis serii z serwera (np. inny telefon / wyczyszczona przeglądarka)
  Object.values(LOGS).forEach(l => {
    const p = String(l.id).split('|');
    if (p[0] !== 'local' && p[1] === String(cur.week) && p[2] === String(cur.day) && l.zapisano) {
      const t = Date.parse(l.zapisano); if (!isNaN(t)) cand.push(t);
    }
  });
  if (from) cand = cand.filter(t => t >= from);       // po „Licz od teraz” wcześniejsze zapisy nie cofają startu
  return cand.length ? Math.min(...cand) : (from || null);
}
/** czas treningu od teraz (klient włączył trening przypadkiem albo za wcześnie) */
function restartClock(){
  const m = tGet(); m[skey()] = m['r|' + skey()] = Date.now(); tSet(m); tick();
}
const STALE_H = 4;           // tyle godzin od startu bez zamknięcia treningu → start był zapomniany, liczymy od nowa
const LATE_START_MIN = 30;   // tyle bez żadnej zapisanej serii od startu → pierwsza seria zaczyna liczenie od nowa
function markStart(){
  if (!cur.day || curSess().id) return;           // jednostka już zamknięta – nie liczymy od nowa
  const m = tGet();
  if (!m[skey()]) { m[skey()] = Date.now(); tSet(m); tick(); }
  wake(true);
}
function fmtDur(ms){
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  const p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}
function clockText(){
  const s = curSess();
  if (s.id) return blank(s.czas_min) ? '–' : s.czas_min + ' min';
  const st = startOf();
  return !st ? '00:00' : Date.now() - st > STALE_H * 3600000 ? '–' : fmtDur(Date.now() - st);
}
function tick(){ document.querySelectorAll('.clock').forEach(e => e.textContent = clockText()); }
setInterval(tick, 1000);

/* ---------- sygnał: dźwięk (Web Audio, odblokowany gestem), wibracja, mignięcie ekranu, powiadomienie, gdy aplikacja w tle ----------
 * Ustawienia w telefonie (sg_<klucz>). iPhone nie ma navigator.vibrate: tam dźwięk i powiadomienie.
 */
const SGK = 'sg_' + KEY;
const SG = { sound: true, vib: true, vol: 0.7, pre: false, asked: false };
try { Object.assign(SG, JSON.parse(localStorage.getItem(SGK) || '{}')); } catch (e) {}
const sgSave = () => { try { localStorage.setItem(SGK, JSON.stringify(SG)); } catch (e) {} };
let AC = null;
/** przy geście (✓, Start): odblokowanie dźwięku krótkim cichym buforem */
function audioUnlock(){
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    if (!AC) AC = new C();
    if (AC.state === 'suspended') AC.resume();
    const src = AC.createBufferSource(); src.buffer = AC.createBuffer(1, 1, 22050); src.connect(AC.destination); src.start(0);
    acIdle(400);
  } catch (e) {}
}
function beep(n, freq = 880, dur = 0.18, gap = 0.12){
  if (!AC || !SG.sound) return;
  try {
    clearTimeout(AC_IDLE);
    if (AC.state === 'suspended') AC.resume();
    const t0 = AC.currentTime + 0.03, v = Math.max(0.05, Math.min(1, +SG.vol || 0.7));
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (dur + gap), o = AC.createOscillator(), g = AC.createGain();
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01);
      g.gain.setValueAtTime(v, t + dur - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
    }
    acIdle(1000 * n * (dur + gap) + 400);
  } catch (e) {}
}
/** po dźwięku wstrzymaj kontekst audio: Android nie trzyma wtedy systemowej kontrolki multimediów; kolejny sygnał wznawia go (beep → resume) */
let AC_IDLE = null;
function acIdle(ms){ clearTimeout(AC_IDLE); AC_IDLE = setTimeout(() => { try { if (AC && AC.state === 'running') AC.suspend(); } catch (e) {} }, ms); }
const vib = pat => { if (SG.vib && navigator.vibrate) try { navigator.vibrate(pat); } catch (e) {} };
function flash(){ document.body.classList.remove('flash'); void document.body.offsetWidth; document.body.classList.add('flash'); setTimeout(() => document.body.classList.remove('flash'), 1700); }
const END_VIB = [300, 150, 300, 150, 600];
async function notifyBg(title, body){
  if (document.visibilityState === 'visible' || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { const r = await navigator.serviceWorker.ready; await r.showNotification(title, { body, tag: 'trening-sygnal', renotify: true, requireInteraction: true, vibrate: END_VIB, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png' }); } catch (e) {}
}
/** pierwsza przerwa: prośba o zgodę na powiadomienia (sygnał, gdy aplikacja jest w tle); raz */
function askNotify(){
  if (SG.asked || !('Notification' in window) || Notification.permission !== 'default') return;
  SG.asked = true; sgSave();
  try { Notification.requestPermission().catch(() => {}); } catch (e) {}
}
function restSignal(){ beep(3); vib(END_VIB); flash(); notifyBg('Koniec przerwy', 'Czas na kolejną serię.'); }

/* ---------- przerwa po serii (A 2:00, B 1:30, K 1:00): czas liczony z różnicy zegara, nie z liczby taktów ---------- */
let REST = null;   // {end, total, pre, to, name, last}
const REST_END = 10;
function startRest(ex, sec, label){
  audioUnlock(); askNotify();
  const total = sec || restSec(ex.prio);
  if (REST) clearTimeout(REST.to);
  REST = { end: Date.now() + total * 1000, total, pre: false, name: label || ex.name, last: null };
  REST.to = setTimeout(restTick, total * 1000 + 30);                  // pojedynczy budzik: w tle mniej przycinany niż interwał
  $("#rest").hidden = false; document.body.classList.add("resting");
  wake(true);
  restTick();
}
function stopRest(){ if (REST) clearTimeout(REST.to); REST = null; $("#rest").hidden = true; $("#rest").classList.remove("end"); document.body.classList.remove("resting"); }
function restTick(){
  if (!REST) return;
  const left = (REST.end - Date.now()) / 1000;
  if (left <= 0) { stopRest(); restSignal(); toast("Koniec przerwy."); return; }
  if (SG.pre && !REST.pre && left <= 10 && REST.total > 15) { REST.pre = true; vib(150); beep(1, 660, 0.12); }
  const last = left <= REST_END;                                       // ostatnie 10 s: czerwone cyfry i pasek, „Zaraz koniec”
  if (REST.last !== last) { REST.last = last; $("#rest").classList.toggle("end", last); $("#rlbl").textContent = (last ? "Zaraz koniec · " : "Przerwa · ") + REST.name; }
  $("#rtime").textContent = fmtClock(left);
  $("#rfill").style.width = Math.min(100, 100 * left / REST.total) + "%";
}
setInterval(restTick, 250);
document.querySelectorAll("[data-r]").forEach(b => b.onclick = () => {
  if (!REST) return;
  const d = +b.dataset.r;
  if (!d) { stopRest(); return; }
  REST.end += d * 1000; REST.total = Math.max(REST.total, (REST.end - Date.now()) / 1000);
  if ((REST.end - Date.now()) / 1000 > 10) REST.pre = false;
  clearTimeout(REST.to); REST.to = setTimeout(restTick, Math.max(0, REST.end - Date.now()) + 30);
  restTick();
});
$("#r-set").onclick = openSignal;
/** ustawienia sygnału przerwy i EMOM + „Sprawdź sygnał” */
function openSignal(){
  const ios = !navigator.vibrate, perm = 'Notification' in window ? Notification.permission : 'brak';
  openSheet(`<h2 id="sheet-t">Sygnał przerwy</h2><p class="sub">Koniec przerwy: 3 sygnały, wibracja i mignięcie ekranu. W tle: powiadomienie.</p>
    <button type="button" class="btn tg" data-sg="sound">Dźwięk</button>
    <label class="fl">Głośność<input type="range" class="scrub" id="sg-vol" min="10" max="100" value="${Math.round(100 * (+SG.vol || 0.7))}"></label>
    <button type="button" class="btn tg" data-sg="vib" ${ios ? 'disabled' : ''}>Wibracja</button>
    <button type="button" class="btn tg" data-sg="pre">Krótka wibracja 10 s przed końcem</button>
    <button type="button" class="btn" id="sg-test">Sprawdź sygnał</button>
    ${perm === 'default' ? '<button type="button" class="btn" id="sg-perm">Włącz powiadomienia (sygnał w tle)</button>' : ''}
    <p class="sub">${ios ? 'Ten telefon nie wibruje z przeglądarki (iPhone): zostaje dźwięk i powiadomienie. ' : ''}${perm === 'denied' ? 'Powiadomienia są wyłączone w ustawieniach przeglądarki — w tle sygnału nie będzie. ' : perm === 'brak' ? 'Ta przeglądarka nie pokazuje powiadomień. ' : ''}Telefon wyciszony: dźwięk idzie głośnością multimediów; wibracja zależy od trybu (wibracje / wyciszony).</p>
    <button type="button" class="btn p" data-close>Gotowe</button>`);
  const draw = () => document.querySelectorAll('#sheet [data-sg]').forEach(b => b.setAttribute('aria-pressed', String(!!SG[b.dataset.sg])));
  document.querySelectorAll('#sheet [data-sg]').forEach(b => b.onclick = () => { SG[b.dataset.sg] = !SG[b.dataset.sg]; sgSave(); draw(); });
  $('#sg-vol').oninput = e => { SG.vol = +e.target.value / 100; sgSave(); };
  $('#sg-test').onclick = () => { audioUnlock(); beep(3); vib(END_VIB); flash(); };
  const pb = $('#sg-perm'); if (pb) pb.onclick = () => { SG.asked = true; sgSave(); Notification.requestPermission().then(() => { closeSheet(); openSignal(); }).catch(() => {}); };
  draw();
}

/* ---------- EMOM: zegar minut z sygnałem; liczba rund = liczba serii roboczych (− / + dodaje albo zdejmuje serie), pełny ekran z oceną rundy ---------- */
const EMK = 'em_' + KEY;
let EM = (() => { try { return JSON.parse(localStorage.getItem(EMK) || 'null'); } catch (e) { return null; } })();   // {k: tydz|jedn|nr, start, m}
let EMFS = null;                                   // otwarty pełny ekran: {o, end: liczba minut po końcu zegara albo 0}
const emKey = ex => cur.week + '|' + cur.day + '|' + ex.order;
const emSave = () => { try { localStorage.setItem(EMK, JSON.stringify(EM)); } catch (e) {} };
const emBox = o => document.querySelector(`.emom[data-emom="${o}"]`);
function emomBox(ex){
  return `<div class="emom" data-emom="${ex.order}" role="group" aria-label="EMOM">
      <div class="em-top"><span class="em-l">EMOM · rundy</span><b class="em-n">0</b><span class="em-of">/ ${ex.sets}</span><b class="em-t" aria-label="Minuta EMOM">–</b></div>
      <div class="em-b"><button type="button" class="btn em-go">▶ Start minut</button><button type="button" class="btn go em-fs">⛶ Pełny ekran</button></div>
      ${emTgHtml(ex, 'em-tg')}</div>`;
}
/** „Ile rund dziś − n +”: liczba serii roboczych ćwiczenia */
function emTgHtml(ex, cls){
  return `<div class="${cls}"><span>Ile rund dziś<small>Plan ${ex.planSets || ex.sets}. − / + zdejmuje albo dodaje serie w tabeli.</small></span>
      <button type="button" class="em-minus" aria-label="Mniej rund">−</button><b class="em-cnt" aria-live="polite">${ex.sets}</b><button type="button" class="em-plus" aria-label="Więcej rund">+</button></div>`;
}
function emTick(){
  if (!EM) return;
  const o = EM.k.split('|')[2], here = cur.week + '|' + cur.day + '|' + o === EM.k, box = here && emBox(o);
  const t = Math.max(0, Date.now() - EM.start), m = Math.floor(t / 60000) + 1, left = 60 - Math.floor(t / 1000) % 60;
  if (box && box._end && m > box._end()) {         // ostatnia minuta minęła: zegar staje z długim sygnałem
    const n = box._end(); EM = null; emSave(); beep(3); vib(END_VIB); flash(); notifyBg('EMOM: koniec', n + ' ' + plural(n, 'minuta', 'minuty', 'minut') + '.');
    if (EMFS && EMFS.o === +o) EMFS.end = n;
    box._draw(); return;
  }
  if (m > (EM.m || 0)) { EM.m = m; emSave(); if (m > 1) { beep(2, 988, 0.2); vib([250, 120, 250]); notifyBg('EMOM: minuta ' + m, 'Kolejna runda.'); } }
  if (!box) return;
  box.querySelector('.em-t').textContent = 'min ' + m + ' · ' + fmtClock(left);
  const fs = EMFS && EMFS.o === +o && !EMFS.end && $('#emfs'), fm = fs && fs.querySelector('.ef-m');
  if (fm) { fs.querySelector('.ef-m').textContent = m; fs.querySelector('.ef-clk').textContent = fmtClock(left); fs.querySelector('.ef-bar i').style.width = Math.round((60 - left) / 60 * 100) + '%'; }
}
setInterval(emTick, 250);
function emClose(){ const fs = $('#emfs'); if (fs) fs.remove(); EMFS = null; document.body.classList.remove('emfs-on'); }
// Bez powiększania dwoma palcami (26.11): Safari na iPhonie ignoruje user-scalable=no, a gest zatrzymuje dopiero gesturestart / gesturechange (tylko iOS).
// Własne powiększanie (np. odtwarzacz w panelu) działa na zdarzeniach pointer, więc tego nie dotyczy.
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && EMFS && $('#sheet').hidden) emClose(); });
function bindEmom(ex, s0, h){
  const box = emBox(ex.order); if (!box) return;
  const o = ex.order, go = box.querySelector('.em-go'), oly = !!document.querySelector(`.set[data-o="${o}"] .lt`);
  const on = () => !!EM && EM.k === emKey(ex);
  const redraw = () => { const b = emBox(o); if (b && b._draw) b._draw(); };   // karta bywa przerysowana: rysuj tę, która jest na ekranie
  const rows = () => workRows(o), done = () => rows().filter(r => r.dataset.st);
  // „−” zdejmuje tylko ostatnią dodaną, niezapisaną serię (nie mniej niż w planie i niż zrobione)
  const lastFree = () => { const xs = h.rowsOf(o, 'x'), r = xs[xs.length - 1]; return r && !r.dataset.st && !getLog(ex, setKey(r.dataset.s)) ? r : null; };
  const addOne = () => {
    const rs = rows(), last = rs[rs.length - 1], set = ex.sets + h.rowsOf(o, 'x').length + 1;
    if (set > SETS_MAX) { toast('Najwyżej ' + SETS_MAX + ' rund.'); return null; }
    const kg = fv(last.querySelector('.kg')) || last.querySelector('.kg').dataset.ph || '', reps = fv(last.querySelector('.reps')) || last.querySelector('.reps').dataset.ph || '';
    h.addRow(o, rowHtml(ex, set, 'x', { kg: num(kg), reps: num(reps) }), last);
    const row = h.rowOf(o, set); bindRow(row, ex, s0); h.refreshDel(o); placeStep(o); refreshStats();
    return row;
  };
  const plus = n => { let k = 0; for (let i = 0; i < n; i++) if (addOne()) k++; redraw(); return k; };
  const minus = () => { const r = lastFree(); if (!r) { toast(rows().length > (ex.planSets || ex.sets) ? 'Ostatnia runda jest zapisana: usuń ją ✕ w tabeli.' : 'Mniej rund niż w planie: „⋯” → Pomiń / Skróć.'); return; } r.remove(); h.refreshDel(o); placeStep(o); refreshStats(); redraw(); };
  const start = (from) => { audioUnlock(); askNotify(); EM = { k: emKey(ex), start: Date.now() - (from || 0) * 60000, m: (from || 0) + 1 }; emSave(); beep(1, 988, 0.25); vib(200); wake(true); markStart(); emTick(); };
  const stop = () => { EM = null; emSave(); };
  // pełny ekran: odliczanie minuty, pasek rund, ciężar następnej rundy, ocena = zapis rundy
  const nextRow = () => rows().find(r => !r.dataset.st);
  const kgOf = r => { const i = r && r.querySelector('.kg'); return i ? fv(i) || i.dataset.ph || '' : ''; };
  const repsOf = r => { const i = r && r.querySelector('.reps'); return i ? fv(i) || i.dataset.ph || '' : ''; };
  const KEYS = ['L', 'S', 'W', 'X'], LBL = k => oly ? RATE[k].label : EFF[k].label, CLS = { L: 'g', S: 'y', W: 'r', X: 'x' };
  const fsDraw = () => {
    let fs = $('#emfs'); if (!EMFS || EMFS.o !== o) return;
    if (!fs) { document.body.insertAdjacentHTML('beforeend', '<div id="emfs" role="dialog" aria-modal="true" aria-label="EMOM na pełnym ekranie"></div>'); fs = $('#emfs'); document.body.classList.add('emfs-on'); }
    const rs = rows(), segs = emomSegs(rs.map(r => ({ st: r.dataset.st, rate: r.dataset.rate, rpe: r.dataset.rpe }))), nd = done().length, nx = nextRow();
    const head = `<div class="ef-h"><b>${esc(ex.name)}</b><button type="button" class="ef-x">✕ Zmniejsz</button></div>`;
    const bar = `<div class="ef-seg" style="--n:${rs.length}" aria-label="Zrobione rundy: ${nd} z ${rs.length}">${segs.map(c => `<i class="${c}"></i>`).join('')}</div>`;
    if (EMFS.end) {
      const kg = emomKg(done().filter(r => r.dataset.st === 'ok').map(r => num(kgOf(r))));
      fs.className = 'end';
      fs.innerHTML = `${head}<div class="ef-mn"><span>Koniec</span><span><b>${EMFS.end}</b> z ${EMFS.end} min</span></div>
        <div class="ef-clk">${nd} / ${rs.length}</div>${bar}
        <div class="ef-r"><div class="t">Zrobione rundy<b>${nd}${kg ? ' · ' + esc(kg) : ''}</b></div></div>
        <p class="ef-p">Zegar stanął po ostatniej minucie. Chcesz dalej? Dodaj rundy, zegar idzie od minuty ${EMFS.end + 1}.</p>
        <div class="ef-ev"><button type="button" class="x" data-emmore="1">+ 1 runda</button><button type="button" class="x" data-emmore="5">+ 5 rund</button></div>
        <button type="button" class="ef-ok">Gotowe</button>`;
    } else {
      fs.className = '';
      const r0 = on() ? Math.max(0, Date.now() - EM.start) : 0, m = on() ? Math.floor(r0 / 60000) + 1 : 1, left = on() ? 60 - Math.floor(r0 / 1000) % 60 : 60;
      fs.innerHTML = `${head}<div class="ef-mn"><span>Minuta</span><span><b class="ef-m">${m}</b> z ${rs.length}</span></div>
        <div class="ef-clk" aria-live="off">${fmtClock(left)}</div><div class="ef-bar"><i style="width:${Math.round((60 - left) / 60 * 100)}%"></i></div>${bar}
        ${nx ? `<div class="ef-r"><button type="button" data-emkg="-2.5" aria-label="Następna runda 2,5 kg mniej">−2,5</button><div class="t">Runda ${rows().indexOf(nx) + 1} · zrobione ${nd}<b>${esc(fmtKg(num(kgOf(nx))) || '–')}${kgOf(nx) !== '' && isNum(num(kgOf(nx))) ? ' kg' : ''} × ${esc(String(repsOf(nx) || '–'))}</b></div><button type="button" data-emkg="2.5" aria-label="Następna runda 2,5 kg więcej">+2,5</button></div>`
             : `<div class="ef-r"><div class="t">Wszystkie rundy zrobione<b>${nd} z ${rs.length}</b></div></div>`}
        <div class="ef-ev">${KEYS.map(k => `<button type="button" class="${CLS[k]}" data-emrate="${k}">${k === 'X' ? '✖' : '●'} ${LBL(k)}</button>`).join('')}</div>
        ${emTgHtml(ex, 'ef-tg')}
        <button type="button" class="ef-go">${on() ? '■ Zatrzymaj zegar' : '▶ Start minut'}</button>`;
      fs.querySelector('.ef-tg small').textContent = 'Plan ' + (ex.planSets || ex.sets) + ' · ocena powyżej zapisuje rundę';
      fs.querySelector('.em-cnt').textContent = rs.length;
    }
    fs.querySelector('.ef-x').onclick = emClose;
    fs.querySelectorAll('[data-emmore]').forEach(b => b.onclick = () => { const from = EMFS.end; if (plus(+b.dataset.emmore)) { EMFS.end = 0; redraw(); start(from); } redraw(); });
    const ok = fs.querySelector('.ef-ok'); if (ok) ok.onclick = emClose;
    fs.querySelectorAll('[data-emkg]').forEach(b => b.onclick = () => {
      const r = nextRow(), i = r && r.querySelector('.kg'); if (!i) return;
      const v = num(kgOf(r)); if (!isNum(v)) return;
      i.value = fmtKg(Math.max(0, v + +b.dataset.emkg)); i.classList.remove('ph');
      i.dispatchEvent(new Event('change', { bubbles: true })); fsDraw();
    });
    fs.querySelectorAll('[data-emrate]').forEach(b => b.onclick = () => {
      if (!on()) start();
      const k = b.dataset.emrate, r = nextRow() || addOne(); if (!r) return;
      if (oly) r._save(k === 'X' ? 'x' : 'ok', k, k !== 'X' ? RATE[k].rpe : '');
      else r._save(k === 'X' ? 'x' : 'ok', '', k !== 'X' ? EFF[k].rpe : '');
      toast('Runda ' + done().length + ': ' + LBL(k) + '.');
    });
    const fm = fs.querySelector('.em-minus'), fp = fs.querySelector('.em-plus');
    if (fm) { fm.onclick = minus; fp.onclick = () => plus(1); fm.disabled = !lastFree(); }
    const fg = fs.querySelector('.ef-go'); if (fg) fg.onclick = () => { if (on()) stop(); else start(); redraw(); };
  };
  const draw = () => {
    if (!box.isConnected) return;
    box.querySelector('.em-n').textContent = done().length;
    box.querySelector('.em-of').textContent = '/ ' + rows().length;
    box.querySelector('.em-cnt').textContent = rows().length;
    box.querySelector('.em-minus').disabled = !lastFree();
    box.querySelector('.em-plus').disabled = rows().length >= SETS_MAX;
    go.textContent = on() ? '■ Stop' : '▶ Start minut'; go.setAttribute('aria-pressed', String(on()));
    if (!on()) box.querySelector('.em-t').textContent = '–';
    fsDraw();
  };
  const open = () => { EMFS = { o, end: 0 }; fsDraw(); const b = $('#emfs [data-emrate]'); if (b) b.focus({ preventScroll: true }); };
  go.onclick = () => { if (on()) stop(); else { start(); open(); } draw(); };
  box.querySelector('.em-fs').onclick = open;
  box.querySelector('.em-minus').onclick = minus;
  box.querySelector('.em-plus').onclick = () => plus(1);
  box._draw = draw; box._end = () => rows().length;
  if (EMFS && EMFS.o === o && !$('#emfs')) EMFS = null;     // po przerysowaniu treningu pełny ekran nie wraca sam
  draw();
}

/* ---------- ekran bez wygaszania: od pierwszego wpisu do „Zakończ” (Wake Lock) ---------- */
let WAKE = null, WAKE_ON = false;
async function wake(on){
  WAKE_ON = on;
  try {
    if (on && !WAKE && navigator.wakeLock) {
      WAKE = navigator.wakeLock.request("screen");                 // obietnica: drugie dotknięcie nie prosi ponownie
      const w = await WAKE; WAKE = w; w.addEventListener("release", () => { if (WAKE === w) WAKE = null; });
      if (!WAKE_ON) { WAKE = null; w.release(); }
    }
    if (!on && WAKE) { const w = await WAKE; WAKE = null; await w.release(); }
  } catch (e) { WAKE = null; }
}
// system zwalnia blokadę po schowaniu aplikacji → po powrocie prosimy ponownie
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && WAKE_ON) wake(true); });

// Nagłówek chowa się przy przewijaniu w dół i wraca przy przewijaniu w górę (albo na samej górze).
// Pozycja przycięta do zakresu strony, żeby odbicie na iOS nie przełączało; ruchy < 8 px pomijane.
(() => {
  const h = document.querySelector('header'); let last = 0;
  window.addEventListener('scroll', () => {
    const y = Math.max(0, Math.min(window.scrollY, document.documentElement.scrollHeight - window.innerHeight));
    const d = y - last;
    if (Math.abs(d) < 8 && y > 0) return;
    last = y;
    h.classList.toggle('hid', d > 0 && y > h.offsetHeight);
  }, { passive: true });
  window.addEventListener('scroll', stickDraw, { passive: true });
  h.addEventListener('transitionend', stickDraw);
})();
/**
 * Przypięta nazwa ćwiczenia: otwarta karta, której góra wyszła poza ekran, trzyma nagłówek (nazwa, ikony)
 * pod górnym paskiem aplikacji, a gdy pasek jest schowany, na samej górze. Znika razem z końcem karty (position: sticky).
 * Przypięty nagłówek ma ten sam wygląd i wysokość co w karcie (klasa `stuck` dokłada tylko kreskę), więc nic nie skacze.
 */
function stickDraw(){
  const top = Math.max(0, Math.round(document.querySelector('header').getBoundingClientRect().bottom));
  document.documentElement.style.setProperty('--stick', top + 'px');
  document.querySelectorAll('#main .card[data-card] > .ch').forEach(ch => {
    const c = ch.parentNode, r = c.getBoundingClientRect();
    const on = !c.classList.contains('fold') && r.top < top - 1 && r.bottom > top + 48;
    ch.classList.toggle('stuck', on);
  });
}

/* ---------- okno (arkusz od dołu) i kalkulator talerzy ---------- */
/* Okno ma własny wpis w historii: „wstecz” telefonu (gest, przycisk) zamyka okno zamiast wychodzić z aplikacji
   (w trybie „Prowadź” wychodziło do panelu trenera). SH_HIST = nasz wpis jest na wierzchu; SH_SKIP = ile zdarzeń popstate
   z własnego history.back() (zamknięcie przyciskiem) zignorować; okno otwarte w międzyczasie dostaje wpis po tym zdarzeniu. */
let SH_HIST = false, SH_SKIP = 0;
function shPush(){ if (SH_HIST || SH_SKIP) return; try { history.pushState({ sh: 1 }, ''); SH_HIST = true; } catch (e) {} }
function openSheet(html){
  $("#sheet-in").innerHTML = html; $("#sheet").hidden = false; shPush();
  const f = $("#sheet-in input, #sheet-in button"); if (f) f.focus();
}
let SHEET_ON_CLOSE = null;
function closeSheet(pop){
  const f = SHEET_ON_CLOSE; SHEET_ON_CLOSE = null; if (f) f(); $("#sheet").hidden = true; $("#sheet-in").innerHTML = "";
  if (SH_HIST) { SH_HIST = false; if (!pop) { SH_SKIP++; history.back(); } }
}
addEventListener("popstate", () => {
  if (SH_SKIP) { SH_SKIP--; if (!$("#sheet").hidden) shPush(); return; }
  if (!$("#sheet").hidden) closeSheet(true);
});
$("#sheet").addEventListener("click", e => { if (e.target.id === "sheet" || e.target.closest("[data-close]")) closeSheet(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); else if (e.key === "Escape" && WEL) welClose(); });
let BAR = 20, COLLARS = true;
try { const s = JSON.parse(localStorage.getItem("pl_" + KEY) || "null"); if (s) { BAR = s.bar; COLLARS = s.col; } } catch (e) {}
const plateCls = p => ({ 25: "p25", 20: "p20", 15: "p15", 10: "p10", 5: "p5" })[p] || "ps";
function openPlates(ex){
  const rows = [...document.querySelectorAll(`.set[data-o="${ex.order}"]:not([data-k="w"])`)];
  const next = rows.find(r => !r.dataset.st) || rows[rows.length - 1];
  const kg0 = next ? num(fv(next.querySelector(".kg"))) : ex.kg;
  openSheet(`<h2 id="sheet-t">Talerze</h2><p class="sub">${esc(ex.name)} · na każdą stronę</p>
    <label class="fl">Ciężar na sztandze (kg)<input id="pl-kg" inputmode="decimal" value="${esc(fmtKg(kg0))}"></label>
    <div class="seg" role="group" aria-label="Gryf">${[20, 15].map(b => `<button type="button" data-bar="${b}">Gryf ${b} kg</button>`).join("")}</div>
    <button type="button" class="btn sm tg" id="pl-col">Zamki 2 × 2,5 kg</button>
    <div id="pl-out" aria-live="polite"></div>
    <button type="button" class="btn p" data-close>Zamknij</button>`);
  const draw = () => {
    document.querySelectorAll("[data-bar]").forEach(b => b.setAttribute("aria-pressed", +b.dataset.bar === BAR));
    $("#pl-col").setAttribute("aria-pressed", COLLARS);
    try { localStorage.setItem("pl_" + KEY, JSON.stringify({ bar: BAR, col: COLLARS })); } catch (e) {}
    const kg = num($("#pl-kg").value), r = plates(kg, BAR, COLLARS ? 5 : 0);
    $("#pl-out").innerHTML = !isNum(kg) ? "<p>Wpisz ciężar w kg.</p>"
      : r.under ? `<p>Mniej niż gryf${COLLARS ? " z zamkami" : ""} (${fmtKg(BAR + (COLLARS ? 5 : 0))} kg).</p>`
      : `<div class="pl-bar" aria-hidden="true"><span class="sleeve"></span>${r.side.map(p => `<span class="pp ${plateCls(p)}">${fmtKg(p)}</span>`).join("")}<span class="clamp"></span></div>
         <p class="pl-txt">${r.side.length ? r.side.map(fmtKg).join(" + ") + " kg" : "Sam gryf" + (COLLARS ? " z zamkami" : "")}${r.rest ? ` · brakuje ${fmtKg(r.rest)} kg (nie ma takich talerzy)` : ""}</p>`;
  };
  $("#pl-kg").oninput = draw;
  document.querySelectorAll("[data-bar]").forEach(b => b.onclick = () => { BAR = +b.dataset.bar; draw(); });
  $("#pl-col").onclick = () => { COLLARS = !COLLARS; draw(); };
  draw();
}

/* ---------- dane ---------- */
// ostatnie dane trzymane w telefonie → aplikacja otwiera się od razu, także bez sieci
const DK = 'd_' + KEY;
function useData(d){
  applyCfg(d.cfg);
  LN = {};
  DATA = d; PLAN = d.plan; LOGS = {}; SESS = {};
  if (!FXM) FXI = null;                                           // tryb skupienia: świeże dane (start z pamięci telefonu, potem serwer) wybierają krok od nowa, dopóki klient sam nie przeszedł dalej
  d.logs.forEach(l => LOGS[l.id] = l);
  d.sessions.forEach(s => SESS[s.id] = s);
  // lokalne, jeszcze niewysłane zapisy z kolejki nadpisują dane z serwera
  qGet().forEach(it => {
    const p = it.payload;
    if (it.fn === 'logSet') { const id = ['local', p.week, p.day, p.order, p.set].join('|'); LOGS[id] = { id, kg: p.kg, powt: p.reps, rpe: p.rpe, vbt_ms: p.vbt, wykonane: p.done ? 'TAK' : '', film_link: p.video, typ: p.typ, ocena: p.ocena || '', zamiana: p.swap || '', vbt_peak: p.vbtPeak, wysokosc_cm: p.height, sciezka: p.path, uwagi: p.note || '' }; }
    if (it.fn === 'deleteSet') { const id = ['local', p.week, p.day, p.order, p.set].join('|'); LOGS[id] = { id, deleted: true }; }   // usunięte bez sieci (np. cofnięte pominięcie)
    if (it.fn === 'logNote') Object.keys(LOGS).forEach(k => { const q = k.split('|'); if (q[1] === String(p.week) && q[2] === String(p.day) && q[3] === String(p.order) && !/SKIP/.test(LOGS[k].typ || '')) LOGS[k].uwagi = p.note; });
    if (it.fn === 'przesunJednostke') applyMoves(p, false);
    if (it.fn === 'editPlan') applyEdit(p, false);                            // zmiana w jednostce trenera czekająca w kolejce
    if (it.fn === 'addOwnUnit') applyOwn(p, false);                           // własny trening czekający w kolejce
    if (it.fn === 'saveDyspozycja') applyReady(p, false);
    if (it.fn === 'saveStan') applyStan(p, false);                             // ból / napięcie czekające w kolejce
    if (it.fn === 'deleteStan') applyStanDel(p, false);
    if (it.fn === 'saveCialo') applyCialo(p, false);                           // pomiar ciała czekający w kolejce
    if (it.fn === 'deleteCialo') applyCialoDel(p, false);
    if (it.fn === 'replyNote') applyReply(p, false);                          // odpowiedź na komentarz trenera czekająca w kolejce
    if (it.fn === 'liveNote') LN[[p.week, p.day, p.order].join('|')] = { text: p.text, pub: !!p.pub };   // notatka trenera czekająca w kolejce
  });
}
/** nowe daty jednostek w planie (lokalnie; serwer dostaje je przez send/kolejkę); save = zapis w pamięci telefonu */
function applyMoves(moves, save){
  [].concat(moves || []).forEach(m => PLAN.forEach(r => { if (r.week === m.week && r.day === m.day) r.date = m.date; }));
  if (save && DATA) try { localStorage.setItem(DK, JSON.stringify(DATA)); } catch (e) {}
}
function load(){
  if (!KEY) { askKey(); setSync(''); return; }
  if (LIVE && !liveTok()) { liveLogin(); return; }
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(DK) || 'null'); } catch (e) {}
  if (cached) { useData(cached); pickDefault(); render(); setSync('offline – ostatnie dane'); welMaybe(); }
  call('getData', ...dataArgs()).then(d => {
    try { localStorage.setItem(DK, JSON.stringify(d)); } catch (e) {}
    const keep = cached ? { w: cur.week, d: cur.day } : null;
    useData(d);
    if (keep && !LIVE_J) { cur.week = keep.w; cur.day = keep.d; } else pickDefault();
    LIVE_J = '';
    render(); setSync('gotowe'); flush(); vqRun(); welMaybe();
    if (NOPLAN_ASK) { NOPLAN_ASK = false; const t = localDate();   // „Prowadź” bez jednostki na dziś: trening bez planu
      if (!unitList().some(u => !u.own && u.date === t)) openNoPlan(true); }
  }).catch(e => {
    if (LIVE && /^Logowanie: /.test(e.message)) { if (!cached) liveLogin(); return; }
    if (!cached) { $('#main').innerHTML = '<div class="empty">Błąd: ' + esc(e.message) + '</div>'; setSync('błąd'); }
    else setSync('offline – ostatnie dane');
  });
}
/** świeże dane z serwera bez zmiany ekranu i bieżącej jednostki (najpierw wysyła kolejkę) */
function refreshData(){
  return flush().then(() => call('getData', ...dataArgs())).then(d => {
    try { localStorage.setItem(DK, JSON.stringify(d)); } catch (e) {}
    const w = cur.week, dd = cur.day;
    useData(d); cur.week = w; cur.day = dd; render(); setSync('gotowe');
  }).catch(() => {});
}
/** brak klucza (np. iOS: aplikacja z ekranu głównego ma osobną pamięć i startuje bez ?k=) → wklejenie linku albo kodu */
function askKey(){
  $('#main').innerHTML = `<section class="card askkey"><label class="fl">Wklej link od trenera lub kod<input id="key-in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…?k=… albo k…"></label>
    <div class="hint" id="key-err" role="alert"></div>
    <button type="button" class="btn p" id="key-go">Otwórz plan</button></section>`;
  const go = () => {
    const k = TL.keyFrom($('#key-in').value);
    if (!k) { $('#key-err').textContent = 'Nie rozpoznaję linku ani kodu. Skopiuj cały link od trenera.'; return; }
    try { localStorage.setItem('key', k); } catch (e) {}
    location.replace(location.pathname + '?k=' + encodeURIComponent(k));
  };
  $('#key-go').onclick = go;
  $('#key-in').onkeydown = e => { if (e.key === 'Enter') go(); };
}
// ostatnio otwarta jednostka (cu_<klucz>): po zamknięciu aplikacji w tle wraca do niej tego samego dnia, a nie do dzisiejszej (lib keepUnit)
const CUK = 'cu_' + KEY;
function curKeep(){
  if (!cur.day) return;
  try { localStorage.setItem(CUK, JSON.stringify({ w: cur.week, d: cur.day, t: localDate(), at: Date.now() })); } catch (e) {}
}
function pickDefault(){
  let kept = null; try { kept = JSON.parse(localStorage.getItem(CUK) || 'null'); } catch (e) {}
  const ul = unitList(), ulc = LIVE ? ul : ul.filter(u => !u.led);   // klient: trening z trenerem nie jest „dzisiejszym” do zrobienia
  const s = TL.keepUnit(kept, ul, localDate(), Date.now()) || pickUnit(ulc.length ? ulc : ul, localDate());   // ostatnio otwarta (ten sam dzień), inaczej dzisiejsza niezrobiona, potem najbliższa następna (strefa telefonu)
  if (s) { cur.week = s.week; cur.day = s.day; }
  const j = LIVE_J.split('|');                       // „▶ Prowadź” z panelu na konkretną jednostkę
  if (LIVE_J && PLAN.some(r => r.week === +j[0] && r.day === j.slice(1).join('|'))) { cur.week = +j[0]; cur.day = j.slice(1).join('|'); }
  WK = null;
}
const lid = (ex, set) => ['', cur.week, cur.day, ex.order, set].join('|');
function getLog(ex, set){
  const suffix = lid(ex, set);
  if (LOGS['local' + suffix]) return LOGS['local' + suffix].deleted ? null : LOGS['local' + suffix];
  for (const k in LOGS) if (k.endsWith(suffix)) return LOGS[k];
  return null;
}
function sessDone(week, day){ return Object.keys(SESS).some(k => k.endsWith('|' + week + '|' + day)); }

/* ---------- ekran powitalny (v80): pierwsze wejście z linku od trenera; raz na telefon (wel_<klucz>), ponownie z zakładki Trener ----------
   Kroki: powitanie → dodanie do ekranu głównego (iPhone / Android, system wykryty z przeglądarki) → jak wygląda trening.
   Aplikacja otwarta już z ekranu głównego (display-mode standalone) nie pokazuje go sama. */
const WELK = 'wel_' + KEY;
const STANDALONE = (() => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } })();
const PLAT = TL.welPlatform(navigator.userAgent, navigator.maxTouchPoints);
let WEL = null, BIP = null, WEL_TRIED = false;          // WEL = { step, os, installed }; BIP = odłożone zdarzenie instalacji Chrome (Android)
addEventListener('beforeinstallprompt', e => { e.preventDefault(); BIP = e; if (WEL && WEL.step === 1) welDraw(); });
addEventListener('appinstalled', () => { BIP = null; if (WEL) { WEL.installed = true; if (WEL.step === 1) welDraw(); } });
// iPhone otwiera aplikację z ekranu początkowego pod start_url z manifestu i z osobną pamięcią: manifest z kluczem w start_url,
// żeby nie pytała o link (gdyby Safari go nie przyjął, zostaje askKey i przycisk „Kopiuj link” na ekranie powitalnym)
if (PLAT === 'ios' && KEY && !LIVE && !STANDALONE) fetch('manifest.json').then(r => r.json()).then(m => {
  const l = document.querySelector('link[rel="manifest"]');
  if (l) l.href = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(TL.keyManifest(m, new URL('./', location.href).href, KEY)));
}).catch(() => {});
function welMaybe(){
  if (WEL_TRIED) return; WEL_TRIED = true;
  let seen = true; try { seen = !!localStorage.getItem(WELK); } catch (e) {}
  if (KEY_LINK && !seen && !STANDALONE) welOpen();
}
function welOpen(){ WEL = { step: 0, os: PLAT === 'android' ? 'android' : 'ios', installed: STANDALONE }; $('#wel').hidden = false; welDraw(); }
// na czas kroku „iPhone” klucz wraca do paska adresu: gdyby Safari nie przyjął manifestu z kluczem, zakładka na ekranie weźmie bieżący adres
function welUrl(on){
  if (PLAT !== 'ios' || STANDALONE || !KEY) return;
  let saved = false; try { saved = localStorage.getItem('key') === KEY; } catch (e) {}
  if (!saved) return;                                  // klucz i tak został w adresie (pamięć telefonu nie działa)
  const base = TL.urlNoKey(location.pathname, location.search, location.hash), h = location.hash;
  const url = on ? base.slice(0, base.length - h.length) + (base.slice(0, base.length - h.length).includes('?') ? '&' : '?') + 'k=' + encodeURIComponent(KEY) + h : base;
  if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', url);
}
function welClose(){
  welUrl(false);
  try { localStorage.setItem(WELK, '1'); } catch (e) {}
  WEL = null; $('#wel').hidden = true; $('#wel').innerHTML = '';
}
const SHARE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8"/></svg>';
const ADDSQ_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';
const KEBAB_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>';
function welDraw(){
  const w = WEL, n = 3, inApp = TL.welInApp(navigator.userAgent);
  const ol = items => `<div class="wl-box"><ol class="wl-list">${items.map((t, i) => `<li><span class="n">${i + 1}</span><span>${t}</span></li>`).join('')}</ol></div>`;
  let body = '', foot = '';
  if (w.step === 0) {
    body = `<img class="wl-hero" src="icons/icon-192.png" alt="">
      <h2 id="wel-t">Cześć${NAME ? ', ' + esc(NAME) : ''}!</h2>
      <p class="lead">Tu masz plan od trenera i zapisujesz, jak poszło. Dwie minuty na start.</p>
      <div class="wl-box"><ul class="wl-list">
        <li><span class="ic" aria-hidden="true">${CAL_SVG}</span><span><b>Plan na każdy dzień</b><br>ćwiczenia, serie, ciężar</span></li>
        <li><span class="ic" aria-hidden="true">✓</span><span><b>Zapis w kilka sekund</b><br>jedno dotknięcie po serii, działa też bez zasięgu</span></li>
        <li><span class="ic" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.5"><path d="${ES_ICON.note}"/></svg></span><span><b>Kontakt z trenerem</b><br>filmy z serii i komentarze do nich</span></li>
      </ul></div>`;
    foot = `<button type="button" class="btn p" data-wl="1">Dalej</button>`;
  } else if (w.step === 1) {
    const ios = w.os === 'ios';
    const steps = ios
      ? [`Dotknij <span class="wl-k">${SHARE_SVG}Udostępnij</span> na pasku Safari (na dole ekranu albo obok adresu).`,
         `Przewiń listę i wybierz <span class="wl-k">${ADDSQ_SVG}Do ekranu początkowego</span>`,
         'Dotknij <b>„Dodaj”</b> w prawym górnym rogu. Ikona z talerzem pojawi się na ekranie.']
      : [`Dotknij <span class="wl-k">${KEBAB_SVG}</span> w prawym górnym rogu Chrome.`,
         'Wybierz <b>„Dodaj do ekranu głównego”</b> albo <b>„Zainstaluj aplikację”</b>.',
         'Potwierdź <b>„Zainstaluj”</b>. Ikona z talerzem pojawi się na ekranie.'];
    body = `<h2 id="wel-t">Dodaj na ekran główny</h2>
      <p class="lead">Trening otworzysz jednym dotknięciem, jak zwykłą aplikację, także bez zasięgu.</p>
      ${w.installed ? '<div class="wl-ok">✓ Aplikacja jest już na ekranie głównym.</div>' : `
      <div class="seg" role="group" aria-label="Telefon"><button type="button" data-os="ios" aria-pressed="${ios}">iPhone</button><button type="button" data-os="android" aria-pressed="${!ios}">Android</button></div>
      ${inApp ? `<div class="wl-warn">Link otworzył się w komunikatorze. Najpierw dotknij <b>⋯</b> i wybierz <b>„Otwórz w ${ios ? 'Safari' : 'przeglądarce'}”</b>, potem wróć do tych kroków.</div>` : ''}
      ${!ios && BIP ? '<button type="button" class="btn p" id="wl-inst">Zainstaluj aplikację</button><p class="wl-note">Nie widzisz okna instalacji? Zrób to ręcznie:</p>' : ''}
      ${ol(steps)}
      ${ios ? '<p class="wl-note">Gdyby aplikacja z ekranu poprosiła o link od trenera, wklej go. <button type="button" class="btn" id="wl-copy" style="margin-top:6px;width:100%">Kopiuj mój link</button></p>' : ''}`}`;
    foot = `<button type="button" class="btn p" data-wl="2">Dalej</button>`;
  } else {
    body = `<h2 id="wel-t">Jak wygląda trening</h2>
      ${ol(['Aplikacja sama otwiera <b>dzisiejszy trening</b>. Inny dzień wybierzesz w pasku tygodnia na górze.',
            'Szare liczby w polach to <b>plan</b>. Zrobione tak samo? Dotknij <b>✓</b>. Inaczej? Wpisz swoją liczbę.',
            `Oceń, jak było: <span class="nw"><span class="wl-lt g"></span>Lekko</span> <span class="nw"><span class="wl-lt y"></span>Średnio</span> <span class="nw"><span class="wl-lt r"></span>Ciężko</span>.${SIMPLE ? '' : ' Dokładniej: RPE albo RIR.'}`,
            'Na koniec <b>„Zakończ i zapisz trening”</b>. Trener widzi wszystko u siebie.'])}
      <p class="wl-note">Przy pierwszym treningu podpowiedzi pokażą resztę. Ten ekran otworzysz ponownie w zakładce <b>Trener</b>.</p>`;
    foot = `<button type="button" class="btn p" id="wl-end">Zaczynamy</button>`;
  }
  $('#wel').innerHTML = `<div class="wl-top"><img src="icons/favicon.svg" alt=""><b>Siła z Ruchu</b>${w.step < n - 1 ? '<button type="button" class="wl-skip" id="wl-skip">Pomiń</button>' : ''}</div>
    <div class="wl-in"><div class="wl-dots" aria-label="Krok ${w.step + 1} z ${n}">${Array.from({ length: n }, (_, i) => `<i class="${i <= w.step ? 'on' : ''}"></i>`).join('')}</div>
    ${body}<div class="wl-foot">${foot}</div></div>`;
  $('#wel').scrollTop = 0;
  welUrl(w.step === 1 && w.os === 'ios' && !w.installed);
  $('#wel').querySelectorAll('[data-wl]').forEach(b => b.onclick = () => { w.step = +b.dataset.wl; welDraw(); });
  $('#wel').querySelectorAll('[data-os]').forEach(b => b.onclick = () => { w.os = b.dataset.os; welDraw(); });
  const sk = $('#wl-skip'); if (sk) sk.onclick = welClose;
  const en = $('#wl-end'); if (en) en.onclick = welClose;
  const ins = $('#wl-inst'); if (ins) ins.onclick = () => { const e = BIP; BIP = null; e.prompt(); e.userChoice.then(c => { if (c && c.outcome === 'accepted') w.installed = true; if (WEL === w) welDraw(); }).catch(() => {}); };
  const cp = $('#wl-copy'); if (cp) cp.onclick = () => {
    const url = new URL('./', location.href).href + '?k=' + encodeURIComponent(KEY);
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => { cp.textContent = '✓ Link skopiowany'; }, () => { cp.textContent = 'Nie udało się. Link masz w wiadomości od trenera.'; });
  };
  $('#wel-t').setAttribute('tabindex', '-1'); $('#wel-t').focus({ preventScroll: true });   // czytnik ekranu zaczyna od nagłówka kroku
}

/* ---------- tryb prosty: pełna ściągawka, zwinięta na dole Treningu (na start są podpowiedzi: tipDraw) ---------- */
function helpCard(){
  if (!SIMPLE) return '';
  return `<details class="help"><summary>Jak to działa?</summary><ol>
    <li>Aplikacja sama otwiera dzisiejszy albo najbliższy trening. Inny dzień wybierzesz w pasku tygodnia na górze (◀ ▶ zmienia tydzień). <b>Przytrzymaj</b> dzień, żeby przenieść trening na inny dzień.</li>
    <li>Szare liczby w polach to ciężar i powtórzenia z planu. Zrobiłeś tak samo? Po prostu dotknij <b>✓</b>. Inaczej? Wpisz swoją liczbę, nie trzeba nic kasować.</li>
    <li>Po każdej serii wybierz, jak było ciężko, i dotknij <b>✓</b>. Zielony = zapisane.</li>
    <li>Całe ćwiczenie poszło zgodnie z planem? Dotknij <b>„✓ Wszystko jak w planie”</b>.</li>
    <li>Rozgrzewkę dopiszesz przyciskiem <b>„+ rozgrzewka”</b> pod seriami. Po ✓ kolejne serie same przejmują ciężar i powtórzenia (szare liczby = propozycja). Pasek −5 / −2,5 / +2,5 / +5 pod bieżącą serią zmienia ją i kolejne; przytrzymanie ±2,5 daje ±1 kg. Dotknięcie podkreślonego ciężaru pokazuje talerze.</li>
    <li>Seria się nie udała? Dotknij <b>✓</b> jeszcze raz: zmieni się w czerwony <b>✕</b> (nieudana). Trzecie dotknięcie czyści pole. Drop set (od razu lżej, do zmęczenia) dodajesz przyciskiem <b>„+ drop set”</b> pod seriami. Zrobione ćwiczenie samo się zwija; dotknij nazwy, żeby je otworzyć.</li>
    <li>Żółte pole = seria czeka na wysłanie (brak zasięgu). Wyśle się sama.</li>
    <li>Rwanie i podrzut: dotknij świateł i oceń podejście (Łatwo, Średnio, Walka, Spalone). Pod spodem pojawi się propozycja ciężaru na kolejne serie.</li>
    <li>Dodałeś wiersz przez pomyłkę? Dotknij <b>✕</b> przy jego numerze, a potem <b>„usuń?”</b>.</li>
    <li>Pod <b>„⋯”</b> przy nazwie ćwiczenia są: komentarz, zamiana i <b>„Pomiń”</b>; <b>▶</b> obok to film „Jak wykonać”. Brakuje czasu? Dotknij <b>„⋯”</b> w górnym pasku i wybierz <b>„Skróć trening”</b>: aplikacja zaproponuje, co pominąć. Zmiana w ćwiczeniu (inny sprzęt, inna liczba serii)? Wpisz ją w <b>„⋯” → „Komentarz do ćwiczenia”</b>.</li>
    <li>Film jest opcjonalny: ikona kamery przy serii. Najlepiej krótki, nagrany w 720p. Potrzebny jest zasięg.</li>
    <li>Na koniec przewiń w dół i dotknij <b>„Zakończ i zapisz trening”</b>. Czas liczy się sam od pierwszego wpisu. Włączyłeś za wcześnie? Na dole jest <b>„Licz czas od teraz”</b> i pole do poprawienia minut.</li>
  </ol></details>`;
}

/* ---------- podpowiedzi przy pierwszym użyciu: dymek przy elemencie, po kolei, każda raz (tip_<klucz>) ---------- */
const TIPK = 'tip_' + KEY;
const TIPS = [
  { id: 'seria', up: true, sel: '.card[data-card]:not(.fold) .set[data-k="p"][data-st=""] .ok', h: 'Zrobione? Dotknij ✓',
    t: 'Szare liczby to plan. Zrobiłeś tak samo, dotknij ✓. Inaczej, wpisz swoją liczbę. Drugie dotknięcie ✓ = seria nieudana (✕).' },
  { id: 'wiecej', sel: '.card[data-card]:not(.fold) [data-more]', h: 'Więcej pod „⋯”', t: 'Komentarz do ćwiczenia, zamiana na inne i „Pomiń”.' },
  { id: 'kamera', up: true, sel: '.card[data-card]:not(.fold) .set button.cam', h: 'Nagraj serię', t: 'Film trafi do trenera razem z tą serią. Najlepiej krótki, w 720p. Potrzebny zasięg.' },
  { id: 'dzien', sel: '.wk[data-wk="t"] .wk-d.cur, .wk[data-wk="t"] .wk-d:not(.free)', h: 'Inny dzień?', t: 'Przytrzymaj dzień w pasku, żeby przenieść trening. Dotknięcie otwiera trening z tego dnia.' }
];
let TIP = null;                                                   // { tip, el } pokazywanej podpowiedzi
let TIPN = null;                                                  // id podpowiedzi niewidzianych przy starcie: licznik „n z m” tylko z nich (nowa = „1 z 1”)
const tipSeen = () => { try { const a = JSON.parse(localStorage.getItem(TIPK) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const tipEl = t => [...document.querySelectorAll(t.sel)].find(e => e.offsetParent !== null) || null;
/** rysuje pierwszą nieobejrzaną podpowiedź, której element jest na ekranie Treningu; go = przewiń do niej */
function tipDraw(go){
  let box = $('#tip');
  if (TIP) { TIP.el.classList.remove('tipring'); TIP = null; }
  const id = TAB === 'trening' && !LIVE ? nextTip(TIPS.map(t => t.id), tipSeen(), TIPS.filter(tipEl).map(t => t.id)) : '';
  if (!id) { if (box) box.hidden = true; return; }
  const tip = TIPS.find(t => t.id === id), el = tipEl(tip);
  if (!TIPN) { const seen = tipSeen(); TIPN = TIPS.map(t => t.id).filter(x => !seen.includes(x)); }
  if (!TIPN.includes(id)) TIPN.push(id);
  if (!box) {
    box = document.createElement('aside'); box.id = 'tip'; box.setAttribute('aria-label', 'Podpowiedź');
    document.body.appendChild(box);
    document.addEventListener('click', e => { if (TIP && TIP.el.contains(e.target)) tipOk(false); }, true);   // użył = rozumie
    window.addEventListener('resize', tipPlace);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(tipPlace).observe($('#main'));              // karta się zwinęła, doszedł wiersz
  }
  box.innerHTML = `<b class="h">${esc(tip.h)}</b>${esc(tip.t)}<div class="r"><small>${TIPN.indexOf(id) + 1} z ${TIPN.length}</small><button type="button" id="tip-ok">Rozumiem</button></div>`;
  box.className = tip.up ? 'dn' : 'up'; box.hidden = false;
  el.classList.add('tipring'); TIP = { tip, el };
  $('#tip-ok').onclick = () => tipOk(true);
  tipPlace();
  if (go) el.scrollIntoView({ block: 'center', behavior: calm() ? 'auto' : 'smooth' });
}
function tipPlace(){
  const box = $('#tip'); if (!TIP || !box || box.hidden) return;
  if (!TIP.el.isConnected || TIP.el.offsetParent === null) return tipDraw();
  const r = TIP.el.getBoundingClientRect(), vw = document.documentElement.clientWidth, w = Math.min(270, vw - 24);
  const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), vw - w - 12);
  box.style.width = w + 'px'; box.style.left = (left + window.scrollX) + 'px';
  box.style.setProperty('--ax', (r.left + r.width / 2 - left - 7) + 'px');
  box.style.top = (window.scrollY + (TIP.tip.up ? r.top - 16 - box.offsetHeight : r.bottom + 16)) + 'px';
}
function tipOk(go){
  if (!TIP) return;
  try { localStorage.setItem(TIPK, JSON.stringify(tipSeen().concat(TIP.tip.id))); } catch (e) {}
  tipDraw(go);
}

/* ---------- render ---------- */
function render(){
  $('#nav').hidden = !PLAN.length && !ownOn();                  // bez planu, ale z własnymi treningami: menu jest
  document.querySelectorAll('#nav [data-tab]').forEach(b => {
    b.setAttribute('aria-current', b.dataset.tab === TAB ? 'page' : 'false');
    b.onclick = () => { if (b.dataset.tab === 'trener' && TAB !== 'trener') CNEW = new Set(); TAB = b.dataset.tab; WK = null; render(); window.scrollTo(0, 0); };
  });
  $('#main').hidden = TAB !== 'trening'; $('#plan').hidden = TAB !== 'plan'; $('#dysp').hidden = TAB !== 'dysp'; $('#postep').hidden = TAB !== 'postep'; $('#trener').hidden = TAB !== 'trener';
  if (TAB === 'plan') renderPlan(); else if (TAB === 'dysp') renderDysp(); else if (TAB === 'postep') renderPostep(); else if (TAB === 'trener') renderTrener(); else renderTrening();
  navDot();
  if (TAB !== 'trening') tipDraw();
  curKeep();
}
/** pusty stan: karta z ikoną; btn = [id albo atrybut, napis] */
const ES_ICON = {
  plan: 'M5 24h38M12 15v18M36 15v18M18 19v10M30 19v10',
  chart: 'M8 40V8M8 40h32M14 32l8-10 6 6 10-14',
  pulse: 'M4 26h10l5-12 8 22 5-10h12',
  note: 'M7 9h34v24H21l-10 8v-8H7z'
};
function emptyCard(icon, title, text, btn){
  return `<section class="card first es"><svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="${ES_ICON[icon]}"/></svg>
    <div class="cn">${title}</div><p class="sub">${text}</p>${btn ? `<button type="button" class="btn" ${btn[0]}>${btn[1]}</button>` : ''}</section>`;
}
const ES_GO = ['data-go="trening"', 'Przejdź do treningu'];
function head(eyebrow, title, stats, extra){
  // tryb trenera: czyj trening (data jest w pasku tygodnia)
  $('#eyebrow').textContent = LIVE && NAME ? 'Prowadzisz · ' + NAME : eyebrow; $('#title').textContent = title; $('#stats').innerHTML = stats || ''; $('#hx').innerHTML = extra || '';
}
const weekLabel = w => { if (String(w) === '0') return 'Historia'; const b = blockInfo(PLAN, w); return b ? 'Blok ' + b.block + ' · tydz. ' + b.n : 'Tydz. ' + w; };
/** czas, serie zrobione/wszystkie, tonaż bieżącej jednostki w nagłówku */
function refreshStats(){
  if (TAB !== 'trening') return;
  const st = unitStats(curExs(), exLogs);
  const sets = $('#st-sets'), ton = $('#st-ton');
  if (sets) sets.textContent = st.done + '/' + st.all;
  if (ton) ton.textContent = st.ton.toLocaleString('pl-PL');
  todayDraw();
  fxDraw();
  sekDraw();
}
/** karta „dziś” (lib todayInfo): przed startem ile ćwiczeń, serii i minut; w trakcie postęp i następne ćwiczenie; po serii rysowana od nowa */
function todayDraw(){
  $('#main').classList.remove('slim');
  const box = $('#today'); if (!box) return;
  const exs = curExs(); if (!exs.length) return;
  const t = todayInfo(exs.map(ex => ({ order: ex.order, name: ex.name, prio: ex.prio, sets: ex.skip && !ex.sets ? 0 : ex.sets,
    done: document.querySelectorAll(`.set[data-o="${ex.order}"][data-k="p"]:not([data-st=""])`).length })), curDate(), localDate(), unitList().some(u => u.date === localDate()));
  const d = weekday(curDate()) + ' ' + ddmm(curDate());
  const eye = { today: 'Dziś · ' + d, late: 'Zaległy · ' + d, free: 'Dziś wolne · najbliższy: ' + d, plan: 'Zaplanowany · ' + d }[t.when];
  const line = !t.next ? 'Wszystkie serie zrobione. Zostało podsumowanie.'
    : t.done ? `Zrobione <b>${t.done} z ${t.all}</b> ${plural(t.all, 'serii', 'serii', 'serii')} · zostało ok. <b>${t.min} min</b>`
    : `<b>${t.n}</b> ${plural(t.n, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')} · <b>${t.all}</b> ${plural(t.all, 'seria', 'serie', 'serii')} · ok. <b>${t.min} min</b>`;
  box.innerHTML = `<div class="td-row"><div><div class="td-e">${eye}</div><div class="td-t">${esc(exs[0].title || cur.day)}</div><div class="td-s">${line}</div></div>
      <button type="button" class="btn p" id="td-go">${!t.next ? 'Zakończ' : t.done ? 'Dalej' : 'Zacznij'}</button></div>` +
    (t.done && t.next ? `<div class="td-pb" role="progressbar" aria-label="Zrobione serie" aria-valuemin="0" aria-valuemax="${t.all}" aria-valuenow="${t.done}"><i style="width:${Math.round(100 * t.done / t.all)}%"></i></div>
      <div class="td-n">Następne: <b>${esc(t.next.name)}</b></div>` : '');
  box.hidden = false;
  slimDraw(t);
  $('#td-go').onclick = () => {
    if (t.next) { sekOpen(t.next.order); setFold(t.next.order, false); }
    const c = t.next ? document.querySelector(`.card[data-card="${t.next.order}"]`) : document.querySelector('.card.sess'); if (!c) return;
    const g = c.closest('.grp') || c;
    window.scrollTo({ top: g.getBoundingClientRect().top + window.scrollY - 8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
}

/** punkt 9 v80: od 1. zapisanej serii roboczej do „wszystko zrobione” zamiast karty „dziś”, paska tygodnia i banera jedna linia;
 *  ▾ rozwija pełny widok do końca tej jednostki (WKX, tylko w pamięci strony) */
let WKX = '';
function slimDraw(t){
  const m = $('#main'), box = $('#wkm'); if (!box) return;
  const u = cur.week + '|' + cur.day, on = !!(t.done && t.next) && WKX !== u;
  m.classList.toggle('slim', on);
  if (!on) return;
  const r = todayRow(), lvl = !r ? 'none' : /zmęcz/i.test(r.werdykt || '') ? 'bad' : /uwaga/i.test(r.werdykt || '') ? 'warn' : 'ok';
  const b = blockInfo(PLAN, cur.week);
  box.innerHTML = `<span class="wd">${esc(weekday(curDate()) + ' ' + curDate().slice(8, 10))} · ${esc(cur.day)}</span>` +
    `<span class="mut">${esc([b ? b.block + ' · tydz. ' + b.n : 'tydz. ' + cur.week, 'ok. ' + t.min + ' min'].join(' · '))}</span>` +
    (r ? `<i class="dot lv-${lvl}" role="img" aria-label="Dyspozycja: ${esc(r.werdykt || '')}"></i>` : '') +
    `<button type="button" id="wkm-x" aria-label="Pokaż tydzień i dyspozycję" aria-expanded="false">▾</button>`;
  $('#wkm-x').onclick = () => { WKX = u; m.classList.remove('slim'); };
}

/* ---------- ekran Dyspozycja: ankieta Hoopera, CMJ, prędkość na rozgrzewce → werdykt ---------- */
const RDK = 'rd_' + KEY;
let RD = null;   // dzisiejsze pomiary (szkic w telefonie do czasu „Zapisz”)
const readyRows = () => ((DATA && DATA.readiness) || []).map(x => Object.assign({}, x, { data: dayOf(x.data) }));
const todayRow = () => readyRows().filter(x => x.data === localDate()).pop();
function rdLoad(){
  const t = localDate();
  if (RD && RD.date === t) return RD;
  let d = null; try { d = JSON.parse(localStorage.getItem(RDK) || 'null'); } catch (e) {}
  if (d && d.date === t) return RD = d;
  const r = todayRow(), n = v => isNum(num(v)) ? num(v) : '';
  const ex = String(r && r.cmj_wykluczone || '').split(',').map(Number);
  return RD = r ? { date: t, cmj: [r.cmj1, r.cmj2, r.cmj3].map(n), excl: [1, 2, 3].map(i => ex.includes(i)), hooper: Object.fromEntries(HOOPER.map(q => [q[0], +r[q[0]] || 0])), vbt: n(r.vbt_test), saved: true }
    : { date: t, cmj: ['', '', ''], excl: [false, false, false], hooper: {}, vbt: '', saved: false };
}
const rdKeep = () => { try { localStorage.setItem(RDK, JSON.stringify(RD)); } catch (e) {} };
/** zapisany wpis od razu w danych aplikacji (baner, sufit dnia w bojach, średnie); save = pamięć telefonu */
function applyReady(p, save){
  if (!DATA) return;
  const hq = p.hooper || {};
  const row = { id: 'local|' + p.date, data: p.date, cmj1: (p.cmj || [])[0], cmj2: (p.cmj || [])[1], cmj3: (p.cmj || [])[2], cmj_sr: p.cmjAvg,
    sen: hq.sen, stres: hq.stres, zmeczenie: hq.zmeczenie, bolesnosc: hq.bolesnosc, hooper_suma: hq.suma, vbt_test: p.vbt, werdykt: p.verdict, powody: (p.reasons || []).join('; '),
    cmj_wykluczone: (p.excl || []).map((x, i) => x ? i + 1 : 0).filter(Boolean).join(',') };
  DATA.readiness = (DATA.readiness || []).filter(x => dayOf(x.data) !== p.date).concat([row]);
  if (save) try { localStorage.setItem(DK, JSON.stringify(DATA)); } catch (e) {}
}
const READY_MARK = { ok: '✓', warn: '!', bad: '✗' };
/** baner dyspozycji dnia na ekranie treningu: kolor + zalecenie, dotknięcie → ekran Dyspozycja */
function readyBanner(){
  const r = todayRow();
  const lvl = !r ? 'none' : /zmęcz/i.test(r.werdykt || '') ? 'bad' : /uwaga/i.test(r.werdykt || '') ? 'warn' : 'ok';
  if (r && readyCount() < READY_MIN) return `<button type="button" class="ready lv-none" id="go-dysp"><b>Zbieram Twoją średnią</b><span>${Math.min(readyCount() + 1, READY_MIN)}/${READY_MIN} pomiarów — ocena ruszy po ${READY_MIN}. Trenuj według planu.</span></button>`;
  return `<button type="button" class="ready lv-${lvl}" id="go-dysp">` + (r ? `<b>${esc(r.werdykt)}</b><span>${READY_ADVICE[lvl]}</span>`
    : '<b>Dyspozycja dnia</b><span>Nie zmierzono dziś. Dotknij: ankieta, skok i prędkość, ok. 3 min.</span>') + '</button>';
}
/** ostatnie zapisane dni (bez dzisiejszego): data, werdykt, ankieta, CMJ, prędkość; pełna historia w Postęp → Dyspozycja */
function readyHistory(){
  const today = localDate(), f = v => isNum(num(v)) ? fmtKg(Math.round(num(v) * 100) / 100) : '';
  const rows = readyRows().filter(x => x.data && x.data !== today && (x.werdykt || x.hooper_suma || x.cmj_sr || x.vbt_test))
    .sort((a, b) => b.data.localeCompare(a.data)).slice(0, 7);
  if (!rows.length) return '';
  return `<section class="card rhist"><div class="cn">Ostatnie pomiary</div>` + rows.map(r => {
    const parts = [f(r.hooper_suma) && 'ankieta ' + f(r.hooper_suma), f(r.cmj_sr) && 'CMJ ' + f(r.cmj_sr) + ' cm', f(r.vbt_test) && f(r.vbt_test) + ' m/s'].filter(Boolean).join(' · ');
    return `<div class="kv"><span>${weekday(r.data)} ${ddmm(r.data)}${r.werdykt ? ' · ' + esc(r.werdykt) : ''}</span><b>${esc(parts || '–')}</b></div>`;
  }).join('') + `<p class="sub">Wykresy całej historii: Postęp → Dyspozycja.</p></section>`;
}
const READY_MIN = 5;     // tyle pomiarów, zanim aplikacja oceni dyspozycję (wcześniej: „Zbieram Twoją średnią”)
const readyCount = () => readyRows().filter(x => x.data && x.data !== localDate()).length;
function renderDysp(){
  const rd = rdLoad(); rd.excl = rd.excl || [false, false, false];
  const base = readyBase(readyRows(), rd.date), sp = cmjSpread(rd.cmj, rd.excl);
  const v = verdict(Object.assign({}, rd, { cmj: rd.cmj.map((c, i) => rd.excl[i] ? '' : c) }), base);
  const n = readyCount(), collecting = n < READY_MIN, lvl = collecting && v.lvl !== 'none' ? 'none' : v.lvl;
  const f1 = x => isFinite(x) ? fmtKg(Math.round(x * 10) / 10) : '–', f2 = x => isFinite(x) ? fmtKg(Math.round(x * 100) / 100) : '–';
  head('Przed treningiem · ok. 3 min', 'Dyspozycja dnia', '');
  // brak historii ≠ dobra dyspozycja: do READY_MIN pomiarów bez oceny, same wyniki
  const title = v.lvl === 'none' ? v.title : collecting ? 'Zbieram Twoją średnią' : v.title;
  const reasons = v.out.length ? `<ul>${v.out.map(o => `<li class="${collecting ? 'lv-n' : 'lv-' + o[0]}">${collecting ? '' : `<i aria-hidden="true">${READY_MARK[o[0]]}</i> `}${esc(collecting ? o[1].replace(/ \((pierwsze[^)]*)\)$/, '') : o[1])}</li>`).join('')}</ul>` : '';
  const verdictCard = `<section class="verdict lv-${lvl}" aria-live="polite"><h2>${title}</h2>
      ${collecting && v.lvl !== 'none' ? `<p class="vcount">${Math.min(n + (rd.saved ? 1 : 0), READY_MIN)}/${READY_MIN} pomiarów · ocena ruszy po ${READY_MIN}.</p>` : ''}
      ${reasons}<p>${collecting && v.lvl !== 'none' ? 'Na razie trenuj według planu. Mierz codziennie tak samo, żeby średnia była wiarygodna.' : v.advice}</p></section>`;
  const sumLine = [isFinite(v.hs) ? 'Ankieta ' + v.hs : '', isFinite(sp.avg) ? 'CMJ ' + f1(sp.avg) + ' cm' : '', isNum(num(rd.vbt)) ? f2(num(rd.vbt)) + ' m/s' : ''].filter(Boolean).join(' · ');
  if (rd.saved && !rd.edit) {
    $('#dysp').innerHTML = verdictCard + `<section class="card dsum"><div><div class="lbl">Zapisane dziś</div><b>${esc(sumLine || '–')}</b></div><button type="button" class="btn" id="rd-edit">Edytuj</button></section>
      <p class="sub">To wskazówka do rozmowy z trenerem, nie diagnoza.</p><div id="stanbox"></div>` + readyHistory();
    $('#rd-edit').onclick = () => { rd.edit = true; renderDysp(); };
    renderStan();
    return;
  }
  const odd = sp.out.filter(i => !rd.excl[i]);
  $('#dysp').innerHTML = verdictCard + `
    <section class="card"><div class="cn">1 · Ankieta</div><div class="sub">Skala 1–7. Sen: wyżej = lepiej. Pozostałe: wyżej = gorzej.${isFinite(v.hs) ? ' Suma dziś: <b>' + v.hs + '</b>' + (isFinite(base.hooper) && !collecting ? ', średnio ' + Math.round(base.hooper) : '') + '.' : ''}</div>
      ${HOOPER.map(([k, nm, hint, rev]) => `<div class="q"><div class="plbl">${nm} <small>${hint}</small></div><div class="scale s7" data-q="${k}" role="group" aria-label="${nm}">` +
        [1, 2, 3, 4, 5, 6, 7].map(n => { const i = rev ? 8 - n : n; return `<button type="button" class="pv n ${rd.hooper[k] === i ? 'on' : ''}" data-v="${i}" aria-pressed="${rd.hooper[k] === i}">${n}</button>`; }).join('') + '</div></div>').join('')}</section>
    <section class="card"><div class="cn">2 · Skok CMJ</div><div class="sub">3 skoki, ręce na biodrach, 30 s przerwy. Wpisz cm albo zmierz z filmu slow-mo.</div>
      <div class="jumps">${rd.cmj.map((c, i) => `<div class="jmp ${rd.excl[i] ? 'ex' : ''} ${sp.out.includes(i) ? 'odd' : ''}"><label class="fl">Skok ${i + 1}<input inputmode="decimal" data-j="${i}" value="${esc(fmtKg(c))}" placeholder="cm"></label>
        ${isNum(num(c)) ? `<button type="button" class="btn sm tg" data-ex="${i}" aria-pressed="${!!rd.excl[i]}">${rd.excl[i] ? 'Wykluczony' : 'Wyklucz'}</button>` : ''}</div>`).join('')}</div>
      ${odd.length ? `<p class="hint" role="alert">${odd.map(i => 'Skok ' + (i + 1)).join(', ')} ${odd.length > 1 ? 'odstają' : 'odstaje'} o ponad 8% od mediany (${f1(sp.median)} cm) — dotknij pola i popraw wynik, zmierz go jeszcze raz z filmu albo ${odd.length > 1 ? 'je' : 'go'} wyklucz ze średniej.</p>` : ''}
      <div class="kv"><span>Średnia dziś${rd.excl.some(Boolean) ? ' (bez wykluczonych)' : ''}</span><b>${f1(sp.avg)} cm</b></div><div class="kv"><span>Twoja średnia (5 testów)</span><b>${collecting ? '– (' + n + '/' + READY_MIN + ')' : f1(base.cmj) + ' cm'}</b></div>
      <button type="button" class="btn" id="cmj-vid">Zmierz skok z filmu</button></section>
    <section class="card"><div class="cn">3 · Prędkość na rozgrzewce</div><div class="sub">Zawsze to samo ćwiczenie i ten sam ciężar, 1 powtórzenie, najlepsza próba. Wynik z analizy filmu albo z urządzenia.</div>
      <label class="fl">Prędkość (m/s)<input id="rd-vbt" inputmode="decimal" value="${esc(fmtKg(rd.vbt))}" placeholder="np. 1,05"></label>
      <div class="kv"><span>Twoja średnia (5 pomiarów)</span><b>${collecting ? '–' : f2(base.vbt) + ' m/s'}</b></div></section>
    <button type="button" class="btn p" id="rd-save">${rd.saved ? 'Zapisz zmiany' : 'Zapisz dyspozycję'}</button>
    <p class="sub">${rd.saved ? 'Dzisiejsza dyspozycja jest zapisana.' : 'Pomiary zostają w telefonie, dopóki nie dotkniesz „Zapisz”.'} To wskazówka do rozmowy z trenerem, nie diagnoza.</p><div id="stanbox"></div>` + readyHistory();
  renderStan();
  const keep = () => { const y = window.scrollY; rd.saved = false; rd.edit = true; rdKeep(); renderDysp(); window.scrollTo(0, y); };
  document.querySelectorAll('#dysp .scale[data-q] button').forEach(b => b.onclick = () => { rd.hooper[b.parentElement.dataset.q] = +b.dataset.v; keep(); });
  document.querySelectorAll('#dysp input[data-j]').forEach(i => i.onchange = () => { const x = num(i.value); rd.cmj[+i.dataset.j] = isNum(x) ? x : ''; if (!isNum(x)) rd.excl[+i.dataset.j] = false; keep(); });
  document.querySelectorAll('#dysp [data-ex]').forEach(b => b.onclick = () => { rd.excl[+b.dataset.ex] = !rd.excl[+b.dataset.ex]; keep(); });
  $('#rd-vbt').onchange = e => { const x = num(e.target.value); rd.vbt = isNum(x) ? x : ''; keep(); };
  $('#cmj-vid').onclick = () => openCMJ(rd, keep);
  $('#rd-save').onclick = () => {
    if (v.lvl === 'none') { toast('Najpierw wypełnij ankietę, wpisz skok albo prędkość.'); return; }
    const p = { date: rd.date, cmj: rd.cmj, cmjAvg: isFinite(sp.avg) ? Math.round(sp.avg * 10) / 10 : '', excl: rd.excl.slice(),
      hooper: isFinite(v.hs) ? Object.assign({}, rd.hooper, { suma: v.hs }) : {}, vbt: rd.vbt, verdict: v.title, reasons: v.out.filter(o => o[0] !== 'ok').map(o => o[1]) };
    applyReady(p, true); rd.saved = true; rd.edit = false; rdKeep();
    send('saveDyspozycja', p).then(() => toast('Zapisano.')).catch(() => toast('Brak sieci – zapiszę, gdy wróci połączenie.'));
    renderDysp(); window.scrollTo(0, 0);
  };
}
/* ---------- stan ciała: ból / napięcie w dowolny dzień (zakładka Stan; kilka miejsc naraz; zapis przez kolejkę jak reszta) ---------- */
let SD = { sel: [], e: {} };               // szkic: wybrane miejsca (klucze „Kolano L” / „inne”) i wpisy {score, ctx, ex, note, place, side}
const STAN_DAYS = 14;
const stanOpts = () => STAN_PLACES.flatMap(p => ['L', 'P'].map(sd => ({ k: p + ' ' + sd, place: p, side: sd }))).concat([{ k: 'inne', place: '', side: '' }]);
const ctxTxt = (c, ex) => c === 'w ćwiczeniu' ? 'w ćwiczeniu' + (ex ? ': ' + ex : '') : c;
/** wpisy zapisane od razu w danych aplikacji (lista pod formularzem); save = pamięć telefonu */
function applyStan(list, save){
  if (!DATA) return;
  DATA.stan = stanApply(DATA.stan || [], list, new Date().toISOString());
  if (save) try { localStorage.setItem(DK, JSON.stringify(DATA)); } catch (e) {}
}
function applyStanDel(e, save){
  if (!DATA) return;
  DATA.stan = stanDrop(DATA.stan || [], e);
  if (save) try { localStorage.setItem(DK, JSON.stringify(DATA)); } catch (e2) {}
}
/** nazwy ćwiczeń z planu klienta do podpowiedzi pola „Które ćwiczenie?” */
const stanExNames = () => [...new Set((PLAN || []).map(r => String(r.name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
function renderStan(){
  const box = $('#stanbox'); if (!box) return;
  const today = localDate(), opts = stanOpts(), list = stanRecent((DATA && DATA.stan) || [], today, STAN_DAYS);
  const readyOf = () => SD.sel.filter(k => { const e = SD.e[k] || {}; return isNum(e.score) && (k !== 'inne' || String(e.place || '').trim()); });
  const saveTxt = n => n ? 'Zapisz ' + (n === 1 ? '1 miejsce' : n + ' ' + plural(n, 'miejsce', 'miejsca', 'miejsc')) : 'Oceń miejsce, żeby zapisać';
  const ready = readyOf();
  const ent = k => {
    const e = SD.e[k] || (SD.e[k] = { score: null, ctx: '', ex: '', note: '', place: '', side: '' }), lbl = k === 'inne' ? 'Inne' : k, id = k.replace(/\W+/g, '_');
    return `<div class="st-e" data-k="${esc(k)}"><div class="plbl">${esc(lbl)}</div>
      ${k === 'inne' ? `<label class="fl">Miejsce<input class="st-place" maxlength="40" value="${esc(e.place)}" placeholder="np. stopa, kark"></label>
        <div class="st-ch st-side" role="group" aria-label="Strona">${[['L', 'Lewa'], ['P', 'Prawa'], ['', 'Bez strony']].map(([v, t]) => `<button type="button" class="pl ${e.side === v ? 'on' : ''}" data-side="${v}" aria-pressed="${e.side === v}">${t}</button>`).join('')}</div>` : ''}
      <div class="sub">Jak mocno? 0 = nic, 10 = najgorzej</div>
      ${scale('', 0, 10, isNum(e.score) ? e.score : null, painSev, `role="group" aria-label="Ocena: ${esc(lbl)}, 0–10"`)}
      <div class="sub">Kiedy?</div>
      <div class="st-ch st-ctx" role="group" aria-label="Kiedy: ${esc(lbl)}">${STAN_CTX.map(c => `<button type="button" class="pl ${e.ctx === c ? 'on' : ''}" data-ctx="${c}" aria-pressed="${e.ctx === c}">${c}</button>`).join('')}</div>
      ${e.ctx === 'w ćwiczeniu' ? `<label class="fl">Które ćwiczenie?<input class="st-ex" list="st-exl" maxlength="80" value="${esc(e.ex)}" placeholder="np. przysiad"></label>` : ''}
      <label class="fl" for="st-n-${id}">Notatka (opcjonalnie)</label><input class="st-note" id="st-n-${id}" maxlength="300" value="${esc(e.note)}" placeholder="np. kłuje przy zejściu w dół"></div>`;
  };
  const rows = list.map(r => `<div class="kv st-r"><span><b>${weekday(r.day)} ${ddmm(r.day)}</b> · ${esc(r.miejsce)}${r.strona ? ' ' + esc(r.strona) : ''} <b class="st-o ${painSev(+r.ocena)}">${esc(String(r.ocena))}/10</b>${r.kontekst ? '<small> · ' + esc(ctxTxt(r.kontekst, r.cwiczenie)) + '</small>' : ''}${r.notatka ? '<small> · ' + esc(r.notatka) + '</small>' : ''}</span>
      <button type="button" class="st-del" data-del="${esc(stanKey(r.day, r.miejsce, r.strona))}" aria-label="Usuń wpis: ${esc(r.miejsce)}${r.strona ? ' ' + esc(r.strona) : ''}, ${ddmm(r.day)}">✕</button></div>`).join('');
  box.innerHTML = `<section class="card stan"><div class="cn">Ból / napięcie</div>
      <div class="sub">Możesz zapisać w dowolny dzień, także bez treningu. Zaznacz miejsca, oceń i zapisz. Trener zobaczy historię.</div>
      <div class="pls st-pl" role="group" aria-label="Miejsce">${opts.map(o => `<button type="button" class="pl ${SD.sel.includes(o.k) ? 'on' : ''}" data-st="${esc(o.k)}" aria-pressed="${SD.sel.includes(o.k)}">${o.k === 'inne' ? 'Inne' : esc(o.k)}</button>`).join('')}</div>
      ${SD.sel.map(ent).join('')}
      <datalist id="st-exl">${stanExNames().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      ${SD.sel.length ? `<button type="button" class="btn p" id="st-save" ${ready.length ? '' : 'disabled'}>${saveTxt(ready.length)}</button>` : ''}
      <div class="st-list"><div class="lbl">Ostatnie ${STAN_DAYS} dni</div>${rows || '<p class="sub">Brak wpisów.</p>'}</div></section>`;
  const keep = () => { const y = window.scrollY; renderStan(); window.scrollTo(0, y); };
  box.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
    const k = b.dataset.st; SD.sel = SD.sel.includes(k) ? SD.sel.filter(x => x !== k) : SD.sel.concat([k]); keep();
  });
  box.querySelectorAll('.st-e').forEach(el => {
    const e = SD.e[el.dataset.k];
    el.querySelectorAll('.scale .pv').forEach(b => b.onclick = () => { e.score = +b.dataset.v; keep(); });
    el.querySelectorAll('[data-ctx]').forEach(b => b.onclick = () => { e.ctx = e.ctx === b.dataset.ctx ? '' : b.dataset.ctx; keep(); });
    el.querySelectorAll('[data-side]').forEach(b => b.onclick = () => { e.side = b.dataset.side; keep(); });
    const bindIn = (sel, f) => { const i = el.querySelector(sel); if (i) i.oninput = () => {
      e[f] = i.value;
      const sv = $('#st-save'), n = readyOf().length; if (sv) { sv.disabled = !n; sv.textContent = saveTxt(n); }   // bez przerysowania (pole zostaje w edycji)
    }; };
    bindIn('.st-place', 'place'); bindIn('.st-ex', 'ex'); bindIn('.st-note', 'note');
  });
  const sv = $('#st-save');
  if (sv) sv.onclick = () => {
    const ready = readyOf(), out = ready.map(k => { const e = SD.e[k], o = opts.find(x => x.k === k);
      return { date: today, place: k === 'inne' ? String(e.place).replace(/\s+/g, ' ').trim() : o.place, side: k === 'inne' ? e.side : o.side,
        score: e.score, context: e.ctx, exercise: e.ctx === 'w ćwiczeniu' ? String(e.ex || '').trim() : '', note: String(e.note || '').trim() }; });
    applyStan(out, true);
    SD = { sel: SD.sel.filter(k => !ready.includes(k)), e: {} };
    send('saveStan', out).then(() => toast('Zapisano.')).catch(() => toast('Brak sieci – zapiszę, gdy wróci połączenie.'));
    keep();
  };
  // ✕ przy wpisie: 1. dotknięcie = „usuń?”, 2. = usunięcie (też bez sieci, przez kolejkę)
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    if (!b.classList.contains('arm')) { b.classList.add('arm'); b.textContent = 'usuń?'; setTimeout(() => { if (b.isConnected) { b.classList.remove('arm'); b.textContent = '✕'; } }, 3000); return; }
    const i = b.dataset.del.indexOf('|'), date = b.dataset.del.slice(0, i), r = list.find(x => stanKey(x.day, x.miejsce, x.strona) === b.dataset.del);
    if (!r) return;
    const e = { date, place: r.miejsce, side: r.strona || '' };
    applyStanDel(e, true);
    send('deleteStan', e).then(() => toast('Usunięto.')).catch(() => toast('Brak sieci – usunę, gdy wróci połączenie.'));
    keep();
  });
}
/* przykładowe kadry: odbicie (oba palce już nad podłożem) i lądowanie (pierwszy kontakt) */
const CMJ_EX = (land) => `<svg viewBox="0 0 150 76" class="cmj-ex" role="img" aria-label="${land ? 'Lądowanie: pierwszy kontakt stopy z podłożem' : 'Odbicie: oba palce już nad podłożem'}">
  <line x1="6" y1="70" x2="144" y2="70" class="g"/>
  <g transform="translate(${land ? 34 : 30},${land ? 0 : -9}) rotate(${land ? 12 : 22} 60 60)"><path class="f" d="M40 18 h14 v34 q0 6 6 7 l30 4 q8 2 8 8 h-62 q-4 0 -4 -6 z"/></g>
  ${land ? '<circle class="m" cx="119" cy="70" r="5"/>' : '<line class="m" x1="112" y1="55" x2="112" y2="69" stroke-dasharray="3 3"/>'}
  </svg>`;
const CMJ_FIG = land => `<figure class="cmj-f">${CMJ_EX(land)}<figcaption>${land ? '<b>Lądowanie</b>: palce dotykają' : '<b>Odbicie</b>: szpara pod palcami'}</figcaption></figure>`;
/** cały nagłówek moov z pliku (zwykle na końcu nagrania z telefonu) → klatkaż */
async function readMoov(file){
  const rd = async (a, b) => new Uint8Array(await file.slice(a, b).arrayBuffer());
  let o = 0; const n = file.size;
  for (let i = 0; i < 64 && o + 8 <= n; i++) {
    const h = await rd(o, Math.min(n, o + 16)), dv = new DataView(h.buffer); let sz = dv.getUint32(0);
    const t = String.fromCharCode(...h.subarray(4, 8));
    if (sz === 1 && h.length >= 16) sz = Number(dv.getBigUint64(8)); else if (sz === 0) sz = n - o;
    if (sz < 8) break;
    if (t === 'moov') return sz < 64e6 ? rd(o, o + sz) : null;
    o += sz;
  }
  return null;
}
/** skok CMJ z filmu: pierwsza klatka w powietrzu i pierwsza klatka kontaktu → czas lotu → h = g·t²/8; film idzie do trenera (Dysk) */
function openCMJ(rd, done){
  let fileFps = NaN, realFps = 240, tk = null, tl = null, url = null, vid = null, file = null, send2 = true;
  // skok do zapisu: pierwszy pusty, inaczej najbardziej odstający (pomyłka do poprawienia), inaczej 1.; klient może zmienić
  const sp0 = cmjSpread(rd.cmj, rd.excl || []), far = i => Math.abs(num(rd.cmj[i]) - sp0.median);
  let slot = rd.cmj.findIndex(x => !isNum(num(x))); if (slot < 0) slot = sp0.out.length ? sp0.out.reduce((a, b) => far(b) > far(a) ? b : a) : 0;
  openSheet(`<h2 id="sheet-t">CMJ z filmu</h2>
    <div class="cmj-how"><p><b>Odbicie</b> = pierwsza klatka, na której oba palce są już nad podłożem.</p>
      <p><b>Lądowanie</b> = pierwsza klatka, na której jakakolwiek część stopy dotyka podłoża.</p>
      <p>Ręce na biodrach, w locie i przy lądowaniu nogi proste — ugięte kolana zawyżają wynik.</p></div>
    <div class="cmj-exs">${CMJ_FIG(false)}${CMJ_FIG(true)}</div>
    <p class="sub">Telefon na podłodze 2–3 m z boku, kadr na stopy, slow-motion (120–240 kl./s).</p>
    <label class="btn p">Nagraj film<input type="file" accept="video/*" capture="environment" hidden id="cmj-rec"></label>
    <label class="btn">Wybierz film z telefonu<input type="file" accept="video/*" hidden id="cmj-file"></label>
    <div id="cmj-stage"></div>
    <button type="button" class="btn" data-close>Zamknij</button>`);
  SHEET_ON_CLOSE = () => { if (url) URL.revokeObjectURL(url); };
  const step = () => 1 / (fileFps > 0 ? fileFps : realFps);
  const upd = () => {
    const o = $('#cmj-out'); if (!o) return;
    const tF = tk !== null && tl !== null ? cmjFlight(tk, tl, fileFps, realFps) : NaN, hh = cmjHeight(tF), ok = hh > 0 && hh <= 90;
    const warn = slowNameLowFps(file && file.name, fileFps) && realFps <= 30;
    $('#cmj-warn').innerHTML = warn ? `<p class="hint" role="alert">Plik ma ${fmtKg(fileFps)} kl./s, a nazwa wskazuje slow-motion (eksport DJI Mimo / Androida zwalnia film). Wybierz faktyczny klatkaż nagrania (np. 240), inaczej czas lotu będzie zawyżony kilkukrotnie.</p>` : '';
    o.innerHTML = `<div class="kv"><span>Odbicie</span><b>${tk !== null ? fmtKg(Math.round(tk * 1000) / 1000) + ' s' : '–'}</b></div><div class="kv"><span>Lądowanie</span><b>${tl !== null ? fmtKg(Math.round(tl * 1000) / 1000) + ' s' : '–'}</b></div>
      <div class="metrics"><div class="metric"><span>Czas lotu</span><b id="cmj-t">${tF > 0 ? Math.round(tF * 1000) : '–'}</b><small>ms</small></div><div class="metric"><span>Wysokość</span><b id="cmj-h">${hh > 0 ? fmtKg(Math.round(hh * 10) / 10) : '–'}</b><small>cm</small></div><div class="metric"><span>Skok</span><b>${slot + 1}</b><small>z 3</small></div></div>
      ${hh > 90 ? '<p class="hint">Ponad 90 cm: film jest pewnie zwolniony. Sprawdź klatkaż nagrania powyżej.</p>' : ''}
      <div class="plbl">Zapisz jako</div><div class="seg" id="cmj-slot" role="group" aria-label="Zapisz jako">${[0, 1, 2].map(i => `<button type="button" data-slot="${i}" aria-pressed="${i === slot}">Skok ${i + 1}${isNum(num(rd.cmj[i])) ? ' · ' + fmtKg(num(rd.cmj[i])) : ''}</button>`).join('')}</div>
      <button type="button" class="btn tg" id="cmj-send" aria-pressed="${send2}">Wyślij film trenerowi</button>
      <button type="button" class="btn p" id="cmj-save" ${ok ? '' : 'disabled'}>Zapisz jako skok ${slot + 1}</button>`;
    $('#cmj-send').onclick = () => { send2 = !send2; upd(); };
    document.querySelectorAll('#cmj-slot [data-slot]').forEach(b => b.onclick = () => { slot = +b.dataset.slot; upd(); });
    $('#cmj-save').onclick = () => {
      rd.cmj[slot] = Math.round(hh * 10) / 10; if (rd.excl) rd.excl[slot] = false; closeSheet(); done();
      if (send2) queueCmjVideo(file, rd.date, slot + 1);
    };
  };
  $('#cmj-file').onchange = $('#cmj-rec').onchange = async e => {
    file = e.target.files[0]; if (!file) return;
    if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(file); tk = tl = null; fileFps = NaN;
    let det = { fps: NaN, capture: NaN }; try { const m = await readMoov(file); if (m) det = mp4Fps(m); } catch (er) {}
    fileFps = det.fps; realFps = det.capture > 0 ? det.capture : det.fps > 0 ? det.fps : 240;
    const opts = [...new Set(CMJ_FPS.concat(isFinite(det.fps) ? [Math.round(det.fps)] : [], isFinite(det.capture) ? [Math.round(det.capture)] : []))].sort((a, b) => a - b);
    $('#cmj-stage').innerHTML = `<p class="det" role="status">${isFinite(det.fps) || isFinite(det.capture) ? 'Wykryto: <b>' + fmtKg(Math.round(realFps)) + ' kl./s</b>' + (det.capture > 0 && det.fps > 0 && Math.abs(det.capture - det.fps) > 1 ? ' (plik odtwarza ' + fmtKg(Math.round(det.fps)) + ' kl./s)' : '') : 'Nie odczytałem klatkażu z pliku — wybierz go ręcznie.'}</p>
      <label class="fl">Klatkaż nagrania (kl./s)<select id="cmj-fps">${opts.map(f => `<option value="${f}" ${Math.round(realFps) === f ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
      <div id="cmj-warn"></div>
      <div class="vbox"><video id="cmj-v" muted playsinline preload="auto"></video></div>
      <label class="fl">Przewiń film<input type="range" class="scrub" id="cmj-s" min="0" max="1000" value="0"></label>
      <div class="seg" role="group" aria-label="Klatka po klatce"><button type="button" data-step="-5" aria-label="5 klatek wstecz">◀◀</button><button type="button" data-step="-1" aria-label="klatka wstecz">◀</button><button type="button" data-step="1" aria-label="klatka dalej">▶</button><button type="button" data-step="5" aria-label="5 klatek dalej">▶▶</button></div>
      <div class="seg"><button type="button" id="cmj-k">To odbicie</button><button type="button" id="cmj-l">To lądowanie</button></div><div id="cmj-out"></div>`;
    $('#cmj-fps').onchange = ev => { realFps = +ev.target.value; upd(); };
    vid = $('#cmj-v'); vid.src = url;
    vid.addEventListener('loadedmetadata', () => fixDuration(vid).then(() => { vid.currentTime = 0; }));
    vid.addEventListener('error', () => { $('#cmj-out').innerHTML = '<p class="hint">Ta przeglądarka nie odtworzy tego pliku. Nagraj film w formacie MP4 (H.264).</p>'; });
    $('#cmj-s').oninput = ev => { if (isFinite(vid.duration)) vid.currentTime = vid.duration * ev.target.value / 1000; };
    document.querySelectorAll('#sheet [data-step]').forEach(b => b.onclick = () => { vid.currentTime = Math.max(0, Math.min(vid.duration || 0, vid.currentTime + (+b.dataset.step) * step())); });
    $('#cmj-k').onclick = () => { tk = vid.currentTime; upd(); };
    $('#cmj-l').onclick = () => { tl = vid.currentTime; upd(); };
    upd();
  };
}

/* ---------- ekran Postęp: siła i rekordy, objętość, dyspozycja (cała historia z Logu) ---------- */
const kgTxt = v => (Math.round(v * 10) / 10).toLocaleString('pl-PL');
/** wykres liniowy jednej serii: oś czasu proporcjonalna, rekordy akcentem, etykieta ostatniej wartości; band = {mid, pct} */
function chartLine(pts, o){
  const W = 358, H = 190, L0 = 4, R0 = 52, T0 = 16, B0 = 24, unit = o.unit || '', k = Math.pow(10, o.dec === undefined ? 1 : o.dec);
  const kgTxt = v => (Math.round(v * k) / k).toLocaleString('pl-PL');
  const vals = pts.map(p => p.v).concat(o.band ? [o.band.mid * (1 - o.band.pct), o.band.mid * (1 + o.band.pct)] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo || hi * 0.1 || 1) * 0.12; lo -= pad; hi += pad;
  const t = p => Date.parse(p.date + 'T00:00:00Z'), t0 = t(pts[0]), t1 = t(pts[pts.length - 1]);
  const X = p => t1 > t0 ? L0 + (t(p) - t0) / (t1 - t0) * (W - L0 - R0) : (W - R0 + L0) / 2, Y = v => T0 + (hi - v) / (hi - lo) * (H - T0 - B0);
  let g = o.band ? `<rect class="band" x="${L0}" width="${W - L0 - R0}" y="${Y(o.band.mid * (1 + o.band.pct)).toFixed(1)}" height="${(Y(o.band.mid * (1 - o.band.pct)) - Y(o.band.mid * (1 + o.band.pct))).toFixed(1)}"/>` : '';
  for (let i = 0; i < 3; i++) { const v = lo + (hi - lo) * (i + 0.5) / 3; g += `<line class="grid" x1="${L0}" x2="${W - R0}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="axis" x="${L0}" y="${(Y(v) - 4).toFixed(1)}">${kgTxt(v)}</text>`; }
  // początek kolejnego bloku: pionowa kreska z nazwą
  pts.forEach((p, i) => { if (i && p.block && p.block !== pts[i - 1].block) g += `<line class="grid" x1="${X(p).toFixed(1)}" x2="${X(p).toFixed(1)}" y1="${T0}" y2="${H - B0}"/><text class="axis" x="${(X(p) + 3).toFixed(1)}" y="${T0 + 8}">${esc(p.block)}</text>`; });
  const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p).toFixed(1) + ',' + Y(p.v).toFixed(1)).join('');
  const last = pts[pts.length - 1], colW = Math.max(24, (W - L0 - R0) / pts.length);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label)}">${g}<path class="ln" d="${d}"/>` +
    pts.map(p => `<circle class="pt ${p.pr ? 'pr' : ''}" cx="${X(p).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${p.pr ? 5 : 4}"/>`).join('') +
    `<text class="val" x="${(X(last) + 8).toFixed(1)}" y="${(Y(last.v) + 4).toFixed(1)}">${kgTxt(last.v)}</text>` +
    `<text class="axis" x="${L0}" y="${H - 6}">${ddmm(pts[0].date)}</text>${pts.length > 1 ? `<text class="axis end" x="${W - R0}" y="${H - 6}">${ddmm(last.date)}</text>` : ''}` +
    pts.map(p => `<rect class="hit" x="${(X(p) - colW / 2).toFixed(1)}" y="0" width="${colW.toFixed(1)}" height="${H - B0}" data-tip="${weekday(p.date)} ${ddmm(p.date)} · ${kgTxt(p.v)} ${unit}${p.pr ? ' · rekord' : ''}"/>`).join('') + '</svg>';
}
/** słupki tygodniowe (jedna seria): cienkie, zaokrąglone u góry, przerwa 2 px */
function chartBars(ws, o){
  const W = 358, H = 170, L0 = 4, R0 = 4, T0 = 16, B0 = 24, hi = Math.max(1, ...ws.map(w => w.ton)) * 1.1;
  const bw = (W - L0 - R0) / ws.length, Y = v => T0 + (hi - v) / hi * (H - T0 - B0), base = H - B0;
  let g = '';
  for (let i = 1; i <= 2; i++) { const v = hi * i / 2.2; g += `<line class="grid" x1="${L0}" x2="${W - R0}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="axis" x="${L0}" y="${(Y(v) - 4).toFixed(1)}">${Math.round(v / 100) / 10} t</text>`; }
  const bar = (w, i) => { if (!(w.ton > 0)) return ''; const x = L0 + i * bw + 1, ww = bw - 2, y = Y(w.ton), r = Math.min(4, ww / 2, base - y);
    return `<path class="tbar" d="M${x.toFixed(1)},${base} V${(y + r).toFixed(1)} Q${x.toFixed(1)},${y.toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)} H${(x + ww - r).toFixed(1)} Q${(x + ww).toFixed(1)},${y.toFixed(1)} ${(x + ww).toFixed(1)},${(y + r).toFixed(1)} V${base} Z"/>`; };
  const lab = i => `<text class="axis ${i === ws.length - 1 ? 'end' : i ? 'mid' : ''}" x="${(i === ws.length - 1 ? W - R0 : i ? L0 + (i + 0.5) * bw : L0).toFixed(1)}" y="${H - 6}">${ddmm(ws[i].week)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label)}">${g}<line class="grid" x1="${L0}" x2="${W - R0}" y1="${base}" y2="${base}"/>` + ws.map(bar).join('') +
    lab(0) + lab(Math.floor(ws.length / 2)) + lab(ws.length - 1) +
    ws.map((w, i) => `<rect class="hit" x="${(L0 + i * bw).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${base}" data-tip="tydzień od ${ddmm(w.week)} · ${w.ton.toLocaleString('pl-PL')} kg"/>`).join('') + '</svg>';
}
const tableOf = (heads, rows) => `<details class="tbl"><summary>Dane w tabeli</summary><table class="reps"><thead><tr>${heads.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>` +
  rows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody></table></details>';
const TIP0 = 'Dotknij wykresu, żeby zobaczyć wartość.';
/** faktyczny dzień jednostki z Sesje.start: {tydzień|jednostka → RRRR-MM-DD} */
function unitDays(){
  const dates = {};
  ((DATA && DATA.sessions) || []).forEach(s => { if (/T/.test(String(s.start || ''))) dates[s.tydzien + '|' + s.jednostka] = localDate(new Date(s.start)); });
  return dates;
}
/** Postęp → Tydzień: wykonanie, rekordy, odczucia, pominięte, komentarze trenera; tydzień kalendarzowy z ◀ ▶ */
function weekCards(sets, dates, today){
  const now = mondayOf(today), mon = PWK || now, list = unitList(), t = wkTitle(mon, list);
  const w = weekSummary(mon, { units: list, plan: PLAN, sets, sessions: (DATA && DATA.sessions) || [], ready: readyRows(), logs: vLogs(), notes: cnAll(), dates });
  const nav = `<section class="wk" aria-label="Tydzień ${t.range}"><div class="wk-h"><button type="button" class="wk-a" data-pw="-1" aria-label="Poprzedni tydzień">◀</button>
      <div class="wk-t"><b>${esc(t.t)}</b><small>${t.range}</small></div>
      <button type="button" class="wk-a" data-pw="1" aria-label="Następny tydzień" ${mon >= now ? 'disabled' : ''}>▶</button>
      <button type="button" class="btn sm wk-now" data-pw="0" ${mon === now ? 'aria-pressed="true"' : ''}>Dziś</button></div></section>`;
  const kv = (k, v, sm) => `<div class="kv"><span>${k}${sm ? `<small> · ${sm}</small>` : ''}</span><b>${v}</b></div>`;
  const ulist = w.units.list.map(u => esc(u.day) + (u.done ? ' ✓' : '')).join(' · ');
  if (w.empty) return nav + `<section class="card"><div class="cn">${mon > now ? 'Ten tydzień przed Tobą' : mon === now ? 'W tym tygodniu jeszcze nic' : 'Tydzień bez zapisów'}</div>
    ${w.units.list.length ? `<div class="sub">W planie: ${w.units.list.map(u => esc(u.day) + ' · ' + weekday(u.date) + ' ' + ddmm(u.date)).join(', ')}.</div>` : '<div class="sub">Brak jednostek w planie na ten tydzień.</div>'}</section>`;
  const h = Math.floor(w.min / 60), m = Math.round(w.min % 60);
  const diff = w.tonAvg ? Math.round(100 * (w.ton / w.tonAvg - 1)) : null;
  let out = nav + `<section class="card"><div class="cn">Wykonanie</div>
    ${w.units.plan ? kv('Jednostki z planu', w.units.done + ' z ' + w.units.plan, ulist) : ''}
    ${w.units.own ? kv('Własne treningi', w.units.own) : ''}
    ${w.units.led ? kv('Treningi z trenerem', w.units.led) : ''}
    ${kv('Serie', w.sets.plan ? w.sets.done + ' z ' + w.sets.plan : w.sets.done, w.sets.plan ? 'w planie' : '')}
    ${kv('Tonaż', kgTxt(w.ton) + ' kg', diff === null ? '' : (diff >= 0 ? '▲ ' : '▼ ') + Math.abs(diff) + '% wobec śr. 4 tyg.' + (mon === now ? ' (tydzień trwa)' : ''))}
    ${w.min ? kv('Czas', (h ? h + ' h ' : '') + m + ' min') : ''}</section>`;
  if (w.records.length) out += `<section class="card"><div class="cn">Rekordy tygodnia</div>
    ${w.records.map(r => kv('<i class="key pr"></i> ' + esc(r.name), kgTxt(r.v) + ' kg', (r.oly ? 'zaliczone' : 'e1RM') + ', +' + kgTxt(r.delta) + ' kg')).join('')}</section>`;
  const rd = [['ok', 'dobra'], ['warn', 'uwaga'], ['bad', 'zmęczenie']].filter(q => w.ready[q[0]]).map(q => w.ready[q[0]] + '× ' + q[1]).join(' · ');
  if (w.rpe.length || w.feel !== null || w.pain || rd) out += `<section class="card"><div class="cn">Jak było</div>
    ${w.rpe.length ? kv('RPE sesji', 'śr. ' + kgTxt(w.rpeAvg), w.rpe.map(kgTxt).join(' · ')) : ''}
    ${w.feel !== null ? kv('Samopoczucie', kgTxt(w.feel) + '/5', 'średnio') : ''}
    ${w.pain ? kv('Ból', w.pain.v ? 'max ' + kgTxt(w.pain.v) + '/10' : 'bez bólu', w.pain.v && w.pain.place ? esc(w.pain.place) : '') : ''}
    ${rd ? kv('Dyspozycja', rd) : ''}</section>`;
  if (w.skips.length || w.fails) out += `<section class="card"><div class="cn">Do zauważenia</div>
    ${w.skips.map(x => kv('Pominięte: ' + esc(x.name), esc(x.unit), x.why ? esc(x.why) : '')).join('')}
    ${w.fails ? kv('Nieudane serie', w.fails, 'bez bojów') : ''}</section>`;
  if (w.notes) out += `<button type="button" class="btn" id="pw-cn">Komentarze trenera z tego tygodnia: ${w.notes}</button>`;
  return out;
}
/** Postęp → Blok: raport po bloku (lib blockReport, jak zakładka Bloki w arkuszu), ◀ ▶ między blokami */
function blockCards(sets, dates, today){
  const all = blockReport({ plan: PLAN, logs: vLogs(), sessions: (DATA && DATA.sessions) || [], ready: readyRows(), dates,
    notes: (DATA && DATA.blockNotes) || {}, today });
  const list = all.filter(b => b.state !== 'next' && (!b.empty || b.state === 'now' || b.note));
  if (!list.length) return emptyCard('chart', 'Tu będzie raport z bloku', 'Raport pojawi się po pierwszym treningu z planu podzielonego na bloki.', ES_GO);
  let i = list.findIndex(b => b.block === PBL); if (i < 0) { i = list.length - 1; PBL = null; }
  const b = list[i], st = { done: 'zakończony', now: 'w trakcie' }[b.state];
  const kv = (k, v, sm) => `<div class="kv"><span>${k}${sm ? `<small> · ${sm}</small>` : ''}</span><b>${v}</b></div>`;
  const tile = (k, v, sm) => `<div><span>${k}</span><b>${v}</b>${sm ? `<small>${sm}</small>` : ''}</div>`;
  const range = b.from ? ddmm(b.from) + (b.to && b.to !== b.from ? '–' + ddmm(b.to) : '') : '';
  const wks = b.weeks ? (b.weeks[0] === b.weeks[1] ? 'tydz. ' + b.weeks[0] : 'tydz. ' + b.weeks[0] + '–' + b.weeks[1]) : '';
  const nav = `<section class="wk" aria-label="Blok ${esc(b.block)}"><div class="wk-h"><button type="button" class="wk-a" ${i ? `data-pb="${esc(list[i - 1].block)}"` : 'disabled'} aria-label="Poprzedni blok">◀</button>
      <div class="wk-t"><b>Blok ${esc(b.block)} · ${st}</b><small>${[range, wks].filter(Boolean).join(' · ')}</small></div>
      <button type="button" class="wk-a" ${i < list.length - 1 ? `data-pb="${esc(list[i + 1].block)}"` : 'disabled'} aria-label="Następny blok">▶</button></div></section>`;
  const t = b.ton >= 1000 ? kgTxt(b.ton / 1000) + '<i> t</i>' : b.ton + '<i> kg</i>';
  const perW = b.state === 'done' && b.nWeeks > 1 && b.ton ? (b.ton / b.nWeeks >= 1000 ? kgTxt(b.ton / b.nWeeks / 1000) + ' t' : Math.round(b.ton / b.nWeeks) + ' kg') + ' / tydz.' : '';
  const h = Math.floor(b.min / 60), m = Math.round(b.min % 60);
  const tiles = `<div class="dn-t">${b.state === 'done' && b.pct !== null
      ? tile('Wykonanie', b.pct + '<i> %</i>', b.units.done + ' z ' + b.units.plan + ' ' + plural(b.units.plan, 'treningu', 'treningów', 'treningów'))
      : tile('Treningi', b.units.done + '<i> z ' + b.units.plan + '</i>', 'blok trwa')}
    ${tile('Tonaż', t, perW)}
    ${tile('Czas', b.min ? (h ? h + '<i> h </i>' + (m || '') : m + '<i> min</i>') : '–', b.minN ? b.minN + ' × ok. ' + Math.round(b.min / b.minN) + ' min' : '')}</div>`;
  let out = nav + `<section class="card"><div class="cn">Podsumowanie bloku</div>${tiles}</section>`;
  if (b.lifts.length) {
    const main = b.lifts.find(x => !x.oly), ser = main ? strengthSeries(sets.filter(x => x.block === b.block), main.name) : [];
    out += `<section class="card"><div class="cn">Siła</div><div class="sub">Ćwiczenia główne: początek → koniec bloku.</div>
      ${b.lifts.map(x => x.oly ? kv('<i class="key pr"></i> ' + esc(x.name), kgTxt(x.best) + ' kg', 'najcięższe zaliczone')
        : kv('<i class="key pr"></i> ' + esc(x.name), Math.round(x.from) + ' → ' + Math.round(x.to) + ' kg', 'e1RM, ' + (x.pct >= 0 ? '+' : '') + kgTxt(x.pct) + '%')).join('')}
      ${ser.length > 1 ? chartLine(ser, { unit: 'kg', label: 'e1RM w bloku ' + b.block + ': ' + main.name }) + `<p class="tip" aria-live="polite">${TIP0}</p>` : ''}</section>`;
  }
  const rd = [['ok', 'dobra'], ['warn', 'uwaga'], ['bad', 'zmęczenie']].filter(q => b.ready[q[0]]).map(q => b.ready[q[0]] + '× ' + q[1]).join(' · ');
  if (b.rpe.length || b.feel !== null || b.pain || rd) out += `<section class="card"><div class="cn">Jak było</div>
    ${b.rpe.length ? kv('RPE sesji', 'śr. ' + kgTxt(b.rpeAvg), b.rpe.map(kgTxt).join(' · ')) : ''}
    ${b.feel !== null ? kv('Samopoczucie', kgTxt(b.feel) + '/5', 'średnio') : ''}
    ${b.pain ? kv('Ból', b.pain.v ? 'max ' + kgTxt(b.pain.v) + '/10' : 'bez bólu', b.pain.v ? [b.pain.place ? esc(b.pain.place) : '', b.painN + ' ' + plural(b.painN, 'raz', 'razy', 'razy')].filter(Boolean).join(', ') : '') : ''}
    ${rd ? kv('Dyspozycja', rd) : ''}</section>`;
  if (b.note) out += `<section class="card"><div class="cn">Od trenera</div><p class="bl-note">${esc(b.note)}</p></section>`;
  return out;
}
/* ---------- Postęp → Ciało (punkt 15 przeglądu v80): masa i obwody raz w tygodniu, tylko klienci z Klienci T „cialo” = TAK (cfg.body) ---------- */
const bodyOn = () => !!(DATA && DATA.cfg && DATA.cfg.body);
let CB = { date: '', v: {}, err: '' };   // szkic pomiaru, tylko w pamięci strony
const cmTxt = v => (Math.round(v * 10) / 10).toLocaleString('pl-PL');
function applyCialo(e, save){
  if (!DATA) return;
  DATA.cialo = cialoApply(DATA.cialo || [], e, new Date().toISOString());
  if (save) try { localStorage.setItem(DK, JSON.stringify(DATA)); } catch (er) {}
}
function applyCialoDel(date, save){
  if (!DATA) return;
  DATA.cialo = cialoDrop(DATA.cialo || [], date);
  if (save) try { localStorage.setItem(DK, JSON.stringify(DATA)); } catch (er) {}
}
function cialoCards(today){
  const list = cialoList(DATA.cialo), date = CB.date || today, cur = list.find(o => o.date === date), last = list.filter(o => o.date < date).pop();
  const val = k => CB.v[k] !== undefined ? CB.v[k] : cur && cur[k] !== null ? String(cur[k]).replace('.', ',') : '';
  const ph = k => { const o = list.filter(x => x[k] !== null && x.date !== date).pop(); return o ? cmTxt(o[k]) : '–'; };
  const form = `<section class="card first cia"><div class="cn">Pomiar</div><div class="sub">Raz w tygodniu, najlepiej rano, przed jedzeniem. Wpisz tylko to, co mierzysz; obwody w najszerszym miejscu.</div>
    <label class="fl cia-d">Dzień<input type="date" id="cb-date" value="${date}" max="${today}"></label>
    <div class="cia-g">${CIALO.map(([k, n, u]) => `<label class="fl">${n} (${u})<input type="text" inputmode="decimal" autocomplete="off" data-cb="${k}" value="${esc(val(k))}" placeholder="${esc(ph(k))}" aria-label="${n} w ${u === 'kg' ? 'kilogramach' : 'centymetrach'}"></label>`).join('')}</div>
    ${CB.err ? `<p class="hint" role="alert">${esc(CB.err)}</p>` : ''}
    <button type="button" class="btn p" id="cb-save">${cur ? 'Zapisz zmiany' : 'Zapisz pomiar'}</button>
    ${cur ? `<p class="sub">Ten dzień ma już pomiar: zapis go zastąpi.</p>` : last ? `<p class="sub">Poprzedni pomiar: ${weekday(last.date)} ${ddmm(last.date)} (szare liczby w polach).</p>` : ''}</section>`;
  if (!list.length) return form + emptyCard('chart', 'Tu będą Twoje pomiary', 'Wykres masy i zmiany obwodów pojawią się po pierwszym zapisie.');
  const mass = list.filter(o => o.masa !== null && o.date >= addDays(today, -7 * 26)).map(o => ({ date: o.date, v: o.masa })), dm = cialoDelta(list, 'masa', today);
  const sgn = d => (d > 0 ? '+' : d < 0 ? '−' : '±') + cmTxt(Math.abs(d));
  const chart = mass.length ? `<section class="card"><div class="cn">Masa ciała</div><div class="sub">Ostatnie pół roku.</div>
      <div class="stat"><span>Ostatnio</span><b>${cmTxt(dm.now)}</b><small>kg · ${ddmm(dm.date)}${dm.since !== dm.date ? ' · ' + sgn(dm.d) + ' kg od ' + ddmm(dm.since) : ''}</small></div>
      ${mass.length > 1 ? chartLine(mass, { unit: 'kg', label: 'Masa ciała, kg' }) + `<p class="tip" aria-live="polite">${TIP0}</p>` : ''}
      ${tableOf(['Data', 'kg'], mass.map(p => [ddmm(p.date) + '.' + p.date.slice(0, 4), cmTxt(p.v)]))}</section>` : '';
  const obw = CIALO.slice(1).map(([k, n]) => [n, cialoDelta(list, k, today)]).filter(x => x[1]);
  const pills = obw.length ? `<section class="card"><div class="cn">Obwody</div><div class="sub">Ostatni pomiar i zmiana w 12 tygodniach.</div>
      <div class="cia-p">${obw.map(([n, x]) => `<span class="cia-o"><b>${n}</b> ${cmTxt(x.now)} cm${x.since !== x.date ? ` <i class="${x.d < 0 ? 'dn' : x.d > 0 ? 'up' : ''}">${sgn(x.d)}</i>` : ''}</span>`).join('')}</div></section>` : '';
  const rows = list.slice(-8).reverse().map(o => `<div class="kv st-r"><span><b>${weekday(o.date)} ${ddmm(o.date)}</b> · ${CIALO.filter(([k]) => o[k] !== null).map(([k, n, u]) => esc(n.split(' ')[0].toLowerCase()) + ' ' + cmTxt(o[k]) + ' ' + u).join(', ')}</span>
      <button type="button" class="st-del" data-cbdel="${o.date}" aria-label="Usuń pomiar z ${ddmm(o.date)}">✕</button></div>`).join('');
  return form + chart + pills + `<section class="card stan"><div class="cn">Ostatnie pomiary</div>${rows}</section>`;
}
function cialoBind(today){
  const d = $('#cb-date');
  d.onchange = () => { CB = { date: d.value && d.value <= today ? d.value : today, v: {}, err: '' }; renderPostep(); };
  document.querySelectorAll('[data-cb]').forEach(i => i.oninput = () => { CB.v[i.dataset.cb] = i.value; if (!CB.date) CB.date = d.value || today;
    if (CB.err) { CB.err = ''; const a = document.querySelector('.cia [role=alert]'); if (a) a.remove(); } });
  $('#cb-save').onclick = () => {
    const date = d.value && d.value <= today ? d.value : today, e = { date }, cur = cialoList(DATA.cialo).find(o => o.date === date);
    let n = 0;
    for (const [k] of CIALO) {
      const raw = CB.v[k] !== undefined ? CB.v[k] : cur && cur[k] !== null ? String(cur[k]) : '', v = cialoVal(k, raw);
      if (typeof v === 'string') { CB.err = v + '.'; renderPostep(); return; }
      e[k] = v === null ? '' : v; if (v !== null) n++;
    }
    if (!n) { CB.err = 'Wpisz co najmniej jeden pomiar.'; renderPostep(); return; }
    applyCialo(e, true); CB = { date: '', v: {}, err: '' };
    send('saveCialo', e).then(() => toast('Zapisano pomiar.')).catch(() => toast('Brak sieci – zapiszę, gdy wróci połączenie.'));
    renderPostep();
  };
  document.querySelectorAll('[data-cbdel]').forEach(b => b.onclick = () => {
    if (!b.classList.contains('arm')) { b.classList.add('arm'); b.textContent = 'usuń?'; setTimeout(() => { if (b.isConnected) { b.classList.remove('arm'); b.textContent = '✕'; } }, 3000); return; }
    applyCialoDel(b.dataset.cbdel, true);
    send('deleteCialo', b.dataset.cbdel).then(() => toast('Usunięto.')).catch(() => toast('Brak sieci – usunę, gdy wróci połączenie.'));
    renderPostep();
  });
}
function renderPostep(){
  const logs = vLogs(), dates = unitDays();
  const sets = doneSets(logs, PLAN, dates), today = localDate();
  head(NAME ? 'Cała historia · ' + NAME : 'Cała historia', 'Postęp', '');
  let body = '';
  if (PT === 'tyd') body = weekCards(sets, dates, today);
  else if (PT === 'blok') body = blockCards(sets, dates, today);
  else if (PT === 'sila') {
    const recs = records(sets);
    if (!recs.some(r => r.name === PEX)) PEX = recs.length ? recs[0].name : '';
    const r = recs.find(x => x.name === PEX), ser = r ? strengthSeries(sets, PEX) : [];
    body = !recs.length ? emptyCard('chart', 'Tu będzie Twoja siła', 'Wykres pojawi się po pierwszych treningach: ćwiczenia główne z RPE albo zaliczone boje.', ES_GO)
      : `<section class="card first"><label class="fl">Ćwiczenie<select id="p-ex">${recs.map(x => `<option ${x.name === PEX ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <div class="stat"><span>${r.oly ? 'Najlepsze zaliczone' : 'Najlepsze e1RM'}</span><b>${kgTxt(r.best)}</b><small>kg · ${ddmm(r.date)}</small></div>
        ${chartLine(ser, { unit: 'kg', label: (r.oly ? 'Najlepsze zaliczone kg: ' : 'e1RM: ') + PEX })}
        <p class="tip" aria-live="polite">${TIP0}</p>
        <p class="sub">${r.oly ? 'Boje: najcięższy zaliczony ciężar danego dnia.' : 'e1RM = kg × (1 + (powt. + RIR) / 30), najlepsza seria dnia z wpisanym RPE.'} <i class="key pr"></i> rekord.</p>
        ${tableOf(['Data', r.oly ? 'kg' : 'e1RM kg'], ser.map(p => [ddmm(p.date) + '.' + p.date.slice(0, 4), kgTxt(p.v) + (p.pr ? ' ★' : '')]))}</section>
        <section class="card"><div class="cn">Rekordy</div>${recs.map(x => `<div class="kv"><span>${esc(x.name)}<small> · ${x.oly ? 'zaliczone' : 'e1RM'}</small></span><b>${kgTxt(x.best)} kg · ${ddmm(x.date)}</b></div>`).join('')}</section>`;
  } else if (PT === 'obj') {
    const hp = hardSetsByPart(sets, (DATA && DATA.parts) || {}, today), hpMax = Math.max(1, ...hp.map(x => Math.max(x.now, x.avg)));
    const ws = weeklyTonnage(sets, today, 12), z = zoneReps(sets), zt = ZONES.reduce((s, q) => s + z[q[0]], 0), cal = loadCalendar(
      ((DATA && DATA.sessions) || []).map(s => ({ date: dates[s.tydzien + '|' + s.jednostka] || dayOf(s.data), rpe: s.rpe_sesji, min: s.czas_min })), sets, today, 12);
    body = !sets.length ? emptyCard('chart', 'Tu będzie Twoja objętość', 'Objętość pojawi się po pierwszych zapisanych seriach.', ES_GO)
      : `<section class="card first"><div class="cn">Tonaż tygodniowy</div><div class="sub">Ostatnie 12 tygodni, kg × powtórzenia, bez rozgrzewki.</div>
          ${chartBars(ws, { label: 'Tonaż tygodniowy, ostatnie 12 tygodni' })}<p class="tip" aria-live="polite">${TIP0}</p>
          ${tableOf(['Tydzień od', 'Tonaż kg'], ws.map(w => [ddmm(w.week), w.ton.toLocaleString('pl-PL')]))}</section>
        ${zt ? `<section class="card"><div class="cn">Strefy intensywności</div><div class="sub">Zaliczone powtórzenia w bojach, ciągach i przysiadach wg % 1RM z planu. Kolory jak talerze.</div>
          <div class="zbar" role="img" aria-label="Udział powtórzeń w strefach">${ZONES.filter(q => z[q[0]]).map(q => `<i class="${q[0]}" style="flex:${z[q[0]]}"></i>`).join('')}</div>
          ${ZONES.map(q => `<div class="kv"><span><i class="zone ${q[0]}"></i> ${q[1]}</span><b>${z[q[0]]} powt. · ${Math.round(100 * z[q[0]] / zt)}%</b></div>`).join('')}</section>` : ''}
        ${hp.length ? `<section class="card"><div class="cn">Serie twarde na partię</div><div class="sub">Ten tydzień: serie z RPE ≥ 7, nieudane i dropy. Kreska = średnia z 4 poprzednich tygodni.</div>
          ${hp.map(x => `<div class="hp"><span>${esc(x.part)}</span><div class="hpb" role="img" aria-label="${esc(x.part)}: ${x.now} serii twardych, średnio ${fmtKg(x.avg)}"><i style="width:${Math.round(100 * x.now / hpMax)}%"></i>${x.avg ? `<u style="left:${Math.round(100 * x.avg / hpMax)}%"></u>` : ''}</div><b>${x.now}</b><small>śr. ${fmtKg(x.avg)}</small></div>`).join('')}</section>` : ''}
        <section class="card"><div class="cn">Kalendarz obciążenia</div><div class="sub">12 tygodni. Obciążenie dnia = RPE sesji × minuty (bez nich: tonaż).</div>
          <div class="cal" role="img" aria-label="Kalendarz obciążenia, 12 tygodni"><div class="cald">${['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'].map(x => `<span>${x}</span>`).join('')}</div>
            <div class="calg">${cal.map(c => `<i class="h${c.level} ${c.future ? 'fut' : ''} ${c.date === today ? 'now' : ''}" data-tip="${weekday(c.date)} ${ddmm(c.date)} · ${c.load ? 'obciążenie ' + c.load : 'bez treningu'}"></i>`).join('')}</div></div>
          <div class="calk"><span>mniej</span><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i><span>więcej</span></div>
          <p class="tip" aria-live="polite">Dotknij dnia, żeby zobaczyć obciążenie.</p></section>`;
  } else if (PT === 'cialo' && bodyOn()) body = cialoCards(today);
  else {
    const rows = readyRows(), cmj = readySeries(rows, 'cmj_sr'), vb = readySeries(rows, 'vbt_test');
    const one = (ser, title, unit, band, sub, dec) => !ser.length ? '' : `<section class="card"><div class="cn">${title}</div><div class="sub">${sub}</div>
        <div class="stat"><span>Ostatnio</span><b>${ser[ser.length - 1].v.toLocaleString('pl-PL')}</b><small>${unit} · średnia ${(Math.round(mean(ser.map(p => p.v)) * 100) / 100).toLocaleString('pl-PL')}</small></div>
        ${chartLine(ser, { unit, band, label: title, dec })}<p class="tip" aria-live="polite">${TIP0}</p>
        ${tableOf(['Data', unit], ser.map(p => [ddmm(p.date) + '.' + p.date.slice(0, 4), p.v.toLocaleString('pl-PL')]))}</section>`;
    body = !cmj.length && !vb.length ? emptyCard('pulse', 'Tu będzie Twoja dyspozycja', 'Wykresy pojawią się po pierwszych zapisach na ekranie Dyspozycja.', ['data-go="dysp"', 'Przejdź do dyspozycji'])
      : one(cmj, 'Skok CMJ', 'cm', cmj.length ? { mid: mean(cmj.map(p => p.v)), pct: 0.05 } : null, 'Średnia z 3 skoków w dniu. Szary pas: Twoja średnia ±5%.', 1) +
        one(vb, 'Prędkość na rozgrzewce', 'm/s', null, 'To samo ćwiczenie i ciężar, najlepsza próba.', 2);
  }
  $('#postep').innerHTML = `<div class="row tabs" role="tablist">${[['tyd', 'Tydzień'], ['blok', 'Blok'], ['sila', 'Siła'], ['obj', 'Objętość'], ['dys', 'Dyspozycja']].concat(bodyOn() ? [['cialo', 'Ciało']] : []).map(([k, n]) =>
    `<button class="chip ${PT === k ? 'on' : ''}" data-pt="${k}" role="tab" aria-selected="${PT === k}">${n}</button>`).join('')}</div>` + body;
  document.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { PT = b.dataset.pt; renderPostep(); });
  document.querySelectorAll('#postep [data-go]').forEach(b => b.onclick = () => { TAB = b.dataset.go; WK = null; render(); window.scrollTo(0, 0); });
  const sel = $('#p-ex'); if (sel) sel.onchange = () => { PEX = sel.value; renderPostep(); };
  if (PT === 'cialo' && bodyOn()) cialoBind(today);
  const on = document.querySelector('#postep .tabs .on'), tb = on && on.parentNode;   // wybrana zakładka widoczna, gdy pasek się przewija
  if (tb && (on.offsetLeft + on.offsetWidth > tb.scrollLeft + tb.clientWidth || on.offsetLeft < tb.scrollLeft)) tb.scrollLeft = on.offsetLeft - 16;
  document.querySelectorAll('#postep [data-pb]').forEach(b => b.onclick = () => { PBL = b.dataset.pb; renderPostep(); });
  document.querySelectorAll('#postep [data-pw]').forEach(b => b.onclick = () => {
    const d = +b.dataset.pw, now = mondayOf(localDate()), m = d ? addDays(PWK || now, 7 * d) : now;
    PWK = m >= now ? null : m; renderPostep();
  });
  const gt = $('#pw-cn'); if (gt) gt.onclick = () => { CNEW = new Set(); TAB = 'trener'; render(); window.scrollTo(0, 0); };
  // wartość pod wykresem po dotknięciu albo najechaniu
  const tip = e => { const t = e.target.closest('[data-tip]'); if (!t) return; const p = t.closest('section, #postep').querySelector('.tip'); if (p) p.textContent = t.dataset.tip; };
  $('#postep').onclick = tip; $('#postep').onmouseover = tip;
}

/* ---------- pasek tygodnia Pn–Nd (Trening i Plan): jednostka w dniu faktycznym (zrobiona) albo z planu / przesunięta ----------
 * Dotknięcie dnia otwiera jednostkę (dwie tego dnia → wybór), przytrzymanie → zmiana dnia; ◀ ▶ i przesunięcie palcem zmieniają tydzień.
 */
let WK = null;          // poniedziałek oglądanego tygodnia; null = tydzień bieżącej jednostki
const WK_MARK = { done: '✓', late: '!', today: '●', plan: '' };
const WK_TXT = { done: 'zrobiona', late: 'zaległa', today: 'dziś', plan: 'zaplanowana' };
const WD = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
/** jednostki z datą do paska: zrobiona = dzień z Sesje.start, inaczej data z planu (także przesunięta) */
function unitList(){
  const act = {};
  Object.values(SESS).forEach(x => { const id = String(x.id).split('|'); if (/T/.test(String(x.start || ''))) act[id.slice(-2).join('|')] = localDate(new Date(x.start)); });
  return units(PLAN).map(u => { const done = sessDone(u.week, u.day);
    return { week: u.week, day: u.day, title: u.title, done, own: !!(u.rows[0] && u.rows[0].own), led: !!(u.rows[0] && u.rows[0].led), date: (done && act[u.week + '|' + u.day]) || u.date }; });
}
const curDate = () => { const u = unitList().find(x => x.week === cur.week && x.day === cur.day); return u ? u.date : localDate(); };
const wkMon = () => WK || mondayOf(curDate() || localDate());
function wkTitle(mon, list){
  const inW = list.filter(u => u.date >= mon && u.date <= addDays(mon, 6) && !u.own && !u.led), first = inW[0];
  const b = first ? blockInfo(PLAN, first.week) : null, end = addDays(mon, 6);
  const range = mon.slice(5, 7) === end.slice(5, 7) ? mon.slice(8, 10) + '–' + ddmm(end) : ddmm(mon) + '–' + ddmm(end);
  return { t: b ? 'Blok ' + b.block + ' · tydz. bloku ' + b.n : first ? 'Tydz. ' + first.week : 'Bez treningów w planie', range, week: first ? first.week : null };
}
function weekBar(mode){
  const list = unitList(), mon = wkMon(), today = localDate(), days = weekDays(list, mon, today), t = wkTitle(mon, list);
  const offer = lastMove ? (() => { const u = list.find(x => x.week === lastMove.week && x.day === lastMove.day); return u ? `<div class="offer"><span>${esc(u.day)} przesunięta na ${weekday(u.date)} ${ddmm(u.date)}.</span>
      <button class="btn sm" data-shift>Przesuń też kolejne (${lastMove.delta > 0 ? '+' : ''}${lastMove.delta} ${Math.abs(lastMove.delta) === 1 ? 'dzień' : 'dni'})</button>
      <button class="btn sm" data-noshift>Nie</button></div>` : ''; })() : '';
  return `<section class="wk" data-wk="${mode}" aria-label="Tydzień ${t.range}">
    <div class="wk-h"><button type="button" class="wk-a" data-wkd="-1" aria-label="Poprzedni tydzień">◀</button>
      <div class="wk-t"><b>${esc(t.t)}</b><small>${t.range}</small></div>
      <button type="button" class="wk-a" data-wkd="1" aria-label="Następny tydzień">▶</button>
      <button type="button" class="btn sm wk-now" data-wkd="0" ${mon === mondayOf(today) ? 'aria-pressed="true"' : ''}>Dziś</button></div>
    <div class="wk-g">${days.map((d, i) => {
      const curIn = mode === 't' && d.items.some(it => it.week === cur.week && it.day === cur.day);
      const lbl = WD[i] + ' ' + ddmm(d.date) + (d.items.length ? ': ' + d.items.map(it => window.TL.dayLabel(it.day, it.title) + ' ' + WK_TXT[it.st]).join(', ') : ': wolne');
      return `<button type="button" class="wk-d ${d.date === today ? 'now' : ''} ${d.items.length ? '' : 'free'} ${curIn ? 'cur' : ''}" data-date="${d.date}" aria-label="${esc(lbl)}" ${d.items.length ? '' : 'tabindex="-1"'}>
        <span class="wk-wd">${WD[i]}</span><span class="wk-dd">${d.date.slice(8, 10)}</span>
        ${d.items.map(it => `<span class="wk-u st-${it.st}">${esc(window.TL.dayLabel(it.day, it.title))}<i aria-hidden="true">${WK_MARK[it.st]}</i></span>`).join('')}</button>`; }).join('')}</div>
    ${mode === 't' ? '' : '<p class="wk-hint">Dotknij dnia, aby otworzyć trening · przytrzymaj, aby zmienić dzień</p>'}${offer}</section>`;
}
function bindWeekBar(){
  const bar = document.querySelector((TAB === 'plan' ? '#plan' : '#main') + ' .wk'); if (!bar) return;
  const mode = bar.dataset.wk, list = unitList(), at = d => list.filter(u => u.date === d);
  const go = u => {
    if (mode === 'p' || u.week !== cur.week || u.day !== cur.day) { cur.week = u.week; cur.day = u.day; lastMove = null; }
    TAB = 'trening'; render(); window.scrollTo(0, 0);
  };
  const choose = (us, then, title) => {
    openSheet(`<h2 id="sheet-t">${title}</h2><div class="opts">${us.map((u, i) => `<button type="button" class="opt" data-i="${i}"><b>${esc(window.TL.dayLabel(u.day, u.title))}</b> ${esc(u.title || '')}${u.done ? ' · zrobiona ✓' : ''}</button>`).join('')}</div><button type="button" class="btn" data-close>Anuluj</button>`);
    document.querySelectorAll('#sheet [data-i]').forEach(b => b.onclick = () => { closeSheet(); then(us[+b.dataset.i]); });
  };
  bar.querySelectorAll('[data-wkd]').forEach(b => b.onclick = () => {
    const d = +b.dataset.wkd;
    if (!d) { WK = mondayOf(localDate()); if (mode === 't') { const u = pickUnit(unitList().filter(x => x.date >= WK && x.date <= addDays(WK, 6)), localDate()); if (u) { cur.week = u.week; cur.day = u.day; } } }
    else WK = addDays(wkMon(), 7 * d);
    lastMove = null; render();
  });
  bar.querySelectorAll('.wk-d').forEach(c => {
    let t = null, held = false;
    c.onpointerdown = () => { held = false; clearTimeout(t); t = setTimeout(() => {
      held = true; const us = at(c.dataset.date); if (!us.length) return;
      if (navigator.vibrate) try { navigator.vibrate(20); } catch (e) {}
      us.length > 1 ? choose(us, openMove, 'Którą przesunąć?') : openMove(us[0]); }, 550); };
    c.onpointerup = c.onpointerleave = c.onpointercancel = () => clearTimeout(t);
    c.oncontextmenu = e => e.preventDefault();
    c.onclick = () => { if (held) { held = false; return; } const us = at(c.dataset.date); if (!us.length) return; us.length > 1 ? choose(us, go, 'Który trening?') : go(us[0]); };
  });
  // przesunięcie palcem w bok = poprzedni / następny tydzień
  const g = bar.querySelector('.wk-g'); let x0 = null, y0 = null;
  g.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  g.addEventListener('touchend', e => {
    if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) { WK = addDays(wkMon(), dx < 0 ? 7 : -7); lastMove = null; render(); }
  });
  const sh = bar.querySelector('[data-shift]'); if (sh) sh.onclick = shiftRest;
  const ns = bar.querySelector('[data-noshift]'); if (ns) ns.onclick = () => { lastMove = null; render(); };
}
/** zmiana dnia jednostki: widoczne przyciski dni (bez ukrytego pola daty, które Android w PWA potrafi zablokować) */
function openMove(u){
  if (!u) return;
  if (sessDone(u.week, u.day)) { toast('Ta jednostka jest zrobiona — jej dnia nie zmienisz.'); return; }
  const from = mondayOf(u.date), today = localDate(), days = Array.from({ length: 21 }, (_, i) => addDays(addDays(from, -7), i));
  openSheet(`<h2 id="sheet-t">Zmień dzień · ${esc(u.day)}</h2><p class="sub">${esc(u.title || '')} · teraz ${weekday(u.date)} ${ddmm(u.date)}</p>
    <div class="mv-g" role="group" aria-label="Nowy dzień">${WD.map(w => `<span class="lbl">${w}</span>`).join('')}${days.map(d => `<button type="button" class="mv-d ${d === u.date ? 'on' : ''} ${d === today ? 'now' : ''}" data-to="${d}" aria-pressed="${d === u.date}" aria-label="${weekday(d)} ${ddmm(d)}">${d.slice(8, 10)}<small>${monthShort(d)}</small></button>`).join('')}</div>
    <label class="fl">Inny dzień<input type="date" id="mv-in" value="${u.date}"></label>
    <button type="button" class="btn" id="mv-ok">Zapisz ten dzień</button>
    <button type="button" class="btn" data-close>Anuluj</button>`);
  const pick = d => { closeSheet(); moveUnit(u, d); };
  document.querySelectorAll('#sheet [data-to]').forEach(b => b.onclick = () => pick(b.dataset.to));
  $('#mv-ok').onclick = () => pick($('#mv-in').value);
}

/* ---------- ekran Plan: pasek tygodnia, jednostki tego tygodnia, zmiana dnia ---------- */
function renderPlan(){
  const light = lightWeeks(PLAN), today = localDate(), list = unitList(), mon = wkMon(), t = wkTitle(mon, list);
  head(NAME ? 'Plan · ' + NAME : 'Plan', t.t, t.week !== null && light.has(t.week) ? '<span class="tag">tydzień lżejszy</span>' : '');
  const us = list.filter(u => u.date >= mon && u.date <= addDays(mon, 6)), byKey = {};
  units(PLAN).forEach(u => { byKey[u.week + '|' + u.day] = u; });
  const state = u => u.done ? 'done' : u.date === today ? 'today' : '';
  let h = weekBar('p');
  if (!us.length) h += `<p class="empty">W tym tygodniu nie ma treningów. ${list.some(u => u.date > addDays(mon, 6)) ? 'Następne: ▶' : ''}</p>`;
  us.forEach(u => {
    const k = u.week + '|' + u.day, exs = byKey[k].rows.slice().sort((a, b) => a.order - b.order);
    h += `<section class="unit ${state(u)}" id="u-${u.week}-${esc(u.day)}">
      <div class="uh"><div class="dd"><b>${u.date.slice(8, 10)}</b><small>${weekday(u.date)} · ${monthShort(u.date)}</small></div>
        <div class="ut"><strong>${esc(window.TL.dayLabel(u.day, u.title))}</strong> ${esc(u.title)}${u.own ? ' <span class="tag">własny</span>' : u.led ? ' <span class="tag">' + TL.LED_TAG + '</span>' : ''}<small>${exs.length} ${plural(exs.length, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')} · ${u.done ? 'zrobiona ✓' : u.date === today ? 'dziś' : u.date < today ? 'zaległa' : 'zaplanowana'}</small></div>
        ${calOk(u) ? `<button type="button" class="btn cal" data-cal="${k}" title="Dodaj do kalendarza" aria-label="Dodaj do kalendarza: ${esc(u.day)}">${CAL_ADD_SVG}</button>` : ''}</div>
      <details><summary>Ćwiczenia</summary><ol>${exs.map(ex => `<li><b>${esc(ex.name)}</b><span>${SIMPLE ? rxSimple(ex) : rxPro(ex)}</span></li>`).join('')}</ol></details>
      <div class="uact"><button class="btn go" data-go="${k}">Przejdź do treningu</button>
        ${u.done ? '<span class="sub">Zrobiona — dnia nie zmienisz.</span>' : u.led && !LIVE ? '<span class="sub">Trening z trenerem.</span>' : `<button type="button" class="btn" data-mv="${k}">Zmień dzień</button>`}
</div></section>`;
  });
  if (ownOn()) h += `<button type="button" class="ghost own-new" id="own-new">${LIVE ? '+ nowa jednostka' : '+ własny trening'}</button>`;
  $('#plan').innerHTML = h;
  const on = $('#own-new'); if (on) on.onclick = () => openOwn(null);
  const unitOf = k => list.find(u => u.week + '|' + u.day === k);
  bindWeekBar();
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
    const u = unitOf(b.dataset.go); cur.week = u.week; cur.day = u.day; TAB = 'trening'; lastMove = null; render(); window.scrollTo(0, 0);
  });
  document.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => openMove(unitOf(b.dataset.mv)));
  document.querySelectorAll('[data-cal]').forEach(b => b.onclick = () => openCal(unitOf(b.dataset.cal), us.filter(calOk)));
}
/* ---------- „Dodaj do kalendarza” (lib icsFile, gcalUrl): niezrobiona jednostka od dziś; godzina i przypomnienie w kal_<klucz> ---------- */
const CAL_SVG = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const CAL_ADD_SVG = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const CAL_ALARM = [[0, 'Bez'], [30, '30 min'], [60, '1 h'], [120, '2 h']];
const calOk = u => !!u && !u.done && u.date >= localDate();
/** wydarzenie jednostki: tytuł, ćwiczenia z planu, notatka trenera, adres aplikacji bez klucza (wpis w kalendarzu może trafić do innych osób) */
function calEvent(u, time, alarm){
  const exs = ((units(PLAN).find(x => x.week === u.week && x.day === u.day) || {}).rows || []).slice().sort((a, b) => a.order - b.order);
  const t = todayInfo(exs.map(ex => ({ order: ex.order, name: ex.name, prio: ex.prio, sets: ex.sets, done: 0 })), u.date, u.date, true);
  const rx = ex => ex.sets + '×' + ex.reps + (ex.kg !== '' ? ' · ' + fmtKg(ex.kg) + (typeof ex.kg === 'number' ? ' kg' : '') : '');
  const note = (exs.find(ex => String(ex.unote || '').trim()) || {}).unote;
  return { uid: ('trening-' + u.week + '-' + u.day).replace(/[^\w-]+/g, '_') + '@' + (location.host || 'sila-z-ruchu'),
    date: u.date, time, alarm, min: t.min, title: 'Trening · ' + (u.title || u.day),
    desc: [weekLabel(u.week) + ' · ' + u.day + ' · ok. ' + Math.max(30, t.min) + ' min', exs.map((ex, i) => (i + 1) + '. ' + ex.name + ' – ' + rx(ex)).join('\n'), note ? 'Od trenera: ' + String(note).trim() : ''].filter(Boolean).join('\n\n'),
    url: location.origin + location.pathname };
}
function openCal(u, week){
  if (!calOk(u)) { toast('Ten trening jest już zrobiony albo minął.'); return; }
  let o = { t: '18:00', a: 60 }; try { o = Object.assign(o, JSON.parse(localStorage.getItem('kal_' + KEY) || '{}')); } catch (e) {}
  const more = (week || []).filter(x => !(x.week === u.week && x.day === u.day)).length ? week : null;
  let all = false;
  const min = Math.max(30, calEvent(u, o.t, 0).min);
  openSheet(`<h2 id="sheet-t">Dodaj do kalendarza</h2><p class="sub" id="kal-sub"></p>
    ${more ? `<div class="seg" role="group" aria-label="Co dodać"><button type="button" data-kall="0" aria-pressed="true">Ten trening</button><button type="button" data-kall="1" aria-pressed="false">Cały tydzień (${week.length})</button></div>` : ''}
    <label class="fl">Godzina<input type="time" id="kal-t" value="${esc(o.t)}"></label>
    <div class="kal-l">Przypomnienie</div>
    <div class="seg" role="group" aria-label="Przypomnienie">${CAL_ALARM.map(([m, l]) => `<button type="button" data-kal="${m}" aria-pressed="${m === o.a}">${l}</button>`).join('')}</div>
    <div class="kal-b"><button type="button" class="btn p" id="kal-g">Kalendarz Google</button>
    <button type="button" class="btn" id="kal-i">iPhone / Outlook · plik .ics</button></div>
    <p class="sub kal-n" id="kal-n"></p>
    <button type="button" class="btn" data-close>Zamknij</button>`);
  const keep = () => { try { localStorage.setItem('kal_' + KEY, JSON.stringify(o)); } catch (e) {} };
  const draw = () => {
    $('#kal-sub').textContent = all ? week.length + ' ' + plural(week.length, 'trening', 'treningi', 'treningów') + ': ' + week.map(x => weekday(x.date) + ' ' + ddmm(x.date)).join(', ') + ' · o tej samej godzinie'
      : u.day + ' · ' + (u.title || '') + ' · ' + weekday(u.date) + ' ' + ddmm(u.date) + ' · ok. ' + min + ' min';
    document.querySelectorAll('#sheet [data-kall]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.kall === '1') === all)));
    $('#kal-g').disabled = all;
    $('#kal-n').textContent = (all ? 'Kalendarz Google dodaje po jednym treningu; cały tydzień naraz doda plik .ics. ' : 'Google: przypomnienie jak w ustawieniach Twojego kalendarza. ') +
      'Zmienisz dzień w aplikacji? Dodaj trening jeszcze raz: kalendarz z pliku podmieni wpis, w Google usuń stary.';
  };
  draw();
  $('#kal-t').onchange = e => { if (/^\d\d:\d\d$/.test(e.target.value)) { o.t = e.target.value; keep(); } };
  document.querySelectorAll('#sheet [data-kal]').forEach(b => b.onclick = () => { o.a = +b.dataset.kal; keep(); document.querySelectorAll('#sheet [data-kal]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  document.querySelectorAll('#sheet [data-kall]').forEach(b => b.onclick = () => { all = b.dataset.kall === '1'; draw(); });
  $('#kal-g').onclick = () => { window.open(gcalUrl(calEvent(u, o.t, 0)), '_blank', 'noopener'); closeSheet(); };
  $('#kal-i').onclick = () => {
    const evs = (all ? week : [u]).map(x => calEvent(x, o.t, o.a)), ics = icsFile(evs, new Date());
    const a = document.createElement('a'), ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // iPhone: bez „download” Safari od razu pokazuje „Dodaj do kalendarza”; gdzie indziej plik do pobrania i otwarcia
    if (ios) a.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
    else { a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' })); a.download = (all ? 'treningi-' + u.date : 'trening-' + u.date) + '.ics'; setTimeout(() => URL.revokeObjectURL(a.href), 60000); }
    document.body.appendChild(a); a.click(); a.remove();
    closeSheet(); toast(ios ? 'Dotknij „Dodaj”, żeby zapisać w kalendarzu.' : 'Plik kalendarza pobrany: otwórz go, żeby dodać trening.');
  };
}
/** klient przesuwa niezrobioną jednostkę; potem propozycja przesunięcia kolejnych o tyle samo dni; zawsze komunikat o wyniku */
function moveUnit(u, date){
  if (!u || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Wybierz dzień.'); return; }
  if (sessDone(u.week, u.day)) { toast('Ta jednostka jest zrobiona — jej dnia nie zmienisz.'); return; }
  if (date === u.date) { toast('To ten sam dzień.'); return; }
  const move = { week: u.week, day: u.day, date };
  lastMove = { week: u.week, day: u.day, from: u.date, delta: dayDiff(u.date, date) };
  applyMoves([move], true);
  WK = mondayOf(date);
  send('przesunJednostke', [move]).then(r => {
    const sk = r && r.skipped || [];
    toast(sk.length ? 'Nie przesunięto: ' + sk.map(x => x.why).join(', ') + '.' : u.day + ': nowy dzień ' + weekday(date) + ' ' + ddmm(date) + ' ✓');
  }).catch(e => toast(isNet(e) ? 'Brak sieci — zmiana zapisze się, gdy wróci połączenie.' : 'Nie udało się zapisać zmiany: ' + e.message));
  render();
}
function shiftRest(){
  if (!lastMove) return;
  const m = lastMove, moves = units(PLAN)
    .filter(u => !(u.week === m.week && u.day === m.day) && u.date > m.from && !sessDone(u.week, u.day))
    .map(u => ({ week: u.week, day: u.day, date: addDays(u.date, m.delta) }));
  lastMove = null;
  if (moves.length) { applyMoves(moves, true); send('przesunJednostke', moves).catch(() => {}); }
  toast(moves.length ? 'Przesunięto ' + moves.length + ' ' + plural(moves.length, 'jednostkę', 'jednostki', 'jednostek') + '.' : 'Brak kolejnych jednostek.');
  render();
}

/* ---------- zamiana ćwiczenia: zapis w telefonie (sw_<klucz>) i w Logu (kolumna „zamiana”) ---------- */
const SWK = 'sw_' + KEY;
function swGet(){ try { return JSON.parse(localStorage.getItem(SWK) || '{}'); } catch (e) { return {}; } }
const swKey = ex => cur.week + '|' + cur.day + '|' + ex.order;
/** ćwiczenie z naniesioną zamianą: telefon (także „cofnięta” = null) ma pierwszeństwo przed wpisami z Logu */
function withSwap(ex){
  const m = swGet(), k = swKey(ex);
  let s = k in m ? m[k] : null;
  if (!(k in m)) { const l = Object.values(exLogs(ex)).find(x => x.zamiana); s = l ? parseSwap(l.zamiana) : null; }
  return s && s.to ? Object.assign({}, ex, { name: s.to, swap: s }) : ex;
}
function setSwap(ex, s){
  const m = swGet(); m[swKey(ex)] = s;
  try { localStorage.setItem(SWK, JSON.stringify(m)); } catch (e) {}
}
/**
 * po zamianie (albo jej cofnięciu) zapisane już serie ćwiczenia idą do Logu jeszcze raz: nazwa wykonanego ćwiczenia i pole „zamiana”
 * (id serii bez zmian, upsert). Bez tego serie sprzed zamiany zostawały pod starą nazwą bez śladu zamiany (22.11.2026).
 * name = nazwa po zmianie, s = zamiana {from, to, why} albo null (cofnięta).
 */
function resaveSwap(ex, name, s){
  const L0 = exLogs(ex), s0 = curExs()[0] || {}, v = x => x === undefined || x === null ? '' : x;
  Object.keys(L0).forEach(set => {
    const l = L0[set]; if (!l || l.deleted) return;
    const p = { week: cur.week, day: cur.day, date: s0.date, order: ex.order, name, set: /^\d+$/.test(set) ? +set : set,
      kg: v(l.kg), reps: v(l.powt), rpe: v(l.rpe), vbt: v(l.vbt_ms), vbtPeak: v(l.vbt_peak), height: v(l.wysokosc_cm), path: l.sciezka || '',
      done: l.wykonane === 'TAK', video: l.film_link || '', typ: l.typ || '', ocena: l.ocena || '', swap: swapText(s), note: l.uwagi || '' };
    putLocal(ex, p);
    send('logSet', p).catch(() => {});
  });
}
function openSwap(ex){
  const opts = swapOptions(ex), free = SWAP === 'DOWOLNA';
  let to = '', why = '';
  openSheet(`<h2 id="sheet-t">Zamień ćwiczenie</h2><p class="sub">Zamiast: ${esc(ex.name)}</p>
    ${opts.length ? `<div class="lbl">${swapAuto(ex) ? 'Podobne ćwiczenia' : 'Zamienniki od trenera'}</div><div class="opts" role="group" aria-label="Zamiennik">${opts.map(o => `<button type="button" class="opt" data-to="${esc(o)}">${esc(o)}</button>`).join('')}</div>`
      : free ? '' : '<p class="hint">Trener nie podał zamienników tego ćwiczenia. Napisz do trenera albo zrób je jak w planie.</p>'}
    ${free ? `<label class="fl">${opts.length ? 'Albo szukaj w bazie' : 'Szukaj ćwiczenia'}<input id="sw-q" placeholder="np. wiosłowanie, przysiad" autocomplete="off"></label><div id="sw-res" class="ow-res"></div>` : ''}
    <div class="fl">Powód</div>
    <div class="opts why" role="group" aria-label="Powód">${SWAP_WHY.map(w => `<button type="button" class="opt" data-why="${w}">${w}</button>`).join('')}</div>
    <p class="hint" id="sw-hint" hidden>Ból: na końcu treningu zaznacz miejsce i oceń ból 0–10 w podsumowaniu.</p>
    <p class="sub" id="sw-sel" aria-live="polite"></p>
    ${edOn(ex) ? lenSeg('Na stałe = to ćwiczenie także w kolejnych tygodniach tego treningu (' + esc(cur.day) + '), do końca obecnego planu.') : ''}
    <button type="button" class="btn p" id="sw-ok" disabled>Zamień</button>
    <button type="button" class="btn" data-close>Anuluj</button>`);
  const upd = () => {
    document.querySelectorAll('#sheet [data-to]').forEach(b => b.setAttribute('aria-pressed', b.dataset.to === to));
    document.querySelectorAll('#sheet [data-why]').forEach(b => b.setAttribute('aria-pressed', b.dataset.why === why));
    $('#sw-hint').hidden = why !== 'Ból';
    $('#sw-sel').textContent = to ? 'Wybrane: ' + to : '';
    $('#sw-ok').disabled = !to || !why;
  };
  const bindTo = () => document.querySelectorAll('#sheet [data-to]').forEach(b => b.onclick = () => { to = b.dataset.to; upd(); });
  // DOWOLNA: cała baza Ćwiczenia (lista z getExNames) + własna nazwa
  const res = q => {
    const box = $('#sw-res'); if (!box) return;
    if (PK.reg) box.innerHTML = pkList(PK, q);
    else {
      const r = exSearch([], EXN.list, q, 8), exact = exExact(r, q);
      box.innerHTML = (q.trim() ? '' : pkTiles(PK)) + r.map(x => `<button type="button" class="opt" data-to="${esc(x.name)}">${exOptIn(x)}</button>`).join('') +
        (q.trim() && !exact ? `<button type="button" class="opt ow-new" data-to="${esc(q.trim().replace(/\s+/g, ' ').slice(0, 80))}">+ Własna nazwa: „${esc(q.trim().slice(0, 80))}”</button>` : '');
    }
    bindTo(); upd(); pkBind(PK, box, () => res($('#sw-q').value));
  };
  const q = $('#sw-q');
  PK = pkNew({ attr: 'to' });
  if (q) { q.oninput = () => res(q.value); res(''); exnLoad(() => { const qq = $('#sw-q'); if (qq) res(qq.value); }); }
  bindTo();
  document.querySelectorAll('#sheet [data-why]').forEach(b => b.onclick = () => { why = b.dataset.why; upd(); });
  const len = bindLen();
  $('#sw-ok').onclick = () => {
    const forever = len();
    setSwap(ex, { from: ex.name, to, why }); resaveSwap(ex, to, { from: ex.name, to, why }); closeSheet();
    const n = forever ? edSend(Object.assign({ op: 'swap', week: cur.week, day: cur.day, order: ex.order, to, forever: true }, edDx(to))) : 0;
    toast('Zamieniono na: ' + to + '.' + (forever ? (n ? ' Także w kolejnych tygodniach: ' + n + '.' : ' W kolejnych tygodniach tego ćwiczenia nie ma.') : ' Serie zapiszą się pod nową nazwą.'));
    renderTrening();
  };
  upd();
}

/* ---------- zmiany w jednostce trenera dla osób z flagą „edycja”: dodaj / usuń / zamień, tylko ten trening albo na stałe ---------- */
/** czy ćwiczenie można zmieniać: flaga klienta, jednostka trenera, jeszcze niezakończona */
const edOn = ex => EDIT && !ex.own && !(ex.led && !LIVE) && !sessDone(cur.week, cur.day);
const edDone = () => { const d = {}; Object.keys(SESS).forEach(k => { d[String(k).split('|').slice(-2).join('|')] = 1; }); return d; };
/** nanosi zmianę na dane w telefonie (lib planEdit); save = zapis w pamięci telefonu. Zwraca wynik planEdit. */
function applyEdit(p, save){
  if (!DATA) return { error: 'Brak danych.' };
  const r = planEdit(DATA.plan, DATA.removed || [], edDone(), p);
  if (r.error) return r;
  DATA.plan = r.plan; DATA.removed = r.removed; PLAN = DATA.plan;
  if (save) try { localStorage.setItem(DK, JSON.stringify(DATA)); } catch (e) {}
  return r;
}
/** zmiana lokalnie + wysyłka (bez sieci: kolejka); zwraca liczbę zmienionych wierszy albo -1 przy błędzie */
function edSend(p){
  // pamięć telefonu (d_<klucz>) dostaje zmianę dopiero po potwierdzeniu serwera: do tego czasu zmiana żyje w kolejce
  // i przy ponownym otwarciu jest nanoszona na dane z pamięci dokładnie raz
  const r = applyEdit(p, false);
  if (r.error) { toast(r.error); return -1; }
  send('editPlan', p).then(() => { try { localStorage.setItem(DK, JSON.stringify(DATA)); } catch (e) {} if (r.partial) refreshData(); }).catch(() => {});
  return r.n;
}
/** film „Jak wykonać” i partie nowego ćwiczenia: z planu albo z bazy (getExNames) */
function edDx(n){
  const lc = s => String(s).toLowerCase(), p = PLAN.find(r => lc(r.name) === lc(n) && (r.infos || []).length), b = EXN.list.find(x => lc(x[0]) === lc(n));
  return { infos: p ? p.infos : b && /^https?:\/\//i.test(String(b[1])) ? [{ n: b[0], u: b[1] }] : [],
    parts: p ? p.parts || [] : b && b[2] ? String(b[2]).split(';').map(s => s.trim()).filter(Boolean) : [] };
}
const lenSeg = txt => `<div class="lbl ed-q">Na jak długo?</div><div class="seg" role="group" aria-label="Na jak długo">
    <button type="button" data-len="0" aria-pressed="true">Tylko ten trening</button><button type="button" data-len="1" aria-pressed="false">Na stałe</button></div>
    <p class="sub ed-s">${txt}</p>`;
/** przełącznik „Tylko ten trening / Na stałe” w otwartym oknie; zwraca funkcję czytającą wybór */
function bindLen(){
  let v = false;
  document.querySelectorAll('#sheet [data-len]').forEach(b => b.onclick = () => { v = b.dataset.len === '1';
    document.querySelectorAll('#sheet [data-len]').forEach(x => x.setAttribute('aria-pressed', String((x.dataset.len === '1') === v))); });
  return () => v;
}
/** rodzaj ćwiczenia w oknie dodawania / zmiany planu: ciężar (kg albo masa ciała „BW”) i miara (powtórzenia albo sekundy „30 s”) */
const isBW = kg => /^\s*bw\s*$/i.test(String(kg === undefined || kg === null ? '' : kg));
const secOf = reps => timeUnit(reps) === 's' ? String(reps).replace(/^\s*(\d+(?:[.,]\d+)?).*$/, '$1') : String(reps === undefined || reps === null ? '' : reps);
const kindSeg = (bw, tm) => `<div class="ed-k"><div class="seg" role="group" aria-label="Ciężar"><button type="button" data-kbw="0" aria-pressed="${!bw}">Z ciężarem</button><button type="button" data-kbw="1" aria-pressed="${!!bw}">Masa ciała (BW)</button></div>
    <div class="seg" role="group" aria-label="Powtórzenia czy czas"><button type="button" data-ktm="0" aria-pressed="${!tm}">Powtórzenia</button><button type="button" data-ktm="1" aria-pressed="${!!tm}">⏱ Na czas</button></div></div>`;
/** tryb trenera: priorytet ćwiczenia (A główne / B opcjonalne / K korekcja) i „⛓ Połącz z poprzednim” (obwód, serie łączone) */
const PRIOS = [['A', 'Główne'], ['B', 'Opcjonalne'], ['K', 'Korekcja']];
const prioSeg = pr => `<div class="lbl ed-q">Priorytet</div><div class="seg" role="group" aria-label="Priorytet">${PRIOS.map(([k, t]) => `<button type="button" data-kpr="${k}" aria-pressed="${k === pr}">${t}</button>`).join('')}</div>`;
const linkBtn = (prev, on) => prev ? `<button type="button" class="btn tg ed-ln" data-klink aria-pressed="${!!on}">⛓ Połącz z poprzednim: ${esc(prev.name)}</button>
    <p class="sub ed-s">Serie łączone: ćwiczenia na zmianę, przerwa po całej rundzie.</p>` : '';
/** przełączniki z prioSeg i linkBtn w otwartym oknie; zwraca {prio(), link()} */
function bindPrio(pr, on){
  let p = pr, l = !!on;
  document.querySelectorAll('#sheet [data-kpr]').forEach(b => b.onclick = () => { p = b.dataset.kpr;
    document.querySelectorAll('#sheet [data-kpr]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.kpr === p))); });
  const lb = document.querySelector('#sheet [data-klink]'); if (lb) lb.onclick = () => { l = !l; lb.setAttribute('aria-pressed', String(l)); };
  return { prio: () => p, link: () => l };
}
/** obwody jednostki po połączeniu (on) albo rozłączeniu ćwiczenia z poprzednim → [{order, circuit}] tylko zmienione */
function linkChanges(exs, order, on){
  const a = exs.map(x => ({ order: x.order, c: isEmom(x) ? '' : x.circuit || '', old: true })), i = a.findIndex(x => x.order === order);
  if (i < 1) return [];
  const was = a.map(x => x.c), fresh = () => circuitLetter(a);
  if (on) {
    const L = a[i - 1].c || a[i].c || fresh(), M = a[i].c;
    a[i - 1].c = L; for (let j = i; j < a.length && (j === i || (M && was[j] === M)); j++) a[j].c = L;
  } else if (a[i].c && a[i].c === a[i - 1].c) {
    const M = a[i].c, N = fresh();
    for (let j = i; j < a.length && was[j] === M; j++) a[j].c = N;
  }
  return circuitTidy(a).map((x, j) => ({ order: x.order, circuit: x.c, was: was[j] })).filter(x => x.circuit !== x.was).map(x => ({ order: x.order, circuit: x.circuit }));
}
/** przełączniki z kindSeg w otwartym oknie; kg / reps = pola, rl = podpis pola powt.; zwraca {set(bw, tm), kg(), reps()} do zapisu */
function bindKind(kg, reps, rl){
  let bw = false, tm = false, kgMem = '';
  const draw = () => {
    document.querySelectorAll('#sheet [data-kbw]').forEach(x => x.setAttribute('aria-pressed', String((x.dataset.kbw === '1') === bw)));
    document.querySelectorAll('#sheet [data-ktm]').forEach(x => x.setAttribute('aria-pressed', String((x.dataset.ktm === '1') === tm)));
    if (bw && !kg.disabled) { kgMem = kg.value; kg.value = ''; } else if (!bw && kg.disabled) kg.value = kgMem;
    kg.disabled = bw; kg.placeholder = bw ? 'BW' : '—';
    rl.textContent = tm ? 'Sekundy' : 'Powt.'; reps.inputMode = tm ? 'numeric' : 'text';
  };
  const set = (b, t) => { if (b !== undefined) bw = !!b; if (t !== undefined) tm = !!t; draw(); };
  document.querySelectorAll('#sheet [data-kbw]').forEach(b => b.onclick = () => set(b.dataset.kbw === '1'));
  document.querySelectorAll('#sheet [data-ktm]').forEach(b => b.onclick = () => set(undefined, b.dataset.ktm === '1'));
  draw();
  return { set,
    kg: () => bw ? 'BW' : kg.value.trim(),
    // na czas: sama liczba = sekundy („30 s”); wpisane z jednostką („1 min”) zostaje jak jest
    reps: () => { const v = reps.value.trim(); return tm && /^\d+(?:[.,]\d+)?$/.test(v) ? v + ' s' : v; } };
}
/** ostatnie ćwiczenie jednostki, z którym „+ Ćwiczenie” może zrobić obwód (nie EMOM) */
const addPrev = () => { const e = curExs().slice(-1)[0]; return e && !isEmom(e) ? e : null; };
function openAdd(){
  let name = '';
  openSheet(`<h2 id="sheet-t">Dodaj ćwiczenie</h2><p class="sub">${esc((curExs()[0] || {}).title || cur.day)} · ${LIVE ? 'od razu w planie: ' + esc(NAME) : 'na koniec treningu'}</p>
    <label class="fl">Szukaj ćwiczenia<input id="ed-q" autocomplete="off" placeholder="np. wykroki, curl, plank"></label>
    <div id="ed-res" class="ow-res"></div>
    <p class="sub" id="ed-sel" aria-live="polite"></p>
    <div class="ed-3"><label class="fl">Serie<input id="ed-sets" inputmode="numeric" value="3"></label><label class="fl"><span id="ed-rl">Powt.</span><input id="ed-reps" value="10"></label><label class="fl">Kg<input id="ed-kg" inputmode="decimal" placeholder="—"></label></div>
    ${kindSeg(false, false)}
    ${LIVE ? prioSeg('A') + linkBtn(addPrev(), false) : ''}
    ${lenSeg('Na stałe = także w kolejnych tygodniach tego treningu (' + esc(cur.day) + '), do końca obecnego planu.')}
    <p class="hint" id="ed-err" role="alert" hidden></p>
    <button type="button" class="btn p" id="ed-ok" disabled>${LIVE ? 'Dodaj do treningu: ' + esc(NAME) : 'Dodaj do treningu'}</button>
    <button type="button" class="btn" data-close>Anuluj</button>`);
  const kind = bindKind($('#ed-kg'), $('#ed-reps'), $('#ed-rl')), pri = bindPrio('A', false);
  const q = $('#ed-q'), pick = n => {
    name = n; const last = PLAN.slice().reverse().find(r => r.name === n);
    if (last) { $('#ed-sets').value = last.sets; $('#ed-reps').value = secOf(last.reps); $('#ed-kg').value = last.kg === '' || isBW(last.kg) ? '' : String(fmtKg(last.kg)); kind.set(isBW(last.kg), timeUnit(last.reps) === 's'); }
    q.value = ''; Object.assign(PK, { reg: '', part: '', more: 0, pv: '' }); res(''); $('#ed-sel').textContent = 'Wybrane: ' + n; $('#ed-ok').disabled = false;
    $('#ed-sel').scrollIntoView({ block: 'center' });
  };
  PK = pkNew({ who: LIVE ? NAME : '' });
  const res = v => {
    const box = $('#ed-res'); if (!box) return;
    q.placeholder = PK.reg ? 'szukaj w: ' + (EX_REGIONS.find(r => r.id === PK.reg) || {}).name : 'np. wykroki, curl, plank';
    if (PK.reg) box.innerHTML = pkList(PK, v);
    else if (!v.trim()) {
      const m = pkMine().slice(0, 6);
      box.innerHTML = pkTiles(PK) + (m.length ? `<div class="lbl pk-l">${LIVE ? 'W planie: ' + esc(NAME) : 'Z Twojego planu'}</div><div class="pk-ch">${m.map(n => `<button type="button" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : '');
    } else {
      const r = exSearch(pkMine(), EXN.list, v, 8), exact = exExact(r, v);
      box.innerHTML = r.map(x => `<button type="button" class="opt" data-n="${esc(x.name)}">${exOptIn(x)}</button>`).join('') +
        (!exact ? `<button type="button" class="opt ow-new" data-n="${esc(v.trim().replace(/\s+/g, ' ').slice(0, 80))}">+ Własna nazwa: „${esc(v.trim().slice(0, 80))}”</button>` : '');
    }
    box.querySelectorAll('[data-n]').forEach(b => b.onclick = () => pick(b.dataset.n));
    pkBind(PK, box, () => res(q.value));
  };
  q.oninput = () => res(q.value); res('');
  exnLoad(() => { const qq = $('#ed-q'); if (qq) res(qq.value); });
  const len = bindLen();
  $('#ed-ok').onclick = () => {
    const p = Object.assign({ op: 'add', week: cur.week, day: cur.day, name, sets: $('#ed-sets').value, reps: kind.reps(), kg: kind.kg(), forever: len() }, LIVE ? { trainer: true, prio: pri.prio(), link: pri.link() } : {}, edDx(name));
    const r = planEdit(DATA.plan, DATA.removed || [], edDone(), p);
    if (r.error || !r.n) { const er = $('#ed-err'); er.textContent = r.error || 'To ćwiczenie jest już dodane do tego treningu.'; er.hidden = false; return; }
    closeSheet(); const n = edSend(p);
    if (LIVE && FX) { FXI = focusSteps(curExs(), circuitGroups(curExs())).length - 1; FXM = true; }   // tryb skupienia: od razu nowe ćwiczenie
    toast('Dodano: ' + name + (n > 1 ? ' (ten trening i ' + (n - 1) + ' ' + plural(n - 1, 'kolejny', 'kolejne', 'kolejnych') + ').' : '.'));
    renderTrening();
    const c = [...document.querySelectorAll('.card[data-card]')].pop(); if (c) c.scrollIntoView({ block: 'center' });
  };
}
function openDel(ex){
  if (curExs().length < 2) { toast('To jedyne ćwiczenie w treningu – zostaw je albo pomiń.'); return; }
  openSheet(`<h2 id="sheet-t">Usuń z treningu</h2><p class="sub">${esc(ex.name)}</p>
    ${lenSeg('Na stałe = także z kolejnych tygodni tego treningu (' + esc(cur.day) + '), do końca obecnego planu. Trener widzi w arkuszu, że ćwiczenie zostało usunięte; możesz je przywrócić na dole treningu.')}
    <button type="button" class="btn p" id="ed-del">Usuń</button>
    <button type="button" class="btn" data-close>Anuluj</button>`);
  const len = bindLen();
  $('#ed-del').onclick = () => {
    closeSheet(); setSwap(ex, null);
    const n = edSend({ op: 'del', week: cur.week, day: cur.day, order: ex.order, forever: len() });
    if (n < 0) return;
    toast('Usunięto: ' + ex.name + (n > 1 ? ' (ten trening i ' + (n - 1) + ' ' + plural(n - 1, 'kolejny', 'kolejne', 'kolejnych') + ').' : '.'));
    renderTrening();
  };
}
/** usunięte ćwiczenia tej jednostki z przyciskiem „Przywróć” (na dole Treningu) */
function edRemoved(){
  const rm = ((DATA && DATA.removed) || []).filter(x => Number(x.week) === cur.week && String(x.day) === String(cur.day));
  if (!rm.length) return '';
  return `<section class="ed-rm" aria-label="Usunięte ćwiczenia"><div class="lbl">Usunięte z tego treningu</div>${rm.map(x =>
    `<div class="ed-r"><span>${esc(x.name)}</span><button type="button" class="btn sm" data-undel="${x.order}" aria-label="Przywróć ${esc(x.name)}">Przywróć</button></div>`).join('')}</section>`;
}
function edUndel(order){
  const n = edSend({ op: 'undel', week: cur.week, day: cur.day, order });
  if (n < 0) return;
  toast('Przywrócono.' + (navigator.onLine === false ? ' Pełne dane wrócą po połączeniu z siecią.' : ''));
  renderTrening();
}

/* ---------- ekran Trening ---------- */
/* ---------- komentarze trenera (do serii, filmu albo całego treningu) ---------- */
const CNK = 'cn_' + KEY;
function cnSeen(){ try { return JSON.parse(localStorage.getItem(CNK) || '[]'); } catch (e) { return []; } }
function cnMark(keys){ try { localStorage.setItem(CNK, JSON.stringify(cnSeen().concat(keys).slice(-400))); } catch (e) {} }
/** logi do objętości i tonażu: bez ćwiczeń z sekcji Rozgrzewka (lib volLogs) */
const vLogs = () => volLogs(PLAN, (DATA && DATA.logs) || []);
const cnAll = () => coachNotes((DATA && DATA.logs) || [], (DATA && DATA.sessions) || []);
/** chwila z komentarza: przy serii z filmem przycisk, który otwiera film od tej chwili (openFilm) */
const cnTime = (n, l) => !l.t ? '' : n.video && l.s >= 0 ? `<button type="button" class="cn-t cn-tb" data-fv="${esc(rkOf(n))}" data-ft="${l.s}" aria-label="Film od ${esc(l.t)}">▶ ${esc(l.t)}</button> ` : `<b class="cn-t">${esc(l.t)}</b> `;
const cnList = (notes, isNew, withDate = true) => '<ul class="cn-l">' + notes.map(n => `<li class="${isNew && isNew(n) ? 'new' : ''}"><div class="cn-hr"><span class="cn-h">${esc(n.title)}${withDate && n.date ? ' · ' + ddmm(n.date) : ''}${isNew && isNew(n) ? '<span class="cw-new">NOWE</span>' : ''}</span>` +
  (n.video && !LIVE ? `<button type="button" class="btn sm cn-fb" data-fv="${esc(rkOf(n))}" aria-label="Obejrzyj film: ${esc(n.title)}">▶ Film</button>` : '') + '</div>' +
  n.lines.map(l => `<p>${cnTime(n, l)}${esc(l.txt)}</p>`).join('') + repArea(n) + '</li>').join('') + '</ul>';
/* ---------- odpowiedź klienta na komentarz trenera (Log / Sesje odpowiedz_klienta, akcja replyNote; offline przez kolejkę) ---------- */
const REPLY_MAX = 600;
const REPD = {};                                    // komentarz (kind|id) → szkic odpowiedzi w trakcie pisania, tylko w pamięci strony
const rkOf = n => n.kind + '|' + n.id;
function repArea(n){
  const rk = rkOf(n), d = REPD[rk];
  if (d !== undefined) return `<div class="cn-rep cn-ed" data-rk="${esc(rk)}"><textarea maxlength="${REPLY_MAX}" rows="3" aria-label="Twoja odpowiedź trenerowi" placeholder="Np. Dzięki! Przy drugiej serii łokieć znowu uciekał.">${esc(d)}</textarea>
    <span class="cnt">${d.length}/${REPLY_MAX}</span><div class="row"><button type="button" class="btn" data-rep-x>Anuluj</button>${n.rep ? '<button type="button" class="btn x" data-rep-del>Usuń</button>' : ''}<button type="button" class="btn go" data-rep-go>Wyślij</button></div></div>`;
  if (n.rep) return `<div class="cn-rep" data-rk="${esc(rk)}"><div class="cn-my"><span class="cn-mh">Twoja odpowiedź${n.repAt ? ' · ' + ddmm(n.repAt) : ''}</span><p>${esc(n.rep)}</p>
    <button type="button" class="lnk" data-rep-ed aria-label="Zmień odpowiedź do: ${esc(n.title)}">Zmień</button></div></div>`;
  return `<div class="cn-rep" data-rk="${esc(rk)}"><button type="button" class="btn sm cn-rb" data-rep-ed aria-label="Odpowiedz na komentarz: ${esc(n.title)}">↩ Odpowiedz</button></div>`;
}
/** odpowiedź od razu w danych aplikacji (zakładka Trener, karta „Trener skomentował”); save = pamięć telefonu */
function applyReply(r, save){
  if (!DATA) return;
  const x = ((r.kind === 'L' ? DATA.logs : DATA.sessions) || []).find(o => String(o.id) === String(r.id));
  if (x) { x.odpowiedz_klienta = r.text; x.odpowiedz_at = r.text ? (r.at || new Date().toISOString()) : ''; }
  if (save) try { localStorage.setItem(DK, JSON.stringify(DATA)); } catch (e) {}
}
function repDraw(rk, focus){
  const n = cnAll().find(x => rkOf(x) === rk); if (!n) return;
  document.querySelectorAll('.cn-rep[data-rk="' + CSS.escape(rk) + '"]').forEach(el => { el.outerHTML = repArea(n); });
  const t = focus && [...document.querySelectorAll('.cn-ed[data-rk="' + CSS.escape(rk) + '"] textarea')].find(x => x.offsetParent);   // ta sama karta bywa też na schowanym ekranie
  if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
}
function repSend(rk, text){
  const i = rk.indexOf('|'), r = { kind: rk.slice(0, i), id: rk.slice(i + 1), text: String(text || '').trim().slice(0, REPLY_MAX) };
  delete REPD[rk]; applyReply(r, true); repDraw(rk);
  send('replyNote', r).then(() => toast(r.text ? 'Wysłano trenerowi.' : 'Usunięto odpowiedź.'))
    .catch(() => toast('Brak sieci – wyślę, gdy wróci połączenie.'));
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-rep-ed],[data-rep-x],[data-rep-go],[data-rep-del]'); if (!b) return;
  const box = b.closest('.cn-rep'), rk = box && box.dataset.rk; if (!rk) return;
  if (b.hasAttribute('data-rep-ed')) { const n = cnAll().find(x => rkOf(x) === rk); REPD[rk] = n ? n.rep : ''; repDraw(rk, true); }
  else if (b.hasAttribute('data-rep-x')) { delete REPD[rk]; repDraw(rk); }
  else if (b.hasAttribute('data-rep-del')) repSend(rk, '');
  else { const t = (REPD[rk] || '').trim(); if (!t) { delete REPD[rk]; repDraw(rk); return; } repSend(rk, t); }
});
document.addEventListener('input', e => {
  const t = e.target, box = t.closest && t.closest('.cn-ed'); if (!box || t.tagName !== 'TEXTAREA') return;
  REPD[box.dataset.rk] = t.value; const c = box.querySelector('.cnt'); if (c) c.textContent = t.value.length + '/' + REPLY_MAX;
});
/* ---------- film z komentarza: odtwarzacz w aplikacji (filmy na Dysku są prywatne, więc plik idzie kawałkami przez skrypt: filmPart) ---------- */
const FVC = new Map();                              // seria (kind|id) → adres pobranego filmu w pamięci strony, najwyżej 3
function fvKeep(rk, url){ FVC.set(rk, url); while (FVC.size > 3) { const [k, u] = FVC.entries().next().value; URL.revokeObjectURL(u); FVC.delete(k); } }
const fvMB = b => (b / 1048576).toLocaleString('pl-PL', { maximumFractionDigits: b < 10485760 ? 1 : 0 });
async function fvLoad(n, st, prog){
  const parts = []; let at = 0, size = 0, type = 'video/mp4';
  do {
    const r = await call('filmPart', { id: n.id, start: at });
    if (st.stop) return '';
    const bin = atob(r.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    parts.push(u); at += u.length; size = r.size || at; type = r.type || type; prog(at, size);
    if (!u.length) break;
  } while (at < size);
  return URL.createObjectURL(new Blob(parts, { type }));
}
function openFilm(rk, sec){
  const n = cnAll().find(x => rkOf(x) === rk); if (!n || !n.video) return;
  const times = n.lines.filter(l => l.t && l.s >= 0), st = { stop: false };
  const line = l => l.t && l.s >= 0 ? `<button type="button" class="fv-m" data-fs="${l.s}"><b class="cn-t">${esc(l.t)}</b><span>${esc(l.txt)}</span></button>` : `<p class="fv-p">${esc(l.txt)}</p>`;
  openSheet(`<h2 id="sheet-t">${esc(n.title)}</h2><p class="sub">${n.date ? weekday(n.date) + ' ' + ddmm(n.date) + ' · ' : ''}${times.length ? 'dotknij chwili, żeby przewinąć film' : 'Twój film z tej serii'}</p>
    <div class="fv-box"><video id="fv-v" playsinline controls preload="auto" hidden></video><div class="fv-ld" id="fv-ld" role="status"><span id="fv-lt">Wczytuję film…</span><i><b id="fv-lb"></b></i></div></div>
    <div class="fv-sp" role="group" aria-label="Tempo"><span>Tempo</span>${[0.25, 0.5, 1].map(v => `<button type="button" class="btn sm${v === 1 ? ' on' : ''}" data-rate="${v}" aria-pressed="${v === 1}">${v === 1 ? '1×' : v === 0.5 ? '½×' : '¼×'}</button>`).join('')}</div>
    <div class="fv-l">${n.lines.map(line).join('')}</div><button type="button" class="btn" data-close>Zamknij</button>`);
  const v = $('#fv-v'), box = $('#sheet-in'), cur = { t: sec >= 0 ? sec : -1 };
  const mark = () => box.querySelectorAll('.fv-m').forEach(b => b.classList.toggle('on', +b.dataset.fs === cur.t));
  const go = t => { cur.t = t; mark(); if (v.hidden) return; v.currentTime = Math.min(t, (v.duration || t + 1) - 0.05); v.play().catch(() => {}); };
  box.querySelectorAll('.fv-m').forEach(b => b.onclick = () => go(+b.dataset.fs));
  box.querySelectorAll('[data-rate]').forEach(b => b.onclick = () => { v.playbackRate = +b.dataset.rate; box.querySelectorAll('[data-rate]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); });
  mark();
  SHEET_ON_CLOSE = () => { st.stop = true; v.pause(); };
  const show = url => { if (st.stop) return; $('#fv-ld').hidden = true; v.hidden = false; v.src = url;
    v.addEventListener('loadedmetadata', () => { if (cur.t >= 0) go(cur.t); }, { once: true });
    v.addEventListener('error', () => { $('#fv-ld').hidden = false; v.hidden = true; $('#fv-lt').textContent = 'Telefon nie umie odtworzyć tego pliku. Poproś trenera o film w innym formacie.'; }, { once: true }); };
  if (FVC.has(rk)) return show(FVC.get(rk));
  if (!navigator.onLine) { $('#fv-lt').textContent = 'Film jest na Dysku trenera: obejrzysz go po połączeniu z internetem.'; return; }
  fvLoad(n, st, (a, b) => { $('#fv-lt').textContent = 'Wczytuję film · ' + fvMB(a) + ' z ' + fvMB(b) + ' MB'; $('#fv-lb').style.width = Math.round(100 * a / Math.max(b, 1)) + '%'; })
    .then(url => { if (!url) return; fvKeep(rk, url); show(url); })
    .catch(e => { if (!st.stop) { $('#fv-lt').textContent = /Filmu nie ma/.test(e.message) ? 'Filmu nie ma już na Dysku trenera.' : 'Nie udało się wczytać filmu (' + e.message + '). Spróbuj za chwilę.'; $('#fv-lb').style.width = '0'; } });
}
document.addEventListener('click', e => { const b = e.target.closest('[data-fv]'); if (b) openFilm(b.dataset.fv, b.dataset.ft !== undefined ? +b.dataset.ft : -1); });
const cnFresh = () => { const seen = cnSeen(); return cnAll().filter(n => seen.indexOf(n.key) < 0); };
/** kropka na „Trener” w dolnym menu, gdy są nieprzeczytane komentarze */
function navDot(){
  const b = document.querySelector('#nav [data-tab="trener"]'); if (!b) return;
  const n = TAB === 'trener' ? 0 : cnFresh().length, d = b.querySelector('.nd');
  b.setAttribute('aria-label', n ? 'Trener, nowe komentarze: ' + n : 'Trener');
  if (n && !d) b.insertAdjacentHTML('beforeend', '<i class="nd" aria-hidden="true"></i>'); else if (!n && d) d.remove();
}
/** nowe komentarze = karta na górze Treningu; wszystkie są w zakładce Trener */
function notesCard(){
  if (LIVE) return '';                                            // trener prowadzi trening: komentarze są dla klienta
  const fresh = cnFresh(); if (!fresh.length) return '';
  return `<section class="cnote" aria-label="Nowe komentarze trenera"><h3>Trener skomentował</h3>${cnList(fresh)}
    <p class="cn-s">Dotknij ▶ przy komentarzu, żeby obejrzeć swój film od tej chwili.</p>
    <div class="row"><button type="button" class="btn" id="cn-ok">Przeczytane</button><button type="button" class="btn" id="cn-all">Wszystkie komentarze</button></div></section>`;
}
function bindNotes(){
  const ok = $('#cn-ok'), all = $('#cn-all');
  if (ok) ok.onclick = () => { cnMark(cnAll().map(n => n.key)); renderTrening(); navDot(); };
  if (all) all.onclick = () => { CNEW = new Set(); TAB = 'trener'; render(); window.scrollTo(0, 0); };
}
/* ---------- zakładka Trener: wszystkie komentarze trenera, tygodniami ---------- */
let CNEW = new Set();                               // nowe w chwili wejścia do zakładki: zostają oznaczone do jej opuszczenia
/* ---------- pakiet treningów (Pakiety.gs): odhaczenie w trybie „Prowadź”, licznik u klienta (cfg.pkg) ---------- */
let PKG_ON = true;   // „Zdejmij z pakietu” w podsumowaniu prowadzonego treningu, tylko w pamięci strony
const pkgN = n => n === 1 ? 'trening' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'treningi' : 'treningów';
function pkgLiveBox(s){
  const k = LIVE && !s.id && DATA && DATA.pkg;
  if (!LIVE || s.id) return '';
  if (!k) return '<p class="pkt-no">Klient nie ma pakietu: trening zapisze się bez liczenia wejść.</p>';
  const after = k.left - 1, to = k.to ? ' · ważny do ' + ddmm(k.to) : '';
  const sub = !PKG_ON ? 'nie zdejmuję: np. trening gratis albo próbny' : after >= 0 ? 'zostanie ' + after + ' z ' + k.n + to : 'pakiet wykorzystany: zapiszę jako trening poza pakietem';
  return `<button type="button" class="pkt${PKG_ON ? ' on' : ''}${PKG_ON && after < 0 ? ' over' : ''}" id="pk-on" aria-pressed="${PKG_ON}"><span class="bx" aria-hidden="true">${PKG_ON ? '✓' : ''}</span>
    <span><b>Zdejmij 1 trening z pakietu</b><small>${esc(sub)}</small></span><span class="pkt-n">${Math.max(0, k.left)}<i>/${k.n}</i></span></button>`;
}
function pkgClient(){
  const k = DATA && DATA.cfg && DATA.cfg.pkg;
  if (!k) return '';
  const cells = Array.from({ length: k.n }, (_, i) => `<i class="${i < k.n - Math.max(0, k.left) ? 'u' : ''}"></i>`).join('');
  return `<div class="card pkc-c"><div class="cn">Twój pakiet</div><div class="pkn"><b>${Math.max(0, k.left)}</b><span>z ${k.n} ${pkgN(k.n)}<br>zostało${k.to ? ' · ważny do ' + ddmm(k.to) : ''}</span></div>
    <div class="pkc" aria-hidden="true">${cells}</div>${k.left <= 0 ? '<p class="sub">Pakiet wykorzystany. Porozmawiaj z trenerem o kolejnym.</p>' : ''}</div>`;
}
function renderTrener(){
  const all = cnAll(), seen = cnSeen();
  all.forEach(n => { if (seen.indexOf(n.key) < 0) CNEW.add(n.key); });
  const isNew = n => CNEW.has(n.key), weeks = notesByWeek(all, unitDays()), fresh = all.filter(isNew).length;
  head(NAME ? 'Komentarze trenera · ' + NAME : 'Komentarze trenera', 'Trener', fresh ? `<span><b>${fresh}</b> ${fresh === 1 ? 'nowy' : 'nowe'}</span>` : '');
  const range = w => w.from ? ddmm(w.from) + (w.to && w.to !== w.from ? '–' + ddmm(w.to) : '') : '';
  const unitHead = (w, u) => esc((PLAN.find(r => String(r.week) === w.week && String(r.day) === u.unit && r.title) || {}).title || 'Trening ' + u.unit) + (u.date ? ' · ' + weekday(u.date) + ' ' + ddmm(u.date) : '');
  // przejście do panelu: tylko na urządzeniu, na którym trener raz zalogował się do panelu (trener.html ustawia tr_dev)
  let dev = false; try { dev = !!localStorage.getItem('tr_dev'); } catch (e) {}
  $('#trener').innerHTML = (dev ? '<a class="btn trp" href="trener.html">Panel trenera ›</a>' : '') + pkgClient() + (!all.length
    ? emptyCard('note', 'Jeszcze bez komentarzy', 'Tu pojawią się komentarze trenera do Twoich filmów i treningów.')
    : weeks.map((w, i) => {
        const n = w.units.reduce((s, u) => s + u.notes.length, 0), nw = w.units.reduce((s, u) => s + u.notes.filter(isNew).length, 0);
        return `<details class="card cw ${i ? '' : 'first'}" ${!i || nw ? 'open' : ''}><summary><span><span class="cn">${esc(weekLabel(+w.week || w.week))}</span>
          <span class="sub">${range(w)}${range(w) ? ' · ' : ''}${n} ${n === 1 ? 'komentarz' : n < 5 ? 'komentarze' : 'komentarzy'}${nw ? ' · ' + nw + ' ' + (nw === 1 ? 'nowy' : 'nowe') : ''}</span></span></summary>
          ${w.units.map(u => `<div class="cw-u">${unitHead(w, u)}</div>${cnList(u.notes, isNew, false)}`).join('')}</details>`;
      }).join('') + '<p class="cn-s" style="margin-top:12px">Dotknij ▶ przy komentarzu, żeby obejrzeć swój film od tej chwili.</p>') +
    '<button type="button" class="btn wl-again" id="wel-open">Jak zacząć · ekran główny</button>';
  $('#wel-open').onclick = welOpen;
  cnMark(all.filter(n => seen.indexOf(n.key) < 0).map(n => n.key));
}
/* ---------- własny trening klienta: składanie z ćwiczeń z bazy, zapis do Planu jako W1, W2… ---------- */
const ownOn = () => !!(DATA && DATA.cfg && DATA.cfg.own !== false);
let OWN = null;
/* lista nazw z bazy: pobierana dopiero przy własnym treningu, trzymana w telefonie na dobę */
/** wynik wyszukiwarki ćwiczeń: nazwa z bazy, pod nią trafiony alias (np. „wiosłowanie sztangą w opadzie”), znacznik filmu */
const exOptIn = x => `<span class="ow-n">${esc(x.name)}${x.alias ? `<small class="ow-a">${esc(x.alias)}</small>` : ''}</span>${x.film ? '<small class="ow-f">film</small>' : ''}`;
const exExact = (r, q) => r.some(x => [x.name, x.alias || ''].some(n => n.toLowerCase() === String(q).trim().toLowerCase()));
const EXK = 'exn3_' + KEY;                         // exn3: lista z linkami do filmów, partiami i aliasami (v84)
let EXN = (() => { try { return JSON.parse(localStorage.getItem(EXK) || 'null') || { t: 0, list: [] }; } catch (e) { return { t: 0, list: [] }; } })();
function exnLoad(done){
  if (EXN.list.length && Date.now() - EXN.t < 864e5) return;
  call('getExNames').then(list => { EXN = { t: Date.now(), list: list || [] }; try { localStorage.setItem(EXK, JSON.stringify(EXN)); } catch (e) {} done(); }).catch(() => {});
}                                                   // {week, day, date, title, list: [{name, sets, reps, kg, old}], edit}
/* ---------- przeglądanie bazy po partii (26.11.2026): kafle regionów → partie → lista z filmem / opisem ----------
 * wspólne dla „Dodaj ćwiczenie” (openAdd), kreatora (openOwn) i zamiany DOWOLNA (openSwap); stan okna w PK (tylko w pamięci strony).
 * st = {reg, part, film, more, pv, attr: 'n' | 'to', cls: klasa wierszy wyboru, who: imię do „W planie …”} */
const PK_PAGE = 30;
let PK = null, PKR = { t: -1, r: [] };
const pkNew = o => Object.assign({ reg: '', part: '', film: false, more: 0, pv: '', attr: 'n', cls: '', who: '' }, o);
const pkMine = () => [...new Set(PLAN.slice().reverse().map(r => r.name))];
const pkRegs = () => { if (PKR.t !== EXN.t) PKR = { t: EXN.t, r: exRegions(EXN.list) }; return PKR.r; };
/** kafle regionów (bez partii w bazie = nic) */
function pkTiles(st){
  const rs = pkRegs();
  if (!rs.some(r => r.id !== 'inne' && r.id !== 'boje')) return '';
  return `<div class="lbl pk-l">Albo przeglądaj według partii</div><div class="pk-g" role="group" aria-label="Partie">${rs.map(r =>
    `<button type="button" class="pk-t" data-pkr="${r.id}"><b>${esc(r.name)}</b><small>${r.n} ${plural(r.n, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')}${r.f ? ` · <i>▶ ${r.f}</i>` : ''}</small></button>`).join('')}</div>`;
}
/** lista regionu: nagłówek, pigułki partii, „tylko z filmem”, wiersze (wybór + film / opis), „Pokaż dalsze” */
function pkList(st, q){
  const reg = EX_REGIONS.find(r => r.id === st.reg) || { name: '' }, b = exBrowse(pkMine(), EXN.list, { region: st.reg, part: st.part, q, film: st.film });
  const n = b.mine.length + b.rest.length, lim = PK_PAGE * (st.more + 1), rest = b.rest.slice(0, Math.max(0, lim - b.mine.length));
  const sel = `data-${st.attr}`, cls = 'pk-n' + (st.cls ? ' ' + st.cls : '');
  const row = x => {
    const fx = !x.film && FXD && FXD[x.name], open = st.pv === x.name && fx, f = EXN.list.find(e => e[0] === x.name);
    const sub = [x.pl ? x.name : '', x.parts.map(p => EX_PART_SHORT[p] || p).join(' · ')].filter(Boolean).join(' · ');
    const v = x.film && f && /^https?:\/\//i.test(String(f[1])) ? `<a class="pk-v" href="${esc(f[1])}" target="_blank" rel="noopener" aria-label="Film: ${esc(x.name)}"><span aria-hidden="true">▶</span>film</a>`
      : fx ? `<button type="button" class="pk-v" data-pkv="${esc(x.name)}" aria-expanded="${!!open}" aria-label="Zdjęcia i opis: ${esc(x.name)}"><span aria-hidden="true">▦</span>opis</button>`
      : '<span class="pk-v off" aria-hidden="true"><span>–</span>brak</span>';
    const d = open ? FXD[x.name] : null;
    return `<div class="pk-r${open ? ' open' : ''}"><button type="button" class="${cls}" ${sel}="${esc(x.name)}"><b>${esc(x.pl || x.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>${v}${d ? `<div class="pk-pv">${d.i ? `<div class="fxi">${[0, 1].map(k => `<img src="cw/${encodeURIComponent(d.i)}/${k}.jpg" alt="${k ? 'Koniec ruchu' : 'Początek ruchu'}: ${esc(x.name)}" width="400" height="267" loading="lazy" decoding="async">`).join('')}</div>` : ''}<ol class="fxk">${d.k.map(t => `<li>${esc(t)}</li>`).join('')}</ol><button type="button" class="btn p pk-ok${st.cls ? ' ' + st.cls : ''}" ${sel}="${esc(x.name)}">Wybierz to ćwiczenie</button></div>` : ''}</div>`;
  };
  return `<div class="pk-h"><button type="button" class="btn sm" data-pkb>‹ Partie</button><b>${esc(reg.name)}</b><small>${q.trim() || st.part || st.film ? n + ' z ' + b.total : b.total}</small></div>
    <div class="pk-ch" role="group" aria-label="Partia: ${esc(reg.name)}">${b.parts.length > 1 ? `<button type="button" data-pkp="" aria-pressed="${!st.part}">Wszystkie ${b.total}</button>` + b.parts.map(([p, c]) =>
      `<button type="button" data-pkp="${esc(p)}" aria-pressed="${st.part === p}">${esc(EX_PART_SHORT[p] || p)} ${c}</button>`).join('') : ''}<button type="button" class="pk-fl" data-pkf aria-pressed="${st.film}">▶ tylko z filmem</button></div>
    ${b.mine.length ? `<div class="lbl pk-s">W planie${st.who ? ': ' + esc(st.who) : ''}</div>` + b.mine.map(row).join('') : ''}
    ${rest.length ? `<div class="lbl pk-s">${b.mine.length ? 'Z bazy' : 'Baza'} · najpierw z filmem</div>` + rest.map(row).join('') : ''}
    ${n > lim ? `<button type="button" class="pk-more" data-pkm>Pokaż dalsze (${n - lim})</button>` : ''}
    ${!n ? `<p class="sub">Nic tu nie pasuje${q.trim() ? ' do „' + esc(q.trim().slice(0, 40)) + '”' : ''}.${st.film ? ' Spróbuj bez „tylko z filmem”.' : ''}</p>` : ''}`;
}
/** przyciski przeglądania w oknie; redraw() rysuje wyniki od nowa (z bieżącym zapytaniem) */
function pkBind(st, box, redraw){
  const go = f => () => { f(); redraw(); };
  box.querySelectorAll('[data-pkr]').forEach(b => b.onclick = go(() => { Object.assign(st, { reg: b.dataset.pkr, part: '', more: 0, pv: '' }); fxLoad(); }));
  box.querySelectorAll('[data-pkb]').forEach(b => b.onclick = go(() => Object.assign(st, { reg: '', part: '', film: false, more: 0, pv: '' })));
  box.querySelectorAll('[data-pkp]').forEach(b => b.onclick = go(() => Object.assign(st, { part: b.dataset.pkp, more: 0, pv: '' })));
  box.querySelectorAll('[data-pkf]').forEach(b => b.onclick = go(() => Object.assign(st, { film: !st.film, more: 0, pv: '' })));
  box.querySelectorAll('[data-pkm]').forEach(b => b.onclick = go(() => { st.more++; }));
  box.querySelectorAll('[data-pkv]').forEach(b => b.onclick = go(() => { st.pv = st.pv === b.dataset.pkv ? '' : b.dataset.pkv; }));
  box.querySelectorAll('.pk-pv img').forEach(im => im.onerror = () => { const w = im.parentNode; im.remove(); if (w && !w.querySelector('img')) w.remove(); });
  if (st.reg && !FXD) { const l = fxLoad(); if (l) l.then(() => { if (PK === st && st.reg && box.isConnected) redraw(); }); }
}
/** wiersze planu własnej jednostki (lokalnie, zanim serwer odpowie); save = zapis w pamięci telefonu */
function applyOwn(u, save){
  const same = PLAN.filter(r => r.week === u.week && !r.own), block = (same[0] || PLAN[PLAN.length - 1] || {}).block || '';
  const kgOf = v => String(v === undefined || v === null ? '' : v).trim() === '' ? '' : isNum(num(v)) ? num(v) : String(v);
  // film „Jak wykonać” i partie od razu: z wcześniejszego wiersza planu o tej nazwie albo z bazy (getExNames)
  const lc = s => String(s).toLowerCase(), dx = n => {
    const p = PLAN.find(r => lc(r.name) === lc(n) && (r.infos || []).length), b = EXN.list.find(x => lc(x[0]) === lc(n));
    if (!p && !b && isComplex(n)) {                                              // kompleks bez własnego wiersza w bazie: film każdej części, partie razem
      const ps = String(n).split(/\s+\+\s+/).map(dx);
      return { infos: [].concat(...ps.map(x => x.infos)), parts: [...new Set([].concat(...ps.map(x => x.parts)))] };
    }
    return { infos: p ? p.infos : b && /^https?:\/\//i.test(String(b[1])) ? [{ n: b[0], u: b[1] }] : [],
      parts: p ? p.parts || [] : b && b[2] ? String(b[2]).split(';').map(s => s.trim()).filter(Boolean) : [] };
  };
  const led = LIVE && TL.ledDay(u.day), coach = LIVE && /^T\d/.test(String(u.day));   // trener: trening prowadzony P (poza planem) albo dawna jednostka planu T
  const rows = u.exercises.map((e, i) => ({ week: u.week, day: u.day, title: led ? u.title || 'Trening z trenerem' : coach ? u.title || 'Trening' : 'Własny' + (u.title ? ' · ' + u.title : ''), date: u.date, order: i + 1,
    name: e.name, prio: 'A', sets: +e.sets, reps: String(e.reps), pct: null, kg: kgOf(e.kg), rpe: '', note: '', extra: null, drop: 0,
    group: '', block: led ? '' : block, swaps: [], infos: dx(e.name).infos, parts: dx(e.name).parts, ...(led ? { led: true } : coach ? { coach: true } : { own: true }), circuit: e.circuit || '' }));
  DATA.plan = DATA.plan.filter(r => !(r.week === u.week && r.day === u.day)).concat(rows); PLAN = DATA.plan;
  if (save) try { localStorage.setItem(DK, JSON.stringify(DATA)); } catch (e) {}
}
/* ---------- trening bez planu i szablony (prowadzony trening, punkt 17 przeglądu v80, 23.11.2026) ----------
 * „Prowadź” bez jednostki na dziś (albo „⋯ → Nowa jednostka”): „Jak ostatnio” (lib likeLast), szablony trenera (DATA.templates,
 * kg z historii klienta: lib tplUnit / histKg) albo pusty trening → kreator jednostki (openOwn) z gotową listą do poprawki.
 * „⋯ → Zapisz jako szablon” → saveTemplate (zakładka Szablony, bez kg i imion klientów).
 */
let NOPLAN_ASK = LIVE && !LIVE_J;   // raz po pierwszym wczytaniu: wejście z panelu bez wskazanej jednostki
function openNoPlan(auto){
  const last = likeLast(PLAN, (DATA && DATA.logs) || []), tpls = (DATA && DATA.templates) || [], logs = (DATA && DATA.logs) || [];
  const n = x => x + ' ' + plural(x, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń');
  const opts = [];
  if (last) opts.push(['last', 'Jak ostatnio: ' + last.title, weekday(last.date) + ' ' + ddmm(last.date) + ' · ' + n(last.list.length) + ' · kg z tamtego treningu']);
  tpls.forEach((t, i) => opts.push(['t' + i, 'Szablon: ' + t.name, 'Twój szablon · ' + n(t.ex.length) + ' · kg z historii']));
  opts.push(['empty', 'Pusty trening', 'Dodajesz ćwiczenia sam']);
  openSheet(`<h2 id="sheet-t">${auto ? 'Trening bez planu' : 'Nowa jednostka'}</h2><p class="sub">${auto ? esc(NAME || 'Klient') + ' nie ma dziś jednostki w planie. ' : ''}Od czego zaczynasz?</p>
    <div class="opts act" id="np">${opts.map(o => `<button type="button" class="opt" data-np="${o[0]}"><i aria-hidden="true">${o[0] === 'empty' ? '＋' : o[0] === 'last' ? '↻' : '⧉'}</i><b>${esc(o[1])}</b><small>${esc(o[2])}</small></button>`).join('')}</div>
    <p class="sub">Trening trafi do planu jako Twoja jednostka (bieżący blok); przed zapisem poprawisz ćwiczenia, serie i kg.${tpls.length ? '' : ' Szablon zapiszesz z „⋯ → Zapisz jako szablon” w dowolnym treningu.'}</p>
    <button type="button" class="btn" data-close>${auto ? 'Nie teraz' : 'Anuluj'}</button>`);
  $('#np').onclick = e => { const b = e.target.closest('[data-np]'); if (!b) return; const k = b.dataset.np;
    closeSheet(); openOwn(null, k === 'empty' ? null : k === 'last' ? { title: last.title, list: last.list } : tplUnit(tpls[+k.slice(1)], logs)); };
}
function openTplSave(s0){
  const exs = PLAN.filter(r => r.week === cur.week && r.day === cur.day && !r.own).sort((a, b) => a.order - b.order);
  const name0 = String(s0.title || '').slice(0, 40), have = ((DATA && DATA.templates) || []).map(t => t.name.toLowerCase());
  openSheet(`<h2 id="sheet-t">Zapisz jako szablon</h2><p class="sub">${esc(exs.map(e => e.name).join(' · '))}</p>
    <label class="fl">Nazwa szablonu<input id="tp-name" maxlength="40" value="${esc(name0)}"></label>
    <p class="hint" id="tps-same" hidden>Szablon o tej nazwie już jest: zapis go zastąpi.</p>
    <p class="sub">Zapisuję ćwiczenia, serie i powtórzenia. Kg dobierze się z historii klienta, który z niego trenuje. Szablony są wspólne dla wszystkich Twoich klientów.</p>
    <p class="hint" id="tps-err" role="alert" hidden></p>
    <button type="button" class="btn p" id="tps-ok">Zapisz szablon</button><button type="button" class="btn" data-close>Anuluj</button>`);
  const nm = $('#tp-name'), same = () => { $('#tps-same').hidden = have.indexOf(nm.value.trim().replace(/\s+/g, ' ').toLowerCase()) < 0; };
  nm.oninput = same; same();
  $('#tps-ok').onclick = () => {
    const err = t => { const x = $('#tps-err'); x.textContent = t; x.hidden = false; };
    if (!nm.value.trim()) return err('Wpisz nazwę szablonu.');
    if (navigator.onLine === false) return err('Bez sieci szablonu nie zapiszę.');
    const b = $('#tps-ok'); b.disabled = true; b.textContent = 'Zapisuję…';
    call('saveTemplate', { name: nm.value.trim(), ex: exs.map(e => ({ name: e.name, sets: e.sets, reps: String(e.reps), circuit: e.circuit || '' })) })
      .then(list => { DATA.templates = list || []; try { localStorage.setItem(DK, JSON.stringify(DATA)); } catch (e) {} closeSheet(); toast('Szablon zapisany.'); })
      .catch(e => { b.disabled = false; b.textContent = 'Zapisz szablon'; err(e.message); });
  };
}
function openOwn(unit, preset){   // preset (trening bez planu): {title, list: [{name, sets, reps, kg, c}]} = gotowa lista do poprawki
  const kgS = v => v === '' || v === null || v === undefined ? '' : typeof v === 'number' ? String(fmtKg(v)) : String(v);
  OWN = unit ? { week: unit.week, day: unit.day, date: unit.date, title: String(unit.title || '').replace(/^Własny( · )?/, ''), edit: true,
      list: unit.rows.slice().sort((a, b) => a.order - b.order).map(r => ({ name: r.name, sets: r.sets, reps: String(r.reps), kg: r.kg === '' ? '' : String(fmtKg(r.kg)), old: true, c: r.circuit || '' })) }
    : { date: localDate(), title: preset ? String(preset.title || '').slice(0, 40) : '', list: preset ? preset.list.map(e => ({ name: e.name, sets: e.sets, reps: String(e.reps), kg: kgS(e.kg), c: e.c || '' })) : [], edit: false };
  OWN.pick = -1; OWN.ren = -1; PK = pkNew({ cls: 'ow-add', who: LIVE ? NAME : '' });
  const lv = LIVE && !OWN.edit;                                  // trener: nowa jednostka w planie klienta (bieżący blok)
  openSheet(`<h2 id="sheet-t">${OWN.edit ? 'Dodaj ćwiczenie' : lv ? 'Nowa jednostka: ' + esc(NAME) : 'Własny trening'}</h2>
    <p class="sub">${OWN.edit ? 'Dopisz ćwiczenia do tego treningu.' : lv ? 'Trafi do planu jako Twoja jednostka (bieżący blok), od razu do prowadzenia.' : 'Poza planem trenera. Trener zobaczy go w arkuszu.'}</p>
    ${OWN.edit ? '' : `<label class="fl">Dzień<input type="date" id="ow-date" value="${OWN.date}"></label>
    <label class="fl">Tytuł (opcjonalnie)<input id="ow-title" maxlength="40" placeholder="np. Ramiona" value="${esc(OWN.title)}"></label>`}
    <label class="fl">Szukaj ćwiczenia<input id="ow-q" autocomplete="off" placeholder="np. curl, przysiad, plank"></label>
    <div id="ow-res" class="ow-res"></div>
    <div class="lbl ow-h">Wybrane ćwiczenia</div><div id="ow-list"></div>
    <p class="hint" id="ow-err" role="alert" hidden></p>
    <button type="button" class="btn p" id="ow-save">${OWN.edit ? 'Zapisz' : lv ? 'Zapisz i prowadź' : 'Zapisz i zacznij'}</button>
    <button type="button" class="btn" data-close>Anuluj</button>`);
  const q = $('#ow-q');
  q.oninput = () => ownRes(q.value);
  ownRes(''); ownList(); exnLoad(() => { const qq = $('#ow-q'); if (qq) ownRes(qq.value); });
  $('#ow-save').onclick = ownSave;
}
function ownRes(q){
  const box = $('#ow-res'), qi = $('#ow-q'); if (!box) return;
  if (qi) qi.placeholder = PK.reg ? 'szukaj w: ' + (EX_REGIONS.find(r => r.id === PK.reg) || {}).name : 'np. curl, przysiad, plank';
  if (PK.reg) box.innerHTML = pkList(PK, q);
  else {
    const res = exSearch(pkMine(), EXN.list, q, 12), exact = exExact(res, q);
    box.innerHTML = (q.trim() ? '' : pkTiles(PK) + (res.length ? (LIVE ? '<div class="lbl">Z planu: ' + esc(NAME) + '</div>' : '<div class="lbl">Twoje ćwiczenia</div>') : '')) +
      res.map(r => `<button type="button" class="opt ow-add" data-n="${esc(r.name)}">${exOptIn(r)}</button>`).join('') +
      (q.trim() && !exact ? `<button type="button" class="opt ow-add ow-new" data-n="${esc(q.trim().replace(/\s+/g, ' ').slice(0, 80))}">+ Dodaj „${esc(q.trim().slice(0, 80))}” jako nowe ćwiczenie</button>` : '') +
      (q.trim() && !res.length ? '<p class="sub">Nie ma takiego ćwiczenia w bazie. Możesz dodać je pod własną nazwą — trener podepnie film.</p>' : '');
  }
  pkBind(PK, box, () => ownRes($('#ow-q').value));
  document.querySelectorAll('.ow-add').forEach(b => b.onclick = () => {
    const n = b.dataset.n, last = PLAN.slice().reverse().find(r => r.name === n);
    const t = !!last && timeUnit(last.reps) === 's';                             // ostatnio na czas („30 s”) → od razu sekundy
    OWN.list.push({ name: n, sets: last ? last.sets : 3, reps: last ? (t ? String(parseInt(last.reps)) : String(last.reps)) : '10', kg: last && last.kg !== '' ? String(fmtKg(last.kg)) : '', t });
    $('#ow-q').value = ''; ownRes(''); ownList(); toast('Dodano: ' + n + '.');
  });
}
/* ---------- kolejność i nazwa ćwiczenia (kreator i „Kolejność i nazwy”): strzałki ↑ ↓ (lib orderMove), ✎ = nazwa w miejscu ---------- */
/** strzałki pozycji i (grp = cały obwód); a = [{c, lock}] w kolejności listy */
const ordMvBtns = (a, i, grp, nm) => [-1, 1].map(d => `<button type="button" class="ow-mv" data-mv="${i}" data-d="${d}"${grp ? ' data-g="1"' : ''}${orderMove(a, i, d, grp) ? '' : ' disabled'} aria-label="${esc(nm)}: ${d < 0 ? 'wyżej' : 'niżej'}">${d < 0 ? '↑' : '↓'}</button>`).join('');
const ordRenBtn = (i, nm) => `<button type="button" class="ow-mv ow-ed" data-ren-go="${i}" aria-label="Zmień nazwę: ${esc(nm)}">✎</button>`;
const ordNameIn = (i, nm) => `<div class="ow-nm"><input class="ow-ni" data-ren="${i}" maxlength="80" value="${esc(nm)}" aria-label="Nazwa ćwiczenia" autocomplete="off"><button type="button" class="ow-tm" data-ren-ok="${i}">OK</button></div>`;
/** st = {list: [{name, c, old | lock}], ren}; redraw = rysuje listę od nowa. Nazwa zmienia się od razu przy pisaniu, OK / Enter zamyka pole. */
function ordBind(box, st, redraw){
  const L = st.list;
  box.querySelectorAll('[data-ren-go]').forEach(b => b.onclick = () => {
    st.ren = +b.dataset.renGo; redraw();
    const inp = box.querySelector('input[data-ren]'); if (inp) { inp.focus(); inp.select(); }
  });
  const close = () => { st.ren = -1; redraw(); };
  box.querySelectorAll('input[data-ren]').forEach(inp => {
    inp.oninput = () => { L[+inp.dataset.ren].name = inp.value; const er = $('#ow-err') || $('#or-err'); if (er) er.hidden = true; };
    inp.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); if (inp.value.trim()) close(); } };
  });
  box.querySelectorAll('[data-ren-ok]').forEach(b => b.onclick = () => { if (String(L[+b.dataset.renOk].name).trim()) close(); });
  box.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => {
    const i = +b.dataset.mv, d = +b.dataset.d, grp = !!b.dataset.g;
    const r = orderMove(L.map((e, k) => ({ c: e.c, lock: !!(e.old || e.lock), k })), i, d, grp); if (!r) return;
    const moved = L[i], out = r.map(x => L[x.k]);
    L.splice(0, L.length, ...out); st.pick = -1; st.ren = -1; redraw();
    // fokus zostaje na tej samej strzałce przesuniętej pozycji (czytnik ekranu, klawiatura)
    const ni = L.indexOf(moved), sel = `[data-mv="${ni}"]${grp ? '[data-g]' : ':not([data-g])'}`;
    const f = box.querySelector(sel + `[data-d="${d}"]:not([disabled])`) || box.querySelector(sel + ':not([disabled])'); if (f) f.focus();
  });
}
function ownList(){
  const box = $('#ow-list'), L = OWN.list;
  // kompleks z poprzednim: oba nowe (niezapisane), żadne na czas ani w obwodzie, nazwa mieści się w 80 znakach (limit Planu)
  const canJoin = i => { const a = L[i - 1], b = L[i]; return !!a && !a.old && !b.old && !a.t && !b.t && !a.c && !b.c && (a.name + ' + ' + b.name).length <= 80; };
  // obwód z poprzednim: oba nowe, to ćwiczenie jeszcze bez obwodu
  const canCirc = i => { const a = L[i - 1], b = L[i]; return !!a && !a.old && !b.old && !b.c; };
  const first = i => L[i].c && !(L[i - 1] && L[i - 1].c === L[i].c), last = i => L[i].c && !(L[i + 1] && L[i + 1].c === L[i].c);
  const tagOf = i => { let j = i; while (L[j - 1] && L[j - 1].c === L[i].c) j--; return L[i].c + (i - j + 1); };
  const size = c => L.filter(e => e.c === c).length;
  const mvL = L.map(e => ({ c: e.c, lock: !!e.old }));                       // strzałki: zapisane (old) stoją
  const item = (e, i) => {
    const cx = isComplex(e.name), nm = (e.c ? tagOf(i) + ' · ' : '') + e.name;
    if (e.old) return `<div class="ow-it old"><b>${esc(nm)}</b><span>${esc(String(e.sets))} × ${esc(e.reps)}${e.kg ? ' · ' + esc(e.kg) + ' kg' : ''}</span></div>`;
    const link = canJoin(i) || canCirc(i);
    return `<div class="ow-it ${e.c ? 'in' : ''}">${OWN.ren === i ? ordNameIn(i, e.name) : `<div class="ow-nm"><b>${esc(nm)}</b>${ordRenBtn(i, e.name)}${ordMvBtns(mvL, i, false, e.name)}</div>`}
        <div class="ow-row">${cx ? `<span class="ow-tag">kompleks</span><button type="button" class="ow-tm" data-split="${i}" aria-label="Rozłącz kompleks ${esc(e.name)}">Rozłącz</button>`
          : `<button type="button" class="ow-tm" data-tm="${i}" aria-pressed="${!!e.t}" aria-label="${esc(e.name)}: ćwiczenie na czas">⏱ na czas</button>`}
          ${link ? `<button type="button" class="ow-tm" data-link="${i}" aria-expanded="${OWN.pick === i}" aria-label="Połącz ${esc(e.name)} z poprzednim: ${esc(L[i - 1].name)}">⛓ Połącz z poprzednim</button>` : ''}</div>
        ${link && OWN.pick === i ? `<div class="ow-ch">${canJoin(i) ? `<button type="button" class="opt" data-join="${i}"><b>Kompleks</b><small>Jedno po drugim bez odkładania ciężaru. Jedno ćwiczenie „A + B”, powt. „1+1”.</small></button>` : ''}
          ${canCirc(i) ? `<button type="button" class="opt" data-circ="${i}"><b>Obwód / superseria</b><small>Na zmianę: po serii jednego od razu następne, przerwa po całej rundzie.</small></button>` : ''}</div>` : ''}<span></span>
        ${e.c ? '' : `<label>serie<input inputmode="numeric" data-i="${i}" data-f="sets" value="${esc(String(e.sets))}"></label>`}
        <label>${e.t ? 'sek.' : 'powt.'}<input ${e.t ? 'inputmode="numeric" ' : ''}${cx ? 'placeholder="1+1" ' : ''}data-i="${i}" data-f="reps" value="${esc(e.reps)}"></label>
        <label>kg<input inputmode="decimal" data-i="${i}" data-f="kg" value="${esc(e.kg)}" placeholder="—"></label>
        <button type="button" class="ow-rm" data-rm="${i}" aria-label="Usuń ${esc(e.name)}">✕</button></div>`;
  };
  box.innerHTML = !L.length ? '<p class="sub">Jeszcze nic. Wyszukaj ćwiczenie powyżej i dotknij, żeby dodać.</p>'
    : L.map((e, i) => (first(i) && size(e.c) > 1 ? `<div class="ow-grp"><div class="ow-gh k"><b>${size(e.c) === 2 ? 'Superseria' : 'Obwód'} ${esc(e.c)} · na zmianę</b>` +
        (e.old ? `<span class="sub">${esc(String(e.sets))} rundy</span>` : `<label>rundy<input inputmode="numeric" data-rounds="${esc(e.c)}" value="${esc(String(e.sets))}" aria-label="Rundy obwodu ${esc(e.c)}"></label>
        <button type="button" class="ow-tm" data-uncirc="${esc(e.c)}" aria-label="Rozłącz obwód ${esc(e.c)}">Rozłącz</button><span class="ow-mvs">${ordMvBtns(mvL, i, true, (size(e.c) === 2 ? 'superseria ' : 'obwód ') + e.c)}</span>`) + '</div>' : '') +
      item(e, i) + (last(i) && size(e.c) > 1 ? '</div>' : '')).join('');
  box.querySelectorAll('input[data-i]').forEach(inp => inp.oninput = () => { L[+inp.dataset.i][inp.dataset.f] = inp.value; $('#ow-err').hidden = true; });
  box.querySelectorAll('input[data-rounds]').forEach(inp => inp.oninput = () => { L.forEach(e => { if (e.c === inp.dataset.rounds && !e.old) e.sets = inp.value; }); $('#ow-err').hidden = true; });
  box.querySelectorAll('[data-tm]').forEach(b => b.onclick = () => {             // powtórzenia ⇄ czas: domyślnie 30 s / 10 powt.
    const e = L[+b.dataset.tm]; e.t = !e.t;
    if (e.t && (e.reps === '10' || !/^\d+$/.test(String(e.reps).trim()))) e.reps = '30'; else if (!e.t && e.reps === '30') e.reps = '10';
    ownList();
  });
  const redo = () => { OWN.pick = -1; OWN.list = circuitTidy(OWN.list); ownList(); };
  box.querySelectorAll('[data-link]').forEach(b => b.onclick = () => { OWN.pick = OWN.pick === +b.dataset.link ? -1 : +b.dataset.link; ownList(); });
  box.querySelectorAll('[data-join]').forEach(b => b.onclick = () => { const i = +b.dataset.join; L.splice(i - 1, 2, ownJoin(L[i - 1], L[i])); redo(); });
  box.querySelectorAll('[data-split]').forEach(b => b.onclick = () => { const i = +b.dataset.split, c = L[i].c || ''; L.splice(i, 1, ...ownSplit(L[i]).map(e => Object.assign(e, { c }))); redo(); });
  box.querySelectorAll('[data-circ]').forEach(b => b.onclick = () => {           // dołącz do obwodu poprzedniego albo załóż nowy
    const i = +b.dataset.circ, a = L[i - 1]; if (!a.c) a.c = circuitLetter(L);
    L[i].c = a.c; redo();
  });
  box.querySelectorAll('[data-uncirc]').forEach(b => b.onclick = () => { L.forEach(e => { if (e.c === b.dataset.uncirc && !e.old) e.c = ''; }); redo(); });
  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { L.splice(+b.dataset.rm, 1); OWN.ren = -1; redo(); });
  ordBind(box, OWN, ownList);
}
function ownSave(){
  const err = t => { const e = $('#ow-err'); e.textContent = t; e.hidden = false; };
  OWN.list = circuitTidy(OWN.list);
  if (!OWN.list.length) return err('Dodaj co najmniej jedno ćwiczenie.');
  OWN.list.forEach(e => { if (!e.old) e.name = String(e.name).trim().replace(/\s+/g, ' ').slice(0, 80); });
  if (OWN.list.some(e => !e.name)) { OWN.ren = OWN.list.findIndex(e => !e.name); ownList(); return err('Wpisz nazwę ćwiczenia.'); }
  if (OWN.list.some(e => !(+e.sets >= 1 && +e.sets <= SETS_MAX) || !String(e.reps).trim())) return err('Przy każdym ćwiczeniu wpisz serie (1–' + SETS_MAX + ') i powtórzenia albo czas.');
  if (OWN.list.some(e => e.t && !e.old && !(parseInt(e.reps) > 0))) return err('Przy ćwiczeniu na czas wpisz liczbę sekund.');
  if (OWN.list.some(e => !e.old && !e.t && isComplex(e.name) && !complexRepsOk(e.name, e.reps))) return err('W kompleksie wpisz powtórzenia każdej części, np. 1+2.');
  if (!OWN.edit) {
    const d = $('#ow-date').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return err('Wybierz dzień.');
    OWN.date = d; OWN.title = $('#ow-title').value.trim(); OWN.week = ownWeek(PLAN, d); OWN.day = LIVE ? TL.liveNextDay(PLAN) : ownNextDay(PLAN, OWN.week);
  }
  const u = { week: OWN.week, day: OWN.day, date: OWN.date, title: OWN.title,
    exercises: OWN.list.map(e => ({ name: e.name, sets: +e.sets, reps: e.t && !e.old ? parseInt(e.reps) + ' s' : String(e.reps).trim(), kg: String(e.kg || '').trim(), ...(e.c ? { circuit: e.c } : {}) })) };
  applyOwn(u, true);
  send('addOwnUnit', u).catch(() => {});
  closeSheet();
  cur.week = u.week; cur.day = u.day; TAB = 'trening'; WK = null; render(); window.scrollTo(0, 0);
  toast(OWN.edit ? 'Dodano do treningu.' : LIVE ? 'Nowa jednostka w planie.' : 'Własny trening gotowy.');
}
/* Samsung Internet z trybem ciemnym przyciemnia aplikację po swojemu (czarny nagłówek, szare karty): podpowiedź, żeby otworzyć ją w Chrome; „Rozumiem” chowa ją na stałe (sb_<klucz>) */
const SBK = 'sb_' + KEY;
function sbNote(){
  if (!/SamsungBrowser/i.test(navigator.userAgent)) return '';
  try { if (localStorage.getItem(SBK)) return ''; } catch (e) {}
  return `<section class="sbnote" role="note"><b>Kolory mogą być zmienione przez przeglądarkę</b>
    <span>Samsung Internet w trybie ciemnym przyciemnia aplikację po swojemu. Najlepiej otwórz link od trenera w Chrome i stamtąd dodaj aplikację do ekranu głównego.</span>
    <button type="button" class="btn sm" id="sb-ok">Rozumiem</button></section>`;
}
/** ćwiczenia bieżącej jednostki z naniesioną zamianą i pominięciem */
/* ---------- obwód / superseria na Treningu: ramka, „Teraz / Potem”, przerwa po rundzie ---------- */
let CIRC = [];                                                                // grupy bieżącej jednostki (circuitGroups)
const grpOf = o => CIRC.find(g => g.orders.includes(+o));
const grpState = g => circuitState(g.orders.map(o => { const w = work(o), c = document.querySelector(`.card[data-card="${o}"]`);
  return { order: o, sets: c && c.classList.contains('skip') ? 0 : w.length, done: w.filter(r => r.dataset.st).length }; }));
const grpTag = (g, o) => g.id + (g.orders.indexOf(o) + 1);
function grpDraw(id){
  const g = CIRC.find(x => x.id === id), box = document.querySelector(`.grp[data-grp="${id}"]`); if (!g || !box) return null;
  const st = grpState(g), nm = o => { const c = document.querySelector(`.card[data-card="${o}"] .cn`); return grpTag(g, o) + ' · ' + (c ? c.textContent : ''); };
  box.querySelector('.grp-r').textContent = st.done ? 'zrobione ✓' : 'runda ' + st.round + ' z ' + st.rounds + ' · przerwa po rundzie';
  box.querySelector('.grp-now').innerHTML = st.done ? 'Wszystkie rundy zrobione.' : 'Teraz: <b>' + esc(nm(st.next)) + '</b>.' + (st.after ? ' Potem ' + esc(nm(st.after)) + '.' : ' Potem przerwa.');
  document.querySelectorAll('.set.nowrow').forEach(r => { if (grpOf(r.dataset.o) === g) r.classList.remove('nowrow'); });
  const row = st.next && work(st.next).find(r => !r.dataset.st); if (row) row.classList.add('nowrow');
  return { st, row };
}
/** po zaliczonej serii w obwodzie: koniec rundy → przerwa, inaczej bez przerwy i przejście do następnego ćwiczenia */
function grpAfter(ex){
  const g = grpOf(ex.order), d = g && grpDraw(g.id); if (!d) return;
  if (d.st.fresh) { startRest(ex, CIRCUIT_REST, (g.orders.length === 2 ? 'Superseria ' : 'Obwód ') + g.id + (d.st.done ? '' : ' · przed rundą ' + d.st.round)); return; }
  if (d.row && +d.row.dataset.o !== ex.order) setTimeout(() => {
    setFold(+d.row.dataset.o, false);
    d.row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 350);
}
const curExs = () => PLAN.filter(r => r.week === cur.week && r.day === cur.day).sort((a, b) => a.order - b.order).map(withSwap).map(withSkip);
/** notatka trenera do całej jednostki (Plan.uwagi_jedn, pierwszy wiersz z treścią) */
function unoteCard(exs){
  const r = exs.slice().sort((a, b) => a.order - b.order).find(x => String(x.unote || '').trim());
  return r ? `<section class="unote" id="unote" aria-label="Notatka trenera do tego treningu"><h3>✎ Od trenera do tego treningu</h3><p>${esc(String(r.unote).trim())}</p></section>` : '';
}
function renderTrening(){
  if (!PLAN.some(r => r.week === cur.week && r.day === cur.day)) pickDefault();
  const exs = curExs();
  if (!exs.length) {
    head(NAME, 'Trening');
    $('#main').innerHTML = ownOn()
      ? '<section class="card first noplan"><div class="cn">Jeszcze nie masz planu</div><p class="sub">Trener doda go wkrótce. Do tego czasu możesz zrobić własny trening: wybierasz ćwiczenia i zapisujesz serie jak zwykle, a trener je widzi.</p>' +
        '<button type="button" class="btn p" id="own-first">+ Własny trening</button></section>'
      : emptyCard('plan', 'Jeszcze nie masz planu', 'Trener doda go wkrótce. Gdy plan będzie gotowy, zobaczysz go tutaj.', ['id="es-again"', 'Sprawdź ponownie']);
    const f = $('#own-first'); if (f) f.onclick = () => openOwn(null);
    const a = $('#es-again'); if (a) a.onclick = () => { a.disabled = true; refreshData().then(() => { if (!PLAN.length) toast('Planu jeszcze nie ma.'); }).catch(() => { a.disabled = false; toast('Brak sieci. Spróbuj za chwilę.'); }); };
    return;
  }
  const s0 = exs[0];
  head(weekLabel(cur.week) + ' · ' + window.TL.dayLabel(cur.day, s0.title) + ' · ' + weekday(s0.date) + ' ' + ddmm(s0.date) + (sessDone(cur.week, cur.day) ? ' · zrobiona ✓' : ''),
    s0.title || cur.day,
    `<span>Czas <b class="clock">${clockText()}</b></span><span>Serie <b id="st-sets"></b></span><span>Tonaż <b id="st-ton"></b> kg</span>`,
    (SIMPLE ? '' : `<span class="sc" role="group" aria-label="Skala">${['RPE', 'RIR'].map(s => `<button type="button" data-sc="${s}" aria-pressed="${SCALE === s}">${s}</button>`).join('')}</span>`) +
    (!(s0.led && !LIVE) && (exs.length > 1 || LIVE || ordOk(s0) || (!sessDone(cur.week, cur.day) && unitEntries().length)) ? `<button type="button" class="hmore" id="umore" aria-label="Więcej akcji: ${esc(s0.title || cur.day)}">${MORE_SVG}</button>` : ''));
  document.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => {
    SCALE = b.dataset.sc; try { localStorage.setItem('sc_' + KEY, SCALE); } catch (e) {}
    renderTrening();
  });
  const ro = !!s0.led && !LIVE;                                      // trening z trenerem (P…): klient tylko ogląda, serie zapisał trener
  const open = !sessDone(cur.week, cur.day) && !ro;
  const fx = FX && exs.length > 1;
  let h = sbNote() + (fx ? '<section class="fx" id="fx" aria-label="Tryb skupienia"></section>' : '') + unoteCard(exs) + (open ? '<section class="today" id="today" aria-label="Ten trening" hidden></section><div class="wkm" id="wkm"></div>' : '') + weekBar('t') + notesCard() + readyBanner()
    + (ro ? '<section class="card ledro"><b>Trening z trenerem</b><p class="sub">Ten trening prowadził i zapisał trener. Liczy się do Twojego Postępu, ale nie do planu. Komentarze trenera znajdziesz w zakładce Trener.</p></section>' : '');
  const grps = circuitGroups(exs), gOf = o => grps.find(g => g.orders.includes(o));
  SKALL = sectionRuns(exs);
  const sks = fx ? [] : SKALL;                                      // sekcje (Rozgrzewka / Główne / Korekcyjne): nagłówki tylko w całej liście
  exs.forEach(ex => {
    const g = gOf(ex.order), i = g ? g.orders.indexOf(ex.order) : -1;
    const sk = sks.find(r => r.orders[0] === ex.order);
    if (sk) h += `<button type="button" class="sek-h" data-sek="${sk.i}" aria-expanded="true"><span class="sek-n">${esc(sk.name)}</span><span class="sek-m"></span><i class="chev" aria-hidden="true"></i></button>`;
    if (i === 0) h += `<section class="grp" data-grp="${g.id}" aria-label="Obwód ${g.id}"><div class="grp-h"><b>${g.orders.length === 2 ? 'Superseria' : 'Obwód'} ${g.id}</b><span class="grp-r"></span></div><div class="grp-now" aria-live="polite"></div>`;
    h += card(ex, g ? g.id + (i + 1) : '');
    if (g && i === g.orders.length - 1) h += '</section>';
  });
  if (s0.own && ownOn() && !sessDone(cur.week, cur.day)) h += '<button type="button" class="ghost own-add" id="own-add">+ ćwiczenie</button>';
  if (EDIT && !s0.own && open) h += '<button type="button" class="ghost own-add" id="ed-add">+ ćwiczenie</button>';
  if (EDIT && !s0.own && !ro) h += edRemoved();
  h += sessCard(s0) + helpCard() + (fx ? '<div class="fx-nav" id="fx-nav"></div>' : '');
  $('#main').innerHTML = h;
  $('#main').classList.toggle('ro', ro);
  CIRC = grps; SKS = sks; bind(exs, s0);
  grps.forEach(g => grpDraw(g.id));
  bindNotes();
  const oa = $('#own-add'); if (oa) oa.onclick = () => openOwn(units(PLAN).find(u => u.week === cur.week && u.day === cur.day));
  const ea = $('#ed-add'); if (ea) ea.onclick = openAdd;
  document.querySelectorAll('[data-undel]').forEach(b => b.onclick = () => edUndel(+b.dataset.undel));
  vqMarks();
  bindFold(exs);
  sekBind();
  stickDraw();
  refreshStats();
  bindWeekBar();
  tipDraw();
  const sb = $('#sb-ok'); if (sb) sb.onclick = () => { try { localStorage.setItem(SBK, '1'); } catch (e) {} sb.closest('.sbnote').remove(); };
  $('#go-dysp').onclick = () => { TAB = 'dysp'; render(); window.scrollTo(0, 0); };
  // „⋯” jednostki w górnym pasku: rzadkie akcje całego treningu
  const foldAll = () => { let n = 0; exs.forEach(ex => { if (cardDone(ex.order) && !document.querySelector(`.card[data-card="${ex.order}"]`).classList.contains('fold')) { setFold(ex.order, true); n++; } });
    SKS.forEach(r => { if (sekDone(r) && !sekShut(r)) { sekSet(r, true); n++; } }); toast(n ? 'Zwinięto: ' + n + '.' : 'Brak zrobionych do zwinięcia.'); };
  const um = $('#umore'); if (um) um.onclick = () => {
    openSheet(`<h2 id="sheet-t">${esc(s0.title || cur.day)}</h2><p class="sub">Więcej akcji</p>
      <div class="opts act">
        ${open ? '<button type="button" class="opt" id="cut"><i aria-hidden="true">⏱</i>Skróć trening<small>gdy brakuje czasu</small></button>' : ''}
        ${fx ? '' : '<button type="button" class="opt" id="fold-all"><i aria-hidden="true">▴</i>Zwiń zrobione</button>'}
        ${calOk(unitList().find(x => x.week === cur.week && x.day === cur.day)) ? `<button type="button" class="opt" id="u-cal"><i aria-hidden="true">${CAL_SVG}</i>Dodaj do kalendarza<small>Google, iPhone</small></button>` : ''}
        ${ordOk(s0) ? '<button type="button" class="opt" id="u-ord"><i aria-hidden="true">⇅</i>Kolejność i nazwy<small>przesuń ćwiczenie, popraw nazwę</small></button>' : ''}
        ${LIVE ? '<button type="button" class="opt" id="u-new"><i aria-hidden="true">＋</i>Nowa jednostka<small>jak ostatnio, z szablonu albo pusta</small></button>' : ''}
        ${LIVE && exs.length && !exs[0].own ? '<button type="button" class="opt" id="u-tpl"><i aria-hidden="true">⧉</i>Zapisz jako szablon<small>ćwiczenia, serie, powt. (bez kg)</small></button>' : ''}
        ${LIVE ? `<a class="opt" id="u-exit" href="${esc($('#live-back').href)}"><i aria-hidden="true">✕</i>Wyjdź z prowadzenia<small>wracasz do panelu, zapisy zostają</small></a>` : ''}
        <button type="button" class="opt" id="fx-sw"><i aria-hidden="true">${fx ? '☰' : '▣'}</i>${fx ? 'Cała lista' : 'Tryb skupienia'}<small>${fx ? 'wszystkie ćwiczenia' : 'jedno ćwiczenie na ekranie'}</small></button>
        ${open && unitEntries().length ? '<button type="button" class="opt warnopt" id="u-reset"><i aria-hidden="true">↺</i>Wyczyść trening<small>od zera</small></button>' : ''}
      </div>
      <button type="button" class="btn" data-close>Zamknij</button>`);
    const ct = $('#cut'); if (ct) ct.onclick = () => { closeSheet(); openCut(); };
    const fa = $('#fold-all'); if (fa) fa.onclick = () => { closeSheet(); foldAll(); };
    $('#fx-sw').onclick = () => { closeSheet(); fxSet(!fx); };
    const uc = $('#u-cal'); if (uc) uc.onclick = () => { const l = unitList(), u = l.find(x => x.week === cur.week && x.day === cur.day), m = mondayOf(u.date);
      openCal(u, l.filter(x => calOk(x) && x.date >= m && x.date <= addDays(m, 6))); };
    const ur = $('#u-reset'); if (ur) ur.onclick = () => openReset(s0);
    const un = $('#u-new'); if (un) un.onclick = () => openNoPlan(false);
    const uo = $('#u-ord'); if (uo) uo.onclick = () => { closeSheet(); openOrder(); };
    const ut = $('#u-tpl'); if (ut) ut.onclick = () => openTplSave(s0);
  };
}
function rxPro(ex){
  const hasKg = typeof ex.kg === 'number', z = plateZone(ex.pct);
  return `${ex.sets}×${esc(ex.reps)}` + (ex.kg !== '' ? ' · ' + (typeof ex.kg === 'number' ? `<button type="button" class="kgb" data-plates="${ex.order}" aria-label="Talerze na ${esc(fmtKg(ex.kg))} kg">${esc(fmtKg(ex.kg))} kg</button>` : `<b>${esc(fmtKg(ex.kg))}</b>`) : '') +
         (ex.pct !== null ? ` <span class="badge">${z ? `<i class="zone ${z}" aria-hidden="true"></i>` : ''}${Math.round(ex.pct * 1000) / 10}%</span>` : '') +
         (isOly(ex) ? maxToday(ex) : ex.rpe === '' ? '' : SCALE === 'RIR' ? ` · RIR ≥${rirMin(ex.rpe)}` : ` · RPE ≤${esc(fmtKg(ex.rpe))}`);
}
/* ---------- boje: sufit dnia (plan + sufit_oly × 1RM; słaba dyspozycja dnia → plan) ---------- */
const dayOf = v => /T/.test(String(v)) ? localDate(new Date(v)) : String(v || '').slice(0, 10);
/** dzisiejsza dyspozycja „Uwaga” / „Zmęczenie” → tekst do propozycji; inaczej '' */
function weakToday(){
  const r = ((DATA && DATA.readiness) || []).filter(x => dayOf(x.data) === localDate()).pop();
  return r && /uwaga|zmęcz/i.test(r.werdykt || '') ? String(r.werdykt).toLowerCase() : '';
}
function capOf(ex){
  const why = weakToday(), kg = isNum(ex.kg) ? ex.kg : NaN;
  return { cap: olyCap(kg, ex.pct, OLY_CEIL, !!why), one: kg > 0 && ex.pct > 0 ? kg / ex.pct : 0, weak: !!why, why };
}
/** „max dziś” w recepcie; po pierwszym 🟡 / 🔴 / ✖ szare z dopiskiem „zablokowane” (updateSug przełącza klasę lock) */
const maxToday = ex => { const c = capOf(ex).cap; return c ? `<span class="mxd" data-mx="${ex.order}"> · max dziś <b>${fmtKg(c)} kg</b><small> · zablokowane</small></span>` : ''; };
const lightsHtml = q => `<span class="lights" aria-hidden="true">${[...(RATE[q] ? RATE[q].lights : 'ooo')].map(c => `<i class="${c}"></i>`).join('')}</span>`;
const RATE_HINT = { L: '3 białe', S: '2 białe, 1 czerwone', W: '1 białe, 2 czerwone', X: '3 czerwone' };
const rateHtml = (cur, rpe) => `<div class="rate" role="group" aria-label="Ocena podejścia">` +
  ['L', 'S', 'W', 'X'].map(q => `<button type="button" data-q="${q}" aria-pressed="${cur === q}">${lightsHtml(q)}<b>${RATE[q].label}</b><small>${RATE_HINT[q]}</small></button>`).join('') +
  (cur && cur !== 'X' ? fineHtml(cur, rpe, true, true) : '') + (cur ? '<button type="button" class="rclr" data-q="">Wyczyść ocenę</button>' : '') + '</div>';
/**
 * propozycja ciężaru pod ostatnio ocenionym podejściem (lib sugOly); fresh = właśnie zapisana ocena:
 * po zablokowaniu sufitu (🟡 / 🔴 / ✖) niezrobione serie bez wpisanego ciężaru dostają propozycję (kg z planu) jako domyślne
 */
function updateSug(ex, fresh){
  if (!isOly(ex)) return;
  const o = ex.order;
  document.querySelectorAll(`.sug[data-o="${o}"]`).forEach(x => x.remove());
  const rows = workRows(o), plan = isNum(ex.kg) && ex.kg > 0 ? ex.kg : null;
  const model = rows.map(r => ({ kg: num(fv(r.querySelector('.kg'))), rate: r.dataset.rate || '', done: !!r.dataset.st, rpe: num(r.dataset.rpe) }));
  const lock = !!plan && olyLocked(model);
  document.querySelectorAll(`.mxd[data-mx="${o}"]`).forEach(m => { m.classList.toggle('lock', lock); m.setAttribute('aria-label', lock ? 'max dziś zablokowane, sufit = plan' : ''); if (!lock) m.removeAttribute('aria-label'); });
  let i = -1; model.forEach((m, j) => { if (m.done && m.rate) i = j; });
  const s = i < 0 || !isNum(model[i].kg) ? null : sugOly(model, i, Object.assign(capOf(ex), { plan, simple: SIMPLE }));
  if (!s || s.drop && document.querySelector(`.set[data-o="${o}"][data-k="d"]`)) return;   // drop set już dodany
  const todo = rows.filter(r => !r.dataset.st);
  if (fresh && s.lock) { todo.forEach(r => { const x = r.querySelector('.kg'); if (x && x.value.trim() === '') setPh(x, fmtKg(s.kg)); }); placeStep(o); }
  const at = rows[i].nextElementSibling && rows[i].nextElementSibling.classList.contains('rate') ? rows[i].nextElementSibling : rows[i];
  const need = !s.drop && todo.some(r => num(fv(r.querySelector('.kg'))) !== s.kg);
  at.insertAdjacentHTML('afterend', `<div class="sug ${s.lvl}" data-o="${o}" role="status"><span>${esc(s.txt)}</span>` +
    (s.drop ? `<button type="button" class="btn sm" data-dropkg="${s.kg}">+ drop set ${fmtKg(s.kg)} kg</button>`
      : need ? `<button type="button" class="btn sm" data-setkg="${s.kg}">Ustaw ${fmtKg(s.kg)} kg</button>` : '') + '</div>');
  const b = document.querySelector(`.sug[data-o="${o}"] [data-setkg]`);
  if (b) b.onclick = () => {
    let n = 0;
    todo.forEach(r => { r.querySelector('.kg').value = fmtKg(s.kg); n++; });
    toast('Ustawiono ' + fmtKg(s.kg) + ' kg w ' + n + ' ' + plural(n, 'serii', 'seriach', 'seriach') + '.');
    placeStep(o); updateSug(ex);
  };
  const d = document.querySelector(`.sug[data-o="${o}"] [data-dropkg]`), add = document.querySelector(`[data-drop="${o}"]`);
  if (d) d.onclick = () => {
    if (!add) return;
    add.click();
    const ds = document.querySelectorAll(`.set[data-o="${o}"][data-k="d"]`), x = ds.length && ds[ds.length - 1].querySelector('.kg');
    if (x) { setPh(x, fmtKg(s.kg)); x.focus(); }
    updateSug(ex);
  };
}
/** „Ostatnio: 105 kg × 5 · RPE 9” (PROSTY: słownie) – z poprzedniej jednostki z tym ćwiczeniem */
function lastLine(ex){
  const t = lastTop(DATA ? DATA.logs : [], ex.name, cur.week, cur.day);
  if (!t) return '';
  const kg = typeof t.kg === 'number' ? fmtKg(t.kg) + ' kg' : esc(t.kg);
  const eff = effTxt(ex, t);
  return `<button type="button" class="last" data-hist="${ex.order}" aria-label="Historia ćwiczenia ${esc(ex.name)}"><span>Ostatnio: ${kg} × ${esc(t.reps)}${eff ? ' · ' + eff : ''}</span></button>`;
}
/** wysiłek serii słownie: ocena podejścia w bojach, PROSTY słownie, PRO jako RPE albo RIR wg przełącznika */
function effTxt(ex, t){
  return isOly(ex) && RATE[t.ocena] ? RATE[t.ocena].label : blank(t.rpe) ? '' : SIMPLE ? (EFF[lightOf(t.rpe)] || { label: '' }).label
    : SCALE === 'RIR' ? 'RIR ' + fmtKg(rirOfRpe(t.rpe)) : 'RPE ' + fmtKg(t.rpe);
}
/** okno „Historia”: wykres siły (jak Postęp → Siła) i 5 ostatnich jednostek z tym ćwiczeniem, bez bieżącej */
function openHist(ex){
  const logs = (DATA && DATA.logs) || [], dates = unitDays(), hist = exHistory(logs, ex.name, cur.week, cur.day, 5, dates);
  if (!hist.length) return;
  const nm = String(ex.name).trim().toLowerCase(), oly = isOly(ex), unit = timeUnit(ex.reps), kgT = v => typeof v === 'number' ? fmtKg(v) : esc(v);
  // punkty wykresu z całej wcześniejszej historii (rekord = lepszy od wszystkiego przed nim), pokazane ostatnie 5
  const sets = doneSets(logs.filter(l => !(String(l.tydzien) === String(cur.week) && String(l.jednostka) === String(cur.day))), PLAN, dates)
    .filter(s => s.name.trim().toLowerCase() === nm).map(s => Object.assign({}, s, { name: nm }));
  const all = unit ? [] : strengthSeries(sets, nm), ser = all.slice(-5), pr = {}; all.forEach(p => { if (p.pr) pr[p.date] = 1; });
  const rows = hist.map(u => `<div class="hx-r"><div><span>${pr[u.date] ? '<i class="key pr"></i> ' : ''}${u.date ? weekday(u.date) + ' ' + ddmm(u.date) : esc(u.day)}</span>
      <small>${u.runs.map(r => kgT(r.kg) + ' × ' + r.reps.map(esc).join(' · ')).join(' &nbsp; ')}${unit ? ' ' + unit : ''}</small></div>
      ${u.top ? `<b>${kgT(u.top.kg)}${typeof u.top.kg === 'number' ? ' kg' : ''} × ${esc(u.top.reps)}${unit ? ' ' + unit : ''}<br><i>${esc(effTxt(ex, u.top))}</i></b>` : '<b>–</b>'}</div>`).join('');
  openSheet(`<h2 id="sheet-t">Historia</h2><p class="sub">${esc(ex.name)} · ${hist.length === 1 ? 'ostatni trening' : 'ostatnie ' + hist.length + ' ' + plural(hist.length, 'trening', 'treningi', 'treningów')}</p>
    ${ser.length > 1 ? `<div><div class="dn-s">${oly ? 'Najlepsze zaliczone (kg)' : 'Siła (e1RM, kg)'}</div>${chartLine(ser, { unit: 'kg', label: (oly ? 'Najlepsze zaliczone kg: ' : 'e1RM: ') + ex.name })}
      <p class="sub" style="margin:0"><i class="key pr"></i> rekord${oly ? '' : ' · e1RM liczone z ciężaru, powtórzeń i zapasu'}</p></div>` : ''}
    <div>${rows}</div><button type="button" class="btn" data-close>Zamknij</button>`);
}
function rxSimple(ex){
  const n = ex.sets, reps = String(ex.reps).trim(), r = parseInt(reps);
  const range = reps.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  const repTxt = /^\d+$/.test(reps) ? `${r} ${plural(r, 'powtórzenie', 'powtórzenia', 'powtórzeń')}`
    : range ? `${range[1]}–${range[2]} ${plural(+range[2], 'powtórzenie', 'powtórzenia', 'powtórzeń')}` : esc(reps);
  return `${n} ${plural(n, 'seria', 'serie', 'serii')} po ${repTxt}` +
         (ex.kg !== '' ? ' · ' + (typeof ex.kg === 'number' ? `<button type="button" class="kgb" data-plates="${ex.order}" aria-label="Talerze na ${esc(fmtKg(ex.kg))} kg">${esc(fmtKg(ex.kg))} kg</button>` : `<b>${esc(fmtKg(ex.kg))}</b>`) : '') + (isOly(ex) ? maxToday(ex) : '');
}
function hintSimple(ex){
  if (typeof ex.rpe !== 'number' || ex.rpe >= 10) return '';
  const rir = Math.max(1, Math.round(10 - ex.rpe));
  return `<div class="hint">Nie do upadku – zostaw ok. ${rir} ${plural(rir, 'powtórzenie', 'powtórzenia', 'powtórzeń')} w zapasie.</div>`;
}
/* ---------- serie: robocze (p), rozgrzewka (w: R1…), dodatkowe (x: > serii z planu), drop set (d: D1…) ---------- */
function allowedExtra(ex){
  if (ex.skip) return 0;                                                      // skrócone: bez dopisywania (numer serii wszedłby w plan)
  if (isEmom(ex)) return Math.max(0, SETS_MAX - ex.sets);                     // EMOM: rund tyle, ile zrobiono (do 40 serii)
  return (ex.extra !== null && ex.extra !== undefined && ex.extra !== '') ? (Number(ex.extra) || 0) : (Number(EXTRA_DEF) || 0);
}
/* ---------- pominięte / skrócone ćwiczenie (Log: seria 0, typ SKIP, uwagi = „skrócone do 2 z 4 serii · powód” albo powód) ---------- */
function skipOf(ex){ const l = exLogs(ex)['0']; return l && /SKIP/.test(l.typ || '') ? parseSkip(l.uwagi) : null; }
/** ćwiczenie z naniesionym pominięciem: sets = do ilu skrócone (zrobione serie zostają), planSets = z planu */
function withSkip(ex){
  const k = skipOf(ex); if (!k) return ex;
  const top = Math.max(0, ...Object.keys(exLogs(ex)).filter(x => /^\d+$/.test(x) && +x >= 1 && +x <= ex.sets).map(Number));
  return Object.assign({}, ex, { skip: k, planSets: ex.sets, sets: Math.max(k.to, top) });
}
function saveSkip(ex, to, why){
  const s0 = curExs()[0] || {}, from = ex.planSets || ex.sets;
  const p = { week: cur.week, day: cur.day, date: s0.date, order: ex.order, name: ex.name, set: 0, kg: '', reps: '', rpe: '', vbt: '', vbtPeak: '', height: '', path: '',
    done: false, video: '', typ: 'SKIP', ocena: '', swap: swapText(ex.swap), note: skipText({ to, from, why }) };
  markStart(); putLocal(ex, p);
  send('logSet', p).catch(() => {});
}
function unSkip(ex){
  Object.keys(LOGS).forEach(k => { if (k.endsWith(lid(ex, 0))) delete LOGS[k]; });
  send('deleteSet', { week: cur.week, day: cur.day, order: ex.order, set: 0 }).catch(() => {});
}
/** zapisane wpisy bieżącej jednostki (serie, rozgrzewki, dropy, pominięcia): [{order, set}] bez powtórzeń */
function unitEntries(){
  const out = {}, w = String(cur.week), d = String(cur.day);
  Object.keys(LOGS).forEach(k => {
    const p = k.split('|'), l = LOGS[k];
    if (p.length < 5 || p[1] !== w || p[2] !== d || !l || l.deleted) return;
    out[p[3] + '|' + p[4]] = { order: +p[3], set: p[4] };
  });
  return Object.values(out);
}
/** „Wyczyść trening” (⋯ w górnym pasku, tylko przed „Zakończ i zapisz”): drugie dotknięcie usuwa wszystkie wpisy jednostki i czas */
function openReset(s0){
  const es = unitEntries(), skips = es.filter(e => String(e.set) === '0').length, sets = es.length - skips;
  openSheet(`<h2 id="sheet-t">Wyczyścić trening?</h2>
    <p class="sub">${esc(s0.title || cur.day)}: usunę ${sets} ${plural(sets, 'zapisaną serię', 'zapisane serie', 'zapisanych serii')}${skips ? ' i ' + skips + ' ' + plural(skips, 'pominięcie', 'pominięcia', 'pominięć') : ''}, także z arkusza trenera, i wyzeruję czas. Filmy zostają na Dysku.</p>
    <button type="button" class="btn bad" id="ur-go">Wyczyść trening</button>
    <button type="button" class="btn wide" data-close>Anuluj</button>`);
  const go = $('#ur-go');
  go.onclick = () => {
    if (!go.dataset.arm) { go.dataset.arm = '1'; go.textContent = 'Na pewno? Dotknij jeszcze raz'; return; }
    closeSheet(); resetUnit();
  };
}
function resetUnit(){
  const es = unitEntries(), w = String(cur.week), d = String(cur.day);
  Object.keys(LOGS).forEach(k => { const p = k.split('|'); if (p[1] === w && p[2] === d) delete LOGS[k]; });
  es.forEach(e => send('deleteSet', { week: cur.week, day: cur.day, order: e.order, set: e.set }).catch(() => {}));
  const m = tGet(); delete m[skey()]; delete m['r|' + skey()]; tSet(m);
  stopRest(); wake(false);
  renderTrening(); window.scrollTo(0, 0);
  toast('Trening wyczyszczony. Możesz zacząć od nowa.');
}
/** „Pomiń”: opcjonalne (B) od razu, główne i korekcyjne z powodem (trener widzi je w Przeglądzie) */
function openSkip(ex){
  const done = work(ex.order).filter(r => r.dataset.st).length;
  if (ex.prio === 'B') { saveSkip(ex, done, ''); toast('Pominięto: ' + ex.name + '.'); renderTrening(); return; }
  let why = '';
  openSheet(`<h2 id="sheet-t">Pomiń ćwiczenie</h2><p class="sub">${esc(ex.name)} · ${ex.prio === 'K' ? 'korekcyjne' : 'główne'}: trener zobaczy powód.</p>
    <div class="opts why" role="group" aria-label="Powód">${SKIP_WHY.map(w => `<button type="button" class="opt" data-why="${w}">${w[0].toUpperCase() + w.slice(1)}</button>`).join('')}</div>
    <label class="fl">Opis (opcjonalnie)<input id="sk-txt" maxlength="120" placeholder="np. zajęty sprzęt" autocomplete="off"></label>
    <p class="hint" id="sk-hint" hidden>Ból: na końcu treningu zaznacz miejsce i oceń ból 0–10 w podsumowaniu.</p>
    <button type="button" class="btn p" id="sk-ok" disabled>${done ? 'Zakończ na ' + done + ' ' + plural(done, 'serii', 'seriach', 'seriach') : 'Pomiń'}</button>
    <button type="button" class="btn" data-close>Anuluj</button>`);
  const upd = () => { document.querySelectorAll('#sheet [data-why]').forEach(b => b.setAttribute('aria-pressed', b.dataset.why === why)); $('#sk-hint').hidden = why !== 'ból'; $('#sk-ok').disabled = !why; };
  document.querySelectorAll('#sheet [data-why]').forEach(b => b.onclick = () => { why = b.dataset.why; upd(); });
  $('#sk-ok').onclick = () => {
    const t = $('#sk-txt').value.trim().replace(/\s+/g, ' ');
    saveSkip(ex, done, why === 'inne' && t ? t : why + (t ? ': ' + t : '')); closeSheet();
    toast((done ? 'Zakończono: ' : 'Pominięto: ') + ex.name + '.'); renderTrening();
  };
  upd();
}
/** „Skróć trening”: ile minut zostało → cięcia wg planu (ciecie, serie_min), zatwierdzane jednym dotknięciem */
function openCut(){
  const exs = curExs(), base = exs.map(ex => ({ order: ex.order, name: ex.name, prio: ex.prio, sets: ex.sets, cut: ex.cut, setsMin: ex.setsMin,
    done: work(ex.order).filter(r => r.dataset.st).length, skip: !!ex.skip && !ex.sets }));
  const need = cutPlan(base, 999).need;
  openSheet(`<h2 id="sheet-t">Skróć trening</h2><p class="sub">Do końca zostało ok. ${need} min (seria ok. ${SET_SEC} s + przerwa). Ile masz czasu?</p>
    <div class="seg" role="group" aria-label="Szybki wybór">${[15, 30, 45].map(m => `<button type="button" data-min="${m}">${m} min</button>`).join('')}</div>
    <label class="fl">Minuty<input id="ct-min" inputmode="numeric" placeholder="np. 20"></label>
    <div id="ct-out" aria-live="polite"></div>
    <button type="button" class="btn p" id="ct-ok" disabled>Zatwierdź cięcia</button>
    <button type="button" class="btn" data-close>Anuluj</button>`);
  let plan = null;
  const draw = () => {
    const m = num($('#ct-min').value);
    plan = isNum(m) && m >= 0 ? cutPlan(base, m) : null;
    document.querySelectorAll('#sheet [data-min]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.min === m)));
    $('#ct-out').innerHTML = !plan ? '' : !plan.cuts.length ? `<p class="sub">${plan.fits ? 'Zmieścisz się bez cięć.' : 'Plan nie ma ćwiczeń do cięcia (główne i korekcyjne bez „ciecie” zostają). Pomiń je ręcznie, jeśli musisz.'}</p>`
      : `<ul class="ct-l">${plan.cuts.map(c => `<li><b>${esc(c.name)}</b> ${c.to ? `${c.from} → ${c.to} ${plural(c.to, 'seria', 'serie', 'serii')}` : 'pomiń'}</li>`).join('')}</ul>
         <p class="sub">Zostanie ok. ${plan.left} min${plan.fits ? '.' : ' — nadal więcej, niż masz.'}</p>`;
    $('#ct-ok').disabled = !plan || !plan.cuts.length;
  };
  $('#ct-min').oninput = draw;
  document.querySelectorAll('#sheet [data-min]').forEach(b => b.onclick = () => { $('#ct-min').value = b.dataset.min; draw(); });
  $('#ct-ok').onclick = () => {
    plan.cuts.forEach(c => saveSkip(exs.find(e => e.order === c.order), c.to, 'brak czasu'));
    closeSheet(); toast('Skrócono: ' + plan.cuts.length + ' ' + plural(plan.cuts.length, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń') + '.'); renderTrening();
  };
}
const plannedDrops = ex => Number(ex.drop) || 0;
/* ---------- tryb trenera: notatka do ćwiczenia i zmiana planu w trakcie treningu ----------
 * Notatka (liveNote) siedzi w jednym wierszu serii ćwiczenia (lib liveNoteRow = liveNoteRow_ w Code.gs): „tylko ja” → Log.notatka_trenera
 * (klient jej nie dostaje), „dla klienta” → Log.komentarz_trenera (zakładka Trener u klienta). LN = zapisane w tej wizycie / w kolejce,
 * TND = niezapisany tekst i przełącznik (tylko w pamięci strony, przetrwa przerysowanie karty).
 */
let LN = {};
const TND = {};
const lnKey = ex => [cur.week, cur.day, ex.order].join('|');
function liveNoteOf(ex){
  const k = lnKey(ex); if (TND[k]) return TND[k];
  if (LN[k]) return LN[k];
  const rows = Object.values(exLogs(ex)).filter(l => l && !l.deleted).map(l => ({ seria: String(l.id).split('|')[4], notatka_trenera: l.notatka_trenera, komentarz_trenera: l.komentarz_trenera }));
  const i = TL.liveNoteRow(rows), r = i >= 0 ? rows[i] : {}, priv = String(r.notatka_trenera || '').trim(), pub = String(r.komentarz_trenera || '').trim();
  return { text: priv || pub, pub: !priv && !!pub };
}
function liveNoteBox(ex){
  const n = liveNoteOf(ex);
  return `<div class="tnote" data-tn="${ex.order}"><div class="tn-h"><b>Notatka trenera</b><span class="seg2" role="group" aria-label="Kto widzi notatkę">` +
    `<button type="button" data-tnp="0" aria-pressed="${!n.pub}">🔒 tylko ja</button><button type="button" data-tnp="1" aria-pressed="${!!n.pub}">👁 dla klienta</button></span></div>` +
    `<textarea rows="2" maxlength="600" aria-label="Notatka trenera: ${esc(ex.name)}" placeholder="np. kolana uciekają w 5. powt.">${esc(n.text)}</textarea>` +
    `<div class="tn-f"><small class="tn-s" aria-live="polite">${n.pub ? 'Klient zobaczy ją w zakładce Trener.' : 'Widzisz ją tylko Ty (arkusz i ten tryb).'}</small><button type="button" class="btn sm" data-tns>Zapisz</button></div></div>`;
}
function liveNoteSave(box){
  const ex = curExs().find(x => x.order === +box.dataset.tn); if (!ex) return;
  const k = lnKey(ex), text = box.querySelector('textarea').value.trim(), pub = box.querySelector('[data-tnp="1"]').getAttribute('aria-pressed') === 'true';
  if (!Object.values(exLogs(ex)).some(l => l && !l.deleted && String(l.id).split('|')[4] !== '0')) { toast('Zapisz najpierw jedną serię – notatka trafi do niej.'); return; }
  LN[k] = { text, pub }; delete TND[k];
  send('liveNote', { week: cur.week, day: cur.day, order: ex.order, text, pub }).catch(() => {});
  box.querySelector('.tn-s').textContent = !text ? 'Notatka usunięta.' : pub ? 'Zapisano ✓ · klient zobaczy ją w zakładce Trener.' : 'Zapisano ✓ · tylko dla Ciebie.';
}
/** odpowiedź trPlan → wiersze planu w danych aplikacji i pamięci telefonu */
function tpApply(r){
  const F = { sets: 'sets', reps: 'reps', kg: 'kg', pct: 'pct', rpe: 'rpe', note: 'note', unote: 'unote', prio: 'prio', circuit: 'circuit' };
  (r.rows || []).forEach(x => { const row = DATA.plan.find(p => p.week === x.week && p.day === x.day && p.order === x.order); if (row) Object.keys(x.f).forEach(f => { if (F[f]) row[F[f]] = x.f[f]; }); });
  PLAN = DATA.plan; try { localStorage.setItem(DK, JSON.stringify(DATA)); } catch (e) {}
}
/** tryb trenera: „− seria” / „+ seria” zmienia liczbę serii roboczych w planie (trPlan, tylko ta jednostka) */
const liveSetsOk = ex => LIVE && !ex.own && !ex.skip && !isEmom(ex);
const liveSetsMin = ex => Math.max(1, ...Object.keys(exLogs(ex)).filter(k => /^\d+$/.test(k) && +k > 0 && +k <= ex.sets).map(Number));
const liveSetsBtns = ex => `<button type="button" class="ghost" data-tsets="${ex.order}" data-d="-1" ${ex.sets <= liveSetsMin(ex) ? 'disabled' : ''} aria-label="Usuń serię roboczą: ${esc(ex.name)}">− seria</button>` +
  `<button type="button" class="ghost" data-tsets="${ex.order}" data-d="1" ${ex.sets >= SETS_MAX ? 'disabled' : ''} aria-label="Dodaj serię roboczą: ${esc(ex.name)}">+ seria</button>`;
function liveSets(b){
  const ex = curExs().find(x => x.order === +b.dataset.tsets); if (!ex) return;
  const n = ex.sets + Number(b.dataset.d);
  if (n < liveSetsMin(ex) || n > SETS_MAX) return;
  if (navigator.onLine === false) { toast('Bez sieci liczby serii nie zmienisz. Serie zapisują się dalej.'); return; }
  document.querySelectorAll('[data-tsets="' + ex.order + '"]').forEach(x => { x.disabled = true; });
  call('trPlan', LIVE, { week: cur.week, day: cur.day, live: true, next: false, ex: [{ order: ex.order, sets: String(n) }] }).then(r => {
    tpApply(r); renderTrening(); toast(ex.name + ': ' + n + ' ' + plural(n, 'seria', 'serie', 'serii') + ' w planie.');
  }).catch(e => { toast(e.message); renderTrening(); });
}
/** „✎ zmień plan”: serie, powt., kg i RPE max ćwiczenia w planie (trPlan z live: bieżąca jednostka może być zaczęta), opcjonalnie też kolejne tygodnie */
const tpPrev = ex => { const a = curExs(), i = a.findIndex(x => x.order === ex.order); return i > 0 && !isEmom(a[i - 1]) && !isEmom(ex) ? a[i - 1] : null; };
const tpLinked = ex => { const p = tpPrev(ex); return !!(p && ex.circuit && p.circuit === ex.circuit); };
function openTPlan(order){
  const ex = curExs().find(x => x.order === order); if (!ex) return;
  const v = x => x === null || x === undefined ? '' : esc(String(typeof x === 'number' ? fmtKg(x) : x));
  openSheet(`<h2 id="sheet-t">Zmień plan</h2><p class="sub">${esc(ex.name)} · ${esc(ex.title || cur.day)}</p>
    <div class="ed-3"><label class="fl">Serie<input id="tp-sets" inputmode="numeric" value="${v(ex.sets)}"></label><label class="fl"><span id="tp-rl">Powt.</span><input id="tp-reps" value="${v(secOf(ex.reps))}"></label><label class="fl">Kg<input id="tp-kg" inputmode="decimal" value="${isBW(ex.kg) ? '' : v(ex.kg)}"></label></div>
    ${kindSeg(isBW(ex.kg), timeUnit(ex.reps) === 's')}
    ${prioSeg(ex.prio)}
    ${tpPrev(ex) ? linkBtn(tpPrev(ex), tpLinked(ex)) : ''}
    <label class="fl">RPE max (puste = bez)<input id="tp-rpe" inputmode="decimal" value="${v(ex.rpe)}"></label>
    <label class="chk"><input type="checkbox" id="tp-next"> Także kolejne tygodnie tej jednostki (kg o tę samą różnicę)</label>
    <p class="hint" id="tp-err" role="alert" hidden></p>
    <button type="button" class="btn p" id="tp-ok">Zapisz w planie</button>
    <button type="button" class="btn" data-close>Anuluj</button>`);
  const kind = bindKind($('#tp-kg'), $('#tp-reps'), $('#tp-rl'));
  kind.set(isBW(ex.kg), timeUnit(ex.reps) === 's');
  const pri = bindPrio(ex.prio, tpLinked(ex));
  $('#tp-ok').onclick = () => {
    const err = t => { const e = $('#tp-err'); e.textContent = t; e.hidden = false; };
    const ch = { order: ex.order }, val = { sets: $('#tp-sets').value.trim(), reps: kind.reps(), kg: kind.kg(), rpe: $('#tp-rpe').value.trim(), prio: pri.prio() };
    Object.keys(val).forEach(f => { const o = ex[f] === null || ex[f] === undefined ? '' : String(typeof ex[f] === 'number' ? fmtKg(ex[f]) : ex[f]); if (val[f] !== o) ch[f] = val[f]; });
    // obwód: zmiana połączenia z poprzednim przestawia litery tego ćwiczenia i sąsiadów (tylko ta jednostka)
    const lk = tpPrev(ex) && pri.link() !== tpLinked(ex) ? linkChanges(curExs(), ex.order, pri.link()) : [];
    const exs = [ch];
    lk.forEach(x => { const o = exs.find(y => y.order === x.order); if (o) o.circuit = x.circuit; else exs.push(x); });
    if (Object.keys(ch).length < 2 && exs.length < 2 && !$('#tp-next').checked) { closeSheet(); return; }
    if (navigator.onLine === false) return err('Bez sieci planu nie zmienisz. Serie zapisują się dalej.');
    const b = $('#tp-ok'); b.disabled = true; b.textContent = 'Zapisuję…';
    call('trPlan', LIVE, { week: cur.week, day: cur.day, live: true, next: $('#tp-next').checked, ex: exs.filter(x => Object.keys(x).length > 1) }).then(r => {
      tpApply(r); closeSheet(); renderTrening();
      const w = (r.weeks || []).length; toast(!r.n ? 'Bez zmian.' : 'Plan zmieniony' + (w > 1 ? ' (ten tydzień i ' + (w - 1) + ' ' + plural(w - 1, 'kolejny', 'kolejne', 'kolejnych') + ').' : '.'));
    }).catch(e => { b.disabled = false; b.textContent = 'Zapisz w planie'; err(e.message); });
  };
}
/* ---------- „⋯ → Kolejność i nazwy” zapisanej jednostki (editUnit, 26.11.2026): trener w „Prowadź” każda jednostka, klient własny trening ----------
 * Ćwiczenie z zapisanym wpisem stoi w miejscu (id serii w Logu ma numer ćwiczenia), obwód przesuwa się w całości; tylko z siecią. */
let ORD = null;
const ordOk = s0 => !!s0 && !!(LIVE || (s0.own && ownOn()));
function openOrder(){
  const exs = PLAN.filter(r => r.week === cur.week && r.day === cur.day).sort((a, b) => a.order - b.order);
  if (!exs.length) return;
  ORD = { list: exs.map(ex => ({ order: ex.order, name: ex.name, name0: ex.name, c: isEmom(ex) ? '' : ex.circuit || '', lock: Object.keys(exLogs(ex)).length > 0,
    info: ex.sets + ' × ' + ex.reps + (ex.kg !== '' ? ' · ' + (typeof ex.kg === 'number' ? fmtKg(ex.kg) + ' kg' : ex.kg) : ''), sw: (withSwap(ex).swap || {}).to || '' })), ren: -1, pick: -1 };
  const nx = LIVE && !exs[0].own;
  openSheet(`<h2 id="sheet-t">Kolejność i nazwy</h2><p class="sub">${esc(exs[0].title || cur.day)} · ↑ ↓ przesuwa, ✎ poprawia nazwę</p>
    <div id="or-list"></div>
    ${nx ? '<label class="chk"><input type="checkbox" id="or-next"> Nową nazwę także w kolejnych tygodniach tej jednostki</label>' : ''}
    <p class="hint" id="or-err" role="alert" hidden></p>
    <button type="button" class="btn p" id="or-ok">Zapisz</button>
    <button type="button" class="btn" data-close>Anuluj</button>`);
  ordDraw();
  $('#or-ok').onclick = ordSave;
}
function ordDraw(){
  const box = $('#or-list'); if (!box) return;
  const L = ORD.list, a = L.map(e => ({ c: e.c, lock: e.lock }));
  const same = (i, j) => !!L[j] && L[i].c && L[j].c === L[i].c, size = c => L.filter(e => e.c === c).length;
  const item = (e, i) => `<div class="ow-it ord">${ORD.ren === i ? ordNameIn(i, e.name) : `<div class="ow-nm"><b>${esc(e.name)}</b>${ordRenBtn(i, e.name)}${e.lock ? '<span class="lk">🔒</span>' : ordMvBtns(a, i, false, e.name)}</div>`}
      <small>${esc(e.info)}${e.sw ? ' · dziś zamiana: ' + esc(e.sw) : ''}${e.lock ? ' · zapisane serie, zostaje na miejscu' : ''}</small></div>`;
  box.innerHTML = L.map((e, i) => (e.c && !same(i, i - 1) && size(e.c) > 1 ? `<div class="ow-grp"><div class="ow-gh"><b>${size(e.c) === 2 ? 'Superseria' : 'Obwód'} ${esc(e.c)} · na zmianę</b>${ordMvBtns(a, i, true, (size(e.c) === 2 ? 'superseria ' : 'obwód ') + e.c)}</div>` : '') +
    item(e, i) + (e.c && !same(i, i + 1) && size(e.c) > 1 ? '</div>' : '')).join('');
  ordBind(box, ORD, ordDraw);
}
/** wynik editUnit: nowe numery i nazwy w planie telefonu; zamiany, komentarze, notatki i zwinięcie idą za ćwiczeniem */
function ordApply(r){
  const rows = r.rows || [], mp = {};
  rows.forEach(x => { if (x.to !== x.order) mp[x.order] = x.to; });
  const unit = DATA.plan.filter(p => p.week === cur.week && p.day === cur.day);
  rows.forEach(x => { const row = unit.find(p => p.order === x.order); if (row) { row._to = x.to; row.name = x.name; } });
  unit.forEach(p => { if ('_to' in p) { p.order = p._to; delete p._to; } });
  if (Object.keys(mp).length) {
    const pre = cur.week + '|' + cur.day + '|', remap = m => { const out = {}; Object.keys(m).forEach(k => { const o = k.indexOf(pre) === 0 ? Number(k.slice(pre.length)) : NaN; out[o in mp ? pre + mp[o] : k] = m[k]; }); return out; };
    [[SWK, swGet], [ENK, enGet], [FK, foldGet]].forEach(([k, get]) => { try { localStorage.setItem(k, JSON.stringify(remap(get()))); } catch (e) {} });
    const t = remap(TND); Object.keys(TND).forEach(k => delete TND[k]); Object.assign(TND, t); LN = remap(LN);
  }
  PLAN = DATA.plan; try { localStorage.setItem(DK, JSON.stringify(DATA)); } catch (e) {}
}
function ordSave(){
  const err = t => { const e = $('#or-err'); e.textContent = t; e.hidden = false; };
  const L = ORD.list, orig = L.map(e => e.order).sort((x, y) => x - y), seq = L.map(e => e.order), moved = seq.some((o, k) => o !== orig[k]);
  L.forEach(e => { e.name = String(e.name).trim().replace(/\s+/g, ' ').slice(0, 80); });
  if (L.some(e => !e.name)) { ORD.ren = L.findIndex(e => !e.name); ordDraw(); return err('Wpisz nazwę ćwiczenia.'); }
  const names = L.filter(e => e.name !== e.name0).map(e => ({ order: e.order, name: e.name }));
  if (!moved && !names.length) { closeSheet(); return; }
  if (navigator.onLine === false) return err('Bez sieci kolejności ani nazw nie zmienisz. Serie zapisują się dalej.');
  const nx = $('#or-next'), b = $('#or-ok'); b.disabled = true; b.textContent = 'Zapisuję…';
  const fxo = FX && FXI !== null ? (focusSteps(curExs(), CIRC)[FXI] || {}).orders : null;
  call('editUnit', Object.assign({ week: cur.week, day: cur.day, names, next: !!(nx && nx.checked) }, moved ? { seq } : {})).then(r => {
    ordApply(r); closeSheet();
    if (fxo) { const to = ((r.rows || []).find(x => x.order === fxo[0]) || {}).to || fxo[0], ex = curExs(), i = focusSteps(ex, circuitGroups(ex)).findIndex(st => st.orders.includes(to)); if (i >= 0) { FXI = i; FXM = true; } }   // tryb skupienia: zostaje to samo ćwiczenie
    renderTrening();
    const w = (r.weeks || []).length;
    toast(moved && names.length ? 'Zapisano kolejność i nazwy.' : moved ? 'Zapisano kolejność.' : 'Zapisano nazwę' + (w ? ' (też ' + w + ' ' + plural(w, 'kolejny tydzień', 'kolejne tygodnie', 'kolejnych tygodni') + ').' : '.'));
  }).catch(e => { b.disabled = false; b.textContent = 'Zapisz'; err(e.message); });
}
if (LIVE) {
  document.body.classList.add('live');
  document.querySelectorAll('#nav [data-tab="dysp"], #nav [data-tab="trener"]').forEach(b => { b.hidden = true; });
  const lb = $('#live-back'); lb.hidden = false; lb.href = 'trener.html#k/' + encodeURIComponent(LIVE);
  $('#main').addEventListener('click', e => {
    const tp = e.target.closest('[data-tplan]'); if (tp) return openTPlan(+tp.dataset.tplan);
    const ts = e.target.closest('[data-tsets]'); if (ts) return liveSets(ts);
    const box = e.target.closest('.tnote'); if (!box) return;
    const p = e.target.closest('[data-tnp]');
    if (p) { box.querySelectorAll('[data-tnp]').forEach(x => x.setAttribute('aria-pressed', String(x === p)));
      const ex = curExs().find(x => x.order === +box.dataset.tn); if (ex) TND[lnKey(ex)] = { text: box.querySelector('textarea').value, pub: p.dataset.tnp === '1' };
      box.querySelector('.tn-s').textContent = p.dataset.tnp === '1' ? 'Klient zobaczy ją w zakładce Trener (po zapisaniu).' : 'Tylko dla Ciebie (po zapisaniu).'; return; }
    if (e.target.closest('[data-tns]')) liveNoteSave(box);
  });
  $('#main').addEventListener('input', e => {
    const box = e.target.closest('.tnote'); if (!box) return;
    const ex = curExs().find(x => x.order === +box.dataset.tn); if (!ex) return;
    TND[lnKey(ex)] = { text: e.target.value, pub: box.querySelector('[data-tnp="1"]').getAttribute('aria-pressed') === 'true' };
  });
}
function exLogs(ex){ // wpisy Logu tego ćwiczenia w bieżącej jednostce: {seria: log}, lokalne mają pierwszeństwo
  const out = {};
  for (const k in LOGS) {
    const p = String(k).split('|');
    if (p[1] !== String(cur.week) || p[2] !== String(cur.day) || p[3] !== String(ex.order)) continue;
    if (p[0] === 'local' || !out[p[4]]) out[p[4]] = LOGS[k];
  }
  Object.keys(out).forEach(k => { if (out[k].deleted) delete out[k]; });
  return out;
}
/* ---------- komentarz klienta do ćwiczenia: telefon (en_<klucz>), w Logu kolumna „uwagi” każdej serii ćwiczenia ---------- */
const ENK = 'en_' + KEY;
function enGet(){ try { return JSON.parse(localStorage.getItem(ENK) || '{}'); } catch (e) { return {}; } }
function exNote(ex){
  const m = enGet(), k = swKey(ex);
  if (k in m) return m[k];
  const l = Object.values(exLogs(ex)).find(x => !blank(x.uwagi) && !/SKIP/.test(x.typ || ''));
  return l ? String(l.uwagi) : '';
}
function setNote(ex, t){
  const m = enGet(); m[swKey(ex)] = t;
  try { localStorage.setItem(ENK, JSON.stringify(m)); } catch (e) {}
  Object.values(exLogs(ex)).forEach(l => { if (!/SKIP/.test(l.typ || '')) l.uwagi = t; });
  const saved = Object.keys(exLogs(ex)).some(k => k !== '0');
  if (saved) send('logNote', { week: cur.week, day: cur.day, order: ex.order, note: t }).catch(() => {});
  toast(saved ? 'Komentarz zapisany.' : 'Komentarz zapisze się razem z pierwszą serią.');
}
function loggedSets(ex){
  let warm = 0, extra = 0, drop = 0;
  Object.keys(exLogs(ex)).forEach(s => {
    let m;
    if ((m = /^R(\d+)$/.exec(s))) warm = Math.max(warm, +m[1]);
    else if ((m = /^D(\d+)$/.exec(s))) drop = Math.max(drop, +m[1]);
    else if (+s > ex.sets) extra = Math.max(extra, +s - ex.sets);
  });
  return { warm, extra, drop };
}
/** wysiłek serii = światło (lib EFF): PRO pokazuje liczbę RPE albo RIR, PROSTY słowo; bez światła „oceń” (RPE puste) */
function effInner(rpe, st){
  if (st === 'x') return `<i class="d x" aria-hidden="true">✕</i><small>${SIMPLE ? 'nieudana' : 'fail'}</small>`;
  const q = st ? lightOf(rpe) : '';
  if (!q) return '<i class="d" aria-hidden="true"></i><small>oceń</small>';
  const txt = SIMPLE ? EFF[q].label : SCALE === 'RIR' ? 'RIR ' + fmtKg(rirOfRpe(rpe)) : fmtKg(num(rpe));
  return `<i class="d ${EFF[q].c}" aria-hidden="true"></i><b>${esc(txt)}</b>`;
}
const effLabel = (rpe, st) => st === 'x' ? 'nieudana' : st && lightOf(rpe) ? EFF[lightOf(rpe)].label + (SIMPLE ? '' : ', RPE ' + fmtKg(num(rpe))) : 'bez oceny';
const effBtn = (rpe, st) => `<button type="button" class="ef" aria-label="Jak ciężko: ${effLabel(rpe, st)} – dotknij, aby ocenić">${effInner(rpe, st)}</button>`;
/**
 * dokładne RPE w zakresie światła (tylko PRO, przy zaznaczonym świetle); RIR = 10 − RPE.
 * wide = ćwiczenie A albo bój: przy 🟢 także 5–6,5 (lib effFine); oly = bój: dopisek, że bardzo lekko otwiera „max dziś”
 */
function fineHtml(q, rpe, wide, oly){
  const vs = effFine(q, wide);
  if (SIMPLE || !vs.length) return '';
  const rir = SCALE === 'RIR', e = EASY_RPE;
  return `<div class="fine">Dokładniej, ${rir ? 'RIR' : 'RPE'}: ${vs.map(v => `<button type="button" data-v="${v}" aria-pressed="${num(rpe) === v}">${fmtKg(rir ? 10 - v : v)}</button>`).join('')}` +
    (oly && q === 'L' ? `<small class="fe">${rir ? 'RIR ≥ ' + fmtKg(10 - e) : 'RPE ≤ ' + fmtKg(e)} = bardzo łatwo: otwiera „max dziś”</small>` : '') + '</div>';
}
/** wybór światła pod wierszem: dotknięcie = seria zapisana z tym RPE */
const effPick = (q, rpe, wide) => `<div class="efp" role="group" aria-label="Jak ciężko">` +
  ['L', 'S', 'W', 'X'].map(k => `<button type="button" data-q="${k}" aria-pressed="${q === k}"><i class="d ${EFF[k].c}" aria-hidden="true">${k === 'X' ? '✕' : ''}</i><b>${EFF[k].label}</b><small>${effHint(k, !SIMPLE && SCALE === 'RIR')}</small></button>`).join('') +
  (q && q !== 'X' ? fineHtml(q, rpe, wide) + '<button type="button" class="rclr" data-q="">Bez oceny (zostaje ✓)</button>' : '') + '</div>';
/** seria czeka w kolejce offline → pole żółte także po ponownym otwarciu */
const queued = (ex, set) => qGet().some(it => it.fn === 'logSet' && it.payload.week === cur.week && it.payload.day === cur.day && it.payload.order === ex.order && String(it.payload.set) === String(set));
const STATE_TXT = { '': 'niezapisana – dotknij: zrobiona', ok: 'zrobiona – dotknij: nieudana', x: 'nieudana – dotknij: wyczyść' };
const CAM_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h12v10H3zM15 10l6-3v10l-6-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter"/></svg>';
function rowHtml(ex, set, kind, def){
  const cls = SIMPLE ? 'simple' : '';
  const l = getLog(ex, set) || {}, d = def || {};
  // pole puste + propozycja (z planu, z poprzedniej serii, drop ~80%) jako szary placeholder; zapisana seria = wartość z Logu
  const kg = blank(l.kg) ? '' : l.kg, reps = blank(l.powt) ? '' : l.powt;
  const kgP = kind === 'p' ? ex.kg : (blank(d.kg) ? '' : d.kg);
  const repsP = kind === 'p' ? (repsDefault(ex.reps) || '') : (blank(d.reps) ? '' : d.reps);
  const fail = /FAIL/.test(l.typ || ''), st = l.wykonane !== 'TAK' ? '' : fail ? 'x' : 'ok';
  const drop = (kind === 'p' || kind === 'x') && /DROP/.test(l.typ || '');
  const phAttr = (v, lbl) => blank(v) ? ` placeholder="${lbl}" data-ph=""` : ` placeholder="${esc(fmtKg(v))}" data-ph="${esc(fmtKg(v))}"`;
  const kgIn = `<input inputmode="decimal" class="kg${blank(kgP) ? '' : ' ph'}" value="${esc(fmtKg(kg))}"${phAttr(kgP, 'kg')} aria-label="kg">`;
  const rl = repsLabel(ex.reps);                                               // ćwiczenie na czas („30 s”): w polu sekundy zamiast powtórzeń
  const repsIn = `<input inputmode="decimal" class="reps${blank(repsP) ? '' : ' ph'}" value="${esc(fmtKg(reps))}"${phAttr(repsP, rl)} data-u="${rl}" aria-label="${rl === 'powt.' ? 'powtórzenia' : rl === 'min' ? 'minuty' : 'sekundy'}">`;
  const rpe0 = st === 'ok' && isNum(num(l.rpe)) ? num(l.rpe) : '';                    // światło = widok RPE z Logu; bez wpisu brak oceny
  const rpeCell = kind === 'w' ? `<div class="lbl">${SIMPLE ? 'rozgrzewka' : 'rozgrz.'}</div>` : effBtn(rpe0, st);
  const oly = isOly(ex) && kind !== 'w', q = oly ? rateOf(l) : '';
  // kamera przy serii roboczej, dodatkowej i drop (nie przy rozgrzewce); wypełniona = jest film albo prędkość
  const has = !!l.film_link || !blank(l.vbt_ms) || !!l.sciezka;
  const camCell = kind === 'w' ? '<div></div>'
    : `<button type="button" class="cam ${has ? 'has' : ''}" aria-label="Film${SIMPLE ? '' : ' i prędkość'}: seria ${setLabel(set, kind)}${has ? ' (dodano)' : ''}">${CAM_SVG}</button>`;
  // robocze i dodatkowe: dotknięcie numeru zmienia typ serii (zwykła → drop → nieudana); boje: ocena światłami
  const num0 = !oly && (kind === 'p' || kind === 'x')
    ? `<button type="button" class="nt" aria-label="Seria ${setLabel(set, kind)}: ${fail ? 'nieudana' : drop ? 'drop' : 'zwykła'}, dotknij, aby zmienić typ">${setLabel(set, kind)}<small></small></button>`
    : `<span>${setLabel(set, kind)}</span>`;
  if (oly) return `<div class="set ${cls} oly k-${kind} ${fail ? 'fail' : ''}" data-o="${ex.order}" data-s="${set}" data-k="${kind}" data-st="${st}" data-rate="${q}" data-rpe="${esc(String(rpe0))}">
      <div class="n">${num0}</div>
      ${kgIn}
      ${repsIn}
      <button type="button" class="lt ${queued(ex, set) ? 'pend' : ''}" aria-label="Ocena: ${q ? RATE[q].label : 'brak'} – dotknij, aby ocenić">${lightsHtml(q)}<small>${q ? RATE[q].label : 'oceń'}</small></button>
      ${camCell}
    </div>`;
  return `<div class="set ${cls} k-${kind} ${fail ? 'fail' : ''} ${drop ? 't-d' : ''}" data-o="${ex.order}" data-s="${set}" data-k="${kind}" data-st="${st}" data-rpe="${esc(String(rpe0))}">
      <div class="n">${num0}</div>
      ${kgIn}
      ${repsIn}
      ${rpeCell}
      <button class="ok ${queued(ex, set) ? 'pend' : ''}" aria-label="Seria ${STATE_TXT[st]}">${st === 'x' ? '✕' : '✓'}</button>
      ${camCell}
    </div>`;
}
/** pole serii: wartość wpisana, a gdy puste — propozycja z placeholdera (z planu albo z poprzedniej serii) */
const fv = el => !el ? '' : el.value.trim() !== '' ? el.value : (el.dataset.ph || '');
const setPh = (el, v) => { v = v === undefined || v === null ? '' : String(v); el.dataset.ph = v; el.placeholder = v || (el.classList.contains('kg') ? 'kg' : el.dataset.u || 'powt.'); el.classList.toggle('ph', !!v); };
const setLabel = (set, kind) => (kind === 'w' || kind === 'd' || SIMPLE) ? set : 'S' + set;
/** proponowana rozgrzewka (lib warmupSets): tylko ćwiczenie główne (A) z liczbą kg w planie, nie na czas */
const warmPlan = ex => ex.prio !== 'A' || timeUnit(ex.reps) || (ex.skip && !ex.sets) ? []
  : window.TL.warmupSets(num(ex.kg), repsDefault(ex.reps), { bar: BAR, oly: isOly(ex), noBar: window.TL.noBar(ex.name) });
const warmTxt = w => `<span class="wu-s">${w.map(x => `<span>${x.bar ? (SIMPLE ? 'sam gryf' : 'gryf') : fmtKg(x.kg)} × ${x.reps}</span>`).join('<span class="sr"> · </span>')}</span>`;
const dropDefault = (ex, fromKg) => window.TL.dropDefault(ex.kg, fromKg);   // ~80% ostatniego ciężaru, w dół do 2,5 kg
const PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 8l6 4-6 4z" fill="currentColor"/></svg>';
const MORE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>';
/** „⋯” w nagłówku karty: rzadkie akcje (komentarz, zamiana, pominięcie) */
function openMore(ex){
  const sk = ex.skip, gone = sk && !ex.sets;
  openSheet(`<h2 id="sheet-t">${esc(ex.name)}</h2><p class="sub">Więcej akcji</p>
    <div class="opts act">
      <button type="button" class="opt" data-mnote="${ex.order}"><i aria-hidden="true">✎</i>Komentarz do ćwiczenia</button>
      ${SWAP && !gone && !ex.swap ? `<button type="button" class="opt" data-swap="${ex.order}"><i aria-hidden="true">⇄</i>Zamień ćwiczenie</button>` : ''}
      ${sk ? '' : `<button type="button" class="opt" data-skip="${ex.order}"><i aria-hidden="true">✕</i>${ex.prio === 'B' ? 'Pomiń' : 'Pomiń…<small>z powodem dla trenera</small>'}</button>`}
      ${edOn(ex) ? `<button type="button" class="opt" data-del="${ex.order}"><i aria-hidden="true">−</i>Usuń z treningu…<small>np. brak sprzętu</small></button>` : ''}
    </div>
    <button type="button" class="btn" data-close>Zamknij</button>`);
  const on = (sel, f) => { const b = $('#sheet ' + sel); if (b) b.onclick = () => { closeSheet(); f(); }; };
  on('[data-swap]', () => openSwap(ex));
  on('[data-skip]', () => openSkip(ex));
  on('[data-del]', () => openDel(ex));
  on('[data-mnote]', () => openNote(ex));
}
/** okno „Komentarz”: jeden komentarz na ćwiczenie; gdy już jest, okno go poprawia (albo usuwa), a nie dodaje kolejnego */
function openNote(ex){
  const was = exNote(ex);
  openSheet(`<h2 id="sheet-t">Komentarz</h2><p class="sub">${esc(ex.name)} · widzi go trener</p>
    <label class="fl" for="nt">${was ? 'Twój komentarz (popraw albo dopisz)' : 'Twój komentarz'}</label>
    <textarea id="nt" rows="4" maxlength="500" placeholder="np. 3×10 na TRX zamiast wyciągu">${esc(was)}</textarea>
    <button type="button" class="btn p" id="nt-ok">${was ? 'Zapisz zmiany' : 'Zapisz komentarz'}</button>
    ${was ? '<button type="button" class="btn x" id="nt-del">Usuń komentarz</button>' : ''}
    <button type="button" class="btn" data-close>Anuluj</button>`);
  const t = $('#nt'); t.focus(); try { t.setSelectionRange(t.value.length, t.value.length); } catch (e) {}
  const save = v => {
    closeSheet();
    if (v === was) return;
    setNote(ex, v);
    const box = document.querySelector(`.card[data-card="${ex.order}"] .exn`);     // karta bez przerysowania: wpisane, niezapisane serie zostają
    if (box) { box.hidden = !v; box.querySelector('.exn-x').textContent = v; }
    if (!v) toast('Komentarz usunięty.');
  };
  $('#nt-ok').onclick = () => save(t.value.trim());
  const d = $('#nt-del'); if (d) d.onclick = () => save('');
}
/** ćwiczenie bez filmu: zdjęcia (początek i koniec ruchu) i 4 kroki po polsku z free-exercise-db (domena publiczna), cw/opisy.json */
let FXD = null, FXL = null, FXE = [];   // FXE: ćwiczenia narysowanej jednostki (dla fxUpgrade)
function fxLoad(){
  if (FXD || FXL) return FXL;
  FXL = fetch('cw/opisy.json').then(r => r.ok ? r.json() : null).then(d => { FXD = d || {}; fxUpgrade(); return FXD; }).catch(() => { FXL = null; return null; });
  return FXL;
}
/** nazwy z bazy bez filmu: z serwera (row.fx), w zamianie albo własnym treningu sama nazwa */
function fxNames(ex){ return ex.swap ? [ex.name] : ex.fx && ex.fx.length ? ex.fx : (ex.infos || []).length ? [] : [ex.name]; }
function fxOf(ex){ return FXD ? fxNames(ex).filter(n => FXD[n]) : []; }
function fxBtn(ex){ return `<button type="button" class="infb" data-fx="${ex.order}" aria-label="Jak wykonać: ${esc(ex.name)} (zdjęcia i opis)">${PLAY_SVG}</button>`; }
/** opisy przyszły po narysowaniu kart: puste miejsce przy ćwiczeniu z opisem staje się przyciskiem */
function fxUpgrade(){
  document.querySelectorAll('span.infb[data-fxo]').forEach(sp => { const ex = FXE.find(e => e.order === +sp.dataset.fxo); if (!ex || !fxOf(ex).length) return;
    sp.outerHTML = fxBtn(ex); const b = document.querySelector(`[data-fx="${ex.order}"]`); if (b) b.onclick = () => openFx(ex); });
}
function openFx(ex){
  const ns = fxOf(ex);
  if (!ns.length) return;
  const one = n => { const d = FXD[n];
    return `<div class="fxe">${ns.length > 1 || n !== ex.name ? `<h3>${esc(n)}</h3>` : ''}${d.i ? `<div class="fxi">${[0, 1].map(k => `<img src="cw/${encodeURIComponent(d.i)}/${k}.jpg" alt="${k ? 'Koniec ruchu' : 'Początek ruchu'}: ${esc(n)}" width="400" height="267" loading="lazy" decoding="async">`).join('')}</div>` : ''}
      <ol class="fxk">${d.k.map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>`; };
  openSheet(`<h2 id="sheet-t">Jak wykonać</h2><p class="sub">${esc(ex.name)}</p>${ns.map(one).join('')}
    <p class="fxs">Zdjęcia i opis: free-exercise-db (domena publiczna). Film od trenera, gdy go doda, pojawi się zamiast nich.</p>
    <button type="button" class="btn" data-close>Zamknij</button>`);
  document.querySelectorAll('.fxi img').forEach(im => im.onerror = () => { const w = im.parentNode; im.remove(); if (w && !w.querySelector('img')) w.remove(); });   // bez sieci sam opis
}
/** kompleks z kilkoma filmami: lista „Jak wykonać” */
function openInf(ex){
  openSheet(`<h2 id="sheet-t">Jak wykonać</h2><p class="sub">${esc(ex.name)}</p>
    <div class="opts act">${(ex.infos || []).map(i => `<a class="opt inf" href="${esc(i.u)}" target="_blank" rel="noopener"><i aria-hidden="true">▶</i>${esc(i.n)}</a>`).join('')}</div>
    <button type="button" class="btn" data-close>Zamknij</button>`);
}
function card(ex, tag){
  const { warm, extra, drop } = loggedSets(ex), allowX = allowedExtra(ex), nd = Math.max(drop, plannedDrops(ex));
  let rows = '', allDone = true;
  for (let i = 1; i <= warm; i++) rows += rowHtml(ex, 'R' + i, 'w');
  for (let i = 1; i <= ex.sets; i++) { rows += rowHtml(ex, i, 'p'); const l = getLog(ex, i); if (!l || l.wykonane !== 'TAK') allDone = false; }
  for (let i = ex.sets + 1; i <= ex.sets + extra; i++) rows += rowHtml(ex, i, 'x');
  for (let i = 1; i <= nd; i++) rows += rowHtml(ex, 'D' + i, 'd', dropDefault(ex));
  const oly = isOly(ex), rl = repsLabel(ex.reps);
  const head = oly
    ? `<div class="set-head set ${SIMPLE ? 'simple' : ''}"><div></div><div class="lbl">kg</div><div class="lbl">powt.</div><div class="lbl hl2">ocena</div><div></div></div>`
    : SIMPLE
    ? `<div class="set-head set simple"><div class="lbl">#</div><div class="lbl">kg</div><div class="lbl">${rl}</div><div class="lbl">jak ciężko?</div><div></div><div></div></div>`
    : `<div class="set-head set"><div></div><div class="lbl">kg</div><div class="lbl">${rl}</div><div class="lbl">${SCALE}</div><div></div><div></div></div>`;
  const tools = `<div class="adds">
      <button type="button" class="ghost w" data-warm="${ex.order}">+ rozgrzewka</button>
      ${liveSetsOk(ex) ? liveSetsBtns(ex) : allowX > 0 ? `<button type="button" class="ghost" data-extra="${ex.order}" ${extra >= allowX ? 'disabled' : ''}>+ seria (${Math.max(0, allowX - extra)})</button>` : ''}
      <button type="button" class="ghost d" data-drop="${ex.order}">+ drop set</button>
    </div>`;
  const wp = warmPlan(ex), anyWork = Object.keys(exLogs(ex)).some(k => /^\d+$/.test(k) && +k > 0);
  const warmLine = wp.length ? `<div class="wu" data-wu="${ex.order}" ${warm || anyWork ? 'hidden' : ''}><div class="wu-t"><b>Rozgrzewka</b>${warmTxt(wp)}</div><button type="button" class="btn sm" data-wuadd="${ex.order}">Wstaw (${wp.length})</button></div>` : '';
  const dropInfo = plannedDrops(ex) ? `<div class="hint">+ ${plannedDrops(ex)} × drop set po ostatniej serii (ok. −20% ciężaru, do upadku technicznego).</div>` : '';
  const sk = ex.skip, gone = sk && !ex.sets, emom = isEmom(ex) && !gone;
  const note = exNote(ex);
  // komentarz: pusty schowany (dodaje go „⋯” → Komentarz), wpisany widoczny w karcie; dotknięcie otwiera okno z tym samym komentarzem do poprawy
  const noteBox = `<button type="button" class="exn" data-note="${ex.order}" ${note ? '' : 'hidden'} aria-label="Popraw komentarz do ćwiczenia ${esc(ex.name)}"><span><small>Twój komentarz</small><span class="exn-x">${esc(note)}</span></span><i aria-hidden="true">✎</i></button>`;
  const skipLine = sk ? `<div class="skipped"><span>${gone ? 'Pominięte' : 'Skrócone do ' + ex.sets + ' z ' + ex.planSets + ' ' + plural(ex.planSets, 'serii', 'serii', 'serii')}${sk.why ? ' · ' + esc(sk.why) : ''}</span><button type="button" class="btn sm" data-unskip="${ex.order}">Przywróć</button></div>` : '';
  // film „Jak wykonać”: ikona w nagłówku (jeden film = link, kilka = lista); bez filmu puste miejsce, żeby „⋯” i strzałka stały w miejscu
  const infs = ex.swap ? [] : (ex.infos || []), prioTxt = ex.prio === 'K' ? 'korekcja' : ex.prio === 'B' ? 'opcjonalne' : 'główne';
  // w jednostce z sekcjami etykieta priorytetu powtarzająca sekcję znika (K w Rozgrzewce i Korekcyjnych, A w Głównych); „opcjonalne” zostaje
  const skr = SKALL.find(r => r.orders.includes(ex.order)), prioHide = !!skr && (ex.prio === 'K' ? skr.sec !== 'G' : ex.prio !== 'B' && skr.sec === 'G');
  const infBtn = infs.length === 1 ? `<a class="infb inf" href="${esc(infs[0].u)}" target="_blank" rel="noopener" aria-label="Jak wykonać: ${esc(ex.name)}">${PLAY_SVG}</a>`
    : infs.length ? `<button type="button" class="infb" data-inf="${ex.order}" aria-label="Jak wykonać: ${esc(ex.name)} (${infs.length} filmy)">${PLAY_SVG}</button>`
    : fxOf(ex).length ? fxBtn(ex) : `<span class="infb" data-fxo="${ex.order}" aria-hidden="true"></span>`;
  const top = `<div class="card ${ex.prio === 'K' ? 'k' : ''} ${oly ? 'oly' : ''} ${gone ? 'skip' : ''}" data-card="${ex.order}">
    <div class="ch"><button type="button" class="fold-b" data-fold="${ex.order}" aria-expanded="true">${tag ? `<span class="gl">${tag}</span>` : ''}<span class="ft"><span class="cn">${esc(ex.name)}</span>${prioHide ? '' : `<span class="badge ${ex.prio}">${prioTxt}</span>`}<span class="fsum"></span></span></button>
      <div class="acts">${infBtn}<button type="button" class="more" data-more="${ex.order}" aria-label="Więcej akcji: ${esc(ex.name)}">${MORE_SVG}</button><button type="button" class="fold-c" data-fold="${ex.order}" aria-expanded="true" aria-label="Zwiń albo rozwiń: ${esc(ex.name)}"><i class="chev" aria-hidden="true"></i></button></div></div>
    <div class="cbody">
    ${ex.swap ? `<div class="swapped"><span>Zamiast: ${esc(ex.swap.from)} · ${esc(ex.swap.why)}</span><button type="button" class="btn sm" data-unswap="${ex.order}">Cofnij zamianę</button></div>` : ''}
    ${skipLine}`;
  if (gone) return top + noteBox + '</div></div>';
  return top + `
    <div class="rx">${prioHide ? '' : `<span class="badge ${ex.prio} bp">${prioTxt}</span>`}${SIMPLE ? rxSimple(ex) : rxPro(ex)}${LIVE && !ex.own ? `<button type="button" class="tplan" data-tplan="${ex.order}" aria-label="Zmień plan: ${esc(ex.name)}">✎ zmień plan</button>` : ''}</div>
    ${lastLine(ex)}
    ${SIMPLE ? hintSimple(ex) : ''}
    ${dropInfo}
    ${ex.note ? `<div class="note">${esc(ex.note)}</div>` : ''}
    ${emom ? emomBox(ex) : ''}
    ${warmLine}
    ${head}
    <div class="sets">${rows}</div>
    ${tools}
    ${SIMPLE && !oly ? `<button class="btn all" data-all="${ex.order}" ${allDone ? 'hidden' : ''}>✓ Wszystko jak w planie</button>` : ''}
    ${noteBox}
    ${LIVE ? liveNoteBox(ex) : ''}
    </div>
  </div>`;
}
/* ---------- podsumowanie: przyciski zamiast suwaków, ból z wyborem miejsca ---------- */
const PLACES = [['kolano', 'Kolano'], ['bark', 'Bark'], ['plecy', 'Plecy'], ['biodro', 'Biodro'], ['lokiec', 'Łokieć'],
  ['nadgarstek', 'Nadgarstek'], ['kostka', 'Kostka'], ['szyja', 'Szyja'], ['inne', 'Inne']];
function parsePain(s){
  const m = {};
  String(s.bol || '').split(';').forEach(x => {
    const [k, v] = x.split(':').map(t => (t || '').trim());
    if (k && v !== '' && !isNaN(+v)) m[k] = +v;
  });
  if (!blank(s.bol_kolano) && m.kolano === undefined) m.kolano = +s.bol_kolano;
  if (!blank(s.bol_bark) && m.bark === undefined) m.bark = +s.bol_bark;
  return m;
}
const painSev = i => i <= 3 ? 'g' : i <= 6 ? 'a' : 'r';
const feelSev = i => i <= 2 ? 'r' : i === 3 ? 'a' : 'g';
function scale(id, from, to, val, sev, attr){
  let h = '';
  for (let i = from; i <= to; i++) h += `<button type="button" class="pv ${sev(i)} ${val === i ? 'on' : ''}" data-v="${i}" aria-pressed="${val === i}">${i}</button>`;
  return `<div class="scale ${to - from > 5 ? 's11' : 's5'}" ${id ? `id="${id}"` : ''} ${attr || ''} data-v="${val === null ? '' : val}">${h}</div>`;
}
function sessCard(s0){
  const s = curSess(), pains = parsePain(s);
  if (PAIN && !s.id) { if (pains.kolano === undefined) pains.kolano = 0; if (pains.bark === undefined) pains.bark = 0; }
  const chips = PLACES.map(([k, t]) => `<button type="button" class="pl ${pains[k] !== undefined ? 'on' : ''}" data-p="${k}" aria-pressed="${pains[k] !== undefined}">${t}</button>`).join('');
  const rows = PLACES.map(([k, t]) => `<div class="prow" data-p="${k}" ${pains[k] !== undefined ? '' : 'hidden'}>
      <div class="plbl">${t}${k === 'inne' ? ' <small>(opisz w uwagach)</small>' : ''}</div>
      ${scale('', 0, 10, pains[k] === undefined ? null : pains[k], painSev)}</div>`).join('');
  const painInner = `<div class="pls">${chips}</div><div class="cap"><span>0 = brak bólu</span><span>10 = najgorszy</span></div>${rows}`;
  const painBlock = PAIN
    ? `<label>Ból – dotknij miejsca, potem oceń</label>${painInner}`
    : `<details class="opt" ${Object.keys(pains).length ? 'open' : ''}><summary>Coś bolało? (opcjonalnie)</summary>${painInner}</details>`;
  const feel = blank(s.samopoczucie) ? 3 : +s.samopoczucie;
  return `<div class="card sess"><div class="cn">Podsumowanie ${SIMPLE ? 'treningu' : 'jednostki'}</div>
    <label>Jak ciężki był cały trening?</label>
    <div class="sub">Oceń całość, nie ostatnią serię.</div>
    ${scale('srpe', 0, 10, blank(s.rpe_sesji) ? null : +s.rpe_sesji, () => 'n')}
    <div class="cap"><span>0 = odpoczynek</span><span>10 = maksimum</span></div>
    <div class="sub">3 umiarkowanie · 5 ciężko · 7 bardzo ciężko</div>
    <label>Samopoczucie</label>${scale('feel', 1, 5, feel, feelSev)}<div class="cap"><span>1 = źle</span><span>5 = świetnie</span></div>
    ${painBlock}
    <label>Czas treningu</label>
    <div class="timebox"><span class="clock">${clockText()}</span><small>${s.id ? 'zapisany' : 'liczy się od pierwszego wpisu do „Zakończ”'}</small></div>
    ${s.id ? '' : '<button type="button" class="btn sm" id="t-reset">Licz czas od teraz</button>'}
    <label class="fl" for="smin">Popraw czas, jeśli się nie zgadza (min)<input id="smin" inputmode="numeric" value="${esc(s.id && !blank(s.czas_min) ? s.czas_min : '')}" placeholder="policzę sam"></label>
    <label for="snote">Uwagi dla trenera</label><textarea id="snote" rows="3">${esc(s.uwagi || '')}</textarea>
    ${pkgLiveBox(s)}
    <div style="height:10px"></div><button class="btn p" id="saveSess">${s.id ? 'Zapisz zmiany' : 'Zakończ i zapisz ' + (SIMPLE ? 'trening' : 'jednostkę')}</button></div>`;
}
/** zaliczone serie bieżącej jednostki z telefonu (bez rozgrzewki i pominięć) w kształcie dla lib unitSummary / unitRecord */
function unitSets(exs){
  const sets = [];
  exs.forEach(ex => { const L2 = exLogs(ex); Object.keys(L2).sort((a, b) => (parseInt(a) || 999) - (parseInt(b) || 999)).forEach(k => { const l = L2[k];
    if (l.wykonane !== 'TAK' || /^R/i.test(k) || /SKIP/.test(l.typ || '')) return;
    sets.push({ set: k, name: ex.name, prio: ex.prio, group: ex.group, kg: num(l.kg), reps: num(l.powt), rpe: num(l.rpe), fail: /FAIL/.test(l.typ || ''), timed: !!timeUnit(ex.reps) }); }); });
  return sets;
}
/**
 * ćwiczenie zamknięte (18.11.2026: rekord dopiero wtedy, nie między seriami): wszystkie serie robocze zrobione,
 * karta zwinięta ręcznie, jest już seria w dalszym ćwiczeniu (poza własnym obwodem) albo tryb skupienia przeszedł dalej
 */
function exClosed(o){
  o = +o;
  const c = document.querySelector(`.card[data-card="${o}"]`);
  if (cardDone(o) || c && c.classList.contains('fold')) return true;
  const exs = curExs(), k = exs.findIndex(e => e.order === o), g = grpOf(o);
  if (exs.slice(k + 1).some(e => !(g && g.orders.includes(e.order)) && work(e.order).some(r => r.dataset.st))) return true;
  if (fxOn() && FXI !== null) { const j = focusSteps(exs, CIRC).findIndex(x => x.orders.includes(o)); return j >= 0 && FXI > j; }
  return false;
}
/** rekordy wszystkich ćwiczeń jednostki (po zapisie serii, zwinięciu karty, przejściu kroku) */
const recAll = () => { if (PLAN) curExs().forEach(recDraw); };
/** rekord po zamknięciu ćwiczenia: pasek pod najlepszą serią ćwiczenia głównego, gdy bije całą wcześniejszą historię (lib unitRecord) */
function recDraw(ex){
  if (!ex) return;
  document.querySelectorAll(`.rec[data-o="${ex.order}"]`).forEach(x => x.remove());
  document.querySelectorAll(`.set.isrec[data-o="${ex.order}"]`).forEach(x => x.classList.remove('isrec'));
  recSum(ex);
  if (ex.prio !== 'A' || timeUnit(ex.reps) || !exClosed(ex.order)) return;
  const r = unitRecord({ week: cur.week, day: cur.day, plan: PLAN, logs: (DATA && DATA.logs) || [], dates: unitDays(), sets: unitSets([ex]) }, ex.name);
  const row = r && document.querySelector(`.set[data-o="${ex.order}"][data-s="${r.set}"]`);
  if (!row) return;
  row.classList.add('isrec');
  const val = (r.oly ? 'najlepsze zaliczone ' : 'szacowane maks. ') + kgTxt(r.v) + ' kg';
  row.insertAdjacentHTML('afterend', r.first
    ? `<div class="rec first" data-o="${ex.order}" role="status"><b>★ Pierwszy wynik</b><span>${SIMPLE ? 'Od niego liczymy rekordy' : val}</span></div>`
    : `<div class="rec" data-o="${ex.order}" role="status"><b>★ Rekord</b><span>${SIMPLE ? 'Najlepszy wynik w tym ćwiczeniu' : val + ' · było ' + kgTxt(r.was)}</span></div>`);
  recSum(ex);
}
/** „★ rekord” w wyniku zwiniętej karty: pasek pod serią chowa się razem z kartą */
const recSum = ex => foldSum(ex.order);
/** dane do okna „Trening zrobiony”: bieżąca jednostka z telefonu, porównanie i rekordy z historii (lib unitSummary) */
function doneSummary(minutes){
  const exs = curExs(), sets = unitSets(exs);
  const u = unitList().find(x => x.week === cur.week && x.day === cur.day);
  return Object.assign(unitSummary({ week: cur.week, day: cur.day, plan: PLAN, logs: vLogs(), sessions: (DATA && DATA.sessions) || [],
    dates: unitDays(), stats: unitStats(exs, exLogs), minutes, sets }), { title: (u && u.title) || '', date: localDate() });
}
function openDone(u, off){
  const cmp = (d, unit) => d === null ? '' : d === 0 ? 'bez zmian' : (d > 0 ? '▲ ' : '▼ ') + Math.abs(d).toLocaleString('pl-PL') + unit;
  const h = u.min ? Math.floor(u.min / 60) : 0, tile = (k, v, sm) => `<div><span>${k}</span><b>${v}</b>${sm ? `<small>${sm}</small>` : ''}</div>`;
  openSheet(`<div class="dn-h"><span class="dn-ck" aria-hidden="true">✓</span><div><h2 id="sheet-t">Trening zrobiony</h2>
      <p class="sub">${esc([u.title, weekday(u.date) + ' ' + ddmm(u.date)].filter(Boolean).join(' · '))}</p></div></div>
    <div class="dn-t">
      ${tile('Czas', u.min ? (h ? h + '<i> h </i>' + (u.min % 60) : u.min) + '<i> min</i>' : '–', cmp(u.dMin, ' min'))}
      ${tile('Serie', u.done + (u.all ? '<i> / ' + u.all + '</i>' : ''), u.all && u.done >= u.all ? 'cały plan' : '')}
      ${tile('Tonaż', u.ton.toLocaleString('pl-PL') + '<i> kg</i>', cmp(u.dTon, '%'))}</div>
    ${u.dMin !== null || u.dTon !== null ? `<p class="sub dn-cmp">Porównanie z poprzednim razem: ${esc(cur.day)}${u.prev.date ? ', ' + weekday(u.prev.date) + ' ' + ddmm(u.prev.date) : ''}.</p>` : ''}
    ${u.records.length ? `<div><div class="dn-s">Rekordy z tego treningu</div>${u.records.map(r =>
      `<div class="kv"><span><i class="key pr"></i> ${esc(r.name)}<small> · ${r.oly ? 'zaliczone' : 'e1RM'}, +${kgTxt(r.delta)} kg</small></span><b>${kgTxt(r.v)} kg</b></div>`).join('')}</div>` : ''}
    ${off ? '<p class="sub dn-cmp">Brak sieci: zapiszę, gdy wróci połączenie.</p>' : ''}
    <div class="dn-b"><button type="button" class="btn" data-close>Zamknij</button><button type="button" class="btn p" id="dn-go">Zobacz postęp</button></div>`);
  // Postęp liczy się z danych serwera: po przejściu dociągnij świeże (z tą jednostką); bez sieci zostaje dotychczasowy stan
  $('#dn-go').onclick = () => { closeSheet(); TAB = 'postep'; PT = 'tyd'; PWK = null; render(); window.scrollTo(0, 0); refreshData(); };
}
/* ---------- „Zaplanuj następną” (prowadzony trening, punkt 3c przeglądu v80, 23.11.2026) ----------
 * Po „Zakończ i zapisz” w trybie trenera: ta sama jednostka w tyg. + 1 z kg według dzisiejszych świateł (lib nextUnit),
 * poprawki w miejscu (serie, powt., kg, RPE max), „Zapisz w planie” → trNastepna (zmiana jednostki albo nowa jednostka trenera).
 * Potem zwykłe okno „Trening zrobiony”. Klient tego okna nie widzi.
 */
const NU_EMO = { L: '🟢', S: '🟡', W: '🔴', X: '✖' };
let NU = null;   // szkic: {week, day, title, date, exists, items}, tylko w pamięci strony
function nextDraft(){
  if (!LIVE) return null;
  const raw = PLAN.filter(r => r.week === cur.week && r.day === cur.day && !r.added).sort((a, b) => a.order - b.order);
  if (!raw.length || raw.some(r => r.own)) return null;
  const week = cur.week + 1, target = PLAN.filter(r => r.week === week && r.day === cur.day).sort((a, b) => a.order - b.order);
  if (target.some(r => r.own) || target.length && sessDone(week, cur.day)) return null;
  const exs = curExs(), done = {};
  raw.forEach(r => { const ex = exs.find(x => x.order === r.order); if (!ex) return; const L2 = exLogs(ex);
    done[r.order] = Object.keys(L2).filter(k => /^\d+$/.test(k) && +k > 0).map(k => L2[k]).filter(l => l.wykonane === 'TAK' || /FAIL/.test(l.typ || ''))
      .map(l => ({ kg: num(l.kg), rpe: num(l.rpe), fail: /FAIL/.test(l.typ || '') })); });
  const t0 = target[0], date = t0 ? t0.date || '' : addDays(curDate(), 7);
  return { week, day: cur.day, title: (t0 || raw[0]).title || cur.day, date, exists: !!target.length,
    items: nextUnit(raw.map(r => ({ order: r.order, name: r.name, sets: r.sets, reps: r.reps, kg: r.kg, rpe: r.rpe, prio: r.prio })), done, target.length ? target : null) };
}
const nuKg = v => typeof v === 'number' ? fmtKg(v) : String(v === null || v === undefined ? '' : v);
function nuRow(it, i){
  const kg = it.kg === '' ? '' : it.up && typeof it.was === 'number' ? fmtKg(it.was) + ' → ' + fmtKg(it.kg) + ' kg' : typeof it.kg === 'number' ? fmtKg(it.kg) + ' kg' : nuKg(it.kg);
  const ch = typeof it.kg === 'number' && typeof it.was === 'number' && it.kg !== it.was ? (it.kg > it.was ? '+' : '−') + fmtKg(Math.abs(it.kg - it.was)) : '=';
  const today = it.lights.length ? 'dziś ' + (it.lights.every(q => q === 'L') ? 'same 🟢' : it.lights.map(q => NU_EMO[q] || '·').join(' ')) : '';
  const sub = [it.sets + '×' + it.reps, kg, !blank(it.rpe) ? (SCALE === 'RIR' ? 'RIR ' + fmtKg(rirOfRpe(it.rpe)) : 'RPE ' + fmtKg(it.rpe)) : '', today].filter(Boolean).join(' · ');
  const v = x => esc(nuKg(x));
  return `<div class="nu" data-nu="${i}"><button type="button" aria-expanded="${!!it.open}"><b>${esc(it.name)}</b><span class="ch${ch === '=' ? ' eq' : ''}">${ch}</span><small>${esc(sub)}</small></button>` +
    (it.open ? `<div class="ed-4"><label class="fl">Serie<input data-f="sets" inputmode="numeric" value="${v(it.sets)}"></label><label class="fl">Powt.<input data-f="reps" value="${v(it.reps)}"></label>` +
      `<label class="fl">Kg<input data-f="kg" inputmode="decimal" value="${v(it.kg)}"></label><label class="fl">RPE<input data-f="rpe" inputmode="decimal" value="${v(it.rpe)}" placeholder="—"></label></div>` : '') + '</div>';
}
function openNext(nx, sum, off){
  NU = nx;
  const when = nx.date ? ' · ' + weekday(nx.date) + ' ' + ddmm(nx.date) : '';
  openSheet(`<h2 id="sheet-t">Zaplanuj następną</h2><p class="sub">${esc(nx.title)} · tydz. ${nx.week}${esc(when)}. Propozycja z dzisiejszych świateł, popraw przed zapisem.</p>
    <div id="nu-l">${nx.items.map(nuRow).join('')}</div>
    <p class="sub" style="margin-top:10px">${nx.exists ? 'Ta jednostka w tyg. ' + nx.week + ' jest już w planie: zmieni się tylko to, co tu widać.' : 'Tej jednostki w tyg. ' + nx.week + ' jeszcze nie ma: dopiszę ją do planu jako Twoją.'} Dotknij ćwiczenia, żeby zmienić serie, powt., kg albo RPE.</p>
    <p class="hint" id="nu-err" role="alert" hidden></p>
    <button type="button" class="btn p" id="nu-ok">Zapisz w planie</button><button type="button" class="btn" id="nu-no">Nie teraz</button>`);
  const done = () => { NU = null; if (sum) openDone(sum, off); else closeSheet(); };
  const l = $('#nu-l');
  l.addEventListener('click', e => { const b = e.target.closest('.nu>button'); if (!b) return; const i = +b.parentElement.dataset.nu;
    nx.items[i].open = !nx.items[i].open; b.parentElement.outerHTML = nuRow(nx.items[i], i); });
  l.addEventListener('input', e => { const f = e.target.dataset.f; if (!f) return; const it = nx.items[+e.target.closest('.nu').dataset.nu], t = e.target.value.trim(), n = Number(t.replace(',', '.'));
    it[f] = f === 'sets' ? t : f === 'kg' ? (t !== '' && isFinite(n) ? n : t) : f === 'rpe' ? (t === '' ? null : t) : t; it.up = false; });
  l.addEventListener('change', e => { const r = e.target.closest('.nu'); if (!r || !e.target.dataset.f) return; const i = +r.dataset.nu, f = e.target.dataset.f;   // po wyjściu z pola: nowa różnica i opis
    const box = r.ownerDocument.createElement('div'); box.innerHTML = nuRow(nx.items[i], i); r.querySelector('button').replaceWith(box.firstElementChild.querySelector('button')); });
  $('#nu-no').onclick = done;
  $('#nu-ok').onclick = () => {
    const err = t => { const x = $('#nu-err'); x.textContent = t; x.hidden = false; };
    if (navigator.onLine === false) return err('Bez sieci planu nie zapiszę. Zrób to później w panelu → Plan.');
    const b = $('#nu-ok'); b.disabled = true; b.textContent = 'Zapisuję…';
    const s = x => x === null || x === undefined ? '' : String(typeof x === 'number' ? fmtKg(x) : x);
    call('trNastepna', LIVE, { week: nx.week - 1, day: nx.day, date: nx.exists ? '' : nx.date, ex: nx.items.map(it => ({ order: it.order, sets: s(it.sets), reps: s(it.reps), kg: s(it.kg), rpe: s(it.rpe) })) })
      .then(r => { toast(r.mode === 'new' ? 'Dopisane do planu: tydz. ' + r.week + (r.day && r.day !== nx.day ? ', ' + r.day : '') + '.' : r.n ? 'Plan na tydz. ' + r.week + ' zmieniony.' : 'Plan na tydz. ' + r.week + ' bez zmian.'); done(); refreshData(); })
      .catch(e => { b.disabled = false; b.textContent = 'Zapisz w planie'; err(e.message); });
  };
}
function sessClick(e){
  const pv = e.target.closest('.pv');
  if (pv) {
    const sc = pv.parentElement;
    sc.querySelectorAll('.pv').forEach(b => { b.classList.toggle('on', b === pv); b.setAttribute('aria-pressed', b === pv); });
    sc.dataset.v = pv.dataset.v;
    return true;
  }
  const pl = e.target.closest('.pl');
  if (pl) {
    const on = !pl.classList.contains('on');
    pl.classList.toggle('on', on); pl.setAttribute('aria-pressed', on);
    document.querySelector(`.prow[data-p="${pl.dataset.p}"]`).hidden = !on;
    return true;
  }
  return false;
}
/** „✓ Wszystko jak w planie” tylko wtedy, gdy zostały niezapisane serie z planu (po ręcznym odhaczeniu znika, po wyczyszczeniu wraca) */
function refreshAll(o, saved){
  const b = document.querySelector(`[data-all="${o}"]`);
  if (b) b.hidden = !document.querySelector(`.set[data-o="${o}"][data-k="p"][data-st=""]`);
  foldSum(o); placeStep(o);
  const emom = !!document.querySelector(`.emom[data-emom="${o}"]`);            // EMOM: rund bywa więcej niż w planie, bez samozwijania
  if (saved && !emom && cardDone(o)) setTimeout(() => {   // ostatnia seria zapisana (ćwiczenie właśnie zrobione) → zwiń i pokaż następne, także po ręcznym rozwinięciu
    if (!cardDone(o)) return;
    setFold(o, true);
    const next = document.querySelector(`.card[data-card="${o}"]`) && document.querySelector(`.card[data-card="${o}"]`).nextElementSibling;
    if (next && next.classList.contains('card')) next.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 900);
}
/* kolejne serie jak poprzednia: niezrobione serie robocze po tej przejmują jej kg i powt. (tylko pola automatyczne, szare) */
const workRows = o => [...document.querySelectorAll(`.set[data-o="${o}"]`)].filter(r => r.dataset.k === 'p' || r.dataset.k === 'x');
function followRow(row){
  const all = workRows(row.dataset.o), i = all.indexOf(row);
  if (i < 0) return;                                                           // rozgrzewka nie zmienia propozycji serii roboczych
  all.slice(i + 1).forEach(r => {
    if (r.dataset.st) return;
    ['.kg', '.reps'].forEach(c => { const x = r.querySelector(c), s = row.querySelector(c); if (x && s && x.value.trim() === '') setPh(x, fv(s)); });
  });
}
/* pasek skoku ciężaru pod pierwszą niezrobioną serią roboczą: zmienia ją i kolejne; przytrzymanie ±2,5 = ±1 kg */
const STEP_HOLD_MS = 500;
function placeStep(o){
  document.querySelectorAll(`.step[data-o="${o}"]`).forEach(x => x.remove());
  const row = workRows(o).find(r => !r.dataset.st), i = row && row.querySelector('.kg'), kg = i ? num(fv(i)) : NaN;
  if (!row || !isNum(kg)) return;                                             // BW, „max” itp.: bez paska
  row.insertAdjacentHTML('afterend', `<div class="step" data-o="${o}" role="group" aria-label="Ciężar serii ${esc(row.dataset.s)} i kolejnych">
    <button type="button" data-d="-5" aria-label="minus 5 kg">−5</button><button type="button" data-d="-2.5" data-f="-1" aria-label="minus 2,5 kg (przytrzymaj: minus 1 kg)">−2,5</button>
    <b>${esc(fmtKg(kg))} kg</b>
    <button type="button" data-d="2.5" data-f="1" aria-label="plus 2,5 kg (przytrzymaj: plus 1 kg)">+2,5</button><button type="button" data-d="5" aria-label="plus 5 kg">+5</button></div>`);
  let held = null, used = false;
  row.nextElementSibling.querySelectorAll('button').forEach(b => {
    b.onpointerdown = () => { used = false; clearTimeout(held); if (b.dataset.f) held = setTimeout(() => { used = true; bump(o, +b.dataset.f); }, STEP_HOLD_MS); };
    b.onpointerup = b.onpointerleave = b.onpointercancel = () => clearTimeout(held);
    b.oncontextmenu = e => e.preventDefault();
    b.onclick = () => { if (used) { used = false; return; } bump(o, +b.dataset.d); };
  });
}
function bump(o, d){
  const row = workRows(o).find(r => !r.dataset.st); if (!row) return;
  const i = row.querySelector('.kg'), v = Math.max(0, Math.round((num(fv(i)) + d) * 100) / 100);
  i.value = fmtKg(v);
  workRows(o).slice(workRows(o).indexOf(row) + 1).forEach(r => { const x = r.querySelector('.kg'); if (!r.dataset.st && x && x.value.trim() === '') setPh(x, fmtKg(v)); });
  placeStep(o);
  const ex = PLAN.find(x => x.week === cur.week && x.day === cur.day && x.order === +o); if (ex) updateSug(ex);
}
/* zwijanie ćwiczeń: stan w localStorage per jednostka; brak wpisu = zwinięte, gdy wszystkie serie robocze zrobione */
const FK = 'fold_' + KEY;
function foldGet(){ try { return JSON.parse(localStorage.getItem(FK) || '{}'); } catch (e) { return {}; } }
const foldKey = o => [cur.week, cur.day, o].join('|');
const work = o => [...document.querySelectorAll(`.set[data-o="${o}"]:not([data-k="w"])`)];
const cardDone = o => { const c = document.querySelector(`.card[data-card="${o}"]`), w = work(o); return !!c && (c.classList.contains('skip') || w.length > 0 && w.every(r => r.dataset.st)); };
function foldSum(o){
  const s = document.querySelector(`.card[data-card="${o}"] .fsum`); if (!s) return;
  if (s.closest('.card').classList.contains('skip')) { s.textContent = 'pominięte'; return; }
  const w = work(o), done = w.filter(r => r.dataset.st), ton = done.reduce((a, r) => { const kg = num(fv(r.querySelector('.kg'))), n = num(fv(r.querySelector('.reps'))); return a + (r.dataset.st === 'ok' && isNum(kg) && isNum(n) && !(r.querySelector('.reps').dataset.u || '').match(/sek|min/) ? kg * n : 0); }, 0);
  s.textContent = done.length + ' z ' + w.length + ' ' + plural(w.length, 'serii', 'serii', 'serii') + (ton ? ' · ' + fmtKg(Math.round(ton)) + ' kg' : '') + (cardDone(o) ? ' · ✓' : '') + (document.querySelector(`.rec[data-o="${o}"]`) ? (document.querySelector(`.rec.first[data-o="${o}"]`) ? ' · ★ pierwszy wynik' : ' · ★ rekord') : '');
}
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** płynna zmiana wysokości karty przy zwijaniu i rozwijaniu; stan (klasa fold) zmienia się od razu, animuje się tylko wysokość */
function foldMove(c, h0){
  const h1 = c.offsetHeight;
  if (calm() || !c.animate || h0 === h1 || !h0) return;
  c.classList.add('folding');
  const a = c.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: 200, easing: 'ease-out' });
  a.onfinish = a.oncancel = () => { c.classList.remove('folding'); stickDraw(); };
}
function setFold(o, on, keep = true){
  const c = document.querySelector(`.card[data-card="${o}"]`); if (!c) return;
  const h0 = keep && c.classList.contains('fold') !== on ? c.offsetHeight : 0;
  c.classList.toggle('fold', on && !fxOn()); foldMove(c, h0); c.querySelectorAll('[data-fold]').forEach(b => b.setAttribute('aria-expanded', String(!on)));
  if (on) { const ch = c.querySelector('.ch'); if (ch) ch.classList.remove('stuck'); }   // zwinięta karta nie ma przypiętej nazwy (bez czekania na przewinięcie)
  if (keep) { const m = foldGet(); m[foldKey(o)] = on ? 1 : 0; try { localStorage.setItem(FK, JSON.stringify(m)); } catch (e) {} }
}
function bindFold(exs){
  exs.forEach(ex => { const st = foldGet()[foldKey(ex.order)]; foldSum(ex.order); setFold(ex.order, st === undefined ? cardDone(ex.order) : st === 1, false); });
  document.querySelectorAll('[data-fold]').forEach(b => b.onclick = () => { if (!fxOn()) { setFold(b.dataset.fold, !b.closest('.card').classList.contains('fold')); recAll(); } });
}
/* ---------- sekcje jednostki w całej liście (lib sectionRuns): nagłówek zwija i rozwija ćwiczenia sekcji; tylko widok ----------
 * Stan w sk_<klucz> {„tydzień|jednostka”: {nr sekcji: 1 zwinięta / 0 rozwinięta}}; bez wpisu sekcja zrobiona jest zwinięta.
 * Sekcja, która właśnie stała się zrobiona, zwija się sama (także po ręcznym rozwinięciu), jak karta ćwiczenia. */
let SKS = [], SKDN = null, SKALL = [];                                       // SKALL: sekcje jednostki także w trybie skupienia (etykieta priorytetu)                                                    // sekcje bieżącej jednostki, zrobione przy ostatnim rysowaniu
const SKK = 'sk_' + KEY, skUnit = () => cur.week + '|' + cur.day;
const skGet = () => { try { return JSON.parse(localStorage.getItem(SKK) || '{}') || {}; } catch (e) { return {}; } };
const sekDone = r => r.orders.every(o => cardDone(o));
const sekShut = r => { const v = (skGet()[skUnit()] || {})[r.i]; return v === undefined ? sekDone(r) : v === 1; };
function sekSet(r, on){
  const m = skGet(), u = skUnit(); (m[u] = m[u] || {})[r.i] = on ? 1 : 0;
  try { localStorage.setItem(SKK, JSON.stringify(m)); } catch (e) {}
  sekPaint(r, on);
}
/** pokazuje albo chowa ćwiczenia sekcji (karty i ramki obwodów); karty zostają w DOM */
function sekPaint(r, on){
  const b = document.querySelector(`.sek-h[data-sek="${r.i}"]`); if (!b) return;
  b.setAttribute('aria-expanded', String(!on)); b.classList.toggle('shut', on);
  r.orders.forEach(o => { const c = document.querySelector(`.card[data-card="${o}"]`); if (c) (c.closest('.grp') || c).classList.toggle('sek-off', on); });
}
function sekDraw(){
  if (!SKS.length || !$('.sek-h')) return;
  const now = new Set(SKS.filter(sekDone).map(r => r.i));
  SKS.forEach(r => {
    const dn = r.orders.filter(o => cardDone(o)).length, b = document.querySelector(`.sek-h[data-sek="${r.i}"]`); if (!b) return;
    b.querySelector('.sek-m').textContent = r.orders.length + ' · ' + dn + '/' + r.orders.length + (dn === r.orders.length ? ' ✓' : '');
    b.setAttribute('aria-label', `${r.name}: ${r.orders.length} ${plural(r.orders.length, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')}, zrobione ${dn} z ${r.orders.length}`);
    if (SKDN && SKDN.u === skUnit() && now.has(r.i) && !SKDN.s.has(r.i)) sekSet(r, true);   // właśnie zrobiona: zwiń
    else sekPaint(r, sekShut(r));
  });
  SKDN = { u: skUnit(), s: now };
}
/** rozwija sekcję z ćwiczeniem o (przejście do ćwiczenia z „Dalej” albo z trybu skupienia) */
const sekOpen = o => { const r = SKS.find(x => x.orders.includes(+o)); if (r && sekShut(r)) sekSet(r, false); };
function sekBind(){
  document.querySelectorAll('.sek-h').forEach(b => b.onclick = () => { const r = SKS.find(x => x.i === +b.dataset.sek); if (r) { sekSet(r, !sekShut(r)); stickDraw(); } });
  sekDraw();
}
/* ---------- tryb skupienia (lib focusSteps, focusStart): wszystkie karty zostają w DOM, widać jeden krok; przełącznik pod „⋯” górnego paska, wybór w fx_<klucz> ---------- */
const FXK = 'fx_' + KEY;
let FX = false, FXI = null, FXU = '', FXM = false;                // włączony, numer kroku (liczba kroków = podsumowanie), jednostka, której dotyczy krok, klient sam zmienił krok
try { const v = localStorage.getItem(FXK); FX = v === null ? !!LIVE : v === '1'; } catch (e) {}   // prowadzony trening: domyślnie jedno ćwiczenie na ekranie
const fxOn = () => !!$('#fx');
function fxSet(on){
  const st = focusSteps(curExs(), CIRC)[FXI], o = fxOn() && st ? st.orders[0] : 0;
  FX = on; FXI = null; FXM = false; try { localStorage.setItem(FXK, on ? '1' : '0'); } catch (e) {}
  renderTrening();
  const c = !on && o ? document.querySelector(`.card[data-card="${o}"]`) : null;   // powrót do listy: zostań przy ćwiczeniu, które było na ekranie
  if (c) { sekOpen(o); setFold(o, false, false); window.scrollTo(0, (c.closest('.grp') || c).getBoundingClientRect().top + window.scrollY - 8); } else window.scrollTo(0, 0);
  stickDraw();
}
/** przejście do kroku i; z = obrót (°), na którym palec puścił kartę: wtedy (i przy „‹” / „Następne”) karty jadą po łuku, fxArc */
function fxGo(i, z){ const g = z === undefined ? null : fxGhosts(); FXI = i; FXM = true; fxDraw(); recAll(); window.scrollTo(0, 0); stickDraw(); tipDraw(); if (g) fxArc(g, z); }
/* ---------- przejście „karty w ręku” (tryb skupienia): karta obraca się wokół punktu daleko pod ekranem (FXA.piv, „dłoń”), więc jedzie po łuku;
   palec prowadzi ją na żywo, spod spodu wychyla się sąsiedni krok; stara karta to kopia (fx-gh) nad stroną, bez id; przy ograniczeniu ruchu bez animacji ---------- */
const FXA = { ang: 11, piv: 1100, dur: 380, peek: .35 };
const fxStill = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fxVis = () => [...$('#main').children].filter(e => !e.classList.contains('fx-off') && e.id !== 'fx' && e.id !== 'fx-nav');
/** obrót elementów kroku wokół wspólnego punktu pod pierwszym z nich */
function fxPivot(els, top){ els.forEach(e => e.style.transformOrigin = `50% ${top + FXA.piv - e.getBoundingClientRect().top}px`); }
/** kopia elementu w miejscu `r` (pozycja na ekranie), bez id i poza dostępnością */
function fxGhost(el, r, z){
  const c = el.cloneNode(true); c.classList.remove('fx-off'); c.classList.add('fx-gh'); c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  c.setAttribute('aria-hidden', 'true'); c.inert = true;
  Object.assign(c.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', zIndex: z, transform: el.style.transform, transformOrigin: el.style.transformOrigin });
  document.body.appendChild(c); return c;
}
function fxGhosts(){
  document.querySelectorAll('.fx-gh').forEach(g => g.remove());
  if (fxStill()) return null;
  const els = fxVis(); if (!els.length) return null;
  return { top: els[0].getBoundingClientRect().top, g: els.map(e => fxGhost(e, e.getBoundingClientRect(), 2)), from: FXI };
}
/** stara karta odjeżdża po łuku w bok i gaśnie, nowa wjeżdża z drugiej strony na środek (nad starą) */
function fxArc(o, z){
  const d = FXI > o.from ? 1 : -1, ease = 'cubic-bezier(.25,.8,.3,1)', els = fxVis();
  o.g.forEach(g => g.animate([{ transform: `rotate(${z}deg)` }, { opacity: 1, offset: .6 }, { transform: `rotate(${-d * FXA.ang * 1.6}deg)`, opacity: 0 }],
    { duration: FXA.dur, easing: ease, fill: 'forwards' }).onfinish = () => g.remove());
  if (!els.length) return;
  fxPivot(els, els[0].getBoundingClientRect().top);
  els.forEach(e => { e.classList.add('fx-mv'); e.animate([{ transform: `rotate(${d * FXA.ang}deg)` }, { transform: 'rotate(0deg)' }], { duration: FXA.dur, easing: ease })
    .onfinish = () => { e.classList.remove('fx-mv'); e.style.transformOrigin = ''; }; });
}
/** rysuje pasek i przyciski, pokazuje bieżący krok; wołane też po każdej serii (odcinki paska) */
function fxDraw(){
  const bar = $('#fx'); if (!bar) return;
  const exs = curExs(), steps = focusSteps(exs, CIRC), u = cur.week + '|' + cur.day;
  const done = exs.filter(ex => cardDone(ex.order)).map(ex => ex.order);
  if (FXU !== u) FXM = false;
  if (FXU !== u || FXI === null) { FXU = u; FXI = sessDone(cur.week, cur.day) ? 0 : focusStart(steps, done); }
  FXI = Math.max(0, Math.min(FXI, steps.length));
  const st = steps[FXI], show = st ? st.orders : [], pos = o => exs.findIndex(ex => ex.order === o) + 1;
  [...$('#main').children].forEach(e => {
    const keep = e === bar || e.id === 'fx-nav' || e.id === 'unote' && FXI === 0 || (st ? e.matches('.card[data-card]') && show.includes(+e.dataset.card) || e.matches('.grp') && e.dataset.grp === st.grp
      : e.matches('.card.sess, .own-add, .ed-rm'));
    e.classList.toggle('fx-off', !keep);
  });
  show.forEach(o => { const c = document.querySelector(`.card[data-card="${o}"]`); if (c) { c.classList.remove('fold'); c.classList.add('fxc'); } });
  const title = !st ? 'Podsumowanie' : show.length > 1 ? `Ćwiczenia ${pos(show[0])}–${pos(show[show.length - 1])} z ${exs.length}` : `Ćwiczenie ${pos(show[0])} z ${exs.length}`;
  const skr = sectionRuns(exs).find(r => st && r.orders.includes(st.orders[0]));   // etykieta sekcji, gdy jednostka ma ich kilka
  bar.innerHTML = `<div class="fx-t"><span class="fx-tt">${skr ? `<small class="fx-sk">${esc(skr.name)}</small>` : ''}<b id="fx-title">${title}</b></span><button type="button" class="fx-l" id="fx-list">☰ Cała lista</button></div>
    <div class="fx-seg" role="img" aria-label="Zrobione ${done.length} z ${exs.length} ćwiczeń">${exs.map(ex => `<i class="${done.includes(ex.order) ? 'd' : show.includes(ex.order) ? 'c' : ''}"></i>`).join('')}</div>`;
  $('#fx-list').onclick = () => fxSet(false);
  const nx = steps[FXI + 1], nav = $('#fx-nav');
  const nxName = nx ? (nx.grp ? (nx.orders.length === 2 ? 'Superseria ' : 'Obwód ') + nx.grp : (exs.find(ex => ex.order === nx.orders[0]) || {}).name || '') : 'Podsumowanie';
  const add = LIVE && EDIT && exs[0] && !exs[0].own && !sessDone(cur.week, cur.day) ? '<button type="button" class="fx-add" id="fx-add">+ Ćwiczenie</button>' : '';
  nav.innerHTML = add + (st
    ? `<button type="button" id="fx-prev" aria-label="Poprzednie ćwiczenie" ${FXI ? '' : 'disabled'}>‹</button><button type="button" class="n" id="fx-next"><small>${nx ? 'Następne' : 'Dalej'}</small><span>${esc(nxName)} ›</span></button>`
    : '<button type="button" class="b" id="fx-prev">‹ Wróć do ćwiczeń</button>');
  $('#fx-prev').onclick = () => fxGo(FXI - 1, 0);
  const fa = $('#fx-add'); if (fa) fa.onclick = openAdd;
  const nb = $('#fx-next'); if (nb) nb.onclick = () => fxGo(FXI + 1, 0);
}
// przesunięcie palcem w bok = poprzednie / następne ćwiczenie (tylko w trybie skupienia); kierunek ustala pierwsze 10 px ruchu,
// w bok: karta idzie za palcem po łuku (obrót = dx / promień), spod spodu sąsiedni krok (fx-pk); przesunięcie zaczęte na przycisku go nie naciska
(() => {
  let x0 = null, y0 = null, lock = null, ang = 0, pk = null, els = [], top = 0; const m = $('#main');
  const reset = () => { els.forEach(e => { e.style.transform = ''; e.classList.remove('fx-mv'); }); if (pk) pk.remove(); pk = null; els = []; };
  m.addEventListener('touchstart', e => { x0 = fxOn() ? e.touches[0].clientX : null; y0 = e.touches[0].clientY; lock = null; ang = 0; }, { passive: true });
  m.addEventListener('touchmove', e => {
    if (x0 === null) return; const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    if (lock === null && Math.hypot(dx, dy) > 10) lock = Math.abs(dx) > 1.5 * Math.abs(dy) ? 'x' : 'y';
    if (lock !== 'x') return;
    if (e.cancelable) e.preventDefault();
    if (fxStill()) return;
    if (!els.length) { els = fxVis(); if (!els.length) return; top = els[0].getBoundingClientRect().top; fxPivot(els, top); els.forEach(c => c.classList.add('fx-mv')); }
    ang = dx / FXA.piv * 180 / Math.PI;
    els.forEach(c => c.style.transform = `rotate(${ang}deg)`);
    const d = dx < 0 ? 1 : -1;
    if (pk && +pk.dataset.d !== d) { pk.remove(); pk = null; }
    if (!pk) {
      const steps = focusSteps(curExs(), CIRC), st = steps[FXI + d], j = FXI + d;
      const t = j < 0 || j > steps.length ? null : !st ? $('#main > .card.sess') : st.grp ? $(`#main > .grp[data-grp="${st.grp}"]`) : $(`#main > .card[data-card="${st.orders[0]}"]`);
      if (t) { const r = els[0].getBoundingClientRect(); pk = fxGhost(t, { left: r.left, top, width: r.width }, 1); pk.dataset.d = d; pk.style.transformOrigin = `50% ${FXA.piv}px`; }
    }
    if (pk) { pk.style.transform = `rotate(${d * FXA.ang + ang * FXA.peek}deg)`; pk.style.opacity = Math.min(1, Math.abs(dx) / 120); }
  }, { passive: false });
  m.addEventListener('touchend', e => {
    if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0, a = ang, live = els.slice(); x0 = null; ang = 0;
    if (lock === 'x') { const eat = ev => { ev.stopPropagation(); ev.preventDefault(); }; addEventListener('click', eat, true); setTimeout(() => removeEventListener('click', eat, true), 400); }
    const n = focusSteps(curExs(), CIRC).length, i = FXI + (dx < 0 ? 1 : -1);
    const go = fxOn() && Math.abs(dx) >= 70 && Math.abs(dx) >= 2 * Math.abs(dy) && i >= 0 && i <= n;
    if (pk) { pk.remove(); pk = null; }
    if (go) { els = []; fxGo(i, a); live.forEach(c => { c.style.transform = ''; c.classList.remove('fx-mv'); }); return; }
    reset();
    if (live.length && !fxStill()) live.forEach(c => { c.classList.add('fx-mv'); c.animate([{ transform: `rotate(${a}deg)` }, { transform: 'rotate(0deg)' }], { duration: 220, easing: 'ease-out' }).onfinish = () => c.classList.remove('fx-mv'); });
  });
  m.addEventListener('touchcancel', () => { x0 = null; reset(); });
})();
/** stan pola odhaczenia: '' (puste) → ok (✓ zrobiona) → x (✕ nieudana, FAIL); pend = czeka na zapis / w kolejce */
function setState(row, st, pend){
  const btn = row.querySelector('.ok'), lt = row.querySelector('.lt'), nt = row.querySelector('.nt');
  row.dataset.st = st; row.classList.toggle('fail', st === 'x');
  if (lt) {
    const q = st ? row.dataset.rate : '';
    lt.innerHTML = lightsHtml(q) + '<small>' + (q ? RATE[q].label : 'oceń') + '</small>';
    lt.classList.toggle('pend', !!pend);
    lt.setAttribute('aria-label', 'Ocena: ' + (q ? RATE[q].label : 'brak') + (pend ? ' (czeka na zapis)' : '') + ' – dotknij, aby ocenić');
    return;
  }
  const ef = row.querySelector('.ef');
  if (ef) { ef.innerHTML = effInner(row.dataset.rpe, st); ef.setAttribute('aria-label', 'Jak ciężko: ' + effLabel(row.dataset.rpe, st) + ' – dotknij, aby ocenić'); }
  btn.textContent = st === 'x' ? '✕' : '✓';
  btn.classList.toggle('pend', !!pend);
  btn.setAttribute('aria-label', 'Seria ' + STATE_TXT[st] + (pend ? ' (czeka na zapis)' : ''));
  if (nt) nt.setAttribute('aria-label', 'Seria ' + nt.firstChild.textContent + ': ' + (st === 'x' ? 'nieudana' : row.classList.contains('t-d') ? 'drop' : 'zwykła') + ', dotknij, aby zmienić typ');
}
/** wpis serii do Logu z bieżącego stanu wiersza; film i prędkość z dotychczasowego wpisu */
function payloadOf(row, ex, s0){
  const set = setKey(row.dataset.s), prev = getLog(ex, set) || {}, st = row.dataset.st, lt = !!row.querySelector('.lt');
  const fail = st === 'x', drop = row.dataset.k === 'd' || row.classList.contains('t-d');
  const ocena = lt && st ? row.dataset.rate || '' : '';
  return { week: cur.week, day: cur.day, date: s0.date, order: ex.order, name: ex.name, set,
    kg: num(fv(row.querySelector('.kg'))), reps: num(fv(row.querySelector('.reps'))),
    rpe: fail || !st || !isNum(num(row.dataset.rpe)) ? '' : num(row.dataset.rpe), vbt: blank(prev.vbt_ms) ? '' : prev.vbt_ms,
    vbtPeak: blank(prev.vbt_peak) ? '' : prev.vbt_peak, height: blank(prev.wysokosc_cm) ? '' : prev.wysokosc_cm, path: prev.sciezka || '',
    done: st !== '', video: prev.film_link || '', typ: [drop ? 'DROP' : '', fail ? 'FAIL' : ''].filter(Boolean).join('+'), ocena, swap: swapText(ex.swap), note: exNote(ex) };
}
/** wpis od razu widoczny lokalnie (przed odpowiedzią serwera / w kolejce) */
function putLocal(ex, p){
  LOGS['local' + lid(ex, p.set)] = { id: 'local' + lid(ex, p.set), kg: p.kg, powt: p.reps, rpe: p.rpe, vbt_ms: p.vbt, wykonane: p.done ? 'TAK' : '',
    film_link: p.video, typ: p.typ, ocena: p.ocena, zamiana: p.swap, vbt_peak: p.vbtPeak, wysokosc_cm: p.height, sciezka: p.path, uwagi: p.note || '' };
}
function bindRow(row, ex, s0){
  const kind = row.dataset.k;
  const btn = row.querySelector('.ok'), nt = row.querySelector('.nt'), lt = row.querySelector('.lt'), cam = row.querySelector('.cam');
  // st: '' / ok / x; oc: ocena boju (L/S/W/X); rpe: nowe RPE (undefined = bez zmiany, '' = bez oceny)
  const save = (st, oc, rpe) => {
    // start dawno temu, a to pierwsza zapisana seria: trening był włączony przypadkiem albo za wcześnie
    const t0 = tGet()[skey()];
    if (st && t0 && !curSess().id && (Date.now() - t0 > STALE_H * 3600000 || Date.now() - t0 > LATE_START_MIN * 60000 && !document.querySelector('.set[data-st]:not([data-st=""])'))) {
      restartClock(); toast('Czas treningu liczę od teraz.');
    }
    markStart();
    const was = row.dataset.st, wasDone = cardDone(ex.order);
    if (st) row.querySelectorAll('.kg, .reps').forEach(x => { if (x.value.trim() === '' && x.dataset.ph) x.value = x.dataset.ph; });   // ✓ przy pustym polu = wartość z propozycji
    if (lt) row.dataset.rate = st ? oc || '' : '';
    // RPE serii: tylko zaliczona ma RPE; ✓ bez światła = puste (brak danych), ✕ i wyczyszczenie kasują
    row.dataset.rpe = st !== 'ok' ? '' : rpe !== undefined ? String(rpe) : lt && oc && blank(row.dataset.rpe) ? String(RATE[oc].rpe) : row.dataset.rpe || '';
    setState(row, st, true);
    const okb = row.querySelector('.ok'); if (okb && st === 'ok' && was !== 'ok') { okb.classList.remove('pop'); void okb.offsetWidth; okb.classList.add('pop'); }   // krótki ruch ✓
    const p = payloadOf(row, ex, s0);
    const inGrp = !!grpOf(ex.order);                                   // obwód: przerwa dopiero po całej rundzie (grpAfter)
    if (!was && st && kind !== 'w' && !isEmom(ex) && !inGrp) startRest(ex);       // przerwa po zaliczeniu (✓ lub ✕), nie po rozgrzewce; EMOM ma zegar minut
    putLocal(ex, p);
    if (st) followRow(row);
    refreshStats(); updateSug(ex, !!st); recAll(); refreshAll(ex.order, !!st && !wasDone);
    if (inGrp) { if (!was && st && kind !== 'w') grpAfter(ex); else grpDraw(grpOf(ex.order).id); }
    send('logSet', p).then(() => { if (row.dataset.st === st) setState(row, st); }).catch(() => {});
    const em = document.querySelector(`.emom[data-emom="${ex.order}"]`); if (em && em._draw) em._draw();
    if (st && navigator.vibrate) navigator.vibrate(st === 'x' ? [30, 60, 30] : 30);
  };
  row._save = save;                                     // EMOM: ocena rundy na pełnym ekranie
  if (cam) cam.onclick = () => openCam(ex, row, s0);
  if (btn) btn.onclick = () => save(row.dataset.st === '' ? 'ok' : row.dataset.st === 'ok' ? 'x' : '');
  // boje: dotknięcie świateł → wybór oceny pod wierszem
  if (lt) lt.onclick = () => {
    const open = row.nextElementSibling && row.nextElementSibling.classList.contains('rate');
    document.querySelectorAll('.rate, .efp').forEach(x => x.remove()); document.querySelectorAll('.ef.open').forEach(x => x.classList.remove('open'));
    if (open) return;
    row.insertAdjacentHTML('afterend', rateHtml(row.dataset.st ? row.dataset.rate : '', row.dataset.rpe));
    const box = row.nextElementSibling;
    box.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { const r = b.dataset.q; box.remove(); save(r ? (r === 'X' ? 'x' : 'ok') : '', r, r && r !== 'X' ? RATE[r].rpe : ''); });
    box.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { box.remove(); save('ok', lightOf(+b.dataset.v) || row.dataset.rate, +b.dataset.v); });   // Łatwo poprawione na RPE 8 = Średnio
    box.querySelector('button').focus();
  };
  // zwykłe ćwiczenia: dotknięcie „oceń” → cztery światła pod wierszem; wybór zapisuje serię z RPE (lib EFF)
  const ef = row.querySelector('.ef');
  if (ef) ef.onclick = () => {
    const open = row.nextElementSibling && row.nextElementSibling.classList.contains('efp');
    document.querySelectorAll('.rate, .efp').forEach(x => x.remove());
    document.querySelectorAll('.ef.open').forEach(x => x.classList.remove('open'));
    if (open) return;
    const st = row.dataset.st, q = st === 'x' ? 'X' : st ? lightOf(row.dataset.rpe) : '';
    row.insertAdjacentHTML('afterend', effPick(q, row.dataset.rpe, ex.prio === 'A')); ef.classList.add('open');
    const box = row.nextElementSibling, done = () => { box.remove(); ef.classList.remove('open'); };
    box.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { const k = b.dataset.q; done(); save(k === 'X' ? 'x' : 'ok', '', k && k !== 'X' ? EFF[k].rpe : ''); });
    box.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { done(); save('ok', '', +b.dataset.v); });
    box.querySelector('button').focus();
  };
  // typ serii pod numerem: zwykła → drop → nieudana → zwykła (niezapisana)
  if (nt) nt.onclick = () => {
    const st = row.dataset.st, isDrop = row.classList.contains('t-d');
    if (st === 'x') { save(''); return; }
    if (!isDrop) { row.classList.add('t-d'); if (st) save(st); else setState(row, st); return; }
    row.classList.remove('t-d'); save('x');
  };
  // poprawka zapisanej serii (kg, powt., RPE) → zapis od razu, bez odznaczania
  row.querySelectorAll('input, select').forEach(el => el.addEventListener('change', () => { if (row.dataset.st) save(row.dataset.st, row.dataset.rate); else updateSug(ex); }));
}
function bind(exs, s0){
  const exOf = o => exs.find(e => e.order === +o);
  const rowOf = (o, s) => document.querySelector(`.set[data-o="${o}"][data-s="${s}"]`);
  const rowsOf = (o, k) => [...document.querySelectorAll(`.set[data-o="${o}"]${k ? `[data-k="${k}"]` : ''}`)];
  // ✕ tylko przy OSTATNIM dodanym wierszu danego rodzaju (rozgrzewka, dodatkowa, drop spoza planu)
  const refreshDel = o => {
    const ex = exOf(o);
    rowsOf(o).forEach(r => { const b = r.querySelector('.del'); if (b) b.remove(); });
    ['w', 'x', 'd'].forEach(k => {
      const rs = rowsOf(o, k), last = rs[rs.length - 1];
      if (!last) return;
      if (k === 'd' && rs.length <= plannedDrops(ex)) return;       // drop z planu – nie usuwamy
      last.querySelector('.n').insertAdjacentHTML('beforeend', '<button class="del" aria-label="usuń serię">✕</button>');
    });
    recDraw(ex);                                                    // pasek rekordu zostaje pod swoją serią po dodaniu / usunięciu wiersza
    const b = document.querySelector(`[data-extra="${o}"]`);
    if (b) { const left = allowedExtra(ex) - rowsOf(o, 'x').length; b.disabled = left <= 0; b.textContent = '+ seria (' + Math.max(0, left) + ')'; }
  };
  const addRow = (o, html, after, before) => {
    if (after) after.insertAdjacentHTML('afterend', html); else before.insertAdjacentHTML('beforebegin', html);
  };
  document.querySelectorAll('.set[data-o]').forEach(row => bindRow(row, exOf(row.dataset.o), s0));
  exs.forEach(ex => refreshDel(ex.order));
  document.querySelectorAll('[data-plates]').forEach(b => b.onclick = () => openPlates(exOf(b.dataset.plates)));
  exs.forEach(updateSug);
  document.querySelectorAll('[data-more]').forEach(b => b.onclick = () => openMore(exOf(b.dataset.more)));
  document.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => openHist(exOf(b.dataset.hist)));
  document.querySelectorAll('[data-inf]').forEach(b => b.onclick = () => openInf(exOf(b.dataset.inf)));
  document.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => openFx(exOf(b.dataset.fx)));
  FXE = exs; if (!FXD) fxLoad();
  document.querySelectorAll('[data-unswap]').forEach(b => b.onclick = () => { const e = exOf(b.dataset.unswap); setSwap(e, null); if (e.swap) resaveSwap(e, e.swap.from, null); toast('Wrócono do ćwiczenia z planu.'); renderTrening(); });
  document.querySelectorAll('[data-unskip]').forEach(b => b.onclick = () => { unSkip(exOf(b.dataset.unskip)); toast('Przywrócono ćwiczenie.'); renderTrening(); });
  // komentarz do ćwiczenia: dotknięcie tekstu w karcie otwiera okno z tym komentarzem
  document.querySelectorAll('[data-note]').forEach(b => b.onclick = () => openNote(exOf(b.dataset.note)));
  exs.filter(ex => isEmom(ex) && !(ex.skip && !ex.sets)).forEach(ex => bindEmom(ex, s0, { rowsOf, rowOf, addRow, refreshDel }));
  // tryb prosty: zaznacz wszystkie niezapisane serie robocze ćwiczenia
  document.querySelectorAll('[data-all]').forEach(b => b.onclick = () => {
    const todo = [...document.querySelectorAll(`.set[data-o="${b.dataset.all}"][data-k="p"][data-st=""] .ok`)];
    todo.forEach(btn => btn.click());
    toast(todo.length ? 'Zapisano ' + todo.length + ' ' + plural(todo.length, 'serię', 'serie', 'serii') + '.' : 'Wszystkie serie są już zapisane.');
  });
  // ręczna zmiana kg / powt. w serii roboczej: wartość klienta (już nie szara) i przejście na kolejne serie z wartościami automatycznymi
  document.querySelectorAll('.sets').forEach(box => box.addEventListener('change', e => {
    const i = e.target.closest('.kg, .reps'), row = i && i.closest('.set'); if (!row || (row.dataset.k !== 'p' && row.dataset.k !== 'x')) return;
    followRow(row); placeStep(row.dataset.o);
  }));
  exs.forEach(ex => placeStep(ex.order));
  // + rozgrzewka (R1, R2…) przed seriami roboczymi
  // kolejny krok proponowanej rozgrzewki (ćwiczenie A) jako placeholder; poza propozycją wiersz pusty
  const addWarm = o => {
    const ex = exOf(o), ws = rowsOf(o, 'w'), set = 'R' + (ws.length + 1), st = warmPlan(ex)[ws.length];
    addRow(o, rowHtml(ex, set, 'w', st ? { kg: st.kg, reps: st.reps } : null), ws[ws.length - 1], rowOf(o, 1));
    const row = rowOf(o, set); bindRow(row, ex, s0);
    const wu = document.querySelector(`[data-wu="${o}"]`); if (wu) wu.hidden = true;
    return row;
  };
  document.querySelectorAll('[data-warm]').forEach(b => b.onclick = () => {
    const o = b.dataset.warm, row = addWarm(o); refreshDel(o); row.querySelector('.kg').focus();
  });
  // „Wstaw (n)”: wszystkie kroki propozycji naraz; ✓ przy pustym polu zapisuje propozycję jako R1, R2…
  document.querySelectorAll('[data-wuadd]').forEach(b => b.onclick = () => {
    const o = b.dataset.wuadd, n = warmPlan(exOf(o)).length;
    for (let i = rowsOf(o, 'w').length; i < n; i++) addWarm(o);
    refreshDel(o);
  });
  // + seria dodatkowa (tylko gdy trener pozwolił: Klienci kol. H lub Plan kol. dod_serie)
  document.querySelectorAll('[data-extra]').forEach(b => b.onclick = () => {
    const o = b.dataset.extra, ex = exOf(o);
    const work = rowsOf(o).filter(r => r.dataset.k === 'p' || r.dataset.k === 'x'), last = work[work.length - 1];
    const set = ex.sets + rowsOf(o, 'x').length + 1;
    addRow(o, rowHtml(ex, set, 'x', { kg: num(fv(last.querySelector('.kg'))), reps: num(fv(last.querySelector('.reps'))) }), last);
    bindRow(rowOf(o, set), ex, s0); refreshDel(o); placeStep(o);
  });
  // + drop set (D1, D2…) po ostatniej serii, ~80% ciężaru poprzedniej
  document.querySelectorAll('[data-drop]').forEach(b => b.onclick = () => {
    const o = b.dataset.drop, ex = exOf(o), all = rowsOf(o).filter(r => r.dataset.k !== 'w'), last = all[all.length - 1];
    const set = 'D' + (rowsOf(o, 'd').length + 1);
    addRow(o, rowHtml(ex, set, 'd', dropDefault(ex, num(fv(last.querySelector('.kg'))))), last);
    bindRow(rowOf(o, set), ex, s0); refreshDel(o);
  });
  // ✕ usuń: 1. dotknięcie = „usuń?”, 2. dotknięcie = usunięcie (także z Logu, jeśli było zapisane)
  $('#main').onclick = e => {
    if (sessClick(e)) return;
    const del = e.target.closest('.del'); if (!del) return;
    if (!del.classList.contains('arm')) { del.classList.add('arm'); del.textContent = 'usuń?'; setTimeout(() => { if (del.isConnected) { del.classList.remove('arm'); del.textContent = '✕'; } }, 3000); return; }
    const row = del.closest('.set'), o = row.dataset.o, ex = exOf(o), set = setKey(row.dataset.s);
    const saved = !!getLog(ex, set), suffix = lid(ex, set);
    Object.keys(LOGS).forEach(k => { if (k.endsWith(suffix)) delete LOGS[k]; });
    row.remove(); refreshDel(o); refreshStats(); placeStep(o);
    if (saved) send('deleteSet', { week: cur.week, day: cur.day, order: ex.order, set }).catch(() => {});
    toast('Usunięto serię ' + set + '.');
  };
  // „Licz czas od teraz”: drugie dotknięcie potwierdza
  const tr = $('#t-reset');
  if (tr) tr.onclick = () => {
    if (tr.dataset.arm) { restartClock(); delete tr.dataset.arm; tr.textContent = 'Licz czas od teraz'; toast('Czas treningu liczę od teraz.'); return; }
    tr.dataset.arm = '1'; tr.textContent = 'Na pewno? Dotknij jeszcze raz';
    setTimeout(() => { if (tr.isConnected && tr.dataset.arm) { delete tr.dataset.arm; tr.textContent = 'Licz czas od teraz'; } }, 4000);
  };
  const pk = $('#pk-on');   // „Zdejmij 1 trening z pakietu” (tylko „Prowadź”): przełącza na miejscu
  if (pk) pk.onclick = () => { PKG_ON = !PKG_ON; const h = pk.onclick; $('#pk-on').outerHTML = pkgLiveBox(curSess()); $('#pk-on').onclick = h; };
  $('#saveSess').onclick = () => {
    stopRest(); wake(false);
    const s = curSess(), k = skey();
    const pains = {};
    document.querySelectorAll('.pl.on').forEach(c => {
      const v = document.querySelector(`.prow[data-p="${c.dataset.p}"] .scale`).dataset.v;
      if (v !== '') pains[c.dataset.p] = +v;
    });
    const vals = Object.values(pains);
    const end = Date.now(), st = startOf();
    // jednostka już zapisana → zachowaj pierwotny czas; nowa → od pierwszego wpisu do teraz
    const own = num($('#smin').value);                  // ręczna poprawka ma pierwszeństwo
    const minutes = isNum(own) && own > 0 ? Math.round(own) : s.id ? (blank(s.czas_min) ? '' : s.czas_min) : (st ? Math.max(1, Math.round((end - st) / 60000)) : '');
    const p = { week: cur.week, day: cur.day, date: s0.date, knee: pains.kolano ?? '', shoulder: pains.bark ?? '',
      pain: Object.entries(pains).map(([a, b]) => a + ':' + b).join('; '), painMax: vals.length ? Math.max(...vals) : '',
      feel: +$('#feel').dataset.v || 3,
      rpeSession: $('#srpe').dataset.v === '' ? '' : +$('#srpe').dataset.v, minutes, note: $('#snote').value,
      start: s.id ? (s.start || '') : (st ? new Date(st).toISOString() : ''),
      end: s.id ? (s.koniec || '') : new Date(end).toISOString() };
    if (LIVE && !s.id && DATA && DATA.pkg) {   // logSession dopisuje wiersz „trening” w zakładce Pakiety (odhaczone = usuwa go)
      p.pkg = PKG_ON ? 1 : 0;
      p.title = (PLAN.find(r => String(r.week) === String(cur.week) && String(r.day) === String(cur.day) && r.title) || {}).title || '';
      if (PKG_ON) DATA.pkg = Object.assign({}, DATA.pkg, { left: DATA.pkg.left - 1, used: DATA.pkg.used + 1 });
      PKG_ON = true;
    }
    SESS['local|' + k] = { id: 'local|' + k, bol_kolano: p.knee, bol_bark: p.shoulder, bol: p.pain, bol_max: p.painMax, rpe_sesji: p.rpeSession, samopoczucie: p.feel, czas_min: p.minutes,
      uwagi: p.note, start: p.start, koniec: p.end };
    const m = tGet(); delete m[k]; delete m['r|' + k]; tSet(m);
    // nowa jednostka: okno „Trening zrobiony” (liczone przed render, z danych w telefonie); poprawka zapisanej: tylko komunikat
    const sum = s.id ? null : doneSummary(minutes), nx = s.id ? null : nextDraft();   // prowadzony trening: „Zaplanuj następną”
    const after = off => { render(); if (nx && !off) openNext(nx, sum, off); else if (sum) openDone(sum, off); else toast(off ? 'Brak sieci – zapiszę, gdy wróci połączenie.' : 'Zmiany zapisane.'); };
    send('logSession', p).then(() => after(false)).catch(() => after(true));
  };
}
// pole z wpisaną wartością: dotknięcie zaznacza całość, więc pierwsza cyfra nadpisuje zamiast dopisywać
$('#main').addEventListener('focusin', e => { const i = e.target.closest('.set input'); if (i && i.value) setTimeout(() => { try { i.select(); } catch (er) {} }, 0); });
// start zegara przy pierwszym wpisie w serii lub uwagach
$('#main').addEventListener('input', e => { if (e.target.closest('.set') || e.target.id === 'snote') markStart(); });
$('#main').addEventListener('change', e => { if (e.target.closest('.set')) markStart(); });

/* ---------- film: wgrywanie w kawałkach do Google Drive ---------- */
function readB64(blob){
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
}
/* ---------- kolejka filmów: plik zostaje w telefonie (IndexedDB), wysyłka kawałkami, wznawiana po przerwie ----------
 * Przerwa (aplikacja w tle, wygaszony ekran, brak sieci, zamknięta aplikacja) nie kasuje postępu: przy powrocie do
 * aplikacji, odzyskaniu sieci albo następnym otwarciu wysyłka rusza od miejsca, w którym stanęła. Postęp sesji trzymamy
 * w localStorage (vqp_…), żeby nie zapisywać filmu ponownie po każdym kawałku.
 */
const VQ_CHUNK = 8 * 1024 * 1024;                              // wielokrotność 256 KB (wymóg Google)
const VQ_MEM = {}, VQ_LIVE = {};                               // VQ_MEM: gdy IndexedDB niedostępne; VQ_LIVE: sesje znane w tym uruchomieniu
let VQ_DB = null, VQ_BUSY = false, VQ_WAKE = null, VQ_NOW = null, VQ_IDS = [];
function vqDb(){
  if (!VQ_DB) VQ_DB = new Promise((res, rej) => {
    try { const r = indexedDB.open('trening-filmy', 1); r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch (e) { rej(e); }
  });
  return VQ_DB;
}
async function vqTx(mode, fn){
  const db = await vqDb();
  return new Promise((res, rej) => { const t = db.transaction('q', mode), q = fn(t.objectStore('q')); t.oncomplete = () => res(q ? q.result : undefined); t.onerror = () => rej(t.error); });
}
async function vqAll(){
  let saved = []; try { saved = await vqTx('readonly', s => s.getAll()) || []; } catch (e) {}
  const by = {}; saved.concat(Object.values(VQ_MEM)).forEach(r => { if (r.key === KEY) by[r.id] = r; });
  return Object.values(by).sort((a, b) => a.created - b.created);
}
async function vqPut(r){ VQ_MEM[r.id] = r; try { await vqTx('readwrite', s => s.put(r)); delete VQ_MEM[r.id]; } catch (e) {} }
async function vqDel(id){ delete VQ_MEM[id]; delete VQ_LIVE[id]; try { localStorage.removeItem('vqp_' + id); } catch (e) {} try { await vqTx('readwrite', s => s.delete(id)); } catch (e) {} }
const vqP = id => { try { return JSON.parse(localStorage.getItem('vqp_' + id) || '{}'); } catch (e) { return {}; } };
const vqPSet = (id, p) => { try { localStorage.setItem('vqp_' + id, JSON.stringify(p)); } catch (e) {} };
const vqId = (v) => [KEY, v.week, v.day, v.order, v.set].join('|');
/** film do kolejki i od razu w drogę; arkusz kamery można zamknąć */
async function queueVideo(ex, s0, file, row){
  const set = setKey(row.dataset.s), v = { week: cur.week, day: cur.day, order: ex.order, set, name: ex.name, date: s0.date };
  const r = { id: vqId(v), key: KEY, file, size: file.size, v, created: Date.now(),
    meta: { date: s0.date, day: cur.day, name: ex.name, set, fileName: file.name, mimeType: file.type || 'video/mp4', size: file.size } };
  const bad = filmOk({ size: file.size, mimeType: file.type, fileName: file.name }); if (bad) { toast(bad); return; }   // 1 GB, tylko wideo (jak serwer)
  await vqDel(r.id); await vqPut(r);
  closeSheet(); vqMarks();
  toast(navigator.onLine === false ? 'Brak sieci: film poczeka w telefonie i wyśle się sam po odzyskaniu zasięgu.'
    : 'Film w kolejce (seria ' + setLabel(set, row.dataset.k) + '). Możesz trenować dalej.');
  vqRun();
}
/** film skoku CMJ → kolejka (ta sama wysyłka co filmy serii) → Dysk „<Imię>/Dyspozycja/<data>/”, link w Dyspozycja.film_link */
async function queueCmjVideo(file, date, n){
  if (!file) return;
  const bad = filmOk({ size: file.size, mimeType: file.type, fileName: file.name }); if (bad) { toast(bad); return; }
  const v = { kind: 'cmj', date, set: n, name: 'CMJ skok ' + n };
  const r = { id: [KEY, 'cmj', date, n].join('|'), key: KEY, file, size: file.size, v, created: Date.now(),
    meta: { kind: 'cmj', date, day: 'Dyspozycja', name: 'CMJ', set: n, fileName: file.name, mimeType: file.type || 'video/mp4', size: file.size } };
  await vqDel(r.id); await vqPut(r);
  toast(navigator.onLine === false ? 'Film skoku poczeka w telefonie i wyśle się po odzyskaniu sieci.' : 'Film skoku wysyła się do trenera.');
  vqRun();
}
/** stan w pasku i oznaczenie kamer przy seriach z filmem w kolejce */
async function vqMarks(){
  const all = await vqAll(); VQ_IDS = all.map(r => r.id);
  document.querySelectorAll('.set').forEach(row => {
    const c = row.querySelector('.cam'), ex = PLAN.find(x => x.week === cur.week && x.day === cur.day && x.order === +row.dataset.o);
    if (c && ex) c.classList.toggle('pend', VQ_IDS.indexOf(vqId({ week: cur.week, day: cur.day, order: ex.order, set: setKey(row.dataset.s) })) >= 0);
  });
  const bad = all.filter(r => vqP(r.id).failed).length, wait = all.length - bad;
  if (VQ_NOW) setSync('film ' + Math.round(100 * VQ_NOW.f) + '%' + (wait > 1 ? ' · w kolejce ' + wait : ''));
  else if (wait) setSync('filmy w kolejce: ' + wait + (navigator.onLine === false ? ' (brak sieci)' : ''));
  else if (bad) setSync('film niewysłany – otwórz kamerę przy serii');
}
async function vqWake(on){
  try {
    if (on && !VQ_WAKE && navigator.wakeLock) VQ_WAKE = await navigator.wakeLock.request('screen');
    if (!on && VQ_WAKE) { VQ_WAKE.release(); VQ_WAKE = null; }
  } catch (e) { VQ_WAKE = null; }
}
const vqNet = e => /Failed to fetch|NetworkError|Load failed|sieć|HTTP 5|timeout/i.test(String(e && e.message));
async function vqRun(){
  if (VQ_BUSY || navigator.onLine === false || !KEY) return;
  VQ_BUSY = true;
  try {
    for (;;) {
      const r = (await vqAll()).find(x => !vqP(x.id).failed);
      if (!r || navigator.onLine === false) break;
      vqWake(true);                                             // ekran nie gaśnie, dopóki film się wysyła
      try { await vqOne(r); }
      catch (e) {
        if (vqNet(e)) break;                                    // sieć: spróbujemy przy powrocie do aplikacji / sieci
        const p = vqP(r.id); p.tries = (p.tries || 0) + 1;
        if (/wygasła|expired/i.test(e.message)) { p.url = null; p.uploadId = null; p.next = 0; }
        if (/limit to 1 GB|To nie jest film|Pusty plik/.test(e.message)) p.tries = 3;   // serwer odrzucił plik (filmOk_): bez ponawiania
        if (p.tries >= 3) { p.failed = e.message; reportErr('film', r.v.name + ' S' + r.v.set + ', ' + Math.round(r.size / 1048576) + ' MB: ' + e.message); }
        vqPSet(r.id, p); delete VQ_LIVE[r.id];
        if (!p.failed) break;
      }
    }
  } finally { VQ_BUSY = false; VQ_NOW = null; vqWake(false); vqMarks(); }
}
function vqXhr(url, blob, range, onProg){
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    if (range) x.setRequestHeader('Content-Range', range);
    x.upload.onprogress = e => { if (e.lengthComputable) onProg(e.loaded / e.total); };
    x.onload = () => {
      if (x.status === 308) return res({ done: false });
      if (x.status === 200 || x.status === 201) {
        try { const f = JSON.parse(x.responseText); res({ done: true, link: f.webViewLink || ('https://drive.google.com/file/d/' + f.id + '/view') }); }
        catch (e) { rej(new Error('odpowiedź Drive nieczytelna')); }
      } else rej(new Error(x.status >= 500 ? 'HTTP ' + x.status : 'Drive ' + x.status));
    };
    x.onerror = () => rej(new Error('Failed to fetch'));
    x.send(blob);
  });
}
/** jeden film: sesja → kawałki → link przy serii */
async function vqOne(r){
  const p = vqP(r.id), save = () => vqPSet(r.id, p);
  const show = f => { VQ_NOW = { id: r.id, f }; vqMarks(); };
  if (p.link) return vqDone(r, p.link);
  if (!p.url && !p.uploadId) {
    const init = await call('startUpload', Object.assign({ origin: location.origin }, r.meta));
    Object.assign(p, init.url ? { url: init.url, mode: 'direct' } : { uploadId: init.uploadId, chunk: init.chunk, mode: 'relay' }, { next: 0 });
    save(); VQ_LIVE[r.id] = 1;
  }
  if (p.url && !VQ_LIVE[r.id] && p.next > 0) {                 // wznowienie: zapytaj Google, ile naprawdę doszło
    const st = await call('uploadStatus', p.url, r.size);
    if (st.done) { p.link = st.link; save(); return vqDone(r, st.link); }
    if (st.expired) { p.url = null; p.next = 0; save(); return vqOne(r); }
    p.next = st.next; save();
  }
  VQ_LIVE[r.id] = 1;
  if (p.mode === 'direct') {
    while (p.next < r.size) {
      const end = Math.min(p.next + VQ_CHUNK, r.size), from = p.next;
      let res;
      try { res = await vqXhr(p.url, r.file.slice(from, end), 'bytes ' + from + '-' + (end - 1) + '/' + r.size, f => show((from + f * (end - from)) / r.size)); }
      catch (e) {
        if (from > 0 || navigator.onLine === false || !vqNet(e)) throw e;
        // pierwszy kawałek odrzucony mimo sieci: przeglądarka nie puszcza wysyłki kawałkami → cały plik naraz, a potem przez serwer
        try { res = await vqXhr(p.url, r.file, '', f => show(f)); }
        catch (e2) { Object.assign(p, { url: null, mode: 'relay', next: 0 }); const init = await call('startUpload', r.meta); p.uploadId = init.uploadId; p.chunk = init.chunk; save(); return vqOne(r); }
      }
      if (res.done) { p.link = res.link; save(); return vqDone(r, res.link); }
      p.next = end; save();
    }
  }
  while (p.next < r.size) {                                     // przez serwer (gdy Google nie przyjmuje wysyłki z przeglądarki)
    const end = Math.min(p.next + p.chunk, r.size);
    const out = await call('uploadChunk', p.uploadId, await readB64(r.file.slice(p.next, end)), p.next, r.size);
    p.next = end; save(); show(end / r.size);
    if (out.done) { p.link = out.link; save(); return vqDone(r, out.link); }
  }
  throw new Error('wysyłka nie zakończyła się linkiem');
}
async function vqDone(r, link){
  if (r.v.kind === 'cmj') { await call('logReadyVideo', { link, date: r.v.date, n: r.v.set }); await vqDel(r.id); toast('Film skoku ' + r.v.set + ' wysłany.'); return; }
  await call('logVideo', Object.assign({ link }, r.v));
  const suffix = ['', r.v.week, r.v.day, r.v.order, r.v.set].join('|');
  for (const k in LOGS) if (k.endsWith(suffix)) LOGS[k].film_link = link;
  await vqDel(r.id);
  toast('Film wysłany: ' + r.v.name + ', seria ' + r.v.set + '.');
  document.querySelectorAll('.set').forEach(row => { const ex = PLAN.find(x => x.week === cur.week && x.day === cur.day && x.order === +row.dataset.o); if (ex) camMark(row, ex); });
}
window.addEventListener('online', vqRun);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') vqRun(); });
const camMark = (row, ex) => { const l = getLog(ex, setKey(row.dataset.s)) || {}, c = row.querySelector('.cam'); if (c) c.classList.toggle('has', !!l.film_link || !blank(l.vbt_ms) || !!l.sciezka); };
/* śledzenie talerza (track, videoSource, fixDuration) jest w vbt.js: wspólne z panelem trenera */
const f2 = v => fmtKg(Math.round(v * 100) / 100);
function vbtResult(res){
  if (!res.reps.length) return '<p class="hint">Nie wykryłem powtórzenia (ruch w górę ≥ 15 cm). Sprawdź, czy talerz był widoczny przez cały film i czy dotknąłeś jego środka.</p>';
  const M = (l, v, u) => `<div class="metric"><span>${l}</span><b>${v}</b>${u ? `<small>${u}</small>` : ''}</div>`;
  const m = res.kind === 'oly' ? M('v max', f2(res.vmax), 'm/s') + M('Uniesienie', res.h, 'cm') + M('Powt.', res.reps.length)
    : M('MCV najlepsze', f2(res.mcv), 'm/s') + M('Spadek', Math.round(res.loss), '%') + M('Powt.', res.reps.length);
  return `<div class="metrics">${m}</div>${pathSVG(vbtOut(res).path)}
    <table class="reps"><thead><tr><th>Powt.</th><th>MCV m/s</th><th>v peak m/s</th><th>Zakres cm</th></tr></thead><tbody>` +
    res.reps.map(r => `<tr><td>${r.n}</td><td>${f2(r.mcv)}</td><td>${f2(r.peak)}</td><td>${Math.round(r.dy * 100)}</td></tr>`).join('') + '</tbody></table>';
}
/** tryb „Film + ścieżka + VBT”: start powtórzenia suwakiem, środek i krawędź talerza, analiza w telefonie */
function vbtStage(file, ex, row, s0){
  const stage = $('#cam-stage'), url = URL.createObjectURL(file), abort = { stop: false, busy: false, done: false };
  let c0 = null, r0 = null, ds = 1, res = null;
  SHEET_ON_CLOSE = () => { abort.stop = true; URL.revokeObjectURL(url); };
  stage.innerHTML = `<div class="vbox"><canvas id="vc" width="360" height="200" role="img" aria-label="Klatka filmu: dotknij środka talerza, potem jego krawędzi"></canvas></div>
    <p class="hint" id="vhint" aria-live="polite">Wczytuję film…</p>
    <label class="fl">Start powtórzenia<input type="range" class="scrub" id="vs" min="0" max="1000" value="0"></label>
    <div class="bar" id="vpg"><i></i></div><div id="vres"></div>
    <div class="uact"><button type="button" class="btn" id="vreset">Od nowa</button><button type="button" class="btn go" id="vgo" disabled>Analizuj</button></div>`;
  const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;
  const cv = $('#vc'), cx = cv.getContext('2d'), hint = $('#vhint'), css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const paint = () => {
    cx.drawImage(video, 0, 0, cv.width, cv.height);
    if (c0 && !abort.done) {
      cx.strokeStyle = cx.fillStyle = css('--accent'); cx.lineWidth = 2;
      cx.beginPath(); cx.arc(c0.x * ds, c0.y * ds, (r0 || 4) * ds, 0, 7); cx.stroke();
      cx.beginPath(); cx.arc(c0.x * ds, c0.y * ds, 3, 0, 7); cx.fill();
    }
  };
  video.addEventListener('loadedmetadata', async () => {
    ds = 360 / video.videoWidth; cv.width = 360; cv.height = Math.round(video.videoHeight * ds);
    await fixDuration(video);
    video.currentTime = Math.min(0.05, (video.duration || 1) / 2);
  });
  video.addEventListener('seeked', () => { if (!abort.busy) { paint(); if (!c0) hint.textContent = 'Przesuń suwak do startu powtórzenia, potem dotknij środka talerza.'; } });
  video.addEventListener('error', () => { hint.textContent = 'Ta przeglądarka nie odtworzy tego pliku. Nagraj film w formacie MP4 (H.264).'; });
  $('#vs').addEventListener('input', e => { if (isFinite(video.duration) && !abort.busy) video.currentTime = video.duration * e.target.value / 1000; });
  cv.addEventListener('click', e => {
    if (abort.busy || !video.videoWidth) return;
    const b = cv.getBoundingClientRect(), px = (e.clientX - b.left) * cv.width / b.width / ds, py = (e.clientY - b.top) * cv.height / b.height / ds;
    if (!c0) { c0 = { x: px, y: py }; hint.textContent = 'Teraz dotknij górnej krawędzi talerza (kalibracja: 450 mm).'; }
    else if (!r0) {
      r0 = Math.hypot(px - c0.x, py - c0.y);
      if (r0 < 6) { r0 = null; hint.textContent = 'Za blisko środka. Dotknij samej krawędzi talerza.'; return; }
      hint.textContent = 'Talerz: ' + Math.round(2 * r0) + ' px = 450 mm. Dotknij „Analizuj”.'; $('#vgo').disabled = false;
    }
    paint();
  });
  $('#vreset').onclick = () => { if (abort.busy) return; abort.done = false; c0 = null; r0 = null; res = null; $('#vgo').disabled = true; $('#vres').innerHTML = ''; paint(); hint.textContent = 'Dotknij środka talerza.'; };
  $('#vgo').onclick = async () => {
    abort.busy = true; $('#vgo').disabled = true;
    const pg = $('#vpg'); pg.style.display = 'block'; hint.textContent = 'Śledzę talerz…';
    const px = [];
    try {
      const pts = await track(videoSource(video), c0, r0, (p, x, y) => {
        px.push([x, y]); pg.querySelector('i').style.width = Math.round(p * 100) + '%';
        paint(); cx.fillStyle = css('--light-amber'); cx.beginPath(); cx.arc(x * ds, y * ds, 4, 0, 7); cx.fill();
      }, abort);
      if (abort.stop) return;
      res = analyse(pts, groupOf(ex.group, ex.name));
      hint.textContent = 'Gotowe: ' + pts.length + ' klatek.';
      paint(); cx.strokeStyle = css('--accent'); cx.lineWidth = 2.5; cx.beginPath();
      px.forEach((q, i) => i ? cx.lineTo(q[0] * ds, q[1] * ds) : cx.moveTo(q[0] * ds, q[1] * ds)); cx.stroke();
      $('#vres').innerHTML = vbtResult(res) + (res.reps.length ? '<button type="button" class="btn p" id="vsave">Zapisz przy serii</button>' : '');
      const sv = $('#vsave');
      if (sv) sv.onclick = () => {
        const o = vbtOut(res), p = Object.assign(payloadOf(row, ex, s0), { vbt: o.vbt, vbtPeak: o.vbtPeak, height: o.height, path: JSON.stringify(o.path) });
        putLocal(ex, p); camMark(row, ex);
        send('logSet', p).catch(() => {});
        queueVideo(ex, s0, file, row);
      };
    } catch (err) { hint.textContent = 'Analiza przerwana: ' + err.message; }
    pg.style.display = 'none'; abort.busy = false; abort.done = true; $('#vgo').disabled = false;
  };
}
/** okno kamery serii: film na Drive, (PRO) analiza ścieżki i VBT z filmu, prędkość wpisana z urządzenia, np. Enode */
function openCam(ex, row, s0){
  const set = setKey(row.dataset.s), l = getLog(ex, set) || {};
  let mode = 'film', saved = '';
  if (!SIMPLE && (l.sciezka || !blank(l.vbt_peak))) {
    let pts = []; try { pts = JSON.parse(l.sciezka || '[]'); } catch (e) {}
    saved = `<div class="saved"><p>Zapisana analiza: ${isOly(ex) ? 'v max' : 'MCV'} <b>${fmtKg(l.vbt_ms)} m/s</b>${blank(l.wysokosc_cm) ? '' : ` · <b>${fmtKg(l.wysokosc_cm)} cm</b>`}</p>${pathSVG(pts)}</div>`;
  }
  openSheet(`<h2 id="sheet-t">Film · seria ${esc(setLabel(set, row.dataset.k))}</h2><p class="sub">${esc(ex.name)}</p>
    ${l.film_link ? `<a class="btn" href="${esc(l.film_link)}" target="_blank" rel="noopener">Otwórz zapisany film</a>` : ''}
    ${saved}
    <div id="cam-q"></div>
    ${SIMPLE ? '' : `<div class="seg" role="group" aria-label="Co zrobić z filmem"><button type="button" data-m="film">Tylko film</button><button type="button" data-m="vbt">Film + ścieżka + VBT</button></div>
    <p class="sub" id="cam-tip" hidden>Nagraj z boku, cały talerz w kadrze, telefon nieruchomo na wysokości bioder. Lekki skos jest w porządku: prędkość i wysokość liczą się z ruchu w pionie. Analiza działa w telefonie, także bez sieci.</p>`}
    <label class="btn p">${l.film_link ? 'Nagraj nowy film' : 'Nagraj film'}<input type="file" accept="video/*" capture="environment" hidden id="cam-rec"></label>
    <label class="btn">Wybierz film z telefonu<input type="file" accept="video/*" hidden id="cam-file"></label>
    <div id="cam-stage"></div>
    <div class="bar" id="cam-bar"><i></i></div>
    <p class="hint" id="cam-msg" hidden></p>
    ${SIMPLE ? '' : `<label class="fl">Prędkość z urządzenia (m/s)<input id="cam-vbt" inputmode="decimal" value="${esc(fmtKg(blank(l.vbt_ms) ? '' : l.vbt_ms))}" placeholder="np. 0,85"></label>
    <button type="button" class="btn" id="cam-vsave">Zapisz prędkość</button>`}
    <button type="button" class="btn" data-close>Zamknij</button>`);
  vqAll().then(all => {
    const r = all.find(x => x.id === vqId({ week: cur.week, day: cur.day, order: ex.order, set })), box = $('#cam-q'); if (!r || !box) return;
    const p = vqP(r.id), now = VQ_NOW && VQ_NOW.id === r.id ? Math.round(100 * VQ_NOW.f) + '%' : '';
    box.innerHTML = `<div class="vq" role="status">${p.failed ? 'Film nie został wysłany: ' + esc(p.failed) : now ? 'Film się wysyła: ' + now : 'Film czeka w kolejce' + (navigator.onLine === false ? ' (brak sieci)' : '')} · ${Math.round(r.size / 1048576)} MB<br>` +
      (p.failed ? '<button type="button" class="btn sm" id="vq-retry">Spróbuj ponownie</button>' : '') + '<button type="button" class="btn sm" id="vq-del">Usuń z kolejki</button></div>';
    const rt = $('#vq-retry'); if (rt) rt.onclick = () => { vqPSet(r.id, {}); closeSheet(); vqRun(); toast('Wysyłam film ponownie.'); };
    $('#vq-del').onclick = async () => { if (VQ_NOW && VQ_NOW.id === r.id) { toast('Film właśnie się wysyła – poczekaj albo spróbuj za chwilę.'); return; } await vqDel(r.id); closeSheet(); vqMarks(); toast('Usunięto film z kolejki.'); };
  });
  const setMode = m => { mode = m; document.querySelectorAll('#sheet [data-m]').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === m)); const t = $('#cam-tip'); if (t) t.hidden = m !== 'vbt'; };
  document.querySelectorAll('#sheet [data-m]').forEach(b => b.onclick = () => setMode(b.dataset.m));
  setMode(mode);
  $('#cam-file').onchange = $('#cam-rec').onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    markStart();
    if (mode === 'vbt') vbtStage(file, ex, row, s0); else queueVideo(ex, s0, file, row);
  };
  const vs = $('#cam-vsave');
  if (vs) vs.onclick = () => {
    const v = num($('#cam-vbt').value), p = Object.assign(payloadOf(row, ex, s0), { vbt: isNum(v) ? v : '' });
    putLocal(ex, p); camMark(row, ex);
    send('logSet', p).catch(() => {});
    closeSheet(); toast(isNum(v) ? 'Zapisano prędkość ' + fmtKg(v) + ' m/s.' : 'Usunięto prędkość.');
  };
}

/* ---------- animacja otwarcia „Siła z Ruchu” ----------
   Zasłona #intro jest w HTML na samej górze; mały skrypt pod nią zostawia ją tylko przy wejściu po co najmniej 30 minutach bez aplikacji (i bez ograniczenia ruchu).
   Tu sam ruch: pomarańczowa linia = tor sztangi w rwaniu w tempie boju (lib introTempo), jasna linia = taniec na wysokości talerza (lib introDance),
   napis litera po literze, chwila na przeczytanie, zgaszenie (czasy: lib INTRO, introTimes). Dotknięcie albo klawisz pomija.
   Dane ładują się w tym czasie pod zasłoną (load nie czeka na animację). Każdy błąd = zasłona znika od razu. */
let introEnd = null;                                   // kończy od razu trwającą animację (null = nic nie gra)
function introRun(){
  const S = $('#intro'); if (!S) return;
  const I = TL.INTRO, tc = $('#intro-tc');
  let over = false, raf = 0, guard = 0;
  const end = () => {
    if (over) return; over = true; introEnd = null;
    cancelAnimationFrame(raf); clearTimeout(guard); removeEventListener('keydown', skip, true);
    S.remove(); if (tc) tc.remove();
  };
  introEnd = end;
  function skip(){                                     // szybkie zgaszenie zamiast czekania do końca
    if (over || S.dataset.skip) return; S.dataset.skip = '1';
    try { S.animate([{ opacity: getComputedStyle(S).opacity }, { opacity: 0 }], { duration: I.SKIP, fill: 'forwards' }).onfinish = end; } catch (e) {}
    setTimeout(end, I.SKIP + 60);
  }
  try {
    const bar = $('#in-bar'), dance = $('#in-dance'), ring = $('#in-ring'), hub = $('#in-hub'), dot = $('#in-dot');
    const letters = [...S.querySelectorAll('.in-wm span')], tm = TL.introTimes(letters.length);
    const LB = bar.getTotalLength(), LD = dance.getTotalLength(), N = 240, dy = [];
    for (let i = 0; i <= N; i++) dy.push(dance.getPointAtLength(LD * i / N).y);        // wysokość linii tańca co 1/N jej długości
    const danceAt = TL.introDance(dy, bar.getPointAtLength(LB * I.TEMPO[3][1]).y);
    const frame = k => {                               // k = ułamek czasu ruchu sztangi (lib przycina do 0…1)
      const sb = TL.introTempo(k), p = bar.getPointAtLength(LB * sb), sd = danceAt(sb, p.y), d = dance.getPointAtLength(LD * sd);
      bar.style.strokeDashoffset = 1 - sb; dance.style.strokeDashoffset = 1 - sd;
      [ring, hub].forEach(c => { c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); });
      dot.setAttribute('cx', d.x); dot.setAttribute('cy', d.y);
    };
    // pomijanie przy puszczeniu palca, nie przy dotknięciu: zasłona jeszcze stoi, więc to samo dotknięcie nie trafi w przycisk pod spodem
    S.addEventListener('pointerup', skip); S.addEventListener('click', skip); addEventListener('keydown', skip, true);
    guard = setTimeout(end, tm.end + 4000);            // gdyby przeglądarka nie zgłosiła klatki albo końca zgaszenia
    // zegar rusza z pierwszą klatką po narysowaniu aplikacji pod spodem; napis, podpis i zgaszenie to animacje przeglądarki z opóźnieniem od tej chwili
    raf = requestAnimationFrame(t0 => {
      try {
        S.style.animation = 'none';                    // ruch ruszył: bezpiecznik z CSS niepotrzebny, pilnuje guard
        letters.forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
          { duration: I.LETTER_IN, delay: tm.text + i * I.LETTER, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }));
        S.querySelector('.in-tag').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, delay: tm.grab + 150, fill: 'forwards' });
        dot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, delay: tm.grab, fill: 'forwards' });   // kropka tańca gaśnie w talerzu
        S.animate([{ opacity: 1 }, { opacity: 0 }], { duration: I.OUT, delay: tm.fade, fill: 'forwards' }).onfinish = end;
        const step = t => { const k = (t - t0 - I.PRE) / I.T; frame(k); if (k < 1 && !over) raf = requestAnimationFrame(step); };
        step(t0);
      } catch (e) { end(); }
    });
  } catch (e) { end(); }
}

/* Znacznik „ostatnio na ekranie” (pamięć telefonu „intro”) i powrót do otwartej aplikacji.
   introMark odświeża znacznik przy starcie, co minutę, gdy aplikacja jest na ekranie (na wypadek, gdyby telefon zamknął stronę bez ostrzeżenia), i w chwili schowania.
   Schowana aplikacja znacznika nie odświeża. Gdy wraca na ekran po przerwie ≥ INTRO_GAP bez przeładowania strony, animacja idzie jeszcze raz (introVis);
   o powrocie decyduje chwila schowania zapamiętana w tej karcie, nie zegar co minutę, więc animacja nigdy nie wyskoczy z opóźnieniem w trakcie pracy.
   Schowanie aplikacji w trakcie animacji kończy ją od razu: po powrocie jest aplikacja, a nie resztka zasłony. */
let introHid = 0;                                      // kiedy aplikacja zeszła z ekranu (0 = jest na ekranie)
const introMark = () => { try { localStorage.setItem('intro', Date.now()); } catch (e) {} };
function introVis(){
  if (document.hidden) {                                // liczy się pierwsze zgłoszenie schowania: kolejne (np. przy zamykaniu schowanej strony) nie przesuwają znacznika
    if (!introHid) { introHid = Date.now(); introMark(); if (introEnd) introEnd(); }
    return;
  }
  const away = introHid ? Date.now() - introHid : 0; introHid = 0;
  introMark();
  if (away >= INTRO_GAP && !$('#intro') && introShow()) introRun();
}
document.addEventListener('visibilitychange', introVis);
addEventListener('pagehide', () => { if (!document.hidden) introMark(); });
setInterval(() => { if (!document.hidden) introMark(); }, 60000);

introRun();
if (!document.hidden) introMark();
load();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
