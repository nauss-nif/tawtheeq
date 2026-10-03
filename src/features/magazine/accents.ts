/**
 * الهوية البصرية للمحاور: لكل محور لون من لوحة هوية الجامعة يلوّن صفحاته كلها
 * (لسان الفهرسة الجانبي، نجمة الجامعة الكبيرة في الزاوية، كتلة الإطار خلف الصورة، الرقم والعناوين)
 * في الـPDF والمجلة المتقلبة والنسخة دون اتصال والموقع، ويظهر نفسه بجوار المحور في صفحة المحتويات.
 */
export interface SessionAccent {
  /** اللون الأساسي (عناوين، ألسنة، أرقام) */
  main: string;
  /** درجة أغمق للتدرّجات والظلال */
  deep: string;
  /** درجة فاتحة للخلفيات والشارات */
  tint: string;
}

const ACCENTS: SessionAccent[] = [
  { main: '#0E5C50', deep: '#08392F', tint: '#E3EFEC' }, // أخضر نايف
  { main: '#33567D', deep: '#1F3651', tint: '#E4EAF1' }, // أزرق داكن
  { main: '#8E3B4A', deep: '#5E2430', tint: '#F3E5E8' }, // عنابي
  { main: '#6E7645', deep: '#474D2A', tint: '#ECEEE3' }, // زيتوني
  { main: '#3E7C8F', deep: '#26525F', tint: '#E3EEF1' }, // أزرق بترولي
  { main: '#9A7B45', deep: '#6A532B', tint: '#F3ECE0' }, // ذهبي داكن
];

/** لون الصفحات العامة (الترحيب، عن الدورة، المحتويات): ذهبي الجامعة */
export const GOLD: SessionAccent = { main: '#B99C6B', deep: '#8A7148', tint: '#F3ECE0' };

export function sessionAccent(index: number): SessionAccent {
  return ACCENTS[((index % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
}

/** عدد المواضع المتدرّجة للسان الفهرسة على حافة الصفحة قبل أن تتكرر */
export const TAB_SLOTS = 6;

/**
 * موضع لسان الفهرسة رأسيًا كنسبة من ارتفاع الصفحة: تتدرّج الألسنة من الأعلى للأسفل
 * محورًا بعد محور كألسنة الفهارس في الكتب المطبوعة.
 */
export function tabTopRatio(index: number): number {
  const slot = ((index % TAB_SLOTS) + TAB_SLOTS) % TAB_SLOTS;
  return 0.14 + slot * 0.12;
}

const ORDINALS = [
  'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة',
  'الحادية عشرة', 'الثانية عشرة', 'الثالثة عشرة', 'الرابعة عشرة', 'الخامسة عشرة', 'السادسة عشرة',
  'السابعة عشرة', 'الثامنة عشرة', 'التاسعة عشرة', 'العشرون',
];

/** «الجلسة الثالثة» بدل «الجلسة ٣» (ما بعد العشرين بالأرقام) */
export function sessionOrdinal(index: number): string {
  return ORDINALS[index] ?? String(index + 1).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
}
