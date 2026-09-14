/**
 * محرّك الرندر الافتراضي — ffmpeg.
 *
 * البنية: كل مشهد يُرندر إلى مقطع وسيط مستقل، ثم تُدمج المقاطع بانتقالات
 * (xfade) ويُركَّب الصوت. هذا التقسيم هو ما يجعل «إعادة توليد هذا المشهد»
 * ممكنة دون إعادة بناء الفيديو كلّه: المقاطع الأخرى تُقرأ من الذاكرة المؤقّتة.
 *
 * حركة الصور تُنفَّذ بـ zoompan على نسخة مُعاد تأطيرها حول نقطة التركيز —
 * أي إعادة تكوين حقيقية لكل اتجاه، لا قصّ مركزي.
 */

import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import { serverEnv } from '@/lib/env';
import { getStyle } from '../../styles';
import { SAFE } from '../../timeline';
import { layoutTextBlock, escapeFilterPath } from '../../text';
import type { RenderProvider, RenderRequest, RenderResult } from '../types';
import type { Scene, SceneMotion, TextOverlay, Timeline } from '../../types';
import type { ColorGrade, PromoStyle } from '../../styles';

ffmpeg.setFfmpegPath(serverEnv.ffmpegPath);
ffmpeg.setFfprobePath(serverEnv.ffprobePath);

/** تكبير مسبق قبل الحركة — يمنع ظهور البكسلة عند التقريب */
const SUPERSAMPLE = 1.6;

export const ffmpegRender: RenderProvider = {
  id: 'ffmpeg',
  kind: 'render',
  isConfigured: () => true,

  async render(req: RenderRequest): Promise<RenderResult> {
    const { timeline, workDir } = req;
    const style = getStyle(req.styleId);
    await fs.mkdir(workDir, { recursive: true });

    // (١) رندر المشاهد — يُعاد استخدام أي مقطع موجود مسبقًا (إعادة توليد جزئية)
    const clips: string[] = [];
    for (const [i, scene] of timeline.scenes.entries()) {
      const clipPath = scenePath(workDir, timeline, i);
      if (!(await exists(clipPath))) {
        await renderScene(scene, timeline, style, clipPath, workDir);
      }
      clips.push(clipPath);
      req.onProgress?.(
        Math.round(((i + 1) / timeline.scenes.length) * 70),
        `رندر المشهد ${i + 1} من ${timeline.scenes.length}`,
      );
    }

    // (٢) الدمج بالانتقالات وتركيب الصوت
    req.onProgress?.(75, 'دمج المشاهد وتركيب الصوت');
    await assemble(clips, timeline, req.outputPath, workDir);

    // (٣) صورة الغلاف والقياسات النهائية
    req.onProgress?.(95, 'استخراج صورة الغلاف');
    const posterPath = req.outputPath.replace(/\.mp4$/, '-poster.jpg');
    await extractPoster(req.outputPath, posterPath, Math.min(2.5, timeline.totalDuration * 0.25));

    const stat = await fs.stat(req.outputPath);
    const meta = await probeVideo(req.outputPath);

    req.onProgress?.(100, 'اكتمل الرندر');
    return {
      path: req.outputPath,
      posterPath,
      duration: meta.duration,
      fileSize: stat.size,
      width: meta.width,
      height: meta.height,
      provider: 'ffmpeg',
    };
  },

  /** إعادة رندر مشهد واحد فقط ثم إعادة الدمج */
  async renderScene(req: RenderRequest & { sceneIndex: number }): Promise<RenderResult> {
    const { timeline, workDir, sceneIndex } = req;
    const style = getStyle(req.styleId);

    const clipPath = scenePath(workDir, timeline, sceneIndex);
    await fs.unlink(clipPath).catch(() => {}); // إبطال الذاكرة المؤقّتة لهذا المشهد فقط
    await renderScene(timeline.scenes[sceneIndex], timeline, style, clipPath, workDir);

    return ffmpegRender.render(req);
  },
};

function scenePath(workDir: string, t: Timeline, index: number) {
  return path.join(workDir, `scene-${t.orientation}-${String(index).padStart(2, '0')}.mp4`);
}

// ==========================================================================
// رندر مشهد واحد
// ==========================================================================

