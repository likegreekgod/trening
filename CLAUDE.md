# Trening – aplikacja dla klientów Damiana

Aplikacja, w której klienci trenera personalnego (ciężary, siła, sylwetka) widzą plan i zapisują wykonanie: serie, RPE, filmy, ból i samopoczucie. Dane trafiają do Arkusza Google Damiana, filmy na jego Google Drive. Arkusz liczy tygodniowe podsumowanie obciążenia ze statusem (za dużo / uwaga / OK / za lekko).

Rozmawiaj z Damianem po polsku, zwięźle. Interfejs aplikacji jest po polsku.

## Dokumenty

- `docs/decyzje.md`: ustalenia projektowe, odrzucone pomysły, otwarte zadania. Nowe ustalenia dopisuj **na górze**, z datą. Przed propozycją zmiany sprawdź „Odrzucone i dlaczego”.
- `docs/ui-v2-spec.md`: specyfikacja interfejsu v2 (obowiązująca przy pracy nad v2).
- `docs/ui-v2-prototyp.html`: prototyp v2 na danych przykładowych, wzorzec wyglądu i kod komponentów (`track()`, `analyse()`, `sugOly`, `verdict`). Docelowy styl: **Pomost**; wariant „Obecny” służy tylko do porównania.
- `docs/ui-v2-plan.md`: kolizje `web/` ze specyfikacją i podział v2 na PR-y. Pracuj w tej kolejności; po każdym PR zaktualizuj plik.

## Architektura

```
web/  (PWA, GitHub Pages)  ──fetch POST text/plain──▶  apps-script/Code.gs (web app /exec, doPost)
  index.html                                           │
  config.js  (API_URL)                                  ├─▶ Arkusz: Plan, Klienci, Log, Sesje, Import, Podsumowanie*
  sw.js      (offline)                                  └─▶ Drive: „Trening – Klienci/<Imię>/<data>_<jednostka>/” (filmy)
  manifest.json, icons/                                       „Trening – Klienci/_plany/” (plany JSON → wczytajPlany)
Filmy: telefon → Drive bezpośrednio (sesja resumable otwierana przez startUpload z nagłówkiem Origin),
       awaryjnie przez serwer w kawałkach 4 MB (uploadChunk).
```

- `web/index.html` to jeden plik (HTML + CSS + JS), bez bundlera i frameworka; czyste funkcje (bez DOM) są w `web/lib.js` (`window.TL`, testy `tests/lib.test.js`), czcionki w `web/fonts/`. Cała komunikacja z serwerem idzie przez funkcję `call(fn, ...args)`.
- `apps-script/Code.gs` jest powiązany z arkuszem `Trening – Aplikacja (dane)` (konto trenera, właściciel arkusza; `clasp login` musi być na tym samym koncie). API: `doPost` → `API_FNS` (getData, logSet, logSession, deleteSet, startUpload, uploadChunk, saveDyspozycja, przesunJednostke). Pierwszym argumentem każdej funkcji jest klucz klienta.
- `apps-script/Index.html` to stara wersja działająca przez `doGet` i `google.script.run` (linki `/exec?k=`). Zostaje na okres przejściowy. Nowe funkcje rób w `web/index.html`; starą wersję poprawiaj tylko przy błędach.
- Klucz klienta w linku (`?k=k` + 11 znaków hex) jest jedynym zabezpieczeniem. PWA zapamiętuje go w `localStorage` („key”).
- Nowe zapisy to nowe akcje w `API_FNS` wywoływane przez `call()` (np. `saveDyspozycja`), nigdy `google.script.run`.

## Polecenia

```bash
npm test                         # testy Node (Code.gs w piaskownicy, web/lib.js) + UI w Playwright z atrapą API; zrzuty w tests/screens/
npm run test:code                # tylko logika serwera
node tools/validate-plan.js plans/x.json   # sprawdzenie planu przed wrzuceniem na Drive
npm run serve                    # podgląd web/ na http://localhost:8080 (API z config.js)
npm run gas:push                 # clasp push → Apps Script (pliki z apps-script/)
DEPLOYMENT_ID=… npm run gas:deploy   # nowa wersja istniejącego wdrożenia (URL /exec bez zmian)
git push                         # zmiany w web/ → GitHub Actions → GitHub Pages
```

