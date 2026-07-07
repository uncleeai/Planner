'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { getEventStatus, formatSlotShort, slotEndMs } from '@/lib/types';
import { pingUser } from '@/lib/ping';
import { appAlert } from '@/components/Dialogs';
import { notifyConfirmed } from '@/lib/notifyConfirmed';
import type { Availability, EventRow, Slot, Vote, Profile, Comment } from '@/lib/types';
import { Avatar, type Person } from '@/components/Avatar';
import ProfileMenu from '@/components/ProfileMenu';
import SettingsMenu from '@/components/SettingsMenu';
import SlotRangeInput from '@/components/SlotRangeInput';
import DescriptionInput from '@/components/DescriptionInput';
import EventEmojiInput from '@/components/EventEmojiInput';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import { fetchDayWeather, peekDayWeather, describeWeather, type DayWeather } from '@/lib/weather';
import { buildSlotTimes, EMPTY_SLOT_RANGE, type SlotRange } from '@/lib/slotInput';
import { useRouter } from 'next/navigation';
import { useTransitionNavigate } from '@/lib/transition';
import { getCache, setCache } from '@/lib/dataCache';
import { prefetchEvent } from '@/lib/eventPrefetch';
import { getChatSeen } from '@/lib/chatSeen';
import { IconCalendar, IconPin, IconChevron, IconClock, WeatherIcon } from '@/components/icons';

// Lokalna data (YYYY-MM-DD) z timestampu — do zapytania o prognozę na dzień wypadu.
function toDateISO(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* (usunięto ekstrakcję dominującego koloru — hero idzie w frosted glass) */
function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'teraz';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} godz`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} dni`;
  return new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

// Stan gracza w składzie: najlepszy głos w wypadzie (yes > maybe > no) albo null = AFK.
type SquadMember = { id: string; name: string; avatar: string | null; state: 'yes' | 'maybe' | 'no' | null };

type Agg = {
  voters: Person[];
  percent: number;
  slot: Slot | null;           // USTALONY termin (do formatu zakresu/całodniowego)
  squad: SquadMember[];        // cała paczka ze stanem — sloty graczy + segmenty
};
const EMPTY_AGG: Agg = { voters: [], percent: 0, slot: null, squad: [] };

const MAJOR_QUOTES = [
  "„Żeby żyć trzeba jeść, żeby jeść trzeba żyć…”",
  "„Piwko to jest jak rosół…”",
  "„Nie ma takiego czegoś, żeby było coś…”",
  "„Ugułem trzeba być sobom”",
  "„Czego ty krzyczysz? Czego ty krzyczysz kurwa, Knurze!”",
  "„Pozbędziesz się mnie ja... i tak będę się wyprowadzał. Proszę mnie wymeldować!”",
  "„Niektóre firmy upadają, bo mają upadek. I jest wzlot.”",
  "„Można to zabrońnić!”",
  "„Pierdolę tego Loluzelskiego!”",
  "„Tak halo?”",
  "„O, bąka puściłem, na Sławka.”",
  "„Jesteś CHUJEM!” - Major o swojej narzeczonej",
  "„SRAAAADEK! Ty jebana kurwa komunistyczny chuju gruba gruba. Kurwo.”",
  "Odpierdol się od Mickiewicza.",
  "W którym lesie ty byłeś? Gdzie schowałeś SUOMĘ? No, SUOMĘ. (…) Żujesz jakąś SUOME?",
  "\"Ciekawe czym oni srają? Indiani. Jodłą chyba. Jak myślisz? Czym oni srają? Może bananami, bo tam ciepło jest.\"",
  "\"Pierdolę tych indianów. Te żarcie, ugułem, jak to się mówi. Indiańskie. Krowy. Dojne.\"",
  "\"Mój siurek czeka na te gniazdo. Żeby wciskać, i chlapać w tą i z powrotem. Żeby ona była nonstop mokra. Mokra, cała wilgotna - żeby była nonstop zadowolona.\"",
  "\"Ptasibrzuch jestem!\"",
  "„Rodzina twoja poumierała…”",
  "„Muszę mieć lepszą wiadomość!”"
];

