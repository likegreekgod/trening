# Plan wdrożenia v2

Analiza `web/` względem `docs/ui-v2-spec.md` (stan na 2026-10-09, po krokach 5–7) i podział pracy na PR-y.
Decyzje, które zmieniają lub uzupełniają specyfikację, są w `docs/decyzje.md` (wpis „Plan wdrożenia v2”).

## Kolizje `web/` ze specyfikacją

### Wygląd

| # | Teraz | Specyfikacja |
|---|---|---|
| 1 | Własne tokeny (`--card`, `--acc` niebieski), domyślnie ciemny | Tokeny Pomost (`--bg`, `--surface`, `--primary`, `--accent`, `--olive`…), jasny i ciemny |
| 2 | `theme_color`/`background_color` `#0f1115` (manifest, `<meta theme-color>`) | `#edf4f2` / `#0f1612` |
| 3 | Czcionki systemowe | Big Shoulders Display, Instrument Sans, IBM Plex Mono w `web/fonts/` + cache w `sw.js` |
| 4 | Karty 12 px, pigułki (tygodnie, dni, miejsca bólu) | Rogi 2 px, linie zamiast kart, zakładki podkreślone akcentem |
| 5 | „usuń?” 11 px | Etykiety ≥ 12 px |

### Struktura i nawigacja

| # | Teraz | Specyfikacja |
|---|---|---|
| 6 | Jeden ekran, tygodnie i dni w nagłówku | Dolne menu: Trening / Dyspozycja / Plan / Postęp |
| 7 | „Tydz. 6 · deload” na sztywno | Deload („lżejszy”) z planu |
| 8 | Nagłówek: tytuł, synchronizacja, zegar | Tydzień · jednostka · data, czas, serie zrobione/wszystkie, tonaż, RPE/RIR, baner dyspozycji |

### Serie

| # | Teraz | Specyfikacja |
|---|---|---|
| 9 | `nr │ kg │ powt. │ RPE │ (VBT) │ ✓`, FAIL w liście RPE | `nr │ kg │ powt. │ RPE/RIR │ ✓/✕ │ kamera`, FAIL w polu odhaczenia |
| 10 | Typ serii z przycisków | Dotknięcie numeru: zwykła → drop → nieudana |
| 11 | Stan „w kolejce” (żółty) | Nieopisany; zostaje (kolejka offline bez zmian) |
| 12 | „⇣ Jak 1. seria”, „+ Seria (N)”, „✓ Wszystko jak w planie”, ✕ | Nie wymienione; zostają (decyzja) |
| 13 | Recepta „RPE ≤ x” | RPE lub RIR (flaga `skala`), boje: „max dziś X kg”, kwadrat w kolorze talerza |
| 14 | Brak | „Ostatnio”, timer przerwy, Wake Lock, kalkulator talerzy |
| 15 | Boje jak zwykłe ćwiczenie | Światła, ocena, `sugOly`, „Ustaw X kg” |
| 16 | Brak | Zamiana ćwiczenia z powodem |

### Film

| # | Teraz | Specyfikacja |
|---|---|---|
| 17 | Jeden film na ćwiczenie, do ostatniej odhaczonej serii | Kamera przy każdej serii, „Tylko film” / „Film + ścieżka + VBT” |
| 18 | Bez sieci: ogólny „Błąd wgrywania” | Czytelny komunikat o braku sieci |

### Ekrany, testy, serwer

- Brak ekranów Dyspozycja i Postęp.
- Logika w `index.html`, nietestowalna w Node; `ui.test.js` oparty na obecnych selektorach, jeden motyw.
- `getData` nie zwraca `grupa`, `zamienniki`, flag `zamiana`, `skala`, `sufit_oly`; brak kolumn Log v2, akcji `saveDyspozycja`, zakładki `Dyspozycja`.
- `pickDefault` liczy „dziś” w UTC (ok. 0:00–2:00 otwiera wczorajszą jednostkę).
- Prototyp nazywa ekran dyspozycji `gotowosc`; w aplikacji: `dyspozycja`.

