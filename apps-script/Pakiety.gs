/* ================== PAKIETY TRENINGÓW PERSONALNYCH ==================
 * Zakładka „Pakiety” = księga wpisów klienta (dowód w razie sporu):
 *   zakup    +n  (data zakupu, ważność, cena, przeniesione = niewykorzystane z poprzedniego pakietu, widoczny = klient widzi licznik)
 *   trening  −1  (trening zakończony w „Prowadź” z odhaczonym „Zdejmij z pakietu”; id = klient|s|tydzień|jednostka, więc
 *                 ponowny zapis tej samej sesji nie zdejmuje drugi raz, a odhaczenie usuwa wpis)
 *   korekta  ±1  (panel: trening poza aplikacją albo zwrot wejścia)
 * Zostało = (zakup + przeniesione) − wpisy po ostatnim zakupie. Poniżej zera = treningi poza pakietem.
 * Panel: trPakiet (nowy pakiet, korekta, widoczność), trPulpit → clients[].pkg, trKlient → pkg z historią.
 * Aplikacja: getData w „Prowadź” → pkg (odhaczenie przy „Zakończ”), u klienta → cfg.pkg tylko gdy widoczny.
 */
const PK_HEADERS = ['id', 'zapisano', 'klient', 'data', 'typ', 'ile', 'waznosc', 'cena', 'przeniesione', 'sesja', 'notatka', 'widoczny'];
const PK_TYPY = ['zakup', 'trening', 'korekta'];
const PK_MAX = 100;                    // najwyżej 100 treningów w jednym pakiecie
const PK_NOTE_MAX = 200;
const PK_HIST = 12;                    // historia w karcie klienta: ostatnie 12 wpisów

/** Dzień z komórki: tekst „RRRR-MM-DD”, ISO z readRows_ albo Date → „RRRR-MM-DD” (bez daty: ''). */
function pkDay_(v) {
  if (v instanceof Date) return fmtDate_(v);
  return sesDay_(v);
}

/**
 * Czysta: stan pakietu klienta z wierszy zakładki Pakiety (obiekty z nagłówkami PK_HEADERS, już tylko tego klienta).
 * → null (bez zakupu) albo {n, bought, carry, used, left, from, to, price, show, note, hist: [{date, typ, d, txt, over}]}
 * Kolejność wpisów: data, potem zapisano. Wpisy przed ostatnim zakupem należą do poprzednich pakietów.
 */
