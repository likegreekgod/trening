# Decyzje projektowe

Repozytorium jest publiczne, dlatego w tym pliku nie ma imion klientów, danych zdrowotnych, adresów e-mail ani identyfikatorów arkusza i folderów Drive. Nowe ustalenia dopisuj na górze, z datą.

## 2026-10-18 · Inne kolory na Samsungu, kontrolka multimediów

- Na S24 aplikacja miała czarny nagłówek, ciemnoczerwoną kapsułę w menu i szare karty: telefon automatycznie przyciemniał jasny motyw (tryb ciemny Samsunga / „ciemne strony” w przeglądarce), bo strona deklarowała w CSS tylko jasny. Teraz `<meta name="color-scheme" content="light dark">`: system widzi, że aplikacja ma własny ciemny motyw, i jej nie przyciemnia.
- Klienci J pokazywała dalej tylko TAK/NIE: listy rozwijane ustawiał jednorazowy `setup()`. Teraz odświeża je też menu „Odśwież linki klientów” (`klienciListy_`).
- Ekran Dyspozycja pokazuje pod formularzem kartę „Ostatnie pomiary” (7 ostatnich dni: werdykt, ankieta, CMJ, prędkość); wykresy całej historii zostają w Postęp → Dyspozycja.
- Sprawdzone na S24: kolory psuło przyciemnianie w Samsung Internet (aplikacja zainstalowana z Chrome wygląda poprawnie; meta `color-scheme` nie wystarcza dla Samsung Internet). W Samsung Internet aplikacja pokazuje na Treningu podpowiedź, żeby otworzyć link w Chrome; „Rozumiem” chowa ją na stałe w tym telefonie.
- Po sygnale przerwy Android pokazywał pływającą kontrolkę multimediów. Kontekst dźwięku jest teraz wstrzymywany chwilę po sygnale i wznawiany przy następnym.

## 2026-10-17 · Uwagi z testów 16–17.10: EMOM, komentarz do ćwiczenia, pomijanie, pasek tygodnia, CMJ, sygnał przerwy

