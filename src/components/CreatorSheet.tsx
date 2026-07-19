'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { useTransitionNavigate } from '@/lib/transition';
import { buildSlotTimes, EMPTY_SLOT_RANGE, type SlotRange } from '@/lib/slotInput';
import { formatSlotRange, slotEndMs, type EventRow } from '@/lib/types';
import { heroImageForEmoji, HERO_CATEGORIES, DEFAULT_CROP, type HeroCrop } from '@/lib/heroImage';
import {
  uploadEventImage,
  clampFocus,
  parseImageFocus,
  DEFAULT_FOCUS,
  type ImageFocus,
} from '@/lib/eventImage';
import { haptic } from '@/lib/haptics';
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
// porzucenie szkicu (świadomie — bez trzymania draftów).
//
// Tryb EDYCJI (prop `edit`): ta sama karta służy do edycji wypadu na jego stronie
// — prefill z EventRow, bez wiersza Termin (terminy edytuje się przy slotach)
// i bez rzędu hosta (admin może edytować cudzy wypad), zapis = UPDATE + onSaved.
export default function CreatorSheet({
  cropByEmoji,
  onClose,
  edit,
  onSaved,
}: {
  cropByEmoji?: Map<string, HeroCrop>;
  onClose: () => void;
  edit?: EventRow;
  onSaved?: () => void;
}) {
  const { userId, displayName, avatar } = useAuth();
  const navigate = useTransitionNavigate();

  const [title, setTitle] = useState(edit?.title ?? '');
  const [location, setLocation] = useState(edit?.location ?? '');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lon: number } | null>(
    edit && edit.latitude != null && edit.longitude != null
      ? { lat: edit.latitude, lon: edit.longitude }
      : null,
  );
  const [emoji, setEmoji] = useState<string | null>(edit?.emoji ?? null);
  const [description, setDescription] = useState(edit?.description ?? '');
  // Kilka propozycji terminu (sedno produktu) — pierwsza wymagana, puste ignorowane.
  const [slotDrafts, setSlotDrafts] = useState<SlotRange[]>([EMPTY_SLOT_RANGE]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openSheet, setOpenSheet] = useState<'termin' | 'miejsce' | 'opis' | null>(null);
  const [closing, setClosing] = useState(false);
  const close = () => setClosing(true);

  // Własne tło wypadu: url zostaje po „Usuń" (bgOn=false), żeby warstwa mogła
  // zgasnąć tranzycją z obrazkiem w środku; nowy upload podmienia url.
  const [bgUrl, setBgUrl] = useState<string | null>(edit?.image_url ?? null);
  const [bgOn, setBgOn] = useState(!!edit?.image_url);
  const [bgBusy, setBgBusy] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);

  async function pickBackground(file: File | null) {
    if (!file || bgBusy) return;
    setBgBusy(true);
    setError('');
    try {
      const url = await uploadEventImage(userId, file);
      setBgUrl(url);
      setBgOn(true);
      // Świeży kadr + od razu tryb kadrowania (jak w Invites: wgrałeś → ustawiasz).
      setFocus(DEFAULT_FOCUS);
      setHintSeen(false);
      setCropMode(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wgrać zdjęcia.');
    } finally {
      setBgBusy(false);
      if (bgInputRef.current) bgInputRef.current.value = '';
    }
  }

  // Pinch-to-crop: jeden palec = pan, dwa = zoom. Gesty łapie nakładka
  // .crop-surface (touch-action: none = zero walki ze scrollem strony) tylko
  // w trybie kadrowania. Baseline przeliczany przy KAŻDEJ zmianie liczby palców
  // (start i koniec dotyku), więc pinch→pan przechodzi płynnie bez skoku.
  const [focus, setFocus] = useState<ImageFocus>(
    () => parseImageFocus(edit?.image_focus) ?? DEFAULT_FOCUS,
  );
  const [cropMode, setCropMode] = useState(false);
  // Podpowiedź gestów znika przy pierwszym dotknięciu; wraca przy wejściu w tryb.
  const [hintSeen, setHintSeen] = useState(false);
  const gesture = useRef<{
    mode: 'pan' | 'pinch';
    startX: number;
    startY: number;
    startDist: number;
    startFocus: ImageFocus;
    w: number;
    h: number;
  } | null>(null);

  function cropBaseline(e: React.TouchEvent) {
    if (e.touches.length > 0) setHintSeen(true);
    const r = e.currentTarget.getBoundingClientRect();
    if (e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      gesture.current = {
        mode: 'pinch',
        startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        startX: 0,
        startY: 0,
        startFocus: focus,
        w: r.width,
        h: r.height,
      };
    } else if (e.touches.length === 1) {
      gesture.current = {
        mode: 'pan',
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startDist: 0,
        startFocus: focus,
        w: r.width,
        h: r.height,
      };
    } else {
      gesture.current = null;
    }
  }

  function cropMove(e: React.TouchEvent) {
    const g = gesture.current;
    if (!g) return;
    if (g.mode === 'pinch' && e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setFocus(clampFocus({ ...g.startFocus, z: g.startFocus.z * (d / g.startDist) }));
    } else if (g.mode === 'pan' && e.touches.length === 1) {
      const dx = ((e.touches[0].clientX - g.startX) / g.w) * 100;
      const dy = ((e.touches[0].clientY - g.startY) / g.h) * 100;
      setFocus(clampFocus({ ...g.startFocus, x: g.startFocus.x + dx, y: g.startFocus.y + dy }));
    }
  }

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

    // Tryb edycji: UPDATE pól wypadu (terminy żyją przy slotach na stronie wypadu).
    if (edit) {
      if (!title.trim() || busy) return;
      setBusy(true);
      setError('');
      const { error } = await supabase
        .from('events')
        .update({
          title: title.trim(),
          image_url: bgOn && bgUrl ? bgUrl : null,
          image_focus:
            bgOn && bgUrl
              ? JSON.stringify({
                  z: Math.round(focus.z * 100) / 100,
                  x: Math.round(focus.x * 10) / 10,
                  y: Math.round(focus.y * 10) / 10,
                })
              : null,
          location: location.trim() || null,
          latitude: locationCoords?.lat ?? null,
          longitude: locationCoords?.lon ?? null,
          emoji,
          description: description.trim() || null,
        })
        .eq('id', edit.id);
      setBusy(false);
      if (error) {
        setError(error.message ?? 'Nie udało się zapisać zmian.');
        return;
      }
      onSaved?.();
      return;
    }

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
        image_url: bgOn && bgUrl ? bgUrl : null,
        image_focus:
          bgOn && bgUrl
            ? JSON.stringify({
                z: Math.round(focus.z * 100) / 100,
                x: Math.round(focus.x * 10) / 10,
                y: Math.round(focus.y * 10) / 10,
              })
            : null,
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

  // Tło kategorii: WSZYSTKIE warstwy zamontowane na stałe, crossfade czystą
  // tranzycją opacity (klasa .on na wybranej). Zero montowania/odmontowywania
  // w trakcie animacji = zero flickera; przerwaną w połowie tranzycję
  // przeglądarka sama płynnie zawraca. Stały montaż = preload fotek gratis.
  type Bg = { photo: string; crop: Pick<HeroCrop, 'zoom' | 'pos_x' | 'pos_y' | 'brightness'> };

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
      aria-label={edit ? "Edytuj wypad" : "Nowe lobby"}
      onAnimationEnd={(e) => {
        // Tylko animacja SAMEGO kreatora — animacje dzieci (child-sheety) bąbelkują.
        if (closing && e.target === e.currentTarget) onClose();
      }}
    >
      <button type="button" className="modal-close creator-close" onClick={close} aria-label="Zamknij">
        <IconX size={14} />
      </button>

      {/* Własne tło: pille w prawym górnym rogu (lustro X-a). Poza strefą hero,
          żeby nie łapały jej reguł pozycjonowania dzieci. */}
      <input
        ref={bgInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pickBackground(e.target.files?.[0] ?? null)}
      />
      <div className="creator-bg-tools">
        {cropMode ? (
          <button
            type="button"
            className="creator-bg-btn primary"
            onClick={() => {
              haptic();
              setCropMode(false);
            }}
          >
            Gotowe
          </button>
        ) : bgOn ? (
          <>
            <button
              type="button"
              className="creator-bg-btn"
              onClick={() => {
                haptic();
                setHintSeen(false);
                setCropMode(true);
              }}
            >
              Kadruj
            </button>
            <button
              type="button"
              className="creator-bg-btn"
              aria-label="Usuń tło"
              onClick={() => setBgOn(false)}
            >
              ×
            </button>
          </>
        ) : (
          <button
            type="button"
            className="creator-bg-btn"
            disabled={bgBusy}
            onClick={() => bgInputRef.current?.click()}
          >
            {bgBusy ? 'Wgrywam…' : '+ Tło'}
          </button>
        )}
      </div>

      <form className="creator-scroll" onSubmit={createEvent}>
        {/* Strefa tła: gradient z akcentu → fotka kategorii po wyborze chipa.
            Tytuł mieszka NA tle — karta jest formularzem, bez osobnego podglądu. */}
        <div className="creator-hero">
          {HERO_CATEGORIES.map((c) => {
            const catPhoto = heroImageForEmoji(c.emoji);
            if (!catPhoto) return null;
            const catCrop = cropByEmoji?.get(c.emoji) ?? DEFAULT_CROP;
            return (
              <div
                key={c.emoji}
                className={`hero-photo hero-cat${emoji === c.emoji && !bgOn ? ' on' : ''}`}
                aria-hidden="true"
              >
                {photoLayers({ photo: catPhoto, crop: catCrop })}
              </div>
            );
          })}
          {/* Własne tło — warstwa NAD kategoriami (późniejszy sibling), ten sam
              mechanizm .on/tranzycja. Cover + centralny kadr (pinch-to-crop: etap 2). */}
          <div className={`hero-photo hero-cat hp-custom${bgOn && bgUrl ? ' on' : ''}`} aria-hidden="true">
            {bgUrl && (
              <>
                <div
                  className="hp-img"
                  style={{
                    backgroundImage: `url(${bgUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: '50% 50%',
                    transform: `translate(${focus.x}%, ${focus.y}%) scale(${focus.z})`,
                    ['--hp-bright' as string]: '0.82',
                  } as React.CSSProperties}
                />
                <i className="hp-tint" />
                <i className="hp-half" />
                <i className="hp-grain" />
                <i className="hp-vig" />
                <i className="hp-scrim" />
              </>
            )}
          </div>

          {cropMode && (
            <div
              className="crop-surface"
              onTouchStart={cropBaseline}
              onTouchMove={cropMove}
              onTouchEnd={cropBaseline}
            >
              {!hintSeen && <span className="crop-hint">Przesuń · ściśnij, aby przybliżyć</span>}
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
            {!edit && (
            <button type="button" className="creator-row" onClick={() => setOpenSheet('termin')}>
              <IconCalendar size={17} />
              <span className="cr-text">
                <span className="cr-label">Termin</span>
                <b className={terminSummary ? '' : 'ph'}>{terminSummary || 'Wybierz datę'}</b>
              </span>
              <IconChevron size={16} />
            </button>
            )}
            <button type="button" className="creator-row" onClick={() => setOpenSheet('miejsce')}>
              <IconPin size={17} />
              <span className="cr-text">
                <span className="cr-label">Miejsce</span>
                <b className={location.trim() ? '' : 'ph'}>{location.trim() || 'Dodaj miejsce'}</b>
              </span>
              <IconChevron size={16} />
            </button>
          </div>

          {!edit && (
          <div className="creator-host">
            <span className="lp-host">
              <Avatar name={displayName} avatar={avatar} size={22} />
              <b>{displayName}</b>
              <span className="host-tag">HOST</span>
            </span>
          </div>
          )}

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
            disabled={!title.trim() || (!edit && !slotDrafts[0]?.od) || busy}
          >
            {edit ? (busy ? 'Zapisuję…' : 'Zapisz zmiany') : busy ? 'Odpalam…' : 'Odpal lobby'}
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
