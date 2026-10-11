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
    return { kg: isNaN(kgOf(top)) ? String(top.kg) : kgOf(top), reps: top.powt, rpe: top.rpe, ocena: String(top.ocena || '').toUpperCase() };
  };

  /* ---------- przerwa i talerze ---------- */
  /** przerwa po serii wg priorytetu (docelowo kolumna planu): A 2:00, B 1:30, K 1:00 */
  L.restSec = prio => ({ A: 120, B: 90, K: 60 })[String(prio).toUpperCase()] || 90;
  /** 95 → „1:35”, ujemne → „0:00” */
  L.fmtClock = sec => { const s = Math.max(0, Math.ceil(sec)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  /** talerze na stronę (zachłannie): gryf 20/15 kg, zamki 2 × 2,5 kg; reszta = czego nie da się ułożyć */
  L.PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
  L.plates = (total, bar = 20, collars = 5) => {
    const t = parseFloat(String(total).replace(',', '.'));
    if (!(t > 0)) return { side: [], rest: 0, under: false };
    let left = Math.round((t - bar - collars) / 2 * 100) / 100;
    if (left < 0) return { side: [], rest: 0, under: true };
    const side = [];
    L.PLATES.forEach(p => { while (left >= p - 1e-9) { side.push(p); left = Math.round((left - p) * 100) / 100; } });
    return { side, rest: left * 2, under: false };
  };

  /* ---------- boje (rwanie R, podrzut P): ocena podejścia światłami i propozycja ciężaru ---------- */
  /** grupa ćwiczenia: kolumna planu „grupa”, a bez niej rozpoznanie po nazwie (jak groupOf_ w Code.gs) */
  L.groupOf = (g, name) => {
    const G = String(g || '').trim().toUpperCase();
    if (['R', 'P', 'CR', 'CP', 'PS', 'I'].indexOf(G) >= 0) return G;
    const n = String(name || '').toLowerCase();
    if (/(ciąg|pull).*(rwan|snatch)|(rwan|snatch).*(ciąg|pull)|high pull/.test(n)) return 'CR';
    if (/(ciąg|pull).*(podrzut|zarzut|clean)|(zarzut|clean).*(ciąg|pull)/.test(n)) return 'CP';
    if (/martwy|rdl|rumuń|romanian|good ?morning|wyciskan|bench|sots|dip/.test(n)) return 'I';
    if (/rwan|snatch/.test(n)) return 'R';
    if (/podrzut|zarzut|jerk|clean|wybicie|push press/.test(n)) return 'P';
    if (/przysiad|squat/.test(n)) return 'PS';
    return 'I';
  };
  L.isOly = ex => { const g = L.groupOf(ex.group, ex.name); return g === 'R' || g === 'P'; };
  /** ocena → zapis: Łatwo rpe 7, Średnio 8, Walka 9,5, Spalone = FAIL bez rpe; światła: w = białe, r = czerwone */
  L.RATE = {
    L: { rpe: 7, label: 'Łatwo', lights: 'www' }, S: { rpe: 8, label: 'Średnio', lights: 'wwr' },
    W: { rpe: 9.5, label: 'Walka', lights: 'wrr' }, X: { rpe: '', label: 'Spalone', lights: 'rrr' }
  };
  /** ocena zapisanego podejścia; starsze wpisy bez „ocena” → z typu FAIL albo RPE */
  L.rateOf = l => {
    if (!l || l.wykonane !== 'TAK') return '';
    const o = String(l.ocena || '').toUpperCase();
    if (L.RATE[o]) return o;
    if (/FAIL/.test(l.typ || '')) return 'X';
    const r = parseFloat(String(l.rpe).replace(',', '.'));
    return isNaN(r) ? '' : r <= 7 ? 'L' : r <= 8.5 ? 'S' : 'W';
  };
  /** sufit dnia = floor_2,5(1RM × (procent + sufit_oly)); słaba dyspozycja (uwaga / zmęczenie) → ciężar z planu; bez % → null */
  L.olyCap = (planKg, pct, ceil, weak) => {
    if (!(pct > 0) || !(planKg > 0)) return weak && planKg > 0 ? planKg : null;
    return weak ? planKg : L.floor25(planKg / pct * (pct + (ceil >= 0 ? ceil : 0.05)));
  };
  /**
   * Propozycja pod ostatnio ocenionym podejściem, gdy zostały niezrobione serie.
   * rows: podejścia robocze w kolejności [{kg, rate, done}], i: indeks ocenionego; o: {cap, one, weak, why}
   * → {lvl: up|stay|down, kg, txt} albo null
   */
  L.sugOly = (rows, i, o = {}) => {
    const r = rows[i];
    if (!r || !r.done || !r.rate) return null;
    if (rows.some((x, j) => j > i && x.done)) return null;                       // tylko ostatnie ocenione
    if (!rows.some((x, j) => j > i && !x.done)) return null;                     // brak serii do zrobienia
    const kg = r.kg, f = v => L.fmtKg(v) + ' kg', cap = o.cap;
    const prev = rows.slice(0, i).reverse().find(x => x.done);
    if (r.rate === 'L') {
      if (cap === null || cap === undefined || kg + 2.5 <= cap)
        return { lvl: 'up', kg: kg + 2.5, txt: 'Łatwo: możesz dołożyć 2,5 kg.' + (cap ? ' Sufit dziś ' + f(cap) + '.' : '') };
      return { lvl: 'stay', kg, txt: o.weak ? `Łatwo, ale dyspozycja dnia: ${o.why || 'uwaga'}. Zostań przy ${f(kg)}.` : `Łatwo, ale to sufit dnia (${f(cap)}). Zostań.` };
    }
    if (r.rate === 'S') return { lvl: 'stay', kg, txt: `Średnio: zostań przy ${f(kg)}.` };
    if (r.rate === 'W') {
      if (prev && prev.rate === 'W') { const k = Math.max(2.5, kg - 2.5); return { lvl: 'down', kg: k, txt: `Druga walka z rzędu: zejdź do ${f(k)}.` }; }
      return { lvl: 'stay', kg, txt: `Walka: nie dokładaj, zostań przy ${f(kg)}.` };
    }
    if (r.rate === 'X') {
      let miss = 0;
      for (let j = i; j >= 0; j--) { const x = rows[j]; if (!x.done) continue; if (x.rate === 'X' && x.kg === kg) miss++; else break; }
      if (miss >= 2 && o.one > 0) { const k = Math.max(2.5, L.floor25(kg - o.one * 0.05)); return { lvl: 'down', kg: k, txt: `Dwie spalone na ${f(kg)}: zejdź o ok. 5% 1RM do ${f(k)}.` }; }
      if (miss >= 2) { const k = Math.max(2.5, L.floor25(kg * 0.95)); return { lvl: 'down', kg: k, txt: `Dwie spalone na ${f(kg)}: zejdź do ${f(k)}.` }; }
      return { lvl: 'stay', kg, txt: `Spalone: powtórz ${f(kg)}. Po drugiej spalonej zejdziesz o 5%.` };
    }
    return null;
  };

  /* ---------- zamiana ćwiczenia ---------- */
  L.SWAP_WHY = ['Sprzęt zajęty', 'Ból', 'Brak sprzętu', 'Inny powód'];
  // zamienniki wg wzorca ruchu, gdy plan nie ma kolumny „zamienniki” (kolejność = pierwszy pasujący wzorzec)
  const SWAP_BY = [
    [/ciąg.*(rwan|zarzut)|(snatch|clean) pull/, ['Ciąg z zawisu', 'Ciąg z bloków', 'Wysokie przyciąganie (high pull)']],
    [/rwan|snatch/, ['Rwanie z zawisu', 'Rwanie siłowe (power snatch)', 'Rwanie z bloków']],
    [/zarzut|podrzut|clean|jerk/, ['Zarzut z zawisu', 'Zarzut siłowy (power clean)', 'Podrzut ze stojaków']],
    [/martwy|rdl|rumuń|good ?morning|hip thrust/, ['Martwy ciąg rumuński z hantlami', 'Hip thrust', 'Przyciąganie linki między nogami']],
    [/przysiad|squat|wykrok|split/, ['Goblet squat', 'Wypychanie nogami (leg press)', 'Bułgarski przysiad', 'Przysiad na suwnicy (hack)']],
    [/wyciskan.*(leż|ław)|bench|pomp/, ['Wyciskanie hantli na ławce', 'Pompki', 'Wyciskanie na maszynie']],
    [/wyciskan|press/, ['Wyciskanie hantli siedząc', 'Wyciskanie landmine', 'Wyciskanie na maszynie nad głowę']],
    [/wiosł|row|podciąg|ściąg|pull/, ['Wiosłowanie hantlem', 'Wiosłowanie na wyciągu', 'Ściąganie drążka wyciągu']]
  ];
  /** zamienniki: kolumna planu (ex.swaps) albo lista dla wzorca ruchu; bez oryginału i powtórzeń */
  L.swapOptions = ex => {
    const own = (ex.swaps || []).map(s => String(s).trim()).filter(Boolean);
    const n = String(ex.name || '').toLowerCase(), hit = SWAP_BY.find(([re]) => re.test(n));
    const list = own.length ? own : hit ? hit[1] : [];
    return [...new Set(list)].filter(s => s.toLowerCase() !== n);
  };
  /** „Przysiad → Leg press | Ból” ↔ {from, to, why} (kolumna Log „zamiana”) */
  L.swapText = s => s && s.to ? `${s.from} → ${s.to} | ${s.why}` : '';
  L.parseSwap = t => { const m = /^(.+?) → (.+?)(?: \| (.*))?$/.exec(String(t || '').trim()); return m ? { from: m[1], to: m[2], why: m[3] || '' } : null; };

  /* ---------- ścieżka sztangi i VBT z filmu (wczesna wersja; walidacja z czujnikiem – patrz docs/ui-v2-spec.md) ---------- */
  L.PLATE_M = 0.45;   // talerz 450 mm = kalibracja
  L.smooth = (a, w) => { const h = Math.floor(w / 2); return a.map((_, i) => { let s = 0, n = 0; for (let j = i - h; j <= i + h; j++) if (j >= 0 && j < a.length) { s += a[j]; n++; } return s / n; }); };
  /**
   * pts: [{t [s], x, y [m]}], y w górę, względem startu. Powtórzenie = ruch w górę ≥ 15 cm.
   * Boje i ciągi (R/P/CR/CP): v max [m/s], uniesienie [cm], ścieżka przycięta do wejścia pod sztangę.
   * Pozostałe: najlepsze MCV [m/s], spadek prędkości w serii [%].
   */
  L.analyse = (pts, grp) => {
    const t = pts.map(p => p.t), y = L.smooth(pts.map(p => p.y), 3), x = L.smooth(pts.map(p => p.x), 5);
    const v = y.map((_, i) => { const a = Math.max(0, i - 1), b = Math.min(y.length - 1, i + 1); return b > a ? (y[b] - y[a]) / (t[b] - t[a]) : 0; });
    const segs = []; let i = 0;
    while (i < v.length) {
      if (v[i] > 0.1) {
        let s = i; while (s > 0 && v[s - 1] > 0.05) s--;
        let e = i; while (e < v.length - 1 && v[e + 1] > 0.05) e++;
        const dy = y[e] - y[s];
        if (dy >= 0.15) { let pk = 0; for (let k = s; k <= e; k++) pk = Math.max(pk, v[k]); segs.push({ s, e, dy, dur: t[e] - t[s], mcv: dy / (t[e] - t[s]), peak: pk, top: y[e] }); }
        i = e + 1;
      } else i++;
    }
    const ymin = y.length ? Math.min(...y) : 0, oly = ['R', 'P', 'CR', 'CP'].indexOf(grp) >= 0;
    let reps = segs;
    if (oly) { const pulls = segs.filter(s => s.peak >= 1.2); if (pulls.length) reps = pulls; }
    reps = reps.map((s, k) => Object.assign({}, s, { n: k + 1, h: s.top - ymin }));
    const res = { kind: oly ? 'oly' : 'str', reps, x, y, t, v };
    if (!reps.length) return res;
    res.peak = Math.max(...reps.map(r => r.peak));
    if (oly) {
      res.vmax = res.peak; res.h = Math.round(Math.max(...reps.map(r => r.h)) * 100);
      const last = reps[reps.length - 1]; let lo = last.e;
      for (let k = last.e; k < y.length && t[k] - t[last.e] <= 0.7; k++) if (y[k] < y[lo]) lo = k;
      res.crop = [Math.max(0, reps[0].s - 3), Math.min(y.length - 1, lo + 3)];
    } else {
      const best = Math.max(...reps.map(r => r.mcv)), lastM = reps[reps.length - 1].mcv;
      res.mcv = best; res.loss = (best - lastM) / best * 100;
      res.h = Math.round(reps.find(r => r.mcv === best).dy * 100);
    }
    return res;
  };
  /** zapis do Log: vbt_ms (MCV albo v max), vbt_peak, wysokosc_cm, sciezka = punkty co 2 klatki w cm [[x, y], …] */
  L.vbtOut = res => {
    if (!res || !res.reps.length) return null;
    const c = res.crop || [0, res.x.length - 1], path = [], r1 = v => Math.round(v * 10) / 10;
    for (let k = c[0]; k <= c[1]; k += 2) path.push([r1(res.x[k] * 100), r1(res.y[k] * 100)]);
    const r2 = v => Math.round(v * 100) / 100;
    return { vbt: r2(res.kind === 'oly' ? res.vmax : res.mcv), vbtPeak: r2(res.peak), height: res.h, path };
  };
  /** rysunek ścieżki z punktów w cm (poziom ×2, żeby było widać odchylenie od pionu startu) */
  L.pathSVG = pts => {
    if (!pts || pts.length < 2) return '';
    const xs = pts.map(p => p[0] * 2), ys = pts.map(p => p[1]);
    const pad = 24, minx = Math.min(...xs, -10), maxx = Math.max(...xs, 10), miny = Math.min(...ys), maxy = Math.max(...ys);
    const H = 240, sc = (H - 2 * pad) / Math.max(1, maxy - miny), W = Math.max(200, Math.min(340, (maxx - minx) * sc + 2 * pad + 30));
    const cx = W / 2 - ((minx + maxx) / 2) * sc, X = v => cx + v * sc, Y = v => H - pad - (v - miny) * sc;
    const d = xs.map((v, i) => (i ? 'L' : 'M') + X(v).toFixed(1) + ',' + Y(ys[i]).toFixed(1)).join('');
    let grid = '';
    for (let g = Math.ceil(miny / 20) * 20; g <= maxy; g += 20)
      grid += `<line class="grid" x1="0" x2="${W.toFixed(0)}" y1="${Y(g).toFixed(1)}" y2="${Y(g).toFixed(1)}"/><text class="axis" x="2" y="${(Y(g) - 3).toFixed(1)}">${Math.round(g - miny)} cm</text>`;
    return `<svg class="path" viewBox="0 0 ${W.toFixed(0)} ${H}" role="img" aria-label="Ścieżka sztangi" style="max-width:${W.toFixed(0)}px">${grid}` +
      `<line class="plumb" x1="${X(0).toFixed(1)}" x2="${X(0).toFixed(1)}" y1="${pad - 6}" y2="${H - pad + 4}"/>` +
      `<path class="trace" d="${d}"/><circle class="start" cx="${X(xs[0]).toFixed(1)}" cy="${Y(ys[0]).toFixed(1)}" r="5"/>` +
      `<text class="axis" x="${(X(0) + 4).toFixed(1)}" y="${H - 6}">pion startu · poziom ×2</text></svg>`;
  };

  /* ---------- dyspozycja dnia: ankieta Hoopera, CMJ, prędkość na rozgrzewce ---------- */
  const nf = v => parseFloat(String(v === null || v === undefined ? '' : v).replace(',', '.'));
  L.mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
  /** wysokość skoku z czasu lotu: h = g·t²/8 = 1,22625·t² [m] → cm */
  L.cmjHeight = tFlight => tFlight > 0 ? 1.22625 * tFlight * tFlight * 100 : NaN;
  /** jak nagrano film ze skokiem: [id, opis, krok klatki s, mnożnik czasu pliku → czas rzeczywisty] */
  L.CMJ_PRESETS = [['s240', 'Slow-mo 240 kl/s', 1 / 240, 1], ['s120', 'Slow-mo 120 kl/s', 1 / 120, 1],
    ['x8', 'Slow-mo zapisane ×8 (plik 30 kl/s)', 1 / 30, 1 / 8], ['x4', 'Slow-mo zapisane ×4 (plik 30 kl/s)', 1 / 30, 1 / 4], ['n60', 'Zwykły film 60 kl/s', 1 / 60, 1]];
  L.HOOPER = [['sen', 'Sen', '1 = bardzo dobry'], ['stres', 'Stres', '1 = brak'], ['zmeczenie', 'Zmęczenie', '1 = brak'], ['bolesnosc', 'Bolesność mięśni', '1 = brak']];
  /** średnie z historii (zakładka Dyspozycja) bez dzisiejszego wpisu: Hooper z 7 ostatnich, CMJ i prędkość z 5 */
  L.readyBase = (rows, today) => {
    const day = r => String(r.data instanceof Date ? r.data.toISOString() : r.data || '').slice(0, 10);
    const past = (rows || []).filter(r => day(r) && day(r) !== today).sort((a, b) => day(a).localeCompare(day(b)));
    const last = (key, n) => past.map(r => nf(r[key])).filter(v => isFinite(v) && v > 0).slice(-n);
    return { hooper: L.mean(last('hooper_suma', 7)), cmj: L.mean(last('cmj_sr', 5)), vbt: L.mean(last('vbt_test', 5)) };
  };
  L.READY_TITLE = { ok: 'Dobra dyspozycja', warn: 'Uwaga', bad: 'Zmęczenie', none: 'Brak pomiaru' };
  L.READY_ADVICE = { ok: 'Trening według planu.', warn: 'Trening według planu, bez dokładania ponad plan i bez serii dodatkowych.',
    bad: 'Napisz do trenera przed treningiem. Na razie: ciężary −10% i bez serii dodatkowych.', none: 'Wypełnij ankietę, wpisz skoki albo prędkość z rozgrzewki.' };
  /**
   * cur: {cmj: [cm…], hooper: {sen, stres, zmeczenie, bolesnosc} 1–7, vbt m/s}; base: readyBase
   * Progi: Hooper +4 uwaga / +7 czerwony; CMJ −5% / −10%; prędkość −0,05 / −0,10 m/s.
   * ≥2 czerwone albo czerwony + pomarańczowy → Zmęczenie; 1 sygnał → Uwaga; brak → Dobra dyspozycja.
   */
  L.verdict = (cur, base = {}) => {
    const out = []; let red = 0, amb = 0, n = 0;
    const f1 = v => L.fmtKg(Math.round(v * 10) / 10), f2 = v => L.fmtKg(Math.round(v * 100) / 100), sg = v => (v > 0 ? '+' : '') ;
    const jumps = (cur.cmj || []).map(nf).filter(v => isFinite(v) && v > 0), cmjAvg = L.mean(jumps);
    if (jumps.length) {
      n++;
      if (isFinite(base.cmj)) {
        const d = (cmjAvg - base.cmj) / base.cmj * 100, t = 'CMJ ' + sg(d) + f1(d) + '% vs Twoja średnia (' + f1(cmjAvg) + ' vs ' + f1(base.cmj) + ' cm)';
        if (d <= -10) { red++; out.push(['bad', t]); } else if (d <= -5) { amb++; out.push(['warn', t]); } else out.push(['ok', t]);
      } else out.push(['ok', 'CMJ ' + f1(cmjAvg) + ' cm (pierwsze testy budują Twoją średnią)']);
    }
    const h = cur.hooper || {}, hv = L.HOOPER.map(q => nf(h[q[0]])), hs = hv.every(v => v >= 1 && v <= 7) ? hv.reduce((s, v) => s + v, 0) : NaN;
    if (isFinite(hs)) {
      n++;
      if (isFinite(base.hooper)) {
        const d = hs - base.hooper, t = 'Ankieta ' + hs + ' (średnio ' + Math.round(base.hooper) + ')';
        if (d >= 7) { red++; out.push(['bad', t]); } else if (d >= 4) { amb++; out.push(['warn', t]); } else out.push(['ok', t]);
      } else out.push(['ok', 'Ankieta ' + hs + ' (pierwsze ankiety budują Twoją średnią)']);
    }
    const vb = nf(cur.vbt);
    if (isFinite(vb) && vb > 0) {
      n++;
      if (isFinite(base.vbt)) {
        const d = vb - base.vbt, t = 'Prędkość ' + sg(d) + f2(d) + ' m/s vs średnia';
        if (d <= -0.10 + 1e-9) { red++; out.push(['bad', t]); } else if (d <= -0.05 + 1e-9) { amb++; out.push(['warn', t]); } else out.push(['ok', t]);
      } else out.push(['ok', 'Prędkość ' + f2(vb) + ' m/s (pierwsze pomiary budują Twoją średnią)']);
    }
    const lvl = !n ? 'none' : red >= 2 || (red && amb) ? 'bad' : red || amb ? 'warn' : 'ok';
    return { lvl, title: L.READY_TITLE[lvl], advice: L.READY_ADVICE[lvl], out, cmjAvg, hs };
  };

  /* ---------- postęp: siła, objętość, obciążenie (cała historia z Logu) ---------- */
  const mondayOf = d => L.addDays(d, -((new Date(utc(d)).getUTCDay() + 6) % 7));
  /** e1RM = kg × (1 + (powt. + RIR) / 30), RIR = 10 − RPE; jak w podsumowaniu: tylko serie z RPE ≥ 5 */
  L.e1rm = (kg, reps, rpe) => kg > 0 && reps > 0 && rpe >= 5 ? kg * (1 + (reps + (10 - rpe)) / 30) : NaN;
  /**
   * Serie z Logu z kontekstem planu. plan: wiersze getData (week, day, order, prio, group, pct, kg, block);
   * dates: {tydzień|jednostka → faktyczny dzień}. Bez rozgrzewki, tylko wykonane.
   */
  L.doneSets = (logs, plan, dates = {}) => {
    const P = {}; plan.forEach(r => { P[r.week + '|' + r.day + '|' + r.order] = r; });
    return logs.filter(l => l.wykonane === 'TAK' && !/^R/i.test(String(l.seria))).map(l => {
      const p = P[l.tydzien + '|' + l.jednostka + '|' + l.nr_cw] || {}, kg = nf(l.kg), reps = nf(l.powt), rpe = nf(l.rpe);
      const name = String(l.cwiczenie || p.name || ''), date = dates[l.tydzien + '|' + l.jednostka] || String(l.data || '').slice(0, 10);
      const one = p.pct > 0 && typeof p.kg === 'number' && p.kg > 0 ? p.kg / p.pct : NaN;
      return { name, date, week: +l.tydzien, block: p.block || '', prio: p.prio || '', grp: L.groupOf(p.group, name), kg, reps, rpe,
        fail: /FAIL/.test(l.typ || ''), rel: kg > 0 && one > 0 ? kg / one : NaN };
    }).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date));
  };
  /** siła w czasie dla ćwiczenia: boje (R/P) = najlepsze zaliczone kg dnia, pozostałe = najlepsze e1RM dnia; pr = rekord do tego dnia */
  L.strengthSeries = (sets, name) => {
    const by = {};
    sets.filter(s => s.name === name && !s.fail).forEach(s => {
      const v = s.grp === 'R' || s.grp === 'P' ? s.kg : L.e1rm(s.kg, s.reps, s.rpe);
      if (!(v > 0)) return;
      if (!by[s.date] || v > by[s.date].v) by[s.date] = { date: s.date, v, block: s.block };
    });
    let best = 0;
    return Object.values(by).sort((a, b) => a.date.localeCompare(b.date)).map(p => { const pr = p.v > best; if (pr) best = p.v; return Object.assign(p, { v: Math.round(p.v * 10) / 10, pr }); });
  };
  /** ćwiczenia główne (prio A) z co najmniej jednym wynikiem: [{name, oly, best, date, n}] od najczęściej robionych */
  L.records = sets => {
    const names = [...new Set(sets.filter(s => s.prio === 'A').map(s => s.name))];
    return names.map(name => {
      const ser = L.strengthSeries(sets, name), top = ser.filter(p => p.pr).pop();
      return top ? { name, oly: sets.some(s => s.name === name && (s.grp === 'R' || s.grp === 'P')), best: top.v, date: top.date, n: ser.length } : null;
    }).filter(Boolean).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  };
  /** tonaż tygodniowy (pon–niedz), ostatnie n tygodni do tygodnia z dziś włącznie, tygodnie bez treningu = 0 */
  L.weeklyTonnage = (sets, today, n = 12) => {
    const t = {}; sets.forEach(s => { if (s.kg > 0 && s.reps > 0) { const w = mondayOf(s.date); t[w] = (t[w] || 0) + s.kg * s.reps; } });
    const end = mondayOf(today), out = [];
    for (let i = n - 1; i >= 0; i--) { const w = L.addDays(end, -7 * i); out.push({ week: w, ton: Math.round(t[w] || 0) }); }
    return out;
  };
  /** powtórzenia zaliczone w strefach % 1RM dla bojów, ciągów i przysiadów (bez grupy I): ≤60, 61–70, 71–80, 81–90, >90 */
  L.ZONES = [['p5', '≤60%'], ['p10', '61–70%'], ['p15', '71–80%'], ['p20', '81–90%'], ['p25', '>90%']];
  L.zoneReps = sets => {
    const z = { p5: 0, p10: 0, p15: 0, p20: 0, p25: 0 };
    sets.forEach(s => { if (s.grp !== 'I' && !s.fail && s.rel > 0 && s.reps > 0) z[L.plateZone(s.rel)] += s.reps; });
    return z;
  };
  /**
   * kalendarz obciążenia: 12 tygodni × 7 dni do końca bieżącego tygodnia. Obciążenie dnia = RPE sesji × minuty (sRPE),
   * a bez nich tonaż dnia / 100. level 0–4: 0 = brak, 1–4 = ćwiartki względem najcięższego dnia w okresie.
   */
  L.loadCalendar = (sessions, sets, today, weeks = 12) => {
    const load = {}, ton = {};
    sets.forEach(s => { if (s.kg > 0 && s.reps > 0) ton[s.date] = (ton[s.date] || 0) + s.kg * s.reps; });
    sessions.forEach(s => { const r = nf(s.rpe), m = nf(s.min); if (s.date && r >= 0 && m > 0) load[s.date] = (load[s.date] || 0) + r * m; });
    Object.keys(ton).forEach(d => { if (!(load[d] > 0)) load[d] = ton[d] / 100; });
    const start = L.addDays(mondayOf(today), -7 * (weeks - 1)), days = [];
    for (let i = 0; i < weeks * 7; i++) { const d = L.addDays(start, i); days.push({ date: d, load: Math.round(load[d] || 0), future: d > today }); }
    const max = Math.max(0, ...days.map(d => d.load));
    days.forEach(d => { d.level = d.load > 0 ? Math.max(1, Math.ceil(4 * d.load / max)) : 0; });
    return days;
  };
  /** pomiary dyspozycji w czasie: [{date, v}] dla klucza (cmj_sr, vbt_test) */
  L.readySeries = (rows, key) => (rows || []).map(r => ({ date: String(r.data || '').slice(0, 10), v: nf(r[key]) }))
    .filter(p => p.v > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.date)).sort((a, b) => a.date.localeCompare(b.date));

  root.TL = L;
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
})(typeof window !== 'undefined' ? window : globalThis);
