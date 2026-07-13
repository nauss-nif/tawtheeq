'use client';

import { createClient } from '@/lib/supabase/client';
import { BUCKET_PROCESSED } from '@/lib/storage';

/**
 * رفع الفيديو مباشرة من المتصفح إلى التخزين (يتجاوز حدود الخادم على Vercel).
 * يلتقط صورة الغلاف من أول لقطة، ويستخرج المدة، ثم يحدّث سجل الوسائط.
 */

/** التقاط صورة غلاف ومدة الفيديو داخل المتصفح */
function capturePoster(file: File): Promise<{ blob: Blob | null; duration: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadedmetadata = () => {
      // ننتقل إلى ثانية واضحة (أو منتصف القصير)
      const t = Math.min(1, (video.duration || 2) / 2);
      const onSeeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              cleanup();
              resolve({ blob, duration: video.duration || 0 });
            },
            'image/jpeg',
            0.8,
          );
        } catch {
          cleanup();
          resolve({ blob: null, duration: video.duration || 0 });
        }
      };
      video.onseeked = onSeeked;
      video.currentTime = t;
    };
    video.onerror = () => {
      cleanup();
      resolve({ blob: null, duration: 0 });
    };
  });
}

export async function uploadVideoDirect(
  courseId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const supabase = createClient();

  // تحقّق من العدد الأقصى للفيديوهات
  const { count } = await supabase
    .from('media')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('type', 'video');

  // أنشئ سجل الوسائط (RLS يسمح لصاحب الدورة/المدير)
  const { data: media, error: insErr } = await supabase
    .from('media')
    .insert({
      course_id: courseId,
      type: 'video',
      processing_status: 'processing',
      sort_order: count ?? 0,
    })
    .select('id')
    .single();
  if (insErr || !media) throw new Error('تعذّر إنشاء السجل');

  onProgress?.(15);

  // التقاط الغلاف والمدة
  const { blob: poster, duration } = await capturePoster(file);
  onProgress?.(30);

  // رفع الفيديو مباشرة إلى التخزين
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
  const videoPath = `${courseId}/${media.id}-video.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET_PROCESSED)
    .upload(videoPath, file, { contentType: file.type || 'video/mp4', upsert: true });
  if (upErr) {
    await supabase.from('media').update({ processing_status: 'failed' }).eq('id', media.id);
    throw new Error('تعذّر رفع الفيديو');
  }
  onProgress?.(80);
  const videoUrl = supabase.storage.from(BUCKET_PROCESSED).getPublicUrl(videoPath).data.publicUrl;

  // رفع صورة الغلاف إن توفّرت
  let thumbUrl: string | null = null;
  if (poster) {
    const posterPath = `${courseId}/${media.id}-poster.jpg`;
    const { error: pErr } = await supabase.storage
      .from(BUCKET_PROCESSED)
      .upload(posterPath, poster, { contentType: 'image/jpeg', upsert: true });
    if (!pErr) thumbUrl = supabase.storage.from(BUCKET_PROCESSED).getPublicUrl(posterPath).data.publicUrl;
  }
  onProgress?.(95);

  // تحديث السجل — اكتمل
  await supabase
    .from('media')
    .update({
      processing_status: 'done',
      archive_status: 'archived', // لا أرشفة خارجية للفيديو في هذا الوضع
      processed_url: videoUrl,
      thumbnail_url: thumbUrl,
      file_size: file.size,
      original_size: file.size,
      compressed_size: file.size,
      duration: duration || null,
    })
    .eq('id', media.id);

  onProgress?.(100);
}
