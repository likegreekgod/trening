# Trening – aplikacja dla klientów Damiana

Aplikacja, w której klienci trenera personalnego (ciężary, siła, sylwetka) widzą plan i zapisują wykonanie: serie, RPE, filmy, ból i samopoczucie. Dane trafiają do Arkusza Google Damiana, filmy na jego Google Drive. Arkusz liczy tygodniowe podsumowanie obciążenia ze statusem (za dużo / uwaga / OK / za lekko).

Rozmawiaj z Damianem po polsku, zwięźle. Interfejs aplikacji jest po polsku.

## Dokumenty

- `docs/stan.md`: **zacznij tutaj** — jak pracujemy, co czeka na Damiana, lista zadań. Aktualizuj po każdym zadaniu.
- `docs/decyzje.md`: ustalenia projektowe, odrzucone pomysły, otwarte zadania. Nowe ustalenia dopisuj **na górze**, z datą. Przed propozycją zmiany sprawdź „Odrzucone i dlaczego”.
- `docs/ui-v2-spec.md`: specyfikacja interfejsu v2 (obowiązująca przy pracy nad v2).
- `docs/ui-v2-prototyp.html`: prototyp v2 na danych przykładowych, wzorzec wyglądu i kod komponentów (`track()`, `analyse()`, `sugOly`, `verdict`). Docelowy styl: **Pomost**; wariant „Obecny” służy tylko do porównania.
- `docs/ui-v2-plan.md`: kolizje `web/` ze specyfikacją i podział v2 na PR-y. Pracuj w tej kolejności; po każdym PR zaktualizuj plik.
- `docs/plan-v3.md`: plan v3 (przegląd dla trenera, menu Trening, zakładka Ćwiczenia, alert mailowy) ze stanem PR-ów.

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
- `apps-script/Code.gs` jest powiązany z arkuszem `Trening – Aplikacja (dane)` (konto trenera, właściciel arkusza; `clasp login` musi być na tym samym koncie). API: `doPost` → `API_FNS` (getData, logSet, logSession, deleteSet, startUpload, uploadChunk, uploadStatus, logVideo, saveDyspozycja, przesunJednostke, addOwnUnit, getExNames, logError, logNote, logReadyVideo). Pierwszym argumentem każdej funkcji jest klucz klienta.
- `apps-script/Index.html` to stara wersja działająca przez `doGet` i `google.script.run` (linki `/exec?k=`). Zostaje na okres przejściowy. Nowe funkcje rób w `web/index.html`; starą wersję poprawiaj tylko przy błędach.
- Klucz klienta w linku (`?k=k` + 11 znaków hex) jest jedynym zabezpieczeniem. PWA zapamiętuje go w `localStorage` („key”). Bez klucza (iOS: PWA z ekranu głównego ma osobny `localStorage` i startuje bez `?k=`) `askKey` pokazuje pole na link albo kod (lib `keyFrom`).
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

**Plan** (PLAN_HEADERS w Code.gs): klient, tydzien, jednostka, tytul, data (RRRR-MM-DD, tekst; opcjonalna = wstępna, klient może przesunąć), nr, cwiczenie, prio (A/B/K), serie, powt (tekst: „8”, „6-8”, „8/str”, „1+1”), procent (ułamek), kg (liczba lub tekst: BW, guma), rpe_max, uwagi, dod_serie, drop, grupa (R/P/CR/CP/PS/I), zamienniki („;”), blok (np. B2), zrodlo (klient = własny trening), tryb (EMOM), ciecie (1 = tnij pierwsze), serie_min. Serie 1–40 (`SETS_MAX`).
Kolumny E (data), J (powt) i L (kg) muszą mieć format `@` ustawiony PRZED zapisem, bo inaczej Arkusze zamienią „6-8” w datę.
Tygodnie u klienta numeruj **ciągle** między blokami (blok 2 od tyg. 7): id serii nie zawiera bloku, więc powtórzony numer tygodnia nadpisałby Log.

