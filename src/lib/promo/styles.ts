/**
 * أنماط البرومو — كل نمط مجموعة معاملات كاملة تحكم:
 * الإيقاع، الانتقالات، معالجة الصور، حركة الكاميرا، الموسيقى،
 * Typography، سرعة المونتاج، أسلوب ظهور النصوص، ومعالجة الألوان.
 *
 * هذه هي «شخصية» الفيلم؛ محرّك القصة والرندر لا يقرّران شيئًا من هذه القيم بأنفسهما.
 */

import type { MotionType, PromoStyleId, TransitionType } from './types';

export interface ColorGrade {
  /** تصحيح ألوان ffmpeg: eq + curves */
  contrast: number;   // 1 = بدون تغيير
  brightness: number; // 0 = بدون تغيير
  saturation: number; // 1 = بدون تغيير
  gamma: number;
  /** درجة حرارة اللون: موجب = دافئ، سالب = بارد */
  temperature: number;
  /** شدّة الڤينييت 0..1 (0 = بدون) */
  vignette: number;
  /** حبيبات فيلم خفيفة 0..1 */
  grain: number;
  /** شريط سينمائي علوي/سفلي (نسبة من الارتفاع) — يُستخدم في الأفقي فقط */
  letterbar: number;
}

export interface TypographyStyle {
  /** عائلة الخط العربي — El Messiri افتراضًا لكل الأنماط (هوية موحّدة) */
  family: string;
  /** أوزان العناوين والنصوص الفرعية */
  titleWeight: number;
  bodyWeight: number;
  /** حجم العنوان كنسبة من ارتفاع الإطار */
  titleRatio: number;
  subtitleRatio: number;
  /** تباعد الأحرف (em) */
  tracking: number;
  /** ارتفاع السطر */
  leading: number;
  /** أسلوب ظهور النص */
  animation: 'fade' | 'rise' | 'mask_reveal' | 'letter_fade';
  /** خلفية النص: بدون / شريط شفاف / تدرّج سفلي */
  plate: 'none' | 'bar' | 'gradient';
  /** خط ذهبي تحت العنوان (عنصر هوية الجامعة) */
  accentRule: boolean;
  /** ظل النص لضمان القراءة فوق الصور */
  shadow: number;
}

export interface PromoStyle {
  id: PromoStyleId;
  label: string;
  description: string;
  /** متوسط طول اللقطة بالثواني — يحدّد سرعة المونتاج */
  avgShotLength: number;
  /** أقصر وأطول لقطة مسموحة */
  minShot: number;
  maxShot: number;
  /** هل تُقصّ اللقطات على ضربات الموسيقى؟ */
  beatSync: boolean;
  /** قوة الالتصاق بالضربة 0..1 */
  beatSnap: number;
  /** الانتقالات المسموحة لهذا النمط ووزن كل منها */
  transitions: { type: TransitionType; weight: number; duration: number }[];
  /** أنواع الحركة المفضّلة للصور */
  motions: { type: MotionType; weight: number }[];
  /** شدّة الحركة الافتراضية 0..1 */
  motionIntensity: number;
  grade: ColorGrade;
  type: TypographyStyle;
  /** تصنيفات الموسيقى المقترحة لهذا النمط (بالترتيب) */
  musicMoods: string[];
  /** أسلوب التعليق الصوتي المقترح */
  voiceHint: { energy: number; tone: 'warm' | 'neutral' | 'serious'; speed: number };
  /** مدة بطاقة النهاية بالثواني */
  endCardDuration: number;
  /** مدة اللقطة الافتتاحية */
  openingDuration: number;
}

const EL_MESSIRI = 'El Messiri';

