# Panel → Ćwiczenia: ćwiczenia z planów bez filmu, martwe linki (punkt 7 przeglądu v80)

## Zrobione

- Panel trenera → Ćwiczenia (`#cwiczenia`; komputer: menu po lewej pod Bloki, telefon: Więcej → „Ćwiczenia bez filmu”): lista ćwiczeń z planów aktywnych klientów, które nie mają filmu „Jak wykonać”, od najczęstszych, z liczbą klientów i ostatnią datą; części kompleksu osobno.
- Przy każdym pole na link i „Zapisz” → link trafia do zakładki Ćwiczenia (`trCwFilm`), aplikacja klienta pokazuje go od razu.
- „Martwe linki”: co poniedziałek ok. 4:00 skrypt sprawdza linki do filmów w bazie (YouTube przez oEmbed); przycisk „Sprawdź teraz” robi to od razu.
- Nowy plik `apps-script/Instruktaz.gs` (`trCwiczenia_`, `cwFilm_`, `linkProbe_`, `linkStan_`, `sprawdzLinki`, `linkiWyzwalacz_`) z testami.
- Po scaleniu: Trening → Zainstaluj wyzwalacze (cotygodniowe sprawdzanie linków) albo w panelu „Sprawdź teraz”.

## Ustalenia

- Lista bierze tylko plany aktywnych klientów, bez wierszy `usuniete*`.
- Link zapisuje się w wierszu o tej samej nazwie (wiersze z `glowna` pomijane) albo w nowym wierszu; tylko http(s), do 500 znaków.
- Odpowiedź 404 / 410 / 400 = film usunięty, 401 / 403 = prywatny; inne kody (np. 429, 500) nie są zgłaszane, żeby chwilowa awaria nie dawała fałszywych alarmów.
- Wynik sprawdzenia we właściwości skryptu `CW_MARTWE`; jedno sprawdzenie trwa najwyżej 4,5 min.
