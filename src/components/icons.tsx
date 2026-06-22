// Lekkie ikony inline SVG (bez dodatkowej zależności), styl lucide-like.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ children, size = 16, ...props }: IconProps & { children: React.ReactNode }) {
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
export const IconBulb = (p: IconProps) => (
  <Svg {...p}><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12c.7.7 1 1.4 1 2h6c0-.6.3-1.3 1-2A7 7 0 0 0 12 2Z" /></Svg>
);
