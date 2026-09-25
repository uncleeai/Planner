'use client';

// Wibracja na iOS 26.5+ (Apple zablokowało tam `label.click()` z haptics.ts).
// Natywny przełącznik <input switch> tyka silniczkiem tylko przy PRAWDZIWYM dotyku,
// więc kładziemy go niewidocznie na cały przycisk: palec trafia w przełącznik, iOS
// tyka, a akcję odpala onChange. Klik nie bąbelkuje do przycisku (bez podwójnej
// akcji); sam przycisk zostaje dla klawiatury i czytników ekranu.
// Działa tylko przy tapnięciu (nie long-press, nie scroll). Wyłączony przycisk →
// podaj `disabled`, inaczej nakładka dalej łapałaby tapnięcia.
export function HapticSwitch({ onTap, disabled }: { onTap: () => void; disabled?: boolean }) {
  return (
    <input
      type="checkbox"
      className="haptic-switch"
      tabIndex={-1}
      aria-hidden="true"
      disabled={disabled}
      {...({ switch: '' } as object)}
      onClick={(e) => e.stopPropagation()}
      onChange={onTap}
    />
  );
}
