'use client';

import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth, signOut } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { AVATARS, uploadAvatarImage } from '@/lib/avatars';

// Avatar bieżącego użytkownika w rogu; klik → menu: zmień zdjęcie / wybierz emoji / wyloguj.
export default function ProfileMenu() {
  const { userId, displayName, avatar } = useAuth();
  const [open, setOpen] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function close() {
    setOpen(false);
    setShowEmoji(false);
    setError('');
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const url = await uploadAvatarImage(userId, file);
      await supabase.auth.updateUser({ data: { avatar: url } });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wgrać zdjęcia.');
    } finally {
      setBusy(false);
    }
  }

  async function pickEmoji(emoji: string) {
    setBusy(true);
    setError('');
    await supabase.auth.updateUser({ data: { avatar: emoji } });
    setBusy(false);
    close();
  }

  return (
    <div className="profile-menu">
      <button className="profile-trigger" onClick={() => setOpen((v) => !v)} aria-label="Profil">
        <Avatar name={displayName} avatar={avatar} size={38} />
      </button>

      {open && (
        <>
          <div className="menu-backdrop" onClick={close} />
          <div className="menu-sheet">
            {!showEmoji ? (
              <>
                <button className="menu-item" disabled={busy} onClick={() => fileRef.current?.click()}>
                  {busy ? 'Wgrywam…' : '📷 Zmień zdjęcie'}
                </button>
                <button className="menu-item" disabled={busy} onClick={() => setShowEmoji(true)}>
                  😀 Wybierz emoji
                </button>
                <button className="menu-item danger" onClick={() => signOut()}>
                  Wyloguj
                </button>
              </>
            ) : (
              <div className="avatar-picker">
                {AVATARS.map((a) => (
                  <button
                    type="button"
                    key={a}
                    className={`avatar-option${avatar === a ? ' selected' : ''}`}
                    disabled={busy}
                    onClick={() => pickEmoji(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
            {error && <p className="small" style={{ color: 'var(--no)', margin: '6px 4px 0' }}>{error}</p>}
          </div>
        </>
      )}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
    </div>
  );
}
