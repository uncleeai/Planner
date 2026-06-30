// Monochromatyczne ikony liniowe wypadu (zamiast surowych emoji). Spójne ze stylem
// stroke z components/icons.tsx. W bazie (events.emoji) zapisujemy id ikony, np. "beer".
// Stare wypady mają zapisany znak emoji — EventIcon renderuje go wtedy jako tekst (fallback).
import type { SVGProps } from 'react';
import { Svg, IconCalendar } from '@/components/icons';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };
type IconCmp = (p: IconProps) => React.ReactElement;

const Beer: IconCmp = (p) => (<Svg {...p}><path d="M7 9h7v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" /><path d="M14 11h2.2A1.8 1.8 0 0 1 18 12.8v1.4A1.8 1.8 0 0 1 16.2 16H14" /><path d="M7.6 9a2.3 2.3 0 1 1 1.1-4.3 2.8 2.8 0 0 1 5 .3A2 2 0 0 1 13.6 9" /><path d="M9.2 12v5M11.5 12v5" /></Svg>);
const Sparkles: IconCmp = (p) => (<Svg {...p}><path d="M12 3l1.3 3.4L16.7 7.7l-3.4 1.3L12 12.4l-1.3-3.4L7.3 7.7l3.4-1.3z" /><path d="M18 13l.8 1.9 1.9.8-1.9.8L18 18.4l-.8-1.9-1.9-.8 1.9-.8z" /><path d="M5.5 14l.6 1.5 1.5.6-1.5.6L5.5 18.2l-.6-1.5L3.4 16.1l1.5-.6z" /></Svg>);
const Tent: IconCmp = (p) => (<Svg {...p}><path d="M12 4 3 20h18z" /><path d="M12 11l-3.2 9M12 11l3.2 9" /></Svg>);
const Mountain: IconCmp = (p) => (<Svg {...p}><path d="M3 19.5l5.5-10 3.3 5L15 10l6 9.5z" /><path d="M8.5 9.5l1.5 2.3" /></Svg>);
const Umbrella: IconCmp = (p) => (<Svg {...p}><path d="M12 3.5c4.2 0 7.7 3 8 7H4c.3-4 3.8-7 8-7z" /><path d="M12 10.5V20" /><path d="M12 20a2.2 2.2 0 0 0 2.2-2.2" /></Svg>);
const Wave: IconCmp = (p) => (<Svg {...p}><path d="M3 8.5c1.8 0 1.8 1.8 3.6 1.8S8.2 8.5 10 8.5s1.8 1.8 3.6 1.8S15.2 8.5 17 8.5s1.8 1.8 3.6 1.8" /><path d="M3 13c1.8 0 1.8 1.8 3.6 1.8S8.2 13 10 13s1.8 1.8 3.6 1.8S15.2 13 17 13s1.8 1.8 3.6 1.8" /><path d="M3 17.5c1.8 0 1.8 1.8 3.6 1.8S8.2 17.5 10 17.5s1.8 1.8 3.6 1.8S15.2 17.5 17 17.5s1.8 1.8 3.6 1.8" /></Svg>);
const Pizza: IconCmp = (p) => (<Svg {...p}><path d="M4 6.5 12 21l8-14.5c-5-2.3-11-2.3-16 0z" /><circle cx="9.7" cy="9.5" r="1" fill="currentColor" stroke="none" /><circle cx="14" cy="9.8" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" /></Svg>);
const Utensils: IconCmp = (p) => (<Svg {...p}><path d="M6 3v6c0 1 .6 1.8 2 1.8S10 9 10 8V3" /><path d="M8 10.8V21" /><path d="M16.5 3c-1.6 0-2.8 1.7-2.8 4.2S15 11.2 16.5 11.4V21" /></Svg>);
const Gamepad: IconCmp = (p) => (<Svg {...p}><rect x="2.5" y="8" width="19" height="9" rx="4.5" /><path d="M6.5 11v3M5 12.5h3" /><circle cx="16" cy="11.5" r="1" fill="currentColor" stroke="none" /><circle cx="18.2" cy="13.6" r="1" fill="currentColor" stroke="none" /></Svg>);
const Film: IconCmp = (p) => (<Svg {...p}><rect x="3" y="8.5" width="18" height="11.5" rx="2" /><path d="M3 12.5h18" /><path d="M6 12.5 7.3 8.5M10.5 12.5 11.8 8.5M15 12.5 16.3 8.5" /></Svg>);
const Ball: IconCmp = (p) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.2l2.7 2-1 3.3h-3.4l-1-3.3z" /><path d="M12 7.2V4M14.7 9.2 18 8.1M13.7 12.5l2 2.8M10.3 12.5l-2 2.8M9.3 9.2 6 8.1" /></Svg>);
const Music: IconCmp = (p) => (<Svg {...p}><path d="M9 17.5V5l11-2v12.5" /><circle cx="6.2" cy="17.5" r="2.8" /><circle cx="17.2" cy="15.5" r="2.8" /></Svg>);
const Car: IconCmp = (p) => (<Svg {...p}><path d="M5 17v-3.5l1.8-4.2A2 2 0 0 1 8.6 8h6.8a2 2 0 0 1 1.8 1.3L19 13.5V17" /><path d="M4 13.5h16" /><circle cx="8" cy="17" r="1.8" /><circle cx="16" cy="17" r="1.8" /></Svg>);
const Plane: IconCmp = (p) => (<Svg {...p}><path d="M12 3c.8 0 1.3.9 1.3 2.2V8.5l7 4.2v1.8l-7-2v3.5l2 1.4v1.4L12 18l-3.3.8v-1.4l2-1.4V14.5l-7 2v-1.8l7-4.2V5.2C10.7 3.9 11.2 3 12 3z" /></Svg>);
const Flame: IconCmp = (p) => (<Svg {...p}><path d="M12 2.5c1 3.5 4.5 4.8 4.5 8.5a4.5 4.5 0 0 1-9 0c0-1.2.4-2 1.1-2.8C10 8.2 12 7 12 2.5z" /><path d="M12 14.2c.8 1 1.6 1.5 1.6 2.8a1.6 1.6 0 0 1-3.2 0c0-.6.3-1 .7-1.5" /></Svg>);
const Cake: IconCmp = (p) => (<Svg {...p}><path d="M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7" /><path d="M3.5 21h17" /><path d="M5 15.5c1.3 0 1.3 1 2.6 1s1.3-1 2.6-1 1.3 1 2.6 1 1.3-1 2.6-1 1.3 1 2.6 1" /><path d="M12 8.5v3.5" /><circle cx="12" cy="7.2" r="0.7" fill="currentColor" stroke="none" /></Svg>);
const Target: IconCmp = (p) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></Svg>);
const Home: IconCmp = (p) => (<Svg {...p}><path d="M4 11 12 4l8 7" /><path d="M6 9.8V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.8" /><path d="M10 20v-5h4v5" /></Svg>);

