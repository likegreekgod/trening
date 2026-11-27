# 2026-11-27 · Asystent AI: zatwierdzanie propozycji jednym kliknięciem i pamięć decyzji

## Zrobione

- Panel → Dziś: karta „Od asystenta AI” (`asyCard` / `asyBind`, stan `ASY`, `ASYM` tylko w pamięci strony) pod „Wymaga uwagi”. Propozycja bota: „✓ Zatwierdź i zmień plan” (dodatkowy trening: „✓ Zgoda”, plan bez zmian), „Odrzuć…” z polem na powód (wymagany, asystent przekaże go klientowi), pole „Zapamiętaj jako zasadę dla tego klienta”. Zgłoszenie: „✓ Przeczytane”. Na dole „Odrzucone przez serwer” z 7 dni (`agOdrz_`, `trPulpit.agentOdrz`).
- „Wymaga uwagi” pokazuje już tylko czerwoną flagę od bota („Otwórz” przewija do karty); zwykłe propozycje i zgłoszenia są w karcie.
- Serwer: `trPropozycja(pid, {mode: 'tak' | 'nie' | 'czytane', why, zasada})` (TR_FNS). „tak” → czysta `agApply_` (ciężar i serie przez `trPlanEdit_`, czyli te same reguły co edycja planu w panelu; zamiana = `Plan.cwiczenie` tylko w tej jednostce + ślad w `uwagi` „zamiana (asystent): A → B | powód”; jednostka zrobiona albo inne ćwiczenie pod tym numerem = odmowa „Plan się zmienił…”) → `trPlanSet_`. Status w Propozycjach: `zatwierdzona` / `odrzucona` (z `decyzja_at` i `komentarz_trenera`) / `przeczytane`. Odrzucona przez serwer ma pusty `decyzja_at`.
- Pamięć decyzji: czysta `agDecyzje_` (ostatnie `AG_DECYZJE` = 20 propozycji klienta: czeka / zatwierdzona / odrzucona przez trenera, z komentarzem; bez zgłoszeń i bez odrzuconych przez serwer) idzie do bota w akcji `zasady` (`decyzje_trenera`) i do czatu próbnego (sekcja „Ostatnie decyzje trenera” w `agChatSystem_`).
- „Zapamiętaj jako zasadę”: czysta `agMemo_` dopisuje linię „- 27.11 trener odrzucił: … . powód.” do ograniczeń klienta (Klienci Z, limit `AG_OGR_MAX`); zapis po decyzji, poza blokadą; brak miejsca = komunikat, decyzja zostaje.
- `agOpen_` zwraca `pid` i szczegóły (tydzień, jednostka, nr, ćwiczenie, kg, serie, zamiennik, powód klienta); opis wspólny `agWhat_` (kg z przecinkiem).
- Czat „Wypróbuj asystenta” zwinięty do jednej linii (`details.achd`), otwiera się dotknięciem albo sam, gdy trwa rozmowa.

## Ustalenia

- 27.11 Damian wybrał „Oba”: najpierw zatwierdzanie (ten PR), potem bot sam skraca i zamienia (PR B, z mikrofonem w czacie), potem asystent w aplikacji klienta (PR C, ikona: talerz z logo w dymku), na końcu MCP dla trenera (PR D, osobny szkic). Szkic: `/mnt/project-files/asystent-zatwierdzanie-szkic/` (poza repo).
- Bot nie uczy się sam: pamięta tylko to, co dostaje (zasady, ograniczenia klienta, ostatnie decyzje). Stałe nauki = „Zapamiętaj jako zasadę” albo poprawka zasad.
