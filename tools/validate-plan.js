#!/usr/bin/env node
// Sprawdza plik planu przed wrzuceniem do „Trening – Klienci/_plany/”: node tools/validate-plan.js plans/plik.json
const fs = require('fs');
const C = require('../tests/load-code')();
const file = process.argv[2];
if (!file) { console.error('Użycie: node tools/validate-plan.js <plan.json>'); process.exit(2); }
let rows = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Array.isArray(rows)) rows = rows.rows;
const errs = C.validatePlan_(rows);
if (errs.length) { console.error('BŁĘDY (' + errs.length + '):\n- ' + Array.from(errs).join('\n- ')); process.exit(1); }
// ostrzeżenia (nie błędy): pseudo-ćwiczenie zamiast wierszy z sekcją; baza = to, co wczytuje „Wczytaj bazę ćwiczeń”
const dict = C.cwBaza_(C.CW_BAZA, C.CW_ALIASY, C.CW_DODATKI, C.CW_FEDB, C.CW_SCALONE).map(b => ({ cwiczenie: b[0], aliasy: b[3], instruktaz: b[1] ? 'x' : '', partia: b[2] }));
const warn = C.planWarnings_(rows, dict);
if (warn.length) console.warn('UWAGI (' + warn.length + '):\n- ' + Array.from(warn).join('\n- '));
const by = {};
rows.forEach(r => { const k = String(r.klient).toLowerCase(); by[k] = by[k] || new Set(); by[k].add(r.tydzien + '|' + r.jednostka); });
const zast = {};
rows.forEach(r => { if (r.zastepuje) zast[String(r.klient).toLowerCase()] = String(r.zastepuje).trim(); });
Object.entries(zast).forEach(([k, b]) => console.log(k + ': zamknie niezrobione jednostki bloku ' + b + ' od pierwszej daty klienta w pliku'));
console.log('OK: ' + rows.length + ' wierszy; ' + Object.entries(by).map(([k, s]) => k + ' – ' + s.size + ' jednostek').join('; '));
