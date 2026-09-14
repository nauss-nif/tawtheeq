/**
 * حلّ معرّف الصوت لدى المزوّد — خادم فقط.
 *
 * منفصل عن `voices.ts` لأن الأخير بيانات خالصة تُستورَد في الواجهة، ولا يصحّ
 * أن تقرأ حزمة العميل متغيّرات البيئة.
 */

import type { PromoVoice } from '../../voices';

/**
 * يمكن للمؤسسة تجاوز معرّف أي صوت عبر متغيّر بيئة:
 *   PROMO_VOICE_MALE_FORMAL_DEEP=abc123
 * وهو ما يسمح بربط أصوات مستنسخة خاصة بالجامعة دون تعديل الشيفرة.
 */
export function providerVoiceId(
  voice: PromoVoice,
  provider: 'elevenlabs' | 'openai' | 'azure',
): string | undefined {
  const override = process.env[`PROMO_VOICE_${voice.id.toUpperCase()}`];
  if (override) return override;
  return voice.providerIds[provider];
}
