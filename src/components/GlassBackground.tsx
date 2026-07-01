'use client';

import { useEffect } from 'react';
import { useBackground } from '@/lib/background';

// Tło „Liquid Glass": 6 rozmytych plam (aurora) pod szklanymi kartami — całkiem
// statyczne (bez animacji). Wcześniej rozmyte wideo, ale na iOS dekoder bywał
// ubijany pod presją pamięci (zamrożona klatka = trzeba było odświeżać), a rozmycie
// odtwarzanego wideo zacinało scroll. Ruchoma aurora też kosztowała GPU/baterię
// bez przerwy, nawet gdy appka była na pierwszym planie — statyczny gradient jest
// malowany raz i nic go nie przerysowuje. Wyłączalne przełącznikiem w menu profilu.
export default function GlassBackground() {
  const { enabled } = useBackground();

  // 100dvh w standalone PWA na iOS bywa niestabilnie przeliczane przy starcie appki —
  // czasem daje za niską wartość (stąd czarny pasek u dołu). Mierzymy realną wysokość
  // okna w JS i wystawiamy jako zmienną CSS. `--app-vh` używane w .glass-bg i na
  // html/body (globals.css); dvh zostaje jako fallback, zanim ten efekt zdąży się
  // wykonać (pierwsza klatka przed hydracją).
  // Na cold-starcie sam pomiar zaraz po zamontowaniu bywa jeszcze niedojrzały — iOS nie
  // zawsze zdążył domknąć layout pod bezpieczny obszar, zanim JS w ogóle się wykona.
  // Naprawiało się dopiero po jakimkolwiek zdarzeniu resize (np. focus na polu przy
  // otwieraniu formularza podnosi klawiaturę). Żeby nie wymagać interakcji, mierzymy
  // ponownie kilka razy tuż po starcie, aż wartość się ustabilizuje.
  useEffect(() => {
    const setVh = () => {
      document.documentElement.style.setProperty('--app-vh', `${window.innerHeight}px`);
    };
    setVh();
    const timers = [50, 200, 500, 1000].map((ms) => window.setTimeout(setVh, ms));
    window.addEventListener('resize', setVh);
    window.addEventListener('pageshow', setVh);
    document.addEventListener('visibilitychange', setVh);
    window.visualViewport?.addEventListener('resize', setVh);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('resize', setVh);
      window.removeEventListener('pageshow', setVh);
      document.removeEventListener('visibilitychange', setVh);
      window.visualViewport?.removeEventListener('resize', setVh);
    };
  }, []);

  if (!enabled) return null;

  return (
    <div className="glass-bg" aria-hidden="true">
      <div className="glass-aurora">
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
