/**
 * Podgląd dla Claude: osobny, mały plik „Trening – podgląd dla Claude” (folder „Trening – Klienci”)
 * z jedną zakładką „Ostatnie sesje”: 10 ostatnich jednostek wszystkich klientów, od najnowszej.
 * Jedna sesja = wiersz „— sesja —” (RPE sesji, samopoczucie, czas, uwagi) + wiersz na każde ćwiczenie
 * (plan: kg, serie×powt., RPE; wykonanie: kg, serie×powt., RPE, serie; notatki).
 * Bez bólu i komentarzy trenera (dane o zdrowiu w pliku czytanym przez konektor).
 *
 * Tylko czyta arkusz z danymi i pisze do osobnego pliku; nie zmienia żadnej zakładki ani funkcji z Code.gs.
 * Odświeżanie: wyzwalacz co 10 min (`instalujPodglad`, uruchom raz z edytora); plik przepisywany tylko po zmianie.
 * ID pliku: właściwość skryptu PODGLAD_ID (nie wpisuj go do repo).
 */

const PODGLAD_NAZWA = 'Trening – podgląd dla Claude';
const PODGLAD_ZAKLADKA = 'Ostatnie sesje';
const PODGLAD_SESJE = 10;
const PODGLAD_HEADERS = ['data', 'klient', 'sesja', 'cwiczenie', 'plan_kg', 'plan_serie_x_powt', 'plan_rpe',
  'wyk_kg', 'wyk_serie_x_powt', 'wyk_rpe', 'wyk_serie', 'notatki'];
const PG_LOG_COLS = ['zapisano', 'klient', 'tydzien', 'jednostka', 'data', 'nr_cw', 'cwiczenie', 'seria', 'kg', 'powt',
  'rpe', 'wykonane', 'uwagi', 'typ', 'zamiana'];   // bez „sciezka” (duży JSON)

