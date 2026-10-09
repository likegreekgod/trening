# Decyzje projektowe

Repozytorium jest publiczne, dlatego w tym pliku nie ma imion klientów, danych zdrowotnych, adresów e-mail ani identyfikatorów arkusza i folderów Drive. Nowe ustalenia dopisuj na górze, z datą.

## 2026-10-09 · Plan wdrożenia v2, wdrażanie, historia klienta

Analiza i podział na PR-y: `docs/ui-v2-plan.md`.

- Kroki 5–7 zrobione: `Code.gs` w Apps Script przez clasp, `Plan.gs` usunięty, `PWA_URL`, setup, wyzwalacze, nowe linki; adres /exec w `web/config.js`; test na telefonie (instalacja, zapis serii, film, tryb samolotowy) zaliczony.
- Wdrażanie backendu: GitHub Action `apps-script.yml` po scaleniu zmian w `apps-script/**` do `main` (testy → `clasp push` → nowa wersja istniejącego wdrożenia). Sekrety `CLASPRC_JSON`, `SCRIPT_ID`, `DEPLOYMENT_ID`. Poprawki robione tylko w edytorze Apps Script przepadają przy następnym push (tak było z „plan bez dat”, przeniesione do repo).
- Bez sieci film nie trafia do kolejki (za duży do pamięci przeglądarki); w v2 czytelny komunikat zamiast „Błąd wgrywania”.
- Przyciski spoza specyfikacji zostają: „⇣ Jak 1. seria”, „+ Seria (N)”, „✓ Wszystko jak w planie”, ✕.
- FAIL przechodzi z listy RPE do pola ✓/✕, także w trybie PROSTY (ściągawka do poprawy).
- Ręczne pole VBT m/s znika z wiersza serii; wpis prędkości z urządzenia (np. Enode) w oknie kamery, zapis dalej do `vbt_ms`.
- Czyste funkcje v2 w `web/lib.js` (wyjątek od „index.html to jeden plik”), dopisane do cache `sw.js`, testowane w Node.
- Światła sędziowskie to luźne skojarzenie: tabela ocen bez zmian (Walka = 1 białe + 2 czerwone). Temat zamknięty.
- Daty w planie są wstępne i opcjonalne (puste = dziś). Klient może przesunąć niezrobioną jednostkę (`przesunJednostke`, zapis w Plan, offline przez kolejkę); po zmianie propozycja „przesuń też kolejne (o N dni)”. Zrobiona jednostka ma datę z Sesji i ta liczy się w podsumowaniu. Nowy plik planu nadpisuje przesunięcia.
- Historia klienta: ciągła numeracja tygodni u klienta (id serii bez zmian), opcjonalna kolumna Plan `blok` (w aplikacji „Blok N · tydz. M”). Wczytanie planu nie usuwa wykonanych jednostek, plik z tygodniem kolidującym z wykonanymi jednostkami innego bloku trafia do `_plany/bledy`.
- Nowa zakładka `Bloki` (klient × blok, liczona automatycznie: daty, wykonanie, tonaż, e1RM / najlepsze boje, rekordy, sRPE, samopoczucie, dyspozycja, ból, statusy) z kolumną `wnioski` trenera, zachowywaną przy przeliczaniu. Projekt claude.ai czyta `Bloki` przed nowym planem.

## 2026-10-09 · Interfejs v2 (rozmowa o redesignie)

Specyfikacja: `docs/ui-v2-spec.md`, prototyp: `docs/ui-v2-prototyp.html`.

