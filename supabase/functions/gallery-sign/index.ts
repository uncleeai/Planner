// Edge Function: gallery-sign (dawniej sign-photo-upload — nazwa bez „photo-upload", bo listy content blockerów w Safari ucinały ścieżkę) — podpisuje uploady zdjęć galerii do
// Cloudflare R2 (presigned PUT, SigV4 przez aws4fetch). Klient NIGDY nie widzi
// kluczy R2; funkcja (verify JWT = tylko zalogowana paczka) buduje ścieżki
// server-side: <event_id>/<uid>-<ts>-<i>[-orig].<ext> i zwraca URL-e ważne 10 min.
// Body: { event_id, files: [{ ext: 'jpg'|'heic'|..., kind: 'preview'|'original' }] }.
//
// Wdrożenie: supabase functions deploy sign-photo-upload  (DOMYŚLNIE verify JWT)
// Sekrety: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
// Bucket i jurysdykcja (EU) zaszyte niżej — zmiana bucketa = zmiana stałej.

import { AwsClient } from 'npm:aws4fetch@1.0.20';

const BUCKET = 'planner-photos';
const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? '';
// Jurysdykcja EU → endpoint z „.eu."
const ENDPOINT = `https://${ACCOUNT_ID}.eu.r2.cloudflarestorage.com`;

const r2 = new AwsClient({
  accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID') ?? '',
  secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '',
  service: 's3',
  region: 'auto',
});

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

// Kto woła — z JWT (platforma zweryfikowała podpis przy verify_jwt).
function callerId(req: Request): string | null {
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

const SAFE_EXT = /^[a-z0-9]{2,5}$/;
const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const uid = callerId(req);
  if (!uid) return json({ error: 'Brak tożsamości.' }, 401);

  const body = await req.json().catch(() => null);
  const eventId: string | undefined = body?.event_id;
  const files: { ext?: string; kind?: string }[] = Array.isArray(body?.files) ? body.files : [];
  if (!eventId || !UUID.test(eventId)) return json({ error: 'event_id jest wymagane' }, 400);
  if (files.length === 0 || files.length > 40) return json({ error: 'files: 1–40 pozycji' }, 400);

  const ts = Date.now();
  const out: { path: string; uploadUrl: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const ext = SAFE_EXT.test(files[i].ext ?? '') ? files[i].ext : 'jpg';
    const suffix = files[i].kind === 'original' ? '-orig' : '';
    const path = `${eventId}/${uid}-${ts}-${i}${suffix}.${ext}`;
    const url = new URL(`${ENDPOINT}/${BUCKET}/${path}`);
    url.searchParams.set('X-Amz-Expires', '600');
    const signed = await r2.sign(new Request(url, { method: 'PUT' }), {
      aws: { signQuery: true },
    });
    out.push({ path, uploadUrl: signed.url });
  }

  console.log('[gallery-sign] uid=', uid, 'event=', eventId, 'files=', out.length);
  return json({ uploads: out });
});
