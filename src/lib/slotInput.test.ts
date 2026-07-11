import { describe, it, expect } from 'vitest';
import { buildSlotTimes, slotToRange, EMPTY_SLOT_RANGE } from './slotInput';

// Testy odpalane z TZ=Europe/Warsaw (skrypt npm test) — budowanie dat jest
// zależne od strefy, więc przypinamy ją dla powtarzalności.
describe('buildSlotTimes — Od / Do / Godzina → rekord slotu', () => {
  it('puste „Od" → null (formularz bez daty nic nie buduje)', () => {
    expect(buildSlotTimes(EMPTY_SLOT_RANGE)).toBeNull();
  });

  it('Od + Godzina → konkretny moment', () => {
    const t = buildSlotTimes({ od: '2026-07-11', doDate: '', time: '18:30' })!;
    expect(t.all_day).toBe(false);
    expect(t.ends_at).toBeNull();
    const d = new Date(t.starts_at);
    expect([d.getHours(), d.getMinutes()]).toEqual([18, 30]); // czas lokalny zachowany
  });

  it('samo „Od" → cały dzień', () => {
    const t = buildSlotTimes({ od: '2026-07-11', doDate: '', time: '' })!;
    expect(t).toMatchObject({ all_day: true, ends_at: null });
  });

  it('Od + Do → zakres dni (cały dzień)', () => {
    const t = buildSlotTimes({ od: '2026-07-11', doDate: '2026-07-13', time: '' })!;
    expect(t.all_day).toBe(true);
    expect(new Date(t.ends_at!).getDate()).toBe(13);
  });

  it('Od + Do + Godzina → zakres z godziną wyjazdu', () => {
    const t = buildSlotTimes({ od: '2026-07-11', doDate: '2026-07-13', time: '16:00' })!;
    expect(t.all_day).toBe(false);
    expect(t.ends_at).not.toBeNull();
  });

  it('„Do" nie późniejsze niż „Od" jest ignorowane', () => {
    const t = buildSlotTimes({ od: '2026-07-11', doDate: '2026-07-11', time: '' })!;
    expect(t.ends_at).toBeNull();
  });
});

describe('slotToRange — rekord slotu z powrotem na pola formularza (edycja)', () => {
  it('jest odwrotnością buildSlotTimes dla wszystkich wariantów', () => {
    const cases = [
      { od: '2026-07-11', doDate: '', time: '18:30' },       // moment
      { od: '2026-07-11', doDate: '', time: '' },            // cały dzień
      { od: '2026-07-11', doDate: '2026-07-13', time: '' },  // zakres dni
      { od: '2026-07-11', doDate: '2026-07-13', time: '16:00' }, // zakres z godziną
    ];
    for (const r of cases) {
      expect(slotToRange(buildSlotTimes(r)!)).toEqual(r);
    }
  });
});
