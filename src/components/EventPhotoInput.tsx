'use client';

import { useRef, useState } from 'react';
import { uploadEventImage } from '@/lib/eventImage';
import { IconCamera, IconX } from '@/components/icons';

// Pole „Zdjęcie" w formularzu wypadu. Wybór pliku → od razu wgrywa do bucketu
// event-images i zwraca publiczny URL do stanu formularza (zapis image_url przy
// tworzeniu/edycji wypadu). Podgląd pokazuje kadr taki jak w karcie hero.
export default function EventPhotoInput({
  userId,
  value,
  onChange,
}: {
  userId: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange(await uploadEventImage(userId, file));
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
        <div className="event-photo-preview">
          <img src={value} alt="" />
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
