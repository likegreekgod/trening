/**
 * Pośrednik MCP na Cloudflare Workers (D1, 27.11.2026): Claude ↔ ten Worker ↔ Apps Script /exec (te same funkcje TR_FNS co panel trenera).
 *
 * Logowanie: Worker jest serwerem OAuth dla Claude (biblioteka @cloudflare/workers-oauth-provider: rejestracja klienta, PKCE, bilety),
 * a tożsamość bierze z Google: strona zgody → Google (ten sam klient OAuth co panel) → /callback. Wpuszcza tylko adresy z sekretu
 * TRENER_EMAIL. Z Google zostaje tylko refresh token (zaszyfrowany w props grantu); z niego Worker bierze świeży ID token
 * i wysyła go do /exec jako `token`, dokładnie jak panel, więc trAuth_ w Apps Script sprawdza go tak samo.
 *
 * Sekrety (wrangler secret / GitHub Actions, nigdy w repo): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TRENER_EMAIL.
 * Zmienne (wrangler.jsonc): API_URL (= web/config.js). KV: OAUTH_KV.
 */
import OAuthProvider, { OAuthError, AuthorizationError, authorizationErrorRedirect } from '@cloudflare/workers-oauth-provider';
import { handleBody, SERVER } from './mcp.js';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const emails = env => String(env.TRENER_EMAIL || '').split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const s256 = async v => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));
const jwtBody = t => JSON.parse(atob(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());

/** Wymiana u Google (kod albo refresh token) → {id_token, refresh_token?} albo błąd z polem `google` (np. invalid_grant). */
async function google(env, params) {
  const r = await fetch(env.GOOGLE_TOKEN_URL || GOOGLE_TOKEN, {   // GOOGLE_TOKEN_URL tylko w teście lokalnym (test/e2e.sh)
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.assign({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET }, params)) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id_token) { const e = new Error('Google: ' + (j.error_description || j.error || r.status)); e.google = j.error || String(r.status); throw e; }
  return j;
}

/* ID token trenera w pamięci izolatu (nie w KV): ważny godzinę, odświeżany 5 min przed końcem. */
const IDT = new Map();
async function idToken(env, props, fresh) {
  const hit = IDT.get(props.email);
  if (!fresh && hit && hit.exp - 300 > Date.now() / 1000) return hit.tok;
  let j;
  try { j = await google(env, { grant_type: 'refresh_token', refresh_token: props.rt }); }
  catch (e) { if (e.google === 'invalid_grant') e.auth = true; throw e; }
  IDT.set(props.email, { tok: j.id_token, exp: Number(jwtBody(j.id_token).exp) || 0 });
  return j.id_token;
}

/** Funkcja panelu przez /exec, z biletem trenera; „Logowanie: …” = raz nowy bilet, potem błąd logowania. */
function apiFor(env, props) {
  return async function api(fn, ...args) {
    for (let k = 0; k < 2; k++) {
      const r = await fetch(env.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ fn, token: await idToken(env, props, k > 0), args, src: 'mcp' }) });
      const j = await r.json().catch(() => ({ ok: false, error: 'Serwer odpowiedział ' + r.status }));
      if (j.ok) return j.result;
      if (!/^Logowanie: /.test(j.error || '') || k > 0) { const e = new Error(j.error || 'Błąd serwera'); e.auth = /^Logowanie: /.test(j.error || ''); throw e; }
    }
  };
}

const unauthorized = () => new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401,
  headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer error="invalid_token", error_description="Zaloguj się ponownie"' } });

const McpApi = {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') return new Response('Ten serwer MCP nie używa strumienia SSE.', { status: 405, headers: { Allow: 'POST' } });
    if (emails(env).indexOf(String(ctx.props && ctx.props.email).toLowerCase()) < 0) return unauthorized();
    let body;
    try { body = await request.json(); } catch (e) { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 }); }
    try {
      const origin = new URL(request.url).origin;
      const out = await handleBody(body, { api: apiFor(env, ctx.props), today: today(), origin,
        ticket: async (file, token) => { const k = rnd(); await env.OAUTH_KV.put('film:' + k, JSON.stringify({ file, token }), { expirationTtl: FILM_TTL }); return origin + '/film/' + k; },
        store: async x => { const k = rnd(); await env.OAUTH_KV.put('klatki:' + k, JSON.stringify(x), { expirationTtl: KLATKI_TTL }); return k; },
        load: async k => (/^[0-9a-f]{32}$/.test(k) ? env.OAUTH_KV.get('klatki:' + k, 'json') : null) });
      return out === null ? new Response(null, { status: 202 }) : Response.json(out);
    } catch (e) {
      if (e && e.auth) return unauthorized();
      throw e;
    }
  },
};

