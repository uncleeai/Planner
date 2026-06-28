'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import { getEventStatus, formatSlotRange, slotEndMs } from '@/lib/types';
import type { EventRow, Slot, Vote, Profile, Comment } from '@/lib/types';
import { Avatar, AvatarStack, type Person } from '@/components/Avatar';
import ProfileMenu from '@/components/ProfileMenu';
import SettingsMenu from '@/components/SettingsMenu';
import SlotRangeInput from '@/components/SlotRangeInput';
import { buildSlotTimes, EMPTY_SLOT_RANGE, type SlotRange } from '@/lib/slotInput';
import { useTransitionNavigate } from '@/lib/transition';
import { getCache, setCache } from '@/lib/dataCache';
import { IconCalendar, IconPin, IconChevron, IconBulb, IconMessageSquare } from '@/components/icons';

function progressColor(p: number): string {
  return p >= 67 ? 'var(--yes)' : p >= 34 ? 'var(--maybe)' : 'var(--no)';
}
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

type Agg = {
  voters: Person[];
  percent: number;
  slot: Slot | null;           // USTALONY termin (do formatu zakresu/całodniowego)
};
const EMPTY_AGG: Agg = { voters: [], percent: 0, slot: null };

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

type ActivityItem = {
  id: string;
  eventId: string;
  eventTitle: string;
  name: string;
  avatar: string | null;
  body: string;
  createdAt: string;
};

// Wysokość jednego „slajdu" — musi być spójna z .activity-slide w globals.css.
const SLIDE_H = 64;

