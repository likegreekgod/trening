# 2026-11-26 · „Wstecz” zamyka okno (zgłoszenie Damiana z „Prowadź”)

## Zrobione

- W trybie „Prowadź” cofnięcie (gest albo przycisk „wstecz” telefonu) z okna, np. „⋯” ćwiczenia, „✎ zmień plan”, komentarza, wracało do panelu trenera, bo okno `#sheet` nie miało wpisu w historii przeglądarki. Teraz `openSheet` dokłada wpis (`shPush`), a „wstecz” zamyka okno i zostaje przy prowadzonym kliencie.
- Dotyczy wszystkich okien `#sheet` i wszystkich klientów (w PWA na Androidzie „wstecz” przy otwartym oknie też zamykał aplikację).
- Test UI: „Prowadź: „wstecz” telefonu zamyka okno…”.

## Ustalenia

- Zamknięcie okna przyciskiem zdejmuje wpis (`history.back()`, zdarzenie pomijane przez `SH_SKIP`), więc nie zostaje „pusty” krok wstecz; okno otwarte z okna (np. „⋯” → Komentarz) dostaje wpis po tym zdarzeniu, żeby jedno „wstecz” zamykało jedno okno.
- „Wstecz” bez otwartego okna dalej wychodzi z prowadzenia do panelu (jak „✕ Wyjdź”). Pełny ekran EMOM (`#emfs`) bez zmian.
