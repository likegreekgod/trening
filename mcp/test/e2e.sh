#!/usr/bin/env bash
# Cały łańcuch lokalnie: Claude (curl) → pośrednik (wrangler dev) → atrapa Google i Apps Script (test/fake.mjs).
# Uruchom z mcp/: bash test/e2e.sh   (wymaga npm install w mcp/)
set -euo pipefail
cd "$(dirname "$0")/.."
W=8799 F=8798 TMP=$(mktemp -d)
printf 'GOOGLE_CLIENT_ID=test.apps.googleusercontent.com\nGOOGLE_CLIENT_SECRET=x\nTRENER_EMAIL=trener@example.com\nGOOGLE_TOKEN_URL=http://127.0.0.1:%s/token\nAPI_URL=http://127.0.0.1:%s/exec\n' $F $F > .dev.vars
node test/fake.mjs $F & FP=$!
npx wrangler dev --port $W --local --compatibility-flags=nodejs_compat --persist-to "$TMP/state" > "$TMP/dev.log" 2>&1 & WP=$!
trap 'kill $FP $WP 2>/dev/null; pkill -f "wrangler dev --port $W" 2>/dev/null; rm -f .dev.vars; rm -rf "$TMP"' EXIT
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:$W/ && break; sleep 1; done
B=http://localhost:$W
CID=$(curl -s -X POST $B/oauth/register -H 'Content-Type: application/json' -d '{"client_name":"Claude","redirect_uris":["https://claude.ai/api/mcp/auth_callback"],"token_endpoint_auth_method":"none","grant_types":["authorization_code","refresh_token"],"response_types":["code"]}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).client_id')
V=abcdefghijklmnopqrstuvwxyz0123456789abcdefghijk
CH=$(printf %s $V | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')
RU=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback RES=http%3A%2F%2Flocalhost%3A$W%2Fmcp
curl -s -c "$TMP/cj" "$B/authorize?response_type=code&client_id=$CID&redirect_uri=$RU&state=xyz&code_challenge=$CH&code_challenge_method=S256&resource=$RES&scope=trener" > "$TMP/c.html"
H=$(grep -o 'name="handle" value="[^"]*"' "$TMP/c.html" | sed 's/.*value="//;s/"//')
G=$(curl -s -b "$TMP/cj" -c "$TMP/cj" -o /dev/null -w '%{redirect_url}' -X POST $B/authorize -d "handle=$H&decision=approve")
ST=$(node -pe "new URL('$G').searchParams.get('state')")
BACK=$(curl -s -b "$TMP/cj" -o /dev/null -w '%{redirect_url}' "$B/callback?state=$ST&code=kod-google")
CODE=$(node -pe "new URL('$BACK').searchParams.get('code')")
T1=$(curl -s -X POST $B/oauth/token -d "grant_type=authorization_code&code=$CODE&redirect_uri=$RU&client_id=$CID&code_verifier=$V&resource=$RES")
RT=$(echo "$T1" | node -pe 'JSON.parse(require("fs").readFileSync(0)).refresh_token')
# odświeżenie biletu Claude: pośrednik sprawdza przy tym zgodę w Google (tokenExchangeCallback)
TOK=$(curl -s -X POST $B/oauth/token -d "grant_type=refresh_token&refresh_token=$RT&client_id=$CID&resource=$RES" | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')
mcp() { curl -s -X POST $B/mcp -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d "$1"; }
fail() { echo "BŁĄD: $1"; tail -20 "$TMP/dev.log"; exit 1; }
mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' | grep -q '"protocolVersion":"2025-06-18"' || fail initialize
mcp '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | grep -q '"name":"przesun"' || fail tools/list
mcp '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"dzis","arguments":{}}}' | grep -q 'Ania' || fail dzis
mcp '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"przesun","arguments":{"id":"ania","tydzien":3,"jednostka":"B","data":"2026-11-28"}}}' | grep -q '2026-11-28' || fail przesun
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/mcp -H 'Authorization: Bearer zly' -d '{}')" = 401 ] || fail 'zły bilet'
C=$(curl -s http://127.0.0.1:$F/calls)
echo "$C" | grep -q '\["exec","trPrzesun","mcp","token"\]' || fail "zapis bez src/biletu: $C"
echo "$C" | grep -q '\["token","refresh_token"\]' || fail "odświeżenie bez Google: $C"
echo "OK: logowanie (zgoda → Google → bilet), initialize, tools/list, odświeżenie biletu, dzis, przesun, odmowa złego biletu"
