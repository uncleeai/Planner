// Sanityzacja własnego emoji wypadu. Pole w kreatorze przyjmuje cokolwiek, co
// wpadnie z klawiatury (litery, spacje, wklejony tekst), więc bierzemy z wejścia
// PIERWSZY prawdziwy emoji, a wszystko inne odrzucamy.
//
// Liczenie emoji po `.length` albo `Array.from` nie działa: rodzina 👨‍👩‍👧‍👦 (sekwencja
// ZWJ), 👍🏽 (modyfikator odcienia skóry) czy 🏳️‍🌈 to JEDEN znak dla użytkownika, ale
// wiele code pointów. Jedyne poprawne cięcie to grafemy — natywny Intl.Segmenter.

// Regional_Indicator jest konieczny obok Extended_Pictographic: flagi (🇵🇱) to para
// znaków RI, które same w sobie nie są „piktogramami".
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

function graphemes(s: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (!Seg) return Array.from(s); // fallback: gorzej tnie ZWJ, ale nie wywala apki
  return Array.from(new Seg('pl', { granularity: 'grapheme' }).segment(s), (g) => g.segment);
}

/** Pierwszy emoji z tekstu albo null (litera, cyfra, spacja, pusty tekst → null). */
export function firstEmoji(raw: string): string | null {
  if (!raw) return null;
  for (const g of graphemes(raw.trim())) {
    if (EMOJI_RE.test(g)) return g;
  }
  return null;
}
