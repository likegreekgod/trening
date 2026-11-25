# 2026-11-25 · Mail po komentarzu i „ostatnio otwarta” (punkty 12 i 13 przeglądu v80, PR 6 z planu reszty)

## Zrobione

- Mail po komentarzu: klient z nowym przełącznikiem „Mail po komentarzu” (panel → Klienci → Ustawienia, sekcja „Maile do klienta”, kolumna Klienci T `mail_kom`) dostaje ok. 20:00 jeden mail, gdy tego dnia trener skomentował jego trening (sesja, seria, film, też komentarz z Dysku): trening, dzień i pierwsze zdanie komentarza, przycisk otwiera zakładkę Trener (`?t=trener`). Najwyżej jeden dziennie, ten sam komentarz nie wraca. Wyzwalacz `wieczornyMail` instaluje „Zainstaluj wyzwalacze” albo pierwsze włączenie w panelu.
- „Ostatnio otwarta”: aplikacja przy pobraniu planu wysyła losowy znacznik telefonu, serwer zapisuje Klienci U `otwarta` i V `urzadzenia` (najwyżej raz na 10 min); panel → Klienci pod imieniem „otwarta 2 h temu · 1 telefon”, przy 3 i więcej telefonach w 60 dni ⚠ (link mógł pójść dalej).
- Kolumny T–V są za Q–S (max_rwanie, max_podrzut, start), w `KL_EXTRA`; nagłówki dopisuje `klSheet_`.
- Do sprawdzenia: „Zainstaluj wyzwalacze”, przełącznik u klienta testowego, komentarz i mail wieczorem; w arkuszu Klienci nagłówki T–V.

## Ustalenia

- Mail po komentarzu raz dziennie ok. 20:00 (`MAIL_KOM_GODZ`), nie od razu po zapisie: trener często komentuje kilka serii po kolei, a jeden zbiorczy mail nie zasypuje klienta. Domyślnie wyłączony (`KL_DOMYSLNE.mailKom` = false), osobny przełącznik od porannego maila.
- „Nowy” komentarz = skrót tekstu (`komHash_`) spoza zapamiętanych we właściwości `MKS_<klient>` z ostatniego wieczoru (okno 14 dni); poprawiony komentarz liczy się jak nowy. Pierwszy wieczór po włączeniu: tylko komentarze do treningów z wczoraj i dziś, żeby nie wysłać zaległości. Błąd wysyłki nie zapisuje skrótów, więc komentarz pójdzie następnego dnia.
- W mailu tylko pierwsze zdanie: cały komentarz i odpowiedź są w aplikacji.
- „Ostatnio otwarta”: znacznik telefonu to losowe 12 znaków w `localStorage` „dev”, bez modelu telefonu i adresu IP. Zapis najwyżej raz na 10 min na telefon (CacheService), błąd zapisu nie blokuje planu. Trener prowadzący trening się nie liczy. Ostrzeżenie od 3 telefonów w 60 dni: jeden klient ma zwykle telefon i czasem komputer.
