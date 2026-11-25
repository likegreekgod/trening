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
  /** ćwiczenie na czas: „30 s”, „45 sek” → 's', „2 min” → 'min', inaczej '' (wtedy w polu serii zamiast powtórzeń wpisuje się czas) */
  L.timeUnit = v => { const m = /^\s*\d+(?:[.,]\d+)?\s*(sekund|sek|sec|s|min)(?![a-ząćęłńóśźż])/i.exec(String(v === undefined || v === null ? '' : v)); return !m ? '' : /^min/i.test(m[1]) ? 'min' : 's'; };
  L.repsLabel = v => ({ s: 'sek.', min: 'min' }[L.timeUnit(v)] || 'powt.');
  /** drop set: ~80% ostatniego ciężaru (albo z planu), w dół do 2,5 kg */
  L.dropDefault = (planKg, fromKg) => {
    const base = L.isNum(fromKg) ? fromKg : (L.isNum(planKg) ? planKg : null);
    return { kg: base === null ? '' : L.floor25(base * 0.8), reps: '' };
  };
  /** ćwiczenie bez gryfu (hantle, kettle, maszyna, wyciąg): rozgrzewka bez kroku „sam gryf” */
  L.noBar = name => /hantl|\bdb\b|kettl|\bkb\b|maszyn|wyciąg|lin(ka|ki|ce)|cable|machine|dumbbell/i.test(String(name || ''));
  /**
   * proponowana rozgrzewka przed ciężarem roboczym: sam gryf × 8 (boje × 5), potem ok. 40 / 60 / 80% × 5 / 3 / 2,
   * przy ciężkich seriach (≤ 3 powt., ≥ 100 kg) jeszcze 90% × 1; kg w dół do 2,5; krok bliżej niż 5 kg od poprzedniego
   * albo od ciężaru roboczego odpada. Bez liczby w planie albo poniżej
   * gryf + 10 kg = brak propozycji. o: { bar (kg gryfu, domyślnie 20), oly, noBar }. Zwraca [{ kg, reps, bar }].
   */
  L.warmupSets = (work, reps, o) => {
    o = o || {};
    const W = typeof work === 'number' ? work : NaN, bar = o.noBar ? 2.5 : L.isNum(o.bar) ? o.bar : 20;
    if (!(W > 0) || W < (o.noBar ? 10 : bar + 10)) return [];
    const r = parseInt(reps) > 0 ? parseInt(reps) : 5, out = [];
    const add = (kg, n, isBar) => {
      const prev = out.length ? out[out.length - 1].kg : 0;
      if (kg < bar || kg < prev + 5 || kg > W - 5) return;
      out.push({ kg, reps: n, bar: !!isBar });
    };
    if (!o.noBar) add(bar, o.oly ? 5 : 8, true);
    [[0.4, 5], [0.6, 3], [0.8, 2]].forEach(([p, n]) => add(L.floor25(W * p), n));
    if (r <= 3 && W >= 100) add(L.floor25(W * 0.9), 1);
    return out;
  };
  /**
   * Jedna skala wysiłku serii w całej aplikacji (17.11.2026): światło = widok liczby RPE z Logu.
   * Lekko 7 · Średnio 8 · Ciężko 9 · Nieudana = FAIL bez RPE. Brak światła = puste RPE (brak danych, nigdy 7).
   * Boje (RATE) mają te same stopnie i te same RPE, tylko inne słowa i światła sędziowskie.
   */
  L.EFF = {
    L: { rpe: 7, label: 'Lekko', hint: 'Szybko, czysto, zapas ≥ 3', c: 'g' },
    S: { rpe: 8, label: 'Średnio', hint: 'Wolniej albo z poprawką, zapas 2', c: 'y' },
    W: { rpe: 9, label: 'Ciężko', hint: 'Walka, zapas 0–1', c: 'r' },
    X: { rpe: '', label: 'Nieudana', hint: 'Seria nie wyszła', c: 'x' }
  };
  /** dokładne RPE przy świetle (korekta w PRO): zakres światła i krok w stronę sąsiedniego */
  L.EFF_FINE = { L: [6, 6.5, 7, 7.5, 8], S: [7.5, 8, 8.5, 9], W: [8.5, 9, 9.5, 10] };
  /**
   * wartości „Dokładniej” (PRO): ćwiczenia A i boje mają przy 🟢 pełny dół skali co 0,5 (5–7,5), żeby odróżnić „bardzo lekko”
   * od zwykłego „lekko” (w bojach RPE ≤ L.EASY_RPE otwiera „max dziś”; 22.11.2026, wariant b). Pozostałe: EFF_FINE.
   */
  L.EASY_RPE = 6.5;
  /** film przed kolejką: '' = można wysłać, inaczej powód (ta sama reguła co filmOk_ w apps-script/Kopia.gs: do 1 GB, tylko wideo) */
  L.FILM_MAX = 1024 * 1024 * 1024;
  L.filmOk = m => {
    const size = Number(m && m.size), type = String(m && m.mimeType || ''), name = String(m && m.fileName || ''), ext = /\.(mp4|m4v|mov|qt|webm|3gp|3g2|mkv|avi|hevc)$/i;
    if (!(size > 0)) return 'Pusty plik filmu.';
    if (size > L.FILM_MAX) return 'Film ma ' + (Math.round(size / 1024 / 1024 / 102.4) / 10).toString().replace('.', ',') + ' GB, a limit to 1 GB. Nagraj krótszy albo w niższej jakości (np. 1080p zamiast 4K).';
    if (type && !/^video\//i.test(type) && !ext.test(name)) return 'To nie jest film (' + type + '). Wybierz nagranie wideo.';
    if (!type && name && !ext.test(name)) return 'To nie jest film (' + name + '). Wybierz nagranie wideo.';
    return '';
  };
  /** podpis światła: przy skali RIR (PRO) liczba RIR na początku zamiast „zapas …” (23.11.2026); zapis bez zmian */
  L.EFF_RIR = { L: 'RIR ≥ 3 · szybko, czysto', S: 'RIR 2 · wolniej albo z poprawką', W: 'RIR 0–1 · walka', X: 'Seria nie wyszła' };
  /**
   * „Zaplanuj następną” (prowadzony trening, punkt 3c przeglądu v80, 23.11.2026): ta sama jednostka w następnym tygodniu.
   * src = ćwiczenia dzisiejszej jednostki z planu [{order, name, sets, reps, kg, rpe, prio}], done = {order: [{kg, rpe, fail}]} (serie robocze
   * i dodatkowe zapisane dziś, bez rozgrzewki i drop setów), target = ta jednostka w tyg. + 1, jeśli już jest w planie (te same pola) albo null.
   * Same 🟢 (każda seria ≤ RPE 7,5, bez nieudanej) w A i B z liczbą kg → najcięższa dzisiejsza + 2,5 kg (w dół do 2,5); inaczej kg z planu.
   * Plan z wyższym ciężarem niż propozycja zostaje. K, ćwiczenia na czas i kg słowem (BW, guma) bez zmian.
   * → [{order, torder, name, sets, reps, rpe, kg, was, today, lights, up}]
   */
  L.nextUnit = (src, done, target) => {
    const lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase(), num = v => typeof v === 'number' ? v : NaN;
    return (src || []).map(e => {
      const t = target ? target.find(x => lc(x.name) === lc(e.name)) || target.find(x => x.order === e.order && !(src || []).some(y => lc(y.name) === lc(x.name))) || null : null;
      const sets = (done && done[e.order]) || [], lights = sets.map(x => L.lightOf(x.rpe, x.fail ? 'FAIL' : ''));
      const kgs = sets.filter(x => !x.fail && typeof x.kg === 'number' && x.kg > 0).map(x => x.kg), today = kgs.length ? Math.max(...kgs) : NaN;
      const base = t ? t : e, planKg = base.kg;
      const up = /^[AB]$/.test(e.prio || '') && lights.length > 0 && lights.every(q => q === 'L') && isFinite(today) && !L.timeUnit(e.reps)
        && (typeof planKg === 'number' || planKg === '' || planKg === null || planKg === undefined);
      const prop = up ? L.floor25(today + 2.5) : NaN;
      const kg = up && !(num(planKg) >= prop) ? prop : planKg;
      return { order: e.order, torder: t ? t.order : null, name: e.name, sets: base.sets, reps: base.reps, rpe: base.rpe === undefined ? null : base.rpe,
        kg: kg === undefined ? '' : kg, was: planKg === undefined ? '' : planKg, today, lights, up: up && kg === prop && kg !== planKg };
    });
  };
  L.effHint = (q, rir) => (rir && L.EFF_RIR[q]) || (L.EFF[q] ? L.EFF[q].hint : '');
  L.effFine = (q, wide) => wide && q === 'L' ? [5, 5.5, 6, 6.5, 7, 7.5] : L.EFF_FINE[q] || [];
  /** RPE (i typ) → światło: ≤ 7,5 Lekko, 8–8,5 Średnio, ≥ 9 Ciężko, FAIL Nieudana; puste = '' (także stare wpisy) */
  L.lightOf = (r, typ) => {
    if (/FAIL/.test(typ || '')) return 'X';
    if (L.blank(r)) return '';
    const n = parseFloat(String(r).replace(',', '.'));
    if (isNaN(n)) return '';
    return n <= 7.5 ? 'L' : n < 9 ? 'S' : 'W';
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

  /* ---------- stan ciała: ból / napięcie w dowolny dzień (zakładka Stan; id = klient|data|miejsce ze stroną) ---------- */
  L.STAN_PLACES = ['Kolano', 'Biodro', 'Czworoboczny lędźwi', 'Bark', 'Łokieć', 'Nadgarstek'];
  L.STAN_CTX = ['spoczynek', 'przy rozciąganiu', 'w ćwiczeniu', 'po treningu'];
  /** klucz wpisu jak w arkuszu (bez klienta): „2026-11-18|Kolano L” */
  L.stanKey = (date, place, side) => [date, String(place || '').replace(/\s+/g, ' ').trim() + (side ? ' ' + side : '')].join('|');
  /** dzień wpisu: tekst RRRR-MM-DD albo ISO z arkusza (data zamieniona przez Arkusze) w strefie telefonu */
  L.stanDay = v => /T/.test(String(v || '')) ? L.localDate(new Date(v)) : String(v || '').slice(0, 10);
  /** wpisy z ostatnich `days` dni (licząc dziś), od najnowszych (dzień, potem chwila zapisu) */
  L.stanRecent = (rows, today, days = 14) => {
    const from = new Date(utc(today) - (days - 1) * 864e5).toISOString().slice(0, 10), t = v => Date.parse(String(v || '')) || 0;
    return (rows || []).map(r => Object.assign({}, r, { day: L.stanDay(r.data) })).filter(r => r.day && r.day >= from && r.day <= today)
      .sort((a, b) => (b.day > a.day ? 1 : b.day < a.day ? -1 : t(b.zapisano) - t(a.zapisano)));
  };
  /** zapisane wpisy (z aplikacji, także czekające w kolejce) nadpisują te same dzień + miejsce + stronę */
  L.stanApply = (rows, list, at) => {
    const add = [].concat(list || []).map(e => ({ id: 'local|' + L.stanKey(e.date, e.place, e.side), zapisano: at || '', data: e.date, miejsce: String(e.place || '').replace(/\s+/g, ' ').trim(),
      strona: e.side || '', ocena: e.score, kontekst: e.context || '', cwiczenie: e.context === 'w ćwiczeniu' ? e.exercise || '' : '', notatka: e.note || '' }));
    const keys = add.map(r => L.stanKey(r.data, r.miejsce, r.strona));
    return (rows || []).filter(r => keys.indexOf(L.stanKey(L.stanDay(r.data), r.miejsce, r.strona)) < 0).concat(add);
  };
  /** usunięcie wpisu: e = {date, place, side} */
  L.stanDrop = (rows, e) => (rows || []).filter(r => L.stanKey(L.stanDay(r.data), r.miejsce, r.strona) !== L.stanKey(e.date, e.place, e.side));

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
      if (r.own) return;                                                       // własny trening klienta nie zmienia obrazu planu
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
  /* ---------- własny trening klienta ---------- */
  /** tydzień planu dla daty: ostatni tydzień, którego pierwsza jednostka trenera wypada nie później niż ta data (inaczej pierwszy) */
  L.ownWeek = (plan, date) => {
    const first = {};
    plan.forEach(r => { if (r.own || !r.date) return; if (!first[r.week] || r.date < first[r.week]) first[r.week] = r.date; });
    const ws = Object.keys(first).map(Number).sort((a, b) => a - b);
    if (!ws.length) return Math.max(1, ...plan.map(r => Number(r.week) || 1));
    return ws.filter(w => first[w] <= date).pop() || ws[0];
  };
  /** kompleks we własnym treningu = jedno ćwiczenie „A + B” z powt. „1+1” (tak samo jak w planach trenera) */
  L.isComplex = name => /\S\s+\+\s+\S/.test(String(name || ''));
  /** połączenie dwóch pozycji kreatora: serie i kg z pierwszej, każda nowa część 1 powt. (część będąca już kompleksem zachowuje swoje) */
  L.ownJoin = (a, b) => {
    const r = e => L.isComplex(e.name) && /^\d+(\s*\+\s*\d+)+$/.test(String(e.reps).trim()) ? String(e.reps).replace(/\s/g, '') : '1';
    return { name: a.name + ' + ' + b.name, sets: a.sets, reps: r(a) + '+' + r(b), kg: a.kg || b.kg || '', t: false };
  };
  /** rozłączenie kompleksu na osobne ćwiczenia (serie i kg wspólne, powt. z części); null, gdy to nie kompleks */
  L.ownSplit = e => {
    if (!L.isComplex(e.name)) return null;
    const n = String(e.name).split(/\s+\+\s+/), r = String(e.reps).split('+').map(x => x.trim());
    return n.map((name, i) => ({ name, sets: e.sets, reps: n.length === r.length && /^\d+$/.test(r[i]) ? r[i] : '1', kg: e.kg, t: false }));
  };
  /** powtórzenia kompleksu: liczba na każdą część („1+2” dla dwóch części) */
  L.complexRepsOk = (name, reps) => { const t = String(reps).trim(); return /^\d+(\s*\+\s*\d+)+$/.test(t) && t.split('+').length === String(name).split(/\s+\+\s+/).length; };
  /* ---------- obwód / superseria: sąsiednie ćwiczenia z tą samą literą (Plan.obwod), robione na zmianę ---------- */
  L.CIRCUIT_REST = 90;                                                           // przerwa po całej rundzie [s]
  /** grupy obwodów w jednostce: [{id: 'A', orders: [2, 3, 4]}]; sama litera przy jednym ćwiczeniu albo EMOM = zwykłe ćwiczenie */
  L.circuitGroups = exs => {
    const out = []; let g = null;
    (exs || []).forEach(ex => {
      const c = /^EMOM$/i.test(String(ex.mode || '')) ? '' : String(ex.circuit || '');
      if (c && g && g.id === c) g.orders.push(ex.order); else { g = c ? { id: c, orders: [ex.order] } : null; if (g) out.push(g); }
    });
    return out.filter(x => x.orders.length > 1);
  };
  /**
   * Stan obwodu z liczby zrobionych serii: members [{order, sets, done}] w kolejności ćwiczeń.
   * → {round, rounds, next, after, fresh, done}: next = ćwiczenie do zrobienia teraz, after = następne w tej rundzie,
   * fresh = wszyscy na tym samym etapie (runda właśnie się zamknęła albo jeszcze się nie zaczęła) → pora na przerwę.
   */
  L.circuitState = members => {
    const rounds = Math.max(0, ...members.map(m => m.sets)), act = members.filter(m => m.done < m.sets);
    if (!act.length) return { round: rounds, rounds, next: null, after: null, fresh: true, done: true };
    const min = Math.min(...act.map(m => m.done)), now = act.filter(m => m.done === min);
    return { round: min + 1, rounds, next: now[0].order, after: now[1] ? now[1].order : null, fresh: now.length === act.length, done: false };
  };
  /** kreator: następna wolna litera obwodu */
  L.circuitLetter = list => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(c => !(list || []).some(e => e.c === c)) || 'Z';
  /** kreator: litera zostaje tylko przy sąsiadach z tą samą literą; rundy (serie) wspólne = z pierwszego ćwiczenia obwodu */
  L.circuitTidy = list => (list || []).map((e, i, a) => {
    if (!e.c) return e;
    const same = j => !!a[j] && a[j].c === e.c;
    if (!same(i - 1) && !same(i + 1)) return Object.assign({}, e, { c: '' });
    let j = i; while (same(j - 1)) j--;
    return e.old ? e : Object.assign({}, e, { sets: a[j].sets });
  });
  /** następna wolna nazwa własnej jednostki w tygodniu: W1, W2… */
  /** nowa jednostka trenera z prowadzonego treningu: T<n> po najwyższym numerze jednostki w tym tygodniu (dowolny przedrostek) */
  L.liveNextDay = (plan, week) => {
    const n = plan.filter(r => r.week === week).map(r => +((/(\d+)$/.exec(String(r.day)) || [])[1] || 0));
    return 'T' + ((n.length ? Math.max(...n) : 0) + 1);
  };
  /**
   * notatka trenera do ćwiczenia (prowadzony trening): wiersz serii, w którym siedzi (jak liveNoteRow_ w Code.gs).
   * rows = [{seria, notatka_trenera, komentarz_trenera}] → indeks albo -1: wiersz z notatką lub komentarzem (pierwszy wg serii),
   * inaczej najniższa seria robocza, inaczej pierwszy; bez pominięć (seria 0).
   */
  L.liveNoteRow = rows => {
    const ord = s => { const n = Number(s); return isFinite(n) && String(s).trim() !== '' ? n : 1e6; };
    const ix = (rows || []).map((r, i) => i).filter(i => String(rows[i].seria).trim() !== '0')
      .sort((a, b) => ord(rows[a].seria) - ord(rows[b].seria) || String(rows[a].seria).localeCompare(String(rows[b].seria)));
    const has = i => String(rows[i].notatka_trenera || '').trim() || String(rows[i].komentarz_trenera || '').trim();
    const pick = ix.find(has);
    if (pick !== undefined) return pick;
    const work = ix.find(i => ord(rows[i].seria) >= 1 && ord(rows[i].seria) < 1e6);
    return work !== undefined ? work : ix.length ? ix[0] : -1;
  };
  L.ownNextDay = (plan, week) => {
    const n = plan.filter(r => r.week === week && /^W\d+$/.test(r.day)).map(r => +r.day.slice(1));
    return 'W' + ((n.length ? Math.max(...n) : 0) + 1);
  };
  /**
   * wyszukiwarka ćwiczeń: najpierw ćwiczenia z planu klienta, potem baza [[nazwa, film, „partia; partia”, „alias; alias”]]; wszystkie
   * słowa zapytania muszą wystąpić w nazwie (bez wielkości liter i polskich znaków), a w bazie także w jednym z aliasów
   * (np. „wiosłowanie sztangą” → „Bent Row”; najpierw trafienia po nazwie). → [{name, film, mine, alias}] (alias = trafiony alias)
   * part = partia mięśniowa: tylko ćwiczenia z tą partią, także bez wpisanego zapytania.
   */
  L.exSearch = (planNames, base, q, limit = 12, part = '') => {
    const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
    const film = {}, pt = {}, P = fold(part).trim(); (base || []).forEach(b => { film[fold(b[0])] = !!b[1]; pt[fold(b[0])] = fold(b[2] || '').split(';').map(s => s.trim()); });
    const words = fold(q).split(/\s+/).filter(Boolean), has = n => words.every(w => fold(n).includes(w)), inPart = n => !P || (pt[fold(n)] || []).includes(P);
    const hit = n => has(n) && inPart(n), seen = {}, out = [];
    (planNames || []).forEach(n => { const k = fold(n); if (!seen[k] && hit(n)) { seen[k] = 1; out.push({ name: n, film: !!film[k], mine: true }); } });
    if (words.length || P) (base || []).forEach(b => { const k = fold(b[0]); if (!seen[k] && hit(b[0])) { seen[k] = 1; out.push({ name: b[0], film: !!b[1], mine: false }); } });
    if (words.length) (base || []).forEach(b => {
      const k = fold(b[0]); if (seen[k] || !inPart(b[0])) return;
      const a = String(b[3] || '').split(';').map(x => x.trim()).filter(Boolean).find(has);
      if (a) { seen[k] = 1; out.push({ name: b[0], film: !!b[1], mine: false, alias: a }); }
    });
    return out.slice(0, limit);
  };
  /**
   * zrobione jednostki (ta sama reguła co unitsDone_ w Code.gs, 23.11.2026): Sesje albo seria (nie R, nie 0) z ✓ lub FAIL
   * w ćwiczeniu innym niż K; jednostka z samymi K (albo seria spoza planu) liczy się po serii K. Wyzerowana seria i sam film nie.
   * plan: wiersze z getData {week, day, order, prio}; sessions / logs: wiersze arkusza → {'tydzień|jednostka': 1}
   */
  L.doneUnits = (plan, sessions, logs) => {
    const t = v => String(v === undefined || v === null ? '' : v).trim(), key = (w, d) => Number(w) + '|' + t(d);
    const prio = {}, notK = {}, out = {};
    (plan || []).forEach(r => { const u = key(r.week, r.day), p = t(r.prio).toUpperCase(); prio[u + '|' + Number(r.order)] = p; if (p !== 'K') notK[u] = 1; });
    (sessions || []).forEach(x => { out[key(x.tydzien, x.jednostka)] = 1; });
    (logs || []).forEach(l => {
      const se = t(l.seria); if (!se || se === '0' || /^R/i.test(se)) return;
      if (t(l.wykonane).toUpperCase() !== 'TAK' && !/FAIL/i.test(t(l.typ))) return;
      const u = key(l.tydzien, l.jednostka);
      if (prio[u + '|' + Number(l.nr_cw)] !== 'K' || !notK[u]) out[u] = 1;
    });
    return out;
  };
  /** partie mięśniowe z bazy [[nazwa, film, „partia; partia”]], alfabetycznie */
  L.exParts = base => [...new Set([].concat(...(base || []).map(b => String(b[2] || '').split(';').map(s => s.trim()).filter(Boolean))))].sort((a, b) => a.localeCompare(b, 'pl'));
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
        if (kg > 0 && reps > 0 && !L.timeUnit(ex.reps)) ton += kg * reps;     // ćwiczenie na czas: sekundy to nie powtórzenia
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
  /** ocena boju → zapis jak L.EFF: Łatwo rpe 7, Średnio 8, Walka 9, Spalone = FAIL bez rpe; światła: w = białe, r = czerwone */
  L.RATE = {
    L: { rpe: L.EFF.L.rpe, label: 'Łatwo', lights: 'www' }, S: { rpe: L.EFF.S.rpe, label: 'Średnio', lights: 'wwr' },
    W: { rpe: L.EFF.W.rpe, label: 'Walka', lights: 'wrr' }, X: { rpe: '', label: 'Spalone', lights: 'rrr' }
  };
  /** ocena zapisanego podejścia; starsze wpisy bez „ocena” → z typu FAIL albo RPE */
  L.rateOf = l => {
    if (!l || l.wykonane !== 'TAK') return '';
    const o = String(l.ocena || '').toUpperCase();
    if (L.RATE[o]) return o;
    return L.lightOf(l.rpe, l.typ);
  };
  /** sufit dnia = floor_2,5(1RM × (procent + sufit_oly)); słaba dyspozycja (uwaga / zmęczenie) → ciężar z planu; bez % → null */
  L.olyCap = (planKg, pct, ceil, weak) => {
    if (!(pct > 0) || !(planKg > 0)) return weak && planKg > 0 ? planKg : null;
    return weak ? planKg : L.floor25(planKg / pct * (pct + (ceil >= 0 ? ceil : 0.05)));
  };
  /** sufit dnia zablokowany: jest już zaliczone podejście robocze 🟡 / 🔴 / ✖ (Średnio, Walka, Spalone) → od teraz sufit = kg z planu */
  L.olyLocked = rows => (rows || []).some(x => x && x.done && /^[SWX]$/.test(x.rate || ''));
  /** kolor oceny do komunikatu: Średnio 🟡, Walka i Spalone 🔴 */
  const olyMark = q => q === 'S' ? '🟡' : q === 'W' || q === 'X' ? '🔴' : '🟢';
  /**
   * Propozycja pod ostatnio ocenionym podejściem.
   * rows: podejścia robocze (bez rozgrzewki i drop setów) w kolejności [{kg, rate, done, rpe}], i: indeks ocenionego;
   * o: {cap, one, weak, why, plan (kg z planu), simple (PROSTY: zwykłe Łatwo otwiera sufit)} → {lvl: up|stay|down|drop, kg, txt, lock?, drop?} albo null.
   * Zejście (18.11.2026): pierwsze 🟡 / 🔴 / ✖ blokuje „max dziś”; kolejne serie wracają do kg z planu
   * (poniżej planu dalej działają zejścia po drugiej walce i dwóch spalonych). 🔴 / ✖ na ostatniej serii → „+ drop set” −10%.
   */
  L.sugOly = (rows, i, o = {}) => {
    const r = rows[i];
    if (!r || !r.done || !r.rate) return null;
    if (rows.some((x, j) => j > i && x.done)) return null;                       // tylko ostatnie ocenione
    const kg = r.kg, f = v => L.fmtKg(v) + ' kg', cap = o.cap, plan = o.plan > 0 ? o.plan : null;
    if (!rows.some((x, j) => j > i && !x.done)) {                                // brak serii do zrobienia: po 🔴 / ✖ podpowiedź drop setu
      if ((r.rate === 'W' || r.rate === 'X') && kg > 0) { const k = Math.max(2.5, L.floor25(kg * 0.9)); return { lvl: 'drop', kg: k, drop: true, txt: `🔴 → serie z planu zrobione. Jeśli chcesz dołożyć: + drop set ${f(k)} (−10%).` }; }
      return null;
    }
    const prev = rows.slice(0, i).reverse().find(x => x.done);
    const base = () => {
      if (r.rate === 'L') {
        // wariant b (22.11.2026): w PRO „max dziś” otwiera tylko Łatwo z RPE ≤ 6,5 (Dokładniej); zwykłe Łatwo (7) dokłada do planu
        const easy = o.simple || !plan || L.isNum(r.rpe) && r.rpe <= L.EASY_RPE;
        if (!easy && cap > plan && kg + 2.5 > plan && kg + 2.5 <= cap && !L.olyLocked(rows.slice(0, i + 1)))     // po blokadzie: niżej
          return kg < plan ? { lvl: 'up', kg: plan, txt: `Łatwo: możesz wrócić do planu (${f(plan)}). Wyżej (do ${f(cap)}) tylko po bardzo łatwym: Dokładniej, RPE ≤ 6,5.` }
            : { lvl: 'stay', kg, txt: `Łatwo: zostań przy ${f(kg)}. Do ${f(cap)} dokładasz tylko po bardzo łatwym: Dokładniej, RPE ≤ 6,5.` };
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
    const s = base();
    if (!s || plan === null || !L.olyLocked(rows.slice(0, i + 1))) return s;
    // zablokowany sufit: nad planem → plan; Łatwo nie podnosi ponad plan; zejścia poniżej planu bez zmian
    const stop = rows.slice(0, i + 1).find(x => x.done && /^[SWX]$/.test(x.rate || ''));
    const mark = olyMark(r.rate === 'L' ? stop.rate : r.rate);
    if (kg > plan) return { lvl: 'down', kg: plan, lock: true, txt: `${mark} → wracasz do planu (${f(plan)}).` };
    if (s.lvl === 'up') {
      const k = Math.min(s.kg, plan);
      return k > kg ? { lvl: 'up', kg: k, lock: true, txt: `Łatwo: możesz wrócić do planu (${f(k)}). Wyżej nie, po ${mark} sufit to plan.` }
        : { lvl: 'stay', kg, lock: true, txt: `Łatwo, ale po ${mark} sufit to plan: zostań przy ${f(kg)}.` };
    }
    if (r.rate === 'S' && kg === plan) return { lvl: 'stay', kg, lock: true, txt: `🟡 → zostajesz przy planie (${f(plan)}).` };
    return Object.assign(s, { lock: true });
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
    // wiosłowania przed wyciskaniem: „Dumbbell Incline Bench Row” to wiosłowanie, nie wyciskanie (22.11.2026)
    [/wiosł|\brows?\b|podciąg|ściąg|pull/, ['Wiosłowanie hantlem', 'Wiosłowanie na wyciągu', 'Ściąganie drążka wyciągu']],
    [/wyciskan.*(leż|ław)|bench|pomp/, ['Wyciskanie hantli na ławce', 'Pompki', 'Wyciskanie na maszynie']],
    [/wyciskan|press/, ['Wyciskanie hantli siedząc', 'Wyciskanie landmine', 'Wyciskanie na maszynie nad głowę']]
  ];
  /** czy zamienniki są dobrane automatycznie (wzorzec ruchu), a nie z planu / bazy trenera */
  L.swapAuto = ex => !(ex.swaps || []).some(s => String(s).trim());
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
  /** ankieta Hoopera: [pole, nazwa, opis, odwrócony widok]; zapis zawsze 1 = dobrze, sen pokazujemy odwrotnie (7 = bardzo dobry) */
  L.HOOPER = [['sen', 'Sen', '1 = bardzo zły, 7 = bardzo dobry', true], ['stres', 'Stres', '1 = brak'], ['zmeczenie', 'Zmęczenie', '1 = brak'], ['bolesnosc', 'Bolesność mięśni', '1 = brak']];
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

  /**
   * zmiana klienta w jednostce trenera, naniesiona na dane w telefonie (ta sama reguła co planEdit_ w Code.gs).
   * plan = wiersze getData, removed = [{week, day, order, name, row?}] (usunięte ćwiczenia), done = {tydzień|jednostka: 1} (zrobione).
   * e = {op: add | del | undel | swap, week, day, forever, order, name, sets, reps, kg, to, infos, parts}.
   * „Na stałe” (forever) = także kolejne tygodnie tej samej jednostki w tym samym bloku, niezrobione; ćwiczenie szukane po nazwie.
   * Zwraca {plan, removed, n} (nowe tablice; n = liczba zmienionych wierszy) albo {error}.
   */
  L.EDIT_NR = 50;
  L.planEdit = (plan, removed, done, e) => {
    plan = plan || []; removed = removed || []; done = done || {};
    const week = Number(e.week), day = String(e.day), lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
    const inU = (r, w) => Number(r.week) === w && String(r.day) === day;
    const cur = plan.filter(r => inU(r, week));
    if (!cur.length && e.op !== 'undel') return { error: 'Nie ma takiej jednostki w planie.' };
    const base = cur[0] || removed.map(x => x.row).find(r => r && inU(r, week)) || {};
    const block = lc(base.block);
    const later = [...new Set(plan.filter(r => Number(r.week) > week && String(r.day) === day && lc(r.block) === block && !r.own && !done[r.week + '|' + day]).map(r => Number(r.week)))].sort((a, b) => a - b);
    const weeks = [week].concat(e.forever ? later : []);
    let out = plan.slice(), rem = removed.slice(), n = 0;
    if (e.op === 'add') {
      const name = String(e.name || '').trim().replace(/\s+/g, ' ').slice(0, 80), sets = Math.round(Number(e.sets)), reps = String(e.reps === undefined || e.reps === null ? '' : e.reps).trim().slice(0, 12);
      if (!name) return { error: 'Podaj nazwę ćwiczenia.' };
      if (!(sets >= 1 && sets <= L.SETS_MAX) || !reps) return { error: 'Serie 1–' + L.SETS_MAX + ' i powtórzenia.' };
      const kv = String(e.kg === undefined || e.kg === null ? '' : e.kg).trim(), kn = parseFloat(kv.replace(',', '.'));
      const kg = kv === '' ? '' : isFinite(Number(kv.replace(',', '.'))) ? kn : kv.slice(0, 10);
      weeks.forEach(w => {
        const rows = plan.filter(r => inU(r, w));
        // już jest: w kolejnych tygodniach dowolne ćwiczenie o tej nazwie, w tej jednostce wcześniej dodane (ponowne naniesienie tej samej zmiany nic nie dubluje)
        // trener (prowadzony trening): zwykłe ćwiczenie planu (coach, prio B, nr po ostatnim), ta sama nazwa dodana przez trenera = już jest
        if (!rows.length || rows.some(r => lc(r.name) === lc(name) && (w !== week || r.added || (e.trainer && r.coach)))) return;
        const order = Math.max(e.trainer ? 0 : L.EDIT_NR, ...rows.map(r => Number(r.order) || 0), ...removed.filter(x => inU(x, w)).map(x => Number(x.order) || 0)) + 1, b = rows[0];
        // trener: priorytet z okna, „połącz z poprzednim” = obwód z ostatnim ćwiczeniem jednostki (ta sama reguła co planEdit_)
        let circuit = '';
        if (e.trainer && e.link) {
          const last = rows.slice().sort((a, c) => (Number(c.order) || 0) - (Number(a.order) || 0))[0];
          if (last && !/EMOM/i.test(String(last.mode || ''))) {
            circuit = last.circuit || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(c => !rows.some(r => r.circuit === c)) || 'Z';
            if (!last.circuit) out = out.map(r => r === last ? Object.assign({}, r, { circuit }) : r);
          }
        }
        out.push({ week: w, day, title: b.title, date: b.date, order, name, prio: e.trainer ? (/^[ABK]$/.test(String(e.prio || '')) ? String(e.prio) : 'B') : 'A', sets, reps, pct: null, kg, rpe: '', note: '', extra: null, drop: 0,
          group: '', block: b.block || '', swaps: [], infos: e.infos || [], parts: e.parts || [], circuit, ...(e.trainer ? { coach: true } : { added: true }) });
        n++;
      });
      return { plan: out, removed: rem, n };
    }
    if (e.op === 'undel') {
      const hit = removed.find(x => inU(x, week) && Number(x.order) === Number(e.order));
      if (!hit) return { error: 'To ćwiczenie nie jest usunięte.' };
      const back = removed.filter(x => String(x.day) === day && lc(x.name) === lc(hit.name) && (x === hit || later.indexOf(Number(x.week)) >= 0 || (Number(x.week) > week && !plan.some(r => inU(r, Number(x.week))))));
      rem = removed.filter(x => back.indexOf(x) < 0);
      back.forEach(x => { if (x.row) out.push(x.row); n++; });
      return { plan: out, removed: rem, n, partial: back.some(x => !x.row) };
    }
    const hit = cur.find(r => Number(r.order) === Number(e.order));
    if (!hit) return { error: 'Nie ma takiego ćwiczenia w jednostce.' };
    const same = w => w === week ? [hit] : plan.filter(r => inU(r, w) && lc(r.name) === lc(hit.name));
    if (e.op === 'del') {
      const gone = [].concat(...weeks.map(same));
      out = plan.filter(r => gone.indexOf(r) < 0);
      rem = rem.concat(gone.map(r => ({ week: r.week, day: r.day, order: r.order, name: r.name, row: r })));
      return { plan: out, removed: rem, n: gone.length };
    }
    if (e.op === 'swap') {
      const to = String(e.to || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!to || lc(to) === lc(hit.name)) return { error: 'Podaj inne ćwiczenie.' };
      const ch = [].concat(...later.map(same));
      out = plan.map(r => ch.indexOf(r) < 0 ? r : Object.assign({}, r, { name: to, infos: e.infos || [], parts: e.parts || [], swaps: [],
        note: ((String(r.note || '').trim() ? String(r.note).trim() + ' · ' : '') + 'zamiana klienta: ' + hit.name + ' → ' + to).slice(0, 300) }));
      return { plan: out, removed: rem, n: ch.length };
    }
    return { error: 'Nieznana zmiana.' };
  };
  /**
   * historia ćwiczenia do okna „Historia”: ostatnie n INNYCH jednostek z tym ćwiczeniem (po nazwie wykonanej, bez wielkości liter),
   * od najnowszej (kolejność jak w lastTop: po czasie zapisu, więc pierwsza pozycja = „Ostatnio”).
   * Każda: { week, day, date, top (najcięższa zaliczona seria, jak lastTop), runs: [{kg, reps: [..]}] – kolejne serie z tym samym
   * ciężarem zebrane razem; nieudana seria ma reps „✕” }. Bez rozgrzewki. dates: {tydzień|jednostka → faktyczny dzień}.
   */
  L.exHistory = (logs, name, week, day, n = 5, dates = {}) => {
    const nm = String(name).trim().toLowerCase(), by = {};
    (logs || []).forEach(l => {
      if (String(l.cwiczenie || '').trim().toLowerCase() !== nm || l.wykonane !== 'TAK' || /^R/i.test(String(l.seria))) return;
      if (String(l.tydzien) === String(week) && String(l.jednostka) === String(day)) return;
      const k = l.tydzien + '|' + l.jednostka;
      const u = by[k] = by[k] || { week: l.tydzien, day: String(l.jednostka), date: dates[k] || String(l.data || '').slice(0, 10), t: 0, rows: [] };
      u.rows.push(l); u.t = Math.max(u.t, Date.parse(l.zapisano) || 0);
    });
    const kgOf = l => { const v = nf(l.kg); return isNaN(v) ? String(l.kg === undefined || l.kg === null ? '' : l.kg) : v; };
    const ord = s => /^D/i.test(String(s)) ? 1000 + (parseInt(String(s).slice(1)) || 0) : parseInt(s) || 0;
    return Object.values(by).sort((a, b) => b.t - a.t || String(b.date).localeCompare(String(a.date))).slice(0, n).map(u => {
      const rows = u.rows.slice().sort((a, b) => ord(a.seria) - ord(b.seria)), ok = rows.filter(l => !/FAIL/.test(l.typ || ''));
      const t = ok.slice().sort((a, b) => (nf(b.kg) || 0) - (nf(a.kg) || 0) || (nf(b.powt) || 0) - (nf(a.powt) || 0))[0];
      const runs = [];
      rows.forEach(l => { const kg = kgOf(l), last = runs[runs.length - 1], r = /FAIL/.test(l.typ || '') ? '✕' : String(l.powt === undefined || l.powt === null ? '' : l.powt);
        if (last && last.kg === kg) last.reps.push(r); else runs.push({ kg, reps: [r] }); });
      return { week: u.week, day: u.day, date: u.date, runs,
        top: t ? { kg: kgOf(t), reps: t.powt, rpe: t.rpe, ocena: String(t.ocena || '').toUpperCase() } : null };
    });
  };
  /* ---------- postęp: siła, objętość, obciążenie (cała historia z Logu) ---------- */
  const mondayOf = d => L.addDays(d, -((new Date(utc(d)).getUTCDay() + 6) % 7));
  /** e1RM = kg × (1 + (powt. + RIR) / 30), RIR = 10 − RPE; jak w podsumowaniu: tylko serie z RPE ≥ 5; powt. + RIR ≤ 1 → sam ciężar */
  // seria bez RPE (puste pole) liczy się jak RPE 10: ostrożnie, najniższe szacowane maks. (ustalenie 17.11); RPE < 5 dalej pomijane
  L.e1rm = (kg, reps, rpe) => {
    const r = rpe === '' || rpe === null || rpe === undefined || (typeof rpe === 'number' && isNaN(rpe)) ? 10 : Number(rpe);
    if (!(kg > 0 && reps > 0 && r >= 5)) return NaN;
    const n = reps + (10 - r);
    return n <= 1 ? kg : kg * (1 + n / 30);                                    // singiel do upadku = sam ciężar (24.11.2026; e1rm_ w Code.gs)
  };
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
        fail: /FAIL/.test(l.typ || ''), drop: /DROP/.test(l.typ || '') || /^D/i.test(String(l.seria)), plan: String(p.name || ''),
        rel: kg > 0 && one > 0 ? kg / one : NaN };
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
  /**
   * serie twarde (RPE ≥ 7, FAIL albo drop) na partię mięśniową: bieżący tydzień i średnia z 4 poprzednich.
   * parts: {nazwa ćwiczenia małymi literami → [partie]} z zakładki Ćwiczenia (ćwiczenie liczy się do każdej swojej partii);
   * po zamianie liczy się wykonane ćwiczenie.
   * → [{part, now, all, avg}] od największej liczby serii twardych
   */
  L.hardSetsByPart = (sets, parts, today) => {
    const k = v => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase(), ws = mondayOf(today), by = {};
    sets.forEach(x => {
      const ps = [].concat((parts || {})[k(x.name)] || (parts || {})[k(x.plan)] || []); if (!ps.length) return;
      const back = Math.round(L.dayDiff(mondayOf(x.date), ws) / 7);              // 0 = ten tydzień, 1…4 = poprzednie
      if (back < 0 || back > 4) return;
      const hard = x.fail || x.drop || x.rpe >= 7;
      ps.forEach(part => { const b = by[part] || (by[part] = { part, now: 0, all: 0, prev: 0 }); if (back === 0) { b.all++; if (hard) b.now++; } else if (hard) b.prev++; });
    });
    return Object.values(by).map(b => ({ part: b.part, now: b.now, all: b.all, avg: Math.round(b.prev / 4 * 10) / 10 }))
      .sort((a, b) => b.now - a.now || b.avg - a.avg || a.part.localeCompare(b.part, 'pl'));
  };
  /**
   * komentarze trenera: Log.komentarz_trenera (ręczny) i Log.komentarz_dysk (z komentarzy do filmu na Dysku, „0:15 treść”)
   * oraz Sesje.komentarz_trenera → [{key, date, title, lines: [{t, txt}], kind: 'L'|'S', id, rep, repAt}] od najnowszych; key zmienia się
   * razem z treścią trenera (nie z odpowiedzią klienta), więc poprawiony komentarz znów jest „nowy”. rep = odpowiedź klienta (odpowiedz_klienta)
   */
  /** chwila filmu z komentarza („0:23”, „0:23,5”, „1:02.4”) → sekundy; zła = -1 */
  L.filmSec = v => { const m = /^(\d{1,3}):(\d{2})(?:[,.](\d))?$/.exec(String(v || '').trim()); return m && +m[2] < 60 ? +m[1] * 60 + +m[2] + (m[3] ? +m[3] / 10 : 0) : -1; };
  L.coachNotes = (logs, sessions) => {
    const t = v => String(v === undefined || v === null ? '' : v).trim(), out = [];
    const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
    const lines = txt => txt.split(/\n+/).map(x => x.trim()).filter(Boolean).map(x => { const m = /^(\d{1,3}:[0-5]\d(?:[,.]\d)?)\s+(.*)$/.exec(x); return m ? { t: m[1], s: L.filmSec(m[1]), txt: m[2] } : { t: '', s: -1, txt: x }; });
    const add = (kind, r, title, txt, ord) => { if (txt) out.push({ key: kind + '|' + r.id + '|' + hash(txt), date: String(r.data || '').slice(0, 10), title, lines: lines(txt),
      week: t(r.tydzien), unit: t(r.jednostka), ord, kind, id: t(r.id), rep: t(r.odpowiedz_klienta), repAt: t(r.odpowiedz_at).slice(0, 10), video: kind === 'L' && /^https:\/\/drive\.google\.com\//.test(t(r.film_link)) }); };
    (logs || []).forEach(l => add('L', l, t(l.cwiczenie) + ' · seria ' + t(l.seria), [t(l.komentarz_trenera), t(l.komentarz_dysk)].filter(Boolean).join('\n'), [nf(l.nr_cw) || 0, t(l.seria)]));
    (sessions || []).forEach(s => add('S', s, 'Trening ' + t(s.jednostka), t(s.komentarz_trenera), [-1, '']));
    return out.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'pl'));
  };
  /**
   * komentarze trenera pogrupowane do zakładki Trener: tydzień (najnowszy na górze) → jednostka (wg dnia) → komentarze
   * (najpierw do całego treningu, potem wg kolejności ćwiczeń i serii). dates: {tydzień|jednostka → faktyczny dzień}.
   * → [{week, from, to, units: [{unit, date, notes}]}]
   */
  L.notesByWeek = (notes, dates = {}) => {
    const W = {}, sn = v => { const n = parseFloat(String(v).replace(/^\D+/, '')); return isNaN(n) ? 0 : n; };
    (notes || []).forEach(n => {
      const w = W[n.week] || (W[n.week] = { week: n.week, units: {} }), d = dates[n.week + '|' + n.unit] || n.date;
      const u = w.units[n.unit] || (w.units[n.unit] = { unit: n.unit, date: d, notes: [] });
      if (d && (!u.date || d < u.date)) u.date = d;
      u.notes.push(n);
    });
    const ord = (a, b) => a.ord[0] - b.ord[0] || /^\d/.test(b.ord[1]) - /^\d/.test(a.ord[1]) || sn(a.ord[1]) - sn(b.ord[1]) || String(a.ord[1]).localeCompare(String(b.ord[1]));
    return Object.values(W).map(w => {
      const units = Object.values(w.units).sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.unit.localeCompare(b.unit, 'pl'));
      units.forEach(u => u.notes.sort(ord));
      const ds = units.map(u => u.date).filter(Boolean).sort();
      return { week: w.week, from: ds[0] || '', to: ds[ds.length - 1] || '', units };
    }).sort((a, b) => (nf(b.week) || 0) - (nf(a.week) || 0) || String(b.from).localeCompare(String(a.from)));
  };
  /**
   * podsumowanie tygodnia kalendarzowego (pon–niedz) do Postęp → Tydzień. d:
   *   units [{week, day, date, done, own}] (date = faktyczny dzień zrobionej albo z planu), plan (wiersze getData),
   *   sets (doneSets), sessions (Sesje), ready (Dyspozycja: data, werdykt), logs (Log: pominięte), notes (coachNotes),
   *   dates {tydzień|jednostka → faktyczny dzień}.
   * Własne treningi liczą się osobno (own) i nie wchodzą do „zrobione z planu”.
   */
  L.weekSummary = (mon, d) => {
    const end = L.addDays(mon, 6), inW = x => !!x && x >= mon && x <= end, D = d.dates || {};
    const ud = (w, j, fb) => D[w + '|' + j] || String(fb || '').slice(0, 10);
    const us = (d.units || []).filter(u => inW(u.date)), plan = us.filter(u => !u.own);
    const pk = {}; plan.forEach(u => { pk[u.week + '|' + u.day] = 1; });
    const planSets = (d.plan || []).reduce((n, r) => n + (pk[r.week + '|' + r.day] ? Number(r.sets) || 0 : 0), 0);
    const sets = (d.sets || []).filter(x => inW(x.date)), tonOf = xs => Math.round(xs.reduce((t, x) => t + (x.kg > 0 && x.reps > 0 ? x.kg * x.reps : 0), 0));
    const prev = [1, 2, 3, 4].map(i => { const m = L.addDays(mon, -7 * i), e = L.addDays(m, 6); return tonOf((d.sets || []).filter(x => x.date >= m && x.date <= e)); }).filter(t => t > 0);
    // rekordy: najlepszy wynik w tym tygodniu lepszy od wszystkiego wcześniej (pierwszy wynik w historii to jeszcze nie rekord)
    const names = [...new Set((d.sets || []).filter(x => x.prio === 'A').map(x => x.name))], recs = [];
    names.forEach(name => {
      const ser = L.strengthSeries(d.sets || [], name), before = ser.filter(p => p.date < mon), now = ser.filter(p => inW(p.date) && p.pr);
      if (!before.length || !now.length) return;
      const top = now[now.length - 1], was = Math.max(...before.map(p => p.v));
      recs.push({ name, v: top.v, delta: Math.round((top.v - was) * 10) / 10, date: top.date, oly: (d.sets || []).some(x => x.name === name && (x.grp === 'R' || x.grp === 'P')) });
    });
    // sesje: RPE, samopoczucie, czas, ból (najwyższy w tygodniu z miejscem)
    const ses = (d.sessions || []).map(x => ({ x, date: ud(x.tydzien, x.jednostka, x.data) })).filter(o => inW(o.date)).sort((a, b) => a.date.localeCompare(b.date));
    const vals = k => ses.map(o => nf(o.x[k])).filter(v => v >= 0);
    let pain = null;
    ses.forEach(o => {
      String(o.x.bol || '').split(';').forEach(q => { const m = q.split(':'), v = nf((m[1] || '').trim()); if (v >= 0 && (!pain || v > pain.v)) pain = { place: (m[0] || '').trim(), v, date: o.date }; });
      const bm = nf(o.x.bol_max); if (bm >= 0 && (!pain || bm > pain.v)) pain = { place: '', v: bm, date: o.date };
    });
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
    const ready = { ok: 0, warn: 0, bad: 0 };
    (d.ready || []).forEach(r => { if (!inW(String(r.data || '').slice(0, 10)) || !r.werdykt) return; ready[/zmęcz/i.test(r.werdykt) ? 'bad' : /uwaga/i.test(r.werdykt) ? 'warn' : 'ok']++; });
    const skips = (d.logs || []).filter(l => /SKIP/.test(l.typ || '') && inW(ud(l.tydzien, l.jednostka, l.data)))
      .map(l => ({ name: String(l.cwiczenie || ''), why: String(l.uwagi || '').trim(), unit: String(l.jednostka) }));
    const notes = (d.notes || []).filter(n => inW(ud(n.week, n.unit, n.date))).length;
    return {
      mon, end, week: plan.length ? plan[0].week : us.length ? us[0].week : null,
      units: { plan: plan.length, done: plan.filter(u => u.done).length, list: plan.map(u => ({ day: u.day, date: u.date, done: !!u.done })), own: us.filter(u => u.own && u.done).length },
      sets: { done: sets.length, plan: planSets }, ton: tonOf(sets), tonAvg: prev.length ? Math.round(prev.reduce((a, b) => a + b, 0) / prev.length) : null,
      min: vals('czas_min').reduce((a, b) => a + b, 0), rpe: vals('rpe_sesji'), rpeAvg: avg(vals('rpe_sesji')), feel: avg(vals('samopoczucie').filter(v => v > 0)),
      pain, ready, records: recs.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'pl')),
      skips, fails: sets.filter(x => x.fail && x.grp !== 'R' && x.grp !== 'P').length, notes,
      empty: !sets.length && !ses.length && !skips.length
    };
  };
  /**
   * podsumowanie zakończonej jednostki do okna „Trening zrobiony”. d:
   *   week, day, plan (wiersze getData), logs (Log z serwera), sessions (Sesje), dates {tydzień|jednostka → faktyczny dzień},
   *   stats (unitStats bieżącej jednostki), minutes, sets: serie tej jednostki [{name, prio, group, kg, reps, rpe, fail, timed}]
   *   (zaliczone i nieudane, bez rozgrzewki; name = ćwiczenie wykonane, także po zamianie).
   * prev = poprzednia taka sama jednostka: ten sam `day` w najbliższym wcześniejszym tygodniu z zapisanymi seriami
   * (własny trening nie ma poprzedniej). Rekord = wynik lepszy od całej wcześniejszej historii ćwiczenia głównego (A),
   * liczony jak w Postępie; pierwszy wynik w historii to jeszcze nie rekord.
   */
  /**
   * Rekord ćwiczenia głównego (prio A) w bieżącej jednostce: najlepsza zaliczona seria (e1RM, w bojach kg), jeśli bije całą
   * wcześniejszą historię (bez tej jednostki). d jak w unitSummary; sets: [{set, name, prio, group, kg, reps, rpe, fail, timed}].
   * Zwraca {set, v, was, oly} albo null (przy remisie pierwsza z najlepszych serii); bez historii {set, v, was: 0, oly, first: true}
   * = „★ Pierwszy wynik” (to nie rekord: unitSummary go pomija).
   */
  L.unitRecord = (d, name) => {
    const week = Number(d.week), day = String(d.day);
    const now = (d.sets || []).filter(x => x.name === name && x.prio === 'A' && !x.fail && !x.timed).map(x => Object.assign({}, x, { grp: L.groupOf(x.group, x.name) }));
    if (!now.length) return null;
    const hist = L.doneSets((d.logs || []).filter(l => !(Number(l.tydzien) === week && String(l.jednostka) === day)), d.plan || [], d.dates || {});
    const was = Math.max(0, ...L.strengthSeries(hist, name).map(p => p.v));
    const oly = now.some(x => x.grp === 'R' || x.grp === 'P');
    let top = null;
    now.forEach(x => { const v = oly ? x.kg : L.e1rm(x.kg, x.reps, x.rpe); if (v > 0 && (!top || v > top.v)) top = { set: x.set, v }; });
    if (!top) return null;
    const v = Math.round(top.v * 10) / 10;
    if (!(was > 0)) return { set: top.set, v, was: 0, oly, first: true };   // pierwszy wynik w tym ćwiczeniu (ustalenie 17.11)
    return v > was ? { set: top.set, v, was, oly } : null;
  };
  L.unitSummary = d => {
    const plan = d.plan || [], logs = d.logs || [], st = d.stats || {}, week = Number(d.week), day = String(d.day);
    const mine = l => Number(l.tydzien) === week && String(l.jednostka) === day;
    const ok = l => l.wykonane === 'TAK' && !/^R/i.test(String(l.seria));
    const own = plan.some(r => r.week === d.week && String(r.day) === day && r.own);
    let prev = null;
    const pw = own ? [] : logs.filter(l => ok(l) && String(l.jednostka) === day && Number(l.tydzien) < week).map(l => Number(l.tydzien));
    if (pw.length) {
      const w = Math.max(...pw), P = {}; plan.forEach(r => { if (r.week === w && String(r.day) === day) P[r.order] = r; });
      let ton = 0, date = '';
      logs.forEach(l => {
        if (!ok(l) || Number(l.tydzien) !== w || String(l.jednostka) !== day) return;
        const kg = nf(l.kg), reps = nf(l.powt);
        if (kg > 0 && reps > 0 && !L.timeUnit((P[l.nr_cw] || {}).reps)) ton += kg * reps;
        if (!date) date = String(l.data || '').slice(0, 10);
      });
      const ses = (d.sessions || []).find(x => Number(x.tydzien) === w && String(x.jednostka) === day), min = ses ? nf(ses.czas_min) : NaN;
      prev = { week: w, date: (d.dates || {})[w + '|' + day] || date, ton: Math.round(ton), min: min > 0 ? Math.round(min) : null };
    }
    const recs = [...new Set((d.sets || []).filter(x => x.prio === 'A').map(x => x.name))].map(name => {
      const r = L.unitRecord(d, name);
      return r && !r.first && { name, v: r.v, delta: Math.round((r.v - r.was) * 10) / 10, oly: r.oly };
    }).filter(Boolean);
    const min = nf(d.minutes) > 0 ? Math.round(nf(d.minutes)) : null, ton = Number(st.ton) || 0;
    return { min, done: Number(st.done) || 0, all: Number(st.all) || 0, ton, prev,
      dMin: prev && prev.min && min ? min - prev.min : null,
      dTon: prev && prev.ton > 0 && ton > 0 ? Math.round(100 * (ton / prev.ton - 1)) : null,
      records: recs.sort((a, b) => a.name.localeCompare(b.name, 'pl')) };
  };
  /** pomiary dyspozycji w czasie: [{date, v}] dla klucza (cmj_sr, vbt_test) */
  /**
   * Raport po bloku (Postęp → Blok), liczony w telefonie jak zakładka Bloki w arkuszu (computeBlocks_). d:
   *   plan (wiersze getData z block, own, added), logs, sessions, ready (Dyspozycja), dates {tydzień|jednostka → faktyczny dzień},
   *   notes {blok → tekst trenera „dla_klienta”}, today.
   * Na blok: od–do (daty wszystkich jednostek bloku), tygodnie, jednostki z planu zrobione / wszystkie, serie z planu zrobione /
   * zaplanowane (pominięte B poza planem), wykonanie %, tonaż (z własnymi, bez rozgrzewki i ćwiczeń na czas), czas, siła ćwiczeń
   * głównych (A: e1RM pierwszego i ostatniego tygodnia z wynikiem; boje: najcięższe zaliczone), RPE sesji, samopoczucie, ból, dyspozycja.
   * state: done (po ostatnim dniu albo wszystko zrobione) / now / next (przed pierwszym dniem). Kolejność od najstarszego.
   */
  L.blockReport = d => {
    const P = {}, B = {}, today = d.today || '', D = d.dates || {}, SK = {};
    (d.logs || []).forEach(l => { if (/SKIP/.test(l.typ || '') || String(l.seria) === '0') SK[l.tydzien + '|' + l.jednostka + '|' + l.nr_cw] = 1; });
    const sesK = {}; (d.sessions || []).forEach(x => { sesK[x.tydzien + '|' + x.jednostka] = x; });
    (d.plan || []).forEach(r => {
      const name = String(r.block || '').trim(); if (!name) return;
      const u = r.week + '|' + r.day, b = B[name] || (B[name] = { block: name, units: {}, dates: [], weeks: {}, sets: { plan: 0, done: 0 }, ton: 0, e1: {}, oly: {}, min: 0, sess: [] });
      P[u + '|' + r.order] = r; P['u|' + u] = b;
      if (!(u in b.units) && !r.own) { const dt = D[u] || String(r.date || '').slice(0, 10); if (dt) b.dates.push(dt); }
      if (r.own || r.added) return;
      if (!(u in b.units)) { b.units[u] = !!sesK[u]; b.weeks[r.week] = 1; }
      if (!(String(r.prio).toUpperCase() === 'B' && SK[u + '|' + r.order])) b.sets.plan += Number(r.sets) || 0;
    });
    (d.logs || []).forEach(l => {
      if (l.wykonane !== 'TAK') return;
      const u = l.tydzien + '|' + l.jednostka, b = P['u|' + u], s = String(l.seria); if (!b || /^R/i.test(s)) return;
      const r = P[u + '|' + l.nr_cw] || {}, kg = nf(l.kg), reps = L.timeUnit(r.reps) ? 0 : nf(l.powt), rpe = nf(l.rpe), fail = /FAIL/.test(l.typ || '');
      if (!r.own && !r.added && !(String(r.prio).toUpperCase() === 'B' && SK[u + '|' + l.nr_cw]) && /^\d+$/.test(s) && +s >= 1 && +s <= (Number(r.sets) || 0)) b.sets.done++;
      if (kg > 0 && reps > 0) b.ton += kg * reps;
      if (fail || String(r.prio).toUpperCase() !== 'A' || !(kg > 0)) return;
      const name = String(l.cwiczenie || r.name || ''), g = L.groupOf(r.group, name);
      if (g === 'R' || g === 'P') { b.oly[name] = Math.max(b.oly[name] || 0, kg); return; }
      const e = L.e1rm(kg, reps, rpe); if (!(e > 0)) return;
      const m = b.e1[name] || (b.e1[name] = {}); m[l.tydzien] = Math.max(m[l.tydzien] || 0, e);
    });
    (d.sessions || []).forEach(x => { const u = x.tydzien + '|' + x.jednostka, b = P['u|' + u]; if (b) b.sess.push({ x, date: D[u] || String(x.data || '').slice(0, 10) }); });
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null, r1 = v => Math.round(v * 10) / 10;
    return Object.values(B).map(b => {
      const ds = b.dates.slice().sort(), from = ds[0] || '', to = ds[ds.length - 1] || '', u = Object.values(b.units);
      const ses = b.sess.sort((a, c) => a.date.localeCompare(c.date)), vals = k => ses.map(o => nf(o.x[k])).filter(v => v >= 0);
      let pain = null, painN = 0;
      ses.forEach(o => {
        let m0 = 0;
        String(o.x.bol || '').split(';').forEach(q => { const m = q.split(':'), v = nf((m[1] || '').trim()); if (v >= 0) { m0 = Math.max(m0, v); if (!pain || v > pain.v) pain = { place: (m[0] || '').trim(), v }; } });
        const bm = nf(o.x.bol_max); if (bm >= 0) { m0 = Math.max(m0, bm); if (!pain || bm > pain.v) pain = { place: '', v: bm }; }
        if (m0 > 0) painN++;
      });
      const ready = { ok: 0, warn: 0, bad: 0 };
      (d.ready || []).forEach(r => { const t = String(r.data || '').slice(0, 10); if (!from || t < from || t > to || !r.werdykt) return; ready[/zmęcz/i.test(r.werdykt) ? 'bad' : /uwaga/i.test(r.werdykt) ? 'warn' : 'ok']++; });
      const lifts = Object.keys(b.e1).map(name => { const w = Object.keys(b.e1[name]).map(Number).sort((a, c) => a - c);
          return w.length < 2 ? null : { name, oly: false, from: r1(b.e1[name][w[0]]), to: r1(b.e1[name][w[w.length - 1]]), pct: r1(100 * (b.e1[name][w[w.length - 1]] / b.e1[name][w[0]] - 1)) }; }).filter(Boolean)
        .concat(Object.keys(b.oly).map(name => ({ name, oly: true, best: b.oly[name] })))
        .sort((a, c) => a.oly - c.oly || a.name.localeCompare(c.name, 'pl'));
      const wk = Object.keys(b.weeks).map(Number).filter(w => w > 0), done = u.filter(Boolean).length, mins = vals('czas_min');
      return {
        block: b.block, from, to, weeks: wk.length ? [Math.min(...wk), Math.max(...wk)] : null, nWeeks: wk.length,
        state: from && today < from ? 'next' : (to && today > to) || (u.length && done === u.length) ? 'done' : 'now',
        units: { plan: u.length, done }, sets: b.sets, pct: b.sets.plan ? Math.round(100 * b.sets.done / b.sets.plan) : null,
        ton: Math.round(b.ton), min: mins.reduce((x, y) => x + y, 0), minN: mins.length, lifts,
        rpe: vals('rpe_sesji'), rpeAvg: avg(vals('rpe_sesji')), feel: avg(vals('samopoczucie').filter(v => v > 0)),
        pain, painN, ready, note: String((d.notes || {})[b.block] || '').trim(), empty: !done && !b.ton
      };
    }).sort((a, c) => (a.from || '9').localeCompare(c.from || '9') || a.block.localeCompare(c.block));
  };
  L.readySeries = (rows, key) => (rows || []).map(r => ({ date: String(r.data || '').slice(0, 10), v: nf(r[key]) }))
    .filter(p => p.v > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.date)).sort((a, b) => a.date.localeCompare(b.date));

  /* ---------- 17.10: EMOM, CMJ (rozrzut, klatkaż), pasek tygodnia, skracanie treningu ---------- */
  /** EMOM: kolumna planu „tryb” = EMOM albo nazwa zaczynająca się od „EMOM” */
  L.isEmom = ex => String(ex && ex.mode || '').trim().toUpperCase() === 'EMOM' || /^\s*EMOM\b/i.test(String(ex && ex.name || ''));
  L.SETS_MAX = 40;   // najwięcej serii jednego ćwiczenia (jak SETS_MAX w Code.gs)
  /** EMOM: pasek rund z wierszy serii roboczych [{st, rate, rpe}] → klasy odcinków: g / y / r (ocena albo światło z RPE), x (nieudana), d (zrobiona bez oceny), now (następna), '' (czeka) */
  L.emomSegs = rows => {
    const C = { L: 'g', S: 'y', W: 'r', X: 'x' };
    let now = false;
    return rows.map(r => {
      if (!r.st) { if (now) return ''; now = true; return 'now'; }
      if (r.st === 'x') return 'x';
      return C[String(r.rate || '').toUpperCase()] || C[L.lightOf(r.rpe)] || 'd';
    });
  };
  /** EMOM: zakres ciężarów zrobionych rund („105–110 kg”, „105 kg”, '' bez liczb) */
  L.emomKg = kgs => {
    const n = kgs.map(Number).filter(v => v > 0);
    if (!n.length) return '';
    const lo = Math.min(...n), hi = Math.max(...n);
    return (lo === hi ? L.fmtKg(lo) : L.fmtKg(lo) + '–' + L.fmtKg(hi)) + ' kg';
  };

  /** wzór CMJ: h = g·t²/8 (Balsalobre-Fernández i in. 2015); t w s → cm */
  L.CMJ_G = 9.81;
  L.CMJ_FPS = [30, 60, 120, 200, 240];
  /**
   * Rozrzut skoków: mediana z wpisanych, odstające > 8% od mediany (Claudino i in. 2017: miarą główną zostaje średnia).
   * jumps: [cm|''] × 3, excl: [bool] × 3 → {median, out: [indeksy odstających], avg (bez wykluczonych), n}
   */
  L.CMJ_OUT = 0.08;
  L.cmjSpread = (jumps, excl = []) => {
    const v = (jumps || []).map((x, i) => [nf(x), i]).filter(q => isFinite(q[0]) && q[0] > 0);
    const s = v.map(q => q[0]).sort((a, b) => a - b), m = s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
    const out = v.length >= 3 ? v.filter(q => Math.abs(q[0] - m) / m > L.CMJ_OUT).map(q => q[1]) : [];
    const used = v.filter(q => !excl[q[1]]).map(q => q[0]);
    return { median: m, out, avg: L.mean(used), n: used.length };
  };
  /**
   * Klatkaż z pudełka moov pliku MP4/MOV (Uint8Array): ścieżka wideo → fps = timescale ÷ najczęstszy czas próbki (stts);
   * Android zapisuje faktyczny klatkaż slow-motion w meta „com.android.capture.fps”. → {fps, capture} (NaN = brak)
   */
  L.mp4Fps = u8 => {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), str = (o, n) => String.fromCharCode(...u8.subarray(o, o + n));
    let fps = NaN, capture = NaN;
    const boxes = (from, to) => { const out = []; let o = from;
      while (o + 8 <= to) { let sz = dv.getUint32(o), h = 8; const t = str(o + 4, 4);
        if (sz === 1) { sz = Number(dv.getBigUint64(o + 8)); h = 16; } else if (sz === 0) sz = to - o;
        if (sz < h || o + sz > to) break; out.push({ t, o, s: o + h, e: o + sz }); o += sz; }
      return out; };
    const find = (list, t) => list.find(b => b.t === t);
    const top = boxes(0, u8.length), moov = find(top, 'moov') || { s: 0, e: u8.length };
    const kids = boxes(moov.s, moov.e);
    kids.filter(b => b.t === 'trak').forEach(tr => {
      const mdia = find(boxes(tr.s, tr.e), 'mdia'); if (!mdia || isFinite(fps)) return;
      const mb = boxes(mdia.s, mdia.e), hdlr = find(mb, 'hdlr'), mdhd = find(mb, 'mdhd'), minf = find(mb, 'minf');
      if (!hdlr || str(hdlr.s + 8, 4) !== 'vide' || !mdhd || !minf) return;
      const v1 = u8[mdhd.s] === 1, scale = dv.getUint32(mdhd.s + (v1 ? 20 : 12));
      const stbl = find(boxes(minf.s, minf.e), 'stbl'), stts = stbl && find(boxes(stbl.s, stbl.e), 'stts');
      if (!stts || !scale) return;
      let best = [0, 0]; const n = dv.getUint32(stts.s + 4);
      for (let i = 0; i < n && stts.s + 16 + 8 * i <= stts.e; i++) { const c = dv.getUint32(stts.s + 8 + 8 * i), d = dv.getUint32(stts.s + 12 + 8 * i); if (c > best[0] && d > 0) best = [c, d]; }
      if (best[1]) fps = Math.round(100 * scale / best[1]) / 100;
    });
    // meta (QuickTime: keys + ilst), w moov albo w udta
    const metas = []; kids.forEach(b => { if (b.t === 'meta') metas.push(b); if (b.t === 'udta') boxes(b.s, b.e).forEach(x => { if (x.t === 'meta') metas.push(x); }); });
    metas.forEach(m => {
      let mk = boxes(m.s, m.e); if (!find(mk, 'keys') && !find(mk, 'ilst')) mk = boxes(m.s + 4, m.e);       // ISO: FullBox z wersją
      const keys = find(mk, 'keys'), ilst = find(mk, 'ilst'); if (!keys || !ilst) return;
      const names = []; let o = keys.s + 8;
      for (let i = 0, n = dv.getUint32(keys.s + 4); i < n && o + 8 <= keys.e; i++) { const sz = dv.getUint32(o); names.push(str(o + 8, sz - 8)); o += sz; }
      boxes(ilst.s, ilst.e).forEach(it => {
        const ix = dv.getUint32(it.o + 4), name = names[ix - 1]; if (name !== 'com.android.capture.fps') return;
        const data = find(boxes(it.s, it.e), 'data'); if (!data) return;
        const type = dv.getUint32(data.s) & 0xffffff, v = data.s + 8;
        const x = type === 23 ? dv.getFloat32(v) : type === 24 ? dv.getFloat64(v) : type === 67 || type === 21 ? dv.getInt32(v) : NaN;
        if (x > 0) capture = Math.round(x * 100) / 100;
      });
    });
    return { fps, capture };
  };
  /** plik wygląda na slow-motion (DJI Mimo, Android), a deklaruje ≤ 30 kl./s → czas lotu byłby zawyżony kilkukrotnie */
  L.slowNameLowFps = (name, fileFps) => fileFps > 0 && fileFps <= 30.5 && /slow|slo-?mo/i.test(String(name || ''));
  /** czas lotu: znaczniki w sekundach pliku × (kl./s pliku ÷ kl./s nagrania); bez kl./s pliku = czas pliku */
  L.cmjFlight = (tTake, tLand, fileFps, realFps) => tLand > tTake ? (tLand - tTake) * (fileFps > 0 && realFps > 0 ? fileFps / realFps : 1) : NaN;

  /* pasek tygodnia (Pn–Nd): jednostka w dniu faktycznym (zrobiona) albo z planu / przesunięta */
  L.mondayOf = d => L.addDays(d, -((new Date(utc(d)).getUTCDay() + 6) % 7));
  /**
   * list: [{week, day, date, done}] (date = faktyczny dzień zrobionej albo data z planu) → 7 dni od poniedziałku
   * [{date, items: [{week, day, title, st}]}], st: done ✓ / late ! (po terminie, bez sesji) / today ● / plan
   */
  L.weekDays = (list, monday, today) => Array.from({ length: 7 }, (_, i) => {
    const date = L.addDays(monday, i);
    return { date, items: (list || []).filter(u => u.date === date)
      .map(u => ({ week: u.week, day: u.day, title: u.title, st: u.done ? 'done' : date < today ? 'late' : date === today ? 'today' : 'plan' })) };
  });
  /** domyślna jednostka: dzisiejsza niezrobiona, potem najbliższa następna niezrobiona, potem ostatnia */
  L.pickUnit = (list, today) => {
    const s = (list || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    return s.find(u => u.date === today && !u.done) || s.find(u => u.date >= today && !u.done) || s.find(u => u.date >= today) || s[s.length - 1] || null;
  };
  /**
   * Ostatnio otwarta jednostka po ponownym uruchomieniu aplikacji (system zamknął ją w tle).
   * saved = {w, d, t (dzień RRRR-MM-DD), at (ms)} z pamięci telefonu; wraca do niej tego samego dnia albo do KEEP_UNIT_H godzin
   * po zamknięciu (trening po północy), o ile jednostka dalej jest w planie; inaczej null (= pickUnit, czyli dziś).
   */
  L.KEEP_UNIT_H = 6;
  L.keepUnit = (saved, list, today, now) => {
    if (!saved || saved.d == null) return null;
    const fresh = saved.t === today || (+saved.at > 0 && now - saved.at >= 0 && now - saved.at < L.KEEP_UNIT_H * 3600e3);
    return fresh ? (list || []).find(u => u.week === saved.w && u.day === saved.d) || null : null;
  };

  /**
   * Karta „dziś” na górze Treningu. exs: [{order, name, prio, sets, done}] (done = zrobione serie z planu; sets 0 = pominięte),
   * date = dzień jednostki, today = dziś, hasToday = czy na dziś jest w planie jakaś jednostka.
   * → {n, all, done, min (ile zostało, do 5 min, szacunek jak w cutPlan), next: {order, name} | null, when: today | late | free | plan}
   */
  L.todayInfo = (exs, date, today, hasToday) => {
    const live = (exs || []).filter(ex => ex.sets > 0), dn = ex => Math.min(ex.sets, Math.max(0, ex.done || 0));
    const sec = live.reduce((a, ex) => a + (ex.sets - dn(ex)) * (L.SET_SEC + L.restSec(ex.prio)), 0);
    const nx = live.find(ex => dn(ex) < ex.sets);
    return { n: live.length, all: live.reduce((a, ex) => a + ex.sets, 0), done: live.reduce((a, ex) => a + dn(ex), 0),
      min: sec ? Math.max(5, Math.round(sec / 300) * 5) : 0, next: nx ? { order: nx.order, name: nx.name } : null,
      when: !date || date === today ? 'today' : date < today ? 'late' : hasToday ? 'plan' : 'free' };
  };

  /* ---------- pominięte / skrócone ćwiczenie: Log seria 0, typ SKIP, uwagi = ten tekst ---------- */
  L.SKIP_WHY = ['brak czasu', 'ból', 'sprzęt', 'inne'];
  /** {to, from, why} → „skrócone do 2 z 4 serii · brak czasu” (to > 0) albo sam powód (całe pominięte) */
  L.skipText = k => k && k.to > 0 ? 'skrócone do ' + k.to + ' z ' + k.from + ' serii' + (k.why ? ' · ' + k.why : '') : String(k && k.why || '');
  L.parseSkip = t => { const m = /^skrócone do (\d+) z (\d+) serii(?: · (.*))?$/.exec(String(t || '').trim()); return m ? { to: +m[1], from: +m[2], why: m[3] || '' } : { to: 0, from: 0, why: String(t || '').trim() }; };

  /* ---------- „Skróć trening”: cięcia wg planu (ciecie, serie_min) ---------- */
  L.SET_SEC = 45;   // szacunek czasu jednej serii bez przerwy
  /**
   * exs: [{order, name, prio, sets, done, cut, setsMin, skip}] (done = zrobione serie robocze), minutes = ile zostało czasu.
   * Kolejność: rosnąco po „ciecie”; bez „ciecie” w całej jednostce: B od końca. A i K bez „ciecie” nie są cięte.
   * Ćwiczenie: najpierw do serie_min, potem całe (zostają zrobione). → {need, left, cuts: [{order, name, to, from}], fits}
   */
  L.cutPlan = (exs, minutes) => {
    const sec = ex => Math.max(0, ex.sets - ex.done) * (L.SET_SEC + L.restSec(ex.prio));
    const live = (exs || []).filter(ex => !ex.skip);
    let need = live.reduce((a, ex) => a + sec(ex), 0);
    const goal = Math.max(0, minutes) * 60, start = need, cuts = [];
    const any = live.some(ex => ex.cut > 0);
    const order = any ? live.filter(ex => ex.cut > 0).sort((a, b) => a.cut - b.cut || a.order - b.order)
      : live.filter(ex => String(ex.prio).toUpperCase() === 'B').sort((a, b) => b.order - a.order);
    const per = ex => L.SET_SEC + L.restSec(ex.prio);
    order.forEach(ex => {
      if (need <= goal) return;
      let to = ex.sets;
      const min = ex.setsMin > 0 ? Math.max(ex.setsMin, ex.done) : null;
      if (min !== null && min < to) { need -= (to - min) * per(ex); to = min; }
      if (need > goal && to > ex.done) { need -= (to - ex.done) * per(ex); to = ex.done; }
      if (to < ex.sets) cuts.push({ order: ex.order, name: ex.name, from: ex.sets, to });
    });
    return { need: Math.ceil(start / 60), left: Math.ceil(need / 60), cuts, fits: need <= goal };
  };

  /* ---------- tryb skupienia: jedno ćwiczenie (albo cały obwód) na ekranie ---------- */
  /** kroki jednostki: [{orders: [3, 4], grp: 'A'}]; obwód to jeden krok, zwykłe ćwiczenie ma grp '' */
  L.focusSteps = (exs, groups) => {
    const out = [];
    (exs || []).forEach(ex => {
      const g = (groups || []).find(x => x.orders.includes(ex.order));
      if (!g) out.push({ orders: [ex.order], grp: '' });
      else if (g.orders[0] === ex.order) out.push({ orders: g.orders.slice(), grp: g.id });
    });
    return out;
  };
  /** od którego kroku zacząć: pierwszy z niezrobionym ćwiczeniem; wszystko zrobione = liczba kroków (podsumowanie) */
  L.focusStart = (steps, done) => { const i = (steps || []).findIndex(s => s.orders.some(o => !(done || []).includes(o))); return i < 0 ? (steps || []).length : i; };

  /** podpowiedzi po kolei: pierwsza nieobejrzana, której element jest teraz na ekranie; '' gdy nie ma czego pokazać */
  L.nextTip = (order, seen, avail) => (order || []).find(id => !(seen || []).includes(id) && (avail || []).includes(id)) || '';

  /** klucz klienta z wklejonego linku (…?k=k…) albo samego kodu „k” + 11 znaków hex; '' gdy nie rozpoznano */
  /** Adres strony bez parametru k (klucza klienta); reszta parametrów i # zostają. */
  L.urlNoKey = (path, search, hash) => {
    const q = String(search || '').replace(/^\?/, '').split('&').filter(x => x && !/^k(=|$)/.test(x)).join('&');
    return String(path || '') + (q ? '?' + q : '') + String(hash || '');
  };
  L.keyFrom = v => {
    const t = String(v || '').trim();
    const m = t.match(/[?&#]k=([^&#\s]+)/);
    if (m) return decodeURIComponent(m[1]);
    const c = t.match(/(?:^|[^0-9a-z])(k[0-9a-f]{11})(?![0-9a-z])/i);
    return c ? c[1] : '';
  };

  /* ---------- animacja otwarcia „Siła z Ruchu” (index.html: #intro, introRun) ----------
     Pomarańczowa linia to tor sztangi w rwaniu, jasna linia to taniec wokół talerza; na koniec napis litera po literze.
     Czasy w ms. PRE: talerz stoi na pomoście; T: ruch sztangi do chwytu; TXT_LEAD: o tyle przed chwytem wchodzi pierwsza litera;
     LETTER: odstęp między literami; LETTER_IN: wejście litery; READ: tyle cały napis zostaje, żeby dało się go przeczytać;
     OUT: zgaszenie; SKIP: zgaszenie po dotknięciu.
     TEMPO: [ułamek czasu, ułamek długości toru, prędkość] = oderwanie, pozycja mocy (sztanga najbliżej zawodnika),
     koniec wybicia (najszybciej), najwyższy punkt, chwyt w przysiadzie. */
  L.INTRO = { PRE: 150, T: 1350, TXT_LEAD: 300, LETTER: 28, LETTER_IN: 300, READ: 1200, OUT: 300, SKIP: 180,
    TEMPO: [[0, 0, 0], [.55, .4784, 1.35], [.615, .6101, 1.95], [.885, .9314, .4], [1, 1, .85]] };
  /** jaka część toru jest za sztangą po ułamku k czasu ruchu (0…1): płynna krzywa Hermite'a przez punkty TEMPO, bez cofania */
  L.introTempo = k => {
    const t = Math.max(0, Math.min(1, Number(k) || 0)), P = L.INTRO.TEMPO;
    for (let i = 1; i < P.length; i++) if (t <= P[i][0]) {
      const a = P[i - 1], b = P[i], h = b[0] - a[0], u = (t - a[0]) / h, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * h * a[2] + (3 * u2 - 2 * u3) * b[1] + (u3 - u2) * h * b[2];
    }
    return 1;
  };
  /** chwile animacji [ms od startu] dla napisu o n literach: grab = chwyt, text = pierwsza litera, full = cały napis na ekranie, fade = początek zgaszenia, end = koniec */
  L.introTimes = n => {
    const I = L.INTRO, grab = I.PRE + I.T, text = grab - I.TXT_LEAD, full = text + Math.max(0, n - 1) * I.LETTER + I.LETTER_IN, fade = full + I.READ;
    return { grab, text, full, fade, end: fade + I.OUT };
  };
  /**
   * Linia tańca trzyma wysokość talerza (krąży wokół niego), nad najwyższym punktem sztangi robi łuk i schodzi do chwytu razem z nią.
   * dy: wysokości linii tańca co równy kawałek jej długości (y ekranu: mniejsze = wyżej), yApex: y sztangi w najwyższym punkcie toru.
   * Zwraca funkcję (sb, yb) → ułamek długości linii tańca dla sztangi po ułamku sb toru, na wysokości yb.
   */
  L.introDance = (dy, yApex) => {
    const n = dy.length - 1, y0 = dy[0], top = dy.indexOf(Math.min.apply(null, dy)), sApex = L.INTRO.TEMPO[3][1], lead = (y0 - dy[top]) / ((y0 - yApex) || 1);
    return (sb, yb) => {
      if (sb >= sApex) return (top + (n - top) * Math.min(1, (sb - sApex) / (1 - sApex))) / n;
      const y = y0 - (y0 - yb) * lead;
      let i = 0; while (i < top - 1 && dy[i + 1] > y) i++;
      return (i + Math.min(1, Math.max(0, (dy[i] - y) / ((dy[i] - dy[i + 1]) || 1)))) / n;
    };
  };

  /**
   * Format obrazu z kawałków pliku filmu (początek i koniec: MP4 z telefonu ma opis ścieżek „moov” często na końcu).
   * Szuka wpisu ścieżki wideo (hvc1/hev1/dvh1 = HEVC, avc1 = H.264, av01, vp09; w WebM V_VP8/V_VP9/V_AV1),
   * przy HEVC profilu z hvcC (2 = Main 10 → 10 bitów) i krzywej z „colr nclx” (16 = PQ / HDR10, 18 = HLG).
   * → { codec: 'HEVC (H.265)' | 'H.264' | 'AV1' | 'VP9' | 'VP8' | '', bits10, hdr: 'HDR10' | 'HLG' | '', w, h (MP4: wymiary z wpisu ścieżki, inaczej 0) }
   */
  L.videoCodec = (...parts) => {
    const out = { codec: '', bits10: false, hdr: '', w: 0, h: 0 };
    const NAMES = [['hvc1', 'HEVC (H.265)'], ['hev1', 'HEVC (H.265)'], ['dvh1', 'HEVC (H.265)'], ['dvhe', 'HEVC (H.265)'], ['avc1', 'H.264'], ['avc3', 'H.264'], ['av01', 'AV1'], ['vp09', 'VP9'],
      ['V_MPEGH/ISO/HEVC', 'HEVC (H.265)'], ['V_MPEG4/ISO/AVC', 'H.264'], ['V_AV1', 'AV1'], ['V_VP9', 'VP9'], ['V_VP8', 'VP8']];
    const find = (b, s, from) => { const n = s.length; outer: for (let i = from || 0; i + n <= b.length; i++) { for (let j = 0; j < n; j++) if (b[i + j] !== s.charCodeAt(j)) continue outer; return i; } return -1; };
    for (const b of parts) {
      if (!b || !b.length) continue;
      // MP4: każda tabela „stsd” ścieżki (wideo i dźwięk), fourcc pierwszego wpisu leży 16 bajtów za nią, wymiary 44 bajty za nią; WebM: identyfikator kodeka w nagłówku
      for (let st = find(b, 'stsd'); st >= 0 && st + 20 <= b.length; st = find(b, 'stsd', st + 4)) {
        const cc = String.fromCharCode(b[st + 16], b[st + 17], b[st + 18], b[st + 19]), hit = NAMES.find(x => x[0] === cc);
        if (!hit) continue;
        if (!out.codec) { out.codec = hit[1]; if (st + 48 <= b.length) { out.w = (b[st + 44] << 8) | b[st + 45]; out.h = (b[st + 46] << 8) | b[st + 47]; } }
        const box = b.subarray(st, Math.min(b.length, st + 1024));
        const h = find(box, 'hvcC'); if (h >= 0 && h + 6 < box.length && (box[h + 5] & 0x1f) === 2) out.bits10 = true;
        const c = find(box, 'colrnclx'); if (c >= 0 && c + 12 <= box.length) { const tr = (box[c + 10] << 8) | box[c + 11]; if (tr === 16) out.hdr = 'HDR10'; if (tr === 18) out.hdr = 'HLG'; }
      }
      if (!out.codec && (find(b, 'webm') >= 0 || find(b, 'matroska') >= 0)) NAMES.filter(x => x[0].startsWith('V_')).some(([k, name]) => find(b, k) >= 0 && (out.codec = out.codec || name));
    }
    return out;
  };

  /* ---------- „Dodaj do kalendarza”: wydarzenie w czasie lokalnym telefonu (bez strefy), plik .ics albo link Kalendarza Google ---------- */
  L.CAL_MIN = 30;   // najkrótsze wydarzenie (min)
  /** date „RRRR-MM-DD”, time „GG:MM”, min → { s, e } jako „RRRRMMDDTGGMMSS” (koniec może wypaść następnego dnia) */
  L.calTimes = (date, time, min) => {
    const [y, mo, d] = String(date).split('-').map(Number), [h, mi] = String(time || '18:00').split(':').map(Number);
    const f = t => { const x = new Date(Date.UTC(y, mo - 1, d, h, mi + t)), p = n => String(n).padStart(2, '0');
      return x.getUTCFullYear() + p(x.getUTCMonth() + 1) + p(x.getUTCDate()) + 'T' + p(x.getUTCHours()) + p(x.getUTCMinutes()) + '00'; };
    return { s: f(0), e: f(Math.max(L.CAL_MIN, Math.round(+min || 0))) };
  };
  const icsEsc = v => String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  /** linia .ics najwyżej 75 bajtów UTF-8, dalej kontynuacja od spacji (bez cięcia znaku w środku) */
  const icsFold = line => {
    const out = []; let cur = '', n = 0;
    for (const ch of line) {
      const b = unescape(encodeURIComponent(ch)).length;
      if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; }
      cur += ch; n += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  };
  /**
   * events: [{ uid, date, time, min, title, desc, url, alarm (min przed; 0 = bez) }], stamp = Date (DTSTAMP, UTC).
   * Ten sam uid przy ponownym dodaniu = ten sam wpis (Apple / Outlook podmieniają go zamiast dublować).
   */
  L.icsFile = (events, stamp) => {
    const at = stamp || new Date(), st = at.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const L2 = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sila z Ruchu//Trening//PL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    (events || []).forEach(ev => {
      const t = L.calTimes(ev.date, ev.time, ev.min);
      L2.push('BEGIN:VEVENT', 'UID:' + icsEsc(ev.uid), 'DTSTAMP:' + st, 'SEQUENCE:' + Math.max(0, Math.floor(at.getTime() / 1000) - 1.7e9),   // nowsze dodanie = wyższy numer
        'DTSTART:' + t.s, 'DTEND:' + t.e, 'SUMMARY:' + icsEsc(ev.title));
      if (ev.desc || ev.url) L2.push('DESCRIPTION:' + icsEsc([ev.desc, ev.url].filter(Boolean).join('\n\n')));
      if (ev.url) L2.push('URL:' + ev.url);
      if (+ev.alarm > 0) L2.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(ev.title), 'TRIGGER:-PT' + Math.round(+ev.alarm) + 'M', 'END:VALARM');
      L2.push('END:VEVENT');
    });
    L2.push('END:VCALENDAR');
    return L2.map(icsFold).join('\r\n') + '\r\n';
  };
  /** jedno wydarzenie → link „dodaj wydarzenie” Kalendarza Google (czas bez strefy = strefa kalendarza; przypomnienie wg ustawień kalendarza) */
  L.gcalUrl = ev => {
    const t = L.calTimes(ev.date, ev.time, ev.min);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(ev.title || '') +
      '&dates=' + t.s + '/' + t.e + '&details=' + encodeURIComponent([ev.desc, ev.url].filter(Boolean).join('\n\n'));
  };

  /* ---------- ekran powitalny (v80): system telefonu, przeglądarka w aplikacji, manifest z kluczem dla iPhone'a ---------- */
  /** 'ios' | 'android' | 'other'; iPad z iPadOS 13+ podaje się jako Mac, więc rozpoznajemy go po dotyku */
  L.welPlatform = (ua, touch) => {
    const u = String(ua || '');
    if (/iPhone|iPad|iPod/.test(u) || (/Macintosh/.test(u) && +touch > 1)) return 'ios';
    if (/Android/.test(u)) return 'android';
    return 'other';
  };
  /** przeglądarka wbudowana w komunikator (Messenger, Instagram, Facebook, TikTok, LINE): z niej nie da się dodać aplikacji do ekranu */
  L.welInApp = ua => /FBAN|FBAV|FB_IAB|Instagram|Messenger|musical_ly|TikTok|BytedanceWebview|\bLine\//.test(String(ua || ''));
  /**
   * manifest z kluczem w start_url: iPhone otwiera aplikację z ekranu początkowego pod start_url i z osobną pamięcią,
   * więc bez klucza w adresie pytałby o link. base = adres katalogu aplikacji (z / na końcu), m = treść manifest.json.
   */
  L.keyManifest = (m, base, key) => {
    const abs = u => new URL(u, base).href;
    return Object.assign({}, m, {
      id: abs(m.id || './'), scope: abs(m.scope || './'),
      start_url: abs((m.start_url || './').split('?')[0]) + '?k=' + encodeURIComponent(key),
      icons: (m.icons || []).map(i => Object.assign({}, i, { src: abs(i.src) }))
    });
  };

  /* ---------- import historii z innej aplikacji: wspólna postać + adapter na format (Hevy, Strong, szablon) ---------- */
  /** CSV → tablica wierszy (cudzysłowy, "" w środku, separator w polu, CRLF, BOM); separator „,” albo „;” (polski Excel) wg pierwszej linii */
  L.csvRows = text => {
    const s = String(text || '').replace(/^﻿/, ''), out = [], head = s.split(/\r?\n/, 1)[0];
    const sep = (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ';' : ',';
    let row = [], f = '', q = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
      if (c === '"') q = true;
      else if (c === sep) { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0] !== '') out.push(row); row = []; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); out.push(row); }
    return out;
  };
  const MON = { jan: 1, sty: 1, feb: 2, lut: 2, mar: 3, apr: 4, kwi: 4, may: 5, maj: 5, jun: 6, cze: 6, jul: 7, lip: 7, aug: 8, sie: 8, sep: 9, wrz: 9, oct: 10, paz: 10, 'paź': 10, nov: 11, lis: 11, dec: 12, gru: 12 };
  /** „14 Mar 2025, 18:05” (Hevy), „2025-03-14 18:05[:ss]” (Strong), „14.03.2025[ 18:05]” albo „2025-03-14” (szablon) → „2025-03-14T18:05”; inaczej '' */
  L.importTime = v => {
    const t = String(v || '').trim(), p = n => String(n).padStart(2, '0');
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(t);
    if (m) return m[1] + '-' + p(m[2]) + '-' + p(m[3]) + 'T' + p(m[4] || 12) + ':' + (m[5] || '00');
    m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?/.exec(t);
    if (m) return m[3] + '-' + p(m[2]) + '-' + p(m[1]) + 'T' + p(m[4] || 12) + ':' + (m[5] || '00');
    m = /^(\d{1,2})\s+([A-Za-zżźćńółęąś]{3})[a-zżźćńółęąś.]*\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/.exec(t);
    const mo = m && MON[m[2].toLowerCase()];
    return mo ? m[3] + '-' + p(mo) + '-' + p(m[1]) + 'T' + p(m[4]) + ':' + m[5] : '';
  };
  const inum = v => { const x = parseFloat(String(v === undefined || v === null ? '' : v).replace(/\s/g, '').replace(',', '.')); return isFinite(x) ? x : null; };
  const LB = 0.45359237;
  /** szablon do pobrania z panelu: jedna linia = jedna seria (rodzaj: puste = robocza, R = rozgrzewka, D = drop set) */
  L.IMPORT_TEMPLATE = 'data;trening;cwiczenie;rodzaj;kg;powt;sek;rpe;uwagi\n2026-03-02;Nogi;Przysiad tylny;R;40;8;;;\n2026-03-02;Nogi;Przysiad tylny;;80;5;;8;\n2026-03-02;Nogi;Deska;;;;45;;\n';
  /**
   * Formaty plików. Każdy: test(nagłówek) i row(g) → {start, end, title, note, name, sup, exNote, t: W|R|D, kg, reps, sec, rpe}
   * (g(nazwa kolumny) = tekst komórki). „failure” w Hevy i „F” w Strongu = seria do upadku, zaliczona: RPE 10, gdy puste.
   */
  L.IMPORT_FMT = {
    hevy: { name: 'Hevy', test: h => h.indexOf('exercise_title') >= 0 && h.indexOf('set_type') >= 0 && h.indexOf('start_time') >= 0,
      lbs: h => h.indexOf('weight_kg') < 0 && h.indexOf('weight_lbs') >= 0,
      row: (g, lbs) => { const ty = g('set_type').toLowerCase(), rpe = inum(g('rpe'));
        return { start: g('start_time'), end: g('end_time'), title: g('title'), note: g('description'), name: g('exercise_title'), sup: g('superset_id'), exNote: g('exercise_notes'),
          t: ty === 'warmup' ? 'R' : ty === 'dropset' ? 'D' : 'W', kg: inum(g(lbs ? 'weight_lbs' : 'weight_kg')), reps: inum(g('reps')), sec: inum(g('duration_seconds')), rpe: ty === 'failure' && rpe === null ? 10 : rpe }; } },
    strong: { name: 'Strong', test: h => h.indexOf('exercise name') >= 0 && h.indexOf('set order') >= 0 && h.indexOf('date') >= 0,
      lbs: h => h.indexOf('weight unit') < 0 ? null : false,
      row: (g, lbs) => { const so = g('set order').toUpperCase(), rpe = inum(g('rpe')), unit = g('weight unit').toLowerCase(), kg = inum(g('weight'));
        if (/REST/.test(so)) return null;
        return { start: g('date'), end: '', min: g('duration'), title: g('workout name'), note: g('workout notes'), name: g('exercise name'), sup: '', exNote: g('notes'),
          t: so === 'W' ? 'R' : so === 'D' ? 'D' : 'W', kg: kg !== null && (/lb/.test(unit) || (!unit && lbs)) ? kg * LB : kg, reps: inum(g('reps')), sec: inum(g('seconds')), rpe: so === 'F' && rpe === null ? 10 : rpe }; } },
    szablon: { name: 'szablon', test: h => h.indexOf('data') >= 0 && (h.indexOf('cwiczenie') >= 0 || h.indexOf('ćwiczenie') >= 0),
      lbs: () => false,
      row: g => { const r = g('rodzaj').toUpperCase();
        return { start: g('data'), end: '', title: g('trening'), note: '', name: g('cwiczenie') || g('ćwiczenie'), sup: '', exNote: g('uwagi'),
          t: r === 'R' ? 'R' : r === 'D' ? 'D' : 'W', kg: inum(g('kg')), reps: inum(g('powt')), sec: inum(g('sek')), rpe: inum(g('rpe')) }; } }
  };
  /** Strong „1h 5m” / „65m” / „3900” (s) → minuty */
  const durMin = v => { const t = String(v || ''), h = /(\d+)\s*h/.exec(t), m = /(\d+)\s*m(?!s)/.exec(t); if (h || m) return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); const s = inum(t); return s ? Math.round(s / 60) : 0; };
  const addMin = (start, min) => { const d = new Date(Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10), +start.slice(11, 13), +start.slice(14, 16) + min)); return d.toISOString().slice(0, 16); };
  /**
   * Plik CSV z innej aplikacji → {fmt, src, workouts, sets, bad, lbs, unitAsk} albo {error}. Format rozpoznany po nagłówku.
   * o.lbs: true / false wymusza jednostkę, gdy plik jej nie podaje (Strong bez kolumny „Weight Unit” → unitAsk, domyślnie kg).
   * Trening = ten sam start i tytuł; ćwiczenie = kolejne wiersze z tą samą nazwą (i supersetem). Funty → kg (0,1 kg).
   * Seria bez powtórzeń, a z czasem = seria na czas (sec).
   */
  L.importParse = (text, o) => {
    o = o || {};
    const rows = L.csvRows(text);
    if (!rows.length) return { error: 'Pusty plik.' };
    const h = rows[0].map(x => x.trim().toLowerCase()), fmt = Object.keys(L.IMPORT_FMT).find(k => L.IMPORT_FMT[k].test(h));
    if (!fmt) return { error: 'Nie rozpoznaję tego pliku. Obsługuję eksport z Hevy i ze Stronga oraz szablon CSV z panelu.' };
    const F = L.IMPORT_FMT[fmt], fl = F.lbs(h), unitAsk = fl === null && fmt === 'strong', lbs = typeof o.lbs === 'boolean' && (fl === null || unitAsk) ? o.lbs : !!fl;
    const W = [], by = {}, bad = [];
    let sets = 0;
    rows.slice(1).forEach((r, i) => {
      const g = n => { const j = h.indexOf(n); return j < 0 ? '' : String(r[j] === undefined ? '' : r[j]).trim(); };
      const x = F.row(g, lbs); if (x === null) return;
      const start = L.importTime(x.start), name = String(x.name || '').replace(/\s+/g, ' ').trim();
      if (!start || !name) { bad.push(i + 2); return; }
      const k = start + '|' + x.title;
      let w = by[k];
      if (!w) { const e = L.importTime(x.end), mn = x.min ? durMin(x.min) : 0; w = by[k] = { date: start.slice(0, 10), start, end: e || (mn ? addMin(start, mn) : ''), title: x.title || 'Trening', note: x.note || '', ex: [] }; W.push(w); }
      const sup = String(x.sup || ''), last = w.ex[w.ex.length - 1];
      let e = last && last.name === name && last.sup === sup ? last : null;
      if (!e) { e = { name, sup, note: x.exNote || '', sets: [] }; w.ex.push(e); }
      const kg = x.kg === null ? '' : lbs && fmt === 'hevy' ? Math.round(x.kg * LB * 10) / 10 : Math.round(x.kg * 10) / 10;
      e.sets.push({ t: x.t, kg, reps: x.reps === null ? '' : x.reps, sec: x.reps === null && x.sec ? x.sec : '', rpe: x.rpe === null || x.rpe > 10 ? '' : x.rpe });
      sets++;
    });
    if (!W.length) return { error: 'W pliku nie ma żadnego treningu.' };
    W.sort((a, b) => a.start.localeCompare(b.start));
    return { fmt, src: F.name, workouts: W, sets, bad, lbs, unitAsk };
  };
  /** zgodność ze szkicem: sam Hevy */
  L.hevyParse = text => L.importParse(text);
  /**
   * Podgląd importu: treningi od daty `from` (RRRR-MM-DD albo ''), bez dni, w których klient ma już coś w aplikacji (`taken` = Set dat),
   * chyba że `withTaken`. Zwraca liczby, zakres dat, ćwiczenia (nazwa → w ilu treningach) i dzień jednostki H<rrmmdd>[b, c…].
   */
  L.importPick = (parsed, o) => {
    o = o || {};
    const taken = o.taken || new Set(), all = (parsed && parsed.workouts) || [], inR = all.filter(w => !o.from || w.date >= o.from);
    const dup = inR.filter(w => taken.has(w.date)), pick = o.withTaken ? inR : inR.filter(w => !taken.has(w.date));
    const ex = {}, seen = {};
    const out = pick.map(w => { const base = 'H' + w.date.slice(2).replace(/-/g, ''); seen[base] = (seen[base] || 0) + 1;
      w.ex.forEach(e => { ex[e.name] = (ex[e.name] || 0) + 1; });
      return Object.assign({}, w, { day: base + (seen[base] > 1 ? 'abcdefgh'[seen[base] - 1] || '' : '') }); }).filter(w => /^H\d{6}[a-h]?$/.test(w.day));
    const work = out.reduce((a, w) => a + w.ex.reduce((b, e) => b + e.sets.filter(s => s.t !== 'R').length, 0), 0);
    return { workouts: out, n: out.length, all: all.length, dup: dup.length, work,
      first: out.length ? out[0].date : '', last: out.length ? out[out.length - 1].date : '',
      names: Object.keys(ex).sort((a, b) => ex[b] - ex[a] || a.localeCompare(b)).map(n => [n, ex[n]]) };
  };
  L.hevyPick = L.importPick;
  /** jednostka z importu historii (tydzień 0, dzień H<rrmmdd>[b…]) i jej nazwa w aplikacji: źródło z tytułu („Hevy · Nogi” → „Hevy”) */
  L.importDay = d => /^H\d{6}[a-h]?$/.test(String(d || ''));
  L.dayLabel = (day, title) => L.importDay(day) ? (String(title || '').split(' · ')[0].trim() || 'Import') : String(day === undefined || day === null ? '' : day);

  root.TL = L;
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
})(typeof window !== 'undefined' ? window : globalThis);
