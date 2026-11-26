# 2026-11-26 · Asystent AI klienta: API, zasady trenera, limity serwera (PR 1 z 3)

## Zrobione

- `apps-script/Agent.gs`: API dla własnego bota klienta (prośba Marcina, bot na WhatsAppie). Osobny klucz `sz_` + 32 znaki (Klienci X `api_klucz` = tylko SHA-256; pełny klucz trener widzi raz), Y `api_ustawienia` (JSON: on, read, write, prop, limit), Z `ograniczenia_ai` (część sekcji 5 zasad, tylko ten klient).
- Wejście: `doPost` z `api` w treści albo `?api=` w adresie (Apps Script nie czyta nagłówków) → `agentDo_`; `/exec/<akcja>` przez `e.pathInfo`; `doGet` z `?api=` = tylko akcje odczytu (`agentGet_`).
- 9 akcji (`AGENT_FNS`): `zasady`, `plan`, `historia`, `ciezarNaDzis`, `cwiczenia` (odczyt), `zapiszSerie`, `zapiszTrening` (zapis jak aplikacja: `logSet`, `ownRows_` / `ownWrite_`, `logSession`, Sesje `prowadzil` = agent), `zaproponuj` (zakładka Propozycje, status czeka / odrzucona), `zglos` (Propozycje + przy bólu wpis w zakładce Stan).
- Twarde reguły z „Zasad trenerskich” w czystych funkcjach z testami (`agCiezar_`, `agSet_`, `agTrening_`, `agProp_`, `agZglos_`): 1.1, 1.2 / 1.12 (sufit_oly, dyspozycja Uwaga / Zmęczenie = plan), 1.4, 1.5, 1.6, 1.7 (brak oceny ≠ RPE 7), 1.8, 1.9 (+2,5 kg tylko po tygodniu ≤ rpe_max), 3.1 / 3.2 / 3.4 / 3.7, 4.4, 4.6 (tydzień przed Klienci S start), 4.12, 5.42. Odmowa zawsze z numerem reguły.
- Limity dzienne w CacheService (zapytania na klienta z ustawień, zapisy / propozycje / zgłoszenia z zasad), każde zapytanie w zakładce „API” (bez treści serii, ostatnie 3000).
- Zakładka Zasady_AI (tekst + limity JSON); `trZasady`, `trZasadyUstaw` (odrzuca wklejoną sekcję 5). Panel → Ustawienia: karta „Asystent AI klienta · zasady trenera”.
- Panel → Klienci → ustawienia klienta: karta „Asystent AI klienta (API)” (`agentCard` / `agentBind`, stan `AGS`, `AGD`, `AGM` tylko w pamięci strony): klucz (utwórz / nowy po drugim dotknięciu / wyłącz), odczyt, zapis, propozycje, limit zapytań, ograniczenia klienta, „Kopiuj instrukcję dla bota” (lib `agInstrukcja`), „Opis API (OpenAPI)” (lib `agOpenApi`, OpenAPI 3.1), 10 ostatnich zapytań. `trAgent`, `trAgentUstaw`, `trAgentKlucz`.
- „Wymaga uwagi”: zgłoszenia i propozycje botów z 7 dni (`agOpen_` → `trPulpit.agent`), czerwona flaga na czerwono.

## Ustalenia

- 26.11 Damian: bot liczy ciężar wg 1.9 (≤ rpe_max), „Zaplanuj następną” w Prowadź bez zmian (same 🟢); ból bot tylko zgłasza, nie czyta historii bólu ani dyspozycji; sufit_oly u Damiana i Mikołaja = 0 (ustawia sam).
- Sekcja 5 zasad (dane o zdrowiu) nigdy w repo ani w zasadach ogólnych: każdy klient ma swoją część w kolumnie Z.
- Bot nie zmienia planu: zmiany idą do Propozycji. Zatwierdzanie w panelu, MCP i comiesięczny eksport decyzji do projektu trenera: PR 2. Okienko „Zapytaj trenera AI” w aplikacji (włączane ręcznie, nowy klient wyłączone): PR 3.
- Klucz w adresie wystarcza botom pisanym samodzielnie i automatyzacjom; ChatGPT / Claude jako narzędzie wymagają klucza w nagłówku → pośrednik (PR 2). Apps Script odpowiada przekierowaniem 302: klient HTTP bota musi za nim iść.
- Reguły 1.3, 3.8 i 4.5 zostają w tekście zasad (serwer nie ma danych o technice, sprzęcie klienta i ciężkich jednostkach).
