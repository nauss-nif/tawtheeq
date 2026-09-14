/**
 * مزوّد التعليق الصوتي: ElevenLabs.
 * يُختار افتراضيًا عند توفّر المفتاح لجودته العالية في العربية.
 */

import { serverEnv } from '@/lib/env';
import { getVoice } from '../../voices';
import { providerVoiceId } from './voiceIds';
import { applyLexicon, splitSentences } from '../../pronounce';
import type { TtsProvider, TtsRequest, TtsResult } from '../types';

const API = 'https://api.elevenlabs.io/v1';

export const elevenLabsTts: TtsProvider = {
  id: 'elevenlabs',
  kind: 'tts',
  supportsLexicon: false, // يُطبَّق القاموس نصيًا قبل الإرسال

  isConfigured() {
    return Boolean(serverEnv.promo.elevenLabsApiKey);
  },

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const key = serverEnv.promo.elevenLabsApiKey;
    if (!key) throw new Error('مفتاح ElevenLabs غير مُعدّ');

    const voice = getVoice(req.voiceId);
    const vid = providerVoiceId(voice, 'elevenlabs');
    if (!vid) throw new Error(`الصوت ${req.voiceId} غير مربوط بمعرّف لدى المزوّد`);

    // القاموس + الوقفات: تُحوَّل الوقفات إلى فواصل نصية يفهمها المحرّك
    const withLexicon = applyLexicon(req.text, req.lexicon ?? []);
    const text = injectPauses(withLexicon, req.settings.pauseMs);

    const { stability, similarity, style } = mapSettings(req);

    const res = await fetch(`${API}/text-to-speech/${vid}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: serverEnv.promo.elevenLabsModel,
        language_code: req.lang === 'en' ? 'en' : 'ar',
        voice_settings: {
          stability,
          similarity_boost: similarity,
          style,
          use_speaker_boost: true,
          speed: clamp(req.settings.speed, 0.7, 1.2),
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`تعذّر توليد التعليق الصوتي (${res.status}) ${detail.slice(0, 200)}`);
    }

    const audio = Buffer.from(await res.arrayBuffer());
    return {
      audio,
      mime: 'audio/mpeg',
      // المدة الدقيقة تُقاس عبر ffprobe بعد الحفظ؛ هذه قيمة تقديرية أولية
      duration: estimateDuration(text, req.settings.speed),
      provider: 'elevenlabs',
    };
  },
};

/**
 * ربط إعدادات المنصة بمعاملات المزوّد:
 * وضوح النطق ← الثبات، الحماس ← style، النبرة ← تعديل طفيف على الثبات.
 */
function mapSettings(req: TtsRequest) {
  const { clarity, energy, tone } = req.settings;
  let stability = clamp(0.25 + clarity * 0.6, 0.15, 0.9);
  if (tone === 'serious') stability = clamp(stability + 0.08, 0.15, 0.95);
  if (tone === 'warm') stability = clamp(stability - 0.05, 0.1, 0.9);
  return {
    stability,
    similarity: clamp(0.6 + clarity * 0.3, 0.5, 0.95),
    style: clamp(energy, 0, 0.85),
  };
}

/** إدراج وقفات بين الجمل بما يوافق طول الوقفة المطلوب */
function injectPauses(text: string, pauseMs: number): string {
  if (pauseMs <= 260) return text;
  const sentences = splitSentences(text);
  // نقطتان متتاليتان تُطيلان الوقفة لدى المحرّكات العصبية
  const joiner = pauseMs >= 480 ? '\n\n' : '\n';
  return sentences.join(joiner);
}

/** تقدير المدة: العربية ≈ ٢٫٦ كلمة/ثانية عند سرعة ١٫٠ */
function estimateDuration(text: string, speed: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words / (2.6 * Math.max(0.5, speed));
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
