import { supabase } from './supabaseClient';

// Push „nowy komentarz" do paczki (poza autorem). Fire-and-forget: Edge Function
// `notify-comment` sama czyta treść i autora z bazy po comment_id i sprawdza,
// czy woła ją autor — z klienta lecą wyłącznie identyfikatory, nic do podszycia.
export function notifyComment(commentId: string): void {
  void supabase.functions.invoke('notify-comment', { body: { comment_id: commentId } });
}
