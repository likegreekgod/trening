/* ---------- import historii treningów z innej aplikacji (Hevy, Strong, szablon CSV) ----------
 * Plik CSV czyta panel trenera (web/lib.js: importParse, importPick) i wysyła wspólną postać:
 * workouts = [{date, start (ISO z Z), end, title, note, ex: [{name, sup, note, sets: [{t: W|R|D, kg, reps, sec, rpe}]}]}].
 * Każdy trening = własna jednostka klienta (Plan.zrodlo = klient) w tygodniu 0, dzień H<rrmmdd>[b…], bez bloku,
 * tytuł „Hevy · …” / „Strong · …” / „Import · …”, do tego serie w Logu i wpis w Sesjach (start, koniec, czas).
 * Własne jednostki nie wchodzą do wykonania planu; serie liczą się do rekordów, Siły i objętości.
 * Ponowny import zastępuje poprzedni, „Cofnij import” usuwa wszystkie wiersze importu klienta. Panel: trImport.
 */
const IMPORT_MAX = 3000;               // treningów w jednym imporcie
const IMPORT_SETS_MAX = 60000;         // serii w jednym imporcie
const IMPORT_SRC = { hevy: 'Hevy', strong: 'Strong', szablon: 'Import' };
const IMPORT_DAY = /^H\d{6}[a-h]?$/;
const importUnit_ = (week, day) => String(week) === '0' && IMPORT_DAY.test(String(day || ''));

/**
 * Nazwy z Hevy i Stronga, których reguła „sprzęt + nazwa” nie znajduje w bazie (sprawdzone na eksporcie klienta 24.11.2026).
 * Wartość = nazwa w zakładce Ćwiczenia. Własne nazwy klienta zostają bez zmian (trener dopisuje alias, ponowny import je połączy).
 */
const CW_IMPORT = {
  'Overhead Press (Barbell)': 'Press', 'Overhead Press (Dumbbell)': 'Dumbbell Press', 'Seated Overhead Press (Barbell)': 'Seated Barbell Military Press',
  'Bicep Curl (Barbell)': 'Barbell Curl', 'Farmers Walk': 'Farmer Carry', 'Dumbbell Row': 'Single-Arm Dumbbell Row',
  'Bent Over Row (Dumbbell)': 'Bent Over Two-Dumbbell Row', 'Pull Up (Assisted)': 'Band Assisted Pull-Up', 'Treadmill': 'Running, Treadmill',
  'Triceps Pressdown': 'Tricep Pushdown', 'Bulgarian Split Squat (Dumbbell)': 'Bulgarian Split Squat', 'Reverse Lunge (Dumbbell)': 'Reverse Lunge',
  'Seated Cable Row - V Grip (Cable)': 'Low Cable Row', 'Seated Cable Row - Bar Grip': 'Low Cable Row', 'Chest Fly (Dumbbell)': 'Dumbbell Flyes',
  'Cable Fly Crossovers': 'Cable Crossover', 'Chest Dip': 'Dip', 'Triceps Dip': 'Dip', 'T Bar Row': 'T-Bar Row with Handle',
  'Rear Delt Reverse Fly (Dumbbell)': 'Rear Delt Fly', 'Hip Abduction (Machine)': 'Thigh Abductor', 'Jump Rope': 'Rope Jumping',
  'Rowing Machine': 'Rowing, Stationary', 'Overhead Triceps Extension (Cable)': 'Cable Overhead Tricep Extension'
};
const IMPORT_EQ = /^(.*?)\s*\((Barbell|Dumbbell|Cable|Machine|Kettlebell|Smith Machine|Band|Bodyweight|Weighted|Assisted|EZ Bar|Suspension)\)\s*$/i;

/**
 * Czysta funkcja: nazwa ćwiczenia z innej aplikacji → wiersz bazy albo null.
 * „Bench Press (Dumbbell)” → najpierw „Dumbbell Bench Press”; sama nazwa bez nawiasu tylko dla sztangi, maszyny, wyciągu, masy ciała
 * i taśm TRX (w bazie „Bench Press” to sztanga, więc hantle nie mogą się z nią połączyć i pomieszać rekordów).
 */
function importFind_(ix, name) {
  const n = exStr_(name).trim().replace(/\s+/g, ' ');
  if (!n) return null;
  if (CW_IMPORT[n]) return exFind_(ix, CW_IMPORT[n]);
  const q = IMPORT_EQ.exec(n);
  if (!q) return exFind_(ix, n);
  return exFind_(ix, q[2] + ' ' + q[1]) || (/^(Barbell|Bodyweight|Machine|Cable|Suspension)$/i.test(q[2]) ? exFind_(ix, q[1]) : null) || ix.k[exKey_(n)] || null;
}

/** Czysta funkcja: {nazwa z pliku → nazwa w bazie albo ''} */
function importMatch_(dictRows, names) {
  const ix = exIndex_(dictRows), out = {};
  [].concat(names || []).slice(0, 2000).forEach(n => { const s = exStr_(n).trim().replace(/\s+/g, ' ').slice(0, 80); if (s) { const e = importFind_(ix, s); out[s] = e ? e.name : ''; } });
  return out;
}

