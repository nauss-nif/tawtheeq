import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { formatArabicDate } from '@/lib/utils';
import { formatDateRange } from '@/lib/text';
import type { MagazineData } from './data';
import { GOLD, sessionAccent, sessionOrdinal, tabTopRatio, type SessionAccent } from './accents';
import { STAR_PATH, STAR_VIEWBOX } from './brandStar';
import { groupByOrientation, orientationOf, packImagePages, sessionPageCount } from './imageLayout';

/**
 * مجلة الـFlipbook كملف HTML واحد قائم بذاته يعمل دون اتصال بالإنترنت:
 * الخط والشعارات والصور (JPEG base64) ومكتبة التقليب page-flip كلها مضمّنة داخل الملف.
 * التصميم نسخة CSS خالصة من مكوّن Flipbook (بلا Tailwind) ليبقى الملف مستقلًا تمامًا.
 */

const PRIMARY = '#0E5C50';
const PRIMARY_DARK = '#0A4A40';
const SECONDARY = '#B99C6B';
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

type Side = 'right' | 'left';

/** نجمة الجامعة: مُعرّفة مرة واحدة كـ symbol وتُستدعى في كل صفحة (لونها من CSS) */
function star(cls: string): string {
  return `<svg class="${cls}" viewBox="${STAR_VIEWBOX}" aria-hidden="true"><use href="#nauss-star"/></svg>`;
}

interface PageOpts {
  heading: string;
  courseTitle: string;
  pageNo: number;
  showMoi: boolean;
  body: string;
  side: Side;
  accent?: SessionAccent;
  /** رقم المحور (من الصفر) لإظهار لسان الفهرسة */
  tab?: number;
}

function magPage(o: PageOpts): string {
  const ac = o.accent ?? GOLD;
  // متغيرات اللون على غلاف داخلي: page-flip يستبدل خاصية style لعناصر flip-page نفسها
  const vars = `--ac:${ac.main};--acd:${ac.deep};--act:${ac.tint}`;
  const tab = o.tab !== undefined && o.accent
    ? `<div class="tab" style="top:${(tabTopRatio(o.tab) * 100).toFixed(1)}%"><b>${toArabic(o.tab + 1)}</b>${star('tab-star')}</div>`
    : '';
  return `<div class="flip-page mag"><div class="pg out-${o.side}${o.accent ? ' accented' : ''}${o.tab !== undefined ? ' has-tab' : ''}" style="${vars}">
<div class="glow"></div>${star('bstar')}${tab}
<div class="head"><div class="head-row"><span class="heading"><i></i><span>${esc(o.heading)}</span></span><div class="logos">${img('logo', 'logo-sm')}${
    o.showMoi ? `<span class="sep"></span>${img('moi', 'logo-sm')}` : ''
  }</div></div><div class="rule"></div></div>
<div class="content">${o.body}</div>
<div class="foot"><span class="num">${toArabic(o.pageNo)}</span><span class="ct">${esc(o.courseTitle)}</span></div>
</div></div>`;
}

/** صفحة صور: أفقية واحدة، أو طوليتان جنبًا إلى جنب (keys: مفاتيح الصور في خريطة الأصول) */
function imageBody(items: { key: string | null; caption: string | null }[], sectionLabel?: string): string {
  const captions = items.map((x) => x.caption).filter(Boolean) as string[];
  const pair = items.length > 1;
  return `<div class="img-page${sectionLabel ? ' labeled' : ''}${captions.length ? ' captioned' : ''}">${
    sectionLabel ? `<div class="section"><i></i><h2>${esc(sectionLabel)}</h2></div>` : ''
  }<div class="img-wrap${pair ? ' pair' : ''}">${items
    .map((x) => `<div class="cell"><div class="aframe sm"><div class="frame-img">${img(x.key, 'photo', x.caption ?? '')}</div></div></div>`)
    .join('')}</div>${captions.length ? `<div class="caption"><p>${esc(captions.join(' · '))}</p></div>` : ''}</div>`;
}

