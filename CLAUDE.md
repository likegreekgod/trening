# Trening – aplikacja dla klientów Damiana

Aplikacja, w której klienci trenera personalnego (ciężary, siła, sylwetka) widzą plan i zapisują wykonanie: serie, RPE, filmy, ból i samopoczucie. Dane trafiają do Arkusza Google Damiana, filmy na jego Google Drive. Arkusz liczy tygodniowe podsumowanie obciążenia ze statusem (za dużo / uwaga / OK / za lekko).

Rozmawiaj z Damianem po polsku, zwięźle. Interfejs aplikacji jest po polsku.

## Dokumenty

- `docs/decyzje.md`: ustalenia projektowe, odrzucone pomysły, otwarte zadania. Nowe ustalenia dopisuj **na górze**, z datą. Przed propozycją zmiany sprawdź „Odrzucone i dlaczego”.
- `docs/ui-v2-spec.md`: specyfikacja interfejsu v2 (obowiązująca przy pracy nad v2).
- `docs/ui-v2-prototyp.html`: prototyp v2 na danych przykładowych, wzorzec wyglądu i kod komponentów (`track()`, `analyse()`, `sugOly`, `verdict`). Docelowy styl: **Pomost**; wariant „Obecny” służy tylko do porównania.

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

- `web/index.html` to jeden plik (HTML + CSS + JS), bez bundlera i frameworka. Cała komunikacja z serwerem idzie przez funkcję `call(fn, ...args)`.
- `apps-script/Code.gs` jest powiązany z arkuszem `Trening – Aplikacja (dane)` (konto trenera, właściciel arkusza; `clasp login` musi być na tym samym koncie). API: `doPost` → `API_FNS` (getData, logSet, logSession, deleteSet, startUpload, uploadChunk). Pierwszym argumentem każdej funkcji jest klucz klienta.
- `apps-script/Index.html` to stara wersja działająca przez `doGet` i `google.script.run` (linki `/exec?k=`). Zostaje na okres przejściowy. Nowe funkcje rób w `web/index.html`; starą wersję poprawiaj tylko przy błędach.
- Klucz klienta w linku (`?k=k` + 11 znaków hex) jest jedynym zabezpieczeniem. PWA zapamiętuje go w `localStorage` („key”).
- Nowe zapisy to nowe akcje w `API_FNS` wywoływane przez `call()` (np. `saveDyspozycja`), nigdy `google.script.run`.

## Polecenia

```bash
npm test                         # testy Node (Code.gs w piaskownicy) + UI w Playwright z atrapą API
npm run test:code                # tylko logika serwera
node tools/validate-plan.js plans/x.json   # sprawdzenie planu przed wrzuceniem na Drive
npm run serve                    # podgląd web/ na http://localhost:8080 (API z config.js)
npm run gas:push                 # clasp push → Apps Script (pliki z apps-script/)
DEPLOYMENT_ID=… npm run gas:deploy   # nowa wersja istniejącego wdrożenia (URL /exec bez zmian)
git push                         # zmiany w web/ → GitHub Actions → GitHub Pages
```

Każda zmiana w `web/` wymaga podbicia `VERSION` w `web/sw.js`, bo inaczej telefony mogą trzymać starą wersję.
Każda zmiana w `Code.gs` wymaga `gas:push` i `gas:deploy`. Bez deploy telefon dalej rozmawia ze starą wersją API.

## Dane (arkusz)

**Plan** (PLAN_HEADERS w Code.gs): klient, tydzien, jednostka, tytul, data (RRRR-MM-DD, tekst), nr, cwiczenie, prio (A/B/K), serie, powt (tekst: „8”, „6-8”, „8/str”, „1+1”), procent (ułamek), kg (liczba lub tekst: BW, guma), rpe_max, uwagi, dod_serie, drop, grupa (R/P/CR/CP/PS/I).
Kolumny E (data), J (powt) i L (kg) muszą mieć format `@` ustawiony PRZED zapisem, bo inaczej Arkusze zamienią „6-8” w datę.

**Klienci**: A klucz, B klient_id, C imie, D aktywny (TAK/NIE), E link, F bol (TAK), G tryb (PROSTY/PRO), H dod_serie, I masters (TAK).

**Log**: id = klient|tydzien|jednostka|nr|seria (upsert), zapisano, klient, tydzien, jednostka, data, nr_cw, cwiczenie, seria, kg, powt, rpe, vbt_ms, wykonane, film_link, uwagi, typ.
Wartości `seria`: 1…n robocze, n+1… dodatkowe, R1… rozgrzewka, D1… drop set. Wartości `typ`: DROP / FAIL / DROP+FAIL.

**Sesje**: id = klient|tydzien|jednostka, …, samopoczucie (1–5), czas_min, uwagi, start, koniec, bol („miejsce:0–10; …”), bol_max, rpe_sesji (0–10, CR-10).

Zasady zgodności:
- Nowe kolumny Log i Sesje dopisuj tylko **na końcu** nagłówków. `sheet_()` sam uzupełnia nagłówek w istniejącym arkuszu.
- Nie zmieniaj formatu `id`.
- Stare kolumny (bol_kolano, bol_bark) wypełniaj dalej.

Zmiany planowane w v2 (szczegóły: `docs/ui-v2-spec.md`, „Zmiany w arkuszu”):
- Klienci: `zamiana` (TAK/NIE), `skala` (RPE/RIR), `sufit_oly` (ułamek, domyślnie 0,05);
- Plan: opcjonalna kolumna `zamienniki` (nazwy rozdzielone „;”);
- Log: `ocena`, `vbt_peak`, `wysokosc_cm`, `sciezka`, `zamiana`;
- nowa zakładka `Dyspozycja`.
Arkusz zawsze zapisuje RPE (RIR = 10 − RPE to tylko widok). Ocena podejścia w bojach trafia do `rpe`/`typ`, więc Podsumowanie_OLY liczy się bez zmian.

## Plany treningowe

Plany tworzy Claude w projekcie claude.ai („Trener personalny (OLY)”) i zapisuje je jako JSON do `Trening – Klienci/_plany/` na Drive.
`wczytajPlany()` działa z wyzwalacza co 15 min albo z menu „Trening”. Kolejno: waliduje plik (`validatePlan_`), podmienia wiersze klientów z pliku, przenosi plik do `_plany/wczytane` albo `_plany/bledy` i zapisuje wynik w zakładce Import.
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
  - „✗ Fail” w liście RPE.
- Podsumowanie jednostki:
  - RPE sesji 0–10;
  - samopoczucie 1–5;
  - ból 0–10 per miejsce;
  - wszystko dużymi przyciskami.
- Offline:
  - ostatnie getData leży w `localStorage` (`d_<klucz>`);
  - zapisy bez sieci trafiają do kolejki `q_<klucz>` i wysyłają się po powrocie połączenia;
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
  - przejrzyj zrzut 390×844 (Playwright);
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
