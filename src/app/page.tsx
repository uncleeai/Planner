'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { getGroups, rememberGroup, type RememberedGroup } from '@/lib/membership';
import SetupBanner from '@/components/SetupBanner';

export default function Home() {
  const router = useRouter();
  const [groups, setGroups] = useState<RememberedGroup[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setGroups(getGroups());
  }, []);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');

    const { data, error } = await supabase
      .from('groups')
      .insert({ name: name.trim() })
      .select('id, name')
      .single();

    if (error || !data) {
      setError(error?.message ?? 'Nie udało się utworzyć ekipy.');
      setBusy(false);
      return;
    }
    rememberGroup(data.id, data.name);
    router.push(`/group/${data.id}`);
  }

  return (
    <main>
      <h1>Planner</h1>
      <p className="lead">
        Wspólne miejsce dla ekipy: planujcie wypady, zbierajcie terminy i ustalajcie
        kiedy się widzicie. Bez zakładania konta.
      </p>

      {!isSupabaseConfigured && <SetupBanner />}

      {groups.length > 0 && (
        <div className="card">
          <h2>Twoje ekipy</h2>
          {groups.map((g) => (
            <Link key={g.id} href={`/group/${g.id}`} className="list-item">
              <span className="list-item-title">{g.name}</span>
              <span className="muted">→</span>
            </Link>
          ))}
        </div>
      )}

      <form className="card" onSubmit={createGroup}>
        <h2>Nowa ekipa</h2>
        <div className="field">
          <label htmlFor="name">Nazwa ekipy</label>
          <input
            id="name"
            type="text"
            placeholder="np. Ekipa z liceum, Wypady górskie…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="small" style={{ color: 'var(--no)' }}>{error}</p>}
        <button type="submit" disabled={!name.trim() || busy}>
          {busy ? 'Tworzę…' : 'Utwórz ekipę'}
        </button>
      </form>

      <p className="small muted center">
        Masz link do ekipy od znajomych? Otwórz go — ekipa sama zapisze się tutaj.
      </p>
    </main>
  );
}
