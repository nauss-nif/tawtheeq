'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Music, Image as ImageIcon, Upload, Trash2, Play, Pause,
  ChevronUp, ChevronDown, Eye, EyeOff, Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { MUSIC_MOODS, MOOD_LABEL } from '@/lib/promo/music';
import {
  deleteLibraryItemAction, moveLibraryItemAction,
  toggleLibraryItemAction, updateLibraryItemAction,
} from './libraryActions';
import type { LibraryItem } from '@/lib/promo/library';

/**
 * إدارة مكتبة البرومو: الشعارات الرسمية والمقاطع الموسيقية المعتمدة.
 * ما يُرفع هنا يظهر لكل المنسقين في الاستوديو دون رفع متكرّر.
 */
export function LibraryManager({
  music,
  logos,
}: {
  music: LibraryItem[];
  logos: LibraryItem[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <LibrarySection
        kind="music"
        title="الموسيقى المعتمدة"
        hint="المقاطع التي يختار منها المنسقون. سجّل ترخيص كل مقطع — يُعرض لهم قبل الاختيار."
        icon={<Music className="size-4" />}
        items={music}
      />
      <LibrarySection
        kind="logo"
        title="الشعارات الرسمية"
        hint="شعار الجامعة مدمج في المنصة أصلًا. أضف هنا شعارات الجهات الشريكة المتكرّرة."
        icon={<ImageIcon className="size-4" />}
        items={logos}
      />
    </div>
  );
}

function LibrarySection({
  kind,
  title,
  hint,
  icon,
  items,
}: {
  kind: 'music' | 'logo';
  title: string;
  hint: string;
  icon: React.ReactNode;
  items: LibraryItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title: '', subtitle: '', license: '', attribution: '' });
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!form.title.trim()) {
      return void toast.error('اكتب عنوان العنصر قبل الرفع');
    }
    if (kind === 'music' && !form.license.trim()) {
      return void toast.error('سجّل ترخيص المقطع الموسيقي');
    }

    setUploading(true);
    const body = new FormData();
    body.append('file', file);
    body.append('kind', kind);
    body.append('title', form.title);
    body.append('subtitle', form.subtitle);
    body.append('license', form.license);
    body.append('attribution', form.attribution);

    try {
      const res = await fetch('/api/promo/library', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'تعذّر الرفع');
      } else {
        toast.success(`أُضيف «${data.title}» إلى المكتبة`);
        setForm({ title: '', subtitle: '', license: '', attribution: '' });
        router.refresh();
      }
    } catch {
      toast.error('تعذّر الاتصال بالخادم');
    } finally {
      setUploading(false);
    }
  };

  const play = (item: LibraryItem) => {
    if (playing === item.id) {
      audioRef.current?.pause();
      return setPlaying(null);
    }
    audioRef.current?.pause();
    const audio = new Audio(item.url);
    audio.volume = 0.7;
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    audio.onerror = () => {
      setPlaying(null);
      toast.error('تعذّر تشغيل الملف');
    };
    void audio.play();
    setPlaying(item.id);
  };

  const act = (fn: () => Promise<{ error?: string; success?: boolean }>, ok?: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) return void toast.error(res.error);
      if (ok) toast.success(ok);
      router.refresh();
    });

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-sm leading-relaxed text-muted">{hint}</p>
        </div>
        <span className="mr-auto shrink-0 rounded-full bg-muted/15 px-2.5 py-1 text-xs font-medium text-muted">
          {items.filter((i) => i.isActive).length} مفعّل من {items.length}
        </span>
      </div>

      {/* القائمة */}
      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li
              key={item.id}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-xl border p-3 transition-colors',
                item.isActive ? 'border-muted/25' : 'border-muted/20 bg-muted/5 opacity-60',
              )}
            >
              {kind === 'music' ? (
                <button
                  type="button"
                  onClick={() => play(item)}
                  aria-label={`معاينة ${item.title}`}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary"
                >
                  {playing === item.id ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt="" className="max-h-full max-w-full object-contain" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-primary">{item.title}</p>
                <p className="truncate text-xs text-muted">
                  {kind === 'music'
                    ? [
                        item.subtitle ? MOOD_LABEL[item.subtitle] ?? item.subtitle : null,
                        item.duration ? `${Math.round(item.duration)} ثانية` : null,
                        item.license ? `ترخيص ${item.license}` : 'بلا ترخيص مسجّل',
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : [item.subtitle, item.width && `${item.width}×${item.height}`]
                        .filter(Boolean)
                        .join(' · ') || 'شعار'}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <IconButton
                  label="تحريك لأعلى"
                  disabled={i === 0 || pending}
                  onClick={() => act(() => moveLibraryItemAction(item.id, 'up'))}
                >
                  <ChevronUp className="size-4" />
                </IconButton>
                <IconButton
                  label="تحريك لأسفل"
                  disabled={i === items.length - 1 || pending}
                  onClick={() => act(() => moveLibraryItemAction(item.id, 'down'))}
                >
                  <ChevronDown className="size-4" />
                </IconButton>
                <IconButton
                  label={item.isActive ? 'تعطيل' : 'تفعيل'}
                  disabled={pending}
                  onClick={() =>
                    act(
                      () => toggleLibraryItemAction(item.id, !item.isActive),
                      item.isActive ? 'عُطّل — لن يظهر للمنسقين' : 'فُعّل',
                    )
                  }
                >
                  {item.isActive ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </IconButton>
                <IconButton
                  label="حذف"
                  danger
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`حذف «${item.title}» نهائيًا من المكتبة؟`)) return;
                    act(() => deleteLibraryItemAction(item.id), 'حُذف من المكتبة');
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>

              {/* تعديل سريع للعنوان والتصنيف */}
              <InlineEdit item={item} kind={kind} onSaved={() => router.refresh()} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-background p-5 text-center text-sm text-muted">
          {kind === 'music'
            ? 'لا توجد مقاطع بعد. ارفع ثلاثة مقاطع على الأقل ليختار منها المنسقون.'
            : 'لا توجد شعارات إضافية. شعار الجامعة مدمج ولا يحتاج رفعًا.'}
        </p>
      )}

      {/* نموذج الرفع */}
      <div className="flex flex-col gap-3 border-t border-muted/15 pt-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="العنوان"
            placeholder={kind === 'music' ? 'مثال: أفق واسع' : 'مثال: وزارة الداخلية'}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          {kind === 'music' ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-primary" htmlFor="mood">
                التصنيف
              </label>
              <select
                id="mood"
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                className="h-11 rounded-2xl border border-muted/30 bg-surface px-4 text-base"
              >
                <option value="">— اختر التصنيف —</option>
                {MUSIC_MOODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <Input
              label="الجهة"
              placeholder="اسم الجهة المالكة للشعار"
              value={form.subtitle}
              onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
            />
          )}
        </div>

        {kind === 'music' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="الترخيص"
              hint="إلزامي — يُعرض للمنسق قبل الاختيار"
              placeholder="مثال: CC0 · أو رخصة مشتراة رقم …"
              value={form.license}
              onChange={(e) => setForm((f) => ({ ...f, license: e.target.value }))}
            />
            <Input
              label="الإسناد (اختياري)"
              placeholder="اسم المؤلف إن تطلّبته الرخصة"
              value={form.attribution}
              onChange={(e) => setForm((f) => ({ ...f, attribution: e.target.value }))}
            />
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept={kind === 'music' ? 'audio/mpeg,audio/wav,audio/mp4,audio/aac' : 'image/*'}
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await upload(f);
            e.target.value = '';
          }}
        />
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" />
            {kind === 'music' ? 'رفع مقطع موسيقي' : 'رفع شعار'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function InlineEdit({
  item,
  kind,
  onSaved,
}: {
  item: LibraryItem;
  kind: 'music' | 'logo';
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [subtitle, setSubtitle] = useState(item.subtitle ?? '');
  const [license, setLicense] = useState(item.license ?? '');
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-right text-xs text-state-info hover:underline sm:w-auto"
      >
        تعديل البيانات
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 border-t border-muted/15 pt-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          className="h-10"
          placeholder="العنوان"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {kind === 'music' ? (
          <select
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="h-10 rounded-2xl border border-muted/30 bg-surface px-3 text-sm"
          >
            <option value="">— التصنيف —</option>
            {MUSIC_MOODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        ) : (
          <Input
            className="h-10"
            placeholder="الجهة"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        )}
        {kind === 'music' && (
          <Input
            className="h-10"
            placeholder="الترخيص"
            value={license}
            onChange={(e) => setLicense(e.target.value)}
          />
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          loading={saving}
          onClick={async () => {
            setSaving(true);
            const res = await updateLibraryItemAction(item.id, { title, subtitle, license });
            setSaving(false);
            if (res.error) return void toast.error(res.error);
            toast.success('حُفظ');
            setOpen(false);
            onSaved();
          }}
        >
          حفظ
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-lg p-2 transition-colors disabled:opacity-30',
        danger ? 'text-state-danger hover:bg-state-danger/10' : 'text-muted hover:text-primary',
      )}
    >
      {children}
    </button>
  );
}

export { Loader2 };
