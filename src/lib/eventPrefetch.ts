import { supabase } from './supabaseClient';
import type { EventRow, Slot, Vote, Profile, Comment } from './types';

// Prefetch danych jednego wypadu, odpalany na dotknięcie karty (pointerdown). Round-trip
// do bazy nakłada się wtedy na tap + animację wejścia + montowanie strony, więc wypad
// (z komentarzami) jest gotowy zanim się pokaże. Jak prefetch nie zdąży — strona i tak
// robi własny load(), więc to czysty zysk bez ryzyka.

export type EventBundle = {
  event: EventRow | null;
  slots: Slot[];
  votes: Vote[];
  profiles: Profile[];
  comments: Comment[];
  notFound: boolean;
};

async function fetchBundle(eventId: string): Promise<EventBundle> {
  const [{ data: ev, error: evErr }, { data: sl }, { data: vo }, { data: pr }, { data: cm }] =
    await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
      supabase.from('slots').select('*').eq('event_id', eventId).order('starts_at'),
      supabase.from('votes').select('*').eq('event_id', eventId),
      supabase.from('profiles').select('*'),
      supabase.from('comments').select('*').eq('event_id', eventId).order('created_at'),
    ]);
  return {
    event: (ev as EventRow) ?? null,
    slots: (sl ?? []) as Slot[],
    votes: (vo ?? []) as Vote[],
    profiles: (pr ?? []) as Profile[],
    comments: (cm ?? []) as Comment[],
    notFound: !!evErr || !ev,
  };
}

const inflight = new Map<string, Promise<EventBundle>>();

// Dotknięcie karty wypadu — uruchom pobranie w tle (dedup: jedno na wypad).
export function prefetchEvent(eventId: string): void {
  if (inflight.has(eventId)) return;
  // Błąd sieci nie może zostawić odrzuconej obietnicy w mapie — wyczyść po niej.
  const p = fetchBundle(eventId).catch((e) => {
    inflight.delete(eventId);
    throw e;
  });
  inflight.set(eventId, p);
}

// Strona wypadu: zużyj prefetch jeśli był, inaczej pobierz teraz. Po zużyciu czyścimy
// wpis, by kolejne load() (realtime) szły do bazy na świeżo.
export function loadEventBundle(eventId: string): Promise<EventBundle> {
  const p = inflight.get(eventId);
  if (p) {
    inflight.delete(eventId);
    return p;
  }
  return fetchBundle(eventId);
}
