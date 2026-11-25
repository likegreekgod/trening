# Zmiany (jeden plik na PR)

Od 25.11.2026 każdy PR zapisuje swój wpis „Ostatnio zrobione” i ewentualne ustalenie projektowe w **osobnym pliku** w tym folderze, a nie na górze `docs/stan.md` i `docs/decyzje.md`. Dwa równoległe PR-y nie zmieniają wtedy tych samych linii, więc nie ma konfliktu przy scalaniu.

- Nazwa pliku: `RRRR-MM-DD-krotki-temat.md` (data zrobienia, małe litery, bez polskich znaków), np. `2026-11-25-mniej-konfliktow.md`.
- Treść: nagłówek z datą i tematem, potem dwie sekcje:
  - `## Zrobione`: to, co dawniej szło do „Ostatnio zrobione” w `stan.md` (co widzi Damian / klient, co sprawdzić);
  - `## Ustalenia`: to, co dawniej szło do `decyzje.md` (dlaczego tak, co odrzucone). Pomiń, gdy nie ma ustaleń.
- Najnowsze na górze listy plików = sortowanie po nazwie malejąco (`ls -r docs/zmiany`).
- Bez danych klientów (repo jest publiczne), jak w pozostałych plikach `docs/`.
- `stan.md` i `decyzje.md` zmieniaj tylko wtedy, gdy zmienia się coś stałego (zasady pracy, lista zadań, „Odrzucone i dlaczego”), a nie przy każdym PR.