Każda zmiana w `web/` wymaga podbicia `VERSION` w `web/sw.js`, bo inaczej telefony mogą trzymać starą wersję.
Każda zmiana w `Code.gs` wymaga `gas:push` i `gas:deploy`. Bez deploy telefon dalej rozmawia ze starą wersją API.
Robi to automatycznie `.github/workflows/apps-script.yml` po scaleniu zmian w `apps-script/**` do `main` (testy → `clasp push` → nowa wersja istniejącego wdrożenia). Sekrety repozytorium: `CLASPRC_JSON`, `SCRIPT_ID`, `DEPLOYMENT_ID`. `clasp push` zastępuje cały projekt Apps Script plikami z `apps-script/`, więc poprawki zrobione tylko w edytorze Apps Script przepadną: najpierw przenieś je do repo.

## Dane (arkusz)

**Plan** (PLAN_HEADERS w Code.gs): klient, tydzien, jednostka, tytul, data (RRRR-MM-DD, tekst; opcjonalna = wstępna, klient może przesunąć), nr, cwiczenie, prio (A/B/K), serie, powt (tekst: „8”, „6-8”, „8/str”, „1+1”), procent (ułamek), kg (liczba lub tekst: BW, guma), rpe_max, uwagi, dod_serie, drop, grupa (R/P/CR/CP/PS/I), zamienniki („;”), blok (np. B2).
Kolumny E (data), J (powt) i L (kg) muszą mieć format `@` ustawiony PRZED zapisem, bo inaczej Arkusze zamienią „6-8” w datę.
Tygodnie u klienta numeruj **ciągle** między blokami (blok 2 od tyg. 7): id serii nie zawiera bloku, więc powtórzony numer tygodnia nadpisałby Log.

**Klienci**: A klucz, B klient_id, C imie, D aktywny (TAK/NIE), E link, F bol (TAK), G tryb (PROSTY/PRO), H dod_serie, I masters (TAK), J zamiana (TAK/NIE), K skala (RPE/RIR), L sufit_oly (ułamek lub %, domyślnie 0,05). `getData` zwraca je w `cfg` jako `swap`, `scale`, `olyCeil`.

**Log**: id = klient|tydzien|jednostka|nr|seria (upsert), zapisano, klient, tydzien, jednostka, data, nr_cw, cwiczenie, seria, kg, powt, rpe, vbt_ms, wykonane, film_link, uwagi, typ, ocena (L/S/W/X), vbt_peak, wysokosc_cm, sciezka (JSON), zamiana („oryginał → zamiennik | powód”).
Wartości `seria`: 1…n robocze, n+1… dodatkowe, R1… rozgrzewka, D1… drop set. Wartości `typ`: DROP / FAIL / DROP+FAIL.
`logSet` przyjmuje pola v2: `ocena`, `vbtPeak`, `height`, `path`, `swap` (brak = puste, stara aplikacja działa bez zmian).

**Sesje**: id = klient|tydzien|jednostka, …, samopoczucie (1–5), czas_min, uwagi, start, koniec, bol („miejsce:0–10; …”), bol_max, rpe_sesji (0–10, CR-10).
Kolumna `data` w Sesjach to data z planu; faktyczny dzień treningu to `start` (`unitDates_`) i według niego podsumowanie grupuje tygodnie.

**Dyspozycja**: id = klient|data (jeden wpis dziennie), zapisano, klient, data, cmj1–3, cmj_sr, sen, stres, zmeczenie, bolesnosc, hooper_suma, vbt_test, werdykt, powody. Zapis: `saveDyspozycja`; `getData` zwraca `readiness`.

**Bloki** (liczone w `podsumowanie`, `computeBlocks_`): klient × blok, daty, tygodnie, jednostki, wykonanie, tonaż, zmiana e1RM, najlepsze boje, sRPE, samopoczucie, dyspozycja, ból, statusy, **wnioski** (wpisuje trener; `keepNotes_` zachowuje je przy przeliczaniu).

Zasady zgodności:
- Nowe kolumny Log i Sesje dopisuj tylko **na końcu** nagłówków. `sheet_()` sam uzupełnia nagłówek w istniejącym arkuszu.
- Nie zmieniaj formatu `id`.
- Stare kolumny (bol_kolano, bol_bark) wypełniaj dalej.

Zmiany w arkuszu z v2 (`docs/ui-v2-spec.md`, „Zmiany w arkuszu”) są już w Code.gs (PR 1 v2); korzysta z nich interfejs w kolejnych PR-ach.
Arkusz zawsze zapisuje RPE (RIR = 10 − RPE to tylko widok). Ocena podejścia w bojach trafia do `rpe`/`typ`, więc Podsumowanie_OLY liczy się bez zmian.

