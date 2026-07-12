import path from 'path';
import fs from 'fs';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import type { MagazineData } from './data';

/**
 * توليد PDF بنفس هوية المجلة.
 * نسجّل خط IBM Plex Sans Arabic من ملفات TTF المحلية.
 * ملاحظة: مسار المشروع قد يحتوي أحرفًا عربية لا يقرأها محرّك الخطوط،
 * لذا ننسخ الخطوط إلى مجلد مؤقت بمسار لاتيني قبل التسجيل.
 * (تشكيل الوصل العربي في @react-pdf محدود؛ للإنتاج يُفضّل مسار Puppeteer — انظر README.)
 */
function fontDataUrl(file: string): string {
  const buf = fs.readFileSync(path.join(process.cwd(), 'public', 'fonts', file));
  return `data:font/ttf;base64,${buf.toString('base64')}`;
}
function registerFonts() {
  // خط القاهرة (ملف واحد يغطي كل الأوزان)
  const cairo = fontDataUrl('Cairo.ttf');
  Font.register({
    family: 'Cairo',
    fonts: [
      { src: cairo, fontWeight: 400 },
      { src: cairo, fontWeight: 600 },
    ],
  });
}
registerFonts();

const NAUSS = { primary: '#0E5C50', secondary: '#B99C6B', bg: '#F6F2EA', muted: '#8B8178' };

const styles = StyleSheet.create({
  page: { fontFamily: 'Cairo', backgroundColor: NAUSS.bg, direction: 'rtl' },
  cover: { height: '100%', backgroundColor: NAUSS.primary, justifyContent: 'flex-end', padding: 48 },
  coverImg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.55 },
  overlay: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(10,74,64,0.6)' },
  coverTitle: { color: '#fff', fontSize: 34, fontWeight: 600, textAlign: 'right' },
  coverMeta: { color: '#ffffffcc', fontSize: 13, marginTop: 10, textAlign: 'right' },
  accent: { width: 90, height: 6, backgroundColor: NAUSS.secondary, marginBottom: 16, borderRadius: 3 },
  section: { padding: 40 },
  h2: { color: NAUSS.primary, fontSize: 20, fontWeight: 600, marginBottom: 4, textAlign: 'right' },
  hr: { width: 60, height: 3, backgroundColor: NAUSS.secondary, marginBottom: 16, borderRadius: 2 },
  para: { color: '#2a302d', fontSize: 12, lineHeight: 1.8, textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridImg: { width: '48%', height: 150, objectFit: 'cover', borderRadius: 8 },
  caption: { fontSize: 9, color: NAUSS.muted, marginTop: 2, textAlign: 'right' },
  closing: { backgroundColor: NAUSS.primary, padding: 40, alignItems: 'center', justifyContent: 'center', height: '100%' },
  closingText: { color: '#fff', fontSize: 16, marginTop: 10 },
});

export function MagazinePDF({ data }: { data: MagazineData }) {
  const { course, cover, images } = data;
  return (
    <Document title={course.title} author="إدارة عمليات التدريب">
      {/* الغلاف */}
      <Page size="A4" style={styles.page}>
        <View style={styles.cover}>
          {cover?.processed_url && <Image src={cover.processed_url} style={styles.coverImg} />}
          <View style={styles.overlay} />
          <View>
            <View style={styles.accent} />
            <Text style={styles.coverTitle}>{course.title}</Text>
            {course.start_date && <Text style={styles.coverMeta}>{course.start_date}</Text>}
            {course.location && <Text style={styles.coverMeta}>{course.location}</Text>}
          </View>
        </View>
      </Page>

      {/* الوصف + المعرض */}
      <Page size="A4" style={styles.page}>
        <View style={styles.section}>
          {course.description && (
            <>
              <Text style={styles.h2}>عن الدورة</Text>
              <View style={styles.hr} />
              <Text style={styles.para}>{course.description}</Text>
            </>
          )}

          {images.length > 0 && (
            <>
              <Text style={[styles.h2, { marginTop: 24 }]}>معرض الصور</Text>
              <View style={styles.hr} />
              <View style={styles.grid}>
                {images.slice(0, 20).map((m) => (
                  <View key={m.id} style={{ width: '48%' }}>
                    <Image src={m.processed_url ?? m.thumbnail_url ?? ''} style={styles.gridImg} />
                    {m.caption && <Text style={styles.caption}>{m.caption}</Text>}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </Page>

      {/* صفحة الختام */}
      <Page size="A4" style={styles.page}>
        <View style={styles.closing}>
          <View style={styles.accent} />
          <Text style={styles.closingText}>إدارة عمليات التدريب</Text>
          <Text style={[styles.closingText, { fontSize: 12, color: '#ffffffaa' }]}>
            جامعة نايف العربية للعلوم الأمنية
          </Text>
        </View>
      </Page>
    </Document>
  );
}
