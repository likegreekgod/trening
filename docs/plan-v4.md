# Plan v4: odświeżenie wyglądu i nowe funkcje

Plan uzgodniony z Damianem 12.11.2026 (rozmowa „czy możemy usprawnić wygląd i funkcje”). Ten plik wystarcza, żeby zacząć pracę w nowej rozmowie: przeczytaj go razem z `docs/stan.md`, nie trzeba odtwarzać wcześniejszych ustaleń.

Stan wyjściowy: aplikacja v37, `main` po PR #60 (obwód / superseria). `npm test` = 142 testy, wszystkie zielone.

## Zasady (obowiązują w każdym PR)

- Styl Pomost zostaje: karty, tokeny kolorów z `:root`, oba motywy, cele dotyku ≥ 44 px, etykiety ≥ 12 px. To odświeżenie, nie nowy wygląd.
- **Każda zmiana wyglądu: najpierw szkic do akceptacji, potem kod.** Szkic to zrzut 390×844 zrobiony na prawdziwych stylach aplikacji (Playwright, atrapa API, podmieniony fragment DOM), wysłany Damianowi jako obraz. Bez akceptacji nie koduj.
- Nie zmieniaj logiki zapisu: id serii, typy serii, `payloadOf`, kolejka offline, wysyłka filmów, tryby PROSTY i PRO.
- Bez nowych zależności w `web/`, wszystko inline; czyste funkcje do `web/lib.js` z testem w `tests/lib.test.js`.
- Każdy PR: gałąź → `npm test` → podbicie `VERSION` w `web/sw.js` (gdy rusza `web/`) → push → link `compare/main...gałąź?expand=1&title=…&body=…`. Damian scala sam i pisze „ok”.
- Po każdym PR zaktualizuj tabelę „Stan” na dole tego pliku, `docs/stan.md` i (gdy doszło ustalenie) `docs/decyzje.md` na górze.
- Różnice między klientami tylko flagami z `cfg`, nigdy po imieniu.
- Animacje wyłączane przy `prefers-reduced-motion`.

## Kolejność

Polecany pakiet (PR 1–4) Damian zaakceptował co do kierunku. PR 5–9 to dalsze kroki; przed każdym z nich zapytaj, czy dalej chce.

### PR 1 · Lżejsza karta ćwiczenia

Cel: w karcie widać przede wszystkim serie; rzadkie akcje nie zajmują miejsca.

- Dziś w karcie (`card(ex, tag)`, web/index.html ok. linii 2130) stale widoczne są: „Pomiń / Pomiń…”, „Zamień ćwiczenie”, „+ rozgrzewka”, „+ seria”, „+ drop set”, „Jak 1. seria”, komentarz do ćwiczenia.
- Propozycja do szkicu: jeden przycisk „⋯” w nagłówku karty otwiera `#sheet` (`openSheet`) z akcjami rzadkimi: Pomiń, Zamień, + rozgrzewka, + drop set, Komentarz. W karcie zostają: recepta, „Ostatnio”, serie, „+ seria”, „Jak wykonać”.
- Uwaga na testy: wiele testów UI klika `[data-skip]`, `[data-warm]`, `.exn-t`, „+ drop set” wprost w karcie. Albo zachowaj te same atrybuty na przyciskach w oknie i dopisz w testach otwarcie „⋯”, albo zostaw w DOM ukryte odpowiedniki. Wybierz jedno i trzymaj się go.
- Komentarz, który już jest wpisany, musi być widoczny w karcie bez otwierania okna (dziś `details.exn` jest wtedy otwarte).
- Do decyzji Damiana na szkicu: co dokładnie chowamy (np. czy „+ rozgrzewka” zostaje na wierzchu).
- **Ustalone 12.11 (wariant A):** nagłówek = nazwa i etykieta po lewej, stała kolumna ikon po prawej (▶ film, „⋯”, strzałka); pod „⋯” Komentarz, Zamień, Pomiń; pod seriami jeden rząd „+ rozgrzewka”, „+ seria (n)”, „+ drop set”; zużyta „+ seria” wyszarzona. Testy otwierają „⋯” i klikają te same atrybuty (`data-swap`, `data-skip`) w oknie.

### PR 2 · Podsumowanie po treningu

Cel: po „Zakończ i zapisz jednostkę” klient widzi wynik, a nie tylko toast.

