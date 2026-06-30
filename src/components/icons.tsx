// Lekkie ikony inline SVG (bez dodatkowej zależności), styl lucide-like.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export function Svg({ children, size = 16, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></Svg>
);
export const IconCalendarPlus = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="18" rx="3" />
    <path d="M3 9h18M8 2v4M16 2v4" />
    <path d="M12 13v6M9 16h6" />
  </Svg>
);
export const IconPencil = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Svg>
);
export const IconClock = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
);
export const IconPin = (p: IconProps) => (
  <Svg {...p}><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}><path d="M5 12l5 5L20 6" /></Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconChevron = (p: IconProps) => (
  <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>
);
export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}><path d="M15 18l-6-6 6-6" /></Svg>
);
export const IconBulb = (p: IconProps) => (
  <Svg {...p}><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12c.7.7 1 1.4 1 2h6c0-.6.3-1.3 1-2A7 7 0 0 0 12 2Z" /></Svg>
);
export const IconGear = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </Svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></Svg>
);

export const IconMessageSquare = (p: IconProps) => (
  <Svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Svg>
);
export const IconCamera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </Svg>
);
export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Svg>
);

// --- Pogoda (jednolity styl stroke; mapowane z kodu WMO przez WeatherIcon) ---
const CLOUD_LOW = 'M6.5 18.5a4 4 0 0 1 .4-7.98 5.5 5.5 0 0 1 10.6 1A3.5 3.5 0 0 1 17.5 18.5Z';
const CLOUD_HIGH = 'M6.5 15.5a4 4 0 0 1 .4-7.98 5.5 5.5 0 0 1 10.6 1A3.5 3.5 0 0 1 17.5 15.5Z';

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M5 5l1.4 1.4M17.6 17.6 19 19M2 12h2M20 12h2M5 19l1.4-1.4M17.6 6.4 19 5" />
  </Svg>
);
export const IconCloud = (p: IconProps) => (
  <Svg {...p}><path d={CLOUD_LOW} /></Svg>
);
export const IconCloudSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="13" cy="8" r="2.5" />
    <path d="M13 3.6v.8M17.4 8h-.8M16.1 4.9l-.5.5M9.9 4.9l.5.5" />
    <path d="M6.5 19a3.6 3.6 0 0 1 .4-7.18 5 5 0 0 1 9.6.9A3.2 3.2 0 0 1 16.4 19Z" />
  </Svg>
);
export const IconCloudRain = (p: IconProps) => (
  <Svg {...p}><path d={CLOUD_HIGH} /><path d="M9 19v2.5M13 19v2.5M16.5 19.5v2" /></Svg>
);
export const IconCloudSnow = (p: IconProps) => (
  <Svg {...p}><path d={CLOUD_HIGH} /><path d="M9 20h.01M12.5 21h.01M16 20h.01M10.7 22.5h.01M14.3 22.5h.01" /></Svg>
);
export const IconCloudBolt = (p: IconProps) => (
  <Svg {...p}><path d={CLOUD_HIGH} /><path d="M12.5 18.5l-2 3.5h2.5l-2 3" /></Svg>
);

// Kod pogody WMO → odpowiednia ikona (spójny styl, jak reszta UI).
export function WeatherIcon({ code, ...p }: IconProps & { code: number }) {
  if (code === 0 || code === 1) return <IconSun {...p} />;
  if (code === 2) return <IconCloudSun {...p} />;
  if (code === 3 || code === 45 || code === 48) return <IconCloud {...p} />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <IconCloudSnow {...p} />;
  if (code >= 95) return <IconCloudBolt {...p} />;
  return <IconCloudRain {...p} />; // mżawka / deszcz / przelotne
}