/** Czysta funkcja: dni (RRRR-MM-DD), w których klient ma już trening w aplikacji (Log albo Sesje), bez wcześniejszego importu. */
function importTaken_(log, ses, clientId, localDay) {
  const out = {}, own = r => String(r.klient).toLowerCase() === clientId && !importUnit_(r.tydzien, r.jednostka);
  const day = v => v instanceof Date ? (localDay || localDayDefault_)(v.toISOString()) : String(v || '').slice(0, 10);
  (log || []).forEach(l => { if (own(l) && String(l.wykonane).toUpperCase() === 'TAK') out[day(l.data)] = 1; });
  (ses || []).forEach(s => { if (!own(s)) return; const t = s.start instanceof Date ? s.start.toISOString() : String(s.start || ''); out[/^\d{4}-\d{2}-\d{2}T/.test(t) ? (localDay || localDayDefault_)(t) : day(s.data)] = 1; });
  delete out['']; return out;
}

/** Czysta funkcja: wcześniejszy import klienta z wierszy Planu → {n, first, last, src} albo null. */
function importState_(plan, clientId) {
  const U = {};
  (plan || []).forEach(r => { if (String(r.klient).toLowerCase() === clientId && importUnit_(r.tydzien, r.jednostka)) U[r.jednostka] = { d: String(r.data instanceof Date ? fmtDate_(r.data) : r.data || '').slice(0, 10), t: String(r.tytul || '') }; });
  const k = Object.keys(U); if (!k.length) return null;
  const d = k.map(x => U[x].d).filter(Boolean).sort(), src = (/^(\S+) · /.exec(U[k[0]].t) || [])[1] || '';
  return { n: k.length, first: d[0] || '', last: d[d.length - 1] || '', src: src };
}

/**
 * Czysta funkcja: treningi z panelu → {plan, log, ses, units, sets} albo {error}.
 * match = {nazwa z pliku → nazwa w bazie}; src = hevy | strong | szablon; at = chwila zapisu (ISO).
 */
function importRows_(clientId, workouts, match, src, at) {
  const W = [].concat(workouts || []), M = match || {}, S = IMPORT_SRC[src] || 'Import';
  if (!W.length) return { error: 'Brak treningów do wczytania.' };
  if (W.length > IMPORT_MAX) return { error: 'Najwyżej ' + IMPORT_MAX + ' treningów naraz: wybierz krótszy okres.' };
  const t = (v, n) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const num = v => { const x = Number(String(v === undefined || v === null ? '' : v).replace(',', '.')); return String(v === undefined || v === null ? '' : v).trim() !== '' && isFinite(x) && x >= 0 && x < 10000 ? Math.round(x * 100) / 100 : ''; };
  const iso = v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(String(v || '')) ? String(v) : '';
  const plan = [], log = [], ses = [], seen = {};
  let sets = 0;
  for (const w of W) {
    const date = String(w && w.date || ''), day = String(w && w.day || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !IMPORT_DAY.test(day) || day.slice(1, 7) !== date.slice(2).replace(/-/g, '')) return { error: 'Zła data albo jednostka treningu (' + t(date, 10) + ').' };
    if (seen[day]) return { error: 'Dwa treningi z tym samym oznaczeniem ' + day + '.' };
    seen[day] = 1;
    const title = S + ' · ' + (t(w.title, 40) || 'Trening'), ex = [].concat(w.ex || []).filter(e => e && t(e.name, 80)).slice(0, 60);
    if (!ex.length) continue;
    const sup = {}, letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    ex.forEach(e => { const s = t(e.sup, 12); if (s !== '' && !(s in sup)) sup[s] = letters[Object.keys(sup).length % 26]; });
    const letter = e => { const s = t(e.sup, 12); return s === '' ? '' : sup[s]; };
    ex.forEach((e, i) => {
      const orig = t(e.name, 80), name = t(M[orig], 80) || orig, L = letter(e);
      const circuit = L && ((ex[i - 1] && letter(ex[i - 1]) === L) || (ex[i + 1] && letter(ex[i + 1]) === L)) ? L : '';
      const all = [].concat(e.sets || []).filter(Boolean).slice(0, 200), work = all.filter(s => s.t !== 'R' && s.t !== 'D');
      const first = work[0] || all[0] || {}, timed = num(first.reps) === '' && num(first.sec) !== '';
      plan.push({ klient: clientId, tydzien: 0, jednostka: day, tytul: title, data: date, nr: i + 1, cwiczenie: name, prio: 'A',
        serie: Math.min(SETS_MAX, Math.max(1, work.length)), powt: timed ? num(first.sec) + ' s' : String(num(first.reps) === '' ? 1 : num(first.reps)),
        procent: '', kg: '', rpe_max: '', uwagi: name !== orig ? S + ': ' + orig : '', dod_serie: '', drop: '', grupa: '', zamienniki: '', blok: '', zrodlo: 'klient', obwod: circuit });
      let n = 0, r = 0, d = 0;
      all.forEach(s => {
        const seria = s.t === 'R' ? 'R' + (++r) : s.t === 'D' ? 'D' + (++d) : ++n, reps = num(s.reps), rpe = num(s.rpe);
        log.push({ id: [clientId, 0, day, i + 1, seria].join('|'), zapisano: iso(w.start) || at, klient: clientId, tydzien: 0, jednostka: day, data: date,
          nr_cw: i + 1, cwiczenie: name, seria: seria, kg: num(s.kg), powt: reps === '' ? num(s.sec) : reps, rpe: rpe !== '' && rpe <= 10 ? rpe : '',
          wykonane: 'TAK', uwagi: t(e.note, 300), typ: s.t === 'D' ? 'DROP' : '' });
        sets++;
      });
    });
    const st = iso(w.start), en = iso(w.end), min = st && en ? Math.round((Date.parse(en) - Date.parse(st)) / 6e4) : '';
    ses.push({ id: [clientId, 0, day].join('|'), zapisano: at, klient: clientId, tydzien: 0, jednostka: day, data: date,
      czas_min: min !== '' && min > 0 && min < 600 ? min : '', uwagi: t(w.note, 300), start: st, koniec: en });
    if (sets > IMPORT_SETS_MAX) return { error: 'Za dużo serii naraz (ponad ' + IMPORT_SETS_MAX + '): wybierz krótszy okres.' };
  }
  if (!ses.length) return { error: 'Brak treningów z ćwiczeniami.' };
  return { plan: plan, log: log, ses: ses, units: ses.length, sets: sets };
}

