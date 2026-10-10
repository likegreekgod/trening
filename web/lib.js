// Czyste funkcje aplikacji (bez DOM i sieci): index.html ładuje je jako window.TL, testy Node przez require (tests/lib.test.js).
(function (root) {
  const L = {};

  L.blank = v => v === '' || v === null || v === undefined;
  L.isNum = v => typeof v === 'number' && !isNaN(v);
  /** liczba z „97,5” / „97.5”; tekst (BW, guma) zostaje tekstem */
  L.num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? String(v || '') : n; };
  /** 97.5 → „97,5”; tekst bez zmian; puste → '' */
  L.fmtKg = v => L.blank(v) ? '' : (typeof v === 'number' ? String(v).replace('.', ',') : String(v));
  L.esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  L.plural = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many;
  /** kg w dół do 2,5 kg */
  L.floor25 = v => Math.floor(v / 2.5) * 2.5;
  /** numer serii: „3” → 3, „R1” / „D2” bez zmian */
  L.setKey = s => /^\d+$/.test(String(s)) ? +s : String(s);
  /** kompleks „2+1” = 3 podniesienia; „8/str”, „10 m”, „6-8” → pierwsza liczba */
  L.repsDefault = v => {
    const t = String(v).trim();
    return /^\d+(\s*\+\s*\d+)+$/.test(t) ? t.split('+').reduce((a, b) => a + (parseInt(b) || 0), 0) : parseInt(t);
  };
  /** drop set: ~80% ostatniego ciężaru (albo z planu), w dół do 2,5 kg */
  L.dropDefault = (planKg, fromKg) => {
    const base = L.isNum(fromKg) ? fromKg : (L.isNum(planKg) ? planKg : null);
    return { kg: base === null ? '' : L.floor25(base * 0.8), reps: '' };
  };
  /** tryb PROSTY: RPE z arkusza → przycisk Lekko 6 / Średnio 7,5 / Ciężko 9 / Max 10 */
  L.effortVal = r => {
    if (L.blank(r)) return '';
    const n = parseFloat(String(r).replace(',', '.'));
    if (isNaN(n)) return '';
    return n < 7 ? '6' : n < 8.5 ? '7.5' : n < 9.75 ? '9' : '10';
  };

  /* RPE ↔ RIR (Zourdos i in. 2016): RIR = 10 − RPE. Arkusz zawsze zapisuje RPE. */
  /** opcje RIR w aplikacji: 0, 1, 2, 3, 4, 5+ (5+ = RPE 5) */
  L.RIR_OPTS = [0, 1, 2, 3, 4, 5];
  L.rirOfRpe = rpe => { const n = parseFloat(String(rpe).replace(',', '.')); return isNaN(n) ? '' : Math.min(5, Math.max(0, 10 - n)); };
  L.rpeOfRir = rir => { const n = parseFloat(String(rir).replace('+', '')); return isNaN(n) ? '' : 10 - Math.min(5, Math.max(0, n)); };
  /** recepta: „RPE ≤ 8” → „RIR ≥ 2” (ceil, żeby nie przekroczyć sufitu) */
  L.rirMin = rpeMax => { const n = parseFloat(String(rpeMax).replace(',', '.')); return isNaN(n) ? '' : Math.max(0, Math.ceil(10 - n - 1e-9)); };

  /** kolor talerza wg % 1RM: ≤60 biały, 61–70 zielony, 71–80 żółty, 81–90 niebieski, >90 czerwony (tokeny --p5…--p25) */
  L.plateZone = pct => {
    if (!(pct > 0)) return '';
    const p = Math.round(pct * 1000) / 10;
    return p <= 60 ? 'p5' : p <= 70 ? 'p10' : p <= 80 ? 'p15' : p <= 90 ? 'p20' : 'p25';
  };

  /** dzisiejsza data w strefie telefonu (nie UTC), RRRR-MM-DD */
  L.localDate = (d = new Date()) => {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  root.TL = L;
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
})(typeof window !== 'undefined' ? window : globalThis);
