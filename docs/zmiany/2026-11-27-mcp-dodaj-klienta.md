# 2026-11-27 · Claude: dodawanie klienta i pakiet treningów (narzędzia MCP `dodaj_klienta`, `pakiet`)

## Zrobione

- **`dodaj_klienta`** w Claude (konektor „Siła z Ruchu”): imię (wymagane), `klient_id` (opcjonalnie, domyślnie z imienia: małe litery, bez polskich znaków, spacje → „-”), flagi `tryb` (PROSTY / PRO, domyślnie PROSTY), `dod_serie`, `masters`, `zamiana`, `skala`, `bol`, `sufit_oly`, `wlasne`, `edycja`. Zwraca `klient_id`, link do aplikacji i ustawione flagi.
- Jedna funkcja zapisu nowego klienta `klientNowy_` (Trener.gs) dla trzech miejsc: menu Trening → Dodaj klienta (okno w arkuszu, przez `klientForm_`), „Nowy klient” w panelu i Claude. Wiersz w Klientach, klucz, link w kolumnie E, aktywny = TAK, folder na filmy. Okno w arkuszu zapisuje teraz też domyślne ustawienia z kolumn J–P (jak panel), zamiast zostawiać je puste; działanie aplikacji bez zmian, bo puste znaczyło to samo.
- Zajęte ID = błąd z pierwszym wolnym ID w podpowiedzi (`freeId_`, np. „ola-3”), istniejący klient nie jest nadpisywany.
- **`pakiet`**: `id`, `treningi` (> 0), `tryb` „dodaj” (domyślnie) albo „ustaw”, opcjonalnie `notatka`, `data`. Zapis w zakładce Pakiety, tej samej, z której biorą się `pakiet_zostalo` (narzędzie „klienci”) i „pakiet” (narzędzie „klient”) oraz licznik w panelu. Bez pakietu (albo po wygaśnięciu ważności) oba tryby zapisują nowy zakup. Z pakietem: „dodaj” = korekta +n, „ustaw” = korekta o różnicę, żeby zostało dokładnie n (czysta `pkgSet_`). Panel dalej robi korekty tylko ±1. Zwraca, ile zostało (i ile było).
- Oba zapisy trafiają do zakładki API jako „claude: trKlientNowy” / „claude: trPakiet”.
- Do sprawdzenia po wdrożeniu: w Claude „dodaj klienta Maciek”, potem „dodaj Maćkowi pakiet 2 treningów”; w panelu Klienci nowy wiersz w trybie Prosty, w Rozliczenia → Pakiety „zostało 2”.

## Ustalenia

- `dodaj_klienta` zwraca link z kluczem (prośba Damiana: link do wysłania klientowi). To jedyne narzędzie MCP z linkiem klienta, więc klucz zostaje w historii rozmowy w claude.ai.
- Domyślny tryb w Claude to PROSTY, w panelu i w oknie w arkuszu bez zmian (PRO, a w oknie pole „Tryb prosty”).
- „dodaj” do istniejącego pakietu to korekta, nie nowy zakup: data zakupu i ważność zostają. Nowy pakiet z ceną i ważnością dalej w panelu.
