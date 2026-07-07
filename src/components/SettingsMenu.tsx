'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/auth';
import { ACCENTS, getAccent, setAccent } from '@/lib/accent';
import { inviteMember } from '@/lib/invite';
import HeroCropEditor from '@/components/HeroCropEditor';
import { IconGear, IconX } from '@/components/icons';
import {
  isPushSupported,
  isStandalone,
  getPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push';

// Osobny przycisk (koło zębate) obok avatara → modal z ustawieniami (powiadomienia).
export default function SettingsMenu() {
  const { userId, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [accent, setAccentState] = useState<string>(ACCENTS[0].color);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushStandalone, setPushStandalone] = useState(true);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  // Admin: dodawanie nowej osoby do paczki.
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteOk, setInviteOk] = useState(false);
  const [showCrop, setShowCrop] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setAccentState(getAccent());
    setPushSupported(isPushSupported());
    setPushStandalone(isStandalone());
    getPushSubscribed().then(setPushOn);
    setInviteEmail('');
    setInviteMsg('');
  }, [open]);

  async function invite() {
    const target = inviteEmail.trim();
    if (!target || inviting) return;
    setInviting(true);
    setInviteMsg('');
    const err = await inviteMember(target);
    if (err) {
      setInviteOk(false);
      setInviteMsg(err);
    } else {
      setInviteOk(true);
      setInviteMsg(`Dodano ${target}. Może się już logować w apce.`);
      setInviteEmail('');
    }
    setInviting(false);
  }

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

  return (
    <div className="profile-menu">
      <button className="settings-trigger" onClick={() => setOpen(true)} aria-label="Ustawienia">
        <IconGear size={20} />
      </button>

      {open && createPortal(
        <div className="profile-overlay" onClick={() => setOpen(false)}>
          <div className="profile-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setOpen(false)} aria-label="Zamknij">
              <IconX size={14} />
            </button>

            <div className="modal-label">Ustawienia</div>

            <div className="setting-text" style={{ textAlign: 'left' }}>
              <span className="setting-title">Kolor akcentu</span>
            </div>
            <div className="accent-row">
              {ACCENTS.map((a) => (
                <button
                  key={a.color}
                  type="button"
                  className={`accent-swatch${accent === a.color ? ' selected' : ''}`}
                  style={{ background: a.color }}
                  aria-label={a.label}
                  aria-pressed={accent === a.color}
                  onClick={() => {
                    setAccent(a.color);
                    setAccentState(a.color);
                  }}
                />
              ))}
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

            {isAdmin && (
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="invite">Dodaj osobę do paczki</label>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input
                    id="invite"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    placeholder="nowy@example.com"
                    value={inviteEmail}
                    onChange={(e) => {
                      setInviteEmail(e.target.value);
                      setInviteMsg('');
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="ghost"
                    disabled={inviting || !inviteEmail.trim()}
                    onClick={invite}
                  >
                    {inviting ? 'Dodaję…' : 'Dodaj'}
                  </button>
                </div>
                {inviteMsg && (
                  <p
                    className="small"
                    style={{ color: inviteOk ? 'var(--yes)' : 'var(--no)', margin: '6px 0 0' }}
                  >
                    {inviteMsg}
                  </p>
                )}
                <button
                  type="button"
                  className="ghost"
                  style={{ width: '100%', marginTop: 10 }}
                  onClick={() => setShowCrop(true)}
                >
                  Kadrowanie zdjęć
                </button>
              </div>
            )}

            {error && <p className="small" style={{ color: 'var(--no)', margin: '4px 0 0' }}>{error}</p>}
          </div>
        </div>,
        document.body,
      )}

      {showCrop && <HeroCropEditor onClose={() => setShowCrop(false)} />}
    </div>
  );
}
