import { supabase } from '@/lib/supabaseClient';

// Własne zdjęcie tła wypadu: skalowanie po stronie klienta do max 1600px po
// dłuższym boku (JPEG, jak zalecenie dla fotek kategorii w heroImage.ts),
// upload do bucketu `event-images` (RLS: folder = uid wgrywającego), publiczny
// URL do events.image_url. EXIF-orientację ogarnia createImageBitmap — ten sam
// pattern co awatary (avatars.ts).
export async function uploadEventImage(userId: string, file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const MAX = 1600;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas niedostępny.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Nie udało się przetworzyć zdjęcia.'))),
      'image/jpeg',
      0.82,
    ),
  );
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('event-images')
    .upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from('event-images').getPublicUrl(path).data.publicUrl;
}
