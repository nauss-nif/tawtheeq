/**
 * فلاتر الصور الجاهزة (مصمّمة لتصوير الأشخاص): تعريف واحد يستخدمه المتصفح للمعاينة
 * (CSS + feColorMatrix في SVG) والخادم للحفظ (sharp: modulate ← recomb ← linear)
 * بالترتيب نفسه، فتطابق الصورة المحفوظة ما يراه المستخدم.
 *
 * لكل فلتر: مصفوفة لون 3×3 وإزاحة لكل قناة (0..1)، ومضاعفات للسطوع والتباين والتشبّع
 * تُضرب في قيم المنزلقات اليدوية.
 */
export interface ImageFilter {
  id: string;
  label: string;
  hint: string;
  /** صفوف المصفوفة: R' و G' و B' كتركيب خطي من R و G و B */
  matrix: [[number, number, number], [number, number, number], [number, number, number]];
  /** إزاحة تُضاف لكل قناة بعد المصفوفة (رفع الظلال) */
  offset: [number, number, number];
  brightness: number;
  contrast: number;
  saturation: number;
}

const IDENTITY: ImageFilter['matrix'] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export const IMAGE_FILTERS: ImageFilter[] = [
  {
    id: 'none',
    label: 'الأصل',
    hint: 'بلا فلتر',
    matrix: IDENTITY,
    offset: [0, 0, 0],
    brightness: 1,
    contrast: 1,
    saturation: 1,
  },
  {
    // دفء ذهبي لطيف يُبرز البشرة ويمنحها حيوية دون مبالغة
    id: 'warm',
    label: 'دافئ',
    hint: 'دفء ذهبي يُحيي البشرة',
    matrix: [
      [1.07, 0.02, 0],
      [0.01, 1.01, 0],
      [0, 0, 0.88],
    ],
    offset: [0.014, 0.007, 0],
    brightness: 1.03,
    contrast: 1.04,
    saturation: 1.06,
  },
  {
    // بورتريه ناعم مشرق: يرفع الظلال ويخفف التباين فتبدو الوجوه صافية ونقية
    id: 'soft',
    label: 'بورتريه ناعم',
    hint: 'إضاءة ناعمة ووجوه صافية',
    matrix: [
      [1.02, 0.01, 0],
      [0, 1.01, 0],
      [0, 0.01, 0.98],
    ],
    offset: [0.035, 0.03, 0.03],
    brightness: 1.06,
    contrast: 0.92,
    saturation: 0.94,
  },
  {
    // سينمائي: بشرة دافئة وظلال مائلة للأخضر المزرق مع تباين أعمق
    id: 'cinematic',
    label: 'سينمائي',
    hint: 'بشرة دافئة وظلال سينمائية',
    matrix: [
      [1.12, -0.06, -0.03],
      [-0.03, 1.05, -0.01],
      [-0.1, 0.08, 1.06],
    ],
    offset: [0.0, 0.01, 0.035],
    brightness: 1.0,
    contrast: 1.14,
    saturation: 1.0,
  },
  {
    // أبيض وأسود كلاسيكي بتوازن يناسب ملامح الوجوه
    id: 'mono',
    label: 'كلاسيكي',
    hint: 'أبيض وأسود أنيق للبورتريه',
    matrix: [
      [0.34, 0.56, 0.1],
      [0.34, 0.56, 0.1],
      [0.34, 0.56, 0.1],
    ],
    offset: [0.01, 0.01, 0.01],
    brightness: 1.02,
    contrast: 1.14,
    saturation: 1,
  },
];

export function getImageFilter(id: string | undefined | null): ImageFilter {
  return IMAGE_FILTERS.find((f) => f.id === id) ?? IMAGE_FILTERS[0];
}

/** قيم feColorMatrix (4×5) للمعاينة في المتصفح */
export function feColorMatrixValues(f: ImageFilter): string {
  const rows = f.matrix.map((r, i) => [...r, 0, f.offset[i]].join(' '));
  return [...rows, '0 0 0 1 0'].join(' ');
}
