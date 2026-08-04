import { NextResponse } from 'next/server';
import { coordsFromMapsLink } from '@/lib/mapsLink';

// Rozwijanie SKRÓCONYCH linków do map (maps.app.goo.gl — domyślny format
// „Udostępnij" w Mapach Google na telefonie). Skrócony link nie niesie
// współrzędnych: trzeba pójść za przekierowaniem, a tego przeglądarka nie zrobi
// (inny origin, brak CORS) — stąd ten proxy po stronie serwera.
export const dynamic = 'force-dynamic';

// Whitelist hostów. Bez niej endpoint byłby narzędziem do pobierania DOWOLNEGO
// adresu cudzymi rękami (SSRF) — łącznie z adresami wewnętrznymi infrastruktury.
const ALLOWED = [
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'www.google.com',
  'google.com',
  'maps.apple.com',
  'openstreetmap.org',
  'www.openstreetmap.org',
  'osm.org',
];

function allowed(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return ALLOWED.includes(url.hostname.toLowerCase()) ? url : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const { url } = await req.json().catch(() => ({ url: '' }));
  const target = allowed(typeof url === 'string' ? url : '');
  if (!target) return NextResponse.json({ error: 'Nieobsługiwany link.' }, { status: 400 });

  // Idziemy za przekierowaniami ręcznie (maks. kilka), sprawdzając każdy kolejny
  // host — inaczej whitelist można by ominąć jednym przekierowaniem.
  let current = target;
  for (let hop = 0; hop < 5; hop++) {
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: { 'User-Agent': 'Planner/1.0 (+link-expand)' },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      return NextResponse.json({ error: 'Nie udało się otworzyć linku.' }, { status: 502 });
    }

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      const next = allowed(new URL(location, current).toString());
      if (!next) return NextResponse.json({ error: 'Link prowadzi gdzie indziej.' }, { status: 400 });
      // Współrzędne bywają już w samym adresie docelowym.
      const fromRedirect = coordsFromMapsLink(next.toString());
      if (fromRedirect) return NextResponse.json(fromRedirect);
      current = next;
      continue;
    }

    // Koniec przekierowań — spróbuj z ostatniego adresu, potem z treści strony.
    const fromUrl = coordsFromMapsLink(current.toString());
    if (fromUrl) return NextResponse.json(fromUrl);
    const html = await res.text().catch(() => '');
    const fromBody = coordsFromMapsLink(html.slice(0, 200_000));
    if (fromBody) return NextResponse.json(fromBody);
    break;
  }

  return NextResponse.json({ error: 'Nie znalazłem współrzędnych w linku.' }, { status: 404 });
}