- **Więcej serii i EMOM.** Limit serii ćwiczenia 40 (plan, własny trening, walidacja importu; było 10). EMOM rozpoznajemy po kolumnie planu `tryb` = EMOM albo po nazwie zaczynającej się od „EMOM”: w karcie zegar minut z sygnałem co minutę i jeden przycisk „+ runda”, który zapisuje kolejną serię z ciężarem i powtórzeniami poprzedniej. Rund może być więcej niż w planie (seria n+1… jak dodatkowe, format Logu bez zmian), bez przerwy po serii i bez samozwijania karty.
- **Komentarz do ćwiczenia** zapisujemy w istniejącej kolumnie Log `uwagi`, ten sam we wszystkich seriach ćwiczenia (bez nowej kolumny i bez nowego wiersza). Zmiana komentarza po zapisanych seriach poprawia je wszystkie (`logNote`); bez zapisanej serii idzie z pierwszą. Podsumowanie_cw: kolumna `uwagi_klienta`. Skill trenera w claude.ai trzeba uzupełnić osobno (czytanie `uwagi` i nowych kolumn) — nie da się tego zrobić z repo.
- **Pomijanie ćwiczeń.** Opcjonalne (B): „Pomiń” bez powodu, nie obniża `wykonanie_%` (w Podsumowaniu nowa kolumna `opcjonalne` = zrobione/plan). Główne i korekcyjne: „Pomiń…” z powodem (brak czasu / ból / sprzęt / inne + opis), liczą się do wykonania i są sygnałem pomarańczowym w Przeglądzie (7 dni). Zapis: jeden wiersz Logu na ćwiczenie, seria 0, typ `SKIP`, powód w `uwagi` („skrócone do 2 z 4 serii · brak czasu” przy skróceniu). Seria 0 nie koliduje z istniejącymi wartościami, a `wykonane` jest puste, więc tonaż, serie i e1RM liczą się bez zmian. „Przywróć” usuwa ten wiersz.
- **„Skróć trening”**: klient podaje, ile ma minut; aplikacja proponuje cięcia w kolejności z nowej kolumny planu `ciecie` (najpierw do `serie_min`, potem całe ćwiczenie), szacując serię na 45 s + przerwę wg priorytetu. Bez `ciecie` w jednostce: tylko B od końca, A i K nigdy automatycznie. Klient zatwierdza listę jednym dotknięciem.
- **Zamiana ćwiczeń**: Klienci J `zamiana` = NIE / TRENER / DOWOLNA. Dawne TAK = TRENER (zgodność). TRENER = tylko zamienniki z planu i bazy (bez własnej nazwy, którą wcześniej dało się wpisać), DOWOLNA = wyszukiwarka całej bazy Ćwiczenia + własna nazwa. Powód i zapis `zamiana` bez zmian. U Damiana kolumnę trzeba wypełnić ręcznie.
- **Pasek tygodnia Pn–Nd** na górze Treningu i Planu (zastępuje zakładki tygodni planu i pasek dni). Tydzień kalendarzowy; w nagłówku blok i numer tygodnia **bloku**. Jednostka stoi w dniu faktycznym (Sesje.start), a niezrobiona w dniu z planu albo przesuniętym. Stany: ✓ zrobiona, ! zaległa, ● dziś (dzień dzisiejszy w obramowaniu), wolny dzień wyszarzony. Dotknięcie otwiera jednostkę (dwie tego dnia → wybór), przytrzymanie → zmiana dnia, ◀ ▶ i przesunięcie palcem zmieniają tydzień, „Dziś” wraca. Domyślnie dzisiejsza niezrobiona jednostka, potem najbliższa następna.
- **Zmiana daty** (zgłoszenie z S24, PWA): przycisk był przezroczystym polem daty nałożonym na etykietę; Android w trybie zainstalowanej aplikacji potrafi takiego pola nie otworzyć. Teraz okno z widocznymi przyciskami dni (3 tygodnie) i zwykłym, widocznym polem daty jako zapas. Zrobiona jednostka: komunikat zamiast martwego przycisku. Po zapisie zawsze komunikat: sukces, odrzucenie przez serwer z powodem albo „brak sieci — zapiszę później”.
- **Ekran Dyspozycja nachodził na ankietę**: przyczyna to nazwa klasy — karta werdyktu dostawała klasę `ok` (poziom), a `.ok` to styl przycisku ✓ z wysokością 44 px i kolorem linii. Karta miała więc 44 px, a powody wylewały się na ankietę, blade. Poziomy mają teraz klasy `lv-*`; test sprawdza, że treść mieści się w karcie przy 360 i 412 px. Po zapisie: werdykt na górze, pomiary zwinięte do jednej linii z „Edytuj”.
- **Brak historii ≠ dobra dyspozycja.** Do 5 zapisanych dni aplikacja pokazuje „Zbieram Twoją średnią · n/5 pomiarów” (wyniki bez ocen), także w banerze na Treningu. Arkusz dalej zapisuje werdykt.
- **CMJ z filmu.** Odbicie = pierwsza klatka, na której oba palce są już nad podłożem; lądowanie = pierwsza klatka kontaktu (wcześniej „ostatnia na ziemi”). Instrukcja z dwoma przykładowymi kadrami, krokowanie ◀ ▶. Klatkaż czytamy z pliku (MP4/MOV: ścieżka wideo, a w nagraniach z Androida także `com.android.capture.fps`) i pokazujemy „Wykryto: N kl./s” z ręczną zmianą (30/60/120/200/240). Plik ≤ 30 kl./s z „slow” w nazwie (DJI Mimo, Android) = ostrzeżenie. Wzór bez zmian: h = g·t²/8 (Balsalobre-Fernández i in. 2015).
- **Rozrzut skoków**: skok różny od mediany o > 8% → „Skok X odstaje — sprawdź zaznaczenie lub powtórz”; klient może go wykluczyć ze średniej (`cmj_sr`). Wykluczony zostaje w cmj1–3, numer w nowej kolumnie Dyspozycja `cmj_wykluczone`. Miarą główną zostaje średnia (Claudino i in. 2017).
- **Film CMJ** idzie tą samą kolejką co filmy serii do `Trening – Klienci/<Imię>/Dyspozycja/<data>/`; link w nowej kolumnie Dyspozycja `film_link` (kilka filmów rozdzielonych „ ; ”, `logReadyVideo`). Domyślnie wysyłany, klient może to wyłączyć w oknie analizy.
- **Pole ciężaru i powtórzeń**: propozycja (z planu, z poprzedniej serii, drop ~80%) to szary placeholder, pole jest puste; pierwsza cyfra to od razu nowa wartość. ✓ przy pustym polu zapisuje propozycję i wpisuje ją do pola (pełny kolor = to, co trafia do Logu). Pole z wartością zaznacza się przy dotknięciu. Zastępuje wpisywanie szarych wartości do pola z 15.10.
- **Sygnał końca przerwy** (cisza na S24 przy wyciszonym telefonie): dźwięk odblokowywany przy ✓ (gest), czas z różnicy zegara i osobny budzik na koniec, 3 sygnały 880 Hz, wibracja 300-150-300-150-600, mignięcie ekranu; w tle powiadomienie przez service worker (zgoda prośbą przy pierwszej przerwie). Ustawienia przy timerze (♪): dźwięk, głośność, wibracja, krótka wibracja 10 s przed końcem (domyślnie wyłączona), „Sprawdź sygnał”. Ekran nie gaśnie od pierwszego wpisu do „Zakończ” (bez zmian). iPhone: bez wibracji z przeglądarki, opisane w ustawieniach. Do sprawdzenia na telefonie: ekran zgaszony i aplikacja w tle (przeglądarka może opóźnić sygnał; w tle zostaje powiadomienie).
- **Zwijanie kart K**: wszystkie kategorie korzystają z tej samej karty i logiki. Przyczyną było to, że po ręcznym dotknięciu nagłówka karta zapamiętywała stan i przestawała się sama zwijać; teraz zwija się zawsze, gdy ćwiczenie staje się zrobione (wszystkie serie odhaczone albo pominięte). Doszło „Zwiń zrobione” nad ćwiczeniami.
- **Logo A „Kolumna-sztanga”**: nowe ikony PWA (any, maskable, monochrome), favicony, apple-touch-icon, znak w nagłówku. Zainstalowaną aplikację może trzeba usunąć i dodać ponownie, żeby zmienić ikonę.
- Przy okazji: w ciemnym motywie paski stanu kart (lewa krawędź: zrobione, dziś, werdykt) nie rysowały się, bo `--shadow: none` psuło listę cieni. Token ma teraz pusty cień.