/** Czysta funkcja: wiersze widoku (bez nagłówka). opts: { localDay, limit }. */
function podglad_(plan, log, ses, klienci, opts) {
  opts = opts || {};
  const lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  const s_ = v => blank_(v) ? '' : String(v).trim();
  const num = v => { const x = n_(v); return isFinite(x) ? String(Math.round(x * 100) / 100).replace('.', ',') : s_(v); };
  const ts = v => { const t = v instanceof Date ? v.getTime() : Date.parse(String(v || '')); return isFinite(t) ? t : 0; };
  const dayOf = v => { if (blank_(v)) return ''; const d = day_(v); return isNaN(d) ? '' : iso_(d); };
  const key = r => [lc(r.klient), s_(r.tydzien), s_(r.jednostka)].join('|');
  const imie = {};
  (klienci || []).forEach(k => { if (!blank_(k.klient_id)) imie[lc(k.klient_id)] = s_(k.imie) || s_(k.klient_id); });
  const AD = unitDates_(ses || [], opts.localDay);

  const U = {};   // sesja: klient|tydzien|jednostka
  const unit = r => { const k = key(r); return U[k] || (U[k] = { k, klient: lc(r.klient), tydzien: s_(r.tydzien), jednostka: s_(r.jednostka), plan: [], log: [], ses: null, last: 0, logDay: '' }); };
  (log || []).forEach(l => {
    if (!lc(l.klient)) return;
    const u = unit(l); u.log.push(l);
    u.last = Math.max(u.last, ts(l.zapisano));
    const d = dayOf(l.data); if (d > u.logDay) u.logDay = d;
  });
  (ses || []).forEach(s => { if (!lc(s.klient)) return; const u = unit(s); u.ses = s; u.last = Math.max(u.last, ts(s.zapisano)); });
  (plan || []).forEach(p => { const u = U[key(p)]; if (u) u.plan.push(p); });

  const units = Object.keys(U).map(k => U[k]);
  units.forEach(u => { u.date = AD[u.k] || u.logDay || (u.ses ? dayOf(u.ses.data) : '') || (u.plan[0] ? dayOf(u.plan[0].data) : ''); });
  units.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.last - a.last));

  const out = [];
  units.slice(0, opts.limit || PODGLAD_SESJE).forEach(u => {
    const p0 = u.plan[0] || {};
    const name = [s_(p0.blok), 'tydz. ' + u.tydzien, u.jednostka, s_(p0.tytul)].filter(Boolean).join(' · ') + (own_(p0) ? ' (własny)' : '');
    const head = [u.date, imie[u.klient] || u.klient, name];
    const s = u.ses, sn = [];
    if (s) {
      if (!blank_(s.rpe_sesji)) sn.push('RPE sesji ' + num(s.rpe_sesji));
      if (!blank_(s.samopoczucie)) sn.push('samopoczucie ' + num(s.samopoczucie) + '/5');
      if (!blank_(s.czas_min)) sn.push(num(s.czas_min) + ' min');
      if (s_(s.uwagi)) sn.push('uwagi: ' + s_(s.uwagi));
    } else sn.push('niezakończona (brak wpisu w Sesjach)');
    out.push(head.concat(['— sesja —', '', '', '', '', '', '', '', sn.join(' · ')]));

    const byNr = {};
    u.plan.forEach(p => { byNr[s_(p.nr)] = { nr: s_(p.nr), p, l: [] }; });
    u.log.forEach(l => { const n = s_(l.nr_cw); (byNr[n] || (byNr[n] = { nr: n, p: null, l: [] })).l.push(l); });
    Object.keys(byNr).map(n => byNr[n]).sort((a, b) => (n_(a.nr) - n_(b.nr)) || (a.nr > b.nr ? 1 : -1)).forEach(e => {
      const p = e.p || {}, notes = [];
      const skip = e.l.filter(l => /SKIP/.test(String(l.typ || '')));
      const sets = e.l.filter(l => String(l.wykonane).toUpperCase() === 'TAK' && !/^R/i.test(s_(l.seria)) && s_(l.seria) !== '0')
        .sort((a, b) => { const o = x => /^D/i.test(s_(x.seria)) ? 1000 + (parseInt(s_(x.seria).slice(1), 10) || 0) : (n_(x.seria) || 0); return o(a) - o(b); });
      const swap = (e.l.find(l => s_(l.zamiana)) || {}).zamiana;
      const done = sets[0] || e.l.find(l => !/SKIP/.test(String(l.typ || ''))) || {};
      const ex = s_(done.cwiczenie) || s_(p.cwiczenie) || (e.l[0] ? s_(e.l[0].cwiczenie) : '');
      // plan
      let pkg = s_(p.kg);
      if (!pkg && !blank_(p.procent)) { const x = n_(p.procent); pkg = isFinite(x) ? Math.round(x <= 1.5 ? x * 100 : x) + '%' : s_(p.procent); }
      else pkg = num(pkg);
      const pser = e.p ? s_(p.serie) + '×' + txt_(p.powt) : '';
      const prpe = blank_(p.rpe_max) ? '' : '≤' + num(p.rpe_max);
      // wykonanie
      const kgs = sets.map(l => n_(l.kg)).filter(isFinite);
      const wkg = kgs.length ? num(Math.max.apply(null, kgs)) : (sets[0] ? s_(sets[0].kg) : '');
      const reps = sets.map(l => txt_(l.powt));
      const wser = !sets.length ? '' : reps.every(r => r === reps[0]) ? sets.length + '×' + reps[0] : reps.join(', ');
      const rpes = sets.map(l => n_(l.rpe)).filter(isFinite);
      const lo = Math.min.apply(null, rpes), hi = Math.max.apply(null, rpes);
      const wrpe = !rpes.length ? '' : lo === hi ? num(lo) : num(lo) + '–' + num(hi);
      const det = sets.map(l => {
        const t = String(l.typ || ''), d = /^D/i.test(s_(l.seria)) || /DROP/.test(t);
        return (d ? 'D ' : '') + num(l.kg) + '×' + txt_(l.powt) + (/FAIL/.test(t) ? ' FAIL' : !blank_(l.rpe) ? ' @' + num(l.rpe) : '');
      }).join('; ');
      // notatki
      const note = (e.l.find(l => !/SKIP/.test(String(l.typ || '')) && s_(l.uwagi)) || {}).uwagi;
      if (note) notes.push('klient: ' + s_(note));
      if (swap) notes.push('zamiana: ' + s_(swap));
      if (skip.length) notes.push((sets.length ? 'skrócone' : 'pominięte') + (s_(skip[0].uwagi) ? ': ' + s_(skip[0].uwagi) : ''));
      else if (!sets.length && e.p) notes.push('brak wykonanych serii');
      if (!e.p) notes.push('poza planem');
      if (s_(p.uwagi)) notes.push('plan: ' + s_(p.uwagi));
      out.push(head.concat([ex, pkg, pser, prpe, wkg, wser, wrpe, det, notes.join(' · ')]));
    });
  });
  return out;
}

