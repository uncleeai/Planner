'use client';

import { createContext, useCallback, useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Direction = 'forward' | 'back';
type NavigateFn = (href: string, dir?: Direction) => void;

const Ctx = createContext<NavigateFn | null>(null);

// Nawigacja bez snapshotów View Transitions. Animacja wejścia nowej strony jest
// czystym CSS-em — nie „fotografujemy" strony, więc nie ma wyścigu, w którym
// router.push odpalony wewnątrz przejścia bywał porzucany na iOS (tap nie
// przenosił na event). Kierunek trafia na <html data-nav>: CSS wsuwa treść
// z prawej (forward) albo z lewej (back); pierwsze wejście (bez data-nav) — z dołu.
export function TransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const navigate = useCallback<NavigateFn>(
    (href, dir = 'forward') => {
      document.documentElement.dataset.nav = dir;
      router.push(href);
    },
    [router],
  );

  // Systemowy „wstecz" (gest/przycisk) omija navigate() — bez tego zostałby stary
  // kierunek i powrót wsuwałby się z niewłaściwej strony.
  useEffect(() => {
    const onPop = () => { document.documentElement.dataset.nav = 'back'; };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return <Ctx.Provider value={navigate}>{children}</Ctx.Provider>;
}

export function useTransitionNavigate(): NavigateFn {
  const fn = useContext(Ctx);
  if (!fn) throw new Error('useTransitionNavigate musi być użyte wewnątrz TransitionProvider');
  return fn;
}
