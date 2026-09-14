/**
 * خط إنتاج البرومو — تنسيق كل الطبقات.
 *
 *   تحليل المواد → اختيار الأفضل → بناء القصة → كتابة النص → التعليق الصوتي
 *   → الموسيقى والإيقاع → بناء التكوين لكل اتجاه → الرندر → ضبط الجودة → الحفظ
 *
 * كل مرحلة تُحدّث تقدّم البرومو، ولا تُسقط الإنتاج عند تعذّر مزوّد اختياري.
 * يعمل داخل العامل الخلفي (service role) لا داخل طلب HTTP.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { analyzeCourseMedia, selectMaterials, materialSummary } from './analyze';
import { buildStoryPlan, type StoryPlan } from './story';
import { prepareNarration, alignNarration, type NarrationSegment } from './script';
import { buildTimeline, toStoryboard, FRAME } from './timeline';
import { renderEndCard, renderCardBackground, renderCornerLogo, downloadTo } from './cards';
import { qcTimeline, qcRendered, buildReport } from './qc';
import { getStyle } from './styles';
import { chooseBRollKind } from './providers/genvideo';
import { detectBeats } from './providers/music';
import { getLibraryItem } from './library';
import {
  getGenVideoProvider, getLlmProvider, getMusicProvider,
  getRenderProvider, getTtsProvider,
} from './providers';
import type { Database } from '@/lib/database.types';
import type {
  CourseContext, MediaAnalysis, PromoOutputs, PromoSettings,
  QcCheck, RenderOrientation, Timeline,
} from './types';

type Client = SupabaseClient<Database>;

const BUCKET = 'promo';

export interface PipelineContext {
  supabase: Client;
  promoId: string;
  onProgress: (pct: number, label: string) => Promise<void> | void;
}

// ==========================================================================
// قراءة سياق البرنامج من منصة توثيق
// ==========================================================================

/** لا يُطلب من المستخدم إعادة إدخال أي من هذه البيانات — تُقرأ من مكانها */
export async function loadCourseContext(
  supabase: Client,
  courseId: string,
): Promise<CourseContext> {
  const [{ data: course }, { data: sessions }] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).single(),
    supabase
      .from('sessions')
      .select('title, presenter, description')
      .eq('course_id', courseId)
      .order('sort_order', { ascending: true }),
  ]);

  if (!course) throw new Error('البرنامج غير موجود');

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    startDate: course.start_date,
    endDate: course.end_date,
    location: course.location,
    trainers: course.trainer_names ?? [],
    welcomeText: course.welcome_text,
    sessions: sessions ?? [],
  };
}

// ==========================================================================
// المرحلة الأولى: التحضير (تحليل + قصة + نص + Storyboard)
// ==========================================================================

export interface PreparedPromo {
  course: CourseContext;
  settings: PromoSettings;
  analyses: MediaAnalysis[];
  selected: MediaAnalysis[];
  plan: StoryPlan;
  narrationText: string;
  narrationSource: string;
  narrationSegments: NarrationSegment[];
  warnings: string[];
  workDir: string;
}

