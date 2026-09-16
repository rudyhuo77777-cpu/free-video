import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '../components/Nav';
import { PwaRegistrar } from '../components/PwaRegistrar';
import { LanguageProvider } from '../components/LanguageProvider';

export const metadata: Metadata = {
  title: 'Free Video — 120 Detik. Gratis. Tanpa Kredit Video.',
  description: '120 Detik. Gratis. Tanpa Kredit Video. Buat video jualan sampai 120 detik dengan script, footage, subtitle, animasi, dan render lokal di perangkat pengguna.',
  manifest: '/manifest.webmanifest'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <LanguageProvider>
          <PwaRegistrar />
          <Nav />
          <main>{children}</main>
        </LanguageProvider>
      </body>
    </html>
  );
}
