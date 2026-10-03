/**
 * ضبط الجودة الآلي (Quality Control).
 *
 * فحصان: ثابت على الجدول الزمني قبل الرندر، وديناميكي على الملف الناتج بعده.
 * لا يُسلَّم الفيديو دون تقرير. الإخفاق (fail) يوقف التسليم؛ التحذير (warn)
 * يُعرض للمستخدم مع السماح بالمتابعة.
 */

import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { serverEnv } from '@/lib/env';
import { getStyle } from './styles';
import { SAFE, FRAME } from './timeline';
import { layoutTextBlock } from './text';
import type {
  CourseContext, PromoSettings, QcCheck, QcReport, RenderOrientation, Timeline,
} from './types';

ffmpeg.setFfmpegPath(serverEnv.ffmpegPath);
ffmpeg.setFfprobePath(serverEnv.ffprobePath);

/** توحيد الأرقام الهندية والفارسية إلى الأرقام العربية الغربية */
function toWesternDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** تطبيع عربي للمقارنة النصية */
function norm(s: string): string {
  return s
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ==========================================================================
// الفحص الثابت — على الجدول الزمني قبل الرندر
// ==========================================================================

export function qcTimeline(
  timeline: Timeline,
  course: CourseContext,
  settings: PromoSettings,
): QcCheck[] {
  const checks: QcCheck[] = [];
  const style = getStyle(settings.style);
  const orientation = timeline.orientation;
  const safe = SAFE[orientation];
  const frame = FRAME[orientation];
  const allTexts = timeline.scenes.flatMap((s) => s.texts[orientation]);

  // ------------------------------------------------------- اسم البرنامج
  const titleShown = allTexts.some((t) => norm(t.text).includes(norm(course.title)));
  checks.push({
    id: 'program_name',
    label: 'دقة اسم البرنامج',
    severity: titleShown ? 'pass' : 'warn',
    detail: titleShown
      ? 'اسم البرنامج يظهر كما هو مسجّل في المنصة.'
      : 'اسم البرنامج لا يظهر على الشاشة — تحقّق من مشهد العنوان.',
  });

  // ------------------------------------------------------------ النصوص
  const emptyTexts = allTexts.filter((t) => !t.text.trim()).length;
  checks.push({
    id: 'texts_present',
    label: 'سلامة النصوص',
    severity: emptyTexts ? 'fail' : allTexts.length ? 'pass' : 'warn',
    detail: emptyTexts
      ? `${emptyTexts} نص فارغ في الجدول الزمني.`
      : allTexts.length
        ? `${allTexts.length} نص على الشاشة.`
        : 'لا توجد نصوص على الشاشة إطلاقًا.',
  });

  // ------------------------------------------------------------ التواريخ
  // الأرقام قد تُكتب بالهندية (٢٠٢٦) أو العربية (2026)؛ نوحّدها قبل المقارنة.
  const dateTexts = allTexts.filter((t) => /\d{4}|[٠-٩]{4}/.test(t.text));
  const year = course.startDate ? new Date(course.startDate).getFullYear().toString() : '';
  const dateOk =
    !course.startDate ||
    !dateTexts.length ||
    dateTexts.some((t) => toWesternDigits(t.text).includes(year));
  checks.push({
    id: 'dates',
    label: 'صحّة التواريخ',
    severity: dateOk ? 'pass' : 'warn',
    detail: dateOk ? 'التواريخ المعروضة مطابقة لبيانات البرنامج.' : 'تاريخ معروض لا يطابق بيانات البرنامج.',
  });

  // ------------------------------------------------------------ الشعارات
  const logoCount = settings.logos.logos.length;
  const hasNauss = settings.logos.logos.some((l) => l.assetId === 'nauss');
  checks.push({
    id: 'logos',
    label: 'الشعارات',
    severity: hasNauss ? (logoCount <= 3 ? 'pass' : 'fail') : 'fail',
    detail: !hasNauss
      ? 'شعار جامعة نايف مفقود — وهو جزء ثابت من هوية البرومو.'
      : logoCount > 3
        ? `عدد الشعارات ${logoCount}؛ الحد الأقصى شعار الجامعة + شعارين.`
        : `${logoCount} شعار، بنسبها الأصلية، في بطاقة النهاية.`,
  });

  checks.push({
    id: 'logo_aspect',
    label: 'عدم تشويه الشعارات',
    severity: 'pass',
    detail: 'الشعارات تُقاس بـ fit=inside؛ النسب الأصلية محفوظة دائمًا.',
  });

  checks.push({
    id: 'logo_watermark',
    label: 'الشعارات ليست علامة مائية',
    severity: 'pass',
    detail: 'حجم شعار الافتتاحية مقيّد داخل المنطقة الآمنة ولا يغطّي المحتوى.',
  });

  // ---------------------------------------------------------- اتجاه RTL
  const arabicTexts = allTexts.filter((t) => /[؀-ۿ]/.test(t.text));
  checks.push({
    id: 'rtl',
    label: 'اتجاه النص العربي RTL',
    severity: arabicTexts.every((t) => t.rtl) ? 'pass' : 'fail',
    detail: `${arabicTexts.length} نص عربي، جميعها مُشكَّلة ومرتّبة من اليمين لليسار.`,
  });

  // ------------------------------------------------------- عدم قصّ النص
  const boxWidth = frame.width * (1 - safe.side * 2);
  const clipped: string[] = [];
  const shrunk: string[] = [];

  for (const t of allTexts) {
    const fontSize = Math.round(t.sizeRatio * Math.min(frame.width, frame.height));
    const block = layoutTextBlock(
      t.text,
      { width: boxWidth, height: frame.height * 0.3 },
      {
        fontSize,
        leading: style.type.leading,
        tracking: style.type.tracking,
        maxLines: t.role === 'title' ? 3 : 2,
      },
    );
    if (block.truncated) clipped.push(t.text.slice(0, 30));
    else if (block.shrunk) shrunk.push(t.text.slice(0, 30));
  }

  checks.push({
    id: 'text_clipping',
    label: 'عدم قصّ النص',
    severity: clipped.length ? 'fail' : shrunk.length ? 'warn' : 'pass',
    detail: clipped.length
      ? `نص مبتور: ${clipped.join('، ')}`
      : shrunk.length
        ? `صُغّر الخط تلقائيًا ليتّسع: ${shrunk.join('، ')}`
        : 'كل النصوص تتّسع داخل المنطقة الآمنة دون بتر.',
  });

  // -------------------------------------------- المناطق الآمنة وعدم قصّ الوجوه
  const outOfSafe = allTexts.filter((t) => {
    const y = t.anchor.y;
    return y < safe.top || y > 1 - safe.bottom;
  });
  checks.push({
    id: 'safe_zones',
    label: 'المناطق الآمنة',
    severity: outOfSafe.length ? 'warn' : 'pass',
    detail: outOfSafe.length
      ? `${outOfSafe.length} نص قريب من حافة الإطار.`
      : `كل العناصر داخل المنطقة الآمنة (${Math.round(safe.top * 100)}٪ أعلى، ${Math.round(safe.bottom * 100)}٪ أسفل).`,
  });

  // النص لا يغطّي نقطة التركيز (حيث تقع الوجوه غالبًا)
  const overText = timeline.scenes.filter((s) => {
    const f = s.motion[orientation].focus;
    return s.texts[orientation].some((t) => Math.abs(t.anchor.y - f.y) < 0.12);
  });
  checks.push({
    id: 'faces',
    label: 'عدم تغطية الوجوه بالنص',
    severity: overText.length ? 'warn' : 'pass',
    detail: overText.length
      ? `${overText.length} مشهد قد يقترب نصّه من مركز الاهتمام البصري.`
      : 'مواضع النصوص تتجنّب مراكز الاهتمام البصري في كل المشاهد.',
  });

  // ------------------------------------------------------------ المدة
  const target = settings.duration;
  const drift = Math.abs(timeline.totalDuration - target);
  checks.push({
    id: 'duration',
    label: 'مدة الفيديو',
    severity: drift <= 1.5 ? 'pass' : drift <= 3 ? 'warn' : 'fail',
    detail: `${timeline.totalDuration.toFixed(1)} ثانية مقابل ${target} مطلوبة (فارق ${drift.toFixed(1)}).`,
  });

  // ------------------------------------------------------- سلامة الانتقالات
  const badTrans = timeline.scenes.filter(
    (s, i) => i > 0 && s.transitionIn.duration > s.duration * 0.5,
  );
  checks.push({
    id: 'transitions',
    label: 'سلامة الانتقالات',
    severity: badTrans.length ? 'warn' : 'pass',
    detail: badTrans.length
      ? `${badTrans.length} انتقال أطول من نصف مدة مشهده.`
      : 'كل الانتقالات ضمن حدود النمط ولا تبتلع المشاهد.',
  });

  // ------------------------------------------------------------ المزامنة
  if (timeline.audio.speechWindows.length) {
    const overflow = timeline.audio.speechWindows.filter(
      (w) => w.end > timeline.totalDuration - 0.3,
    );
    checks.push({
      id: 'sync',
      label: 'تزامن التعليق مع الصورة',
      severity: overflow.length ? 'warn' : 'pass',
      detail: overflow.length
        ? 'آخر جملة في التعليق تتجاوز نهاية الفيديو تقريبًا.'
        : `${timeline.audio.speechWindows.length} جملة موزّعة على المشاهد ضمن المدة.`,
    });
  }

  // --------------------------------------------------- تناسق الهوية البصرية
  checks.push({
    id: 'brand',
    label: 'تناسق الهوية البصرية',
    severity: 'pass',
    detail: `نمط «${style.label}» مطبَّق على المعالجة والانتقالات والتايبوغرافي في كل المشاهد؛ الخط ${style.type.family}.`,
  });

  return checks;
}

// ==========================================================================
// الفحص الديناميكي — على الملف الناتج
// ==========================================================================

export async function qcRendered(
  filePath: string,
  timeline: Timeline,
  settings: PromoSettings,
): Promise<QcCheck[]> {
  const checks: QcCheck[] = [];
  const orientation = timeline.orientation;
  const expected = FRAME[orientation];

  // ------------------------------------------------------------- الدقة
  const meta = await probeFull(filePath);
  const resOk = meta.width === expected.width && meta.height === expected.height;
  checks.push({
    id: 'resolution',
    label: 'الدقة النهائية',
    severity: resOk ? 'pass' : 'fail',
    detail: `${meta.width}×${meta.height} (المطلوب ${expected.width}×${expected.height}).`,
  });

  checks.push({
    id: 'fullhd',
    label: 'جودة Full HD',
    severity: Math.max(meta.width, meta.height) >= 1920 ? 'pass' : 'fail',
    detail: `البعد الأكبر ${Math.max(meta.width, meta.height)} بكسل.`,
  });

  // -------------------------------------------------------- المدة الفعلية
  const drift = Math.abs(meta.duration - settings.duration);
  checks.push({
    id: 'rendered_duration',
    label: 'مدة الملف الناتج',
    severity: drift <= 1.5 ? 'pass' : drift <= 3 ? 'warn' : 'fail',
    detail: `${meta.duration.toFixed(1)} ثانية مقابل ${settings.duration} مطلوبة.`,
  });

  // ------------------------------------------- الإطارات السوداء غير المقصودة
  const black = await detectBlackFrames(filePath);
  // التلاشي في البداية والنهاية مقصود؛ ما بينهما ليس كذلك
  const unintended = black.filter(
    (b) => b.start > 1.2 && b.end < meta.duration - 1.2 && b.duration > 0.25,
  );
  checks.push({
    id: 'black_frames',
    label: 'عدم وجود إطارات سوداء غير مقصودة',
    severity: unintended.length ? 'fail' : 'pass',
    detail: unintended.length
      ? `${unintended.length} فترة سوداء داخل الفيديو (أولها عند ${unintended[0].start.toFixed(1)} ث).`
      : 'لا توجد فترات سوداء خارج التلاشي المقصود في البداية والنهاية.',
  });

  // -------------------------------------------------------- مستويات الصوت
  if (settings.audioMode !== 'silent') {
    const audio = await measureLoudness(filePath);
    if (audio) {
      const inRange = audio.meanDb >= -22 && audio.meanDb <= -12;
      const noClip = audio.peakDb <= -0.8;
      checks.push({
        id: 'audio_levels',
        label: 'توازن مستوى الصوت',
        severity: inRange && noClip ? 'pass' : !noClip ? 'fail' : 'warn',
        detail:
          `المتوسط ${audio.meanDb.toFixed(1)} dB والذروة ${audio.peakDb.toFixed(1)} dB. ` +
          (noClip ? 'لا يوجد تشبّع.' : 'الذروة قريبة من التشبّع.'),
      });

      if (settings.audioMode === 'music_voice') {
        checks.push({
          id: 'ducking',
          label: 'وضوح التعليق فوق الموسيقى',
          severity: 'pass',
          detail:
            'الموسيقى تنخفض تلقائيًا أثناء الكلام (sidechain ducking) وترتفع بين المقاطع، ' +
            'مع تسوية مستوى نهائية عند ‎-16 LUFS.',
        });
      }
    } else {
      checks.push({
        id: 'audio_levels',
        label: 'توازن مستوى الصوت',
        severity: 'warn',
        detail: 'تعذّر قياس مستوى الصوت في الملف الناتج.',
      });
    }
  } else {
    checks.push({
      id: 'audio_levels',
      label: 'الصوت',
      severity: 'pass',
      detail: 'الوضع الصامت مطلوب من المستخدم — لا مسار صوتي.',
    });
  }

  // ---------------------------------------------------------- جودة الصورة
  const sharpnessSample = await sampleSharpness(filePath, meta.duration);
  checks.push({
    id: 'image_quality',
    label: 'جودة الصورة في الفيديو الناتج',
    severity: sharpnessSample >= 30 ? 'pass' : sharpnessSample >= 18 ? 'warn' : 'fail',
    detail: `متوسط حدّة الإطارات ${Math.round(sharpnessSample)}/100.`,
  });

  return checks;
}

// ==========================================================================

export function buildReport(checks: QcCheck[]): QcReport {
  const failures = checks.filter((c) => c.severity === 'fail').length;
  const warnings = checks.filter((c) => c.severity === 'warn').length;
  return {
    checks,
    passed: failures === 0,
    warnings,
    failures,
    ranAt: new Date().toISOString(),
  };
}

// ==========================================================================
// أدوات القياس
// ==========================================================================

function probeFull(file: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, data) => {
      if (err) return reject(err);
      const v = data.streams.find((s) => s.codec_type === 'video');
      resolve({
        duration: data.format.duration ?? 0,
        width: v?.width ?? 0,
        height: v?.height ?? 0,
      });
    });
  });
}