async function renderScene(
  scene: Scene,
  timeline: Timeline,
  style: PromoStyle,
  outPath: string,
  workDir: string,
): Promise<void> {
  const { width: W, height: H, fps } = timeline;
  const frames = Math.max(2, Math.round(scene.duration * fps));
  const motion = scene.motion[timeline.orientation];
  const isVideo = scene.sourceKind === 'video' || scene.sourceKind === 'broll';

  if (!scene.src) throw new Error(`المشهد ${scene.index + 1} بلا مصدر`);

  const chain: string[] = [];

  if (isVideo) {
    // إعادة تأطير الفيديو حول نقطة التركيز — لا قصّ مركزي أعمى
    chain.push(reframe(W, H, motion.focus, 1));
    if (scene.clip?.speed && scene.clip.speed !== 1) {
      chain.push(`setpts=${(1 / scene.clip.speed).toFixed(4)}*PTS`);
    }
    // تثبيت خفيف عندما يكون المقطع مهتزًّا
    chain.push('deshake=rx=16:ry=16:edge=mirror');
    chain.push(`fps=${fps}`);
  } else {
    // صورة: إعادة تأطير عالي الدقة ثم حركة كاميرا سلسة
    chain.push(reframe(W, H, motion.focus, SUPERSAMPLE));
    chain.push(zoompan(motion, frames, W, H, fps));
  }

  chain.push(grade(style.grade, timeline.orientation));

  // النصوص
  const textFilters = await buildTextFilters(
    scene.texts[timeline.orientation],
    { W, H, orientation: timeline.orientation },
    style,
    workDir,
    scene.index,
  );
  chain.push(...textFilters);

  chain.push('format=yuv420p', 'setsar=1');

  const overlays = scene.overlays?.[timeline.orientation] ?? [];

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg();

    if (isVideo) {
      cmd.input(scene.src!);
      if (scene.clip) {
        cmd.inputOptions([`-ss ${scene.clip.start}`]);
        cmd.outputOptions([`-t ${scene.duration}`]);
      } else {
        cmd.outputOptions([`-t ${scene.duration}`]);
      }
    } else {
      // إطار واحد يولّد d إطارات عبر zoompan — لا نكرّر المدخل (-loop)
      // وإلا تضاعف الناتج بعدد إطارات المدخل.
      cmd.input(scene.src!);
      cmd.outputOptions([`-frames:v ${frames}`]);
    }

    const encode = [
      '-crf 18',            // جودة عالية للمقاطع الوسيطة (الضغط النهائي لاحقًا)
      '-preset veryfast',
      `-r ${fps}`,
      '-pix_fmt yuv420p',
    ];

    if (overlays.length) {
      // الشعار يُركَّب كطبقة مستقلة حتى لا تمسّه معالجة ألوان النمط
      const graph: string[] = [`[0:v]${chain.join(',')}[base]`];
      let last = 'base';

      overlays.forEach((ov, i) => {
        cmd.input(ov.path);
        const lbl = `ov${i}`;
        const out = `s${i}`;
        graph.push(
          `[${i + 1}:v]scale=${ov.width}:${ov.height}:force_original_aspect_ratio=decrease,` +
            `format=rgba,colorchannelmixer=aa=1[${lbl}]`,
        );
        graph.push(
          `[${last}][${lbl}]overlay=${Math.round(ov.x)}:${Math.round(ov.y)}` +
            `:enable='between(t,${ov.inAt.toFixed(2)},${(ov.inAt + ov.duration).toFixed(2)})'[${out}]`,
        );
        last = out;
      });

      cmd
        .complexFilter(graph)
        .outputOptions([`-map [${last}]`, '-an', '-c:v libx264', ...encode]);
    } else {
      cmd.videoFilters(chain.join(',')).noAudio().videoCodec('libx264').outputOptions(encode);
    }

    cmd
      .on('end', () => resolve())
      .on('error', (e) => reject(new Error(`فشل رندر المشهد ${scene.index + 1}: ${e.message}`)))
      .save(outPath);
  });
}

/**
 * إعادة التأطير: نغطّي الإطار الهدف ثم نقصّ حول نقطة التركيز المحسوبة
 * لهذا الاتجاه تحديدًا. هذا ما يجعل النسخة العمودية إعادة تكوين لا اقتصاصًا.
 */
function reframe(W: number, H: number, focus: { x: number; y: number }, scale: number): string {
  const tw = Math.round(W * scale);
  const th = Math.round(H * scale);
  const fx = focus.x.toFixed(4);
  const fy = focus.y.toFixed(4);
  return (
    `scale=${tw}:${th}:force_original_aspect_ratio=increase:flags=lanczos,` +
    `crop=${tw}:${th}:` +
    `'max(0\\,min(iw-ow\\,iw*${fx}-ow/2))':` +
    `'max(0\\,min(ih-oh\\,ih*${fy}-oh/2))'`
  );
}

