// Tło karty hero dobierane po emoji wypadu — kuratorowane zdjęcia w public/hero/.
// Zamiast uploadu: jedno ładne zdjęcie na kategorię (emoji z pickera). Podmieniasz
// plik w public/hero/ zachowując nazwę — zero zmian w kodzie. Emoji bez pliku (albo
// wypad bez emoji) → sam raster w tle karty, jak dotąd.
//
// Klucze MUSZĄ się zgadzać z EVENT_EMOJIS w src/components/EventEmojiInput.tsx.
const HERO_BY_EMOJI: Record<string, string> = {
  '🏀': 'basketball',
  '🎂': 'cake',
  '⛺': 'camp',
  '⛰️': 'mountains',
  '🏖️': 'beach',
  '🏠': 'house',
  '🎬': 'movie',
  '🎆': 'fireworks',
  '🍺': 'beer',
  '🍕': 'pizza',
  '🎮': 'gaming',
  '🃏': 'cards',
};

// Zalecany format podmienianych zdjęć: 4:5 pionowo, ~1080×1350, JPEG q~80 (~150–250 KB).
export function heroImageForEmoji(emoji: string | null | undefined): string | null {
  if (!emoji) return null;
  const slug = HERO_BY_EMOJI[emoji];
  return slug ? `/hero/${slug}.jpg` : null;
}
