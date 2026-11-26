# 2026-11-26 · Przeglądanie ćwiczeń po partii (kafle)

## Zrobione

- Wspólne okno wyboru ćwiczenia w „Dodaj ćwiczenie” (Prowadź i zmiany klienta, `openAdd`), kreatorze (własny trening, „Nowa jednostka”, `openOwn`) i „Zamień ćwiczenie” z zamianą DOWOLNA (`openSwap`). Pod pustym polem szukania jest 8 kafli: Nogi, Plecy, Klatka, Barki, Ramiona, Brzuch, Boje, Inne. Na każdym kaflu widać liczbę ćwiczeń i ile z nich ma film (`pkTiles`). W „Dodaj ćwiczenie” pod kaflami są ćwiczenia z planu klienta jako pigułki.
- Po wejściu w region (`pkList`, stan `PK` tylko w pamięci strony) jest „‹ Partie”, pigułki partii regionu z liczbami („Wszystkie”, np. plecy / prostowniki / kapturowe) i „▶ tylko z filmem”. Pole szukania działa wtedy w obrębie regionu („szukaj w: Plecy”). Lista pokazuje najpierw ćwiczenia z planu klienta, potem bazę: najpierw z filmem, potem alfabetycznie po polskiej nazwie. Polska nazwa (alias) jest pogrubiona, pod nią nazwa z bazy i partie. Na stronie mieści się 30 wierszy, dalsze są pod „Pokaż dalsze”.
- Przy wierszu „▶ film” (link do filmu), „▦ opis” (rozwija w liście 2 zdjęcia i 4 kroki z `cw/opisy.json` oraz „Wybierz to ćwiczenie”) albo „– brak”.
- Kreator: płaski pasek 17 partii (`ownParts`) zastąpiony kaflami. Po dodaniu ćwiczenia region zostaje otwarty, więc można dodać kolejne z tej samej partii.
- Lib: `EX_REGIONS`, `EX_PART_SHORT`, `exRegionsOf`, `exRegions`, `exPl`, `exBrowse` z testem. Bez zmian w serwerze i arkuszu: dane z `getExNames`.

## Ustalenia

- Damian wybrał kafle zamiast samego paska pigułek. Przy 17 partiach pasek jest długi i większość pigułek chowa się za krawędzią ekranu, a regiony odpowiadają temu, jak myśli się o treningu („coś na plecy”).
- Boje = ćwiczenia bez partii rozpoznane po nazwie jako rwanie / podrzut / ich ciągi (`groupOf`). Inne = reszta bez partii (mobilność, technika) i szyja. Ćwiczenie z kilkoma partiami jest w kilku regionach.
- Na później: to samo przeglądanie na ekranie Ćwiczenia w panelu trenera (wymaga wczytania całej bazy do panelu).
