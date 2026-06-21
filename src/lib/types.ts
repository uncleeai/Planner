export type Availability = 'yes' | 'maybe' | 'no';

export type EventRow = {
  id: string;
  title: string;
  location: string | null;
  description: string | null;
  confirmed_slot_id: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type Slot = {
  id: string;
  event_id: string;
  starts_at: string;
  created_by: string | null;
  created_at: string;
};

export type Vote = {
  id: string;
  event_id: string;
  slot_id: string;
  participant_name: string;
  availability: Availability;
  created_at: string;
};
