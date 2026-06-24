import { useEffect, useRef } from 'react';

// Tło „Liquid Glass" w stylu Apple — wyciszone, zoptymalizowane wideo + rozmycie i nasycenie w CSS.
export default function GlassBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Wyłączamy wbudowany loop, aby kontrolować kierunek za pomocą JavaScript
    video.loop = false;

    let direction = 1; // 1 = w przód, -1 = w tył
    let lastTime = performance.now();
    let frameId: number;

    const updatePlay = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      if (video.duration) {
        if (direction === 1) {
          // Odtwarzanie w przód: pozwalamy przeglądarce odtwarzać naturalnie
          if (video.paused) {
            video.play().catch(() => {});
          }
          // Gdy zbliżamy się do końca, zmieniamy kierunek
          if (video.currentTime >= video.duration - 0.1) {
            direction = -1;
            video.pause();
          }
        } else {
          // Odtwarzanie w tył: cofamy currentTime o delta czasowy
          let target = video.currentTime - delta;
          if (target <= 0.1) {
            target = 0.1;
            direction = 1;
            video.play().catch(() => {});
          }
          video.currentTime = target;
        }
      }

      frameId = requestAnimationFrame(updatePlay);
    };

    frameId = requestAnimationFrame(updatePlay);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div className="glass-bg" aria-hidden="true">
      <video
        ref={videoRef}
        src="/BG/dark abstract.mp4"
        autoPlay
        muted
        playsInline
        className="glass-video"
      />
      <div className="glass-grain" />
    </div>
  );
}
