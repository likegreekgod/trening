# Film z komputera do serii, tor sztangi i postęp (27.11.2026)

## Zrobione
- Panel → Filmy → „⇪ Wgraj z komputera” (`#filmy/wgraj[/klient]`, `renderWgraj`, szkic `WG` tylko w pamięci strony):
  - plik przeciągnięty albo wybrany (film z DJI po cięciu w DaVinci), podgląd w odtwarzaczu przeglądarki;
  - osoba (też trener), trening z planu albo z Logu (najnowsze pierwsze, bez przyszłych, `wgUnits`), ćwiczenie i seria (`wgSets`: serie z planu i z Logu, R / D, „+ Nowa seria” z kg / powt. / RPE);
  - „Tor sztangi i prędkość”: kadr filmu, środek i krawędź talerza (450 mm = skala), „Analizuj” liczy w przeglądarce (`torBind`, `track` z `web/vbt.js`, `TL.analyse`), wynik jak w aplikacji: MCV / v max, spadek albo uniesienie, tor, tabela powtórzeń;
  - „Wnioski (tylko Ty)” → `Log.notatka_trenera`, „Dla klienta” → `Log.komentarz_trenera`;
  - „Wyślij film” → `trFilmWgraj` (sesja resumable w folderze klienta, wspólne `uploadInit_` z `startUpload`) → plik kawałkami po 8 MB prosto z przeglądarki na Dysk → `trFilmSeria` (czysta `trFilmSeria_` z testem). Istniejąca seria: zmieniają się tylko przysłane kolumny (link, analiza, teksty), kg / powt. / RPE klienta zostają. Brak serii: nowy wiersz Logu, zrobiony (`wykonane` TAK, D… = DROP);
  - „Postęp: <ćwiczenie>” (`wgProgress`): najlepsza prędkość dnia na wykresie, do 4 nałożonych torów (najnowszy akcentem), filtr ciężaru, tabela z linkiem do filmu i ✎ wniosków.
- Film z listy Filmy: „Tor sztangi i prędkość” pod odtwarzaczem (ta sama analiza) → „Zapisz tor przy serii” (`trFilmSeria` bez linku).
- `web/vbt.js`: `track`, `videoSource`, `fixDuration` wyjęte z `app.js`, ładowane w aplikacji i w panelu, w `SHELL` `sw.js`.
- Claude (MCP): narzędzie `tor` (czysta `tor()` w `mcp/src/tools.js`, test) i karta `UI_TOR`: wykres najlepszej serii dnia, nałożone tory, serie z wnioskami. Claude dostaje liczby (prędkość, uniesienie, odchylenie toru od pionu startu, wnioski), tory w cm tylko karta (`_ui`). „Pokaż tor przysiadu Oli”.
- Testy: `trFilmSeria_` w `tests/code.test.js`; panel w `tests/trener.test.js` (atrapa wysyłki na Dysk, zrzut `trener-wgraj-jasny.png`); `mcp` test `tor`, karta w `mcp/test/karta.mjs` (`karta-tor-*.png`).

## Ustalenia
- Wnioski trenera idą do istniejącej kolumny `notatka_trenera` (jak notatka „tylko ja” z „Prowadź”), bez nowej kolumny w Logu.
- Plik do 1 GB (`filmOk_`); film 4K z DJI lepiej eksportować w 1080p, bo i tak trafia też do aplikacji klienta.
- Analiza w przeglądarce, najwyżej 20 s od wybranej chwili; dokładność jak w aplikacji (sprawdzona na ruchu syntetycznym, do walidacji z czujnikiem).
- Zapis kg / powt. / RPE tylko dla nowej serii: trener nie nadpisuje tego, co zapisał klient.
