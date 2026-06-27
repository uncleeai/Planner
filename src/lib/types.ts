export type Availability = 'yes' | 'maybe' | 'no';

export type EventRow = {
  id: string;
  title: string;
  location: string | null;
  description: string | null;
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
  created_by: string | null;
  created_by_user_id: string | null;
  created_at: string;
};

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

