/**
 * الإعدادات الافتراضية للبرومو.
 *
 * الهدف أن يعمل زر «إنشاء البرومو» فورًا دون أن يلمس المستخدم أي إعداد:
 * ٦٠ ثانية، سينمائي، موسيقى + تعليق، صوت مناسب للنمط، وشعار الجامعة.
 */

import { getStyle } from './styles';
import { defaultVoiceSettings, voicesForStyle } from './voices';
import { tracksForMoods } from './music';
import type { PromoSettings, PromoStyleId } from './types';

/** أقلّ ما يحتاجه اختيار الموسيقى الافتراضية من عنصر المكتبة */
export interface TrackChoice {
  id: string;
  mood: string;
  title: string;
}

export const NAUSS_LOGO = {
  assetId: 'nauss' as const,
  url: '/logo-nauss-white.png',
  label: 'جامعة نايف العربية للعلوم الأمنية',
};

/**
 * الإعدادات الافتراضية. المقاطع تأتي من مكتبة المنصة التي يرفعها المدير،
 * فإن كانت المكتبة فارغة يبقى الاختيار فارغًا ويُنبَّه المستخدم في الواجهة.
 */
export function defaultSettings(
  style: PromoStyleId = 'cinematic',
  tracks: TrackChoice[] = [],
): PromoSettings {
  const s = getStyle(style);
  const voice = voicesForStyle(style)[0];
  const track = tracksForMoods(tracks, s.musicMoods)[0];

  return {
    duration: 60,          // الافتراضي المطلوب
    orientation: 'horizontal',
    style,
    // مكتبة فارغة ⇒ لا نضع المستخدم أمام إعداد غير صالح يمنع الإنشاء؛
    // نبدأ بالتعليق الصوتي وحده حتى يرفع المدير المقاطع المعتمدة.
    audioMode: track ? 'music_voice' : 'voice_only',
    voice: {
      ...defaultVoiceSettings(voice.id),
      // النمط يوجّه النبرة الافتراضية
      energy: s.voiceHint.energy,
      tone: s.voiceHint.tone,
      speed: s.voiceHint.speed,
    },
    music: { trackId: track?.id ?? null, assetId: null, volume: 0.55 },
    logos: {
      logos: [{ assetId: 'nauss', url: NAUSS_LOGO.url, scale: 1, order: 0 }],
      placement: 'both',
    },
    allowGeneratedBRoll: false,
    enhanceUserScript: false,
    skipStoryboard: false,
    includeMediaIds: [],
    excludeMediaIds: [],
  };
}

/**
 * عند تغيير النمط نُحدّث ما يتبعه (الصوت والموسيقى) إن لم يكن المستخدم
 * قد غيّرهما يدويًا — لئلا يبقى نمط «فاخر» بموسيقى حماسية اختيرت لنمط آخر.
 */
export function applyStyleDefaults(
  settings: PromoSettings,
  style: PromoStyleId,
  touched: { voice: boolean; music: boolean },
  tracks: TrackChoice[] = [],
): PromoSettings {
  const s = getStyle(style);
  const next: PromoSettings = { ...settings, style };

  if (!touched.voice) {
    const voice = voicesForStyle(style)[0];
    next.voice = {
      ...defaultVoiceSettings(voice.id),
      energy: s.voiceHint.energy,
      tone: s.voiceHint.tone,
      speed: s.voiceHint.speed,
    };
  }
  if (!touched.music && settings.music.trackId !== 'upload' && tracks.length) {
    const track = tracksForMoods(tracks, s.musicMoods)[0];
    next.music = { ...settings.music, trackId: track?.id ?? settings.music.trackId };
  }
  return next;
}

/** تحقّق من الإعدادات قبل الإرسال — يعيد رسائل عربية جاهزة للعرض */
export function validateSettings(settings: PromoSettings): string[] {
  const errors: string[] = [];

  if (![30, 60, 90].includes(settings.duration)) errors.push('مدة الفيديو غير مدعومة.');

  const hasNauss = settings.logos.logos.some((l) => l.assetId === 'nauss');
  if (!hasNauss) errors.push('شعار جامعة نايف جزء ثابت من هوية البرومو ولا يمكن حذفه.');
  if (settings.logos.logos.length > 3) {
    errors.push('الحد الأقصى شعار الجامعة + شعارين إضافيين.');
  }

  const needsMusic = settings.audioMode === 'music_only' || settings.audioMode === 'music_voice';
  if (needsMusic && !settings.music.trackId) errors.push('اختر مقطعًا موسيقيًا أو ارفع ملفًا خاصًا.');
  if (settings.music.trackId === 'upload' && !settings.music.assetId) {
    errors.push('ارفع الملف الموسيقي أو اختر مقطعًا من المكتبة.');
  }

  const needsVoice = settings.audioMode === 'voice_only' || settings.audioMode === 'music_voice';
  if (needsVoice && !settings.voice.voiceId) errors.push('اختر صوت المذيع.');

  return errors;
}
