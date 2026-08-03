'use client';

import { useEffect, useState } from 'react';

// Ekran pierwszego uruchomienia (czekanie na sesję Supabase). Zamiast napisu
// „Wczytuję…" pokazujemy zarys interfejsu — apka wygląda, jakby już była, a
// tylko treść dochodzi.
//
// Przez pierwsze SHOW_AFTER ms nie ma NICZEGO: sesja zwykle wczytuje się
// szybciej, a wtedy jakikolwiek wskaźnik zdążyłby tylko mrugnąć i zniknąć —
// migotanie wygląda gorzej niż spokojna pustka.
const SHOW_AFTER = 250;

export default function BootScreen() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), SHOW_AFTER);
    return () => window.clearTimeout(t);
  }, []);

  if (!show) return <main className="glass-page" />;

  return (
    <main className="glass-page boot" aria-busy="true" aria-label="Wczytywanie">
      <div className="boot-bar skel" />
      <div className="boot-hero skel" />
      <div className="boot-row skel" />
      <div className="boot-row skel" />
    </main>
  );
}
