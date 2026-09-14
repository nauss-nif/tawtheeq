import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getMagazineBySlug } from '@/features/magazine/data';
import { FlipStandalone } from '@/features/magazine/FlipStandalone';
import { publicEnv } from '@/lib/env';

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getMagazineBySlug(params.slug);
  if (!data) return { title: 'المجلة غير متاحة' };
  const { course } = data;
  const ogImage = `${publicEnv.siteUrl}/m/${params.slug}/og`;
  const description = course.description?.slice(0, 160) ?? 'المجلة الإلكترونية للدورة التدريبية';
  return {
    title: course.title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: course.title,
      description,
      type: 'article',
      siteName: 'جامعة نايف العربية للعلوم الأمنية',
      images: [{ url: ogImage, width: 1200, height: 630, type: 'image/jpeg' }],
      locale: 'ar_SA',
    },
    twitter: { card: 'summary_large_image', title: course.title, description, images: [ogImage] },
  };
}

/** رابط مستقل يفتح على المجلة الإلكترونية (Flipbook) مباشرةً */
export default async function FlipPage({ params }: Props) {
  const data = await getMagazineBySlug(params.slug);
  if (!data) notFound();
  return <FlipStandalone data={data} slug={params.slug} />;
}