- Research 20 aplikacji (Hevy, Strong, Fitbod, JEFIT, Alpha Progression, Boostcamp, RP Hypertrophy, Juggernaut AI, MacroFactor, TrainHeroic, TrueCoach, Everfit, WHOOP, Metric, Qwik VBT, WL Analysis, My Jump, Setgraph, Tindeq, openGym). Wnioski w raporcie w prototypie.
- v2 trafia do PWA (`web/`). Stary `apps-script/Index.html` bez zmian.
- Paleta bazowa: #edf4f2, #7c8363, #31473a. Dodane: tekst #5f6649 (oliwka #7c8363 ma 3,6:1, nie do tekstu), akcent miedź #a9542a (w ciemnym motywie bursztyn #e0a34a), statusy, motyw ciemny.
- Styl **Pomost** (protokół zawodów) zamiast zaokrąglonych kart: ostre rogi, linie, Big Shoulders Display + Instrument Sans + IBM Plex Mono (hostowane w `web/fonts/`).
- Rwanie i podrzut: ocena podejścia światłami (Łatwo 3B, Średnio 2B+1C, Walka 1B+2C, Spalone 3C) i propozycja ciężaru na kolejne serie, sufit dnia = plan + 5% 1RM, przy słabej dyspozycji = plan. Do decyzji: na pomoście 1B+2C oznacza „spalone”.
- Ćwiczenia zwykłe: tylko zrobione / nieudane (✓ / ✕) + RPE lub RIR.
- RPE i RIR wymienne (RIR = 10 − RPE), arkusz zapisuje zawsze RPE, skala to flaga klienta.
- Zamiana ćwiczenia z powodem (sprzęt zajęty, ból, brak sprzętu, inny), zapis oryginału w Log.
- Film do konkretnej serii; opcjonalna analiza ścieżki i VBT w przeglądarce (talerz 450 mm jako kalibracja). Walidacja z czujnikiem Enode.
- **Dyspozycja dnia** (zamiast „gotowość”): ankieta Hoopera, CMJ z filmu slow-mo (średnia z 3 skoków), prędkość na rozgrzewce.
- Z listy „do decyzji później” wchodzą do v2: timer przerwy, „Ostatnio: X kg × Y”.

## 2026-10-09 · Podsumowanie ustaleń (rozmowy 28.09–09.10.2026, przeniesienie prac do Claude Code)

### Cel

- Aplikacja dla klientów trenera: plan treningowy na telefonie i zapis wykonania (serie, RPE, filmy, ból, samopoczucie). Dane trafiają do arkusza Google trenera, filmy na jego Drive.
- Dla trenera: tygodniowe podsumowanie obciążenia ze statusem (za dużo / uwaga / OK / za lekko), także w wersji dla ciężarowców.
- Docelowo: aplikacja w Google Play i App Store.

### Architektura

Trzy warstwy:
- ekran: PWA w `web/`, hostowana na GitHub Pages;
- mózg: Google Apps Script `Code.gs`, powiązany z arkuszem i wystawiony jako web app /exec;
- magazyn: arkusz Google (Plan, Klienci, Log, Sesje, Import, Podsumowanie*) i Drive (filmy, plany JSON).

Komunikacja ekranu z mózgiem przez jedną funkcję `call()`: POST typu text/plain na /exec (bez preflight CORS), odpowiedź w JSON. Filmy wysyłane z telefonu bezpośrednio do Drive (sesja resumable), awaryjnie przez serwer w kawałkach 4 MB. Klucz klienta w linku (`?k=…`) to jedyne zabezpieczenie; PWA zapamiętuje go w telefonie, dezaktywacja w zakładce Klienci. Stary ekran (`apps-script/Index.html`, linki `/exec?k=`) zostaje na okres przejściowy i jest poprawiany tylko przy błędach.

### Repozytorium

- GitHub: `likegreekgod/trening`, publiczne, bo darmowe GitHub Pages tego wymagają. Dane klientów nie trafiają do repozytorium.
- Adres aplikacji: https://likegreekgod.github.io/trening/
- Struktura: `web/` (index.html, config.js, sw.js, manifest.json, icons), `apps-script/` (Code.gs, Index.html, appsscript.json), `tests/`, `tools/`, `plans/`, `.github/workflows/pages.yml`, `CLAUDE.md`, `README.md`, `package.json`.
- Wiedza dla Claude Code (architektura, schemat danych, konwencje, pułapki) jest w `CLAUDE.md`.

### Wdrażanie

- Ekran: przepis GitHub Actions publikuje wyłącznie folder `web/`; uruchamia się przy zmianach w `web/**`, ręcznie przez „Run workflow”. Źródło Pages: GitHub Actions (gotowe przepisy Jekyll i Static HTML odrzucone, bo publikowałyby całe repozytorium). Każda zmiana w `web/` wymaga podbicia `VERSION` w `sw.js`.
- Mózg: docelowo `clasp push` i `clasp deploy` do istniejącego wdrożenia (adres /exec się nie zmienia); do czasu konfiguracji clasp ręczne wklejenie, potem Wdróż → Nowa wersja; dostęp „Każdy”, wykonanie jako właściciel.
- Konfiguracja: właściwość skryptu `PWA_URL` (z niej `linki()` buduje linki klientów); adres /exec w `web/config.js`.
- Wyzwalacze (`instalujWyzwalacze`): podsumowanie codziennie ok. 5:00, wczytywanie planów co 15 min.

