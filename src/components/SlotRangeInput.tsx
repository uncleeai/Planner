'use client';

import type { SlotRange } from '@/lib/slotInput';
import { todayDate } from '@/lib/slotInput';

// Wspólny input terminu: Od (data) / Do (data, opcj.) / Godzina (opcj.).
// Bez godziny = cały dzień; z „Do" = kilka dni.
export default function SlotRangeInput({
  value,
  onChange,
  idPrefix = 'slot',
}: {
  value: SlotRange;
  onChange: (v: SlotRange) => void;
  idPrefix?: string;
}) {
  const min = todayDate();
  return (
    <div className="slot-range">
      <div className="slot-range-grid">
        <div className="field">
          <label htmlFor={`${idPrefix}-od`}>Od</label>
          <input
            id={`${idPrefix}-od`}
            type="date"
            value={value.od}
            min={min}
            onChange={(e) =>
              onChange({
                ...value,
                od: e.target.value,
                // jeśli „Do" jest wcześniejsze niż nowe „Od" — wyczyść je
                doDate: value.doDate && value.doDate < e.target.value ? '' : value.doDate,
              })
            }
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-do`}>Do <span className="opt">(opcj.)</span></label>
          <input
            id={`${idPrefix}-do`}
            type="date"
            value={value.doDate}
            min={value.od || min}
            onChange={(e) => onChange({ ...value, doDate: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-time`}>Godzina <span className="opt">(opcj.)</span></label>
          <input
            id={`${idPrefix}-time`}
            type="time"
            value={value.time}
            onChange={(e) => onChange({ ...value, time: e.target.value })}
          />
        </div>
      </div>
      <p className="slot-range-hint">Bez godziny = cały dzień. Z „Do" = kilka dni (np. wyjazd).</p>
    </div>
  );
}
