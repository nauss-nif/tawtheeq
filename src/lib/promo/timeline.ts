/**
 * محرّك التكوين والجدول الزمني.
 *
 * يحوّل خطة القصة إلى Timeline قابل للرندر — ويُبنى مستقلًا لكل اتجاه:
 * نقطة التركيز، مسار حركة الكاميرا، مواضع النصوص وأحجامها، المناطق الآمنة،
 * وأماكن الشعارات كلها تُحسب من جديد. لا يوجد قصّ (crop) لنسخة من الأخرى،
 * ولا Letterboxing.
 */

import { getStyle, pickMotion, pickTransition } from './styles';
import { BEAT_LABELS, type PlannedShot, type StoryPlan } from './story';
import type { NarrationSegment } from './script';
import type {
  CourseContext, FocusPoint, MotionType, PromoSettings, RenderOrientation,
  Scene, SceneMotion, TextOverlay, Timeline,
} from './types';

export const FRAME: Record<RenderOrientation, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
};

export const FPS = 30;

/**
 * المناطق الآمنة كنسب من الإطار.
 * العمودي يترك مساحة أكبر أعلى وأسفل لأن واجهات المنصات الاجتماعية تغطّيها.
 */
export const SAFE: Record<RenderOrientation, { top: number; bottom: number; side: number }> = {
  vertical: { top: 0.12, bottom: 0.18, side: 0.075 },
  horizontal: { top: 0.07, bottom: 0.09, side: 0.055 },
};

export interface TimelineInput {
  plan: StoryPlan;
  settings: PromoSettings;
  course: CourseContext;
  orientation: RenderOrientation;
  openingText?: string | null;
  closingText?: string | null;
  narration: NarrationSegment[];
  /** نقاط الإيقاع من الموسيقى (ثوانٍ) — فارغة إن لم توجد موسيقى */
  beatGrid?: number[];
  /** مسارات الصوت الجاهزة */
  musicPath?: string | null;
  voicePath?: string | null;
  /** تعديلات المستخدم على المشاهد (من شاشة المعاينة) */
  overrides?: Record<number, Partial<Scene>>;
}

export function buildTimeline(input: TimelineInput): Timeline {
  const style = getStyle(input.settings.style);
  const { width, height } = FRAME[input.orientation];
  const shots = input.plan.shots;

  // ------------------------------------------------ ١) مزامنة الإيقاع
  const durations = shots.map((s) => s.duration);
  const beatGrid = input.beatGrid ?? [];
  const synced =
    style.beatSync && beatGrid.length > 2
      ? snapToBeats(durations, beatGrid, style.beatSnap, style.minShot, style.maxShot)
      : durations;

  // ------------------------------------------------ ٢) بناء المشاهد
  const scenes: Scene[] = [];
  let cursor = 0;

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const duration = synced[i];
    const seed = i + 1;

    const focus = resolveFocus(shot, input.orientation);
    const motion = buildMotion(shot, style, seed, focus, input.orientation);

    const texts = buildTexts({
      shot,
      index: i,
      duration,
      orientation: input.orientation,
      course: input.course,
      settings: input.settings,
      openingText: input.openingText,
      closingText: input.closingText,
      focus,
      width,
      height,
    });

    const narrationForShot = input.narration
      .filter((n) => n.shotIndex === i)
      .map((n) => n.text)
      .join(' ');

    // أول مشهد يبدأ بتلاشٍ من الأسود دائمًا؛ لا انتقال «داخل» اللقطة الأولى
    const trans =
      i === 0
        ? { type: 'fade' as const, duration: 0.6 }
        : (() => {
            const t = pickTransition(style, seed);
            return { type: t.type, duration: Math.min(t.duration, duration * 0.4) };
          })();

    const scene: Scene = {
      id: `scene-${i + 1}`,
      index: i,
      beat: shot.beat,
      sourceKind: shot.isCard
        ? 'card'
        : shot.needsBRoll
          ? 'broll'
          : shot.media?.type === 'video'
            ? 'video'
            : 'image',
      mediaId: shot.media?.mediaId ?? null,
      src: shot.media?.url,
      clip: buildClip(shot, duration),
      duration,
      motion: { vertical: motion, horizontal: motion },
      texts: { vertical: [], horizontal: [] },
      transitionIn: trans,
      narration: narrationForShot || null,
      status: 'planned',
    };

    // الحركة والنصوص تُملأ للاتجاه المطلوب فقط؛ الاتجاه الآخر يُبنى باستدعاء
    // مستقل لهذه الدالة، فلا تتسرّب حسابات اتجاه إلى الآخر.
    scene.motion = { vertical: motion, horizontal: motion };
    scene.texts = { vertical: [], horizontal: [] };
    scene.texts[input.orientation] = texts;

    const override = input.overrides?.[i];
    scenes.push(override ? applyOverride(scene, override, input.orientation) : scene);
    cursor += duration;
  }

  // ------------------------------------------------ ٣) الصوت
  const speechWindows = input.narration.map((n) => ({ start: n.start, end: n.end }));
  const mode = input.settings.audioMode;

  return {
    orientation: input.orientation,
    width,
    height,
    fps: FPS,
    scenes,
    totalDuration: round(cursor),
    beatGrid,
    audio: {
      mode,
      musicPath: mode === 'music_only' || mode === 'music_voice' ? input.musicPath ?? null : null,
      musicVolume: input.settings.music.volume,
      voicePath: mode === 'voice_only' || mode === 'music_voice' ? input.voicePath ?? null : null,
      speechWindows: mode === 'music_voice' || mode === 'voice_only' ? speechWindows : [],
    },
  };
}

