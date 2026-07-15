'use client';

import { useState } from 'react';

// Mały bottom sheet nad pełnoekranowym kreatorem (wzorzec „sheet na sheecie",
// z-index w globals.css). Edytuje stan rodzica NA ŻYWO — nie ma kopii draftu,
// więc ✓ tylko zamyka, a zamknięcie nigdy nie gubi wpisanego. Walidacja żyje
// na „Odpal lobby". Zamykanie animacją jak dashboardowy sheet: klasa .closing,
// unmount po animationend SAMEGO overlaya (eventy dzieci bąbelkują).
export default function ChildSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const close = () => setClosing(true);

  return (
    <div
      className={`sheet-overlay child${closing ? ' closing' : ''}`}
      onClick={close}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="child-head">
          <div className="modal-label">{title}</div>
          <button type="button" className="child-ok" onClick={close} aria-label="Gotowe">✓</button>
        </div>
        {children}
      </div>
    </div>
  );
}
