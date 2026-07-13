'use client';

import { useEffect, useState } from 'react';

// Jednorazowa notka po redesignie: iOS nie odświeża ikon PWA, więc nowa ikona
// wymaga usunięcia apki z ekranu głównego i dodania jej na nowo — a po ponownym
// dodaniu trzeba jeszcze raz włączyć powiadomienia. Wyświetla się RAZ per
// urządzenie: flaga w localStorage zapisywana przy zamknięciu (dowolną drogą).
// Montowana w layoucie wewnątrz AuthProvider — nie zasłania ekranu logowania.

const KEY = 'planner-redesign-v1';

export default function RedesignNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch { /* brak localStorage */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignorujemy */ }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="profile-overlay" onClick={close}>
      <div className="profile-modal" role="alertdialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-label">Patch notes</div>
        <span className="rn-emoji" aria-hidden="true">✨</span>
        <h3 className="rn-title">Siemano, lekki redesign!</h3>
        <p className="rn-msg">
          Wypad.exe dostał świeży look i nową ikonę. Żeby wszystko wskoczyło jak trzeba:
        </p>
        <ol className="rn-steps">
          <li>
            <span className="rn-num">01</span>
            <span>Usuń apkę z ekranu głównego i dodaj ją na nowo — dopiero wtedy pojawi się nowa ikona.</span>
          </li>
          <li>
            <span className="rn-num">02</span>
            <span>Po dodaniu włącz ponownie powiadomienia w ustawieniach <span aria-hidden="true">⚙️</span>.</span>
          </li>
        </ol>
        <button
          type="button"
          className="cta-gradient"
          style={{ width: '100%' }}
          onClick={close}
          autoFocus
        >
          No dobra 🤝
        </button>
      </div>
    </div>
  );
}
