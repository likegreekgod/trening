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
const by = {};
rows.forEach(r => { const k = String(r.klient).toLowerCase(); by[k] = by[k] || new Set(); by[k].add(r.tydzien + '|' + r.jednostka); });
console.log('OK: ' + rows.length + ' wierszy; ' + Object.entries(by).map(([k, s]) => k + ' – ' + s.size + ' jednostek').join('; '));
