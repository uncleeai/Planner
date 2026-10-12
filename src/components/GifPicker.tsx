'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Gif } from '@/app/api/gif-search/route';

// Wyszukiwarka GIF-ów nad polem pisania (GIPHY przez /api/gif-search). Puste pole =
// trendy, wpisywanie szuka po 300 ms ciszy. Tap w GIF = wysyłka (onPick).
// Zakładka „Emotki" = emotki z Twitcha przez 7TV (monkaS, pepeD…), ta sama ścieżka.
export default function GifPicker({ onPick, onClose }: { onPick: (g: Gif) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [src, setSrc] = useState<'giphy' | '7tv'>('giphy');
  const [gifs, setGifs] = useState<Gif[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const res = await fetch(`/api/gif-search?src=${src}&q=${encodeURIComponent(q.trim())}`, {
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(json.error ?? `Błąd ${res.status}`);
        setError(null);
        setGifs(json as Gif[]);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Nie udało się pobrać GIF-ów.');
      }
    }, q ? 300 : 0);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q, src]);

  return (
    <div className="gif-backdrop" onClick={onClose}>
      <div className="gif-sheet" role="dialog" aria-label="GIF-y" onClick={(e) => e.stopPropagation()}>
        <div className="gif-head">
          <input
            ref={inputRef}
            type="search"
            placeholder={src === '7tv' ? 'Szukaj emotki… (np. monkaS)' : 'Szukaj GIF-a…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
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
                setSrc(t);
              }}
            >
              {t === 'giphy' ? 'GIF-y' : 'Emotki'}
            </button>
          ))}
        </div>
        <div className={`gif-grid${src === '7tv' ? ' emotes' : ''}`}>
          {error && <p className="gif-note">{error}</p>}
          {!error && gifs === null && <p className="gif-note">Wczytuję…</p>}
          {!error && gifs?.length === 0 && <p className="gif-note">Nic nie znalazłem.</p>}
          {gifs?.map((g) => (
            <button key={g.id} type="button" className="gif-item" onClick={() => onPick(g)} style={{ aspectRatio: `${g.w} / ${g.h}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.preview} alt="" loading="lazy" />
            </button>
          ))}
        </div>
        <p className="gif-credit">{src === '7tv' ? 'Emotki z 7TV' : 'Powered by GIPHY'}</p>
      </div>
    </div>
  );
}
