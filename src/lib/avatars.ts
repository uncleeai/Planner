// Awatary wybierane przy pierwszym logowaniu + deterministyczne kolory dla fallbacku (inicjały).
import { supabase } from '@/lib/supabaseClient';

export const AVATARS = ['🦊', '🐼', '🦁', '🐯', '🐸', '🐧', '🦉', '🐙', '🦄', '🐲', '🐝', '🐵'];

const COLORS = [
  '#5b57f2', '#ff8a5b', '#30d158', '#ff453a', '#ffd60a', '#0a84ff',
  '#bf5af2', '#64d2ff', '#ff375f', '#ac8e68', '#34c759', '#ff9f0a',
];

// Stabilny kolor wyliczony z tekstu (np. imienia) — spójny między sesjami.
export function colorFromString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Wartość awatara może być emoji albo URL wgranego zdjęcia.
export function isAvatarUrl(s: string | null | undefined): boolean {
  return !!s && /^https?:\/\//.test(s);
}

// Wczytuje zdjęcie, kadruje do kwadratu i skaluje do max `size` px → Blob JPEG.
async function resizeSquare(file: File, size = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas niedostępny.');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Nie udało się przetworzyć zdjęcia.'))),
      'image/jpeg',
      0.85,
    ),
  );
}

// Skaluje, wgrywa do bucketu `avatars` (folder = uid użytkownika) i zwraca publiczny URL.
export async function uploadAvatarImage(userId: string, file: File): Promise<string> {
  const blob = await resizeSquare(file);
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
