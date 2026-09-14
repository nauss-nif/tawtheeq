/**
 * سجل المزوّدين — نقطة الاختيار الوحيدة في النظام.
 *
 * أي طبقة أخرى تطلب «مزوّد التعليق الصوتي» ولا تعرف من هو. تغيير المزوّد
 * يتم من متغيّرات البيئة فقط، أو بإضافة adapter وتسجيله هنا.
 */

import { serverEnv } from '@/lib/env';
import { elevenLabsTts } from './tts/elevenlabs';
import { openAiTts } from './tts/openai';
import { llmProvider } from './llm';
import { localAnalysis } from './analysis/local';
import { motionI2v, replicateI2v } from './i2v';
import { replicateGenVideo } from './genvideo';
import { storageMusic } from './music';
import { ffmpegRender } from './render/ffmpeg';
import type {
  AnalysisProvider, GenVideoProvider, I2vProvider, LlmProvider,
  MusicProvider, RenderProvider, TtsProvider,
} from './types';

const TTS: Record<string, TtsProvider> = {
  elevenlabs: elevenLabsTts,
  openai: openAiTts,
};

const I2V: Record<string, I2vProvider> = {
  motion: motionI2v,
  replicate: replicateI2v,
};

/** مزوّد التعليق الصوتي الفعّال، أو null إن لم يُعدّ أي منها */
export function getTtsProvider(): TtsProvider | null {
  const pref = serverEnv.promo.ttsProvider;
  if (pref !== 'auto') {
    const p = TTS[pref];
    return p?.isConfigured() ? p : null;
  }
  return [elevenLabsTts, openAiTts].find((p) => p.isConfigured()) ?? null;
}

/** مزوّد تحريك الصور — المحرّك المدمج متاح دائمًا كخيار أخير */
export function getI2vProvider(): I2vProvider {
  const pref = serverEnv.promo.i2vProvider;
  const chosen = I2V[pref];
  if (chosen?.isConfigured()) return chosen;
  return motionI2v;
}

/** مولّد المشاهد المساندة — null يعني أن الميزة معطّلة */
export function getGenVideoProvider(): GenVideoProvider | null {
  return replicateGenVideo.isConfigured() ? replicateGenVideo : null;
}

export function getRenderProvider(): RenderProvider {
  // مساحة لإضافة محرّك رندر سحابي مستقبلًا دون لمس بقية النظام
  return ffmpegRender;
}

export function getAnalysisProvider(): AnalysisProvider {
  return localAnalysis;
}

export function getMusicProvider(): MusicProvider {
  return storageMusic;
}

export function getLlmProvider(): LlmProvider | null {
  return llmProvider.isConfigured() ? llmProvider : null;
}

/** حالة كل المزوّدين — تُعرض في الواجهة ولوحة المدير للتشخيص */
export interface ProviderStatus {
  kind: string;
  label: string;
  provider: string | null;
  configured: boolean;
  /** ماذا يحدث عند غيابه */
  fallback: string;
}

export function providerStatuses(): ProviderStatus[] {
  const tts = getTtsProvider();
  const gen = getGenVideoProvider();
  const llm = getLlmProvider();
  const i2v = getI2vProvider();

  return [
    {
      kind: 'tts',
      label: 'التعليق الصوتي',
      provider: tts?.id ?? null,
      configured: Boolean(tts),
      fallback: 'يُنتج البرومو بالموسيقى فقط، مع إظهار النص على الشاشة.',
    },
    {
      kind: 'llm',
      label: 'كتابة النصوص',
      provider: llm?.id ?? null,
      configured: Boolean(llm),
      fallback: 'يُبنى النص من بيانات البرنامج مباشرة دون صياغة إبداعية.',
    },
    {
      kind: 'i2v',
      label: 'تحريك الصور',
      provider: i2v.id,
      configured: true,
      fallback: 'المحرّك المدمج (حركة كاميرا ٢٫٥ أبعاد) متاح دائمًا.',
    },
    {
      kind: 'genvideo',
      label: 'المشاهد المساندة المولّدة',
      provider: gen?.id ?? null,
      configured: Boolean(gen),
      fallback: 'تُستخدم أفضل مادة متاحة كلقطة افتتاحية بدل التوليد.',
    },
    {
      kind: 'render',
      label: 'محرّك الإخراج',
      provider: getRenderProvider().id,
      configured: true,
      fallback: '—',
    },
    {
      kind: 'analysis',
      label: 'تحليل المواد',
      provider: getAnalysisProvider().id,
      configured: true,
      fallback: '—',
    },
    {
      kind: 'music',
      label: 'مكتبة الموسيقى',
      provider: getMusicProvider().id,
      configured: getMusicProvider().isConfigured(),
      fallback: 'يمكن للمستخدم رفع ملف موسيقي خاص به.',
    },
  ];
}

export * from './types';
