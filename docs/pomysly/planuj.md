# Pomysł: „Planuj" — burza mózgów przed dużym wyjazdem

**Status:** szkic, nic nie zaimplementowane. Do przemyślenia przez autora.
**Zapisane:** sierpień 2026, na podstawie rozmowy.

## Skąd to się wzięło

Appka obsługuje dziś wypad, w którym *gdzie* jest już wiadome, a otwarte zostaje
tylko *kiedy* — proponujesz terminy, paczka głosuje, organizator klepie termin.

Przy **dużym wyjeździe jest odwrotnie**: najpierw przez kilka tygodni lecą pomysły
(„a może Chorwacja", „patrzcie jaki domek"), linki do noclegów i lokacji, zdjęcia —
a termin to ostatnia rzecz, którą się ustala. Tego etapu w appce nie ma, więc
odbywa się na WhatsAppie, gdzie linki giną w scrollu.

Cytat z rozmowy (autor):

> bardziej myślałem o miejscu gdzie jest burza mózgów i każdy proponuje gdzie by
> chciał pojechać, jakieś linki do lokacji czy zakwaterowania. Zdjęcia przykładowe
> itd. Coś żeby duży wyjazd zaplanować a nie proste wyjście na miasto czy do kina

## Proponowany kształt

**Plan to osobny byt na dashboardzie**, obok wypadów — a nie „wypad bez daty".
W środku lista **propozycji**; każdy z paczki wrzuca swoją:

- nazwa (np. „Domek nad Soliną"),
- link (Booking / Airbnb / nocowanie / mapa),
- zdjęcie,
- dwa zdania czemu akurat to.

Paczka daje kciuki, widać kto co poparł. Kiedy jedna propozycja wygrywa →
**„Zrób z tego wypad"** jednym tapem: powstaje normalny wypad z wypełnionym
tytułem i miejscem, i dopiero wtedy startuje to, co appka już umie — terminy,
głosowanie, ustalenie. Plan zostaje podlinkowany jako historia decyzji.

Dzięki temu nic się nie dubluje: **plan odpowiada na *gdzie*, wypad na *kiedy***.

## Co już mamy, a co dochodzi

Do przełożenia jeden do jednego: czat, kciuki i avatary, realtime, push,
upload zdjęć z miniaturami (pipeline z galerii), sheet do tworzenia.

Nowe: tabela na plany + tabela na propozycje (z RLS w tym samym duchu co reszta —
czyta każdy zalogowany, edytuje tylko autor) oraz ekran listy planów.

## Miejsce, które trzeba przemyśleć: podglądy linków

Żeby z wklejonego linku sama wyskoczyła nazwa i zdjęcie, potrzebny jest serwerowy
odczyt tagów OpenGraph. Wzór mamy w `src/app/api/maps-link/route.ts` — biała lista
hostów, `redirect: 'manual'`, limit skoków, timeout (ochrona przed SSRF).

**Ryzyko:** część serwisów (Booking, Airbnb) blokuje takie odczyty albo serwuje
treść dopiero z JS-a. Realne założenie: próbujemy wyciągnąć podgląd automatycznie,
a gdy się nie uda — użytkownik wkleja zdjęcie sam. Nie obiecujemy, że każdy link
ładnie się rozwinie.

## Czego świadomie NIE wrzucać na tym etapie

Planu dnia, budżetu z podziałem, listy rzeczy do zabrania. Burza mózgów ma być
lekka — im więcej pól w formularzu, tym mniej osób cokolwiek wrzuci. Składka
(„po ile się składamy") i „kto co bierze" mogą dojść później, już w wypadzie,
kiedy termin stoi.

## Pytania otwarte (do decyzji autora)

1. **Dyskusja pod każdą propozycją, czy jeden czat na cały plan?**
   Rekomendacja: zacząć od jednego czatu — komentarze per propozycja szybko robią
   się ciężkie.
2. **Kciuk jako zwykłe „podoba mi się", czy skala „mogę / może / nie"** jak przy
   terminach? Rekomendacja: prosty kciuk, bo na tym etapie nikt nic nie deklaruje.

## Powiązane, odrzucone i odłożone pomysły

- **Osobna zakładka „Planuj" dublująca zakładanie wypadu** — odrzucone: rozdwaja
  ten sam pomysł na dwa ekrany („wpisuję to w Planuj czy zakładam wypad?").
- **Rozliczenia po wypadzie (kto komu ile)** — odrzucone przez autora: „brzmi
  trochę jak jakaś korpo apka".
- **Składka — sama kwota na osobę** — uzgodnione, że warto, nie zaczęte.
- **Skrzynka luźnych pomysłów bez daty** („kiedyś Bieszczady") — bliski krewny
  tego planu; być może to po prostu plan bez propozycji, nie osobny byt.
