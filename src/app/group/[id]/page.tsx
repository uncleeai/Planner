'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { rememberGroup } from '@/lib/membership';
import type { EventRow, Group } from '@/lib/types';
import SetupBanner from '@/components/SetupBanner';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = use(params);
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const [{ data: gr, error: grErr }, { data: ev }] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).maybeSingle(),
      supabase.from('events').select('*').eq('group_id', groupId).order('created_at', { ascending: false }),
    ]);

    if (grErr || !gr) {
      setNotFound(true);
    } else {
      setGroup(gr as Group);
      setEvents((ev ?? []) as EventRow[]);
      rememberGroup(gr.id, gr.name);
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    load();

    const channel = supabase
      .channel(`group-${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `group_id=eq.${groupId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, load]);

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError('');

    const { data, error } = await supabase
      .from('events')
      .insert({ group_id: groupId, title: title.trim(), location: location.trim() || null })
      .select('id')
      .single();

    if (error || !data) {
      setError(error?.message ?? 'Nie udało się utworzyć wypadu.');
      setBusy(false);
      return;
    }
    router.push(`/event/${data.id}`);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* schowek niedostępny — można skopiować URL ręcznie */
    }
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
        <p className="lead">Ta ekipa nie istnieje albo link jest nieprawidłowy.</p>
        <Link href="/"><button className="ghost">Wróć</button></Link>
      </main>
    );
  }

  return (
    <main>
      <p><Link href="/">← Twoje ekipy</Link></p>
      <h1>{group?.name}</h1>

      <div className="row mt">
        <button className="ghost" onClick={copyLink}>
          {copied ? 'Skopiowano ✓' : 'Skopiuj link ekipy'}
        </button>
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
          {error && <p className="small" style={{ color: 'var(--no)' }}>{error}</p>}
          <button type="submit" disabled={!title.trim() || busy}>
            {busy ? 'Tworzę…' : 'Utwórz wypad'}
          </button>
        </form>
      )}

      {events.length === 0 && (
        <p className="muted mt">
          Brak wypadów. Kliknij „+ Nowy wypad", żeby zaproponować pierwszy.
        </p>
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
