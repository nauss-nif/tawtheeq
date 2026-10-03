import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
  Svg,
  Path,
  Defs,
  LinearGradient,
  Stop,
  Rect,
} from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import type { Course, Session } from '@/lib/database.types';
import { formatDateRange, toArabicDigits as toArabic } from '@/lib/text';
import { GOLD, sessionAccent, sessionOrdinal, tabTopRatio, type SessionAccent } from './accents';
import { STAR_H, STAR_PATH, STAR_VIEWBOX, STAR_W } from './brandStar';
import { PDF_PAGE, PDF_HERO_BAND, PDF_TITLE_BAND, PDF_PAIR_GAP } from './pdfLayout';
import { orientationOf, packImagePages, sessionPageCount, type ImageSlot } from './imageLayout';
import { pdfText, splitArabicLatin } from './pdfText';

/**
 * مجلة PDF مربعة (٢١×٢١ سم) بأسلوب تحريري: غلاف كامل، صفحة «عن الدورة»، صفحة محتويات
 * مستقلة، صفحة رئيسية لكل محور بلونه المميّز، ثم صفحة كاملة لكل صورة. الصور تُمرَّر JPEG/base64.
 *
 * الخط El Messiri (نسخة ElMessiri-PDF-* بعلامات اتجاه صفرية العرض): خط Cairo يُلصق «في» بالكلمة السابقة داخل الـPDF (خلل في تطبيق الـkerning
 * من اليمين لليسار في مكتبة التشكيل)، ومعه Noto Sans احتياطيًا للحروف اللاتينية الموسّعة مثل «ə».
 */

export interface PdfAssets {
  fontRegular: string;
  fontSemiBold: string;
  fontLatinRegular: string;
  fontLatinSemiBold: string;
  logoNauss: string;
  logoMoi: string;
  logoNaussWhite: string;
  logoStar: string; // النجمة الذهبية (للترويسة)
  watermark: string | null; // معلم المدينة (خلفية شفافة)
  showMoi: boolean; // إظهار شعار برامج الشراكات
  coverImage: string | null;
  coordinator: { name: string; jobTitle: string | null; avatar: string | null } | null;
  /** width/height: أبعاد الصورة الأصلية (لتحديد الاتجاه)، w/h: أبعادها بعد القص الذكي */
  images: { id: string; src: string; caption: string | null; sessionId: string | null; w: number; h: number; width: number | null; height: number | null }[];
}

const C = {
  primary: '#0E5C50',
  primaryDark: '#0A4A40',
  secondary: '#B99C6B',
  bg: '#F6F2EA',
  surface: '#FFFFFF',
  muted: '#8B8178',
  ink: '#22271F',
};

// سلسلة خطوط: El Messiri أولًا، وNoto Sans لما لا يغطيه من حروف لاتينية
const FONT = ['Messiri', 'NotoLatin'] as unknown as string;