export async function preparePromo(ctx: PipelineContext): Promise<PreparedPromo> {
  const { supabase, promoId } = ctx;

  const { data: promo } = await supabase.from('promos').select('*').eq('id', promoId).single();
  if (!promo) throw new Error('البرومو غير موجود');

  const settings = promo.settings as unknown as PromoSettings;
  const course = await loadCourseContext(supabase, promo.course_id);
  const warnings: string[] = [];

  // ------------------------------------------------------------- التحليل
  await setStage(ctx, 'analyzing', 5, 'تحليل الصور والفيديوهات');
  const analyses = await analyzeCourseMedia(supabase, {
    courseId: promo.course_id,
    onProgress: (done, total) => {
      void ctx.onProgress(5 + Math.round((done / total) * 20), `تحليل المواد ${done}/${total}`);
    },
  });

  if (!analyses.length) {
    throw new Error('لا توجد مواد مكتملة المعالجة في هذا البرنامج. ارفع الصور أولًا.');
  }

  // -------------------------------------------------------------- الاختيار
  await setStage(ctx, 'planning', 28, 'اختيار أفضل المواد وبناء القصة');
  const style = getStyle(settings.style);
  const sceneBudget = Math.max(4, Math.round(settings.duration / style.avgShotLength));

  const selection = selectMaterials(analyses, {
    sceneBudget,
    includeIds: settings.includeMediaIds,
    excludeIds: settings.excludeMediaIds,
  });

  if (!selection.selected.length) {
    throw new Error('لم تجتز أي مادة معايير الجودة. راجع الصور المرفوعة أو اخترها يدويًا.');
  }
  if (selection.duplicates.length) {
    warnings.push(`استُبعدت ${selection.rejected.filter((r) => r.reason === 'مكرّرة بصريًا').length} مادة مكرّرة بصريًا.`);
  }

  // -------------------------------------------------------------- القصة
  const llm = getLlmProvider();
  const suggested = llm
    ? await llm.planStory({
        course,
        style: settings.style,
        beats: ['opening', 'title', 'place', 'kickoff', 'training', 'activities', 'highlights', 'participants', 'closing', 'endcard'],
        analyses: selection.selected,
        duration: settings.duration,
      })
    : null;

  const plan = buildStoryPlan({
    course,
    analyses: selection.selected,
    duration: settings.duration as PromoSettings['duration'],
    style: settings.style,
    allowBRoll: settings.allowGeneratedBRoll && Boolean(getGenVideoProvider()),
    suggestedOrder: suggested?.order ?? null,
  });

  // --------------------------------------------------------------- النص
  await setStage(ctx, 'narrating', 40, 'تجهيز نص التعليق الصوتي');
  const needsVoice = settings.audioMode === 'voice_only' || settings.audioMode === 'music_voice';

  const script = needsVoice
    ? await prepareNarration({
        course,
        userText: promo.narration_text,
        enhance: settings.enhanceUserScript,
        duration: settings.duration as PromoSettings['duration'],
        style: settings.style,
        voice: settings.voice,
        analyses: selection.selected,
        openingText: promo.opening_text,
        closingText: promo.closing_text,
      })
    : { text: '', source: 'user' as const, targetWords: 0, actualWords: 0, warnings: [] };

  warnings.push(...script.warnings);

  const segments = script.text
    ? alignNarration(script.text, plan.shots, plan.totalDuration)
    : [];

  const workDir = path.join(os.tmpdir(), `promo-${promoId}`);
  await fs.mkdir(workDir, { recursive: true });

  // لوحة مشاهد قابلة للمراجعة تُبنى الآن، قبل أي رندر — هذه هي الشاشة التي
  // يعتمدها المستخدم في وضع «مراجعة الـ Storyboard».
  const previewOrientation: RenderOrientation =
    settings.orientation === 'vertical' ? 'vertical' : 'horizontal';

  const previewTimeline = buildTimeline({
    plan,
    settings,
    course,
    orientation: previewOrientation,
    openingText: promo.opening_text,
    closingText: promo.closing_text,
    narration: segments,
  });

  const { data: thumbRows } = await supabase
    .from('media')
    .select('id, thumbnail_url')
    .eq('course_id', promo.course_id);

  const thumbs = Object.fromEntries(
    (thumbRows ?? []).map((m) => [m.id, m.thumbnail_url ?? '']),
  ) as Record<string, string>;

  const existing = (promo.storyboard ?? {}) as Record<string, unknown>;

  // حفظ نتائج التحضير (تعديلات المستخدم المحفوظة في overrides تبقى كما هي)
  await supabase
    .from('promos')
    .update({
      narration_text: script.text || promo.narration_text,
      narration_source: script.source,
      analysis: {
        stats: selection.stats,
        rejected: selection.rejected,
        duplicates: selection.duplicates,
        materialSummary: materialSummary(selection.selected),
      },
      storyboard: {
        ...existing,
        rows: toStoryboard(previewTimeline, thumbs),
        rationale: plan.rationale,
        beats: plan.beats,
        totalDuration: plan.totalDuration,
        orientation: previewOrientation,
        warnings,
      },
    })
    .eq('id', promoId);

  return {
    course,
    settings,
    analyses,
    selected: selection.selected,
    plan,
    narrationText: script.text,
    narrationSource: script.source,
    narrationSegments: segments,
    warnings,
    workDir,
  };
}

// ==========================================================================
// المرحلة الثانية: الإنتاج (صوت + موسيقى + رندر + جودة)
// ==========================================================================

