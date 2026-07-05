// Edge Function: „Pinguj kurwę" — celowany Web Push do JEDNEJ osoby, która nie dała
// znać w wypadzie. Treść to losowy cytat Majora, więc przypominajka jest śmieszna,
// a nie pasywno-agresywna. Wywoływana z klienta (supabase.functions.invoke) przez
// organizatora wypadu; body: { target_user_id, event_id }.
//
// Wdrożenie:
//   supabase functions deploy ping-user
//   (DOMYŚLNIE z weryfikacją JWT — wywołać może tylko zalogowany użytkownik apki;
//    to celowe, NIE dodawaj --no-verify-jwt jak przy webhookowych funkcjach.)
// Sekrety: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (te same co pozostałe).
// SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY są dostępne automatycznie.

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

// Trzymaj w synchronie z MAJOR_QUOTES w src/app/page.tsx (MOTD).
const MAJOR_QUOTES = [
  '„Żeby żyć trzeba jeść, żeby jeść trzeba żyć…”',
  '„Piwko to jest jak rosół…”',
  '„Nie ma takiego czegoś, żeby było coś…”',
  '„Ugułem trzeba być sobom”',
  '„Czego ty krzyczysz? Czego ty krzyczysz kurwa, Knurze!”',
  '„Niektóre firmy upadają, bo mają upadek. I jest wzlot.”',
  '„Można to zabrońnić!”',
  '„Tak halo?”',
  '„Muszę mieć lepszą wiadomość!”',
  'W którym lesie ty byłeś? Gdzie schowałeś SUOMĘ?',
  'Odpierdol się od Mickiewicza.',
  '„Ptasibrzuch jestem!”',
] as const;

type Sub = { endpoint: string; p256dh: string; auth: string };

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const body = await req.json().catch(() => null);
  const targetUserId: string | undefined = body?.target_user_id;
  const eventId: string | undefined = body?.event_id;
  if (!targetUserId || !eventId) return json({ error: 'target_user_id i event_id są wymagane' }, 400);

  const { data: event, error: evErr } = await supabase
    .from('events')
    .select('id, title')
    .eq('id', eventId)
    .maybeSingle();
  if (evErr) return json({ error: evErr.message }, 500);
  if (!event) return json({ error: 'Nie ma takiego wypadu' }, 404);

  const { data: subs, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', targetUserId);
  if (subErr) return json({ error: subErr.message }, 500);

  const list = (subs ?? []) as Sub[];
  if (list.length === 0) return json({ sent: 0, reason: 'no-subscriptions' });

  const quote = MAJOR_QUOTES[Math.floor(Math.random() * MAJOR_QUOTES.length)];
  const message = JSON.stringify({
    title: `👊 ${event.title}: dawaj cynk!`,
    body: quote,
    url: `/event/${event.id}`,
    tag: `ping-${event.id}-${targetUserId}`,
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

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  if (sent === 0) return json({ sent: 0, reason: 'all-failed' }, 502);
  return json({ sent, removed: dead.length });
});
