import { ADMIN_EMAILS } from './admin';

// Skład paczki — jedyne e-maile, które przechodzą przez bramkę logowania.
// UI pokazuje ekran „Prywatne lobby" dla kont spoza listy; REALNIE egzekwuje to
// funkcja public.is_member() w supabase/schema.sql (polityki RESTRICTIVE) —
// trzymaj obie listy w synchronie, jak przy adminach.
//
// Opcjonalne nadpisanie z env (np. NEXT_PUBLIC_MEMBER_EMAILS="a@x.pl,b@y.pl").
const ENV_MEMBERS = (process.env.NEXT_PUBLIC_MEMBER_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const MEMBER_EMAILS: string[] =
  ENV_MEMBERS.length > 0 ? ENV_MEMBERS : ['tomaszproblemx@gmail.com'];

export function isMemberEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  return MEMBER_EMAILS.includes(e) || ADMIN_EMAILS.includes(e);
}
