'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { getConfirmedSlot } from '@/lib/types';
import type { Availability, EventRow, Profile, Slot, Vote } from '@/lib/types';
import { Avatar, AvatarStack, type Person } from '@/components/Avatar';
import { IconPin } from '@/components/icons';
import GlassBackground from '@/components/GlassBackground';

const CHOICES: { value: Availability; label: string; cls: string }[] = [
  { value: 'yes', label: 'Mogę', cls: 'active-yes' },
  { value: 'maybe', label: 'Może', cls: 'active-maybe' },
  { value: 'no', label: 'Nie', cls: 'active-no' },
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

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const router = useRouter();
  const { userId, displayName } = useAuth();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [newSlot, setNewSlot] = useState('');
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  // Ostatni zamierzony głos użytkownika per slot — utrzymywany aż baza go potwierdzi.
  // Chroni przed „mruganiem" przy szybkim, naprzemiennym klikaniu (wyścig realtime).
  const pendingVotesRef = useRef<Map<string, Availability>>(new Map());

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

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

  // confirmed_slot_id and confirmed_at are now computed dynamically on the client

  async function deleteEvent() {
    if (!window.confirm('Usunąć cały wypad? Znikną wszystkie terminy i głosy. Tego nie da się cofnąć.')) return;
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) {
      window.alert('Nie udało się usunąć wypadu.');
      return;
    }
    router.push('/');
  }

  async function shareLink() {
    const url = window.location.href;
    // Na iOS/mobile użyj natywnego Share Sheet (iMessage/WhatsApp…); to gest użytkownika.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: event?.title ? `Wypad: ${event.title}` : 'Wypad',
          text: event?.title ? `Ustalmy termin: ${event.title}` : 'Ustalmy termin wypadu',
          url,
        });
      } catch {
        /* użytkownik anulował udostępnianie — nic nie robimy */
      }
      return;
    }
    // Fallback (desktop): skopiuj link do schowka.
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* schowek niedostępny — użytkownik może skopiować URL ręcznie */
    }
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

  const { confirmedSlotId, confirmedAt } = useMemo(() => {
    const { slotId, confirmedAt } = getConfirmedSlot(slots, votes);
    return { confirmedSlotId: slotId, confirmedAt };
  }, [slots, votes]);

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

  if (loading) return <main className="glass-page"><GlassBackground /><p className="muted">Wczytuję…</p></main>;

  if (notFound) {
    return (
      <main className="glass-page">
        <GlassBackground />
        <h1>Nie znaleziono</h1>
        <p className="lead">Ten wypad nie istnieje albo link jest nieprawidłowy.</p>
        <Link href="/"><button className="ghost">Wróć</button></Link>
      </main>
    );
  }

  const isOrganizer = !event?.created_by_user_id || event.created_by_user_id === userId;

  return (
    <main className="glass-page">
      <GlassBackground />
      <Link href="/" className="back-link">‹ Wszystkie wypady</Link>

      <header className="app-header">
        <h1 className="large-title">{event?.title}</h1>
        {event?.location && (
          <p className="meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <IconPin size={14} /> {event.location}
          </p>
        )}
        {event?.created_by && <p className="meta">Organizuje: {event.created_by}</p>}
      </header>

      {confirmedAt && (
        <div className="confirmed-banner">✅ Ustalono: {formatSlot(confirmedAt)}</div>
      )}

      <div className="row mt">
        <button className="ghost" onClick={shareLink}>
          {copied ? 'Skopiowano ✓' : canShare ? 'Udostępnij link 📤' : 'Skopiuj link dla znajomych'}
        </button>
        <span className="spacer" />
        {participantsPeople.length > 0 ? (
          <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <AvatarStack people={participantsPeople} size={26} />
            <span className="small muted">{participantsPeople.length} głosowało</span>
          </span>
        ) : (
          <span className="small muted">Nikt jeszcze nie głosował</span>
        )}
      </div>

      {slots.length > 0 && members.length > 0 && (
        <div className="mt">
          {missingVoters.length > 0 ? (
            <span className="pill-wait">
              ⏳ Czekamy na: {missingVoters.slice(0, 5).join(', ')}
              {missingVoters.length > 5 && ` i ${missingVoters.length - 5} innych`}
            </span>
          ) : (
            <span className="pill-done">✅ Cała paczka zagłosowała</span>
          )}
        </div>
      )}

      <p className="small muted mt">Głosujesz jako <strong>{displayName}</strong>.</p>

      <div className="card">
        <h2>Proponowane terminy</h2>
        <p className="small muted" style={{ marginTop: -6 }}>
          Ustalony termin to ten, na który pasuje najwięcej osób (w przypadku remisu decyduje wcześniejszy termin). Zaznacz przy każdym terminie, kiedy możesz.
        </p>
        {stats.length === 0 && (
          <p className="small muted">Brak terminów. Dodaj pierwszy poniżej.</p>
        )}

        {stats.map(({ slot, yes, maybe, no, mine, votes: slotVotes }) => {
          const isConfirmed = confirmedSlotId === slot.id;
          const isBest = yes > 0 && yes === maxYes;
          const canDelete = isOrganizer || slot.created_by_user_id === userId;
          return (
          <div
            key={slot.id}
            className={`slot${isConfirmed ? ' confirmed' : isBest ? ' winner' : ''}`}
          >
            <div className="slot-head">
              <span className="slot-date">{formatSlot(slot.starts_at)}</span>
              {isConfirmed ? (
                <span className="badge">ustalony</span>
              ) : (
                isBest && <span className="badge badge-open">najlepszy</span>
              )}
              {canDelete && !isConfirmed && (
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

            <div className="choices">
              {CHOICES.map((c) => (
                <button
                  key={c.value}
                  className={mine === c.value ? c.cls : ''}
                  onClick={() => vote(slot.id, c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {slotVotes.length > 0 && (
              <div className="voters">
                {slotVotes.map((v) => {
                  const prof = v.user_id ? profileById.get(v.user_id) : undefined;
                  const name = prof?.display_name ?? v.participant_name;
                  return (
                    <span key={v.id} className="voter-chip">
                      <Avatar name={name} avatar={prof?.avatar ?? null} size={18} />
                      <span className="name">{name}</span>
                      {' '}
                      {v.availability === 'yes' ? '✓' : v.availability === 'maybe' ? '~' : '✗'}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          );
        })}



        <form className="row mt" onSubmit={addSlot}>
          <input
            type="datetime-local"
            value={newSlot}
            onChange={(e) => setNewSlot(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button type="submit" disabled={!newSlot}>Dodaj termin</button>
        </form>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button type="button" className="ghost danger" style={{ width: '100%' }} onClick={deleteEvent}>
            Usuń wypad
          </button>
        </div>
      </div>
    </main>
  );
}
