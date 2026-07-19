import { supabase } from '@/lib/supabaseClient';

// Galeria wypadu — upload zdjęć do Cloudflare R2 (przez presigned URL-e z Edge
// Function sign-photo-upload) + wpisy metadanych w event_photos.
//
// Per zdjęcie lecą DWA pliki: oryginał bajt-w-bajt (HEIC/JPEG/…, do pobrania)
// i podgląd JPEG ~2048px generowany na telefonie (siatka/viewer — szybki i
// wyświetlalny wszędzie; HEIC czytają tylko nowsze Safari). Data zrobienia:
// lastModified pliku (dla zdjęć z rolki = data wykonania).

// Publiczny adres bucketa (R2 → Settings → Public Development URL). Puste =
// galeria wyłączona (UI się nie renderuje). r2.dev wystarcza dla skali paczki;
// upgrade = własna domena w panelu R2 i podmiana tej stałej.
export const R2_PUBLIC_BASE = 'https://pub-bfab842060924ea18c2d40f24cca7939.r2.dev';

export const isGalleryConfigured = !!R2_PUBLIC_BASE;

export function photoUrl(path: string): string {
  return `${R2_PUBLIC_BASE}/${path}`;
}

export type EventPhoto = {
  id: string;
  event_id: string;
  user_id: string | null;
  preview_path: string;
  original_path: string | null;
  taken_at: string | null;
  created_at: string;
};

// Rozszerzenie oryginału z typu MIME (fallback: końcówka nazwy, potem jpg).
function extOf(file: File): string {
  const byType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/webp': 'webp',
  };
  if (byType[file.type]) return byType[file.type];
  const m = /\.([a-z0-9]{2,5})$/i.exec(file.name);
  return m ? m[1].toLowerCase() : 'jpg';
}

// Podgląd JPEG do max 2048px po dłuższym boku — wyższy standard niż iCloud
// Shared Albums (2048), wizualnie nieodróżnialny na telefonie.
async function makePreview(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const MAX = 2048;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas niedostępny.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Nie udało się przetworzyć zdjęcia.'))),
      'image/jpeg',
      0.85,
    ),
  );
}

// Wgrywa zdjęcia (oryginał + podgląd) i wstawia wiersze metadanych — PER PLIK,
// żeby jedno feralne zdjęcie nie kładło całej paczki (częściowy sukces zostaje).
// onProgress po każdym UKOŃCZONYM zdjęciu; zwraca komunikaty błędów (puste = ok).
export async function uploadEventPhotos(
  eventId: string,
  userId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      // 1) Podgląd. Gdy dekodowanie padnie (np. format, RAM) — jedziemy bez
      //    podglądu: oryginał robi za preview (HEIC nie wyświetli się wszędzie,
      //    ale zdjęcie nie ginie).
      let preview: Blob | null = null;
      try {
        preview = await makePreview(file);
      } catch (err) {
        console.error('[galeria] podgląd padł:', file.name, err);
      }

      // 2) Podpis wysyłki (osobno per plik — proste i częściowo odporne).
      //    Goły fetch zamiast functions.invoke — invoke zawijał prawdziwy błąd
      //    w „Failed to send a request…"; tu status/treść widać wprost.
      const manifest = preview
        ? [
            { ext: 'jpg', kind: 'preview' },
            { ext: extOf(file), kind: 'original' },
          ]
        : [{ ext: extOf(file), kind: 'original' }];
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Podpis wysyłki: brak sesji (zaloguj się ponownie).');
      let signRes: Response;
      try {
        signRes = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sign-photo-upload`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
            },
            body: JSON.stringify({ event_id: eventId, files: manifest }),
          },
        );
      } catch (err) {
        throw new Error(
          `Podpis wysyłki: sieć odrzuciła żądanie (${err instanceof Error ? err.message : '?'}).`,
        );
      }
      if (!signRes.ok) {
        const detail = await signRes.text().catch(() => '');
        throw new Error(`Podpis wysyłki: HTTP ${signRes.status} ${detail.slice(0, 140)}`);
      }
      const data = await signRes.json();
      const uploads: { path: string; uploadUrl: string }[] = data?.uploads ?? [];
      if (uploads.length !== manifest.length) throw new Error('Zła odpowiedź podpisu wysyłki.');

      // 3) PUT-y do R2.
      const put = async (slot: { uploadUrl: string }, body: Blob, type: string) => {
        const r = await fetch(slot.uploadUrl, {
          method: 'PUT',
          body,
          headers: { 'Content-Type': type },
        });
        if (!r.ok) throw new Error(`Wysyłka do R2 padła (${r.status}).`);
      };
      const previewSlot = preview ? uploads[0] : null;
      const originalSlot = preview ? uploads[1] : uploads[0];
      await Promise.all([
        ...(preview && previewSlot ? [put(previewSlot, preview, 'image/jpeg')] : []),
        put(originalSlot, file, file.type || 'application/octet-stream'),
      ]);

      // 4) Wiersz metadanych.
      const { error: insErr } = await supabase.from('event_photos').insert({
        event_id: eventId,
        user_id: userId,
        preview_path: (previewSlot ?? originalSlot).path,
        original_path: originalSlot.path,
        taken_at: file.lastModified ? new Date(file.lastModified).toISOString() : null,
      });
      if (insErr) throw new Error(`Zapis metadanych: ${insErr.message}`);
    } catch (err) {
      console.error('[galeria] zdjęcie padło:', file.name, err);
      errors.push(err instanceof Error ? err.message : 'Nieznany błąd.');
    }
    onProgress?.(i + 1, files.length);
  }

  return errors;
}

export async function deleteEventPhoto(photo: EventPhoto): Promise<void> {
  // Kasujemy tylko wpis — plik w R2 zostaje sierotą (świadomie: brak klucza po
  // stronie klienta; sprzątanie sierot to ewentualna przyszła Edge Function).
  const { error } = await supabase.from('event_photos').delete().eq('id', photo.id);
  if (error) throw new Error(error.message);
}
