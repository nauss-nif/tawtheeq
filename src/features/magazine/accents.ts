/**
 * لون مميّز لكل محور: يلوّن صفحات المحور (الشريط الجانبي، الرقم، الفواصل) في الـPDF
 * والمجلة المتقلبة والنسخة دون اتصال، ويظهر نفسه بجوار المحور في صفحة المحتويات.
 * الألوان من لوحة هوية الجامعة (tailwind.config.ts) وتتكرر دوريًا.
 */
export interface SessionAccent {
  /** اللون الأساسي (عناوين، شرائط) */
  main: string;
  /** درجة فاتحة للخلفيات والشارات */
  tint: string;
}

const ACCENTS: SessionAccent[] = [
  { main: '#0E5C50', tint: '#E3EFEC' }, // أخضر نايف
  { main: '#33567D', tint: '#E4EAF1' }, // أزرق داكن
  { main: '#8E3B4A', tint: '#F3E5E8' }, // عنابي
  { main: '#6E7645', tint: '#ECEEE3' }, // زيتوني
  { main: '#3E7C8F', tint: '#E3EEF1' }, // أزرق بترولي
  { main: '#9A7B45', tint: '#F3ECE0' }, // ذهبي داكن
];

export function sessionAccent(index: number): SessionAccent {
  return ACCENTS[((index % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
}
