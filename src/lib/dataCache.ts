import type { EventRow, Slot, Vote, Profile, Comment } from './types';

// Lekki cache w pamięci (singleton po stronie klienta). Dashboard ładuje komplet danych;
// strona wypadu odczytuje je na start, by pokazać się natychmiast — a potem i tak
// rewaliduje przez własne load() + realtime, więc dane pozostają świeże i na żywo.
// To wyłącznie „zaliczka" na otwarcie, nie zamiennik pobierania.

export type AppData = {
  events: EventRow[];
  slots: Slot[];
  votes: Vote[];
  profiles: Profile[];
  recentComments: Comment[];
};

let cache: AppData | null = null;

export function getCache(): AppData | null {
  return cache;
}

export function setCache(data: AppData): void {
  cache = data;
}

function upsertEvent(events: EventRow[], ev: EventRow): EventRow[] {
  const rest = events.filter((e) => e.id !== ev.id);
  return [...rest, ev];
}

// Po świeżym pobraniu danych jednego wypadu odśwież ich kopię w cache,
// żeby powrót na listę nie pokazał starych głosów/terminów.
export function mergeEventData(
  eventId: string,
  data: { event: EventRow | null; slots: Slot[]; votes: Vote[]; profiles: Profile[] },
): void {
  if (!cache) {
    cache = {
      events: data.event ? [data.event] : [],
      slots: [...data.slots],
      votes: [...data.votes],
      profiles: [...data.profiles],
      recentComments: [],
    };
    return;
  }
  cache = {
    events: data.event ? upsertEvent(cache.events, data.event) : cache.events,
    slots: [...cache.slots.filter((s) => s.event_id !== eventId), ...data.slots],
    votes: [...cache.votes.filter((v) => v.event_id !== eventId), ...data.votes],
    profiles: data.profiles.length ? data.profiles : cache.profiles,
    recentComments: cache.recentComments,
  };
}
