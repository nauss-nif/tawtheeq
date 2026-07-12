import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import type { Course } from '@/lib/database.types';

/**
 * توليد PDF احترافي بهوية جامعة نايف وبرامج الشراكات الدولية.
 * الصور والشعارات تُمرَّر جاهزة كـ JPEG/PNG base64 من الخادم
 * (لأن @react-pdf لا يعرض WebP). الخط: القاهرة من base64.
 * ملاحظة: تشكيل بعض الحروف العربية في @react-pdf محدود.
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
  logoBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.surface, paddingVertical: 14, paddingHorizontal: 28,
  },
  logoNauss: { height: 42, objectFit: 'contain' },
  logoMoi: { height: 46, objectFit: 'contain' },
  coverWrap: { flex: 1, position: 'relative' },
  coverImg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' },
  coverShade: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(10,74,64,0.55)' },
  coverBottom: {
    position: 'absolute', bottom: 0, left: 0, width: '100%',
    backgroundColor: 'rgba(10,74,64,0.86)', paddingVertical: 30, paddingHorizontal: 34,
  },
  accent: { width: 70, height: 5, backgroundColor: C.secondary, borderRadius: 3, marginBottom: 12 },
  kicker: { color: C.secondary, fontSize: 13, marginBottom: 6, textAlign: 'right' },
  coverTitle: { color: '#fff', fontSize: 30, fontWeight: 600, textAlign: 'right', lineHeight: 1.3 },
  coverMeta: { color: '#ffffffcc', fontSize: 12, marginTop: 10, textAlign: 'right' },
  body: { padding: 36 },
  h2: { color: C.primary, fontSize: 19, fontWeight: 600, textAlign: 'right' },
  hr: { width: 54, height: 3, backgroundColor: C.secondary, borderRadius: 2, marginTop: 6, marginBottom: 14, alignSelf: 'flex-end' },
  para: { color: C.ink, fontSize: 12, lineHeight: 1.9, textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  card: { width: '48%', marginBottom: 14, backgroundColor: C.surface, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.secondary}55` },
  cardImg: { width: '100%', height: 150, objectFit: 'cover' },
  caption: { fontSize: 9.5, color: C.muted, padding: 6, textAlign: 'right' },
  closing: { flex: 1, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', padding: 40 },
  closingLogos: { flexDirection: 'row', gap: 24, alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 24 },
  closingLogo: { height: 54, objectFit: 'contain' },
  closingText: { color: '#fff', fontSize: 15, marginTop: 6 },
  closingSub: { color: '#ffffffaa', fontSize: 11, marginTop: 4 },
});

export function MagazinePDF({ course, assets }: { course: Course; assets: PdfAssets }) {
  ensureFonts(assets);
  const dateText = [course.start_date, course.end_date].filter(Boolean).join(' - ');

  return (
    <Document title={course.title} author="جامعة نايف العربية للعلوم الأمنية">
      {/* الغلاف */}
      <Page size="A4" style={s.page}>
        <View style={s.logoBar}>
          <Image src={assets.logoMoi} style={s.logoMoi} />
          <Image src={assets.logoNauss} style={s.logoNauss} />
        </View>
        <View style={s.coverWrap}>
          {assets.coverImage && <Image src={assets.coverImage} style={s.coverImg} />}
          <View style={s.coverShade} />
          <View style={s.coverBottom}>
            <View style={s.accent} />
            <Text style={s.kicker}>برامج الشراكات الدولية</Text>
            <Text style={s.coverTitle}>{course.title}</Text>
            {dateText ? <Text style={s.coverMeta}>{dateText}</Text> : null}
            {course.location ? <Text style={s.coverMeta}>{course.location}</Text> : null}
          </View>
        </View>
      </Page>

      {/* التعريف + المدربون + المعرض */}
      <Page size="A4" style={s.page}>
        <View style={s.body}>
          {course.description ? (
            <View style={{ marginBottom: 22 }}>
              <Text style={s.h2}>عن الدورة</Text>
              <View style={s.hr} />
              <Text style={s.para}>{course.description}</Text>
            </View>
          ) : null}

          {course.trainer_names.length > 0 ? (
            <View style={{ marginBottom: 22 }}>
              <Text style={s.h2}>المدربون</Text>
              <View style={s.hr} />
              <Text style={s.para}>{course.trainer_names.join('  -  ')}</Text>
            </View>
          ) : null}

          {assets.images.length > 0 ? (
            <View>
              <Text style={s.h2}>معرض الصور</Text>
              <View style={s.hr} />
              <View style={s.grid}>
                {assets.images.map((img, i) => (
                  <View key={i} style={s.card} wrap={false}>
                    <Image src={img.src} style={s.cardImg} />
                    {img.caption ? <Text style={s.caption}>{img.caption}</Text> : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </Page>

      {/* الختام */}
      <Page size="A4" style={s.page}>
        <View style={s.closing}>
          <View style={s.closingLogos}>
            <Image src={assets.logoMoi} style={s.closingLogo} />
            <Image src={assets.logoNauss} style={s.closingLogo} />
          </View>
          <View style={s.accent} />
          <Text style={s.closingText}>إدارة عمليات التدريب</Text>
          <Text style={s.closingSub}>جامعة نايف العربية للعلوم الأمنية</Text>
          <Text style={s.closingSub}>برامج الشراكات الدولية - وزارة الداخلية</Text>
        </View>
      </Page>
    </Document>
  );
}
