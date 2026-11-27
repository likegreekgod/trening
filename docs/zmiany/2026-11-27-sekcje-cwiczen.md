# 2026-11-27 · Sekcje ćwiczeń w jednostce: Rozgrzewka / Główne / Korekcyjne

## Zrobione

- Plan: nowa kolumna `sekcja` na końcu `PLAN_HEADERS` (R = Rozgrzewka, G = Główne, K = Korekcyjne; w pliku i arkuszu litera albo słowo, `sekcja_`). Pusta: prio K → K, A / B / puste → G; R tylko jawnie. getData zwraca `row.section`.
- Walidator (`validatePlan_`): sekcja tylko R / G / K albo puste; obwód (`obwod`) w dwóch sekcjach = błąd.
- Ostrzeżenie, nie błąd (`planWarnings_`, w `tools/validate-plan.js` jako „UWAGI” i w zakładce Import): nazwa zaczyna się od „Rozgrzewka” albo „Aktywacja”, albo 1 × „1” przy ćwiczeniu spoza bazy: „to wygląda na opis bloku, a nie ćwiczenie; rozbij na wiersze i ustaw sekcja=R”.
- Dawne pseudo-ćwiczenia („Rozgrzewka”, „Rozgrzewka + …”, `sekcjaNazwa_`) nie trafiają już do Biblioteki w panelu (lista bez filmu) ani do „Uzupełnij listę ćwiczeń”.
- Aplikacja, cała lista (nie tryb skupienia): nagłówek `.sek-h` tam, gdzie sekcja zmienia się względem poprzedniego ćwiczenia (kolejność planu, bez sortowania; lib `sectionOf`, `sectionRuns`): nazwa · liczba ćwiczeń · zrobione/razem („Rozgrzewka 3 · 2/3”, „✓” po wszystkich), strzałka. Dotknięcie zwija i rozwija (karty zostają w DOM, klasa `sek-off`); stan w `sk_<klucz>` na tydzień|jednostkę. Zrobiona sekcja zwija się sama (także po ręcznym rozwinięciu, jak karta), „Zwiń zrobione” obejmuje sekcje, „Dalej” i powrót z trybu skupienia rozwijają sekcję z ćwiczeniem. Jednostka z jedną sekcją nie ma nagłówków (stare plany bez zmian).
- Tryb skupienia: bez nagłówków, nad „Ćwiczenie n z m” mała etykieta sekcji (`.fx-sk`), gdy jednostka ma kilka sekcji.
- W jednostce z sekcjami plakietka priorytetu, która powtarza sekcję, znika (K w Rozgrzewce i Korekcyjnych, A w Głównych); „opcjonalne” zostaje.
- Sekcja Rozgrzewka poza objętością (decyzja Damiana 27.11): arkusz (`warmEx_`) liczy jej serie do wykonania planu jak dotąd (po prio), ale nie do tonażu (też planowanego), serii roboczych i twardych, NL, e1RM ani `Podsumowanie_partie`; aplikacja: bez tonażu w nagłówku treningu i w „Trening zrobiony” (`unitStats`), Postęp bez tych serii (lib `volLogs`).
- Własny trening (W…): bez wyboru sekcji, wszystko w Głównych.

Do sprawdzenia: wrzucić plan z `"sekcja": "R"` przy kilku ćwiczeniach rozgrzewki, otworzyć w aplikacji całą listę i tryb skupienia; `node tools/validate-plan.js` na starym pliku z „Rozgrzewka + …” pokazuje uwagę. Skill trenera: opisać pole `sekcja` w SKILL.md (tekst do wklejenia w wątku).

## Ustalenia

- Rozgrzewka to zwykłe ćwiczenia z bazy (nazwa, serie, powt.) z `sekcja` = R, zwykle prio K (nie da się jej pominąć bez powodu). Pseudo-ćwiczenia typu „Rozgrzewka + aktywacja pośladków” 1 × 1 z opisem w uwagach są zakazane: nie mają filmu, zaśmiecają bazę i Bibliotekę.
- Sekcja służy do wyświetlania; wykonanie planu, „Skróć trening”, przerwy i SKIP dalej zależą od `prio`. Wyjątek: Rozgrzewka nie wchodzi do objętości (jak serie R1…), żeby tonaż i alarmy obciążenia były porównywalne ze starszymi tygodniami.
