'use client';

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type Direction = 'forward' | 'back';
type NavigateFn = (href: string, dir: Direction) => void;

const Ctx = createContext<NavigateFn | null>(null);

type DocWithVT = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<unknown> };
};

// Provider żyje w layoucie (nie odmontowuje się przy nawigacji), dzięki czemu może
// dokończyć animację już po zamontowaniu nowej strony. Mechanizm:
// 1) ustawiamy kierunek na <html data-vt>, 2) startViewTransition robi snapshot starej strony,
// 3) router.push renderuje nową; gdy zmieni się pathname, rozwiązujemy obietnicę, by przeglądarka
//    zrobiła snapshot nowej strony i odpaliła slajd (CSS w globals.css).
export function TransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const resolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (resolveRef.current) {
      resolveRef.current();
      resolveRef.current = null;
    }
  }, [pathname]);

  const navigate = useCallback<NavigateFn>(
    (href, dir) => {
      const doc = document as DocWithVT;
      const reduce =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Brak wsparcia / „ogranicz ruch" / przejście już trwa → zwykła nawigacja
      // (resolveRef.current ≠ null oznacza trwające przejście — nie nakładamy drugiego,
      // bo szybki podwójny tap potrafił dać slajd „z tego samego ekranu na ten sam").
      if (!doc.startViewTransition || reduce || resolveRef.current) {
        router.push(href);
        return;
      }

      document.documentElement.dataset.vt = dir;
      const transition = doc.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            resolveRef.current = resolve;
            router.push(href);
            // Bezpiecznik na wypadek, gdyby nawigacja nie zmieniła ścieżki (np. klik w
            // bieżącą stronę). Hojny czas, bo na wolniejszym momencie iOS nawigacja do
            // /event/... potrafi trwać >0,6 s — wtedy przedwczesny snapshot łapał wciąż
            // stronę główną i animował „home → home". Normalnie zamyka to zmiana pathname.
            setTimeout(() => {
              if (resolveRef.current === resolve) {
                resolveRef.current = null;
                resolve();
              }
            }, 2000);
          }),
      );
      transition.finished.finally(() => {
        if (document.documentElement.dataset.vt === dir) {
          delete document.documentElement.dataset.vt;
        }
      });
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
