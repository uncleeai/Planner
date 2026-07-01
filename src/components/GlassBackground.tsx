'use client';

import { useBackground } from '@/lib/background';

// Tło „Liquid Glass": 6 rozmytych plam (aurora) pod szklanymi kartami — całkiem
// statyczne (bez animacji). Wcześniej rozmyte wideo, ale na iOS dekoder bywał
// ubijany pod presją pamięci (zamrożona klatka = trzeba było odświeżać), a rozmycie
// odtwarzanego wideo zacinało scroll. Ruchoma aurora też kosztowała GPU/baterię
// bez przerwy, nawet gdy appka była na pierwszym planie — statyczny gradient jest
// malowany raz i nic go nie przerysowuje. Wyłączalne przełącznikiem w menu profilu.
export default function GlassBackground() {
  const { enabled } = useBackground();
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
