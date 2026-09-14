/**
 * محلّل المواد المحلّي — يعمل دائمًا دون أي مزوّد خارجي.
 *
 * يقيس فعليًا: الحدّة، الإضاءة، التباين، غنى الألوان، الإنتروبيا، اتزان
 * التكوين، ونقطة التركيز البصرية؛ وللفيديو: الحركة والثبات وأفضل نافذة زمنية.
 * ويحسب بصمة إدراكية (dHash) لكشف الصور المتكرّرة.
 */

import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { serverEnv } from '@/lib/env';
import type { AnalysisProvider, AnalysisRequest } from '../types';
import type { FocusPoint, MediaAnalysis, MediaMetrics, StoryBeat } from '../../types';

ffmpeg.setFfmpegPath(serverEnv.ffmpegPath);
ffmpeg.setFfprobePath(serverEnv.ffprobePath);

/** شبكة تحليل التكوين ونقطة التركيز */
const GRID = 16;

export const localAnalysis: AnalysisProvider = {
  id: 'local',
  kind: 'analysis',
  isConfigured: () => true,

  async analyze(req: AnalysisRequest): Promise<MediaAnalysis> {
    const buffer = await loadBuffer(req);

    if (req.type === 'image') {
      const { metrics, focus, phash } = await analyzeImageBuffer(buffer);
      return finalize(req, metrics, focus, phash, []);
    }

    const video = await analyzeVideo(req, buffer);
    return finalize(req, video.metrics, video.focus, video.phash, [], video.bestWindow);
  },
};

// --------------------------------------------------------------------------
// الصور
// --------------------------------------------------------------------------

async function analyzeImageBuffer(buffer: Buffer) {
  const img = sharp(buffer, { failOn: 'none' });
  const meta = await img.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  // إحصاءات القنوات: المتوسط والانحراف المعياري والإنتروبيا
  const stats = await img.stats();
  const channels = stats.channels.slice(0, 3);
  const meanAll = channels.reduce((s, c) => s + c.mean, 0) / channels.length;
  const stdAll = channels.reduce((s, c) => s + c.stdev, 0) / channels.length;

  // الحدّة: طاقة الحواف عبر نواة لابلاسية ثم انحراف الناتج
  const sharpness = await edgeEnergy(buffer);

  // غنى الألوان: انحراف الفروق بين القنوات (مقياس Hasler-Süsstrunk المبسّط)
  const colorfulness = await colorfulnessScore(buffer);

  // خريطة الحواف على شبكة — للتكوين ونقطة التركيز
  const edgeMap = await edgeGrid(buffer);
  const focus = focusFromGrid(edgeMap);
  const composition = compositionScore(edgeMap);

  const metrics: MediaMetrics = {
    width,
    height,
    aspect: width && height ? width / height : 1,
    sharpness,
    brightness: clamp01((meanAll / 255) * 100),
    contrast: clamp01((stdAll / 80) * 100),
    colorfulness,
    entropy: clamp01(((stats.entropy ?? 0) / 8) * 100),
    composition,
  };

  const phash = await dHash(buffer);
  return { metrics, focus, phash };
}

/** طاقة الحواف: نطبّق لابلاسيان ثم نقيس انحراف الاستجابة (0..100) */
async function edgeEnergy(buffer: Buffer): Promise<number> {
  const out = await sharp(buffer, { failOn: 'none' })
    .greyscale()
    .resize(320, 320, { fit: 'inside' })
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
    .stats();
  const stdev = out.channels[0]?.stdev ?? 0;
  // تجريبيًا: انحراف ≥ 22 يعني صورة حادّة جدًا؛ ≤ 4 يعني ضبابية واضحة
  return clamp01((stdev / 22) * 100);
}

/** غنى الألوان — انحراف الفروق بين القنوات */
async function colorfulnessScore(buffer: Buffer): Promise<number> {
  const { data, info } = await sharp(buffer, { failOn: 'none' })
    .resize(96, 96, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels < 3) return 0;
  let rgSum = 0, rgSq = 0, ybSum = 0, ybSq = 0;
  const n = info.width * info.height;
  for (let i = 0; i < n; i++) {
    const r = data[i * info.channels];
    const g = data[i * info.channels + 1];
    const b = data[i * info.channels + 2];
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    rgSum += rg; rgSq += rg * rg;
    ybSum += yb; ybSq += yb * yb;
  }
  const rgMean = rgSum / n, ybMean = ybSum / n;
  const rgStd = Math.sqrt(Math.max(0, rgSq / n - rgMean * rgMean));
  const ybStd = Math.sqrt(Math.max(0, ybSq / n - ybMean * ybMean));
  const value = Math.sqrt(rgStd ** 2 + ybStd ** 2) + 0.3 * Math.sqrt(rgMean ** 2 + ybMean ** 2);
  return clamp01((value / 90) * 100);
}