function pkgState_(rows) {
  const num = v => { const x = Number(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(x) ? x : 0; };
  const at = r => r.zapisano instanceof Date ? r.zapisano.toISOString() : String(r.zapisano || '');
  const list = (rows || []).filter(r => PK_TYPY.indexOf(String(r.typ || '').trim()) >= 0 && pkDay_(r.data))
    .map(r => ({ r: r, day: pkDay_(r.data), typ: String(r.typ).trim(), at: at(r) }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.at.localeCompare(b.at));
  let z = -1; list.forEach((x, i) => { if (x.typ === 'zakup') z = i; });
  if (z < 0) return null;
  const buy = list[z].r, bought = Math.round(num(buy.ile)), carry = Math.max(0, Math.round(num(buy.przeniesione))), n = bought + carry;
  let bal = n;
  const after = list.slice(z + 1).map(x => { const d = Math.round(num(x.r.ile)); bal += d;
    const tx = String(x.r.notatka || '').trim();
    return { date: x.day, typ: x.typ, d: d, over: x.typ === 'trening' && bal < 0,
      txt: x.typ === 'trening' ? (tx || 'trening') + ' · prowadzony' : (tx || (d < 0 ? 'trening' : 'zwrot')) + (d < 0 ? ' · dopisany ręcznie' : ' · zwrot') }; });
  const used = n - bal, price = num(buy.cena);
  const hist = after.slice().reverse().concat([{ date: list[z].day, typ: 'zakup', d: bought,
    txt: 'zakup ' + bought + ' ' + pkN_(bought) + (price ? ' · ' + String(Math.round(price * 100) / 100).replace('.', ',') + ' zł' : '') + (carry ? ' · +' + carry + ' z poprzedniego' : '') }]);
  return { n: n, bought: bought, carry: carry, used: used, left: bal, from: list[z].day, to: pkDay_(buy.waznosc), price: price || 0,
    show: String(buy.widoczny || '').trim().toUpperCase() === 'TAK', note: String(buy.notatka || '').trim(), hist: hist.slice(0, PK_HIST) };
}
function pkN_(n) { return n === 1 ? 'trening' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'treningi' : 'treningów'; }

/** Krótko do pulpitu i aplikacji (bez historii). */
function pkgShort_(k) {
  return k ? { n: k.n, left: k.left, used: k.used, from: k.from, to: k.to, show: k.show } : null;
}

/**
 * Czysta: wpis z panelu → wiersz zakładki Pakiety albo {error}. f: {mode: 'nowy' | 'korekta', n, from, to, price, note, k (±1), date, show}
 * cur = obecny stan (pkgState_) do przeniesienia reszty; today = 'RRRR-MM-DD'; stamp = unikalny dopisek id (np. czas w ms).
 */
function pkgRow_(clientId, f, cur, today, stamp) {
  f = f || {};
  const d = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : '';
  const note = String(f.note || '').replace(/\s+/g, ' ').trim().slice(0, PK_NOTE_MAX);
  if (f.mode === 'korekta') {
    const k = Number(f.k);
    if (!cur) return { error: 'Klient nie ma pakietu: najpierw dodaj pakiet.' };
    if (k !== 1 && k !== -1) return { error: 'Korekta: −1 (trening) albo +1 (zwrot).' };
    const date = d(f.date) || today;
    if (date < cur.from) return { error: 'Data przed zakupem obecnego pakietu (' + cur.from + ').' };
    return { row: [clientId + '|k|' + stamp, new Date(), clientId, date, 'korekta', k, '', '', '', '', note, ''] };
  }
  const n = Number(f.n), from = d(f.from) || today, to = d(f.to), price = f.price === '' || f.price === undefined || f.price === null ? '' : Number(String(f.price).replace(',', '.').replace(/\s|zł/g, ''));
  if (!(Number.isInteger(n) && n >= 1 && n <= PK_MAX)) return { error: 'Liczba treningów: 1–' + PK_MAX + '.' };
  if (String(f.to || '') && !to) return { error: 'Ważność: data RRRR-MM-DD.' };
  if (to && to < from) return { error: 'Ważność kończy się przed datą zakupu.' };
  if (price !== '' && !(isFinite(price) && price >= 0)) return { error: 'Cena: liczba złotych, np. 1200.' };
  const carry = cur && cur.left > 0 && !(cur.to && cur.to < from) ? cur.left : 0;
  const show = f.show === undefined ? !!(cur && cur.show) : !!f.show;
  return { row: [clientId + '|z|' + stamp, new Date(), clientId, from, 'zakup', n, to, price, carry || '', '', note, show ? 'TAK' : ''] };
}

/** Stan pakietu klienta z arkusza (null = brak pakietu). */
function pkgOf_(clientId) {
  const id = String(clientId || '').toLowerCase();
  return pkgState_(tableOf_('Pakiety').filter(r => String(r.klient || '').trim().toLowerCase() === id));
}
function pkgSheet_() {
  const sh = sheet_('Pakiety', PK_HEADERS);
  sh.getRange('D:D').setNumberFormat('@'); sh.getRange('G:G').setNumberFormat('@');   // daty jako tekst
  return sh;
}

/**
 * Trening z „Prowadź” (logSession, tylko LIVE_): on = zdejmij 1 wejście (upsert po id sesji), off = usuń wpis tej sesji.
 * Bez pakietu nic nie zapisuje. title = tytuł jednostki do historii.
 */
function pkgSession_(clientId, s) {
  const id = [clientId, 's', s.week, s.day].join('|');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = pkgSheet_();
    const hit = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).createTextFinder(id).matchEntireCell(true).findNext();
    if (!s.pkg) { if (hit && hit.getRow() > 1) sh.deleteRow(hit.getRow()); return; }
    if (hit && hit.getRow() > 1) return;                                       // już zdjęte: ponowny zapis sesji nie zdejmuje drugi raz
    const day = sesDay_(s.start) || today_();
    sh.appendRow(plainRow_([id, new Date(), clientId, day, 'trening', -1, '', '', '', s.week + '|' + s.day,
      String(s.title || 'Trening ' + s.day).slice(0, 80), '']));
  } finally { lock.releaseLock(); }
}

