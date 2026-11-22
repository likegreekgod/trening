# Plan: panel trenera

Panel w przeglądarce (głównie komputer), dostępny z każdego miejsca, do kontroli klientów, treningów i postępów, z pomocą Claude API przy szkicach. Ustalenia i odrzucone warianty są w `docs/decyzje.md` (17.11.2026).

## Architektura

- `web/trener.html` na GitHub Pages (jeden plik, bez frameworka, wygląd Pomost; czyste funkcje z `web/lib.js`). Nie jest PWA i nie działa offline: dane klientów nie zostają w przeglądarce, zapamiętany jest tylko bilet logowania (`tr_tok`).
- Akcje trenera w `apps-script/Trener.gs` (`TR_FNS`), wołane przez ten sam `doPost` co aplikacja klientów, ale z biletem Google zamiast klucza klienta.
- Logowanie: Google Identity Services w przeglądarce → ID token → `trAuth_` sprawdza go w `tokeninfo` (aud = `TRENER_CLIENT_ID`, wydawca Google, ważność, potwierdzony adres z listy `TRENER_EMAIL`), wynik w CacheService do końca ważności biletu (maks. 1 h). Błędy logowania zaczynają się od „Logowanie: ” i panel wraca wtedy do ekranu logowania.
- Ustawienia we właściwościach skryptu (menu „Trening → Ustaw panel trenera”), nie w repo i nie w arkuszu.
- AI (PR 4): klucz Claude API we właściwościach skryptu, wołany przez UrlFetchApp, dzienny limit; AI tylko szkicuje, zapisuje trener.

## Stan