### Plany treningowe

- Tworzone w projekcie claude.ai i zapisywane jako JSON w folderze `Trening – Klienci/_plany/` na Drive (zapis przez konektor Drive sprawdzony).
- `wczytajPlany()`: waliduje plik, podmienia wiersze klientów z pliku, przenosi plik do `_plany/wczytane` albo `_plany/bledy`, zapisuje wynik w zakładce Import.
- Wklejanie `Plan.gs` jest wycofane. Plik `Plan.gs` trzeba usunąć z Apps Script, bo jego `PLAN_HEADERS` koliduje z `Code.gs`.
- Konwencje: % z max; kg zaokrąglane w dół do 2,5 kg; `rpe_max` to sufit; korekcja ma prio K; boje mają `dod_serie` = 0; u ciężarowców procent przy każdym ćwiczeniu specjalnym.
- Kolumny data, powt i kg muszą mieć format tekstowy ustawiony przed zapisem, bo inaczej „6-8” zamienia się w datę.

### Dane: rozszerzenia

- Klienci: F `bol` (TAK = kolano i bark zawsze zaznaczone); G `tryb` (PROSTY/PRO); H `dod_serie` (domyślny limit dodatkowych serii); I `masters` (ostrzejsze progi).
- Plan: opcjonalne kolumny `dod_serie`, `drop`, `grupa` (R/P/CR/CP/PS/I).
- Log: seria 1…n robocze, n+1… dodatkowe, R1… rozgrzewka, D1… drop; typ DROP, FAIL, DROP+FAIL.
- Sesje: `bol` („miejsce:0–10; …”), `bol_max`, `rpe_sesji` (CR-10). Kolumny `bol_kolano` i `bol_bark` wypełniane dalej dla zgodności.
- Zasada: nowe kolumny wyłącznie na końcu nagłówków, format id bez zmian.

### Funkcje aplikacji (zrealizowane)

- Tryb prosty: „jak ciężko?” zamiast RPE (zapis RPE 6 / 7,5 / 9 / 10); recepta słownie i podpowiedź RIR; „Wszystko jak w planie”; ściągawka przy pierwszym uruchomieniu.
- Serie: „+ Rozgrzewka”, „⇣ Jak 1. seria”, „+ Seria (N)” (tylko za zgodą trenera), „+ Drop” (~80% ciężaru, w dół do 2,5 kg); ✕ usuwa ostatni dodany wiersz w dwóch dotknięciach; „✗ Fail” w liście RPE.
- Kompleksy: „2+1” liczone jako 3 powtórzenia (UI i podsumowanie).
- Podsumowanie jednostki: RPE sesji 0–10, samopoczucie 1–5, ból 0–10 z wyborem miejsca, dużymi przyciskami.
- Dostępność: odblokowany zoom, cele dotyku ≥ 44 px, większe etykiety, automatyczny jasny motyw.
- Offline: ostatnie dane w pamięci telefonu, kolejka zapisów bez sieci, service worker trzyma pliki aplikacji.

### Podsumowanie i metodyka (arkusz)

- sRPE-TL = RPE sesji × minuty [AU] (Foster).
- ACWR uncoupled = tydzień ÷ średnia z 4 poprzednich, liczony od 3 tygodni historii. Monotonia i strain.
- e1RM z RPE, bez rwania i podrzutu.
- Podsumowanie_OLY: NL dla grup i stref intensywności (≤60 / 61–70 / 71–80 / 81–90 / 91–100 / >100%); skuteczność ≥ 85% i spalone < 85%; zmiana prędkości VBT w strefie 80–90%.
- Statusy: progi masters ostrzejsze. Tydzień z planowanym tonażem niższym o ≥ 25% to deload i nie jest flagowany jako „za lekko”. Statusy to flagi do decyzji trenera, a nie diagnoza.

### Podział pracy

- Claude Code / VS Code: kod aplikacji, testy, wdrożenia.
- Projekt claude.ai: plany treningowe, analiza Logu i podsumowań, decyzje treningowe.

### Stan na 09.10.2026

- Zrobione: kopia zapasowa arkusza; repozytorium z kompletem plików; Pages włączone; pierwsza publikacja przez Actions zakończona sukcesem; testy w repozytorium (9) przechodzą.
- Niezrobione: krok 5 (podmiana Code.gs, usunięcie Plan.gs, PWA_URL, setup, wyzwalacze, linki, nowe wdrożenie), krok 6 (adres /exec w config.js), krok 7 (test na telefonie i nowe linki dla klientów).

