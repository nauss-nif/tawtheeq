/**
 * تحريك الصور (Image → Video).
 *
 * مزوّدان:
 *  - `motion`: المحرّك المدمج (حركة كاميرا ٢٫٥ أبعاد عبر ffmpeg). متاح دائمًا،
 *    ويحافظ على الصورة الأصلية تمامًا: لا يولّد بكسلات جديدة ولا يغيّر الملامح.
 *  - `replicate`: مزوّد توليدي (Image-to-Video) يُستخدم عند تهيئته وطلبه.
 *
 * التحريك المولّد لا يُستخدم على صور الأشخاص افتراضيًا، حفاظًا على مصداقية
 * التوثيق: النماذج التوليدية قد تغيّر الملامح والملابس والبيئة.
 */

import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import { serverEnv } from '@/lib/env';
import type { I2vProvider, I2vRequest, I2vResult } from '../types';

ffmpeg.setFfmpegPath(serverEnv.ffmpegPath);

/** المحرّك المدمج — لا يحتاج أي مفتاح ولا يغادر الخادم */
export const motionI2v: I2vProvider = {
  id: 'motion',
  kind: 'i2v',
  isConfigured: () => true,

  async animate(req: I2vRequest): Promise<I2vResult> {
    // التنفيذ الفعلي للحركة يتم داخل محرّك الرندر ضمن سلسلة مرشّحات المشهد
    // (zoompan على نسخة مُعاد تأطيرها). هنا نوفّر مسارًا مستقلًا يُستخدم
    // لمعاينة مشهد واحد دون بناء الفيديو كلّه.
    const out = path.join(path.dirname(req.imagePath), `motion-${Date.now()}.mp4`);
    const frames = Math.max(2, Math.round(req.duration * req.fps));
    const I = Math.max(0, Math.min(1, req.motion.intensity));
    const p = `(on/${Math.max(1, frames - 1)})`;
    const ease = `(3*pow(${p}\\,2)-2*pow(${p}\\,3))`;

    await new Promise<void>((resolve, reject) => {
      ffmpeg(req.imagePath)
        .videoFilters(
          [
            `scale=${Math.round(req.width * 1.6)}:${Math.round(req.height * 1.6)}` +
              `:force_original_aspect_ratio=increase:flags=lanczos`,
            `crop=${Math.round(req.width * 1.6)}:${Math.round(req.height * 1.6)}` +
              `:'max(0\\,min(iw-ow\\,iw*${req.motion.focus.x.toFixed(4)}-ow/2))'` +
              `:'max(0\\,min(ih-oh\\,ih*${req.motion.focus.y.toFixed(4)}-oh/2))'`,
            `zoompan=z='1+${(0.12 * I).toFixed(4)}*${ease}'` +
              `:x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'` +
              `:d=${frames}:s=${req.width}x${req.height}:fps=${req.fps}`,
            'format=yuv420p',
          ].join(','),
        )
        .outputOptions([`-frames:v ${frames}`, '-c:v libx264', '-crf 18', '-preset veryfast'])
        .on('end', () => resolve())
        .on('error', reject)
        .save(out);
    });

    return { videoPath: out, provider: 'motion', generated: false };
  },
};

/** مزوّد توليدي عبر Replicate — يُفعَّل عند ضبط المفتاح واسم النموذج */
export const replicateI2v: I2vProvider = {
  id: 'replicate',
  kind: 'i2v',

  isConfigured() {
    return Boolean(serverEnv.promo.replicateApiToken && serverEnv.promo.replicateI2vModel);
  },

  async animate(req: I2vRequest): Promise<I2vResult> {
    if (!replicateI2v.isConfigured()) throw new Error('مزوّد تحريك الصور غير مُعدّ');

    const imageData = await fs.readFile(req.imagePath);
    const dataUri = `data:image/jpeg;base64,${imageData.toString('base64')}`;

    const url = await runReplicate(serverEnv.promo.replicateI2vModel, {
      image: dataUri,
      prompt: req.prompt ?? cameraPrompt(req),
      num_frames: Math.round(req.duration * req.fps),
      fps: req.fps,
    });

    const out = path.join(path.dirname(req.imagePath), `gen-${Date.now()}.mp4`);
    await downloadFile(url, out);
    return { videoPath: out, provider: 'replicate', generated: true };
  },
};

function cameraPrompt(req: I2vRequest): string {
  const map: Record<string, string> = {
    slow_zoom_in: 'slow cinematic push in, subtle parallax, locked subject',
    push_in: 'smooth dolly in, shallow depth of field',
    pull_out: 'slow dolly out revealing the scene',
    pan_left: 'slow cinematic pan to the left',
    pan_right: 'slow cinematic pan to the right',
    parallax: 'gentle 2.5D parallax, foreground separates from background',
  };
  return (
    `${map[req.motion.type] ?? 'subtle cinematic camera move'}. ` +
    'Preserve every person, face, clothing, logo and the original environment exactly. ' +
    'No new people, no new objects, no style change. Photorealistic documentary footage.'
  );
}

// --------------------------------------------------------------------------
// أدوات Replicate المشتركة
// --------------------------------------------------------------------------

export async function runReplicate(
  model: string,
  input: Record<string, unknown>,
): Promise<string> {
  const token = serverEnv.promo.replicateApiToken;
  const create = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      prefer: 'wait=60',
    },
    body: JSON.stringify({ version: model, input }),
  });

  if (!create.ok) {
    const detail = await create.text().catch(() => '');
    throw new Error(`تعذّر بدء التوليد (${create.status}) ${detail.slice(0, 200)}`);
  }

  let prediction = await create.json();
  const deadline = Date.now() + 10 * 60 * 1000;

  while (['starting', 'processing'].includes(prediction.status)) {
    if (Date.now() > deadline) throw new Error('انتهت مهلة التوليد');
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await fetch(prediction.urls.get, {
      headers: { authorization: `Bearer ${token}` },
    });
    prediction = await poll.json();
  }

  if (prediction.status !== 'succeeded') {
    throw new Error(`فشل التوليد: ${prediction.error ?? prediction.status}`);
  }

  const output = prediction.output;
  const url = Array.isArray(output) ? output[output.length - 1] : output;
  if (typeof url !== 'string') throw new Error('استجابة توليد غير متوقّعة');
  return url;
}

export async function downloadFile(url: string, dest: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`تعذّر تنزيل الناتج (${res.status})`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}
