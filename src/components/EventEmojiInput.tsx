'use client';

// Wybór emoji-ikony wypadu (kółko na karcie). Opcjonalne; ponowne kliknięcie odznacza.
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
  return (
    <div className="field">
      <label>Ikona (opcjonalnie)</label>
      <div className="emoji-grid">
        {EVENT_EMOJIS.map((e) => (
          <button
            type="button"
            key={e}
            className={`emoji-chip${value === e ? ' selected' : ''}`}
            onClick={() => onChange(value === e ? null : e)}
            aria-pressed={value === e}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
