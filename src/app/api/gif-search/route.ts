import { NextResponse } from 'next/server';

// Wyszukiwarka GIF-ów do czatu: GIPHY (domyślnie) albo emotki z Twitcha przez 7TV
// (`src=7tv`, publiczne API bez klucza). Klucz GIPHY_API_KEY tylko po stronie serwera
// (Vercel → Environment Variables), tylko dla zalogowanych z paczki. Pusty `q` = trendy.
// Zwracamy tylko to, czego potrzebuje siatka i wiadomość: podgląd do siatki, wersję
// do dymka (≤ 2 MB) i oryginał na pełny ekran — wszystko z media*.giphy.com.
export const dynamic = 'force-dynamic';

// Ile wyników na stronę (GIPHY i 7TV) — klient doczytuje, dopóki strona jest pełna.
export const PAGE = 30;

export type Gif = { id: string; preview: string; thumb: string; full: string; w: number; h: number };

type SevenTvEmote = { id: string; name: string; host: { url: string; files: { name: string; width: number; height: number }[] } };

// 7TV: emotka w kilku rozmiarach (1x–4x, wysokość 32–128 px); animowane WebP działają
// w Safari. Do siatki 2x, do wiadomości 4x (najostrzejsza). Pusty `q` = kategoria TOP
// (GIGACHAD, catJAM, KEKW…); przy wyszukiwaniu bez kategorii — TOP miesza tam tagi.
// `page` od 1 — siatka doczytuje kolejne strony przy przewijaniu.
async function sevenTv(q: string, page: number): Promise<Gif[] | null> {
  const res = await fetch('https://7tv.io/v3/gql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query($q:String!,$p:Int){emotes(query:$q,page:$p,limit:${PAGE},${q ? '' : 'filter:{category:TOP},'}sort:{value:"popularity",order:DESCENDING}){items{id name host{url files{name width height}}}}}`,
      variables: { q, p: page },
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { emotes?: { items?: SevenTvEmote[] } } };
  // Dokładna nazwa (np. „monkaS") na początek — popularność sama wypycha warianty.
  const exact = (e: SevenTvEmote) => (e.name.toLowerCase() === q.toLowerCase() ? 0 : 1);
  const items = [...(json.data?.emotes?.items ?? [])];
  if (page === 1) items.sort((a, b) => exact(a) - exact(b));
  return items.flatMap((e) => {
    const big = e.host.files.find((f) => f.name === '4x.webp');
    if (!big) return [];
    const base = `https:${e.host.url}`;
    return [{ id: e.id, preview: `${base}/2x.webp`, thumb: `${base}/4x.webp`, full: `${base}/4x.webp`, w: big.width, h: big.height }];
  });
}

type GiphyImage = { url?: string; webp?: string; width?: string; height?: string };
type GiphyItem = { id: string; images: Record<string, GiphyImage | undefined> };

export async function GET(req: Request) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const key = process.env.GIPHY_API_KEY ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!base || !auth) return NextResponse.json({ error: 'Brak autoryzacji.' }, { status: 401 });
  const who = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } });
  if (!who.ok) return NextResponse.json({ error: 'Brak autoryzacji.' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') ?? '').trim().slice(0, 50);
  const page = Math.min(Math.max(Number(sp.get('page')) || 1, 1), 50);
  if (sp.get('src') === '7tv') {
    const emotes = await sevenTv(q, page);
    if (!emotes) return NextResponse.json({ error: '7TV nie odpowiada.' }, { status: 502 });
    return NextResponse.json(emotes, { headers: { 'Cache-Control': 'private, max-age=300' } });
  }

  if (!key) return NextResponse.json({ error: 'GIF-y nie są jeszcze skonfigurowane (brak GIPHY_API_KEY).' }, { status: 503 });
  const params = new URLSearchParams({ api_key: key, limit: String(PAGE), offset: String((page - 1) * PAGE), rating: 'r', lang: 'pl' });
  if (q) params.set('q', q);
  const res = await fetch(`https://api.giphy.com/v1/gifs/${q ? 'search' : 'trending'}?${params}`);
  if (!res.ok) return NextResponse.json({ error: `GIPHY odpowiedział ${res.status}.` }, { status: 502 });
  const { data } = (await res.json()) as { data: GiphyItem[] };

  const gifs: Gif[] = data.flatMap((g) => {
    // Siatka: animowany WebP 200 px (kilka razy lżejszy od GIF-a — 30 sztuk naraz na
    // komórce); dymek: „downsized" (≤ 2 MB); pełny ekran: oryginał.
    const fw = g.images.fixed_width;
    const preview = fw?.webp ?? g.images.fixed_width_downsampled?.url ?? fw?.url;
    const thumb = g.images.downsized?.url ? g.images.downsized : fw;
    const full = g.images.original?.url ?? thumb?.url;
    if (!preview || !thumb?.url || !full) return [];
    return [{ id: g.id, preview, thumb: thumb.url, full, w: Number(thumb.width) || 1, h: Number(thumb.height) || 1 }];
  });
  return NextResponse.json(gifs, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
