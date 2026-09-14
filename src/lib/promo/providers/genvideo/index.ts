/**
 * مولّد المشاهد السينمائية المساندة (AI Cinematic B-Roll).
 *
 * حدود أخلاقية مفروضة في الشيفرة لا في التعليمات فقط:
 *  - يُسمح فقط بلقطات بيئية/معمارية/جوية للموقع (Establishing shots).
 *  - يُمنع توليد أشخاص محدّدين أو أنشطة تدريبية توحي بأنها توثيق حقيقي.
 *  - كل ناتج يُوسم `generated: true` ويُحفظ في بيانات الأصل، ليظل واضحًا
 *    أنه مشهد مساند إبداعي لا توثيق لحدث وقع.
 */

import path from 'path';
import os from 'os';
import { serverEnv } from '@/lib/env';
import { runReplicate, downloadFile } from '../i2v';
import type { BRollKind, BRollRequest, BRollResult, GenVideoProvider } from '../types';

/** عبارات محظورة في الموجّه — تمنع اختلاق أشخاص أو أنشطة */
const NEGATIVE =
  'people, faces, crowds, portraits, participants, students, trainers, classroom, ' +
  'workshop, lecture, ceremony, graduation, handshake, uniforms, badges, text, logos, ' +
  'watermark, subtitles, distorted architecture';

const KIND_PROMPTS: Record<BRollKind, string> = {
  aerial_establishing:
    'cinematic aerial drone establishing shot, slow forward flight, golden hour, high altitude',
  city_establishing:
    'cinematic city establishing shot, wide skyline, slow lateral drone movement, clear day',
  exterior_building:
    'cinematic exterior architectural shot, slow upward tilt, modern institutional building, clean lines',
  landscape:
    'cinematic landscape establishing shot, slow parallax push, natural light, wide vista',
  environment:
    'cinematic environmental b-roll, shallow depth of field, slow drift, ambient natural detail',
  location_transition:
    'cinematic transitional shot, slow move through open space, soft light, no subjects',
};

const STYLE_LOOK: Record<string, string> = {
  cinematic: 'anamorphic film look, muted teal shadows, gentle film grain, 2.39 aspect feel',
  institutional: 'clean neutral color, balanced exposure, corporate documentary look',
  dynamic: 'high contrast, saturated color, energetic camera motion',
  documentary: 'natural color, handheld subtlety, observational documentary look',
  premium: 'rich warm highlights, deep shadows, luxury commercial look, very slow motion',
  modern: 'crisp clean grade, cool highlights, smooth gimbal movement',
};

export const replicateGenVideo: GenVideoProvider = {
  id: 'replicate',
  kind: 'genvideo',

  isConfigured() {
    return Boolean(
      serverEnv.promo.genVideoProvider &&
        serverEnv.promo.replicateApiToken &&
        serverEnv.promo.replicateGenVideoModel,
    );
  },

  async generate(req: BRollRequest): Promise<BRollResult> {
    if (!replicateGenVideo.isConfigured()) {
      throw new Error('مزوّد المشاهد المولّدة غير مُعدّ');
    }

    const prompt = buildPrompt(req);

    const url = await runReplicate(serverEnv.promo.replicateGenVideoModel, {
      prompt,
      negative_prompt: NEGATIVE,
      aspect_ratio: req.orientation === 'vertical' ? '9:16' : '16:9',
      duration: Math.min(10, Math.max(3, Math.round(req.duration))),
      resolution: req.orientation === 'vertical' ? '1080x1920' : '1920x1080',
    });

    const out = path.join(os.tmpdir(), `broll-${Date.now()}.mp4`);
    await downloadFile(url, out);

    return { videoPath: out, provider: 'replicate', prompt, generated: true };
  },
};

/**
 * بناء الموجّه: نوع اللقطة + الموقع كما هو مسجّل في بيانات البرنامج + مظهر النمط.
 * الموقع يُذكر كمكان جغرافي عام فقط (مثال: لقطة جوية لمدينة باكو).
 */
function buildPrompt(req: BRollRequest): string {
  const base = KIND_PROMPTS[req.kind];
  const look = STYLE_LOOK[req.style] ?? STYLE_LOOK.cinematic;
  const place = req.location?.trim();

  return [
    base,
    place ? `location: ${place}` : 'generic institutional setting',
    look,
    'no people, no text, photorealistic, 24fps cinematic motion',
  ].join(', ');
}

/**
 * اختيار نوع اللقطة المساندة المناسب للموقع.
 * وجود اسم مدينة يرجّح اللقطة الجوية/المدينية؛ وغيابه يرجّح لقطة بيئية محايدة.
 */
export function chooseBRollKind(location: string | null): BRollKind {
  if (!location?.trim()) return 'environment';
  const l = location.toLowerCase();
  if (/(جامعة|مركز|معهد|أكاديمية|قاعة|مقر|university|center|centre|academy|institute)/.test(l)) {
    return 'exterior_building';
  }
  return 'aerial_establishing';
}
