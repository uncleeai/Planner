'use client';

import { useRef, useState } from 'react';
import { uploadEventImage } from '@/lib/eventImage';
import { IconCamera, IconX } from '@/components/icons';

const DEFAULT_FOCUS = '50% 30%';

// Rozkłada „50% 30%" na liczby; przy brakach → środek/góra.
function parseFocus(f: string | null): { x: number; y: number } {
  const [x, y] = (f ?? DEFAULT_FOCUS).split(' ').map((p) => parseInt(p, 10));
  return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 30 };
}

// Pole „Zdjęcie" w formularzu wypadu. Wybór pliku → od razu wgrywa do bucketu
// event-images i zwraca publiczny URL. Suwaki „kadr" ustawiają object-position
// (którą część fotki widać w karcie hero) — zapisywane w image_focus.
export default function EventPhotoInput({
  userId,
  value,
  onChange,
  focus,
  onFocusChange,
}: {
  userId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  focus: string | null;
  onFocusChange: (focus: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { x, y } = parseFocus(focus);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange(await uploadEventImage(userId, file));
      onFocusChange(DEFAULT_FOCUS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się wgrać zdjęcia.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <label>Zdjęcie (opcjonalnie)</label>
      {value ? (
        <>
          <div className="event-photo-preview">
            <img src={value} alt="" style={{ objectPosition: `${x}% ${y}%` }} />
            <button
              type="button"
              className="event-photo-remove"
              onClick={() => onChange(null)}
              aria-label="Usuń zdjęcie"
            >
              <IconX size={14} />
            </button>
            <button
              type="button"
              className="event-photo-change"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? 'Wgrywam…' : 'Zmień'}
            </button>
          </div>
          <div className="event-photo-focus">
            <span className="small muted">Kadr — co widać w karcie:</span>
            <label className="epf-row">
              <span>W poziomie</span>
              <input
                type="range" min="0" max="100" value={x}
                onChange={(e) => onFocusChange(`${e.target.value}% ${y}%`)}
              />
            </label>
            <label className="epf-row">
              <span>W pionie</span>
              <input
                type="range" min="0" max="100" value={y}
                onChange={(e) => onFocusChange(`${x}% ${e.target.value}%`)}
              />
            </label>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="event-photo-add"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <IconCamera size={18} />
          {busy ? 'Wgrywam…' : 'Dodaj zdjęcie'}
        </button>
      )}
      {error && <p className="small" style={{ color: 'var(--no)', margin: '6px 0 0' }}>{error}</p>}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
    </div>
  );
}
