/**
 * محرّك النصوص داخل الفيديو — دعم كامل للعربية RTL.
 *
 * محرّك الرندر (ffmpeg/drawtext) يرسم المحارف كما تصله دون تشكيل حروف أو
 * ترتيب ثنائي الاتجاه. لذلك نُجري هنا الخطوتين بأنفسنا:
 *   ١) تشكيل الحروف العربية (وصل الأحرف) إلى صور العرض Presentation Forms.
 *   ٢) إعادة ترتيب ثنائي الاتجاه لتظهر العربية من اليمين لليسار مع الحفاظ
 *      على الأرقام والكلمات اللاتينية بترتيبها الصحيح.
 *
 * كما نقدّر عرض النص لضمان عدم خروجه عن المنطقة الآمنة (فحص ضبط الجودة).
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const reshaper = require('arabic-reshaper') as { convertArabic(text: string): string };

const ARABIC_RANGE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_OR_DIGIT = /[A-Za-z0-9@#$%^&*_+=<>/\\|~`'"-]/;
/** علامات الترقيم التي يجب عكس شكلها عند القلب */
const MIRRORED: Record<string, string> = {
  '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{',
  '<': '>', '>': '<', '«': '»', '»': '«',
};

export function hasArabic(text: string): boolean {
  return ARABIC_RANGE.test(text);
}

/**
 * تشكيل + ترتيب ثنائي الاتجاه لسطر واحد.
 * النتيجة سلسلة جاهزة للرسم من اليسار لليمين تعطي مظهرًا عربيًا صحيحًا.
 */
export function shapeLine(line: string): string {
  if (!hasArabic(line)) return line;

  const shaped = reshaper.convertArabic(line);

  // نقسّم السطر إلى مقاطع: عربية / لاتينية-أرقام / محايدة
  type Run = { text: string; kind: 'rtl' | 'ltr' | 'neutral' };
  const runs: Run[] = [];
  let buf = '';
  let kind: Run['kind'] | null = null;

  const kindOf = (ch: string): Run['kind'] => {
    if (ARABIC_RANGE.test(ch)) return 'rtl';
    if (LATIN_OR_DIGIT.test(ch)) return 'ltr';
    return 'neutral';
  };

  for (const ch of shaped) {
    const k = kindOf(ch);
    if (kind === null || k === kind) {
      buf += ch;
      kind = k;
    } else {
      runs.push({ text: buf, kind: kind! });
      buf = ch;
      kind = k;
    }
  }
  if (buf) runs.push({ text: buf, kind: kind! });

  // المقاطع المحايدة الملاصقة لمقطع لاتيني بين مقطعين لاتينيين تبقى معه
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].kind !== 'neutral') continue;
    const prev = runs[i - 1]?.kind;
    const next = runs[i + 1]?.kind;
    if (prev === 'ltr' && next === 'ltr') runs[i].kind = 'ltr';
  }

  // الترتيب الأساسي RTL: نعكس ترتيب المقاطع، ونعكس محارف المقاطع العربية
  const reversed = [...runs].reverse().map((run) => {
    if (run.kind === 'ltr') return run.text; // اللاتينية والأرقام تبقى كما هي
    const chars = [...run.text].reverse().map((c) => MIRRORED[c] ?? c);
    return chars.join('');
  });

  return reversed.join('');
}

/** تشكيل نص متعدّد الأسطر */
export function shapeText(text: string): string {
  return text.split('\n').map(shapeLine).join('\n');
}

// --------------------------------------------------------------------------
// قياس النص ولفّه
// --------------------------------------------------------------------------

/**
 * عرض المحرف كنسبة من حجم الخط.
 * قيم مُعايَرة تقريبيًا على El Messiri؛ الغرض ضمان عدم تجاوز المنطقة الآمنة،
 * لا الدقة الطباعية. نميل للتقدير الزائد قليلًا (أأمن للفحص).
 */