/** شبكة طاقة الحواف GRID×GRID (0..1 لكل خلية) */
async function edgeGrid(buffer: Buffer): Promise<number[]> {
  const size = GRID * 8;
  const { data } = await sharp(buffer, { failOn: 'none' })
    .greyscale()
    .resize(size, size, { fit: 'fill' })
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cells = new Array(GRID * GRID).fill(0);
  const cellPx = size / GRID;
  for (let y = 0; y < size; y++) {
    const gy = Math.min(GRID - 1, Math.floor(y / cellPx));
    for (let x = 0; x < size; x++) {
      const gx = Math.min(GRID - 1, Math.floor(x / cellPx));
      cells[gy * GRID + gx] += data[y * size + x];
    }
  }
  const max = Math.max(1, ...cells);
  return cells.map((c) => c / max);
}

/**
 * نقطة التركيز: مركز الكتلة البصرية مرجّحًا بطاقة الحواف، مع انحياز خفيف
 * إلى الثلث العلوي حيث تقع الوجوه غالبًا في صور الفعاليات.
 */
function focusFromGrid(cells: number[]): FocusPoint {
  let sum = 0, sx = 0, sy = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      // ترجيح رأسي: الثلث العلوي أهم بصريًا في صور الأشخاص
      const bias = y < GRID / 2 ? 1.15 : 0.95;
      const w = cells[y * GRID + x] ** 1.5 * bias;
      sum += w;
      sx += w * (x + 0.5);
      sy += w * (y + 0.5);
    }
  }
  if (sum <= 0) return { x: 0.5, y: 0.45, confidence: 0 };

  const cx = sx / sum / GRID;
  const cy = sy / sum / GRID;
  // الثقة: كم تتركّز الطاقة حول هذه النقطة (تشتّت منخفض = ثقة عالية)
  let variance = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const w = cells[y * GRID + x] ** 1.5;
      const dx = (x + 0.5) / GRID - cx;
      const dy = (y + 0.5) / GRID - cy;
      variance += w * (dx * dx + dy * dy);
    }
  }
  variance /= sum;
  const confidence = Math.max(0, Math.min(1, 1 - variance * 6));

  return {
    x: Math.min(0.85, Math.max(0.15, cx)),
    y: Math.min(0.85, Math.max(0.15, cy)),
    confidence,
  };
}

/**
 * اتزان التكوين: نكافئ الصور التي تقع كتلتها البصرية قرب خطوط الأثلاث،
 * ونعاقب الصور التي تتكدّس طاقتها في زاوية واحدة أو تكون فارغة تمامًا.
 */
function compositionScore(cells: number[]): number {
  const focus = focusFromGrid(cells);
  const thirds = [1 / 3, 2 / 3];
  const dx = Math.min(...thirds.map((t) => Math.abs(focus.x - t)), Math.abs(focus.x - 0.5));
  const dy = Math.min(...thirds.map((t) => Math.abs(focus.y - t)), Math.abs(focus.y - 0.5));
  const thirdsScore = 1 - Math.min(1, (dx + dy) / 0.4);

  // تغطية: نسبة الخلايا ذات طاقة معتبرة (تجنّب الصور الفارغة)
  const active = cells.filter((c) => c > 0.15).length / cells.length;
  const coverage = Math.min(1, active / 0.45);

  return clamp01((thirdsScore * 0.6 + coverage * 0.4) * 100);
}

/** بصمة إدراكية dHash بطول 64 بت — كافية لكشف الصور شبه المتطابقة */
async function dHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer, { failOn: 'none' })
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += data[y * 9 + x] < data[y * 9 + x + 1] ? '1' : '0';
    }
  }
  // 64 بت → 16 محرفًا ست عشرية
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/** مسافة هامينغ بين بصمتين (0..64) — أقل من 8 يعني تكرارًا */
export function hammingDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

