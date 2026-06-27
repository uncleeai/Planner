// Właściciel(e) aplikacji — mają uprawnienia organizatora na KAŻDYM wypadzie
// (edycja, ustalanie/odznaczanie terminu, usuwanie, kasowanie cudzych terminów).
// Rozpoznawani po zweryfikowanym adresie e-mail konta (Supabase Auth) — nie da się
// tego podrobić z klienta.
//
// WAŻNE: trzymaj tę listę w synchronie z funkcją `public.is_admin()` w
// supabase/schema.sql — to ona realnie egzekwuje uprawnienia po stronie bazy (RLS).
// UI tylko pokazuje/ukrywa przyciski; bez wpisu w SQL admin i tak dostanie błąd RLS.

// Opcjonalne nadpisanie listą z env (np. NEXT_PUBLIC_ADMIN_EMAILS="a@x.pl,b@y.pl").
const ENV_ADMINS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const ADMIN_EMAILS: string[] =
  ENV_ADMINS.length > 0 ? ENV_ADMINS : ['uncleeai@gmail.com'];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
