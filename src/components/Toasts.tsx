'use client';

import { Toaster } from 'sonner';

// Host toastów (Sonner) w skórce Lobby — montowany raz w layoucie. Wołaj `toast`
// z 'sonner' albo `appAlert` z Dialogs (błędy). U GÓRY ekranu: dół zajmują CTA
// i composer czatu, a klawiatura iOS zasłoniłaby dolny toast. Kolory i promień
// idą ze zmiennych skórki (klasa .lobby-toaster w globals.css).
export function ToastHost() {
  return (
    <Toaster
      className="lobby-toaster"
      theme="dark"
      position="top-center"
      visibleToasts={3}
      duration={4500}
      offset={{ top: 'calc(12px + env(safe-area-inset-top))' }}
      mobileOffset={{ top: 'calc(10px + env(safe-area-inset-top))', left: 12, right: 12 }}
    />
  );
}
