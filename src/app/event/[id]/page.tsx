'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { getEventStatus } from '@/lib/types';
import type { Availability, EventRow, Profile, Slot, Vote } from '@/lib/types';
import { Avatar, AvatarStack, type Person } from '@/components/Avatar';
import { IconPin, IconCalendar, IconCheck, IconChevronLeft } from '@/components/icons';
import DateTimeInput from '@/components/DateTimeInput';
import { useTransitionNavigate } from '@/lib/transition';
import { getCache, mergeEventData } from '@/lib/dataCache';
import { addToCalendar } from '@/lib/calendar';


const CHOICES: { value: Availability; label: string; cls: string }[] = [
  { value: 'yes', label: 'Wchodzę', cls: 'active-yes' },
  { value: 'maybe', label: 'Może', cls: 'active-maybe' },
  { value: 'no', label: 'Pas', cls: 'active-no' },
];

function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function getMinDateTime(): string {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
}

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const navigate = useTransitionNavigate();
  const { userId, displayName } = useAuth();

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

  const [newSlot, setNewSlot] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Ostatni zamierzony głos użytkownika per slot — utrzymywany aż baza go potwierdzi.
  // Chroni przed „mruganiem" przy szybkim, naprzemiennym klikaniu (wyścig realtime).
  const pendingVotesRef = useRef<Map<string, Availability>>(new Map());

  const load = useCallback(async () => {
    const [{ data: ev, error: evErr }, { data: sl }, { data: vo }, { data: pr }] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
      supabase.from('slots').select('*').eq('event_id', eventId).order('starts_at'),
      supabase.from('votes').select('*').eq('event_id', eventId),
      supabase.from('profiles').select('*'),
    ]);

    if (evErr || !ev) {
      setNotFound(true);
    } else {
      setEvent(ev as EventRow);
      setSlots((sl ?? []) as Slot[]);
      setMembers((pr ?? []) as Profile[]);

      // Nałóż oczekujące głosy bieżącego użytkownika na świeży stan z bazy:
      // jego ostatni wybór wygrywa, dopóki baza go nie potwierdzi (wtedy czyścimy pending).
      const dbVotes = (vo ?? []) as Vote[];
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
        event: ev as EventRow,
        slots: (sl ?? []) as Slot[],
        votes: dbVotes,
        profiles: (pr ?? []) as Profile[],
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, load]);

  async function insertSlot(localValue: string) {
    if (!localValue) return;
    await supabase.from('slots').insert({
      event_id: eventId,
      starts_at: new Date(localValue).toISOString(),
      created_by: displayName,
      created_by_user_id: userId,
    });
  }

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!newSlot) return;
    if (new Date(newSlot).getTime() < Date.now() - 60000) {
      alert('Nie można dodać terminu z przeszłości.');
      return;
    }
    await insertSlot(newSlot);
    setNewSlot('');
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

  async function deleteEvent() {
    if (!window.confirm('Usunąć cały wypad? Znikną wszystkie terminy i głosy. Tego nie da się cofnąć.')) return;
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) {
      window.alert('Nie udało się usunąć wypadu.');
      return;
    }
    navigate('/', 'back');
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

  const isOrganizer = !event?.created_by_user_id || event.created_by_user_id === userId;

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

      <header className="app-header">
        <h1 className="large-title">{event?.title}</h1>
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
          <div className={`confirmed-inline${status.settled ? ' settled' : ''}`}>
            {lastHeaderDate && (
              <>
                <IconCalendar size={15} />
                <span className="confirmed-date">{formatSlot(lastHeaderDate)}</span>
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

      {/* TODO: na czas testów guzik widać też przy nieustalonym terminie.
          Docelowo pokazywać tylko gdy status.settled. */}
      {(() => {
        const calDate = status.date ?? status.leadingDate ?? slots[0]?.starts_at ?? null;
        if (!calDate) return null;
        return (
          <button
            type="button"
            className="ghost cal-export"
            onClick={() =>
              addToCalendar({
                id: eventId,
                title: event?.title ?? 'Wypad',
                location: event?.location,
                description: event?.description,
                startIso: calDate,
              })
            }
          >
            <IconCalendar size={15} /> Dodaj do kalendarza
          </button>
        );
      })()}

      {event?.description && (
        <p className="event-description">{event.description}</p>
      )}

      {slots.length > 0 && missingVoters.length > 0 && (
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
              <span className="slot-date">{formatSlot(slot.starts_at)}</span>
              {isSettledSlot && <span className="badge">✓ Ustalony</span>}
              {showBestBadge && <span className="badge">na czele</span>}
              {showTieBadge && <span className="badge badge-open">remis</span>}
              {canDelete && (
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

            {(() => {
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

            {isOrganizer && (
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
              <DateTimeInput
                value={newSlot}
                onChange={(e) => setNewSlot(e.target.value)}
                placeholder="Wybierz datę i godzinę"
                min={getMinDateTime()}
              />
              <div className="add-slot-actions">
                <button type="submit" disabled={!newSlot}>Dodaj</button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewSlot('');
                  }}
                >
                  Anuluj
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {isOrganizer && (
        <div className="event-danger-zone">
          <button type="button" className="danger-link" onClick={deleteEvent}>
            Usuń ten wypad
          </button>
        </div>
      )}
    </main>
  );
}
