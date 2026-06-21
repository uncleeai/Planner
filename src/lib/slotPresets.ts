// Szybkie presety terminów — mniej dłubania w pickerze daty na telefonie.
// Każdy preset zwraca wartość gotową do <input type="datetime-local"> (czas lokalny).

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Date → "YYYY-MM-DDTHH:mm" w czasie lokalnym (format datetime-local).
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function atHour(d: Date, hour: number): Date {
  const r = new Date(d);
  r.setHours(hour, 0, 0, 0);
  return r;
}

// Najbliższy dzień tygodnia (0 = niedziela … 6 = sobota); jeśli dziś jest ten dzień, zwraca dziś.
function nextWeekday(from: Date, weekday: number): Date {
  const r = new Date(from);
  r.setDate(r.getDate() + ((weekday - r.getDay() + 7) % 7));
  return r;
}

export type SlotPreset = { label: string; build: (now?: Date) => string };

export const SLOT_PRESETS: SlotPreset[] = [
  { label: 'Dziś 19:00', build: (now = new Date()) => toLocalInput(atHour(now, 19)) },
  {
    label: 'Jutro 19:00',
    build: (now = new Date()) => {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return toLocalInput(atHour(d, 19));
    },
  },
  { label: 'Piątek 19:00', build: (now = new Date()) => toLocalInput(atHour(nextWeekday(now, 5), 19)) },
  { label: 'Sobota 19:00', build: (now = new Date()) => toLocalInput(atHour(nextWeekday(now, 6), 19)) },
];
