import { supabase } from './supabaseClient';

// Admin dodaje nowy adres do paczki przez Edge Function `invite-user`
// (Admin API + service_role po stronie serwera — klucza nie ma w przeglądarce).
// Zwraca komunikat błędu do pokazania użytkownikowi albo null przy sukcesie.
export async function inviteMember(email: string): Promise<string | null> {
  const { error } = await supabase.functions.invoke('invite-user', {
    body: { email: email.trim() },
  });
  if (!error) return null;

  // Przy statusie błędu supabase-js chowa ciało odpowiedzi w error.context (Response);
  // wyciągamy z niego nasz przyjazny komunikat, a jak się nie da — dajemy fallback.
  try {
    const ctx = (error as { context?: Response }).context;
    const bodyErr = ctx ? ((await ctx.json()) as { error?: string })?.error : undefined;
    if (bodyErr) return bodyErr;
  } catch {
    /* ignore */
  }
  return 'Nie udało się dodać. Spróbuj ponownie.';
}
