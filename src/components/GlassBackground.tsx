'use client';

import { useEffect, useRef } from 'react';
import { useBackground } from '@/lib/background';

// [TEST] Przywrócone tło WIDEO (do porównania płynności z aurorą CSS przy zamykaniu
// panelu tworzenia). Pętla natywna + pauza gdy karta w tle. Wyłączalne w menu profilu.
export default function GlassBackground() {
  const { enabled } = useBackground();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    if (!video) return;
    const tryPlay = () => video.play().catch(() => {});
    tryPlay();
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
