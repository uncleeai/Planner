import { describe, expect, it } from 'vitest';
import { emotesOnly, fromDraft, splitEmotes, toDraft, toPlain } from './emotes';

const ID = '01M433B4SNM4AHE0522AS9FGM9';
const ID2 = '60ae958e229664e8667aea38';

describe('emotki 7TV w tekście', () => {
  it('dzieli tekst na kawałki i emotki', () => {
    expect(splitEmotes(`no to [7tv:${ID}:monkaS] jedziemy`)).toEqual([
      { text: 'no to ' },
      { emote: { id: ID, name: 'monkaS' } },
      { text: ' jedziemy' },
    ]);
  });

  it('push / zajawka widzi samą nazwę', () => {
    expect(toPlain(`[7tv:${ID}:monkaS] serio? [7tv:${ID2}:KEKW]`)).toBe('monkaS serio? KEKW');
  });

  it('duże emotki tylko gdy w wiadomości są same emotki (max 3)', () => {
    expect(emotesOnly(`[7tv:${ID}:monkaS]`)).toBe(true);
    expect(emotesOnly(` [7tv:${ID}:monkaS] [7tv:${ID2}:KEKW] `)).toBe(true);
    expect(emotesOnly(`[7tv:${ID}:monkaS] no`)).toBe(false);
    expect(emotesOnly(`[7tv:${ID}:a][7tv:${ID}:b][7tv:${ID}:c][7tv:${ID}:d]`)).toBe(false);
    expect(emotesOnly('zwykły tekst')).toBe(false);
  });

  it('pole pisania ↔ baza: :nazwa: tylko dla emotek z mapy', () => {
    const { text, map } = toDraft(`[7tv:${ID}:monkaS] o 18:30 :)`);
    expect(text).toBe(':monkaS: o 18:30 :)');
    expect(fromDraft(`${text} :KEKW:`, map)).toBe(`[7tv:${ID}:monkaS] o 18:30 :) :KEKW:`);
    expect(fromDraft('bez emotek', new Map())).toBe('bez emotek');
  });
});
