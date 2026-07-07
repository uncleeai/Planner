import { supabase } from './supabaseClient';
import type { HeroCrop } from './heroImage';

// Kadry hero per kategoria (emoji). Wszyscy czytają, zapisuje tylko admin (RLS).
export async function loadHeroCrops(): Promise<HeroCrop[]> {
  const { data } = await supabase.from('hero_crops').select('emoji, zoom, pos_x, pos_y');
  return (data ?? []) as HeroCrop[];
}

export async function saveHeroCrop(c: HeroCrop): Promise<string | null> {
  const { error } = await supabase.from('hero_crops').upsert(
    { emoji: c.emoji, zoom: c.zoom, pos_x: c.pos_x, pos_y: c.pos_y, updated_at: new Date().toISOString() },
    { onConflict: 'emoji' },
  );
  return error ? error.message : null;
}
