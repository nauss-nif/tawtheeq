'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { enqueueJob, cancelPendingJobs, getProgress } from '@/lib/promo/jobs';
import { loadCourseContext } from '@/lib/promo/pipeline';
import { prepareNarration, targetWordCount } from '@/lib/promo/script';
import { validateSettings } from '@/lib/promo/defaults';
import { analyzeCourseMedia, selectMaterials } from '@/lib/promo/analyze';
import { buildStoryPlan } from '@/lib/promo/story';
import { buildTimeline, toStoryboard } from '@/lib/promo/timeline';
import { getStyle } from '@/lib/promo/styles';
import { suggestLexiconTerms } from '@/lib/promo/pronounce';
import { providerStatuses } from '@/lib/promo/providers';
import type { PromoSettings, RenderOrientation } from '@/lib/promo/types';

// --------------------------------------------------------------------------
// إنشاء وتحديث
// --------------------------------------------------------------------------

export interface CreatePromoInput {
  courseId: string;
  settings: PromoSettings;
  openingText: string;
  closingText: string;
  narrationText: string;
  title?: string;
}

/**
 * ينشئ برومو جديدًا ويضعه في الطابور.
 * إذا اختار المستخدم مراجعة الـ Storyboard، تُنفَّذ مرحلة التحليل فقط أولًا.
 */
