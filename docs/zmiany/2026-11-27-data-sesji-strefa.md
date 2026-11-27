# Data sesji w narzędziach Claude w polskiej strefie (27.11.2026)

## Zrobione
- `mcp/src/tools.js`: `d10` liczy dzień w strefie Europe/Warsaw, gdy wartość ma godzinę (`2026-11-26T23:00:00.000Z` → `2026-11-27`); data bez godziny przechodzi bez zmian. Jedna zmiana obejmuje wszystkie miejsca z `d10`: sesje (`sesTxt`: `start`, potem `data`) w `klient` i `jednostka`, ból z Sesji i Stanu, dyspozycja i filmy w karcie klienta, `tor` (`l.data`, `l.zapisano`), „Zrobił sam” asystenta (`kiedy`). Zapasowe „dziś” w `karta()` też w strefie trenera. Daty `at` z pulpitu (odpowiedzi, filmy) serwer już podaje jako dzień w polskiej strefie.
- `apps-script/Agent.gs`: `agD10_` (data propozycji asystenta: „Od asystenta AI”, `asystent_czeka`, okno 7 dni) w strefie trenera; wcześniej `toISOString().slice` dawało dzień wcześniej dla zapisów między północą a 1:00 / 2:00.
- `apps-script/Trener.gs`: `trProwadzone_` (Rozliczenia → Prowadzone) dla starej sesji bez startu bierze dzień z `Sesje.data` w strefie trenera.
- `apps-script/Code.gs`: `logSession` zapisuje `Sesje.start` przez czystą `sesStart_`: start z aplikacji bez zmian, a gdy pusty (jednostka zamknięta bez żadnej zapisanej serii, np. w „Prowadź”, serie dopisane później) = koniec − `czas_min`, sam koniec albo chwila zapisu.
- Testy: `mcp/test/tools.test.js` („data sesji w strefie trenera”), `tests/code.test.js` (`sesStart_`, `agD10_`).

## Ustalenia
- Przyczyna przykładu (Maciek, tydz. 1, S1): jednostkę zamknięto bez zapisanej serii, więc aplikacja wysłała pusty `start`. Narzędzia brały wtedy `Sesje.data`, którą Arkusze zamieniają z tekstu „2026-11-27” w datę o północy; do MCP przychodzi jako `2026-11-26T23:00:00.000Z`, a `slice(0, 10)` ucinało datę UTC.
- Stare sesje bez startu zostają bez startu (bez przepisywania arkusza); narzędzia pokazują je już poprawnie z `data`. Po ponownym „Zapisz zmiany” w takiej jednostce start ustawi się z końca i czasu.
- Kolumna `data` w Sesjach dalej bywa datą, nie tekstem (bez formatu `@` jak w Planie). Odczyty w kodzie radzą sobie z obiema postaciami, więc bez zmian w arkuszu.
