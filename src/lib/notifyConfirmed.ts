import { supabase } from './supabaseClient';

// Push „✓ GRAMY" do paczki po klepnięciu terminu (ręczny LOCK IN albo komplet
// głosów). Fire-and-forget: Edge Function `notify-confirmed` sama pilnuje
// (atomowy stempel events.confirmed_notified_at), żeby wysłać tylko RAZ na
// wypad — więc nadgorliwe wywołania z klienta są tanie i bezpieczne.
export function notifyConfirmed(eventId: string, slotId: string | null): void {
  void supabase.functions.invoke('notify-confirmed', {
    body: { event_id: eventId, slot_id: slotId },
  });
}
