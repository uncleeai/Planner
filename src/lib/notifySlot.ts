import { supabase } from './supabaseClient';

// Push „nowy / zmieniony termin — zagłosuj" do osób bez głosu na ten termin.
// Fire-and-forget: Edge Function `notify-slot` sama sprawdza uprawnienia i pilnuje
// przerwy (jeden push na wypad na 10 min).
export function notifySlot(slotId: string, kind: 'added' | 'changed'): void {
  void supabase.functions.invoke('notify-slot', { body: { slot_id: slotId, kind } });
}
