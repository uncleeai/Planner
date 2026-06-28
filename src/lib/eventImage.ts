// Zdjęcie w tle wypadu: skalowanie po stronie klienta + upload do bucketu event-images.
// Karty kadrują przez object-fit: cover, więc tu tylko zmniejszamy (zachowując proporcje),
// żeby nie wgrywać 5 MB z aparatu. Wzorzec jak w avatars.ts, ale poziomy (nie kwadrat).
import { supabase } from '@/lib/supabaseClient';

// Wczytuje zdjęcie i skaluje tak, by dłuższy bok ≤ maxSide px → Blob JPEG.
async function downscale(file: File, maxSide = 1280): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
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
      0.82,
    ),
  );
}

// Skaluje, wgrywa do bucketu `event-images` (folder = uid twórcy) i zwraca publiczny URL.
export async function uploadEventImage(userId: string, file: File): Promise<string> {
  const blob = await downscale(file);
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('event-images')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return supabase.storage.from('event-images').getPublicUrl(path).data.publicUrl;
}
