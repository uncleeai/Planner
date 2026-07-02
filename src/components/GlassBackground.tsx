'use client';

import { useBackground } from '@/lib/background';

// Tło „Liquid Glass": statyczna aurora (miękkie plamy światła na czerni) pod szklanymi
// kartami. Cały blask jest teraz wypalony w `background` (.glass-bg, globals.css) jako
// radial-gradienty — bez `filter: blur` i `mix-blend-mode`, które zmuszały iOS do
// rekompozycji całego ekranu przy każdym przerysowaniu (freeze przy naciśnięciu/scrollu
// na słabszym telefonie). Ten element to więc tylko pojedyncza, cache'owana warstwa.
// Wysokość: `100lvh` (patrz komentarz przy .glass-bg). Wyłączalne w Ustawieniach.
export default function GlassBackground() {
  const { enabled } = useBackground();

  if (!enabled) return null;

  return <div className="glass-bg" aria-hidden="true" />;
}