**Klienci**: A klucz, B klient_id, C imie, D aktywny (TAK/NIE), E link, F bol (TAK), G tryb (PROSTY/PRO), H dod_serie, I masters (TAK), J zamiana (NIE / TRENER / DOWOLNA; TAK = TRENER, `swapMode_`), K skala (RPE/RIR), L sufit_oly (ułamek lub %, domyślnie 0,05). `getData` zwraca je w `cfg` jako `swap` ('TRENER' | 'DOWOLNA' | false), `scale`, `olyCeil`.

**Log**: id = klient|tydzien|jednostka|nr|seria (upsert), zapisano, klient, tydzien, jednostka, data, nr_cw, cwiczenie, seria, kg, powt, rpe, vbt_ms, wykonane, film_link, uwagi, typ, ocena (L/S/W/X), vbt_peak, wysokosc_cm, sciezka (JSON), zamiana („oryginał → zamiennik | powód”).
Wartości `seria`: 1…n robocze, n+1… dodatkowe, R1… rozgrzewka, D1… drop set, 0 = ćwiczenie pominięte/skrócone. Wartości `typ`: DROP / FAIL / DROP+FAIL / SKIP (seria 0, `wykonane` puste, powód w `uwagi`: „skrócone do 2 z 4 serii · brak czasu” albo sam powód; `skips_`).
`uwagi` w seriach = komentarz klienta do ćwiczenia (ten sam we wszystkich seriach; `logNote` poprawia wszystkie).
`logSet` przyjmuje pola v2: `ocena`, `vbtPeak`, `height`, `path`, `swap` (brak = puste, stara aplikacja działa bez zmian).

**Sesje**: id = klient|tydzien|jednostka, …, samopoczucie (1–5), czas_min, uwagi, start, koniec, bol („miejsce:0–10; …”), bol_max, rpe_sesji (0–10, CR-10).
Kolumna `data` w Sesjach to data z planu; faktyczny dzień treningu to `start` (`unitDates_`) i według niego podsumowanie grupuje tygodnie.

**Dyspozycja**: id = klient|data (jeden wpis dziennie), zapisano, klient, data, cmj1–3, cmj_sr, sen, stres, zmeczenie, bolesnosc, hooper_suma, vbt_test, werdykt, powody, cmj_wykluczone („2”: skok poza `cmj_sr`), film_link (filmy CMJ, `logReadyVideo`, Dysk „<Imię>/Dyspozycja/<data>/”). Zapis: `saveDyspozycja` (krótszy wiersz, nie kasuje film_link); `getData` zwraca `readiness`.

**Ćwiczenia** (baza, startowo z `apps-script/Cwiczenia.gs` przez menu „Wczytaj bazę ćwiczeń”; poprawki trener robi w arkuszu): cwiczenie, aliasy („;”), instruktaz (link http/https), partia (kilka przez „;”), zamienniki („;”), grupa. Dopasowanie nazwy z planu (`exIndex_`, `exFind_`): dokładna nazwa lub alias → nazwa podstawowa (bez nawiasów, „– TEST”, „z pauzą…”) → te same słowa i skróty (DB, SL, RDL); bez zgadywania po podobieństwie. Kompleks „A + B” bez własnego wiersza składa się z części (`exInfo_`). `getData` dokłada do wierszy planu `infos` [{n, u}] i `parts` [], domyślne `swaps` i `group` (plan ma pierwszeństwo) oraz mapę `parts` {nazwa → [partie]} dla nazw z planu, logu i zamienników klienta. Menu „Uzupełnij listę ćwiczeń” dopisuje nazwy z Planu bez dopasowania. W `Cwiczenia.gs` są też `CW_FEDB` (762 ćwiczenia z free-exercise-db: nazwa i partia, bez filmu), `CW_WYCOFANE` (błędne aliasy usuwane z arkusza), `CW_ALIASY` (polskie i potoczne nazwy ćwiczeń z bazy) i `CW_DODATKI` (ćwiczenia spoza Catalyst, bez filmu); `cwSync_` (czysta funkcja z testem) wylicza, co „Wczytaj bazę ćwiczeń” ma dopisać, i nie rusza ręcznych wpisów. Wiersz z samą nazwą (zaślepka) nie bierze udziału w dopasowaniu.

