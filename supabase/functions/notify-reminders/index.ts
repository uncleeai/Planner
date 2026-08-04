// Edge Function: cykliczne przypomnienia (pg_cron, np. co godzinę). Trzy przebiegi:
//  1. „Nie dałeś znać" — wypady starsze niż 24h z terminem w przyszłości; push do
//     osób bez głosu (poza twórcą). Raz na wypad (stempel `reminded_at`).
//  2. „Jutro gramy!" — wypady z klepniętym terminem startującym JUTRO (Europe/
//     Warsaw); push do CAŁEJ paczki, wysyłany po 16:00 dnia poprzedniego. Raz na
//     wypad (stempel `day_before_notified_at`). Klepnięty = confirmed_slot_id
//     (ręczny LOCK IN) albo confirmed_notified_at (automat — stempel pusha GRAMY);
//     dla automatu prowadzący slot liczony jak w getConfirmedSlot (types.ts).
//  3. „Wrzuć zdjęcia" — dobę po zakończeniu wypadu (i nie później niż tydzień po);
//     push do CAŁEJ paczki, też po 16:00. Raz na wypad (stempel
//     `photos_prompted_at`), niezależnie od tego, czy galeria jest już pusta czy nie.
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
type SlotRow = { id: string; starts_at: string; all_day?: boolean | null; ends_at?: string | null };

// Klepnięty slot wypadu: ręczny LOCK IN wprost, a przy automacie — prowadzący
// (READY > MOŻE > wcześniejsza data), jak getConfirmedSlot w types.ts.
function pickConfirmed(
  slots: SlotRow[],
  confirmedSlotId: string | null,
  votes: { slot_id: string; availability: string }[],
): SlotRow | undefined {
  if (confirmedSlotId) {
    const direct = slots.find((s) => s.id === confirmedSlotId);
    if (direct) return direct;
  }
  let best: SlotRow | undefined;
  let bestYes = 0;
  let bestMaybe = 0;
  for (const s of slots) {
    const sv = votes.filter((v) => v.slot_id === s.id);
    const yes = sv.filter((v) => v.availability === 'yes').length;
    const maybe = sv.filter((v) => v.availability === 'maybe').length;
    if (
      yes > 0 &&
      (!best || yes > bestYes || (yes === bestYes && maybe > bestMaybe) ||
        (yes === bestYes && maybe === bestMaybe && s.starts_at < best.starts_at))
    ) {
      best = s;
      bestYes = yes;
      bestMaybe = maybe;
    }
  }
  return best;
}

