/**
 * مزوّد النماذج اللغوية — كتابة نص التعليق الصوتي وترتيب القصة.
 *
 * يدعم Anthropic و OpenAI خلف واجهة واحدة. عند غياب المفتاحين يعمل النظام
 * بالمحرّك الحتمي المحلّي (story.ts / script.ts) دون فشل.
 *
 * قاعدة صارمة: لا يُسمح للنموذج بإضافة معلومات غير موجودة في بيانات البرنامج.
 */

import { serverEnv } from '@/lib/env';
import { getStyle } from '../../styles';
import { wordCount } from '../../pronounce';
import type {
  LlmProvider, NarrationRequest, StoryPlanRequest, StoryPlanResult,
} from '../types';
import type { CourseContext } from '../../types';

type Backend = 'anthropic' | 'openai';

function activeBackend(): Backend | null {
  const pref = serverEnv.promo.llmProvider;
  if (pref === 'anthropic' && serverEnv.anthropicApiKey) return 'anthropic';
  if (pref === 'openai' && serverEnv.openaiApiKey) return 'openai';
  if (serverEnv.anthropicApiKey) return 'anthropic';
  if (serverEnv.openaiApiKey) return 'openai';
  return null;
}

async function complete(prompt: string, maxTokens: number): Promise<string> {
  const backend = activeBackend();
  if (!backend) throw new Error('لا يوجد مزوّد نماذج لغوية مُعدّ');

  if (backend === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': serverEnv.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.PROMO_ANTHROPIC_MODEL ?? 'claude-sonnet-5',
        max_tokens: maxTokens,
        temperature: 0.6,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`تعذّر الاتصال بالنموذج (${res.status})`);
    const data = await res.json();
    const text = data?.content?.[0]?.text?.trim();
    if (!text) throw new Error('استجابة فارغة من النموذج');
    return text;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${serverEnv.openaiApiKey}` },
    body: JSON.stringify({
      model: process.env.PROMO_OPENAI_MODEL ?? 'gpt-4o',
      temperature: 0.6,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`تعذّر الاتصال بالنموذج (${res.status})`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('استجابة فارغة من النموذج');
  return text;
}

/** بطاقة بيانات البرنامج كما هي في المنصة — المصدر الوحيد المسموح للمعلومات */
function courseFacts(c: CourseContext): string {
  const lines = [
    `اسم البرنامج: ${c.title}`,
    c.description ? `الوصف: ${c.description}` : null,
    c.location ? `مكان التنفيذ: ${c.location}` : null,
    c.startDate ? `تاريخ البداية: ${c.startDate}` : null,
    c.endDate ? `تاريخ النهاية: ${c.endDate}` : null,
    c.trainers.length ? `المدرّبون: ${c.trainers.join('، ')}` : null,
    c.welcomeText ? `نص ترحيبي مسجّل: ${c.welcomeText}` : null,
  ].filter(Boolean);

  if (c.sessions.length) {
    lines.push('محاور البرنامج:');
    for (const s of c.sessions.slice(0, 20)) {
      lines.push(`  - ${s.title}${s.presenter ? ` (${s.presenter})` : ''}`);
    }
  }
  return lines.join('\n');
}

const GUARDRAIL = `قيود صارمة لا تُخالَف:
- لا تذكر أي معلومة غير واردة في بطاقة البيانات أعلاه. لا أرقام ولا جهات ولا إنجازات مُختلقة.
- إذا كانت معلومة غير متوفّرة (كالجهة المستفيدة أو عدد المتدربين) فلا تذكرها إطلاقًا ولا تلمّح إليها.
- لا تستخدم عبارات تسويقية مبالغًا فيها ولا صيغ الترويج التجاري.
- لا تذكر أنك ذكاء اصطناعي، ولا تكتب عناوين أو مقدمات أو تعليقات.
- اكتب عربية فصحى سليمة، جاهزة للقراءة الصوتية مباشرة.`;

export const llmProvider: LlmProvider = {
  id: 'llm',
  kind: 'llm',

  isConfigured() {
    return activeBackend() !== null;
  },

  async writeNarration(req: NarrationRequest): Promise<string> {
    const style = getStyle(req.style);
    const facts = courseFacts(req.course);

    const prompt =
      req.mode === 'enhance'
        ? `أنت محرّر نصوص برومو محترف في جامعة نايف العربية للعلوم الأمنية.

النص التالي كتبه المستخدم لتعليق صوتي على برومو فيديو. حسّن صياغته فقط:
اجعله أكثر انسيابًا وملاءمةً للقراءة الصوتية، دون تغيير المعنى ودون إضافة أي معلومة جديدة ودون حذف أي معلومة وردت فيه.

نص المستخدم:
"""
${req.userText ?? ''}
"""

بطاقة بيانات البرنامج (للتحقق من الأسماء والتواريخ فقط):
${facts}

الطول المستهدف: نحو ${req.targetWords} كلمة (±10%).
${GUARDRAIL}

أعد النص المحسّن فقط.`
        : `أنت كاتب نصوص برومو محترف في جامعة نايف العربية للعلوم الأمنية.

اكتب نص تعليق صوتي لبرومو فيديو قصير يوثّق برنامجًا تدريبيًا.

بطاقة بيانات البرنامج:
${facts}

المواد البصرية المتاحة فعليًا في الفيديو:
${req.materialSummary}

${req.openingText ? `النص الافتتاحي الذي سيظهر على الشاشة: ${req.openingText}` : ''}
${req.closingText ? `النص الختامي الذي سيظهر على الشاشة: ${req.closingText}` : ''}

المطلوب:
- الطول: نحو ${req.targetWords} كلمة بالضبط (±10%). هذا حرج لأن النص يجب أن يطابق مدة الفيديو.
- النبرة: ${style.description}
- ابدأ بجملة تُمسك الانتباه دون مبالغة، ثم اذكر البرنامج ومكانه وزمانه كما وردا، ثم صف ما جرى فيه اعتمادًا على المحاور والمواد المتاحة، واختم بجملة موجزة.
- جمل قصيرة تصلح للقراءة الصوتية، كل جملة فكرة واحدة.
- لا تكرّر النص الافتتاحي أو الختامي حرفيًا؛ هما يظهران على الشاشة.

${GUARDRAIL}

أعد نص التعليق فقط.`;

    const out = await complete(prompt, Math.max(600, req.targetWords * 6));
    return stripWrapper(out);
  },

  async planStory(req: StoryPlanRequest): Promise<StoryPlanResult | null> {
    // التخطيط بالنموذج اختياري: المحرّك الحتمي يعمل بدونه.
    if (!activeBackend()) return null;

    const materials = req.analyses
      .map(
        (a, i) =>
          `${i + 1}. [${a.mediaId}] نوع=${a.type} جودة=${Math.round(a.score)} ` +
          `أبعاد=${a.metrics.width}x${a.metrics.height} ` +
          `${a.labels.length ? `محتوى=${a.labels.join(',')}` : 'محتوى=غير محلّل'}`,
      )
      .join('\n');

    const prompt = `أنت مخرج مونتاج محترف. رتّب المواد التالية في قصة بصرية لبرومو مدته ${req.duration} ثانية عن هذا البرنامج التدريبي.

بطاقة البرنامج:
${courseFacts(req.course)}

المواد المتاحة (المعرّف بين قوسين مربعين):
${materials}

خطوات القصة المتاحة بالترتيب المقترح: ${req.beats.join(' ← ')}
يمكنك تغيير الترتيب إذا كان أنسب للمحتوى، ويمكنك تجاوز خطوة لا تسندها المواد.

أعد JSON فقط بهذا الشكل، دون أي نص آخر:
{"order":[{"beat":"opening","mediaId":"<المعرّف أو null>","reason":"سبب موجز"}]}`;

    try {
      const raw = await complete(prompt, 2000);
      const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
      const parsed = JSON.parse(json) as StoryPlanResult;
      if (!Array.isArray(parsed?.order)) return null;
      // نتحقّق أن كل معرّف حقيقي — لا نثق بمخرجات النموذج
      const valid = new Set(req.analyses.map((a) => a.mediaId));
      parsed.order = parsed.order.filter(
        (o) => o.mediaId === null || valid.has(o.mediaId),
      );
      return parsed;
    } catch {
      return null; // نسقط إلى المحرّك الحتمي بصمت
    }
  },
};

/** إزالة علامات الاقتباس أو الأسوار البرمجية التي قد يضيفها النموذج */
function stripWrapper(text: string): string {
  let t = text.trim();
  t = t.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('«') && t.endsWith('»'))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

/** تقليم النص ليطابق عدد الكلمات المستهدف دون بتر جملة */
export function fitToWordBudget(text: string, targetWords: number, tolerance = 0.15): string {
  const max = Math.round(targetWords * (1 + tolerance));
  if (wordCount(text) <= max) return text;

  const sentences = text.split(/(?<=[.!?؟…])\s+/u);
  const kept: string[] = [];
  let count = 0;
  for (const s of sentences) {
    const w = wordCount(s);
    if (count + w > max && kept.length > 0) break;
    kept.push(s);
    count += w;
  }
  return kept.join(' ').trim();
}
