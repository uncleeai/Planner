import type { Availability, EventRow, Profile, Slot, Vote } from '@/lib/types';

/**
 * Czysta logika planera — bez Reacta i bez Supabase, żeby dało się ją
 * przetestować jednostkowo. Strony (`page.tsx`) zajmują się tylko widokiem
 * i pobieraniem danych.
 */

/** Wspólny format daty w UI: „pt, 12 września, 19:00". */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type CategorizedEvents = {
  /** Bez ustalonego terminu — wciąż zbieramy głosy. */
  open: EventRow[];
  /** Ustalone i jeszcze przed nami, od najbliższego. */
  upcoming: EventRow[];
  /** Ustalone i minione, od najnowszego. */
  past: EventRow[];
};

export function categorizeEvents(events: EventRow[], now: number = Date.now()): CategorizedEvents {
  const open: EventRow[] = [];
  const upcoming: EventRow[] = [];
  const past: EventRow[] = [];

  for (const ev of events) {
    if (!ev.confirmed_at) {
      open.push(ev);
    } else if (new Date(ev.confirmed_at).getTime() >= now) {
      upcoming.push(ev);
    } else {
      past.push(ev);
    }
  }

  upcoming.sort((a, b) => new Date(a.confirmed_at!).getTime() - new Date(b.confirmed_at!).getTime());
  past.sort((a, b) => new Date(b.confirmed_at!).getTime() - new Date(a.confirmed_at!).getTime());

  return { open, upcoming, past };
}

export type SlotStats = {
  slot: Slot;
  votes: Vote[];
  yes: number;
  maybe: number;
  no: number;
  /** Głos zalogowanego użytkownika na ten termin (jeśli oddał). */
  mine: Availability | undefined;
};

export function computeSlotStats(slots: Slot[], votes: Vote[], userId: string | null): SlotStats[] {
  return slots.map((slot) => {
    const slotVotes = votes.filter((v) => v.slot_id === slot.id);
    return {
      slot,
      votes: slotVotes,
      yes: slotVotes.filter((v) => v.availability === 'yes').length,
      maybe: slotVotes.filter((v) => v.availability === 'maybe').length,
      no: slotVotes.filter((v) => v.availability === 'no').length,
      mine: slotVotes.find((v) => v.user_id === userId)?.availability,
    };
  });
}

/** Najwyższa liczba głosów „Mogę" spośród terminów (0 gdy brak terminów). */
export function maxYesCount(stats: SlotStats[]): number {
  return Math.max(0, ...stats.map((s) => s.yes));
}

/** Nazwy osób, które oddały jakikolwiek głos (bez duplikatów, w kolejności głosów). */
export function participantNames(votes: Vote[]): string[] {
  return Array.from(new Set(votes.map((v) => v.participant_name)));
}

/** Kto z paczki nie oddał jeszcze żadnego głosu w tym wypadzie. */
export function missingVoterNames(members: Profile[], votes: Vote[]): string[] {
  const voted = new Set(votes.map((v) => v.user_id).filter(Boolean));
  return members.filter((m) => !voted.has(m.id)).map((m) => m.display_name);
}

/**
 * Organizatorem jest twórca wypadu. Stare rekordy bez `created_by_user_id`
 * (sprzed logowania) traktujemy jako „każdy może" — dla zgodności wstecz.
 */
export function isOrganizer(event: EventRow | null, userId: string | null): boolean {
  if (!event) return false;
  return !event.created_by_user_id || event.created_by_user_id === userId;
}
