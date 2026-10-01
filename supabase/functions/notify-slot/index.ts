// Edge Function: push „nowy / zmieniony termin" — do osób, które NIE mają głosu na
// ten termin (nowy = nikt nie ma; zmieniony = trigger slots_reset_votes wyzerował
// głosy), poza wołającym. Wywoływana z klienta po dodaniu / zmianie terminu;
// body: { slot_id, kind: 'added' | 'changed' }.
//
// Wołać może tylko autor terminu, organizator wypadu albo admin (e-mail z JWT).
// Bez spamu: najwyżej jeden taki push na wypad na 10 min (atomowy stempel
// events.slot_notified_at) — trzy terminy dodane pod rząd = jeden push. Po klepnięciu
// terminu (LOCK IN) cisza.
//
// Wdrożenie:
//   supabase functions deploy notify-slot
//   (DOMYŚLNIE z weryfikacją JWT — NIE dodawaj --no-verify-jwt.)
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

// Sync z is_admin() (schema.sql), src/lib/admin.ts i invite-user.
const ADMIN_EMAILS = ['tomaszproblemx@gmail.com'];

type Sub = { endpoint: string; p256dh: string; auth: string; user_id: string | null };
type Slot = { id: string; event_id: string; starts_at: string; ends_at: string | null; all_day: boolean | null; created_by_user_id: string | null };

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

function caller(req: Request): { id: string | null; email: string | null } {
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const p = JSON.parse(atob(token.split('.')[1]));
    return {
      id: typeof p.sub === 'string' ? p.sub : null,
      email: typeof p.email === 'string' ? p.email.toLowerCase() : null,
    };
  } catch {
    return { id: null, email: null };
  }
}

// Mono-format daty jak w apce (kopia z notify-confirmed): „CZW 23.07 · 23:30" / „7–9.07".
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

  const me = caller(req);
  if (!me.id) return json({ error: 'Brak tożsamości.' }, 401);

  const body = await req.json().catch(() => null);
  const slotId: string | undefined = body?.slot_id;
  const kind = body?.kind === 'changed' ? 'changed' : 'added';
  if (!slotId) return json({ error: 'slot_id jest wymagane' }, 400);

  const { data: slot } = await supabase
    .from('slots')
    .select('id, event_id, starts_at, ends_at, all_day, created_by_user_id')
    .eq('id', slotId)
    .maybeSingle();
  if (!slot) return json({ error: 'Nie ma takiego terminu.' }, 404);

  const { data: event } = await supabase
    .from('events')
    .select('id, title, created_by_user_id, confirmed_slot_id')
    .eq('id', slot.event_id)
    .maybeSingle();
  if (!event) return json({ error: 'Nie ma takiego wypadu.' }, 404);

  const allowed =
    slot.created_by_user_id === me.id ||
    event.created_by_user_id === me.id ||
    (me.email !== null && ADMIN_EMAILS.includes(me.email));
  if (!allowed) return json({ error: 'Nie Twój termin.' }, 403);
  if (event.confirmed_slot_id) return json({ sent: 0, reason: 'locked' });

  // Atomowo: tylko jeden push na wypad na 10 min, nawet przy równoległych wywołaniach.
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: claimed } = await supabase
    .from('events')
    .update({ slot_notified_at: new Date().toISOString() })
    .eq('id', event.id)
    .or(`slot_notified_at.is.null,slot_notified_at.lt.${cutoff}`)
    .select('id');
  if (!claimed?.length) return json({ sent: 0, reason: 'cooldown' });

  const [{ data: votes }, { data: subs }, { data: who }] = await Promise.all([
    supabase.from('votes').select('user_id').eq('slot_id', slot.id),
    supabase.from('push_subscriptions').select('endpoint, p256dh, auth, user_id'),
    supabase.from('profiles').select('display_name').eq('id', me.id).maybeSingle(),
  ]);
  const voted = new Set((votes ?? []).map((v) => v.user_id));
  const name = who?.display_name ?? 'Ktoś';
  const when = formatSlot(slot as Slot);

  const message = JSON.stringify({
    title: event.title,
    body:
      kind === 'changed'
        ? `${name} zmienił(a) termin na ${when} — zagłosuj jeszcze raz`
        : `${name} dodał(a) termin ${when} — zagłosuj`,
    url: `/event/${event.id}`,
    tag: `slot-${event.id}`,
  });

  const dead: string[] = [];
  let sent = 0;
  for (const s of (subs ?? []) as Sub[]) {
    if (!s.user_id || s.user_id === me.id || voted.has(s.user_id)) continue;
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
  if (dead.length) await supabase.from('push_subscriptions').delete().in('endpoint', dead);

  return json({ sent, removed: dead.length });
});
