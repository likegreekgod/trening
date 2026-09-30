// Ładuje apps-script/Code.gs do piaskownicy Node (bez usług Google) — do testów czystych funkcji.
const fs = require('fs'), vm = require('vm'), path = require('path');
module.exports = function loadCode() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8')
    .replace(/^const /gm, 'var ');                       // const → var, żeby trafiły do kontekstu
  const ctx = { console, Logger: { log() {} } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
};
