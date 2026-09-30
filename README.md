# Trening – aplikacja dla klientów

Klient instaluje aplikację z linku (Android i iPhone). Aplikacja pokazuje plan, a klient zapisuje w niej serie, filmy, ból i samopoczucie. Dane trafiają do arkusza i na Drive trenera.
Architektura, schemat danych i konwencje są opisane w **CLAUDE.md**.

```
web/           aplikacja (GitHub Pages)
apps-script/   Code.gs (API + arkusz + podsumowania + wczytywanie planów), Index.html (stara wersja), appsscript.json
tests/         testy (npm test)
tools/         validate-plan.js
plans/         przykładowy plan JSON
```

---

## Pierwsze uruchomienie (ok. 30 min, jednorazowo)

### A. GitHub: strona z aplikacją

1. Załóż konto na github.com. Login będzie częścią adresu aplikacji: `https://LOGIN.github.io/trening/`.
2. **New repository**, nazwa `trening`, **Public**. Darmowe GitHub Pages wymagają repozytorium publicznego. To bezpieczne, bo w kodzie nie ma danych ani kluczy klientów.
3. W nowym repozytorium kliknij **uploading an existing file**, przeciągnij **całą zawartość** rozpakowanego folderu (także ukryty folder `.github`) i kliknij **Commit changes**.
   - Jeśli przeglądarka nie przeniesie folderu `.github`, utwórz plik ręcznie: **Add file → Create new file**, nazwa `.github/workflows/pages.yml`, i wklej zawartość z paczki.
4. **Settings → Pages → Source: GitHub Actions**.
5. Na karcie **Actions** poczekaj na zielony ✓ przy „Publikacja na GitHub Pages”. Strona działa pod `https://LOGIN.github.io/trening/` i na razie bez klucza pokazuje komunikat o linku od trenera.

### B. Apps Script: API

1. **Kopia zapasowa:** otwórz arkusz *Trening – Aplikacja (dane)*, wybierz **Plik → Utwórz kopię**. Kopia arkusza zawiera też kopię skryptu.
2. **Rozszerzenia → Apps Script** → plik `Kod.gs` → Ctrl+A, wklej zawartość `apps-script/Code.gs`, Ctrl+S.
   Plik `Plan.gs` możesz usunąć, bo plany wczytują się teraz z Drive.
3. **Ustawienia projektu (⚙) → Właściwości skryptu → Dodaj**: `PWA_URL` = `https://LOGIN.github.io/trening/`.
4. Wybierz funkcję z listy i uruchom po kolei, akceptując uprawnienia:
   - `setup`: doda brakujące kolumny w zakładce Klienci, w tym `masters`;
   - `instalujWyzwalacze`: podsumowanie codziennie ok. 5:00, plany z Drive co 15 min;
   - `linki`: kolumna E w zakładce Klienci dostanie nowe linki do aplikacji.
5. **Wdróż → Zarządzaj wdrożeniami → ✏️ → Wersja: Nowa wersja → Wdróż**. Sprawdź, że „Kto ma dostęp” to **Każdy**. Skopiuj **URL aplikacji internetowej** (kończy się na `/exec`).

### C. Połączenie aplikacji z API

1. Na GitHubie otwórz `web/config.js` → ✏️ → w miejsce `https://script.google.com/macros/s/WKLEJ_ID_WDROZENIA/exec` wklej URL z punktu B5 → **Commit changes**.
2. Poczekaj na zielony ✓ w **Actions** (ok. 1 min).

### D. Test na własnym telefonie

1. Otwórz swój link z zakładki Klienci (kolumna E) w Chrome.
2. Menu ⋮ → **Zainstaluj aplikację** (albo „Dodaj do ekranu głównego”). Na iPhonie: Safari → Udostępnij → „Do ekranu początkowego”.
3. Zaznacz jedną serię i sprawdź, czy pojawiła się w zakładce Log. Wgraj krótki film i sprawdź Drive.
4. Włącz tryb samolotowy i otwórz aplikację: plan powinien się pokazać.

### E. Klienci

Wyślij klientom nowe linki z kolumny E. Stare linki (`…/exec?k=…`) działają dalej.

---

## Plany treningowe

1. W projekcie claude.ai poproś o plan, np. „zrób blok 2 dla Roberta”. Claude zapisze plik JSON w `Trening – Klienci/_plany/` na Drive.
   Ręcznie: wrzuć plik `.json` do tego folderu (wzór w `plans/przyklad.json`, sprawdzenie: `node tools/validate-plan.js plik.json`).
2. W ciągu 15 min plan wczyta się sam. Od razu: menu arkusza **Trening → Wczytaj plany z Drive**.
3. Wynik jest w zakładce **Import**. Plik z błędami trafia do `_plany/bledy`, a opis błędu do kolumny „bledy”.

## Rozwój aplikacji w Claude Code

1. Sklonuj repozytorium (GitHub Desktop albo `git clone https://github.com/LOGIN/trening`) i otwórz folder w Claude Code.
2. Pierwsza prośba do Claude Code:
   > Przeczytaj CLAUDE.md. Zainstaluj zależności (npm install), uruchom testy, a potem pomóż mi skonfigurować clasp: logowanie, .clasp.json z ID skryptu, ID wdrożenia do gas:deploy.

   Przed pierwszym `clasp push`: włącz **Google Apps Script API** na https://script.google.com/home/usersettings.
   Pierwszy `clasp push` zastąpi pliki w Apps Script plikami z `apps-script/`. `Kod.gs` zmieni nazwę na `Code.gs` i jest to zamierzone.
3. Cykl zmiany: prośba do Claude Code → `npm test` → commit i `git push` (web) → `npm run gas:push` + `gas:deploy` (Apps Script).

## Przydatne

| Co | Gdzie |
|---|---|
| Podsumowanie tygodnia | Arkusz → menu **Trening → Odśwież podsumowanie** |
| Ustawienia klienta | Klienci: F ból, G tryb (PROSTY/PRO), H dod_serie, I masters |
| Wymuszenie nowej wersji na telefonach | podbij `VERSION` w `web/sw.js` |
| Analiza wyników | projekt claude.ai: „przeanalizuj ostatni tydzień …” |