**Pominięte i komentarze w podsumowaniu**: Podsumowanie_cw `uwagi_klienta`, `pominiete`; Podsumowanie `opcjonalne` (zrobione/plan B). Pominięte albo skrócone B nie wchodzą do `wykonanie_%` (Podsumowanie i Bloki), A/K tak; pominięte A/K = sygnał pomarańczowy w Przeglądzie.

**Podsumowanie_partie** (`computeParts_`): klient × tydzień × partia: serie, serie twarde (RPE ≥ 7, FAIL, DROP), tonaż; ćwiczenie liczy się do każdej swojej partii; po zamianie liczy się wykonane ćwiczenie. Boje olimpijskie i ich warianty nie mają partii w bazie.

**Przegląd** (liczony w `podsumowanie`, `computeOverview_`): jeden wiersz na aktywnego klienta, najpilniejsi na górze; `pilnosc` = 3 × sygnały czerwone + pomarańczowe (ból > 3/10, FAIL, dyspozycja, zaległe jednostki, brak treningu, koniec planu), ostatni trening, ten tydzień zrobione/plan, uwagi klienta, filmy z 7 dni, filmy z 7 dni bez komentarza trenera (`filmy_bez_kom_7dni`, bez sygnału). Progi i okna: stała `PRZ` i `docs/plan-v3.md`.

**Niezawodność**: `cwRowsCached_` (Ćwiczenia w CacheService w kawałkach, `cwCacheClear_`, prosty wyzwalacz `onEdit`), `getData.ms` (czasy etapów), `ownWrite_` (własny trening bez przepisywania Planu), zakładka Błędy (`logError`, `errRow_`, `errRecent_`; w aplikacji `reportErr`, limit 5 dziennie).

**Własny trening klienta** (`addOwnUnit`, `ownRows_`, `ownRecent_`; aplikacja `openOwn` / `applyOwn`, lib `ownWeek`, `ownNextDay`, `exSearch`): jednostki W1, W2… z `Plan.zrodlo = klient`; `own_(r)` wyłącza je z wykonania planu (computeSummary_, computeBlocks_, computeOverview_) i chroni przy `mergePlan_`. `getData` zwraca `row.own`, `cfg.own` (Klienci M „wlasne”) i `exNames` do wyszukiwarki. Ćwiczenia: kolumna `glowna` = alias ćwiczenia głównego (`exIndex_` drugi przebieg, `cwMerge_` przenosi do aliasów).

**Kolejka filmów** (web/index.html, `queueVideo` / `vqRun` / `vqOne`): plik w IndexedDB `trening-filmy`, postęp sesji w localStorage `vqp_<id>`; wysyłka kawałkami po 8 MB na sesję resumable z `startUpload` (z Origin), awaryjnie cały plik naraz, a potem przez serwer (`uploadChunk`). Wznowienie pyta `uploadStatus` (serwer odczytuje Range, bo przeglądarka go nie widzi), link przy serii zapisuje `logVideo` (tylko film_link). Test UI symuluje przerwę i wznowienie po przeładowaniu.

**Komentarze trenera**: `Log.komentarz_dysk` wypełnia skrypt z komentarzy do filmu na Dysku (`syncComments_` przez Drive REST; `commentLines_`, `anchorSec_`, `fileIdOf_` to czyste funkcje z testami; wołane z `wczytajPlany(e)` nie częściej niż co 30 min i z menu), `komentarz_trenera` w Logu i Sesjach wpisuje trener ręcznie. Nowe kolumny są na końcu nagłówków, a `logSet` / `logSession` zapisują krótsze wiersze, więc ponowny zapis serii przez klienta nie kasuje komentarza: nie wstawiaj kolumn w środek. Aplikacja: `coachNotes` i `notesByWeek` w lib.js, karta `notesCard` z nowymi na Treningu, wszystkie w zakładce Trener (`renderTrener`, tygodniami i jednostkami, „NOWE” do wyjścia z zakładki, kropka na przycisku w menu, `navDot`), przeczytane w localStorage `cn_<klucz>`. Klient nie widzi, które filmy czekają na komentarz (to tylko w Przeglądzie).