function charAdvance(ch: string): number {
  if (ch === ' ') return 0.26;
  if (/[.,،؛:!؟'"]/.test(ch)) return 0.24;
  if (/[0-9]/.test(ch)) return 0.52;
  if (/[A-Z]/.test(ch)) return 0.64;
  if (/[a-z]/.test(ch)) return 0.52;
  // الحروف العربية المتصلة أضيق من المنفصلة
  if (/[\uFE70-\uFEFF]/.test(ch)) return 0.44;
  if (ARABIC_RANGE.test(ch)) return 0.5;
  return 0.5;
}

/** تقدير عرض سطر بالبكسل عند حجم خط معيّن */
export function measureLine(line: string, fontSize: number, tracking = 0): number {
  let w = 0;
  for (const ch of line) w += charAdvance(ch) * fontSize;
  return w + tracking * fontSize * Math.max(0, line.length - 1);
}

/**
 * لفّ النص ضمن عرض أقصى.
 * يُطبَّق على النص الأصلي (قبل التشكيل) حتى لا تُكسر الكلمات، ثم يُشكَّل كل سطر.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  opts: { maxLines?: number; tracking?: number } = {},
): string[] {
  const maxLines = opts.maxLines ?? 3;
  const tracking = opts.tracking ?? 0;

  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureLine(candidate, fontSize, tracking) <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  if (lines.length <= maxLines) return lines;

  // تجاوز عدد الأسطر: نضغط الأخير بعلامة حذف بدل بتر النص فجأة
  const kept = lines.slice(0, maxLines);
  const overflow = lines.slice(maxLines).join(' ');
  let last = `${kept[maxLines - 1]} ${overflow}`;
  while (measureLine(`${last}…`, fontSize, tracking) > maxWidth && last.includes(' ')) {
    last = last.slice(0, last.lastIndexOf(' '));
  }
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

/**
 * تحضير كتلة نصية كاملة: لفّ ثم تشكيل، مع إعادة القياسات اللازمة للتخطيط.
 */
export interface TextBlock {
  lines: string[];        // أسطر مُشكَّلة جاهزة للرسم
  rawLines: string[];     // الأسطر الأصلية (للفحص والعرض في الواجهة)
  fontSize: number;
  lineHeight: number;
  maxLineWidth: number;
  blockHeight: number;
  /** هل اضطُررنا لتصغير الخط ليتّسع النص؟ */
  shrunk: boolean;
  /** هل حدث بتر (علامة حذف)؟ */
  truncated: boolean;
}

/**
 * يبني كتلة نصية تتّسع داخل صندوق معيّن، بتصغير الخط تدريجيًا عند الحاجة
 * قبل اللجوء إلى البتر — النص المقروء أهم من الحجم المثالي.
 */
export function layoutTextBlock(
  text: string,
  box: { width: number; height: number },
  opts: { fontSize: number; leading: number; tracking?: number; maxLines?: number },
): TextBlock {
  const tracking = opts.tracking ?? 0;
  const maxLines = opts.maxLines ?? 3;

  let fontSize = opts.fontSize;
  let lines = wrapText(text, box.width, fontSize, { maxLines: maxLines + 2, tracking });
  let shrunk = false;

  // نصغّر حتى ٧٠٪ من الحجم الأصلي لمحاولة تفادي البتر
  const floor = opts.fontSize * 0.7;
  while (
    (lines.length > maxLines || lines.length * fontSize * opts.leading > box.height) &&
    fontSize > floor
  ) {
    fontSize = Math.max(floor, fontSize * 0.94);
    lines = wrapText(text, box.width, fontSize, { maxLines: maxLines + 2, tracking });
    shrunk = true;
  }

  const finalLines = wrapText(text, box.width, fontSize, { maxLines, tracking });
  const truncated = finalLines.some((l) => l.endsWith('…'));

  const shaped = finalLines.map(shapeLine);
  const widths = finalLines.map((l) => measureLine(l, fontSize, tracking));

  return {
    lines: shaped,
    rawLines: finalLines,
    fontSize: Math.round(fontSize),
    lineHeight: Math.round(fontSize * opts.leading),
    maxLineWidth: Math.round(Math.max(0, ...widths)),
    blockHeight: Math.round(finalLines.length * fontSize * opts.leading),
    shrunk,
    truncated,
  };
}

// --------------------------------------------------------------------------
// الهروب لمرشّحات ffmpeg
// --------------------------------------------------------------------------

/**
 * ffmpeg/drawtext يقرأ النص من ملف عند استخدام textfile=، وهو الخيار الآمن
 * مع العربية وعلامات الترقيم. هذه الدالة للهروب داخل مسارات الملفات فقط.
 */
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}