### Do decyzji (nie wdrożone)

- **Rozgrzewka jako sygnał korekty serii roboczych** (pkt 15 z listy 17.10). Kierunek: ostatnia rozgrzewka może tylko *zaproponować* obniżenie ciężaru (nigdy w górę), np. VBT: spadek MCV o 0,06–0,10 m/s przy tym samym ciężarze → −5%, > 0,10 → −10% lub −1 seria; bez VBT: RPE rozgrzewki ≥ oczekiwane + 1,5 → −5%; ból > 3/10 w rozgrzewce → −1 seria i „zgłoś trenerowi”. Baner „Proponuję −5%…” [Przyjmij] [Zostaw plan]; przyjęcie zmienia placeholdery kg. Dane: `kg_plan`, `kg_propozycja`, `powod_korekty` na końcu Logu. Potrzeba decyzji trenera co do progów (kalibracja po 3–4 tyg. danych) i tego, czy RPE oczekiwane liczymy z %1RM (Jovanović i Flanagan 2014; Dorrell i in. 2020).
- **Analiza AI w aplikacji** (pkt 8). Przed wdrożeniem trzeba zdecydować: kto widzi analizę (tylko trener czy klient), gdzie trzymać klucz API (właściwości skryptu Apps Script albo osobny serwer — nigdy w repo ani w aplikacji), limit kosztów (np. dzienny limit wywołań), zgoda RODO (ból i dyspozycja to dane o zdrowiu, wysyłane do zewnętrznego dostawcy). Propozycja MVP: „Podsumuj jednostkę” tylko w trybie PRO / u trenera, wynik jako szkic w Sesje `komentarz_trenera` do akceptacji.

