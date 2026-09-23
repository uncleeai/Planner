import { NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import { isPrivateAddress, parsePreview } from '@/lib/linkPreview';

// Podgląd linku z czatu (karta jak w iMessage): serwer pobiera stronę i czyta jej
// znaczniki Open Graph — przeglądarka nie może (CORS). Zabezpieczenia, bo to
// „pobierz dowolny URL":
// - tylko zalogowani z paczki (token Supabase sprawdzany w /auth/v1/user),
// - tylko http/https na porcie domyślnym, adres musi rozwiązywać się na PUBLICZNE IP
//   (bez sieci wewnętrznej / metadanych chmury), każde przekierowanie sprawdzane od nowa,
// - limit czasu i rozmiaru; czytamy do og:image (zwykle <head>, YouTube ma je w <body>).
// Wynik cache'uje przeglądarka (dzień) + pamięć klienta, więc stronę pobieramy rzadko.
export const dynamic = 'force-dynamic';

// YouTube ma ~700 KB samego <head> (inline skrypty przed og:*), stąd zapas.
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 4000;
const MAX_REDIRECTS = 4;

async function isAllowed(url: URL): Promise<boolean> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.port && url.port !== '80' && url.port !== '443') return false;
  if (url.username || url.password) return false;
  try {
    const addrs = await lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

async function readHead(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const dec = new TextDecoder();
  let html = '';
  let bytes = 0;
  let headEnd = -1;
  while (bytes < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    const chunk = dec.decode(value, { stream: true });
    // Szukamy tylko w nowym kawałku (+ zakładka na tag przecięty granicą).
    const tail = html.slice(-400) + chunk;
    html += chunk;
    if (/og:image[^>]*>/i.test(tail)) break;
    if (headEnd < 0 && /<\/head>/i.test(tail)) headEnd = bytes;
    // Kanały YouTube wstawiają og:* do <body> (~50 KB za </head>) — po końcu
    // nagłówka czytamy jeszcze trochę, zanim uznamy, że obrazka nie ma.
    if (headEnd >= 0 && bytes - headEnd > 400_000) break;
  }
  reader.cancel().catch(() => {});
  return html;
}

export async function GET(req: Request) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!base || !auth) return NextResponse.json({ error: 'Brak autoryzacji.' }, { status: 401 });
  const who = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } });
  if (!who.ok) return NextResponse.json({ error: 'Brak autoryzacji.' }, { status: 401 });

  let url: URL;
  try {
    url = new URL(new URL(req.url).searchParams.get('url') ?? '');
  } catch {
    return NextResponse.json({ error: 'Zły adres.' }, { status: 400 });
  }

  try {
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await isAllowed(url))) return NextResponse.json({ error: 'Adres niedozwolony.' }, { status: 400 });
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WypadLinkPreview/1.0)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'pl,en;q=0.8',
        },
      });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!next) break;
      url = new URL(next, url);
      res = null;
    }
    if (!res || !res.ok || !(res.headers.get('content-type') ?? '').includes('html')) {
      return NextResponse.json({ error: 'Brak podglądu.' }, { status: 404 });
    }
    const preview = parsePreview(await readHead(res), url.href);
    return NextResponse.json(preview, { headers: { 'Cache-Control': 'private, max-age=86400' } });
  } catch {
    return NextResponse.json({ error: 'Brak podglądu.' }, { status: 404 });
  }
}