// Pastylka „liquid glass": jeden komentarz na raz na pionowym torze (transform —
// płynnie, bez remountu). Przewijana palcem; gdy nikt nie dotyka, sama rotuje.
function ActivityPill({ items, onOpen }: { items: ActivityItem[]; onOpen: (eventId: string) => void }) {
  const [idx, setIdx] = useState(0);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(0);
  const startY = useRef<number | null>(null);
  const swallowClick = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (idx > items.length - 1) setIdx(0);
  }, [items.length, idx]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // Auto-rotacja: pojedynczy timeout przeplanowywany po KAŻDEJ zmianie idx i wstrzymywany
  // na czas przeciągania. Dzięki temu Twój swipe resetuje zegar (auto nie wystrzeli zaraz
  // po geście ani w trakcie dojazdu).
  useEffect(() => {
    if (items.length <= 1 || dragging) return;
    const t = window.setTimeout(() => setIdx((i) => (i + 1) % items.length), 5000);
    return () => window.clearTimeout(t);
  }, [idx, items.length, dragging]);

  const n = items.length;
  const safeIdx = Math.min(idx, n - 1);
  if (n === 0) return null;

  const onTouchStart = (e: React.TouchEvent) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startY.current = e.touches[0].clientY;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    let dy = e.touches[0].clientY - startY.current;
    // Najwyżej JEDEN slajd na gest (żeby szybki, długi ruch nie przelatywał przez kilka),
    // i nie odsłaniaj pustki za krańcami toru.
    const maxDown = Math.min(SLIDE_H, safeIdx * SLIDE_H);
    const maxUp = Math.max(-SLIDE_H, -((n - 1) - safeIdx) * SLIDE_H);
    dy = Math.max(maxUp, Math.min(maxDown, dy));
    dragRef.current = dy;
    setDrag(dy);
  };
  const onTouchEnd = () => {
    startY.current = null;
    const dy = dragRef.current;
    dragRef.current = 0;

    const TH = SLIDE_H / 3;
    let target = safeIdx;
    if (dy <= -TH && safeIdx < n - 1) target = safeIdx + 1;
    else if (dy >= TH && safeIdx > 0) target = safeIdx - 1;
    if (target !== safeIdx || Math.abs(dy) > 6) swallowClick.current = true;

    // Najpierw włącz transicję (tor zostaje w pozycji z palca), a docelową pozycję
    // ustaw dopiero w następnej klatce — inaczej zmiana transformu w tej samej klatce
    // co transition:none→0.38s skacze bez animacji („teleport").
    setDragging(false);
    rafRef.current = requestAnimationFrame(() => {
      setDrag(0);
      setIdx(target);
    });
  };
  const onClick = () => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    onOpen(items[safeIdx].eventId);
  };

  const translate = -safeIdx * SLIDE_H + drag;

  return (
    <div className="activity-pill">
      <div
        className="activity-pill-touch"
        style={{ height: SLIDE_H }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={onClick}
        role="button"
        tabIndex={0}
      >
        <div
          className="activity-track"
          style={{ transform: `translateY(${translate}px)`, transition: dragging ? 'none' : undefined }}
        >
          {items.map((it) => (
            <div key={it.id} className="activity-slide" style={{ height: SLIDE_H }}>
              <Avatar name={it.name} avatar={it.avatar} size={34} />
              <div className="activity-body">
                <div className="activity-head">
                  <span className="activity-author">{it.name}</span>
                  <span className="activity-event">· {it.eventTitle}</span>
                  <span className="activity-time">{timeAgo(it.createdAt)}</span>
                </div>
                <p className="activity-text">{it.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      {n > 1 && (
        <div className="activity-dots">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              className={`activity-dot${i === safeIdx ? ' on' : ''}`}
              aria-label={`Komentarz ${i + 1}`}
              onClick={() => setIdx(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const navigate = useTransitionNavigate();
  const { userId, displayName } = useAuth();

  // Seed z cache (jeśli wracamy z wypadu) — lista pojawia się od razu, bez „Wczytuję…".
  const cached = getCache();
  const [events, setEvents] = useState<EventRow[]>(() => cached?.events ?? []);
  const [slots, setSlots] = useState<Slot[]>(() => cached?.slots ?? []);
  const [votes, setVotes] = useState<Vote[]>(() => cached?.votes ?? []);
  const [profiles, setProfiles] = useState<Profile[]>(() => cached?.profiles ?? []);
  const [recentComments, setRecentComments] = useState<Comment[]>([]);
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
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
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
      supabase.from('comments').select('*').order('created_at', { ascending: false }).limit(3),
    ]);
    const events = (ev ?? []) as EventRow[];
    const slots = (sl ?? []) as Slot[];
    const votes = (vo ?? []) as Vote[];
    const profiles = (pr ?? []) as Profile[];
    setEvents(events);
    setSlots(slots);
    setVotes(votes);
    setProfiles(profiles);
    setRecentComments((cm ?? []) as Comment[]);
    setCache({ events, slots, votes, profiles }); // zaliczka dla strony wypadu
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => load())
      .subscribe();
    // Zmiany w `events` łapie JEDNA globalna subskrypcja (NewEventToast) i rozgłasza je
    // tym zdarzeniem. Dwa kanały Realtime na tej samej tabeli gubiły dostawy (toast
    // łapał tylko pierwszy wypad), więc dashboard nie subskrybuje `events` osobno.
    const onEvents = () => load();
    window.addEventListener('planner:events-changed', onEvents);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('planner:events-changed', onEvents);
    };
  }, [load]);

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

  const { open, upcoming, expired, past } = useMemo(() => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const open: EventRow[] = [];
    const upcoming: EventRow[] = [];
    const expired: EventRow[] = [];
    const past: EventRow[] = [];

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

    const confirmedDateMap = new Map<string, string>();
    const expiredAtMap = new Map<string, number>();
    const memberIds = profiles.map((p) => p.id);

    for (const ev of events) {
      const evSlots = slotsByEvent.get(ev.id) ?? [];
      const evVotes = votesByEvent.get(ev.id) ?? [];
      const status = getEventStatus(ev, evSlots, evVotes, memberIds);

      // Ustalony (ręcznie LUB wszyscy dali znać) → Nadchodzące / Bylim już.
      // Liczone od KOŃCA terminu (zakres/cały dzień trwa do końca ostatniego dnia).
      if (status.settled && status.date) {
        confirmedDateMap.set(ev.id, status.date);
        const settledSlot = evSlots.find((s) => s.id === status.slotId);
        const endMs = settledSlot ? slotEndMs(settledSlot) : new Date(status.date).getTime();
        if (endMs >= now) {
          upcoming.push(ev);
        } else if (endMs >= now - 7 * DAY) {
          // „Bylim już" pokazujemy do tygodnia po wypadzie; starsze → archiwum
          // (pomijamy z listy, zostają w bazie pod przyszły widok archiwum).
          past.push(ev);
        }
        continue;
      }

      // Nieustalony: czy jest jeszcze jakiś termin, który się nie skończył?
      const latest = evSlots.reduce((m, s) => Math.max(m, slotEndMs(s)), 0);
      const hasFuture = evSlots.some((s) => slotEndMs(s) > now);

      if (evSlots.length > 0 && !hasFuture) {
        // Wszystkie terminy minęły, nikt nie ustalił = „Nie ustalono". Pokazujemy do 24h
        // po ostatnim terminie, potem archiwizujemy (pomijamy → znika z listy, zostaje w bazie).
        if (latest >= now - DAY) {
          expired.push(ev);
          expiredAtMap.set(ev.id, latest);
        }
      } else {
        // Ma przyszły termin albo brak terminów → wciąż „W trakcie".
        open.push(ev);
      }
    }

    upcoming.sort((a, b) => {
      const da = new Date(confirmedDateMap.get(a.id)!).getTime();
      const db = new Date(confirmedDateMap.get(b.id)!).getTime();
      return da - db;
    });

    past.sort((a, b) => {
      const da = new Date(confirmedDateMap.get(a.id)!).getTime();
      const db = new Date(confirmedDateMap.get(b.id)!).getTime();
      return db - da;
    });

    expired.sort((a, b) => (expiredAtMap.get(b.id) ?? 0) - (expiredAtMap.get(a.id) ?? 0));

    return { open, upcoming, expired, past };
  }, [events, slots, votes, profiles]);

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
      result.set(ev.id, { voters, percent, slot });
    }
    return result;
  }, [events, slots, votes, profiles]);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const activityItems = useMemo<ActivityItem[]>(
    () =>
      recentComments.map((c) => {
        const ev = events.find((e) => e.id === c.event_id);
        const prof = c.user_id ? profileById.get(c.user_id) : undefined;
        return {
          id: c.id,
          eventId: c.event_id,
          eventTitle: ev?.title ?? 'wypad',
          name: prof?.display_name ?? c.author_name,
          avatar: prof?.avatar ?? null,
          body: c.body,
          createdAt: c.created_at,
        };
      }),
    [recentComments, events, profileById],
  );

  return (
    <main className="glass-page">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, position: 'relative', zIndex: 2 }}>
        {/* Logo */}
        <div style={{
          width: 38, height: 38, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="5" ry="5" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>

        {/* Nazwa + powitanie */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#ffffff', lineHeight: 1.2 }}>
            Wypad.exe
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.3, marginTop: 1 }}>
            Hej, {displayName} 👋
          </div>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <SettingsMenu />
          <ProfileMenu />
        </div>
      </header>

      {events.length > 0 && (
        <button className="cta-gradient" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Anuluj' : '+ Nowy wypad'}
        </button>
      )}

      {events.length > 0 && (
        <div className={`form-collapse ${showForm ? 'open' : ''}`}>
          <form className="card" onSubmit={createEvent}>
            <h2>Nowy wypad</h2>
            <div className="field">
              <label htmlFor="title">Nazwa</label>
              <input
                id="title"
                type="text"
                placeholder="np. Piwo w piątek, baskecik…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                ref={titleInputRef}
              />
            </div>
            <div className="field">
              <label htmlFor="location">Miejsce (opcjonalnie)</label>
              <input
                id="location"
                type="text"
                placeholder="np. u Kubusia, u twojej starej…"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="description">Opis (opcjonalnie)</label>
              <textarea
                id="description"
                placeholder="np. co bierzemy, plan xd, szczegóły…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="field">
              <SlotRangeInput value={slotDraft} onChange={setSlotDraft} idPrefix="create" />
            </div>

            {error && <p className="small" style={{ color: 'var(--no)' }}>{error}</p>}
            <button type="submit" disabled={!title.trim() || !slotDraft.od || busy} style={{ width: '100%' }}>
              {busy ? 'Tworzę…' : 'Utwórz wypad'}
            </button>
          </form>
        </div>
      )}

      {activityItems.length > 0 && (
        <section className="activity">
          <div className="section-label">Ostatnia aktywność</div>
          <ActivityPill items={activityItems} onOpen={(id) => navigate(`/event/${id}`, 'forward')} />
        </section>
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
                <h2 key="title" style={{ margin: '0 0 4px', textAlign: 'center' }}>Brak wypadów</h2>,
                <p key="desc" style={{ color: 'var(--muted)', margin: '0 auto 18px', maxWidth: '30ch', textAlign: 'center' }}>
                  Zaproponuj pierwszy termin i wyślij znajomym.
                </p>,
                <button
                  key="cta"
                  onClick={() => setShowForm(true)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.12)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    padding: '12px 24px',
                    borderRadius: '16px',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    margin: '0 auto',
                    display: 'block'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)' }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)' }}
                >
                  + Nowy wypad
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
                  <h2 key="h" style={{ margin: 0 }}>Nowy wypad</h2>,
                  <div className="field" key="title">
                    <label htmlFor="title">Nazwa</label>
                    <input
                      id="title"
                      type="text"
                      placeholder="np. Piwo w piątek, wyjazd w góry…"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      ref={titleInputRef}
                    />
                  </div>,
                  <div className="field" key="loc">
                    <label htmlFor="location">Miejsce (opcjonalnie)</label>
                    <input
                      id="location"
                      type="text"
                      placeholder="np. u Kuby, Zakopane…"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  </div>,
                  <div className="field" key="desc">
                    <label htmlFor="description">Opis (opcjonalnie)</label>
                    <textarea
                      id="description"
                      placeholder="np. co bierzemy, plan, szczegóły…"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>,
                  <div className="field" key="date">
                    <SlotRangeInput value={slotDraft} onChange={setSlotDraft} idPrefix="create-empty" />
                  </div>,
                  error ? <p key="err" className="small" style={{ color: 'var(--no)' }}>{error}</p> : null,
                  <button key="submit" type="submit" disabled={!title.trim() || !slotDraft.od || busy} style={{ width: '100%' }}>
                    {busy ? 'Tworzę…' : 'Utwórz wypad'}
                  </button>,
                  <button
                    key="cancel"
                    type="button"
                    className="ghost"
                    onClick={() => setShowForm(false)}
                    style={{ width: '100%', marginTop: -4 }}
                  >
                    Anuluj
                  </button>,
                ].filter(Boolean).map((child, i) => (
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

      <Section title="W trakcie" events={open} agg={aggByEvent} variant="open" />
      <Section title="Nadchodzące" events={upcoming} agg={aggByEvent} variant="upcoming" />
      <Section title="Nie ustalono" events={expired} agg={aggByEvent} variant="expired" muted />
      <Section title="Bylim już" events={past} agg={aggByEvent} variant="past" muted />

      {!loading && events.length > 0 && quote && (
        <div 
          className="tip-banner" 
          onClick={handleNextQuote}
          style={{ cursor: 'pointer', userSelect: 'none' }}
          title="Kliknij, aby wylosować kolejny cytat"
        >
          <IconBulb size={20} className="tip-icon" />
          <span className={`quote-text ${fade ? 'fade-in' : 'fade-out'}`}>{quote}</span>
        </div>
      )}
    </main>
  );
}

