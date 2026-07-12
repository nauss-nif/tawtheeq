/**
 * جلب صورة معلم المدينة تلقائيًا من ويكيبيديا حسب اسم المكان.
 * نستخدم واجهة ملخّص الصفحة (REST) التي تعيد صورة الصفحة الرئيسية.
 * النتيجة مُخزَّنة مؤقتًا (شهر) لتفادي الطلب المتكرر وتسريع العرض.
 */
export async function fetchLandmarkImage(location: string): Promise<string | null> {
  const query = cleanCity(location);
  if (!query) return null;

  // نجرّب العربية أولًا ثم الإنجليزية
  for (const lang of ['ar', 'en'] as const) {
    try {
      const res = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
        {
          headers: { accept: 'application/json' },
          next: { revalidate: 60 * 60 * 24 * 30 }, // تخزين مؤقت شهر
        },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        originalimage?: { source?: string };
        thumbnail?: { source?: string };
        type?: string;
      };
      // نتجاهل صفحات التوضيح (disambiguation)
      if (data.type === 'disambiguation') continue;
      const url = data.originalimage?.source ?? data.thumbnail?.source;
      if (url) return url;
    } catch {
      // تجاهل وتابع
    }
  }
  return null;
}

/** تنظيف اسم المكان: نأخذ أول جزء دلالي (قبل الفاصلة أو "-") */
function cleanCity(location: string): string {
  return location
    .split(/[،,\-|/]/)[0]
    .replace(/^(مدينة|محافظة|ولاية|إمارة)\s+/, '')
    .trim();
}
