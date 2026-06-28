'use client';

import { useEffect, useRef, useState } from 'react';

// Opcjonalny wybór zdjęcia w tle wypadu. Kontrolowany przez rodzica (trzyma File),
// upload dzieje się dopiero przy zapisie wypadu. Pokazuje podgląd + „Usuń".
export default function EventImageInput({
  file,
  onChange,
  id = 'event-image',
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  id?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Podgląd przez obiektowy URL — zwalniany przy zmianie/odmontowaniu (bez wycieku).
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="field">
      <label>Zdjęcie w tle (opcjonalnie)</label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {preview ? (
        <div className="event-image-preview">
          <img src={preview} alt="Podgląd zdjęcia wypadu" />
          <button
            type="button"
            className="ghost danger event-image-remove"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
          >
            Usuń zdjęcie
          </button>
        </div>
      ) : (
        <button type="button" className="ghost chip" onClick={() => inputRef.current?.click()}>
          🖼️ Dodaj zdjęcie
        </button>
      )}
    </div>
  );
}
