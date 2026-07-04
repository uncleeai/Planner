'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth, signOut } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { AVATARS, uploadAvatarImage } from '@/lib/avatars';
import { IconCamera, IconX } from '@/components/icons';

// Avatar bieżącego użytkownika w rogu; klik → wyśrodkowany modal: zdjęcie/emoji, nick, wyloguj.
export default function ProfileMenu() {
  const { userId, displayName, avatar } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savedName, setSavedName] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [localAvatar, setLocalAvatar] = useState(avatar);

  // Po otwarciu modala zsynchronizuj pole nicku i awatara z aktualnymi danymi.
  useEffect(() => {
    if (open) {
      setName(displayName);
      setLocalAvatar(avatar);
      setSavedName(false);
      setError('');
    }
  }, [open, displayName, avatar]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const url = await uploadAvatarImage(userId, file);
      setLocalAvatar(url);
      await supabase.auth.updateUser({ data: { avatar: url } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wgrać zdjęcia.');
    } finally {
      setBusy(false);
    }
  }

  function pickEmoji(emoji: string) {
    setLocalAvatar(emoji);
    setSavedName(false);
    setError('');
  }

  async function saveProfile() {
    const trimmed = name.trim();
    if (!trimmed || savingName) return;
    
    const nameChanged = trimmed !== displayName;
    const avatarChanged = localAvatar !== avatar;
    if (!nameChanged && !avatarChanged) return;

    setSavingName(true);
    setError('');

    const updateData: Record<string, any> = {};
    if (nameChanged) updateData.display_name = trimmed;
    if (avatarChanged) updateData.avatar = localAvatar;

    try {
      const { error } = await supabase.auth.updateUser({ data: updateData });
      if (error) {
        setError(error.message);
        setLocalAvatar(avatar);
        return;
      }
      setSavedName(true);
    } catch (err) {
      setError('Nie udało się zapisać zmian profilu.');
      setLocalAvatar(avatar);
    } finally {
      setSavingName(false);
    }
  }

  const hasChanges = (name.trim() !== displayName && name.trim() !== '') || localAvatar !== avatar;

  return (
    <div className="profile-menu">
      <button className="profile-trigger" onClick={() => setOpen(true)} aria-label="Profil">
        <Avatar name={displayName} avatar={avatar} size={38} />
      </button>

      {open && createPortal(
        <div className="profile-overlay" onClick={() => setOpen(false)}>
          <div className="profile-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setOpen(false)} aria-label="Zamknij">
              <IconX size={14} />
            </button>

            <div className="modal-label">Profil</div>

            <div className="avatar-xl-wrap">
              <Avatar name={displayName} avatar={localAvatar} size={104} />
              <button
                className="avatar-camera"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                aria-label="Zmień zdjęcie"
              >
                {busy ? '…' : <IconCamera size={16} />}
              </button>
            </div>

            <div className="profile-emoji-row">
              {AVATARS.map((a) => (
                <button
                  type="button"
                  key={a}
                  className={`avatar-option${localAvatar === a ? ' selected' : ''}`}
                  disabled={busy}
                  onClick={() => pickEmoji(a)}
                >
                  {a}
                </button>
              ))}
            </div>

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
                  disabled={savingName || !name.trim() || !hasChanges}
                  onClick={saveProfile}
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
        </div>,
        document.body,
      )}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
    </div>
  );
}
