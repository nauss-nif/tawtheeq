/**
 * تهيئة النص العربي قبل تمريره إلى @react-pdf.
 *
 * ملاحظة: خلل إسقاط «لا» المتكررة في السطر الواحد («سلام علاج» ← «سم عج») مُصلَح في المكتبة نفسها
 * عبر patches/@react-pdf+textkit+*.patch (يُطبَّق تلقائيًا بعد npm install).
 */

const ARABIC = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const TRAILING_NEUTRAL = /[.،,:؛;!?؟)\]»"'…]+$/;

/**
 * علامة RLM بعد الترقيم الختامي للجمل العربية: المكتبة تخطّط الفقرات باتجاه LTR
 * (خاصية direction: rtl فيها معطوبة؛ تقصّ أواخر الأسطر وتُسقط الأرقام)، فتقفز النقطة
 * الختامية إلى أول السطر. العلامة حرف قوي الاتجاه يعيدها إلى نهاية الجملة،
 * ونسخة خط الـPDF تحوي لها رسمًا فارغًا بعرض صفر (ElMessiri-PDF-*.ttf).
 */
function anchorTrailingPunctuation(text: string): string {
  return ARABIC.test(text) && TRAILING_NEUTRAL.test(text) ? `${text}\u200F` : text;
}

/** تهيئة كاملة لنص عربي قبل رسمه في الـPDF */
export function pdfText(text: string): string {
  return anchorTrailingPunctuation(text);
}

/**
 * يفصل «الرتبة + اسم لاتيني» («المقدم Elvin Səfərov») لنرسمهما متجاورين بترتيب RTL،
 * لأن السطر المختلط يُعرض بترتيب LTR فتظهر الرتبة يسار الاسم.
 */
export function splitArabicLatin(text: string): { arabic: string; latin: string } | null {
  const m = /^([\u0600-\u06FF][\u0600-\u06FF\s]*?)\s+([A-Za-z\u00C0-\u024F\u1E00-\u1EFF].*)$/u.exec(text.trim());
  return m ? { arabic: m[1].trim(), latin: m[2].trim() } : null;
}
