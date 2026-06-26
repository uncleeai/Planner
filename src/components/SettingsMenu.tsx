'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useBackground } from '@/lib/background';
import { IconGear } from '@/components/icons';
import {
  isPushSupported,
  isStandalone,
  getPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push';

// Osobny przycisk (koło zębate) obok avatara → modal z ustawieniami: tło + powiadomienia.
export default function SettingsMenu() {
  const { userId } = useAuth();
  const { enabled: bgEnabled, toggle: toggleBg } = useBackground();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const [pushSupported, setPushSupported] = useState(false);
  const [pushStandalone, setPushStandalone] = useState(true);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setPushSupported(isPushSupported());
    setPushStandalone(isStandalone());
    getPushSubscribed().then(setPushOn);
  }, [open]);

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

      {open && (
        <div className="profile-overlay" onClick={() => setOpen(false)}>
          <div className="profile-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setOpen(false)} aria-label="Zamknij">✕</button>

            <h2 style={{ margin: '4px 0 18px' }}>Ustawienia</h2>

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

            {error && <p className="small" style={{ color: 'var(--no)', margin: '4px 0 0' }}>{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
