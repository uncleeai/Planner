import { supabase } from './supabaseClient';

// Zdjęcie w tle karty hero. Skalujemy do rozsądnej szerokości (karta i tak przyciemnia
// i rozmywa fotkę, więc 1200px w zupełności starcza), zachowując proporcje — object-fit
// cover w CSS docina resztę. Upload do bucketu `event-images` w folderze uid (RLS).
async function resizeMax(file: File, maxW = 1200): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxW / bitmap.width);
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

// Skaluje, wgrywa do `event-images/<uid>/<ts>.jpg` i zwraca publiczny URL.
export async function uploadEventImage(userId: string, file: File): Promise<string> {
  const blob = await resizeMax(file);
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('event-images')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return supabase.storage.from('event-images').getPublicUrl(path).data.publicUrl;
}
