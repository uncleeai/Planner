'use client';

import { useEffect, useState } from 'react';
import { useBackground } from '@/lib/background';

// Tło „Liquid Glass": 6 rozmytych, animowanych plam (aurora) pod szklanymi kartami.
// Wcześniej rozmyte wideo, ale na iOS dekoder bywał ubijany pod presją pamięci
// (zamrożona klatka = trzeba było odświeżać), a rozmycie odtwarzanego wideo zacinało
// scroll — animowane bloby są tańsze. Nadal kosztują GPU/baterię cały czas gdy appka
// jest widoczna, więc pauzujemy animację, gdy karta/appka jest w tle (Page Visibility) —
// zero sensu animować coś, czego nikt nie widzi. Wyłączalne całkiem przełącznikiem w menu.
export default function GlassBackground() {
  const { enabled } = useBackground();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!enabled) return null;

  return (
    <div className="glass-bg" aria-hidden="true">
      <div className={`glass-aurora${paused ? ' paused' : ''}`}>
        <i className="aurora-blob b1" />
        <i className="aurora-blob b2" />
        <i className="aurora-blob b3" />
        <i className="aurora-blob b4" />
        <i className="aurora-blob b5" />
        <i className="aurora-blob b6" />
      </div>
      <div className="glass-grain" />
    </div>
  );
}
