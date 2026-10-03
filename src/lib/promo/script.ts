/**
 * نص التعليق الصوتي: التوليد، المواءمة مع مدة الفيديو، والتوزيع على المشاهد.
 *
 * قاعدة المحتوى: إن كتب المستخدم نصًا فالمحتوى والمعنى له، ولا يُحسَّن إلا
 * بطلبه. وإن لم يكتب، يُبنى النص من بيانات البرنامج في منصة توثيق فقط.
 */

import { llmProvider, fitToWordBudget } from './providers/llm';
import { splitSentences, wordCount } from './pronounce';
import { materialSummary } from './analyze';
import { getStyle } from './styles';
import type { PlannedShot } from './story';
import type {
  CourseContext, MediaAnalysis, PromoDuration, PromoStyleId, VoiceSettings,
} from './types';

/**
 * معدّل القراءة العربية للتعليق الصوتي المؤسسي: نحو ٢٫٦ كلمة/ثانية عند
 * السرعة ١٫٠. نترك هامشًا للوقفات وللصمت في بداية الفيديو ونهايته.
 */
const WORDS_PER_SECOND = 2.6;
const LEAD_SILENCE = 1.2;
const TAIL_SILENCE = 1.4;

/** عدد الكلمات المستهدف لمدة فيديو وسرعة قراءة معيّنتين */
export function targetWordCount(duration: PromoDuration, voice: VoiceSettings): number {
  const speakable = Math.max(6, duration - LEAD_SILENCE - TAIL_SILENCE);
  const pausePenalty = (voice.pauseMs / 1000) * estimateSentences(duration);
  const effective = Math.max(5, speakable - pausePenalty);
  return Math.round(effective * WORDS_PER_SECOND * voice.speed);
}

function estimateSentences(duration: number): number {
  return Math.max(2, Math.round(duration / 8));
}

export interface ScriptResult {
  text: string;
  source: 'user' | 'ai' | 'ai_enhanced';
  targetWords: number;
  actualWords: number;
  /** تحذيرات تُعرض للمستخدم (مثل: النص أطول من المدة) */
  warnings: string[];
}

/**
 * تجهيز نص التعليق.
 * - نص المستخدم بلا تحسين: يُستخدم كما هو (مع تحذير إن كان طويلًا).
 * - نص المستخدم مع طلب تحسين: يُعاد صياغته دون تغيير المعنى.
 * - بلا نص: يُولَّد من بيانات البرنامج والمواد المتاحة.
 * - بلا نموذج لغوي مُعدّ: يُبنى نص واقعي من بطاقة البيانات مباشرة.
 */
export async function prepareNarration(input: {
  course: CourseContext;
  userText?: string | null;
  enhance: boolean;
  duration: PromoDuration;
  style: PromoStyleId;
  voice: VoiceSettings;
  analyses: MediaAnalysis[];
  openingText?: string | null;
  closingText?: string | null;
}): Promise<ScriptResult> {
  const targetWords = targetWordCount(input.duration, input.voice);
  const warnings: string[] = [];
  const userText = input.userText?.trim();

  // (١) نص المستخدم كما هو
  if (userText && !input.enhance) {
    const words = wordCount(userText);
    if (words > targetWords * 1.15) {
      warnings.push(
        `النص ${words} كلمة، والمدة المختارة تتسع لنحو ${targetWords} كلمة. ` +
          `سيُقرأ أسرع أو سيُقصّ آخره — يُنصح باختصاره أو اختيار مدة أطول.`,
      );
    } else if (words < targetWords * 0.6) {
      warnings.push(
        `النص قصير نسبيًا (${words} كلمة) مقابل ${input.duration} ثانية؛ ` +
          `ستطول فترات الموسيقى دون تعليق.`,
      );
    }
    return { text: userText, source: 'user', targetWords, actualWords: words, warnings };
  }

  // (٢/٣) توليد أو تحسين عبر النموذج
  if (llmProvider.isConfigured()) {
    try {
      const text = await llmProvider.writeNarration({
        course: input.course,
        targetWords,
        style: input.style,
        openingText: input.openingText,
        closingText: input.closingText,
        userText: userText ?? null,
        mode: userText ? 'enhance' : 'generate',
        materialSummary: materialSummary(input.analyses),
      });
      const fitted = fitToWordBudget(text, targetWords);
      return {
        text: fitted,
        source: userText ? 'ai_enhanced' : 'ai',
        targetWords,
        actualWords: wordCount(fitted),
        warnings,
      };
    } catch {
      warnings.push('تعذّر الاتصال بمزوّد النصوص؛ استُخدم النص المبني من بيانات البرنامج.');
    }
  } else if (!userText) {
    warnings.push('مزوّد النصوص غير مُعدّ؛ بُني النص من بيانات البرنامج مباشرة.');
  }

  // (٤) النص الاحتياطي — حقائق البرنامج فقط، بلا أي معلومة مُضافة
  const fallback = buildFactualScript(input.course, targetWords, input.style);
  return {
    text: userText ?? fallback,
    source: userText ? 'user' : 'ai',
    targetWords,
    actualWords: wordCount(userText ?? fallback),
    warnings,
  };
}