/** Odczyt wybranych kolumn zakładki (ciągłe odcinki), żeby nie czytać dużych kolumn (ścieżki VBT). */
function pgTable_(name, cols) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String), n = sh.getLastRow() - 1;
  const idx = cols.map(c => h.indexOf(c)).filter(i => i >= 0).sort((a, b) => a - b);
  const rows = Array.from({ length: n }, () => ({}));
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    const v = sh.getRange(2, idx[i] + 1, n, idx[j] - idx[i] + 1).getValues();
    v.forEach((r, ri) => r.forEach((x, ci) => { rows[ri][h[idx[i] + ci]] = x; }));
    i = j + 1;
  }
  return rows;
}

/** Plik podglądu: z właściwości PODGLAD_ID, a gdy go nie ma (albo usunięty) — nowy w folderze „Trening – Klienci”. */
function podgladPlik_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('PODGLAD_ID');
  if (id) {
    try { const f = DriveApp.getFileById(id); if (!f.isTrashed()) return SpreadsheetApp.openById(id); } catch (e) { /* utworzymy nowy */ }
  }
  const ss = SpreadsheetApp.create(PODGLAD_NAZWA);
  DriveApp.getFileById(ss.getId()).moveTo(rootFolder_());
  ss.getSheets()[0].setName(PODGLAD_ZAKLADKA);
  props.setProperty('PODGLAD_ID', ss.getId());
  props.deleteProperty('PODGLAD_SIG');
  return ss;
}

/** Wyzwalacz co 10 min (i ręcznie z edytora): przelicza widok i zapisuje go tylko po zmianie. */
function odswiezPodglad() {
  const localDay = t => Utilities.formatDate(new Date(t), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const rows = podglad_(tableOf_('Plan'), pgTable_('Log', PG_LOG_COLS), tableOf_('Sesje'), tableOf_('Klienci'), { localDay });
  const props = PropertiesService.getScriptProperties();
  const sig = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(rows)));
  if (sig === props.getProperty('PODGLAD_SIG') && props.getProperty('PODGLAD_ID')) return;
  const ss = podgladPlik_();
  const sh = ss.getSheetByName(PODGLAD_ZAKLADKA) || ss.insertSheet(PODGLAD_ZAKLADKA);
  sh.clear();
  const all = [PODGLAD_HEADERS].concat(rows);
  sh.getRange(1, 1, all.length, PODGLAD_HEADERS.length).setNumberFormat('@').setValues(all);
  sh.getRange(1, 1, 1, PODGLAD_HEADERS.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  props.setProperty('PODGLAD_SIG', sig);
  Logger.log('Podgląd: ' + rows.length + ' wierszy → ' + ss.getUrl());
}

/** Uruchom raz z edytora: wyzwalacz odswiezPodglad co 10 min (inne wyzwalacze bez zmian) i pierwsze odświeżenie. */
function instalujPodglad() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'odswiezPodglad').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('odswiezPodglad').timeBased().everyMinutes(10).create();
  odswiezPodglad();
}
