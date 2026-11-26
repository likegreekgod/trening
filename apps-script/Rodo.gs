/**
 * RODO (punkt 11 przeglądu v80): panel → Klienci → Ustawienia klienta → „Dane klienta”.
 *
 * trKlientEksport(id) → plik ZIP (base64): CSV z wierszami klienta z każdej zakładki arkusza, w której jest kolumna klient / klient_id,
 *                       lista filmów z folderu „Trening – Klienci/<Imię>/” i krótki opis. Bez klucza i linku (to dostęp do aplikacji).
 * trKlientUsun(id, imie) → usuwa wiersze klienta ze wszystkich zakładek (też Klienci: link przestaje działać), folder z filmami do kosza Dysku
 *                       (tylko gdy żaden inny klient nie ma tego samego imienia, bo folder jest po imieniu), właściwości maili. Nie da się cofnąć;
 *                       trzeba wpisać imię klienta. Cotygodniowe kopie arkusza (_kopie) zostają do rotacji (KOPIE_ILE tygodni).
 */
const RODO_POMIN = ['klucz', 'link', 'urzadzenia', 'api_klucz'];     // kolumny Klientów, których nie oddajemy w pliku (dostęp do aplikacji, znaczniki telefonów)

/** Czysta: indeks kolumny z identyfikatorem klienta w nagłówku (klient_id ma pierwszeństwo przed klient) albo -1. */
function rodoCol_(head) {
  const h = (head || []).map(x => String(x).trim().toLowerCase());
  const i = h.indexOf('klient_id');
  return i >= 0 ? i : h.indexOf('klient');
}
/** Czysta: wartości zakładki (z nagłówkiem) → {head, rows, idx: indeksy wierszy danych od 0} dla klienta id. */
function rodoPick_(values, id) {
  const v = values || [], head = v[0] || [], c = rodoCol_(head), out = { head: head, rows: [], idx: [] };
  if (c < 0 || !id) return out;
  const k = String(id).trim().toLowerCase();
  v.slice(1).forEach((r, i) => { if (String(r[c] === undefined || r[c] === null ? '' : r[c]).trim().toLowerCase() === k) { out.rows.push(r); out.idx.push(i); } });
  return out;
}
/** Czysta: indeksy wierszy danych → ciągłe zakresy [wiersz arkusza od, ile] od dołu (usuwanie nie przesuwa kolejnych zakresów). */
function rodoRuns_(idx) {
  const s = [...new Set(idx || [])].sort((a, b) => a - b), runs = [];
  s.forEach(i => { const l = runs[runs.length - 1]; if (l && l[0] + l[1] === i) l[1]++; else runs.push([i, 1]); });
  return runs.map(r => [r[0] + 2, r[1]]).reverse();
}
/** Czysta: wiersze → CSV (średnik, BOM, daty ISO, cudzysłowy wokół pól ze średnikiem, cudzysłowem albo nową linią). */
function csvOf_(rows) {
  const q = v => { const t = Object.prototype.toString.call(v) === '[object Date]' ? v.toISOString() : String(v === undefined || v === null ? '' : v); return /[;"\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  return '﻿' + (rows || []).map(r => r.map(q).join(';')).join('\r\n');
}
/** Czysta: nazwa pliku z nazwy zakładki (bez polskich znaków i odstępów). */
const rodoFile_ = n => String(n).replace(/[łŁ]/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_') + '.csv';

function rodoKlient_(id) {
  const k = String(id || '').trim().toLowerCase();
  const sh = SpreadsheetApp.getActive().getSheetByName('Klienci'), v = sh ? sh.getDataRange().getValues() : [];
  const r = v.slice(1).find(x => String(x[1]).trim().toLowerCase() === k);
  if (!k || !r) throw new Error('Nie ma klienta „' + k + '”.');
  return { id: k, name: String(r[2]).trim(), others: v.slice(1).filter(x => String(x[1]).trim().toLowerCase() !== k).map(x => String(x[2]).trim().toLowerCase()) };
}
/** folder z filmami klienta (po imieniu) albo null */
function rodoFolder_(name) {
  if (!name) return null;
  const it = rootFolder_().getFoldersByName(name);
  return it.hasNext() ? it.next() : null;
}
function rodoFilmy_(folder, path, out) {
  if (!folder || out.length > 5000) return out;
  const fs = folder.getFiles();
  while (fs.hasNext()) { const f = fs.next(); out.push([path, f.getName(), f.getUrl(), Math.round(f.getSize() / 1048576 * 10) / 10, f.getDateCreated()]); }
  const ds = folder.getFolders();
  while (ds.hasNext()) { const d = ds.next(); rodoFilmy_(d, path + '/' + d.getName(), out); }
  return out;
}

function trKlientEksport(id) {
  const c = rodoKlient_(id), ss = SpreadsheetApp.getActive(), blobs = [], tabs = {};
  ss.getSheets().forEach(sh => {
    const name = sh.getName(); if (sh.getLastRow() < 2) return;
    const p = rodoPick_(sh.getDataRange().getValues(), c.id); if (!p.rows.length) return;
    let head = p.head, rows = p.rows;
    if (name === 'Klienci') {
      const keep = head.map((h, i) => RODO_POMIN.indexOf(String(h).trim().toLowerCase()) < 0 ? i : -1).filter(i => i >= 0);
      head = keep.map(i => head[i]); rows = rows.map(r => keep.map(i => r[i]));
    }
    tabs[name] = rows.length;
    blobs.push(Utilities.newBlob(csvOf_([head].concat(rows)), 'text/csv', rodoFile_(name)));
  });
  const filmy = c.others.indexOf(c.name.toLowerCase()) < 0 ? rodoFilmy_(rodoFolder_(c.name), c.name, []) : [];
  blobs.push(Utilities.newBlob(csvOf_([['folder', 'plik', 'link', 'MB', 'utworzono']].concat(filmy)), 'text/csv', 'filmy.csv'));
  blobs.push(Utilities.newBlob('Dane klienta ' + c.name + ' z aplikacji Siła z Ruchu, stan na ' + new Date().toISOString().slice(0, 10) + '.\r\n' +
    'Każdy plik CSV to wiersze tej osoby z jednej zakładki arkusza (średnik jako separator, UTF-8). filmy.csv to lista nagrań na Dysku Google trenera.\r\n', 'text/plain', 'opis.txt'));
  const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const zip = Utilities.zip(blobs, 'dane-' + c.id + '-' + day + '.zip');
  return { name: zip.getName(), b64: Utilities.base64Encode(zip.getBytes()), tabs: tabs, films: filmy.length };
}

function trKlientUsun(id, imie) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const c = rodoKlient_(id);
    if (String(imie || '').trim().toLowerCase() !== c.name.toLowerCase()) throw new Error('Wpisz dokładnie imię klienta: ' + c.name + '.');
    const ss = SpreadsheetApp.getActive(), tabs = {};
    ss.getSheets().forEach(sh => {
      if (sh.getLastRow() < 2) return;
      const p = rodoPick_(sh.getDataRange().getValues(), c.id); if (!p.idx.length) return;
      rodoRuns_(p.idx).forEach(r => {
        if (r[0] - 1 + r[1] >= sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 1);   // arkusz nie może zostać bez wierszy poza nagłówkiem
        sh.deleteRows(r[0], r[1]);
      });
      tabs[sh.getName()] = p.idx.length;
    });
    let folder = 'brak';
    if (c.others.indexOf(c.name.toLowerCase()) >= 0) folder = 'wspólny';
    else { const f = rodoFolder_(c.name); if (f) { f.setTrashed(true); folder = 'kosz'; } }
    const pr = PropertiesService.getScriptProperties();
    pr.deleteProperty('MKS_' + c.id);
    try { const m = JSON.parse(pr.getProperty('MAIL_LOG') || '{}'); if (m[c.id]) { delete m[c.id]; pr.setProperty('MAIL_LOG', JSON.stringify(m)); } } catch (e) {}
    return { name: c.name, tabs: tabs, rows: Object.keys(tabs).reduce((a, k) => a + tabs[k], 0), folder: folder };
  } finally { lock.releaseLock(); }
}
