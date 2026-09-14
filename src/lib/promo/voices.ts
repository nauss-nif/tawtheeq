/**
 * مكتبة الأصوات العربية — عشرة أصوات منفصلة (خمسة رجالية وخمسة نسائية).
 *
 * كل صوت معرّف منطقي داخل المنصة (voiceId)، ويُترجَم إلى معرّف المزوّد
 * عبر جدول `providerIds`. تغيير المزوّد لا يغيّر إعدادات المستخدم المحفوظة.
 *
 * هذا الملف بيانات خالصة تُستورَد في الواجهة أيضًا؛ حلّ معرّف المزوّد الفعلي
 * (مع تجاوزات متغيّرات البيئة) يعيش في `providers/tts/voiceIds.ts` — خادم فقط.
 */

import type { VoiceSettings } from './types';

export type VoiceGender = 'male' | 'female';

export interface PromoVoice {
  id: string;
  label: string;
  gender: VoiceGender;
  /** وصف قصير يُعرض للمستخدم */
  description: string;
  /** الاستخدام الأنسب — يُستخدم للترشيح حسب النمط */
  bestFor: string[];
  /** إعدادات افتراضية تعكس شخصية الصوت */
  defaults: Pick<VoiceSettings, 'speed' | 'energy' | 'tone' | 'pauseMs' | 'clarity'>;
  /** معرّفات المزوّدين — يُملأ من متغيرات البيئة عند الحاجة لتخصيص المؤسسة */
  providerIds: {
    elevenlabs?: string;
    openai?: string;
    azure?: string;
  };
}

/**
 * أصوات ElevenLabs المستخدمة هي أصوات متعدّدة اللغات تدعم العربية.
 * يمكن استبدال أي معرّف عبر متغيّر بيئة: PROMO_VOICE_<ID>=<provider_voice_id>
 */