## 2026-10-12 · Aliasy i ćwiczenia spoza Catalyst

- Po wczytaniu bazy 98 nazw z planów klientów nie miało dopasowania (głównie polskie nazwy i akcesoria). Dopasowane ręcznie: 53 ćwiczenia z bazy dostały aliasy (`CW_ALIASY`), 15 ćwiczeń spoza Catalyst doszło jako wiersze bez filmu, z partiami (`CW_DODATKI`; nazwy jak w otwartej bazie free-exercise-db, domena publiczna). Z 98 nazw film ma teraz 69, same partie 17, bez dopasowania zostaje 12 (rotacje barku i biodra, kilka nietypowych).
- free-exercise-db nie ma filmów, tylko zdjęcia i opis po angielsku, więc bierzemy z niej nazwy i partie; link do filmu trener dopisuje w arkuszu.
- Kilka aliasów to przybliżenia do sprawdzenia przez trenera: hip thrust → Bench-Supported Glute Bridge, uginanie nóg leżąc → Hamstring Curl, Copenhagen adduction → Copenhagen Plank Lift.
- Poprawka trenera: alias wolno dać tylko temu samemu ćwiczeniu pod inną nazwą. Regresja albo wariant z innym sprzętem to osobne ćwiczenie: Hanging Knee Raise (regresja Hanging Leg Raise), Pin Overhead Squat (przysiad OHS z martwego punktu na dole), Ring Dip (dipy na kółkach), Push-Up Hold (izometria, nie pompka) mają własne wiersze bez filmu, a błędne aliasy są wycofane (`CW_WYCOFANE`, „Wczytaj bazę ćwiczeń” usuwa je z arkusza).
- „Wczytaj bazę ćwiczeń” można klikać wielokrotnie: dopisuje nowe ćwiczenia i aliasy, usuwa puste wiersze z samą nazwą, które mają już dopasowanie; ręcznych wpisów nie zmienia. Wiersz z samą nazwą nie zasłania aliasu.

## 2026-10-16 · Niezawodność: szybsze otwarcie, bezpieczny zapis, zakładka Błędy

- Pomiar 16.10 (profil trenera): otwarcie aplikacji 4–5 s, odpowiedź 230 KB, w tym 40 KB listy ćwiczeń potrzebnej tylko przy własnym treningu. Lista idzie teraz osobno (`getExNames`, w telefonie na dobę), a zakładka Ćwiczenia jest w pamięci podręcznej skryptu (6 h; czyszczona po menu i każdej ręcznej edycji zakładki przez `onEdit`). `getData` zwraca `ms` z czasami etapów, żeby mierzyć dalej, zanim ruszymy Log.
- Własny trening nie przepisuje już całej zakładki Plan (ryzyko nadpisania ręcznej zmiany trenera): usuwa tylko swoje wiersze i dopisuje nowe na końcu.
- Zakładka **Błędy**: aplikacja zgłasza błędy skryptu, zapisy odrzucone przez serwer, zapisy czekające w kolejce ponad dobę mimo sieci i filmy, których nie udało się wysłać. Najwyżej 5 dziennie na klienta, ten sam opis raz dziennie, ostatnie 3000 wpisów. W Przeglądzie kolumna `bledy_7dni` (bez sygnału: najpierw zobaczymy, ile tego jest).

## 2026-10-16 · Własny trening klienta

