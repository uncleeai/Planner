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

