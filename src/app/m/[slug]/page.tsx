import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getMagazineBySlug } from '@/features/magazine/data';
import { MagazineView } from '@/features/magazine/MagazineView';
import { publicEnv } from '@/lib/env';

interface Props {
  params: { slug: string };
}

/** Open Graph لمعاينة جميلة عند المشاركة + noindex للخصوصية */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getMagazineBySlug(params.slug);
  if (!data) return { title: 'المجلة غير متاحة' };

  const { course, cover } = data;
  const image = cover?.processed_url;
  return {
    title: `${course.title} | مجلة الدورة`,
    description: course.description?.slice(0, 160) ?? 'مجلة توثيق الدورة التدريبية',
    robots: { index: false, follow: false }, // noindex للمجلات (خصوصية)
    openGraph: {
      title: course.title,
      description: course.description?.slice(0, 160) ?? '',
      type: 'article',
      images: image ? [{ url: image, width: 1200, height: 630 }] : [],
      locale: 'ar_SA',
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function MagazinePage({ params }: Props) {
  const data = await getMagazineBySlug(params.slug);
  if (!data) notFound();

  // زيادة عدّاد المشاهدات عند كل زيارة (RPC آمنة، متاحة للزوار)
  const supabase = createClient();
  await supabase.rpc('increment_magazine_views', { p_slug: params.slug });

  return <MagazineView data={data} siteUrl={publicEnv.siteUrl} />;
}
