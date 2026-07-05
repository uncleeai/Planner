import { describe, it, expect, vi, afterEach } from 'vitest';
import { getEventStatus, getConfirmedSlot, slotEndMs, formatSlotShort, relativeDay } from './types';
import type { Slot, Vote } from './types';

// Fabryki minimalnych rekordów — testy czytają się jak scenariusze z apki.
let seq = 0;
function mkSlot(id: string, starts_at: string, opts: Partial<Slot> = {}): Slot {
  return {
    id, event_id: 'ev1', starts_at,
    ends_at: null, all_day: false,
    created_by: null, created_by_user_id: null,
    created_at: '2026-07-01T10:00:00Z',
    ...opts,
  };
}
function mkVote(slot_id: string, user_id: string | null, availability: Vote['availability']): Vote {
  return {
    id: `v${seq++}`, event_id: 'ev1', slot_id, user_id,
    participant_name: user_id ?? 'gość',
    availability, created_at: '2026-07-01T10:00:00Z',
  };
}
const NOT_CONFIRMED = { confirmed_slot_id: null, confirmed_at: null };

describe('slotEndMs — efektywny koniec terminu', () => {
  it('moment: koniec = dokładnie start', () => {
    const t = new Date('2026-07-11T16:00').getTime();
    expect(slotEndMs(mkSlot('a', '2026-07-11T16:00'))).toBe(t);
  });

  it('cały dzień: trwa do końca dnia, nie do północy rana', () => {
    const end = slotEndMs(mkSlot('a', '2026-07-11T00:00', { all_day: true }));
    const d = new Date(end);
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([11, 23, 59]);
  });

  it('zakres: koniec = koniec OSTATNIEGO dnia', () => {
    const end = slotEndMs(mkSlot('a', '2026-07-11T16:00', { ends_at: '2026-07-13T16:00' }));
    const d = new Date(end);
    expect([d.getDate(), d.getHours()]).toEqual([13, 23]);
  });
});

describe('formatSlotShort — mono-zapis rozkładowy', () => {
  it('pojedynczy dzień: „SOB 11.07"', () => {
    expect(formatSlotShort(mkSlot('a', '2026-07-11T16:00'))).toBe('SOB 11.07');
  });

  it('zakres w jednym miesiącu: „1-2.08"', () => {
    expect(formatSlotShort(mkSlot('a', '2026-08-01T10:00', { ends_at: '2026-08-02T10:00' })))
      .toBe('1-2.08');
  });

  it('zakres przez granicę miesiąca: „30.07-2.08"', () => {
    expect(formatSlotShort(mkSlot('a', '2026-07-30T10:00', { ends_at: '2026-08-02T10:00' })))
      .toBe('30.07-2.08');
  });
});

describe('relativeDay — liczone po granicy dnia', () => {
  afterEach(() => vi.useRealTimers());

  it('jutro wcześnie rano to „Jutro", nie „dziś za 2h"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T23:00'));
    expect(relativeDay('2026-07-06T01:00')).toBe('Jutro');
    expect(relativeDay('2026-07-05T23:30')).toBe('Dziś');
    expect(relativeDay('2026-07-08T12:00')).toBe('Za 3 dni');
    expect(relativeDay('2026-07-04T01:00')).toBe('Wczoraj');
    expect(relativeDay('2026-07-02T12:00')).toBe('3 dni temu');
  });
});

describe('getConfirmedSlot — wybór prowadzącego terminu', () => {
  const s1 = mkSlot('s1', '2026-07-11T16:00');
  const s2 = mkSlot('s2', '2026-07-18T16:00');

  it('bez żadnego READY nie ma prowadzącego (MOŻE/PAS nie wystarczą)', () => {
    const votes = [mkVote('s1', 'a', 'maybe'), mkVote('s1', 'b', 'no')];
    expect(getConfirmedSlot([s1, s2], votes).slotId).toBeNull();
  });

  it('więcej READY wygrywa', () => {
    const votes = [mkVote('s1', 'a', 'yes'), mkVote('s2', 'a', 'yes'), mkVote('s2', 'b', 'yes')];
    expect(getConfirmedSlot([s1, s2], votes).slotId).toBe('s2');
  });

  it('remis READY rozstrzyga MOŻE, potem wcześniejsza data', () => {
    const byMaybe = [mkVote('s1', 'a', 'yes'), mkVote('s2', 'b', 'yes'), mkVote('s2', 'c', 'maybe')];
    expect(getConfirmedSlot([s1, s2], byMaybe).slotId).toBe('s2');
    const pureTie = [mkVote('s1', 'a', 'yes'), mkVote('s2', 'b', 'yes')];
    expect(getConfirmedSlot([s1, s2], pureTie).slotId).toBe('s1'); // wcześniejszy
  });
});

describe('getEventStatus — reguły klepania terminu', () => {
  const s1 = mkSlot('s1', '2026-07-11T16:00');
  const s2 = mkSlot('s2', '2026-07-18T16:00');
  const paczka = ['a', 'b', 'c'];

  it('ręczny LOCK IN ma pierwszeństwo i jest sticky niezależnie od głosów', () => {
    const st = getEventStatus(
      { confirmed_slot_id: 's2', confirmed_at: '2026-07-18T16:00' },
      [s1, s2], [mkVote('s1', 'a', 'yes')], paczka,
    );
    expect(st).toMatchObject({ settled: true, source: 'manual', slotId: 's2' });
  });

  it('automat: komplet głosów + prowadzący → ustalone (to odpala push GRAMY)', () => {
    const votes = [mkVote('s1', 'a', 'yes'), mkVote('s1', 'b', 'maybe'), mkVote('s2', 'c', 'no')];
    const st = getEventStatus(NOT_CONFIRMED, [s1, s2], votes, paczka);
    expect(st).toMatchObject({ settled: true, source: 'auto', slotId: 's1', allVoted: true });
  });

  it('bez kompletu głosów — nieustalone, ale z podpowiedzią prowadzącego', () => {
    const votes = [mkVote('s1', 'a', 'yes'), mkVote('s1', 'b', 'yes')]; // brak „c"
    const st = getEventStatus(NOT_CONFIRMED, [s1, s2], votes, paczka);
    expect(st).toMatchObject({ settled: false, allVoted: false, leadingSlotId: 's1' });
  });

  it('komplet głosów, ale sami MOŻE/PAS → NIE klepie się samo', () => {
    const votes = [mkVote('s1', 'a', 'maybe'), mkVote('s1', 'b', 'no'), mkVote('s1', 'c', 'no')];
    const st = getEventStatus(NOT_CONFIRMED, [s1], votes, paczka);
    expect(st.settled).toBe(false);
  });

  it('głosy bez konta (user_id null) nie liczą się do kompletu', () => {
    const votes = [mkVote('s1', 'a', 'yes'), mkVote('s1', 'b', 'yes'), mkVote('s1', null, 'yes')];
    const st = getEventStatus(NOT_CONFIRMED, [s1], votes, paczka);
    expect(st).toMatchObject({ settled: false, allVoted: false });
  });

  it('pusta paczka nigdy nie klepie automatem', () => {
    const st = getEventStatus(NOT_CONFIRMED, [s1], [mkVote('s1', 'a', 'yes')], []);
    expect(st.settled).toBe(false);
  });
});