function Section({
  title,
  events,
  agg,
  variant,
  muted,
}: {
  title: string;
  events: EventRow[];
  agg: Map<string, Agg>;
  variant: 'open' | 'upcoming' | 'expired' | 'past';
  muted?: boolean;
}) {
  if (events.length === 0) return null;
  return (
    <section>
      <div className={`section-label${muted ? ' faded' : ''}`}>{title}</div>
      {events.map((ev) => (
        <EventCard key={ev.id} ev={ev} agg={agg.get(ev.id) ?? EMPTY_AGG} variant={variant} />
      ))}
    </section>
  );
}

function EventCard({ ev, agg, variant }: { ev: EventRow; agg: Agg; variant: 'open' | 'upcoming' | 'expired' | 'past' }) {
  const navigate = useTransitionNavigate();
  const href = `/event/${ev.id}`;
  return (
    <Link
      href={href}
      className="event-rich"
      onClick={(e) => {
        // Pozwól na otwieranie w nowej karcie (Cmd/Ctrl/środkowy przycisk); inaczej animowany slide.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(href, 'forward');
      }}
    >
      <div className="event-rich-head">
        <span className="event-rich-title">{ev.title}</span>
        <IconChevron size={18} className="row-chevron" />
      </div>

      {ev.location && (
        <div className="event-meta" style={{ marginTop: 6 }}>
          <IconPin size={14} /> {ev.location}
        </div>
      )}

      <div className="event-meta-row">
        {variant === 'expired' ? (
          <span className="event-meta"><IconCalendar size={14} /> Termin minął</span>
        ) : agg.slot ? (
          <span className="event-meta"><IconCalendar size={14} /> {formatSlotRange(agg.slot)}</span>
        ) : (
          <span className="event-meta"><IconCalendar size={14} /> Zbieramy terminy</span>
        )}
      </div>

      <div className="event-rich-foot">
        {agg.voters.length > 0 ? (
          <AvatarStack people={agg.voters} size={28} />
        ) : (
          <span className="small muted">Jeszcze nikt nie dał znać</span>
        )}

        {variant === 'open' ? (
          <div className="progress-inline-wrap">
            <div className="progress">
              <div
                className="progress-bar"
                style={{ width: `${agg.percent}%` }}
              />
            </div>
            <span className="progress-label">
              {agg.percent}% <span className="label-sub">dało znać</span>
            </span>
          </div>
        ) : (
          <>
            <span className="spacer" />
            {variant === 'past' && <span className="badge">✓ Bylim już</span>}
            {variant === 'upcoming' && <span className="badge">Ustalone</span>}
            {variant === 'expired' && <span className="badge badge-muted">Nie ustalono</span>}
          </>
        )}
      </div>
    </Link>
  );
}
