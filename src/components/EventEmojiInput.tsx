'use client';

import { useState } from 'react';
import { IconChevron } from '@/components/icons';

// Picker emoji-ikony wypadu. Kompaktowy trigger w formularzu → klik otwiera popover z
// siatką (formularz zostaje czysty). Ponowny wybór tego samego / „Wyczyść" → odznacza.
const EVENT_EMOJIS = [
  '🍺', '🎉', '🏕️', '⛰️', '🏊', '🏖️', '🍕', '🍽️', '🎮', '🎬',
  '⚽', '🎸', '🚗', '✈️', '🔥', '🎂', '🎯', '🃏', '🏠', '🌲',
];

export default function EventEmojiInput({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="field">
      <label>Ikona (opcjonalnie)</label>
      <div className="emoji-picker">
        <button
          type="button"
          className="emoji-trigger"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {value ? (
            <span className="emoji-trigger-emoji">{value}</span>
          ) : (
            <span className="emoji-trigger-ph">Wybierz ikonę</span>
          )}
          <IconChevron size={16} className={`emoji-trigger-chev${open ? ' open' : ''}`} />
        </button>

        {open && (
          <>
            <button
              type="button"
              className="emoji-backdrop"
              aria-label="Zamknij"
              onClick={() => setOpen(false)}
            />
            <div className="emoji-popover">
              <div className="emoji-grid">
                {EVENT_EMOJIS.map((e) => (
                  <button
                    type="button"
                    key={e}
                    className={`emoji-chip${value === e ? ' selected' : ''}`}
                    onClick={() => {
                      onChange(value === e ? null : e);
                      setOpen(false);
                    }}
                    aria-pressed={value === e}
                  >
                    {e}
                  </button>
                ))}
              </div>
              {value && (
                <button
                  type="button"
                  className="ghost emoji-clear"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  Wyczyść
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
