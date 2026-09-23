'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { LinkPreview } from '@/lib/linkPreview';

// Pamięć podglądów na czas sesji — przewijanie czatu / realtime reload nie odpytuje
// serwera drugi raz o ten sam link (przeglądarka ma jeszcze cache HTTP na dzień).
const cache = new Map<string, Promise<LinkPreview | null>>();

function fetchPreview(url: string): Promise<LinkPreview | null> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return null;
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const pv = (await res.json()) as LinkPreview;
      return pv.title || pv.image ? pv : null;
    })().catch(() => null);
    cache.set(url, p);
  }
  return p;
}

// Karta pod dymkiem: obrazek + tytuł + domena. Strona bez podglądu (albo blokująca
// boty) = nic — sam link w dymku i tak jest klikalny.
export default function LinkCard({ url }: { url: string }) {
  const [pv, setPv] = useState<LinkPreview | null>(null);
  const [imgOk, setImgOk] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchPreview(url).then((p) => alive && setPv(p));
    return () => {
      alive = false;
    };
  }, [url]);

  if (!pv) return null;
  const host = new URL(url).hostname.replace(/^www\./, '');
  return (
    <a className="link-card" href={url} target="_blank" rel="noopener noreferrer">
      {pv.image && imgOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pv.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />
      )}
      <span className="link-card-text">
        {pv.title && <b>{pv.title}</b>}
        <span>{pv.site ?? host}</span>
      </span>
    </a>
  );
}
