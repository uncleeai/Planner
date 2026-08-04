'use client';

import { useEffect, useState } from 'react';

// Zarys interfejsu zamiast napisu „Wczytuję…" — apka wygląda, jakby już była,
// a tylko treść dochodzi.
//
// Przez pierwsze SHOW_AFTER ms nie ma NICZEGO: dane zwykle wchodzą szybciej,
// a wtedy jakikolwiek wskaźnik zdążyłby tylko mrugnąć i zniknąć — migotanie
// wygląda gorzej niż spokojna pustka.
const SHOW_AFTER = 250;

function useDelayed(ms: number): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), ms);
    return () => window.clearTimeout(t);
  }, [ms]);
  return show;
}

/** Sam szkielet — do wstawienia wewnątrz istniejącej strony. */
export function LoadingSkeleton() {
  const show = useDelayed(SHOW_AFTER);
  if (!show) return null;
  return (
    <div className="boot" aria-busy="true" aria-label="Wczytywanie">
      <div className="boot-hero skel" />
      <div className="boot-row skel" />
      <div className="boot-row skel" />
    </div>
  );
}

/** Pełny ekran startu (bramka sesji — strony jeszcze nie ma). */
export default function BootScreen() {
  const show = useDelayed(SHOW_AFTER);
  return (
    <main className="glass-page boot" aria-busy="true" aria-label="Wczytywanie">
      {show && (
        <>
          <div className="boot-bar skel" />
          <div className="boot-hero skel" />
          <div className="boot-row skel" />
          <div className="boot-row skel" />
        </>
      )}
    </main>
  );
}
