'use client';

import { useRouter } from 'next/navigation';
import { Flipbook } from './Flipbook';
import type { MagazineData } from './data';

/**
 * صفحة مستقلة تفتح على وضع الـFlipbook مباشرةً (رابط قابل للمشاركة).
 * زر الإغلاق يعيد الزائر إلى صفحة المجلة الكاملة.
 */
export function FlipStandalone({ data, slug }: { data: MagazineData; slug: string }) {
  const router = useRouter();
  return <Flipbook data={data} onClose={() => router.push(`/m/${slug}`)} />;
}
