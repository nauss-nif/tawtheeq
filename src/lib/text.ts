/**
 * تنقية النصوص العربية المعروضة في المجلات (الموقع، المجلة المتقلبة، الـPDF، النسخة دون اتصال).
 * تُطبَّق عند الحفظ وعند العرض، فتصلح البيانات القديمة دون تعديلها في قاعدة البيانات.
 */

/** مسافات زائدة ومسافة قبل علامات الترقيم («الدفاعية ،» ← «الدفاعية،») */
export function tidyArabicText(text: string): string;
export function tidyArabicText(text: string | null): string | null;
export function tidyArabicText(text: string | null): string | null {
  if (text == null) return null;
  return text
    .replace(/[ \t ]+/g, ' ')
    .replace(/ +([،,.:؛;!?؟])/g, '$1')
    .replace(/ *\n */g, '\n')
    .trim();
}

/**
 * عنوان جلسة نظيف: النظام يرقّم المحاور بنفسه، فنحذف الترقيم اليدوي في أول العنوان
 * («1. الافتتاح» ← «الافتتاح»)، ونستبدل «+» بواو العطف، ونحذف النقطة الختامية.
 */
export function cleanSessionTitle(title: string): string {
  let t = tidyArabicText(title);
  // «1.» «١-» «(2)» «3)» «الجلسة 4:» … يلزم فاصل بعد الرقم حتى لا نحذف رقمًا هو جزء من العنوان
  t = t.replace(/^(?:(?:الجلسة|المحور)\s*)?[(\[]?[0-9٠-٩]{1,3}\s*[)\].\-–—:/]\s*/u, '');
  t = t.replace(/^(?:الجلسة|المحور)\s+[0-9٠-٩]{1,3}\s+/u, '');
  t = t.replace(/\s*\+\s*/g, ' و');
  t = t.replace(/[\s.。،,:؛]+$/u, '');
  return t.replace(/ {2,}/g, ' ').trim();
}

/** أرقام عربية مشرقية */
export function toArabicDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
}

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/**
 * مدة الدورة نصًا بترتيب صحيح في اتجاه RTL:
 * «١٤ – ٢٥ سبتمبر ٢٠٢٦» أو «٢٨ سبتمبر – ٣ أكتوبر ٢٠٢٦».
 */
export function formatDateRange(start: string | null, end: string | null): string {
  const parse = (d: string | null) => {
    if (!d) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
  };
  const a = parse(start);
  const b = parse(end);
  const one = (x: { y: number; m: number; d: number }) => `${toArabicDigits(x.d)} ${MONTHS[x.m]} ${toArabicDigits(x.y)}`;
  if (!a && !b) return '';
  if (!a || !b || (a.y === b.y && a.m === b.m && a.d === b.d)) return one((a ?? b)!);
  if (a.y === b.y && a.m === b.m) return `${toArabicDigits(a.d)} – ${toArabicDigits(b.d)} ${MONTHS[a.m]} ${toArabicDigits(a.y)}`;
  if (a.y === b.y) return `${toArabicDigits(a.d)} ${MONTHS[a.m]} – ${toArabicDigits(b.d)} ${MONTHS[b.m]} ${toArabicDigits(a.y)}`;
  return `${one(a)} – ${one(b)}`;
}