// Kolejność = układ pickera. Id zapisywane w bazie.
export const EVENT_ICONS: { id: string; Icon: IconCmp }[] = [
  { id: 'beer', Icon: Beer },
  { id: 'sparkles', Icon: Sparkles },
  { id: 'tent', Icon: Tent },
  { id: 'mountain', Icon: Mountain },
  { id: 'umbrella', Icon: Umbrella },
  { id: 'wave', Icon: Wave },
  { id: 'pizza', Icon: Pizza },
  { id: 'utensils', Icon: Utensils },
  { id: 'gamepad', Icon: Gamepad },
  { id: 'film', Icon: Film },
  { id: 'ball', Icon: Ball },
  { id: 'music', Icon: Music },
  { id: 'car', Icon: Car },
  { id: 'plane', Icon: Plane },
  { id: 'flame', Icon: Flame },
  { id: 'cake', Icon: Cake },
  { id: 'target', Icon: Target },
  { id: 'home', Icon: Home },
];

const REGISTRY: Record<string, IconCmp> = Object.fromEntries(EVENT_ICONS.map(({ id, Icon }) => [id, Icon]));

// Render ikony wypadu: id → SVG; stary znak emoji → tekst (fallback); brak → kalendarz.
export function EventIcon({ value, size = 22 }: { value: string | null; size?: number }) {
  if (value && REGISTRY[value]) {
    const Icon = REGISTRY[value];
    return <Icon size={size} />;
  }
  if (value) return <span className="event-icon-emoji" style={{ fontSize: size }}>{value}</span>;
  return <IconCalendar size={size} />;
}
