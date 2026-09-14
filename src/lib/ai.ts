import { serverEnv } from '@/lib/env';

/** هل توليد النصوص بالذكاء الاصطناعي مُهيّأ؟ */
export function isAiConfigured(): boolean {
  return Boolean(serverEnv.openaiApiKey);
}

/**
 * توليد وصف احترافي عربي لجلسة تدريبية عبر OpenAI (ChatGPT).
 * يعتمد على عنوان الجلسة والمقدّم وسياق الدورة.
 */
export async function generateSessionText(input: {
  courseTitle: string;
  sessionTitle: string;
  presenter?: string | null;
}): Promise<string> {
  const key = serverEnv.openaiApiKey;
  if (!key) throw new Error('مفتاح الذكاء الاصطناعي غير مُعدّ');

  const prompt = `أنت محرّر محترف في جامعة نايف العربية للعلوم الأمنية تكتب لمجلة توثيق الدورات التدريبية.
اكتب فقرة عربية واحدة (٣٠ إلى ٦٠ كلمة) تصف الجلسة التدريبية التالية بأسلوب مؤسسي راقٍ ومعبّر، توضّح الهدف من الجلسة وأهميتها للمتدربين، دون مبالغة ودون ذكر أنك ذكاء اصطناعي.

الدورة: ${input.courseTitle}
عنوان الجلسة: ${input.sessionTitle}
${input.presenter ? `المقدّم: ${input.presenter}` : ''}

اكتب الفقرة فقط دون مقدمات أو عناوين.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.7,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error('تعذّر توليد النص');
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('استجابة فارغة');
  return text;
}
