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

  /* ---------- daty jednostek (RRRR-MM-DD, liczone w UTC, bez stref) ---------- */
  const utc = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  L.addDays = (s, n) => new Date(utc(s) + n * 864e5).toISOString().slice(0, 10);
  L.dayDiff = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
  /** „06.10” */
  L.ddmm = s => s ? s.slice(8, 10) + '.' + s.slice(5, 7) : '';
  L.weekday = s => s ? ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'][new Date(utc(s)).getUTCDay()] : '';
  L.monthShort = s => s ? ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'][+s.slice(5, 7) - 1] : '';

  /** jednostki planu: [{week, day, date, title, block, rows}] posortowane po dacie */
  L.units = plan => {
    const m = new Map();
    plan.forEach(r => {
      const k = r.week + '|' + r.day;
      if (!m.has(k)) m.set(k, { week: r.week, day: r.day, date: r.date || '', title: r.title || '', block: r.block || '', rows: [] });
      m.get(k).rows.push(r);
    });
    return [...m.values()].sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.week - b.week || String(a.day).localeCompare(String(b.day)));
  };

  /** tygodnie lżejsze z planu (deload): planowany tonaż ≤ 75% średniej z maks. 3 poprzednich (jak w podsumowaniu) */
  L.lightWeeks = plan => {
    const ton = {};
    plan.forEach(r => {
      const kg = typeof r.kg === 'number' ? r.kg : NaN, reps = L.repsDefault(r.reps);
      ton[r.week] = (ton[r.week] || 0) + (kg > 0 && reps > 0 ? (Number(r.sets) || 0) * reps * kg : 0);
    });
    const ws = Object.keys(ton).map(Number).sort((a, b) => a - b), out = new Set();
    ws.forEach((w, i) => {
      const prev = ws.slice(Math.max(0, i - 3), i).map(x => ton[x]).filter(v => v > 0);
      if (prev.length && ton[w] > 0 && ton[w] <= 0.75 * prev.reduce((s, v) => s + v, 0) / prev.length) out.add(w);
    });
    return out;
  };

  /** „Blok B2 · tydz. 1”: numer tygodnia liczony od pierwszego tygodnia bloku; bez kolumny blok → null */
  L.blockInfo = (plan, week) => {
    const r = plan.find(x => x.week === week && x.block);
    if (!r) return null;
    const first = Math.min(...plan.filter(x => x.block === r.block).map(x => x.week));
    return { block: r.block, n: week - first + 1 };
  };

  /** serie robocze zrobione / zaplanowane i tonaż jednostki (bez rozgrzewki) z wpisów Logu {seria: log} per ćwiczenie */
  L.unitStats = (exs, logsOf) => {
    let done = 0, all = 0, ton = 0;
    exs.forEach(ex => {
      const L2 = logsOf(ex) || {};
      all += Number(ex.sets) || 0;
      Object.keys(L2).forEach(s => {
        const l = L2[s];
        if (l.wykonane !== 'TAK' || /^R/i.test(s)) return;
        if (/^\d+$/.test(s) && +s <= ex.sets) done++;
        const kg = parseFloat(String(l.kg).replace(',', '.')), reps = parseFloat(String(l.powt).replace(',', '.'));
        if (kg > 0 && reps > 0) ton += kg * reps;
      });
    });
    return { done, all, ton: Math.round(ton) };
  };

  /**
   * „Ostatnio”: najcięższa zaliczona seria robocza z ostatniej INNEJ jednostki z tym ćwiczeniem (po nazwie, bez wielkości liter).
   * logs = wpisy Logu z serwera (cwiczenie, tydzien, jednostka, seria, kg, powt, rpe, typ, wykonane, zapisano).
   */
  L.lastTop = (logs, name, week, day) => {
    const nm = String(name).trim().toLowerCase(), by = {};
    logs.forEach(l => {
      if (String(l.cwiczenie || '').trim().toLowerCase() !== nm || l.wykonane !== 'TAK') return;
      if (String(l.tydzien) === String(week) && String(l.jednostka) === String(day)) return;
      if (/^R/i.test(String(l.seria)) || /FAIL/.test(l.typ || '')) return;
      const k = l.tydzien + '|' + l.jednostka, t = Date.parse(l.zapisano) || 0;
      (by[k] = by[k] || { t: 0, rows: [] }).rows.push(l);
      by[k].t = Math.max(by[k].t, t);
    });
    const last = Object.values(by).sort((a, b) => b.t - a.t)[0];
    if (!last) return null;
    const kgOf = l => parseFloat(String(l.kg).replace(',', '.'));
    const top = last.rows.slice().sort((a, b) => (kgOf(b) || 0) - (kgOf(a) || 0) || (+b.powt || 0) - (+a.powt || 0))[0];
    return { kg: isNaN(kgOf(top)) ? String(top.kg) : kgOf(top), reps: top.powt, rpe: top.rpe };
  };

  root.TL = L;
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
})(typeof window !== 'undefined' ? window : globalThis);
