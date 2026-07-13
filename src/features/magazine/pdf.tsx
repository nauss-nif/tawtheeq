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
  coverImage: string | null;
  images: { src: string; caption: string | null }[];
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
  headerLogo: { height: 26, objectFit: 'contain', marginRight: 10 },
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

  // بطاقة صورة كبيرة بعرض الصفحة
  feature: { marginBottom: 18 },
  featureImg: { width: '100%', height: 250, objectFit: 'cover', borderRadius: 10 },
  captionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 7, gap: 8 },
  captionText: { fontSize: 11.5, fontWeight: 600, color: C.primary, textAlign: 'right' },
  captionDot: { width: 22, height: 3, backgroundColor: C.secondary, borderRadius: 2 },
});

/** ترويسة الصفحة الداخلية */
function Header({ title, logo }: { title: string; logo: string }) {
  return (
    <>
      <View style={s.header}>
        <Image src={logo} style={s.headerLogo} />
        <Text style={s.headerTitle}>{title}</Text>
      </View>
      <View style={s.headerRule} />
    </>
  );
}
function Footer({ n }: { n: number }) {
  return (
    <View style={s.footer}>
      <Text style={s.pageNum}>{n}</Text>
      <Text style={s.footerText}>برامج الشراكات الدولية · إدارة عمليات التدريب</Text>
    </View>
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

  // تقسيم الصور صفحتين لكل صفحة
  const pairs: PdfAssets['images'][] = [];
  for (let i = 0; i < assets.images.length; i += 2) pairs.push(assets.images.slice(i, i + 2));

  let pageNo = 0;

  return (
    <Document title={course.title} author="جامعة نايف العربية للعلوم الأمنية">
      {/* ===== الغلاف ===== */}
      <Page size="A4" style={s.page}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.surface, paddingVertical: 18, paddingHorizontal: 34 }}>
          <Image src={assets.logoMoi} style={{ height: 52, objectFit: 'contain' }} />
          <Image src={assets.logoNauss} style={{ height: 48, objectFit: 'contain' }} />
        </View>
        <View style={{ flex: 1, position: 'relative' }}>
          {assets.coverImage && (
            <Image src={assets.coverImage} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          <View style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(10,74,64,0.5)' }} />
          <View style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, border: `1.5px solid ${C.secondary}`, borderRadius: 6 }} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', backgroundColor: 'rgba(10,74,64,0.88)', paddingVertical: 34, paddingHorizontal: 40 }}>
            <View style={{ width: 74, height: 5, backgroundColor: C.secondary, borderRadius: 3, marginBottom: 14 }} />
            <Text style={{ color: C.secondary, fontSize: 13, marginBottom: 8, textAlign: 'right' }}>برامج الشراكات الدولية</Text>
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: 600, textAlign: 'right', lineHeight: 1.3 }}>{course.title}</Text>
            {dateText ? <Text style={{ color: '#ffffffcc', fontSize: 12, marginTop: 12, textAlign: 'right' }}>{dateText}</Text> : null}
            {course.location ? <Text style={{ color: '#ffffffcc', fontSize: 12, marginTop: 3, textAlign: 'right' }}>{course.location}</Text> : null}
          </View>
        </View>
      </Page>

      {/* ===== التعريف + المدربون + الجدول ===== */}
      <Page size="A4" style={s.page}>
        <Header title={course.title} logo={assets.logoNauss} />
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

          {sessions.length > 0 ? (
            <View>
              <Text style={s.h2}>الجدول الزمني</Text>
              <View style={s.hr} />
              {sessions.map((sn) => (
                <View key={sn.id} style={s.session} wrap={false}>
                  <Text style={s.sessionTitle}>{sn.time_label ? `${sn.time_label}  -  ` : ''}{sn.title}</Text>
                  {sn.presenter ? <Text style={s.sessionMeta}>المقدّم: {sn.presenter}</Text> : null}
                  {sn.description ? <Text style={s.sessionDesc}>{sn.description}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <Footer n={++pageNo} />
      </Page>

      {/* ===== صفحات المعرض: صورتان كبيرتان بعرض الصفحة ===== */}
      {pairs.map((pair, idx) => (
        <Page key={idx} size="A4" style={s.page}>
          <Header title={course.title} logo={assets.logoNauss} />
          <View style={s.body}>
            {idx === 0 ? (
              <>
                <Text style={s.h2}>معرض الصور</Text>
                <View style={s.hr} />
              </>
            ) : null}
            {pair.map((img, j) => (
              <View key={j} style={s.feature} wrap={false}>
                <Image src={img.src} style={s.featureImg} />
                {img.caption ? (
                  <View style={s.captionBar}>
                    <Text style={s.captionText}>{img.caption}</Text>
                    <View style={s.captionDot} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
          <Footer n={++pageNo} />
        </Page>
      ))}

      {/* ===== الغلاف الخلفي ===== */}
      <Page size="A4" style={s.page}>
        <View style={{ flex: 1, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <View style={{ position: 'absolute', top: 20, left: 20, right: 20, bottom: 20, border: `1.5px solid ${C.secondary}55`, borderRadius: 6 }} />
          <View style={{ flexDirection: 'row', gap: 26, alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 20, paddingHorizontal: 28, marginBottom: 26 }}>
            <Image src={assets.logoMoi} style={{ height: 60, objectFit: 'contain' }} />
            <Image src={assets.logoNauss} style={{ height: 56, objectFit: 'contain' }} />
          </View>
          <View style={{ width: 70, height: 5, backgroundColor: C.secondary, borderRadius: 3, marginBottom: 16 }} />
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: 600 }}>إدارة عمليات التدريب</Text>
          <Text style={{ color: '#ffffffaa', fontSize: 12, marginTop: 6 }}>جامعة نايف العربية للعلوم الأمنية</Text>
          <Text style={{ color: '#ffffff88', fontSize: 11, marginTop: 3 }}>برامج الشراكات الدولية - وزارة الداخلية</Text>
        </View>
      </Page>
    </Document>
  );
}
