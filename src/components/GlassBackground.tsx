'use client';

import { useEffect, useRef } from 'react';
import { useBackground } from '@/lib/background';

// Tło „Liquid Glass" — wyciszone wideo + rozmycie/nasycenie w CSS.
// Pętla natywna (loop) zamiast ręcznego cofania `currentTime` co klatkę — to ostatnie
// było bardzo kosztowne na iOS (per-klatkowy seek = ciągłe dekodowanie, zabierało wątek
// główny innym animacjom). Pauzujemy też wideo, gdy karta jest w tle.
// Można je całkiem wyłączyć (przełącznik w menu profilu) dla maksymalnej wydajności.
export default function GlassBackground() {
  const { enabled } = useBackground();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    if (!video) return;

    const tryPlay = () => video.play().catch(() => {});
    tryPlay(); // niektóre Safari nie startują autoplay bez jawnego play()

    const onVisibility = () => {
      if (document.hidden) video.pause();
      else tryPlay();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="glass-bg" aria-hidden="true">
      <video
        ref={videoRef}
        src="/BG/dark abstract.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="glass-video"
      />
      <div className="glass-grain" />
    </div>
  );
}