### Odrzucone i dlaczego

- Zmiany UI pod konkretnego klienta: Index jest wspólny; różnice flagami w zakładce Klienci i kolumnami planu.
- ACWR w wariancie EWMA: przy 3 jednostkach w tygodniu zbyt tłumiony (podwojone obciążenie dało ~1,15).
- e1RM z RPE dla rwania i podrzutu: boje ogranicza technika, a nie zapas powtórzeń.
- FAIL > 10% jako czerwona flaga dla bojów: spalone próby > 90% są normalne; zamiast tego flagujemy spalone < 85%.
- Suwaki samopoczucia i bólu: zastąpione przyciskami (dostępność, precyzja na telefonie).
- Opakowanie APK wokół strony Apps Script: baner Google, brak pracy offline, słabe doświadczenie.
- Natywna aplikacja od zera (React Native/Flutter): duży nakład bez zysku przy obecnej skali; wybrany Capacitor na istniejącym `web/`.
- Repozytorium prywatne i własna domena: Pages dla prywatnych repozytoriów są płatne; wybrane GitHub Pages pod github.io.
- Odczyt czujnika Enode przez rozpracowanie protokołu Bluetooth: ryzyko naruszenia regulaminu i kruchość przy aktualizacjach oprogramowania czujnika.

### Plan dalszego rozwoju

- Sklepy: najpierw Android, potem iOS. Capacitor na tym samym `web/` z natywnymi dodatkami: przypomnienia o treningu, powiadomienie timera przerwy, nagrywanie z aplikacji, logowanie kodem.
- Google Play: 25 USD jednorazowo; zamknięte testy ≥ 12 testerów przez 14 dni (testerami mogą być klienci).
- App Store: 99 USD rocznie; do budowania Mac albo usługa w chmurze; Apple wymaga funkcji natywnych (wytyczna 4.2); do rozważenia dystrybucja niepubliczna (Unlisted).
- Obie platformy: polityka prywatności i deklaracja danych o zdrowiu (ból).
- VBT i ścieżka sztangi z wideo: v1 po stronie trenera (Python/OpenCV na filmach z Drive: śledzenie talerza, kalibracja 450 mm, ścieżka, prędkości, fazy, przycięcie słabego fragmentu); v2 w aplikacji jako zamiennik WL Analysis dla klientów (wczesna wersja w prototypie v2).

### Otwarte zadania

- ~~Kroki 5–7~~ zrobione 09.10.2026 (wpis na górze). Do zrobienia: wysłać klientom nowe linki z kolumny E.
- ~~Konfiguracja clasp~~ zrobiona 09.10.2026 (GitHub Action `apps-script.yml`).
- Sprawdzić, czy dotychczasowe plany miały ciągłą numerację tygodni u klienta (ryzyko nadpisania Logu przy bloku zaczynającym się od tygodnia 1).
- v2 według `docs/ui-v2-plan.md`, zaczynając od PR 1 (backend).
- W zakładce Klienci ustawić masters = TAK tam, gdzie dotyczy.
- Grupowanie tygodni w podsumowaniu: z daty z planu na faktyczną datę treningu (jednostki bywają przesuwane). W v2 PR 1 (data z Sesji dla zrobionych jednostek).
- Zaktualizować wersje akcji w `pages.yml` (ostrzeżenie o wycofaniu Node.js 20).
- Zaktualizować skill trenerski: folder `_plany` zamiast Plan.gs, nowy podział pracy; kolumna `blok`, ciągła numeracja tygodni, daty opcjonalne, czytanie zakładki `Bloki`.
- Sprawdzić eksport danych w aplikacji Enode i zapytać producenta o API dla partnerów.
- Prototyp v1 analizy ścieżki sztangi na jednym filmie bocznym (najlepiej z równoległym pomiarem Enode).
- Do decyzji później: kolumna partia (serie twarde na grupę mięśniową), alert mailowy (ból > 3/10, ≥ 2 FAIL), link do instruktażu przy ćwiczeniu, deload z planu zamiast „Tydz. 6” na sztywno.
- Sklepy: konto Google Play Console, Capacitor, zamknięte testy; potem konto Apple Developer i ścieżka budowania iOS.
- Poprawić literówkę w opisie repozytorium („obtaine”).
