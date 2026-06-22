'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import type { EventRow, Slot, Vote, Profile } from '@/lib/types';
import { SLOT_PRESETS } from '@/lib/slotPresets';
import { AvatarStack, type Person } from '@/components/Avatar';
import ProfileMenu from '@/components/ProfileMenu';
import GlassBackground from '@/components/GlassBackground';
import { IconCalendar, IconClock, IconPin, IconChevron, IconBulb } from '@/components/icons';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pl-PL', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}
function progressColor(p: number): string {
  return p >= 67 ? 'var(--yes)' : p >= 34 ? 'var(--maybe)' : 'var(--no)';
}

type Agg = { voters: Person[]; percent: number; dateIso: string | null };
const EMPTY_AGG: Agg = { voters: [], percent: 0, dateIso: null };

export default function Home() {
  const router = useRouter();
  const { userId, displayName } = useAuth();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [proposedSlots, setProposedSlots] = useState<string[]>(['']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [{ data: ev }, { data: sl }, { data: vo }, { data: pr }] = await Promise.all([
      supabase.from('events').select('*').order('created_at', { ascending: false }),
      supabase.from('slots').select('*'),
      supabase.from('votes').select('*'),
      supabase.from('profiles').select('*'),
    ]);
    setEvents((ev ?? []) as EventRow[]);
    setSlots((sl ?? []) as Slot[]);
    setVotes((vo ?? []) as Vote[]);
    setProfiles((pr ?? []) as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError('');

    const { data, error } = await supabase
      .from('events')
      .insert({
        title: title.trim(),
        location: location.trim() || null,
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

    const slotRows = proposedSlots
      .filter((s) => s)
      .map((s) => ({
        event_id: data.id,
        starts_at: new Date(s).toISOString(),
        created_by: displayName,
        created_by_user_id: userId,
      }));
    if (slotRows.length > 0) {
      await supabase.from('slots').insert(slotRows);
    }

    router.push(`/event/${data.id}`);
  }

  const { open, upcoming, past } = useMemo(() => {
    const now = Date.now();
    const open: EventRow[] = [];
    const upcoming: EventRow[] = [];
    const past: EventRow[] = [];
    for (const ev of events) {
      if (!ev.confirmed_at) open.push(ev);
      else if (new Date(ev.confirmed_at).getTime() >= now) upcoming.push(ev);
      else past.push(ev);
    }
    upcoming.sort((a, b) => new Date(a.confirmed_at!).getTime() - new Date(b.confirmed_at!).getTime());
    past.sort((a, b) => new Date(b.confirmed_at!).getTime() - new Date(a.confirmed_at!).getTime());
    return { open, upcoming, past };
  }, [events]);

  // Agregaty per wypad: głosujący (z awatarami), % paczki, reprezentatywna data.
  const aggByEvent = useMemo(() => {
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const slotsBy = new Map<string, Slot[]>();
    for (const s of slots) {
      const arr = slotsBy.get(s.event_id) ?? [];
      arr.push(s);
      slotsBy.set(s.event_id, arr);
    }
    const votesBy = new Map<string, Vote[]>();
    for (const v of votes) {
      const arr = votesBy.get(v.event_id) ?? [];
      arr.push(v);
      votesBy.set(v.event_id, arr);
    }
    const memberCount = profiles.length;
    const result = new Map<string, Agg>();
    for (const ev of events) {
      const seen = new Map<string, Person>();
      for (const v of votesBy.get(ev.id) ?? []) {
        const key = v.user_id ?? `name:${v.participant_name}`;
        if (seen.has(key)) continue;
        const prof = v.user_id ? profileById.get(v.user_id) : undefined;
        seen.set(key, { name: prof?.display_name ?? v.participant_name, avatar: prof?.avatar ?? null });
      }
      const voters = Array.from(seen.values());
      const percent = memberCount > 0 ? Math.round((voters.length / memberCount) * 100) : 0;
      const evSlots = (slotsBy.get(ev.id) ?? [])
        .slice()
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
      const dateIso = ev.confirmed_at ?? evSlots[0]?.starts_at ?? null;
      result.set(ev.id, { voters, percent, dateIso });
    }
    return result;
  }, [events, slots, votes, profiles]);

  return (
    <main className="glass-page">
      <GlassBackground />
      <header className="dash-header" style={{ marginBottom: 16 }}>
        <span className="lead" style={{ margin: 0, flex: 1 }}>Cześć, {displayName}</span>
        <ProfileMenu />
      </header>

      <button className="cta-gradient" onClick={() => setShowForm((v) => !v)}>
        {showForm ? 'Anuluj' : '+ Nowy wypad'}
      </button>

      {showForm && (
        <form className="card mt" onSubmit={createEvent}>
          <h2>Nowy wypad</h2>
          <div className="field">
            <label htmlFor="title">Nazwa</label>
            <input
              id="title"
              type="text"
              placeholder="np. Piwo w piątek, wyjazd w góry…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="location">Miejsce (opcjonalnie)</label>
            <input
              id="location"
              type="text"
              placeholder="np. u Kuby, Zakopane…"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Proponowane terminy (opcjonalnie)</label>
            <div className="row chips" style={{ marginBottom: 10 }}>
              {SLOT_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.label}
                  className="ghost chip"
                  onClick={() =>
                    setProposedSlots((prev) => {
                      const empty = prev.findIndex((s) => !s);
                      const value = p.build();
                      return empty !== -1
                        ? prev.map((s, j) => (j === empty ? value : s))
                        : [...prev, value];
                    })
                  }
                >
                  + {p.label}
                </button>
              ))}
            </div>
            {proposedSlots.map((slot, i) => (
              <div className="row" key={i} style={{ marginBottom: 8 }}>
                <input
                  type="datetime-local"
                  value={slot}
                  onChange={(e) =>
                    setProposedSlots((prev) => prev.map((s, j) => (j === i ? e.target.value : s)))
                  }
                  style={{ flex: 1, minWidth: 200 }}
                />
                {proposedSlots.length > 1 && (
                  <button
                    type="button"
                    className="ghost"
                    aria-label="Usuń termin"
                    onClick={() => setProposedSlots((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() => setProposedSlots((prev) => [...prev, ''])}
            >
              + Dodaj kolejny termin
            </button>
          </div>

          {error && <p className="small" style={{ color: 'var(--no)' }}>{error}</p>}
          <button type="submit" disabled={!title.trim() || busy}>
            {busy ? 'Tworzę…' : 'Utwórz wypad'}
          </button>
        </form>
      )}

      {loading && <p className="muted mt">Wczytuję…</p>}

      {!loading && events.length === 0 && !showForm && (
        <div className="empty-state mt">
          <div className="emoji">🗓️</div>
          <h2>Brak wypadów</h2>
          <p>Zaproponuj pierwszy termin i wyślij znajomym.</p>
          <button onClick={() => setShowForm(true)}>+ Nowy wypad</button>
        </div>
      )}

      <Section title="Do ustalenia" events={open} agg={aggByEvent} variant="open" />
      <Section title="Nadchodzące" events={upcoming} agg={aggByEvent} variant="upcoming" />
      <Section title="Minione" events={past} agg={aggByEvent} variant="past" muted />

      {!loading && events.length > 0 && (
        <div className="tip-banner">
          <IconBulb size={20} className="tip-icon" />
          <span>Im więcej osób zagłosuje, tym łatwiej ustalić idealny termin.</span>
        </div>
      )}
    </main>
  );
}

function Section({
  title,
  events,
  agg,
  variant,
  muted,
}: {
  title: string;
  events: EventRow[];
  agg: Map<string, Agg>;
  variant: 'open' | 'upcoming' | 'past';
  muted?: boolean;
}) {
  if (events.length === 0) return null;
  return (
    <section>
      <div className={`section-label${muted ? ' faded' : ''}`}>{title}</div>
      {events.map((ev) => (
        <EventCard key={ev.id} ev={ev} agg={agg.get(ev.id) ?? EMPTY_AGG} variant={variant} />
      ))}
    </section>
  );
}

function EventCard({ ev, agg, variant }: { ev: EventRow; agg: Agg; variant: 'open' | 'upcoming' | 'past' }) {
  return (
    <Link href={`/event/${ev.id}`} className="event-rich">
      <div className="event-rich-head">
        <span className="event-rich-title">{ev.title}</span>
        <IconChevron size={18} className="row-chevron" />
      </div>

      {ev.location && (
        <div className="event-meta" style={{ marginTop: 6 }}>
          <IconPin size={14} /> {ev.location}
        </div>
      )}

      <div className="event-meta-row">
        {agg.dateIso ? (
          <>
            <span className="event-meta"><IconCalendar size={14} /> {fmtDate(agg.dateIso)}</span>
            <span className="event-meta"><IconClock size={14} /> {fmtTime(agg.dateIso)}</span>
          </>
        ) : (
          <span className="event-meta"><IconCalendar size={14} /> Zbieramy terminy</span>
        )}
      </div>

      <div className="event-rich-foot">
        {agg.voters.length > 0 ? (
          <AvatarStack people={agg.voters} size={28} />
        ) : (
          <span className="small muted">Nikt jeszcze nie głosował</span>
        )}
        <span className="spacer" />
        {variant === 'past' && <span className="badge">✓ Zakończony</span>}
        {variant === 'upcoming' && <span className="badge">Ustalony</span>}
      </div>

      {variant === 'open' && (
        <div className="progress-wrap">
          <div className="progress">
            <div
              className="progress-bar"
              style={{ width: `${agg.percent}%`, background: progressColor(agg.percent) }}
            />
          </div>
          <span className="progress-label" style={{ color: progressColor(agg.percent) }}>
            {agg.percent}% zagłosowało
          </span>
        </div>
      )}
    </Link>
  );
}
