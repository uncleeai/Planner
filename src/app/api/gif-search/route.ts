import { NextResponse } from 'next/server';

// Wyszukiwarka GIF-ów do czatu (GIPHY). Klucz GIPHY_API_KEY tylko po stronie serwera
// (Vercel → Environment Variables), tylko dla zalogowanych z paczki. Pusty `q` = trendy.
// Zwracamy tylko to, czego potrzebuje siatka i wiadomość: podgląd do siatki, wersję
// do dymka (≤ 2 MB) i oryginał na pełny ekran — wszystko z media*.giphy.com.
export const dynamic = 'force-dynamic';

export type Gif = { id: string; preview: string; thumb: string; full: string; w: number; h: number };

type GiphyImage = { url?: string; width?: string; height?: string };
type GiphyItem = { id: string; images: Record<string, GiphyImage | undefined> };

export async function GET(req: Request) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const key = process.env.GIPHY_API_KEY ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!base || !auth) return NextResponse.json({ error: 'Brak autoryzacji.' }, { status: 401 });
  const who = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } });
  if (!who.ok) return NextResponse.json({ error: 'Brak autoryzacji.' }, { status: 401 });
  if (!key) return NextResponse.json({ error: 'GIF-y nie są jeszcze skonfigurowane (brak GIPHY_API_KEY).' }, { status: 503 });

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 50);
  const params = new URLSearchParams({ api_key: key, limit: '30', rating: 'r', lang: 'pl', bundle: 'messaging_non_clips' });
  if (q) params.set('q', q);
  const res = await fetch(`https://api.giphy.com/v1/gifs/${q ? 'search' : 'trending'}?${params}`);
  if (!res.ok) return NextResponse.json({ error: `GIPHY odpowiedział ${res.status}.` }, { status: 502 });
  const { data } = (await res.json()) as { data: GiphyItem[] };

  const gifs: Gif[] = data.flatMap((g) => {
    const preview = g.images.fixed_width ?? g.images.fixed_width_downsampled;
    const thumb = g.images.downsized ?? g.images.fixed_width;
    const full = g.images.original ?? thumb;
    if (!preview?.url || !thumb?.url || !full?.url) return [];
    return [{ id: g.id, preview: preview.url, thumb: thumb.url, full: full.url, w: Number(thumb.width) || 1, h: Number(thumb.height) || 1 }];
  });
  return NextResponse.json(gifs, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
