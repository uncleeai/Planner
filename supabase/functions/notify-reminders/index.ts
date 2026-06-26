// Edge Function: przypomnienia „nie dałeś znać czy wchodzisz".
// Odpalana cyklicznie przez pg_cron (np. co godzinę). Dla każdego wypadu starszego
// niż 24h, który ma termin w przyszłości i nie był jeszcze przypomniany, wysyła push
// do osób z paczki, które nie oddały żadnego głosu (poza twórcą). Oznacza wypad
// `reminded_at`, żeby nie spamować przy kolejnych przebiegach.
//
// Wdrożenie:
//   supabase functions deploy notify-reminders --no-verify-jwt
//   (lub panel: Edge Functions → notify-reminders → Code → Deploy, Verify JWT = off)
// Sekrety: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (jak notify-new-event).
//   WEBHOOK_SECRET — opcjonalny; jeśli ustawiony, cron musi podać `?key=<sekret>`.
// Harmonogram (pg_cron) — zob. README, sekcja „Przypomnienia".

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

type Sub = { endpoint: string; p256dh: string; auth: string; user_id: string | null };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (WEBHOOK_SECRET) {
    const provided = new URL(req.url).searchParams.get('key') ?? req.headers.get('x-webhook-secret');
    if (provided !== WEBHOOK_SECRET) return new Response('unauthorized', { status: 401 });
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
  const twoWeeksAgo = new Date(now - 14 * 24 * 3600 * 1000).toISOString();

  // Kandydaci: utworzone >24h temu, <14 dni temu (bez zalewania starymi), nieprzypomniane.
  const { data: events, error: evErr } = await supabase
    .from('events')
    .select('id, title, created_by_user_id')
    .is('reminded_at', null)
    .lt('created_at', dayAgo)
    .gt('created_at', twoWeeksAgo);
  if (evErr) return new Response(evErr.message, { status: 500 });
  if (!events || events.length === 0) return json({ processed: 0, sent: 0 });

  // Paczka i wszystkie subskrypcje — raz.
  const { data: profiles } = await supabase.from('profiles').select('id');
  const memberIds = (profiles ?? []).map((p) => p.id as string);
  const { data: subsAll } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id');
  const subsByUser = new Map<string, Sub[]>();
  for (const s of (subsAll ?? []) as Sub[]) {
    if (!s.user_id) continue;
    const arr = subsByUser.get(s.user_id) ?? [];
    arr.push(s);
    subsByUser.set(s.user_id, arr);
  }

  let processed = 0;
  let sent = 0;
  const dead: string[] = [];

  for (const ev of events) {
    processed++;

    const { data: slots } = await supabase.from('slots').select('starts_at').eq('event_id', ev.id);
    const hasFuture = (slots ?? []).some((s) => new Date(s.starts_at).getTime() > now);
    // Brak terminów lub wszystko w przeszłości → nic do przypominania; tylko oznacz.
    if (!slots || slots.length === 0 || !hasFuture) {
      await supabase.from('events').update({ reminded_at: nowIso }).eq('id', ev.id);
      continue;
    }

    const { data: votes } = await supabase.from('votes').select('user_id').eq('event_id', ev.id);
    const voters = new Set((votes ?? []).map((v) => v.user_id).filter(Boolean));
    const nonVoters = memberIds.filter((id) => id !== ev.created_by_user_id && !voters.has(id));

    const message = JSON.stringify({
      title: '⏳ Przypomnienie',
      body: `Nie dałeś znać: „${ev.title}"`,
      url: `/event/${ev.id}`,
      tag: `reminder-${ev.id}`,
    });

    for (const uid of nonVoters) {
      for (const s of subsByUser.get(uid) ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            message,
          );
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) dead.push(s.endpoint);
        }
      }
    }

    await supabase.from('events').update({ reminded_at: nowIso }).eq('id', ev.id);
  }

  if (dead.length) await supabase.from('push_subscriptions').delete().in('endpoint', dead);
  return json({ processed, sent, removed: dead.length });
});
