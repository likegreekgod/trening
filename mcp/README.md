# Panel trenera w Claude (pośrednik MCP)

Claude (konektor w claude.ai) → ten Worker na Cloudflare → Apps Script `/exec` (te same funkcje `TR_FNS` co panel trenera).
Szkic i plan PR-ów: Claude Doc „Szkic D: panel trenera w Claude (MCP)”, zmiany w `docs/zmiany/2026-11-27-mcp-d1.md`.

## Jak działa

- **Logowanie**: Claude rejestruje się w Workerze (OAuth 2.1, biblioteka `@cloudflare/workers-oauth-provider`), trener widzi stronę „Połączyć „Claude” z panelem trenera?”, potem loguje się w Google tym samym kontem co do panelu. Worker wpuszcza tylko adresy z sekretu `TRENER_EMAIL`.
- **Bilet do arkusza**: z Google zostaje refresh token (zaszyfrowany w danych grantu w KV). Z niego Worker bierze świeży ID token i wysyła go do `/exec` jako `token`, tak jak panel. `trAuth_` w Apps Script sprawdza go bez zmian.
- **MCP**: bez stanu, same odpowiedzi JSON (`src/mcp.js`), narzędzia w `src/tools.js` (odczyt: `dzis`, `klienci`, `kalendarz`, `klient`, `jednostka`; zapis: `przesun`, `zmien_plan`, `decyzja_asystent`, `komentarz_sesji`). Odpowiedzi są skrócone: bez linków z kluczami klientów i bez linków do filmów.
- **Karty (MCP Apps)**: `src/ui.js`. Narzędzie `dzis` ma w `_meta.ui.resourceUri` kartę `ui://sila-z-ruchu/dzis.html` (HTML bez bibliotek i bez sieci, protokół `ui/*` przez postMessage). claude.ai pokazuje ją pod odpowiedzią: kto dziś trenuje, propozycje asystentów AI z „✓ Zatwierdź” / „✕ Odrzuć” (powód, „zapamiętaj jako zasadę”), „Przeczytane”, „↶ Cofnij”, „Wymaga uwagi”. Przyciski wołają przez gospodarza narzędzie `decyzja_asystent`. Narzędzie `klient` ma kartę `ui://sila-z-ruchu/klient.html` („Pokaż Olę”): sygnały, liczby tygodnia, siła (e1RM ćwiczeń A), ostatnie sesje, najbliższe jednostki, „▶ Prowadź” i „Otwórz w panelu” (`ui/open-link`). Filmy: „pokaż filmy Oli bez komentarza” → narzędzie `filmy`, potem `film` otwiera kartę z odtwarzaczem (plik z Dysku przez `/film/<bilet>` pośrednika, 45 min). Trener zaznacza fragment, „Pokaż Claude’owi 8 klatek” wysyła klatki (`klatki_zapisz`, godzina w KV) i pisze w czacie, Claude czyta je narzędziem `klatki` jako zdjęcia. Komentarz z karty albo z czatu: `komentarz_filmu`.
- **Dziennik**: zapisy z Claude idą z `src: 'mcp'`, a serwer dopisuje je do zakładki API jako „claude: trPrzesun” itp. (`mcpLogRow_`, lista `TR_MCP_ZAPIS` = `ZAPIS` w `src/tools.js`, test pilnuje zgodności).

## Uruchomienie (raz, trener)

1. **Cloudflare** (to samo konto co strona): Workers & Pages → po prawej skopiuj **Account ID**. Tam też jest Twoja subdomena `….workers.dev`; adres pośrednika będzie `https://trening-mcp.<subdomena>.workers.dev`.
   Potem: ikona profilu → My Profile → API Tokens → Create Token → szablon **Edit Cloudflare Workers** → Continue → Create → skopiuj token.
2. **Google Cloud** → APIs & Services → Credentials → klient OAuth panelu (ten, którego identyfikator jest w „Ustaw panel trenera”):
   - w **Authorized redirect URIs** dodaj `https://trening-mcp.<subdomena>.workers.dev/callback` i zapisz,
   - skopiuj **Client secret** (jeśli go nie ma: „Add secret”).
3. **GitHub** → repozytorium → Settings → Secrets and variables → Actions → New repository secret, pięć sekretów:
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GOOGLE_CLIENT_ID` (ten sam co `TRENER_CLIENT_ID`), `GOOGLE_CLIENT_SECRET`, `TRENER_EMAIL`.
4. GitHub → Actions → „Wdrożenie pośrednika MCP (panel w Claude)” → Run workflow. Każde scalenie zmian w `mcp/` wdraża się potem samo.
5. **claude.ai** → Ustawienia → Konektory → Dodaj własny konektor: nazwa „Siła z Ruchu – trener”, adres `https://trening-mcp.<subdomena>.workers.dev/mcp` → Połącz → „Połącz” → konto Google trenera.
6. W czacie: „Kto dziś trenuje?”.

Klucze i sekrety tylko w Cloudflare i w sekretach GitHuba, nigdy w repo ani w czacie.

## Rozwój

```bash
cd mcp && npm install
npm test               # czyste funkcje (tools.js, mcp.js)
node test/karta.mjs /tmp   # karty Dziś, klient i film w atrapie gospodarza (Playwright): przyciski i zrzuty jasny / ciemny / telefon
bash test/e2e.sh       # cały łańcuch lokalnie: rejestracja, zgoda, „Google”, bilet, odświeżenie, narzędzia (atrapa w test/fake.mjs)
npx wrangler deploy --dry-run
```

Nowe narzędzie: definicja w `TOOLS` i przypadek w `run` (`src/tools.js`), test w `test/tools.test.js`; zapis dopisz do `ZAPIS` i do `TR_MCP_ZAPIS` w `apps-script/Trener.gs`. Funkcja serwera musi być w `TR_FNS`.
