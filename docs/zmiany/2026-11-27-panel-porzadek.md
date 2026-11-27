# 2026-11-27 · Panel trenera v2, PR 1: porządek w menu i ustawieniach

## Zrobione

- Menu panelu: Dziś, Klienci, Filmy, a pod nagłówkiem „Warsztat” Biblioteka (dawne Ćwiczenia) i Rozliczenia (dawne Prowadzone). Bloki zniknęły z menu: są w kafelku na „Dziś”, w Skrzynce, w „Więcej” na telefonie i w karcie klienta.
- „Dziś”: „Wymaga uwagi” i „Odpowiedzi klientów” to jedna Skrzynka z filtrami (Wszystko, Sygnały, Filmy, Odpowiedzi, Bloki i plany, Pakiety). Tabela klientów i obciążenie 12 tygodni przeszły na ekran Klienci (sygnały jako pigułki pod imieniem, najpilniejsi na górze, kolumna „Ten tydzień”).
- Klient w jednym miejscu: ustawienia klienta są zakładką karty klienta (`#k/<id>/ustawienia`), podzieloną na sekcje: Aplikacja klienta, Co klient może zmieniać, Maile, Link i telefony, Asystent AI, Historia z innej aplikacji, Dane klienta (RODO). Na telefonie sekcje są przewijanym rzędem przycisków. Zakładka „Filmy · n” otwiera filmy tego klienta.
- Ustawienia panelu w sekcjach: Asystent AI (klucz i zasady), Maile, Dane i kopie.
- Stare adresy (`#klienci/<id>`, `#cwiczenia`, `#prowadzone`) przekierowują na nowe.
- Do sprawdzenia: panel → Klienci → klient → Ustawienia, przejść po sekcjach, zmienić coś w „Aplikacja klienta” i „Maile” i zapisać; na „Dziś” kliknąć filtry Skrzynki.

## Ustalenia

- Plan całości (5 PR-ów: porządek, kalendarz, edycja w okienku jednostki, plan bloku jako siatka, biblioteka i rozliczenia) w `docs/plan-panel.md`; szkice w dokumencie „Panel trenera v2” (27.11). Damian zaakceptował: kolor klienta w kalendarzu, tabela klientów z „Dziś” do Klientów, start od porządku.
- Pakiet zostaje w Przeglądzie karty klienta (pigułka w nagłówku przewija do niego); osobna sekcja „Pakiet” w ustawieniach dopiero razem z Rozliczeniami (PR 5).
- Formularz klienta ma jeden szkic na trzy sekcje (aplikacja, zmiany, maile): „Zapisz zmiany” zapisuje wszystkie, a podpis mówi, gdy zmiany są też w innej sekcji.
