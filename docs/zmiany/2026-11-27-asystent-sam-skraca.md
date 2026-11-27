# Asystent AI: sam skraca i zamienia, „Zrobił sam” z Cofnij, mikrofon (PR B, 27.11.2026)

## Zrobione

- Ustawienia klienta → Asystent AI: przełącznik „Sam skraca i zamienia” (Klienci Y `api_ustawienia.auto`, domyślnie wyłączony; `agUst_`, `trAgentVals_`).
- Nowe akcje bota `skroc` i `zamien` (`AGENT_FNS`, liczone jak propozycje: wymagają uprawnienia „Propozycje” i dziennego limitu propozycji):
  - `skroc` {tydzien, jednostka, zmiany: [{nr, serie}], powod}: czysta `agSkrot_`. Działa tylko na niezrobionej jednostce planu trenera, bez własnych treningów i T*. Zmienia tylko ćwiczenia B, od ostatniego B. A i K zostają. Serie mogą być mniejsze niż w planie, ale nie poniżej `serie_min`; 0 oznacza pominięcie, którego nie ma w obwodzie. Powód jest obowiązkowy. `agSkrotSet_` zapisuje `serie` albo `zrodlo` = `usuniete` i zapamiętuje stan sprzed zmiany.
  - `zamien` {tydzien, jednostka, nr, na, powod}: te same reguły co propozycja zamiany (`agProp_`: cfg.swap, bez bojów, zamiennik z bazy, tylko ta jednostka), zapis jak zatwierdzona zamiana (`agApply_`). W wierszu zostaje dawna nazwa i dawne uwagi.
  - Bez przełącznika obie akcje odmawiają („użyj zaproponuj”). W czacie próbnym działają tak samo, ale tylko na próbę.
- Propozycje: zmiana bota ma status `auto`, a po cofnięciu `cofnieta` (z `decyzja_at`). `agAuto_` przekazuje je do `trPulpit.agentAuto`. Pamięć bota (`agDecyzje_`) obejmuje też zmiany samodzielne i cofnięte.
- Panel → Dziś, karta „Od asystenta AI”: sekcja „Zrobił sam · 7 dni” (`asyAutoItem`) z „↶ Cofnij” (drugie dotknięcie) → `trPropozycja(pid, {mode: 'cofnij'})` → czysta `agUndo_`. Gdy klient zaczął trening albo plan się zmienił, panel pokazuje komunikat zamiast cofnięcia.
- Czat „Wypróbuj asystenta”: mikrofon (44 px, rdzawa linia; podczas słuchania rdzawe kółko z poświatą). Korzysta z rozpoznawania mowy przeglądarki (Web Speech API, pl-PL), bez nowych adresów w CSP. Tam, gdzie przeglądarka go nie ma, przycisk się nie pokazuje.
- `zasady` zwraca `klient.sam_skraca_i_zamienia`. Instrukcja czatu (`agChatSystem_`) i instrukcja dla bota (`agInstrukcja`) opisują `skroc` i `zamien`. Narzędzia: `AG_TOOLS` = lib `AG_WRITE`.

## Ustalenia

- Bot zmienia plan sam tylko w dwóch sytuacjach: gdy skraca trening (B od końca) i gdy zamienia ćwiczenie w jednym treningu. Ciężar, serie ponad plan i dodatkowe treningi dalej czekają na trenera.
- Zmiana trafia do Planu od razu, więc klient widzi ją w aplikacji po odświeżeniu. Trener może ją cofnąć, dopóki klient nie zaczął treningu.
