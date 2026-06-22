// Awatary wybierane przy pierwszym logowaniu + deterministyczne kolory dla fallbacku (inicjały).

export const AVATARS = ['🦊', '🐼', '🦁', '🐯', '🐸', '🐧', '🦉', '🐙', '🦄', '🐲', '🐝', '🐵'];

const COLORS = [
  '#5b57f2', '#ff8a5b', '#30d158', '#ff453a', '#ffd60a', '#0a84ff',
  '#bf5af2', '#64d2ff', '#ff375f', '#ac8e68', '#34c759', '#ff9f0a',
];

// Stabilny kolor wyliczony z tekstu (np. imienia) — spójny między sesjami.
export function colorFromString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
