'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Gif } from '@/app/api/gif-search/route';

// Wyszukiwarka GIF-ów nad polem pisania (GIPHY przez /api/gif-search). Puste pole =
// trendy, wpisywanie szuka po 300 ms ciszy, przewijanie doczytuje. Tap w GIF = wysyłka (onPick).
// Zakładka „Emotki" = emotki z Twitcha przez 7TV (monkaS, pepeD…), ta sama ścieżka.
export default function GifPicker({ onPick, onClose }: { onPick: (g: Gif) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [src, setSrc] = useState<'giphy' | '7tv'>('giphy');
  const [gifs, setGifs] = useState<Gif[] | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // Strona 1 (nowe hasło / zakładka) podmienia listę — po 300 ms ciszy przy pisaniu;
  // kolejne strony (doczytywanie przy przewijaniu) dopisują na koniec.
  useEffect(() => {
    let alive = true;
    loadingRef.current = true;
    const t = window.setTimeout(async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const res = await fetch(`/api/gif-search?src=${src}&page=${page}&q=${encodeURIComponent(q.trim())}`, {
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(json.error ?? `Błąd ${res.status}`);
        const next = json as Gif[];
        setError(null);
        setMore(next.length > 0 && page < 50); // serwer i tak nie poda dalej niż 50. strony
        setGifs((prev) => {
          if (page === 1 || !prev) return next;
          const seen = new Set(prev.map((g) => g.id));
          return [...prev, ...next.filter((g) => !seen.has(g.id))];
        });
        if (page === 1) gridRef.current?.scrollTo({ top: 0 });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Nie udało się pobrać GIF-ów.');
      } finally {
        if (alive) loadingRef.current = false;
      }
    }, q && page === 1 ? 300 : 0);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q, src, page]);

  // Koniec listy blisko ekranu → następna strona.
  useEffect(() => {
    const end = endRef.current;
    if (!end || !more) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !loadingRef.current) setPage((p) => p + 1);
      },
      { root: gridRef.current, rootMargin: '400px' },
    );
    io.observe(end);
    return () => io.disconnect();
  }, [more, gifs]);

  // GIF-y w dwóch stałych kolumnach (każdy do niższej) — doczytane dochodzą na dół,
  // nic nie przeskakuje między kolumnami jak przy CSS columns.
  const cols: Gif[][] = [[], []];
  if (src === 'giphy' && gifs) {
    const h = [0, 0];
    for (const g of gifs) {
      const i = h[0] <= h[1] ? 0 : 1;
      cols[i].push(g);
      h[i] += g.h / g.w;
    }
  }
  const item = (g: Gif) => (
    <button key={g.id} type="button" className="gif-item" onClick={() => onPick(g)} style={{ aspectRatio: `${g.w} / ${g.h}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={g.preview} alt="" loading="lazy" />
    </button>
  );

  return (
    <div className="gif-backdrop" onClick={onClose}>
      <div className="gif-sheet" role="dialog" aria-label="GIF-y" onClick={(e) => e.stopPropagation()}>
        <div className="gif-head">
          <input
            ref={inputRef}
            type="search"
            placeholder={src === '7tv' ? 'Szukaj emotki… (np. monkaS)' : 'Szukaj GIF-a…'}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            enterKeyHint="search"
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.blur()}
          />
          <button type="button" className="gif-close" onClick={onClose} aria-label="Zamknij">
            ✕
          </button>
        </div>
        <div className="gif-tabs" role="tablist">
          {(['giphy', '7tv'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={src === t}
              className={src === t ? 'on' : ''}
              onClick={() => {
                if (t === src) return;
                setGifs(null);
                setError(null);
                setPage(1);
                setSrc(t);
              }}
            >
              {t === 'giphy' ? 'GIF-y' : 'Emotki'}
            </button>
          ))}
        </div>
        <div ref={gridRef} className={`gif-grid${src === '7tv' ? ' emotes' : ''}`}>
          {error && <p className="gif-note">{error}</p>}
          {!error && gifs === null && <p className="gif-note">Wczytuję…</p>}
          {!error && gifs?.length === 0 && <p className="gif-note">Nic nie znalazłem.</p>}
          {src === '7tv' ? (
            gifs?.map(item)
          ) : (
            gifs &&
            gifs.length > 0 && (
              <div className="gif-cols">
                {cols.map((c, i) => (
                  <div key={i}>{c.map(item)}</div>
                ))}
              </div>
            )
          )}
          <div ref={endRef} className="gif-end" />
        </div>
        <p className="gif-credit">{src === '7tv' ? 'Emotki z 7TV' : 'Powered by GIPHY'}</p>
      </div>
    </div>
  );
}