// Koniec wypadu w ms — jak slotEndMs w types.ts: zakres kończy się swoim „do",
// całodniowy o północy następnego dnia, a zwykły termin +3h po starcie.
function slotEndMs(slot: SlotRow): number {
  if (slot.ends_at) {
    const end = new Date(slot.ends_at);
    if (slot.all_day) end.setHours(23, 59, 59, 999);
    return end.getTime();
  }
  const start = new Date(slot.starts_at);
  if (slot.all_day) {
    start.setHours(23, 59, 59, 999);
    return start.getTime();
  }
  return start.getTime() + 3 * 3600 * 1000;
}

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

  for (const ev of events ?? []) {
    processed++;

    const { data: slots } = await supabase.from('slots').select('starts_at, ends_at').eq('event_id', ev.id);
    // Termin „w przyszłości" liczymy od KOŃCA (zakres dni trwa do ostatniego dnia).
    const hasFuture = (slots ?? []).some(
      (s) => new Date((s.ends_at ?? s.starts_at) as string).getTime() > now,
    );
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

  // ===== Przebieg 2: „Jutro gramy!" — dzień przed klepniętym terminem =====
  const TZ = 'Europe/Warsaw';
  const warsawHour = Number(
    new Date(now).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }),
  );
  const tomorrow = new Date(now + 24 * 3600 * 1000).toLocaleDateString('sv-SE', { timeZone: TZ });
  let dayBeforeSent = 0;

  // Po 16:00, żeby push nie budził paczki tuż po północy (cron lata co godzinę).
  if (warsawHour >= 16) {
    const { data: settled } = await supabase
      .from('events')
      .select('id, title, location, confirmed_slot_id')
      .is('day_before_notified_at', null)
      .or('confirmed_slot_id.not.is.null,confirmed_notified_at.not.is.null');

    for (const ev of settled ?? []) {
      const { data: slots } = await supabase
        .from('slots')
        .select('id, starts_at, all_day')
        .eq('event_id', ev.id);
      if (!slots || slots.length === 0) continue;

      const { data: votes } = await supabase
        .from('votes')
        .select('slot_id, availability')
        .eq('event_id', ev.id);
      const slot = pickConfirmed(slots as SlotRow[], ev.confirmed_slot_id, votes ?? []);
      if (!slot) continue;

      const startDay = new Date(slot.starts_at).toLocaleDateString('sv-SE', { timeZone: TZ });
      if (startDay !== tomorrow) continue;

      // Atomowy stempel przed wysyłką — jedno przypomnienie na wypad.
      const { data: stamped } = await supabase
        .from('events')
        .update({ day_before_notified_at: nowIso })
        .eq('id', ev.id)
        .is('day_before_notified_at', null)
        .select('id')
        .maybeSingle();
      if (!stamped) continue;

      const time = slot.all_day
        ? null
        : new Date(slot.starts_at).toLocaleTimeString('pl-PL', {
            hour: '2-digit', minute: '2-digit', timeZone: TZ,
          });
      const message = JSON.stringify({
        title: `📅 Jutro: ${ev.title}`,
        body: [time ? `Start ${time}` : 'Cały dzień', ev.location].filter(Boolean).join(' · '),
        url: `/event/${ev.id}`,
        tag: `day-before-${ev.id}`,
      });

      for (const s of (subsAll ?? []) as Sub[]) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            message,
          );
          dayBeforeSent++;
        } catch (e) {
          const code = (e as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) dead.push(s.endpoint);
        }
      }
    }
  }

  // ===== Przebieg 3: „Wrzuć zdjęcia" — doba po zakończeniu wypadu =====
  // Push do całej paczki, raz na wypad (stempel `photos_prompted_at`). Wysyłamy
  // niezależnie od tego, czy ktoś już coś wrzucił — reszta zwykle ma coś na
  // telefonie. Okno godzinowe jak w przebiegu 2, żeby nie budzić nikogo w nocy:
  // wypad kończący się nad ranem dostanie zaczepkę dopiero tego samego dnia po 16.
  let photosSent = 0;
  if (warsawHour >= 16) {
    const { data: done } = await supabase
      .from('events')
      .select('id, title, confirmed_slot_id')
      .is('photos_prompted_at', null)
      .or('confirmed_slot_id.not.is.null,confirmed_notified_at.not.is.null');

    for (const ev of done ?? []) {
      const { data: slots } = await supabase
        .from('slots')
        .select('id, starts_at, ends_at, all_day')
        .eq('event_id', ev.id);
      if (!slots || slots.length === 0) continue;

      const { data: votes } = await supabase
        .from('votes')
        .select('slot_id, availability')
        .eq('event_id', ev.id);
      const slot = pickConfirmed(slots as SlotRow[], ev.confirmed_slot_id, votes ?? []);
      if (!slot) continue;

      // Minęła doba od końca? Górna granica trzyma stare wypady poza zasięgiem,
      // żeby po wdrożeniu nie poszła lawina zaczepek o dawno minione wyjazdy.
      const since = now - slotEndMs(slot);
      if (since < 24 * 3600 * 1000 || since > 7 * 24 * 3600 * 1000) continue;

      const { data: stamped } = await supabase
        .from('events')
        .update({ photos_prompted_at: nowIso })
        .eq('id', ev.id)
        .is('photos_prompted_at', null)
        .select('id')
        .maybeSingle();
      if (!stamped) continue;

      const message = JSON.stringify({
        title: `📸 Zdjęcia z: ${ev.title}`,
        body: 'Masz coś fajnego na telefonie? Wrzuć do galerii wypadu.',
        url: `/event/${ev.id}`,
        tag: `photos-${ev.id}`,
      });

      for (const s of (subsAll ?? []) as Sub[]) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            message,
          );
          photosSent++;
        } catch (e) {
          const code = (e as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) dead.push(s.endpoint);
        }
      }
    }
  }

  if (dead.length) await supabase.from('push_subscriptions').delete().in('endpoint', dead);
  return json({ processed, sent, dayBeforeSent, photosSent, removed: dead.length });
});
