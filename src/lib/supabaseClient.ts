import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * True tylko gdy zmienne środowiskowe Supabase są ustawione. Używamy tego,
 * żeby pokazać czytelny komunikat zamiast cichych błędów, gdy ktoś odpali
 * aplikację bez skonfigurowanego .env.local.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

// Wartości zastępcze pozwalają zbudować aplikację bez sieci/kluczy;
// faktyczne zapytania i tak wymagają poprawnej konfiguracji w runtime.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
);
