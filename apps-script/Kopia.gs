/* ---------- kopia arkusza co tydzień, limit filmu, miejsce na Dysku (punkty 10 i 8 przeglądu v80, 23.11.2026) ----------
 * Kopia: wyzwalacz kopiaArkusza w niedzielę ok. 3:00 (instalujWyzwalacze), plik „Trening – kopia RRRR-MM-DD” w „Trening – Klienci/_kopie”,
 * zostaje KOPIE_ILE najnowszych (starsze do kosza Dysku, skąd znikają same po 30 dniach). Google kopiuje arkusz razem ze skryptem, ale bez
 * wyzwalaczy i bez wdrożenia, więc kopia nic sama nie robi (w kopii nie uruchamiaj „Zainstaluj albo napraw wyzwalacze”). Powrót do danych = przeniesienie wierszy z kopii. W kopiach są dane klientów (RODO: znikają razem z kopią po 8 tygodniach).
 * Limit filmu: startUpload odrzuca plik > FILM_MAX albo nie-film (filmOk_); telefon sprawdza to samo przed kolejką.
 * Dysk: trDysk (panel → Ustawienia), trPulpit dokłada `dysk`, poniżej DYSK_MALO wolnego czerwony wpis w „Wymaga uwagi”.
 */
const KOPIE_FOLDER = '_kopie';
const KOPIE_ILE = 8;
const KOPIA_PREFIX = 'Trening – kopia ';
const FILM_MAX = 1024 * 1024 * 1024;          // 1 GB
const DYSK_MALO = 2 * 1024 * 1024 * 1024;     // < 2 GB wolnego = sygnał
const FILM_EXT = /\.(mp4|m4v|mov|qt|webm|3gp|3g2|mkv|avi|hevc)$/i;

/** '' = film można wysłać, inaczej powód po polsku. meta: {size, mimeType, fileName} */
function filmOk_(meta) {
  const m = meta || {}, size = Number(m.size), type = String(m.mimeType || ''), name = String(m.fileName || '');
  if (!(size > 0)) return 'Pusty plik filmu.';
  if (size > FILM_MAX) return 'Film ma ' + (Math.round(size / 1024 / 1024 / 102.4) / 10).toString().replace('.', ',') + ' GB, a limit to 1 GB. Nagraj krótszy albo w niższej jakości (np. 1080p zamiast 4K).';
  if (type && !/^video\//i.test(type) && !FILM_EXT.test(name)) return 'To nie jest film (' + type + '). Wybierz nagranie wideo.';
  if (!type && name && !FILM_EXT.test(name)) return 'To nie jest film (' + name + '). Wybierz nagranie wideo.';
  return '';
}

const kopiaNazwa_ = day => KOPIA_PREFIX + day;

/** pliki z folderu kopii [{id, name, at (ms)}] → id plików do usunięcia: tylko nasze kopie, poza `keep` najnowszymi */
function kopieDoUsuniecia_(files, keep) {
  return (files || []).filter(f => String(f.name).indexOf(KOPIA_PREFIX) === 0)
    .sort((a, b) => b.at - a.at).slice(Math.max(0, keep)).map(f => f.id);
}

/** used, limit w bajtach (limit ≤ 0 = bez limitu) → {used, limit, free, low} */
function dyskStan_(used, limit) {
  const u = Number(used) || 0, l = Number(limit) || 0;
  if (l <= 0) return { used: u, limit: 0, free: null, low: false };
  const free = Math.max(0, l - u);
  return { used: u, limit: l, free: free, low: free < DYSK_MALO };
}

function kopieFolder_() {
  const root = rootFolder_(), it = root.getFoldersByName(KOPIE_FOLDER);
  return it.hasNext() ? it.next() : root.createFolder(KOPIE_FOLDER);
}

function kopieLista_() {
  const out = [], it = kopieFolder_().getFiles();
  while (it.hasNext()) { const f = it.next(); if (f.isTrashed()) continue; out.push({ id: f.getId(), name: f.getName(), at: f.getDateCreated().getTime() }); }
  return out.sort((a, b) => b.at - a.at);
}

/** wyzwalacz (niedziela) albo panel „Zrób kopię teraz”: kopia całego arkusza do _kopie, stare ponad KOPIE_ILE do kosza */
function kopiaArkusza(e) {
  const folder = kopieFolder_(), day = today_();
  const ss = SpreadsheetApp.getActive();
  DriveApp.getFileById(ss.getId()).makeCopy(kopiaNazwa_(day), folder);
  kopieDoUsuniecia_(kopieLista_(), KOPIE_ILE).forEach(id => { try { DriveApp.getFileById(id).setTrashed(true); } catch (err) {} });
  PropertiesService.getScriptProperties().setProperty('KOPIA_AT', new Date().toISOString());
  return { ok: true, day: day };
}

function kopiaWyzwalacz_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'kopiaArkusza').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('kopiaArkusza').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
}

/** miejsce na Dysku dla pulpitu (bez wyjątku, gdy Google nie odpowie) */
function dysk_() {
  try { return dyskStan_(DriveApp.getStorageUsed(), DriveApp.getStorageLimit()); } catch (e) { return null; }
}

/** panel → Ustawienia: miejsce na Dysku i kopie arkusza */
function trDysk() {
  const k = kopieLista_();
  return { dysk: dysk_(), kopie: k.slice(0, KOPIE_ILE).map(f => ({ name: f.name, at: new Date(f.at).toISOString() })), ile: KOPIE_ILE,
    at: PropertiesService.getScriptProperties().getProperty('KOPIA_AT') || '',
    trigger: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'kopiaArkusza') };
}

/** panel → Ustawienia: „Zrób kopię teraz” (włącza też cotygodniowy wyzwalacz, jeśli go nie ma) */
function trKopia() {
  kopiaArkusza();
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'kopiaArkusza')) kopiaWyzwalacz_();
  return trDysk();
}
