// Eksport ustalonego terminu wypadu do pliku .ics (iCalendar).
// Bez żadnego API i bez kosztów — czysto po stronie klienta. Na iOS tapnięcie
// pobranego pliku otwiera Apple Calendar z gotowym „Dodaj wydarzenie"; na
// Androidzie/desktopie plik importuje się do Google/innego kalendarza.

// Domyślny czas trwania, gdy nie znamy końca wypadu (slot to tylko start).
const DEFAULT_DURATION_MIN = 120; // 2h

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Date → "YYYYMMDDTHHMMSSZ" (UTC) — format DTSTART/DTEND w iCalendar.
function toIcsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// Escape pól TEXT wg RFC 5545: backslash, średnik, przecinek, nowa linia.
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export type CalendarEvent = {
  id: string;
  title: string;
  location?: string | null;
  description?: string | null;
  startIso: string;
  durationMin?: number;
};

function buildIcs(ev: CalendarEvent): string {
  const start = new Date(ev.startIso);
  const end = new Date(start.getTime() + (ev.durationMin ?? DEFAULT_DURATION_MIN) * 60000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wypad//Planner//PL',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.id}-${start.getTime()}@wypad`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeText(ev.title)}`,
  ];
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

function safeFileName(title: string): string {
  const base =
    title
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'wypad';
  return `${base}.ics`;
}

// Zbuduj plik .ics i otwórz go (download/otwarcie w kalendarzu).
export function addToCalendar(ev: CalendarEvent): void {
  const ics = buildIcs(ev);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFileName(ev.title);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Daj przeglądarce chwilę na rozpoczęcie pobierania, zanim zwolnimy URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
