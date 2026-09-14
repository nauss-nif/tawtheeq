/**
 * قاموس النطق — يضمن نطقًا صحيحًا لأسماء البرامج والمدن والدول والأشخاص.
 *
 * الاستبدال يتم على مستوى الكلمة الكاملة مع مراعاة السوابق العربية
 * (ال التعريف، و، ف، ب، ل، ك) حتى لا يُكسر النص، ومع تجاهل التشكيل.
 */

export interface LexiconEntry {
  term: string;
  phonetic: string;
  ipa?: string | null;
}

/** محارف التشكيل والتطويل العربية */
const DIACRITICS = /[ً-ْٰـ]/g;

/** السوابق التي قد تلتصق بالاسم في العربية */
const PREFIXES = ['وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];

/** تطبيع للمقارنة فقط — لا يُستخدم في الناتج */
function normalize(s: string): string {
  return s
    .replace(DIACRITICS, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim()
    .toLowerCase();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * تطبيق القاموس على النص.
 * المصطلحات الأطول أولًا حتى لا يبتلع مصطلح قصير جزءًا من اسم مركّب.
 */
export function applyLexicon(text: string, entries: LexiconEntry[]): string {
  if (!entries.length) return text;

  const sorted = [...entries]
    .filter((e) => e.term?.trim() && e.phonetic?.trim())
    .sort((a, b) => b.term.length - a.term.length);

  let out = text;
  for (const entry of sorted) {
    const term = entry.term.trim();
    const replacement = entry.phonetic.trim();

    // نبني نمطًا يقبل السوابق الملتصقة ويحافظ عليها في الناتج
    const prefixGroup = PREFIXES.map(escapeRe).join('|');
    const body = escapeRe(term).replace(/\s+/g, '\\s+');
    const pattern = new RegExp(
      `(^|[\\s،.:؛!؟"'(\\[«])(${prefixGroup})?(${body})(?=$|[\\s،.:؛!؟"')\\]»])`,
      'gu',
    );

    out = out.replace(pattern, (match, lead: string, prefix: string | undefined, hit: string) => {
      // نتحقّق أن المطابقة فعلًا هي المصطلح بعد التطبيع (وليست صدفة إملائية)
      if (normalize(hit) !== normalize(term)) return match;
      return `${lead}${prefix ?? ''}${replacement}`;
    });
  }
  return out;
}

/**
 * تقسيم النص إلى جمل — يُستخدم لتوزيع الوقفات ولمواءمة السرد مع المشاهد.
 * يراعي علامات الترقيم العربية والإنجليزية.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟…])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** عدد الكلمات (عربية أو إنجليزية) */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * الكلمات المرشّحة لقاموس النطق: الأسماء الأجنبية المعرّبة والمدن والأعلام.
 * تُقترح على المستخدم في الواجهة ليؤكّد نطقها قبل الإنتاج.
 */
export function suggestLexiconTerms(sources: (string | null | undefined)[]): string[] {
  const text = sources.filter(Boolean).join(' ');
  const found = new Set<string>();

  // كلمات لاتينية (أسماء أو اختصارات) — تحتاج نطقًا عربيًا مكتوبًا
  for (const m of text.matchAll(/\b[A-Za-z][A-Za-z.&-]{2,}\b/g)) found.add(m[0]);

  // أسماء عربية غير شائعة: كلمات تبدأ بحرف كبير سياقيًا يصعب رصده،
  // فنكتفي بالكلمات التي تحتوي حروفًا نادرة الاجتماع في العربية (تعريب أعلام)
  for (const m of text.matchAll(/\b[ء-ي]{3,}\b/g)) {
    const w = m[0];
    if (/(?:ڤ|چ|پ|گ|ژ)/.test(w)) found.add(w);
  }

  return [...found].slice(0, 40);
}
