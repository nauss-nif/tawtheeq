/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sharp يُستخدم على الخادم فقط
  serverExternalPackages: ['sharp'],
  experimental: {
    // النسخة دون اتصال تضمّن مكتبة التقليب بقراءتها من القرص؛ نضمن حزمها مع دالة المسار عند النشر
    outputFileTracingIncludes: {
      '/m/[slug]/offline': ['./node_modules/page-flip/dist/js/page-flip.browser.js'],
    },
  },
  images: {
    remotePatterns: [
      // نطاق تخزين Supabase (يُضبط عبر متغير البيئة عند النشر)
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
};

export default nextConfig;
