'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { getName, setName as persistName } from '@/lib/identity';
import type { Availability, EventRow, Slot, Vote } from '@/lib/types';
import SetupBanner from '@/components/SetupBanner';

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

  const [event, setEvent] = useState<EventRow | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setNameState] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [newSlot, setNewSlot] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setNameState(getName());
  }, []);

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
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, load]);

  function saveName(e: React.FormEvent) {
    e.preventDefault();
    const clean = nameInput.trim();
    if (!clean) return;
    persistName(clean);
    setNameState(clean);
  }

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!newSlot) return;
    await supabase.from('slots').insert({
      event_id: eventId,
      starts_at: new Date(newSlot).toISOString(),
      created_by: name || null,
    });
    setNewSlot('');
  }

  async function vote(slotId: string, availability: Availability) {
    if (!name) return;
    await supabase.from('votes').upsert(
      { event_id: eventId, slot_id: slotId, participant_name: name, availability },
      { onConflict: 'slot_id,participant_name' },
    );
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
        mine: slotVotes.find((v) => v.participant_name === name)?.availability,
      };
    });
  }, [slots, votes, name]);

  const maxYes = useMemo(() => Math.max(0, ...stats.map((s) => s.yes)), [stats]);

  const participants = useMemo(
    () => Array.from(new Set(votes.map((v) => v.participant_name))),
    [votes],
  );

  if (!isSupabaseConfigured) {
    return (
      <main>
        <p><Link href="/">← Planner</Link></p>
        <SetupBanner />
      </main>
    );
  }

  if (loading) return <main><p className="muted">Wczytuję…</p></main>;

  if (notFound) {
    return (
      <main>
        <h1>Nie znaleziono</h1>
        <p className="lead">Ten wypad nie istnieje albo link jest nieprawidłowy.</p>
        <Link href="/"><button className="ghost">Utwórz nowy</button></Link>
      </main>
    );
  }

  return (
    <main>
      <p><Link href="/">← Planner</Link></p>
      <h1>{event?.title}</h1>
      {event?.location && <p className="lead">📍 {event.location}</p>}

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

      {!name ? (
        <form className="card mt" onSubmit={saveName}>
          <h2>Jak masz na imię?</h2>
          <p className="small muted">Twoje imię zobaczą inni przy Twoich głosach.</p>
          <div className="field">
            <input
              type="text"
              placeholder="np. Kuba"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              autoFocus
            />
          </div>
          <button type="submit" disabled={!nameInput.trim()}>Zapisz</button>
        </form>
      ) : (
        <p className="small muted mt">
          Głosujesz jako <strong>{name}</strong>.
        </p>
      )}

      <div className="card">
        <h2>Proponowane terminy</h2>
        {stats.length === 0 && (
          <p className="small muted">Brak terminów. Dodaj pierwszy poniżej.</p>
        )}

        {stats.map(({ slot, yes, maybe, no, mine, votes: slotVotes }) => (
          <div key={slot.id} className={`slot${yes > 0 && yes === maxYes ? ' winner' : ''}`}>
            <div className="slot-head">
              <span className="slot-date">{formatSlot(slot.starts_at)}</span>
              {yes > 0 && yes === maxYes && <span className="badge">najlepszy</span>}
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
                  disabled={!name}
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
          </div>
        ))}

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