**Alert mailowy** (`alertMail_`, czysta funkcja z testem; `alertRano_`): wysyłany tylko z porannego wyzwalacza `podsumowanie(e)` (z menu nie), na adres z właściwości skryptu `ALERT_EMAIL` (menu „Ustaw adres alertu”; adresu nie wpisuj do repo ani arkusza). Mail idzie tylko, gdy pojawił się czerwony sygnał, którego nie było w poprzednim alercie (podpis w `ALERT_SIG`); liczba czerwonych sygnałów klienta jest w kolumnie `czerwone` Przeglądu. `MailApp` wymaga zgody właściciela arkusza: po wdrożeniu zmiany dodającej nowy zakres uprawnień trzeba od razu uruchomić dowolną pozycję menu i zaakceptować zgodę, inaczej aplikacja klientów przestaje zapisywać.

**Podgląd dla Claude** (`apps-script/Podglad.gs`; `podglad_` czysta funkcja z testem): osobny plik „Trening – podgląd dla Claude” w folderze „Trening – Klienci”, jedna zakładka „Ostatnie sesje”: 5 ostatnich jednostek każdej osoby (aktywni klienci i trener, który zapisuje się jak klient; nieaktywni pominięci), osoby alfabetycznie po imieniu z Klientów, w obrębie osoby od najnowszej (dzień z Sesje.start, inaczej z Logu), wiersz „— sesja —” (RPE sesji, samopoczucie, czas, uwagi) + wiersz na ćwiczenie (plan kg / serie×powt. / RPE, wykonanie bez rozgrzewki, notatki: komentarz klienta, zamiana, pominięcie, uwagi z planu). Bez bólu i komentarzy trenera. Dla agenta z konektorem Drive, który nie czyta dużego arkusza. Odświeża `odswiezPodglad` z wyzwalacza co 10 min (`instalujPodglad`, raz z edytora), przepisuje plik tylko po zmianie (`PODGLAD_SIG`); ID pliku we właściwości `PODGLAD_ID`. Log czyta bez kolumny `sciezka` (`pgTable_`). Nie zmienia żadnej zakładki arkusza z danymi.

**Bloki** (liczone w `podsumowanie`, `computeBlocks_`): klient × blok, daty, tygodnie, jednostki, wykonanie, tonaż, zmiana e1RM, najlepsze boje, sRPE, samopoczucie, dyspozycja, ból, statusy, **wnioski** (wpisuje trener; `keepNotes_` zachowuje je przy przeliczaniu).

Zasady zgodności:
- Nowe kolumny Log i Sesje dopisuj tylko **na końcu** nagłówków. `sheet_()` sam uzupełnia nagłówek w istniejącym arkuszu.
- Nie zmieniaj formatu `id`.
- Stare kolumny (bol_kolano, bol_bark) wypełniaj dalej.

Zmiany w arkuszu z v2 (`docs/ui-v2-spec.md`, „Zmiany w arkuszu”) są już w Code.gs (PR 1 v2); korzysta z nich interfejs w kolejnych PR-ach.
Arkusz zawsze zapisuje RPE (RIR = 10 − RPE to tylko widok). Ocena podejścia w bojach trafia do `rpe`/`typ`, więc Podsumowanie_OLY liczy się bez zmian.

## Plany treningowe

