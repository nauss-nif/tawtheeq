import { serverEnv } from '@/lib/env';
import { cleanSessionTitle, tidyArabicText } from '@/lib/text';

/** هل توليد النصوص بالذكاء الاصطناعي مُهيّأ؟ */
export function isAiConfigured(): boolean {
  return Boolean(serverEnv.openaiApiKey);
}

export interface SessionTextInput {
  courseTitle: string;
  sessionTitle: string;
  presenter?: string | null;
  /** وصف الدورة: يحدد ميدانها وأهدافها فيأتي الوصف متسقًا معها */
  courseDescription?: string | null;
  location?: string | null;
  /** عناوين بقية المحاور: لتمييز هذا المحور عنها وعدم تكرار مضمونها */
  otherSessionTitles?: string[];
  /** أوصاف كُتبت لمحاور أخرى: لتنويع الافتتاحيات وتجنّب القالب المكرر */
  existingDescriptions?: string[];
}

const SYSTEM_PROMPT = `أنت محرّر عربي متمرّس في جامعة نايف العربية للعلوم الأمنية، تكتب فقرات مجلة توثيق الدورات التدريبية.
المجلة تُصدَر بعد انعقاد الدورة وتُقدَّم للقيادات والجهات الشريكة، فهي وثيقة رسمية لما جرى.

قواعد الكتابة:
١. فقرة واحدة من ٣٥ إلى ٥٥ كلمة، بلا عنوان ولا مقدمة ولا تعداد.
٢. اكتب بصيغة الماضي التوثيقية («تناولت الجلسة…، تدرّب المشاركون على…، اختُتمت…») والتزمها في الفقرة كلها.
٣. ابدأ بمضمون الجلسة مباشرة. لا تبدأ بـ«تهدف» أو «تمثل» أو «تعد» أو «في إطار» أو «تأتي»، ولا تكرّر افتتاحيات الأوصاف السابقة المرفقة.
٤. لا تعِد كتابة عنوان الجلسة بين علامتي تنصيص، ولا تذكر اسم الدورة كاملًا.
٥. اذكر ما يمكن استنتاجه بثقة من عنوان الجلسة من مهارات وموضوعات محددة، ولا تخترع أرقامًا أو أسماء أو جهات أو نتائج غير مذكورة.
٦. تجنّب الحشو والمبالغة: لا تستخدم «حيوية»، «فريدة»، «نقطة انطلاق»، «حجر الزاوية»، «بشكل فعّال»، «مما يعزز من»، «الاستفادة القصوى». وجملة الأثر في النهاية واحدة ومحددة.
٧. الجلسات المراسمية (الافتتاح، التخرج، الاحتفالات، الزيارات): صِف ما جرى ومن شارك بإيجاز وبلغة رسمية، دون ادعاء أهداف تدريبية.
٨. العربية الفصحى السليمة: الهمزات في مواضعها، وعلامات الترقيم العربية (، ؛) ملاصقة لما قبلها، ولا تستخدم الرمز «+» أو الأقواس الإنجليزية.
٩. لا تذكر أنك نموذج ذكاء اصطناعي.

أعد نص الفقرة فقط.`;

/**
 * توليد وصف احترافي عربي لجلسة تدريبية عبر OpenAI (ChatGPT).
 * يعتمد على عنوان الجلسة وسياق الدورة وبقية المحاور حتى لا تتشابه الأوصاف.
 */
export async function generateSessionText(input: SessionTextInput): Promise<string> {
  const key = serverEnv.openaiApiKey;
  if (!key) throw new Error('مفتاح الذكاء الاصطناعي غير مُعدّ');

  const others = (input.otherSessionTitles ?? []).map(cleanSessionTitle).filter(Boolean);
  const previous = (input.existingDescriptions ?? []).filter(Boolean).slice(0, 4);

  const userPrompt = [
    `الدورة: ${input.courseTitle}`,
    input.courseDescription ? `وصف الدورة: ${input.courseDescription}` : '',
    input.location ? `مكان الانعقاد: ${input.location}` : '',
    `عنوان الجلسة المطلوب وصفها: ${cleanSessionTitle(input.sessionTitle)}`,
    input.presenter ? `المقدّم: ${input.presenter}` : '',
    others.length ? `بقية محاور الدورة (لا تتطرّق لمضمونها):\n- ${others.join('\n- ')}` : '',
    previous.length ? `أوصاف كُتبت لمحاور أخرى (نوّع عنها في الافتتاح والتراكيب):\n- ${previous.join('\n- ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.6,
      max_tokens: 400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) throw new Error('تعذّر توليد النص');
  const data = await res.json();
  const raw: string | undefined = data?.choices?.[0]?.message?.content;
  // ننزع علامات التنصيص المحيطة إن أُعيد النص بها، ثم ننقّي المسافات والترقيم
  const text = raw ? tidyArabicText(raw.trim().replace(/^["«“]+|["»”]+$/g, '')) : '';
  if (!text) throw new Error('استجابة فارغة');
  return text;
}
