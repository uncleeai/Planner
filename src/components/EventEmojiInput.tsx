'use client';

import { EVENT_ICONS } from '@/lib/eventIcons';

// Wybór ikony wypadu (monochromatyczna ikona liniowa). Opcjonalne; ponowne kliknięcie odznacza.
// value/onChange operują na id ikony (np. "beer"); zob. src/lib/eventIcons.tsx.
export default function EventEmojiInput({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
}) {
  return (
    <div className="field">
      <label>Ikona (opcjonalnie)</label>
      <div className="icon-grid">
        {EVENT_ICONS.map(({ id, Icon }) => (
          <button
            type="button"
            key={id}
            className={`icon-chip${value === id ? ' selected' : ''}`}
            onClick={() => onChange(value === id ? null : id)}
            aria-pressed={value === id}
            aria-label={id}
          >
            <Icon size={22} />
          </button>
        ))}
      </div>
    </div>
  );
}