- Klient może złożyć trening poza planem: Plan → „+ własny trening”, ćwiczenia z wyszukiwarki (najpierw z jego planu, potem cała baza) albo pod własną nazwą. Robi go jak każdy inny (serie, filmy, przerwy, podsumowanie) i może dopisać ćwiczenia („+ ćwiczenie”). Usunąć można tylko świeżo dodane, nie te z zapisanymi seriami.
- W arkuszu to jednostka W1, W2… w tygodniu planu, do którego należy data, w Planie z `zrodlo = klient`. Wczytanie nowego planu z Dysku jej nie kasuje.
- Nie liczy się do wykonania planu, jednostek w Blokach ani zaległych; liczy się do tonażu, obciążenia, serii na partię i Postępu. W Przeglądzie kolumna `wlasne_7dni` (bez sygnału).
- Własna nazwa ćwiczenia trafia do „Uzupełnij listę ćwiczeń”. Trener wpisuje w kolumnie `glowna` nazwę ćwiczenia z bazy: od razu działa jako alias (film, partie), a „Uzupełnij listę ćwiczeń” przenosi ją do aliasów ćwiczenia głównego i usuwa wiersz.
- Domyślnie dla wszystkich; Klienci M `wlasne` = NIE wyłącza. Dopisywanie ćwiczeń do jednostek trenera: na razie nie.

## 2026-10-15 · Dolne menu: kapsuła zamiast kreski

- Wybrana zakładka ma pomarańczową kapsułę za ikoną i pogrubiony podpis (wariant A z trzech pokazanych); kreska nad zakładką usunięta.

## 2026-10-15 · Seria jak poprzednia i pasek skoku ciężaru

- W ciemnym motywie pasy góra/dół są zielone jak w jasnym (czarny nie odcinał się od tła), z pomarańczową linią.
- „+ seria” tylko dla klientów z `dod_serie` (bez zmian, decyzja trenera).
- Ciężar i powtórzenia wpisane automatycznie (z planu albo z poprzedniej serii) są szare. Po ✓ i po ręcznej zmianie kolejne niezrobione serie przejmują wartości tej serii, ale tylko w polach szarych: wpisane ręcznie zostają.
- Pod pierwszą niezrobioną serią roboczą jest pasek −5 · −2,5 · ciężar · +2,5 · +5 (przytrzymanie ±2,5 = ±1 kg); zmienia tę serię i kolejne szare. Po ✓ przechodzi do następnej serii. Bez paska, gdy ciężar nie jest liczbą (BW).

## 2026-10-15 · Pasy, zwijanie ćwiczeń, opcje w tabeli

- Nagłówek i dolne menu to pełnoszerokie ciemne pasy (bez zaokrągleń), żeby oddzielały się od kart.
- Ćwiczenie zwija się do jednej linii (nazwa, „3 z 3 serii · tonaż · ✓”) po zapisaniu ostatniej serii roboczej i ekran przewija się do następnego; dotknięcie nazwy zwija i rozwija. Ręczny wybór zostaje zapamiętany w telefonie.
- Rząd przycisków pod seriami zastąpiły wiersze w tabeli (wybrany wariant C): „+ rozgrzewka” nad seriami, „+ seria” i „+ drop set” pod nimi. Talerze: dotknięcie podkreślonego ciężaru w recepcie. „Jak 1. seria” zastąpiło przenoszenie zmiany kg / powt. na kolejne niezrobione serie, które miały tę samą wartość.
- Zegar: start sprzed ponad 4 h bez zakończonego treningu to zapomniany start — zegar pokazuje „–”, a najbliższa zapisana seria liczy czas od nowa (trener widział 139 h).

## 2026-10-15 · Karty zamiast linii