// --------------------------------------------------------------------------
// نقطة التركيز وحركة الكاميرا
// --------------------------------------------------------------------------

/**
 * إعادة تحديد نقطة التركيز حسب الاتجاه.
 * عند وضع صورة أفقية في إطار عمودي، الأهم هو الإحداثي الأفقي للتركيز؛
 * وعند العكس، الأهم هو الرأسي. نقيّد النقطة كي لا يخرج الإطار عن حدود المادة.
 */
function resolveFocus(shot: PlannedShot, orientation: RenderOrientation): FocusPoint {
  const base = shot.media?.focus ?? { x: 0.5, y: 0.45, confidence: 0 };
  const aspect = shot.media?.metrics.aspect ?? 1;
  const target = orientation === 'vertical' ? 9 / 16 : 16 / 9;

  // كم من عرض/ارتفاع المادة سيظهر داخل الإطار بعد التغطية (cover)
  const visibleW = aspect > target ? target / aspect : 1;
  const visibleH = aspect > target ? 1 : aspect / target;

  const halfW = visibleW / 2;
  const halfH = visibleH / 2;

  // ثقة منخفضة ⇒ ننجذب لمركز الإطار بدل اتّباع تقدير ضعيف
  const pull = 1 - Math.min(1, base.confidence * 1.2);
  const x = base.x + (0.5 - base.x) * pull * 0.6;
  // انحياز رأسي طفيف لأعلى في العمودي: الوجوه غالبًا في النصف العلوي
  const yBias = orientation === 'vertical' ? -0.03 : 0;
  const y = base.y + (0.5 - base.y) * pull * 0.6 + yBias;

  return {
    x: clamp(x, halfW, 1 - halfW),
    y: clamp(y, halfH, 1 - halfH),
    confidence: base.confidence,
  };
}

