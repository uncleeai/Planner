// Edge Function: „✓ GRAMY" — Web Push do CAŁEJ paczki, gdy termin wypadu został
// klepnięty (ręczny LOCK IN organizatora albo automat przy komplecie głosów).
// Wywoływana z klienta (supabase.functions.invoke); body: { event_id, slot_id }.
// Idempotentna po stronie serwera: atomowy stempel events.confirmed_notified_at
// gwarantuje JEDNO powiadomienie na wypad, więc klient może wołać „na zapas".
//
// Wdrożenie:
//   supabase functions deploy notify-confirmed
//   (DOMYŚLNIE z weryfikacją JWT — jak ping-user; NIE dodawaj --no-verify-jwt.)
// Sekrety: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (te same co pozostałe).

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

type Sub = { endpoint: string; p256dh: string; auth: string; user_id: string | null };
type Slot = { starts_at: string; ends_at: string | null; all_day: boolean };

// CORS — funkcję woła przeglądarka (supabase.functions.invoke); preflight OPTIONS
// i odpowiedzi muszą nieść nagłówki CORS, inaczej invoke rzuca błąd.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// Kto woła — z JWT (platforma już go zweryfikowała); wykluczamy go z wysyłki,
// bo właśnie klepnął / oddał kompletujący głos i wie najlepiej.
function callerId(req: Request): string | null {
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

// Mono-format daty jak w apce: „CZW 23.07 · 23:30" / „7–9.07" / „CZW 23.07".
function formatSlot(slot: Slot): string {
  const tz = 'Europe/Warsaw';
  const d = new Date(slot.starts_at);
  const dow = d
    .toLocaleDateString('pl-PL', { weekday: 'short', timeZone: tz })
    .replace('.', '')
    .toUpperCase();
  const dm = d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric', timeZone: tz }).replace(' ', '');
  if (slot.ends_at) {
    const e = new Date(slot.ends_at);
    const edm = e.toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric', timeZone: tz }).replace(' ', '');
    return `${dm}–${edm}`;
  }
  if (slot.all_day) return `${dow} ${dm}`;
  const time = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  return `${dow} ${dm} · ${time}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const body = await req.json().catch(() => null);
  const eventId: string | undefined = body?.event_id;
  const slotId: string | null = body?.slot_id ?? null;
  if (!eventId) return json({ error: 'event_id jest wymagane' }, 400);

  // Atomowy stempel: tylko PIERWSZE wywołanie dla wypadu przechodzi dalej.
  const { data: stamped, error: stampErr } = await supabase
    .from('events')
    .update({ confirmed_notified_at: new Date().toISOString() })
    .eq('id', eventId)
    .is('confirmed_notified_at', null)
    .select('id, title, location')
    .maybeSingle();
  if (stampErr) return json({ error: stampErr.message }, 500);
  if (!stamped) return json({ sent: 0, reason: 'already-notified' });

  let when = '';
  if (slotId) {
    const { data: slot } = await supabase
      .from('slots')
      .select('starts_at, ends_at, all_day')
      .eq('id', slotId)
      .maybeSingle();
    if (slot) when = formatSlot(slot as Slot);
  }

  const { data: subs, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id');
  if (subErr) return json({ error: subErr.message }, 500);

  const actor = callerId(req);
  const list = ((subs ?? []) as Sub[]).filter((s) => !actor || s.user_id !== actor);
  if (list.length === 0) return json({ sent: 0, reason: 'no-subscriptions' });

  const message = JSON.stringify({
    title: `✅ Termin ustalony: ${stamped.title}`,
    body: [when, stamped.location].filter(Boolean).join(' · ') || 'Termin ustalony!',
    url: `/event/${stamped.id}`,
    tag: `confirmed-${stamped.id}`,
  });

  const results = await Promise.allSettled(
    list.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        message,
      ),
    ),
  );

  // Sprzątanie martwych subskrypcji (404/410 = endpoint wygasł / wypisano się).
  const dead: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const code = (r.reason as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) dead.push(list[i].endpoint);
    }
  });
  if (dead.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', dead);
  }

  return json({ sent: results.filter((r) => r.status === 'fulfilled').length, removed: dead.length });
});
