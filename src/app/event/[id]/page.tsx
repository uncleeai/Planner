'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import type { Availability, EventRow, Slot, Vote } from '@/lib/types';

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
  const { userId, displayName } = useAuth();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [newSlot, setNewSlot] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const [{ data: ev, error: evErr }, { data: sl }, { data: vo }] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
      supabase.from('slots').select('*').eq('event_id', eventId).order('starts_at'),
      supabase.from('votes').select('*').eq('event_id', eventId),
    ]);

    if (evErr || !ev) {
      setNotFound(true);
    } else {
      setEvent(ev as EventRow);
      setSlots((sl ?? []) as Slot[]);
      setVotes((vo ?? []) as Vote[]);
    }
    setLoading(false);
  }, [eventId]);

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

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!newSlot) return;
    await supabase.from('slots').insert({
      event_id: eventId,
      starts_at: new Date(newSlot).toISOString(),
      created_by: displayName,
    });
    setNewSlot('');
  }

  async function vote(slotId: string, availability: Availability) {
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
    // Przy błędzie cofnij optymistyczną zmianę, pobierając prawdziwy stan z bazy.
    if (error) load();
  }

  async function confirmSlot(slotId: string, startsAt: string) {
    await supabase
      .from('events')
      .update({ confirmed_slot_id: slotId, confirmed_at: startsAt })
      .eq('id', eventId);
    load();
  }

  async function unconfirmSlot() {
    await supabase
      .from('events')
      .update({ confirmed_slot_id: null, confirmed_at: null })
      .eq('id', eventId);
    load();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
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

  const participants = useMemo(
    () => Array.from(new Set(votes.map((v) => v.participant_name))),
    [votes],
  );

  if (loading) return <main><p className="muted">Wczytuję…</p></main>;

  if (notFound) {
    return (
      <main>
        <h1>Nie znaleziono</h1>
        <p className="lead">Ten wypad nie istnieje albo link jest nieprawidłowy.</p>
        <Link href="/"><button className="ghost">Wróć</button></Link>
      </main>
    );
  }

  const isOrganizer = !event?.created_by_user_id || event.created_by_user_id === userId;

  return (
    <main>
      <p><Link href="/">← Wszystkie wypady</Link></p>
      <h1>{event?.title}</h1>
      {event?.location && <p className="lead">📍 {event.location}</p>}
      {event?.created_by && <p className="small muted">Organizuje: {event.created_by}</p>}

      {event?.confirmed_at && (
        <div className="confirmed-banner">✅ Ustalono: {formatSlot(event.confirmed_at)}</div>
      )}

      <div className="row mt">
        <button className="ghost" onClick={copyLink}>
          {copied ? 'Skopiowano ✓' : 'Skopiuj link dla znajomych'}
        </button>
        <span className="spacer" />
        <span className="small muted">
          {participants.length > 0
            ? `${participants.length} ${participants.length === 1 ? 'osoba' : 'osób'} już głosowało`
            : 'Nikt jeszcze nie głosował'}
        </span>
      </div>

      <p className="small muted mt">Głosujesz jako <strong>{displayName}</strong>.</p>

      <div className="card">
        <h2>Proponowane terminy</h2>
        <p className="small muted" style={{ marginTop: -6 }}>
          {isOrganizer
            ? 'Jako organizator możesz „ustalić" finalny termin — wskoczy wtedy na oś czasu.'
            : event?.created_by
              ? `Finalny termin ustala organizator (${event.created_by}). Ty zaznacz, kiedy możesz.`
              : 'Zaznacz przy każdym terminie, kiedy możesz.'}
        </p>
        {stats.length === 0 && (
          <p className="small muted">Brak terminów. Dodaj pierwszy poniżej.</p>
        )}

        {stats.map(({ slot, yes, maybe, no, mine, votes: slotVotes }) => {
          const isConfirmed = event?.confirmed_slot_id === slot.id;
          const isBest = yes > 0 && yes === maxYes;
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
                {slotVotes.map((v) => (
                  <span key={v.id}>
                    <span className="name">{v.participant_name}</span>
                    {' '}
                    {v.availability === 'yes' ? '✓' : v.availability === 'maybe' ? '~' : '✗'}
                    {'   '}
                  </span>
                ))}
              </div>
            )}

            {isOrganizer && (
              <div className="row mt">
                {isConfirmed ? (
                  <button className="ghost" onClick={unconfirmSlot}>Odznacz ustalony termin</button>
                ) : (
                  <button className="ghost" onClick={() => confirmSlot(slot.id, slot.starts_at)}>
                    Ustal ten termin
                  </button>
                )}
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
      </div>
    </main>
  );
}
