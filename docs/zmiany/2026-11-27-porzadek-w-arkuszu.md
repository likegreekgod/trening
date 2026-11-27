# 27.11.2026 · Porządek w arkuszu: menu, wyzwalacze, zakładki

## Zrobione

- Menu „Trening” w grupach zamiast 16 pozycji w rzędzie. Na wierzchu: „Przelicz podsumowanie i pokaż Przegląd” (dawne „Przegląd klientów” i „Odśwież podsumowanie” w jednym), „Wczytaj plany z Dysku teraz” (teraz z okienkiem wyniku, `menuPlany`; `wczytajPlany` zwraca listę plików), „Pobierz komentarze do filmów teraz”, „Sprawdź arkusz”, „Zrób kopię arkusza teraz”, „Uporządkuj zakładki”. Podmenu: „Baza ćwiczeń”, „Ustawienia (raz)” (wyzwalacze, panel, alert, klucz Claude API), „Naprawy (rzadko)” (Dodaj klienta, linki, puste bloki, plany bez klienta).
- Jedna lista wyzwalaczy `WYZWALACZE` (`apps-script/Arkusz.gs`) z opisem po ludzku. „Zainstaluj albo napraw wyzwalacze” instaluje wszystkie siedem, także podgląd dla Claude (dotąd tylko z edytora), i pokazuje, które działają. Podgląd dla Claude co 30 min zamiast co 10 (`PODGLAD_CO`).
- „Sprawdź arkusz”: dodatkowo rozmiar (komórki z danymi, 6 największych zakładek, rozmiar ścieżek sztangi w Logu), czas wczytania danych klienta z największym Logiem (`clientData_`, tylko odczyt) i lista wyzwalaczy ✓ / ✗.
- „Uporządkuj zakładki”: kolejność i kolor w czterech grupach (Klienci i plany, Dane od klientów, Wyniki, Do obsługi), zakładki techniczne (Propozycje, Import, Błędy, AI, API) schowane. Nazwy bez zmian; zakładki spoza listy na końcu, nietknięte. Można uruchamiać wiele razy (nowe zakładki skrypt dokłada na końcu).
- Do sprawdzenia: po wdrożeniu odśwież arkusz (nowe menu), raz Trening → Ustawienia (raz) → Zainstaluj albo napraw wyzwalacze (7 × ✓), Uporządkuj zakładki, Sprawdź arkusz (podeślij sekcję ROZMIAR).

## Ustalenia

- Przebudowa zakładek i kolumn nie przyspiesza wczytywania (skrypt czyta po nazwie i nagłówku), a groziłaby zgodności id i starych telefonów. Czas zjada odczyt całego Planu, Logu i Sesji przy każdym `getData`. Następny krok tylko wtedy, gdy pomiar w „Sprawdź arkusz” pokaże > 4 s: Log bez kolumny `sciezka` w `getData` (ścieżka dociągana przy otwarciu wykresu).
- Podgląd dla Claude co 30 min (decyzja Damiana 27.11): Claude w projekcie nie potrzebuje świeższych danych, a to był najczęstszy odczyt całego arkusza w tle.
- „Uzupełnij listę ćwiczeń” zostaje w podmenu Baza ćwiczeń: poza dopisywaniem nazw scala wiersze z kolumną `glowna` (`cwMerge_`).
