'use client';

// Krótki haptic tick przy gestach (głos, LOCK IN, long-press, ping).
//
// Android/Chrome: standardowe navigator.vibrate.
// iOS: WebKit nie wspiera Vibration API — ale od iOS 17.4 programowe kliknięcie
// natywnego przełącznika <input type="checkbox" switch> odpala systemowy tick
// (ten sam co przełączniki w Ustawieniach). To znany trik; jedyny haptic dostępny
// z poziomu PWA. Działa wyłącznie w kontekście gestu użytkownika.
let iosSwitch: HTMLInputElement | null = null;

export function haptic(): void {
  if (typeof window === 'undefined') return;
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(10);
    return;
  }
  try {
    if (!iosSwitch) {
      iosSwitch = document.createElement('input');
      iosSwitch.type = 'checkbox';
      iosSwitch.setAttribute('switch', '');
      iosSwitch.style.display = 'none';
      document.body.appendChild(iosSwitch);
    }
    iosSwitch.click();
  } catch {
    /* brak wsparcia — po prostu bez wibracji */
  }
}
