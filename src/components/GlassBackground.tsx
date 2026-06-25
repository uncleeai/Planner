'use client';

import { useBackground } from '@/lib/background';

// Tło „aurora" — animowany gradient CSS zamiast wideo. Pętla bezszwowa (animacja
// alternate, zero przeskoku), nigdy się nie freezuje, a ruch idzie wyłącznie przez
// transform (GPU) — koszt znikomy. Można je wyłączyć (przełącznik w menu profilu).
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
