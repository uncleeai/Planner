import { supabase } from '@/lib/supabaseClient';

// Kadr własnego zdjęcia (pinch-to-crop w kreatorze): zoom + przesunięcie w %
// rozmiaru kontenera, zapisywane jako JSON w events.image_focus. Render:
// background cover wyśrodkowany + transform `translate(x%, y%) scale(z)` —
// translate liczy się PO skali, więc palec prowadzi obraz 1:1 niezależnie
// od zoomu, a clamp |x|,|y| ≤ 50·(z−1) pilnuje, żeby kadr zawsze krył kartę.
export type ImageFocus = { z: number; x: number; y: number };

export const DEFAULT_FOCUS: ImageFocus = { z: 1, x: 0, y: 0 };

export function clampFocus(f: ImageFocus): ImageFocus {
  const z = Math.min(3, Math.max(1, f.z));
  const m = 50 * (z - 1);
  return { z, x: Math.min(m, Math.max(-m, f.x)), y: Math.min(m, Math.max(-m, f.y)) };
}

export function parseImageFocus(s: string | null | undefined): ImageFocus | null {
  if (!s) return null;
  try {
    const o = JSON.parse(s);
    if (typeof o?.z === 'number' && typeof o?.x === 'number' && typeof o?.y === 'number') {
      return clampFocus(o);
    }
  } catch { /* stary/obcy format → domyślny kadr */ }
  return null;
}

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
