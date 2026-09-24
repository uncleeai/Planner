// Edge Function: „nowy komentarz" — Web Push do CAŁEJ paczki poza autorem, gdy
// ktoś napisze w czacie wypadu. Wywoływana z klienta (supabase.functions.invoke);
// body: { comment_id }.
//
// Treść i autora bierzemy Z BAZY po comment_id, a nie z ciała żądania: klient
// mógłby wysłać cudze nazwisko albo dowolny tekst, a push idzie do wszystkich.
// Autora dodatkowo sprawdzamy z JWT — powiadomienie o cudzym komentarzu może
// wywołać tylko ten, kto go napisał.
//
// Bez spamu przy żywej rozmowie: push dostaje tylko ten, kto nie ma czatu otwartego
// i nie dostał pusha z tego wypadu w ostatnich 10 min (albo już go przeczytał) —
// wtedy zbiorczo „N nowych wiadomości". Stan w tabeli chat_push_state (schema.sql).
//
// Wdrożenie:
//   supabase functions deploy notify-comment
//   (DOMYŚLNIE z weryfikacją JWT — jak notify-confirmed; NIE dodawaj --no-verify-jwt.)
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

function callerId(req: Request): string | null {
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

// Podgląd wiadomości w powiadomieniu — jedna linia, bez rozwlekłych wypracowań.
function preview(body: string): string {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  return oneLine.length > 140 ? `${oneLine.slice(0, 139)}…` : oneLine;
}

// 2 nowe wiadomości, 5 nowych wiadomości, 22 nowe wiadomości.
function newMessages(n: number): string {
  const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return few ? 'nowe wiadomości' : 'nowych wiadomości';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const uid = callerId(req);
  if (!uid) return json({ error: 'Brak tożsamości.' }, 401);

  const body = await req.json().catch(() => null);
  const commentId: string | undefined = body?.comment_id;
  if (!commentId) return json({ error: 'comment_id jest wymagane' }, 400);

  const { data: comment } = await supabase
    .from('comments')
    .select('id, event_id, user_id, author_name, body, image_path')
    .eq('id', commentId)
    .maybeSingle();
  if (!comment) return json({ error: 'Nie ma takiego komentarza.' }, 404);
  // Tylko autor może rozesłać powiadomienie o swoim komentarzu. Porównanie wprost
  // (bez „user_id &&"): stare komentarze mają user_id = null i przy łagodniejszym
  // warunku każdy zalogowany mógłby rozesłać paczce push o cudzym wpisie.
  if (comment.user_id !== uid) return json({ error: 'Nie Twój komentarz.' }, 403);

  const { data: event } = await supabase
    .from('events')
    .select('id, title')
    .eq('id', comment.event_id)
    .maybeSingle();
  if (!event) return json({ error: 'Nie ma takiego wypadu.' }, 404);

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id');
  const targets = ((subs ?? []) as Sub[]).filter((s) => s.user_id !== uid); // autor wie, co napisał

  // Kto dostaje push TERAZ (claim_chat_push w schema.sql): nie ten z otwartym czatem
  // i nie ten, kto dostał push < 10 min temu i jeszcze nie czytał. Stare subskrypcje
  // bez user_id lecą jak dawniej.
  const users = [...new Set(targets.map((s) => s.user_id).filter((u): u is string => !!u))];
  const { data: claimed } = users.length
    ? await supabase.rpc('claim_chat_push', { p_event: event.id, p_users: users })
    : { data: [] };
  const since = new Map<string, string>(
    ((claimed ?? []) as { r_user: string; r_since: string }[]).map((c) => [c.r_user, c.r_since]),
  );

  // Nieprzeczytane od najstarszego „since" — każdy odbiorca liczy swoje.
  const oldest = [...since.values()].sort((x, y) => Date.parse(x) - Date.parse(y))[0];
  const { data: recent } = oldest
    ? await supabase
        .from('comments')
        .select('user_id, author_name, body, image_path, created_at')
        .eq('event_id', event.id)
        .is('deleted_at', null)
        .gt('created_at', oldest)
        .order('created_at', { ascending: false })
        .limit(200)
    : { data: [] };

  const text = (c: { body: string | null; image_path?: string | null }) =>
    preview(c.body || (c.image_path ? '📷 Zdjęcie' : ''));
  const messageFor = (user: string | null) => {
    const unread = user
      ? ((recent ?? []) as { user_id: string | null; created_at: string }[]).filter(
          (c) => c.user_id !== user && Date.parse(c.created_at) > Date.parse(since.get(user) ?? ''),
        ).length
      : 1;
    return JSON.stringify({
      // Więcej niż jedna → zbiorczo: „Wypad · 5 nowych wiadomości", w treści ostatnia.
      title: unread > 1 ? `${event.title} · ${unread} ${newMessages(unread)}` : `${comment.author_name} · ${event.title}`,
      body: unread > 1 ? `${comment.author_name}: ${text(comment)}` : text(comment),
      // ?czat — tap w powiadomienie otwiera od razu rozmowę, nie samą stronę wypadu.
      url: `/event/${event.id}?czat`,
      // Wspólny tag dla całego wypadu: kolejna wiadomość PODMIENIA poprzednią na
      // ekranie blokady (tam, gdzie system to wspiera).
      tag: `chat-${event.id}`,
    });
  };

  const dead: string[] = [];
  let sent = 0;
  for (const s of targets) {
    if (s.user_id && !since.has(s.user_id)) continue;
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        messageFor(s.user_id),
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