- Dziś: `sessCard(s0)` (ok. 2201) i `$('#saveSess').onclick` (ok. 2480) zapisują `logSession` i zostają na ekranie.
- Propozycja: po zapisie okno albo karta „Trening zrobiony”: czas, serie zrobione / plan, tonaż (bez ćwiczeń na czas), rekordy z tej jednostki, porównanie tonażu i czasu do poprzedniego razu tej samej jednostki (ten sam `day` w poprzednim tygodniu) albo do średniej.
- Dane są w telefonie: `doneSets`, `records`, `weekSummary` w lib.js. Nowa czysta funkcja np. `unitSummary(sets, plan, week, day)` z testem.
- Bez sieci działa tak samo (zapis idzie do kolejki).
- Przyciski: „Zobacz postęp” (zakładka Postęp → Tydzień), „Zamknij”.
- **Stan 13.11:** szkic pokazany Damianowi, bez decyzji (szkic trzeba odtworzyć w nowej rozmowie, pliki nie są w repo). Okno `#sheet` „Trening zrobiony” z ✓ w kółku i podtytułem „tytuł · dzień”; pod spodem czas, serie zrobione / plan, tonaż, każde z porównaniem; sekcja „Rekordy z tego treningu” (wiersze `.kv` z `key pr`, znika bez rekordów); bez sieci dopisek „zapiszę, gdy wróci sieć”; przy „Zapisz zmiany” w zapisanej jednostce okna nie ma, zostaje toast.
- **Ustalone 13.11:** układ A (trzy kafle), porównanie z poprzednią taką samą jednostką (brak poprzedniej = bez porównania). Zrobione w v40.

### PR 3 · Historia ćwiczenia w karcie

Cel: dotknięcie „Ostatnio: kg × powt. · RPE” pokazuje, jak szło wcześniej.

- Dziś „Ostatnio” liczy `lastTop(logs, name, week, day)` (lib.js ok. 200, użycie ok. 1933).
- Propozycja: „Ostatnio” jako przycisk → `#sheet` z ostatnimi 5 jednostkami tego ćwiczenia (data, najlepsza seria, wszystkie serie w skrócie, RPE), mały wykres `chartLine` (e1RM albo najlepsze kg w bojach, jak w Postęp → Siła: `strengthSeries`).
- Nowa czysta funkcja np. `exHistory(sets, name, n)` z testem. Zamienione ćwiczenie liczy się pod nazwą wykonaną.
- **Ustalone 13.11:** wariant A (wykres + lista), „Ostatnio” z podkreśleniem i strzałką ›, 5 ostatnich treningów. Zrobione w v41.

### PR 4 · Rekord w chwili zapisu

Cel: gdy zapisana seria bije dotychczasowy wynik, klient widzi to od razu.

- Miejsce: `save` w `bindRow` (ok. 2346), po `putLocal`.
- Rekord liczony jak w Postępie (`records` w lib.js): e1RM poza bojami, najlepsze zaliczone kg w bojach; tylko seria zaliczona (✓), nie rozgrzewka, nie FAIL, nie ćwiczenie na czas.
- Forma do szkicu: krótki znacznik przy wierszu serii („rekord”) + toast; bez dźwięku, żeby nie mylić z sygnałem przerwy.
- Uwaga: pierwsza w historii seria ćwiczenia nie jest rekordem (brak punktu odniesienia), tak jak w „Rekordy tygodnia”.

### PR 5 · Ekran „dziś”

- Na górze Treningu jedna karta: tytuł jednostki, liczba ćwiczeń, szacowany czas (`SET_SEC` + `restSec`, jak w `cutPlan`), przycisk „Zacznij” (przewija do pierwszego niezrobionego ćwiczenia). Dzień bez jednostki: „Dziś wolne” + najbliższa jednostka.
- Pasek tygodnia (`weekBar`), `notesCard`, `readyBanner`, `helpCard` zostają pod spodem; do szkicu, czy mniejsze.

### PR 6 · Dopracowanie ruchu i timera

- Płynne zwijanie kart (dziś klasa `fold` bez animacji), krótka animacja ✓, kołowy albo wyraźniejszy timer przerwy (`#rest`, `restTick`), lepsze puste stany (brak planu, brak historii).
- Tylko CSS i drobny JS; nic w zapisie.