export default function Home() {
  const navigate = useTransitionNavigate();
  const router = useRouter();
  const { userId, displayName } = useAuth();

  // Seed z cache (jeśli wracamy z wypadu) — lista pojawia się od razu, bez „Wczytuję…".
  const cached = getCache();
  const [events, setEvents] = useState<EventRow[]>(() => cached?.events ?? []);
  const [slots, setSlots] = useState<Slot[]>(() => cached?.slots ?? []);
  const [votes, setVotes] = useState<Vote[]>(() => cached?.votes ?? []);
  const [profiles, setProfiles] = useState<Profile[]>(() => cached?.profiles ?? []);
  const [recentComments, setRecentComments] = useState<Comment[]>(() => cached?.recentComments ?? []);
  const [loading, setLoading] = useState(() => !cached);

  const [quote, setQuote] = useState('');
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const q = MAJOR_QUOTES[Math.floor(Math.random() * MAJOR_QUOTES.length)];
    setQuote(q);
  }, []);

  const handleNextQuote = () => {
    if (MAJOR_QUOTES.length <= 1) return;
    setFade(false);
    setTimeout(() => {
      let nextQuote = quote;
      while (nextQuote === quote) {
        nextQuote = MAJOR_QUOTES[Math.floor(Math.random() * MAJOR_QUOTES.length)];
      }
      setQuote(nextQuote);
      setFade(true);
    }, 150);
  };

  const [showForm, setShowForm] = useState(false);
  // Zamykanie sheeta: najpierw animacja wyjazdu (klasa .closing), odmontowanie
  // dopiero po jej końcu (animationend na overlayu).
  const [sheetClosing, setSheetClosing] = useState(false);
  const closeSheet = () => setSheetClosing(true);
  const [showArchive, setShowArchive] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [slotDraft, setSlotDraft] = useState<SlotRange>(EMPTY_SLOT_RANGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showForm && titleInputRef.current) {
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 100);
    }
  }, [showForm]);

  const load = useCallback(async () => {
    const [{ data: ev }, { data: sl }, { data: vo }, { data: pr }, { data: cm }] = await Promise.all([
      supabase.from('events').select('*').order('created_at', { ascending: false }),
      supabase.from('slots').select('*'),
      supabase.from('votes').select('*'),
      supabase.from('profiles').select('*'),
      supabase.from('comments').select('*').order('created_at', { ascending: false }).limit(30),
    ]);
    const events = (ev ?? []) as EventRow[];
    const slots = (sl ?? []) as Slot[];
    const votes = (vo ?? []) as Vote[];
    const profiles = (pr ?? []) as Profile[];
    setEvents(events);
    setSlots(slots);
    setVotes(votes);
    setProfiles(profiles);
    const recentComments = (cm ?? []) as Comment[];
    setRecentComments(recentComments);
    setCache({ events, slots, votes, profiles, recentComments }); // zaliczka dla strony wypadu
    setLoading(false);
  }, []);

  // Realtime potrafi przysłać serię zmian naraz (własny głos + cudze + reconnect po
  // uśpieniu). Bez tego każdy wiersz wołał osobny load() = 5 zapytań + pełny re-render
  // pod rząd, co na telefonie (zwł. w trybie oszczędzania) zapychało główny wątek i
  // taps przez chwilę nie łapały. Sklejamy serię w jeden load() (trailing debounce).
  const eventsRef = useRef<EventRow[]>(events);
  eventsRef.current = events;

  const reloadTimer = useRef<number | null>(null);
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null;
      load();
    }, 300);
  }, [load]);

  useEffect(() => {
    // Powrót z wypadu: seed z cache już stoi na ekranie, a natychmiastowy load()
    // (5 zapytań + przeliczenie agregacji + re-render całej listy) lądował w środku
    // animacji wejścia — na telefonie widoczny jank, zwłaszcza po wybudzeniu (zimny
    // JIT). Z seedem odsuwamy odświeżenie tuż za koniec kaskady; bez seedu — od razu.
    const initialLoad = window.setTimeout(load, cached ? 700 : 0);
    const channel = supabase
      .channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, scheduleReload)
      .subscribe();
    // Zmiany w `events` łapie JEDNA globalna subskrypcja (NewEventToast) i rozgłasza je
    // tym zdarzeniem. Dwa kanały Realtime na tej samej tabeli gubiły dostawy (toast
    // łapał tylko pierwszy wypad), więc dashboard nie subskrybuje `events` osobno.
    window.addEventListener('planner:events-changed', scheduleReload);
    // Wybudzenie telefonu: zrób od razu to, co i tak zaraz by się wydarzyło —
    // odśwież dane (reconnect realtime i tak odpali serię) i ponów prefetch tras
    // wypadów (cache prefetchu wygasa w uśpieniu). Dzięki temu ta robota schodzi
    // w momencie wake, a nie w trakcie pierwszego tapnięcia/animacji wejścia.
    const onWake = () => {
      if (document.visibilityState !== 'visible') return;
      scheduleReload();
      for (const ev of eventsRef.current.slice(0, 8)) router.prefetch(`/event/${ev.id}`);
    };
    document.addEventListener('visibilitychange', onWake);
    return () => {
      window.clearTimeout(initialLoad);
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
      window.removeEventListener('planner:events-changed', scheduleReload);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [load, scheduleReload, router]);

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    const times = buildSlotTimes(slotDraft);
    if (!title.trim() || !times || busy) return;

    if (slotEndMs(times) < Date.now() - 60000) {
      setError('Termin nie może być z przeszłości.');
      return;
    }

    setBusy(true);
    setError('');

    const { data, error } = await supabase
      .from('events')
      .insert({
        title: title.trim(),
        location: location.trim() || null,
        latitude: locationCoords?.lat ?? null,
        longitude: locationCoords?.lon ?? null,
        emoji,
        description: description.trim() || null,
        created_by: displayName,
        created_by_user_id: userId,
      })
      .select('id')
      .single();

    if (error || !data) {
      setError(error?.message ?? 'Nie udało się utworzyć wypadu.');
      setBusy(false);
      return;
    }

    await supabase.from('slots').insert({
      event_id: data.id,
      starts_at: times.starts_at,
      ends_at: times.ends_at,
      all_day: times.all_day,
      created_by: displayName,
      created_by_user_id: userId,
    });

    navigate(`/event/${data.id}`, 'forward');
  }

  // Kategoryzacja + wybór hero. Hero działa jak skrzynka odbiorcza:
  // (1) wypad czekający na TWÓJ głos, (2) czekamy na innych, (3) najbliższy
  // klepnięty. Data rozstrzyga dopiero remisy w obrębie klasy. Reszta listy
  // to jedna chronologiczna sekcja „Przed nami" — status niesie plakietka
  // przy wierszu, nie osobny nagłówek sekcji (4 nagłówki na kilka wypadów
  // robiły więcej szumu niż treści).
  const { heroId, heroMode, heroVariant, ahead, past, archived } = useMemo(() => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    // Retencja na głównej: odbyte wiszą w „Bylim już" miesiąc, nieustalone tydzień
    // (wiersze są małe, nie zawadzają). Starsze spadają do zwijanego Archiwum —
    // nic nie znika bez śladu.
    const PAST_KEEP = 30 * DAY;
    const EXPIRED_KEEP = 7 * DAY;
    const archivedItems: { ev: EventRow; variant: 'past' | 'expired'; slot: Slot | null; endMs: number }[] = [];

    type AheadItem = { ev: EventRow; variant: 'open' | 'upcoming' | 'expired'; sortMs: number; slot: Slot | null };
    const openItems: AheadItem[] = [];
    const upcomingItems: AheadItem[] = [];
    const expiredItems: AheadItem[] = [];
    const pastItems: { ev: EventRow; endMs: number }[] = [];

    const slotsByEvent = new Map<string, Slot[]>();
    for (const s of slots) {
      const arr = slotsByEvent.get(s.event_id) ?? [];
      arr.push(s);
      slotsByEvent.set(s.event_id, arr);
    }
    const votesByEvent = new Map<string, Vote[]>();
    for (const v of votes) {
      const arr = votesByEvent.get(v.event_id) ?? [];
      arr.push(v);
      votesByEvent.set(v.event_id, arr);
    }
    const memberIds = profiles.map((p) => p.id);

    for (const ev of events) {
      const evSlots = slotsByEvent.get(ev.id) ?? [];
      const evVotes = votesByEvent.get(ev.id) ?? [];
      const status = getEventStatus(ev, evSlots, evVotes, memberIds);

      // Ustalony (ręcznie LUB wszyscy dali znać) → nadchodzący / Bylim już.
      // Liczone od KOŃCA terminu (zakres/cały dzień trwa do końca ostatniego dnia).
      if (status.settled && status.date) {
        const settledSlot = evSlots.find((s) => s.id === status.slotId) ?? null;
        const endMs = settledSlot ? slotEndMs(settledSlot) : new Date(status.date).getTime();
        if (endMs >= now) {
          upcomingItems.push({ ev, variant: 'upcoming', sortMs: endMs, slot: settledSlot });
        } else if (endMs >= now - PAST_KEEP) {
          pastItems.push({ ev, endMs });
        } else {
          archivedItems.push({ ev, variant: 'past', slot: settledSlot, endMs });
        }
        continue;
      }

      // Nieustalony: czy jest jeszcze jakiś termin, który się nie skończył?
      const latestSlot = evSlots.reduce<Slot | null>(
        (m, s) => (!m || slotEndMs(s) > slotEndMs(m) ? s : m),
        null,
      );
      const latest = latestSlot ? slotEndMs(latestSlot) : 0;
      const hasFuture = evSlots.some((s) => slotEndMs(s) > now);

      if (evSlots.length > 0 && !hasFuture) {
        // Wszystkie terminy minęły, nikt nie ustalił = „Nie ustalono".
        if (latest >= now - EXPIRED_KEEP) {
          expiredItems.push({ ev, variant: 'expired', sortMs: latest, slot: latestSlot });
        } else {
          archivedItems.push({ ev, variant: 'expired', slot: latestSlot, endMs: latest });
        }
      } else {
        // Ma przyszły termin albo brak terminów → wciąż zbiera głosy.
        // Klucz sortowania: najbliższy przyszły termin (brak terminów → na koniec).
        let nearestSlot: Slot | null = null;
        for (const s of evSlots) {
          const end = slotEndMs(s);
          if (end > now && (!nearestSlot || end < slotEndMs(nearestSlot))) nearestSlot = s;
        }
        openItems.push({
          ev,
          variant: 'open',
          sortMs: nearestSlot ? slotEndMs(nearestSlot) : Infinity,
          slot: nearestSlot,
        });
      }
    }

    const byNearest = (a: AheadItem, b: AheadItem) => a.sortMs - b.sortMs;

    // Klasa 1: czeka na MÓJ głos (jest na co głosować i nie oddałem głosu).
    const myVotedEventIds = new Set(
      votes.filter((v) => v.user_id === userId).map((v) => v.event_id),
    );
    const needsMyVote = (it: AheadItem) =>
      it.sortMs !== Infinity && !myVotedEventIds.has(it.ev.id);
    const classVote = openItems.filter(needsMyVote).sort(byNearest);
    const classWaiting = openItems.filter((it) => !needsMyVote(it)).sort(byNearest);
    const classLocked = upcomingItems.slice().sort(byNearest);

    const heroItem = classVote[0] ?? classWaiting[0] ?? classLocked[0] ?? null;
    const heroMode: 'vote' | 'waiting' | 'locked' | null = !heroItem
      ? null
      : heroItem === classVote[0] ? 'vote'
      : heroItem === classWaiting[0] ? 'waiting'
      : 'locked';

    // „Przed nami": aktywne + klepnięte chronologicznie (bez hero);
    // minione-nieustalone na końcu, najświeższe pierwsze.
    const ahead = [
      ...[...openItems, ...upcomingItems]
        .filter((it) => it.ev.id !== heroItem?.ev.id)
        .sort(byNearest),
      ...expiredItems.sort((a, b) => b.sortMs - a.sortMs),
    ];

    pastItems.sort((a, b) => b.endMs - a.endMs);
    archivedItems.sort((a, b) => b.endMs - a.endMs);

    return {
      heroId: heroItem?.ev.id ?? null,
      heroMode,
      heroVariant: (heroItem?.variant === 'upcoming' ? 'upcoming' : 'open') as 'open' | 'upcoming',
      ahead,
      past: pastItems.map((p) => p.ev),
      archived: archivedItems,
    };
  }, [events, slots, votes, profiles, userId]);

  const aggByEvent = useMemo(() => {
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const slotsBy = new Map<string, Slot[]>();
    for (const s of slots) {
      const arr = slotsBy.get(s.event_id) ?? [];
      arr.push(s);
      slotsBy.set(s.event_id, arr);
    }
    const votesBy = new Map<string, Vote[]>();
    for (const v of votes) {
      const arr = votesBy.get(v.event_id) ?? [];
      arr.push(v);
      votesBy.set(v.event_id, arr);
    }
    const memberCount = profiles.length;
    const memberIds = profiles.map((p) => p.id);
    const result = new Map<string, Agg>();
    for (const ev of events) {
      const seen = new Map<string, Person>();
      const evVotes = votesBy.get(ev.id) ?? [];
      for (const v of evVotes) {
        const key = v.user_id ?? `name:${v.participant_name}`;
        if (seen.has(key)) continue;
        const prof = v.user_id ? profileById.get(v.user_id) : undefined;
        seen.set(key, { name: prof?.display_name ?? v.participant_name, avatar: prof?.avatar ?? null });
      }
      const voters = Array.from(seen.values());
      const percent = memberCount > 0 ? Math.round((voters.length / memberCount) * 100) : 0;
      const evSlots = (slotsBy.get(ev.id) ?? [])
        .slice()
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
      const status = getEventStatus(ev, evSlots, evVotes, memberIds);
      const slot = status.settled ? evSlots.find((s) => s.id === status.slotId) ?? null : null;
      // Skład: stan każdego z paczki = najlepszy głos w tym wypadzie (yes > maybe > no),
      // brak głosu = null (AFK). Kolejność profili stała — sloty nie skaczą między kartami.
      const squad: SquadMember[] = profiles.map((p) => {
        let state: SquadMember['state'] = null;
        for (const v of evVotes) {
          if (v.user_id !== p.id) continue;
          if (v.availability === 'yes') { state = 'yes'; break; }
          if (v.availability === 'maybe') state = 'maybe';
          else if (state === null) state = 'no';
        }
        return { id: p.id, name: p.display_name, avatar: p.avatar, state };
      });
      result.set(ev.id, { voters, percent, slot, squad });
    }
    return result;
  }, [events, slots, votes, profiles]);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  // Nieprzeczytany czat: ostatnia cudza wiadomość per wypad vs lokalny znacznik
  // „kiedy ostatnio otwierałem" (chatSeen). Realtime na comments odświeża listę,
  // więc kropki aktualizują się na żywo.
  const unreadByEvent = useMemo(() => {
    const latest = new Map<string, number>();
    for (const c of recentComments) {
      if (c.user_id === userId) continue;
      const t = new Date(c.created_at).getTime();
      if (t > (latest.get(c.event_id) ?? 0)) latest.set(c.event_id, t);
    }
    const unread = new Set<string>();
    for (const [evId, t] of latest) {
      if (t > getChatSeen(evId)) unread.add(evId);
    }
    return unread;
  }, [recentComments, userId]);

  const heroEvent = heroId ? events.find((e) => e.id === heroId) ?? null : null;

  // Ile innych (przyszłych) terminów czeka w lobby poza tym pokazanym w hero.
  const heroOtherSlots = useMemo(() => {
    if (!heroId) return 0;
    const now = Date.now();
    const future = slots.filter((s) => s.event_id === heroId && slotEndMs(s) > now).length;
    return Math.max(0, future - 1);
  }, [heroId, slots]);

  // Karta misji: gdy hero jest JEDYNYM wypadem przed nami, dostaje zajawkę
  // ostatniej wiadomości z czatu — ekran z jednym lobby nie wygląda na pusty.
  const heroPeek = useMemo(() => {
    if (!heroId || ahead.length > 0) return null;
    const c = recentComments.find((cm) => cm.event_id === heroId);
    if (!c) return null;
    const prof = c.user_id ? profileById.get(c.user_id) : undefined;
    return {
      name: prof?.display_name ?? c.author_name,
      avatar: prof?.avatar ?? null,
      body: c.body,
      createdAt: c.created_at,
    };
  }, [heroId, ahead, recentComments, profileById]);

  // Termin hero (do pogody i godziny zbiórki): ustalony, a jak brak — najbliższy proponowany.
  const heroSlot = useMemo<Slot | null>(() => {
    if (!heroId) return null;
    const settled = aggByEvent.get(heroId)?.slot;
    if (settled) return settled;
    const now = Date.now();
    let best: Slot | null = null;
    let bestMs = Infinity;
    for (const s of slots) {
      if (s.event_id !== heroId) continue;
      const end = slotEndMs(s);
      if (end >= now && end < bestMs) {
        bestMs = end;
        best = s;
      }
    }
    return best;
  }, [heroId, aggByEvent, slots]);

  // Chip odliczania na railu hero: dni do STARTU pokazywanego terminu.
  const heroCountdown = useMemo(() => {
    if (!heroSlot) return null;
    const mid = (t: number) => {
      const d = new Date(t);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    const days = Math.round((mid(new Date(heroSlot.starts_at).getTime()) - mid(Date.now())) / (24 * 3600 * 1000));
    if (days < 0) return 'TRWA';
    if (days === 0) return 'DZIŚ';
    if (days === 1) return 'JUTRO';
    return `START ZA ${days} DNI`;
  }, [heroSlot]);

  // Pola formularza „Nowe lobby" — jedna lista dla obu wariantów (rozwijany nad
  // rozkładem i wewnątrz pustego stanu), żeby treść nie rozjeżdżała się między nimi.
  const lobbyFields = [
    <div key="head" className="modal-label" style={{ marginBottom: 14 }}>Nowe lobby</div>,
    <div className="field" key="title">
      <label htmlFor="title">Nazwa</label>
      <input
        id="title"
        type="text"
        placeholder="np. Piwo w piątek, baskecik…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        ref={titleInputRef}
      />
    </div>,
    <div className="field" key="loc">
      <label htmlFor="location">Miejsce (opcjonalnie)</label>
      <LocationAutocomplete
        id="location"
        value={location}
        onChange={setLocation}
        onCoords={setLocationCoords}
        placeholder="np. Zakopane, Łabiszyn…"
      />
    </div>,
    <div className="field" key="desc">
      <label htmlFor="description">Opis (opcjonalnie)</label>
      <DescriptionInput
        id="description"
        value={description}
        onChange={setDescription}
        placeholder="np. co bierzemy, plan, szczegóły…"
      />
    </div>,
    <EventEmojiInput key="emoji" value={emoji} onChange={setEmoji} />,
    <div className="field" key="date">
      <SlotRangeInput value={slotDraft} onChange={setSlotDraft} idPrefix="create" />
    </div>,
    error ? <p key="err" className="small" style={{ color: 'var(--no)' }}>{error}</p> : null,
    <button
      key="submit"
      type="submit"
      className="cta-gradient"
      disabled={!title.trim() || !slotDraft.od || busy}
    >
      {busy ? 'Odpalam…' : 'Odpal lobby'}
    </button>,
  ].filter(Boolean);

  return (
    <main className={`glass-page${events.length > 0 ? ' has-dock' : ''}`}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, position: 'relative', zIndex: 2 }}>
        <span className="wordmark cursor">WYPAD<span>.EXE</span></span>
        <div className="spacer" />
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <SettingsMenu />
          <ProfileMenu />
        </div>
      </header>

      {/* Formularz jako bottom sheet: wysuwa się znad doku „+ Nowe lobby", który go
          otwiera — zero teleportacji na górę strony i zero reflow listy (sam transform). */}
      {events.length > 0 && showForm && (
        <div
          className={`sheet-overlay${sheetClosing ? ' closing' : ''}`}
          onClick={closeSheet}
          onAnimationEnd={(e) => {
            // Tylko animacja SAMEGO overlaya (fade-out) — eventy z sheeta bąbelkują.
            if (sheetClosing && e.target === e.currentTarget) {
              setShowForm(false);
              setSheetClosing(false);
            }
          }}
        >
          <div className="sheet" role="dialog" aria-label="Nowe lobby" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" aria-hidden="true" />
            <form onSubmit={createEvent}>
              {lobbyFields}
              <button
                type="button"
                className="ghost"
                style={{ width: '100%', marginTop: 8 }}
                onClick={closeSheet}
              >
                Anuluj
              </button>
            </form>
          </div>
        </div>
      )}

      {loading && <p className="muted mt">Wczytuję…</p>}

      {!loading && events.length === 0 && (
        <div className="empty-state mt" style={{
          padding: showForm ? '20px' : '44px 24px',
          textAlign: showForm ? 'left' : 'center',
          transition: 'padding 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
          overflow: 'hidden',
        }}>
          {/* Sekcja 1: Brak wypadów (Empty State) */}
          <div style={{
            display: 'grid',
            gridTemplateRows: showForm ? '0fr' : '1fr',
            transition: 'grid-template-rows 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
          }}>
            <div style={{ minHeight: 0, overflow: 'hidden' }}>
              {[
                <div key="icon" style={{
                  width: 56, height: 56,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 16,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                  margin: '0 auto 16px',
                  color: '#ffffff'
                }}>
                  <IconCalendar size={26} />
                </div>,
                <h2 key="title" style={{ margin: '0 0 4px', textAlign: 'center' }}>Cisza w eterze</h2>,
                <p key="desc" style={{ color: 'var(--muted)', margin: '0 auto 18px', maxWidth: '30ch', textAlign: 'center' }}>
                  Załóż pierwsze lobby i wyślij składowi.
                </p>,
                <button
                  key="cta"
                  className="cta-gradient"
                  onClick={() => setShowForm(true)}
                  style={{ width: 'auto', padding: '12px 24px', fontSize: '0.95rem', margin: '0 auto', display: 'block' }}
                >
                  + Nowe lobby
                </button>,
              ].map((child, i) => (
                <div
                  key={i}
                  style={{
                    opacity: showForm ? 0 : 1,
                    transition: !showForm
                      ? `opacity 0.4s ease ${0.12 + i * 0.07}s`
                      : 'opacity 0.2s ease',
                  }}
                >
                  {child}
                </div>
              ))}
            </div>
          </div>

          {/* Sekcja 2: Formularz — kaskadowy fade-in od lewej */}
          <div style={{
            display: 'grid',
            gridTemplateRows: showForm ? '1fr' : '0fr',
            transition: 'grid-template-rows 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
          }}>
            <div style={{ minHeight: 0, overflow: 'hidden', padding: '0 4px' }}>
              <form onSubmit={createEvent} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  ...lobbyFields,
                  <button
                    key="cancel"
                    type="button"
                    className="ghost"
                    onClick={() => setShowForm(false)}
                    style={{ width: '100%', marginTop: -4 }}
                  >
                    Anuluj
                  </button>,
                ].map((child, i) => (
                  <div
                    key={i}
                    style={{
                      opacity: showForm ? 1 : 0,
                      transition: showForm
                        ? `opacity 0.4s ease ${0.12 + i * 0.07}s`
                        : 'opacity 0.15s ease',
                    }}
                  >
                    {child}
                  </div>
                ))}
              </form>
            </div>
          </div>
        </div>
      )}

      {heroEvent && (
        <section>
          <div className="rail">
            <div className={`section-label${heroMode === 'vote' ? ' hot' : ''}`}>
              {heroMode === 'vote' ? 'Twoja kolej' : heroMode === 'waiting' ? 'Czekamy na resztę' : 'Najbliższy'}
            </div>
            {heroCountdown && <span className="chip hot">{heroCountdown}</span>}
          </div>
          <HeroCard
            ev={heroEvent}
            agg={aggByEvent.get(heroEvent.id) ?? EMPTY_AGG}
            memberCount={profiles.length}
            slot={heroSlot}
            variant={heroVariant}
            needsYou={heroMode === 'vote'}
            otherSlots={heroOtherSlots}
            peek={heroPeek}
            mission={ahead.length === 0}
            unread={unreadByEvent.has(heroEvent.id)}
          />
        </section>
      )}
      <Board title="Przed nami" items={ahead} agg={aggByEvent} unread={unreadByEvent} />
      <Board
        title="Bylim już"
        items={past.map((ev) => ({ ev, variant: 'past' as const, slot: aggByEvent.get(ev.id)?.slot ?? null }))}
        agg={aggByEvent}
        muted
      />

      {archived.length > 0 && (
        <button
          type="button"
          className="archive-toggle"
          onClick={() => setShowArchive((v) => !v)}
          aria-expanded={showArchive}
        >
          Archiwum · {archived.length} {showArchive ? '▴' : '▾'}
        </button>
      )}
      {showArchive && (
        <Board
          title="Archiwum"
          items={archived.map(({ ev, variant, slot }) => ({ ev, variant, slot }))}
          agg={aggByEvent}
          muted
        />
      )}

      {!loading && events.length > 0 && quote && (
        <figure className="motd" onClick={handleNextQuote} title="Kliknij, aby wylosować kolejny cytat">
          <span className="motd-label">MOTD</span>
          <span className={`quote-text ${fade ? 'fade-in' : 'fade-out'}`}>{quote}</span>
        </figure>
      )}

      {events.length > 0 && (
        <div className="cta-dock">
          <button className="cta-gradient" onClick={() => setShowForm(true)}>
            + Nowe lobby
          </button>
        </div>
      )}
    </main>
  );
}

