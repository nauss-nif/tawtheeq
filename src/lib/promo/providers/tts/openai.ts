/**
 * مزوّد التعليق الصوتي البديل: OpenAI TTS.
 * يُستخدم عند غياب مفتاح ElevenLabs، أو عند اختياره صراحةً.
 */

import { serverEnv } from '@/lib/env';
import { getVoice } from '../../voices';
import { providerVoiceId } from './voiceIds';
import { applyLexicon } from '../../pronounce';
import type { TtsProvider, TtsRequest, TtsResult } from '../types';

export const openAiTts: TtsProvider = {
  id: 'openai',
  kind: 'tts',
  supportsLexicon: false,

  isConfigured() {
    return Boolean(serverEnv.openaiApiKey);
  },

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const key = serverEnv.openaiApiKey;
    if (!key) throw new Error('مفتاح OpenAI غير مُعدّ');

    const voice = getVoice(req.voiceId);
    const vid = providerVoiceId(voice, 'openai') ?? 'alloy';
    const text = applyLexicon(req.text, req.lexicon ?? []);

    // OpenAI لا يوفّر معاملات نبرة منفصلة، لكنه يقبل توجيهًا نصيًا للأداء
    const instructions = performanceHint(req);

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: vid,
        input: text,
        instructions,
        response_format: 'mp3',
        speed: Math.min(1.2, Math.max(0.7, req.settings.speed)),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`تعذّر توليد التعليق الصوتي (${res.status}) ${detail.slice(0, 200)}`);
    }

    const audio = Buffer.from(await res.arrayBuffer());
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return {
      audio,
      mime: 'audio/mpeg',
      duration: words / (2.6 * Math.max(0.5, req.settings.speed)),
      provider: 'openai',
    };
  },
};

/** ترجمة إعدادات النبرة والحماس والوقفات إلى توجيه أداء نصي */
function performanceHint(req: TtsRequest): string {
  const { energy, tone, pauseMs, clarity } = req.settings;
  const toneAr =
    tone === 'serious' ? 'جادّة ورصينة' : tone === 'warm' ? 'دافئة وقريبة' : 'محايدة ومتزنة';
  const energyAr = energy > 0.65 ? 'طاقة عالية ودفع أمامي' : energy > 0.4 ? 'طاقة متوسطة' : 'هدوء وتمهّل';
  const pauseAr = pauseMs >= 480 ? 'وقفات واضحة بين الجمل' : pauseMs >= 350 ? 'وقفات معتدلة' : 'وقفات قصيرة ومتلاحقة';
  const clarityAr = clarity > 0.8 ? 'نطق شديد الوضوح لكل حرف' : 'نطق واضح وطبيعي';
  return `اقرأ النص بالعربية الفصحى بنبرة ${toneAr}، ${energyAr}، مع ${pauseAr} و${clarityAr}. انطق أسماء المدن والدول والأشخاص والبرامج نطقًا صحيحًا كاملًا.`;
}
