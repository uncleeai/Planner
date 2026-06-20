// Bez kont: uczestnik identyfikuje się imieniem zapamiętanym w przeglądarce.
const STORAGE_KEY = 'planner.participantName';

export function getName(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(STORAGE_KEY) ?? '';
}

export function setName(name: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, name.trim());
}
