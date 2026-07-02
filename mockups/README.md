# Mockupy

Koncepty wizualne — statyczny HTML, bez zależności. Otwórz plik w przeglądarce
(`open mockups/wypad-tablica.html`) albo przez dowolny serwer statyczny.

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