function ornament(): string {
  return `<div class="orn"><span></span>${star('orn-star')}<span></span></div>`;
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
  // مع إعادة محاولة واحدة حتى لا تسقط صورة بسبب خطأ شبكة عابر
  const converted = await mapLimit(images, 6, async (m) => {
    const url = m.processed_url ?? m.thumbnail_url ?? '';
    return (await remoteJpeg(url, 1400)) ?? (await remoteJpeg(url, 1400));
  });
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
  // الصفحة الداخلية رقم k تقع يمين الصفحتين المتقابلتين إن كان ترتيبها في القراءة فرديًا (الغلاف = ٠)
  const sideOf = (k: number): Side => ((k + 1) % 2 === 1 ? 'right' : 'left');
  const page = (o: Omit<PageOpts, 'side' | 'courseTitle' | 'showMoi'>) =>
    interior.push(magPage({ ...o, side: sideOf(interior.length), courseTitle: course.title, showMoi }));

  if (course.welcome_text) {
    page({
      heading: course.title,
      pageNo: ++pageNo,
      body: `<div class="welcome">${ornament()}<p>${esc(course.welcome_text)}</p>${ornament()}</div>`,
    });
  }

  page({
    heading: course.title,
    pageNo: ++pageNo,
    body: `<div class="intro">
<h2 class="stitle">عن الدورة</h2><div class="sbar"></div>
${course.description ? `<p class="desc">${esc(course.description)}</p>` : '<p class="muted">دورة تدريبية ضمن برامج الشراكات الدولية.</p>'}
${course.trainer_names.length > 0 ? `<div class="trainers"><h3>المدربون</h3><div class="chips">${course.trainer_names.map((n) => `<span>${esc(n)}</span>`).join('')}</div></div>` : ''}
${coordinator ? `<div class="coord">${img(avatarKey, 'avatar', coordinator.full_name)}<div><p class="lbl">إعداد المجلة</p><p class="name">${esc(coordinator.full_name)}</p><p class="lbl">${esc(coordinator.job_title || 'منسّق الدورة')}</p></div></div>` : ''}
</div>`,
  });

  if (sessions.length > 0) {
    // رقم أول صفحة لكل محور: صفحة المحور + صفحة لكل صورة إضافية
    let at = pageNo + 1;
    const starts = sessions.map((s) => {
      const first = at + 1;
      at += sessionPageCount(bySession.get(s.id) ?? []);
      return first;
    });
    const dense = sessions.length > 10;
    page({
      heading: 'المحتويات',
      pageNo: ++pageNo,
      body: `<div class="toc${dense ? ' dense' : ''}"><h2 class="stitle">المحتويات</h2><div class="sbar"></div><ol>${sessions
        .map((s, i) => {
          const a = sessionAccent(i);
          return `<li><span class="toc-n" style="background:linear-gradient(135deg,${a.main},${a.deep})">${toArabic(i + 1)}</span><span class="toc-t" style="color:${a.deep}">${esc(s.title)}</span><span class="toc-dots" style="border-color:${a.main}66"></span><span class="toc-p">${toArabic(starts[i])}</span></li>`;
        })
        .join('')}</ol></div>`,
    });
  }

  sessions.forEach((s, i) => {
    const sImgs = bySession.get(s.id) ?? [];
    const accent = sessionAccent(i);
    const main = sImgs[0];
    const mainKey = main ? imageKey.get(main.id) ?? null : null;
    page({
      heading: s.title,
      pageNo: ++pageNo,
      accent,
      tab: i,
      body: `<span class="bignum" aria-hidden="true">${toArabic(i + 1)}</span><div class="session${mainKey ? ' has-img' : ''}">
<div class="s-text">
<span class="kick"><i></i>الجلسة ${esc(sessionOrdinal(i))}</span>
<h2>${esc(s.title)}</h2><div class="gbar"></div>
${s.presenter || s.time_label ? `<div class="s-meta">${s.presenter ? `<span>المقدّم: ${esc(s.presenter)}</span>` : ''}${s.time_label ? `<span dir="ltr">${esc(s.time_label)}</span>` : ''}</div>` : ''}
${s.description ? `<p class="desc">${esc(s.description)}</p>` : '<p class="desc muted">جلسة ضمن برنامج الدورة التدريبية.</p>'}
</div>
${mainKey ? `<div class="s-img"><div class="aframe"><div class="frame-img">${img(mainKey, 'photo', main!.caption ?? s.title)}</div></div></div>` : ''}
</div>`,
    });
    // بقية الصور مرتبة حسب الاتجاه: صورتان طوليتان في صفحة، والأفقية صفحة كاملة
    packImagePages(sImgs.slice(1)).forEach((slot) => {
      const items = slot.images.map((m) => ({ key: imageKey.get(m.id) ?? null, caption: m.caption }));
      page({ heading: s.title, pageNo: ++pageNo, accent, tab: i, body: imageBody(items, s.title) });
    });
  });

  packImagePages(unassigned).forEach((slot, idx) => {
    const items = slot.images.map((m) => ({ key: imageKey.get(m.id) ?? null, caption: m.caption }));
    page({
      heading: 'صور من الدورة',
      pageNo: ++pageNo,
      body: imageBody(items, idx === 0 ? 'صور من الدورة' : undefined),
    });
  });

  if ((interior.length + 2) % 2 !== 0) {
    interior.push(`<div class="flip-page mag"><div class="pg out-left" style="--ac:${GOLD.main};--acd:${GOLD.deep};--act:${GOLD.tint}">${star('bstar')}</div></div>`);
  }

  const coverPage = `<div class="flip-page cover" data-density="hard">
${img(coverKey, 'cover-bg')}
<div class="cover-shade"></div><div class="frame"></div>${star('cover-star')}
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
<div class="frame dim"></div>${star('back-star')}
<div class="back-logo">${img('logoW', 'logo-xl', 'جامعة نايف العربية للعلوم الأمنية')}</div>
<div class="back-text"><div class="bar"></div><p class="b1">إدارة عمليات التدريب</p><p class="b2">وكالة الجامعة للتدريب</p><p class="b3">جامعة نايف العربية للعلوم الأمنية</p></div>
</div>`;

  // ---- عارض «القصص» للجوال: شاشة كاملة لكل صفحة، سحب أفقي، وشريط تقدّم بألوان المحاور ----
  const stories: string[] = [];
  const storySections: { start: number; length: number; color: string }[] = [];
  const closeSection = (start: number, color: string) => storySections.push({ start, length: stories.length - start, color });
  const storySessionStart: number[] = [];
  const dateRange = formatDateRange(course.start_date, course.end_date);

  stories.push(`<div class="st-cover">${img(coverKey, 'st-bg')}<div class="st-shade"></div>${star('st-star-tl')}${img('logoW', 'st-logo', 'جامعة نايف العربية للعلوم الأمنية')}
<div class="st-cover-text"><i class="st-bar"></i><p class="st-kicker">الدورة التدريبية</p><h1>${esc(course.title)}</h1>
${dateRange ? `<p class="st-meta">${esc(dateRange)}</p>` : ''}${course.location ? `<p class="st-meta">${esc(course.location)}</p>` : ''}
<p class="st-hint">← اسحب أو المس يسار الشاشة للتصفح</p></div></div>`);
  if (course.welcome_text) {
    stories.push(`<div class="st-paper">${star('st-star-br')}<div class="st-center">${star('st-orn')}<p class="st-welcome">${esc(course.welcome_text)}</p><i class="st-bar"></i></div></div>`);
  }
  stories.push(`<div class="st-paper">${star('st-star-br')}<div class="st-scroll st-text"><h2 class="st-h2">عن الدورة</h2><i class="st-bar"></i>
${course.description ? `<p class="st-desc">${esc(course.description)}</p>` : ''}
${course.trainer_names.length ? `<h3 class="st-h3">المدربون</h3><div class="chips">${course.trainer_names.map((n) => `<span>${esc(n)}</span>`).join('')}</div>` : ''}
${coordinator ? `<p class="st-by">إعداد المجلة: <b>${esc(coordinator.full_name)}</b></p>` : ''}</div></div>`);
  const tocIndex = sessions.length ? stories.length : -1;
  if (sessions.length) stories.push('');
  closeSection(0, '#ffffff');

  sessions.forEach((s, i) => {
    const a = sessionAccent(i);
    const start = stories.length;
    storySessionStart.push(start);
    const imgs = bySession.get(s.id) ?? [];
    const mainKey = imgs[0] ? imageKey.get(imgs[0].id) ?? null : null;
    stories.push(`<div class="st-session" style="--ac:${a.main};--acd:${a.deep};--act:${a.tint}"><div class="st-hero">${img(mainKey, 'st-cover-img')}<div class="st-hero-shade"></div></div>
${star('st-star-bl')}<span class="st-num">${toArabic(i + 1)}</span>
<div class="st-scroll st-sbody"><span class="kick"><i></i>الجلسة ${esc(sessionOrdinal(i))}</span><h2>${esc(s.title)}</h2><div class="gbar"></div>${s.description ? `<p class="st-desc">${esc(s.description)}</p>` : ''}</div></div>`);
    for (const m of groupByOrientation(imgs.slice(1))) stories.push(photoStory(m, a, i, s.title));
    closeSection(start, a.main);
  });
  if (unassigned.length) {
    const start = stories.length;
    for (const m of groupByOrientation(unassigned)) stories.push(photoStory(m, GOLD, null, 'صور من الدورة'));
    closeSection(start, GOLD.main);
  }
  const backIdx = stories.length;
  stories.push(`<div class="st-back">${star('st-star-br2')}${img('logoW', 'st-back-logo', 'جامعة نايف العربية للعلوم الأمنية')}
<div class="st-back-text"><i class="st-bar"></i><p class="b1">إدارة عمليات التدريب</p><p class="b2">وكالة الجامعة للتدريب</p><p class="b3">جامعة نايف العربية للعلوم الأمنية</p></div>
<button type="button" class="st-btn" data-go="0">العودة للغلاف</button></div>`);
  closeSection(backIdx, GOLD.main);

  if (tocIndex >= 0) {
    stories[tocIndex] = `<div class="st-paper">${star('st-star-br')}<div class="st-scroll st-toc"><h2 class="st-h2">المحتويات</h2><i class="st-bar"></i><ol>${sessions
      .map((s, i) => {
        const a = sessionAccent(i);
        return `<li><button type="button" data-go="${storySessionStart[i]}"><span class="toc-n" style="background:linear-gradient(135deg,${a.main},${a.deep})">${toArabic(i + 1)}</span><span class="st-toc-t" style="color:${a.deep}">${esc(s.title)}</span><span class="st-chev">‹</span></button></li>`;
      })
      .join('')}</ol></div></div>`;
  }

  function photoStory(m: (typeof images)[number], a: SessionAccent, index: number | null, title: string): string {
    const key = imageKey.get(m.id) ?? null;
    const portrait = orientationOf(m) === 'portrait';
    return `<div class="st-photo">${portrait ? '' : img(key, 'st-blur')}${img(key, portrait ? 'st-fill' : 'st-fit', m.caption ?? title)}<div class="st-pshade"></div>
<div class="st-pcap">${index !== null ? `<span class="toc-n st-pn" style="background:linear-gradient(135deg,${a.main},${a.deep})">${toArabic(index + 1)}</span>` : ''}<div><p class="st-pt">${esc(title)}</p>${m.caption ? `<p class="st-pc">${esc(m.caption)}</p>` : ''}</div></div></div>`;
  }

  const storiesHtml = stories.map((html, i) => `<section class="st" data-index="${i}">${html}</section>`).join('\n');
  const storiesMeta = JSON.stringify(storySections);

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
.mag{background:#F7F3EC}
.pg{position:absolute;inset:0;overflow:hidden}
.glow{position:absolute;inset:0;background:radial-gradient(90% 70% at 100% 100%,var(--act) 0%,transparent 60%)}
.out-left .glow{background:radial-gradient(90% 70% at 0% 100%,var(--act) 0%,transparent 60%)}
.bstar{position:absolute;width:430px;height:433px;bottom:-140px;right:-140px;fill:var(--ac);opacity:.14;pointer-events:none}
.out-left .bstar{right:auto;left:-140px}
.accented .bstar{opacity:.1}
.tab{position:absolute;right:0;width:34px;height:74px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#fff;background:linear-gradient(180deg,var(--ac),var(--acd));border-radius:12px 0 0 12px;box-shadow:0 4px 6px -1px rgba(0,0,0,.12)}
.out-left .tab{right:auto;left:0;border-radius:0 12px 12px 0}
.tab b{font-size:17px;font-weight:700;line-height:1}
.tab-star{width:12px;height:12px;fill:#fff;opacity:.8}
.head{position:absolute;inset-inline:0;top:0;padding:16px 28px 0}
.head-row{display:flex;align-items:center;justify-content:space-between}
.heading{display:flex;min-width:0;align-items:center;gap:8px;padding-left:12px;font-size:12px;font-weight:600;color:${PRIMARY}}
.accented .heading{color:var(--ac)}
.heading i{width:6px;height:6px;flex-shrink:0;border-radius:9999px;background:var(--ac)}
.heading span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.logos{display:flex;flex-shrink:0;align-items:center;gap:10px}
.logo-sm{height:28px;object-fit:contain}
.logos .sep{height:24px;width:1px;background:rgba(185,156,107,.4)}
.rule{margin-top:8px;height:1px;background:linear-gradient(to left,var(--ac),transparent);opacity:.55}
.out-left .rule{background:linear-gradient(to right,var(--ac),transparent)}
.content{position:absolute;top:64px;bottom:48px;left:30px;right:30px;overflow:hidden}
.has-tab.out-right .content{right:52px}
.has-tab.out-left .content{left:52px}
.foot{position:absolute;left:24px;right:24px;bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid color-mix(in srgb,var(--ac) 20%,transparent);padding-top:8px}
.out-left .foot{flex-direction:row-reverse}
.num{display:flex;width:24px;height:24px;flex-shrink:0;align-items:center;justify-content:center;border-radius:9999px;background:linear-gradient(135deg,var(--ac),var(--acd));font-size:10px;font-weight:700;color:#fff}
.ct{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:10px;letter-spacing:.025em;color:${MUTED}}
.desc{white-space:pre-line;font-size:13.5px;line-height:1.625;color:#2a302d}
.stitle{font-size:21px;font-weight:600;color:${PRIMARY}}
.sbar{height:3px;width:56px;border-radius:9999px;margin:8px 0 12px;background:linear-gradient(to left,var(--ac),var(--act))}
.orn{display:flex;align-items:center;gap:12px}
.orn span{height:1px;width:56px;background:linear-gradient(to left,${SECONDARY},transparent)}
.orn span:last-child{background:linear-gradient(to right,${SECONDARY},transparent)}
.orn-star{width:20px;height:20px;fill:${SECONDARY}}
.welcome{display:flex;height:100%;flex-direction:column;align-items:center;justify-content:center;padding:0 32px;text-align:center}
.welcome p{max-width:85%;margin:24px 0;font-size:16px;font-weight:500;line-height:2.1;color:${PRIMARY}}
.intro{display:flex;height:100%;flex-direction:column;justify-content:center}
.trainers{margin-top:20px}
.trainers h3{margin-bottom:8px;font-size:16px;font-weight:600;color:${PRIMARY}}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chips span{border-radius:8px;border:1px solid rgba(185,156,107,.4);background:rgba(255,255,255,.8);padding:4px 12px;font-size:13px;color:${PRIMARY};box-shadow:0 1px 2px rgba(0,0,0,.05)}
.coord{margin-top:20px;display:flex;align-items:center;gap:12px;border-radius:12px;border:1px solid rgba(185,156,107,.3);background:rgba(255,255,255,.7);padding:12px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.avatar{width:48px;height:48px;flex-shrink:0;border-radius:9999px;border:1px solid rgba(185,156,107,.5);object-fit:cover}
.coord .lbl{font-size:11px;color:${MUTED}}.coord .name{font-size:13.5px;font-weight:600;color:${PRIMARY}}
/* صفحة المحور */
.bignum{position:absolute;top:0;right:-4px;font-size:170px;font-weight:700;line-height:1;color:var(--act);pointer-events:none;user-select:none}
.session{position:relative;display:flex;height:100%;gap:24px}
.s-text{display:flex;width:100%;flex-direction:column;justify-content:center}
.session.has-img .s-text{width:44%;flex-shrink:0}
.kick{margin-bottom:8px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.025em;color:var(--ac)}
.kick i{height:3px;width:24px;border-radius:9999px;background:var(--ac)}
.s-text h2{font-size:22px;font-weight:600;line-height:1.375;color:var(--acd)}
.s-text .gbar{height:3px;width:56px;border-radius:9999px;margin:10px 0 12px;background:linear-gradient(to left,var(--ac),${SECONDARY})}
.s-text .desc{font-size:13px}
.s-meta{margin-bottom:12px;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;color:${MUTED}}
.s-img{display:flex;flex:1;min-width:0;min-height:0;align-items:center;justify-content:center}
/* إطار الصورة فوق كتلة بلون المحور مزاحة نحو الحافة الخارجية */
.aframe{position:relative;max-width:100%}
.aframe::before{content:"";position:absolute;inset:0;border-radius:12px;background:linear-gradient(135deg,var(--ac),var(--acd));transform:translate(12px,12px)}
.out-left .aframe::before{transform:translate(-12px,12px)}
.aframe.sm::before{transform:translate(8px,8px)}
.out-left .aframe.sm::before{transform:translate(-8px,8px)}
.frame-img{position:relative;overflow:hidden;border-radius:12px;background:#fff;padding:6px;box-shadow:0 10px 15px -3px rgba(0,0,0,.12),0 4px 6px -4px rgba(0,0,0,.1)}
.photo{display:block;width:auto;max-width:100%;border-radius:8px;object-fit:contain}
.s-img .photo{max-height:400px}
.portrait .session{flex-direction:column;justify-content:center}
.portrait .session.has-img .s-text{width:100%}
.portrait .s-img .photo{max-height:320px}
.portrait .bignum{top:-10px}
.img-page{display:flex;height:100%;flex-direction:column}
.section{margin-bottom:12px;display:flex;flex-shrink:0;align-items:center;gap:8px}
.section i{height:3px;width:24px;flex-shrink:0;border-radius:9999px;background:var(--ac)}
.section h2{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:16px;font-weight:600;color:var(--acd)}
.img-wrap{display:flex;min-height:0;flex:1;align-items:center;justify-content:center;padding-bottom:12px}
.img-wrap .cell{display:flex;justify-content:center}
.img-wrap.pair{gap:28px}
.img-wrap.pair .cell{flex:1;min-width:0}
.img-page .photo{max-height:420px}
.img-page.labeled .photo{max-height:380px}
.img-page.captioned .photo{max-height:390px}
.img-page.labeled.captioned .photo{max-height:350px}
.portrait .img-page .photo{max-height:640px}
.portrait .img-page.labeled .photo{max-height:600px}
.caption{flex-shrink:0;text-align:center}
.caption p{font-size:13px;font-weight:500;color:${PRIMARY}}
/* المحتويات */
.toc{display:flex;height:100%;flex-direction:column;justify-content:center}
.toc ol{list-style:none}
.toc li{display:flex;align-items:center;gap:12px;margin-bottom:8px;font-size:13.5px}
.toc.dense li{margin-bottom:4px;font-size:12px}
.toc-n{display:flex;width:32px;height:24px;flex-shrink:0;align-items:center;justify-content:center;border-radius:8px 2px 2px 8px;font-size:11px;font-weight:700;color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.toc.dense .toc-n{width:28px;height:20px;font-size:10px}
.toc-t{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:500}
.toc-dots{flex:1;min-width:24px;border-bottom:1px dotted}
.toc-p{flex-shrink:0;color:${MUTED};font-variant-numeric:tabular-nums}
/* نجمة كبيرة على الغلافين */
.cover-star{position:absolute;width:520px;height:523px;top:-170px;left:-170px;fill:#fff;opacity:.1;pointer-events:none}
.back-star{position:absolute;width:560px;height:563px;bottom:-190px;right:-190px;fill:${SECONDARY};opacity:.16;pointer-events:none}
/* عارض القصص (الجوال) */
.stories{position:fixed;inset:0;background:#000;z-index:5}
.stories[hidden]{display:none}
.s-top{position:absolute;inset-inline:0;top:0;z-index:3;padding:max(env(safe-area-inset-top),10px) 12px 22px;background:linear-gradient(to bottom,rgba(0,0,0,.55),transparent);pointer-events:none}
.s-bar{display:flex;gap:4px}
.s-seg{height:4px;border-radius:9999px;background:rgba(255,255,255,.25);overflow:hidden}
.s-seg i{display:block;height:100%;width:0;border-radius:9999px;transition:width .3s}
.s-row{margin-top:10px;display:flex;justify-content:center}
.s-count{border-radius:9999px;background:rgba(0,0,0,.3);padding:3px 12px;font-size:12px;color:rgba(255,255,255,.85);font-variant-numeric:tabular-nums}
.s-scroll{display:flex;height:100dvh;width:100%;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;overscroll-behavior:contain;scrollbar-width:none}
.s-scroll::-webkit-scrollbar{display:none}
.st{position:relative;height:100%;width:100%;flex-shrink:0;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden}
.st>div{position:relative;width:100%;height:100%;overflow:hidden}
.st svg{position:absolute;pointer-events:none}
.st-scroll{overflow-y:auto}
.st-bar{display:block;height:4px;width:56px;border-radius:9999px;background:${SECONDARY};margin:10px 0 14px}
.st-cover{background:${PRIMARY};color:#fff}
.st-bg,.st-cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.st-shade{position:absolute;inset:0;background:linear-gradient(to top,${PRIMARY_DARK},rgba(14,92,80,.6),rgba(0,0,0,.3))}
.st-star-tl{width:320px;height:322px;left:-96px;top:-96px;fill:#fff;opacity:.1}
.st-logo{position:absolute;right:24px;top:80px;height:56px;object-fit:contain}
.st-cover-text{position:absolute;inset-inline:0;bottom:0;padding:28px 28px 64px}
.st-cover-text .st-bar{height:6px;width:64px;margin:0 0 12px}
.st-kicker{font-size:14px;font-weight:500;color:${SECONDARY};margin-bottom:6px}
.st-cover h1{font-size:30px;font-weight:600;line-height:1.35}
.st-meta{margin-top:8px;font-size:14px;color:rgba(255,255,255,.85)}
.st-hint{margin-top:28px;font-size:12px;color:rgba(255,255,255,.6)}
.st-paper{background:#F7F3EC}
.st-paper::before{content:"";position:absolute;inset:0;background:radial-gradient(90% 60% at 100% 100%,#F3ECE0 0%,transparent 65%)}
.st-star-br{width:320px;height:322px;right:-112px;bottom:-112px;fill:${SECONDARY};opacity:.13}
.st-center{position:relative;display:flex;height:100%;flex-direction:column;align-items:center;justify-content:center;padding:0 32px;text-align:center}
.st-orn{position:static!important;width:48px;height:48px;fill:${SECONDARY};margin-bottom:24px}
.st-welcome{font-size:18px;font-weight:500;line-height:2.1;color:${PRIMARY}}
.st-text,.st-toc{position:relative;height:100%;padding:96px 28px 40px}
.st-text{display:flex;flex-direction:column;justify-content:center}
.st-h2{font-size:24px;font-weight:600;color:${PRIMARY}}
.st-h3{margin:22px 0 8px;font-weight:600;color:${PRIMARY}}
.st-desc{white-space:pre-line;line-height:2;color:#2a302d}
.st-by{margin-top:22px;font-size:14px;color:${MUTED}}.st-by b{color:${PRIMARY}}
.st-toc ol{list-style:none;display:flex;flex-direction:column;gap:10px}
.st-toc button{display:flex;width:100%;align-items:center;gap:12px;border:0;border-radius:16px;background:rgba(255,255,255,.85);padding:12px;font:inherit;text-align:right;box-shadow:0 1px 2px rgba(0,0,0,.05);cursor:pointer}
.st-toc .toc-n{width:40px;height:36px;font-size:13px}
.st-toc-t{flex:1;min-width:0;font-size:15px;font-weight:500;line-height:1.4}
.st-chev{color:${MUTED};font-size:20px}
.st-session{background:#F7F3EC;display:flex;flex-direction:column}
.st-hero{position:relative;height:46%;flex-shrink:0;overflow:hidden;background:var(--ac);border-bottom:6px solid var(--ac)}
.st-hero-shade{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.5),transparent,rgba(0,0,0,.3))}
.st-star-bl{width:320px;height:322px;left:-112px;bottom:-112px;fill:var(--ac);opacity:.1}
.st-num{position:absolute;left:16px;top:47%;font-size:150px;font-weight:700;line-height:1;color:var(--act);pointer-events:none}
.st-sbody{position:relative;flex:1;padding:24px 28px 40px}
.st-sbody h2{margin-top:8px;font-size:24px;font-weight:600;line-height:1.4;color:var(--acd)}
.st-sbody .gbar{height:3px;width:56px;border-radius:9999px;margin:12px 0;background:linear-gradient(to left,var(--ac),${SECONDARY})}
.st-photo{background:#000}
.st-blur{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(1.25);filter:blur(28px) brightness(.9) saturate(1.25);opacity:.9}
.st-fill,.st-fit{position:absolute;inset:0;width:100%;height:100%}
.st-fill{object-fit:cover}.st-fit{object-fit:contain}
.st-pshade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.55),transparent 22%,transparent 72%,rgba(0,0,0,.7))}
.st-pcap{position:absolute;inset-inline:0;bottom:0;display:flex;align-items:flex-end;gap:12px;padding:24px 24px 40px;color:#fff}
.st-pn{width:40px;height:36px;font-size:13px}
.st-pt{font-size:14px;font-weight:600}.st-pc{font-size:12px;color:rgba(255,255,255,.8)}
.st-back{display:flex!important;flex-direction:column;align-items:center;justify-content:center;background:${PRIMARY};color:#fff;text-align:center}
.st-star-br2{width:384px;height:386px;right:-128px;bottom:-128px;fill:${SECONDARY};opacity:.18}
.st-back-logo{position:relative;height:96px;object-fit:contain}
.st-back-text{position:relative;margin-top:56px;display:flex;flex-direction:column;align-items:center;gap:4px}
.st-back-text .st-bar{margin:0 0 12px}
.st-btn{position:relative;margin-top:40px;border:0;border-radius:16px;background:rgba(255,255,255,.15);padding:10px 20px;font:inherit;font-size:14px;color:#fff;cursor:pointer}
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
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="nauss-star" viewBox="${STAR_VIEWBOX}"><path fill-rule="evenodd" d="${STAR_PATH}"/></symbol></svg>
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
<div class="stories" id="stories" hidden>
<div class="s-top"><div class="s-bar" id="sbar"></div><div class="s-row"><span class="s-count" id="scount"></span></div></div>
<div class="s-scroll" id="sscroll"></div>
</div>
<template id="stories-tpl">
${storiesHtml}
</template>
<script>var ASSETS=${assetsJson};var STORY_SECTIONS=${storiesMeta};</script>
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
  // ---- القصص (الجوال) ----
  var stories=document.getElementById('stories'),sscroll=document.getElementById('sscroll'),sbar=document.getElementById('sbar'),scount=document.getElementById('scount');
  var sMounted=false,sCur=0,sEls=[],segs=[];
  function fillImgs(el){var imgs=el.querySelectorAll('img[data-k]');for(var j=0;j<imgs.length;j++){var src=ASSETS[imgs[j].getAttribute('data-k')];if(src)imgs[j].src=src;}}
  function sGo(i){var el=sEls[Math.max(0,Math.min(i,sEls.length-1))];if(el)el.scrollIntoView({behavior:'smooth',inline:'start',block:'nearest'});}
  function sUpdate(){
    scount.textContent=ar(sCur+1)+' / '+ar(sEls.length);
    for(var k=0;k<STORY_SECTIONS.length;k++){var sec=STORY_SECTIONS[k],f=sCur>=sec.start+sec.length?1:sCur<sec.start?0:(sCur-sec.start+1)/sec.length;segs[k].style.width=(f*100)+'%';}
  }
  function mountStories(){
    if(sMounted)return;sMounted=true;
    sscroll.appendChild(document.getElementById('stories-tpl').content.cloneNode(true));
    fillImgs(sscroll);
    sEls=Array.prototype.slice.call(sscroll.querySelectorAll('section.st'));
    STORY_SECTIONS.forEach(function(sec){var d=document.createElement('div');d.className='s-seg';d.style.flex=String(Math.max(1,sec.length));var i=document.createElement('i');i.style.background=sec.color;d.appendChild(i);sbar.appendChild(d);segs.push(i);});
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){sCur=+e.target.getAttribute('data-index');sUpdate();}});},{root:sscroll,threshold:.6});
    sEls.forEach(function(el){io.observe(el);});
    sscroll.addEventListener('click',function(e){
      var go=e.target.closest('[data-go]');if(go){sGo(+go.getAttribute('data-go'));return;}
      if(e.target.closest('a,button,.st-scroll'))return;
      var x=e.clientX/window.innerWidth;if(x<.33)sGo(sCur+1);else if(x>.67)sGo(sCur-1);
    });
    sUpdate();
  }
  function layout(){
    var single=window.innerWidth<768,s=single?PORT:LAND,pages=single?1:2;
    // الجوال: عارض القصص بدل التقليب
    if(single){
      if(pf){try{pf.destroy();}catch(e){}pf=null;}
      mode='s';root.style.display='none';stories.hidden=false;mountStories();return;
    }
    root.style.display='';stories.hidden=true;
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
    if(mode==='s'){if(e.key==='ArrowLeft')sGo(sCur+1);else if(e.key==='ArrowRight')sGo(sCur-1);return;}
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
