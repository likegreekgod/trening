# 2026-11-27 · Panel trenera v2, PR 5: szablony, pakiety, maksy i start

## Zrobione

- Biblioteka ma zakładki „Ćwiczenia” (dotychczasowa lista bez filmu) i „Szablony” (`#biblioteka/szablony`). W szablonach widać listę wszystkich (ćwiczenia, serie × powt., obwód), „✎ Edytuj”, „Usuń” po drugim dotknięciu i „+ Nowy szablon”. Formularz ma nazwę, wiersze ćwiczenie / serie / powt. / obwód, ↑ ↓ ✕, „+ Ćwiczenie” (kopiuje serie i powt. z poprzedniego) i podpowiedzi nazw z bazy (`trCwNazwy`, `datalist`). To te same szablony co „⋯ → Zapisz jako szablon” w „Prowadź”.
- Serwer: `trSzablony()` (= `templates_`) i `trSzablon(t)`. Zapis wydzielony z `saveTemplate` do `tplSave_`: ta sama nazwa zastępuje, `del` usuwa, `old` = poprzednia nazwa przy zmianie nazwy. Walidacja w `tplRows_` się nie zmienia; panel sprawdza to samo wcześniej (`szBad`) i pilnuje, żeby dwa szablony nie miały tej samej nazwy.
- Rozliczenia mają zakładki „Prowadzone” (dotychczasowe) i „Pakiety” (`#rozliczenia/pakiety`). Pakiety pokazują tabelę wszystkich klientów z pakietem: zostało (pigułka w kolorze jak w karcie klienta), wykorzystane, ważny do, cena i cena za trening, ostatni trening, data zakupu i to, czy licznik jest ukryty przed klientem. Na górze jest suma aktywnych, liczba do odnowienia i wartość niewykorzystanych wejść. Klik w imię otwiera kartę klienta, w której jest pakiet.
- Serwer: `trPakiety()` z czystą funkcją `pkgList_` (z testem). Na górze są aktywni z najmniejszą resztą, poza pakietem najpierw, nieaktywni na końcu.
- Ustawienia klienta → Aplikacja → „Ciężarowiec: maksy i zawody”: Max rwanie, Max podrzut (kg, przecinek albo kropka) i Start (pole daty). Zapis idzie do Klienci Q–S przez `trKlientUstaw`; start jest zapisywany jako tekst. Gdy data startu minęła, pod polem jest podpowiedź. Lista klientów pokazuje „start dd.mm”.
- Serwer: `trKlientOf_` zwraca `snatch`, `cj`, `start`. `trKlientVals_` dodaje indeksy 16–18 tylko wtedy, gdy panel przysłał te pola, więc starszy panel nie wyczyści kolumn Q–S. Walidacja: kg do 400 albo puste, start RRRR-MM-DD (prawdziwa data) albo puste.
- Do sprawdzenia:
  - Panel → Biblioteka → Szablony: dodać szablon, zmienić mu nazwę i usunąć go. W arkuszu w zakładce Szablony wiersze mają się zmieniać. W „Prowadź” → ⋯ → Nowa jednostka szablon ma być widoczny.
  - Rozliczenia → Pakiety: lista ma się zgadzać z kartami klientów.
  - U ciężarowca w ustawieniach wpisać maksy i start, potem przelicz. W arkuszu kolumny Q–S, K-value w Podsumowanie_OLY i kontrola taperu.

## Ustalenia

- Szablon w panelu ma ten sam kształt co z „Prowadź”: bez kg i bez imion klientów (kg dobiera aplikacja z historii klienta). Wstawianie szablonu do planu klienta w pustym polu siatki zostaje na później.
- Pakiety w Rozliczeniach są tylko do odczytu. Nowy pakiet i korekty robi się dalej w karcie klienta, żeby była jedna ścieżka zapisu (`trPakiet`).
