import type { Metadata, Viewport } from 'next';
import { Cairo } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

// خط الواجهة: القاهرة
const appFont = Cairo({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-app',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'توثيق | منصة توثيق الدورات التدريبية',
  description: 'إدارة وتوثيق صور وفيديوهات الدورات التدريبية وإنتاج مجلة إلكترونية لكل دورة',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'توثيق' },
  icons: { apple: '/apple-icon.png' },
};

// إعدادات العرض للجوال (سلوك يشبه التطبيق)
export const viewport: Viewport = {
  themeColor: '#0E5C50',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={appFont.variable}>
      <body className="font-sans antialiased">
        {children}
        <Toaster
          position="top-center"
          dir="rtl"
          richColors
          toastOptions={{ style: { fontFamily: 'var(--font-app)' } }}
        />
      </body>
    </html>
  );
}
