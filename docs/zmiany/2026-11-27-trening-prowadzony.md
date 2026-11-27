# 2026-11-27 · Trening prowadzony (P1, P2…): zapis na żywo przez Claude, poza planem

## Zrobione

- **Nowy rodzaj jednostki: trening prowadzony** `P1`, `P2`… (numeracja ciągła u klienta), `Plan.zrodlo` = `prowadzony`, `blok` pusty. W Code.gs `led_` (obok `own_`) i `offPlan_` = własny, prowadzony, dodane, usunięte. Skutek:
  - nie liczy się do wykonania planu, zaległych, „plan skończony”, `koniec_planu_dni`, porannego maila (wszędzie przez `offPlan_`);
  - nie wchodzi do **Bloków** wcale (także tonażu bloku), więc trening prowadzony nie tworzy bloku;
  - liczy się do tonażu, obciążenia (sRPE), partii, e1RM i Postępu w aplikacji;
  - import planu go nie rusza (`mergePlan_` jak własny trening; wiersze pliku z tym samym tygodniem i dniem pominięte z uwagą), a walidator odrzuca w pliku `jednostka` P… („P1, P2… to treningi prowadzone”).
- **Narzędzia MCP** (konektor „Siła z Ruchu”, opis „Zapis tylko na wyraźną prośbę trenera; po zapisie powiedz, co zapisałeś”), serwer w nowym pliku `apps-script/Prowadzony.gs`:
  - `prowadzony_start` → `trProwadzonyStart`: nowa P z tygodniem jak własny trening (ostatni tydzień planu, który zaczął się nie później niż dzień treningu; bez planu tydz. 1). Niezamknięta P z tym samym dniem wraca zamiast nowej (bez duplikatów). Bez ćwiczeń nic nie zapisuje (dzień i tytuł czekają 6 h w pamięci skryptu), z ćwiczeniami zapisuje od razu. Zwraca tydzień, kod P i link do Sesji klienta w panelu.
  - `prowadzony_cwiczenie` → `trProwadzonyCw`: ćwiczenie (albo kilka) z seriami: wiersz w Planie (`serie` = liczba roboczych, `powt` jedna wartość albo „12,12,9,8”, `kg` najcięższa seria albo BW) i serie w Logu (`wykonane` = TAK). Nazwa przez bazę ćwiczeń (alias → nazwa z bazy; spoza bazy zapis z ostrzeżeniem „brak filmu i partii”). Seria domyślnie 1…n, `R1` rozgrzewka, `D1` drop (typ DROP). Światła: lekko 7, średnio 8, ciężko 9, nieudana = RPE puste + FAIL; RPE liczbą tylko u PRO (u PROSTYCH zaokrąglone do światła). Ten sam `nr` i `seria` nadpisują (id Logu); istniejąca seria zachowuje film, VBT i komentarze. Zamknięta jednostka = błąd.
  - `zapisz_serie` → `trSerie`: serie w jednostce planu (S/T…), `wszystkie_wg_planu` = robocze z kg i powt. z planu, podane serie nadpisują; zakres albo drabinka w planie bez liczby i plan z samym % bez kg = błąd z prośbą o liczbę.
  - `zakoncz_jednostke` → `trZakoncz`: wpis w Sesjach (samopoczucie, RPE sesji, czas, start / koniec, ból „miejsce:ocena; …” z `bol_max`, stare `bol_kolano` / `bol_bark`, uwagi), `prowadzil` = trener; koniec domyślnie teraz, start = koniec − czas albo pierwsza seria z Logu. Pakiet: domyślnie zdejmuje 1 (P i plan), `zdejmij_z_pakietu: false` nie zdejmuje (ponowne zamknięcie z false oddaje trening). Bez serii w Logu ostrzeżenie, zapis idzie. Zwraca „pakiet: było → zostało”.
  - `prowadzony_z_planu` → `trZPlanu`: jednostka planu przeniesiona do P (Plan: `jednostka`, `zrodlo`, `blok`; Log i Sesje: id i `jednostka`; Pakiety: wpis treningu przechodzi na nową jednostkę, a zamknięta jednostka bez wpisu zdejmuje 1). Do jednorazowego porządku z 27.11 (Maciek, tydz. 1, S1) i na przyszłość.
  - Wszystkie pięć w zakładce API jako „claude: …” (`TR_MCP_ZAPIS` = `ZAPIS`).