/* ---------- film dla karty (D3): bilet w KV (losowy, 45 min) → plik z Dysku z biletem skryptu (trFilm), Range i CORS dla <video> i klatek w canvas ---------- */

const FILM_TTL = 45 * 60, KLATKI_TTL = 3600;
const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges' };

async function film(request, env, k) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const x = /^[0-9a-f]{32}$/.test(k) ? await env.OAUTH_KV.get('film:' + k, 'json') : null;
  if (!x || !/^[\w-]{20,}$/.test(x.file)) return new Response('Bilet filmu wygasł. Otwórz film jeszcze raz w Claude.', { status: 404, headers: CORS });
  const h = { Authorization: 'Bearer ' + x.token }, range = request.headers.get('Range');
  if (range) h.Range = range;
  const r = await fetch((env.DRIVE_URL || 'https://www.googleapis.com/drive/v3/files/') + x.file + '?alt=media', { headers: h });
  const out = new Headers(CORS);
  ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges'].forEach(n => { const v = r.headers.get(n); if (v) out.set(n, v); });
  out.set('Cache-Control', 'private, max-age=600');
  if (!r.ok && r.status !== 206) return new Response('Dysk odpowiedział ' + r.status + (r.status === 404 ? ': filmu nie ma już na Dysku.' : '.'), { status: r.status, headers: CORS });
  return new Response(r.body, { status: r.status, headers: out });
}

/* ---------- strony logowania (zgoda → Google → powrót) ---------- */

const page = (title, body, headers) => {
  const h = new Headers(headers || {}); h.set('Content-Type', 'text/html; charset=utf-8');
  return new Response('<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>' +
    '<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 16px;color:#1f1b16;background:#f6f1ea}h1{font-size:1.4rem}' +
    'button{font:inherit;padding:.7rem 1.2rem;border-radius:10px;border:1px solid #a9542a;margin-right:.5rem;min-height:44px}.ok{background:#a9542a;color:#fff}.no{background:transparent;color:#a9542a}' +
    '@media(prefers-color-scheme:dark){body{background:#1a1612;color:#efe7dc}}</style><body>' + body + '</body></html>', { status: 200, headers: h });
};

