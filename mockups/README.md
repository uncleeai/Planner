# Mockupy

Koncepty wizualne — statyczny HTML, bez zależności. Otwórz plik w przeglądarce
(`open mockups/<plik>.html`) albo przez dowolny serwer statyczny.

## `wypad-lobby.html` — koncept „Lobby" (faworyt, v2)

Apka jako ready check z gier: wypad = lobby, głos = READY/MOŻE/PAS,
zapominalski = AFK, klepnięty termin = LOCK IN, odbyty = GG. Metafora
mapuje się 1:1 na funkcję apki, więc nie jest gimmickiem.

Layout v2 (trzy ekrany):

- **Hero = skrzynka odbiorcza** — na górę idzie lobby, w którym twój slot
  jest pusty (nie najbliższe datą); ready check prowadzącego terminu jest
  w hero, więc głosujesz bez wchodzenia w wypad.
- **Dwie sekcje zamiast czterech**: „Przed nami" (chronologicznie, status
  jako tag przy wierszu) i „Bylim już" (tag GG).
- **Layout adaptacyjny**: jeden aktywny wypad = hero rośnie w kartę misji
  (pełny skład z imionami, Szturchnij przy AFK, pogoda, zbiórka, zajawka
  czatu) zamiast wisieć nad pustą listą.

Kluczowe decyzje:

- **Skład = 4 sloty, pusty slot zawsze widoczny** (przerywana ramka) — apka
  powstała, bo ktoś został w domu; brak odpowiedzi wygląda jak dziura w drużynie.
- **AFK jako funkcja**: licznik dni bez odpowiedzi + „Szturchnij cytatem"
  (przypominajka losuje cytat Majora).
- **Segmenty gotowości zamiast procentów**: 4 osoby = 4 segmenty, „3/4 READY".
- **Scoreboard, nie gamer RGB**: jeden sygnałowy oranż `#FF8A3D`, zieleń/czerwień
  tylko jako semantyka ready/pas, „może" bez koloru; mono na liczbach i statusach.
- **MOTD** — cytat dnia jako message of the day serwera.
- Paleta: tło `#0C0E10`, tekst `#E8EDF0`, wygaszony `#7F8B94`, sygnał `#FF8A3D`,
  ready `#3DDC8B`, pas `#FF5D5D`. Promienie: karty 12px, kontrolki 8px, bez pigułek.

## `wypad-tablica.html` — koncept „Tablica odjazdów"

Redesign dashboardu i strony wypadu wokół jednej tezy: apka odpowiada na pytanie
„kiedy odjeżdżamy?", więc bohaterem interfejsu jest data.

Kluczowe decyzje:

- **Liść daty** (mono, `tabular-nums`) jako powtarzalna kotwica: dashboard,
  terminy, strona wypadu — ekran skanuje się po datach jak tablica odjazdów.
- **Ludzie zamiast procentów** — przy 4-osobowej paczce pasek „75%" to strata
  informacji; pokazujemy kto dał znać i na kogo czekamy, z imienia.
- **Jeden akcent** (bursztyn `#FFB224`): odliczanie, termin na czele, CTA.
  Zieleń/czerwień tylko dla semantyki głosów; „może" celowo bez koloru.
- **Bez glassmorphizmu** — elewacja (karta) tylko dla najbliższego odjazdu,
  reszta to płaskie wiersze z hairline'ami.
- **CTA na dole ekranu**, pod kciukiem.
- Paleta: smoła `#121114`, kość `#F1EEE8`, popiel `#97928A`, bursztyn `#FFB224`.
