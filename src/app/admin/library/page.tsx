import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/session';
import { listLibrary } from '@/lib/promo/library';
import { LibraryManager } from '@/features/admin/LibraryManager';
import { Card } from '@/components/ui/Card';

export const metadata = { title: 'مكتبة البرومو | توثيق' };

/**
 * مكتبة البرومو الثابتة — يديرها المدير وحده، ويختار منها كل المنسقين.
 * الغرض: قرار الترخيص والهوية البصرية يبقى مؤسسيًا لا فرديًا.
 */
export default async function AdminLibraryPage() {
  await requireProfile();
  const supabase = createClient();

  // المدير يرى المعطّل أيضًا ليتمكّن من إعادة تفعيله
  const [music, logos] = await Promise.all([
    listLibrary(supabase, 'music', true),
    listLibrary(supabase, 'logo', true),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="heading-accent mb-2 text-2xl font-semibold text-primary">مكتبة البرومو</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted">
        ما تضيفه هنا يظهر لكل المنسقين داخل «الاستوديو الذكي للبرومو». ارفع المقاطع
        الموسيقية المعتمدة والشعارات الرسمية مرة واحدة، فيقتصر دور المنسق على الاختيار.
      </p>

      {music.length === 0 && (
        <Card className="mb-6 border-r-4 border-state-warning bg-state-warning/5">
          <p className="text-sm leading-relaxed text-primary">
            لا توجد مقاطع موسيقية بعد. حتى تُرفع، لن يجد المنسقون ما يختارونه، وسيعمل
            البرومو بالتعليق الصوتي وحده أو صامتًا.
          </p>
        </Card>
      )}

      <LibraryManager music={music} logos={logos} />
    </div>
  );
}
