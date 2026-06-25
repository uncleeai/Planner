'use client';

import { createContext, useCallback, useContext } from 'react';
import { useRouter } from 'next/navigation';

type Direction = 'forward' | 'back';
type NavigateFn = (href: string, dir?: Direction) => void;

const Ctx = createContext<NavigateFn | null>(null);

// Nawigacja bez snapshotów View Transitions. Animacja wejścia nowej strony jest
// czystym CSS-em na <main> (keyframes page-in w globals.css) — nie robimy „zdjęcia"
// całej strony, więc nie ma kosztu rasteryzacji ani znanego problemu z kotwiczeniem
// snapshotu przy przewiniętej stronie (stutter/przeskok po zescrollowaniu).
// Kierunek (dir) zostaje w sygnaturze dla zgodności wywołań, ale nie jest używany.
export function TransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const navigate = useCallback<NavigateFn>(
    (href) => {
      router.push(href);
    },
    [router],
  );

  return <Ctx.Provider value={navigate}>{children}</Ctx.Provider>;
}

export function useTransitionNavigate(): NavigateFn {
  const fn = useContext(Ctx);
  if (!fn) throw new Error('useTransitionNavigate musi być użyte wewnątrz TransitionProvider');
  return fn;
}
