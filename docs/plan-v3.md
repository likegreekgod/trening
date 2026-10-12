# Plan v3: przegląd dla trenera, menu Trening, instruktaż i partie

Ustalenia z 12.10.2026 (decyzje w `docs/decyzje.md`). Każdy PR przechodzi `npm test`; zmiany w `web/` podbijają `VERSION` w `sw.js`.

| PR | Zakres | Gdzie | Stan |
|---|---|---|---|
| 1 | Zakładka `Przegląd` (klient × dziś, najpilniejsi na górze) + menu „Przegląd klientów” | arkusz | ✓ 12.10 |
| 2 | Menu Trening: „Odśwież linki”, „Zainstaluj wyzwalacze”, „Sprawdź arkusz” (diagnostyka). „Dodaj klienta” już jest (12.10, osobna sesja) | arkusz | ✓ 12.10 |
| 3 | Zakładka `Ćwiczenia` (baza 624 ćwiczeń Catalyst Athletics: nazwa, aliasy, film, partie, domyślne zamienniki, grupa); dopasowanie nazw z planów i kompleksów; przycisk „Jak wykonać” w aplikacji; serie twarde na partię w Podsumowaniu i w Postęp → Objętość | arkusz + aplikacja | ✓ 12.10 |
| 4 | Alert mailowy raz dziennie rano, tylko gdy pojawił się nowy czerwony sygnał; adres we właściwościach skryptu (menu „Ustaw adres alertu”) | arkusz | ✓ 12.10 |

Odłożone:
- wiadomość od trenera w aplikacji (na razie brak potrzeby);
- przypomnienia o treningu (dopiero w wersji ze sklepu: przeglądarka nie wyśle pewnego powiadomienia przy zamkniętej aplikacji).

## PR 1: zakładka Przegląd

Liczy `computeOverview_` razem z podsumowaniem (codziennie ok. 5:00 i z menu). Kolumny: klient, imie, pilnosc, do_reakcji, ostatni_trening, dni_temu, ten_tydzien (zrobione/plan), zalegle, status_tygodnia, uwagi_klienta, filmy_7dni, koniec_planu_dni.

`pilnosc` = 3 × sygnały czerwone + sygnały pomarańczowe; kolor komórki: ≥ 3 czerwony, ≥ 1 pomarańczowy, 0 zielony. To flagi do decyzji trenera, nie diagnoza.

| Sygnał | Poziom | Okno |
|---|---|---|
| ból > 3/10 (z miejscem) | czerwony | 7 dni |
| ≥ 2 FAIL w ćwiczeniu poza bojami w jednej jednostce | czerwony | 7 dni |
| dyspozycja „Zmęczenie” | czerwony | 3 dni |
| samopoczucie ≤ 2 | pomarańczowy | 7 dni |
| ≥ 2 spalone boje < 85% w jednostce | pomarańczowy | 7 dni |
| zamiana ćwiczenia z powodu bólu | pomarańczowy | 7 dni |
| dyspozycja „Uwaga” | pomarańczowy | 3 dni |
| jednostka zaległa: ≥ 2 dni po dacie z planu, niezrobiona | pomarańczowy | do 28 dni wstecz |
| brak treningu ≥ 7 dni | pomarańczowy | |
| plan kończy się za ≤ 7 dni, plan skończony albo brak planu | pomarańczowy | |

Dzień treningu to faktyczna data (`Sesje.start`), a dla serii bez zamkniętej sesji dzień zapisu (`Log.zapisano`).

## PR 4: alert mailowy

Wysyła poranny wyzwalacz `podsumowanie` (ok. 5:00), nigdy menu. Adres: właściwość skryptu `ALERT_EMAIL`, ustawiana z menu **Trening → Ustaw adres alertu**; pusta = alert wyłączony (tak jest domyślnie).

- Mail idzie tylko przy **nowym czerwonym sygnale** (ból > 3/10, ≥ 2 FAIL w ćwiczeniu, dyspozycja „Zmęczenie”). Sygnały pomarańczowe same maila nie wywołują, ale są dopisane przy kliencie, który ma czerwony.
- Ten sam sygnał nie wraca co rano: skrypt pamięta, o czym już napisał (`ALERT_SIG`).
- W mailu: imię (albo identyfikator) klienta, sygnały i link do arkusza. Trafia tylko na adres trenera.
- Po scaleniu trzeba raz zaakceptować nową zgodę Google (wysyłanie poczty): otwórz arkusz na komputerze i wybierz **Trening → Ustaw adres alertu**. Do tego czasu skrypt nie działa, więc scalaj, gdy nikt nie trenuje.