// --------------------------------------------------------------------------
// الفيديو
// --------------------------------------------------------------------------

async function analyzeVideo(req: AnalysisRequest, buffer: Buffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'promo-an-'));
  const input = req.localPath ?? path.join(dir, 'in.mp4');
  if (!req.localPath) await fs.writeFile(input, buffer);

  try {
    const probe = await probeVideo(input);
    const duration = probe.duration;

    // نلتقط عيّنات موزّعة على طول المقطع ونحلّل كل إطار
    const sampleCount = Math.max(3, Math.min(8, Math.floor(duration / 2)));
    const timestamps = Array.from(
      { length: sampleCount },
      (_, i) => (duration * (i + 0.5)) / sampleCount,
    );
    const frames = await extractFrames(input, timestamps, dir);

    const perFrame: (Awaited<ReturnType<typeof analyzeImageBuffer>> & { t: number })[] = [];
    for (const f of frames) {
      const buf = await fs.readFile(f.path);
      perFrame.push({ t: f.t, ...(await analyzeImageBuffer(buf)) });
    }

    if (!perFrame.length) throw new Error('تعذّر استخراج إطارات من الفيديو');

    // متوسط المقاييس عبر العيّنات
    const avg = <K extends keyof (typeof perFrame)[0]['metrics']>(k: K) =>
      perFrame.reduce((s, f) => s + (f.metrics[k] as number), 0) / perFrame.length;

    // الحركة: تباين البصمات بين الإطارات المتتالية
    let motionSum = 0;
    for (let i = 1; i < perFrame.length; i++) {
      motionSum += hammingDistance(perFrame[i - 1].phash, perFrame[i].phash);
    }
    const motionScore = clamp01((motionSum / Math.max(1, perFrame.length - 1) / 24) * 100);

    // الثبات: تذبذب الحدّة بين الإطارات (اهتزاز الكاميرا يخفض الحدّة تفاوتًا)
    const sharpVals = perFrame.map((f) => f.metrics.sharpness);
    const sharpMean = sharpVals.reduce((a, b) => a + b, 0) / sharpVals.length;
    const sharpVar =
      sharpVals.reduce((s, v) => s + (v - sharpMean) ** 2, 0) / sharpVals.length;
    const stability = clamp01(100 - Math.min(100, Math.sqrt(sharpVar) * 4));

    // أفضل نافذة: حول الإطار الأعلى جودة، بعيدًا عن أول/آخر نصف ثانية
    const best = perFrame.reduce((a, b) =>
      frameScore(b.metrics) > frameScore(a.metrics) ? b : a,
    );
    const windowLen = Math.min(6, Math.max(2, duration * 0.4));
    const start = Math.max(0.3, Math.min(duration - windowLen - 0.3, best.t - windowLen / 2));

    const metrics: MediaMetrics = {
      width: probe.width,
      height: probe.height,
      aspect: probe.height ? probe.width / probe.height : 16 / 9,
      sharpness: avg('sharpness'),
      brightness: avg('brightness'),
      contrast: avg('contrast'),
      colorfulness: avg('colorfulness'),
      entropy: avg('entropy'),
      composition: avg('composition'),
      motionScore,
      stability,
      duration,
      hasAudio: probe.hasAudio,
    };

    return {
      metrics,
      focus: best.focus,
      phash: best.phash,
      bestWindow: { start, end: Math.min(duration, start + windowLen) },
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function probeVideo(file: string): Promise<{
  duration: number; width: number; height: number; hasAudio: boolean;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, data) => {
      if (err) return reject(err);
      const v = data.streams.find((s) => s.codec_type === 'video');
      resolve({
        duration: data.format.duration ?? 0,
        width: v?.width ?? 0,
        height: v?.height ?? 0,
        hasAudio: data.streams.some((s) => s.codec_type === 'audio'),
      });
    });
  });
}

async function extractFrames(input: string, timestamps: number[], dir: string) {
  const out: { t: number; path: string }[] = [];
  for (const [i, t] of timestamps.entries()) {
    const p = path.join(dir, `f${i}.jpg`);
    await new Promise<void>((resolve) => {
      ffmpeg(input)
        .seekInput(t)
        .frames(1)
        .size('640x?')
        .on('end', () => resolve())
        .on('error', () => resolve()) // إطار فاشل لا يُسقط التحليل كلّه
        .save(p);
    });
    if (await exists(p)) out.push({ t, path: p });
  }
  return out;
}

