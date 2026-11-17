# Stan projektu i lista zadań

Krótki punkt startowy dla nowej sesji: co działa, jak pracujemy, co czeka. Aktualizuj po każdym zadaniu (krótko, bez historii — historia jest w `docs/decyzje.md`). Bez danych klientów: repo jest publiczne.

Stan na 2026-11-18, `main` = v65 (scalone PR #76: panel trenera PR 1–2, #77: marka „Siła z Ruchu”, #78: panel na telefonie i przełącznik aplikacja ↔ panel, #79: animacja po przerwie 30 minut i ikona „Duet”, #80: naprawa importu planu, #81: komentarz do sesji ze szkicem AI, #82: poprawka skoku CMJ, v57, #83: szkic AI tylko przy zapisanych seriach, v58, #84: światła RPE, v59); #85: klucz Claude API w panelu, v60, #86: filmy w panelu, v61, #87: film strumieniem, v62, #88: filmy przez service worker, v63, #89: zamknięcie bloku z AI, v64, #90: serie bez ✓ w panelu, format filmu, v65); v66 (odczyt formatu nie zawisa) na gałęzi `claude/project-thread-taywqw`.

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

- 18.11 (v66, na gałęzi): „Czarny obraz, a słychać dźwięk?” wisiało na „Sprawdzam plik…”. Teraz porady i wymiary obrazu pokazują się od razu, a kawałki pliku są czytane strumieniem z limitem bajtów i 20 s (gdyby Dysk zignorował Range albo nie odpowiedział).
- 17.11 (v65 + `apps-script/`, scalony PR #90): panel liczy też serie nagrane albo wpisane bez ✓ (np. rwanie z filmem): w sesji są szare z objaśnieniem, „✦ Szkic AI” działa, a AI wie, że nie były odhaczone (`trLogged_`). Film z samym dźwiękiem = komunikat z formatem odczytanym z pliku (kodek, wymiary, 10 bitów / HDR) i „Otwórz na Dysku”; pod odtwarzaczem „Czarny obraz, a słychać dźwięk?” z formatem i poradami (m.in. przyspieszenie sprzętowe w Edge). Czas filmu „1:010,0” poprawiony na „1:10,0”.
- 17.11 (v64 + `apps-script/`, scalony PR #89): panel trenera → zamknięcie bloku: w karcie klienta → Bloki pola „Wnioski (tylko Ty)” i „Dla klienta” (klient widzi w aplikacji: Postęp → Blok), zapis do zakładki Bloki (`trBlok`), „✦ Szkic AI” pisze oba teksty jednym zapytaniem (`trBlokSzkic`: wnioski do 5 zdań z liczbami i decyzją na następny blok, dla klienta 3–4 zdania bez żargonu i bez form zależnych od płci; poprawki Krócej / Cieplej / Inny szkic; bez zapytania, gdy blok nie ma serii). Lista „Bloki do zamknięcia” ma przycisk „Zamknij blok ›”.
- 17.11 (v63, scalony PR #88): naprawa filmów w panelu: v62 nie odtwarzał żadnego filmu, bo Dysk nie przyjmuje biletu w adresie. Teraz film idzie przez service worker panelu, który wysyła bilet w nagłówku i dociąga kawałki; przy pierwszym wejściu albo po błędzie film pobiera się w całości z paskiem postępu. Błędy podają kod i powód Dysku.
- 17.11 (v62, scalony PR #87): panel trenera → Filmy: film gra od razu, strumieniem z Dysku, zamiast czekać na pobranie całego pliku; przy przewijaniu i klatce po klatce przeglądarka dociąga tylko potrzebny kawałek. Pod filmem rozmiar pliku. Bilet wygasły w trakcie oglądania odnawia się sam.
- 17.11 (v61 + `apps-script/`, scalony PR #86): panel trenera → Filmy: własny odtwarzacz zamiast okienka Dysku (film pobierany do przeglądarki przez `trFilm`, klatka po klatce, ¼× / ½× / 1×, pętla, pełny ekran, powiększanie palcami albo kółkiem myszy, skróty klawiszowe; na telefonie „‹ Film n z m ›” zamiast listy) i komentarz do serii z „⏱ Wstaw chwilę” (`trKomentarzFilm` → Log `komentarz_trenera`, klient widzi go w zakładce Trener; kreski na pasku przewijają film). Szkic AI komentarza do sesji krótszy: najwyżej 4 zdania, bez wyliczania zrobionych ćwiczeń, na koniec jedna decyzja z liczbą.
- 17.11 (v60 + `apps-script/`, scalony PR #85): panel trenera → Ustawienia (link na dole menu, też na telefonie): pole na klucz Claude API (`trAI`, `trUstawAI`). Klucz sprawdzany bezpłatnie w Anthropic przed zapisem, trafia do właściwości skryptu, panel pokazuje tylko 4 ostatnie znaki; „Usuń klucz” po drugim dotknięciu. Powód: menu „Trening” nie działa w Arkuszach na telefonie.
- 17.11 (v59, scalony PR #84): wysiłek serii jednym dotknięciem światła, jedna skala w całej aplikacji: Lekko = RPE 7, Średnio = 8, Ciężko = 9, Nieudana = FAIL (boje: Walka 9 zamiast 9,5; PROSTY bez „Max”). Bez wartości domyślnej: ✓ bez światła = puste RPE. W PRO „Dokładniej” (np. 8,5). Do dopisania w SKILL.md skilla trenera: tabela świateł i „puste RPE = brak danych” (przebuduj ZIP).
- 17.11 (v58 + `apps-script/`, scalony PR #83): szkic AI nie wydaje pieniędzy na pustą sesję: gdy klient nie zapisał w jednostce żadnej serii (np. tylko „Zakończ”), panel nie pokazuje „✦ Szkic AI”, a skrypt i tak nie wyśle zapytania (`trSzkicSets_`). Komentarz można dalej napisać ręcznie.
- 17.11 (v57, scalony PR #82): Dyspozycja, poprawka błędnego skoku CMJ: okno „Zmierz skok z filmu” ma wybór „Zapisz jako Skok 1 / 2 / 3” (przy trzech wpisanych domyślnie skok najdalej od mediany, czyli pomyłka), a komunikat o odstającym skoku mówi wprost, że pole można poprawić. Wcześniej pomiar z filmu przy pełnych polach zawsze nadpisywał Skok 1.
- 17.11 (v56 + `apps-script/`, scalony PR #81): panel trenera: komentarz do sesji wpisywany w karcie klienta → Sesje (`trKomentarz`, kolumna Sesje `komentarz_trenera`, klient widzi go w zakładce Trener) i „✦ Szkic AI” przez Claude API (`trSzkic`, poprawki Krócej / Cieplej / Bardziej technicznie / Inny szkic, limit 30 dziennie, koszt każdego szkicu w zakładce „AI”). AI tylko szkicuje, zapisuje trener.
- 17.11 (`apps-script/`, scalony PR #80): naprawa importu planu: plik usuwa niezrobione jednostki tylko z bloków, które sam zawiera (wcześniej kasował niezrobione jednostki innych bloków klienta), jednostka z serią w Logu liczy się jako zrobiona, każde usunięcie jest w Import („usunięto: …”, status „OK (usunięto N)”). Do dopisania w SKILL.md skilla trenera (przebuduj ZIP).
- 17.11 (v55, scalony PR #79): animacja otwarcia przy każdym wejściu po co najmniej 30 minutach bez aplikacji (uruchomienie albo powrót do aplikacji z tła) zamiast raz dziennie; w trakcie treningu się nie pokazuje. Nowa ikona „Duet” (tor sztangi, linia tańca i talerz z animacji) na ekranie głównym, w karcie przeglądarki i w nagłówku aplikacji; pliki rysuje `tools/make-icons.js`.
- 17.11 (v54, scalony PR #78): przełącznik między aplikacją a panelem: w aplikacji na ekranie Trener przycisk „Panel trenera” tylko na urządzeniu, na którym ktoś raz zalogował się do panelu (`tr_dev` w localStorage, zostaje po wylogowaniu), w panelu „Mój trening ›” otwiera aplikację z kluczem zapamiętanym w tej przeglądarce. Klienci go nie widzą, bo do panelu wpuszcza tylko adres trenera.
- 17.11 (v54, scalony PR #78): panel trenera na telefonie: górny pasek nie rozciąga się na pół ekranu przy krótkiej stronie, „Przelicz teraz” i „Wyloguj” widoczne, pusta lista filmów bez podwójnego komunikatu. Logowanie Damiana działa (projekt Google Cloud „Panel trenera”, właściwości skryptu wpisane).
- 17.11 (v53, scalony PR #77): marka „Siła z Ruchu”: nowa nazwa tam, gdzie widzi ją klient (pod ikoną, w karcie przeglądarki, w nagłówku przed planem), i animacja otwarcia (tor sztangi w rwaniu, linia tańca, napis; 3,3 s, dotknięcie pomija).
- 17.11 (v52 + `apps-script/`, scalony PR #76): panel trenera PR 1 i 2 (`docs/plan-panel.md`): logowanie Google, pulpit z klientami i sygnałami, karta klienta, filmy oglądane w panelu, bloki do zamknięcia. Tylko odczyt; zapisy w PR 3.
- 17.11 (`apps-script/`): bezpieczeństwo: stara wersja aplikacji (link `/exec?k=`) wyłączona, `doGet` zwraca tylko tekst; przegląd repo bez danych klientów.
- 17.11 (v51): pierwszy zapis ćwiczenia głównego bez historii pokazuje „★ Pierwszy wynik” zamiast niczego.
- 17.11 (v50): poprawki po próbie v44–v48: seria bez RPE liczona do rekordu jak RPE 10, „★ rekord” w zwiniętej karcie, licznik podpowiedzi tylko z niewidzianych, „Wyczyść trening” pod „⋯” górnego paska.
- 17.11 (v49 + `apps-script/`): plan v4 PR 9: raport po bloku w Postęp → Blok (wykonanie, tonaż, czas, siła, jak było, notatka trenera z kolumny Bloków `dla_klienta`) i notatka trenera do jednostki (kolumna Planu `uwagi_jedn`, karta „Od trenera” nad treningiem).
- 16.11 (v48): plan v4 PR 8: tryb skupienia, jedno ćwiczenie na ekranie (włączany pod „⋯” w górnym pasku, pasek „Ćwiczenie n z m”, „Następne”, przesunięcie palcem, podsumowanie jako ostatni krok).
- 16.11 (v47): plan v4 PR 7: podpowiedzi przy pierwszym użyciu, cztery dymki po kolei (✓, „⋯”, kamera, dzień w pasku), każdy raz; długa ściągawka w PROSTYM zwinięta na dole Treningu.
- 16.11 (v46): plan v4 PR 6: timer przerwy z grubym paskiem u góry i czerwonymi ostatnimi 10 s, puste stany jako karty z ikoną, płynne zwijanie kart i krótki ruch ✓.
- 16.11 (v45): plan v4 PR 5: karta „dziś” nad paskiem tygodnia (ile ćwiczeń, serii i minut, „Zacznij” / „Dalej” / „Zakończ”, postęp w trakcie).
- 15.11 (v44): plan v4 PR 4: rekord w chwili zapisu serii, pasek „★ Rekord” pod najlepszą serią ćwiczenia głównego (PRO z liczbami, PROSTY bez).
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

- **Panel trenera (`docs/plan-panel.md`)**: PR 1 i 2 zrobione (scalony PR #76), dalej PR 3 (zapisy trenera), PR 4 (Claude API: szkic komentarza do sesji), PR 5 (asystent planu).
- **Plan v4 (`docs/plan-v4.md`): odświeżenie wyglądu i nowe funkcje.** PR 1 (v38, v39), PR 2 (v40), PR 3 (v41), PR 4 (v44), PR 5 (v45), PR 6 (v46), PR 7 (v47), PR 8 (v48), PR 9 (v49), PR 10 (v42) i PR 11 (v43) zrobione. Plan v4 zamknięty; następne zadanie do wyboru z „Propozycji”. Kolejność, zakres, miejsca w kodzie i pytania do Damiana są w tym pliku.

## Czeka na Damiana

- Szkic AI (po scaleniu v56): klucz Claude API z console.anthropic.com wpisać przez menu „Trening → Ustaw klucz Claude API” albo w edytorze Apps Script jako właściwość `CLAUDE_API_KEY` (kroki w `docs/plan-panel.md`, „Szkic AI”). Bez klucza panel działa, a przycisk „Szkic AI” pokazuje, co zrobić.
- Próba v55 na telefonie: animacja po przerwie 30 minut (zaraz po zamknięciu i otwarciu jej nie ma), nowy znak w nagłówku aplikacji oraz nazwa i ikona na ekranie głównym (Android zwykle podmienia sam w ciągu kilku dni, iPhone dopiero po usunięciu ikony i ponownym dodaniu do ekranu głównego; aplikacja poprosi wtedy o link albo kod).
- Próba v51 („★ Pierwszy wynik”) na telefonie.
- Po scaleniu PR #65: wpisać TAK w kolumnie N `edycja` zakładki Klienci u osób, które mają móc zmieniać trening (nagłówek `edycja` w komórce N1 dopisać ręcznie; aplikacja czyta kolumnę po pozycji), i dopisać flagę do SKILL.md skilla trenera.
- Próba na telefonie: okno „Trening zrobiony”, „Historia”, przypięta nazwa przy przewijaniu, komentarz w oknie.

Wcześniejsze próby i sprawdzenia (v39, obwód, SKILL.md i ZIP, skala snu, iPhone, własny trening, kolejka filmów, ścieżka sztangi) Damian potwierdził 13.11 jako zrobione.

## Do obserwacji

- Czas ładowania przy rosnącym Logu (pole `ms`).
- Reakcje klientów na zakładkę Trener i Postęp → Tydzień (czy czegoś brakuje, czy coś myli).
- Zakładka Błędy i kolumna `bledy_7dni` w Przeglądzie: po kilku dniach zdecydować, czy dać sygnał.

## Propozycje (do wyboru)

- Przegląd trenera na telefonie (osobna strona).
- Porządek w bazie ćwiczeń: lista podejrzanych duplikatów Catalyst / free-exercise-db do decyzji.

## Po filmach testowych

- Tabela ruchów w kompleksie, korekta skosu kamery, automatyczne wykrycie talerza.

## Później

- Plan klienta z procentami bez kg: dopisać kg po poznaniu maksów.
- Flaga klienta dla Dyspozycji/Postępu; `masters = TAK` tam, gdzie trzeba.
- Wersja do sklepów (Android) z przypomnieniami, wysyłką filmów przy zamkniętej aplikacji i sygnałem końca przerwy w tle (lokalne powiadomienie planowane przy ✓).
- Sygnał przerwy, gdy klient jest w innej aplikacji: przeglądarka wstrzymuje stronę w tle, więc dźwięk i powiadomienie nie przychodzą. Decyzja 22.10: na razie bez zmian. Odrzucone obejścia: nagranie „cisza + sygnał” (przerywa muzykę klienta), Web Push (wymaga własnego serwera).