/** بناء حركة الكاميرا للمشهد، مع منع الحركات التي لا تناسب المادة أو الاتجاه */
function buildMotion(
  shot: PlannedShot,
  style: ReturnType<typeof getStyle>,
  seed: number,
  focus: FocusPoint,
  orientation: RenderOrientation,
): SceneMotion {
  // بطاقة نصية: حركة خفيفة جدًا فقط
  if (shot.isCard) {
    return {
      type: 'slow_zoom_in',
      intensity: style.motionIntensity * 0.35,
      focus: { x: 0.5, y: 0.5, confidence: 1 },
      easing: 'ease_in_out',
    };
  }

  // الفيديو يحمل حركته الأصلية — لا نضيف حركة كاميرا صناعية فوقها
  if (shot.media?.type === 'video') {
    return { type: 'static', intensity: 0, focus, easing: 'linear' };
  }

  let type = pickMotion(style, seed);
  const aspect = shot.media?.metrics.aspect ?? 1;

  // منع الحركة الأفقية إذا لم يكن هناك فائض عرض تتحرّك فيه (والعكس)
  const target = orientation === 'vertical' ? 9 / 16 : 16 / 9;
  const spareX = aspect > target;
  const horizontalMoves: MotionType[] = ['pan_left', 'pan_right'];
  const verticalMoves: MotionType[] = ['pan_up', 'pan_down'];

  if (horizontalMoves.includes(type) && !spareX) type = 'slow_zoom_in';
  if (verticalMoves.includes(type) && spareX) type = 'push_in';

  // صورة منخفضة الدقة: نتجنّب التقريب الذي يفضح البكسلة
  const minSide = Math.min(shot.media?.metrics.width ?? 0, shot.media?.metrics.height ?? 0);
  const frameMin = Math.min(FRAME[orientation].width, FRAME[orientation].height);
  if (minSide > 0 && minSide < frameMin * 1.25 && (type === 'push_in' || type === 'depth_push')) {
    type = 'slow_zoom_out';
  }

  // Parallax يحتاج عمقًا: نستخدمه فقط عند تكوين واضح وثقة تركيز جيدة
  if (type === 'parallax' && focus.confidence < 0.35) type = 'slow_zoom_in';

  return {
    type,
    intensity: style.motionIntensity,
    focus,
    easing: style.id === 'dynamic' ? 'ease_out' : 'ease_in_out',
  };
}

/** نافذة القصّ من الفيديو المصدر: أفضل لحظة، مع تباطؤ عند الملاءمة */
function buildClip(shot: PlannedShot, duration: number) {
  if (shot.media?.type !== 'video') return undefined;

  const best = (shot.media as { bestWindow?: { start: number; end: number } }).bestWindow;
  const srcDuration = shot.media.metrics.duration ?? duration;
  const start = best ? best.start : Math.max(0, (srcDuration - duration) / 2);

  // لقطة قصيرة عالية الحركة تُبطّأ قليلًا لتملأ مدة المشهد بأناقة
  const available = Math.max(0.5, srcDuration - start);
  const speed = available < duration ? clamp(available / duration, 0.5, 1) : 1;

  return {
    start: round(start),
    end: round(Math.min(srcDuration, start + duration * speed)),
    speed,
  };
}

// --------------------------------------------------------------------------
// النصوص — الموضع والحجم لكل اتجاه على حدة
// --------------------------------------------------------------------------

