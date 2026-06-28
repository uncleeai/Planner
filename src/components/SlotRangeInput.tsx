'use client';

import { useState } from 'react';
import type { SlotRange } from '@/lib/slotInput';
import { todayDate } from '@/lib/slotInput';
import DateTimeInput from '@/components/DateTimeInput';

// „Teraz" w formacie input[type=datetime-local] ("YYYY-MM-DDTHH:mm", czas lokalny).
function nowDateTimeLocal(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

// Input terminu. Domyślnie: jedna data + godzina spotkania (konkretny moment).
// Po włączeniu „Dłuższy wypad" → Od / Do (+ opcjonalnie godzina) na kilka dni.
export default function SlotRangeInput({
  value,
  onChange,
  idPrefix = 'slot',
}: {
  value: SlotRange;
  onChange: (v: SlotRange) => void;
  idPrefix?: string;
}) {
  const [longer, setLonger] = useState(!!value.doDate);
  const min = todayDate();

  return (
    <div className="slot-range">
      <label className="toggle-row">
        <span className="toggle-label">Dłuższy wypad</span>
        <input
          type="checkbox"
          className="toggle-input"
          checked={longer}
          onChange={(e) => {
            const on = e.target.checked;
            setLonger(on);
            // Wracając do pojedynczego terminu — wyczyść „Do".
            if (!on) onChange({ ...value, doDate: '' });
          }}
        />
        <span className="toggle-track" aria-hidden="true"><span className="toggle-knob" /></span>
      </label>

      {!longer ? (
        <DateTimeInput
          value={value.od ? `${value.od}T${value.time || '00:00'}` : ''}
          placeholder="Wybierz datę i godzinę"
          min={nowDateTimeLocal()}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) {
              onChange({ od: '', doDate: '', time: '' });
              return;
            }
            const [d, t] = v.split('T');
            onChange({ od: d, doDate: '', time: t ?? '' });
          }}
        />
      ) : (
        <div className="slot-range-grid">
          <span className={`dt-field${value.od ? '' : ' dt-empty'}`}>
            <input
              id={`${idPrefix}-od`}
              type="date"
              value={value.od}
              min={min}
              onChange={(e) =>
                onChange({
                  ...value,
                  od: e.target.value,
                  doDate: value.doDate && value.doDate < e.target.value ? '' : value.doDate,
                })
              }
            />
            {!value.od && <span className="dt-placeholder">Od</span>}
          </span>
          <span className={`dt-field${value.doDate ? '' : ' dt-empty'}`}>
            <input
              id={`${idPrefix}-do`}
              type="date"
              value={value.doDate}
              min={value.od || min}
              onChange={(e) => onChange({ ...value, doDate: e.target.value })}
            />
            {!value.doDate && <span className="dt-placeholder">Do</span>}
          </span>
          <span className={`dt-field${value.time ? '' : ' dt-empty'}`}>
            <input
              id={`${idPrefix}-time`}
              type="time"
              value={value.time}
              onChange={(e) => onChange({ ...value, time: e.target.value })}
            />
            {!value.time && <span className="dt-placeholder">Godzina (opcjonalnie)</span>}
          </span>
        </div>
      )}
    </div>
  );
}
