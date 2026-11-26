# 2026-11-26 · Czat „Wypróbuj asystenta” w panelu (PR 2a asystenta AI)

## Zrobione

- Panel → Klienci → ustawienia klienta → karta „Wypróbuj asystenta” (`#agchat`, `agChatCard` / `agChatBind`, stan `ACH` tylko w pamięci strony): trener pisze jako klient, asystent odpowiada tak jak bot klienta. Pod odpowiedzią lista akcji, które wywołał (✓ albo ✕ z regułą), koszt rozmowy, „Nowa rozmowa”.
- Przełącznik „Zapisuj naprawdę”, domyślnie wyłączony: zapisy (`zapiszSerie`, `zapiszTrening`, `zaproponuj`, `zglos`) przechodzą przez te same reguły, ale nic nie trafia do arkusza (`agWrite_(…, dry)`). Włączony: zapis jak z API, w zakładce API wiersz `czat:<akcja>`.
- Serwer: `trAsystent(id, msgs, {real})` (TR_FNS) w `apps-script/Agent.gs`. Czyste z testami: `agTools_` (akcje → narzędzia Messages API z `AG_TOOLS`, test pilnuje zgodności z lib `AG_READ` + `AG_WRITE`), `agChatSystem_` (instrukcja + zasady trenera + ograniczenia klienta, bez imienia), `agChatMsgs_` (historia z panelu), `agChatLoop_` (pętla narzędzi do `AG_CHAT_KROKI` = 8, odpowiedź modelu wraca w całości), `agStep_`. Uprawnienia odczyt / zapis / propozycje z ustawień API klienta działają też w czacie; klucz API klienta nie jest potrzebny.
- Claude API z klucza panelu (`CLAUDE_API_KEY`), model `AI_MODEL`, effort low, `fallbacks: "default"`; jedna wiadomość = jedno użycie z dziennego limitu AI i jeden wiersz w zakładce AI („asystent (próba)”). `aiCall_` rozdzielony na `aiFetch_` (zapytanie i błędy) i `aiNote_` (licznik, wiersz AI).

## Ustalenia

- 26.11 Damian chce testować bota sam, równolegle z Marcinem; wybrał czat w panelu zamiast Claude.ai przez MCP (MCP wymagałby pośrednika, np. Cloudflare Worker, bo Apps Script nie czyta nagłówków i odpowiada przekierowaniem).
- Panel wysyła tylko teksty rozmowy; wyniki akcji z poprzednich wiadomości nie wracają, więc asystent sprawdza plan od nowa, gdy potrzebuje.
- Dalej w PR 2: akceptacja propozycji w panelu, eksport decyzji; PR 3: okno „Zapytaj trenera AI” w aplikacji na tym samym silniku.
