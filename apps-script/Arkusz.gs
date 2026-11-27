/* ================== PORZĄDEK W ARKUSZU: menu, wyzwalacze, zakładki, rozmiar (27.11.2026) ==================
 * Menu „Trening” w grupach (onOpen w Code.gs), jedna lista wyzwalaczy z opisem po ludzku (WYZWALACZE), „Sprawdź arkusz”
 * z rozmiarem zakładek i czasem wczytania danych klienta, „Uporządkuj zakładki” (kolejność, kolory, schowane techniczne).
 * Nazwy zakładek się nie zmieniają: skrypt i panel szukają ich po nazwie. docs/zmiany/2026-11-27-porzadek-w-arkuszu.md
 */

/** Wszystkie wyzwalacze skryptu: funkcja, kiedy (h = godzina porannego maila), co robi. Instaluje je instalujWyzwalacze.
 *  Stałe z innych plików tylko w funkcjach: kolejność ładowania plików .gs nie jest pewna. */
const WYZWALACZE = [
  { fn: 'wczytajPlany', kiedy: () => 'co 15 min', co: 'nowe pliki planów z _plany na Dysku; co 30 min też komentarze do filmów' },
  { fn: 'odswiezPodglad', kiedy: () => 'co ' + PODGLAD_CO + ' min', co: 'podgląd dla Claude (5 ostatnich treningów każdej osoby)' },
  { fn: 'podsumowanie', kiedy: () => 'codziennie ok. 5:00', co: 'Przegląd, Podsumowania i Bloki; mail z alertem przy nowym czerwonym sygnale' },
  { fn: 'porannyMail', kiedy: h => 'codziennie ok. ' + h + ':00', co: 'mail z dzisiejszym treningiem (klienci z włączonym mailem)' },
  { fn: 'wieczornyMail', kiedy: () => 'codziennie ok. ' + MAIL_KOM_GODZ + ':00', co: 'mail o nowym komentarzu trenera (klienci z włączonym mailem)' },
  { fn: 'kopiaArkusza', kiedy: () => 'niedziela ok. 3:00', co: () => 'kopia całego arkusza do _kopie, zostaje ' + KOPIE_ILE + ' ostatnich' },
  { fn: 'sprawdzLinki', kiedy: () => 'poniedziałek ok. 4:00', co: 'martwe linki do filmów w bazie ćwiczeń (panel → Ćwiczenia)' }
];
/** Podgląd dla Claude: co ile minut (27.11.2026 z 10 na 30, decyzja Damiana: trzy razy mniej odczytów całego arkusza w tle). */
const PODGLAD_CO = 30;

/**
 * Czysta funkcja: nazwy funkcji zainstalowanych wyzwalaczy → linie „✓ / ✗ kiedy: co” w kolejności WYZWALACZE,
 * na końcu wyzwalacze spoza listy („? nazwa”) i powtórzone („2×”).
 */
function wyzwalaczeOpis_(handlers, h) {
  const n = {}; (handlers || []).forEach(f => { n[f] = (n[f] || 0) + 1; });
  const out = WYZWALACZE.map(w => (n[w.fn] ? '✓ ' : '✗ ') + w.kiedy(h) + ': ' + (typeof w.co === 'function' ? w.co() : w.co) + (n[w.fn] > 1 ? ' (' + n[w.fn] + '×)' : ''));
  Object.keys(n).filter(f => !WYZWALACZE.some(w => w.fn === f)).sort().forEach(f => out.push('? ' + f + ': spoza listy'));
  return out;
}

/** Grupy zakładek w kolejności: nazwa grupy, kolor karty, schowane. Zakładki spoza listy idą na koniec bez zmian. */
const ZAKLADKI = [
  { grupa: 'Klienci i plany', kolor: '#4a86e8', ukryte: false, tabs: ['Klienci', 'Plan', 'Ćwiczenia', 'Pakiety', 'Szablony', 'Zasady_AI'] },
  { grupa: 'Dane od klientów', kolor: '#6aa84f', ukryte: false, tabs: ['Log', 'Sesje', 'Dyspozycja', 'Stan', 'Ciało'] },
  { grupa: 'Wyniki', kolor: '#e69138', ukryte: false, tabs: ['Przegląd', 'Podsumowanie', 'Podsumowanie_cw', 'Podsumowanie_OLY', 'Podsumowanie_partie', 'Bloki'] },
  { grupa: 'Do obsługi', kolor: '#999999', ukryte: true, tabs: ['Propozycje', 'Import', 'Błędy', 'AI', 'API'] }
];

/**
 * Czysta funkcja: [{name, hidden}] obecnych zakładek → plan [{name, color, hidden}] w docelowej kolejności.
 * Znane zakładki wg ZAKLADKI (tylko te, które istnieją), potem pozostałe w dotychczasowej kolejności, z kolorem
 * i widocznością bez zmian (color: null = nie ruszać).
 */
