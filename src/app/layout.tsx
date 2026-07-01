import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { AuthProvider } from '@/lib/auth';
import { TransitionProvider } from '@/lib/transition';
import { BackgroundProvider } from '@/lib/background';
import GlassBackground from '@/components/GlassBackground';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wypad.exe',
  description: 'Zaproponuj terminy wypadu, zobacz kto wchodzi i który termin prowadzi — na żywo.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Wypad.exe' },
  icons: { icon: '/icon.svg', apple: '/icon-180.png' },
};

export const viewport: Viewport = {
  themeColor: '#050505',
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
    <html lang="pl">
      <body>
        <BackgroundProvider>
          <GlassBackground />
          <div className="container">
            <TransitionProvider>
              <AuthProvider>{children}</AuthProvider>
            </TransitionProvider>
          </div>
        </BackgroundProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
