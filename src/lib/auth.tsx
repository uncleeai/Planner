'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import SetupBanner from '@/components/SetupBanner';
import { Avatar } from '@/components/Avatar';
import { AVATARS, uploadAvatarImage } from '@/lib/avatars';

type AuthCtx = { userId: string; displayName: string; avatar: string };

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

  // Zapisz profil do listy paczki, gdy znamy konto i nazwę — dzięki temu inni widzą,
  // kto jeszcze nie zagłosował (klient nie ma dostępu do auth.users).
  useEffect(() => {
    if (!session) return;
    const meta = session.user.user_metadata ?? {};
    const name = (meta.display_name as string | undefined)?.trim();
    if (!name) return;
    supabase
      .from('profiles')
      .upsert(
        {
          id: session.user.id,
          display_name: name,
          avatar: (meta.avatar as string | undefined) ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      .then(() => {});
  }, [session]);

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

  const meta = session.user.user_metadata ?? {};
  const displayName = (meta.display_name as string | undefined)?.trim() ?? '';
  const avatar = (meta.avatar as string | undefined) ?? '';
  if (!displayName || !avatar) {
    return <SetupForm userId={session.user.id} initialName={displayName} initialAvatar={avatar} />;
  }

  return (
    <Ctx.Provider value={{ userId: session.user.id, displayName, avatar }}>{children}</Ctx.Provider>
  );
}

export async function signOut() {
  await supabase.auth.signOut();
}

// Szybkie logowanie dla preview/dev — przycisk pojawia się TYLKO, gdy ustawione są
// te zmienne. Ustaw je wyłącznie w środowisku Preview (i lokalnie), NIGDY na produkcji.
const DEV_EMAIL = process.env.NEXT_PUBLIC_DEV_EMAIL;
const DEV_PASSWORD = process.env.NEXT_PUBLIC_DEV_PASSWORD;

function LoginForm() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    setSent(true);
    setBusy(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    // onAuthStateChange ustawi sesję i przełączy widok — w TEJ przeglądarce.
  }

  async function devLogin() {
    if (!DEV_EMAIL || !DEV_PASSWORD || busy) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Planner</h1>
      <p className="lead">Zaloguj się, żeby głosy i ustalenia były naprawdę Twoje.</p>

      {!sent ? (
        <form className="card" onSubmit={sendCode}>
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
            {busy ? 'Wysyłam…' : 'Wyślij kod'}
          </button>
          <p className="small muted mt">
            Dostaniesz na maila 6-cyfrowy kod. Przepisz go tutaj — zalogujesz się
            w tej przeglądarce i zostaniesz zalogowany na stałe.
          </p>
        </form>
      ) : (
        <form className="card" onSubmit={verify}>
          <h2>Wpisz kod</h2>
          <p className="small muted">Wysłaliśmy 6-cyfrowy kod na <strong>{email}</strong>.</p>
          <div className="field">
            <label htmlFor="code">Kod z maila</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="np. 123456"
              value={code}
              onChange={(ev) => setCode(ev.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="small" style={{ color: 'var(--no)' }}>{error}</p>}
          <button type="submit" disabled={!code.trim() || busy}>
            {busy ? 'Sprawdzam…' : 'Zaloguj'}
          </button>
          <button
            type="button"
            className="ghost mt"
            onClick={() => { setSent(false); setCode(''); setError(''); }}
          >
            Zmień e-mail / wyślij ponownie
          </button>
        </form>
      )}

      {DEV_EMAIL && DEV_PASSWORD && (
        <button
          type="button"
          className="ghost mt"
          style={{ width: '100%' }}
          disabled={busy}
          onClick={devLogin}
        >
          ⚡ Szybkie logowanie (dev)
        </button>
      )}
    </main>
  );
}

function SetupForm({
  userId,
  initialName,
  initialAvatar,
}: {
  userId: string;
  initialName: string;
  initialAvatar: string;
}) {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState(initialAvatar || AVATARS[0]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      setAvatar(await uploadAvatarImage(userId, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wgrać zdjęcia.');
    } finally {
      setUploading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !avatar || busy) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.updateUser({
      data: { display_name: name.trim(), avatar },
    });
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
        <h2>Twój profil</h2>
        <p className="small muted">Tę nazwę i awatar zobaczą inni przy Twoich głosach.</p>
        <div className="field">
          <label htmlFor="name">Imię</label>
          <input
            id="name"
            type="text"
            placeholder="np. Kuba"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label>Awatar</label>
          <div className="row" style={{ alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Avatar name={name || 'Ty'} avatar={avatar} size={56} />
            <button type="button" className="ghost chip" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? 'Wgrywam…' : '📷 Wgraj zdjęcie'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
          <div className="avatar-picker">
            {AVATARS.map((a) => (
              <button
                type="button"
                key={a}
                className={`avatar-option${avatar === a ? ' selected' : ''}`}
                onClick={() => setAvatar(a)}
                aria-label={`Awatar ${a}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="small" style={{ color: 'var(--no)' }}>{error}</p>}
        <button type="submit" disabled={!name.trim() || busy}>
          {busy ? 'Zapisuję…' : 'Gotowe'}
        </button>
      </form>
    </main>
  );
}