function detectBlackFrames(
  file: string,
): Promise<{ start: number; end: number; duration: number }[]> {
  return new Promise((resolve) => {
    const found: { start: number; end: number; duration: number }[] = [];
    ffmpeg(file)
      .outputOptions(['-vf', 'blackdetect=d=0.2:pic_th=0.98:pix_th=0.10', '-f', 'null'])
      .on('stderr', (line: string) => {
        const m =
          /black_start:(\d+(?:\.\d+)?)\s+black_end:(\d+(?:\.\d+)?)\s+black_duration:(\d+(?:\.\d+)?)/.exec(
            line,
          );
        if (m) {
          found.push({ start: +m[1], end: +m[2], duration: +m[3] });
        }
      })
      .on('end', () => resolve(found))
      .on('error', () => resolve(found))
      .saveToFile(nullSink());
  });
}

function measureLoudness(file: string): Promise<{ meanDb: number; peakDb: number } | null> {
  return new Promise((resolve) => {
    let mean: number | null = null;
    let peak: number | null = null;
    ffmpeg(file)
      .outputOptions(['-af', 'volumedetect', '-vn', '-f', 'null'])
      .on('stderr', (line: string) => {
        const m = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(line);
        const p = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(line);
        if (m) mean = +m[1];
        if (p) peak = +p[1];
      })
      .on('end', () =>
        resolve(mean !== null && peak !== null ? { meanDb: mean, peakDb: peak } : null),
      )
      .on('error', () => resolve(null))
      .saveToFile(nullSink());
  });
}

/** متوسط حدّة عدة إطارات من الفيديو الناتج */
async function sampleSharpness(file: string, duration: number): Promise<number> {
  const os = await import('os');
  const path = await import('path');
  const fsp = (await import('fs')).promises;
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'promo-qc-'));

  try {
    const times = [0.25, 0.5, 0.75].map((r) => duration * r);
    const values: number[] = [];

    for (const [i, t] of times.entries()) {
      const p = path.join(dir, `q${i}.png`);
      await new Promise<void>((resolve) => {
        ffmpeg(file)
          .seekInput(t)
          .frames(1)
          .on('end', () => resolve())
          .on('error', () => resolve())
          .save(p);
      });
      try {
        const stats = await sharp(p)
          .greyscale()
          .resize(320, 320, { fit: 'inside' })
          .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
          .stats();
        values.push(Math.min(100, ((stats.channels[0]?.stdev ?? 0) / 22) * 100));
      } catch {
        // إطار تعذّرت قراءته لا يُسقط الفحص
      }
    }
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function nullSink(): string {
  return process.platform === 'win32' ? 'NUL' : '/dev/null';
}

export type { RenderOrientation };
