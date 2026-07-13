// Edge Function: „Dodaj do paczki" — admin dodaje nowy adres e-mail prosto z apki,
// bez wchodzenia do panelu Supabase. Wywoływana z klienta (supabase.functions.invoke);
// body: { email }. Tworzy konto przez Admin API (service_role) z potwierdzonym mailem,
// więc nowa osoba od razu loguje się kodem OTP w apce — działa nawet przy wyłączonym
// „Allow new users to sign up".
//
// Dostęp TYLKO dla adminów: e-mail wołającego (z JWT, zweryfikowany przez platformę)
// musi być na liście poniżej. Trzymaj ją w synchronie z is_admin() (schema.sql) oraz
// ADMIN_EMAILS (src/lib/admin.ts).
//
// Wdrożenie:
//   supabase functions deploy invite-user
//   (DOMYŚLNIE z weryfikacją JWT — jak ping-user; NIE dodawaj --no-verify-jwt.)
// Sekrety: SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY są dostępne automatycznie.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Właściciel(e) — jedyni, którzy mogą dodawać do paczki. Sync z is_admin()/admin.ts.
const ADMIN_EMAILS = ['tomaszproblemx@gmail.com'];

// CORS — funkcję woła przeglądarka (supabase.functions.invoke), więc preflight
// OPTIONS i odpowiedzi muszą nieść nagłówki CORS, inaczej invoke rzuca błąd.
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

// E-mail wołającego z JWT (platforma już go zweryfikowała przy verify_jwt).
function callerEmail(req: Request): string | null {
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const caller = callerEmail(req);
  console.log('[invite-user] wywołanie, caller=', caller);
  if (!caller || !ADMIN_EMAILS.includes(caller)) {
    console.warn('[invite-user] odrzucono — nie-admin:', caller);
    return json({ error: 'Tylko admin może dodawać do paczki.' }, 403);
  }

  const body = await req.json().catch(() => null);
  const email = (body?.email ?? '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.warn('[invite-user] zły e-mail:', email);
    return json({ error: 'Podaj poprawny e-mail.' }, 400);
  }

  // email_confirm: true → konto od razu aktywne, nowa osoba loguje się kodem OTP.
  const { error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
  if (error) {
    console.error('[invite-user] createUser błąd:', error.status, error.message);
    const dup = /already|registered|exist/i.test(error.message);
    return json(
      { error: dup ? 'Ten adres już jest w paczce.' : error.message },
      dup ? 409 : 500,
    );
  }
  console.log('[invite-user] utworzono konto:', email);
  return json({ ok: true });
});
