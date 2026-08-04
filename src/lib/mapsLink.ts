// Rozpoznawanie linków z map — dla miejsc, które nie mają adresu („polana za
// lasem", konkretna pinezka na parkingu). Zamiast rysować własną mapę w apce:
// stawiasz pinezkę w Mapach, kopiujesz link, wklejasz w pole miejsca.
//
// Wyciągamy WYŁĄCZNIE współrzędne — nic nie wysyłamy do map, cała robota dzieje
// się na wklejonym tekście.

export type LatLon = { lat: number; lon: number };

// Zakresy współrzędnych; chroni przed wzięciem przypadkowej pary liczb z URL-a.
function valid(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
    // 0,0 to „Null Island" — praktycznie zawsze błąd parsowania, nie miejsce.
    !(lat === 0 && lon === 0)
  );
}

const PATTERNS: RegExp[] = [
  // Google: …/@52.2318,21.0058,17z  oraz  !3d52.2318!4d21.0058 (link „Udostępnij")
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
  // Apple Maps: ?ll=52.2318,21.0058   (także &sll=)
  /[?&]s?ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
  // Google/uniwersalne: ?q=52.2318,21.0058, ?daddr=…, ?destination=…
  /[?&](?:q|daddr|destination|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
  // OpenStreetMap: #map=15/52.2318/21.0058
  /#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/,
  // geo:52.2318,21.0058
  /^geo:(-?\d+\.\d+),(-?\d+\.\d+)/,
];

/** Współrzędne z linku do map albo z samej pary „lat, lon". null = nie rozpoznano. */
export function coordsFromMapsLink(input: string): LatLon | null {
  const text = input.trim();
  if (!text) return null;

  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const lat = Number(m[1]);
      const lon = Number(m[2]);
      if (valid(lat, lon)) return { lat, lon };
    }
  }

  // Wklejona sama para współrzędnych („52.2318, 21.0058") — Mapy pozwalają je
  // skopiować jednym tapnięciem, więc ludzie wysyłają je równie często co linki.
  const bare = /^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/.exec(text);
  if (bare) {
    const lat = Number(bare[1]);
    const lon = Number(bare[2]);
    if (valid(lat, lon)) return { lat, lon };
  }
  return null;
}

/** Czy tekst wygląda na link do map (także skrócony, bez współrzędnych w środku). */
export function looksLikeMapsLink(input: string): boolean {
  return /^https?:\/\/\S*(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com|openstreetmap\.org|osm\.org)/i.test(
    input.trim(),
  );
}
