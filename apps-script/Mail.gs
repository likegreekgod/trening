/* ---------- poranny mail do klienta w dniu treningu (v77) ----------
 * Klient z Klienci P „mail_rano” = TAK i adresem w O „email” dostaje rano (godzina: właściwość MAIL_GODZ, domyślnie 6) mail
 * z planem dnia i przyciskiem do aplikacji (link z kluczem: tylko do samego klienta). Mail idzie tylko, gdy plan ma na dziś
 * jednostkę z datą, której klient jeszcze nie zaczął (brak wpisu w Sesjach i w Logu). Bez daty, w dzień wolny, przy własnych
 * treningach i nieaktywnym kliencie mail nie idzie. Wysyłka: MailApp z konta trenera (te same uprawnienia co alert mailowy),
 * nadawca „Siła z Ruchu”. Ostatnia wysyłka per klient: właściwość MAIL_LOG (JSON), wynik dnia: MAIL_DZIEN.
 * Czyste funkcje (z testami): rannyDo_, rannyUnit_, rannyMail_, plDay_.
 */
const MAIL_GODZ = 6;                    // domyślna godzina wysyłki
const MAIL_GODZINY = [5, 6, 7, 8, 9];   // do wyboru w panelu
const MAIL_NADAWCA = 'Siła z Ruchu';
const MAIL_DNI = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const MAIL_C = { bg: '#f4f2ea', card: '#ffffff', ink: '#17241d', muted: '#5f6b58', line: '#e3e0d4', acc: '#e0a34a', brand: '#17241d', A: '#c2552d', B: '#3d6b8c', K: '#6b7f3a' };

