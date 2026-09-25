'use client';

// TEST wibracji na iOS 26.5+ (Apple zablokowało tam `label.click()` z haptics.ts).
// Natywny przełącznik <input switch> tyka silniczkiem tylko przy PRAWDZIWYM dotyku,
// więc kładziemy go niewidocznie na cały przycisk: palec trafia w przełącznik, iOS
// tyka, a akcję odpala onChange. Klik nie bąbelkuje do przycisku (bez podwójnej
// akcji); sam przycisk zostaje dla klawiatury i czytników ekranu.
// Rodzic musi mieć `position: relative` (zob. .haptic-switch w globals.css).
export function HapticSwitch({ onTap }: { onTap: () => void }) {
  return (
    <input
      type="checkbox"
      className="haptic-switch"
      tabIndex={-1}
      aria-hidden="true"
      {...({ switch: '' } as object)}
      onClick={(e) => e.stopPropagation()}
      onChange={onTap}
    />
  );
}