### PR 7 · Podpowiedzi przy pierwszym użyciu

- Krótkie dymki zamiast długiej pomocy (`helpCard`, ok. 1055): pierwsza seria (✓ / ✕), kamera, przytrzymanie dnia w pasku tygodnia, „⋯” w karcie.
- Każda pokazana raz, stan w localStorage (np. `tip_<klucz>`), z „Rozumiem”.

### PR 8 · Tryb skupienia (największa zmiana, osobna decyzja)

- Jedno ćwiczenie na ekranie, przesunięcie palcem do następnego, pasek postępu jednostki, obwód jako A1 → A2 → A3.
- Najpierw szkic do porównania z obecnym widokiem. Proponowane jako **przełącznik** (lista / skupienie, zapamiętany w localStorage), a nie zamiana, żeby nie zmieniać nawyków klientom z dnia na dzień.
- Ryzyko: prawie wszystkie testy UI zakładają, że wszystkie karty są w DOM. W trybie skupienia zostaw wszystkie karty w DOM i pokazuj jedną (CSS), wtedy logika i testy listy zostają.

### PR 9 · Funkcje wymagające arkusza

- **Raport po bloku dla klienta:** karta w Postępie z danych `computeBlocks_` (wykonanie, tonaż, zmiana e1RM, najlepsze boje). `getData` musiałby zwracać wiersze Bloków klienta; bez „wniosków” trenera, chyba że Damian zdecyduje inaczej.
- **Notatka trenera do jednostki:** nowa kolumna Planu na końcu nagłówków (np. `uwagi_jedn`, wypełniana w pierwszym wierszu jednostki), pokazana na górze Treningu. Wymaga wpisu w SKILL.md skilla trenera.

### PR 10 · Zmiany w jednostce na miejscu, dla wybranych osób (zgłoszone 13.11)

Cel: wybrana osoba (np. sam Damian) może w trakcie treningu szybko dopasować jednostkę z planu, gdy nie ma sprzętu: **dodać** własne ćwiczenie, **zamienić** albo **usunąć** istniejące.

- Dla kogo: tylko osoby z flagą w zakładce Klienci (nowa kolumna na końcu, np. `edycja` = TAK, zwracana w `cfg`), nigdy po imieniu. Domyślnie wyłączone.
- Co już jest i wystarczy włączyć tej osobie: zamiana na dowolne ćwiczenie (`zamiana` = DOWOLNA: cała baza + własna nazwa), pominięcie ćwiczenia („Pomiń”, seria 0 SKIP).
- Czego brakuje: **dodanie ćwiczenia do jednostki z planu**. Dziś własne ćwiczenia można dać tylko do osobnego własnego treningu (W1, W2…). To zmienia decyzję z 22.10 „dopisywanie ćwiczeń do jednostek trenera: na razie nie”.
- Propozycja do szkicu: przycisk „+ ćwiczenie” pod ostatnią kartą jednostki (tylko z flagą) otwiera tę samą wyszukiwarkę co kreator własnego treningu (`exSearch`, filtr po partii, własna nazwa), z seriami i powtórzeniami; „Usuń” pod „⋯” karty dla ćwiczeń dodanych przez klienta, dla ćwiczeń z planu zostaje „Pomiń”.
- Wymaga zmian w arkuszu (`apps-script/`): nowa akcja API dopisująca wiersz Planu do istniejącej jednostki z `zrodlo = klient` i kolejnym `nr`, oraz usuwająca taki wiersz. Do ustalenia: jak `mergePlan_` ma traktować dopisane wiersze przy ponownym wczytaniu planu (propozycja: zostają, jak własne treningi) i czy liczą się do wykonania planu w Podsumowaniu (propozycja: nie, jak `own_`).
- Bez sieci: przez kolejkę, jak własny trening (`applyOwn`).
- **Ustalone 13.11:** robimy przed PR 4. Przy każdej zmianie (dodanie, zamiana, usunięcie) aplikacja pyta „Na jak długo?”: „Tylko dziś” albo „Na stałe” (= także kolejne tygodnie tej samej jednostki, do końca obecnego planu).
- Szkic pokazany 13.11 (pliki poza repo, do odtworzenia skryptem z atrapą): przycisk „+ Ćwiczenie” pod ostatnią kartą; okno „Dodaj ćwiczenie” (szukaj, serie / powt. / kg, „Na jak długo?”); „Usuń z treningu…” pod „⋯” karty z tym samym pytaniem. Czeka na akceptację i decyzję, czy „Usuń” dotyczy też ćwiczeń z planu (rekomendacja: tak, ale wiersz Planu nie jest kasowany, zostaje ślad „usunięte przez klienta” i ćwiczenie nie liczy się do wykonania; „Pomiń” zostaje jako „dziś nie zrobiłem”).