- Trener: aplikacja wygląda chaotycznie i przytłaczająco. Wzór: osobne kafelki z odstępem. Każda sekcja (ćwiczenie, jednostka w Planie, karta Postępu, Dyspozycja, komentarze trenera) jest teraz kartą na jaśniejszym tle z zaokrągleniem i odstępem 14 px; kontrolki mają zaokrąglone rogi. Kolory, czcionki i rozmiary bez zmian; wszystkie przyciski dalej ≥ 44 px.

## 2026-10-14 · Kolejka filmów

- Uwaga klienta: aplikacja nie działa w tle, filmy wgrywają się ciężko. Przyczyna: film szedł jednym kawałkiem, więc wyjście z aplikacji albo wygaszony ekran zrywały wysyłkę, a ponowna próba szła od zera wolniejszą drogą przez serwer.
- Teraz film trafia do kolejki w telefonie (IndexedDB) i wysyła się kawałkami po 8 MB prosto do Google. Postęp jest zapisywany po każdym kawałku; po przerwie (aplikacja w tle, brak sieci, zamknięta aplikacja) wysyłka rusza od miejsca przerwania przy powrocie do aplikacji, odzyskaniu sieci albo następnym otwarciu. Okno kamery zamyka się od razu, klient trenuje dalej.
- Bez sieci film czeka w telefonie zamiast komunikatu „dodasz później”. Kamera przy serii z filmem w kolejce ma przerywaną ramkę; w oknie kamery jest stan wysyłki i „Usuń z kolejki”.
- Na czas wysyłki ekran nie gaśnie (Wake Lock), bo przeglądarka wstrzymuje stronę w tle. Wysyłka przy zamkniętej aplikacji będzie możliwa dopiero w wersji ze sklepu.
- Link do filmu zapisuje osobna funkcja `logVideo` (zmienia tylko film_link), żeby film wysłany później nie nadpisał nowszych danych serii.

## 2026-10-13 · Bloki i plany bez kilogramów

- Aplikacja jest nowa, więc pierwszy plan każdego klienta to blok B1. Menu „Uzupełnij puste bloki” wpisuje blok tam, gdzie go brakuje (ostatni blok klienta albo B1), po potwierdzeniu.
- Plan może mieć `procent` bez `kg`, gdy nie znamy jeszcze maksów klienta: klient wpisuje ciężar sam, a „max dziś”, propozycje ciężaru i statystyki intensywności dla bojów ruszą po dopisaniu kg.

## 2026-10-13 · Komentarze trenera do filmów

- Trener komentuje film klienta na Dysku Google (komentarz przypięty do czasu w filmie). Skrypt przepisuje komentarze do `Log.komentarz_dysk` przy serii z tym filmem: automatycznie co ok. 30 min (przy okazji wyzwalacza planów, bez nowego wyzwalacza) i z menu „Pobierz komentarze do filmów”. Sprawdzane są filmy z ostatnich 30 dni.
- Klient nie dostaje powiadomienia z Dysku (plik należy do trenera, klient nie ma do niego dostępu), więc widzi komentarze w aplikacji: karta „Trener skomentował” na górze Treningu, po „Przeczytane” lista pod przyciskiem. Zmieniony komentarz znów jest nowy.
- Uwagi bez filmu trener wpisuje ręcznie w `komentarz_trenera` (Log: do serii, Sesje: do całego treningu); skrypt tych kolumn nie rusza.
- Format czasu w komentarzu Dysku nie jest udokumentowany: `anchorSec_` rozpoznaje kilka zapisów, a nierozpoznany pokazuje w menu, żeby dało się go dopisać. Komentarz rozwiązany albo usunięty na Dysku znika z aplikacji.
- Powiadomienie na zablokowany telefon: dopiero w wersji ze sklepu.

## 2026-10-13 · Otwarta baza ćwiczeń i porządek w Planie