/** بناء تعبير zoompan لحركة الكاميرا */
function zoompan(motion: SceneMotion, frames: number, W: number, H: number, fps: number): string {
  const N = Math.max(1, frames - 1);
  const p = `(on/${N})`;
  const ease =
    motion.easing === 'linear'
      ? p
      : motion.easing === 'ease_out'
        ? `(1-pow(1-${p}\\,2))`
        : `(3*pow(${p}\\,2)-2*pow(${p}\\,3))`;

  const I = Math.max(0, Math.min(1, motion.intensity));
  const cx = `(iw-iw/zoom)/2`;
  const cy = `(ih-ih/zoom)/2`;

  let z = '1';
  let x = cx;
  let y = cy;

  switch (motion.type) {
    case 'slow_zoom_in':
      z = `1+${(0.10 * I).toFixed(4)}*${ease}`;
      break;
    case 'push_in':
      z = `1+${(0.18 * I).toFixed(4)}*${ease}`;
      break;
    case 'depth_push':
      z = `1+${(0.22 * I).toFixed(4)}*${ease}`;
      break;
    case 'slow_zoom_out':
      z = `${(1 + 0.10 * I).toFixed(4)}-${(0.10 * I).toFixed(4)}*${ease}`;
      break;
    case 'pull_out':
      z = `${(1 + 0.18 * I).toFixed(4)}-${(0.18 * I).toFixed(4)}*${ease}`;
      break;
    case 'pan_left':
      z = `${(1 + 0.08 * I).toFixed(4)}`;
      x = `(iw-iw/zoom)*(1-${ease})`;
      break;
    case 'pan_right':
      z = `${(1 + 0.08 * I).toFixed(4)}`;
      x = `(iw-iw/zoom)*${ease}`;
      break;
    case 'pan_up':
      z = `${(1 + 0.08 * I).toFixed(4)}`;
      y = `(ih-ih/zoom)*(1-${ease})`;
      break;
    case 'pan_down':
      z = `${(1 + 0.08 * I).toFixed(4)}`;
      y = `(ih-ih/zoom)*${ease}`;
      break;
    case 'parallax':
      // تقريب مع انزياح أفقي معاكس — يوحي بفصل المقدّمة عن الخلفية
      z = `1+${(0.12 * I).toFixed(4)}*${ease}`;
      x = `(iw-iw/zoom)*(0.5+${(0.16 * I).toFixed(4)}*(${ease}-0.5))`;
      break;
    case 'rack_focus':
      z = `1+${(0.05 * I).toFixed(4)}*${ease}`;
      break;
    case 'static':
    default:
      z = '1';
  }

  return `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${W}x${H}:fps=${fps}`;
}

/** معالجة الألوان الخاصة بالنمط */
function grade(g: ColorGrade, orientation: string): string {
  const parts: string[] = [];

  parts.push(
    `eq=contrast=${g.contrast.toFixed(3)}:brightness=${g.brightness.toFixed(3)}` +
      `:saturation=${g.saturation.toFixed(3)}:gamma=${g.gamma.toFixed(3)}`,
  );

  if (Math.abs(g.temperature) > 0.001) {
    // درجة الحرارة: 6500K محايد؛ موجب = أدفأ
    const kelvin = Math.round(6500 - g.temperature * 2500);
    parts.push(`colortemperature=temperature=${kelvin}:mix=0.85`);
  }

  if (g.vignette > 0.01) {
    const angle = (Math.PI / 5) * (0.5 + g.vignette);
    parts.push(`vignette=angle=${angle.toFixed(4)}:mode=forward`);
  }

  if (g.grain > 0.01) {
    parts.push(`noise=alls=${Math.round(g.grain * 14)}:allf=t+u`);
  }

  // الأشرطة السينمائية للاتجاه الأفقي فقط — لا تُطبَّق على العمودي
  if (g.letterbar > 0.001 && orientation === 'horizontal') {
    const h = `ih*${g.letterbar.toFixed(4)}`;
    parts.push(`drawbox=x=0:y=0:w=iw:h=${h}:color=black@1:t=fill`);
    parts.push(`drawbox=x=0:y=ih-${h}:w=iw:h=${h}:color=black@1:t=fill`);
  }

  return parts.join(',');
}