type RowVariant = 'open' | 'upcoming' | 'expired' | 'past';

// Segmenty gotowości: po jednym na osobę, w kolorze głosu (nie „pierwsze N na
// zielono" — komplet PASów wyglądał jak komplet chętnych). Zapełnione z lewej.
const SEG_RANK = { yes: 0, maybe: 1, no: 2 } as const;
function segStates(squad: SquadMember[]): (SquadMember['state'])[] {
  return squad
    .map((m) => m.state)
    .sort((a, b) => (a ? SEG_RANK[a] : 3) - (b ? SEG_RANK[b] : 3));
}

// Sekcja rozkładu: mono-etykieta + płaskie wiersze z cienkimi liniami (bez kart).
function Board({ title, items, agg, muted, unread }: {
  title: string;
  items: { ev: EventRow; variant: RowVariant; slot: Slot | null }[];
  agg: Map<string, Agg>;
  muted?: boolean;
  unread?: Set<string>;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className={`section-label${muted ? ' faded' : ''}`}>{title}</div>
      <div className="board">
        {items.map(({ ev, variant, slot }) => (
          <Row
            key={ev.id}
            ev={ev}
            variant={variant}
            slot={slot}
            agg={agg.get(ev.id) ?? EMPTY_AGG}
            unread={unread?.has(ev.id)}
          />
        ))}
      </div>
    </section>
  );
}