export const PROMO_VOICES: PromoVoice[] = [
  // ------------------------------------------------------------ رجالية
  {
    id: 'male_formal_deep',
    label: 'رجالي — رسمي عميق',
    gender: 'male',
    description: 'صوت مؤسسي عميق ورصين، مناسب للافتتاحيات والخطاب الرسمي.',
    bestFor: ['institutional', 'premium', 'cinematic'],
    defaults: { speed: 0.95, energy: 0.3, tone: 'serious', pauseMs: 420, clarity: 0.85 },
    providerIds: { elevenlabs: 'onwK4e9ZLuTAKqWW03F9', openai: 'onyx' },
  },
  {
    id: 'male_youthful',
    label: 'رجالي — شبابي حديث',
    gender: 'male',
    description: 'نبرة عصرية خفيفة وسريعة الإيقاع، مناسبة للمحتوى الحديث.',
    bestFor: ['modern', 'dynamic'],
    defaults: { speed: 1.05, energy: 0.6, tone: 'warm', pauseMs: 300, clarity: 0.75 },
    providerIds: { elevenlabs: 'TxGEqnHWrfWFTfGW9XjX', openai: 'echo' },
  },
  {
    id: 'male_documentary',
    label: 'رجالي — وثائقي',
    gender: 'male',
    description: 'سرد هادئ متمهّل بطابع وثائقي، يمنح المشاهد مساحة للتأمّل.',
    bestFor: ['documentary', 'cinematic'],
    defaults: { speed: 0.92, energy: 0.25, tone: 'neutral', pauseMs: 480, clarity: 0.9 },
    providerIds: { elevenlabs: 'pNInz6obpgDQGcFmaJgB', openai: 'fable' },
  },
  {
    id: 'male_energetic',
    label: 'رجالي — حماسي',
    gender: 'male',
    description: 'طاقة عالية ودفع أمامي، مناسب للبروموهات السريعة.',
    bestFor: ['dynamic'],
    defaults: { speed: 1.1, energy: 0.85, tone: 'warm', pauseMs: 250, clarity: 0.7 },
    providerIds: { elevenlabs: 'ErXwobaYiN019PkySvjV', openai: 'ash' },
  },
  {
    id: 'male_calm',
    label: 'رجالي — هادئ',
    gender: 'male',
    description: 'نبرة دافئة منخفضة، مناسبة للمشاهد التأمّلية والختام.',
    bestFor: ['premium', 'documentary'],
    defaults: { speed: 0.9, energy: 0.2, tone: 'warm', pauseMs: 520, clarity: 0.88 },
    providerIds: { elevenlabs: 'VR6AewLTigWG4xSOukaG', openai: 'alloy' },
  },

  // ------------------------------------------------------------ نسائية
  {
    id: 'female_formal',
    label: 'نسائي — رسمي',
    gender: 'female',
    description: 'صوت مؤسسي واضح ومتزن، مناسب للتقارير والبرامج الرسمية.',
    bestFor: ['institutional', 'premium'],
    defaults: { speed: 0.97, energy: 0.35, tone: 'serious', pauseMs: 400, clarity: 0.88 },
    providerIds: { elevenlabs: 'EXAVITQu4vr4xnSDxMaL', openai: 'nova' },
  },
  {
    id: 'female_documentary',
    label: 'نسائي — وثائقي',
    gender: 'female',
    description: 'سرد وصفي هادئ ودافئ، يناسب توثيق الفعاليات.',
    bestFor: ['documentary', 'cinematic'],
    defaults: { speed: 0.93, energy: 0.28, tone: 'neutral', pauseMs: 460, clarity: 0.9 },
    providerIds: { elevenlabs: 'ThT5KcBeYPX3keUQqHPh', openai: 'shimmer' },
  },
  {
    id: 'female_youthful',
    label: 'نسائي — شبابي',
    gender: 'female',
    description: 'نبرة حيوية قريبة، مناسبة لمحتوى وسائل التواصل.',
    bestFor: ['modern', 'dynamic'],
    defaults: { speed: 1.05, energy: 0.62, tone: 'warm', pauseMs: 300, clarity: 0.75 },
    providerIds: { elevenlabs: 'jsCqWAovK2LkecY7zXl4', openai: 'coral' },
  },
  {
    id: 'female_calm',
    label: 'نسائي — هادئ',
    gender: 'female',
    description: 'صوت ناعم متمهّل، مناسب للنهايات والرسائل الإنسانية.',
    bestFor: ['premium', 'documentary'],
    defaults: { speed: 0.9, energy: 0.2, tone: 'warm', pauseMs: 520, clarity: 0.9 },
    providerIds: { elevenlabs: 'XrExE9yKIg1WjnnlVkGX', openai: 'sage' },
  },
  {
    id: 'female_energetic',
    label: 'نسائي — حماسي',
    gender: 'female',
    description: 'اندفاع وحيوية عالية، مناسب للبرومو الحماسي والإعلانات.',
    bestFor: ['dynamic', 'modern'],
    defaults: { speed: 1.08, energy: 0.82, tone: 'warm', pauseMs: 260, clarity: 0.72 },
    providerIds: { elevenlabs: 'Xb7hH8MSUJpSbSDYk0k2', openai: 'ballad' },
  },
];

export const VOICE_BY_ID = Object.fromEntries(PROMO_VOICES.map((v) => [v.id, v])) as
  Record<string, PromoVoice>;

export function getVoice(id: string): PromoVoice {
  return VOICE_BY_ID[id] ?? PROMO_VOICES[0];
}

/** الأصوات المرشّحة لنمط معيّن (المطابقة أولًا ثم البقية) */
export function voicesForStyle(styleId: string): PromoVoice[] {
  const match = PROMO_VOICES.filter((v) => v.bestFor.includes(styleId));
  const rest = PROMO_VOICES.filter((v) => !v.bestFor.includes(styleId));
  return [...match, ...rest];
}

/** الإعدادات الافتراضية لصوت ما، كاملة */
export function defaultVoiceSettings(voiceId: string): VoiceSettings {
  const v = getVoice(voiceId);
  return { voiceId: v.id, ...v.defaults };
}

