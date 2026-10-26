// Ładuje apps-script/Code.gs, Cwiczenia.gs i Podglad.gs do piaskownicy Node (bez usług Google) — do testów czystych funkcji.
const fs = require('fs'), vm = require('vm'), path = require('path');
module.exports = function loadCode() {
  const src = ['Code.gs', 'Cwiczenia.gs', 'Podglad.gs'].map(f => fs.readFileSync(path.join(__dirname, '..', 'apps-script', f), 'utf8')).join('\n')
    .replace(/^const /gm, 'var ');                       // const → var, żeby trafiły do kontekstu
  const ctx = { console, Logger: { log() {} } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
};
