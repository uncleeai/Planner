import { supabase } from './supabaseClient';

// „Pinguj kurwę": celowany Web Push do jednej osoby przez Edge Function `ping-user`
// (losowy cytat Majora). Limit po stronie klienta: 1 ping / osoba / wypad / 12h.
// Zwraca komunikat błędu do pokazania użytkownikowi albo null przy sukcesie.
//
// DIAGNOSTYKA: pełny szczegół do konsoli, a do UI konkretny powód (status + treść),
// żeby było widać CO siada — brak subskrypcji vs. odrzucona wysyłka (np. zły klucz VAPID).
export async function pingUser(eventId: string, targetUserId: string, targetName: string): Promise<string | null> {
  const key = `ping-${eventId}-${targetUserId}`;
  const last = Number(localStorage.getItem(key) ?? 0);
  if (Date.now() - last < 12 * 3600 * 1000) {
    return `${targetName} już dziś oberwał(a) pingiem. Daj odetchnąć.`;
  }

  try {
    const { data, error } = await supabase.functions.invoke('ping-user', {
      body: { target_user_id: targetUserId, event_id: eventId },
    });

    if (error) {
      const name = (error as Error).name;
      const message = (error as Error).message;
      let status: number | undefined;
      let bodyText = '';
      const ctx = (error as { context?: unknown }).context;
      if (ctx instanceof Response) {
        status = ctx.status;
        bodyText = await ctx.clone().text().catch(() => '');
      }
      let reason: string | undefined;
      try {
        const parsed = bodyText ? (JSON.parse(bodyText) as { error?: string; reason?: string }) : null;
        reason = parsed?.error ?? parsed?.reason;
      } catch {
        /* body nie jest JSON-em */
      }
      console.error('[ping] błąd invoke', { name, message, status, bodyText, data });

      // Częsty przypadek: 502 all-failed = subskrypcje zrobione innym kluczem VAPID.
      if (reason === 'all-failed') {
        return `${targetName} ma nieaktualną subskrypcję (musi wyłączyć i włączyć powiadomienia na nowo).`;
      }
      return `Ping padł: ${name}${status ? ` (${status})` : ''} — ${reason ?? bodyText ?? message}`;
    }

    const d = data as { sent?: number; reason?: string } | null;
    if (d && d.sent === 0) {
      return d.reason === 'no-subscriptions'
        ? `${targetName} nie ma włączonych powiadomień.`
        : `Nic nie wysłano (${d.reason ?? 'brak powodu'}).`;
    }

    localStorage.setItem(key, String(Date.now()));
    return null;
  } catch (e) {
    console.error('[ping] wyjątek', e);
    return `Ping — wyjątek: ${e instanceof Error ? e.message : String(e)}`;
  }
}
