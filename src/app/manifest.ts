import type { MetadataRoute } from 'next';

/** بيان تطبيق الويب — يجعل المنصة قابلة للتثبيت على الجوال كتطبيق */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'توثيق | منصة توثيق الدورات التدريبية',
    short_name: 'توثيق',
    description: 'إدارة وتوثيق صور وفيديوهات الدورات التدريبية وإنتاج مجلة إلكترونية',
    start_url: '/',
    display: 'standalone',
    background_color: '#F6F2EA',
    theme_color: '#0E5C50',
    lang: 'ar',
    dir: 'rtl',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
