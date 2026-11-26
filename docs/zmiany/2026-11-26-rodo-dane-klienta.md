# RODO: pobranie i usunięcie danych klienta (punkt 11 przeglądu v80)

## Zrobione

- Panel → Klienci → Ustawienia klienta, karta „Dane klienta (RODO)”.
- „Pobierz dane (ZIP)”: CSV z wierszami klienta z każdej zakładki arkusza (bez klucza i linku), lista filmów z folderu na Dysku i opis.
- „Usuń dane klienta…” (trzeba wpisać imię): wiersze ze wszystkich zakładek, wiersz w Klientach (link przestaje działać), folder z filmami do kosza Dysku (gdy inny klient ma to samo imię, folder zostaje z komunikatem), właściwości maili. Cotygodniowe kopie arkusza zostają do rotacji.
- Nowy plik `apps-script/Rodo.gs` (`trKlientEksport`, `trKlientUsun`) z testami.
- Do sprawdzenia po scaleniu: pobrać ZIP klienta testowego i otworzyć CSV w Excelu; usunąć klienta testowego.

## Ustalenia

- Zakładki wybierane po nagłówku (kolumna `klient_id` albo `klient`), nie z listy na sztywno: nowa zakładka z danymi klienta (np. Pakiety, Ciało) sama wejdzie do pliku i do usuwania. Z Klientów w pliku bez `klucz`, `link`, `urzadzenia` (dostęp do aplikacji, znaczniki telefonów).
- Plik składa serwer (`Utilities.zip`, CSV ze średnikiem i BOM dla Excela), panel go tylko zapisuje: bez biblioteki ZIP w panelu.
- Usuwanie po wpisaniu imienia (jak w GitHubie), bez osobnego wyłączenia „Aktywny”. Wiersze kasowane ciągłymi zakresami od dołu (`rodoRuns_`), bez przepisywania zakładek (formaty `@` i komentarze innych klientów zostają nietknięte). Folder z filmami do kosza Dysku (30 dni na pomyłkę), chyba że ma go też inny klient o tym samym imieniu. Kopie arkusza z `_kopie` zostają do rotacji (8 tygodni): to kopie zapasowe z ograniczonym czasem przechowywania.
