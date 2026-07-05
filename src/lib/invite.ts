import { supabase } from './supabaseClient';

// Admin dodaje nowy adres do paczki przez Edge Function `invite-user`
// (Admin API + service_role po stronie serwera — klucza nie ma w przeglądarce).
// Zwraca komunikat błędu do pokazania użytkownikowi albo null przy sukcesie.
//
// DIAGNOSTYKA: logujemy pełny szczegół do konsoli i zwracamy do UI konkretny
// komunikat (nazwa błędu + status + treść), żeby było widać CO dokładnie siada.
export async function inviteMember(email: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email: email.trim() },
    });

    if (!error) {
      console.log('[invite] OK', data);
      return null;
    }

    // Wyciągnij ile się da z błędu invoke.
    const name = (error as Error).name;
    const message = (error as Error).message;
    let status: number | undefined;
    let bodyText = '';
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      status = ctx.status;
      bodyText = await ctx.clone().text().catch(() => '');
    }
    let bodyErr: string | undefined;
    try {
      bodyErr = bodyText ? (JSON.parse(bodyText) as { error?: string }).error : undefined;
    } catch {
      /* body nie jest JSON-em */
    }

    console.error('[invite] błąd invoke', { name, message, status, bodyText, data });

    // Najpierw przyjazny komunikat z ciała odpowiedzi; jak go nie ma — surowy szczegół.
    if (bodyErr) return bodyErr;
    const detail = bodyText || message || 'nieznany błąd';
    return `Błąd: ${name}${status ? ` (${status})` : ''} — ${detail}`;
  } catch (e) {
    console.error('[invite] wyjątek', e);
    return `Wyjątek: ${e instanceof Error ? e.message : String(e)}`;
  }
}
