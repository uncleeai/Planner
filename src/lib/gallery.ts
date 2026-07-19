import { supabase } from '@/lib/supabaseClient';

// Galeria wypadu — upload zdjęć do Cloudflare R2 (przez presigned URL-e z Edge
// Function sign-photo-upload) + wpisy metadanych w event_photos.
//
// Per zdjęcie lecą DWA pliki: oryginał bajt-w-bajt (HEIC/JPEG/…, do pobrania)
// i podgląd JPEG ~2048px generowany na telefonie (siatka/viewer — szybki i
// wyświetlalny wszędzie; HEIC czytają tylko nowsze Safari). Data zrobienia:
// lastModified pliku (dla zdjęć z rolki = data wykonania).

// Publiczny adres bucketa (R2 → Settings → Public Development URL). Puste =
// galeria wyłączona (UI się nie renderuje) — uzupełnij po włączeniu w panelu.
export const R2_PUBLIC_BASE = '';

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

// Wgrywa zdjęcia (oryginał + podgląd) i wstawia wiersze metadanych.
// onProgress woływany po każdym UKOŃCZONYM zdjęciu (done, total).
export async function uploadEventPhotos(
  eventId: string,
  userId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (files.length === 0) return;

  // Podglądy najpierw (sekwencyjnie — canvas + duże bitmapy potrafią zjeść RAM na telefonie).
  const previews: Blob[] = [];
  for (const f of files) previews.push(await makePreview(f));

  // Jedno wywołanie funkcji podpisuje wszystko: [podgląd, oryginał] × N.
  const manifest = files.flatMap((f) => [
    { ext: 'jpg', kind: 'preview' },
    { ext: extOf(f), kind: 'original' },
  ]);
  const { data, error } = await supabase.functions.invoke('sign-photo-upload', {
    body: { event_id: eventId, files: manifest },
  });
  if (error) throw new Error('Nie udało się przygotować wysyłki.');
  const uploads: { path: string; uploadUrl: string }[] = data?.uploads ?? [];
  if (uploads.length !== manifest.length) throw new Error('Zła odpowiedź podpisu wysyłki.');

  const rows: Omit<EventPhoto, 'id' | 'created_at'>[] = [];
  for (let i = 0; i < files.length; i++) {
    const previewSlot = uploads[i * 2];
    const originalSlot = uploads[i * 2 + 1];
    const put = (slot: { uploadUrl: string }, body: Blob, type: string) =>
      fetch(slot.uploadUrl, { method: 'PUT', body, headers: { 'Content-Type': type } }).then(
        (r) => {
          if (!r.ok) throw new Error(`Upload padł (${r.status}).`);
        },
      );
    await Promise.all([
      put(previewSlot, previews[i], 'image/jpeg'),
      put(originalSlot, files[i], files[i].type || 'application/octet-stream'),
    ]);
    rows.push({
      event_id: eventId,
      user_id: userId,
      preview_path: previewSlot.path,
      original_path: originalSlot.path,
      taken_at: files[i].lastModified ? new Date(files[i].lastModified).toISOString() : null,
    });
    onProgress?.(i + 1, files.length);
  }

  const { error: insErr } = await supabase.from('event_photos').insert(rows);
  if (insErr) throw new Error(insErr.message);
}

export async function deleteEventPhoto(photo: EventPhoto): Promise<void> {
  // Kasujemy tylko wpis — plik w R2 zostaje sierotą (świadomie: brak klucza po
  // stronie klienta; sprzątanie sierot to ewentualna przyszła Edge Function).
  const { error } = await supabase.from('event_photos').delete().eq('id', photo.id);
  if (error) throw new Error(error.message);
}
