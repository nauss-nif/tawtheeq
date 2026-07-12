import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** دمج أصناف Tailwind بأمان */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** توليد slug عشوائي غير قابل للتخمين (12+ حرفًا) للمجلة */
export function generateSlug(length = 14): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** تنسيق حجم الملفات بالعربية */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 بايت';
  const units = ['بايت', 'ك.ب', 'م.ب', 'ج.ب', 'ت.ب'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** نسبة التوفير في الحجم */
export function compressionRatio(original?: number | null, compressed?: number | null): number {
  if (!original || !compressed || original <= 0) return 0;
  return Math.max(0, Math.round((1 - compressed / original) * 100));
}

/** تنسيق التاريخ بالعربية (تقويم ميلادي) */
export function formatArabicDate(date: string | null | undefined): string {
  if (!date) return '';
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

/** تنسيق مدة الفيديو (ثوانٍ إلى mm:ss) */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