function buildTexts(args: {
  shot: PlannedShot;
  index: number;
  duration: number;
  orientation: RenderOrientation;
  course: CourseContext;
  settings: PromoSettings;
  openingText?: string | null;
  closingText?: string | null;
  focus: FocusPoint;
  width: number;
  height: number;
}): TextOverlay[] {
  const { shot, orientation, course, focus, duration } = args;
  const style = getStyle(args.settings.style);
  const safe = SAFE[orientation];
  const out: TextOverlay[] = [];

  /** موضع رأسي يتجنّب تغطية نقطة التركيز (الوجوه والعناصر المهمّة) */
  const avoidFocusY = (preferred: number): number => {
    const gap = 0.22;
    if (Math.abs(preferred - focus.y) > gap) return preferred;
    // ننقل النص إلى النصف المقابل لنقطة التركيز
    const alt = focus.y > 0.5 ? safe.top + 0.1 : 1 - safe.bottom - 0.12;
    return clamp(alt, safe.top + 0.06, 1 - safe.bottom - 0.06);
  };

  const push = (
    text: string,
    role: TextOverlay['role'],
    y: number,
    sizeMul: number,
    inAt: number,
    dur: number,
  ) => {
    if (!text?.trim()) return;
    out.push({
      id: `t-${args.index}-${out.length}`,
      text: text.trim(),
      role,
      // العربية RTL: المحاذاة لليمين في اللقطات الوصفية، والتوسيط في البطاقات
      anchor: { x: 0.5, y },
      align: role === 'caption' ? 'end' : 'center',
      sizeRatio:
        (role === 'title' ? style.type.titleRatio : style.type.subtitleRatio) * sizeMul,
      inAt,
      duration: dur,
      animation: style.type.animation,
      rtl: true,
    });
  };

  // العمودي يحتمل نصًا أكبر نسبيًا (المسافة أقرب على الجوال)
  const sizeMul = orientation === 'vertical' ? 1.18 : 1;

  switch (shot.beat) {
    case 'opening': {
      const text = args.openingText?.trim();
      if (text) {
        // النص الافتتاحي حرّ بالكامل — نعرضه كما كتبه المستخدم
        const lines = text.split('\n').filter((l) => l.trim());
        const anchorY = orientation === 'vertical' ? 0.68 : 0.72;
        lines.forEach((line, i) => {
          push(
            line,
            i === 0 ? 'title' : 'subtitle',
            anchorY + i * (orientation === 'vertical' ? 0.055 : 0.075),
            sizeMul * (i === 0 ? 1 : 0.62),
            0.5 + i * 0.18,
            duration - 0.7 - i * 0.18,
          );
        });
      }
      break;
    }

    case 'title': {
      const y = avoidFocusY(orientation === 'vertical' ? 0.6 : 0.66);
      push(course.title, 'title', y, sizeMul, 0.35, duration - 0.5);
      const sub = [course.location, formatDate(course.startDate)].filter(Boolean).join(' — ');
      if (sub) {
        push(sub, 'subtitle', y + (orientation === 'vertical' ? 0.075 : 0.1), sizeMul, 0.7, duration - 0.9);
      }
      break;
    }

    case 'place': {
      if (course.location) {
        push(
          course.location,
          'caption',
          avoidFocusY(orientation === 'vertical' ? 0.8 : 0.82),
          sizeMul,
          0.4,
          Math.min(2.6, duration - 0.5),
        );
      }
      break;
    }

    case 'training': {
      // نص وصفي واحد فقط في أول لقطة من هذه الخطوة، حتى لا تزدحم الشاشة
      const first = course.sessions[0]?.title;
      if (first && args.index % 3 === 0) {
        push(
          first,
          'caption',
          avoidFocusY(orientation === 'vertical' ? 0.82 : 0.84),
          sizeMul * 0.92,
          0.4,
          Math.min(2.4, duration - 0.6),
        );
      }
      break;
    }

    case 'closing': {
      const text = args.closingText?.trim();
      if (text) {
        const lines = text.split('\n').filter((l) => l.trim());
        const anchorY = orientation === 'vertical' ? 0.62 : 0.66;
        lines.forEach((line, i) => {
          push(
            line,
            i === 0 ? 'closing' : 'subtitle',
            anchorY + i * (orientation === 'vertical' ? 0.055 : 0.075),
            sizeMul * (i === 0 ? 1 : 0.62),
            0.4 + i * 0.16,
            duration - 0.6 - i * 0.16,
          );
        });
      }
      break;
    }

    case 'endcard':
      // بطاقة النهاية تُبنى في طبقة الرندر (شعارات + معلومات) لا كنص عادي
      break;

    default:
      break;
  }

  return out;
}

function formatDate(d: string | null): string {
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(d));
  } catch {
    return '';
  }
}

// --------------------------------------------------------------------------
// مزامنة الإيقاع
// --------------------------------------------------------------------------

/**
 * محاذاة نهايات اللقطات لأقرب ضربة موسيقية ضمن حدود النمط.
 * الالتصاق جزئي (snap) لا مطلق: لا نسمح لضربة بعيدة أن تشوّه إيقاع القصة.
 */
function snapToBeats(
  durations: number[],
  beats: number[],
  strength: number,
  min: number,
  max: number,
): number[] {
  const out = [...durations];
  let t = 0;
  for (let i = 0; i < out.length - 1; i++) {
    const target = t + out[i];
    const beat = nearest(beats, target);
    if (beat === null) { t = target; continue; }

    const snapped = t + clamp(beat - t, min, max);
    // نمزج بين المدة الأصلية والمُلتصقة بقوّة النمط
    const blended = target + (snapped - target) * strength;
    const dur = clamp(blended - t, min, max);
    const delta = dur - out[i];
    out[i] = round(dur);
    // نعوّض الفارق على اللقطة التالية للحفاظ على المدة الكلية
    out[i + 1] = round(clamp(out[i + 1] - delta, min, max));
    t += out[i];
  }
  return out;
}

