import ffmpeg from 'fluent-ffmpeg';
import { serverEnv } from '@/lib/env';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

ffmpeg.setFfmpegPath(serverEnv.ffmpegPath);
ffmpeg.setFfprobePath(serverEnv.ffprobePath);

export interface ProcessedVideo {
  videoPath: string; // ملف mp4 المضغوط
  thumbPath: string; // صورة مصغرة png
  duration: number; // بالثواني
  size: number; // حجم الفيديو الناتج
}

/** استخراج مدة الفيديو */
function probeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, data) => {
      if (err) return reject(err);
      resolve(data.format.duration ?? 0);
    });
  });
}

/**
 * ضغط ذكي للفيديو:
 * - 1080p H.264, CRF 26 (معدل بت متغير)
 * - خفض تلقائي إلى 720p إذا تجاوز الناتج 100MB
 * - thumbnail من أول لقطة واضحة (بعد ثانية واحدة)
 */
export async function processVideo(inputPath: string): Promise<ProcessedVideo> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tawtheeq-'));
  const outPath = path.join(dir, 'out.mp4');
  const thumbPath = path.join(dir, 'thumb.png');
  const duration = await probeDuration(inputPath);

  await encode(inputPath, outPath, 1080);
  let { size } = await fs.stat(outPath);

  // إن تجاوز 100MB، أعد الترميز بدقة 720p
  if (size > 100 * 1024 * 1024) {
    await encode(inputPath, outPath, 720);
    size = (await fs.stat(outPath)).size;
  }

  // thumbnail من أول لقطة واضحة
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .screenshots({
        timestamps: [Math.min(1, duration / 2)],
        filename: 'thumb.png',
        folder: dir,
        size: '1280x?',
      });
  });

  return { videoPath: outPath, thumbPath, duration, size };
}

function encode(input: string, output: string, height: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoCodec('libx264')
      .outputOptions([
        '-crf 26',
        '-preset medium',
        `-vf scale=-2:${height}`,
        '-movflags +faststart', // بث تدريجي على الويب
        '-pix_fmt yuv420p',
      ])
      .audioCodec('aac')
      .audioBitrate('128k')
      .on('end', () => resolve())
      .on('error', reject)
      .save(output);
  });
}
