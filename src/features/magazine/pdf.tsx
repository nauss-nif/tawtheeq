import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import type { Course, Session } from '@/lib/database.types';

/**
 * مجلة PDF احترافية بأسلوب تحريري: غلاف كامل، صفحات مرقّمة بترويسة،
 * صور كبيرة بعرض الصفحة مع تعليقات أنيقة، وشعارات بارزة. الصور تُمرَّر JPEG/base64.
 */

export interface PdfAssets {
  fontRegular: string;
  fontSemiBold: string;
  logoNauss: string;
  logoMoi: string;
  logoNaussWhite: string;
  logoStar: string; // النجمة الذهبية (للترويسة)
  watermark: string | null; // معلم المدينة (خلفية شفافة)
  showMoi: boolean; // إظهار شعار برامج الشراكات
  coverImage: string | null;
  coordinator: { name: string; jobTitle: string | null; avatar: string | null } | null;
  images: { src: string; caption: string | null; sessionId: string | null; w: number; h: number }[];
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

let registered = false;
function ensureFonts(assets: PdfAssets) {
  if (registered) return;
  Font.register({
    family: 'Cairo',
    fonts: [
      { src: assets.fontRegular, fontWeight: 400 },
      { src: assets.fontSemiBold, fontWeight: 600 },
    ],
  });
  registered = true;
}

const s = StyleSheet.create({
  page: { fontFamily: 'Cairo', backgroundColor: C.bg, color: C.ink },

  // ترويسة/تذييل الصفحات الداخلية
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 40, paddingTop: 26 },
  headerTitle: { fontSize: 10.5, fontWeight: 600, color: C.primary, textAlign: 'right', flex: 1 },
  headerLogo: { height: 22, width: 22, objectFit: 'contain', marginRight: 10 },
  headerRule: { marginHorizontal: 40, marginTop: 8, height: 1, backgroundColor: C.secondary, opacity: 0.5 },
  footer: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontSize: 8.5, color: C.muted },
  pageNum: { fontSize: 9, fontWeight: 600, color: '#fff', backgroundColor: C.primary, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2 },

  body: { paddingHorizontal: 40, paddingTop: 20 },
  h2: { color: C.primary, fontSize: 20, fontWeight: 600, textAlign: 'right' },
  hr: { width: 56, height: 3, backgroundColor: C.secondary, borderRadius: 2, marginTop: 7, marginBottom: 16, alignSelf: 'flex-end' },
  para: { color: C.ink, fontSize: 12, lineHeight: 1.9, textAlign: 'right' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, marginTop: 4 },
  chip: { fontSize: 10.5, color: C.primary, backgroundColor: '#fff', border: `1px solid ${C.secondary}66`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },

  session: { marginBottom: 12, paddingRight: 12, borderRight: `2px solid ${C.secondary}`, borderRightStyle: 'solid' },
  sessionTitle: { fontSize: 12.5, fontWeight: 600, color: C.primary, textAlign: 'right' },
  sessionMeta: { fontSize: 10, color: C.muted, textAlign: 'right', marginTop: 2 },
  sessionDesc: { fontSize: 11, color: C.ink, lineHeight: 1.8, textAlign: 'right', marginTop: 3 },

  // صفحة الجلسة المقالية
  sessionBadge: { alignSelf: 'flex-end', backgroundColor: `${C.secondary}26`, color: C.secondary, fontSize: 10, fontWeight: 600, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 8 },
  sessionPageTitle: { fontSize: 18, fontWeight: 600, color: C.primary, textAlign: 'right' },
  sessionPageMeta: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 6, marginBottom: 4 },
  sessionMetaItem: { fontSize: 10.5, color: C.muted },
  sessionPageDesc: { fontSize: 12, color: C.ink, lineHeight: 1.9, textAlign: 'right', marginTop: 6 },

  // بطاقة صورة كبيرة بعرض الصفحة
  feature: { marginBottom: 18 },
  featureImg: { width: '100%', height: 250, objectFit: 'cover', borderRadius: 10 },
  captionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 7, gap: 8 },
  captionText: { fontSize: 11.5, fontWeight: 600, color: C.primary, textAlign: 'right' },
  captionDot: { width: 22, height: 3, backgroundColor: C.secondary, borderRadius: 2 },
});

