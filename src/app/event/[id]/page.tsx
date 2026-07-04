'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { getEventStatus, formatSlotRange, formatSlotShort, relativeDay, slotEndMs } from '@/lib/types';
import type { Availability, Comment, EventRow, Profile, Slot, Vote } from '@/lib/types';
import { Avatar, type Person } from '@/components/Avatar';
import { IconPin, IconCalendarPlus, IconChevronLeft, IconPencil } from '@/components/icons';
import SlotRangeInput from '@/components/SlotRangeInput';
import DescriptionInput from '@/components/DescriptionInput';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import EventEmojiInput from '@/components/EventEmojiInput';
import { Markdown } from '@/lib/markdown';
import { buildSlotTimes, EMPTY_SLOT_RANGE, type SlotRange } from '@/lib/slotInput';
import { useTransitionNavigate } from '@/lib/transition';
import { getCache, mergeEventData } from '@/lib/dataCache';
import { loadEventBundle } from '@/lib/eventPrefetch';
import { addToCalendar } from '@/lib/calendar';
import { pingUser } from '@/lib/ping';
import { appAlert, appConfirm } from '@/components/Dialogs';


const CHOICES: { value: Availability; label: string; cls: string }[] = [
  { value: 'yes', label: 'READY', cls: 'on-yes' },
  { value: 'maybe', label: 'MOŻE', cls: 'on-maybe' },
  { value: 'no', label: 'PAS', cls: 'on-no' },
];

