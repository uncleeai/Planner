import { supabase } from './supabaseClient';
import type { EventRow, Slot, Vote, Profile, Comment, Reaction } from './types';

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
  reactions: Reaction[];
  notFound: boolean;
};

async function fetchBundle(eventId: string): Promise<EventBundle> {
  const [{ data: ev, error: evErr }, { data: sl }, { data: vo }, { data: pr }, { data: cm }, { data: re }] =
    await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
      supabase.from('slots').select('*').eq('event_id', eventId).order('starts_at'),
      supabase.from('votes').select('*').eq('event_id', eventId),
      supabase.from('profiles').select('*'),
      supabase.from('comments').select('*').eq('event_id', eventId).order('created_at'),
      supabase.from('comment_reactions').select('*').eq('event_id', eventId),
    ]);
  return {
    event: (ev as EventRow) ?? null,
    slots: (sl ?? []) as Slot[],
    votes: (vo ?? []) as Vote[],
    profiles: (pr ?? []) as Profile[],
    comments: (cm ?? []) as Comment[],
    reactions: (re ?? []) as Reaction[],
    notFound: !!evErr || !ev,
  };
}

type Inflight = { p: Promise<EventBundle>; ts: number };
const inflight = new Map<string, Inflight>();

// pointerdown odpala się też na dotknięciach zaczynających SCROLL, więc mapa łapie
// prefetche kart, w które nikt nie wszedł. Bez terminu ważności takie wpisy żyły
// wiecznie — wejście w kartę dotkniętą kilka minut temu pokazywało dane sprzed minut
// (do najbliższego zdarzenia realtime). Po TTL wpis jest ignorowany i pobieramy świeżo.
const PREFETCH_TTL_MS = 15_000;

// Dotknięcie karty wypadu — uruchom pobranie w tle (dedup: jedno świeże na wypad).
export function prefetchEvent(eventId: string): void {
  const cur = inflight.get(eventId);
  if (cur && Date.now() - cur.ts < PREFETCH_TTL_MS) return;
  const entry: Inflight = { p: undefined as unknown as Promise<EventBundle>, ts: Date.now() };
  // Błąd sieci nie może zostawić odrzuconej obietnicy w mapie — wyczyść po niej
  // (tylko jeśli to wciąż NASZ wpis, nie świeższa podmiana).
  entry.p = fetchBundle(eventId).catch((e) => {
    if (inflight.get(eventId) === entry) inflight.delete(eventId);
    throw e;
  });
  inflight.set(eventId, entry);
}

// Strona wypadu: zużyj ŚWIEŻY prefetch jeśli był, inaczej pobierz teraz. Po zużyciu
// czyścimy wpis, by kolejne load() (realtime) szły do bazy na świeżo.
export function loadEventBundle(eventId: string): Promise<EventBundle> {
  const cur = inflight.get(eventId);
  if (cur) {
    inflight.delete(eventId);
    if (Date.now() - cur.ts < PREFETCH_TTL_MS) return cur.p;
  }
  return fetchBundle(eventId);
}
