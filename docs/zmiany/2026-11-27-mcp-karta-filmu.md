# Panel trenera w Claude, D3 część 2: film do analizy (27.11.2026)

## Zrobione
- Narzędzia w `mcp/src/tools.js`:
  - `filmy`: filmy z 14 dni, domyślnie bez komentarza. Zwraca `ref` (= id wiersza Logu), ćwiczenie, wykonanie ze światłem i uwagę klienta. Bez linków.
  - `film`: otwiera kartę filmu.
  - `klatki`: zdjęcia klatek dla Claude.
  - `klatki_zapisz`: widzi je tylko karta.
  - `komentarz_filmu`: zapisuje przez `trKomentarzFilm`, wpis trafia do zakładki API jako „claude: trKomentarzFilm”.
- Karta filmu (`mcp/src/ui.js`, `UI_FILM`):
  - odtwarzacz z ¼× / ½× / 1× i krokiem po klatce;
  - pasek z zaznaczeniem fragmentu („Początek tu” / „Koniec tu”);
  - „Pokaż Claude’owi 8 / 16 klatek”: przeglądarka wycina klatki (JPEG do 768 px), zapisuje je przez pośrednika i wysyła do czatu wiadomość z `klatki_id`;
  - komentarz dla klienta z „⏱ Wstaw chwilę” (m:ss,d jak w panelu).
- Pośrednik (`mcp/src/index.js`):
  - `/film/<bilet>`: bilet losowy w KV na 45 min. Pośrednik pobiera plik z Dysku z biletem skryptu (`trFilm`, ten sam co w panelu) i przekazuje Range oraz CORS, żeby przeglądarka mogła przewijać i wycinać klatki;
  - klatki w KV na godzinę.
- `mcp.js`:
  - wynik z `__content` (zdjęcia) idzie do Claude wprost;
  - pole `_ui` (adres filmu) idzie tylko do karty, Claude go nie dostaje;
  - `readResource` dostaje origin pośrednika dla CSP karty filmu.
- Testy:
  - `npm test` (9): lista bez linków, bilet tylko dla karty, klatki jako zdjęcia, wygasłe klatki, zły base64, komentarz;
  - `node test/karta.mjs`: syntetyczny film z Range i CORS, 8 różnych klatek, wiadomość do czatu, komentarz, zrzuty.

## Ustalenia
- Claude widzi tylko klatki, które wyśle trener, a nie cały film. Każda paczka zdjęć zużywa limit subskrypcji.
- Bilet filmu jest ważny 45 min. Po tym czasie trzeba otworzyć film ponownie, bo karta w historii czatu przestaje grać.
- Tor sztangi i prędkość w karcie przejdą razem z wgrywaniem z komputera (część 3), bo to ten sam kod śledzenia (`track()` z aplikacji).
- Do sprawdzenia w prawdziwym claude.ai:
  - czy gospodarz przyjmuje `ui/message` (bez tego karta pokazuje gotowy tekst do wklejenia);
  - czy zdjęcia z wyniku narzędzia trafiają do Claude.