Plany tworzy Claude w projekcie claude.ai („Trener personalny (OLY)”) i zapisuje je jako JSON do `Trening – Klienci/_plany/` na Drive.
`wczytajPlany()` działa z wyzwalacza co 15 min albo z menu „Trening”. Menu „Trening” (`onOpen`) ma też: Przegląd klientów, Dodaj klienta, Odśwież linki klientów, Sprawdź arkusz (`diagnose_`, czysta funkcja z testem) i Zainstaluj wyzwalacze; okna w arkuszu mogą używać `google.script.run`, bo to interfejs trenera, a nie `web/`. Kolejno: waliduje plik (`validatePlan_`), podmienia wiersze klientów z pliku (`mergePlan_`: jednostki zrobione zostają; zrobiona jednostka z innym blokiem w pliku = błąd), przenosi plik do `_plany/wczytane` albo `_plany/bledy` i zapisuje wynik w zakładce Import.
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
- Pola kg / powt.: propozycja (plan, poprzednia seria, drop) to placeholder (`data-ph`, klasa `ph`), pole puste; wartość czytaj przez `fv(input)`, nową propozycję ustawiaj `setPh`. ✓ przy pustym polu wpisuje propozycję. Pole z wartością zaznacza się przy fokusie.
- Serie:
  - dodatkowe przyciski „+ Rozgrzewka”, „⇣ Jak 1. seria”, „+ Seria (N)” i „+ Drop” (~80% ciężaru, w dół do 2,5 kg);
  - ✕ usuwa ostatni dodany wiersz w dwóch dotknięciach;
  - pole odhaczenia (`data-st`): puste → ✓ zrobiona → ✕ nieudana (typ FAIL, rpe puste) → puste; żółte (`pend`) = czeka w kolejce;
  - dotknięcie numeru serii roboczej/dodatkowej: zwykła → drop (typ DROP) → nieudana;
  - zmiana kg/powt./RPE w zapisanej serii zapisuje ją od razu;
  - PRO: lista RPE albo RIR (0…5+) wg `cfg.scale` i przełącznika w nagłówku (`sc_<klucz>`); zapis zawsze w RPE;
  - recepta: kwadrat w kolorze talerza wg % 1RM, „RIR ≥ n” przy skali RIR; „Ostatnio: kg × powt. · RPE” z poprzedniej jednostki (`lastTop`).
  - „✓ Wszystko jak w planie” (PROSTY) widoczne tylko przy niezapisanych seriach z planu (`refreshAll`);
  - czas jednostki: start od pierwszego wpisu; pierwsza zapisana seria po > 30 min bez serii restartuje go (`LATE_START_MIN`, `restartClock`); w podsumowaniu „Licz czas od teraz” i ręczna poprawka minut (`#smin` ma pierwszeństwo);
  - po zaliczeniu serii (✓/✕, nie rozgrzewka) timer przerwy nad dolnym menu: A 2:00, B 1:30, K 1:00 (`restSec`), −15 / +15 / Pomiń, wibracja na koniec;
  - Wake Lock od pierwszego wpisu do „Zakończ” (ponownie po powrocie do aplikacji);
  - „Talerze”: okno `#sheet` z rozkładem na stronę (`plates`), gryf 20/15 kg i zamki 2 × 2,5 kg zapamiętane w `pl_<klucz>`.
  - boje (grupa R/P z kolumny `grupa` albo po nazwie, `isOly`): zamiast RPE i ✓ światła sędziowskie; ocena Łatwo / Średnio / Walka / Spalone → `rpe` 7 / 8 / 9,5 / FAIL + `ocena` L/S/W/X; propozycja ciężaru pod ostatnio ocenionym podejściem (`sugOly`, „Ustaw X kg”); w recepcie „max dziś” = `olyCap` (plan + `sufit_oly` × 1RM, przy dyspozycji „Uwaga”/„Zmęczenie” = plan).
  - „Zamień ćwiczenie” (tylko `cfg.swap`): TRENER = zamienniki z kolumny planu `zamienniki`, bazy albo wg wzorca ruchu (`swapOptions`), bez własnej nazwy; DOWOLNA = też wyszukiwarka całej bazy (`getExNames`, `exSearch`) i własna nazwa; powód z listy; zamiana w telefonie (`sw_<klucz>`) i w Logu (`zamiana` = „oryginał → zamiennik | powód”, `cwiczenie` = zamiennik); na innym telefonie odtwarzana z Logu.
  - kamera przy każdej serii roboczej, dodatkowej i drop (`openCam`): film wgrywany do tej serii (Drive, bez zmian w wysyłce), bez sieci komunikat zamiast błędu (film nie trafia do kolejki); w PRO pole „Prędkość z urządzenia (m/s)” → `vbt_ms` (kolumny VBT w wierszu już nie ma);
  - każdy zapis serii buduje `payloadOf(row, ex, s0)` (stan ✓/✕, ocena, typ, zamiana, film i prędkość z dotychczasowego wpisu), więc kolejne zapisy niczego nie kasują.
  - PRO, okno kamery, tryb „Film + ścieżka + VBT” (`vbtStage`): suwak do startu powtórzenia, dotknięcie środka i krawędzi talerza (450 mm = kalibracja), `track()` śledzi talerz co 1/30 s (SAD na zmniejszonym obrazie), `analyse()` liczy powtórzenia; boje i ciągi: v max i uniesienie, pozostałe: najlepsze MCV i spadek; zapis `vbt_ms`, `vbt_peak`, `wysokosc_cm`, `sciezka` (JSON, cm, co 2 klatki), potem film na Drive. Analiza działa bez sieci. Wczesna wersja: dokładność sprawdzona tylko na ruchu syntetycznym (`tests/synth.js`), do walidacji z czujnikiem.