let registered = false;
function ensureFonts(assets: PdfAssets) {
  if (registered) return;
  Font.register({
    family: 'Messiri',
    fonts: [
      { src: assets.fontRegular, fontWeight: 400 },
      { src: assets.fontSemiBold, fontWeight: 600 },
    ],
  });
  Font.register({
    family: 'NotoLatin',
    fonts: [
      { src: assets.fontLatinRegular, fontWeight: 400 },
      { src: assets.fontLatinSemiBold, fontWeight: 600 },
    ],
  });
  // لا نقطع الكلمات بشرطة عند نهاية السطر
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

const s = StyleSheet.create({
  page: { fontFamily: FONT, backgroundColor: C.bg, color: C.ink },

  // ترويسة/تذييل الصفحات الداخلية
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 36, paddingTop: 22 },
  headerTitle: { fontSize: 10, fontWeight: 600, color: C.primary, textAlign: 'right', flex: 1 },
  headerLogo: { height: 20, width: 20, objectFit: 'contain', marginRight: 10 },
  headerRule: { marginHorizontal: 36, marginTop: 7, height: 1, backgroundColor: C.secondary, opacity: 0.5 },
  footer: { position: 'absolute', bottom: 16, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontSize: 8, color: C.muted },
  pageNum: { fontSize: 9, fontWeight: 600, color: '#fff', backgroundColor: C.primary, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 1 },

  body: { paddingHorizontal: 36, paddingTop: 14 },
  h2: { color: C.primary, fontSize: 17, fontWeight: 600, textAlign: 'right' },
  hr: { width: 52, height: 3, backgroundColor: C.secondary, borderRadius: 2, marginTop: 5, marginBottom: 10, alignSelf: 'flex-end' },
  para: { color: C.ink, fontSize: 11, lineHeight: 1.8, textAlign: 'right' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 5 },
  chip: { fontSize: 9.5, color: C.primary, backgroundColor: '#fff', border: `1px solid ${C.secondary}66`, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  pageBadge: { position: 'absolute', bottom: 14, left: 18, fontSize: 9, fontWeight: 600, color: '#fff', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 1 },
});

/**
 * نص عربي للـPDF: يعالج «لا» (انظر pdfText.ts) ويضبط اتجاه الفقرة RTL
 * حتى تبقى علامات الترقيم في نهاية الجملة.
 */
type TextStyle = Style | Style[];

function T({ style, children, wrap }: { style?: TextStyle; children?: React.ReactNode; wrap?: boolean }) {
  const parts = React.Children.toArray(children);
  const plain = parts.every((c) => typeof c === 'string' || typeof c === 'number');
  return (
    <Text style={style} wrap={wrap}>
      {plain ? pdfText(parts.join('')) : children}
    </Text>
  );
}

/** شارة مدرب: الرتبة يمينًا والاسم اللاتيني يسارًا (انظر splitArabicLatin) */
function TrainerChip({ name }: { name: string }) {
  const parts = splitArabicLatin(name);
  if (!parts) return <T style={s.chip}>{name}</T>;
  return (
    <View style={[s.chip, { flexDirection: 'row', gap: 3 }]}>
      <T>{parts.latin}</T>
      <T>{parts.arabic}</T>
    </View>
  );
}

type Pos = { top?: number; bottom?: number; left?: number; right?: number };

/**
 * نجمة شعار الجامعة المتجهة بلون وشفافية محددين، تُوضع مقصوصة عند الزوايا.
 * تُلفّ بإطار مطلق بحجم حاويتها يقصّ ما يتجاوز الحافة: عنصر يمتد خارج الصفحة
 * يُدخل محرّك التقسيم في @react-pdf في حلقة لا نهائية حين يقترب المحتوى من ملء الصفحة.
 */
function PdfStar({ color, opacity, size, ...pos }: { color: string; opacity: number; size: number } & Pos) {
  return (
    <View fixed style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <Svg viewBox={STAR_VIEWBOX} style={{ position: 'absolute', width: size, height: (size * STAR_H) / STAR_W, ...pos }}>
        <Path d={STAR_PATH} fill={color} fillOpacity={opacity} fillRule="evenodd" />
      </Svg>
    </View>
  );
}

/** لسان فهرسة على الحافة اليمنى بلون المحور، يتدرّج موضعه من محور لآخر */
function PdfTab({ accent, index }: { accent: SessionAccent; index: number }) {
  const top = tabTopRatio(index) * PDF_PAGE[1];
  const id = `tab-${index}`;
  return (
    <View style={{ position: 'absolute', right: 0, top, width: 30, height: 66 }}>
      <Svg viewBox="0 0 30 66" style={{ position: 'absolute', top: 0, left: 0, width: 30, height: 66 }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accent.main} />
            <Stop offset="1" stopColor={accent.deep} />
          </LinearGradient>
        </Defs>
        {/* مستطيل أعرض من اللسان: زواياه اليمنى خارج الصفحة فتبقى الزاويتان اليسريان مدوّرتين */}
        <Rect x="0" y="0" width="44" height="66" rx="10" fill={`url(#${id})`} />
      </Svg>
      <T style={{ position: 'absolute', top: 12, left: 0, width: 30, textAlign: 'center', color: '#fff', fontSize: 15, fontWeight: 600 }}>
        {toArabic(index + 1)}
      </T>
      <PdfStar color="#ffffff" opacity={0.85} size={10} top={42} left={10} />
    </View>
  );
}

/** ترويسة الصفحة الداخلية */
function Header({ heading, star }: { heading: string; star: string }) {
  return (
    <>
      <View style={s.header}>
        <Image src={star} style={s.headerLogo} />
        <T style={s.headerTitle}>{heading}</T>
      </View>
      <View style={s.headerRule} />
    </>
  );
}

/** تذييل ثابت: رقم الصفحة + عنوان الدورة */
function Footer({ n, courseTitle }: { n: number; courseTitle: string }) {
  return (
    <View style={s.footer}>
      <T style={s.pageNum}>{toArabic(n)}</T>
      <T style={s.footerText}>{courseTitle}</T>
    </View>
  );
}

/** صفحة صورة كبيرة تملأ الصفحة، فوقها عنوان المحور بلونه */
type PdfImage = PdfAssets['images'][number];

/** صفحة صور تحت عنوان المحور: أفقية تملأ الصفحة، أو طوليتان جنبًا إلى جنب، أو طولية متمركزة */
function bigImagePage(key: string, title: string, slot: ImageSlot<PdfImage>, n: number, accent?: SessionAccent, tabIndex?: number) {
  const color = accent?.main ?? C.primary;
  return (
    <Page key={`bi-${key}`} size={PDF_PAGE} style={{ fontFamily: FONT, backgroundColor: C.bg }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: PDF_TITLE_BAND, overflow: 'hidden', backgroundColor: accent?.tint ?? C.bg }}>
        <PdfStar color={color} opacity={0.14} size={230} top={-80} left={-70} />
      </View>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: PDF_TITLE_BAND, paddingLeft: 36, paddingRight: tabIndex !== undefined ? 46 : 36, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
          <T style={{ color: accent?.deep ?? C.primary, fontSize: 15, fontWeight: 600, textAlign: 'right', lineHeight: 1.35, maxWidth: 470 }}>{title}</T>
          <View style={{ width: 20, height: 3, backgroundColor: color, borderRadius: 2 }} />
        </View>
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, top: PDF_TITLE_BAND, height: 4, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: 0, right: 0, top: PDF_TITLE_BAND + 4, bottom: 0, flexDirection: 'row', justifyContent: 'center', gap: PDF_PAIR_GAP, backgroundColor: accent?.tint ?? C.bg }}>
        {slot.kind === 'pair' || orientationOf(slot.images[0]) === 'portrait' ? (
          slot.images.map((im) => (
            <Image key={im.id} src={im.src} style={{ width: (PDF_PAGE[0] - PDF_PAIR_GAP) / 2, height: '100%', objectFit: 'cover' }} />
          ))
        ) : (
          <Image src={slot.images[0].src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </View>
      {accent && tabIndex !== undefined ? <PdfTab accent={accent} index={tabIndex} /> : null}
      <T style={[s.pageBadge, { backgroundColor: color }]}>{toArabic(n)}</T>
    </Page>
  );
}

export function MagazinePDF({
  course,
  sessions,
  assets,
}: {
  course: Course;
  sessions: Session[];
  assets: PdfAssets;
}) {
  ensureFonts(assets);
  const dateText = formatDateRange(course.start_date, course.end_date);

  // نجمع الصور حسب الجلسة (كل الصور تُعرض تحت محاورها)
  type Img = PdfAssets['images'][number];
  const bySession = new Map<string, Img[]>();
  for (const sn of sessions) bySession.set(sn.id, []);
  const unassigned: Img[] = [];
  for (const im of assets.images) {
    if (im.sessionId && bySession.has(im.sessionId)) bySession.get(im.sessionId)!.push(im);
    else unassigned.push(im);
  }

  let pageNo = 0;

  // أرقام صفحات المحتويات: الترحيب (إن وُجد) ثم «عن الدورة» ثم المحتويات، ثم المحاور
  // (صفحة رئيسية لكل محور + صفحة لكل صورة إضافية)
  const tocPage = (course.welcome_text ? 1 : 0) + 2;
  let at = tocPage;
  const sessionStart = sessions.map((sn) => {
    const first = at + 1;
    at += sessionPageCount(bySession.get(sn.id) ?? []);
    return first;
  });
  // نصغّر الأسطر حين تكثر المحاور لتتسع في صفحة واحدة
  const tocRow = Math.max(17, Math.min(32, 390 / Math.max(1, sessions.length)));
  const tocFont = tocRow < 24 ? 10 : 11.5;

  return (
    <Document title={course.title} author="جامعة نايف العربية للعلوم الأمنية">
      {/* ===== الغلاف ===== */}
      <Page size={PDF_PAGE} style={s.page}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18, paddingVertical: 13, paddingHorizontal: 30 }}>
          {assets.showMoi ? <Image src={assets.logoMoi} style={{ height: 42, objectFit: 'contain' }} /> : null}
          {assets.showMoi ? <View style={{ width: 1, height: 30, backgroundColor: '#00000022' }} /> : null}
          <Image src={assets.logoNauss} style={{ height: 40, objectFit: 'contain' }} />
        </View>
        <View style={{ flex: 1, position: 'relative' }}>
          {assets.coverImage && (
            <Image src={assets.coverImage} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          <View style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(10,74,64,0.45)' }} />
          <PdfStar color="#ffffff" opacity={0.1} size={470} top={-150} left={-150} />
          <View style={{ position: 'absolute', top: 14, left: 14, right: 14, bottom: 14, border: `1.5px solid ${C.secondary}`, borderRadius: 6 }} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', backgroundColor: 'rgba(10,74,64,0.88)', paddingVertical: 24, paddingHorizontal: 34 }}>
            <View style={{ width: 64, height: 4, backgroundColor: C.secondary, borderRadius: 3, marginBottom: 12 }} />
            <T style={{ color: C.secondary, fontSize: 12, marginBottom: 6, textAlign: 'right' }}>الدورة التدريبية</T>
            <T style={{ color: '#fff', fontSize: 26, fontWeight: 600, textAlign: 'right', lineHeight: 1.35 }}>{course.title}</T>
            {dateText || course.location ? (
              <T style={{ color: '#ffffffcc', fontSize: 11.5, marginTop: 10, textAlign: 'right' }}>
                {[dateText, course.location].filter(Boolean).join('  ·  ')}
              </T>
            ) : null}
          </View>
        </View>
      </Page>

      {/* ===== صفحة الترحيب (اختيارية) ===== */}
      {course.welcome_text ? (
        <Page size={PDF_PAGE} style={s.page}>
          <PdfStar color={GOLD.main} opacity={0.14} size={400} bottom={-130} right={-130} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 58 }}>
            <Image src={assets.logoStar} style={{ width: 40, height: 40, objectFit: 'contain', marginBottom: 22 }} />
            <View style={{ width: 64, height: 4, backgroundColor: C.secondary, borderRadius: 2, marginBottom: 24 }} />
            <T style={{ fontSize: 15, lineHeight: 2, textAlign: 'center', color: C.primary }}>{course.welcome_text}</T>
            <View style={{ width: 64, height: 4, backgroundColor: C.secondary, borderRadius: 2, marginTop: 24 }} />
          </View>
          <Footer n={++pageNo} courseTitle={course.title} />
        </Page>
      ) : null}

      {/* ===== عن الدورة + المدربون + إعداد المجلة ===== */}
      <Page size={PDF_PAGE} style={s.page}>
        <PdfStar color={GOLD.main} opacity={0.14} size={400} bottom={-130} right={-130} />
        <Header heading={course.title} star={assets.logoStar} />
        <View style={[s.body, { flex: 1, justifyContent: 'center', paddingBottom: 46 }]}>
          {course.description ? (
            <View style={{ marginBottom: 18 }}>
              <T style={s.h2}>عن الدورة</T>
              <View style={s.hr} />
              <T style={s.para}>{course.description}</T>
            </View>
          ) : null}

          {course.trainer_names.length > 0 ? (
            <View style={{ marginBottom: 18 }}>
              <T style={s.h2}>المدربون</T>
              <View style={s.hr} />
              <View style={s.chipRow}>
                {course.trainer_names.map((t, i) => (
                  <TrainerChip key={i} name={t} />
                ))}
              </View>
            </View>
          ) : null}

          {assets.coordinator ? (
            <View>
              <T style={s.h2}>إعداد المجلة</T>
              <View style={s.hr} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
                <View style={{ alignItems: 'flex-end' }}>
                  <T style={{ fontSize: 12, fontWeight: 600, color: C.primary, textAlign: 'right' }}>{assets.coordinator.name}</T>
                  <T style={{ fontSize: 10, color: C.muted, textAlign: 'right', marginTop: 2 }}>{assets.coordinator.jobTitle || 'منسّق الدورة'}</T>
                  <T style={{ fontSize: 9, color: C.muted, textAlign: 'right', marginTop: 1 }}>إدارة عمليات التدريب · جامعة نايف العربية للعلوم الأمنية</T>
                </View>
                {assets.coordinator.avatar ? (
                  <Image src={assets.coordinator.avatar} style={{ width: 50, height: 50, borderRadius: 25, objectFit: 'cover' }} />
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
        <Footer n={++pageNo} courseTitle={course.title} />
      </Page>

      {/* ===== المحتويات: صفحة مستقلة — رقم المحور بلونه، العنوان، ثم رقم الصفحة ===== */}
      {sessions.length > 0 ? (
        <Page size={PDF_PAGE} style={s.page}>
          <PdfStar color={GOLD.main} opacity={0.14} size={400} bottom={-130} right={-130} />
          <Header heading="المحتويات" star={assets.logoStar} />
          <View style={[s.body, { flex: 1, justifyContent: 'center', paddingBottom: 46 }]}>
            <T style={[s.h2, { fontSize: 22 }]}>المحتويات</T>
            <View style={[s.hr, { marginBottom: 14 }]} />
            {sessions.map((sn, i) => {
              const ac = sessionAccent(i);
              return (
                <View key={sn.id} wrap={false} style={{ flexDirection: 'row', alignItems: 'center', minHeight: tocRow, gap: 8 }}>
                  <T style={{ fontSize: tocFont, color: C.muted, width: 20, textAlign: 'left' }}>{toArabic(sessionStart[i])}</T>
                  <View style={{ flex: 1, minWidth: 16, borderBottom: `1px dotted ${ac.main}88`, marginTop: 5 }} />
                  <T style={{ fontSize: tocFont, color: ac.deep, textAlign: 'right', maxWidth: 410 }}>{sn.title}</T>
                  <T style={{ fontSize: tocFont - 2, fontWeight: 600, color: '#fff', backgroundColor: ac.main, borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 2, borderBottomRightRadius: 2, width: 26, textAlign: 'center', paddingVertical: 2 }}>
                    {toArabic(i + 1)}
                  </T>
                </View>
              );
            })}
          </View>
          <Footer n={++pageNo} courseTitle={course.title} />
        </Page>
      ) : null}

      {/* ===== المحاور: صفحة رئيسية (صورة + عنوان + نص) بلون المحور، ثم صفحة كاملة لكل صورة إضافية ===== */}
      {sessions.map((sn, i) => {
        const imgs = bySession.get(sn.id) ?? [];
        const hero = imgs[0];
        const rest = imgs.slice(1);
        const imageTop = i % 2 === 0; // تناوب: صورة أعلى/أسفل لإيقاع بصري
        const BAND = PDF_HERO_BAND;
        const ac = sessionAccent(i);
        const heroNo = ++pageNo;
        const pages: JSX.Element[] = [
          <Page key={`sp-${sn.id}`} size={PDF_PAGE} style={{ fontFamily: FONT, backgroundColor: C.bg, color: C.ink }}>
            {/* الصورة الرئيسية ملء العرض */}
            <View style={{ position: 'absolute', left: 0, right: 0, height: BAND, [imageTop ? 'top' : 'bottom']: 0 }}>
              {hero ? (
                <Image src={hero.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <View style={{ width: '100%', height: '100%', backgroundColor: ac.main }} />
              )}
              <View style={{ position: 'absolute', left: 0, right: 0, height: 5, backgroundColor: ac.main, [imageTop ? 'bottom' : 'top']: 0 }} />
            </View>

            {/* منطقة النص */}
            <View style={{ position: 'absolute', left: 0, right: 0, [imageTop ? 'top' : 'bottom']: BAND, [imageTop ? 'bottom' : 'top']: 0, paddingLeft: 40, paddingRight: 50, justifyContent: 'center', overflow: 'hidden' }}>
              {/* نجمة الجامعة بلون المحور تخرج من الزاوية الخارجية */}
              <PdfStar color={ac.main} opacity={0.1} size={330} right={-110} {...(imageTop ? { bottom: -110 } : { top: -110 })} />
              <T style={{ position: 'absolute', top: 2, left: 24, fontSize: 110, fontWeight: 600, color: ac.tint }}>{toArabic(i + 1)}</T>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                <T style={{ color: ac.main, fontSize: 10.5, fontWeight: 600 }}>الجلسة {sessionOrdinal(i)}</T>
                <View style={{ width: 20, height: 3, backgroundColor: ac.main, borderRadius: 2 }} />
              </View>
              <T style={{ color: ac.deep, fontSize: 19, fontWeight: 600, textAlign: 'right', marginTop: 6, lineHeight: 1.35 }}>{sn.title}</T>
              <View style={{ width: 52, height: 3, backgroundColor: C.secondary, borderRadius: 2, marginTop: 7, marginBottom: 10, alignSelf: 'flex-end' }} />
              {sn.presenter || sn.time_label ? (
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 14, marginBottom: 8 }}>
                  {sn.time_label ? <T style={{ fontSize: 10, color: C.muted }}>{sn.time_label}</T> : null}
                  {sn.presenter ? <T style={{ fontSize: 10, color: C.muted }}>المقدّم: {sn.presenter}</T> : null}
                </View>
              ) : null}
              {sn.description ? <T style={{ fontSize: 11, lineHeight: 1.85, textAlign: 'right', color: C.ink }}>{sn.description}</T> : null}
            </View>

            <PdfTab accent={ac} index={i} />
            <T style={[s.pageBadge, { backgroundColor: ac.main }]}>{toArabic(heroNo)}</T>
          </Page>,
        ];
        // بقية الصور مرتبة حسب الاتجاه: صورتان طوليتان في صفحة، والأفقية صفحة كاملة
        packImagePages(rest).forEach((slot, j) => {
          pages.push(bigImagePage(`${sn.id}-${j}`, sn.title, slot, ++pageNo, ac, i));
        });
        return pages;
      })}

      {/* ===== الصور غير المرتبطة بمحور ===== */}
      {packImagePages(unassigned).map((slot, j) => bigImagePage(`u-${j}`, 'صور من الدورة', slot, ++pageNo))}

      {/* ===== الغلاف الخلفي: شعار الجامعة في المنتصف + عبارة ثابتة أسفل ===== */}
      <Page size={PDF_PAGE} style={s.page}>
        <View style={{ flex: 1, backgroundColor: C.primary, position: 'relative' }}>
          {assets.watermark ? (
            <Image src={assets.watermark} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.14 }} />
          ) : null}
          <PdfStar color={C.secondary} opacity={0.16} size={500} bottom={-170} right={-170} />
          <View style={{ position: 'absolute', top: 20, left: 20, right: 20, bottom: 20, border: `1.5px solid ${C.secondary}55`, borderRadius: 6 }} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Image src={assets.logoNaussWhite} style={{ width: 290, height: 104, objectFit: 'contain', alignSelf: 'center' }} />
          </View>
          <View style={{ alignItems: 'center', paddingBottom: 44 }}>
            <View style={{ width: 56, height: 4, backgroundColor: C.secondary, borderRadius: 2, marginBottom: 12 }} />
            <T style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>إدارة عمليات التدريب</T>
            <T style={{ color: '#ffffffcc', fontSize: 11.5, marginTop: 4 }}>وكالة الجامعة للتدريب</T>
            <T style={{ color: '#ffffffaa', fontSize: 10.5, marginTop: 2 }}>جامعة نايف العربية للعلوم الأمنية</T>
          </View>
        </View>
      </Page>
    </Document>
  );
}