- Do zakładki Ćwiczenia dochodzą 762 ćwiczenia z free-exercise-db (domena publiczna), których nie było w bazie: nazwa i partia główna, bez filmu (ta baza ma tylko zdjęcia). Razem ok. 1400 wierszy. Pominięte: 111 pozycji, które są już w bazie pod tą samą nazwą lub aliasem, oraz 3 warianty bojów.
- Oczywiste odpowiedniki dostały aliasy zamiast osobnych wierszy (np. Barbell Squat → Back Squat, Standing Military Press → Press). Reszta nazw z free-exercise-db nie była przeglądana ręcznie: mogą się tam trafić ćwiczenia, które Catalyst ma pod inną nazwą.
- Decyzje trenera: Slow Snatch = Slow-Motion Snatch, Single Arm Cable Pull = Single-Arm Pulldown, Pause Clean = Segment Clean; Pushup Hold to osobne ćwiczenie.
- Plan wczytany pod złym identyfikatorem klienta (np. „kuba” zamiast „jakub-mikus”) zostawał w zakładce Plan. Menu „Usuń plany bez klienta” pokazuje takie wiersze i usuwa je po potwierdzeniu; Log i Sesje zostają.

## 2026-10-12 · Alert mailowy

- Mail tylko przy nowym czerwonym sygnale (ból > 3/10, ≥ 2 FAIL w ćwiczeniu, dyspozycja „Zmęczenie”). Pomarańczowe (zaległa jednostka, koniec planu, brak treningu) zostają w zakładce Przegląd: codzienny mail o nich szybko przestałby być czytany.
- Ten sam sygnał jest zgłaszany raz, a nie przez 7 dni, w których widać go w Przeglądzie.
- Wysyła tylko poranny wyzwalacz; kliknięcie „Odśwież podsumowanie” nie wysyła nic.
- Adres trenera siedzi we właściwościach skryptu (menu „Ustaw adres alertu”), nie w repo ani w arkuszu. Domyślnie alert jest wyłączony.
- Nowy zakres uprawnień (poczta) wymaga jednorazowej zgody właściciela zaraz po wdrożeniu.

## 2026-10-12 · Baza ćwiczeń (zakładka Ćwiczenia)

- Zakładka `Ćwiczenia` startuje z gotowej bazy: 624 ćwiczenia z biblioteki Catalyst Athletics z filmem na YouTube (`apps-script/Cwiczenia.gs`, menu „Wczytaj bazę ćwiczeń”). W repo są tylko nazwy, identyfikatory filmów i partie, bez opisów.
- Pierwsza wersja dopasowywała tylko dokładną nazwę i w prawdziwych planach trafiała w 14 z 57 ćwiczeń. Teraz: dokładna nazwa lub alias → nazwa podstawowa → te same słowa i skróty. W tych samych planach film ma 32 z 57; reszta to ćwiczenia spoza bazy albo nazwy do aliasu.
- Bez zgadywania po podobieństwie („Snatch Pull” to nie „Snatch”): zły film jest gorszy niż brak filmu. Na inne nazwy jest kolumna `aliasy`.
- Kompleks („Hang Clean + Jerk”) nie ma jednego filmu: aplikacja pokazuje osobny przycisk dla każdej rozpoznanej części, podpisany nazwą ćwiczenia. Kompleks, który ma własny wiersz w bazie, dostaje swój film.
- Partie mięśniowe: ćwiczenie liczy się do każdej partii głównej. Boje olimpijskie i ich warianty, mobilność i ćwiczenia techniczne nie mają partii, żeby rwania nie zawyżały serii twardych na pośladki i dwugłowe.
- „Jerk” w planach to domyślnie alias „Split Jerk” (do zmiany w arkuszu).
- Na później: klient dokłada własną jednostkę poza planem i wybiera ćwiczenia z tej bazy; plany pisane od razu nazwami z bazy (lista w skillu trenera).

## 2026-10-12 · Uwagi klientów po v2

