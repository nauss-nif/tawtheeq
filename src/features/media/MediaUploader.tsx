'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Camera, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { UPLOAD_LIMITS } from '@/lib/validations';
import { cn } from '@/lib/utils';
import { uploadVideoDirect } from './videoUpload';

interface UploadItem {
  id: string;
  name: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

/**
 * رفع متعدد بالسحب والإفلات مع شريط تقدم لكل ملف.
 * مصمّم أولًا للجوال: يدعم كاميرا الجوال ومعرض الصور مباشرة.
 */
export function MediaUploader({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);

  const uploadOne = useCallback(
    (file: File): Promise<void> => {
      const id = crypto.randomUUID();
      const isVideo = file.type.startsWith('video/');

      const setItem = (patch: Partial<UploadItem>) =>
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

      setItems((prev) => [...prev, { id, name: file.name, progress: 0, status: 'uploading' }]);

      // الفيديو: رفع مباشر من المتصفح إلى التخزين (يتجاوز حدود الخادم)
      if (isVideo) {
        if (file.size > UPLOAD_LIMITS.maxVideoBytes) {
          setItem({ status: 'error', error: 'حجم الفيديو يتجاوز 200 ميغابايت' });
          toast.error('حجم الفيديو يتجاوز 200 ميغابايت');
          return Promise.resolve();
        }
        return uploadVideoDirect(courseId, file, (pct) => setItem({ progress: pct }))
          .then(() => setItem({ progress: 100, status: 'done' }))
          .catch((e) => {
            setItem({ status: 'error', error: e?.message ?? 'فشل الرفع' });
            toast.error(e?.message ?? 'فشل رفع الفيديو');
          });
      }

      // الصور: عبر الخادم (معالجة Sharp)
      return new Promise((resolve) => {
        const form = new FormData();
        form.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/courses/${courseId}/media`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setItems((prev) => prev.map((it) => (it.id === id ? { ...it, progress } : it)));
          }
        };
        xhr.onload = () => {
          const ok = xhr.status >= 200 && xhr.status < 300;
          setItems((prev) =>
            prev.map((it) =>
              it.id === id
                ? {
                    ...it,
                    progress: 100,
                    status: ok ? 'done' : 'error',
                    error: ok ? undefined : JSON.parse(xhr.responseText || '{}').error,
                  }
                : it,
            ),
          );
          if (!ok) toast.error(JSON.parse(xhr.responseText || '{}').error ?? 'فشل الرفع');
          resolve();
        };
        xhr.onerror = () => {
          setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: 'error' } : it)));
          resolve();
        };
        xhr.send(form);
      });
    },
    [courseId],
  );

  const onDrop = useCallback(
    async (files: File[]) => {
      // معالجة تسلسلية لتفادي ضغط الخادم أثناء المعالجة الثقيلة
      for (const file of files) await uploadOne(file);
      router.refresh(); // تحديث الشبكة بعد المعالجة
    },
    [uploadOne, router],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [], 'video/*': [] },
    maxSize: UPLOAD_LIMITS.maxVideoBytes,
  });

  return (
    <div className="flex flex-col gap-4">
      <div
        {...getRootProps()}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
          isDragActive ? 'border-secondary bg-primary/5' : 'border-muted/30 hover:border-primary/40',
        )}
      >
        <input {...getInputProps()} />
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/8">
          <UploadCloud className="size-7 text-primary" />
        </div>
        <p className="font-medium text-primary">اسحب الملفات هنا أو انقر للاختيار</p>
        <p className="text-sm text-muted">
          حتى {UPLOAD_LIMITS.maxImages} صورة (≤10م.ب) و{UPLOAD_LIMITS.maxVideos} فيديو (≤200م.ب)
        </p>
        <span className="inline-flex items-center gap-1.5 text-sm text-state-info">
          <Camera className="size-4" /> يدعم كاميرا الجوال ومعرض الصور
        </span>
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-soft">
              {it.status === 'uploading' && <Loader2 className="size-5 shrink-0 animate-spin text-state-warning" />}
              {it.status === 'done' && <CheckCircle2 className="size-5 shrink-0 text-primary" />}
              {it.status === 'error' && <XCircle className="size-5 shrink-0 text-state-danger" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-primary">{it.name}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      it.status === 'error' ? 'bg-state-danger' : 'bg-secondary',
                    )}
                    style={{ width: `${it.progress}%` }}
                  />
                </div>
                {it.error && <p className="mt-1 text-xs text-state-danger">{it.error}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
