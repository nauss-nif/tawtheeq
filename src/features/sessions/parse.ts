/**
 * لصق ذكي: يحلّل النص المنسوخ من نظام الجدول الزمني ويستخرج الجلسات
 * (العنوان، الوقت، التاريخ)، متجاهلًا سطور الملفات/الروابط و«المراجعة وتطبيقات عملية».
 */

export interface ParsedSession {
  title: string;
  time_label: string | null;
  session_date: string | null;
}

// سطر وقت مثل: "8:00 ص - 8:30 ص (30 دقيقة)"
const TIME_RE = /(\d{1,2}):(\d{2})\s*([صم]).*?-\s*(\d{1,2}):(\d{2})\s*([صم])/;
// رأس يوم مثل: "يوم 1" و "(13-07-2026)"
const DAY_RE = /^يوم\s*\d+/;
const DATE_RE = /\((\d{2})-(\d{2})-(\d{4})\)/;

// سطور ضجيج تُتجاهل
const NOISE = [
  'أيقونة', 'مشاهدة الطلاب', 'الحضور', 'QR', 'رابط الكتروني', 'رابط إلكتروني',
];

function to24h(h: number, m: number, mer: string): string {
  let hour = h;
  if (mer === 'م' && hour < 12) hour += 12;
  if (mer === 'ص' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isNoise(line: string): boolean {
  if (!line) return true;
  return NOISE.some((n) => line.includes(n)) || line.endsWith('ملف');
}

export function parseSchedule(text: string): ParsedSession[] {
  const lines = text.split('\n').map((l) => l.trim());
  const out: ParsedSession[] = [];
  let currentDate: string | null = null;
  let prev = '';

  for (const line of lines) {
    if (!line) continue;

    // تاريخ اليوم
    const dm = line.match(DATE_RE);
    if (dm) {
      currentDate = `${dm[3]}-${dm[2]}-${dm[1]}`; // YYYY-MM-DD
      prev = '';
      continue;
    }
    if (DAY_RE.test(line)) {
      // قد يحوي السطر التاريخ بعده؛ نحاول التقاطه
      const inline = line.match(DATE_RE);
      if (inline) currentDate = `${inline[3]}-${inline[2]}-${inline[1]}`;
      prev = '';
      continue;
    }

    // سطر وقت → السطر السابق هو عنوان الجلسة
    const tm = line.match(TIME_RE);
    if (tm) {
      const title = prev.trim();
      const skip = !title || isNoise(title) || /مراجعة\s*وتطبيقات\s*عملية/.test(title);
      if (!skip) {
        const label = `${to24h(+tm[1], +tm[2], tm[3])} - ${to24h(+tm[4], +tm[5], tm[6])}`;
        out.push({ title, time_label: label, session_date: currentDate });
      }
      prev = '';
      continue;
    }

    // احتفظ بالسطر كمرشّح عنوان إن لم يكن ضجيجًا
    if (!isNoise(line)) prev = line;
  }

  return out;
}
