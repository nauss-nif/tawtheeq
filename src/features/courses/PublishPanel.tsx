'use client';

import { useEffect, useState, useTransition } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, ExternalLink, Send, EyeOff, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { publishCourseAction, unpublishCourseAction } from './actions';
import type { Course } from '@/lib/database.types';

export function PublishPanel({ course, siteUrl }: { course: Course; siteUrl: string }) {
  const [pending, startTransition] = useTransition();
  const [slug, setSlug] = useState(course.magazine_slug);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string>('');

  const isPublished = course.status === 'published' && !!slug;
  const url = slug ? `${siteUrl}/m/${slug}` : '';

  useEffect(() => {
    if (url) QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#0E5C50', light: '#FFFFFF' } }).then(setQr);
  }, [url]);

  function publish() {
    startTransition(async () => {
      const res = await publishCourseAction(course.id);
      if (res?.error) toast.error(res.error);
      else if (res?.slug) {
        setSlug(res.slug);
        toast.success('تم نشر المجلة');
      }
    });
  }

  function unpublish() {
    startTransition(async () => {
      await unpublishCourseAction(course.id);
      setSlug(null);
      toast.success('تم إلغاء النشر');
    });
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('تم نسخ الرابط');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>النشر والمشاركة</CardTitle>

      {!isPublished ? (
        <>
          <p className="text-sm text-muted">
            انشر المجلة ليُولَّد رابط عام غير قابل للتخمين تشاركه مع المتدربين.
          </p>
          <Button onClick={publish} loading={pending} className="w-fit">
            <Send className="size-5" /> نشر المجلة
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex items-center gap-2 rounded-2xl bg-background p-2">
              <input readOnly value={url} dir="ltr" className="flex-1 bg-transparent px-2 text-sm text-primary outline-none" />
              <button onClick={copy} className="rounded-xl p-2 text-primary hover:bg-primary/5" aria-label="نسخ">
                {copied ? <Check className="size-5 text-primary" /> : <Copy className="size-5" />}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm">
                  <ExternalLink className="size-4" /> فتح المجلة
                </Button>
              </a>
              <Button variant="ghost" size="sm" onClick={unpublish} loading={pending}>
                <EyeOff className="size-4" /> إلغاء النشر
              </Button>
            </div>
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <Eye className="size-4" /> {course.views_count.toLocaleString('ar')} مشاهدة
            </p>
          </div>

          {qr && (
            <div className="flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="رمز QR للمجلة" className="rounded-2xl border border-muted/15" width={120} height={120} />
              <span className="text-xs text-muted">امسح للفتح</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