/**
 * نص مبني من بطاقة البيانات وحدها — يُستخدم حين لا يتوفّر نموذج لغوي.
 * لا يذكر شيئًا غير موجود، ويتوقّف عند بلوغ ميزانية الكلمات.
 */
function buildFactualScript(c: CourseContext, targetWords: number, style: PromoStyleId): string {
  const s = getStyle(style);
  const parts: string[] = [];

  const opener =
    s.id === 'dynamic' || s.id === 'modern'
      ? `${c.title}.`
      : `في جامعة نايف العربية للعلوم الأمنية، ${c.title}.`;
  parts.push(opener);

  const whereWhen = [
    c.location ? `أُقيم البرنامج في ${c.location}` : null,
    c.startDate ? formatPeriod(c.startDate, c.endDate) : null,
  ].filter(Boolean);
  if (whereWhen.length) parts.push(`${whereWhen.join('، ')}.`);

  if (c.description) {
    parts.push(firstSentences(c.description, 2));
  }

  if (c.sessions.length) {
    const titles = c.sessions.slice(0, 3).map((x) => x.title);
    parts.push(`تناول البرنامج ${titles.join('، و')}.`);
  }

  if (c.trainers.length) {
    parts.push(`قدّمه ${c.trainers.slice(0, 3).join('، و')}.`);
  }

  parts.push('توثيق لما جرى، وأثرٌ يبقى.');

  let text = parts.join(' ');
  if (wordCount(text) > targetWords * 1.1) text = fitToWordBudget(text, targetWords);
  return text;
}

function firstSentences(text: string, n: number): string {
  return splitSentences(text).slice(0, n).join(' ');
}

function formatPeriod(start: string, end: string | null): string {
  const fmt = (d: string) =>
    new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(d));
  if (!end || end === start) return `في ${fmt(start)}`;
  return `في الفترة من ${fmt(start)} إلى ${fmt(end)}`;
}

// --------------------------------------------------------------------------
// توزيع النص على المشاهد
// --------------------------------------------------------------------------

export interface NarrationSegment {
  shotIndex: number;
  text: string;
  /** بداية الجملة داخل الفيديو (ثوانٍ) */
  start: number;
  end: number;
}

/**
 * ربط جمل التعليق بالمشاهد: كل جملة تُسند للمشهد الذي يغطّي وقتها، بحيث
 * يظهر النص المكتوب والمقروء متزامنين، وتُعرف نوافذ الكلام لتطبيق الـ Ducking.
 *
 * التوزيع تناسبي مع طول الجملة، ويبدأ بعد صمت افتتاحي قصير.
 */
export function alignNarration(
  text: string,
  shots: PlannedShot[],
  totalDuration: number,
): NarrationSegment[] {
  const sentences = splitSentences(text);
  if (!sentences.length) return [];

  const speakStart = Math.min(LEAD_SILENCE, totalDuration * 0.06);
  const speakEnd = Math.max(speakStart + 1, totalDuration - TAIL_SILENCE);
  const speakSpan = speakEnd - speakStart;

  const weights = sentences.map((s) => Math.max(1, wordCount(s)));
  const wSum = weights.reduce((a, b) => a + b, 0);

  // حدود المشاهد على المحور الزمني
  const bounds: { index: number; start: number; end: number }[] = [];
  let t = 0;
  shots.forEach((sh, i) => {
    bounds.push({ index: i, start: t, end: t + sh.duration });
    t += sh.duration;
  });

  const segments: NarrationSegment[] = [];
  let cursor = speakStart;
  for (let i = 0; i < sentences.length; i++) {
    const dur = (weights[i] / wSum) * speakSpan;
    const start = cursor;
    const end = cursor + dur;
    const mid = (start + end) / 2;
    const shot = bounds.find((b) => mid >= b.start && mid < b.end) ?? bounds[bounds.length - 1];
    segments.push({
      shotIndex: shot.index,
      text: sentences[i],
      start: round(start),
      end: round(end),
    });
    cursor = end;
  }
  return segments;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