| PR | Zakres | Stan |
|---|---|---|
| 1 | Logowanie trenera i akcje odczytu: `trConfig`, `trPulpit` (klienci z Przeglądu, sygnały, obciążenie 12 tyg., filmy z 14 dni, bloki do zamknięcia), `trKlient` (dane jak `getData` + bloki + podsumowanie), `trPrzelicz` | scalony (PR #76) |
| 2 | Panel do czytania: pulpit (5 liczników, tabela klientów, mapa obciążenia, „Do zrobienia”), karta klienta (Przegląd, Sesje, Bloki, Dyspozycja), Filmy (podgląd z Dysku w panelu), Bloki do zamknięcia; v52; poprawka telefonu (pasek u góry, wylogowanie) i przełącznik aplikacja ↔ panel („Panel trenera” na ekranie Trener tylko przy `tr_dev`, „Mój trening ›” w panelu) v54 | scalony (PR #76) |
| 3 | Zapisy trenera: komentarz do sesji (`trKomentarz`, Sesje `komentarz_trenera`) | zrobione (v56, PR #81, razem z PR 4) |
| 3b | Filmy: własny odtwarzacz (`trFilm`: bilet skryptu, film z Drive API `alt=media` jako blob; klatka, prędkość, pętla, pełny ekran, powiększenie) i komentarz do serii z sekundą (`trKomentarzFilm` → `Log.komentarz_trenera`, nie komentarz na Dysku) | zrobione (v61, PR #86); v62 (PR #87) nie odtwarzał filmów (bilet w adresie odrzucony przez Dysk); strumień przez service worker z biletem w nagłówku, zapas: pobranie w całości (v63, na gałęzi) |
| 3c | Wnioski i „dla klienta” bloku w panelu (`trBlok`) ze szkicem AI obu naraz (`trBlokSzkic`, `trBlokCtx_`, `aiBlokParse_`); notatka do jednostki | bloki: zrobione (v64); notatka do jednostki: zrobione w PR 7 (v78) |
| 4 | Claude API: „✦ Szkic AI” komentarza do sesji (`trSzkic`, `trSzkicCtx_`, `aiReq_`; poprawki Krócej / Cieplej / Bardziej technicznie / Inny szkic), limit dzienny, zakładka „AI” (tokeny, koszt w USD) | zrobione (v56, PR #81); bez zapytania do API, gdy sesja nie ma zapisanych serii (v58, PR #83); klucz wklejany w panelu → Ustawienia (v60, PR #85); krótszy szkic: najwyżej 4 zdania, decyzja z liczbą (v61, na gałęzi) |
| 6 | Klienci w panelu: lista z linkami (kopiuj / wyślij), ustawienia klienta (flagi z zakładki Klienci), nowy link, nowy klient (`trKlienci`, `trKlientUstaw`, `trKlientNowy`, `trKlientLink`) | zrobione na gałęzi (v71) |
| 7 | Szybka zmiana planu: karta klienta → Plan, „Edytuj” w niezrobionej jednostce (serie, powt., kg, %, RPE, uwagi, notatka do jednostki), opcjonalnie kolejne tygodnie o tę samą różnicę (`trPlan`, `trPlanEdit_`, `trPlanVal_`) | scalony (PR #104, v78) |
| 8 | Nowy układ (punkt 2 przeglądu v80, część 1 z 3): menu po lewej z listą klientów (komputer) / pasek u góry i menu na dole (telefon), ekran „Dziś” zamiast pulpitu (pasek liczb, „Dziś trenują” z `trDzis_`, „Wymaga uwagi”), „Więcej” na telefonie. Dalej: karta klienta + Plan, potem reszta ekranów; „Prowadź” w punkcie 3 przeglądu | zrobione (v81), zrzuty zaakceptowane 22.11, PR |
| 9 | „Prowadź trening” (punkt 3 przeglądu v80, część 1): z panelu „▶ Prowadź” (Dziś, karta klienta) otwiera aplikację klienta w trybie trenera (`?prowadz=<klient_id>`, bilet Google trenera zamiast klucza, `LIVE_FNS`); serie do Logu klienta, Sesje `prowadzil` = trener; notatka trenera przy ćwiczeniu „tylko ja” (`Log.notatka_trenera`) / „dla klienta” (`komentarz_trenera`) przez `liveNote`; „✎ zmień plan” (`trPlan` z `live`), „+ Ćwiczenie” i „Nowa jednostka” jako plan trenera (`Plan.zrodlo` = trener) | zrobione (v83), szkic zaakceptowany 22.11, PR |
| 5 | Asystent planu: karta klienta → Bloki → „Następny blok”: szkic AI całego bloku (`trBlokPlan`, `trPlanCtx_`, `trPlanPrev_`, `aiPlanReq_` ze structured outputs, `trPlanRows_` → `validatePlan_`), poprawki, „Wczytaj do planu” (`trBlokWczytaj` → plik w `_plany/` → `importPlanFile_`) | zrobione na gałęzi (v79) |

## Uruchomienie (raz, po scaleniu PR 1–2)

1. Google Cloud Console, projekt powiązany z kontem trenera: „Interfejsy API i usługi → Dane logowania → Utwórz → Identyfikator klienta OAuth → Aplikacja internetowa”. Autoryzowane źródło JavaScript: `https://likegreekgod.github.io`. Ekran zgody: typ zewnętrzny, wystarczy podstawowy zakres e-mail.
2. W arkuszu: menu „Trening → Ustaw panel trenera”: wklej identyfikator klienta (kończy się na `.apps.googleusercontent.com`) i adres Gmail trenera (kilka po przecinku).
3. Panel: `https://likegreekgod.github.io/trening/trener.html`.

## Szkic AI (raz, po scaleniu v56)

1. console.anthropic.com → Settings → API Keys → Create Key. Sprawdź w Billing, że konto ma środki (kredyt API jest osobny od subskrypcji claude.ai).
2. W arkuszu na komputerze: menu „Trening → Ustaw klucz Claude API” i wklej klucz (`sk-ant-…`). Na telefonie: edytor Apps Script → Ustawienia projektu → Właściwości skryptu → `CLAUDE_API_KEY`.
3. Opcjonalnie właściwość `AI_LIMIT` (domyślnie 30 szkiców dziennie).

Co idzie do AI (`trSzkicCtx_`): tryb i skala, jednostka (plan i wykonane serie bez rozgrzewki, pominięcia, zamiany, komentarze klienta, uwagi z planu), czas, RPE sesji, samopoczucie, ból z miejscem, uwagi do sesji, dyspozycja dnia, 3 poprzednie takie same jednostki, następna jednostka, 5 ostatnich komentarzy trenera do tej osoby. Bez imienia, klucza i linków do filmów. Model `claude-opus-5-5` (effort `low`, bez temperatury), awaryjny model przy odmowie (`fallbacks: "default"`). Szkic ok. 0,02–0,03 USD.

## Testy

`tests/trener.test.js` (Playwright): logowanie przez atrapę Google, pulpit, karta klienta, filmy, bloki, wygasły bilet, brak konfiguracji, komentarz do sesji ze szkicem AI (atrapa `trSzkic`, bez prawdziwego API); zrzuty 1440×900 i 390×844, jasny i ciemny motyw (`tests/screens/trener-*.png`, poza repo). Logika serwera: `tests/code.test.js` (`trTokenOk_`, rozdział akcji trenera i klientów w `doPost`, `trPulpit_`).