export async function producePromo(
  ctx: PipelineContext,
  prepared: PreparedPromo,
): Promise<{
  outputs: PromoOutputs;
  qc: QcCheck[];
  warnings: string[];
  storyboardRows: ReturnType<typeof toStoryboard>;
}> {
  const { supabase, promoId } = ctx;
  const { settings, course, plan, workDir } = prepared;
  const warnings = [...prepared.warnings];

  const { data: promo } = await supabase.from('promos').select('*').eq('id', promoId).single();
  if (!promo) throw new Error('البرومو غير موجود');

  // ------------------------------------------------------ تنزيل المواد محليًا
  await setStage(ctx, 'rendering', 48, 'تجهيز المواد للرندر');
  const mediaDir = path.join(workDir, 'media');
  await fs.mkdir(mediaDir, { recursive: true });

  const localSrc = new Map<string, string>();
  for (const a of prepared.selected) {
    try {
      const ext = a.type === 'video' ? 'mp4' : 'webp';
      localSrc.set(a.mediaId, await downloadTo(a.url, mediaDir, `${a.mediaId}.${ext}`));
    } catch {
      warnings.push(`تعذّر تحميل إحدى المواد؛ استُبعدت من البرومو.`);
    }
  }

  // ---------------------------------------------------------- التعليق الصوتي
  let voicePath: string | null = null;
  const needsVoice =
    (settings.audioMode === 'voice_only' || settings.audioMode === 'music_voice') &&
    prepared.narrationText;

  if (needsVoice) {
    await setStage(ctx, 'voicing', 52, 'توليد التعليق الصوتي');
    const tts = getTtsProvider();
    if (!tts) {
      warnings.push('مزوّد التعليق الصوتي غير مُعدّ — أُنتج البرومو بالموسيقى فقط.');
      settings.audioMode = settings.audioMode === 'voice_only' ? 'music_only' : 'music_only';
    } else {
      try {
        const lexicon = await loadLexicon(supabase, promo.course_id);
        const result = await tts.synthesize({
          text: prepared.narrationText,
          voiceId: settings.voice.voiceId,
          settings: settings.voice,
          lang: 'ar',
          lexicon,
        });

        voicePath = path.join(workDir, 'voice.mp3');
        await fs.writeFile(voicePath, result.audio);

        const uploaded = await uploadAsset(supabase, {
          courseId: promo.course_id,
          promoId,
          kind: 'voiceover',
          localPath: voicePath,
          name: 'voiceover.mp3',
          mime: 'audio/mpeg',
          meta: { provider: result.provider, voiceId: settings.voice.voiceId },
        });
        void uploaded;
      } catch (e) {
        warnings.push(
          `تعذّر توليد التعليق الصوتي (${(e as Error).message}) — أُنتج البرومو بالموسيقى فقط.`,
        );
        settings.audioMode = 'music_only';
      }
    }
  }

  // ------------------------------------------------------------- الموسيقى
  let musicPath: string | null = null;
  let beatGrid: number[] = [];
  const needsMusic = settings.audioMode === 'music_only' || settings.audioMode === 'music_voice';

  if (needsMusic && settings.music.trackId) {
    await setStage(ctx, 'rendering', 58, 'تجهيز الموسيقى وتحليل الإيقاع');
    try {
      const dest = path.join(workDir, 'music.mp3');

      // مصدران فقط: مكتبة المنصة (يرفعها المدير)، أو ملف رفعه المنسق لهذا البرومو
      let sourceUrl: string | null = null;
      if (settings.music.trackId === 'upload' && settings.music.assetId) {
        const { data: asset } = await supabase
          .from('promo_assets')
          .select('url')
          .eq('id', settings.music.assetId)
          .single();
        if (!asset?.url) throw new Error('الملف الموسيقي المرفوع غير موجود');
        sourceUrl = asset.url;
      } else {
        const item = await getLibraryItem(supabase, settings.music.trackId);
        if (!item) throw new Error('المقطع الموسيقي المختار لم يعد موجودًا في مكتبة المنصة');
        sourceUrl = item.url;
      }

      await getMusicProvider().fetchTrack(sourceUrl, dest);
      musicPath = dest;
      beatGrid = await detectBeats(dest, settings.duration + 4);
    } catch (e) {
      warnings.push(`${(e as Error).message} — أُنتج البرومو دون موسيقى.`);
      settings.audioMode = voicePath ? 'voice_only' : 'silent';
    }
  }

  // -------------------------------------------------- بطاقات الهوية والشعارات
  const logoPaths = await prepareLogos(supabase, promo.course_id, settings, workDir);

  // ------------------------------------------------------------- الرندر
  const orientations: RenderOrientation[] =
    settings.orientation === 'both' ? ['horizontal', 'vertical'] : [settings.orientation];

  const outputs: PromoOutputs = {};
  const allQc: QcCheck[] = [];
  const render = getRenderProvider();
  let storyboardRows: ReturnType<typeof toStoryboard> = [];

  const { data: thumbRows } = await supabase
    .from('media')
    .select('id, thumbnail_url')
    .eq('course_id', promo.course_id);
  const thumbs = Object.fromEntries(
    (thumbRows ?? []).map((m) => [m.id, m.thumbnail_url ?? '']),
  ) as Record<string, string>;

  for (const [oi, orientation] of orientations.entries()) {
    const base = 60 + oi * (35 / orientations.length);
    const span = 35 / orientations.length;

    await setStage(
      ctx,
      'rendering',
      Math.round(base),
      `بناء النسخة ${orientation === 'vertical' ? 'العمودية' : 'الأفقية'}`,
    );

    // بطاقات هذا الاتجاه تُبنى بمقاسه — لا تُعاد استخدامها بين الاتجاهين
    const frame = { ...FRAME[orientation], orientation };
    const endCardPath = path.join(workDir, `endcard-${orientation}.png`);
    await renderEndCard({ frame, logos: settings.logos, logoPaths, outPath: endCardPath });

    const openingCardPath = path.join(workDir, `opening-${orientation}.png`);
    await renderCardBackground(frame, openingCardPath, 'dark');

    // شعار الافتتاحية (عند اختيار الظهور في البداية أو كليهما):
    // ركن صغير داخل المنطقة الآمنة — ليس علامة مائية فوق المحتوى.
    const showStartLogo =
      settings.logos.placement === 'start' || settings.logos.placement === 'both';
    const cornerLogo =
      showStartLogo && logoPaths[0]
        ? await renderCornerLogo(
            logoPaths[0].path,
            frame,
            path.join(workDir, `corner-${orientation}.png`),
          ).catch(() => null)
        : null;

    const timeline = buildTimeline({
      plan,
      settings,
      course,
      orientation,
      openingText: promo.opening_text,
      closingText: promo.closing_text,
      narration: prepared.narrationSegments,
      beatGrid,
      musicPath,
      voicePath,
      overrides: (promo.storyboard as { overrides?: Record<number, never> })?.overrides,
    });

    // ربط المصادر المحلية بالمشاهد
    for (const scene of timeline.scenes) {
      // الشعار يظهر في الافتتاحية ومشهد العنوان فقط، ثم ينسحب
      if (cornerLogo && (scene.beat === 'opening' || scene.beat === 'title')) {
        const layer = {
          path: cornerLogo.path,
          x: cornerLogo.x,
          y: cornerLogo.y,
          width: cornerLogo.width,
          height: cornerLogo.height,
          inAt: 0.4,
          duration: Math.max(0.5, scene.duration - 0.6),
        };
        scene.overlays = { vertical: [], horizontal: [], [orientation]: [layer] };
      }

      if (scene.sourceKind === 'card') {
        scene.src = scene.beat === 'endcard' ? endCardPath : openingCardPath;
      } else if (scene.sourceKind === 'broll') {
        scene.src = await generateBRoll(ctx, course, settings, orientation, scene.duration, workDir)
          ?? openingCardPath;
        if (scene.src === openingCardPath) scene.sourceKind = 'card';
      } else if (scene.mediaId) {
        const local = localSrc.get(scene.mediaId);
        if (local) scene.src = local;
        else scene.sourceKind = 'card', (scene.src = openingCardPath);
      }
    }

    // فحص ثابت قبل الرندر
    const staticChecks = qcTimeline(timeline, course, settings);
    allQc.push(...staticChecks.map((c) => ({ ...c, id: `${orientation}:${c.id}` })));

    const outPath = path.join(workDir, `promo-${orientation}.mp4`);
    const result = await render.render({
      timeline,
      styleId: settings.style,
      workDir: path.join(workDir, `clips-${orientation}`),
      outputPath: outPath,
      onProgress: (pct, label) => {
        void ctx.onProgress(Math.round(base + (pct / 100) * span * 0.8), label);
      },
    });

    // فحص ديناميكي على الملف الناتج
    const dynamicChecks = await qcRendered(outPath, timeline, settings);
    allQc.push(...dynamicChecks.map((c) => ({ ...c, id: `${orientation}:${c.id}` })));

    // الرفع
    await setStage(ctx, 'rendering', Math.round(base + span * 0.9), 'رفع الفيديو');
    const video = await uploadAsset(supabase, {
      courseId: promo.course_id,
      promoId,
      kind: 'render',
      localPath: outPath,
      name: `promo-${orientation}.mp4`,
      mime: 'video/mp4',
      meta: { orientation, provider: result.provider },
      width: result.width,
      height: result.height,
      duration: result.duration,
    });

    const poster = await uploadAsset(supabase, {
      courseId: promo.course_id,
      promoId,
      kind: 'poster',
      localPath: result.posterPath,
      name: `promo-${orientation}.jpg`,
      mime: 'image/jpeg',
      meta: { orientation },
    });

    outputs[orientation] = {
      orientation,
      url: video.url,
      storagePath: video.storagePath,
      posterUrl: poster.url,
      width: result.width,
      height: result.height,
      duration: result.duration,
      fileSize: result.fileSize,
      renderedAt: new Date().toISOString(),
    };

    // حفظ المشاهد (يُستخدم في المعاينة وإعادة توليد مشهد واحد)
    await saveScenes(supabase, promoId, timeline);
    if (!storyboardRows.length) storyboardRows = toStoryboard(timeline, thumbs);
  }

  return { outputs, qc: allQc, warnings, storyboardRows };
}

