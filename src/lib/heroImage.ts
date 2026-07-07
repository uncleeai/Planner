// Tło karty hero dobierane po emoji wypadu — kuratorowane zdjęcia w public/hero/.
// Zamiast uploadu: jedno ładne zdjęcie na kategorię (emoji z pickera). Podmieniasz
// plik w public/hero/ zachowując nazwę — zero zmian w kodzie. Emoji bez pliku (albo
// wypad bez emoji) → sam raster w tle karty, jak dotąd.
//
// Kadr (zoom + pozycja) per kategoria ustawia admin w apce (panel „Kadrowanie zdjęć",
// tabela hero_crops). Domyślne wartości niżej — dla kategorii jeszcze nieustawionych.
//
// Kategorie MUSZĄ się zgadzać z EVENT_EMOJIS w src/components/EventEmojiInput.tsx.
export const HERO_CATEGORIES: { emoji: string; slug: string; label: string }[] = [
  { emoji: '🏀', slug: 'basketball', label: 'Basket' },
  { emoji: '🎂', slug: 'cake', label: 'Urodziny' },
  { emoji: '⛺', slug: 'camp', label: 'Biwak' },
  { emoji: '⛰️', slug: 'mountains', label: 'Góry' },
  { emoji: '🏖️', slug: 'beach', label: 'Plaża' },
  { emoji: '🏠', slug: 'house', label: 'Chata' },
  { emoji: '🎬', slug: 'movie', label: 'Kino' },
  { emoji: '🎆', slug: 'fireworks', label: 'Impreza' },
  { emoji: '🍺', slug: 'beer', label: 'Piwo' },
  { emoji: '🍕', slug: 'pizza', label: 'Pizza' },
  { emoji: '🎮', slug: 'gaming', label: 'Granie' },
  { emoji: '🃏', slug: 'cards', label: 'Karty' },
];

const SLUG_BY_EMOJI: Record<string, string> = Object.fromEntries(
  HERO_CATEGORIES.map((c) => [c.emoji, c.slug]),
);

// Domyślny kadr (gdy kategoria nie ma jeszcze wiersza w hero_crops) — nastawy
// dobrane w placu zabaw na poziomych zdjęciach z tematem w górnej strefie.
export const DEFAULT_CROP = { zoom: 163, pos_x: 77, pos_y: 10 };

export type HeroCrop = { emoji: string; zoom: number; pos_x: number; pos_y: number };

// Zalecany format podmienianych zdjęć: poziome, temat w górnej-prawej strefie,
// ~1400–1600 px dłuższy bok, JPEG q~80.
export function heroImageForEmoji(emoji: string | null | undefined): string | null {
  if (!emoji) return null;
  const slug = SLUG_BY_EMOJI[emoji];
  return slug ? `/hero/${slug}.jpg` : null;
}
