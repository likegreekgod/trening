# Stan projektu i lista zadań

Krótki punkt startowy dla nowej sesji: co działa, jak pracujemy, co czeka. Aktualizuj po każdym zadaniu (krótko, bez historii — historia jest w `docs/decyzje.md`). Bez danych klientów: repo jest publiczne.

Stan na 2026-10-25, aplikacja v32.

## Jak pracujemy

- Repo: `C:\Users\dt\Desktop\trening-repo`. Sesję Claude Code otwieraj w tym folderze, wtedy `CLAUDE.md` wczytuje się sam.
- Zmiana = gałąź → `npm test` (wszystko zielone) → push → link `compare/main...gałąź?expand=1&title=…&body=…` dla Damiana. Scala sam i pisze „ok”. Brak `gh`; stan sprawdzaj przez publiczne API GitHuba.
- Scalenie `web/**` publikuje aplikację (GitHub Pages; podbij `VERSION` w `web/sw.js`), scalenie `apps-script/**` wdraża skrypt (Action z clasp). `clasp push` z komputera jest zablokowany.
- Zmiany wyglądu: najpierw szkic do akceptacji, potem kod. Po każdym zadaniu odpowiedź kończy się listą zadań.
- Pomiar ładowania: `getData` zwraca `ms` z czasami etapów (16.10: skrypt 2,0–2,8 s, całość 3,3–4,8 s).
- Skill trenera dla claude.ai leży poza repo (`Desktop\hgvtjv\skill-aplikacja-treningowa-klienta`, zawiera identyfikatory arkusza). Po zmianie SKILL.md przebuduj ZIP.

## Ostatnio zrobione

- 26.10: podgląd dla Claude: 5 ostatnich sesji każdej osoby (alfabetycznie, nieaktywni pominięci) zamiast 10 globalnie. Wyzwalacz bez zmian, plik odświeży się sam po wdrożeniu.
- 26.10: podgląd „Trening – podgląd dla Claude” / zakładka „Ostatnie sesje” (`apps-script/Podglad.gs`) dla agenta z konektorem Drive. Po scaleniu: w edytorze Apps Script uruchom raz `instalujPodglad`.
- 25.10 (v32): start bez klucza (iOS: aplikacja z ekranu głównego ma osobną pamięć i nie dostaje `?k=`) pokazuje pole „Wklej link od trenera lub kod” (`askKey`, lib `keyFrom`) zamiast komunikatu.
- 22.10 (v30–v31): zakładka Trener (wszystkie komentarze trenera), Przegląd `filmy_bez_kom_7dni`, Postęp → Tydzień. Klienci poinformowani.

## Do zrobienia (uwagi z 22.10)

- **Dyspozycja: skala snu odwrotna niż odczucie.** Ankieta Hoopera ma wszędzie 1 = dobrze (`HOOPER` w lib.js: Sen „1 = bardzo dobry”), ale sen kojarzy się z oceną jakości (wyżej = lepiej). Klienci się mylą. Do ustalenia: odwrócić tylko widok snu (zapis i `hooper_suma` bez zmian) albo zmienić opis/etykiety skrajnych przycisków.
- **Własny trening: brak kompleksów i serii obiegowych.** Klient składa tylko pojedyncze ćwiczenia (`openOwn` / `applyOwn`). Do zaprojektowania: kompleks „A + B” jako jedno ćwiczenie i obwód/superseria (grupa ćwiczeń robionych na zmianę).
- **Własny trening: brak „Jak wykonać”.** Jednostka złożona w telefonie ma `infos: []` (`applyOwn`), a linki dokłada dopiero `getData` przy następnym wczytaniu. Sprawdzić, czy pojawiają się po odświeżeniu; jeśli nie, dopasowanie nazwy z bazy (`exInfo_`) nie łapie nazw wybranych w wyszukiwarce.

## Czeka na Damiana

- Sprawdzenie na iPhonie: aplikacja z ekranu głównego → wklejenie linku → plan.
- Próba własnego treningu.
- Wgranie ZIP-a skilla z 24.10 na claude.ai (skill zaktualizowany pod v31: nowe pola planu `tryb`, `ciecie`, `serie_min`, serie do 40, W… zarezerwowane, Klienci J/M, komentarze trenera, SKIP, nowe kolumny Przeglądu, menu, co widzi klient). Kopię SKILL.md trzymaj w `Desktop\hgvtjv\skill-aplikacja-treningowa-klienta`.
- Test kolejki filmów na telefonie (wyjście z aplikacji w trakcie wysyłki).
- Test ścieżki sztangi z nagrywaniem i 5–10 filmów testowych do strojenia analizy.

## Do obserwacji

- Testy UI „Postęp → Tydzień” (light/dark) nie przechodzą od 26.10 także na czystym `main`: prawdopodobnie zależą od bieżącej daty. Do naprawy osobno.
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
- Dopisywanie ćwiczeń do jednostek trenera (odłożone).
- Flaga klienta dla Dyspozycji/Postępu; `masters = TAK` tam, gdzie trzeba.
- Wersja do sklepów (Android) z przypomnieniami, wysyłką filmów przy zamkniętej aplikacji i sygnałem końca przerwy w tle (lokalne powiadomienie planowane przy ✓).
- Sygnał przerwy, gdy klient jest w innej aplikacji: przeglądarka wstrzymuje stronę w tle, więc dźwięk i powiadomienie nie przychodzą. Decyzja 22.10: na razie bez zmian. Odrzucone obejścia: nagranie „cisza + sygnał” (przerywa muzykę klienta), Web Push (wymaga własnego serwera).
