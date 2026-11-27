# 2026-11-27 · Panel trenera v2, PR 2: Kalendarz i okno jednostki

## Zrobione

- Nowy ekran **Kalendarz** w menu (komputer: pod „Dziś”; telefon: dolne menu). Widok tygodnia (Pn–Nd, dziś w ramce) i miesiąca (dzień → jego tydzień), strzałki i „Dziś”. Na telefonie tydzień jest listą dni.
- Karta jednostki: klient, jednostka i tytuł, liczba ćwiczeń i serii, stan: ✓ zrobiona (czas, RPE, „prowadzony”), ● w trakcie (x z y serii), ! zaległa, „dziś”; przesunięta jednostka ma dopisek „w planie …”.
- Każdy aktywny klient ma swój kolor (pasek karty, kropka w filtrze): kolejność alfabetyczna, 8 kolorów `--k0…--k7` w obu motywach. Filtr „Wszyscy / klient” działa bez nowego zapytania.
- „Bez daty”: niezrobione jednostki trenera bez dnia z najbliższego takiego tygodnia klienta.
- **Okno jednostki** (klik w kartę): zrobiona = liczby sesji, ćwiczenia z planem i wykonanymi seriami, uwaga klienta, komentarz do sesji ze szkicem AI; niezrobiona = plan i „▶ Prowadź”. „Karta klienta ›”, ✕ / Esc, ← → (i przyciski na dole) = poprzednia / następna jednostka z kalendarza.
- Serwer: `trKalendarz(od, do)` (czysta `trKalendarz_` z testem; najwyżej `TR_KAL_DNI` = 62 dni). Dzień jednostki: Sesje.start, inaczej pierwsza zapisana seria, inaczej data z planu.
- Do sprawdzenia: panel → Kalendarz, kliknąć zrobioną jednostkę i niezrobioną, przejść strzałkami, przełączyć Miesiąc; czy kolory klientów są czytelne.

## Ustalenia

- Okno w tym PR tylko czyta (poza komentarzem do sesji). Przesuwanie i zmiany ćwiczeń w oknie to PR 3 (`docs/plan-panel.md`).
- Widok „Dzień” ze szkicu odłożony: tydzień na telefonie jest już listą dni.
- Okno korzysta z karty klienta (`trKlient`, pamięć strony `CK`), więc druga jednostka tego samego klienta otwiera się bez zapytania.
