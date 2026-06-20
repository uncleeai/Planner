export default function SetupBanner() {
  return (
    <div className="banner">
      <strong>Brak konfiguracji Supabase.</strong> Skopiuj <code>.env.example</code> do{' '}
      <code>.env.local</code>, uzupełnij <code>NEXT_PUBLIC_SUPABASE_URL</code> oraz{' '}
      <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, a następnie uruchom schemat z{' '}
      <code>supabase/schema.sql</code>. Szczegóły w <code>README.md</code>.
    </div>
  );
}
