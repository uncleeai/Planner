'use client';

import { ViewTransition } from 'react';

// Owija zawartość strony w animację przejścia kierunkowego (iOS-owy slide):
// wejście w wypad jedzie z prawej, powrót — z lewej. Kierunek niesie `transitionTypes`
// z <Link>/router (nav-forward / nav-back); bez typu (np. back przeglądarki) brak animacji.
export default function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'none' }}
      exit={{ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'none' }}
      default="none"
    >
      <div className="page-transition">{children}</div>
    </ViewTransition>
  );
}
