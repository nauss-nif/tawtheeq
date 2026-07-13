import { serverEnv } from '@/lib/env';

/** هل توليد النصوص بالذكاء الاصطناعي مُهيّأ؟ */
export function isAiConfigured(): boolean {
  return Boolean(serverEnv.anthropicApiKey);
}

/**
 * توليد وصف احترافي عربي لجلسة تدريبية عبر Claude API.
 * يعتمد على عنوان الجلسة والمقدّم وسياق الدورة.
 */
export async function generateSessionText(input: {
  courseTitle: string;
  sessionTitle: string;
  presenter?: string | null;
}): Promise<string> {
  const key = serverEnv.anthropicApiKey;
  if (!key) throw new Error('مفتاح الذكاء الاصطناعي غير مُعدّ');

  const prompt = `أنت محرّر محترف في جامعة نايف العربية للعلوم الأمنية تكتب لمجلة توثيق الدورات التدريبية.
اكتب فقرة عربية واحدة (٣٠ إلى ٦٠ كلمة) تصف الجلسة التدريبية التالية بأسلوب مؤسسي راقٍ ومعبّر، توضّح الهدف من الجلسة وأهميتها للمتدربين، دون مبالغة ودون ذكر أنك ذكاء اصطناعي.

الدورة: ${input.courseTitle}
عنوان الجلسة: ${input.sessionTitle}
${input.presenter ? `المقدّم: ${input.presenter}` : ''}

اكتب الفقرة فقط دون مقدمات أو عناوين.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error('تعذّر توليد النص');
  const data = await res.json();
  const text = data?.content?.[0]?.text?.trim();
  if (!text) throw new Error('استجابة فارغة');
  return text;
}
