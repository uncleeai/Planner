'use client';

import { IconPin } from '@/components/icons';

// Statyczna mapka miejsca wypadu — bez biblioteki mapowej i bez API key:
// liczymy kafelek OSM dla współrzędnych, układamy siatkę 3×3 wyśrodkowaną na
// punkcie (transform + left/top 50%, więc responsywnie, bez mierzenia szerokości)
// i nakładamy pinezkę. Tap → natywne Mapy z celem. Współrzędne mamy już w bazie
// (LocationAutocomplete zapisuje je przy wyborze miejsca z podpowiedzi).

const TILE = 256;
const Z = 14; // miasto z kontekstem dzielnic

// Współrzędne → ułamkowa pozycja kafelka (slippy map).
function lonToTileX(lon: number) {
  return ((lon + 180) / 360) * 2 ** Z;
}
function latToTileY(lat: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z;
}

export default function EventMap({
  lat,
  lon,
  label,
}: {
  lat: number;
  lon: number;
  label?: string | null;
}) {
  const fx = lonToTileX(lon);
  const fy = latToTileY(lat);
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);
  // Pozycja punktu wewnątrz siatki 3×3 (środkowy kafelek na (1,1)).
  const pointX = TILE + (fx - cx) * TILE;
  const pointY = TILE + (fy - cy) * TILE;
  const max = 2 ** Z;

  const tiles = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (ty < 0 || ty >= max) continue;
      const wx = ((tx % max) + max) % max; // zawijanie w poziomie
      tiles.push(
        <img
          key={`${dx},${dy}`}
          src={`https://tile.openstreetmap.org/${Z}/${wx}/${ty}.png`}
          alt=""
          width={TILE}
          height={TILE}
          loading="lazy"
          style={{ position: 'absolute', left: (dx + 1) * TILE, top: (dy + 1) * TILE }}
        />,
      );
    }
  }

  // Apple Maps: pokazuje pinezkę celu; „Trasa" jest o jeden tap dalej. Na nie-Apple
  // link i tak otwiera stronę Map. Paczka jest na iPhone'ach.
  const href = `https://maps.apple.com/?ll=${lat},${lon}${label ? `&q=${encodeURIComponent(label)}` : ''}`;

  return (
    <a className="event-map" href={href} target="_blank" rel="noopener noreferrer" aria-label="Otwórz w Mapach">
      <div
        className="event-map-tiles"
        style={{ transform: `translate(${-pointX}px, ${-pointY}px)` }}
        aria-hidden="true"
      >
        {tiles}
      </div>
      <span className="event-map-pin" aria-hidden="true"><IconPin size={26} /></span>
      <span className="event-map-attr">© OpenStreetMap</span>
    </a>
  );
}
