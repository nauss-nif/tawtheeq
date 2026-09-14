/**
 * فحص ذاتي لمحرّك البرومو — يعمل دون ffmpeg ودون أي مزوّد خارجي.
 *
 *   npm run promo:check
 *
 * يغطّي: تحليل صور حقيقية، كشف التكرار، بناء القصة وضبط المدة، إعادة الاستخدام
 * عند ندرة المواد، تشكيل العربية وترتيبها RTL، قاموس النطق، بناء التكوين
 * لكل اتجاه على حدة، والفحص الثابت لضبط الجودة.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { promises as fs } from 'fs';
import path from 'path';
import { localAnalysis } from '../src/lib/promo/providers/analysis/local';
import { dedupe, selectMaterials } from '../src/lib/promo/analyze';
import { buildStoryPlan } from '../src/lib/promo/story';
import { buildTimeline, toStoryboard, FRAME } from '../src/lib/promo/timeline';
import { alignNarration, targetWordCount } from '../src/lib/promo/script';
import { shapeLine, layoutTextBlock, wrapText } from '../src/lib/promo/text';
import { applyLexicon, splitSentences } from '../src/lib/promo/pronounce';
import { qcTimeline, buildReport } from '../src/lib/promo/qc';
import { applyStyleDefaults, defaultSettings, validateSettings } from '../src/lib/promo/defaults';
import type { CourseContext, MediaAnalysis, RenderOrientation } from '../src/lib/promo/types';

const ROOT = path.resolve(__dirname, '..');
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  // ---------------------------------------------------------- ١) تحليل صور حقيقية
  const files = ['public/logo-nauss.png', 'public/icon-512.png', 'public/logo-moi.png', 'public/apple-icon.png'];
  const analyses: MediaAnalysis[] = [];

  for (const [i, f] of files.entries()) {
    const p = path.join(ROOT, f);
    if (!(await fs.access(p).then(() => true).catch(() => false))) continue;
    const a = await localAnalysis.analyze({ mediaId: `m${i}`, type: 'image', src: `file://${p}`, localPath: p });
    analyses.push(a);
    console.log(
      `   ${f}: ${a.metrics.width}×${a.metrics.height} حدّة=${a.metrics.sharpness.toFixed(0)} ` +
      `سطوع=${a.metrics.brightness.toFixed(0)} تكوين=${a.metrics.composition.toFixed(0)} ` +
      `تركيز=(${a.focus.x.toFixed(2)},${a.focus.y.toFixed(2)}) قيمة=${a.score.toFixed(0)} hash=${a.phash}`,
    );
  }

  check('حلّل صورًا حقيقية', analyses.length >= 3, `${analyses.length} صورة`);
  check('البصمات الإدراكية بطول 16 محرفًا', analyses.every((a) => a.phash.length === 16));
  check('نقاط التركيز داخل المدى', analyses.every((a) => a.focus.x > 0 && a.focus.x < 1 && a.focus.y > 0 && a.focus.y < 1));
  check('القيم البصرية في المدى 0..100', analyses.every((a) => a.score >= 0 && a.score <= 100));

  // نفس الصورة مرتين ⇒ يجب أن تُرصد كتكرار
  const twin = { ...analyses[0], mediaId: 'twin' };
  const { kept } = dedupe([...analyses, twin]);
  check('كشف التكرار البصري', kept.length === analyses.length, `${kept.length} بعد التنقية من ${analyses.length + 1}`);

  // -------------------------------------------------------------- ٢) القصة
  const course: CourseContext = {
    id: 'c1',
    title: 'برنامج القيادة الأمنية المتقدّمة',
    description: 'برنامج تدريبي متخصّص يستهدف بناء قدرات القيادات الأمنية في إدارة الأزمات.',
    startDate: '2026-03-10',
    endDate: '2026-03-14',
    location: 'باكو، أذربيجان',
    trainers: ['د. سالم الحارثي', 'أ. منى الزهراني'],
    welcomeText: null,
    sessions: [
      { title: 'إدارة الأزمات الأمنية', presenter: 'د. سالم الحارثي', description: null },
      { title: 'القيادة تحت الضغط', presenter: null, description: null },
      { title: 'التطبيقات الميدانية', presenter: null, description: null },
    ],
  };

  // مجموعة أكبر لاختبار التوزيع
  const pool: MediaAnalysis[] = Array.from({ length: 14 }, (_, i) => ({
    ...analyses[i % analyses.length],
    mediaId: `p${i}`,
    phash: analyses[i % analyses.length].phash.slice(0, 12) + i.toString(16).padStart(4, '0'),
    score: 45 + ((i * 7) % 50),
  }));

  // مكتبة فارغة: يجب أن تبقى الإعدادات صالحة (تعليق صوتي بلا موسيقى)
  const emptyLib = defaultSettings('cinematic');
  check('إعدادات صالحة مع مكتبة موسيقى فارغة',
    validateSettings(emptyLib).length === 0,
    `الوضع الصوتي: ${emptyLib.audioMode}`);

  // مكتبة فيها مقاطع: يُختار المقطع المناسب للنمط تلقائيًا
  const libraryTracks = [
    { id: 'trk-1', mood: 'corporate', title: 'اتزان مؤسسي' },
    { id: 'trk-2', mood: 'cinematic', title: 'أفق واسع' },
    { id: 'trk-3', mood: 'energetic', title: 'انطلاق' },
  ];
  const settings = defaultSettings('cinematic', libraryTracks);
  check('الإعدادات الافتراضية صالحة', validateSettings(settings).length === 0);
  check('المدة الافتراضية ٦٠ ثانية', settings.duration === 60);
  check('اختار مقطعًا يناسب النمط السينمائي',
    settings.music.trackId === 'trk-2', String(settings.music.trackId));
  check('تغيير النمط يعيد اختيار الموسيقى المناسبة', (() => {
    const dyn = applyStyleDefaults(settings, 'dynamic', { voice: false, music: false }, libraryTracks);
    return dyn.music.trackId === 'trk-3';
  })());

  const selection = selectMaterials(pool, { sceneBudget: 16 });
  check('اختار مواد', selection.selected.length > 0, `${selection.selected.length} مادة`);

  const plan = buildStoryPlan({
    course,
    analyses: selection.selected,
    duration: 60,
    style: 'cinematic',
    allowBRoll: false,
  });

  const total = plan.shots.reduce((s, x) => s + x.duration, 0);
  check('مدة الخطة تطابق المطلوب (±1.5ث)', Math.abs(total - 60) <= 1.5, `${total.toFixed(1)} ثانية`);
  check('تبدأ بالافتتاحية وتنتهي ببطاقة النهاية',
    plan.shots[0].beat === 'opening' && plan.shots.at(-1)!.beat === 'endcard');
  // مع ٤ مواد فقط لـ٦٠ ثانية يُسمح بإعادة الاستخدام، لكن بشروط:
  const ids = plan.shots.map((s) => s.media?.mediaId ?? null);
  check('لا تتجاور نسختان من المادة نفسها',
    ids.every((id, i) => i === 0 || id === null || id !== ids[i - 1]));
  // في الندرة القصوى يُسمح بتجاوز السقف، لكن التوزيع يجب أن يبقى متوازنًا:
  // لا مادة تُستهلك أكثر من غيرها بأكثر من مرة واحدة.
  const counts = new Map<string, number>();
  for (const id of ids) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  const values = [...counts.values()];
  check('توزيع الاستخدام متوازن بين المواد',
    Math.max(...values) - Math.min(...values) <= 1,
    `${counts.size} مادة، الاستخدام: ${values.join('/')}`);

  // ومع مخزون وافر لا يجوز أي تكرار إطلاقًا
  const rich: MediaAnalysis[] = Array.from({ length: 40 }, (_, i) => ({
    ...analyses[i % analyses.length],
    mediaId: `r${i}`,
    phash: (i * 0x1111111111111 + 0xabcdef).toString(16).padStart(16, '0').slice(-16),
    score: 50 + (i % 40),
  }));
  const richPlan = buildStoryPlan({ course, analyses: rich, duration: 60, style: 'cinematic', allowBRoll: false });
  const richIds = richPlan.shots.map((s) => s.media?.mediaId).filter(Boolean);
  check('لا تكرار إطلاقًا عند توفّر مواد كافية',
    new Set(richIds).size === richIds.length,
    `${richIds.length} لقطة بمواد متمايزة`);
  console.log(`   خطوات القصة: ${plan.beats.join(' ← ')}`);
  for (const r of plan.rationale) console.log(`   · ${r}`);

  // كل المدد داخل حدود النمط
  const body = plan.shots.slice(1, -1);
  check('مدد اللقطات داخل حدود النمط', body.every((s) => s.duration >= 2.1 && s.duration <= 5.6));

  // ------------------------------------------------------ ٣) النص والتوزيع
  const words = targetWordCount(60, settings.voice);
  check('ميزانية الكلمات معقولة لـ٦٠ ثانية', words > 60 && words < 170, `${words} كلمة`);

  const script =
    'في جامعة نايف العربية للعلوم الأمنية، برنامج القيادة الأمنية المتقدّمة. ' +
    'أُقيم البرنامج في باكو، أذربيجان، في مارس ٢٠٢٦. ' +
    'تناول البرنامج إدارة الأزمات الأمنية، والقيادة تحت الضغط، والتطبيقات الميدانية. ' +
    'توثيق لما جرى، وأثرٌ يبقى.';

  const segments = alignNarration(script, plan.shots, total);
  check('وُزّعت جمل التعليق على المشاهد', segments.length === splitSentences(script).length);
  check('لا تتجاوز الجمل نهاية الفيديو', segments.every((s) => s.end <= total));
  check('الجمل مرتّبة زمنيًا',
    segments.every((s, i) => i === 0 || s.start >= segments[i - 1].start));

  // -------------------------------------------------- ٤) النص العربي RTL
  const shaped = shapeLine('برنامج القيادة الأمنية المتقدّمة');
  check('التشكيل يغيّر المحارف إلى صور العرض', shaped !== 'برنامج القيادة الأمنية المتقدّمة');
  check('التشكيل يحافظ على عدد الكلمات', shaped.split(' ').length === 4, shaped);

  const mixed = shapeLine('برنامج NAUSS 2026 للقيادة');
  check('اللاتينية والأرقام تبقى بترتيبها', mixed.includes('NAUSS') && mixed.includes('2026'), mixed);

  const wrapped = wrapText('برنامج القيادة الأمنية المتقدّمة في جامعة نايف العربية للعلوم الأمنية', 600, 60);
  check('اللفّ يقسّم النص الطويل', wrapped.length > 1, `${wrapped.length} أسطر`);

  const block = layoutTextBlock(
    'برنامج القيادة الأمنية المتقدّمة',
    { width: 900, height: 400 },
    { fontSize: 67, leading: 1.35, tracking: 0.01, maxLines: 3 },
  );
  check('كتلة النص لا تُبتر', !block.truncated, `${block.lines.length} سطر بحجم ${block.fontSize}`);
  check('عرض السطر داخل الصندوق', block.maxLineWidth <= 900);

  // ------------------------------------------------------ ٥) قاموس النطق
  const lex = [{ term: 'باكو', phonetic: 'باكُو' }, { term: 'NAUSS', phonetic: 'ناوس' }];
  const applied = applyLexicon('أُقيم في باكو وفي مدينة باكو، بالتعاون مع NAUSS.', lex);
  check('طبّق قاموس النطق', applied.includes('باكُو') && applied.includes('ناوس'), applied);
  const prefixed = applyLexicon('وصلنا وباكو قريبة.', [{ term: 'باكو', phonetic: 'باكُو' }]);
  check('يحافظ على السوابق الملتصقة', prefixed.includes('وباكُو'), prefixed);

  // ------------------------------------- ٦) الجدول الزمني للاتجاهين + الجودة
  for (const orientation of ['horizontal', 'vertical'] as RenderOrientation[]) {
    const tl = buildTimeline({
      plan,
      settings,
      course,
      orientation,
      openingText: 'برنامج القيادة الأمنية المتقدّمة\nباكو — مارس ٢٠٢٦',
      closingText: 'شكرًا لمشاركتكم',
      narration: segments,
      beatGrid: Array.from({ length: 40 }, (_, i) => i * 1.5),
    });

    const frame = FRAME[orientation];
    console.log(`\n   ── ${orientation} ${frame.width}×${frame.height} ──`);
    check(`[${orientation}] الدقة صحيحة`, tl.width === frame.width && tl.height === frame.height);
    check(`[${orientation}] عدد المشاهد مطابق للخطة`, tl.scenes.length === plan.shots.length);
    check(`[${orientation}] المدة الكلية ضمن المدى`, Math.abs(tl.totalDuration - 60) <= 2,
      `${tl.totalDuration.toFixed(1)} ثانية`);

    // النصوص تُبنى للاتجاه المطلوب فقط
    const otherOrientation = orientation === 'vertical' ? 'horizontal' : 'vertical';
    check(`[${orientation}] النصوص مبنية لهذا الاتجاه وحده`,
      tl.scenes.some((s) => s.texts[orientation].length > 0) &&
      tl.scenes.every((s) => s.texts[otherOrientation].length === 0));

    // نقاط التركيز محسوبة بحيث لا يخرج الإطار عن حدود المادة
    check(`[${orientation}] نقاط التركيز صالحة`,
      tl.scenes.every((s) => {
        const f = s.motion[orientation].focus;
        return f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1;
      }));

    // لا انتقال يبتلع مشهده
    check(`[${orientation}] الانتقالات لا تبتلع المشاهد`,
      tl.scenes.every((s, i) => i === 0 || s.transitionIn.duration <= s.duration * 0.45));

    const rows = toStoryboard(tl);
    check(`[${orientation}] لوحة المشاهد كاملة`, rows.length === tl.scenes.length);
    console.log(
      `   أول ٣ مشاهد: ` +
      rows.slice(0, 3).map((r) => `${r.label}/${r.beatLabel}/${r.motionLabel}/${r.duration}ث`).join(' | '),
    );

    const report = buildReport(qcTimeline(tl, course, settings));
    console.log(`   ضبط الجودة: ${report.checks.length} فحصًا — ${report.failures} إخفاق، ${report.warnings} تنبيه`);
    for (const c of report.checks.filter((c) => c.severity !== 'pass')) {
      console.log(`     ${c.severity === 'fail' ? '✖' : '⚠'} ${c.label}: ${c.detail}`);
    }
    check(`[${orientation}] لا إخفاقات في الفحص الثابت`, report.failures === 0);
  }

  // ------------------------------- ٧) اختلاف التكوين فعليًا بين الاتجاهين
  const h = buildTimeline({ plan, settings, course, orientation: 'horizontal', narration: segments,
    openingText: 'برنامج القيادة الأمنية المتقدّمة', closingText: null });
  const v = buildTimeline({ plan, settings, course, orientation: 'vertical', narration: segments,
    openingText: 'برنامج القيادة الأمنية المتقدّمة', closingText: null });

  const hTitle = h.scenes.find((s) => s.beat === 'title')?.texts.horizontal[0];
  const vTitle = v.scenes.find((s) => s.beat === 'title')?.texts.vertical[0];
  check('حجم النص يختلف بين الاتجاهين (إعادة تكوين لا قصّ)',
    !!hTitle && !!vTitle && hTitle.sizeRatio !== vTitle.sizeRatio,
    `أفقي=${hTitle?.sizeRatio.toFixed(4)} عمودي=${vTitle?.sizeRatio.toFixed(4)}`);
  check('موضع النص يختلف بين الاتجاهين',
    !!hTitle && !!vTitle && hTitle.anchor.y !== vTitle.anchor.y,
    `أفقي y=${hTitle?.anchor.y} عمودي y=${vTitle?.anchor.y}`);

  const hFocus = h.scenes[2]?.motion.horizontal.focus;
  const vFocus = v.scenes[2]?.motion.vertical.focus;
  check('نقطة التركيز تُعاد حسابها لكل اتجاه',
    !!hFocus && !!vFocus && (hFocus.x !== vFocus.x || hFocus.y !== vFocus.y),
    `أفقي=(${hFocus?.x.toFixed(3)},${hFocus?.y.toFixed(3)}) عمودي=(${vFocus?.x.toFixed(3)},${vFocus?.y.toFixed(3)})`);

  // -------------------------------------------- ٨) اختلاف الأنماط فعليًا
  const cin = buildStoryPlan({ course, analyses: selection.selected, duration: 60, style: 'cinematic', allowBRoll: false });
  const dyn = buildStoryPlan({ course, analyses: selection.selected, duration: 60, style: 'dynamic', allowBRoll: false });
  check('النمط الحماسي يقطع أسرع من السينمائي',
    dyn.shots.length > cin.shots.length,
    `حماسي=${dyn.shots.length} مشهد، سينمائي=${cin.shots.length}`);

  // ------------------------------------------- ٩) المدد الثلاث كلها تعمل
  for (const d of [30, 60, 90] as const) {
    const p = buildStoryPlan({ course, analyses: selection.selected, duration: d, style: 'modern', allowBRoll: false });
    const t = p.shots.reduce((s, x) => s + x.duration, 0);
    check(`مدة ${d} ثانية مضبوطة`, Math.abs(t - d) <= 2, `${t.toFixed(1)} ثانية / ${p.shots.length} مشهد`);
  }

  console.log(`\n${failures ? `✖ ${failures} فحصًا فشل` : '✔ كل الفحوص نجحت'}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error('خطأ:', e);
  process.exit(1);
});