export async function createPromoAction(input: CreatePromoInput) {
  const { userId } = await requireProfile();
  const supabase = createClient();

  const errors = validateSettings(input.settings);
  if (errors.length) return { error: errors[0] };

  const { data: course } = await supabase
    .from('courses')
    .select('id, title')
    .eq('id', input.courseId)
    .single();
  if (!course) return { error: 'البرنامج غير موجود' };

  // رقم الإصدار التالي لهذا البرنامج
  const { data: last } = await supabase
    .from('promos')
    .select('version')
    .eq('course_id', input.courseId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = (last?.version ?? 0) + 1;

  const { data: promo, error } = await supabase
    .from('promos')
    .insert({
      course_id: input.courseId,
      created_by: userId,
      version,
      title: input.title?.trim() || `برومو ${course.title} — إصدار ${version}`,
      status: 'queued',
      settings: input.settings,
      opening_text: input.openingText.trim() || null,
      closing_text: input.closingText.trim() || null,
      narration_text: input.narrationText.trim() || null,
      narration_source: input.narrationText.trim() ? 'user' : 'ai',
      progress: 0,
      stage_label: 'في الطابور',
    })
    .select('id')
    .single();

  if (error || !promo) return { error: `تعذّر إنشاء البرومو: ${error?.message ?? ''}` };

  await enqueueJob(supabase, {
    promoId: promo.id,
    type: input.settings.skipStoryboard ? 'render' : 'analyze',
  });

  revalidatePath(`/dashboard/courses/${input.courseId}`);
  return { success: true, promoId: promo.id };
}

/** تحديث إعدادات برومو قائم (قبل الإنتاج أو عند التعديل بعد المعاينة) */
export async function updatePromoAction(
  promoId: string,
  patch: {
    settings?: PromoSettings;
    openingText?: string;
    closingText?: string;
    narrationText?: string;
    title?: string;
  },
) {
  await requireProfile();
  const supabase = createClient();

  if (patch.settings) {
    const errors = validateSettings(patch.settings);
    if (errors.length) return { error: errors[0] };
  }

  const { data: promo } = await supabase
    .from('promos')
    .select('course_id')
    .eq('id', promoId)
    .single();
  if (!promo) return { error: 'البرومو غير موجود' };

  const { error } = await supabase
    .from('promos')
    .update({
      ...(patch.settings ? { settings: patch.settings } : {}),
      ...(patch.openingText !== undefined ? { opening_text: patch.openingText.trim() || null } : {}),
      ...(patch.closingText !== undefined ? { closing_text: patch.closingText.trim() || null } : {}),
      ...(patch.narrationText !== undefined
        ? { narration_text: patch.narrationText.trim() || null }
        : {}),
      ...(patch.title ? { title: patch.title } : {}),
    })
    .eq('id', promoId);

  if (error) return { error: 'تعذّر حفظ التعديلات' };

  revalidatePath(`/dashboard/courses/${promo.course_id}`);
  return { success: true };
}

/** اعتماد الـ Storyboard وبدء الإنتاج */
export async function approveStoryboardAction(promoId: string) {
  await requireProfile();
  const supabase = createClient();

  const { data: promo } = await supabase
    .from('promos')
    .select('course_id')
    .eq('id', promoId)
    .single();
  if (!promo) return { error: 'البرومو غير موجود' };

  await supabase
    .from('promos')
    .update({ status: 'queued', progress: 0, stage_label: 'في الطابور', error: null })
    .eq('id', promoId);

  await enqueueJob(supabase, { promoId, type: 'render' });
  revalidatePath(`/dashboard/courses/${promo.course_id}`);
  return { success: true };
}

/** إعادة توليد مشهد واحد فقط — لا يُعاد بناء الفيديو من الصفر */
export async function regenerateSceneAction(promoId: string, sceneIndex: number) {
  await requireProfile();
  const supabase = createClient();

  const { data: promo } = await supabase
    .from('promos')
    .select('course_id, status')
    .eq('id', promoId)
    .single();
  if (!promo) return { error: 'البرومو غير موجود' };

  await supabase
    .from('promos')
    .update({
      status: 'rendering',
      progress: 0,
      stage_label: `إعادة توليد المشهد ${sceneIndex + 1}`,
      error: null,
    })
    .eq('id', promoId);

  await enqueueJob(supabase, { promoId, type: 'scene', payload: { sceneIndex } });
  revalidatePath(`/dashboard/courses/${promo.course_id}`);
  return { success: true };
}

/**
 * تعديل مشهد (صورة/نص/مدة/حركة/انتقال) دون إعادة الإنتاج كاملًا.
 * التعديلات تُحفظ كـ overrides ويُعاد بناء المشهد المعني فقط.
 */
export async function updateSceneAction(
  promoId: string,
  sceneIndex: number,
  patch: {
    mediaId?: string | null;
    duration?: number;
    text?: string;
    motionType?: string;
    transitionType?: string;
    narration?: string;
  },
) {
  await requireProfile();
  const supabase = createClient();

  const { data: promo } = await supabase
    .from('promos')
    .select('course_id, storyboard')
    .eq('id', promoId)
    .single();
  if (!promo) return { error: 'البرومو غير موجود' };

  const storyboard = (promo.storyboard ?? {}) as { overrides?: Record<string, unknown> };
  const overrides = { ...(storyboard.overrides ?? {}) };
  overrides[String(sceneIndex)] = { ...(overrides[String(sceneIndex)] as object), ...patch };

  await supabase
    .from('promos')
    .update({ storyboard: { ...storyboard, overrides } })
    .eq('id', promoId);

  await supabase
    .from('promo_scenes')
    .update({ overrides: patch, status: 'planned' })
    .eq('promo_id', promoId)
    .eq('scene_index', sceneIndex);

  revalidatePath(`/dashboard/courses/${promo.course_id}`);
  return { success: true };
}

/** إنشاء إصدار جديد من برومو قائم بالإعدادات نفسها (يحفظ الإصدار السابق) */
export async function duplicatePromoAction(promoId: string) {
  const { userId } = await requireProfile();
  const supabase = createClient();

  const { data: src } = await supabase.from('promos').select('*').eq('id', promoId).single();
  if (!src) return { error: 'البرومو غير موجود' };

  const { data: last } = await supabase
    .from('promos')
    .select('version')
    .eq('course_id', src.course_id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = (last?.version ?? 0) + 1;

  const { data: copy, error } = await supabase
    .from('promos')
    .insert({
      course_id: src.course_id,
      created_by: userId,
      parent_promo_id: src.id,
      version,
      title: `${src.title.replace(/ — إصدار \d+$/, '')} — إصدار ${version}`,
      status: 'draft',
      settings: src.settings,
      opening_text: src.opening_text,
      closing_text: src.closing_text,
      narration_text: src.narration_text,
      narration_source: src.narration_source,
    })
    .select('id')
    .single();

  if (error || !copy) return { error: 'تعذّر إنشاء الإصدار الجديد' };

  revalidatePath(`/dashboard/courses/${src.course_id}`);
  return { success: true, promoId: copy.id };
}

export async function deletePromoAction(promoId: string) {
  await requireProfile();
  const supabase = createClient();

  const { data: promo } = await supabase
    .from('promos')
    .select('course_id')
    .eq('id', promoId)
    .single();
  if (!promo) return { error: 'البرومو غير موجود' };

  await cancelPendingJobs(supabase, promoId);

  // حذف ملفات التخزين المرتبطة قبل حذف السجل
  const { data: assets } = await supabase
    .from('promo_assets')
    .select('storage_path')
    .eq('promo_id', promoId);

  const paths = (assets ?? []).map((a) => a.storage_path).filter(Boolean) as string[];
  if (paths.length) await supabase.storage.from('promo').remove(paths);

  await supabase.from('promos').delete().eq('id', promoId);

  revalidatePath(`/dashboard/courses/${promo.course_id}`);
  return { success: true };
}

// --------------------------------------------------------------------------
// النص والمعاينة
// --------------------------------------------------------------------------

/**
 * توليد أو تحسين نص التعليق الصوتي لعرضه في الواجهة قبل الإنتاج.
 * سريع بما يكفي لطلب HTTP (لا يشمل تحليل الوسائط الثقيل).
 */
export async function generateScriptAction(input: {
  courseId: string;
  settings: PromoSettings;
  userText: string;
  enhance: boolean;
  openingText: string;
  closingText: string;
}) {
  await requireProfile();
  const supabase = createClient();

  try {
    const course = await loadCourseContext(supabase, input.courseId);

    // نستخدم التحليل المخزّن فقط — لا نُشغّل تحليلًا جديدًا داخل الطلب
    const { data: cached } = await supabase
      .from('media_analysis')
      .select('media_id, score')
      .eq('course_id', input.courseId);

    const analyses = (cached ?? []).map((c) => ({
      mediaId: c.media_id,
      type: 'image' as const,
      url: '',
      metrics: {} as never,
      phash: '',
      labels: [],
      focus: { x: 0.5, y: 0.5, confidence: 0 },
      score: Number(c.score),
      beatAffinity: {},
      engine: 'cached',
    }));

    const result = await prepareNarration({
      course,
      userText: input.userText || null,
      enhance: input.enhance,
      duration: input.settings.duration,
      style: input.settings.style,
      voice: input.settings.voice,
      analyses,
      openingText: input.openingText || null,
      closingText: input.closingText || null,
    });

    return {
      success: true,
      text: result.text,
      source: result.source,
      targetWords: result.targetWords,
      actualWords: result.actualWords,
      warnings: result.warnings,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** عدد الكلمات المناسب للمدة والسرعة الحاليتين — يُعرض تحت حقل النص */
export async function wordBudgetAction(settings: PromoSettings) {
  await requireProfile();
  return { targetWords: targetWordCount(settings.duration, settings.voice) };
}

/**
 * معاينة الـ Storyboard قبل الإنتاج — تعتمد على التحليل المخزّن إن وُجد،
 * وإلا تُشغّل تحليلًا كاملًا (قد يستغرق وقتًا مع عدد كبير من الصور).
 */
export async function previewStoryboardAction(input: {
  courseId: string;
  settings: PromoSettings;
  orientation: RenderOrientation;
  openingText: string;
  closingText: string;
}) {
  await requireProfile();
  const supabase = createClient();

  try {
    const course = await loadCourseContext(supabase, input.courseId);
    const analyses = await analyzeCourseMedia(supabase, { courseId: input.courseId });
    if (!analyses.length) return { error: 'لا توجد مواد مكتملة المعالجة في هذا البرنامج.' };

    const style = getStyle(input.settings.style);
    const sceneBudget = Math.max(4, Math.round(input.settings.duration / style.avgShotLength));
    const selection = selectMaterials(analyses, {
      sceneBudget,
      includeIds: input.settings.includeMediaIds,
      excludeIds: input.settings.excludeMediaIds,
    });

    const plan = buildStoryPlan({
      course,
      analyses: selection.selected,
      duration: input.settings.duration,
      style: input.settings.style,
      allowBRoll: input.settings.allowGeneratedBRoll,
    });

    const timeline = buildTimeline({
      plan,
      settings: input.settings,
      course,
      orientation: input.orientation,
      openingText: input.openingText || null,
      closingText: input.closingText || null,
      narration: [],
    });

    // مصغّرات المواد لعرضها في الـ Storyboard
    const { data: media } = await supabase
      .from('media')
      .select('id, thumbnail_url')
      .eq('course_id', input.courseId);

    const thumbs = Object.fromEntries(
      (media ?? []).map((m) => [m.id, m.thumbnail_url ?? '']),
    ) as Record<string, string>;

    return {
      success: true,
      rows: toStoryboard(timeline, thumbs),
      rationale: plan.rationale,
      stats: selection.stats,
      totalDuration: timeline.totalDuration,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * متابعة تقدّم الإنتاج (تُستدعى دوريًا من الواجهة).
 * الشكل مُميَّز صراحةً بـ `ok` لأن حالة التقدّم نفسها تحمل حقل `error`
 * (رسالة فشل الإنتاج) فلا يصلح وجوده للتمييز بين النجاح والفشل.
 */
export async function promoProgressAction(promoId: string) {
  await requireProfile();
  const supabase = createClient();
  const progress = await getProgress(supabase, promoId);
  if (!progress) return { ok: false as const, error: 'البرومو غير موجود' };
  return { ok: true as const, ...progress };
}

// --------------------------------------------------------------------------
// قاموس النطق
// --------------------------------------------------------------------------

export async function addPronunciationAction(
  courseId: string,
  term: string,
  phonetic: string,
) {
  const { userId } = await requireProfile();
  const supabase = createClient();

  if (!term.trim() || !phonetic.trim()) return { error: 'أدخل الكلمة ونطقها.' };

  const { error } = await supabase.from('promo_pronunciations').upsert(
    {
      course_id: courseId,
      term: term.trim(),
      phonetic: phonetic.trim(),
      lang: 'ar',
      created_by: userId,
    },
    { onConflict: 'course_id,term,lang' },
  );

  if (error) return { error: 'تعذّر حفظ النطق' };
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { success: true };
}

export async function deletePronunciationAction(id: string, courseId: string) {
  await requireProfile();
  const supabase = createClient();
  await supabase.from('promo_pronunciations').delete().eq('id', id);
  revalidatePath(`/dashboard/courses/${courseId}`);
  return { success: true };
}

/** كلمات مرشّحة لقاموس النطق مستخرجة من نصوص البرنامج */
export async function suggestPronunciationsAction(courseId: string) {
  await requireProfile();
  const supabase = createClient();

  const course = await loadCourseContext(supabase, courseId);
  const terms = suggestLexiconTerms([
    course.title,
    course.description,
    course.location,
    ...course.trainers,
    ...course.sessions.map((s) => s.title),
  ]);

  const { data: existing } = await supabase
    .from('promo_pronunciations')
    .select('term')
    .eq('course_id', courseId);

  const known = new Set((existing ?? []).map((e) => e.term));
  return { terms: terms.filter((t) => !known.has(t)) };
}

// --------------------------------------------------------------------------
// حالة المزوّدين
// --------------------------------------------------------------------------

/** تُعرض في الاستوديو ليعرف المستخدم ما المتاح فعليًا وما البديل عند الغياب */
export async function providerStatusAction() {
  await requireProfile();
  return { statuses: providerStatuses() };
}