/** Czysta: „2026-11-24” → „wtorek 24.11”. */
function plDay_(iso) {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(iso || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return MAIL_DNI[d.getUTCDay()] + ' ' + (+m[3]) + '.' + m[2];
}

const mailEsc_ = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mailNum_ = v => { const n = Number(String(v === undefined || v === null ? '' : v).replace(',', '.')); return String(v).trim() !== '' && isFinite(n) ? n : null; };
const mailPl_ = n => String(Math.round(n * 10) / 10).replace('.', ',');

/**
 * Czysta: wiersze Klienci (tablice A…P), Plan, Log, Sesje (obiekty), dziś → [{c, key, email, units: [[wiersze planu jednostki]]}].
 * dayOf: wartość komórki data → „RRRR-MM-DD” (Date z arkusza przez strefę skryptu). force: {id: true} = pomiń przełącznik (mail próbny).
 */
function rannyDo_(klienci, plan, log, ses, today, dayOf) {
  dayOf = dayOf || (v => String(v === undefined || v === null ? '' : v).slice(0, 10));
  const lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  const started = {};
  (ses || []).concat(log || []).forEach(r => { started[lc(r.klient) + '|' + lc(r.tydzien) + '|' + lc(r.jednostka)] = true; });
  const out = [];
  (klienci || []).forEach(r => {
    const c = clientOf_(r), cell = i => String(r[i] === undefined || r[i] === null ? '' : r[i]).trim();
    const email = cell(14);
    if (!c.id || !c.key || cell(3).toUpperCase() === 'NIE' || cell(15).toUpperCase() !== 'TAK' || !mailOk_(email)) return;
    const units = rannyUnits_(c.id, plan, today, dayOf).filter(u => !started[c.id + '|' + lc(u[0].tydzien) + '|' + lc(u[0].jednostka)]);
    if (units.length) out.push({ c: c, key: c.key, email: email, units: units });
  });
  return out;
}

/** Czysta: jednostki klienta z planu z datą `day` (bez własnych, dodanych i usuniętych) → [[wiersze]] po kolei. */
function rannyUnits_(id, plan, day, dayOf) {
  const lc = v => String(v === undefined || v === null ? '' : v).trim().toLowerCase(), by = {}, order = [];
  (plan || []).forEach(r => {
    if (lc(r.klient) !== id || offPlan_(r) || !r.data || dayOf(r.data) !== day) return;
    const k = lc(r.tydzien) + '|' + lc(r.jednostka);
    if (!by[k]) { by[k] = []; order.push(k); }
    by[k].push(r);
  });
  return order.map(k => by[k].slice().sort((a, b) => (Number(a.nr) || 0) - (Number(b.nr) || 0)));
}

const mailOk_ = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

/**
 * Czysta: wiersze jednostki (+ cały plan klienta, żeby policzyć tydzień bloku) → {title, meta, note, ex: [{prio, name, sets, reps, kg, pct, rpe}]}.
 * Czas jak karta „dziś” w aplikacji: seria 45 s + przerwa A 2:00 / B 1:30 / K 1:00, zaokrąglone do 5 min.
 */
function rannyUnit_(rows, planAll) {
  const r0 = rows[0] || {}, blok = String(r0.blok || '').trim();
  const rest = p => ({ A: 120, B: 90, K: 60 })[String(p).toUpperCase()] || 90;
  const ex = rows.map(r => ({ prio: String(r.prio || 'B').trim().toUpperCase().charAt(0) || 'B', name: String(r.cwiczenie || '').trim(),
    sets: Number(r.serie) || 0, reps: txt_(r.powt).trim(), kg: r.kg === undefined || r.kg === null ? '' : String(r.kg).trim(),
    pct: mailNum_(r.procent), rpe: mailNum_(r.rpe_max) })).filter(e => e.name);
  const sec = ex.reduce((a, e) => a + e.sets * (45 + rest(e.prio)), 0), min = sec ? Math.max(5, Math.round(sec / 300) * 5) : 0;
  let wk = '';
  if (blok) {
    const ws = {};
    (planAll || []).forEach(r => { if (String(r.klient).trim().toLowerCase() === String(r0.klient).trim().toLowerCase() && String(r.blok || '').trim() === blok && !offPlan_(r)) ws[Number(r.tydzien)] = 1; });
    const list = Object.keys(ws).map(Number).sort((a, b) => a - b), i = list.indexOf(Number(r0.tydzien));
    wk = i >= 0 ? 'tydz. ' + (i + 1) : '';
  } else if (r0.tydzien !== '' && r0.tydzien !== undefined) wk = 'tydz. ' + r0.tydzien;
  const n = ex.length, word = n === 1 ? 'ćwiczenie' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'ćwiczenia' : 'ćwiczeń';
  const note = rows.map(r => String(r.uwagi_jedn || '').trim()).find(Boolean) || '';
  return { title: String(r0.tytul || '').trim() || 'Trening ' + String(r0.jednostka || '').trim(),
    meta: [blok ? 'Blok ' + blok : '', wk, n + ' ' + word, min ? 'ok. ' + min + ' min' : ''].filter(Boolean).join(' · '), note: note, ex: ex };
}

/**
 * Czysta: klient (clientOf_), jednostki (rannyUnit_), {url, day: „RRRR-MM-DD”, test} → {subject, html, body}.
 * PRO: kg, % i RPE (albo RIR wg skali); PROSTY: kg i „zapas n powt.” zamiast RPE, bez %.
 */
function rannyMail_(c, units, o) {
  o = o || {};
  const C = MAIL_C, e = mailEsc_, day = plDay_(o.day);
  const effort = r => r === null ? '' : c.simple ? 'zapas ' + mailPl_(10 - r) + ' powt.' : c.scale === 'RIR' ? 'RIR ≥ ' + mailPl_(10 - r) : 'RPE ≤ ' + mailPl_(r);
  const kgTxt = k => { const n = mailNum_(k); return n !== null ? mailPl_(n) + ' kg' : k; };
  const line = x => [x.sets && x.reps ? x.sets + ' × ' + x.reps : x.sets ? x.sets + ' serie' : '', kgTxt(x.kg), !c.simple && x.pct !== null ? mailPl_(x.pct <= 1.5 ? x.pct * 100 : x.pct) + '%' : '', effort(x.rpe)].filter(Boolean).join(' · ');
  const unitHtml = u => '<div style="font:800 24px/1.15 Arial,sans-serif;color:' + C.ink + ';margin-top:2px">' + e(u.title) + '</div>' +
    '<div style="font:14px Arial,sans-serif;color:' + C.muted + ';margin-top:4px">' + e(u.meta) + '</div>' +
    (u.note ? '<div style="margin:16px 0 0;padding:12px 14px;border-left:4px solid ' + C.acc + ';background:' + C.bg + ';border-radius:6px;font:15px/1.4 Arial,sans-serif;color:' + C.ink + '">' +
      '<div style="font:700 12px Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:' + C.muted + ';margin-bottom:4px">Od trenera</div>' + e(u.note) + '</div>' : '') +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:14px">' + u.ex.map(x =>
      '<tr><td style="padding:10px 0;border-top:1px solid ' + C.line + ';vertical-align:top;width:30px"><span style="display:inline-block;min-width:22px;padding:2px 0;border-radius:6px;background:' + (C[x.prio] || C.B) + ';color:#ffffff;font:700 12px Arial,sans-serif;text-align:center">' + e(x.prio) + '</span></td>' +
      '<td style="padding:10px 0 10px 8px;border-top:1px solid ' + C.line + ';font:15px/1.35 Arial,sans-serif;color:' + C.ink + '"><b>' + e(x.name) + '</b>' +
      (line(x) ? '<div style="color:' + C.muted + ';font-size:14px;margin-top:2px">' + e(line(x)) + '</div>' : '') + '</td></tr>').join('') + '</table>';
  const html = '<div style="background:' + C.bg + ';padding:16px 10px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;margin:0 auto;border-collapse:collapse">' +
    '<tr><td style="background:' + C.brand + ';border-radius:12px 12px 0 0;padding:14px 18px;font:800 15px Arial,sans-serif;letter-spacing:.14em;color:#f3f1e8">SIŁA <span style="color:' + C.acc + '">Z</span> RUCHU</td></tr>' +
    '<tr><td style="background:' + C.card + ';border-radius:0 0 12px 12px;padding:18px 18px 20px">' +
    '<div style="font:15px Arial,sans-serif;color:' + C.ink + '">Cześć ' + e(c.name) + '!</div>' +
    '<div style="font:700 13px Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:' + C.muted + ';margin-top:14px">Dziś · ' + e(day) + '</div>' +
    units.map(unitHtml).join('<div style="height:22px"></div>') +
    (o.url ? '<div style="text-align:center;margin:20px 0 6px"><a href="' + e(o.url) + '" style="display:inline-block;background:' + C.acc + ';color:' + C.brand + ';text-decoration:none;font:700 16px Arial,sans-serif;padding:14px 28px;border-radius:10px">Otwórz trening</a></div>' : '') +
    '<div style="font:13px/1.4 Arial,sans-serif;color:' + C.muted + ';text-align:center">Inny dzień pasuje lepiej? W aplikacji przytrzymaj trening w pasku tygodnia i przesuń.</div>' +
    '</td></tr>' +
    '<tr><td style="padding:14px 8px 0;font:12px/1.45 Arial,sans-serif;color:' + C.muted + ';text-align:center">Przycisk otwiera Twoją aplikację: nie przesyłaj tego maila dalej.<br>Nie chcesz porannych maili? Odpisz na tę wiadomość.</td></tr>' +
    '</table></div>';
  const body = 'Cześć ' + c.name + '!\n\nDziś · ' + day + '\n' + units.map(u => '\n' + u.title + '\n' + u.meta + (u.note ? '\n\nOd trenera: ' + u.note : '') + '\n\n' +
    u.ex.map(x => '[' + x.prio + '] ' + x.name + (line(x) ? ': ' + line(x) : '')).join('\n')).join('\n') +
    (o.url ? '\n\nOtwórz trening: ' + o.url : '') + '\n\nLink otwiera Twoją aplikację: nie przesyłaj tego maila dalej. Nie chcesz porannych maili? Odpisz na tę wiadomość.';
  const subject = (o.test ? '[Próba] ' : '') + 'Dziś trening: ' + units[0].title + (units.length > 1 ? ' (+' + (units.length - 1) + ')' : '');
  return { subject: subject, html: html, body: body };
}

