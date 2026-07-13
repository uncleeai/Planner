import { colorFromString, initials, isAvatarUrl } from '@/lib/avatars';

export type Person = { name: string; avatar?: string | null };

// Awatar = wgrane zdjęcie (URL), wybrane emoji, albo fallback z inicjałami na kolorze z imienia.
export function Avatar({ name, avatar, size = 32 }: Person & { size?: number }) {
  if (isAvatarUrl(avatar)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="avatar"
        src={avatar as string}
        alt={name}
        title={name}
        style={{ width: size, height: size, objectFit: 'cover' }}
      />
    );
  }
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
