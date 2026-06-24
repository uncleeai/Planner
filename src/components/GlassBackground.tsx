'use client';

import { useEffect, useRef } from 'react';

// Tło „Liquid Glass" — wyciszone wideo + rozmycie/nasycenie w CSS.
// Pętla natywna (loop) zamiast ręcznego cofania `currentTime` co klatkę — to ostatnie
// było bardzo kosztowne na iOS (per-klatkowy seek = ciągłe dekodowanie, zabierało wątek
// główny innym animacjom). Pauzujemy też wideo, gdy karta jest w tle.
export default function GlassBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
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
  }, []);

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