/** ترويسة الصفحة الداخلية: تعرض عنوان الجلسة/القسم */
function Header({ heading, star }: { heading: string; star: string }) {
  return (
    <>
      <View style={s.header}>
        <Image src={star} style={s.headerLogo} />
        <Text style={s.headerTitle}>{heading}</Text>
      </View>
      <View style={s.headerRule} />
    </>
  );
}
/** تذييل ثابت: رقم الصفحة + عنوان الدورة */
function Footer({ n, courseTitle }: { n: number; courseTitle: string }) {
  return (
    <View style={s.footer}>
      <Text style={s.pageNum}>{n}</Text>
      <Text style={s.footerText}>{courseTitle}</Text>
    </View>
  );
}

/** صفحة صورة كبيرة تملأ الصفحة، فوقها عنوان المحور فقط */
function bigImagePage(key: string, title: string, src: string, n: number) {
  const TITLE_BAND = 117;
  return (
    <Page key={`bi-${key}`} size="A4" style={{ fontFamily: 'Cairo', backgroundColor: C.bg }}>
      {/* شريط العنوان أعلى */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: TITLE_BAND, paddingHorizontal: 44, paddingTop: 34 }}>
        <Text style={{ color: C.primary, fontSize: 19, fontWeight: 600, textAlign: 'right' }}>{title}</Text>
        <View style={{ width: 60, height: 3, backgroundColor: C.secondary, borderRadius: 2, marginTop: 8, alignSelf: 'flex-end' }} />
      </View>
      {/* الصورة تملأ ما تبقى من الصفحة */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: TITLE_BAND, bottom: 0 }}>
        <Image src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </View>
      <Text style={{ position: 'absolute', bottom: 16, left: 20, fontSize: 9, fontWeight: 600, color: '#fff', backgroundColor: C.primary, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2 }}>{n}</Text>
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
  const dateText = [course.start_date, course.end_date].filter(Boolean).join(' - ');

  // نجمع الصور حسب الجلسة (بلا معرض؛ كل الصور تُعرض تحت محاورها)
  type Img = PdfAssets['images'][number];
  const bySession = new Map<string, Img[]>();
  for (const sn of sessions) bySession.set(sn.id, []);
  const unassigned: Img[] = [];
  for (const im of assets.images) {
    if (im.sessionId && bySession.has(im.sessionId)) bySession.get(im.sessionId)!.push(im);
    else unassigned.push(im);
  }

  // كل المحاور تُعرض بترقيم تسلسلي، ولو لم تُسند لها صور
  const shownSessions = sessions;

  const toArabic = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);

  let pageNo = 0;

  return (
    <Document title={course.title} author="جامعة نايف العربية للعلوم الأمنية">
      {/* ===== الغلاف ===== */}
      <Page size="A4" style={s.page}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 20, paddingVertical: 18, paddingHorizontal: 34 }}>
          {assets.showMoi ? <Image src={assets.logoMoi} style={{ height: 48, objectFit: 'contain' }} /> : null}
          {assets.showMoi ? <View style={{ width: 1, height: 34, backgroundColor: '#00000022' }} /> : null}
          <Image src={assets.logoNauss} style={{ height: 46, objectFit: 'contain' }} />
        </View>
        <View style={{ flex: 1, position: 'relative' }}>
          {assets.coverImage && (
            <Image src={assets.coverImage} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          <View style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(10,74,64,0.5)' }} />
          <View style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, border: `1.5px solid ${C.secondary}`, borderRadius: 6 }} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', backgroundColor: 'rgba(10,74,64,0.88)', paddingVertical: 34, paddingHorizontal: 40 }}>
            <View style={{ width: 74, height: 5, backgroundColor: C.secondary, borderRadius: 3, marginBottom: 14 }} />
            <Text style={{ color: C.secondary, fontSize: 13, marginBottom: 8, textAlign: 'right' }}>الدورة التدريبية</Text>
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: 600, textAlign: 'right', lineHeight: 1.3 }}>{course.title}</Text>
            {dateText ? <Text style={{ color: '#ffffffcc', fontSize: 12, marginTop: 12, textAlign: 'right' }}>{dateText}</Text> : null}
            {course.location ? <Text style={{ color: '#ffffffcc', fontSize: 12, marginTop: 3, textAlign: 'right' }}>{course.location}</Text> : null}
          </View>
        </View>
      </Page>

      {/* ===== صفحة الترحيب (اختيارية) ===== */}
      {course.welcome_text ? (
        <Page size="A4" style={s.page}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 70 }}>
            <Image src={assets.logoStar} style={{ width: 44, height: 44, objectFit: 'contain', marginBottom: 26 }} />
            <View style={{ width: 70, height: 4, backgroundColor: C.secondary, borderRadius: 2, marginBottom: 28 }} />
            <Text style={{ fontSize: 15.5, lineHeight: 2.1, textAlign: 'center', color: C.primary }}>
              {course.welcome_text}
            </Text>
            <View style={{ width: 70, height: 4, backgroundColor: C.secondary, borderRadius: 2, marginTop: 28 }} />
          </View>
          <Footer n={++pageNo} courseTitle={course.title} />
        </Page>
      ) : null}

      {/* ===== التعريف + المدربون + الجدول ===== */}
      <Page size="A4" style={s.page}>
        <Header heading={course.title} star={assets.logoStar} />
        <View style={s.body}>
          {course.description ? (
            <View style={{ marginBottom: 24 }}>
              <Text style={s.h2}>عن الدورة</Text>
              <View style={s.hr} />
              <Text style={s.para}>{course.description}</Text>
            </View>
          ) : null}

          {course.trainer_names.length > 0 ? (
            <View style={{ marginBottom: 24 }}>
              <Text style={s.h2}>المدربون</Text>
              <View style={s.hr} />
              <View style={s.chipRow}>
                {course.trainer_names.map((t, i) => (
                  <Text key={i} style={s.chip}>{t}</Text>
                ))}
              </View>
            </View>
          ) : null}

          {assets.coordinator ? (
            <View style={{ marginBottom: 24 }}>
              <Text style={s.h2}>إعداد المجلة</Text>
              <View style={s.hr} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, fontWeight: 600, color: C.primary, textAlign: 'right' }}>{assets.coordinator.name}</Text>
                  <Text style={{ fontSize: 10.5, color: C.muted, textAlign: 'right', marginTop: 3 }}>{assets.coordinator.jobTitle || 'منسّق الدورة'}</Text>
                  <Text style={{ fontSize: 9.5, color: C.muted, textAlign: 'right', marginTop: 2 }}>إدارة عمليات التدريب · جامعة نايف العربية للعلوم الأمنية</Text>
                </View>
                {assets.coordinator.avatar ? (
                  <Image src={assets.coordinator.avatar} style={{ width: 58, height: 58, borderRadius: 29, objectFit: 'cover' }} />
                ) : null}
              </View>
            </View>
          ) : null}

          {shownSessions.length > 0 ? (
            <View>
              <Text style={s.h2}>محاور الدورة</Text>
              <View style={s.hr} />
              {shownSessions.map((sn, i) => (
                <View key={sn.id} style={s.session} wrap={false}>
                  <Text style={s.sessionTitle}>{toArabic(i + 1)}. {sn.title}</Text>
                  {sn.presenter ? <Text style={s.sessionMeta}>المقدّم: {sn.presenter}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <Footer n={++pageNo} courseTitle={course.title} />
      </Page>

      {/* ===== المحاور: صفحة رئيسية (صورة + عنوان + نص)، ثم صورة كبيرة لكل صورة إضافية ===== */}
      {shownSessions.map((sn, i) => {
        const imgs = bySession.get(sn.id) ?? [];
        const hero = imgs[0];
        const rest = imgs.slice(1);
        const imageTop = i % 2 === 0; // تناوب: صورة أعلى/أسفل لإيقاع بصري
        const BAND = 470;
        const heroNo = ++pageNo;
        const pages: JSX.Element[] = [
          <Page key={`sp-${sn.id}`} size="A4" style={{ fontFamily: 'Cairo', backgroundColor: C.bg, color: C.ink }}>
            {/* الصورة الرئيسية ملء العرض */}
            <View style={{ position: 'absolute', left: 0, right: 0, height: BAND, [imageTop ? 'top' : 'bottom']: 0 }}>
              {hero ? (
                <Image src={hero.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <View style={{ width: '100%', height: '100%', backgroundColor: C.primary }} />
              )}
              <View style={{ position: 'absolute', left: 0, right: 0, height: 6, backgroundColor: C.secondary, [imageTop ? 'bottom' : 'top']: 0 }} />
            </View>

            {/* منطقة النص */}
            <View style={{ position: 'absolute', left: 0, right: 0, [imageTop ? 'top' : 'bottom']: BAND, [imageTop ? 'bottom' : 'top']: 0, paddingHorizontal: 48, justifyContent: 'center' }}>
              <Text style={{ position: 'absolute', top: 8, left: 30, fontSize: 150, fontWeight: 600, color: 'rgba(185,156,107,0.13)' }}>{toArabic(i + 1)}</Text>
              <Text style={{ color: C.secondary, fontSize: 11, fontWeight: 600, textAlign: 'right' }}>الجلسة {toArabic(i + 1)}</Text>
              <Text style={{ color: C.primary, fontSize: 21, fontWeight: 600, textAlign: 'right', marginTop: 5, lineHeight: 1.3 }}>{sn.title}</Text>
              <View style={{ width: 64, height: 3, backgroundColor: C.secondary, borderRadius: 2, marginTop: 9, marginBottom: 12, alignSelf: 'flex-end' }} />
              {(sn.presenter || sn.time_label) ? (
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginBottom: 10 }}>
                  {sn.time_label ? <Text style={{ fontSize: 10.5, color: C.muted }}>{sn.time_label}</Text> : null}
                  {sn.presenter ? <Text style={{ fontSize: 10.5, color: C.muted }}>المقدّم: {sn.presenter}</Text> : null}
                </View>
              ) : null}
              {sn.description ? <Text style={{ fontSize: 12, lineHeight: 1.95, textAlign: 'right', color: C.ink }}>{sn.description}</Text> : null}
            </View>

            <Text style={{ position: 'absolute', bottom: 16, left: 24, fontSize: 9, fontWeight: 600, color: '#fff', backgroundColor: C.primary, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2 }}>{heroNo}</Text>
            <Text style={{ position: 'absolute', bottom: 20, right: 24, fontSize: 8, color: imageTop ? C.muted : '#ffffffcc' }}>{course.title}</Text>
          </Page>,
        ];
        // صفحة كبيرة لكل صورة إضافية: عنوان المحور فقط + صورة كبيرة تملأ الصفحة
        rest.forEach((img, j) => {
          pages.push(bigImagePage(`${sn.id}-${j}`, sn.title, img.src, ++pageNo));
        });
        return pages;
      })}

      {/* ===== الصور غير المرتبطة بمحور: صور كبيرة تحت عنوان عام ===== */}
      {unassigned.map((img, j) => bigImagePage(`u-${j}`, 'صور من الدورة', img.src, ++pageNo))}

      {/* ===== الغلاف الخلفي: شعار الجامعة في المنتصف + عبارة ثابتة أسفل ===== */}
      <Page size="A4" style={s.page}>
        <View style={{ flex: 1, backgroundColor: C.primary, position: 'relative' }}>
          {assets.watermark ? (
            <Image src={assets.watermark} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.14 }} />
          ) : null}
          <View style={{ position: 'absolute', top: 22, left: 22, right: 22, bottom: 22, border: `1.5px solid ${C.secondary}55`, borderRadius: 6 }} />
          {/* الشعار في منتصف الصفحة تمامًا */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Image src={assets.logoNaussWhite} style={{ width: 340, height: 120, objectFit: 'contain', alignSelf: 'center' }} />
          </View>
          {/* العبارة الثابتة في الأسفل بمحاذاة المنتصف */}
          <View style={{ alignItems: 'center', paddingBottom: 56 }}>
            <View style={{ width: 60, height: 4, backgroundColor: C.secondary, borderRadius: 2, marginBottom: 14 }} />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>إدارة عمليات التدريب</Text>
            <Text style={{ color: '#ffffffcc', fontSize: 12, marginTop: 5 }}>وكالة الجامعة للتدريب</Text>
            <Text style={{ color: '#ffffffaa', fontSize: 11, marginTop: 3 }}>جامعة نايف العربية للعلوم الأمنية</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
