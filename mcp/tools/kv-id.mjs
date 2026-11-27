// Wdrożenie (GitHub Actions): znajduje albo zakłada przestrzeń KV „trening-mcp-oauth” i wpisuje jej id do wrangler.jsonc
// (tylko w kopii roboczej akcji; w repo zostaje bez id). Wymaga CLOUDFLARE_API_TOKEN i CLOUDFLARE_ACCOUNT_ID.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const TITLE = 'trening-mcp-oauth';
const w = (...a) => execFileSync('npx', ['wrangler', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const list = () => JSON.parse(w('kv', 'namespace', 'list').replace(/^[^\[]*/, ''));
let ns = list().find(n => n.title === TITLE);
if (!ns) { w('kv', 'namespace', 'create', TITLE); ns = list().find(n => n.title === TITLE); }
if (!ns) throw new Error('Nie udało się założyć KV ' + TITLE);
const p = new URL('../wrangler.jsonc', import.meta.url), t = fs.readFileSync(p, 'utf8');
const out = t.replace('{ "binding": "OAUTH_KV" }', '{ "binding": "OAUTH_KV", "id": "' + ns.id + '" }');
if (out === t) throw new Error('Nie znalazłem wiązania OAUTH_KV w wrangler.jsonc');
fs.writeFileSync(p, out);
console.log('KV ' + TITLE + ' gotowe');
