# 2026-11-26 · Kolejność i nazwa ćwiczenia z poziomu aplikacji

## Zrobione

- Kreator (własny trening klienta, „Nowa jednostka” i trening bez planu w trybie „Prowadź”, „+ ćwiczenie” we własnym treningu): przy każdym nowym ćwiczeniu ✎ (nazwa w miejscu, OK albo Enter) i strzałki ↑ ↓. Ćwiczenie w superserii / obwodzie zamienia się z sąsiadem w tym obwodzie (na brzegu nie wychodzi: od tego jest „Rozłącz”), pojedyncze przeskakuje sąsiednie ćwiczenie albo cały obwód, strzałki w nagłówku obwodu przesuwają cały obwód. Zapisane ćwiczenia (dopisywanie do własnego treningu) stoją. Bez zmian w arkuszu: kreator wysyła listę w nowej kolejności jak dotąd.
- Zapisany trening: „⋯ → Kolejność i nazwy” (`#u-ord`, `openOrder`, `ordDraw`, `ordSave`, `ordApply`): trener w trybie „Prowadź” w każdej jednostce, klient tylko we własnym treningu. Te same strzałki i ✎; ćwiczenie z zapisanym wpisem (seria, rozgrzewka, pominięcie) ma 🔒 i stoi, nikt go nie przeskakuje. Trener: „Nową nazwę także w kolejnych tygodniach tej jednostki” (ten blok, niezrobione, po starej nazwie). Tylko z siecią.
- Serwer: `editUnit` (API_FNS i LIVE_FNS), czysta `unitEdit_` z testem: kolejność = te same numery `nr` rozdane od nowa; obwód musi zostać razem; nowa nazwa w `Plan.cwiczenie` i w `Log.cwiczenie` zapisanych serii tego ćwiczenia (`logRename_`, bez serii z zamianą). Lib: `orderBlocks`, `orderMove` z testem.

## Ustalenia

- Kolejność zmienia numer ćwiczenia (`Plan.nr`), a id serii w Logu zawiera ten numer, więc ćwiczenie z zapisanymi seriami zostaje na miejscu. Odrzucone: osobna kolumna „kolejność” w Planie (wszystkie miejsca, które sortują po `nr` – panel, mail, podgląd, podsumowania – musiałyby ją znać) i przepisywanie id w Logu (kolejka offline w telefonie ma stare id).
- Telefon przenosi za ćwiczeniem zamianę, komentarz, notatkę trenera i zwinięcie karty (`sw_`, `en_`, `fold_`, szkic notatki).
