'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type BackgroundCtx = { enabled: boolean; toggle: () => void };
const Ctx = createContext<BackgroundCtx | null>(null);
const KEY = 'planner-bg-enabled';

// Preferencja włączenia animowanego tła (wideo). Domyślnie wł.; zapamiętywana w localStorage.
// Wideo jest kosztowne (dekoduje się + rozmywa co klatkę i zmusza szkło do ciągłego
// przeliczania), więc wyłączenie tła wyraźnie odciąża słabsze urządzenia.
export function BackgroundProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === '0') setEnabled(false);
    } catch {
      /* brak dostępu do localStorage — zostaje domyślne wł. */
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((v) => {
      const next = !v;
      try {
        localStorage.setItem(KEY, next ? '1' : '0');
      } catch {
        /* ignorujemy */
      }
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ enabled, toggle }}>{children}</Ctx.Provider>;
}

export function useBackground(): BackgroundCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBackground musi być użyte wewnątrz BackgroundProvider');
  return ctx;
}
