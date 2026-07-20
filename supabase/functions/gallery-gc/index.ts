// Edge Function: gallery-gc — sprzątanie kosza galerii. Zdjęcia „usunięte" mają
// ustawione event_photos.deleted_at (znikają z galerii, ale plik zostaje w R2 =
// bufor bezpieczeństwa). Ta funkcja, odpalana cyklicznie przez pg_cron, po
// TRASH_TTL_DAYS dniach kasuje pliki z R2 (podgląd + oryginał) i dopiero potem
// usuwa wiersz — więc nieudany DELETE do R2 zostawia wpis do kolejnej próby
// (bez osieroconych plików).
//
// Wdrożenie:  supabase functions deploy gallery-gc --no-verify-jwt
// Sekrety:    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
//             (te same co gallery-sign; SUPABASE_URL/SERVICE_ROLE_KEY są wbudowane).
//             WEBHOOK_SECRET — opcjonalny; jeśli ustawiony, cron musi podać `?key=<sekret>`.
// Harmonogram (pg_cron): raz dziennie net.http_post na /functions/v1/gallery-gc.

import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TRASH_TTL_DAYS = 30;
const BUCKET = 'planner-photos';
const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? '';
const ENDPOINT = `https://${ACCOUNT_ID}.eu.r2.cloudflarestorage.com`;
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';

const r2 = new AwsClient({
  accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID') ?? '',
  secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '',
  service: 's3',
  region: 'auto',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// DELETE obiektu z R2. 404/204 traktujemy jako sukces (idempotentnie — plik już
// mógł zniknąć). Zwraca true, jeśli po tej operacji obiektu na pewno nie ma.
async function deleteObject(path: string): Promise<boolean> {
  const res = await r2.fetch(`${ENDPOINT}/${BUCKET}/${path}`, { method: 'DELETE' });
  return res.ok || res.status === 404;
}

Deno.serve(async (req) => {
  if (WEBHOOK_SECRET) {
    const provided = new URL(req.url).searchParams.get('key') ?? req.headers.get('x-webhook-secret');
    if (provided !== WEBHOOK_SECRET) return new Response('unauthorized', { status: 401 });
  }

  const cutoff = new Date(Date.now() - TRASH_TTL_DAYS * 86400_000).toISOString();
  const { data: rows, error } = await supabase
    .from('event_photos')
    .select('id, preview_path, original_path')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .limit(200);
  if (error) return json({ error: error.message }, 500);

  const purged: string[] = [];
  let orphaned = 0;
  for (const row of rows ?? []) {
    const paths = [row.preview_path, row.original_path].filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );
    const uniq = [...new Set(paths)]; // podgląd i oryginał bywają tym samym plikiem
    const results = await Promise.all(uniq.map((p) => deleteObject(p).catch(() => false)));
    // Wiersz kasujemy tylko, gdy wszystkie pliki na pewno zeszły z R2.
    if (results.every(Boolean)) purged.push(row.id);
    else orphaned++;
  }

  if (purged.length > 0) {
    const { error: delErr } = await supabase.from('event_photos').delete().in('id', purged);
    if (delErr) return json({ error: delErr.message, purged: 0 }, 500);
  }

  console.log('[gallery-gc] purged=', purged.length, 'retry_next_run=', orphaned);
  return json({ purged: purged.length, retry_next_run: orphaned });
});