- „Wszystko jak w planie” pokazywało „Zapisano 0 serii”, gdy klient odhaczył serie ręcznie, a przycisk został na ekranie. Teraz przycisk jest widoczny tylko, gdy są niezapisane serie z planu (znika po odhaczeniu, wraca po wyczyszczeniu serii).
- Przypadkowo włączony trening (czas rusza od pierwszego wpisu w pole): jeśli od startu minęło ponad 30 min bez żadnej zapisanej serii, pierwsza zapisana seria zaczyna liczenie od nowa; w podsumowaniu jest „Licz czas od teraz” (dwa dotknięcia) i pole „Popraw czas (min)”, także po zapisaniu jednostki.
- Czas dalej startuje od pierwszego wpisu, a nie od pierwszej zapisanej serii, żeby rozgrzewka i ustawianie sprzętu wchodziły do czasu treningu (sRPE-TL).

## 2026-10-12 · Plan v3 (przegląd dla trenera, menu Trening, instruktaż i partie)

Plan i stan: `docs/plan-v3.md`.

- Kolejność: zakładka `Przegląd` → menu Trening → zakładka `Ćwiczenia` z instruktażem i partiami → alert mailowy.
- Instruktaż i partia mięśniowa ze słownika w nowej zakładce `Ćwiczenia`, a nie z kolumn planu (wpis raz, działa we wszystkich planach).
- Alert mailowy raz dziennie rano i tylko przy sygnale do reakcji; adres we właściwościach skryptu, nie w repozytorium.
- Jednostka zaległa = niezrobiona ≥ 2 dni po dacie z planu (klienci przesuwają treningi).
- Wiadomość od trenera w aplikacji: pominięta (brak potrzeby). Przypomnienia o treningu: odłożone do wersji ze sklepu.
- „Dodaj klienta” w menu Trening dodała 12.10 osobna sesja Claude (commit wprost do `main`, wdrożony); kolejne zmiany znów przez PR-y.

## 2026-10-11 · v2 wdrożone (PR 1–11 z `docs/ui-v2-plan.md`)

- Wszystkie 11 PR-ów v2 scalone i opublikowane 09–11.10.2026; `npm test`: 74 testy (logika serwera, `web/lib.js`, UI w Playwright w obu motywach i trybach).
- Uzupełnienia względem specyfikacji, przyjęte w trakcie:
  - seria czekająca w kolejce offline zostaje żółta także po ponownym otwarciu aplikacji;
  - poprawka kg / powt. / RPE w zapisanej serii zapisuje się od razu;
  - bez kolumny planu `zamienniki` aplikacja podsuwa zamienniki wg wzorca ruchu, klient może wpisać własną nazwę;
  - kalendarz obciążenia: poziom dnia względem najcięższego dnia z 12 tygodni; skala w jednej barwie sprawdzona walidatorem kontrastu;
  - boje rozpoznawane po nazwie, gdy kolumna `grupa` jest pusta (jak w podsumowaniu); `grupa = I` wyłącza światła.
- Znane ograniczenia:
  - analiza ścieżki i VBT z filmu sprawdzona tylko na ruchu i obrazie syntetycznym; do walidacji z czujnikiem Enode na prawdziwym nagraniu;
  - koniec przerwy nie wibruje pewnie przy zablokowanym telefonie (dopiero wersja ze sklepu da powiadomienie);
  - film wymaga sieci (nie trafia do kolejki); analiza z filmu działa bez sieci;
  - pierwsze dni dyspozycji bez sygnałów, dopóki nie ma średnich (Hooper 7, CMJ i prędkość 5 wpisów).
- Skill trenerski w claude.ai przepisany pod v2 (11.10.2026): plan jako JSON w `_plany/`, kolumna `blok`, ciągła numeracja tygodni, `zamienniki`, czytanie zakładki `Bloki` przed nowym planem, wnioski po bloku; bez `Plan.gs` i bez zmian kodu w projekcie claude.ai. Plik skilla jest poza repozytorium (zawiera identyfikatory arkusza i folderu).
- Do zrobienia: wgrać nowy skill w claude.ai; test na telefonie prawdziwego wgrania filmu i analizy; decyzja, czy dyspozycję pokazywać wszystkim klientom, czy dodać flagę.

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
