'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import SetupBanner from '@/components/SetupBanner';

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError('');

    const { data, error } = await supabase
      .from('events')
      .insert({ title: title.trim(), location: location.trim() || null })
      .select('id')
      .single();

    if (error || !data) {
      setError(error?.message ?? 'Nie udało się utworzyć wydarzenia.');
      setBusy(false);
      return;
    }
    router.push(`/event/${data.id}`);
  }

  return (
    <main>
      <h1>Planner</h1>
      <p className="lead">
        Zaproponuj terminy wypadu, wyślij link znajomym i zobacz na żywo, kiedy
        najwięcej osób może. Bez zakładania konta.
      </p>

      {!isSupabaseConfigured && <SetupBanner />}

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
          {busy ? 'Tworzę…' : 'Utwórz i dostań link'}
        </button>
      </form>

      <p className="small muted center">
        Wskazówka: po utworzeniu skopiuj link i wrzuć go na grupę — każdy otworzy
        go w telefonie, a stronę można dodać do ekranu głównego.
      </p>
    </main>
  );
}