// ==========================================================================
// إعادة توليد مشهد واحد
// ==========================================================================

/**
 * يعيد بناء مشهد واحد فقط ثم يدمج الفيديو من جديد.
 * مقاطع المشاهد الأخرى تبقى في الذاكرة المؤقّتة، فلا يُعاد رندرها.
 */
export async function regenerateScene(
  ctx: PipelineContext,
  sceneIndex: number,
): Promise<PromoOutputs> {
  const prepared = await preparePromo(ctx);
  const workDir = prepared.workDir;

  // إبطال المقطع المطلوب في كلا الاتجاهين
  for (const orientation of ['vertical', 'horizontal'] as RenderOrientation[]) {
    const clip = path.join(
      workDir,
      `clips-${orientation}`,
      `scene-${orientation}-${String(sceneIndex).padStart(2, '0')}.mp4`,
    );
    await fs.unlink(clip).catch(() => {});
  }

  const { outputs, qc } = await producePromo(ctx, prepared);
  await ctx.supabase
    .from('promos')
    .update({ outputs, qc_report: buildReport(qc), status: 'ready', progress: 100 })
    .eq('id', ctx.promoId);

  return outputs;
}

// ==========================================================================
// أدوات مساعدة
// ==========================================================================

async function setStage(
  ctx: PipelineContext,
  status: string,
  pct: number,
  label: string,
): Promise<void> {
  await ctx.supabase
    .from('promos')
    .update({ status: status as never, progress: pct, stage_label: label })
    .eq('id', ctx.promoId);
  await ctx.onProgress(pct, label);
}

