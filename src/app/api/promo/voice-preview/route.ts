import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTtsProvider } from '@/lib/promo/providers';
import { getVoice, defaultVoiceSettings } from '@/lib/promo/voices';
import type { VoiceSettings } from '@/lib/promo/types';

export const maxDuration = 60;

/** عبارة المعاينة — قصيرة وتحتوي أسماء تكشف جودة النطق العربي */
const SAMPLE =
  'جامعة نايف العربية للعلوم الأمنية تقدّم برنامجًا تدريبيًا متخصّصًا، ' +
  'نُفّذ في الرياض بمشاركة نخبة من الخبراء.';

/**
 * معاينة صوتية قبل الاختيار.
 * تُرجع MP3 مباشرة ولا تُحفظ في التخزين — معاينة عابرة لا أصل دائم.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });

  const tts = getTtsProvider();
  if (!tts) {
    return NextResponse.json(
      { error: 'مزوّد التعليق الصوتي غير مُعدّ. أضف مفتاح ElevenLabs أو OpenAI.' },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    voiceId?: string;
    settings?: Partial<VoiceSettings>;
    text?: string;
  };

  const voiceId = body.voiceId ?? '';
  const voice = getVoice(voiceId);
  const settings: VoiceSettings = { ...defaultVoiceSettings(voice.id), ...body.settings };

  // نص المعاينة مقيّد الطول حتى لا تتحوّل المعاينة إلى إنتاج كامل
  const text = (body.text?.trim() || SAMPLE).slice(0, 300);

  try {
    const result = await tts.synthesize({
      text,
      voiceId: voice.id,
      settings,
      lang: 'ar',
      preview: true,
    });

    return new NextResponse(new Uint8Array(result.audio), {
      headers: {
        'content-type': result.mime,
        'cache-control': 'private, max-age=3600',
        'x-promo-voice': voice.id,
        'x-promo-provider': result.provider,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
