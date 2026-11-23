# Pomiary ciała: masa i obwody (punkt 15 przeglądu v80)

## Zrobione

- Nowy przełącznik klienta „Pomiary ciała” (panel → Klienci → Ustawienia, kolumna Klienci W `cialo`).
- Klient z włączonym przełącznikiem widzi w Postępie zakładkę „Ciało”: dzień, masa i 5 obwodów (talia, biodra, klatka, ramię, udo; puste pola pomijane, poprzedni pomiar jako szara podpowiedź), wykres masy z pół roku, obwody ze zmianą w 12 tygodniach, 8 ostatnich pomiarów z ✕. Jeden pomiar dziennie (ten sam dzień = poprawka), offline przez kolejkę.
- Arkusz: nowa zakładka Ciało (id = klient|data), API `saveCialo`, `deleteCialo`.
- Panel: karta „Ciało” w przeglądzie karty klienta (wykres masy i pigułki ze zmianą).
- Do sprawdzenia po scaleniu: włączyć u klienta testowego, zapisać pomiar w aplikacji, zobaczyć wiersz w zakładce Ciało i kartę w panelu.

## Ustalenia

- Włączane flagą klienta (domyślnie wyłączone), bo ciężarowcy i klienci siłowi tego nie potrzebują. Sześć pomiarów wybranych przez Damiana: masa, talia, biodra, klatka, ramię, udo; bez % tłuszczu i zdjęć sylwetki (dane wrażliwe, osobna decyzja).
- Kolumna W, a nie T: Q–S zajęło podsumowanie dla ciężarowców, T–V mail po komentarzu i „ostatnio otwarta”.
- Jeden wpis dziennie (id = klient|data, jak Stan), puste pole = brak pomiaru, nie zero. Zakresy jak w aplikacji i na serwerze (`CIALO_ZAKRES` = lib `CIALO`): masa 25–300 kg, obwody w cm. Data nie później niż jutro (strefa czasowa telefonu).
- Bez ocen „dobrze / źle”: zmiana obwodu pokazana liczbą, bez koloru, bo kierunek zależy od celu klienta.
