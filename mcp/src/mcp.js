/**
 * Serwer MCP bez stanu (Streamable HTTP, same odpowiedzi JSON, bez SSE i bez sesji): initialize, ping, tools/list, tools/call,
 * resources/list i resources/read (karty MCP Apps z src/ui.js).
 * Czysta obsługa jednego komunikatu JSON-RPC; transport HTTP i logowanie są w src/index.js.
 */
import { TOOLS, run } from './tools.js';
import { RESOURCES, readResource } from './ui.js';

export const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
export const SERVER = { name: 'sila-z-ruchu-trener', title: 'Siła z Ruchu – trener', version: '1.1.0' };
export const INSTRUCTIONS = [
  'Dane z panelu trenera „Siła z Ruchu” (aplikacja treningowa dla klientów trenera personalnego Damiana). Odpowiadaj po polsku, zwięźle.',
  'Zacznij od „dzis” albo „klienci”, żeby poznać identyfikatory klientów (id) i pid propozycji asystentów.',
  'Wysiłek serii to światła: 🟢 lekko (RPE 7), 🟡 średnio (8), 🔴 ciężko (9), ✖ nieudana. Konwencje: % z maksa, kg w dół do 2,5 kg, RPE max to sufit, prio K = korekcyjne.',
  'Zapisy (przesun, zmien_plan, decyzja_asystent, komentarz_sesji) zmieniają plan albo to, co widzi klient: rób je tylko na wyraźną prośbę trenera i powiedz, co zmieniłeś.',
  'Dane klientów (zdrowie, ból) są poufne: nie przenoś ich poza tę rozmowę.',
].join('\n');

const res = (id, result) => ({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => ({ jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } });

/**
 * Jeden komunikat → odpowiedź albo null (powiadomienie). ctx = {api, today}.
 * Błąd narzędzia (np. „Ta jednostka jest już zrobiona”) wraca jako wynik z isError, żeby Claude mógł go przeczytać i powiedzieć trenerowi.
 */
export async function handle(msg, ctx) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(msg && msg.id, -32600, 'Invalid Request');
  const { id, method } = msg, p = msg.params || {};
  if (id === undefined) return null;                                   // powiadomienia (notifications/initialized, cancelled …)
  switch (method) {
    case 'initialize': {
      const v = VERSIONS.indexOf(p.protocolVersion) >= 0 ? p.protocolVersion : VERSIONS[0];
      return res(id, { protocolVersion: v, capabilities: { tools: { listChanged: false }, resources: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
    }
    case 'ping': return res(id, {});
    case 'tools/list': return res(id, { tools: TOOLS });
    case 'resources/list': return res(id, { resources: RESOURCES });
    case 'resources/templates/list': return res(id, { resourceTemplates: [] });
    case 'resources/read': {
      const r = readResource(p.uri);
      return r ? res(id, r) : err(id, -32002, 'Resource not found: ' + p.uri);
    }
    case 'tools/call': {
      const t = TOOLS.find(x => x.name === p.name);
      if (!t) return err(id, -32602, 'Nieznane narzędzie: ' + p.name);
      try {
        const out = await run(p.name, p.arguments || {}, ctx.api, { today: ctx.today });
        return res(id, { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out });
      } catch (e) {
        if (e && e.auth) throw e;                                      // bilet Google nieważny: index.js odpowiada 401, Claude loguje ponownie
        return res(id, { content: [{ type: 'text', text: String((e && e.message) || e) }], isError: true });
      }
    }
    default: return err(id, -32601, 'Method not found: ' + method);
  }
}

/** Ciało zapytania HTTP (obiekt albo tablica) → odpowiedź (obiekt, tablica albo null = 202 bez treści). */
export async function handleBody(body, ctx) {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(m => handle(m, ctx)))).filter(Boolean);
    return out.length ? out : null;
  }
  return handle(body, ctx);
}
