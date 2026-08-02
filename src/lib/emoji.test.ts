import { describe, it, expect } from 'vitest';
import { firstEmoji } from './emoji';

// Pole własnego emoji w kreatorze przyjmuje wszystko, co da klawiatura — te testy
// pilnują, że do stanu trafia wyłącznie emoji (albo nic).
describe('firstEmoji — wyciąganie emoji z dowolnego wejścia', () => {
  it('proste emoji przechodzi', () => {
    expect(firstEmoji('🎉')).toBe('🎉');
  });

  it('litera, cyfra i znak interpunkcyjny → null', () => {
    expect(firstEmoji('a')).toBeNull();
    expect(firstEmoji('7')).toBeNull();
    expect(firstEmoji('!')).toBeNull();
  });

  it('spacje i pusty tekst → null', () => {
    expect(firstEmoji(' ')).toBeNull();
    expect(firstEmoji('   ')).toBeNull();
    expect(firstEmoji('')).toBeNull();
  });

  it('zwykłe słowo → null', () => {
    expect(firstEmoji('impreza')).toBeNull();
  });

  it('tekst zmieszany z emoji → sam emoji', () => {
    expect(firstEmoji('impreza 🎉')).toBe('🎉');
    expect(firstEmoji('  🍻 piwo')).toBe('🍻');
  });

  it('kilka emoji → tylko pierwszy', () => {
    expect(firstEmoji('🔥🎸🥁')).toBe('🔥');
  });

  it('flaga (para Regional Indicator) zostaje w całości', () => {
    expect(firstEmoji('🇵🇱')).toBe('🇵🇱');
  });

  it('emoji z odcieniem skóry nie jest rozrywane', () => {
    expect(firstEmoji('👍🏽')).toBe('👍🏽');
  });

  it('sekwencja ZWJ (rodzina) zostaje jednym emoji', () => {
    expect(firstEmoji('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
  });

  it('emoji z wariantem tekstowym/kolorowym (⛰️) przechodzi', () => {
    expect(firstEmoji('⛰️')).toBe('⛰️');
  });
});