// ==========================================================================
// النصوص
// ==========================================================================

/**
 * خطوط النصوص: El Messiri بوزنين — SemiBold للعناوين و Regular للمتن —
 * مع سقوط لطيف إلى الخط الاحتياطي إن لم يتوفّرا.
 */
async function resolveFonts(): Promise<{ title: string; body: string }> {
  const pick = async (...candidates: string[]) => {
    for (const c of candidates) {
      const abs = path.resolve(process.cwd(), c);
      if (await exists(abs)) return abs;
    }
    return null;
  };

  const title = await pick(serverEnv.promo.fontPath, serverEnv.promo.fallbackFontPath);
  if (!title) {
    throw new Error(
      'لا يوجد ملف خط لرسم النصوص. ضع El Messiri في public/fonts/ElMessiri.ttf ' +
        'أو اضبط PROMO_FONT_PATH.',
    );
  }
  const body = (await pick(serverEnv.promo.fontBodyPath)) ?? title;
  return { title, body };
}

/**
 * مرشّحات drawtext لنصوص المشهد.
 * يُكتب كل سطر في ملف مستقل (textfile=) لتفادي مشاكل الهروب مع العربية،
 * ويُرسَم بعد تشكيله وترتيبه ثنائي الاتجاه في محرّك النصوص.
 */
async function buildTextFilters(
  texts: TextOverlay[],
  frame: { W: number; H: number; orientation: 'vertical' | 'horizontal' },
  style: PromoStyle,
  workDir: string,
  sceneIndex: number,
): Promise<string[]> {
  if (!texts.length) return [];

  const fonts = await resolveFonts();
  const fontTitle = escapeFilterPath(fonts.title);
  const fontBody = escapeFilterPath(fonts.body);
  const safe = SAFE[frame.orientation];
  const minSide = Math.min(frame.W, frame.H);
  const boxWidth = frame.W * (1 - safe.side * 2);

  const filters: string[] = [];
  let fileSeq = 0;

  for (const t of texts) {
    const fontSize = Math.round(t.sizeRatio * minSide);
    const block = layoutTextBlock(
      t.text,
      { width: boxWidth, height: frame.H * 0.3 },
      {
        fontSize,
        leading: style.type.leading,
        tracking: style.type.tracking,
        maxLines: t.role === 'title' ? 3 : 2,
      },
    );

    const blockTop = t.anchor.y * frame.H - block.blockHeight / 2;

    // لوحة خلف النص لضمان القراءة فوق الصور
    if (style.type.plate !== 'none') {
      filters.push(
        plateFilter(style.type.plate, frame, blockTop, block.blockHeight, t, safe),
      );
    }

    // خط ذهبي تحت العنوان (عنصر هوية)
    if (style.type.accentRule && (t.role === 'title' || t.role === 'closing')) {
      const ruleW = Math.round(frame.W * 0.14);
      const ruleY = Math.round(blockTop + block.blockHeight + block.fontSize * 0.45);
      const ruleX = Math.round((frame.W - ruleW) / 2);
      filters.push(
        `drawbox=x=${ruleX}:y=${ruleY}:w=${ruleW}:h=4:color=0xB99C6B@1:t=fill:` +
          `enable='between(t,${(t.inAt + 0.25).toFixed(2)},${(t.inAt + t.duration).toFixed(2)})'`,
      );
    }

    for (const [li, line] of block.lines.entries()) {
      const file = path.join(workDir, `txt-${sceneIndex}-${fileSeq++}.txt`);
      await fs.writeFile(file, line, 'utf8');

      const lineY = Math.round(blockTop + li * block.lineHeight);
      const inAt = t.inAt + li * 0.08;
      const outAt = t.inAt + t.duration;

      filters.push(
        drawText({
          file,
          // العناوين بوزن SemiBold، وما دونها بوزن Regular
          font: t.role === 'title' || t.role === 'closing' ? fontTitle : fontBody,
          fontSize: block.fontSize,
          y: lineY,
          frame,
          align: t.align,
          safe,
          role: t.role,
          animation: style.type.animation,
          shadow: style.type.shadow,
          inAt,
          outAt,
        }),
      );
    }
  }

  return filters;
}