## Plany treningowe

Plany tworzy Claude w projekcie claude.ai („Trener personalny (OLY)”) i zapisuje je jako JSON do `Trening – Klienci/_plany/` na Drive.
`wczytajPlany()` działa z wyzwalacza co 15 min albo z menu „Trening”. Kolejno: waliduje plik (`validatePlan_`), podmienia wiersze klientów z pliku (`mergePlan_`: jednostki zrobione zostają; zrobiona jednostka z innym blokiem w pliku = błąd), przenosi plik do `_plany/wczytane` albo `_plany/bledy` i zapisuje wynik w zakładce Import.
Konwencje Damiana:
- % z max;
- kg zaokrąglane **w dół** do 2,5 kg;
- rpe_max to sufit;
- ćwiczenia korekcyjne mają prio K;
- boje mają dod_serie = 0;
- u ciężarowców procent wpisany przy każdym ćwiczeniu specjalnym.

## Interfejs (web/index.html)

- `Index.html` jest wspólny dla wszystkich klientów. Różnice między klientami robi się przez `cfg` z getData (pain, simple, extra) albo przez kolumny planu, **nigdy** przez warunki na konkretne imię.
- Tryb prosty (`SIMPLE`):
  - „jak ciężko?”: Lekko / Średnio / Ciężko / Max, zapisywane jako RPE 6 / 7,5 / 9 / 10;
  - „✓ Wszystko jak w planie”;
  - podpowiedź RIR;
  - ukryte VBT i %.
- Serie:
  - dodatkowe przyciski „+ Rozgrzewka”, „⇣ Jak 1. seria”, „+ Seria (N)” i „+ Drop” (~80% ciężaru, w dół do 2,5 kg);
  - ✕ usuwa ostatni dodany wiersz w dwóch dotknięciach;
  - pole odhaczenia (`data-st`): puste → ✓ zrobiona → ✕ nieudana (typ FAIL, rpe puste) → puste; żółte (`pend`) = czeka w kolejce;
  - dotknięcie numeru serii roboczej/dodatkowej: zwykła → drop (typ DROP) → nieudana;
  - zmiana kg/powt./RPE w zapisanej serii zapisuje ją od razu;
  - PRO: lista RPE albo RIR (0…5+) wg `cfg.scale` i przełącznika w nagłówku (`sc_<klucz>`); zapis zawsze w RPE;
  - recepta: kwadrat w kolorze talerza wg % 1RM, „RIR ≥ n” przy skali RIR; „Ostatnio: kg × powt. · RPE” z poprzedniej jednostki (`lastTop`).
  - po zaliczeniu serii (✓/✕, nie rozgrzewka) timer przerwy nad dolnym menu: A 2:00, B 1:30, K 1:00 (`restSec`), −15 / +15 / Pomiń, wibracja na koniec;
  - Wake Lock od pierwszego wpisu do „Zakończ” (ponownie po powrocie do aplikacji);
  - „Talerze”: okno `#sheet` z rozkładem na stronę (`plates`), gryf 20/15 kg i zamki 2 × 2,5 kg zapamiętane w `pl_<klucz>`.
- Podsumowanie jednostki:
  - RPE sesji 0–10;
  - samopoczucie 1–5;
  - ból 0–10 per miejsce;
  - wszystko dużymi przyciskami.
- Ekrany z dolnego menu (`TAB`): Trening (nagłówek: tydzień/blok · jednostka · data, czas, serie, tonaż) i Plan (tygodnie, dni z kropkami, jednostki, „Przejdź do treningu”, „Zmień datę” → `przesunJednostke` + propozycja „przesuń też kolejne”). Dyspozycja i Postęp dojdą w PR 10–11.
- Offline:
  - ostatnie getData leży w `localStorage` (`d_<klucz>`);
  - zapisy bez sieci trafiają do kolejki `q_<klucz>` i wysyłają się po powrocie połączenia; `useData` nakłada niewysłane zapisy z kolejki (serie, przesunięcia dat) na dane z serwera;
  - `sw.js` trzyma pliki aplikacji w pamięci telefonu.
- Dostępność:
  - bez `maximum-scale`;
  - cele dotyku ≥ 44 px;
  - kolory tylko przez zmienne w `:root`;
  - jasny motyw przez `prefers-color-scheme`.

