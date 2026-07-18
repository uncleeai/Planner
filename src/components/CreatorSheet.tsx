'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { useTransitionNavigate } from '@/lib/transition';
import { buildSlotTimes, EMPTY_SLOT_RANGE, type SlotRange } from '@/lib/slotInput';
import { formatSlotRange, slotEndMs } from '@/lib/types';
import { heroImageForEmoji, HERO_CATEGORIES, DEFAULT_CROP, type HeroCrop } from '@/lib/heroImage';
import { Avatar } from '@/components/Avatar';
import { Markdown } from '@/lib/markdown';
import ChildSheet from '@/components/ChildSheet';
import SlotRangeInput from '@/components/SlotRangeInput';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import DescriptionInput from '@/components/DescriptionInput';
import { IconCalendar, IconPin, IconChevron, IconX } from '@/components/icons';

// Pełnoekranowy kreator „Nowe lobby" (styl Apple Invites): karta JEST formularzem.
// Wysuwa się od dołu na sprężynie sheeta; szczegóły (termin/miejsce/opis) edytują
// child-sheety NAD kartą, więc karta nigdy nie skacze. Zamknięcie X = unmount =
// porzucenie szkicu (świadomie — bez trzymania draftów). Tworzenie wypadu
// (createEvent) przeniesione żywcem z dashboardu — zero zmian w zapisie.
export default function CreatorSheet({
  cropByEmoji,
  onClose,
}: {
  cropByEmoji: Map<string, HeroCrop>;
  onClose: () => void;
}) {
  const { userId, displayName, avatar } = useAuth();
  const navigate = useTransitionNavigate();

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  // Kilka propozycji terminu (sedno produktu) — pierwsza wymagana, puste ignorowane.
  const [slotDrafts, setSlotDrafts] = useState<SlotRange[]>([EMPTY_SLOT_RANGE]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openSheet, setOpenSheet] = useState<'termin' | 'miejsce' | 'opis' | null>(null);
  const [closing, setClosing] = useState(false);
  const close = () => setClosing(true);

  // Kreator przykrywa cały ekran — strona pod spodem nie może się przewijać.
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, []);

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    // Puste dodatkowe propozycje ignorujemy; wypełnione muszą być poprawne.
    const filled = slotDrafts.filter((d) => d.od);
    const times = filled.map(buildSlotTimes);
    if (!title.trim() || times.length === 0 || times.some((t) => !t) || busy) return;

    if (times.some((t) => slotEndMs(t!) < Date.now() - 60000)) {
      setError('Termin nie może być z przeszłości.');
      return;
    }

    setBusy(true);
    setError('');

    const { data, error } = await supabase
      .from('events')
      .insert({
        title: title.trim(),
        location: location.trim() || null,
        latitude: locationCoords?.lat ?? null,
        longitude: locationCoords?.lon ?? null,
        emoji,
        description: description.trim() || null,
        created_by: displayName,
        created_by_user_id: userId,
      })
      .select('id')
      .single();

    if (error || !data) {
      setError(error?.message ?? 'Nie udało się utworzyć wypadu.');
      setBusy(false);
      return;
    }

    await supabase.from('slots').insert(
      times.map((t) => ({
        event_id: data.id,
        starts_at: t!.starts_at,
        ends_at: t!.ends_at,
        all_day: t!.all_day,
        created_by: displayName,
        created_by_user_id: userId,
      })),
    );

    navigate(`/event/${data.id}`, 'forward');
  }

  // Zamknięcie sheeta terminu: zrzuć puste KOŃCOWE drafty (uczciwy licznik propozycji).
  const closeTermin = () => {
    setSlotDrafts((ds) => {
      const trimmed = [...ds];
      while (trimmed.length > 1 && !trimmed[trimmed.length - 1].od) trimmed.pop();
      return trimmed;
    });
    setOpenSheet(null);
  };

  const filled = slotDrafts.filter((d) => d.od);
  const firstTimes = filled[0] ? buildSlotTimes(filled[0]) : null;
  // Max 4 propozycje → „2/3/4 propozycje" zawsze poprawne gramatycznie.
  const terminSummary =
    filled.length > 1 ? `${filled.length} propozycje` : firstTimes ? formatSlotRange(firstTimes) : '';

  const photo = heroImageForEmoji(emoji);
  const crop = (emoji ? cropByEmoji.get(emoji) : null) ?? DEFAULT_CROP;

  // Crossfade tła przy zmianie kategorii: poprzednia fotka zostaje POD spodem na
  // czas wjazdu nowej (bez mignięcia gradientu między nimi); przy odznaczeniu
  // poprzednia miękko gaśnie do gradientu (klasa .out). Sprzątanie po animationend.
  type Bg = { photo: string; crop: Pick<HeroCrop, 'zoom' | 'pos_x' | 'pos_y' | 'brightness'> };
  const currBg: Bg | null = photo ? { photo, crop } : null;
  const [prevBg, setPrevBg] = useState<Bg | null>(null);
  const lastBgRef = useRef<Bg | null>(null);
  useEffect(() => {
    if (lastBgRef.current && lastBgRef.current.photo !== (photo ?? '')) {
      // Przy SZYBKIM klikaniu nie podmieniamy bazy w pół fade'u (skok krycia =
      // flicker) — raz ustawiona stoi, aż nowa warstwa dojedzie do pełna.
      setPrevBg((p) => p ?? lastBgRef.current);
    }
    lastBgRef.current = photo ? { photo, crop } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emoji]);

  // Warstwy fotki dla danego tła (te same co karta hero na dashboardzie).
  const photoLayers = (bg: Bg) => (
    <>
      <div
        className="hp-img"
        style={{
          backgroundImage: `url(${bg.photo})`,
          backgroundSize: `${bg.crop.zoom}%`,
          backgroundPosition: `${bg.crop.pos_x}% ${bg.crop.pos_y}%`,
          ['--hp-bright' as string]: `${bg.crop.brightness / 100}`,
        } as React.CSSProperties}
      />
      <i className="hp-tint" />
      <i className="hp-half" />
      <i className="hp-grain" />
      <i className="hp-vig" />
      <i className="hp-scrim" />
    </>
  );

  return (
    <div
      className={`creator${closing ? ' closing' : ''}`}
      role="dialog"
      aria-label="Nowe lobby"
      onAnimationEnd={(e) => {
        // Tylko animacja SAMEGO kreatora — animacje dzieci (child-sheety) bąbelkują.
        if (closing && e.target === e.currentTarget) onClose();
      }}
    >
      <button type="button" className="modal-close creator-close" onClick={close} aria-label="Zamknij">
        <IconX size={14} />
      </button>

      <form className="creator-scroll" onSubmit={createEvent}>
        {/* Strefa tła: gradient z akcentu → fotka kategorii po wyborze chipa.
            Tytuł mieszka NA tle — karta jest formularzem, bez osobnego podglądu. */}
        <div className="creator-hero">
          {prevBg && (
            <div
              className={`hero-photo hero-prev${currBg ? '' : ' out'}`}
              aria-hidden="true"
              onAnimationEnd={(e) => {
                e.stopPropagation();
                if (!currBg) setPrevBg(null); // koniec gaśnięcia do gradientu
              }}
            >
              {photoLayers(prevBg)}
            </div>
          )}
          {currBg && (
            <div
              className="hero-photo"
              aria-hidden="true"
              key={emoji}
              onAnimationEnd={(e) => {
                e.stopPropagation();
                setPrevBg(null); // nowa w pełni widoczna — stara do kosza
              }}
            >
              {photoLayers(currBg)}
            </div>
          )}
          {emoji && <div className="creator-emoji" aria-hidden="true">{emoji}</div>}
          <input
            className="creator-title"
            type="text"
            placeholder="Nazwa wypadu…"
            aria-label="Nazwa wypadu"
            maxLength={60}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="creator-body">
          <div className="cat-row">
            {HERO_CATEGORIES.map((c) => (
              <button
                type="button"
                key={c.emoji}
                className={`cat-chip${emoji === c.emoji ? ' selected' : ''}`}
                aria-pressed={emoji === c.emoji}
                onClick={() => setEmoji(emoji === c.emoji ? null : c.emoji)}
              >
                <span className="cat-emoji" aria-hidden="true">{c.emoji}</span>
                <span className="cat-label">{c.label}</span>
              </button>
            ))}
          </div>

          <div className="creator-rows">
            <button type="button" className="creator-row" onClick={() => setOpenSheet('termin')}>
              <IconCalendar size={17} />
              <span className="cr-text">
                <span className="cr-label">Termin</span>
                <b className={terminSummary ? '' : 'ph'}>{terminSummary || 'Wybierz datę'}</b>
              </span>
              <IconChevron size={16} />
            </button>
            <button type="button" className="creator-row" onClick={() => setOpenSheet('miejsce')}>
              <IconPin size={17} />
              <span className="cr-text">
                <span className="cr-label">Miejsce</span>
                <b className={location.trim() ? '' : 'ph'}>{location.trim() || 'Dodaj miejsce'}</b>
              </span>
              <IconChevron size={16} />
            </button>
          </div>

          <div className="creator-host">
            <span className="lp-host">
              <Avatar name={displayName} avatar={avatar} size={22} />
              <b>{displayName}</b>
              <span className="host-tag">HOST</span>
            </span>
          </div>

          {/* Opis: pusty → pill „Dodaj opis"; wpisany → podgląd (markdown) na miejscu,
              żeby nie trzeba było otwierać sheeta tylko po to, by go zobaczyć. Podgląd
              to div (Markdown renderuje <a> — niedozwolone w <button>); edycja osobnym
              przyciskiem, linki w podglądzie działają. */}
          {description.trim() ? (
            <div className="creator-desc filled">
              <div className="creator-desc-head">
                <span className="creator-desc-label">Opis</span>
                <button type="button" className="creator-desc-edit" onClick={() => setOpenSheet('opis')}>
                  Edytuj
                </button>
              </div>
              <div className="creator-desc-body"><Markdown text={description} /></div>
            </div>
          ) : (
            <button type="button" className="creator-desc" onClick={() => setOpenSheet('opis')}>
              + Dodaj opis
            </button>
          )}

          {error && <p className="small" style={{ color: 'var(--no)', margin: 0 }}>{error}</p>}
        </div>

        <div className="creator-cta">
          <button
            type="submit"
            className="cta-gradient"
            disabled={!title.trim() || !slotDrafts[0]?.od || busy}
          >
            {busy ? 'Odpalam…' : 'Odpal lobby'}
          </button>
        </div>
      </form>

      {openSheet === 'termin' && (
        <ChildSheet title="Termin" onClose={closeTermin}>
          {slotDrafts.map((d, i) => (
            <div className="slot-draft" key={i}>
              {i > 0 && (
                <div className="slot-draft-head">
                  <span>Propozycja {i + 1}</span>
                  <button
                    type="button"
                    className="slot-draft-remove"
                    aria-label={`Usuń propozycję ${i + 1}`}
                    onClick={() => setSlotDrafts((ds) => ds.filter((_, j) => j !== i))}
                  >
                    Usuń
                  </button>
                </div>
              )}
              <SlotRangeInput
                value={d}
                onChange={(v) => setSlotDrafts((ds) => ds.map((x, j) => (j === i ? v : x)))}
                idPrefix={`create-${i}`}
              />
            </div>
          ))}
          {slotDrafts.length < 4 && (
            <button
              type="button"
              className="add-slot"
              onClick={() => setSlotDrafts((ds) => [...ds, EMPTY_SLOT_RANGE])}
            >
              {slotDrafts.length === 1 ? '+ Dodaj drugą propozycję terminu' : '+ Dodaj kolejną propozycję'}
            </button>
          )}
        </ChildSheet>
      )}

      {openSheet === 'miejsce' && (
        <ChildSheet title="Miejsce" onClose={() => setOpenSheet(null)}>
          <LocationAutocomplete
            id="creator-location"
            value={location}
            onChange={setLocation}
            onCoords={setLocationCoords}
            placeholder="np. Zakopane, Łabiszyn…"
          />
        </ChildSheet>
      )}

      {openSheet === 'opis' && (
        <ChildSheet title="Opis" onClose={() => setOpenSheet(null)}>
          <DescriptionInput
            id="creator-description"
            value={description}
            onChange={setDescription}
            placeholder="np. co bierzemy, plan, szczegóły…"
          />
        </ChildSheet>
      )}
    </div>
  );
}
