'use client';

import type { InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  value: string;
  placeholder?: string;
};

// Input daty/godziny z własnym placeholderem.
// Natywny <input type="datetime-local"> pusty na iOS nie pokazuje nic w środku
// (a na desktopie pokazuje „dd.mm.rrrr"). Nakładamy własny tekst gdy puste i bez fokusu.
export default function DateTimeInput({
  value,
  placeholder = 'Wybierz datę i godzinę',
  ...rest
}: Props) {
  const empty = !value;
  return (
    <span className={`dt-field${empty ? ' dt-empty' : ''}`}>
      <input type="datetime-local" value={value} {...rest} />
      {empty && <span className="dt-placeholder">{placeholder}</span>}
    </span>
  );
}
