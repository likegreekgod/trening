# Plan: panel trenera

Panel w przeglądarce (głównie komputer), dostępny z każdego miejsca, do kontroli klientów, treningów i postępów, z pomocą Claude API przy szkicach. Ustalenia i odrzucone warianty są w `docs/decyzje.md` (17.11.2026).

## Architektura

- `web/trener.html` na GitHub Pages (jeden plik, bez frameworka, wygląd Pomost; czyste funkcje z `web/lib.js`). Nie jest PWA i nie działa offline: dane klientów nie zostają w przeglądarce, zapamiętany jest tylko bilet logowania (`tr_tok`).
- Akcje trenera w `apps-script/Trener.gs` (`TR_FNS`), wołane przez ten sam `doPost` co aplikacja klientów, ale z biletem Google zamiast klucza klienta.
- Logowanie: Google Identity Services w przeglądarce → ID token → `trAuth_` sprawdza go w `tokeninfo` (aud = `TRENER_CLIENT_ID`, wydawca Google, ważność, potwierdzony adres z listy `TRENER_EMAIL`), wynik w CacheService do końca ważności biletu (maks. 1 h). Błędy logowania zaczynają się od „Logowanie: ” i panel wraca wtedy do ekranu logowania.
- Ustawienia we właściwościach skryptu (menu „Trening → Ustaw panel trenera”), nie w repo i nie w arkuszu.
- AI (PR 4): klucz Claude API we właściwościach skryptu, wołany przez UrlFetchApp, dzienny limit; AI tylko szkicuje, zapisuje trener.

## Stan

| PR | Zakres | Stan |
|---|---|---|
| 1 | Logowanie trenera i akcje odczytu: `trConfig`, `trPulpit` (klienci z Przeglądu, sygnały, obciążenie 12 tyg., filmy z 14 dni, bloki do zamknięcia), `trKlient` (dane jak `getData` + bloki + podsumowanie), `trPrzelicz` | scalony (PR #76) |
| 2 | Panel do czytania: pulpit (5 liczników, tabela klientów, mapa obciążenia, „Do zrobienia”), karta klienta (Przegląd, Sesje, Bloki, Dyspozycja), Filmy (podgląd z Dysku w panelu), Bloki do zamknięcia; v52; poprawka telefonu (pasek u góry, wylogowanie) v54 | scalony (PR #76) |
| 3 | Zapisy trenera: komentarz do filmu z sekundą (komentarz na Dysku + `Log.komentarz_dysk`), komentarz do sesji, wnioski i „dla klienta” bloku, notatka do jednostki | do zrobienia |
| 4 | Claude API: szkic komentarza do sesji (pierwsze zadanie), zakładka „AI” (tokeny, koszt, limit) | do zrobienia |
| 5 | Asystent planu: szkic bloku jako JSON → `validatePlan_` → `_plany/` | do zrobienia |

## Uruchomienie (raz, po scaleniu PR 1–2)

1. Google Cloud Console, projekt powiązany z kontem trenera: „Interfejsy API i usługi → Dane logowania → Utwórz → Identyfikator klienta OAuth → Aplikacja internetowa”. Autoryzowane źródło JavaScript: `https://likegreekgod.github.io`. Ekran zgody: typ zewnętrzny, wystarczy podstawowy zakres e-mail.
2. W arkuszu: menu „Trening → Ustaw panel trenera”: wklej identyfikator klienta (kończy się na `.apps.googleusercontent.com`) i adres Gmail trenera (kilka po przecinku).
3. Panel: `https://likegreekgod.github.io/trening/trener.html`.

## Testy

`tests/trener.test.js` (Playwright): logowanie przez atrapę Google, pulpit, karta klienta, filmy, bloki, wygasły bilet, brak konfiguracji; zrzuty 1440×900 i 390×844, jasny i ciemny motyw (`tests/screens/trener-*.png`, poza repo). Logika serwera: `tests/code.test.js` (`trTokenOk_`, rozdział akcji trenera i klientów w `doPost`, `trPulpit_`).
