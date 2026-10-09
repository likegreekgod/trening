# Aplikacja Treningowa v2 – specyfikacja UI

Wzorzec wizualny i działający kod komponentów: `ui-v2-prototyp.html` (prototyp na danych przykładowych).
Docelowy styl: **Pomost** (przełącznik „Styl” w prototypie; wariant „Obecny” jest tylko do porównania i nie wchodzi do aplikacji).

## Zasady wdrożenia

- Cel: **PWA w `web/`** (`web/index.html`, hostowana na GitHub Pages). Stary ekran `apps-script/Index.html` zostaje bez zmian (tylko poprawki błędów w okresie przejściowym).
- Komunikacja z backendem wyłącznie przez istniejącą funkcję `call()` (POST text/plain na /exec, odpowiedź JSON). Nowe zapisy to nowe akcje `call()` w `apps-script/Code.gs`, nie `google.script.run`.
- Różnice między klientami tylko flagami z zakładki Klienci, zwracanymi w danych startowych.
- Nie zmieniać logiki zapisu: format id serii, typy R/D/FAIL, kolejka zapisów offline, wysyłka filmów na Drive (resumable + awaryjnie 4 MB), tryby PROSTY i PRO.
- Nowe kolumny wyłącznie na końcu nagłówków, format id bez zmian.
- Każda zmiana w `web/` = podbicie `VERSION` w `web/sw.js`.
- Czcionki hostowane lokalnie w `web/fonts/` (woff2, licencja OFL) i dopisane do cache service workera, żeby działały offline. Bez linku do Google Fonts.
- Kolory wyłącznie przez zmienne CSS w `:root`, jasny i ciemny motyw przez `prefers-color-scheme`. Zoom odblokowany, cele dotyku ≥ 44 px, etykiety ≥ 12 px.
- Repozytorium jest publiczne: żadnych danych klientów, identyfikatorów arkusza ani folderów w kodzie, testach i zrzutach (tylko dane syntetyczne).
- Testy: istniejące testy w `tests/` muszą przechodzić; nowe testy dla czystych funkcji (`sugOly`, `verdict`, `analyse`, przeliczenie RPE/RIR); Playwright z atrapą `call()`/`fetch`, zrzuty 390×844 jasny/ciemny, tryby PROSTY i PRO, tryb offline.

## Paleta (tokeny)

| Token | Jasny | Ciemny | Rola |
|---|---|---|---|
| --bg | #edf4f2 | #0f1612 | tło |
| --surface | #ffffff | #18221c | powierzchnie |
| --surface-2 | #e1eae6 | #223029 | pola, tła pomocnicze |
| --line | #c9d4cf | #2f3f36 | linie |
| --ink | #17221c | #edf4f2 | tekst |
| --ink-2 | #31473a | #cfdcd5 | nagłówki |
| --muted | #5f6649 | #a3ab86 | tekst pomocniczy |
| --olive | #7c8363 | #7c8363 | ikony, linie, wykresy (nie tekst: 3,6:1) |
| --primary / --on-primary | #31473a / #fff | #c5cfa9 / #0f1612 | przyciski |
| --accent / --on-accent | #a9542a / #fff | #e0a34a / #0f1612 | akcja, timer, PR |
| --ok / --warn / --bad | #296c45 / #8f5d0e / #b5483b | #62b07a / #e0a34a / #e3826b | statusy |
| --panel, --light-off, --light-white, --light-red, --light-amber | #17221c, #38443d, #f7f7f2, #e5392d, #f0b54f | #050806, #26302a, (bez zmian) | światła sędziowskie, timer |
| --p25 --p20 --p15 --p10 --p5 | #c8372d #2a5ea8 #d9ad1f #3f8a4a #f4f4f0 | | kolory talerzy (strefy %, kalkulator talerzy) |

## Typografia

Google Fonts: Big Shoulders Display 600/700/800 (nagłówki, wersaliki, liczby w seriach i timerze), Instrument Sans 400/500/600 (tekst), IBM Plex Mono 400/500 (liczby w tabelach).

## Styl Pomost

