'use client';

import { useEffect, useState } from 'react';

// Wewnętrzne potwierdzenia/alerty w skórce Lobby zamiast natywnych window.confirm/alert
// (systemowa ramka gryzła się z UI). Imperatywne API jak natywne — handlery tylko
// dokładają await. Host montowany raz w layoucie; gdyby go nie było, spadamy na natywne.

type Dialog = {
  kind: 'confirm' | 'alert';
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
};

let push: ((d: Dialog) => void) | null = null;

export function appConfirm(
  title: string,
  opts?: { message?: string; confirmLabel?: string; danger?: boolean },
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) return resolve(window.confirm([title, opts?.message].filter(Boolean).join(' ')));
    push({ kind: 'confirm', title, resolve, ...opts });
  });
}

export function appAlert(title: string, message?: string): Promise<void> {
  return new Promise((resolve) => {
    if (!push) {
      window.alert([title, message].filter(Boolean).join(' '));
      return resolve();
    }
    push({ kind: 'alert', title, message, resolve: () => resolve() });
  });
}

export function DialogHost() {
  const [dialog, setDialog] = useState<Dialog | null>(null);

  useEffect(() => {
    push = (d) => setDialog(d);
    return () => { push = null; };
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  if (!dialog) return null;

  function close(ok: boolean) {
    dialog!.resolve(ok);
    setDialog(null);
  }

  return (
    <div className="profile-overlay" onClick={() => close(false)}>
      <div
        className="profile-modal dialog"
        role={dialog.kind === 'alert' ? 'alertdialog' : 'dialog'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-label">{dialog.title}</div>
        {dialog.message && <p className="dialog-msg">{dialog.message}</p>}
        <div className="dialog-actions">
          {dialog.kind === 'confirm' && (
            <button type="button" className="ghost" onClick={() => close(false)}>Anuluj</button>
          )}
          <button
            type="button"
            className={dialog.danger ? 'solid-danger' : 'cta-gradient'}
            onClick={() => close(true)}
            autoFocus
          >
            {dialog.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
