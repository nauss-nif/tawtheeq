import type { Config } from 'tailwindcss';

/**
 * نظام التصميم والهوية البصرية لجامعة نايف العربية للعلوم الأمنية.
 * كل الألوان معرّفة هنا كـ tokens ولا يُستخدم أي لون خارج هذه اللوحة.
 */
const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/features/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // الألوان الأساسية
        primary: {
          DEFAULT: '#0E5C50', // أخضر نايف الداكن
          dark: '#0A4A40',
        },
        secondary: '#B99C6B', // ذهبي/بيج نايف
        background: '#F6F2EA', // كريمي فاتح
        surface: '#FFFFFF', // أبيض

        // الألوان الفرعية (للحالات والرسوم فقط)
        state: {
          danger: '#8E3B4A', // عنابي — فشل/مرفوض
          warning: '#D9A441', // خردلي — قيد المعالجة/تنبيه
          info: '#3E7C8F', // أزرق بترولي — روابط/معلومة
        },
        chart: {
          navy: '#33567D', // أزرق داكن
          olive: '#6E7645', // زيتوني
        },
        muted: '#8B8178', // رمادي دافئ — نصوص ثانوية/حدود
      },
      fontFamily: {
        sans: ['var(--font-app)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        base: ['16px', { lineHeight: '1.8' }],
      },
      borderRadius: {
        '2xl': '1rem',
      },
      boxShadow: {
        // ظلال ناعمة جدًا للبطاقات
        soft: '0 1px 3px 0 rgba(14, 92, 80, 0.06), 0 1px 2px -1px rgba(14, 92, 80, 0.04)',
        'soft-md': '0 4px 12px -2px rgba(14, 92, 80, 0.08)',
      },
      keyframes: {
        'fade-rise': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(-100%)' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
