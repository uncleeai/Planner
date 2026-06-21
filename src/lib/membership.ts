// Bez kont: zapamiętujemy w przeglądarce, do których ekip należy to urządzenie.
// Dzięki temu strona główna pokazuje „Twoje ekipy", a otwarcie linku ekipy od
// znajomych dopisuje ją do listy. Współdzielenie odbywa się przez link ekipy.
const STORAGE_KEY = 'planner.groups';

export type RememberedGroup = { id: string; name: string };

export function getGroups(): RememberedGroup[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RememberedGroup[]) : [];
  } catch {
    return [];
  }
}

export function rememberGroup(id: string, name: string): void {
  if (typeof window === 'undefined') return;
  const groups = getGroups().filter((g) => g.id !== id);
  // najnowsze/najświeższe na początku listy
  groups.unshift({ id, name });
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

export function forgetGroup(id: string): void {
  if (typeof window === 'undefined') return;
  const groups = getGroups().filter((g) => g.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}
