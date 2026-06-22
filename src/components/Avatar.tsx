import { colorFromString, initials } from '@/lib/avatars';

export type Person = { name: string; avatar?: string | null };

// Awatar = wybrane emoji na neutralnym kółku; fallback = inicjały na kolorze z imienia.
export function Avatar({ name, avatar, size = 32 }: Person & { size?: number }) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: avatar ? size * 0.56 : size * 0.4,
    background: avatar ? 'var(--card-2)' : colorFromString(name),
  };
  return (
    <span className="avatar" style={style} title={name}>
      {avatar || initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 5, size = 28 }: { people: Person[]; max?: number; size?: number }) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="avatar-stack">
      {shown.map((p, i) => (
        <Avatar key={i} name={p.name} avatar={p.avatar} size={size} />
      ))}
      {extra > 0 && (
        <span className="avatar avatar-more" style={{ width: size, height: size, fontSize: size * 0.4 }}>
          +{extra}
        </span>
      )}
    </div>
  );
}
