'use client';

// Krótki haptic tick przy gestach (głos, LOCK IN, long-press, ping).
//
// Android/Chrome: standardowe navigator.vibrate.
// iOS: WebKit nie wspiera Vibration API. Trik: natywny przełącznik
// <input type="checkbox" switch> (Safari 17.4+) tyka silniczkiem przy przełączeniu —
// ale WYŁĄCZNIE gdy klik idzie przez powiązany <label> (klik w sam input nie działa).
// Świeży element na każde wywołanie, jak w znanym, sprawdzonym snippecie.
// UWAGA: Apple załatało ten trik w iOS 26.5 — na nowszych wersjach po prostu cisza.
export function haptic(): void {
  if (typeof window === 'undefined') return;
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(10);
    return;
  }
  try {
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    document.head.removeChild(label);
  } catch {
    /* brak wsparcia — po prostu bez wibracji */
  }
}
