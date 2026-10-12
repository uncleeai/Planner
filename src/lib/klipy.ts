import type { Gif } from '@/app/api/gif-search/route';

// KLIPY (następca Tenora) — wyszukiwarka GIF-ów. Wymóg KLIPY: zapytania i media idą
// prosto z przeglądarki (bez naszego serwera po drodze), wyniki w kolejności z API,
// w polu szukania napis „Search KLIPY". Klucz jest publiczny z założenia (jak w ich SDK).
export const KLIPY_KEY = process.env.NEXT_PUBLIC_KLIPY_KEY ?? '';

type KFile = { url?: string; width?: number; height?: number };
type KItem = { id: number | string; slug?: string; title?: string; file?: Record<string, Record<string, KFile | undefined> | undefined> };

export async function klipySearch(q: string, page: number): Promise<Gif[]> {
  const params = new URLSearchParams({ page: String(page), per_page: '30', locale: 'pl', content_filter: 'low' });
  if (q) params.set('q', q);
  const res = await fetch(`https://api.klipy.com/api/v1/${KLIPY_KEY}/gifs/${q ? 'search' : 'trending'}?${params}`);
  if (!res.ok) throw new Error(`KLIPY odpowiedział ${res.status}.`);
  const json = (await res.json()) as { data?: { data?: KItem[] } };
  return (json.data?.data ?? []).flatMap((it) => {
    // Siatka: małe WebP; dymek: średnie WebP (animowane, kilka razy lżejsze od GIF-a);
    // pełny ekran: HD.
    const sm = it.file?.sm?.webp ?? it.file?.sm?.gif;
    const md = it.file?.md?.webp ?? it.file?.md?.gif ?? sm;
    const hd = it.file?.hd?.webp ?? it.file?.hd?.gif ?? md;
    if (!sm?.url || !md?.url || !hd?.url) return [];
    return [{ id: String(it.slug ?? it.id), preview: sm.url, thumb: md.url, full: hd.url, w: md.width || 1, h: md.height || 1 }];
  });
}
