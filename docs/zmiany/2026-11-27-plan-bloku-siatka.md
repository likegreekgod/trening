# 2026-11-27 · Panel trenera v2, PR 4: plan bloku jako siatka

## Zrobione

- Karta klienta → Plan na komputerze: siatka bloku (wiersz = tydzień, kolumny Pn–Nd, „bez dnia”, gdy jest jednostka bez daty). Nad nią wybór bloku (z liczbą zrobionych jednostek), „+ Tydzień n”, „Kopiuj tydzień…” i przełącznik „Siatka / Lista” (lista = dotychczasowy widok z „Edytuj” w miejscu). Na telefonie zostaje lista.
- Klik w jednostkę = to samo okno co w kalendarzu (podgląd, „✎ Edytuj”, dzień, „▶ Prowadź”); ← → przechodzą po jednostkach bloku.
- Przeciągnięcie niezrobionej jednostki na inny dzień tego tygodnia = nowy dzień (`trPrzesun`). Z Shift = kopia, także do innego tygodnia i ze zrobionej jednostki (`trKopiuj`). Bez Shift do innego tygodnia = komunikat.
- „+ Tydzień n” kopiuje ostatni tydzień bloku do następnego numeru (wyłączony, gdy ten numer jest już w planie). „Kopiuj tydzień…” = wybrany tydzień bloku do dowolnego tygodnia (daty o tyle tygodni dalej).
- Serwer: `trKopiuj(id, {units, toWeek, date?, shift?})`, czysta `trCopy_` z testem: wszystkie kolumny Planu bez wierszy usuniętych / dodanych przez klienta i bez własnych treningów; zajęty kod dnia w docelowym tygodniu = następny wolny numer (T1 → T4); Log i Sesje bez zmian.
- Do sprawdzenia: karta klienta testowego → Plan: „+ Tydzień”, przeciągnięcie jednostki, kopia z Shift, „Kopiuj tydzień…”; w arkuszu Plan nowe wiersze z tygodniem, dniem i datą; u klienta w aplikacji nowy tydzień.

## Ustalenia

- Kopia nie zmienia kg (progresję robi się potem w oknie jednostki „✎ Edytuj” z „Także kolejne tygodnie”).
- Tydzień w siatce = numer tygodnia z planu, kolumna = dzień z daty; przeciąganie bez Shift nie zmienia numeru tygodnia (id serii zawiera tydzień).
