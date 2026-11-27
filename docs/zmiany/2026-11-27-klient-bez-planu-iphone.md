# Klient z iPhone'em bez pytania o link, pakiet widoczny z Claude (27.11.2026)

Zgłoszenie: nowy klient (dodany przez Claude, bez planu) na iPhonie przy każdym otwarciu ikony dostawał „Wklej link od trenera”, a wklejenie linku raz dało błąd.

## Zrobione
- Przyczyna: iPhone daje aplikacji z ekranu początkowego osobną pamięć i bierze adres z paska Safari. Aplikacja od v72 usuwała klucz z adresu zaraz po otwarciu linku (klucz wracał tylko na czas kroku „Dodaj na ekran główny” ekranu powitalnego), więc ikona dodana później startowała bez `?k=`. Pusty plan nie miał z tym związku (obsługuje go karta „Jeszcze nie masz planu” z „+ Własny trening”), wiersz klienta z Claude jest taki sam jak z menu.
- `web/app.js`: `KEEP_K` = iPhone w Safari, nie z ekranu głównego: klucz zostaje w pasku adresu przez cały czas, więc ikona dodana w każdej chwili otwiera się z kluczem. Usunięte `welUrl` (niepotrzebne). Android, komputer i aplikacja z ekranu głównego dalej usuwają klucz z adresu.
- `askKey`: nagłówek „Połącz aplikację ze swoim kontem”, instrukcja (przytrzymaj link → Kopiuj, wklej, wystarczy raz), przycisk „Wklej skopiowany link” (`navigator.clipboard.readText`, gdy jest), „Otwórz aplikację”.
- Zły albo nieaktualny klucz (`getData` → „Brak dostępu.”, bez danych w pamięci, poza „Prowadź”): zamiast ślepego „Błąd: Brak dostępu.” wraca pole na link z komunikatem, a zły klucz znika z pamięci telefonu.
- lib `keyFrom`: klucz z linku to tylko litery i cyfry, więc kropka, nawias, gwiazdki czy cudzysłów z wklejonego zdania odpadają (wcześniej zostawały w kluczu i serwer odpowiadał „Brak dostępu.”).
- Claude (MCP) `pakiet`: opcjonalne `widoczny` (klient widzi licznik i historię pakietu); odpowiedź ma `klient_widzi`. `trPakiet` w trybie dodaj / ustaw przyjmuje `show`: nowy zakup z flagą, korekta ustawia ją w wierszu zakupu.
- Testy: `keyFrom` z interpunkcją (`tests/lib.test.js`), UI „zły klucz wraca do wklejania; klient bez planu ma „+ Własny trening”” i ekran powitalny na iPhonie z kluczem w adresie (`tests/ui.test.js`), `mcp/test/tools.test.js` `widoczny`.

## Ustalenia
- Na iPhonie w Safari klucz jest widoczny w pasku adresu (wyjątek od v72): bez tego ikona z ekranu początkowego gubi klucz. W aplikacji z ikony adresu nie widać, więc tam to bez znaczenia.
- Pakiet dodany przez Claude bez `widoczny` dalej jest niewidoczny dla klienta (jak w panelu); włącza się w karcie pakietu albo `widoczny: true`.
