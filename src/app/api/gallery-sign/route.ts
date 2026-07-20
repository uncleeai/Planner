import { NextResponse } from 'next/server';

// Proxy przez WŁASNY origin apki dla podpisu uploadu galerii. Przeglądarka woła
// tę ścieżkę (ten sam origin → zero CORS/preflightu, nie jest to żądanie
// third-party), a serwer forwarduje je do Edge Function `gallery-sign` w Supabase
// (serwer→serwer jest niezawodny — jak curl). Dzięki temu blokery treści, iCloud
// Private Relay i kaprysy preflightu na iOS Safari nie ubijają wysyłki: goły fetch
// z telefonu prosto do *.supabase.co padał „Load failed" i nie docierał nawet do
// Supabase (w logach funkcji brak realnych prób). Token użytkownika przekazujemy
// dalej, więc Edge Function nadal weryfikuje tożsamość (verify JWT). Klucze R2
// zostają po stronie Supabase.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!base) {
    return NextResponse.json({ error: 'Brak konfiguracji Supabase.' }, { status: 500 });
  }

  const auth = req.headers.get('authorization') ?? '';
  const apikey = req.headers.get('apikey') ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const body = await req.text();

  const res = await fetch(`${base}/functions/v1/gallery-sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth, apikey },
    body,
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
  });
}
