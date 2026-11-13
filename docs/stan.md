# Stan projektu i lista zadań

Krótki punkt startowy dla nowej sesji: co działa, jak pracujemy, co czeka. Aktualizuj po każdym zadaniu (krótko, bez historii — historia jest w `docs/decyzje.md`). Bez danych klientów: repo jest publiczne.

Stan na 2026-11-13, aplikacja v39.

## Jak pracujemy

- Repo: `C:\Users\dt\Desktop\trening-repo`. Sesję Claude Code otwieraj w tym folderze, wtedy `CLAUDE.md` wczytuje się sam.
- Zmiana = gałąź → `npm test` (wszystko zielone) → push → link `compare/main...gałąź?expand=1&title=…&body=…` dla Damiana. Scala sam i pisze „ok”. Brak `gh`; stan sprawdzaj przez publiczne API GitHuba.
- Scalenie `web/**` publikuje aplikację (GitHub Pages; podbij `VERSION` w `web/sw.js`), scalenie `apps-script/**` wdraża skrypt (Action z clasp). `clasp push` z komputera jest zablokowany.
- Zmiany wyglądu: najpierw szkic do akceptacji, potem kod. Po każdym zadaniu odpowiedź kończy się listą zadań.
- Pomiar ładowania: `getData` zwraca `ms` z czasami etapów (16.10: skrypt 2,0–2,8 s, całość 3,3–4,8 s).
- Skill trenera dla claude.ai leży poza repo (`Desktop\hgvtjv\skill-aplikacja-treningowa-klienta`, zawiera identyfikatory arkusza). Po zmianie SKILL.md przebuduj ZIP.

## Ostatnio zrobione

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

- **Plan v4 (`docs/plan-v4.md`): odświeżenie wyglądu i nowe funkcje.** PR 1 zrobiony (v38) z poprawką v39. Następny: PR 2 (podsumowanie po treningu): szkic był pokazany 13.11, bez decyzji; odtwórz go i zapytaj o układ A / B oraz sposób porównania (opis w planie). Kolejność, zakres, miejsca w kodzie i pytania do Damiana są w tym pliku.

## Czeka na Damiana

- Scalenie v39 i próba na telefonie: czy karty mają dobrą wysokość, czy „⋯” w górnym pasku i w karcie nie chowa czegoś używanego na co dzień.
- Próba obwodu na telefonie (własny trening z obwodem albo plan z kolumną `obwod`): czy przewijanie do następnego ćwiczenia i przerwa 1:30 po rundzie pasują.
- Dopisanie do SKILL.md skilla trenera pola planu `obwod` (litera A–Z, min. 2 ćwiczenia po sobie w jednostce, bez EMOM) i przebudowanie ZIP-a.
- Uprzedzenie klientów, że od v35 sen ocenia się odwrotnie niż dotąd (7 = bardzo dobry).
- Sprawdzenie na iPhonie: aplikacja z ekranu głównego → wklejenie linku → plan.
- Próba własnego treningu.
- Wgranie ZIP-a skilla z 24.10 na claude.ai (skill zaktualizowany pod v31: nowe pola planu `tryb`, `ciecie`, `serie_min`, serie do 40, W… zarezerwowane, Klienci J/M, komentarze trenera, SKIP, nowe kolumny Przeglądu, menu, co widzi klient). Kopię SKILL.md trzymaj w `Desktop\hgvtjv\skill-aplikacja-treningowa-klienta`.
- Test kolejki filmów na telefonie (wyjście z aplikacji w trakcie wysyłki).
- Test ścieżki sztangi z nagrywaniem i 5–10 filmów testowych do strojenia analizy.

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
- Dopisywanie ćwiczeń do jednostek trenera (odłożone).
- Flaga klienta dla Dyspozycji/Postępu; `masters = TAK` tam, gdzie trzeba.
- Wersja do sklepów (Android) z przypomnieniami, wysyłką filmów przy zamkniętej aplikacji i sygnałem końca przerwy w tle (lokalne powiadomienie planowane przy ✓).
- Sygnał przerwy, gdy klient jest w innej aplikacji: przeglądarka wstrzymuje stronę w tle, więc dźwięk i powiadomienie nie przychodzą. Decyzja 22.10: na razie bez zmian. Odrzucone obejścia: nagranie „cisza + sygnał” (przerywa muzykę klienta), Web Push (wymaga własnego serwera).
