# 2026-11-26 · Czat asystenta: taniej i bez powtórnych zgłoszeń

## Zrobione

- `trAsystent`: pamięć podręczna Claude (`cache_control` w zapytaniu), więc zasady, ograniczenia i narzędzia w kolejnych krokach kosztują ułamek ceny; najwyżej 5 kroków na wiadomość (`AG_CHAT_KROKI`, było 8); w zakładce AI `tokeny_we` liczą też tokeny z pamięci podręcznej.
- Zgłoszenia: najwyżej jedno `zglos` na odpowiedź (drugie dostaje odmowę), w instrukcji „raz na sprawę” i „najwyżej 4 zdania”; panel wysyła z historią wykonane akcje (`steps`), a `agChatMsgs_` dopisuje je do odpowiedzi asystenta („Wykonane akcje: zglos ✓”), żeby nie zgłaszał tego samego przy każdej wiadomości.
- Panel: koszt pod każdą odpowiedzią (`.acx`).
- W próbie asystent mówi wprost „(próba: nie zapisano)”, bo trener nic nie dostaje.
- Dzień treningu w `plan` i `historia` dla bota = faktyczny dzień (czysta `agUnitDays_`: start z Sesji, inaczej ostatni zapis serii, inaczej data z planu), tak jak w aplikacji; jednostka zrobiona dziś jest w `plan` ze stanem „zrobiona”.

## Ustalenia

- 26.11 Damian po teście: „drogo wyszło i nic z tego nie wyszło”, asystent „poinformował trenera z 4 razy”. Przyczyny: pełne zasady wysyłane w każdym z do 8 kroków bez pamięci podręcznej; historia bez wykonanych akcji, więc asystent nie wiedział, że już zgłosił.