function formatCommentTime(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Termin w nagłówku slotu: jednodniowy dostaje „liść daty" (liść niesie dzień
// tygodnia + datę), a obok odliczanie („Za 6 dni") i godzinę — bez powtarzania
// dnia tygodnia. Zakres („dłuższy wypad") — mono-linię, bo liść by go nie pomieścił.
function SlotWhen({ slot }: { slot: Slot }) {
  if (slot.ends_at) return <span className="slot-date">{formatSlotRange(slot)}</span>;
  const d = new Date(slot.starts_at);
  const up = (s: string) => s.replace('.', '').toUpperCase();
  return (
    <span className="slot-when-wrap" aria-label={formatSlotRange(slot)}>
      <span className="leaf" aria-hidden="true">
        <span className="dow">{up(d.toLocaleDateString('pl-PL', { weekday: 'short' }))}</span>
        <span className="day">{d.getDate()}</span>
        <span className="mon">{up(d.toLocaleDateString('pl-PL', { month: 'short' }))}</span>
      </span>
      <span className="slot-when" aria-hidden="true">
        <b>{relativeDay(slot.starts_at)}</b>
        <span>
          {slot.all_day
            ? 'cały dzień'
            : `od ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`}
        </span>
      </span>
    </span>
  );
}

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const navigate = useTransitionNavigate();
  const { userId, displayName, isAdmin } = useAuth();

  // Seed z cache dashboardu (jeśli wchodzimy z listy) — wypad pokazuje się natychmiast,
  // a load() poniżej i tak dociąga świeże dane i podpina realtime.
  const seed = getCache();
  const seedEvent = seed?.events.find((e) => e.id === eventId) ?? null;
  const [event, setEvent] = useState<EventRow | null>(seedEvent);
  const [slots, setSlots] = useState<Slot[]>(() => seed?.slots.filter((s) => s.event_id === eventId) ?? []);
  const [votes, setVotes] = useState<Vote[]>(() => seed?.votes.filter((v) => v.event_id === eventId) ?? []);
  const [members, setMembers] = useState<Profile[]>(() => seed?.profiles ?? []);
  const [loading, setLoading] = useState(!seedEvent);
  const [notFound, setNotFound] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');

  const [slotDraft, setSlotDraft] = useState<SlotRange>(EMPTY_SLOT_RANGE);
  const [showAddForm, setShowAddForm] = useState(false);

  // Edycja wypadu (nazwa / miejsce / opis) — dla organizatora lub admina.
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editCoords, setEditCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [editEmoji, setEditEmoji] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');

  // Wiadomości nowsze niż moment wejścia na stronę dostają animację wjazdu
  // (comment-fresh w CSS); historia z pierwszego fetchu wchodzi bez animacji.
  const mountTsRef = useRef(Date.now());

  // Ostatni zamierzony głos użytkownika per slot — utrzymywany aż baza go potwierdzi.
  // Chroni przed „mruganiem" przy szybkim, naprzemiennym klikaniu (wyścig realtime).
  const pendingVotesRef = useRef<Map<string, Availability>>(new Map());

  const load = useCallback(async () => {
    const { event: ev, slots: sl, votes: vo, profiles: pr, comments: cm, notFound: nf } =
      await loadEventBundle(eventId);

    if (nf || !ev) {
      setNotFound(true);
    } else {
      setEvent(ev);
      setSlots(sl);
      setMembers(pr);
      setComments(cm);

      // Nałóż oczekujące głosy bieżącego użytkownika na świeży stan z bazy:
      // jego ostatni wybór wygrywa, dopóki baza go nie potwierdzi (wtedy czyścimy pending).
      const dbVotes = vo;
      const pending = pendingVotesRef.current;
      const merged = dbVotes.map((v) => {
        if (v.user_id === userId && pending.has(v.slot_id)) {
          const want = pending.get(v.slot_id)!;
          if (v.availability === want) {
            pending.delete(v.slot_id);
            return v;
          }
          return { ...v, availability: want };
        }
        return v;
      });
      for (const [slotId, want] of pending) {
        if (!merged.some((v) => v.user_id === userId && v.slot_id === slotId)) {
          merged.push({
            id: `optimistic-${slotId}-${userId}`,
            event_id: eventId,
            slot_id: slotId,
            user_id: userId,
            participant_name: displayName,
            availability: want,
            created_at: new Date().toISOString(),
          });
        }
      }
      setVotes(merged);

      // Odśwież cache tego wypadu, by powrót na listę pokazał aktualne dane.
      mergeEventData(eventId, {
        event: ev,
        slots: sl,
        votes: dbVotes,
        profiles: pr,
      });
    }
    setLoading(false);
  }, [eventId, userId, displayName]);

  // Seria zmian z realtime (własny głos + cudze + reconnect) sklejana w jeden load()
  // zamiast osobnego 5-zapytaniowego pobrania na każdy wiersz — inaczej burst zapychał
  // główny wątek i UI się zacinało. Trailing debounce.
  const reloadTimer = useRef<number | null>(null);
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null;
      load();
    }, 300);
  }, [load]);

  useEffect(() => {
    load();

    const channel = supabase
      .channel(`event-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'slots', filter: `event_id=eq.${eventId}` },
        scheduleReload,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes', filter: `event_id=eq.${eventId}` },
        scheduleReload,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        scheduleReload,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `event_id=eq.${eventId}` },
        scheduleReload,
      )
      .subscribe();

    // Wybudzenie: odśwież od razu, zamiast czekać aż reconnect realtime odpali
    // przeładowanie w trakcie pierwszej interakcji po wake (jankowało wyjście).
    const onWake = () => {
      if (document.visibilityState === 'visible') scheduleReload();
    };
    document.addEventListener('visibilitychange', onWake);

    return () => {
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [eventId, load, scheduleReload]);

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    const times = buildSlotTimes(slotDraft);
    if (!times) return;
    // Termin nie może być z przeszłości (cały dzień „dziś" jest OK — liczymy koniec dnia).
    if (slotEndMs(times) < Date.now() - 60000) {
      appAlert('Zły termin', 'Nie można dodać terminu z przeszłości.');
      return;
    }
    await supabase.from('slots').insert({
      event_id: eventId,
      starts_at: times.starts_at,
      ends_at: times.ends_at,
      all_day: times.all_day,
      created_by: displayName,
      created_by_user_id: userId,
    });
    setSlotDraft(EMPTY_SLOT_RANGE);
  }

  async function deleteSlot(slotId: string) {
    const ok = await appConfirm('Usunąć termin?', {
      message: 'Zniknie razem z oddanymi na niego głosami.',
      confirmLabel: 'Usuń',
      danger: true,
    });
    if (!ok) return;
    // Optymistycznie usuń lokalnie; przy błędzie stan wróci z bazy.
    setSlots((prev) => prev.filter((s) => s.id !== slotId));
    const { error } = await supabase.from('slots').delete().eq('id', slotId);
    if (error) load();
  }

  async function vote(slotId: string, availability: Availability) {
    // Zapamiętaj zamiar — przeładowania z bazy będą go respektować aż do potwierdzenia.
    pendingVotesRef.current.set(slotId, availability);
    // Optymistyczna aktualizacja: pokaż wybór od razu, zanim baza odpowie —
    // bez tego na komórce tap wygląda jakby nie zadziałał (feedback dopiero po realtime).
    setVotes((prev) => {
      const existing = prev.find((v) => v.slot_id === slotId && v.user_id === userId);
      if (existing) {
        return prev.map((v) => (v === existing ? { ...v, availability } : v));
      }
      const optimistic: Vote = {
        id: `optimistic-${slotId}-${userId}`,
        event_id: eventId,
        slot_id: slotId,
        user_id: userId,
        participant_name: displayName,
        availability,
        created_at: new Date().toISOString(),
      };
      return [...prev, optimistic];
    });

    const { error } = await supabase.from('votes').upsert(
      { event_id: eventId, slot_id: slotId, user_id: userId, participant_name: displayName, availability },
      { onConflict: 'slot_id,user_id' },
    );
    // Przy błędzie porzuć zamiar i wróć do prawdziwego stanu z bazy.
    if (error) {
      pendingVotesRef.current.delete(slotId);
      load();
    }
  }

  // Ręczne ustalenie terminu przez organizatora (ma pierwszeństwo nad automatem).
  async function confirmSlot(slot: Slot) {
    const { error } = await supabase
      .from('events')
      .update({ confirmed_slot_id: slot.id, confirmed_at: slot.starts_at })
      .eq('id', eventId);
    if (error) {
      appAlert('Błąd', 'Nie udało się ustalić terminu.');
      return;
    }
    load();
  }
  async function unconfirmSlot() {
    const { error } = await supabase
      .from('events')
      .update({ confirmed_slot_id: null, confirmed_at: null })
      .eq('id', eventId);
    if (error) {
      appAlert('Błąd', 'Nie udało się odznaczyć terminu.');
      return;
    }
    load();
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    const body = newComment.trim();
    if (!body) return;
    setNewComment('');
    // Optymistycznie pokaż od razu; load() z realtime zastąpi listę prawdą z bazy.
    const optimistic: Comment = {
      id: `optimistic-${Date.now()}`,
      event_id: eventId,
      user_id: userId,
      author_name: displayName,
      body,
      created_at: new Date().toISOString(),
    };
    setComments((prev) => [...prev, optimistic]);
    const { error } = await supabase
      .from('comments')
      .insert({ event_id: eventId, user_id: userId, author_name: displayName, body });
    if (error) {
      setNewComment(body);
      load();
    }
  }

  async function deleteComment(id: string) {
    if (!(await appConfirm('Usunąć komentarz?', { confirmLabel: 'Usuń', danger: true }))) return;
    setComments((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase.from('comments').delete().eq('id', id);
    if (error) load();
  }

  function startEdit() {
    if (!event) return;
    setEditTitle(event.title ?? '');
    setEditLocation(event.location ?? '');
    setEditCoords(
      event.latitude != null && event.longitude != null
        ? { lat: event.latitude, lon: event.longitude }
        : null,
    );
    setEditEmoji(event.emoji ?? null);
    setEditDescription(event.description ?? '');
    setEditError('');
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTitle.trim() || editBusy) return;
    setEditBusy(true);
    setEditError('');
    const { error } = await supabase
      .from('events')
      .update({
        title: editTitle.trim(),
        location: editLocation.trim() || null,
        latitude: editCoords?.lat ?? null,
        longitude: editCoords?.lon ?? null,
        emoji: editEmoji,
        description: editDescription.trim() || null,
      })
      .eq('id', eventId);
    setEditBusy(false);
    if (error) {
      setEditError(error.message ?? 'Nie udało się zapisać zmian.');
      return;
    }
    setEditing(false);
    load();
  }

  async function deleteEvent() {
    const ok = await appConfirm('Usunąć cały wypad?', {
      message: 'Znikną wszystkie terminy i głosy. Tego nie da się cofnąć.',
      confirmLabel: 'Usuń wypad',
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) {
      appAlert('Błąd', 'Nie udało się usunąć wypadu.');
      return;
    }
    navigate('/', 'back');
  }

  // Eksport terminu do kalendarza (.ics). Wołany kliknięciem w datę w nagłówku.
  function exportToCalendar(slot: Slot) {
    addToCalendar({
      id: eventId,
      title: event?.title ?? 'Wypad',
      location: event?.location,
      description: event?.description,
      startIso: slot.starts_at,
      endIso: slot.ends_at,
      allDay: slot.all_day,
    });
  }

  const stats = useMemo(() => {
    return slots.map((slot) => {
      const slotVotes = votes.filter((v) => v.slot_id === slot.id);
      return {
        slot,
        votes: slotVotes,
        yes: slotVotes.filter((v) => v.availability === 'yes').length,
        maybe: slotVotes.filter((v) => v.availability === 'maybe').length,
        no: slotVotes.filter((v) => v.availability === 'no').length,
        mine: slotVotes.find((v) => v.user_id === userId)?.availability,
      };
    });
  }, [slots, votes, userId]);

  const maxYes = useMemo(() => Math.max(0, ...stats.map((s) => s.yes)), [stats]);
  const isTie = useMemo(() => stats.filter((s) => s.yes > 0 && s.yes === maxYes).length > 1, [stats, maxYes]);

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const status = useMemo(
    () => getEventStatus(event ?? { confirmed_slot_id: null, confirmed_at: null }, slots, votes, memberIds),
    [event, slots, votes, memberIds],
  );

  // Data w nagłówku: ustalony termin; a jeśli nieustalony — prowadzący (gdy nie remis).
  const headerDate = status.settled ? status.date : (!isTie ? status.leadingDate : null);
  const [lastHeaderDate, setLastHeaderDate] = useState<string | null>(null);
  useEffect(() => {
    if (headerDate) setLastHeaderDate(headerDate);
  }, [headerDate]);

  // Slot pokazywany w nagłówku (do formatowania zakresu + eksportu kalendarza).
  const headerSlotId = status.settled ? status.slotId : (!isTie ? status.leadingSlotId : null);
  const headerSlot = useMemo(
    () => (headerSlotId ? slots.find((s) => s.id === headerSlotId) ?? null : null),
    [headerSlotId, slots],
  );
  const [lastHeaderSlot, setLastHeaderSlot] = useState<Slot | null>(null);
  useEffect(() => {
    if (headerSlot) setLastHeaderSlot(headerSlot);
  }, [headerSlot]);

  const profileById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Uczestnicy, którzy oddali jakikolwiek głos — z awatarami (do stosu na górze).
  const participantsPeople = useMemo<Person[]>(() => {
    const seen = new Map<string, Person>();
    for (const v of votes) {
      const key = v.user_id ?? `name:${v.participant_name}`;
      if (seen.has(key)) continue;
      const prof = v.user_id ? profileById.get(v.user_id) : undefined;
      seen.set(key, { name: prof?.display_name ?? v.participant_name, avatar: prof?.avatar ?? null });
    }
    return Array.from(seen.values());
  }, [votes, profileById]);


  // Kto z paczki nie oddał jeszcze żadnego głosu w tym wypadzie (= AFK).
  const missingMembers = useMemo<Profile[]>(() => {
    const voted = new Set(votes.map((v) => v.user_id).filter(Boolean));
    return members.filter((m) => !voted.has(m.id));
  }, [members, votes]);

  // „Pinguj kurwę": push do jednej osoby z losowym cytatem (wspólna logika w lib/ping).
  const [pinged, setPinged] = useState<Set<string>>(new Set());
  async function doPing(m: Profile) {
    const err = await pingUser(eventId, m.id, m.display_name);
    if (err) {
      appAlert('Ping nie poszedł', err);
      return;
    }
    setPinged((prev) => new Set(prev).add(m.id));
  }

  // Ile dni wisi lobby bez odpowiedzi — liczone od założenia wypadu.
  const afkLabel = useMemo(() => {
    if (!event?.created_at) return 'AFK';
    const d = Math.floor((Date.now() - new Date(event.created_at).getTime()) / (24 * 3600 * 1000));
    return d <= 0 ? 'AFK OD DZIŚ' : d === 1 ? 'AFK OD WCZORAJ' : `AFK OD ${d} DNI`;
  }, [event?.created_at]);

  if (loading) return <main className="glass-page"><p className="muted">Wczytuję…</p></main>;

  if (notFound) {
    return (
      <main className="glass-page">
        <h1>Nie znaleziono</h1>
        <p className="lead">Ten wypad nie istnieje albo link jest nieprawidłowy.</p>
        <Link href="/" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); navigate('/', 'back'); }}><button className="ghost">Wróć</button></Link>
      </main>
    );
  }

  // Organizator wypadu LUB admin aplikacji (właściciel) — pełne uprawnienia zarządzania.
  const isOrganizer = isAdmin || !event?.created_by_user_id || event.created_by_user_id === userId;

  // Wypad już się odbył (ustalony termin minął) → strona staje się podglądem:
  // bez dodawania/edycji terminów, ustalania i głosowania.
  const settledSlotObj = status.slotId ? slots.find((s) => s.id === status.slotId) ?? null : null;
  const isPast = status.settled && settledSlotObj ? slotEndMs(settledSlotObj) < Date.now() : false;

  const memberCount = members.length;
  const votedCount = participantsPeople.length;

  return (
    <main className="glass-page">
      <div className="nav-row">
        <Link
          href="/"
          className="back-btn-round"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            navigate('/', 'back');
          }}
          aria-label="Wróć"
        >
          <IconChevronLeft size={20} />
        </Link>
        <span className="nav-label">Lobby</span>
      </div>

      {editing && (
        <form className="card" onSubmit={saveEdit}>
          <div className="modal-label">Edytuj wypad</div>
          <div className="field">
            <label htmlFor="edit-title">Nazwa</label>
            <input
              id="edit-title"
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="edit-location">Miejsce (opcjonalnie)</label>
            <LocationAutocomplete
              id="edit-location"
              value={editLocation}
              onChange={setEditLocation}
              onCoords={setEditCoords}
              placeholder="np. u Kuby, Zakopane…"
            />
          </div>
          <EventEmojiInput value={editEmoji} onChange={setEditEmoji} />
          <div className="field">
            <label htmlFor="edit-description">Opis (opcjonalnie)</label>
            <DescriptionInput
              id="edit-description"
              value={editDescription}
              onChange={setEditDescription}
              placeholder="np. co bierzemy, plan, szczegóły…"
            />
          </div>
          {editError && <p className="small" style={{ color: 'var(--no)' }}>{editError}</p>}
          <button type="submit" className="cta-gradient" disabled={!editTitle.trim() || editBusy}>
            {editBusy ? 'Zapisuję…' : 'Zapisz zmiany'}
          </button>
          <button
            type="button"
            className="ghost"
            style={{ width: '100%', marginTop: 8 }}
            onClick={() => setEditing(false)}
          >
            Anuluj
          </button>
        </form>
      )}

      {!editing && (
      <header className="app-header">
        <div className="title-row">
          <h1 className="large-title">{event?.title}</h1>
          {isOrganizer && !isPast && (
            <button
              type="button"
              className="title-edit-btn"
              onClick={startEdit}
              aria-label="Edytuj wypad"
            >
              <IconPencil size={17} />
            </button>
          )}
        </div>
        {(event?.location || event?.created_by) && (
          <div className="event-submeta">
            {event?.location && (
              <span><IconPin size={13} /> {event.location}</span>
            )}
            {event?.location && event?.created_by && <span className="sep">·</span>}
            {event?.created_by && <span>host: {event.created_by}</span>}
          </div>
        )}
        <div className={`confirmed-inline-wrapper${headerDate ? ' show' : ''}`}>
          <div className="confirmed-inline">
            {lastHeaderSlot && (
              <>
                <button
                  type="button"
                  className="cal-chip"
                  onClick={() => exportToCalendar(lastHeaderSlot)}
                >
                  <IconCalendarPlus size={19} />
                  <span className="cal-chip-main">
                    <b>
                      {formatSlotShort(lastHeaderSlot)}
                      {!lastHeaderSlot.all_day && !lastHeaderSlot.ends_at
                        ? ` · ${new Date(lastHeaderSlot.starts_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                    </b>
                    <span>Dodaj do kalendarza</span>
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      )}

      {!editing && event?.description && (
        <div className="event-description"><Markdown text={event.description} /></div>
      )}

      {isPast && (
        <p className="readonly-note">Ten wypad już się odbył — to tylko podgląd.</p>
      )}

      {!isPast && slots.length > 0 && memberCount > 0 && missingMembers.length > 0 && (
        <div className="vote-status">
          {missingMembers.map((m) => (
            <div key={m.id} className="afk">
              <Avatar name={m.display_name} avatar={m.avatar} size={28} />
              <span className="afk-text">
                <b>{m.id === userId ? 'Ty się opierdalasz…' : `${m.display_name} się opierdala…`}</b>
                <span>{afkLabel}</span>
              </span>
              {isOrganizer && m.id !== userId && (
                <button
                  type="button"
                  className="nudge"
                  disabled={pinged.has(m.id)}
                  onClick={() => doPing(m)}
                >
                  {pinged.has(m.id) ? 'Spingowano ✓' : 'Pinguj kurwę'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <section className="ev-section">
        <div className="rail">
          <div className="section-label">Ready check</div>
          {memberCount > 0 && !isPast && slots.length > 0 && (
            <span className="chip hot">{votedCount}/{memberCount} DAŁO ZNAĆ</span>
          )}
        </div>
        {stats.length === 0 && (
          <p className="small muted">Brak terminów. Dodaj pierwszy poniżej.</p>
        )}

        {stats.map(({ slot, yes, mine, votes: slotVotes }) => {
          const isBest = yes > 0 && yes === maxYes;
          const isSettledSlot = status.settled && status.slotId === slot.id;
          const showBestBadge = !isSettledSlot && isBest && !isTie;
          const showTieBadge = !isSettledSlot && isBest && isTie;
          const canDelete = isOrganizer || slot.created_by_user_id === userId;
          return (
          <div
            key={slot.id}
            className={`slot${isSettledSlot || showBestBadge ? ' confirmed' : showTieBadge ? ' tie' : ''}`}
          >
            <div className="slot-head">
              <SlotWhen slot={slot} />
              {isSettledSlot && (
                <span className="badge">✓ GRAMY{status.source === 'auto' ? ' · KOMPLET' : ''}</span>
              )}
              {showBestBadge && <span className="badge">Prowadzi</span>}
              {showTieBadge && <span className="badge badge-open">Remis</span>}
              {canDelete && !isPast && (
                <>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="ghost slot-del"
                    aria-label="Usuń termin"
                    onClick={() => deleteSlot(slot.id)}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>

            {slotVotes.length > 0 && (
              <div className="voters">
                {slotVotes.map((v) => {
                  const prof = v.user_id ? profileById.get(v.user_id) : undefined;
                  const name = prof?.display_name ?? v.participant_name;
                  return (
                    <span key={v.id} className={`voter-chip ${v.availability}`} title={name}>
                      <Avatar name={name} avatar={prof?.avatar ?? null} size={18} />
                      {v.availability === 'yes' ? 'READY' : v.availability === 'maybe' ? 'MOŻE' : 'PAS'}
                    </span>
                  );
                })}
              </div>
            )}

            {!isPast && (
              <div className="seg3 slot-seg3" role="group" aria-label="Twój głos">
                {CHOICES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={mine === c.value ? c.cls : ''}
                    onClick={() => vote(slot.id, c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          );
        })}

        {/* LOCK IN — jeden przycisk pod terminami (prowadzący; przy remisie po jednym
            na każdy remisujący termin). Odklepanie tylko przy ręcznym ustaleniu. */}
        {isOrganizer && !isPast && stats.length > 0 && (
          status.settled ? (
            status.source === 'manual' && (
              <button type="button" className="ghost lockin-btn" onClick={unconfirmSlot}>
                Odklep termin
              </button>
            )
          ) : (
            stats
              .filter(({ slot, yes }) =>
                isTie ? yes > 0 && yes === maxYes : slot.id === status.leadingSlotId,
              )
              .map(({ slot }) => (
                <button
                  key={slot.id}
                  type="button"
                  className="slot-confirm-btn primary lockin-btn"
                  onClick={() => confirmSlot(slot)}
                >
                  LOCK IN: {formatSlotShort(slot)}
                </button>
              ))
          )
        )}



        {!isPast && (
        <div className={`add-slot-wrapper${showAddForm ? ' open' : ''}`}>
          <button
            type="button"
            className="add-slot-toggle"
            onClick={() => setShowAddForm(true)}
          >
            + Dodaj propozycję terminu
          </button>
          <div className="add-slot-form-container">
            <form className="add-slot-form" onSubmit={async (e) => {
              await addSlot(e);
              setShowAddForm(false);
            }}>
              <SlotRangeInput value={slotDraft} onChange={setSlotDraft} idPrefix="new-slot" />
              <div className="add-slot-actions">
                <button type="submit" disabled={!slotDraft.od}>Dodaj</button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setShowAddForm(false);
                    setSlotDraft(EMPTY_SLOT_RANGE);
                  }}
                >
                  Anuluj
                </button>
              </div>
            </form>
          </div>
        </div>
        )}
      </section>

      <section className="ev-section">
        <div className="section-label">Czat</div>
        {comments.length === 0 ? (
          <p className="small muted">Cisza. Napisz coś pierwszy.</p>
        ) : (
          <div className="comment-list">
            {comments.map((c) => {
              const prof = c.user_id ? profileById.get(c.user_id) : undefined;
              const name = prof?.display_name ?? c.author_name;
              const canDel = c.user_id === userId || isOrganizer;
              return (
                <div
                  key={c.id}
                  className={`comment${new Date(c.created_at).getTime() > mountTsRef.current ? ' comment-fresh' : ''}`}
                >
                  <Avatar name={name} avatar={prof?.avatar ?? null} size={30} />
                  <div className="comment-body">
                    <div className="comment-head">
                      <span className="comment-author">{name}</span>
                      <span className="comment-time">{formatCommentTime(c.created_at)}</span>
                      {canDel && (
                        <button
                          type="button"
                          className="comment-del"
                          aria-label="Usuń komentarz"
                          onClick={() => deleteComment(c.id)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <p className="comment-text">{c.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <form className="comment-form" onSubmit={addComment}>
          <input
            type="text"
            placeholder="Napisz coś…"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            maxLength={500}
          />
          <button type="submit" className="send" disabled={!newComment.trim()} aria-label="Wyślij">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
          </button>
        </form>
      </section>

      {isOrganizer && !editing && (
        <div className="event-danger-zone">
          <button type="button" className="danger-link" onClick={deleteEvent}>
            Usuń ten wypad
          </button>
        </div>
      )}
    </main>
  );
}
