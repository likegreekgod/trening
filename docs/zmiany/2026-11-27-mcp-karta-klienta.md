# Panel trenera w Claude, D3 część 1: karta klienta (27.11.2026)

## Zrobione
- `mcp/src/ui.js`: karta klienta `ui://sila-z-ruchu/klient.html` dla narzędzia `klient`. Pokazuje:
  - blok, tydzień, tryb; pigułki sygnałów (tydzień z Podsumowania, ból > 3/10 z 14 dni, dyspozycja „uwaga / zmęczenie” z 3 dni, pakiet);
  - liczby: ten tydzień (zrobione / plan), średnie RPE 5 ostatnich sesji, tonaż tygodnia ze zmianą, filmy bez komentarza z 14 dni;
  - „Siła (e1RM)”: do 4 ćwiczeń A z wykresem z 8 tygodni;
  - 4 ostatnie sesje (serie ze światłami, uwaga klienta) i 3 najbliższe jednostki;
  - „▶ Prowadź” i „Otwórz w panelu ›” otwierają panel przez gospodarza (`ui/open-link`), karta dalej bez sieci.
- Wspólna część kart (`JS_TOP`, `JS_BOT`, `page()`), karta „Dziś” bez zmian w działaniu.
- `mcp/src/tools.js`: czyste `karta()` i `e1rm()` (Epley z RIR, seria bez RPE jak RPE 10, jak wykres Siły w aplikacji; FAIL, rozgrzewka i sekcja R poza siłą); wynik `klient` ma nowe pola `naglowek`, `sygnaly`, `liczby`, `sila`, więc Claude widzi to samo co trener.
- Testy: `npm test` (8), `node test/karta.mjs` (karta klienta w atrapie gospodarza, linki, zrzuty jasny / ciemny / telefon).

## Ustalenia
- Sygnały liczone z danych `trKlient`, bez drugiego zapytania o pulpit (szybciej). Mogą się różnić od pigułek Przeglądu w panelu, które liczy arkusz.
- Dalej: karta filmu (klatki dla Claude, tor sztangi, komentarz), potem wgrywanie filmów z komputera.