export const PROMO_STYLES: Record<PromoStyleId, PromoStyle> = {
  // ---------------------------------------------------------------- سينمائي
  cinematic: {
    id: 'cinematic',
    label: 'سينمائي',
    description: 'إيقاع متأنٍّ، حركة كاميرا واسعة، معالجة ألوان فيلمية، ونصوص تظهر بهدوء.',
    avgShotLength: 3.6,
    minShot: 2.2,
    maxShot: 5.5,
    beatSync: true,
    beatSnap: 0.5,
    transitions: [
      { type: 'dissolve', weight: 5, duration: 0.7 },
      { type: 'fade', weight: 3, duration: 0.6 },
      { type: 'cut', weight: 2, duration: 0 },
    ],
    motions: [
      { type: 'slow_zoom_in', weight: 4 },
      { type: 'pan_left', weight: 3 },
      { type: 'pan_right', weight: 3 },
      { type: 'parallax', weight: 3 },
      { type: 'push_in', weight: 2 },
      { type: 'rack_focus', weight: 1 },
    ],
    motionIntensity: 0.55,
    grade: {
      contrast: 1.12, brightness: -0.02, saturation: 0.92, gamma: 0.98,
      temperature: -0.06, vignette: 0.35, grain: 0.12, letterbar: 0.055,
    },
    type: {
      family: EL_MESSIRI, titleWeight: 600, bodyWeight: 400,
      titleRatio: 0.062, subtitleRatio: 0.032, tracking: 0.01, leading: 1.35,
      animation: 'mask_reveal', plate: 'gradient', accentRule: true, shadow: 0.5,
    },
    musicMoods: ['cinematic', 'emotional', 'epic'],
    voiceHint: { energy: 0.4, tone: 'warm', speed: 0.95 },
    endCardDuration: 3.5,
    openingDuration: 3.2,
  },

  // ---------------------------------------------------------------- رسمي
  institutional: {
    id: 'institutional',
    label: 'رسمي',
    description: 'اتزان مؤسسي، انتقالات نظيفة، ألوان محايدة، ونصوص واضحة ومباشرة.',
    avgShotLength: 3.2,
    minShot: 2.2,
    maxShot: 4.6,
    beatSync: false,
    beatSnap: 0.2,
    transitions: [
      { type: 'fade', weight: 5, duration: 0.45 },
      { type: 'cut', weight: 4, duration: 0 },
      { type: 'dissolve', weight: 2, duration: 0.5 },
    ],
    motions: [
      { type: 'slow_zoom_in', weight: 4 },
      { type: 'slow_zoom_out', weight: 3 },
      { type: 'pan_right', weight: 2 },
      { type: 'static', weight: 2 },
    ],
    motionIntensity: 0.35,
    grade: {
      contrast: 1.05, brightness: 0.01, saturation: 1.0, gamma: 1.0,
      temperature: 0.0, vignette: 0.12, grain: 0, letterbar: 0,
    },
    type: {
      family: EL_MESSIRI, titleWeight: 600, bodyWeight: 500,
      titleRatio: 0.056, subtitleRatio: 0.03, tracking: 0, leading: 1.4,
      animation: 'fade', plate: 'bar', accentRule: true, shadow: 0.35,
    },
    musicMoods: ['corporate', 'inspirational', 'documentary'],
    voiceHint: { energy: 0.35, tone: 'serious', speed: 0.98 },
    endCardDuration: 4,
    openingDuration: 2.8,
  },

  // ---------------------------------------------------------------- حماسي
  dynamic: {
    id: 'dynamic',
    label: 'حماسي',
    description: 'مونتاج سريع مرتبط بالإيقاع، حركة قوية، ألوان مشبعة، ونصوص نابضة.',
    avgShotLength: 1.9,
    minShot: 1.1,
    maxShot: 3.0,
    beatSync: true,
    beatSnap: 0.9,
    transitions: [
      { type: 'cut', weight: 6, duration: 0 },
      { type: 'whip_pan', weight: 3, duration: 0.22 },
      { type: 'flash', weight: 2, duration: 0.18 },
      { type: 'slide_up', weight: 2, duration: 0.3 },
    ],
    motions: [
      { type: 'push_in', weight: 5 },
      { type: 'pull_out', weight: 3 },
      { type: 'pan_left', weight: 3 },
      { type: 'pan_right', weight: 3 },
      { type: 'depth_push', weight: 2 },
    ],
    motionIntensity: 0.85,
    grade: {
      contrast: 1.18, brightness: 0.02, saturation: 1.15, gamma: 0.97,
      temperature: 0.03, vignette: 0.2, grain: 0.05, letterbar: 0,
    },
    type: {
      family: EL_MESSIRI, titleWeight: 700, bodyWeight: 600,
      titleRatio: 0.07, subtitleRatio: 0.034, tracking: -0.005, leading: 1.25,
      animation: 'rise', plate: 'none', accentRule: false, shadow: 0.6,
    },
    musicMoods: ['energetic', 'epic', 'technology'],
    voiceHint: { energy: 0.8, tone: 'warm', speed: 1.08 },
    endCardDuration: 3,
    openingDuration: 2.2,
  },

  // ---------------------------------------------------------------- توثيقي
  documentary: {
    id: 'documentary',
    label: 'توثيقي',
    description: 'لقطات تتنفّس، قطع مباشر، ألوان طبيعية، ونصوص وصفية مقتضبة.',
    avgShotLength: 4.0,
    minShot: 2.6,
    maxShot: 6.0,
    beatSync: false,
    beatSnap: 0.15,
    transitions: [
      { type: 'cut', weight: 6, duration: 0 },
      { type: 'dissolve', weight: 3, duration: 0.6 },
      { type: 'fade', weight: 1, duration: 0.5 },
    ],
    motions: [
      { type: 'static', weight: 4 },
      { type: 'slow_zoom_in', weight: 4 },
      { type: 'pan_left', weight: 2 },
      { type: 'pan_right', weight: 2 },
    ],
    motionIntensity: 0.28,
    grade: {
      contrast: 1.04, brightness: 0, saturation: 0.95, gamma: 1.02,
      temperature: -0.02, vignette: 0.15, grain: 0.16, letterbar: 0.03,
    },
    type: {
      family: EL_MESSIRI, titleWeight: 500, bodyWeight: 400,
      titleRatio: 0.05, subtitleRatio: 0.028, tracking: 0.005, leading: 1.45,
      animation: 'fade', plate: 'bar', accentRule: false, shadow: 0.4,
    },
    musicMoods: ['documentary', 'emotional', 'inspirational'],
    voiceHint: { energy: 0.3, tone: 'neutral', speed: 0.93 },
    endCardDuration: 3.5,
    openingDuration: 3.5,
  },

  // ---------------------------------------------------------------- فاخر
  premium: {
    id: 'premium',
    label: 'فاخر',
    description: 'أناقة هادئة، حركة بطيئة جدًا، ذهبي على داكن، ومساحات بيضاء واسعة.',
    avgShotLength: 3.8,
    minShot: 2.6,
    maxShot: 5.5,
    beatSync: true,
    beatSnap: 0.4,
    transitions: [
      { type: 'dissolve', weight: 5, duration: 0.8 },
      { type: 'fade', weight: 4, duration: 0.7 },
      { type: 'wipe_right', weight: 1, duration: 0.5 },
    ],
    motions: [
      { type: 'slow_zoom_in', weight: 5 },
      { type: 'push_in', weight: 3 },
      { type: 'parallax', weight: 2 },
      { type: 'pan_right', weight: 2 },
    ],
    motionIntensity: 0.4,
    grade: {
      contrast: 1.1, brightness: -0.03, saturation: 0.88, gamma: 0.96,
      temperature: 0.05, vignette: 0.42, grain: 0.08, letterbar: 0.07,
    },
    type: {
      family: EL_MESSIRI, titleWeight: 600, bodyWeight: 400,
      titleRatio: 0.052, subtitleRatio: 0.026, tracking: 0.03, leading: 1.5,
      animation: 'letter_fade', plate: 'gradient', accentRule: true, shadow: 0.45,
    },
    musicMoods: ['cinematic', 'emotional', 'corporate'],
    voiceHint: { energy: 0.3, tone: 'warm', speed: 0.92 },
    endCardDuration: 4,
    openingDuration: 3.5,
  },

  // ---------------------------------------------------------------- حديث
  modern: {
    id: 'modern',
    label: 'حديث',
    description: 'إيقاع متوسط، انتقالات انزلاقية، ألوان نظيفة، وتايبوغرافي جريء.',
    avgShotLength: 2.6,
    minShot: 1.6,
    maxShot: 3.8,
    beatSync: true,
    beatSnap: 0.7,
    transitions: [
      { type: 'slide_up', weight: 4, duration: 0.35 },
      { type: 'cut', weight: 4, duration: 0 },
      { type: 'wipe_left', weight: 2, duration: 0.35 },
      { type: 'fade', weight: 2, duration: 0.4 },
    ],
    motions: [
      { type: 'push_in', weight: 4 },
      { type: 'pan_up', weight: 2 },
      { type: 'slow_zoom_out', weight: 3 },
      { type: 'parallax', weight: 3 },
    ],
    motionIntensity: 0.6,
    grade: {
      contrast: 1.08, brightness: 0.02, saturation: 1.06, gamma: 1.0,
      temperature: -0.03, vignette: 0.1, grain: 0, letterbar: 0,
    },
    type: {
      family: EL_MESSIRI, titleWeight: 700, bodyWeight: 500,
      titleRatio: 0.064, subtitleRatio: 0.031, tracking: -0.01, leading: 1.28,
      animation: 'rise', plate: 'none', accentRule: true, shadow: 0.5,
    },
    musicMoods: ['technology', 'corporate', 'energetic'],
    voiceHint: { energy: 0.55, tone: 'warm', speed: 1.02 },
    endCardDuration: 3.2,
    openingDuration: 2.5,
  },
};

export const PROMO_STYLE_LIST = Object.values(PROMO_STYLES);

export function getStyle(id: PromoStyleId): PromoStyle {
  return PROMO_STYLES[id] ?? PROMO_STYLES.cinematic;
}

/** اختيار انتقال من التوزيع الموزون للنمط (حتمي عبر بذرة لضمان تكرار النتيجة) */
export function pickTransition(style: PromoStyle, seed: number) {
  const total = style.transitions.reduce((s, t) => s + t.weight, 0);
  let r = (Math.abs(Math.sin(seed) * 10000) % 1) * total;
  for (const t of style.transitions) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return style.transitions[0];
}

/** اختيار نوع حركة من التوزيع الموزون للنمط */
export function pickMotion(style: PromoStyle, seed: number): MotionType {
  const total = style.motions.reduce((s, m) => s + m.weight, 0);
  let r = (Math.abs(Math.sin(seed * 1.7 + 0.3) * 10000) % 1) * total;
  for (const m of style.motions) {
    r -= m.weight;
    if (r <= 0) return m.type;
  }
  return style.motions[0].type;
}