// Płaski wiersz: tytuł + mono-podpis (data · godzina · miejsce);
// po prawej segmenty gotowości albo plakietka statusu.
function Row({ ev, variant, slot, agg, unread }: {
  ev: EventRow; variant: RowVariant; slot: Slot | null; agg: Agg; unread?: boolean;
}) {
  const { href, handlers } = useEventNav(ev.id);
  const responded = agg.squad.filter((m) => m.state).length;

  const parts: string[] = [];
  if (variant === 'expired') {
    parts.push('Termin minął');
  } else if (slot) {
    parts.push(formatSlotShort(slot));
    if (!slot.ends_at && !slot.all_day) {
      parts.push(`od ${new Date(slot.starts_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`);
    }
  } else {
    parts.push('Zbieramy terminy');
  }
  if (ev.location) parts.push(ev.location);

  return (
    <Link href={href} prefetch={true} className="trow" {...handlers}>
      <span className="trow-main">
        <b>
          {ev.emoji ? `${ev.emoji} ` : ''}{ev.title}
          {unread && <i className="unread-dot" aria-label="Nowe wiadomości na czacie" />}
        </b>
        <span>{parts.join(' · ')}</span>
      </span>
      {variant === 'open' && agg.squad.length > 0 && (
        <span className="mini-segs" aria-label={`${responded} z ${agg.squad.length} dało znać`}>
          {segStates(agg.squad).map((st, i) => <i key={i} className={st ? `on-${st}` : ''} />)}
        </span>
      )}
      {variant === 'upcoming' && <span className="badge">USTALONY</span>}
      {variant === 'past' && <span className="badge badge-muted">GG</span>}
      {variant === 'expired' && <span className="badge badge-muted">Nie ustalono</span>}
      <IconChevron size={16} className="row-chevron" />
    </Link>
  );
}

