/**
 * مزوّد الموسيقى — مكتبة المنصة المخزّنة في دلو `promo`.
 *
 * المقاطع يرفعها المدير من لوحة الإدارة إلى `promo_library`، فيصل المزوّد
 * إلى الرابط العام مباشرة. الملف الذي يرفعه المنسق لبرومو بعينه يمرّ بالمسار
 * نفسه، فلا فرق في المعالجة بعد التنزيل.
 */

import { promises as fs } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import { publicEnv, serverEnv } from '@/lib/env';
import type { MusicProvider } from '../types';

ffmpeg.setFfprobePath(serverEnv.ffprobePath);

export const storageMusic: MusicProvider = {
  id: 'storage',
  kind: 'music',
  isConfigured: () => Boolean(publicEnv.supabaseUrl),

  async hasTrack(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  },

  /** `ref` رابط عام لملف صوتي (من مكتبة المنصة أو من رفع المنسق) */
  async fetchTrack(ref: string, destPath: string) {
    const res = await fetch(ref);
    if (!res.ok) {
      throw new Error(`تعذّر تحميل المقطع الموسيقي (${res.status})`);
    }
    await fs.writeFile(destPath, Buffer.from(await res.arrayBuffer()));
    return { path: destPath, duration: await audioDuration(destPath) };
  },
};

/** تنزيل ملف موسيقي رفعه المستخدم (رابط عام في دلو promo) */
export async function fetchUploadedMusic(url: string, destPath: string) {
  return storageMusic.fetchTrack(url, destPath);
}

export function audioDuration(file: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(file, (err, data) => resolve(err ? 0 : data.format.duration ?? 0));
  });
}

/**
 * استخراج شبكة الإيقاع (Beat grid) من ملف الموسيقى.
 *
 * نستخدم كشف بدايات الطاقة الصوتية عبر ffmpeg: نستخرج غلاف الطاقة بمعدّل
 * منخفض ثم نرصد القفزات. النتيجة ليست تحليلًا موسيقيًا كاملًا، لكنها كافية
 * لمحاذاة القطع مع النبض — وهو الغرض.
 */
export async function detectBeats(file: string, maxSeconds: number): Promise<number[]> {
  const raw = await energyEnvelope(file, maxSeconds);
  if (raw.length < 8) return [];

  // متوسط متحرّك لتنعيم الغلاف
  const win = 4;
  const smooth = raw.map((_, i) => {
    const from = Math.max(0, i - win);
    const slice = raw.slice(from, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });

  const beats: number[] = [];
  const step = maxSeconds / raw.length;
  let lastBeat = -1;

  for (let i = 2; i < raw.length - 1; i++) {
    const rise = raw[i] - smooth[i];
    const isPeak = raw[i] > raw[i - 1] && raw[i] >= raw[i + 1];
    const t = i * step;
    // فاصل أدنى ٢٥٠ مللي ثانية بين ضربتين (≈ ٢٤٠ نبضة/دقيقة كحدّ أقصى)
    if (isPeak && rise > 0.045 && t - lastBeat > 0.25) {
      beats.push(Math.round(t * 100) / 100);
      lastBeat = t;
    }
  }
  return beats;
}

/** غلاف الطاقة: قيم RMS بمعدّل ~٢٠ عيّنة/ثانية */
function energyEnvelope(file: string, maxSeconds: number): Promise<number[]> {
  return new Promise((resolve) => {
    const values: number[] = [];
    ffmpeg(file)
      .outputOptions([
        '-t', String(maxSeconds),
        '-af', 'aresample=8000,asetnsamples=400,astats=metadata=1:reset=1',
        '-f', 'null',
      ])
      .on('stderr', (line: string) => {
        const m = /RMS_level.*?:\s*(-?\d+(?:\.\d+)?)/.exec(line);
        if (m) {
          const db = Number(m[1]);
          // تحويل الديسيبل إلى مقياس خطّي 0..1
          values.push(Math.max(0, Math.min(1, (db + 60) / 60)));
        }
      })
      .on('end', () => resolve(values))
      .on('error', () => resolve([]))
      .saveToFile(process.platform === 'win32' ? 'NUL' : '/dev/null');
  });
}
