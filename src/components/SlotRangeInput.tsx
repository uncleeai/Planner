'use client';

import { useState } from 'react';
import type { SlotRange } from '@/lib/slotInput';
import { todayDate } from '@/lib/slotInput';

// Input terminu (wspólny: kreator lobby + strona wypadu). Układ jak „Date and Time"
// z Apple Invites: grupa wierszy etykieta-po-lewej / wartość-po-prawej.
//  - switch „Cały dzień" (jawny; model danych bez zmian: time === '' ⇔ all_day),
//  - „Start": data + godzina (godzina znika przy całym dniu),
//  - „+ Dodaj datę końca" jako link (progressive disclosure) → wiersz „Koniec".
export default function SlotRangeInput({
  value,
  onChange,
  idPrefix = 'slot',
}: {
  value: SlotRange;
  onChange: (v: SlotRange) => void;
  idPrefix?: string;
}) {
  // Stany UI-lokalne, inicjowane z wartości (edycja slotu prefiluje przez slotToRange).
  // Świeży (pusty) draft startuje z widoczną godziną — typowy wypad ma godzinę
  // zbiórki; pozostawiona pusta i tak daje „cały dzień" (model: time '' = all_day).
  const [allDay, setAllDay] = useState(!!value.od && !value.time);
  const [withEnd, setWithEnd] = useState(!!value.doDate);
  const min = todayDate();

  return (
    <div className="slot-range">
      <div className="slot-rows">
        <label className="slot-row">
          <span className="slot-row-label">Cały dzień</span>
          <input
            type="checkbox"
            className="toggle-input"
            checked={allDay}
            onChange={(e) => {
              const on = e.target.checked;
              setAllDay(on);
              // ON → bez godziny (model: time '' = all_day). OFF → seedujemy 18:00,
              // żeby przełącznik nie kłócił się z derived all_day przy pustym polu.
              onChange({ ...value, time: on ? '' : value.time || '18:00' });
            }}
          />
          <span className="toggle-track" aria-hidden="true"><span className="toggle-knob" /></span>
        </label>

        <div className="slot-row">
          <span className="slot-row-label">Start</span>
          {/* Prawdziwy morph przy „Cały dzień": blok pól ma STAŁĄ szerokość,
              a animują się proporcje kolumn (data ↔ godzina) — pill daty rośnie
              i pochłania miejsce po godzinie, zamiast wskakiwać w prawo. */}
          <span className={`slot-row-fields dual${allDay ? ' all-day' : ''}`}>
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
                    // „Do" przed „Od" nie ma sensu — czyścimy przy cofnięciu startu.
                    doDate: value.doDate && value.doDate < e.target.value ? '' : value.doDate,
                    // Wybór daty seeduje okrągłe 18:00 (chyba że „cały dzień") —
                    // puste pole godziny otwierało natywny picker na bieżącej
                    // minucie z zegarka, co wyglądało jak przypadkowa wartość.
                    time: !allDay && !value.time ? '18:00' : value.time,
                  })
                }
              />
              {!value.od && <span className="dt-placeholder">Data</span>}
            </span>
            <span className="slot-time-cell" aria-hidden={allDay}>
              <span className={`dt-field${value.time ? '' : ' dt-empty'}`}>
                <input
                  id={`${idPrefix}-time`}
                  type="time"
                  value={value.time}
                  disabled={allDay}
                  tabIndex={allDay ? -1 : undefined}
                  onChange={(e) => onChange({ ...value, time: e.target.value })}
                />
                {!value.time && <span className="dt-placeholder">Godz.</span>}
              </span>
            </span>
          </span>
        </div>

        {withEnd && (
          <div className="slot-row">
            <span className="slot-row-label">Koniec</span>
            <span className="slot-row-fields">
              <span className={`dt-field${value.doDate ? '' : ' dt-empty'}`}>
                <input
                  id={`${idPrefix}-do`}
                  type="date"
                  value={value.doDate}
                  min={value.od || min}
                  onChange={(e) => onChange({ ...value, doDate: e.target.value })}
                />
                {!value.doDate && <span className="dt-placeholder">Data</span>}
              </span>
            </span>
          </div>
        )}
      </div>

      {!withEnd ? (
        <button
          type="button"
          className="add-slot slot-end-link"
          onClick={() => setWithEnd(true)}
        >
          + Dodaj datę końca (kilka dni)
        </button>
      ) : (
        <button
          type="button"
          className="add-slot slot-end-link"
          onClick={() => {
            setWithEnd(false);
            onChange({ ...value, doDate: '' });
          }}
        >
          − Usuń datę końca
        </button>
      )}
    </div>
  );
}
