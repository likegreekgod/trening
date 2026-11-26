# Blokada obcych skryptów w aplikacji klienta (punkt 14 przeglądu v80)

## Zrobione

- Kod aplikacji przeniesiony z `web/index.html` do `web/app.js`, a decyzja o animacji otwarcia do `web/intro.js` (ładowany zaraz pod `#intro`). Treść kodu bez zmian, przeniesiona skryptem `split-app.py` (pliki projektu, `przeglad-v80-reszta/pr12`).
- `index.html` ma `Content-Security-Policy` jak panel trenera: skrypty tylko z tej strony, bez `'unsafe-inline'` dla skryptów, połączenia tylko do API (`script.google.com`, `script.googleusercontent.com`) i wysyłki filmów (`www.googleapis.com`), manifest też `data:` (ekran powitalny na iPhonie).
- `sw.js`: `app.js` i `intro.js` w `SHELL` (działa offline).
- Testy UI: każde naruszenie CSP to błąd; nowy test sprawdza, że wstrzyknięty skrypt i wysyłka na obcy adres są zablokowane.
- Wygląd i działanie bez zmian. Do sprawdzenia po scaleniu: aplikacja na telefonie otwiera się, zapisuje serię, wysyła film; „Prowadź” z panelu.

## Ustalenia

- Klucz klienta w `localStorage` to jedyne zabezpieczenie, więc wstrzyknięty skrypt (np. przez komentarz, nazwę ćwiczenia) mógłby go wysłać na obcy adres. CSP bez `'unsafe-inline'` dla skryptów i z `connect-src` tylko do Google zamyka obie drogi.
- Style zostają w `index.html` (`'unsafe-inline'` tylko dla stylów, bo aplikacja ustawia `style=` w szablonach). Bez bundlera.
- Nowy adres zewnętrzny w aplikacji = dopisać do CSP; nowy plik JS w `web/` = dopisać do `SHELL` w `sw.js`.
