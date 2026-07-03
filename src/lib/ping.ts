import { supabase } from './supabaseClient';

// „Pinguj kurwę": celowany Web Push do jednej osoby przez Edge Function `ping-user`
// (losowy cytat Majora). Limit po stronie klienta: 1 ping / osoba / wypad / 12h.
// Zwraca komunikat błędu do pokazania użytkownikowi albo null przy sukcesie.
export async function pingUser(eventId: string, targetUserId: string, targetName: string): Promise<string | null> {
  const key = `ping-${eventId}-${targetUserId}`;
  const last = Number(localStorage.getItem(key) ?? 0);
  if (Date.now() - last < 12 * 3600 * 1000) {
    return `${targetName} już dziś oberwał(a) pingiem. Daj odetchnąć.`;
  }
  const { error } = await supabase.functions.invoke('ping-user', {
    body: { target_user_id: targetUserId, event_id: eventId },
  });
  if (error) return 'Ping nie doszedł. Może nie ma włączonych powiadomień?';
  localStorage.setItem(key, String(Date.now()));
  return null;
}