- EMOM (`isEmom`: `tryb` = EMOM albo nazwa „EMOM …”): `emomBox` / `bindEmom`, zegar minut w `em_<klucz>` z sygnałem co minutę, „+ runda” = `row._save('ok')` na kolejnej serii (nowa seria dodatkowa ponad plan, do 40); bez przerwy i bez samozwijania.
- Karta ćwiczenia: „Pomiń” (B) / „Pomiń…” z powodem (A/K) → `saveSkip` (seria 0, SKIP), `withSkip` skraca serie, „Przywróć” = `unSkip` (deleteSet seria 0); „Skróć trening” (`openCut`, lib `cutPlan`: `ciecie`, `serie_min`, bez nich B od końca); „Zwiń zrobione”; komentarz do ćwiczenia (`exNote`, `setNote`, `en_<klucz>`). Karta zwija się sama, gdy ćwiczenie staje się zrobione (także po ręcznym rozwinięciu).
- Sygnał przerwy (`audioUnlock`, `beep`, `vib`, `flash`, `notifyBg`, ustawienia `sg_<klucz>` w `openSignal` pod ♪): koniec = 3 × 880 Hz, wibracja 300-150-300-150-600, mignięcie, powiadomienie w tle.
- Klasy poziomów (dyspozycja: werdykt, baner, powody) to `lv-ok/warn/bad/none`. Nie używaj `.ok`, `.pend` itp. jako klasy stanu w innych komponentach: `.ok` to przycisk ✓ z wysokością 44 px.
- Podsumowanie jednostki:
  - RPE sesji 0–10;
  - samopoczucie 1–5;
  - ból 0–10 per miejsce;
  - wszystko dużymi przyciskami.
