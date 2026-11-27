# 27.11.2026 · Nazwa sesji z panelu

## Zrobione

- Panel → karta klienta → Sesje: przy nagłówku sesji ✎ (`.sren`, `data-sren`). Otwiera sesję i pole „Nazwa sesji” (`snBox`, szkic `TN` tylko w pamięci strony); „Zapisz” / Enter zapisuje, Esc / „Anuluj” zamyka bez zapisu.
- Serwer: `trTytul(id, {week, day, title})` (TR_FNS) → czysta `trTitle_` z testem → `Plan.tytul` wszystkich wierszy jednostki (`trPlanSet_`). Działa też w zrobionej jednostce. Limit `TR_TITLE_MAX` = 40 znaków (jak „Tytuł” w kreatorze aplikacji).
- Klient widzi nową nazwę w aplikacji (Trening, Plan, komentarze), trener w Przeglądzie, Sesjach, porannym mailu i podglądzie dla Claude.
- Do sprawdzenia: panel → klient testowy → Sesje → ✎ → nowa nazwa; w arkuszu Plan.tytul tej jednostki, w aplikacji klienta nagłówek treningu.

## Ustalenia

- Zmienia się tylko tytuł. Tydzień i jednostka (T2, W1 …) zostają, bo są w id serii Logu i Sesji.
- Własny trening klienta zachowuje przedrostek „Własny · ” (konwencja `ownRows_`); pusta nazwa = sama jednostka („Własny” przy własnym).
- Import pliku planu z tym blokiem nadpisze nazwę niezrobionej jednostki (jak inne zmiany z panelu); zrobione zostają.