function plateFilter(
  kind: 'bar' | 'gradient',
  frame: { W: number; H: number },
  top: number,
  height: number,
  t: TextOverlay,
  safe: { side: number },
): string {
  const pad = Math.round(height * 0.35);
  const enable = `enable='between(t,${t.inAt.toFixed(2)},${(t.inAt + t.duration).toFixed(2)})'`;

  if (kind === 'bar') {
    const x = Math.round(frame.W * safe.side * 0.5);
    const w = Math.round(frame.W * (1 - safe.side));
    return (
      `drawbox=x=${x}:y=${Math.round(top - pad)}:w=${w}:h=${Math.round(height + pad * 2)}` +
      `:color=0x0A4A40@0.55:t=fill:${enable}`
    );
  }

  // تدرّج: شريط داكن يغطّي الثلث السفلي — يُنفَّذ كصندوق متدرّج تقريبيًا
  const gTop = Math.round(Math.max(0, top - frame.H * 0.12));
  const gH = Math.round(frame.H - gTop);
  return `drawbox=x=0:y=${gTop}:w=${frame.W}:h=${gH}:color=black@0.42:t=fill:${enable}`;
}

function drawText(a: {
  file: string;
  font: string;
  fontSize: number;
  y: number;
  frame: { W: number; H: number };
  align: 'start' | 'center' | 'end';
  safe: { side: number };
  role: TextOverlay['role'];
  animation: string;
  shadow: number;
  inAt: number;
  outAt: number;
}): string {
  // المحاذاة: 'end' في سياق RTL تعني الالتصاق بالحافة اليمنى
  const margin = Math.round(a.frame.W * a.safe.side);
  const x =
    a.align === 'center'
      ? '(w-text_w)/2'
      : a.align === 'end'
        ? `w-text_w-${margin}`
        : `${margin}`;

  const color = a.role === 'caption' ? '0xF6F2EA' : 'white';
  const fadeIn = 0.45;
  const fadeOut = 0.35;

  // ظهور النص: تلاشٍ دائمًا، مع ارتفاع طفيف في أنماط rise
  const alpha =
    `'if(lt(t,${a.inAt.toFixed(2)}),0,` +
    `if(lt(t,${(a.inAt + fadeIn).toFixed(2)}),(t-${a.inAt.toFixed(2)})/${fadeIn},` +
    `if(lt(t,${(a.outAt - fadeOut).toFixed(2)}),1,` +
    `max(0,(${a.outAt.toFixed(2)}-t)/${fadeOut}))))'`;

  const yExpr =
    a.animation === 'rise'
      ? `${a.y}+${Math.round(a.fontSize * 0.5)}*max(0,1-(t-${a.inAt.toFixed(2)})/${fadeIn})`
      : `${a.y}`;

  const shadow =
    a.shadow > 0.01
      ? `:shadowcolor=black@${a.shadow.toFixed(2)}:shadowx=0:shadowy=${Math.max(
          2,
          Math.round(a.fontSize * 0.05),
        )}`
      : '';

  return (
    `drawtext=fontfile='${a.font}':textfile='${escapeFilterPath(a.file)}':` +
    `fontsize=${a.fontSize}:fontcolor=${color}:x=${x}:y=${yExpr}:` +
    `alpha=${alpha}${shadow}:` +
    `enable='between(t,${a.inAt.toFixed(2)},${a.outAt.toFixed(2)})'`
  );
}

// ==========================================================================
// الدمج والصوت
// ==========================================================================

/** خريطة انتقالاتنا إلى انتقالات xfade */
const XFADE: Record<string, string> = {
  cut: 'fade',
  fade: 'fade',
  dissolve: 'dissolve',
  wipe_right: 'wiperight',
  wipe_left: 'wipeleft',
  slide_up: 'slideup',
  whip_pan: 'slideleft',
  flash: 'fadewhite',
  zoom_blur: 'zoomin',
};

