// Kolor akcentu skórki — preferencja per urządzenie (localStorage), aplikowana
// na --accent; wszystkie pochodne (tinty, ramki, hovery) liczy CSS color-mix().
// Zieleń/czerwień celowo poza paletą — to semantyka głosów READY/PAS.

export const ACCENTS = [
  { color: '#ff8a3d', label: 'Oranż' },
  { color: '#ffb224', label: 'Bursztyn' },
  { color: '#4dabf7', label: 'Błękit' },
  { color: '#3bc9db', label: 'Cyjan' },
  { color: '#b197fc', label: 'Fiolet' },
  { color: '#f783ac', label: 'Róż' },
] as const;

const KEY = 'planner-accent';

export function getAccent(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v && /^#[0-9a-fA-F]{6}$/.test(v)) return v;
  } catch { /* brak localStorage */ }
  return ACCENTS[0].color;
}

export function setAccent(color: string): void {
  try { localStorage.setItem(KEY, color); } catch { /* ignorujemy */ }
  document.documentElement.style.setProperty('--accent', color);
}

// Inline boot-skrypt (layout): aplikuje zapisany akcent PRZED pierwszym malowaniem,
// żeby nie było błysku domyślnego oranżu.
export const ACCENT_BOOT_SCRIPT =
  `try{var a=localStorage.getItem('${KEY}');if(a&&/^#[0-9a-fA-F]{6}$/.test(a))document.documentElement.style.setProperty('--accent',a)}catch(e){}`;
