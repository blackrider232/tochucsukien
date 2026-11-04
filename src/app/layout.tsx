import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { SkipLink, UiProviders } from '@/components/ui';
import { UpdatePrompt } from '@/components/shell/update-prompt';
import { THEME_BOOT_SCRIPT } from '@/core/prefs';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Sự kiện SCE', template: '%s · Sự kiện SCE' },
  description: 'Quản trị tổ chức sự kiện, Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội.',
  applicationName: 'Sự kiện SCE',
  appleWebApp: { capable: true, title: 'Sự kiện SCE', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icons/app-icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

// No maximum-scale or user-scalable: pinch zoom stays available (m2 BUG-36).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1e3a8a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <Script id="theme-boot" strategy="beforeInteractive">
          {THEME_BOOT_SCRIPT}
        </Script>
        <SkipLink />
        <UiProviders>
          {children}
          <UpdatePrompt />
        </UiProviders>
      </body>
    </html>
  );
}