/** Usuwa wiersze zakładki, dla których pred(obiekt wiersza) = true; od dołu, ciągłymi blokami. → liczba usuniętych. */
function importDrop_(name, pred) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return 0;
  const v = sh.getDataRange().getValues(), h = v.shift().map(x => String(x).trim()), hit = [];
  v.forEach((r, i) => { const o = {}; h.forEach((k, j) => { o[k] = r[j]; }); if (pred(o)) hit.push(i + 2); });
  for (let i = hit.length - 1; i >= 0;) {
    let j = i; while (j > 0 && hit[j - 1] === hit[j] - 1) j--;
    sh.deleteRows(hit[j], i - j + 1); i = j - 1;
  }
  return hit.length;
}

/** Dopisuje obiekty na końcu zakładki wg jej nagłówka (kolumny, których nie ma w obiekcie = puste). */
function importAppend_(name, headers, objs) {
  if (!objs.length) return;
  const sh = sheet_(name, headers), h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim());
  sh.getRange(sh.getLastRow() + 1, 1, objs.length, h.length).setValues(plainRows_(objs.map(o => h.map(k => o[k] === undefined || o[k] === null ? '' : o[k]))));
}

function importClear_(clientId) {
  const mine = r => String(r.klient).toLowerCase() === clientId && importUnit_(r.tydzien, r.jednostka);
  importDrop_('Log', mine); importDrop_('Sesje', mine);
  return importDrop_('Plan', mine);
}

/**
 * Panel: import historii klienta. a.mode:
 * stan → {prev}; podglad {names, dates} → {match, taken, prev}; wczytaj {src, workouts} → {units, sets, prev}; cofnij → {units}.
 */
function trImport(id, a) {
  a = a || {};
  const client = clientById_(id);
  if (!client) throw new Error('Nie ma aktywnego klienta „' + String(id || '') + '”.');
  const mode = String(a.mode || '');
  if (mode === 'stan') return { prev: importState_(tableOf_('Plan'), client.id) };
  if (mode === 'podglad') {
    const taken = importTaken_(pgTable_('Log', ['klient', 'tydzien', 'jednostka', 'data', 'wykonane']), tableOf_('Sesje'), client.id), dates = [].concat(a.dates || []).map(String);
    return { match: importMatch_(cwRowsCached_(), a.names), taken: dates.filter(d => taken[d]), prev: importState_(tableOf_('Plan'), client.id) };
  }
  if (mode !== 'wczytaj' && mode !== 'cofnij') throw new Error('Nieznany tryb importu.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (mode === 'cofnij') { const prev = importState_(tableOf_('Plan'), client.id); importClear_(client.id); return { units: prev ? prev.n : 0 }; }
    const names = [...new Set([].concat(...[].concat(a.workouts || []).map(w => [].concat(w && w.ex || []).map(e => String(e && e.name || '').trim().replace(/\s+/g, ' ').slice(0, 80)))))];
    const res = importRows_(client.id, a.workouts, importMatch_(cwRowsCached_(), names), String(a.src || ''), new Date().toISOString());
    if (res.error) throw new Error(res.error);
    importClear_(client.id);
    const sh = SpreadsheetApp.getActive().getSheetByName('Plan'), h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(x => String(x).trim());
    PLAN_HEADERS.forEach(k => { if (h.indexOf(k) < 0) { sh.getRange(1, h.length + 1).setValue(plain_(k)); h.push(k); } });
    planAppend_(sh, h, res.plan);
    importAppend_('Log', LOG_HEADERS, res.log);
    importAppend_('Sesje', SES_HEADERS, res.ses);
    return { units: res.units, sets: res.sets, prev: importState_(res.plan, client.id) };
  } finally { lock.releaseLock(); }
}