function nearest(values: number[], target: number): number | null {
  if (!values.length) return null;
  let best = values[0];
  for (const v of values) if (Math.abs(v - target) < Math.abs(best - target)) best = v;
  return Math.abs(best - target) <= 0.9 ? best : null;
}

// --------------------------------------------------------------------------
// تعديلات المستخدم
// --------------------------------------------------------------------------

function applyOverride(
  scene: Scene,
  patch: Partial<Scene>,
  orientation: RenderOrientation,
): Scene {
  const next: Scene = { ...scene };
  if (patch.duration !== undefined) next.duration = patch.duration;
  if (patch.mediaId !== undefined) next.mediaId = patch.mediaId;
  if (patch.src !== undefined) next.src = patch.src;
  if (patch.transitionIn) next.transitionIn = patch.transitionIn;
  if (patch.narration !== undefined) next.narration = patch.narration;
  if (patch.motion?.[orientation]) {
    next.motion = { ...next.motion, [orientation]: patch.motion[orientation] };
  }
  if (patch.texts?.[orientation]) {
    next.texts = { ...next.texts, [orientation]: patch.texts[orientation] };
  }
  return next;
}

// --------------------------------------------------------------------------
// عرض الـ Storyboard
// --------------------------------------------------------------------------

export interface StoryboardRow {
  index: number;
  label: string;
  beat: string;
  beatLabel: string;
  duration: number;
  sourceKind: Scene['sourceKind'];
  mediaId: string | null;
  thumbnail?: string;
  motion: string;
  motionLabel: string;
  transition: string;
  texts: string[];
  narration: string | null;
}

export const MOTION_LABELS: Record<MotionType, string> = {
  slow_zoom_in: 'تقريب بطيء',
  slow_zoom_out: 'إبعاد بطيء',
  push_in: 'اندفاع للأمام',
  pull_out: 'انسحاب للخلف',
  pan_left: 'مسح لليسار',
  pan_right: 'مسح لليمين',
  pan_up: 'مسح لأعلى',
  pan_down: 'مسح لأسفل',
  parallax: 'اختلاف منظر (عمق)',
  depth_push: 'اندفاع بعمق',
  rack_focus: 'نقل تركيز',
  static: 'ثابت',
};

export const TRANSITION_LABELS: Record<string, string> = {
  cut: 'قطع مباشر',
  fade: 'تلاشٍ',
  dissolve: 'ذوبان',
  wipe_right: 'مسح يمين',
  wipe_left: 'مسح يسار',
  slide_up: 'انزلاق لأعلى',
  whip_pan: 'مسح سريع',
  flash: 'ومضة',
  zoom_blur: 'تقريب ضبابي',
};

/** تحويل الـ Timeline إلى صفوف Storyboard جاهزة للعرض */
export function toStoryboard(
  timeline: Timeline,
  thumbnails: Record<string, string> = {},
): StoryboardRow[] {
  return timeline.scenes.map((s) => {
    const motion = s.motion[timeline.orientation];
    return {
      index: s.index,
      label: `مشهد ${String(s.index + 1).padStart(2, '0')}`,
      beat: s.beat,
      beatLabel: BEAT_LABELS[s.beat],
      duration: s.duration,
      sourceKind: s.sourceKind,
      mediaId: s.mediaId ?? null,
      thumbnail: s.mediaId ? thumbnails[s.mediaId] : undefined,
      motion: motion.type,
      motionLabel: MOTION_LABELS[motion.type] ?? motion.type,
      transition: TRANSITION_LABELS[s.transitionIn.type] ?? s.transitionIn.type,
      texts: s.texts[timeline.orientation].map((t) => t.text),
      narration: s.narration ?? null,
    };
  });
}

// --------------------------------------------------------------------------

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
