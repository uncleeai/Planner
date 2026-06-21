'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth, signOut } from '@/lib/auth';
import type { EventRow } from '@/lib/types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Home() {
  const router = useRouter();
  const { userId, displayName } = useAuth();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [proposedSlots, setProposedSlots] = useState<string[]>(['']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });
    setEvents((data ?? []) as EventRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('events-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => load())
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

    // Wstaw zaproponowane terminy (jeśli podano) jednym zapytaniem.
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
      if (!ev.confirmed_at) {
        open.push(ev);
      } else if (new Date(ev.confirmed_at).getTime() >= now) {
        upcoming.push(ev);
      } else {
        past.push(ev);
      }
    }
    upcoming.sort((a, b) => new Date(a.confirmed_at!).getTime() - new Date(b.confirmed_at!).getTime());
    past.sort((a, b) => new Date(b.confirmed_at!).getTime() - new Date(a.confirmed_at!).getTime());
    return { open, upcoming, past };
  }, [events]);

  return (
    <main>
      <div className="row">
        <h1 style={{ marginBottom: 0 }}>Planner</h1>
        <span className="spacer" />
        <span className="small muted">Cześć, {displayName}</span>
      </div>
      <p className="lead">Wasze wypady w jednym miejscu — proponujcie terminy i ustalajcie kiedy.</p>

      <div className="row mt">
        <button className="ghost" onClick={() => signOut()}>Wyloguj</button>
        <span className="spacer" />
        <button onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Anuluj' : '+ Nowy wypad'}
        </button>
      </div>

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

      {!loading && events.length === 0 && (
        <p className="muted mt">Brak wypadów. Kliknij „+ Nowy wypad", żeby zaproponować pierwszy.</p>
      )}

      <Timeline title="Do ustalenia" events={open} />
      <Timeline title="Nadchodzące" events={upcoming} />
      <Timeline title="Minione" events={past} muted />
    </main>
  );
}

function Timeline({ title, events, muted }: { title: string; events: EventRow[]; muted?: boolean }) {
  if (events.length === 0) return null;
  return (
    <section className="mt">
      <h2 className={muted ? 'muted' : ''}>{title}</h2>
      {events.map((ev) => (
        <Link key={ev.id} href={`/event/${ev.id}`} className="event-card">
          <div>
            <div className="event-card-title">{ev.title}</div>
            {ev.location && <div className="small muted">📍 {ev.location}</div>}
          </div>
          <div className="event-card-status">
            {ev.confirmed_at ? (
              <span className="badge">{formatDate(ev.confirmed_at)}</span>
            ) : (
              <span className="badge badge-open">Zbieramy terminy</span>
            )}
          </div>
        </Link>
      ))}
    </section>
  );
}
