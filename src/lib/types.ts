export type Availability = 'yes' | 'maybe' | 'no';

export type EventRow = {
  id: string;
  title: string;
  location: string | null;
  description: string | null;
  image_url: string | null;
  latitude: number | null;
  longitude: number | null;
  emoji: string | null;
  created_by: string | null;
  created_by_user_id: string | null;
  confirmed_slot_id: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type Slot = {
  id: string;
  event_id: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  created_by: string | null;
  created_by_user_id: string | null;
  created_at: string;
};

// Efektywny koniec terminu w ms — do logiki „nadchodzące / odbyte / minęło".
// Zakres i cały dzień trwają do KOŃCA ostatniego dnia (a nie od pierwszego momentu).
export function slotEndMs(slot: Pick<Slot, 'starts_at' | 'ends_at' | 'all_day'>): number {
  if (slot.ends_at) {
    const d = new Date(slot.ends_at);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  if (slot.all_day) {
    const d = new Date(slot.starts_at);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }
  return new Date(slot.starts_at).getTime();
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'long' });
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', {
    weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}
function fmtTimeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

// Krótki, mono-przyjazny zapis terminu (rozkładowy): „SOB 12.07",
// zakres „1-2.08" albo „30.07-2.08". Do wierszy list i chipów.
const DOW_SHORT = ['NIE', 'PON', 'WT', 'ŚR', 'CZW', 'PT', 'SOB'];
export function formatSlotShort(slot: Pick<Slot, 'starts_at' | 'ends_at'>): string {
  const s = new Date(slot.starts_at);
  const mm = (d: Date) => String(d.getMonth() + 1).padStart(2, '0');
  if (slot.ends_at) {
    const e = new Date(slot.ends_at);
    return s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
      ? `${s.getDate()}-${e.getDate()}.${mm(s)}`
      : `${s.getDate()}.${mm(s)}-${e.getDate()}.${mm(e)}`;
  }
  return `${DOW_SHORT[s.getDay()]} ${s.getDate()}.${mm(s)}`;
}

// Ludzki opis terminu wg modelu (moment / cały dzień / zakres / zakres z godziną).
export function formatSlotRange(slot: Pick<Slot, 'starts_at' | 'ends_at' | 'all_day'>): string {
  if (slot.ends_at) {
    const range = `${fmtDateShort(slot.starts_at)} – ${fmtDateShort(slot.ends_at)}`;
    return slot.all_day ? range : `${range}, ${fmtTimeOnly(slot.starts_at)}`;
  }
  if (slot.all_day) return fmtDateShort(slot.starts_at);
  return fmtDateTime(slot.starts_at);
}

export type Vote = {
  id: string;
  event_id: string;
  slot_id: string;
  user_id: string | null;
  participant_name: string;
  availability: Availability;
  created_at: string;
};

export type Profile = {
  id: string;
  display_name: string;
  avatar: string | null;
  created_at: string;
  updated_at: string;
};

export type Comment = {
  id: string;
  event_id: string;
  user_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
};

export function getConfirmedSlot(
  eventSlots: Slot[],
  eventVotes: Vote[]
): { slotId: string | null; confirmedAt: string | null } {
  if (eventSlots.length === 0) return { slotId: null, confirmedAt: null };

  let bestSlot: Slot | null = null;
  let maxYes = 0;
  let maxMaybe = 0;

  for (const slot of eventSlots) {
    const slotVotes = eventVotes.filter((v) => v.slot_id === slot.id);
    const yesCount = slotVotes.filter((v) => v.availability === 'yes').length;
    const maybeCount = slotVotes.filter((v) => v.availability === 'maybe').length;

    if (yesCount > 0) {
      if (
        !bestSlot ||
        yesCount > maxYes ||
        (yesCount === maxYes && maybeCount > maxMaybe) ||
        (yesCount === maxYes && maybeCount === maxMaybe && new Date(slot.starts_at).getTime() < new Date(bestSlot.starts_at).getTime())
      ) {
        bestSlot = slot;
        maxYes = yesCount;
        maxMaybe = maybeCount;
      }
    }
  }

  if (bestSlot) {
    return { slotId: bestSlot.id, confirmedAt: bestSlot.starts_at };
  }
  return { slotId: null, confirmedAt: null };
}

export type EventStatus = {
  settled: boolean;                 // czy wypad jest ustalony (ma finalny termin)
  source: 'manual' | 'auto' | null; // jak: organizator ręcznie / automat „wszyscy dali znać"
  slotId: string | null;            // ustalony slot
  date: string | null;              // data ustalonego slotu
  leadingSlotId: string | null;     // prowadzący termin (informacyjnie, gdy nieustalony)
  leadingDate: string | null;
  allVoted: boolean;                // czy wszyscy z paczki oddali głos
};

/**
 * Status ustalenia wypadu. Dwie drogi do „ustalone":
 *  A) ręcznie — organizator zapisał `confirmed_slot_id` (ma pierwszeństwo, jest sticky),
 *  B) automatycznie — WSZYSCY z paczki (memberIds) dali znać i jest prowadzący termin
 *     (≥1 „Wchodzę"); liczone na żywo, więc zmiana głosu przestawia/cofa ustalenie.
 * Gdy nieustalony — zwracamy prowadzący termin do pokazania jako podpowiedź.
 */
export function getEventStatus(
  event: Pick<EventRow, 'confirmed_slot_id' | 'confirmed_at'>,
  eventSlots: Slot[],
  eventVotes: Vote[],
  memberIds: string[],
): EventStatus {
  const leading = getConfirmedSlot(eventSlots, eventVotes);
  const voterIds = new Set(eventVotes.map((v) => v.user_id).filter(Boolean) as string[]);
  const allVoted = memberIds.length > 0 && memberIds.every((id) => voterIds.has(id));

  // A) Ręczne ustalenie organizatora — pierwszeństwo.
  if (event.confirmed_slot_id) {
    const slot = eventSlots.find((s) => s.id === event.confirmed_slot_id);
    return {
      settled: true,
      source: 'manual',
      slotId: event.confirmed_slot_id,
      date: event.confirmed_at ?? slot?.starts_at ?? null,
      leadingSlotId: leading.slotId,
      leadingDate: leading.confirmedAt,
      allVoted,
    };
  }

  // B) Automat — komplet głosów + jest prowadzący termin.
  if (allVoted && leading.slotId) {
    return {
      settled: true,
      source: 'auto',
      slotId: leading.slotId,
      date: leading.confirmedAt,
      leadingSlotId: leading.slotId,
      leadingDate: leading.confirmedAt,
      allVoted,
    };
  }

  // Wciąż zbieramy głosy.
  return {
    settled: false,
    source: null,
    slotId: null,
    date: null,
    leadingSlotId: leading.slotId,
    leadingDate: leading.confirmedAt,
    allVoted,
  };
}

