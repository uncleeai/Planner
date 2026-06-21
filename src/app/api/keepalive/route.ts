import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

// Wywoływane raz dziennie przez Vercel Cron (zob. vercel.json). Lekkie zapytanie
// do bazy utrzymuje projekt Supabase w stanie aktywnym — darmowy plan pauzuje go
// po ~7 dniach bezczynności. Tylko odczyt, bez skutków ubocznych.
export const dynamic = 'force-dynamic';

export async function GET() {
  const { error } = await supabase.from('events').select('id').limit(1);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
