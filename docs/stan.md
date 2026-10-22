# Stan projektu i lista zadań

Krótki punkt startowy dla nowej sesji: co działa, jak pracujemy, co czeka. Aktualizuj po każdym zadaniu (krótko, bez historii — historia jest w `docs/decyzje.md`). Bez danych klientów: repo jest publiczne.

Stan na 2026-10-21, aplikacja v29.

## Jak pracujemy

- Repo: `C:\Users\dt\Desktop\trening-repo`. Sesję Claude Code otwieraj w tym folderze, wtedy `CLAUDE.md` wczytuje się sam.
- Zmiana = gałąź → `npm test` (wszystko zielone) → push → link `compare/main...gałąź?expand=1&title=…&body=…` dla Damiana. Scala sam i pisze „ok”. Brak `gh`; stan sprawdzaj przez publiczne API GitHuba.
- Scalenie `web/**` publikuje aplikację (GitHub Pages; podbij `VERSION` w `web/sw.js`), scalenie `apps-script/**` wdraża skrypt (Action z clasp). `clasp push` z komputera jest zablokowany.
- Zmiany wyglądu: najpierw szkic do akceptacji, potem kod. Po każdym zadaniu odpowiedź kończy się listą zadań.
- Pomiar ładowania: `getData` zwraca `ms` z czasami etapów (16.10: skrypt 2,0–2,8 s, całość 3,3–4,8 s).
- Skill trenera dla claude.ai leży poza repo (`Desktop\hgvtjv\skill-aplikacja-treningowa-klienta`, zawiera identyfikatory arkusza). Po zmianie SKILL.md przebuduj ZIP.

## Czeka na Damiana

- Wysłanie klientom wiadomości o zmianach (tekst w rozmowie z 16.10; dopisać trening bez planu).
- Próba własnego treningu; wgranie nowego ZIP-a skilla na claude.ai.
- Test kolejki filmów na telefonie (wyjście z aplikacji w trakcie wysyłki).
- Test ścieżki sztangi z nagrywaniem i 5–10 filmów testowych do strojenia analizy.

## Do obserwacji

- Czas ładowania przy rosnącym Logu (pole `ms`).
- Zakładka Błędy i kolumna `bledy_7dni` w Przeglądzie: po kilku dniach zdecydować, czy dać sygnał.

## Propozycje (do wyboru)

- Podsumowanie tygodnia w Postępie.
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
- Wersja do sklepów (Android) z przypomnieniami i wysyłką filmów przy zamkniętej aplikacji.