- Ostre rogi 2 px, cienkie linie zamiast kart. Ćwiczenie to sekcja z linią 2 px nad nazwą, serie to wiersze tabeli z linią 1 px.
- Zakładki i przełączniki podkreślone akcentem, bez pigułek.
- Timer przerwy: ciemny pasek na całą szerokość nad dolnym menu, bursztynowe cyfry.
- Przy recepcie mały kwadrat w kolorze talerza: ≤60% biały, 61–70% zielony, 71–80% żółty, 81–90% niebieski, >90% czerwony.

## Ekran treningu

- Nagłówek: tydzień · jednostka · data, czas treningu, serie zrobione/wszystkie, tonaż, przełącznik RPE/RIR.
- Baner dyspozycji dnia (kolor + zalecenie), dotknięcie przenosi do ekranu Dyspozycja.
- Ćwiczenie: priorytet A/B/K, nazwa, recepta, „Ostatnio: kg × powt. · ocena/RPE”, notatka trenera (kolumna uwagi), przycisk zamiany.
- Wiersz serii (ćwiczenia zwykłe): numer/typ | kg | powt. | RPE lub RIR | pole odhaczenia | kamera.
  - Pole odhaczenia: puste z obwódką → zielone ✓ (zrobione) → czerwone ✕ (FAIL, ciężar i powt. przekreślone).
  - Dotknięcie numeru serii: zwykła → drop → nieudana.
- Wiersz serii (rwanie, podrzut: grupa R i P): numer | kg | powt. | światła sędziowskie | kamera. Dotknięcie świateł otwiera wybór oceny pod wierszem.
- Po zaliczeniu serii startuje timer przerwy: A 2:00, B 1:30, K 1:00 (docelowo kolumna planu), przyciski −15 / +15 / Pomiń. Wake Lock w trakcie treningu.
- Przyciski pod seriami: + Rozgrzewka, + Drop, Talerze (kalkulator talerzy na stronę, gryf 20/15 kg, zamki 2 × 2,5 kg).

## Ocena podejścia w bojach

| Ocena | Światła | Zapis do Log | Propozycja na kolejne serie |
|---|---|---|---|
| Łatwo | 3 białe | rpe 7, ocena L | +2,5 kg, jeśli ≤ sufit dnia |
| Średnio | 2 białe, 1 czerwone | rpe 8, ocena S | zostań |
| Walka | 1 białe, 2 czerwone | rpe 9,5, ocena W | zostań; druga walka z rzędu: −2,5 kg |
| Spalone | 3 czerwone | typ FAIL, rpe puste, ocena X | powtórz; 2 spalone na tym samym ciężarze: −5% 1RM (w dół do 2,5 kg) |

- Sufit dnia = floor_2,5(1RM × (procent + sufit_oly)); sufit_oly domyślnie 0,05. Przy dyspozycji „uwaga” lub „zmęczenie” sufit = ciężar z planu.
- Propozycja tylko pod ostatnio ocenionym podejściem i tylko gdy zostały niezrobione serie. Przycisk „Ustaw X kg” zmienia ciężar wszystkich pozostałych serii tego ćwiczenia.
- W recepcie boi zamiast „RPE ≤ x” pokazuj „max dziś X kg”.
- Ocena trafia do rpe/FAIL, więc Podsumowanie_OLY liczy się bez zmian.

## RPE / RIR

RIR = 10 − RPE (Zourdos i in. 2016). Arkusz zawsze zapisuje RPE. Widok zależy od flagi klienta `skala` (RPE/RIR), przełącznik w nagłówku dla podglądu.
- RIR: opcje 0, 1, 2, 3, 4, 5+ (= RPE 10…5); recepta „RIR ≥ ceil(10 − rpe_max)”.
- Tryb PROSTY bez zmian (Lekko/Średnio/Ciężko/Max).

## Zamiana ćwiczenia

