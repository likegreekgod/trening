# 2026-11-25 · Mniej konfliktów między równoległymi PR-ami

## Zrobione

- `VERSION` w `web/sw.js` w repo to zawsze `'dev'`. Publikacja (`.github/workflows/pages.yml`) podmienia ją na `v<numer publikacji>-<commit>`, więc każda publikacja dalej ma nową pamięć i telefony pobierają nową wersję. PR-y nie podbijają już wersji ręcznie. Krok publikacji przerywa się, gdy w `sw.js` nie ma `const VERSION = 'dev';`.
- Nowe wpisy „Ostatnio zrobione” i ustalenia: osobny plik na PR w `docs/zmiany/` (zasady w `docs/zmiany/README.md`).
- `API_FNS`, `LIVE_FNS` i `TR_FNS`: jedna nazwa w linii, alfabetycznie. W `CLAUDE.md` bez wyliczania tych list (odsyłacz do kodu).
- Test „mniej konfliktów” pilnuje `VERSION = 'dev'`, podmiany w `pages.yml` i układu list.

## Ustalenia

- Powód (Damian, 25.11): prawie każdy scalony PR dawał konflikt w kolejnym otwartym PR-ze, zawsze w tych samych miejscach: wersja w `sw.js`, wpis na górze `stan.md` / `decyzje.md`, lista `TR_FNS` w jednej linii.
- Odrzucone: dopisywanie wpisów na końcu `stan.md` / `decyzje.md`, bo dwa PR-y dopisujące w tym samym miejscu też dają konflikt.
- Wersja widoczna dla użytkownika się nie zmienia (aplikacja jej nie pokazuje); zmienia się tylko nazwa pamięci podręcznej w telefonie.
