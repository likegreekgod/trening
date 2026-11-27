# 2026-11-27 · „ten tydzień” jako data w panelu

## Zrobione

- Panel → karta klienta → Przegląd: pierwszy kafelek pokazywał „Sun Jan 04 2026 00:00:00 GMT+0100 …” zamiast „1/4”. Przyczyna: `podsumowanie` zapisywało tekst „zrobione/plan” do zakładek Przegląd (`ten_tydzien`), Bloki (`jednostki`) i Podsumowanie (`opcjonalne`) bez formatu „@”, więc Arkusze zamieniały go w datę.
- `writeTable_` ustawia teraz format „@” kolumnom z takim tekstem przed zapisem (czysta `textCols_` z testem).
- Odczyt w panelu (`trPulpit_` → `week`, `trKlient` i szkice AI → `blocks[].jednostki`) zamienia starą datę na puste (`frac_`), więc do najbliższego przeliczenia kafelek pokazuje „–”.

## Ustalenia

- Po wdrożeniu wystarczy w panelu „przelicz” (albo poranny wyzwalacz), żeby zakładki zapisały się od nowa z poprawnym tekstem.
