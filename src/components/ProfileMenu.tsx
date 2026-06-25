'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth, signOut } from '@/lib/auth';
import { useBackground } from '@/lib/background';
import { Avatar } from '@/components/Avatar';
import { AVATARS, uploadAvatarImage } from '@/lib/avatars';
import {
  isPushSupported,
  isStandalone,
  getPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push';

// Avatar bieżącego użytkownika w rogu; klik → wyśrodkowany modal: zdjęcie/emoji, nick, wyloguj.
export default function ProfileMenu() {
  const { userId, displayName, avatar } = useAuth();
  const { enabled: bgEnabled, toggle: toggleBg } = useBackground();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savedName, setSavedName] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Powiadomienia push (o nowych wypadach).
  const [pushSupported, setPushSupported] = useState(false);
  const [pushStandalone, setPushStandalone] = useState(true);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  // Po otwarciu modala zsynchronizuj pole nicku z aktualną nazwą.
  useEffect(() => {
    if (open) {
      setName(displayName);
      setSavedName(false);
      setError('');
      setPushSupported(isPushSupported());
      setPushStandalone(isStandalone());
      getPushSubscribed().then(setPushOn);
    }
  }, [open, displayName]);

  async function togglePush() {
    if (pushBusy) return;
    setPushBusy(true);
    setError('');
    try {
      if (pushOn) {
        await unsubscribeFromPush();
        setPushOn(false);
      } else {
        await subscribeToPush(userId);
        setPushOn(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zmienić powiadomień.');
    } finally {
      setPushBusy(false);
    }
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
  }

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === displayName || savingName) return;
    setSavingName(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
    setSavingName(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSavedName(true);
  }

  return (
    <div className="profile-menu">
      <button className="profile-trigger" onClick={() => setOpen(true)} aria-label="Profil">
        <Avatar name={displayName} avatar={avatar} size={38} />
      </button>

      {open && (
        <div className="profile-overlay" onClick={() => setOpen(false)}>
          <div className="profile-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setOpen(false)} aria-label="Zamknij">✕</button>

            <div className="avatar-xl-wrap">
              <Avatar name={displayName} avatar={avatar} size={104} />
              <button
                className="avatar-camera"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                aria-label="Zmień zdjęcie"
              >
                {busy ? '…' : '📷'}
              </button>
            </div>

            <div className="profile-emoji-row">
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

            <div className="setting-row">
              <div className="setting-text">
                <span className="setting-title">Animowane tło</span>
                <span className="setting-sub">Wyłącz dla lepszej płynności</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={bgEnabled}
                aria-label="Animowane tło"
                className={`switch${bgEnabled ? ' on' : ''}`}
                onClick={toggleBg}
              >
                <span className="switch-knob" />
              </button>
            </div>

            {pushSupported ? (
              <div className="setting-row">
                <div className="setting-text">
                  <span className="setting-title">Powiadomienia</span>
                  <span className="setting-sub">Gdy ktoś doda nowy wypad</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={pushOn}
                  aria-label="Powiadomienia"
                  disabled={pushBusy}
                  className={`switch${pushOn ? ' on' : ''}`}
                  onClick={togglePush}
                >
                  <span className="switch-knob" />
                </button>
              </div>
            ) : (
              !pushStandalone && (
                <div className="setting-row">
                  <div className="setting-text">
                    <span className="setting-title">Powiadomienia</span>
                    <span className="setting-sub">
                      Dodaj apkę do ekranu głównego, żeby je włączyć
                    </span>
                  </div>
                </div>
              )
            )}

            <div className="field" style={{ marginBottom: 12 }}>
              <label htmlFor="nick">Nick</label>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  id="nick"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSavedName(false);
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  className="ghost"
                  disabled={savingName || !name.trim() || name.trim() === displayName}
                  onClick={saveName}
                >
                  {savingName ? 'Zapisuję…' : savedName ? 'Zapisano ✓' : 'Zapisz'}
                </button>
              </div>
            </div>

            {error && <p className="small" style={{ color: 'var(--no)', margin: '0 0 12px' }}>{error}</p>}

            <button className="ghost danger" style={{ width: '100%' }} onClick={() => signOut()}>
              Wyloguj
            </button>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
    </div>
  );
}