### Historia klienta (znalezione przy analizie)

- `writePlanRows_` usuwa z zakładki Plan wszystkie wiersze klienta, także wykonane jednostki.
- Id serii `klient|tydzien|jednostka|nr|seria`: jeśli nowy blok zaczyna się znów od tygodnia 1, aplikacja pokazuje stare serie jako odhaczone, zapis nadpisuje Log poprzedniego bloku, a podsumowanie łączy stare serie z nowym planem.

## PR-y

Każdy PR w `web/` podbija `VERSION` w `sw.js`; `npm test` musi przechodzić. Po każdym scaleniu aplikacja działa.

| PR | Zakres | Uwagi |
|---|---|---|
| 1. Backend v2 ✓ (09.10) | Flagi `zamiana`, `skala`, `sufit_oly` w Klienci i `cfg`; `grupa`, `zamienniki`, `blok` w `getData`; kolumny Log v2 na końcu; `saveDyspozycja` + zakładka `Dyspozycja`; `przesunJednostke`; data w planie opcjonalna; ochrona wykonanych jednostek przy wczytywaniu planu i odrzucanie kolizji tygodni; zakładka `Bloki` z kolumną `wnioski` | Tylko `Code.gs` + testy. Zgodny wstecz, wdraża Action. Po wdrożeniu: `setup` (nagłówki Klienci J–L) |
| 2. Fundament Pomost ✓ (10.10) | Tokeny, czcionki, manifest, ostre rogi i linie na obecnym ekranie, etykiety ≥ 12 px; `web/lib.js` (czyste funkcje) + testy Node; Playwright: zrzuty jasny/ciemny, PROSTY/PRO, offline | Bez zmian działania |
| 3. Nawigacja + Plan ✓ (10.10) | Dolne menu, ekran Plan (tygodnie, deload z planu, dni z kropkami, „Blok N · tydz. M”, zmiana daty jednostki), nagłówek treningu | Dyspozycja i Postęp ukryte do czasu PR 10–11 |
| 4. Serie | Nowy wiersz, ✓/✕ + stan „w kolejce”, typ pod numerem, RPE/RIR, recepta z RIR i kolorem talerza, „Ostatnio”, „dziś” w strefie lokalnej, ściągawka PROSTY | Payloady `logSet` bez zmian (testy) |
| 5. Timer i talerze | Pasek przerwy A/B/K, ±15 s, Pomiń; Wake Lock; kalkulator talerzy | |
| 6. Boje | Światła, ocena → `rpe`/`typ`/`ocena`, `sugOly`, sufit dnia, „Ustaw X kg”, „max dziś” | Testy `sugOly` |
| 7. Zamiana ćwiczenia | Zamienniki, powód, zapis `zamiana` | Flaga `zamiana = TAK` |
| 8. Film przy serii | Kamera przy każdej serii, komunikat o braku sieci, ręczny wpis prędkości z urządzenia (m/s) | Wysyłka na Drive bez zmian |
| 9. Ścieżka i VBT | `track()`, `analyse()`, kalibracja 450 mm, zapis `vbt_ms`, `vbt_peak`, `wysokosc_cm`, `sciezka` | Testy `analyse` na syntetycznym ruchu |
| 10. Dyspozycja | Hooper, CMJ, prędkość na rozgrzewce, `verdict`, baner | Testy `verdict` |
| 11. Postęp | Siła i rekordy, objętość i strefy, kalendarz 12 tyg., dyspozycja; cała historia z podziałem na bloki | Wykresy w SVG, bez bibliotek |

## Poza repozytorium

- Skill trenerski w claude.ai: kolumna `blok`, ciągła numeracja tygodni u klienta, daty opcjonalne, czytanie zakładki `Bloki` (z wnioskami) przed nowym planem.