async function assemble(
  clips: string[],
  timeline: Timeline,
  outPath: string,
  workDir: string,
): Promise<void> {
  const fps = timeline.fps;
  const minTrans = 2 / fps;

  return new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg();
    for (const c of clips) cmd.input(c);

    const filters: string[] = [];
    const scenes = timeline.scenes;

    // --------------------------------------------------------- الفيديو
    let last = '0:v';
    let elapsed = scenes[0].duration;

    for (let i = 1; i < clips.length; i++) {
      const t = scenes[i].transitionIn;
      const dur =
        t.type === 'cut' ? minTrans : Math.max(minTrans, Math.min(t.duration, scenes[i].duration * 0.4));
      const offset = Math.max(0, elapsed - dur);
      const out = `x${i}`;
      filters.push(
        `[${last}][${i}:v]xfade=transition=${XFADE[t.type] ?? 'fade'}` +
          `:duration=${dur.toFixed(3)}:offset=${offset.toFixed(3)}[${out}]`,
      );
      last = out;
      // xfade يبتلع مدة الانتقال من المقطع السابق
      elapsed = offset + scenes[i].duration;
    }

    // تلاشٍ نهائي إلى الأسود
    const fadeOutStart = Math.max(0, elapsed - 0.8);
    filters.push(`[${last}]fade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.8[vout]`);

    // ---------------------------------------------------------- الصوت
    const audio = timeline.audio;
    const musicIdx = audio.musicPath ? clips.length : -1;
    const voiceIdx = audio.voicePath ? clips.length + (audio.musicPath ? 1 : 0) : -1;

    if (audio.musicPath) cmd.input(audio.musicPath).inputOptions(['-stream_loop -1']);
    if (audio.voicePath) cmd.input(audio.voicePath);

    let audioOut: string | null = null;

    if (musicIdx >= 0 && voiceIdx >= 0) {
      // موسيقى + تعليق: Audio Ducking عبر ضاغط بمدخل جانبي
      filters.push(
        `[${musicIdx}:a]atrim=0:${elapsed.toFixed(3)},asetpts=N/SR/TB,` +
          `volume=${audio.musicVolume.toFixed(3)},` +
          `afade=t=in:st=0:d=1.2,afade=t=out:st=${Math.max(0, elapsed - 1.6).toFixed(2)}:d=1.6[mus]`,
      );
      filters.push(
        `[${voiceIdx}:a]adelay=1200|1200,` +
          `acompressor=threshold=0.12:ratio=3:attack=8:release=180,` +
          `volume=1.15,asplit=2[vo1][vosc]`,
      );
      // الموسيقى تنخفض أثناء الكلام وترتفع بين المقاطع بانسياب
      filters.push(
        `[mus][vosc]sidechaincompress=threshold=0.035:ratio=9:attack=25:release=450:makeup=1[duck]`,
      );
      filters.push(
        `[duck][vo1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,` +
          `loudnorm=I=-16:TP=-1.5:LRA=11,` +
          `atrim=0:${elapsed.toFixed(3)}[aout]`,
      );
      audioOut = 'aout';
    } else if (musicIdx >= 0) {
      filters.push(
        `[${musicIdx}:a]atrim=0:${elapsed.toFixed(3)},asetpts=N/SR/TB,` +
          `volume=${audio.musicVolume.toFixed(3)},` +
          `afade=t=in:st=0:d=1.2,afade=t=out:st=${Math.max(0, elapsed - 1.8).toFixed(2)}:d=1.8,` +
          `loudnorm=I=-18:TP=-1.5:LRA=11[aout]`,
      );
      audioOut = 'aout';
    } else if (voiceIdx >= 0) {
      filters.push(
        `[${voiceIdx}:a]adelay=1200|1200,` +
          `acompressor=threshold=0.12:ratio=3:attack=8:release=180,` +
          `loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=0:${elapsed.toFixed(3)}[aout]`,
      );
      audioOut = 'aout';
    }

    const maps = ['-map [vout]'];
    if (audioOut) maps.push(`-map [${audioOut}]`);

    cmd
      .complexFilter(filters)
      .outputOptions([
        ...maps,
        '-c:v libx264',
        '-crf 20',
        '-preset medium',
        '-profile:v high',
        '-level 4.2',
        `-r ${fps}`,
        '-pix_fmt yuv420p',
        '-movflags +faststart',
        ...(audioOut ? ['-c:a aac', '-b:a 192k', '-ar 48000'] : ['-an']),
        `-t ${elapsed.toFixed(3)}`,
      ])
      .on('end', () => resolve())
      .on('error', (e) => reject(new Error(`فشل دمج الفيديو: ${e.message}`)))
      .save(outPath);

    void workDir;
  });
}

function extractPoster(video: string, out: string, at: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(video)
      .seekInput(Math.max(0.1, at))
      .frames(1)
      .outputOptions(['-q:v 3'])
      .on('end', () => resolve())
      .on('error', reject)
      .save(out);
  });
}

function probeVideo(file: string): Promise<{ duration: number; width: number; height: number }> {
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

async function exists(p: string) {
  return fs.access(p).then(() => true).catch(() => false);
}
