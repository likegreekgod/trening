# Stan projektu i lista zadań

Krótki punkt startowy dla nowej sesji: co działa, jak pracujemy, co czeka. Aktualizuj po każdym zadaniu (krótko, bez historii — historia jest w `docs/decyzje.md`). Bez danych klientów: repo jest publiczne.

Stan na 2026-11-13, aplikacja v43 (v40–v43 i zmiany w `apps-script/` na gałęzi, jeszcze bez PR-a).

## Jak pracujemy

- Repo: `C:\Users\dt\Desktop\trening-repo`. Sesję Claude Code otwieraj w tym folderze, wtedy `CLAUDE.md` wczytuje się sam.
- Zmiana = gałąź → `npm test` (wszystko zielone) → commit i push gałęzi (kontener sesji jest tymczasowy; wysyłanie gałęzi bez pytania Damian potwierdził 13.11). Brak `gh`; stan sprawdzaj przez publiczne API GitHuba.
- **PR (link `compare/main...gałąź?expand=1&title=…&body=…`) dopiero, gdy wszystko jest ustalone i Damian wyraźnie pozwoli** (ustalenie 13.11). Do tego czasu pokazuj zrzuty i opis, poprawki dokładaj na tę samą gałąź. Scala sam i pisze „ok”.
- **Po zakończeniu zadania od razu oznacz je w plikach md jako zrobione** (ten plik, tabela „Stan” w planie, `decyzje.md` przy nowym ustaleniu), w tym samym commicie co kod, bez czekania na scalenie.
- **Przy testach tłumacz Damianowi prostym językiem**: co test sprawdza, jak to robi i dlaczego, oraz co znaczył każdy błąd po drodze i jak został naprawiony. Chce rozumieć, co dzieje się w kodzie.
- Scalenie `web/**` publikuje aplikację (GitHub Pages; podbij `VERSION` w `web/sw.js`), scalenie `apps-script/**` wdraża skrypt (Action z clasp). `clasp push` z komputera jest zablokowany.
- Zmiany wyglądu: najpierw szkic do akceptacji, potem kod. Po każdym zadaniu odpowiedź kończy się listą zadań.
- Pomiar ładowania: `getData` zwraca `ms` z czasami etapów (16.10: skrypt 2,0–2,8 s, całość 3,3–4,8 s).
- Skill trenera dla claude.ai leży poza repo (`Desktop\hgvtjv\skill-aplikacja-treningowa-klienta`, zawiera identyfikatory arkusza). Po zmianie SKILL.md przebuduj ZIP.

## Ostatnio zrobione

- 13.11 (v43): plan v4 PR 11: nazwa ćwiczenia przypięta u góry przy przewijaniu długiej karty; komentarz do ćwiczenia w osobnym oknie (poprawia istniejący).
- 13.11 (v42 + `apps-script/`): plan v4 PR 10: osoby z flagą `edycja` (Klienci N = TAK) mogą w jednostce trenera dodać ćwiczenie, usunąć je ze śladem i zamienić, tylko w tym treningu albo na stałe.
- 13.11 (v41): plan v4 PR 3: „Ostatnio” w karcie otwiera okno „Historia” (wykres siły i 5 ostatnich treningów z tym ćwiczeniem).
- 13.11 (v40): plan v4 PR 2: po „Zakończ i zapisz” okno „Trening zrobiony” (czas, serie, tonaż z porównaniem do poprzedniej takiej samej jednostki, rekordy, „Zobacz postęp”).
- 13.11 (v39): niższe karty: etykieta priorytetu w linii z wynikiem (zwinięta) albo receptą (otwarta); „Skróć trening” i „Zwiń zrobione” pod „⋯” w górnym pasku zamiast rzędu przycisków.
- 12.11 (v38): plan v4 PR 1, lżejsza karta ćwiczenia: ikony ▶ / „⋯” / strzałka w stałej kolumnie nagłówka, Komentarz, Zamień i Pomiń pod „⋯”, jeden rząd „+ rozgrzewka / + seria (n) / + drop set” pod seriami.
- 12.11 (v37): obwód / superseria: kolumna Planu `obwod` (litera), ramka A1–A3 i przerwa po rundzie na Treningu, „Połącz z poprzednim” (Kompleks / Obwód) w kreatorze własnego treningu. Wymaga też scalenia `apps-script/` (wdroży się samo).
- 12.11 (v36): własny trening: kompleks „A + B” z kreatora („⛓ Kompleks z poprzednim”, „Rozłącz”), film każdej części od razu.
- 12.11: arkusz: ćwiczenia na czas nie wchodzą do tonażu, e1RM ani NL (Podsumowanie, Podsumowanie_cw, partie, Bloki); serie liczą się jak dotąd. Bez zmian w aplikacji.
- 12.11 (v35): Dyspozycja: sen w odwróconym widoku (7 = bardzo dobry), zapis i suma ankiety bez zmian. Testy „Postęp → Tydzień” naprawione (nie przechodziły w poniedziałki).
- 12.11 (v34): górny pasek chowa się przy przewijaniu w dół i wraca przy przewijaniu w górę (wszystkie zakładki).
- 12.11 (v33): własny trening: film „Jak wykonać” od razu po dodaniu ćwiczenia, ćwiczenia na czas („⏱ na czas”, sekundy zamiast powtórzeń), szukanie po partii mięśniowej. Filmy i partie w wyszukiwarce wymagają też scalenia `apps-script/` (wdroży się samo).
- 26.10: import planu: opcjonalne pole `zastepuje` (blok do zamknięcia od pierwszej daty z pliku), wynik w Import. Do dopisania w SKILL.md skilla trenera (przebuduj ZIP).
- 26.10: podgląd dla Claude: 5 ostatnich sesji każdej osoby (alfabetycznie, nieaktywni pominięci) zamiast 10 globalnie. Wyzwalacz bez zmian, plik odświeży się sam po wdrożeniu.
- 26.10: podgląd „Trening – podgląd dla Claude” / zakładka „Ostatnie sesje” (`apps-script/Podglad.gs`) dla agenta z konektorem Drive. Po scaleniu: w edytorze Apps Script uruchom raz `instalujPodglad`.
- 25.10 (v32): start bez klucza (iOS: aplikacja z ekranu głównego ma osobną pamięć i nie dostaje `?k=`) pokazuje pole „Wklej link od trenera lub kod” (`askKey`, lib `keyFrom`) zamiast komunikatu.
- 22.10 (v30–v31): zakładka Trener (wszystkie komentarze trenera), Przegląd `filmy_bez_kom_7dni`, Postęp → Tydzień. Klienci poinformowani.

