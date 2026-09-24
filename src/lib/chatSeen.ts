import { supabase } from './supabaseClient';

// „Nowe na czacie" — znacznik per urządzenie (localStorage), kiedy ostatnio
// otworzyłeś dany wypad. Dashboard świeci akcentową kropką przy wypadzie,
// w którym są wiadomości nowsze niż ten znacznik (cudze — własnych nie liczymy).

const key = (eventId: string) => `chat-seen-${eventId}`;

export function markChatSeen(eventId: string): void {
  try {
    localStorage.setItem(key(eventId), String(Date.now()));
  } catch { /* brak localStorage */ }
}

export function getChatSeen(eventId: string): number {
  try {
    return Number(localStorage.getItem(key(eventId)) ?? 0);
  } catch {
    return 0;
  }
}

// To samo dla serwera (tabela chat_push_state): otwarty czat = bez pushy o nowych
// wiadomościach, a „przeczytane" zeruje 10-minutową przerwę między pushami.
// Fire-and-forget — to tylko optymalizacja powiadomień.
export function reportChatOpen(eventId: string, open: boolean): void {
  void supabase.rpc('mark_chat_seen', { p_event: eventId, p_open: open }).then(() => {}, () => {});
}