// Wejście w wypad z karty: prefetch danych na dotknięcie + nawigacja na klik.
function useEventNav(eventId: string) {
  const navigate = useTransitionNavigate();
  const href = `/event/${eventId}`;
  const handlers = {
    onPointerDown: () => prefetchEvent(eventId),
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return; // pozwól otworzyć w nowej karcie
      e.preventDefault();
      navigate(href);
    },
  };
  return { href, handlers };
}

// Karta najbliższego lobby: tytuł + meta (miejsce · mono-data), skład (sloty graczy
// z READY/MOŻE/PAS/AFK), segmenty gotowości. Gdy czeka na twój głos — ready check
// prosto w karcie (fakty pogoda/zbiórka wtedy schodzą z drogi). W trybie misji
// (jedyny wypad) skład rośnie do pionowego rosteru z „Pinguj" przy AFK.
function HeroCard({ ev, agg, memberCount, slot, variant, needsYou, otherSlots = 0, peek, mission, unread }: {
  ev: EventRow; agg: Agg; memberCount: number; slot: Slot | null; variant: 'open' | 'upcoming'; needsYou?: boolean;
  otherSlots?: number;
  peek?: { name: string; avatar: string | null; body: string; createdAt: string } | null;
  mission?: boolean;
  unread?: boolean;
}) {
  const { href, handlers } = useEventNav(ev.id);
  const { userId, displayName, isAdmin } = useAuth();
  const isOrg = isAdmin || !ev.created_by_user_id || ev.created_by_user_id === userId;

  // „Pinguj" przy slocie AFK (tylko karta misji, tylko organizator).
  const [pinged, setPinged] = useState<Set<string>>(new Set());
  async function nudge(e: React.MouseEvent, m: SquadMember) {
    e.preventDefault();
    e.stopPropagation();
    if (pinged.has(m.id)) return;
    const err = await pingUser(ev.id, m.id, m.name);
    if (err) {
      appAlert('Ping nie poszedł', err);
      return;
    }
    setPinged((p) => new Set(p).add(m.id));
  }

  // Głos z dashboardu: optymistyczne zaznaczenie od razu, realtime dociągnie prawdę
  // (i przełączy hero w tryb „Czekamy na resztę").
  const [myPick, setMyPick] = useState<Availability | null>(null);
  async function castVote(e: React.MouseEvent, availability: Availability) {
    e.preventDefault();
    e.stopPropagation();
    if (!slot || myPick === availability) return;
    setMyPick(availability);
    const { error } = await supabase.from('votes').upsert(
      { event_id: ev.id, slot_id: slot.id, user_id: userId, participant_name: displayName, availability },
      { onConflict: 'slot_id,user_id' },
    );
    if (error) {
      setMyPick(null);
      return;
    }
    // Ten głos mógł skompletować ready check: reszta paczki już dała znać, a po
    // moim głosie istnieje prowadzący (≥1 READY) → „✓ GRAMY" do wszystkich.
    // Serwer i tak pilnuje, by pushnąć tylko raz na wypad.
    const othersVoted = agg.squad.length > 0 && agg.squad.every((m) => m.id === userId || m.state !== null);
    const anyYes = availability === 'yes' || agg.squad.some((m) => m.id !== userId && m.state === 'yes');
    if (othersVoted && anyYes) notifyConfirmed(ev.id, slot.id);
  }

  // Termin hero: data do prognozy + godzina zbiórki (jeśli slot ma konkretną godzinę).
  const weatherDate = slot ? toDateISO(slot.starts_at) : null;
  const meetTime = slot && !slot.all_day
    ? new Date(slot.starts_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    : null;

  // Pogoda na dzień wypadu (gdy są współrzędne i termin w zasięgu).
  const hasCoords = ev.latitude != null && ev.longitude != null && !!weatherDate;
  // Inicjalizacja z cache'a — po powrocie z eventu pogoda jest od razu (bez doskoku).
  const [weather, setWeather] = useState<DayWeather | null>(() =>
    hasCoords ? peekDayWeather(ev.latitude as number, ev.longitude as number, weatherDate as string) ?? null : null,
  );
  useEffect(() => {
    if (!hasCoords) return;
    let alive = true;
    fetchDayWeather(ev.latitude as number, ev.longitude as number, weatherDate as string)
      .then((r) => alive && setWeather(r));
    return () => { alive = false; };
  }, [hasCoords, ev.latitude, ev.longitude, weatherDate]);

  const wInfo = weather ? describeWeather(weather.code) : null;
  const responded = agg.squad.filter((m) => m.state).length;

  // Rząd hosta (awatar + nick + HOST, jak na mockupie) — poza trybami, które
  // hosta już pokazują (ready check: w meta; misja: side-label w rosterze).
  const host = ev.created_by_user_id
    ? agg.squad.find((m) => m.id === ev.created_by_user_id) ?? null
    : null;
  const hostName = host?.name ?? ev.created_by;
  const showHostRow = !needsYou && !mission && !!hostName;

  return (
    <Link href={href} prefetch={true} className={`event-rich hero${needsYou ? ' needs-you' : ''}`} {...handlers}>
      {/* Fotka-nastrój pod treścią hero (tylko gdy wypad ma zdjęcie; bez zdjęcia karta
          wygląda jak dotąd). Warstwy i wartości dostrojone na mockupie „plac zabaw". */}
      {ev.image_url && (
        <div className="hero-photo" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ev.image_url} alt="" loading="lazy" decoding="async" />
          <i className="hp-tint" />
          <i className="hp-half" />
          <i className="hp-grain" />
          <i className="hp-vig" />
          <i className="hp-scrim" />
        </div>
      )}
      {/* Emoji duże nad tytułem — jak na mockupie hero */}
      {ev.emoji && <div className="hero-emoji-top" aria-hidden="true">{ev.emoji}</div>}
      <div className="hero-head">
        <div className="hero-title-block">
          <span className="hero-title">
            {ev.title}
            {unread && <i className="unread-dot" aria-label="Nowe wiadomości na czacie" />}
          </span>
          <div className="hero-meta">
            {ev.location && (
              <>
                <span className="event-meta"><IconPin size={13} /> {ev.location}</span>
                <span className="sep">·</span>
              </>
            )}
            {/* W trybie ready check data i tak jest w etykiecie głosowania niżej —
                zamiast dublować, meta pokazuje hosta (jak na stronie wypadu). */}
            {needsYou && slot && ev.created_by ? (
              <span className="event-meta">host: {ev.created_by}</span>
            ) : (
              <span className="mono-date">{slot ? formatSlotShort(slot) : 'Zbieramy terminy'}</span>
            )}
          </div>
        </div>
        <IconChevron size={20} className="row-chevron" />
      </div>

      {showHostRow && (
        <div className="hero-host">
          <Avatar name={hostName as string} avatar={host?.avatar ?? null} size={24} />
          <b>{hostName}</b>
          <span className="host-tag">HOST</span>
        </div>
      )}

      {agg.squad.length > 0 ? (
        <>
          <div className={`squad${mission ? ' roster' : ''}`}>
            {agg.squad.map((m) => {
              const isYou = m.id === userId;
              const label =
                m.state === 'yes' ? 'READY'
                : m.state === 'maybe' ? 'MOŻE'
                : m.state === 'no' ? 'PAS'
                : isYou ? 'TWÓJ SLOT' : 'AFK';
              const showNudge = mission && isOrg && !m.state && !isYou;
              return (
                <div key={m.id} className={`slot-p ${m.state ? `s-${m.state}` : 's-none'}${isYou && !m.state ? ' is-you' : ''}`}>
                  <Avatar name={m.name} avatar={m.avatar} size={26} />
                  <span className="who"><b>{m.name}</b><span>{label}</span></span>
                  {showNudge ? (
                    <button type="button" className="nudge-sm" onClick={(e) => nudge(e, m)}>
                      {pinged.has(m.id) ? '✓' : 'Pinguj'}
                    </button>
                  ) : mission && isYou ? (
                    <span className="side">TY</span>
                  ) : mission && ev.created_by_user_id === m.id ? (
                    <span className="side">HOST</span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="readybar">
            <span className="segs" aria-hidden="true">
              {segStates(agg.squad).map((st, i) => <i key={i} className={st ? `on-${st}` : ''} />)}
            </span>
            <b>{responded}/{agg.squad.length} <span>DAŁO ZNAĆ</span></b>
          </div>
        </>
      ) : (
        <div className="readybar">
          <span className="small muted">{agg.voters.length} z {memberCount} dało znać</span>
        </div>
      )}

      {needsYou && slot && (
        <div className="hero-vote">
          <div className="hero-vote-label">
            <span>Ready check: <b>{formatSlotShort(slot)}</b></span>
            {otherSlots > 0 && <span className="more">+{otherSlots} w lobby</span>}
          </div>
          <div className="seg3">
            <button type="button" className={myPick === 'yes' ? 'on-yes' : ''} onClick={(e) => castVote(e, 'yes')}>READY</button>
            <button type="button" className={myPick === 'maybe' ? 'on-maybe' : ''} onClick={(e) => castVote(e, 'maybe')}>MOŻE</button>
            <button type="button" className={myPick === 'no' ? 'on-no' : ''} onClick={(e) => castVote(e, 'no')}>PAS</button>
          </div>
        </div>
      )}

      {!needsYou && (wInfo || meetTime) && (
        <div className="hero-grid">
          {wInfo && weather && (
            <div className="hero-tile">
              <WeatherIcon code={weather.code} size={24} className="hero-tile-icon" />
              <div>
                <div className="hero-tile-main">{weather.tempMax}°</div>
                <div className="hero-tile-sub">{wInfo.label}</div>
              </div>
            </div>
          )}
          {meetTime && (
            <div className="hero-tile">
              <IconClock size={24} className="hero-tile-icon" />
              <div>
                <div className="hero-tile-main">{meetTime}</div>
                <div className="hero-tile-sub">Godzina</div>
              </div>
            </div>
          )}
        </div>
      )}

      {peek && (
        <div className="peek">
          <Avatar name={peek.name} avatar={peek.avatar} size={26} />
          <span className="peek-body">
            <span className="peek-head"><b>{peek.name}</b><time>{timeAgo(peek.createdAt)}</time></span>
            <p>{peek.body}</p>
          </span>
        </div>
      )}
    </Link>
  );
}