function zakladkiPlan_(sheets) {
  const have = {}; (sheets || []).forEach(s => { have[s.name] = s; });
  const out = [], known = {};
  ZAKLADKI.forEach(g => g.tabs.forEach(t => { known[t] = 1; if (have[t]) out.push({ name: t, color: g.kolor, hidden: g.ukryte }); }));
  (sheets || []).forEach(s => { if (!known[s.name]) out.push({ name: s.name, color: null, hidden: !!s.hidden }); });
  if (out.length && out.every(s => s.hidden)) out[0].hidden = false;          // choć jedna zakładka musi zostać widoczna
  return out;
}

/** Menu Trening → Uporządkuj zakładki: kolejność i kolory grup, techniczne schowane (Widok → Ukryte arkusze). */
function uporzadkujZakladki() {
  const ss = SpreadsheetApp.getActive(), list = ss.getSheets().map(s => ({ name: s.getName(), hidden: s.isSheetHidden() }));
  const plan = zakladkiPlan_(list);
  plan.forEach((p, i) => {
    const sh = ss.getSheetByName(p.name);
    ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1);                         // aktywna zakładka staje się widoczna
    if (p.color) sh.setTabColor(p.color);
  });
  plan.forEach(p => { if (!p.hidden) ss.getSheetByName(p.name).showSheet(); });
  const first = plan.find(p => !p.hidden);
  if (first) ss.setActiveSheet(ss.getSheetByName(first.name));
  plan.forEach(p => { if (p.hidden) ss.getSheetByName(p.name).hideSheet(); });
  const ukr = plan.filter(p => p.hidden).map(p => p.name);
  alert_('Zakładki', 'Ułożone w grupach: ' + ZAKLADKI.map(g => g.grupa).join(', ') + '.' +
    (ukr.length ? '\nSchowane: ' + ukr.join(', ') + ' (zobaczysz je przez Widok → Ukryte arkusze; skrypt i panel działają bez zmian).' : ''));
}

/**
 * Czysta funkcja: rozmiar zakładek i czas wczytania → linie do „Sprawdź arkusz”.
 * r: {tabs: [{name, rows, cols}], pathKb (kolumna sciezka w Logu), time: {client (imię), ms, logRows} | null}
 */
function rozmiarOpis_(r) {
  const nf = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const tabs = (r.tabs || []).slice().sort((a, b) => b.rows * b.cols - a.rows * a.cols);
  const cells = tabs.reduce((a, t) => a + t.rows * t.cols, 0), out = [];
  out.push('Komórki z danymi: ' + nf(cells) + ' (limit Google: 10 000 000).');
  tabs.slice(0, 6).forEach(t => out.push('· ' + t.name + ': ' + nf(t.rows) + ' wierszy × ' + t.cols + ' kolumn'));
  if (r.pathKb > 0) out.push('· Ścieżki sztangi w Logu: ' + nf(r.pathKb) + ' KB');
  if (r.time) out.push('Wczytanie danych klienta z największym Logiem (' + r.time.client + ', ' + nf(r.time.logRows) + ' serii): ' +
    (r.time.ms / 1000).toFixed(1).replace('.', ',') + ' s' + (r.time.ms > 8000 ? ' – wolno, warto odchudzić odczyt Logu' : r.time.ms > 4000 ? ' – do obserwacji' : ' – dobrze') + '.');
  return out;
}

/** Odczyt rozmiarów zakładek i jeden pomiar clientData_ (bez zapisu). Błąd części pomiaru = ta część pominięta. */
function rozmiarArkusza_() {
  const ss = SpreadsheetApp.getActive(), r = { tabs: [], pathKb: 0, time: null };
  ss.getSheets().forEach(s => r.tabs.push({ name: s.getName(), rows: Math.max(s.getLastRow() - 1, 0), cols: s.getLastColumn() }));
  try { r.pathKb = pgTable_('Log', ['sciezka']).reduce((a, x) => a + String(x.sciezka || '').length, 0) / 1024; } catch (e) {}
  try {
    const n = {}; pgTable_('Log', ['klient']).forEach(x => { const c = String(x.klient || '').trim().toLowerCase(); if (c) n[c] = (n[c] || 0) + 1; });
    const kl = tableOf_('Klienci').filter(k => String(k.aktywny).toUpperCase() !== 'NIE' && n[String(k.klient_id).trim().toLowerCase()]);
    kl.sort((a, b) => n[String(b.klient_id).trim().toLowerCase()] - n[String(a.klient_id).trim().toLowerCase()]);
    const c = kl.length ? findClient_(kl[0].klucz) : null;
    if (c) { const t0 = Date.now(); clientData_(c, t0); r.time = { client: c.name, ms: Date.now() - t0, logRows: n[c.id] }; }
  } catch (e) {}
  return r;
}

/** Menu Trening → Wczytaj plany z Dysku teraz: to samo co wyzwalacz, z wynikiem w okienku. */
function menuPlany() {
  const res = wczytajPlany();
  if (res === null) { alert_('Plany', 'Wczytywanie już trwa (wyzwalacz albo panel). Spróbuj za minutę.'); return; }
  alert_('Plany', !res.length ? 'Brak nowych plików w „' + ROOT_FOLDER_NAME + '/_plany”.' :
    res.map(x => '• ' + x.name + ': ' + x.status + (x.ok ? '' : ' (opis w zakładce Import)')).join('\n'));
}