- **„▶ Prowadź” w aplikacji** (decyzja Damiana 27.11): „⋯ → Nowa jednostka” i „Trening bez planu” tworzą P (lib `liveNextDay` → `P<n>`, `addOwnUnit` w trybie trenera → `ownRows_(…, 'P')`). Starsze jednostki T zostają bez zmian (dalej plan). „+ Ćwiczenie” w P dostaje `zrodlo` = prowadzony (`planEdit_`), tak samo nowe ćwiczenie dodane do P w panelu (`trUnitEdit_`). „Zaplanuj następną” po P tworzy w tyg. + 1 zwykłą jednostkę planu T<n> (`trNextUnit_`), a „Kopiuj” w siatce planu kopiuje P jako jednostkę planu T<n> (`trCopy_`).
- **Aplikacja klienta**: P w Planie z etykietą „z trenerem”, bez „Zmień dzień”; na Treningu karta „Trening z trenerem” zamiast podsumowania, serie tylko do oglądania (bez „+ rozgrzewka / seria / drop”, „⋯”, „Zakończ i zapisz”); Postęp → Tydzień „Treningi z trenerem” osobno, poza „Jednostki z planu”. Start aplikacji nie wybiera P jako dzisiejszego treningu. Serwer odrzuca zmiany klienta w P (`ledGuard_` w `logSet`, `deleteSet`, `logSession`; `przesunJednostke` pomija P; `editPlan` klienta = błąd).
- **Panel**: P nie ma w zakładce Plan i nagłówku bloku karty klienta (to nie plan), jest w Sesjach i w Kalendarzu z dopiskiem „poza planem” (`trKalendarz_` `prow`). Rozliczenia → Prowadzone liczą P jak dotąd po `Sesje.prowadzil` = trener.
- **MCP odczyt**: `kalendarz` i `jednostka` mają `rodzaj: prowadzony (poza planem)`, `klient` nie pokazuje P w „nadchodzących jednostkach”, a w ostatnich sesjach z tym oznaczeniem (karta: „· z trenerem”).
- Testy: `tests/code.test.js` (P poza wykonaniem i Blokami, tonaż tak, import nie usuwa, walidator, światła → RPE / FAIL, drabinka, serie w planie, zamknięcie, pakiet −1, ponowny start = ta sama jednostka, przeniesienie z planu), `tests/lib.test.js` (`liveNextDay` → P), `mcp/test/tools.test.js` (pięć narzędzi, oznaczenia P).

## Ustalenia

- 27.11 Damian: nowa jednostka w „Prowadź” też tworzy P (ten sam trening liczy się tak samo z Claude i z telefonu).
- Trening prowadzony to nie plan: nie w Blokach (B1 Maćka znika po przeniesieniu S1 → P1, jeśli była to jedyna jednostka bloku).
- Pakiet przy zamknięciu jednostki planu przez Claude też domyślnie −1 (trener był obecny); nie ma ustawienia klienta „zdejmuj z pakietu”.
- Klient nie zmienia P; może odpowiadać na komentarze trenera w zakładce Trener.
- Jednostki prowadzonej bez ćwiczeń nie ma w arkuszu (Plan opisuje jednostkę wierszami ćwiczeń).

## Po wdrożeniu (Damian)

1. W Claude: „przenieś trening Maćka z planu do prowadzonych” (`prowadzony_z_planu` maciek, tydz. 1, S1).
2. „Zaczynam trening z Maćkiem” → „Z-Press 30 kg: 12, 12, 9 ciężko, 8 ciężko” → „drabinka Front Squat 30 kg 9→1 z pompkami 1→9” → „zakończ: samopoczucie 4, RPE sesji 9”.
3. Panel: P1 i P2 w Sesjach i Kalendarzu jako poza planem, B1 zniknął z Bloków (po „przelicz”), Rozliczenia → Pakiety „zostało 0”.
4. Skill trenera: dopisać do SKILL.md, że P… jest zarezerwowane (nie używać w plikach planu), a trening na żywo zapisuje się narzędziami `prowadzony_*`.
