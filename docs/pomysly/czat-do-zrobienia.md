# Czat — do zrobienia

Ustalone po wypuszczeniu czatu 2.0 (osobny ekran, linki, zdjęcia, reakcje, pushe bez spamu).
Kolejność dowolna — do omówienia przed startem.

- [ ] **Odpowiedź na wiadomość** — przesunięcie/przytrzymanie → „Odpowiedz", nad polem pisania
      cytat, w dymku mały podgląd cytowanej wiadomości (tap = przewija do niej).
- [ ] **„pisze…"** — wskaźnik, że ktoś właśnie pisze (Realtime presence/broadcast, bez tabeli).
- [ ] **Kto przeczytał** — pod ostatnią wiadomością małe awatary osób, które ją widziały (jak
      w Messengerze). Dane już są: `chat_push_state.seen_at` per osoba i wypad (stawiane przy
      otwartym czacie) — trzeba je udostępnić do odczytu (RPC/polityka) i dorzucić Realtime.
- [ ] **Przypięta wiadomość** — np. adres, godzina zbiórki, lista zakupów; pasek u góry czatu.
- [ ] **Wyciszenie wypadu** (🔕) — tylko jeśli ktoś będzie narzekał na pushe mimo 10-min przerwy.
- [ ] **Sprzątanie zdjęć z czatu w R2** — pliki usuniętych zdjęć zostają (brak GC), gdy będzie potrzeba.
- [ ] **Linki z Tenora jako GIF** — wklejony link tenor.com wyświetlany jako ruszający się GIF, a nie karta linku.
