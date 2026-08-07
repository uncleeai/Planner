import { describe, expect, it } from 'vitest';
import {
  categorizeEvents,
  computeSlotStats,
  formatDateTime,
  isOrganizer,
  maxYesCount,
  missingVoterNames,
  participantNames,
} from '@/lib/planner';
import type { Availability, EventRow, Profile, Slot, Vote } from '@/lib/types';

function makeEvent(over: Partial<EventRow> & { id: string }): EventRow {
  return {
    title: 'Wypad',
    location: null,
    description: null,
    created_by: null,
    created_by_user_id: null,
    confirmed_slot_id: null,
    confirmed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function makeSlot(id: string, startsAt: string): Slot {
  return {
    id,
    event_id: 'e1',
    starts_at: startsAt,
    created_by: null,
    created_by_user_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function makeVote(
  slotId: string,
  userId: string | null,
  availability: Availability,
  name = userId ?? 'Gość',
): Vote {
  return {
    id: `${slotId}-${userId}`,
    event_id: 'e1',
    slot_id: slotId,
    user_id: userId,
    participant_name: name,
    availability,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function makeProfile(id: string, displayName: string): Profile {
  return {
    id,
    display_name: displayName,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('categorizeEvents', () => {
  const now = new Date('2026-06-15T12:00:00.000Z').getTime();

  it('wypad bez ustalonego terminu trafia do „do ustalenia"', () => {
    const { open, upcoming, past } = categorizeEvents([makeEvent({ id: 'a' })], now);
    expect(open.map((e) => e.id)).toEqual(['a']);
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(0);
  });

  it('sortuje nadchodzące od najbliższego, a minione od najnowszego', () => {
    const events = [
      makeEvent({ id: 'daleki', confirmed_at: '2026-08-01T18:00:00.000Z' }),
      makeEvent({ id: 'stary', confirmed_at: '2026-01-10T18:00:00.000Z' }),
      makeEvent({ id: 'bliski', confirmed_at: '2026-06-20T18:00:00.000Z' }),
      makeEvent({ id: 'niedawny', confirmed_at: '2026-06-01T18:00:00.000Z' }),
      makeEvent({ id: 'otwarty' }),
    ];

    const { open, upcoming, past } = categorizeEvents(events, now);

    expect(open.map((e) => e.id)).toEqual(['otwarty']);
    expect(upcoming.map((e) => e.id)).toEqual(['bliski', 'daleki']);
    expect(past.map((e) => e.id)).toEqual(['niedawny', 'stary']);
  });

  it('wypad dokładnie „teraz" liczy się jeszcze jako nadchodzący', () => {
    const events = [makeEvent({ id: 'teraz', confirmed_at: '2026-06-15T12:00:00.000Z' })];
    expect(categorizeEvents(events, now).upcoming.map((e) => e.id)).toEqual(['teraz']);
  });

  it('nie modyfikuje wejściowej tablicy', () => {
    const events = [
      makeEvent({ id: 'b', confirmed_at: '2026-08-01T18:00:00.000Z' }),
      makeEvent({ id: 'a', confirmed_at: '2026-07-01T18:00:00.000Z' }),
    ];
    categorizeEvents(events, now);
    expect(events.map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('computeSlotStats', () => {
  const slots = [makeSlot('s1', '2026-06-20T18:00:00.000Z'), makeSlot('s2', '2026-06-21T18:00:00.000Z')];
  const votes = [
    makeVote('s1', 'u1', 'yes', 'Kuba'),
    makeVote('s1', 'u2', 'maybe', 'Ola'),
    makeVote('s1', 'u3', 'no', 'Michał'),
    makeVote('s2', 'u1', 'no', 'Kuba'),
  ];

  it('liczy głosy osobno dla każdego terminu', () => {
    const [first, second] = computeSlotStats(slots, votes, 'u1');

    expect(first).toMatchObject({ yes: 1, maybe: 1, no: 1, mine: 'yes' });
    expect(first.votes).toHaveLength(3);
    expect(second).toMatchObject({ yes: 0, maybe: 0, no: 1, mine: 'no' });
  });

  it('zwraca `mine` jako undefined, gdy użytkownik nie głosował', () => {
    const stats = computeSlotStats(slots, votes, 'u9');
    expect(stats.every((s) => s.mine === undefined)).toBe(true);
  });

  it('nie przypisuje cudzych głosów, gdy userId jest null', () => {
    const stats = computeSlotStats(slots, votes, null);
    expect(stats.every((s) => s.mine === undefined)).toBe(true);
  });

  it('zwraca zera dla terminu bez głosów', () => {
    const [only] = computeSlotStats([makeSlot('s3', '2026-06-22T18:00:00.000Z')], votes, 'u1');
    expect(only).toMatchObject({ yes: 0, maybe: 0, no: 0, mine: undefined });
  });
});

describe('maxYesCount', () => {
  it('zwraca 0 dla braku terminów', () => {
    expect(maxYesCount([])).toBe(0);
  });

  it('zwraca największą liczbę głosów „Mogę"', () => {
    const slots = [makeSlot('s1', '2026-06-20T18:00:00.000Z'), makeSlot('s2', '2026-06-21T18:00:00.000Z')];
    const votes = [
      makeVote('s1', 'u1', 'yes'),
      makeVote('s2', 'u1', 'yes'),
      makeVote('s2', 'u2', 'yes'),
    ];
    expect(maxYesCount(computeSlotStats(slots, votes, 'u1'))).toBe(2);
  });
});

describe('participantNames', () => {
  it('nie powtarza osoby głosującej na kilka terminów', () => {
    const votes = [
      makeVote('s1', 'u1', 'yes', 'Kuba'),
      makeVote('s2', 'u1', 'no', 'Kuba'),
      makeVote('s1', 'u2', 'yes', 'Ola'),
    ];
    expect(participantNames(votes)).toEqual(['Kuba', 'Ola']);
  });
});

describe('missingVoterNames', () => {
  const members = [makeProfile('u1', 'Kuba'), makeProfile('u2', 'Ola'), makeProfile('u3', 'Michał')];

  it('wymienia tych, którzy nie oddali żadnego głosu', () => {
    const votes = [makeVote('s1', 'u1', 'yes', 'Kuba')];
    expect(missingVoterNames(members, votes)).toEqual(['Ola', 'Michał']);
  });

  it('zwraca pustą listę, gdy cała paczka zagłosowała', () => {
    const votes = members.map((m) => makeVote('s1', m.id, 'yes', m.display_name));
    expect(missingVoterNames(members, votes)).toEqual([]);
  });

  it('ignoruje stare głosy bez konta (user_id = null)', () => {
    const votes = [makeVote('s1', null, 'yes', 'Anonim')];
    expect(missingVoterNames(members, votes)).toEqual(['Kuba', 'Ola', 'Michał']);
  });
});

describe('isOrganizer', () => {
  it('rozpoznaje twórcę wypadu', () => {
    const event = makeEvent({ id: 'a', created_by_user_id: 'u1' });
    expect(isOrganizer(event, 'u1')).toBe(true);
    expect(isOrganizer(event, 'u2')).toBe(false);
  });

  it('stary wypad bez właściciela jest edytowalny przez każdego', () => {
    expect(isOrganizer(makeEvent({ id: 'a' }), 'u2')).toBe(true);
  });

  it('bez wypadu nie ma organizatora', () => {
    expect(isOrganizer(null, 'u1')).toBe(false);
  });
});

describe('formatDateTime', () => {
  it('formatuje datę po polsku w strefie z konfiguracji testów (Europe/Warsaw)', () => {
    // 2026-06-20T18:00Z = 20:00 czasu polskiego (CEST).
    const out = formatDateTime('2026-06-20T18:00:00.000Z');
    expect(out).toContain('20 czerwca');
    expect(out).toContain('20:00');
  });
});
