# 27.11.2026 · Karta asystenta AI bez klucza, znacznik AI na liście, „klienci” w MCP

## Zrobione

- Panel → Klienci → Ustawienia → Asystent AI: u klienta bez klucza (asystent wyłączony) przełączniki Odczyt / Zapis / Propozycje / Sam skraca, limit zapytań i pole ograniczeń są wyszarzone i nieaktywne (`fieldset.agset.off`), nad nimi dopisek „Zadziała po utworzeniu klucza. Bez klucza bot nie ma żadnego dostępu.” (`#ag-offn`). „Utwórz klucz i włącz” to przycisk główny i jedyny krok włączenia; „Zapisz” pojawia się dopiero przy włączonym asystencie. Wartości domyślne bez zmian (po utworzeniu klucza odczyt, zapis i propozycje włączone).
- Lista klientów: znacznik „✦ AI” (`.aitag`) przy imieniu tylko u klientów z włączonym asystentem (`trKlientOf_` → `ai` = klucz w kolumnie X i `on` w Y, `agUst_`); po utworzeniu albo wyłączeniu klucza znacznik zmienia się od razu.
- Konektor MCP: narzędzie `klienci` zwraca `{ klienci: [...] }` zamiast tablicy (claude.ai odrzucał wynik: „expected record, received array”). Do tego `rec()` w `mcp/src/mcp.js`: wynik, który nie jest obiektem, idzie do `structuredContent` jako `{ wynik: … }`. Pozostałe narzędzia już zwracały obiekty (sprawdzone; test pilnuje `dzis`, `klienci`, `filmy`).

## Ustalenia

- `structuredContent` w MCP zawsze jest obiektem; nowe narzędzie zwracające listę opakowuje ją w nazwane pole.
