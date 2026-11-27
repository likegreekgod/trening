# 2026-11-27 · Claude: dodawanie klienta (narzędzie MCP `dodaj_klienta`)

## Zrobione

- W Claude (konektor „Siła z Ruchu”) nowe narzędzie zapisu `dodaj_klienta`: imię (wymagane), `klient_id` (opcjonalnie, domyślnie z imienia: małe litery, bez polskich znaków, spacje → „-”), `tryb` PROSTY / PRO (domyślnie PROSTY), `skala` RPE / RIR, `zamiana` NIE / TRENER / DOWOLNA, `masters`. Woła tę samą funkcję co „Nowy klient” w panelu (`trKlientNowy`), więc wiersz w Klientach, klucz, link w kolumnie E i folder na filmy powstają tak samo.
- Zajęte ID = błąd z pierwszym wolnym ID w podpowiedzi (`freeId_`: „ola-3”, gdy „ola” i „ola-2” są zajęte), także w panelu i w oknie „Dodaj klienta” w arkuszu.
- `trKlientNowy` przyjmuje też inne ustawienia z `KL_DOMYSLNE`, gdy przyszły (czysta `trKlientNowyUst_`); panel wysyła dalej tylko tryb, zamianę i masters, więc działa jak dotąd (bez trybu = PRO).
- Zapis trafia do zakładki API jako „claude: trKlientNowy” z ID klienta (`mcpLogRow_` czyta ID z formularza).
- Do sprawdzenia: w Claude „dodaj klienta Test Testowy”, potem w panelu Klienci nowy wiersz w trybie Prosty; drugi raz to samo imię = błąd z podpowiedzią „test-testowy-2”.

## Ustalenia

- Odpowiedź narzędzia nie zawiera linku z kluczem (klucz jest jedynym zabezpieczeniem klienta, a narzędzia MCP z zasady nie zwracają linków); link kopiuje się w panelu (Klienci → ⧉ Kopiuj link).
- Domyślny tryb w Claude to PROSTY (prośba Damiana), w panelu dalej PRO.
