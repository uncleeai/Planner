'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import SetupBanner from '@/components/SetupBanner';

type AuthCtx = { userId: string; displayName: string };

const Ctx = createContext<AuthCtx | null>(null);

// Dostępne tylko wewnątrz dzieci AuthProvider — czyli gdy użytkownik jest
// zalogowany i ma ustawioną nazwę. Dzięki temu strony nie muszą sprawdzać sesji.
export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth musi być użyte wewnątrz AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <main>
        <h1>Planner</h1>
        <SetupBanner />
      </main>
    );
  }

  if (!ready) return <main><p className="muted">Wczytuję…</p></main>;

  if (!session) return <LoginForm />;

  const displayName =
    (session.user.user_metadata?.display_name as string | undefined)?.trim() ?? '';
  if (!displayName) return <NameForm />;

  return <Ctx.Provider value={{ userId: session.user.id, displayName }}>{children}</Ctx.Provider>;
}

export async function signOut() {
  await supabase.auth.signOut();
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Gdy link logowania wygaśnie/jest nieprawidłowy, Supabase wraca na adres
  // z `#error=...`. Pokaż czytelny komunikat zamiast cichego formularza.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.hash.includes('error')) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.get('error_code') === 'otp_expired') {
      setNotice('Link wygasł lub został już użyty — wyślij nowy poniżej.');
    } else {
      const desc = params.get('error_description');
      setNotice(desc ? decodeURIComponent(desc.replace(/\+/g, ' ')) : 'Logowanie się nie powiodło — spróbuj ponownie.');
    }
    history.replaceState(null, '', window.location.pathname);
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    setSent(true);
    setBusy(false);
  }

  return (
    <main>
      <h1>Planner</h1>
      <p className="lead">Zaloguj się, żeby głosy i ustalenia były naprawdę Twoje.</p>

      {notice && <div className="banner">{notice}</div>}

      {!sent ? (
        <form className="card" onSubmit={sendLink}>
          <h2>Logowanie</h2>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="ty@example.com"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="small" style={{ color: 'var(--no)' }}>{error}</p>}
          <button type="submit" disabled={!email.trim() || busy}>
            {busy ? 'Wysyłam…' : 'Wyślij link'}
          </button>
          <p className="small muted mt">
            Dostaniesz maila z linkiem. Otwórz go na tym samym urządzeniu — wrócisz tu
            zalogowany i zostaniesz zalogowany na stałe.
          </p>
        </form>
      ) : (
        <div className="card">
          <h2>Sprawdź maila</h2>
          <p className="small muted">
            Wysłaliśmy link logowania na <strong>{email}</strong>. Otwórz wiadomość i kliknij
            „Sign in" — wrócisz tutaj zalogowany. (Otwórz na tym samym urządzeniu.)
          </p>
          <button
            type="button"
            className="ghost mt"
            onClick={() => { setSent(false); setError(''); }}
          >
            Zmień e-mail / wyślij ponownie
          </button>
        </div>
      )}
    </main>
  );
}

function NameForm() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ data: { display_name: name.trim() } });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    // updateUser wywoła onAuthStateChange (USER_UPDATED) → AuthProvider pokaże apkę.
  }

  return (
    <main>
      <h1>Planner</h1>
      <form className="card" onSubmit={save}>
        <h2>Jak masz na imię?</h2>
        <p className="small muted">Tę nazwę zobaczą inni przy Twoich głosach.</p>
        <div className="field">
          <input
            type="text"
            placeholder="np. Kuba"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="small" style={{ color: 'var(--no)' }}>{error}</p>}
        <button type="submit" disabled={!name.trim() || busy}>
          {busy ? 'Zapisuję…' : 'Gotowe'}
        </button>
      </form>
    </main>
  );
}
