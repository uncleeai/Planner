'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchHourlyWeather,
  describeWeather,
  type DayWeather,
  type HourWeather,
} from '@/lib/weather';
import { WeatherIcon, IconX } from '@/components/icons';

// Szczegółowa prognoza na dzień wypadu — modal po tapnięciu kafelka pogody w hero.
// Godzinowo: temperatura + ikona + szansa deszczu; wiersz godziny zbiórki podświetlony.
export default function WeatherModal({
  lat,
  lon,
  dateISO,
  location,
  day,
  meetHour,
  onClose,
}: {
  lat: number;
  lon: number;
  dateISO: string;
  location?: string | null;
  day?: DayWeather | null;
  meetHour?: number | null;
  onClose: () => void;
}) {
  const [hours, setHours] = useState<HourWeather[] | null | 'loading'>('loading');
  const hotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetchHourlyWeather(lat, lon, dateISO).then((h) => alive && setHours(h));
    return () => {
      alive = false;
    };
  }, [lat, lon, dateISO]);

  // Zablokuj scroll strony pod modalem — bez tego przeciąganie palcem po overlayu
  // (obok karty) przewijało dashboard w tle.
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, []);

  // Po załadowaniu przewiń listę do godziny zbiórki (jest poza widokiem dla późnych godzin).
  useEffect(() => {
    hotRef.current?.scrollIntoView({ block: 'center' });
  }, [hours]);

  const dayLabel = new Date(`${dateISO}T12:00:00`).toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Nocne godziny (0-5) tylko zaciemniają listę — wypady nie startują o 3 w nocy.
  const visible = Array.isArray(hours) ? hours.filter((h) => new Date(h.time).getHours() >= 6) : [];

  return createPortal(
    // Modal jest w portalu, ale zdarzenia React bąbelkują po drzewie KOMPONENTÓW —
    // a rodzicem jest <Link> całej karty hero. Bez stopPropagation klik w tło
    // zamykał modal i jednocześnie nawigował do wypadu.
    <div
      className="profile-overlay"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="profile-modal wx-modal" role="dialog" aria-label="Prognoza godzinowa" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Zamknij">
          <IconX size={14} />
        </button>
        <div className="modal-label">Pogoda</div>
        <p className="small muted wx-sub">
          {dayLabel}
          {location ? ` · ${location}` : ''}
        </p>

        {day && (
          <div className="wx-summary">
            <WeatherIcon code={day.code} size={30} />
            <b>{day.tempMax}°</b>
            <span>
              noc {day.tempMin}° · {describeWeather(day.code).label}
            </span>
          </div>
        )}

        {hours === 'loading' && <p className="small muted">Wczytuję prognozę…</p>}
        {hours === null && (
          <p className="small muted">Brak prognozy godzinowej — za daleko w przód (max ~16 dni).</p>
        )}
        {Array.isArray(hours) && (
          <div className="wx-rows">
            {visible.map((h) => {
              const hour = new Date(h.time).getHours();
              const hot = meetHour != null && hour === meetHour;
              return (
                <div key={h.time} ref={hot ? hotRef : undefined} className={`wx-row${hot ? ' hot' : ''}`}>
                  <span className="wx-h">{String(hour).padStart(2, '0')}:00</span>
                  <WeatherIcon code={h.code} size={19} className="wx-i" />
                  <span className="wx-t">{h.temp}°</span>
                  <span className="wx-p">{h.precip >= 10 ? `💧 ${h.precip}%` : ''}</span>
                  {hot && <span className="wx-tag">ZBIÓRKA</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