/* ---------- wywołania z Google (bez testów w Node) ---------- */
function mailGodz_() {
  const h = Number(PropertiesService.getScriptProperties().getProperty('MAIL_GODZ'));
  return MAIL_GODZINY.indexOf(h) >= 0 ? h : MAIL_GODZ;
}
function mailWyzwalacz_(h) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'porannyMail').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('porannyMail').timeBased().everyDays(1).atHour(h).nearMinute(0).create();
}
function mailDayOf_() {
  const tz = Session.getScriptTimeZone();
  return v => v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v === undefined || v === null ? '' : v).slice(0, 10);
}
function mailSend_(to, m) {
  MailApp.sendEmail({ to: to, subject: m.subject, body: m.body, htmlBody: m.html, name: MAIL_NADAWCA });
}
function mailLog_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('MAIL_LOG') || '{}') || {}; } catch (e) { return {}; }
}

/** Wyzwalacz dzienny (menu Trening → Zainstaluj wyzwalacze albo zmiana godziny w panelu). */
function porannyMail() {
  const props = PropertiesService.getScriptProperties(), today = today_(), dayOf = mailDayOf_();
  const plan = tableOf_('Plan');
  const list = rannyDo_(klRows_(klSheet_()), plan, pgTable_('Log', ['klient', 'tydzien', 'jednostka']), pgTable_('Sesje', ['klient', 'tydzien', 'jednostka']), today, dayOf);
  const log = mailLog_(), base = linkBase_(), sent = [], at = new Date().toISOString();
  list.forEach(x => {
    if (log[x.c.id] && log[x.c.id].day === today) return;   // już dziś wysłany (np. po zmianie godziny)
    try {
      const units = x.units.map(u => rannyUnit_(u, plan));
      mailSend_(x.email, rannyMail_(x.c, units, { url: base ? base + '?k=' + x.key : '', day: today }));
      log[x.c.id] = { at: at, day: today, title: units[0].title };
      sent.push(x.c.name);
    } catch (e) {
      try { sheet_('Błędy', ERR_HEADERS).appendRow([new Date(), x.c.id, 'mail', ('poranny mail: ' + e).slice(0, 400), '', 'porannyMail']); } catch (e2) { Logger.log('mail: ' + e); }
    }
  });
  props.setProperty('MAIL_LOG', JSON.stringify(log).slice(0, 8000));
  props.setProperty('MAIL_DZIEN', JSON.stringify({ day: today, at: at, names: sent }));
  Logger.log('Poranny mail: ' + sent.length + ' (' + sent.join(', ') + ')');
}
