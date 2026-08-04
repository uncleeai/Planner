'use client';

import { useEffect, useRef, useState } from 'react';
import { searchPlaces, placeFromCoords, type Place } from '@/lib/weather';
import { coordsFromMapsLink, looksLikeMapsLink } from '@/lib/mapsLink';

// Pole lokalizacji z podpowiedziami prawdziwych miejsc (Photon/OpenStreetMap —
// rozumie ulice z numerem, nie tylko miejscowości). Wybór z listy ustawia nazwę
// + współrzędne (→ pogoda i nawigacja). Można też wpisać coś swojego — wtedy
// współrzędne są czyszczone, ale nazwa zostaje.
//
// Drugie wejście: WKLEJONY LINK Z MAP (albo sama para współrzędnych). Dla miejsc
// bez adresu — „polana za lasem", pinezka na parkingu — to jedyny sposób podania
// dokładnego punktu bez rysowania własnej mapy. Link skrócony (maps.app.goo.gl)
// rozwijamy przez /api/maps-link, bo przeglądarka nie pójdzie za obcym
// przekierowaniem; nazwę dobieramy odwrotnym geokodowaniem.
export default function LocationAutocomplete({
  value,
  onChange,
  onCoords,
  id = 'location',
  placeholder,
}: {
  value: string;
  onChange: (text: string) => void;
  onCoords: (coords: { lat: number; lon: number } | null) => void;
  id?: string;
  placeholder?: string;
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [pinning, setPinning] = useState(false);
  const justPicked = useRef(false);

  // Wklejony link/współrzędne → punkt na mapie + czytelna nazwa.
  async function usePastedLink(raw: string) {
    setPinning(true);
    setResults([]);
    setOpen(false);
    try {
      let point = coordsFromMapsLink(raw);
      if (!point && looksLikeMapsLink(raw)) {
        // Skrócony link — współrzędne siedzą dopiero pod przekierowaniem.
        const res = await fetch('/api/maps-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: raw.trim() }),
        }).catch(() => null);
        if (res?.ok) {
          const d = await res.json().catch(() => null);
          if (d && typeof d.lat === 'number' && typeof d.lon === 'number') point = d;
        }
      }
      if (!point) return false;
      justPicked.current = true;
      const name = await placeFromCoords(point.lat, point.lon);
      onChange(name ?? `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`);
      onCoords({ lat: point.lat, lon: point.lon });
      return true;
    } finally {
      setPinning(false);
    }
  }

  // Debounce wyszukiwania; przerywamy poprzedni fetch przy nowym wpisie.
  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    const q = value.trim();
    // Link do map nie jest zapytaniem do geokodera — obsługuje go usePastedLink.
    if (q.length < 2 || looksLikeMapsLink(q) || coordsFromMapsLink(q)) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const places = await searchPlaces(q, ctrl.signal);
      setResults(places);
      if (places.length) setOpen(true);
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  function pick(p: Place) {
    justPicked.current = true;
    // Zapisujemy etykietę Z MIASTEM — sama „Krupówki 1" w wypadzie nie mówi nic
    // komuś, kto nie zna okolicy.
    onChange([p.name, p.admin1].filter(Boolean).join(', '));
    onCoords({ lat: p.latitude, lon: p.longitude });
    setResults([]);
    setOpen(false);
  }

  function placeLine(p: Place): string {
    return [p.admin1, p.country].filter(Boolean).join(', ');
  }

  return (
    <div className="loc-autocomplete">
      <input
        id={id}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          onCoords(null); // edycja unieważnia wcześniejszy wybór (i pogodę)
          // Wklejenie zwykle wpada tu jako jedna zmiana — łapiemy je od razu,
          // żeby użytkownik nie musiał nic zatwierdzać.
          if (looksLikeMapsLink(next) || coordsFromMapsLink(next)) void usePastedLink(next);
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (looksLikeMapsLink(text) || coordsFromMapsLink(text)) {
            e.preventDefault();
            onChange(text);
            void usePastedLink(text);
          }
        }}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {pinning && <span className="loc-pinning">Odczytuję miejsce z linku…</span>}
      {open && results.length > 0 && (
        <ul className="loc-suggestions">
          {results.map((p, i) => (
            <li key={`${p.latitude},${p.longitude},${i}`}>
              {/* onMouseDown, by wybór zadziałał przed blur inputu */}
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
                <span className="loc-name">{p.name}</span>
                {placeLine(p) && <span className="loc-region">{placeLine(p)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