Zamienniki z kolumny planu (plik JSON planu w `_plany/`, przez `wczytajPlany()`) `zamienniki` (nazwy rozdzielone „;”), a gdy pusta, z listy dla grupy ruchu. Klient wybiera powód: Sprzęt zajęty / Ból / Brak sprzętu / Inny powód (przy „Ból” podpowiedź o ocenie bólu). Zapis w Log: `zamiana` = „oryginał → zamiennik | powód”. Dostępne tylko gdy flaga klienta `zamiana` = TAK.

## Film, ścieżka i VBT

- Kamera przy każdej serii (robocza, dodatkowa, D). Tryb „Tylko film” (obecna wysyłka na Drive) albo „Film + ścieżka + VBT”.
- Analiza w przeglądarce (kod `track()` i `analyse()` z prototypu). To wczesna wersja „v2 w aplikacji” z planu; v1 po stronie trenera (Python/OpenCV) pozostaje w planie. Walidacja: ten sam film porównany z pomiarem czujnika Enode: klient przesuwa suwak do startu, dotyka środka talerza, potem krawędzi (talerz 450 mm = kalibracja). Śledzenie SAD na zmniejszonym obrazie, co 1/30 s.
- Wynik: R/P → v max [m/s] i uniesienie [cm], ścieżka do momentu wejścia pod sztangę; pozostałe → MCV najlepsze [m/s], spadek prędkości w serii [%], tabela powtórzeń, ścieżka (poziom ×2).
- Zapis do Log: `vbt_ms` (MCV lub v max), `vbt_peak`, `wysokosc_cm`, `sciezka` (punkty co 2 klatki w cm, JSON).
- Dokładność sprawdzona tylko na filmie syntetycznym (±0,03–0,04 m/s); do porównania z urządzeniem VBT.

## Dyspozycja dnia

Ekran przed treningiem (ok. 3 min), werdykt: Dobra dyspozycja / Uwaga / Zmęczenie, z listą powodów.
- Ankieta Hoopera: sen, stres, zmęczenie, bolesność mięśni, 1–7. Suma vs średnia z 7 ostatnich: +4 uwaga, +7 czerwony.
- CMJ: 3 skoki (cm ręcznie albo z filmu slow-mo: zaznaczenie wybicia i lądowania, h = 1,22625·t²), liczy się średnia. Vs średnia z 5 testów: −5% uwaga, −10% czerwony.
- Prędkość na rozgrzewce: stały ciężar i ćwiczenie. Vs średnia: −0,05 m/s uwaga, −0,10 czerwony.
- Werdykt: ≥2 czerwone albo czerwony + pomarańczowy → Zmęczenie; 1 sygnał → Uwaga; brak → Dobra dyspozycja.
- Zapis: nowa zakładka `Dyspozycja`, akcja `call('saveDyspozycja', dane)`: data, cmj1–3, cmj_sr, hooper (4 wartości + suma), vbt_test, werdykt, powody.

## Plan i Postęp

- Plan: przełącznik tygodni bloku (deload „lżejszy”), pasek dni z kropkami (zaplanowane/zrobione/dziś), lista jednostek z rozwijaną listą ćwiczeń, przycisk „Przejdź do treningu”.
- Postęp: Siła (R/P: najlepsze zaliczone kg; pozostałe: e1RM = kg × (1 + (powt + RIR)/30)), rekordy; Objętość (tonaż tygodniowy, boje w strefach %, kalendarz obciążenia 12 tyg.); Dyspozycja (CMJ ze średnią ±5%, prędkość na rozgrzewce).

## Zmiany w arkuszu

- Klienci: nowe kolumny `zamiana` (TAK/NIE), `skala` (RPE/RIR), `sufit_oly` (ułamek, domyślnie 0,05).
- Plan: opcjonalna kolumna `zamienniki`.
- Log: `ocena`, `vbt_peak`, `wysokosc_cm`, `sciezka`, `zamiana` (dodają się przy pierwszym zapisie).
- Nowa zakładka `Dyspozycja`.

## Wdrażanie

Bez zmian względem `CLAUDE.md`: `web/` publikuje GitHub Actions (pages.yml), backend przez clasp push + deploy do istniejącego wdrożenia (do czasu konfiguracji clasp: ręcznie, Wdróż → Nowa wersja).
