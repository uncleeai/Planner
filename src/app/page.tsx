'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { getConfirmedSlot } from '@/lib/types';
import type { EventRow, Slot, Vote, Profile } from '@/lib/types';
import { AvatarStack, type Person } from '@/components/Avatar';
import ProfileMenu from '@/components/ProfileMenu';
import DateTimeInput from '@/components/DateTimeInput';
import { useTransitionNavigate } from '@/lib/transition';
import { getCache, setCache } from '@/lib/dataCache';
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
  const navigate = useTransitionNavigate();
  const { userId, displayName } = useAuth();

  // Seed z cache (jeśli wracamy z wypadu) — lista pojawia się od razu, bez „Wczytuję…".
  const cached = getCache();
  const [events, setEvents] = useState<EventRow[]>(() => cached?.events ?? []);
  const [slots, setSlots] = useState<Slot[]>(() => cached?.slots ?? []);
  const [votes, setVotes] = useState<Vote[]>(() => cached?.votes ?? []);
  const [profiles, setProfiles] = useState<Profile[]>(() => cached?.profiles ?? []);
  const [loading, setLoading] = useState(() => !cached);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showForm && titleInputRef.current) {
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 100);
    }
  }, [showForm]);

  const load = useCallback(async () => {
    const [{ data: ev }, { data: sl }, { data: vo }, { data: pr }] = await Promise.all([
      supabase.from('events').select('*').order('created_at', { ascending: false }),
      supabase.from('slots').select('*'),
      supabase.from('votes').select('*'),
      supabase.from('profiles').select('*'),
    ]);
    const events = (ev ?? []) as EventRow[];
    const slots = (sl ?? []) as Slot[];
    const votes = (vo ?? []) as Vote[];
    const profiles = (pr ?? []) as Profile[];
    setEvents(events);
    setSlots(slots);
    setVotes(votes);
    setProfiles(profiles);
    setCache({ events, slots, votes, profiles }); // zaliczka dla strony wypadu
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
    if (!title.trim() || !startsAt || busy) return;
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

    if (startsAt) {
      await supabase.from('slots').insert({
        event_id: data.id,
        starts_at: new Date(startsAt).toISOString(),
        created_by: displayName,
        created_by_user_id: userId,
      });
    }

    navigate(`/event/${data.id}`, 'forward');
  }

  const { open, upcoming, past } = useMemo(() => {
    const now = Date.now();
    const open: EventRow[] = [];
    const upcoming: EventRow[] = [];
    const past: EventRow[] = [];

    const slotsByEvent = new Map<string, Slot[]>();
    for (const s of slots) {
      const arr = slotsByEvent.get(s.event_id) ?? [];
      arr.push(s);
      slotsByEvent.set(s.event_id, arr);
    }
    const votesByEvent = new Map<string, Vote[]>();
    for (const v of votes) {
      const arr = votesByEvent.get(v.event_id) ?? [];
      arr.push(v);
      votesByEvent.set(v.event_id, arr);
    }

    const confirmedDateMap = new Map<string, string>();

    for (const ev of events) {
      const evSlots = slotsByEvent.get(ev.id) ?? [];
      const evVotes = votesByEvent.get(ev.id) ?? [];
      const { confirmedAt } = getConfirmedSlot(evSlots, evVotes);

      if (!confirmedAt) {
        open.push(ev);
      } else {
        confirmedDateMap.set(ev.id, confirmedAt);
        if (new Date(confirmedAt).getTime() >= now) {
          upcoming.push(ev);
        } else {
          past.push(ev);
        }
      }
    }

    upcoming.sort((a, b) => {
      const da = new Date(confirmedDateMap.get(a.id)!).getTime();
      const db = new Date(confirmedDateMap.get(b.id)!).getTime();
      return da - db;
    });

    past.sort((a, b) => {
      const da = new Date(confirmedDateMap.get(a.id)!).getTime();
      const db = new Date(confirmedDateMap.get(b.id)!).getTime();
      return db - da;
    });

    return { open, upcoming, past };
  }, [events, slots, votes]);

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
      const evVotes = votesBy.get(ev.id) ?? [];
      for (const v of evVotes) {
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
      const { confirmedAt } = getConfirmedSlot(evSlots, evVotes);
      const dateIso = confirmedAt ?? evSlots[0]?.starts_at ?? null;
      result.set(ev.id, { voters, percent, dateIso });
    }
    return result;
  }, [events, slots, votes, profiles]);

  return (
    <main className="glass-page">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, position: 'relative', zIndex: 2 }}>
        {/* Logo */}
        <div style={{
          width: 38, height: 38, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="5" ry="5" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>

        {/* Nazwa + powitanie */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#ffffff', lineHeight: 1.2 }}>
            Planner
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.3, marginTop: 1 }}>
            Hej, {displayName} 👋
          </div>
        </div>

        <ProfileMenu />
      </header>

      {events.length > 0 && (
        <button className="cta-gradient" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Anuluj' : '+ Nowy wypad'}
        </button>
      )}

      {events.length > 0 && (
        <div className={`form-collapse ${showForm ? 'open' : ''}`}>
          <form className="card" onSubmit={createEvent}>
            <h2>Nowy wypad</h2>
            <div className="field">
              <label htmlFor="title">Nazwa</label>
              <input
                id="title"
                type="text"
                placeholder="np. Piwo w piątek, wyjazd w góry…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                ref={titleInputRef}
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
              <label htmlFor="startsAt">Data i godzina</label>
              <DateTimeInput
                id="startsAt"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>

            {error && <p className="small" style={{ color: 'var(--no)' }}>{error}</p>}
            <button type="submit" disabled={!title.trim() || !startsAt || busy} style={{ width: '100%' }}>
              {busy ? 'Tworzę…' : 'Utwórz wypad'}
            </button>
          </form>
        </div>
      )}

      {loading && <p className="muted mt">Wczytuję…</p>}

      {!loading && events.length === 0 && (
        <div className="empty-state mt" style={{
          padding: showForm ? '20px' : '44px 24px',
          textAlign: showForm ? 'left' : 'center',
          transition: 'padding 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
          overflow: 'hidden',
        }}>
          {/* Sekcja 1: Brak wypadów (Empty State) */}
          <div style={{
            display: 'grid',
            gridTemplateRows: showForm ? '0fr' : '1fr',
            transition: 'grid-template-rows 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
          }}>
            <div style={{ minHeight: 0, overflow: 'hidden' }}>
              {[
                <div key="icon" style={{
                  width: 56, height: 56,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 16,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                  margin: '0 auto 16px',
                  color: '#ffffff'
                }}>
                  <IconCalendar size={26} />
                </div>,
                <h2 key="title" style={{ margin: '0 0 4px', textAlign: 'center' }}>Brak wypadów</h2>,
                <p key="desc" style={{ color: 'var(--muted)', margin: '0 auto 18px', maxWidth: '30ch', textAlign: 'center' }}>
                  Zaproponuj pierwszy termin i wyślij znajomym.
                </p>,
                <button
                  key="cta"
                  onClick={() => setShowForm(true)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.12)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    padding: '12px 24px',
                    borderRadius: '16px',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    margin: '0 auto',
                    display: 'block'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)' }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)' }}
                >
                  + Nowy wypad
                </button>,
              ].map((child, i) => (
                <div
                  key={i}
                  style={{
                    opacity: showForm ? 0 : 1,
                    transition: !showForm
                      ? `opacity 0.4s ease ${0.12 + i * 0.07}s`
                      : 'opacity 0.2s ease',
                  }}
                >
                  {child}
                </div>
              ))}
            </div>
          </div>

          {/* Sekcja 2: Formularz — kaskadowy fade-in od lewej */}
          <div style={{
            display: 'grid',
            gridTemplateRows: showForm ? '1fr' : '0fr',
            transition: 'grid-template-rows 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
          }}>
            <div style={{ minHeight: 0, overflow: 'hidden', padding: '0 4px' }}>
              <form onSubmit={createEvent} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  <h2 key="h" style={{ margin: 0 }}>Nowy wypad</h2>,
                  <div className="field" key="title">
                    <label htmlFor="title">Nazwa</label>
                    <input
                      id="title"
                      type="text"
                      placeholder="np. Piwo w piątek, wyjazd w góry…"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      ref={titleInputRef}
                    />
                  </div>,
                  <div className="field" key="loc">
                    <label htmlFor="location">Miejsce (opcjonalnie)</label>
                    <input
                      id="location"
                      type="text"
                      placeholder="np. u Kuby, Zakopane…"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  </div>,
                  <div className="field" key="date">
                    <label htmlFor="startsAt">Data i godzina</label>
                    <DateTimeInput
                      id="startsAt"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                      required
                    />
                  </div>,
                  error ? <p key="err" className="small" style={{ color: 'var(--no)' }}>{error}</p> : null,
                  <button key="submit" type="submit" disabled={!title.trim() || !startsAt || busy} style={{ width: '100%' }}>
                    {busy ? 'Tworzę…' : 'Utwórz wypad'}
                  </button>,
                  <button
                    key="cancel"
                    type="button"
                    className="ghost"
                    onClick={() => setShowForm(false)}
                    style={{ width: '100%', marginTop: -4 }}
                  >
                    Anuluj
                  </button>,
                ].filter(Boolean).map((child, i) => (
                  <div
                    key={i}
                    style={{
                      opacity: showForm ? 1 : 0,
                      transition: showForm
                        ? `opacity 0.4s ease ${0.12 + i * 0.07}s`
                        : 'opacity 0.15s ease',
                    }}
                  >
                    {child}
                  </div>
                ))}
              </form>
            </div>
          </div>
        </div>
      )}

      <Section title="W trakcie" events={open} agg={aggByEvent} variant="open" />
      <Section title="Nadchodzące" events={upcoming} agg={aggByEvent} variant="upcoming" />
      <Section title="Minione" events={past} agg={aggByEvent} variant="past" muted />

      {!loading && events.length > 0 && (
        <div className="tip-banner">
          <IconBulb size={20} className="tip-icon" />
          <span>Im więcej osób da znać, tym łatwiej trafić w dobry termin.</span>
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
  const navigate = useTransitionNavigate();
  const href = `/event/${ev.id}`;
  return (
    <Link
      href={href}
      className="event-rich"
      onClick={(e) => {
        // Pozwól na otwieranie w nowej karcie (Cmd/Ctrl/środkowy przycisk); inaczej animowany slide.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href, 'forward');
      }}
    >
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
          <span className="small muted">Jeszcze nikt nie dał znać</span>
        )}

        {variant === 'open' ? (
          <div className="progress-inline-wrap">
            <div className="progress">
              <div
                className="progress-bar"
                style={{ width: `${agg.percent}%` }}
              />
            </div>
            <span className="progress-label">
              {agg.percent}% <span className="label-sub">dało znać</span>
            </span>
          </div>
        ) : (
          <>
            <span className="spacer" />
            {variant === 'past' && <span className="badge">✓ Zakończony</span>}
            {variant === 'upcoming' && <span className="badge">Jest termin</span>}
          </>
        )}
      </div>
    </Link>
  );
}
