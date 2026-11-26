# 26.11.2026 – bez powiększania dwoma palcami

## Zrobione

- Aplikacja klienta (też w trybie „Prowadź”) i panel trenera nie powiększają się już gestem dwóch palców ani podwójnym dotknięciem. Zgłoszenie Damiana ze zrzutem z Androida: w trakcie treningu ekran powiększał się przypadkiem i wiersze serii wychodziły poza ekran.
- Android (Chrome): `maximum-scale=1, user-scalable=no` w viewport `index.html` i `trener.html`.
- iPhone (Safari ignoruje `user-scalable=no`): `html{touch-action:pan-x pan-y}` (przewijanie zostaje, powiększanie i podwójne dotknięcie nie) i `preventDefault` na `gesturestart` / `gesturechange` / `gestureend` w `app.js` i `trener.js`. `maximum-scale=1` wyłącza też samo powiększanie się iPhone’a przy dotknięciu pola z małą czcionką.
- Powiększanie palcami w odtwarzaczu filmów panelu działa dalej (własne, na zdarzeniach pointer).
- Do sprawdzenia: Android i iPhone, Trening → próba powiększenia dwoma palcami i podwójne dotknięcie liczby; panel → Filmy → powiększenie palcami w filmie dalej działa.

## Ustalenia

- Zastępuje zasadę dostępności „bez `maximum-scale`” (CLAUDE.md). Kto potrzebuje powiększenia, ma je w telefonie: Chrome → Ustawienia → Ułatwienia dostępu → „Wymuś powiększanie”, iPhone → Ustawienia → Dostępność → Zoom.