async function loadLexicon(supabase: Client, courseId: string) {
  const { data } = await supabase
    .from('promo_pronunciations')
    .select('term, phonetic, ipa, course_id')
    .or(`course_id.eq.${courseId},course_id.is.null`);

  // مدخلات الدورة تتقدّم على المدخلات العامة عند تكرار المصطلح
  const map = new Map<string, { term: string; phonetic: string; ipa?: string | null }>();
  for (const row of data ?? []) {
    if (row.course_id === null && map.has(row.term)) continue;
    map.set(row.term, { term: row.term, phonetic: row.phonetic, ipa: row.ipa });
  }
  return [...map.values()];
}

/** تجهيز الشعارات محليًا: شعار الجامعة الثابت + الشعارات المرفوعة */
async function prepareLogos(
  supabase: Client,
  courseId: string,
  settings: PromoSettings,
  workDir: string,
): Promise<{ path: string; scale: number }[]> {
  const dir = path.join(workDir, 'logos');
  await fs.mkdir(dir, { recursive: true });

  const ordered = [...settings.logos.logos].sort((a, b) => a.order - b.order);
  const out: { path: string; scale: number }[] = [];

  for (const [i, logo] of ordered.entries()) {
    try {
      if (logo.assetId === 'nauss') {
        // الشعار الرسمي من ملفات المنصة — نسخة بيضاء تناسب الخلفية الداكنة
        const local = path.resolve(process.cwd(), 'public/logo-nauss-white.png');
        out.push({ path: local, scale: logo.scale });
      } else {
        out.push({
          path: await downloadTo(logo.url, dir, `logo-${i}.png`),
          scale: logo.scale,
        });
      }
    } catch {
      // شعار تعذّر تحميله يُتخطّى دون إسقاط الإنتاج
    }
  }

  void supabase;
  void courseId;
  return out;
}