const Default = {
  async fetch(request, env) {
    const url = new URL(request.url), oauth = env.OAUTH_PROVIDER;
    try {
      if (url.pathname === '/authorize' && request.method === 'GET') {
        const req = await oauth.parseAuthRequest(request);
        const d = await oauth.describeConsent(req), c = await oauth.beginConsent(req);
        return page('Połącz z panelem trenera', '<h1>Połączyć „' + esc(d.clientName) + '” z panelem trenera Siła z Ruchu?</h1>' +
          '<p>' + (d.clientDomain ? 'Aplikacja z domeny <strong>' + esc(d.clientDomain) + '</strong>.' : 'Aplikacja zarejestrowała się sama; nazwa nie jest potwierdzona.') +
          ' Dostęp trafi do <strong>' + esc(d.redirectHost) + '</strong>.</p>' +
          (d.redirectIsLoopback ? '<p><strong>Dostęp trafi do programu na tym komputerze.</strong> Kontynuuj tylko, jeśli to Ty zaczynasz łączenie.</p>' : '') +
          '<p>Dostanie odczyt danych klientów i zapis zmian w planie, tak jak panel. Za chwilę zalogujesz się kontem Google trenera.</p>' +
          '<form method="post"><input type="hidden" name="handle" value="' + esc(c.handle) + '"><button class="ok" name="decision" value="approve">Połącz</button>' +
          '<button class="no" name="decision" value="deny">Anuluj</button></form>', c.headers);
      }
      if (url.pathname === '/authorize' && request.method === 'POST') {
        const form = await request.formData(), handle = String(form.get('handle') || '');
        if (form.get('decision') !== 'approve') { const no = await oauth.denyConsent(request, handle); return new Response(null, { status: 302, headers: no.headers }); }
        const ok = await oauth.approveConsent(request, handle);
        const verifier = crypto.randomUUID() + crypto.randomUUID();
        const { state, headers } = await oauth.beginUpstream(ok.request, { data: { verifier }, headers: ok.headers });
        headers.set('Location', GOOGLE_AUTH + '?' + new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: url.origin + '/callback', response_type: 'code',
          scope: 'openid email', access_type: 'offline', prompt: 'consent select_account', state, code_challenge: await s256(verifier), code_challenge_method: 'S256' }));
        return new Response(null, { status: 302, headers });
      }
      if (url.pathname === '/callback') {
        const { request: orig, data, headers } = await oauth.finishUpstream(request);
        const back = code => { headers.set('Location', authorizationErrorRedirect(orig, code)); return new Response(null, { status: 302, headers }); };
        if (url.searchParams.get('error')) return back('access_denied');
        const j = await google(env, { grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: url.origin + '/callback', code_verifier: data.verifier });
        const info = jwtBody(j.id_token), email = String(info.email || '').toLowerCase();
        if (!info.email_verified || emails(env).indexOf(email) < 0) return page('Brak dostępu', '<h1>To konto nie ma dostępu</h1><p>Zaloguj się kontem Google, którym logujesz się do panelu trenera.</p>');
        if (!j.refresh_token) return page('Spróbuj jeszcze raz', '<h1>Google nie oddał zgody na stałe</h1><p>Usuń dostęp „Siła z Ruchu” w ustawieniach konta Google (Bezpieczeństwo → Aplikacje innych firm) i połącz jeszcze raz.</p>');
        IDT.set(email, { tok: j.id_token, exp: Number(info.exp) || 0 });
        const { redirectTo } = await oauth.completeAuthorization({ request: orig, userId: email, metadata: { label: email }, scope: orig.scope, props: { email, rt: j.refresh_token } });
        headers.set('Location', redirectTo);
        return new Response(null, { status: 302, headers });
      }
      const fm = /^\/film\/([0-9a-f]{32})$/.exec(url.pathname);
      if (fm) return film(request, env, fm[1]);
      if (url.pathname === '/') return page(SERVER.title, '<h1>' + esc(SERVER.title) + '</h1><p>Serwer MCP panelu trenera. Adres do dodania w claude.ai → Ustawienia → Konektory: <code>' + esc(url.origin) + '/mcp</code></p>');
      return new Response('Nie ma takiej strony.', { status: 404 });
    } catch (e) {
      if (e instanceof AuthorizationError && e.redirectTo) return Response.redirect(e.redirectTo, 302);
      if (e instanceof AuthorizationError) return page('Błąd logowania', '<h1>Nie udało się</h1><p>' + esc(e.description) + '</p><p>Zacznij łączenie jeszcze raz w claude.ai.</p>');
      if (e && e.google) return page('Błąd logowania', '<h1>Google odmówił</h1><p>' + esc(e.message) + '</p>');
      throw e;
    }
  },
};

/* Adres pośrednika zna dopiero zapytanie (konto *.workers.dev albo własna domena), więc dostawca OAuth powstaje dla adresu i zostaje w pamięci. */
const PROV = new Map();
export default {
  fetch(request, env, ctx) {
    const origin = new URL(request.url).origin;
    if (!PROV.has(origin)) PROV.set(origin, provider(origin));
    return PROV.get(origin).fetch(request, env, ctx);
  },
};

const provider = origin => new OAuthProvider({
  resourceMetadata: { resource: origin + '/mcp', authorization_servers: [origin], resource_name: SERVER.title },
  apiRoute: '/mcp',
  apiHandler: McpApi,
  defaultHandler: Default,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',
  clientIdMetadataDocumentEnabled: true,
  scopesSupported: ['trener'],
  accessTokenTTL: 3600,
  refreshTokenTTL: 365 * 86400,
  refreshTokenIdleTTL: 60 * 86400,
  // odświeżenie biletu Claude: sprawdza, czy zgoda w Google wciąż jest (cofnięta = koniec grantu, Claude poprosi o ponowne połączenie)
  tokenExchangeCallback: async ({ grantType, props, env }) => {
    if (grantType !== 'refresh_token' || !props || !props.rt) return;
    try { await idToken(env, props, true); }
    catch (e) {
      if (e.auth) throw new OAuthError('invalid_grant', { description: 'Dostęp Google został cofnięty' });
      throw new OAuthError('temporarily_unavailable', { description: 'Google chwilowo nie odpowiada', statusCode: 503 });
    }
  },
});
