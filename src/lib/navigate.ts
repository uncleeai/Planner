// Otwarcie nawigacji do miejsca wypadu w APCE MAP UŻYTKOWNIKA.
//
// iPhone dostaje Mapy Apple, reszta Google Maps — chodzi o to, żeby wylądować
// w aplikacji, której ktoś faktycznie używa, od razu w trybie prowadzenia,
// zamiast na stronie internetowej map.
//
// Adres liczymy dopiero przy tapnięciu (nie w renderze): rozpoznanie systemu
// czyta navigator, a ten na serwerze nie istnieje — href policzony przy
// renderowaniu rozjechałby się z tym, co wyliczy przeglądarka (hydration).

function isApple(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ podaje się za Maca — stąd dodatkowy warunek z dotykiem.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function navigationUrl(opts: {
  lat?: number | null;
  lon?: number | null;
  place?: string | null;
}): string | null {
  const { lat, lon, place } = opts;
  const hasPoint = typeof lat === 'number' && typeof lon === 'number';
  if (!hasPoint && !place?.trim()) return null;

  const dest = hasPoint ? `${lat},${lon}` : place!.trim();
  if (isApple()) {
    // dirflg=d → od razu trasa samochodem, a nie sam podgląd punktu.
    const q = hasPoint ? `&q=${encodeURIComponent(place?.trim() || dest)}` : '';
    return `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}${q}&dirflg=d`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

/** Czy jest dokąd prowadzić (punkt albo choćby nazwa miejsca). */
export function canNavigate(opts: { lat?: number | null; lon?: number | null; place?: string | null }): boolean {
  return (typeof opts.lat === 'number' && typeof opts.lon === 'number') || !!opts.place?.trim();
}

/** Otwiera nawigację w nowej karcie/aplikacji map. */
export function openNavigation(opts: { lat?: number | null; lon?: number | null; place?: string | null }): void {
  const url = navigationUrl(opts);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