async function generateBRoll(
  ctx: PipelineContext,
  course: CourseContext,
  settings: PromoSettings,
  orientation: RenderOrientation,
  duration: number,
  workDir: string,
): Promise<string | null> {
  const gen = getGenVideoProvider();
  if (!gen || !settings.allowGeneratedBRoll) return null;

  try {
    await ctx.onProgress(62, 'توليد لقطة افتتاحية سينمائية');
    const frame = FRAME[orientation];
    const result = await gen.generate({
      kind: chooseBRollKind(course.location),
      location: course.location,
      style: settings.style,
      duration,
      orientation,
      width: frame.width,
      height: frame.height,
    });

    const dest = path.join(workDir, `broll-${orientation}.mp4`);
    await fs.copyFile(result.videoPath, dest);

    // يُحفظ موسومًا بأنه مشهد مساند مولّد — لا توثيق لحدث
    await uploadAsset(ctx.supabase, {
      courseId: course.id,
      promoId: ctx.promoId,
      kind: 'broll',
      localPath: dest,
      name: `broll-${orientation}.mp4`,
      mime: 'video/mp4',
      meta: {
        generated: true,
        prompt: result.prompt,
        provider: result.provider,
        note: 'مشهد مساند مولّد (B-roll) — ليس توثيقًا لحدث وقع.',
      },
    });

    return dest;
  } catch {
    return null;
  }
}

async function uploadAsset(
  supabase: Client,
  args: {
    courseId: string;
    promoId: string;
    kind: 'logo' | 'music' | 'voiceover' | 'broll' | 'render' | 'poster';
    localPath: string;
    name: string;
    mime: string;
    meta?: Record<string, unknown>;
    width?: number;
    height?: number;
    duration?: number;
  },
): Promise<{ url: string; storagePath: string; id: string }> {
  const buffer = await fs.readFile(args.localPath);
  const storagePath = `${args.courseId}/${args.promoId}/${args.kind}-${Date.now()}-${args.name}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, new Uint8Array(buffer), { contentType: args.mime, upsert: true });
  if (error) throw new Error(`تعذّر رفع ${args.name}: ${error.message}`);

  const url = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;

  const { data: row } = await supabase
    .from('promo_assets')
    .insert({
      promo_id: args.promoId,
      course_id: args.courseId,
      kind: args.kind,
      url,
      storage_path: storagePath,
      mime: args.mime,
      file_size: buffer.byteLength,
      width: args.width ?? null,
      height: args.height ?? null,
      duration: args.duration ?? null,
      meta: args.meta ?? {},
    })
    .select('id')
    .single();

  return { url, storagePath, id: row?.id ?? '' };
}

async function saveScenes(supabase: Client, promoId: string, timeline: Timeline): Promise<void> {
  const rows = timeline.scenes.map((s) => ({
    promo_id: promoId,
    scene_index: s.index,
    beat: s.beat,
    source_kind: s.sourceKind,
    media_id: s.mediaId,
    duration: s.duration,
    motion: s.motion as unknown as Record<string, unknown>,
    transition: s.transitionIn as unknown as Record<string, unknown>,
    texts: s.texts as unknown as Record<string, unknown>,
    narration: s.narration,
    status: 'ready' as const,
  }));

  await supabase.from('promo_scenes').delete().eq('promo_id', promoId);
  await supabase.from('promo_scenes').insert(rows);
}

/** بناء صفوف الـ Storyboard للعرض قبل الإنتاج */
export function storyboardFor(
  timeline: Timeline,
  thumbnails: Record<string, string>,
) {
  return toStoryboard(timeline, thumbnails);
}