/* ---------- panel ---------- */

/** Panel → karta klienta: nowy pakiet, korekta (±1) albo widoczność licznika ({mode: 'widok', show}). Zwraca nowy stan z historią. */
function trPakiet(id, f) {
  id = String(id || '').trim().toLowerCase();
  if (!id || !trRow_(id)) throw new Error('Nie ma klienta „' + id + '”.');
  f = f || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = pkgSheet_(), cur = pkgOf_(id);
    if (f.mode === 'widok') {
      if (!cur) throw new Error('Klient nie ma pakietu.');
      const rows = sh.getDataRange().getValues(), h = rows[0].map(x => String(x).trim()), ci = h.indexOf('widoczny'), ti = h.indexOf('typ'), di = h.indexOf('data');
      let at = -1; rows.forEach((r, i) => { if (i && String(r[2]).toLowerCase() === id && String(r[ti]).trim() === 'zakup' && pkDay_(r[di]) === cur.from) at = i; });
      if (at > 0 && ci >= 0) sh.getRange(at + 1, ci + 1).setValue(plain_(f.show ? 'TAK' : ''));
    } else {
      const r = pkgRow_(id, f, cur, today_(), Date.now());
      if (r.error) throw new Error(r.error);
      sh.appendRow(plainRow_(r.row));
    }
  } finally { lock.releaseLock(); }
  return pkgOf_(id);
}

/** Pulpit: krótki stan pakietu każdego klienta {klient_id → pkgShort_} z jednego odczytu zakładki. */
function pkgAll_(rows) {
  const by = {};
  (rows || []).forEach(r => { const k = String(r.klient || '').trim().toLowerCase(); if (k) (by[k] = by[k] || []).push(r); });
  const out = {};
  Object.keys(by).forEach(k => { const s = pkgShort_(pkgState_(by[k])); if (s) out[k] = s; });
  return out;
}

/* ---------- panel → Rozliczenia: pakiety wszystkich klientów (v2 PR 5, 27.11.2026) ---------- */

/**
 * Czysta: wiersze Pakiety + klienci [{id, name, on}] → [{id, name, on, n, used, left, from, to, price, show, last}]
 * tylko klienci z pakietem; last = dzień ostatniego wpisu „trening” albo korekty −1 w obecnym pakiecie.
 * Kolejność: najmniej zostało na górze (poza pakietem pierwsze), potem imię.
 */
function pkgList_(rows, klienci) {
  const by = {};
  (rows || []).forEach(r => { const k = String(r.klient || '').trim().toLowerCase(); if (k) (by[k] = by[k] || []).push(r); });
  const out = [];
  (klienci || []).forEach(c => {
    const st = pkgState_(by[String(c.id || '').toLowerCase()] || []);
    if (!st) return;
    const last = st.hist.filter(h => h.d < 0).map(h => h.date)[0] || '';
    out.push({ id: c.id, name: c.name, on: c.on !== false, n: st.n, used: st.used, left: st.left, from: st.from, to: st.to,
      price: st.price, show: st.show, last: last });
  });
  return out.sort((a, b) => (b.on - a.on) || (a.left - b.left) || String(a.name).localeCompare(String(b.name), 'pl'));
}

/** Panel → Rozliczenia: pakiety wszystkich klientów (też nieaktywnych z pakietem). */
function trPakiety() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Klienci');
  const kl = sh ? klRows_(sh).filter(r => String(r[1]).trim()).map(r => ({ id: String(r[1]).trim().toLowerCase(), name: String(r[2] || '').trim() || String(r[1]).trim(),
    on: String(r[3] === undefined || r[3] === null ? '' : r[3]).trim().toUpperCase() !== 'NIE' })) : [];
  let rows = []; try { rows = tableOf_('Pakiety'); } catch (e) {}
  return { list: pkgList_(rows, kl), today: today_() };
}