### PR 11 · Dwie poprawki karty (zgłoszone 13.11 na zrzutach; odczyt potwierdzony)

- **Nazwa ćwiczenia przypięta u góry:** przy długiej karcie (rozgrzewki + serie) po przewinięciu nie widać, które to ćwiczenie. Nazwa ma zostać na górze ekranu, dopóki karta jest na ekranie, i zniknąć, gdy karta się kończy. Uwaga na chowany górny pasek (`header.hid`) i ramkę obwodu.
- **Komentarz do ćwiczenia w osobnym oknie:** zamiast pola „Twój komentarz” w karcie okno `#sheet`; gdy komentarz już jest, okno go poprawia (aktualizuje), a nie dodaje kolejnego. Wpisany komentarz dalej widoczny w karcie jako tekst.
- **Szkic pokazany 13.11** (pliki poza repo): nazwa przypięta w wariancie A (pełny nagłówek karty, nazwa w dwóch liniach) albo B (jedna linia z wielokropkiem, niższy pasek), w obu ▶ / „⋯” / strzałka zostają; komentarz w karcie jako tekst z ołówkiem, dotknięcie otwiera okno „Komentarz” z „Zapisz zmiany”, „Usuń komentarz”, „Anuluj”. Czeka na wybór.

## Otwarte pytania do Damiana (zadaj przy odpowiednim PR)

1. PR 1: które akcje zostają na wierzchu karty, a które idą pod „⋯”.
2. PR 2: porównanie do poprzedniej takiej samej jednostki czy do średniej z 4 tygodni.
3. PR 4: czy rekord pokazywać też w trybie PROSTY (propozycja: tak).
4. PR 8: przełącznik czy nowy domyślny widok.
5. PR 9: czy klient ma widzieć „wnioski” trenera z zakładki Bloki.
6. Czy przed szkicami zrobić krótki przegląd kilku popularnych aplikacji treningowych (propozycje wyżej są z doświadczenia, nie z aktualnego przeglądu rynku).

## Odrzucone wcześniej (nie proponuj ponownie)

Suwaki zamiast przycisków, zmiany pod konkretnego klienta, natywna aplikacja od zera, pokazywanie klientowi „film czeka na komentarz”. Pełna lista: `docs/decyzje.md`, „Odrzucone i dlaczego”.

## Stan

| PR | Zakres | Stan |
|---|---|---|
| 1 | Lżejsza karta ćwiczenia | zrobione (v38, scalone) + poprawka v39 (etykieta w linii, „⋯” jednostki w górnym pasku) |
| 2 | Podsumowanie po treningu | zrobione (v40): układ A (kafle), porównanie z poprzednią taką samą jednostką; lib `unitSummary`, `doneSummary` / `openDone` |
| 3 | Historia ćwiczenia w karcie | zrobione (v41): wariant A (wykres + 5 treningów), „Ostatnio” jako przycisk; lib `exHistory`, `openHist`, `effTxt` |
| 4 | Rekord w chwili zapisu | do zrobienia (szkic) |
| 5 | Ekran „dziś” | po decyzji |
| 6 | Ruch i timer | po decyzji |
| 7 | Podpowiedzi przy pierwszym użyciu | po decyzji |
| 8 | Tryb skupienia | po decyzji, osobny szkic |
| 9 | Raport po bloku, notatka do jednostki | po decyzji |
| 10 | Dodawanie / zamiana / usuwanie ćwiczeń w jednostce dla wybranych osób | zrobione (v42 + `apps-script/`): flaga Klienci N `edycja`, API `editPlan`, lib `planEdit`; szczegóły w `decyzje.md` |
| 11 | Przypięta nazwa ćwiczenia przy przewijaniu; komentarz do ćwiczenia w osobnym oknie | odczyt potwierdzony, szkic pokazany 13.11, czeka na wybór wariantu |
