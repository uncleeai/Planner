// Edge Function: wysyła Web Push, gdy do tabeli `events` trafi nowy wiersz.
// Wyzwalana przez Database Webhook (Supabase → Database → Webhooks) na INSERT do
// public.events. Rozsyła powiadomienie do wszystkich subskrypcji poza twórcą wypadu.
//
// Wdrożenie:
//   supabase functions deploy notify-new-event --no-verify-jwt
//   (albo wklej kod w panelu: Edge Functions → notify-new-event → Code → Deploy)
// Sekrety (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (np. mailto:ty@example.com).
//   WEBHOOK_SECRET — OPCJONALNY. Jeśli ustawiony, webhook musi przysłać ten sam sekret
//   w query param `?key=...` ALBO w nagłówku `x-webhook-secret`. Jeśli pusty — bez kontroli.
// SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY są dostępne automatycznie.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

type EventRecord = {
  id: string;
  title: string;
  location: string | null;
  created_by: string | null;
  created_by_user_id: string | null;
};

type Sub = { endpoint: string; p256dh: string; auth: string };

Deno.serve(async (req) => {
  // Opcjonalna ochrona: sekret w query param `?key=` lub nagłówku `x-webhook-secret`.
  if (WEBHOOK_SECRET) {
    const url = new URL(req.url);
    const provided = url.searchParams.get('key') ?? req.headers.get('x-webhook-secret');
    if (provided !== WEBHOOK_SECRET) {
      return new Response('unauthorized', { status: 401 });
    }
  }

  const payload = await req.json().catch(() => null);
  const record: EventRecord | null = payload?.record ?? payload?.new ?? null;
  if (!record || (payload?.type && payload.type !== 'INSERT')) {
    return new Response('ignored', { status: 200 });
  }

  // Subskrypcje wszystkich poza twórcą wypadu.
  let query = supabase.from('push_subscriptions').select('endpoint, p256dh, auth');
  if (record.created_by_user_id) query = query.neq('user_id', record.created_by_user_id);
  const { data: subs, error } = await query;
  if (error) return new Response(error.message, { status: 500 });

  const host = record.created_by?.trim() || 'Ktoś';
  const where = record.location?.trim();
  const message = JSON.stringify({
    title: record.title,
    body: `${host} hostuje${where ? ` • ${where}` : ''}`,
    url: `/event/${record.id}`,
    tag: `event-${record.id}`,
  });

  const list = (subs ?? []) as Sub[];
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

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  return new Response(JSON.stringify({ sent, removed: dead.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
