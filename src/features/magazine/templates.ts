import type { TemplateId } from '@/lib/database.types';

/**
 * أنماط القوالب الثلاثة مبنية على هوية الجامعة.
 * كل قالب يعيد أصنافًا للأقسام الرئيسية للحفاظ على مصدر واحد للتصميم.
 */
export interface TemplateStyle {
  name: string;
  // غلاف hero
  hero: string;
  heroOverlay: string;
  heroTitle: string;
  // عناوين الأقسام
  sectionTitle: string;
  // إطار المعرض
  galleryFrame: string;
  accent: string; // لون التمييز (خط/إطار)
}

export const TEMPLATES: Record<TemplateId, TemplateStyle> = {
  // كلاسيكي: كتلة خضراء جانبية، خلفية كريمية، عناوين خضراء وفواصل ذهبية
  classic: {
    name: 'كلاسيكي',
    hero: 'bg-primary text-white',
    heroOverlay: 'bg-gradient-to-l from-primary/95 to-primary-dark/80',
    heroTitle: 'text-4xl md:text-6xl font-semibold',
    sectionTitle: 'heading-accent text-primary',
    galleryFrame: 'rounded-2xl border border-secondary/30',
    accent: 'bg-secondary',
  },
  // عصري: غلاف صورة كامل مع تدرج أخضر شفاف، طباعة كبيرة جريئة
  modern: {
    name: 'عصري',
    hero: 'bg-black text-white',
    heroOverlay: 'bg-gradient-to-t from-primary-dark/90 via-primary/40 to-transparent',
    heroTitle: 'text-5xl md:text-7xl font-bold tracking-tight',
    sectionTitle: 'text-primary text-3xl font-bold',
    galleryFrame: 'rounded-2xl',
    accent: 'bg-primary',
  },
  // احتفالي: لمسات ذهبية أوسع وإطارات رفيعة
  celebratory: {
    name: 'احتفالي',
    hero: 'bg-primary-dark text-white',
    heroOverlay: 'bg-gradient-to-br from-primary-dark/90 to-primary/70',
    heroTitle: 'text-4xl md:text-6xl font-semibold',
    sectionTitle: 'heading-accent text-secondary',
    galleryFrame: 'rounded-2xl border-2 border-secondary/60 p-1',
    accent: 'bg-secondary',
  },
};