## Do zrobienia

- **Plan v4 (`docs/plan-v4.md`): odświeżenie wyglądu i nowe funkcje.** PR 1 (v38, v39), PR 2 (v40), PR 3 (v41), PR 10 (v42) i PR 11 (v43) zrobione. Następny: PR 4 (rekord w chwili zapisu serii: szkic i pytanie, czy też w trybie PROSTY). Kolejność, zakres, miejsca w kodzie i pytania do Damiana są w tym pliku.

## Czeka na Damiana

- Decyzja o PR 2 (v40, gałąź wysłana, bez PR-a): czy okno „Trening zrobiony” jest gotowe; PR dopiero po zgodzie.
- Decyzja o PR 3 (v41, ta sama gałąź, bez PR-a): czy okno „Historia” jest gotowe.
- Decyzja o PR 10 (v42, ta sama gałąź). Po scaleniu: wpisać TAK w kolumnie N `edycja` zakładki Klienci u osób, które mają móc zmieniać trening (nagłówek `edycja` w komórce N1 dopisać ręcznie; aplikacja czyta kolumnę po pozycji), i dopisać flagę do SKILL.md skilla trenera.
- Decyzja o PR 11 (v43, ta sama gałąź): próba na telefonie, czy przypięta nazwa nie przeszkadza przy przewijaniu.

Wcześniejsze próby i sprawdzenia (v39, obwód, SKILL.md i ZIP, skala snu, iPhone, własny trening, kolejka filmów, ścieżka sztangi) Damian potwierdził 13.11 jako zrobione.

## Do obserwacji

- Czas ładowania przy rosnącym Logu (pole `ms`).
- Reakcje klientów na zakładkę Trener i Postęp → Tydzień (czy czegoś brakuje, czy coś myli).
- Zakładka Błędy i kolumna `bledy_7dni` w Przeglądzie: po kilku dniach zdecydować, czy dać sygnał.

## Propozycje (do wyboru)

- Krótkie podpowiedzi przy pierwszym użyciu zamiast długiej pomocy.
- Przegląd trenera na telefonie (osobna strona).
- Raport po bloku dla klienta.
- Porządek w bazie ćwiczeń: lista podejrzanych duplikatów Catalyst / free-exercise-db do decyzji.

## Po filmach testowych

- Tabela ruchów w kompleksie, korekta skosu kamery, automatyczne wykrycie talerza.

## Później

- Plan klienta z procentami bez kg: dopisać kg po poznaniu maksów.
- Flaga klienta dla Dyspozycji/Postępu; `masters = TAK` tam, gdzie trzeba.
- Wersja do sklepów (Android) z przypomnieniami, wysyłką filmów przy zamkniętej aplikacji i sygnałem końca przerwy w tle (lokalne powiadomienie planowane przy ✓).
- Sygnał przerwy, gdy klient jest w innej aplikacji: przeglądarka wstrzymuje stronę w tle, więc dźwięk i powiadomienie nie przychodzą. Decyzja 22.10: na razie bez zmian. Odrzucone obejścia: nagranie „cisza + sygnał” (przerywa muzykę klienta), Web Push (wymaga własnego serwera).