// --------------------------------------------------------------------------
// التقييم النهائي
// --------------------------------------------------------------------------

/** جودة الإطار الواحد — تُستخدم لاختيار أفضل لحظة داخل الفيديو */
function frameScore(m: MediaMetrics): number {
  return m.sharpness * 0.45 + m.contrast * 0.2 + m.composition * 0.2 + m.colorfulness * 0.15;
}

/**
 * القيمة البصرية الكلية 0..100.
 * الحدّة والإضاءة الجيدة هما الأثقل؛ الإضاءة تُقاس كقربها من المدى المثالي
 * (لا الأعلى هو الأفضل: الصورة المحروقة سيئة كالمظلمة).
 */
function overallScore(m: MediaMetrics): number {
  const exposure = 100 - Math.min(100, Math.abs(m.brightness - 52) * 2.4);
  const resolution = Math.min(100, (Math.min(m.width, m.height) / 1080) * 100);

  let score =
    m.sharpness * 0.30 +
    exposure * 0.20 +
    m.contrast * 0.12 +
    m.composition * 0.15 +
    m.colorfulness * 0.08 +
    m.entropy * 0.07 +
    resolution * 0.08;

  // الفيديو: الثبات يرفع، والحركة المفرطة تخفض قليلًا
  if (m.stability !== undefined) score = score * 0.85 + m.stability * 0.15;
  if (m.motionScore !== undefined && m.motionScore > 70) score -= (m.motionScore - 70) * 0.15;

  return clamp01(score);
}

/**
 * ترشيح المشاهد: بأي خطوة من القصة تصلح هذه المادة؟
 * يعتمد على خصائص قابلة للقياس (نسبة الأبعاد، الحركة، السطوع، التفاصيل)
 * ما دامت وسوم الرؤية غير متاحة.
 */
function beatAffinity(m: MediaMetrics, type: 'image' | 'video'): Partial<Record<StoryBeat, number>> {
  const wide = m.aspect >= 1.5;
  const detailed = m.entropy > 55;
  const bright = m.brightness > 45 && m.brightness < 70;

  const a: Partial<Record<StoryBeat, number>> = {
    opening: (wide ? 0.8 : 0.3) + (m.composition > 60 ? 0.2 : 0),
    place: wide ? 0.75 : 0.35,
    kickoff: 0.5 + (bright ? 0.2 : 0),
    training: 0.6 + (detailed ? 0.25 : 0),
    activities: 0.55 + (type === 'video' ? 0.2 : 0) + (detailed ? 0.15 : 0),
    highlights: 0.5 + (m.sharpness > 65 ? 0.3 : 0),
    participants: 0.55 + (m.entropy > 60 ? 0.2 : 0),
    closing: 0.45 + (m.composition > 65 ? 0.25 : 0),
  };

  if (type === 'video') {
    a.activities = (a.activities ?? 0) + 0.15;
    a.highlights = (a.highlights ?? 0) + 0.15;
    a.opening = (a.opening ?? 0) + (m.motionScore && m.motionScore > 30 ? 0.2 : 0);
  }
  return a;
}

function finalize(
  req: AnalysisRequest,
  metrics: MediaMetrics,
  focus: FocusPoint,
  phash: string,
  labels: string[],
  bestWindow?: { start: number; end: number },
): MediaAnalysis {
  const analysis: MediaAnalysis = {
    mediaId: req.mediaId,
    type: req.type,
    url: req.src,
    metrics,
    phash,
    labels,
    focus,
    score: overallScore(metrics),
    beatAffinity: beatAffinity(metrics, req.type),
    engine: 'local',
  };
  if (bestWindow) {
    (analysis as MediaAnalysis & { bestWindow?: { start: number; end: number } }).bestWindow =
      bestWindow;
  }
  return analysis;
}

// --------------------------------------------------------------------------
// أدوات
// --------------------------------------------------------------------------

async function loadBuffer(req: AnalysisRequest): Promise<Buffer> {
  if (req.localPath) return fs.readFile(req.localPath);
  const res = await fetch(req.src);
  if (!res.ok) throw new Error(`تعذّر تحميل المادة (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function exists(p: string) {
  return fs.access(p).then(() => true).catch(() => false);
}

function clamp01(n: number) {
  return Math.max(0, Math.min(100, n));
}
