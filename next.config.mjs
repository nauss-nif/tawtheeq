/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sharp يُستخدم على الخادم فقط
  serverExternalPackages: ['sharp'],
  images: {
    remotePatterns: [
      // نطاق تخزين Supabase (يُضبط عبر متغير البيئة عند النشر)
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
};

export default nextConfig;
