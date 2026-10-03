import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { formatArabicDate } from '@/lib/utils';
import type { MagazineData } from './data';
import { sessionAccent, type SessionAccent } from './accents';

/**
 * مجلة الـFlipbook كملف HTML واحد قائم بذاته يعمل دون اتصال بالإنترنت:
 * الخط والشعارات والصور (JPEG base64) ومكتبة التقليب page-flip كلها مضمّنة داخل الملف.
 * التصميم نسخة CSS خالصة من مكوّن Flipbook (بلا Tailwind) ليبقى الملف مستقلًا تمامًا.
 */

const PRIMARY = '#0E5C50';
const PRIMARY_DARK = '#0A4A40';
const SECONDARY = '#B99C6B';
const BACKGROUND = '#F6F2EA';
const MUTED = '#8B8178';

/** أصول مضمّنة: كل صورة تُخزَّن مرة واحدة وتُشار إليها بمفتاح (الشعارات تتكرر في كل صفحة) */
type AssetMap = Record<string, string>;

async function publicDataUrl(rel: string, mime: string): Promise<string> {
  const buf = await fs.readFile(path.join(process.cwd(), 'public', rel));
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** يجلب صورة ويحوّلها إلى JPEG مضغوطة بعرض أقصى (لإبقاء حجم الملف معقولًا) */
async function remoteJpeg(url: string, maxWidth: number): Promise<string | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const jpeg = await sharp(input)
      .rotate()
      .resize({ width: maxWidth, height: maxWidth, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch {
    return null;
  }
}

/** تنفيذ متوازٍ بحدّ أقصى للطلبات المتزامنة */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toArabic(n: number): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
}

/** صورة تُملأ من خريطة الأصول عند التشغيل */
function img(key: string | null, cls: string, alt = ''): string {
  return key ? `<img data-k="${key}" class="${cls}" alt="${esc(alt)}">` : '';
}

function magPage(heading: string, courseTitle: string, pageNo: number, showMoi: boolean, body: string, accent?: SessionAccent): string {
  // لون المحور يُمرَّر كمتغيرات CSS تلوّن الشريط الجانبي والترويسة والرقم والعناوين
  const style = accent ? ` style="--ac:${accent.main};--act:${accent.tint}"` : '';
  return `<div class="flip-page mag${accent ? ' accented' : ''}"${style}>
<div class="side"></div>
<div class="head"><div class="head-row"><span class="heading">${esc(heading)}</span><div class="logos">${img('logo', 'logo-sm')}${
    showMoi ? `<span class="sep"></span>${img('moi', 'logo-sm')}` : ''
  }</div></div><div class="rule"></div></div>
<div class="content">${body}</div>
<div class="foot"><span class="num">${toArabic(pageNo)}</span><span class="ct">${esc(courseTitle)}</span></div>
</div>`;
}

function imageBody(key: string | null, caption: string | null, sectionLabel?: string): string {
  return `<div class="img-page">${
    sectionLabel ? `<div class="section"><h2>${esc(sectionLabel)}</h2><div class="bar sm"></div></div>` : ''
  }<div class="img-wrap"><div class="frame-img">${img(key, 'photo', caption ?? '')}</div></div>${
    caption ? `<div class="caption"><div class="bar xs"></div><p>${esc(caption)}</p></div>` : ''
  }</div>`;
}

export async function buildOfflineHtml(data: MagazineData, slug: string): Promise<string> {
  const { course, cover, images, sessions, coordinator, landmarkUrl } = data;
  const showMoi = course.show_partnership_logo;

  // ---- الأصول ----
  const assets: AssetMap = {};
  const [font, logo, moi, logoW, moiW, pageFlipJs] = await Promise.all([
    publicDataUrl('fonts/Cairo.ttf', 'font/ttf'),
    publicDataUrl('logo-nauss.png', 'image/png'),
    showMoi ? publicDataUrl('logo-moi.png', 'image/png') : Promise.resolve(''),
    publicDataUrl('logo-nauss-white.png', 'image/png'),
    showMoi ? publicDataUrl('logo-moi-white.png', 'image/png') : Promise.resolve(''),
    fs.readFile(path.join(process.cwd(), 'node_modules/page-flip/dist/js/page-flip.browser.js'), 'utf8'),
  ]);
  assets.logo = logo;
  assets.logoW = logoW;
  if (showMoi) {
    assets.moi = moi;
    assets.moiW = moiW;
  }

  // الصور: نحوّل كل صورة مرة واحدة، والغلاف يعيد استخدام صورة المعرض إن كان منها
  const imageKey = new Map<string, string>();
  const converted = await mapLimit(images, 6, (m) => remoteJpeg(m.processed_url ?? m.thumbnail_url ?? '', 1400));
  images.forEach((m, i) => {
    const src = converted[i];
    if (!src) return;
    const k = `i${i}`;
    assets[k] = src;
    imageKey.set(m.id, k);
  });

  let coverKey: string | null = cover ? imageKey.get(cover.id) ?? null : null;
  const coverSrc = cover?.processed_url ?? landmarkUrl ?? null;
  if (!coverKey && coverSrc) {
    const c = await remoteJpeg(coverSrc, 1400);
    if (c) {
      assets.cover = c;
      coverKey = 'cover';
    }
  }

  let avatarKey: string | null = null;
  if (coordinator?.avatar_url) {
    const a = await remoteJpeg(coordinator.avatar_url, 200);
    if (a) {
      assets.avatar = a;
      avatarKey = 'avatar';
    }
  }

  // ---- الصفحات (بنفس ترتيب مكوّن Flipbook) ----
  const bySession = new Map<string, typeof images>();
  for (const s of sessions) bySession.set(s.id, []);
  const unassigned: typeof images = [];
  for (const m of images) {
    if (m.session_id && bySession.has(m.session_id)) bySession.get(m.session_id)!.push(m);
    else unassigned.push(m);
  }

  const interior: string[] = [];
  let pageNo = 0;

  if (course.welcome_text) {
    interior.push(
      magPage(course.title, course.title, ++pageNo, showMoi,
        `<div class="welcome"><div class="bar"></div><p>${esc(course.welcome_text)}</p><div class="bar"></div></div>`),
    );
  }

  interior.push(
    magPage(course.title, course.title, ++pageNo, showMoi, `<div class="intro">
<h2>عن الدورة</h2><div class="bar"></div>
${course.description ? `<p class="desc">${esc(course.description)}</p>` : '<p class="muted">دورة تدريبية ضمن برامج الشراكات الدولية.</p>'}
${course.trainer_names.length > 0 ? `<div class="trainers"><h3>المدربون</h3><div class="chips">${course.trainer_names.map((n) => `<span>${esc(n)}</span>`).join('')}</div></div>` : ''}
${coordinator ? `<div class="coord">${img(avatarKey, 'avatar', coordinator.full_name)}<div><p class="lbl">إعداد المجلة</p><p class="name">${esc(coordinator.full_name)}</p><p class="lbl">${esc(coordinator.job_title || 'منسّق الدورة')}</p></div></div>` : ''}
</div>`),
  );

  if (sessions.length > 0) {
    // رقم أول صفحة لكل محور: صفحة المحور + صفحة لكل صورة إضافية
    let at = pageNo + 1;
    const starts = sessions.map((s) => {
      const first = at + 1;
      at += Math.max(1, (bySession.get(s.id) ?? []).length);
      return first;
    });
    const dense = sessions.length > 10;
    interior.push(
      magPage('المحتويات', course.title, ++pageNo, showMoi, `<div class="toc${dense ? ' dense' : ''}"><h2>المحتويات</h2><div class="bar"></div><ol>${sessions
        .map((s, i) => `<li><span class="toc-n" style="background:${sessionAccent(i).main}">${toArabic(i + 1)}</span><span class="toc-t">${esc(s.title)}</span><span class="toc-dots"></span><span class="toc-p">${toArabic(starts[i])}</span></li>`)
        .join('')}</ol></div>`),
    );
  }

  sessions.forEach((s, i) => {
    const sImgs = bySession.get(s.id) ?? [];
    const accent = sessionAccent(i);
    const main = sImgs[0];
    const mainKey = main ? imageKey.get(main.id) ?? null : null;
    interior.push(
      magPage(s.title, course.title, ++pageNo, showMoi, `<div class="session${mainKey ? ' has-img' : ''}">
<div class="s-text">
<span class="pill">الجلسة ${toArabic(i + 1)}</span>
<h2>${esc(s.title)}</h2><div class="bar"></div>
${s.presenter || s.time_label ? `<div class="s-meta">${s.presenter ? `<span>المقدّم: ${esc(s.presenter)}</span>` : ''}${s.time_label ? `<span dir="ltr">${esc(s.time_label)}</span>` : ''}</div>` : ''}
${s.description ? `<p class="desc">${esc(s.description)}</p>` : '<p class="desc muted">جلسة ضمن برنامج الدورة التدريبية.</p>'}
</div>
${mainKey ? `<div class="s-img"><div class="frame-img">${img(mainKey, 'photo', main!.caption ?? s.title)}</div></div>` : ''}
</div>`, accent),
    );
    sImgs.slice(1).forEach((m) => {
      interior.push(magPage(s.title, course.title, ++pageNo, showMoi, imageBody(imageKey.get(m.id) ?? null, m.caption, s.title), accent));
    });
  });

  unassigned.forEach((m, idx) => {
    interior.push(
      magPage('صور من الدورة', course.title, ++pageNo, showMoi,
        imageBody(imageKey.get(m.id) ?? null, m.caption, idx === 0 ? 'صور من الدورة' : undefined)),
    );
  });

  if ((interior.length + 2) % 2 !== 0) {
    interior.push('<div class="flip-page mag"><div class="side"></div></div>');
  }

  const coverPage = `<div class="flip-page cover" data-density="hard">
${img(coverKey, 'cover-bg')}
<div class="cover-shade"></div><div class="frame"></div>
<div class="cover-logos">${img('logoW', 'logo-lg', 'جامعة نايف')}${showMoi ? `<span class="sep"></span>${img('moiW', 'logo-lg', 'وزارة الداخلية')}` : ''}</div>
<div class="cover-text">
<div class="bar wide"></div>
<p class="kicker">الدورة التدريبية</p>
<h1>${esc(course.title)}</h1>
<div class="meta">${course.start_date ? `<span>${esc(formatArabicDate(course.start_date))}</span>` : ''}${course.location ? `<span>· ${esc(course.location)}</span>` : ''}</div>
<p class="cover-foot">جامعة نايف العربية للعلوم الأمنية · إدارة عمليات التدريب</p>
</div>
</div>`;

  const backPage = `<div class="flip-page back" data-density="hard">
<div class="frame dim"></div>
<div class="back-logo">${img('logoW', 'logo-xl', 'جامعة نايف العربية للعلوم الأمنية')}</div>
<div class="back-text"><div class="bar"></div><p class="b1">إدارة عمليات التدريب</p><p class="b2">وكالة الجامعة للتدريب</p><p class="b3">جامعة نايف العربية للعلوم الأمنية</p></div>
</div>`;

  const pagesHtml = [coverPage, ...interior, backPage].join('\n');
  // نمنع إغلاق وسم script مبكرًا داخل بيانات JSON
  const assetsJson = JSON.stringify(assets).replace(/</g, '\\u003c');
  const safeJs = pageFlipJs.replace(/<\/script/gi, '<\\/script');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(course.title)} — المجلة الإلكترونية</title>
<meta name="generator" content="منصة توثيق — نسخة دون اتصال (${esc(slug)})">
<style>
@font-face{font-family:'Cairo';src:url(${font}) format('truetype');font-weight:200 1000;font-display:swap}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:'Cairo',system-ui,sans-serif;background:#0a3d35;color:#2a302d;overflow:hidden;-webkit-font-smoothing:antialiased}
.stage{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px}
.holder{position:relative}
.scaler{position:absolute;left:0;top:0;transform-origin:top left}
.flip-page{position:relative;overflow:hidden;width:100%;height:100%}
.flip-page img{display:block}
.bar{height:4px;width:56px;border-radius:9999px;background:${SECONDARY}}
.bar.sm{width:48px;margin-top:4px}.bar.xs{height:2px;width:40px;margin:0 auto 4px}.bar.wide{height:6px;width:64px;margin-bottom:10px}
.muted{color:${MUTED}}
/* الغلاف */
.cover{background:${PRIMARY};color:#fff}
.cover-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cover-shade{position:absolute;inset:0;background:linear-gradient(to top,${PRIMARY_DARK},rgba(14,92,80,.7),rgba(14,92,80,.25))}
.frame{position:absolute;inset:16px;border-radius:8px;border:1px solid rgba(185,156,107,.5);pointer-events:none}
.frame.dim{border-color:rgba(185,156,107,.4)}
.cover-logos{position:absolute;right:28px;top:24px;display:flex;align-items:center;gap:16px}
.logo-lg{height:44px;object-fit:contain}
.cover-logos .sep{height:36px;width:1px;background:rgba(255,255,255,.3)}
.cover-text{position:absolute;inset-inline:0;bottom:0;padding:32px}
.kicker{margin-bottom:8px;font-size:13px;font-weight:500;letter-spacing:.025em;color:${SECONDARY}}
.cover h1{max-width:70%;font-size:26px;font-weight:600;line-height:1.375;text-shadow:0 1px 2px rgba(0,0,0,.15)}
.meta{margin-top:12px;display:flex;gap:16px;font-size:14px;color:rgba(255,255,255,.9)}
.cover-foot{margin-top:16px;border-top:1px solid rgba(255,255,255,.2);padding-top:12px;font-size:12px;color:rgba(255,255,255,.7)}
/* الغلاف الخلفي */
.back{background:${PRIMARY};color:#fff;text-align:center}
.back-logo{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.logo-xl{height:112px;object-fit:contain}
.back-text{position:absolute;inset-inline:0;bottom:40px}
.back-text .bar{margin:0 auto 12px}
.b1{font-size:16px;font-weight:600}.b2{font-size:14px;color:rgba(255,255,255,.8)}.b3{font-size:14px;color:rgba(255,255,255,.7)}
/* الصفحة الداخلية */
.mag{background-color:${BACKGROUND};background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cpath d='M60 24 L64 56 L96 60 L64 64 L60 96 L56 64 L24 60 L56 56 Z' fill='%23B99C6B' fill-opacity='0.05'/%3E%3C/svg%3E");background-size:120px 120px}
.side{position:absolute;top:0;bottom:0;right:0;width:6px;background:linear-gradient(to bottom,${PRIMARY},${PRIMARY_DARK})}
.head{position:absolute;inset-inline:0;top:0;padding:16px 24px 0}
.head-row{display:flex;align-items:center;justify-content:space-between}
.heading{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding-left:12px;font-size:12px;font-weight:600;color:${PRIMARY}}
.logos{display:flex;flex-shrink:0;align-items:center;gap:10px}
.logo-sm{height:28px;object-fit:contain}
.logos .sep{height:24px;width:1px;background:rgba(185,156,107,.4)}
.rule{margin-top:8px;height:1px;background:linear-gradient(to left,transparent,${SECONDARY},transparent);opacity:.6}
.content{position:absolute;inset-inline:0;top:64px;bottom:48px;overflow:hidden;padding:0 28px}
.foot{position:absolute;left:24px;right:24px;bottom:12px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(185,156,107,.25);padding-top:8px}
.num{display:flex;width:24px;height:24px;align-items:center;justify-content:center;border-radius:9999px;background:${PRIMARY};font-size:10px;font-weight:700;color:#fff}
.ct{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding-right:12px;font-size:10px;letter-spacing:.025em;color:${MUTED}}
.desc{white-space:pre-line;font-size:13.5px;line-height:1.625;color:#2a302d}
.welcome{display:flex;height:100%;flex-direction:column;align-items:center;justify-content:center;padding:0 24px;text-align:center}
.welcome p{max-width:85%;margin:24px 0;font-size:15px;font-weight:500;line-height:2;color:${PRIMARY}}
.intro{display:flex;height:100%;flex-direction:column;justify-content:center}
.intro h2{font-size:20px;font-weight:600;color:${PRIMARY}}
.intro>.bar{margin:8px 0 12px}
.trainers{margin-top:20px}
.trainers h3{margin-bottom:8px;font-size:16px;font-weight:600;color:${PRIMARY}}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chips span{border-radius:8px;border:1px solid rgba(185,156,107,.4);background:rgba(255,255,255,.7);padding:4px 12px;font-size:13px;color:${PRIMARY}}
.coord{margin-top:20px;display:flex;align-items:center;gap:12px;border-radius:12px;border:1px solid rgba(185,156,107,.3);background:rgba(255,255,255,.6);padding:12px}
.avatar{width:48px;height:48px;flex-shrink:0;border-radius:9999px;border:1px solid rgba(185,156,107,.5);object-fit:cover}
.coord .lbl{font-size:11px;color:${MUTED}}.coord .name{font-size:13.5px;font-weight:600;color:${PRIMARY}}
.session{display:flex;height:100%;gap:20px}
.s-text{display:flex;width:100%;flex-direction:column;justify-content:center}
.session.has-img .s-text{width:44%;flex-shrink:0}
.pill{margin-bottom:8px;width:fit-content;border-radius:9999px;background:rgba(185,156,107,.15);padding:4px 12px;font-size:11px;font-weight:700;color:${SECONDARY}}
.s-text h2{font-size:19px;font-weight:600;line-height:1.375;color:${PRIMARY}}
.s-text>.bar{width:48px;margin:8px 0 12px}
.s-text .desc{font-size:13px}
.s-meta{margin-bottom:12px;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;color:${MUTED}}
.s-img{display:flex;flex:1;min-width:0;min-height:0;align-items:center;justify-content:center}
.frame-img{display:flex;max-height:100%;max-width:100%;align-items:center;justify-content:center;overflow:hidden;border-radius:12px;border:1px solid rgba(185,156,107,.4);background:#fff;padding:6px;box-shadow:0 4px 6px -1px rgba(0,0,0,.1),0 2px 4px -2px rgba(0,0,0,.1)}
.photo{max-height:100%;max-width:100%;width:auto;border-radius:8px;object-fit:contain}
.s-img .photo{max-height:calc(560px - 112px - 12px)}
.portrait .session{flex-direction:column;justify-content:center}
.portrait .session.has-img .s-text{width:100%}
.portrait .s-img .photo{max-height:340px}
.img-page{display:flex;height:100%;flex-direction:column}
.section{margin-bottom:8px;flex-shrink:0}
.section h2{font-size:18px;font-weight:600;color:${PRIMARY}}
.img-wrap{display:flex;min-height:0;flex:1;align-items:center;justify-content:center}
.img-wrap .frame-img{height:100%}
.img-wrap .photo{height:100%}
.caption{margin-top:8px;flex-shrink:0;text-align:center}
.caption p{font-size:13px;font-weight:500;color:${PRIMARY}}
/* لون المحور */
.accented .side{background:var(--ac)}
.accented .heading,.accented .s-text h2,.accented .section h2{color:var(--ac)}
.accented .num,.accented .s-text>.bar,.accented .section .bar{background:var(--ac)}
.accented .pill{background:var(--act);color:var(--ac)}
/* المحتويات */
.toc{display:flex;height:100%;flex-direction:column;justify-content:center}
.toc h2{font-size:20px;font-weight:600;color:${PRIMARY}}
.toc>.bar{margin:8px 0 12px}
.toc ol{list-style:none}
.toc li{display:flex;align-items:center;gap:12px;margin-bottom:8px;font-size:13.5px}
.toc.dense li{margin-bottom:4px;font-size:12px}
.toc-n{display:flex;width:24px;height:24px;flex-shrink:0;align-items:center;justify-content:center;border-radius:9999px;font-size:11px;font-weight:700;color:#fff}
.toc.dense .toc-n{width:20px;height:20px;font-size:10px}
.toc-t{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:500;color:#2a302d}
.toc-dots{flex:1;min-width:24px;border-bottom:1px dotted rgba(185,156,107,.6)}
.toc-p{flex-shrink:0;color:${MUTED};font-variant-numeric:tabular-nums}
/* شريط التحكم */
.controls{margin-top:12px;display:flex;align-items:center;gap:16px;color:rgba(255,255,255,.85)}
.btn{display:inline-flex;width:40px;height:40px;align-items:center;justify-content:center;border:0;border-radius:9999px;background:rgba(255,255,255,.15);color:#fff;cursor:pointer;transition:background .15s}
.btn:hover{background:rgba(255,255,255,.25)}
.btn:disabled{opacity:.3;cursor:default}
.btn svg{width:20px;height:20px}
.counter{min-width:96px;text-align:center;font-size:12px;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.7)}
.hint{margin-top:8px;text-align:center;font-size:12px;color:rgba(255,255,255,.5)}
.fs{position:absolute;right:12px;top:12px;z-index:10;display:inline-flex;align-items:center;gap:8px;border:0;border-radius:16px;background:rgba(255,255,255,.15);padding:8px 16px;font:inherit;font-size:14px;color:#fff;cursor:pointer}
.fs:hover{background:rgba(255,255,255,.25)}
</style>
</head>
<body>
<div class="stage" id="root">
<button class="fs" id="fs" type="button">ملء الشاشة</button>
<div class="holder" id="holder"><div class="scaler" id="scaler"></div></div>
<div class="controls">
<button class="btn" id="prev" type="button" aria-label="الصفحة السابقة"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
<span class="counter" id="counter">...</span>
<button class="btn" id="next" type="button" aria-label="الصفحة التالية"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
</div>
<p class="hint">اسحب الصفحة أو استخدم الأزرار والأسهم للتقليب</p>
</div>
<template id="pages">
${pagesHtml}
</template>
<script>var ASSETS=${assetsJson};</script>
<script>${safeJs}</script>
<script>
(function(){
  var LAND={w:800,h:560},PORT={w:560,h:800};
  var root=document.getElementById('root'),holder=document.getElementById('holder'),scaler=document.getElementById('scaler');
  var tpl=document.getElementById('pages'),prev=document.getElementById('prev'),next=document.getElementById('next'),counter=document.getElementById('counter');
  var pf=null,mode=null;
  function ar(n){return String(n).replace(/[0-9]/g,function(d){return '٠١٢٣٤٥٦٧٨٩'[+d];});}
  function update(){
    if(!pf)return;
    var i=pf.getCurrentPageIndex(),n=pf.getPageCount();
    // الصفحات معكوسة (اتجاه عربي): رقم القراءة = n - i
    counter.textContent=ar(n-i)+' / '+ar(n);
    prev.disabled=i>=n-1;next.disabled=i===0;
  }
  function layout(){
    var single=window.innerWidth<768,s=single?PORT:LAND,pages=single?1:2;
    var scale=Math.max(.2,Math.min((window.innerWidth-12)/(s.w*pages),(window.innerHeight-128)/s.h,1.25));
    holder.style.width=(s.w*pages*scale)+'px';holder.style.height=(s.h*scale)+'px';
    scaler.style.width=(s.w*pages)+'px';scaler.style.height=s.h+'px';scaler.style.transform='scale('+scale+')';
    var m=single?'p':'l';
    if(m===mode)return;
    mode=m;
    var at=pf?pf.getCurrentPageIndex():-1;
    if(pf){try{pf.destroy();}catch(e){}pf=null;}
    scaler.innerHTML='';
    root.classList.toggle('portrait',single);
    var book=document.createElement('div');
    book.style.width=(s.w*pages)+'px';book.style.height=s.h+'px';
    book.appendChild(tpl.content.cloneNode(true));
    var imgs=book.querySelectorAll('img[data-k]');
    for(var j=0;j<imgs.length;j++){var src=ASSETS[imgs[j].getAttribute('data-k')];if(src)imgs[j].src=src;}
    scaler.appendChild(book);
    // page-flip لا يدعم RTL: نمرّر الصفحات معكوسة ونبدأ من آخرها فيُقلَّب الكتاب من اليسار لليمين
    var pages=Array.prototype.slice.call(book.querySelectorAll('.flip-page')).reverse();
    if(at<0)at=pages.length-1;
    pf=new St.PageFlip(book,{width:s.w,height:s.h,size:'fixed',showCover:true,usePortrait:single,mobileScrollSupport:true,useMouseEvents:true,swipeDistance:20,drawShadow:true,maxShadowOpacity:.4,startPage:at});
    pf.loadFromHTML(pages);
    pf.on('flip',update);
    update();
  }
  prev.onclick=function(){pf&&pf.flipNext();};
  next.onclick=function(){pf&&pf.flipPrev();};
  window.addEventListener('keydown',function(e){
    if(!pf)return;
    if(e.key==='ArrowRight')pf.flipNext();else if(e.key==='ArrowLeft')pf.flipPrev();
  });
  var fs=document.getElementById('fs');
  if(!document.documentElement.requestFullscreen){fs.style.display='none';}
  fs.onclick=function(){
    if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen();
  };
  var t;
  function onResize(){clearTimeout(t);t=setTimeout(layout,120);}
  window.addEventListener('resize',onResize);
  window.addEventListener('orientationchange',onResize);
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(layout);}else{layout();}
})();
</script>
</body>
</html>`;
}
