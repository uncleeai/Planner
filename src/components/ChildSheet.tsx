'use client';

import { useRef, useState } from 'react';

// Mały bottom sheet nad pełnoekranowym kreatorem (wzorzec „sheet na sheecie",
// z-index w globals.css). Edytuje stan rodzica NA ŻYWO — nie ma kopii draftu,
// więc ✓ tylko zamyka, a zamknięcie nigdy nie gubi wpisanego. Walidacja żyje
// na „Odpal lobby". Zamykanie animacją jak dashowy sheet: klasa .closing, unmount
// po animationend SAMEGO overlaya (eventy dzieci bąbelkują).
//
// Gest: swipe w dół po grip/nagłówku ciągnie sheet za palcem; puszczenie poniżej
// progu zamyka (poza X). Ciągniemy tylko od uchwytu, żeby nie kłócić się ze scrollem
// treści; gdy nie zamykamy — sheet wraca sprężyście na miejsce.
const CLOSE_THRESHOLD = 90;

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
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const close = () => setClosing(true);

  const onTouchStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current === null) return;
    const dy = e.touches[0].clientY - dragStart.current;
    setDragY(dy > 0 ? dy : 0); // tylko w dół
  };
  const onTouchEnd = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (dragY > CLOSE_THRESHOLD) {
      setDragY(0);
      close();
    } else {
      setDragY(0); // wraca sprężyście (transition w CSS gdy nie ciągniemy)
    }
  };

  const dragging = dragStart.current !== null;

  return (
    <div
      className={`sheet-overlay child${closing ? ' closing' : ''}`}
      onClick={close}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`sheet${dragging ? ' dragging' : ''}`}
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div
          className="sheet-drag"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="sheet-grip" aria-hidden="true" />
          <div className="child-head">
            <div className="modal-label">{title}</div>
            <button type="button" className="child-ok" onClick={close} aria-label="Gotowe">✓</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
