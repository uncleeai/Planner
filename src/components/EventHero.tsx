'use client';

import Link from 'next/link';
import { IconPin, IconChevronLeft, IconPencil } from '@/components/icons';
import { canNavigate, openNavigation } from '@/lib/navigate';
import { heroImageForEmoji, DEFAULT_CROP, type HeroCrop } from '@/lib/heroImage';
import { parseImageFocus, DEFAULT_FOCUS } from '@/lib/eventImage';
import type { EventRow } from '@/lib/types';

// Hero strony wypadu: zdjęcie na całą szerokość u góry (dotyka krawędzi ekranu),
// pod nim tytuł i meta. Zdjęcie dobierane jak w karcie hero na dashboardzie —
// własne tło wypadu (image_url + kadr z pinch-to-crop) wygrywa z kuratorowaną
// fotką kategorii (emoji → public/hero/*.jpg + kadr z hero_crops).
//
// Bez zdjęcia (brak image_url i emoji bez pliku) renderujemy sam nagłówek
// tekstowy z paskiem „← Lobby", czyli układ sprzed redesignu — pusta ramka
// wyglądałaby jak błąd.
export default function EventHero({
  event,
  crop,
  isPast,
  canEdit,
  onEdit,
  onBack,
}: {
  event: EventRow;
  crop: HeroCrop | null;
  isPast: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onBack: () => void;
}) {
  const custom = !!event.image_url;
  const photo = event.image_url ?? heroImageForEmoji(event.emoji);
  const c = crop ?? DEFAULT_CROP;
  const focus = custom ? parseImageFocus(event.image_focus) ?? DEFAULT_FOCUS : null;

  const back = (
    <Link
      href="/"
      className="back-btn-round"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onBack();
      }}
      aria-label="Wróć"
    >
      <IconChevronLeft size={20} />
    </Link>
  );

  const head = (
    <div className="ev-hero-head">
      <h1 className="large-title">{event.title}</h1>
      {(event.location || event.created_by || isPast) && (
        <div className="event-submeta">
          {event.location && (
            // Miejsce jest klikalne: tap otwiera nawigację w mapach telefonu
            // (Apple na iPhonie, Google gdzie indziej) — jak adres w kalendarzu.
            // Adres liczymy dopiero w handlerze, bo zależy od systemu.
            canNavigate({ lat: event.latitude, lon: event.longitude, place: event.location }) ? (
              <button
                type="button"
                className="loc-nav"
                onClick={() =>
                  openNavigation({
                    lat: event.latitude,
                    lon: event.longitude,
                    place: event.location,
                  })
                }
              >
                <IconPin size={13} /> {event.location}
                <span className="loc-nav-go">Prowadź</span>
              </button>
            ) : (
              <span><IconPin size={13} /> {event.location}</span>
            )
          )}
          {event.location && event.created_by && <span className="sep">·</span>}
          {event.created_by && <span>host: {event.created_by}</span>}
          {isPast && <span className="past-chip">Odbyło się</span>}
        </div>
      )}
    </div>
  );

  // Wariant bez zdjęcia — stary układ: pasek nawigacji, potem nagłówek.
  if (!photo) {
    return (
      <>
        <div className="nav-row">
          {back}
          <span className="nav-label">Lobby</span>
          {canEdit && (
            <button type="button" className="title-edit-btn" onClick={onEdit} aria-label="Edytuj wypad">
              <IconPencil size={17} />
            </button>
          )}
        </div>
        {head}
      </>
    );
  }

  return (
    <>
      <div className="ev-hero">
        <div className={`hero-photo${custom ? ' hp-custom' : ''}`} aria-hidden="true">
          <div
            className="hp-img"
            style={{
              backgroundImage: `url(${photo})`,
              // Kadr (zoom + pozycja) bierzemy z hero_crops, tak samo jak karta na
              // dashboardzie. Trzymanie się go jest istotne: część fotek kategorii to
              // wciąż placeholdery z wypalonym tekstem, a kadr celuje obok niego.
              backgroundSize: focus ? 'cover' : `${c.zoom}%`,
              backgroundPosition: focus ? '50% 50%' : `${c.pos_x}% ${c.pos_y}%`,
              transform: focus ? `translate(${focus.x}%, ${focus.y}%) scale(${focus.z})` : undefined,
              ['--hp-bright' as string]: custom ? '0.82' : `${c.brightness / 100}`,
            } as React.CSSProperties}
          />
          <i className="hp-tint" />
          <i className="hp-grain" />
          <i className="hp-vig" />
          {/* Dół zdjęcia schodzi do tła strony — ekran zostaje jednym ciemnym kadrem. */}
          <i className="ev-hero-fade" />
        </div>
        {/* Pływające przyciski nad zdjęciem: własne ciemne tło + obrys, żeby ikony
            były czytelne także na jasnej fotce z rolki. */}
        <div className="ev-hero-nav">
          {back}
          {canEdit && (
            <button type="button" className="back-btn-round" onClick={onEdit} aria-label="Edytuj wypad">
              <IconPencil size={17} />
            </button>
          )}
        </div>
      </div>
      {head}
    </>
  );
}
