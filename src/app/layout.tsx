import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { AuthProvider } from '@/lib/auth';
import { TransitionProvider } from '@/lib/transition';
import GlassBackground from '@/components/GlassBackground';
import { DialogHost } from '@/components/Dialogs';
import './globals.css';

// Jeden mono na wszystkich urządzeniach. Ze stackiem systemowym skórka wyglądała
// inaczej na telefonie (SF Mono) niż na PC (Consolas/Cascadia) — a mono niesie tu
// całą tożsamość: daty, etykiety, chipy, wordmark. Self-hosted przez next/font
// (pobierany przy buildzie), latin-ext dla polskich znaków.
const mono = JetBrains_Mono({ subsets: ['latin', 'latin-ext'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Wypad.exe',
  description: 'Zaproponuj terminy wypadu, zobacz kto wchodzi i który termin prowadzi — na żywo.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Wypad.exe' },
  // Next emituje już tylko ustandaryzowany `mobile-web-app-capable`, ale iOS honoruje
  // status-bar-style WYŁĄCZNIE w parze z legacy `apple-mobile-web-app-capable` — bez
  // niego pasek statusu jest nieprzezroczysty i apka kończy się pod Dynamic Island.
  other: { 'apple-mobile-web-app-capable': 'yes' },
  icons: { icon: '/icon.svg', apple: '/icon-180.png' },
};

export const viewport: Viewport = {
  themeColor: '#0c0e10',
  width: 'device-width',
  initialScale: 1,
  // Stałe UI appki, nie strona z treścią do powiększania — zoom tylko wprowadza
  // opóźnienie/dwuznaczność w tapach (patrz touch-action w globals.css). maximumScale
  // równy initialScale wyłącza pinch- i double-tap-zoom w przeglądarkach.
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={mono.variable}>
      <body>
        <GlassBackground />
        <div className="statusbar-blur" aria-hidden="true" />
        <div className="container">
          <TransitionProvider>
            <AuthProvider>{children}</AuthProvider>
          </TransitionProvider>
        </div>
        <DialogHost />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
