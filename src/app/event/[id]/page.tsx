'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { getEventStatus, formatSlotRange, slotEndMs } from '@/lib/types';
import type { Availability, Comment, EventRow, Profile, Slot, Vote } from '@/lib/types';
import { Avatar, AvatarStack, type Person } from '@/components/Avatar';
import { IconPin, IconCalendarPlus, IconCheck, IconChevronLeft, IconPencil } from '@/components/icons';
import SlotRangeInput from '@/components/SlotRangeInput';
import DescriptionInput from '@/components/DescriptionInput';
import { Markdown } from '@/lib/markdown';
import { buildSlotTimes, EMPTY_SLOT_RANGE, type SlotRange } from '@/lib/slotInput';
import { useTransitionNavigate } from '@/lib/transition';
import { getCache, mergeEventData } from '@/lib/dataCache';
import { loadEventBundle } from '@/lib/eventPrefetch';
import { addToCalendar } from '@/lib/calendar';


const CHOICES: { value: Availability; label: string; cls: string }[] = [
  { value: 'yes', label: 'Wchodzę', cls: 'active-yes' },
  { value: 'maybe', label: 'Może', cls: 'active-maybe' },
  { value: 'no', label: 'Pas', cls: 'active-no' },
];

function formatCommentTime(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const [editDescription, setEditDescription] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');

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

  useEffect(() => {
    load();

    const channel = supabase
      .channel(`event-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'slots', filter: `event_id=eq.${eventId}` },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes', filter: `event_id=eq.${eventId}` },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `event_id=eq.${eventId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, load]);

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    const times = buildSlotTimes(slotDraft);
    if (!times) return;
    // Termin nie może być z przeszłości (cały dzień „dziś" jest OK — liczymy koniec dnia).
    if (slotEndMs(times) < Date.now() - 60000) {
      alert('Nie można dodać terminu z przeszłości.');
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
    if (!window.confirm('Usunąć ten termin? Zniknie razem z oddanymi na niego głosami.')) return;
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
      window.alert('Nie udało się ustalić terminu.');
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
      window.alert('Nie udało się odznaczyć terminu.');
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
    if (!window.confirm('Usunąć komentarz?')) return;
    setComments((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase.from('comments').delete().eq('id', id);
    if (error) load();
  }

  function startEdit() {
    if (!event) return;
    setEditTitle(event.title ?? '');
    setEditLocation(event.location ?? '');
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
    if (!window.confirm('Usunąć cały wypad? Znikną wszystkie terminy i głosy. Tego nie da się cofnąć.')) return;
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) {
      window.alert('Nie udało się usunąć wypadu.');
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


  // Kto z paczki nie oddał jeszcze żadnego głosu w tym wypadzie.
  const missingVoters = useMemo(() => {
    const voted = new Set(votes.map((v) => v.user_id).filter(Boolean));
    return members.filter((m) => !voted.has(m.id)).map((m) => m.display_name);
  }, [members, votes]);

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
  const votedPct = memberCount > 0 ? Math.min(100, Math.round((votedCount / memberCount) * 100)) : 0;

  return (
    <main className="glass-page">
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

      {editing && (
        <form className="card" onSubmit={saveEdit}>
          <h2>Edytuj wypad</h2>
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
            <input
              id="edit-location"
              type="text"
              placeholder="np. u Kuby, Zakopane…"
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
            />
          </div>
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
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" disabled={!editTitle.trim() || editBusy}>
              {editBusy ? 'Zapisuję…' : 'Zapisz zmiany'}
            </button>
            <button type="button" className="ghost" onClick={() => setEditing(false)}>
              Anuluj
            </button>
          </div>
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
            {event?.created_by && <span>Organizuje {event.created_by}</span>}
          </div>
        )}
        <div className={`confirmed-inline-wrapper${headerDate ? ' show' : ''}`}>
          <div
            className={`confirmed-inline tappable${status.settled ? ' settled' : ''}`}
            role="button"
            tabIndex={lastHeaderSlot ? 0 : -1}
            aria-label="Dodaj termin do kalendarza"
            onClick={() => lastHeaderSlot && exportToCalendar(lastHeaderSlot)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && lastHeaderSlot) {
                e.preventDefault();
                exportToCalendar(lastHeaderSlot);
              }
            }}
          >
            {lastHeaderSlot && (
              <>
                <IconCalendarPlus size={15} />
                <span className="confirmed-date">{formatSlotRange(lastHeaderSlot)}</span>
                <span className="confirmed-tag">
                  <IconCheck size={12} />{' '}
                  {status.settled
                    ? status.source === 'auto'
                      ? 'Ustalone · wszyscy dali znać'
                      : 'Ustalone'
                    : 'Na czele'}
                </span>
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

      {!isPast && slots.length > 0 && missingVoters.length > 0 && (
        <div className="vote-status">
          <div className="vote-status-row">
            {votedCount > 0 && <AvatarStack people={participantsPeople} size={26} />}
            <span className="vote-status-count">
              {votedCount > 0 ? (
                <>
                  <strong>{votedCount}{memberCount > 0 ? ` / ${memberCount}` : ''}</strong> dało znać
                </>
              ) : (
                'Jeszcze nikt nie dał znać'
              )}
            </span>
          </div>

          {memberCount > 0 && (
            <div className="vote-progress">
              <div className="vote-progress-bar" style={{ width: `${votedPct}%` }} />
            </div>
          )}

          {memberCount > 0 && (
            <p className="vote-missing">
              Cweluchy: {missingVoters.slice(0, 5).join(', ')}
              {missingVoters.length > 5 && ` …i ${missingVoters.length - 5} innych`}
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h2>Proponowane terminy</h2>
        {stats.length === 0 && (
          <p className="small muted">Brak terminów. Dodaj pierwszy poniżej.</p>
        )}

        {stats.map(({ slot, yes, maybe, no, mine, votes: slotVotes }) => {
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
              <span className="slot-date">{formatSlotRange(slot)}</span>
              {isSettledSlot && <span className="badge">✓ Ustalony</span>}
              {showBestBadge && <span className="badge">na czele</span>}
              {showTieBadge && <span className="badge badge-open">remis</span>}
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

            <div className="tally">
              <span className="yes">✓ {yes}</span>
              <span className="maybe">~ {maybe}</span>
              <span className="no">✗ {no}</span>
            </div>

            {!isPast && (() => {
              const selectedIndex = CHOICES.findIndex((c) => c.value === mine);
              return (
                <div className={`choices ${selectedIndex !== -1 ? `active-index-${selectedIndex}` : 'no-active'}`}>
                  <div className="choices-slider" />
                  {CHOICES.map((c) => (
                    <button
                      key={c.value}
                      className={mine === c.value ? `${c.cls} active` : ''}
                      onClick={() => vote(slot.id, c.value)}
                      style={{ position: 'relative', zIndex: 1 }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              );
            })()}

            {slotVotes.length > 0 && (
              <div className="voters">
                {slotVotes.map((v) => {
                  const prof = v.user_id ? profileById.get(v.user_id) : undefined;
                  const name = prof?.display_name ?? v.participant_name;
                  return (
                    <span key={v.id} className={`voter-chip ${v.availability}`}>
                      <Avatar name={name} avatar={prof?.avatar ?? null} size={16} />
                      <span className="name">{name}</span>
                    </span>
                  );
                })}
              </div>
            )}

            {isOrganizer && !isPast && (
              <div className="slot-confirm-row">
                {event?.confirmed_slot_id === slot.id ? (
                  <button type="button" className="ghost slot-confirm-btn" onClick={unconfirmSlot}>
                    Odznacz termin
                  </button>
                ) : (
                  <button type="button" className="ghost slot-confirm-btn" onClick={() => confirmSlot(slot)}>
                    Ustal ten termin
                  </button>
                )}
              </div>
            )}
          </div>
          );
        })}



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
      </div>

      <div className="card comments-card">
        <h2>Komentarze</h2>
        {comments.length === 0 ? (
          <p className="small muted">Brak komentarzy. Napisz pierwszy.</p>
        ) : (
          <div className="comment-list">
            {comments.map((c) => {
              const prof = c.user_id ? profileById.get(c.user_id) : undefined;
              const name = prof?.display_name ?? c.author_name;
              const canDel = c.user_id === userId || isOrganizer;
              return (
                <div key={c.id} className="comment">
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
            placeholder="Napisz komentarz…"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            maxLength={500}
          />
          <button type="submit" disabled={!newComment.trim()}>Wyślij</button>
        </form>
      </div>

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
