# 2026-11-25 · „Jak wykonać” bez filmu: zdjęcia i opis (punkt 6 przeglądu v80, PR 8 z planu reszty)

## Zrobione

- Ćwiczenie, które w bazie nie ma filmu, a jest w free-exercise-db (697 ćwiczeń + 13 dodatków), ma w nagłówku karty ten sam przycisk ▶: okno z dwoma zdjęciami (początek i koniec ruchu) i 4 krokami po polsku, z dopiskiem o źródle (domena publiczna). Film od trenera ma pierwszeństwo; kompleks pokazuje części bez filmu; po zamianie liczy się zamiennik.
- Zdjęcia w `web/cw/<id>/0|1.jpg` (400 px, ok. 19 MB, ładowane dopiero przy otwarciu okna i potem z pamięci telefonu), opisy w `web/cw/opisy.json` (ok. 150 KB, w pamięci od pierwszego wejścia). Serwer: `exInfo_` zwraca `fx` (nazwy części bez filmu), wiersz planu `row.fx`.
- Do sprawdzenia po scaleniu: ćwiczenie bez filmu → ▶ → zdjęcia i kroki, też bez sieci (sam opis, jeśli zdjęć nie było w pamięci).

## Ustalenia

- Źródło: free-exercise-db (domena publiczna, Unlicense), dwa zdjęcia na ćwiczenie, w repo (`web/cw/`), nie z zewnętrznego adresu: aplikacja działa offline i nie wysyła zapytań poza swoją stronę. Zmniejszone do 400 px (ok. 19 MB zamiast ~140 MB). Nie dopisujemy ich do `SHELL` w `sw.js` (instalacja ściągałaby wszystko na każdy telefon); `sw.js` zapisuje zdjęcie w pamięci przy pierwszym otwarciu. `opisy.json` jest w `SHELL`.
- Opis: 4 krótkie kroki po polsku (przetłumaczone i skrócone z instrukcji free-exercise-db), bez porad zdrowotnych. Film trenera zawsze ma pierwszeństwo: przy ćwiczeniu z filmem zdjęć nie pokazujemy.
- Te same nazwy co w bazie (`CW_FEDB`, `CW_DODATKI`); test pilnuje, że każde ćwiczenie free-exercise-db ma opis i zdjęcia, a w `web/cw/` nie ma plików bez opisu.