- Ekrany z dolnego menu (`TAB`): Trening (nagłówek: tydzień/blok · jednostka · data, czas, serie, tonaż; pasek tygodnia; baner dyspozycji dnia), Dyspozycja, Plan, Postęp i Trener (komentarze trenera).
- Pasek tygodnia Pn–Nd (`weekBar` / `bindWeekBar`, lib `weekDays`, `pickUnit`, `mondayOf`) na Treningu i Planie: tydzień kalendarzowy `WK` (null = tydzień bieżącej jednostki), nagłówek „Blok · tydz. bloku · zakres”, jednostka w dniu faktycznym (Sesje.start) albo z planu; ✓ / ! zaległa / ● dziś; dotknięcie otwiera, przytrzymanie → `openMove` (widoczne dni, bez ukrytego pola daty) → `moveUnit` → `przesunJednostke` z komunikatem o wyniku + „przesuń też kolejne”; ◀ ▶, przesunięcie palcem, „Dziś”. Plan pokazuje jednostki z tego tygodnia.
- Postęp (`renderPostep`, cała historia z `DATA.logs`): Tydzień (domyślna; `weekCards`, lib `weekSummary`: tydzień kalendarzowy `PWK` z ◀ ▶ / Dziś, nie dalej niż bieżący; karty Wykonanie (jednostki z planu, własne osobno, serie z planem, tonaż wobec średniej 4 tyg. z treningiem, czas), Rekordy tygodnia (wynik lepszy od całej wcześniejszej historii), Jak było (RPE sesji, samopoczucie, ból max z miejscem, dyspozycja), Do zauważenia (pominięte, nieudane bez bojów), przycisk do komentarzy trenera z tygodnia; bez statusu obciążenia z arkusza), Siła (wybór ćwiczenia głównego, e1RM albo najlepsze zaliczone kg w bojach, rekordy akcentem, początek bloku zaznaczony), Objętość (tonaż tygodniowy 12 tyg., strefy % 1RM w kolorach talerzy z liczbami, kalendarz obciążenia 12 tyg. w skali `--h1…--h4`), Dyspozycja (CMJ z pasem średniej ±5%, prędkość na rozgrzewce). Wykresy to SVG budowane w `chartLine` / `chartBars`, jedna seria i jedna oś na wykres, pod każdym tabela z danymi; dane liczą funkcje z `lib.js` (`doneSets`, `strengthSeries`, `records`, `weeklyTonnage`, `zoneReps`, `loadCalendar`, `readySeries`).
- Dyspozycja dnia (`renderDysp`): do `READY_MIN` (5) dni historii „Zbieram Twoją średnią · n/5” zamiast oceny; po zapisie pomiary zwinięte z „Edytuj”. Ankieta Hoopera 1–7, 3 skoki CMJ (cm ręcznie albo z filmu slow-mo: `openCMJ`, odbicie = pierwsza klatka w powietrzu, lądowanie = pierwsza z kontaktem, klatkaż z pliku `readMoov` + lib `mp4Fps`, `cmjFlight`, h = g·t²/8 = 1,22625·t²; skok > 8% od mediany: `cmjSpread`, wykluczenie ze średniej; film skoku → `queueCmjVideo`), prędkość na rozgrzewce; `verdict()` porównuje ze średnimi z historii (`readyBase`: Hooper 7, CMJ i prędkość 5 ostatnich wpisów) wg progów ze specyfikacji; zapis `saveDyspozycja` (offline przez kolejkę), szkic dnia w `rd_<klucz>`. Werdykt „Uwaga”/„Zmęczenie” obniża sufit dnia w bojach do ciężaru z planu.
- Offline:
  - ostatnie getData leży w `localStorage` (`d_<klucz>`);
  - zapisy bez sieci trafiają do kolejki `q_<klucz>` i wysyłają się po powrocie połączenia; `useData` nakłada niewysłane zapisy z kolejki (serie, przesunięcia dat) na dane z serwera;
  - `sw.js` trzyma pliki aplikacji w pamięci telefonu.
- Dostępność:
  - bez `maximum-scale`;
  - cele dotyku ≥ 44 px;
  - kolory tylko przez zmienne w `:root`;
  - jasny motyw przez `prefers-color-scheme`; `<meta name="color-scheme" content="light dark">` zostaje, bo bez niego Samsung / Chrome przyciemniają jasny motyw po swojemu.

### Zasady v2

- v2 powstaje w `web/`. `apps-script/Index.html` zostaje bez zmian (tylko poprawki błędów).
- Styl Pomost z kartami (od 15.10.2026): każda sekcja (ćwiczenie, jednostka w Planie, wykres, dyspozycja) to osobna karta na tle `--surface` z zaokrągleniem `--rc` i odstępem `--gap`; kontrolki zaokrąglone `--r`; pasek stanu karty jako cień wewnętrzny z lewej. Zakładki podkreślone akcentem. Tokeny kolorów z tabeli w specyfikacji, jasny i ciemny motyw przez `prefers-color-scheme`.
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
| „Usłudze Arkusze kalkulacyjne nie udało się uzyskać dostępu do dokumentu” przy menu lub skrypcie | Błąd po stronie Google, nie kodu: kilka kont w przeglądarce (incognito tylko z kontem trenera) albo chwilowa awaria (odczekać kilka minut). 22.10 minął sam. |

## RODO

Filmy i dane o bólu to dane osobowe, w tym dane o zdrowiu. Arkusz i foldery są prywatne. Repozytorium jest publiczne, więc nie commituj danych klientów, kluczy, eksportów arkusza ani `.clasp.json`.
Dotyczy to też identyfikatorów arkusza i folderów Drive oraz zrzutów ekranu: w kodzie, testach i zrzutach tylko dane syntetyczne.
