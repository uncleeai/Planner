'use client';

import { useBackground } from '@/lib/background';

// Tło „Liquid Glass". Wcześniej rozmyte wideo, ale na iOS dekoder bywał ubijany pod
// presją pamięci (zamrożona klatka = trzeba było odświeżać), a rozmycie odtwarzanego
// wideo zacinało scroll. Animowana rozmyta aurora też była janky (przerysowanie co
// klatkę). Teraz statyczny gradient CSS: malowany raz, zero dekodowania i przerysowań —
// nic się nie zacina i nie ma czego zamrażać. Wyłączalne przełącznikiem w menu profilu.
export default function GlassBackground() {
  const { enabled } = useBackground();
  if (!enabled) return null;

  return (
    <div className="glass-bg" aria-hidden="true">
      <div className="glass-aurora" />
      <div className="glass-grain" />
    </div>
  );
}