### Zasady v2

- v2 powstaje w `web/`. `apps-script/Index.html` zostaje bez zmian (tylko poprawki błędów).
- Styl Pomost: ostre rogi 2 px, linie zamiast kart, zakładki podkreślone akcentem. Tokeny kolorów z tabeli w specyfikacji, jasny i ciemny motyw przez `prefers-color-scheme`.
- Etykiety ≥ 12 px (obok zasad dostępności wyżej).
- Czcionki (Big Shoulders Display, Instrument Sans, IBM Plex Mono) jako woff2 w `web/fonts/` (licencja OFL), dopisane do cache w `sw.js`. Bez linku do Google Fonts; to jedyny wyjątek od zasady „wszystko inline”.
- Różnice między klientami tylko flagami z zakładki Klienci (`zamiana`, `skala`, `sufit_oly`) zwracanymi w `cfg` z getData.
- Nie zmieniaj logiki zapisu: format id serii, typy serii (R/D/FAIL), kolejka offline, wysyłka filmów na Drive (resumable + 4 MB), tryby PROSTY i PRO.
- Czyste funkcje z prototypu (`sugOly`, `verdict`, `analyse`, przeliczenie RPE/RIR) wydzielaj tak, żeby dało się je testować w Node.

## Podsumowanie (Code.gs, sekcja PODSUMOWANIE)

`computeSummary_(plan, log, ses, klienci)` to czysta funkcja, testowana w `tests/code.test.js`. Liczy trzy zakładki:
- **Podsumowanie** (klient × tydzień): sRPE-TL, ACWR uncoupled (tydzień ÷ średnia 4 poprzednich), monotonia, e1RM (bez R i P), serie twarde, fail_% bez bojów, status i powody;
- **Podsumowanie_cw**: to samo per ćwiczenie;
- **Podsumowanie_OLY**: NL per grupa i strefa intensywności, skuteczność ≥ 85%, spalone < 85%, VBT 80–90%.

Progi i reguły statusu opisuje komentarz nagłówka sekcji. Dla mastersa progi są ostrzejsze.
Przy zmianie reguł dopisz scenariusz testowy (syntetyczne tygodnie) i sprawdź, czy dotychczasowe testy przechodzą.

## Testy i jakość

- `npm test` musi przechodzić przed każdym commitem.
- Przy zmianach UI:
  - sprawdź oba tryby (PROSTY i PRO) i oba motywy;
  - przejrzyj zrzuty 390×844 w `tests/screens/` (PROSTY/PRO × jasny/ciemny; tworzy je `npm test`, poza repo);
  - sprawdź payloady wysyłane do API.
- Nie dodawaj zależności do `web/`: wszystko inline, bez CDN, bo aplikacja musi działać offline.
- v2: testy jednostkowe dla `sugOly`, `verdict`, `analyse` i przeliczenia RPE/RIR; Playwright z atrapą `call()`/`fetch`, zrzuty 390×844 w jasnym i ciemnym motywie, tryby PROSTY i PRO, tryb offline.

## Znane pułapki

| Objaw | Przyczyna / rozwiązanie |
|---|---|
| „6-8” wyświetla się jako data | Brak formatu `@` przed zapisem. `txt_()` w getData odtwarza zakres. |
| Zmiana w Code.gs nie działa na telefonie | Brak `clasp deploy` (nowej wersji wdrożenia). |
| Zmiana w web/ nie dociera | Nie podbito `VERSION` w sw.js albo Actions jeszcze nie skończył. |
| CORS / „Failed to fetch” | Zapytanie musi być POST text/plain (bez własnych nagłówków), a wdrożenie ustawione na „Każdy” (ANYONE_ANONYMOUS). |
| Kompleks „1+1” liczony jako 1 | `repsDefault` (web) / `repsOf_` (Code) sumują części. |
| ACWR puste | Potrzeba ≥ 3 tygodni z wypełnionym rpe_sesji. |

## RODO

Filmy i dane o bólu to dane osobowe, w tym dane o zdrowiu. Arkusz i foldery są prywatne. Repozytorium jest publiczne, więc nie commituj danych klientów, kluczy, eksportów arkusza ani `.clasp.json`.
Dotyczy to też identyfikatorów arkusza i folderów Drive oraz zrzutów ekranu: w kodzie, testach i zrzutach tylko dane syntetyczne.
