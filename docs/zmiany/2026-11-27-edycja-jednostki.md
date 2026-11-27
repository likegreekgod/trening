# 2026-11-27 · Panel trenera v2, PR 3: edycja w oknie jednostki i przeciąganie w kalendarzu

## Zrobione

- Kalendarz: niezrobioną jednostkę (czeka / zaległa, nie własny trening klienta) przeciąga się myszką na inny dzień, także z „Bez daty”. Komunikat nad kalendarzem („✓ Darek · T2 Siła góra → nd 22.11”).
- Okno niezrobionej jednostki: pole „Dzień” (zmiana od razu, okno zostaje) i „✎ Edytuj”.
- Tryb edycji w oknie: cała lista ćwiczeń z polami nazwa, A / B / K, serie, powt., kg, %, RPE ≤, uwagi; kolejność przez ⋮⋮ (przeciąganie), ↑ ↓ albo Alt + ↑ ↓ w dowolnym polu wiersza; ✕ usuwa (lista „Usunięte: … ↺” przywraca); „+ dodaj ćwiczenie” szuka w planie klienta i w bazie (nazwy i aliasy, ▶ = ma film, Enter dodaje pierwsze albo własną nazwę); „⛓ Połącz zaznaczone” / „Rozłącz” = obwód (nagłówek „Obwód A · na zmianę”, oznaczenia A1, A2); notatka do jednostki; dzień. Zmienione pole ma „było …”, nowe ćwiczenie jest podświetlone, na dole licznik zmian i błąd (np. rozdzielony obwód) przed zapisem.
- „Także kolejne tygodnie: T2 w tyg. 13–16 bloku B2 (niezrobione)”: kg i % o tę samą różnicę, pozostałe pola, nowa nazwa, nowe i usunięte ćwiczenia po nazwie; kolejność tylko w tygodniach z tym samym zestawem ćwiczeń.
- Esc i kliknięcie obok okna nie zamykają okna z niezapisanymi zmianami (✕ i „Anuluj” tak).
- Serwer: `trJednostka(id, e)` (czysta `trUnitEdit_` z testem: nr rozdane od nowa 1…n, ćwiczenie z wpisem w Logu zostaje na swoim numerze i nie da się go usunąć, nowe ćwiczenia z `Plan.zrodlo` = trener, usunięte wiersze znikają z Planu, zrobiona jednostka zablokowana), `trPrzesun(id, {week, day, date})` (czysta `trMove_`, reguła `unitsDone_`), `trCwNazwy` (baza do wyszukiwarki, jak `getExNames`).
- Do sprawdzenia: panel → Kalendarz, przeciągnąć jednostkę klienta testowego na inny dzień; w oknie „✎ Edytuj”: przestawić ćwiczenia, dodać jedno z bazy, połączyć dwa w obwód, zapisać z „Także kolejne tygodnie”; w arkuszu Plan numery, nowe wiersze (zrodlo = trener) i usunięty wiersz; u klienta w aplikacji nowa kolejność.

## Ustalenia

- Ćwiczenie usunięte przez trenera znika z Planu (nie zostaje śladem jak `usuniete` klienta).
- Obwód i dzień zmieniają się tylko w tej jednostce; kolejne tygodnie dostają nowe ćwiczenie na końcu, bez obwodu.
- Na telefonie bez przeciągania i bez „Połącz zaznaczone” (↑ ↓ i pole dnia działają).
- Ponowny import pliku z tym blokiem nadpisuje zmiany w niezrobionych jednostkach (jak „Edytuj” w karcie klienta).
