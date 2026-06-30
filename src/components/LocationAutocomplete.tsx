'use client';

import { useEffect, useRef, useState } from 'react';
import { searchPlaces, type Place } from '@/lib/weather';

// Pole lokalizacji z podpowiedziami prawdziwych miejscowości (Open-Meteo geocoding).
// Wybór z listy ustawia nazwę + współrzędne (→ pogoda). Można też wpisać coś swojego —
// wtedy współrzędne są czyszczone (brak pogody), ale nazwa zostaje.
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
  const justPicked = useRef(false);

  // Debounce wyszukiwania; przerywamy poprzedni fetch przy nowym wpisie.
  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
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
    onChange(p.name);
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
          onChange(e.target.value);
          onCoords(null); // edycja unieważnia wcześniejszy wybór (i pogodę)
        }}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
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
