import { promises as fs } from 'fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BUCKET_PROCESSED, mediaPath } from '@/lib/storage';
import { serverEnv } from '@/lib/env';
import { processImage } from './image';
import { processVideo } from './video';
import { archiveToSharePoint } from './sharepoint';
import type { Course, Database, Media } from '@/lib/database.types';

type Client = SupabaseClient<Database>;

/** هل أرشفة SharePoint مُهيّأة؟ (تتطلب مفاتيح Azure) */
function isArchivingConfigured(): boolean {
  const { azure, sharepoint } = serverEnv;
  return Boolean(azure.tenantId && azure.clientId && azure.clientSecret && sharepoint.driveId);
}

/**
 * خط المعالجة الكامل لملف واحد:
 *   معالجة (Sharp/ffmpeg) → رفع المضغوط لـ Supabase → (اختياريًا) أرشفة الأصل في SharePoint
 *   → تحديث سجل media لحظيًا.
 * يستخدم عميل المستخدم المُصادَق (RLS)، فلا يحتاج مفتاحًا سريًا لرفع الصور.
 */
export async function processMediaFile(params: {
  supabase: Client;
  mediaId: string;
  course: Pick<Course, 'id' | 'title' | 'start_date'>;
  type: 'image' | 'video';
  originalName: string;
  originalSize: number;
  buffer?: Buffer; // للصور
  tempPath?: string; // للفيديو
}) {
  const { supabase, mediaId, course, type, originalName, originalSize } = params;

  const setStatus = (patch: Partial<Media>) =>
    supabase.from('media').update(patch).eq('id', mediaId);

  await setStatus({ processing_status: 'processing', original_size: originalSize });

  try {
    let processedUrl: string;
    let thumbnailUrl: string;
    let compressedSize: number;
    let duration: number | null = null;
    let isLowQuality = false;
    let originalBuffer: Buffer;

    if (type === 'image') {
      originalBuffer = params.buffer!;
      const out = await processImage(originalBuffer);
      isLowQuality = out.isLowQuality;
      compressedSize = out.fullSize;

      const fullPath = mediaPath(course.id, mediaId, 'full', 'webp');
      const largePath = mediaPath(course.id, mediaId, 'large', 'webp');
      const thumbPath = mediaPath(course.id, mediaId, 'thumb', 'webp');

      await uploadProcessed(supabase, fullPath, out.full, 'image/webp');
      await uploadProcessed(supabase, largePath, out.large, 'image/webp');
      await uploadProcessed(supabase, thumbPath, out.thumb, 'image/webp');

      processedUrl = publicHref(supabase, fullPath);
      thumbnailUrl = publicHref(supabase, thumbPath);
    } else {
      originalBuffer = await fs.readFile(params.tempPath!);
      const out = await processVideo(params.tempPath!);
      compressedSize = out.size;
      duration = out.duration;

      const videoPath = mediaPath(course.id, mediaId, 'video', 'mp4');
      const thumbPath = mediaPath(course.id, mediaId, 'thumb', 'png');
      const videoBuf = await fs.readFile(out.videoPath);
      const thumbBuf = await fs.readFile(out.thumbPath);

      await uploadProcessed(supabase, videoPath, videoBuf, 'video/mp4');
      await uploadProcessed(supabase, thumbPath, thumbBuf, 'image/png');

      processedUrl = publicHref(supabase, videoPath);
      thumbnailUrl = publicHref(supabase, thumbPath);
    }

    // اكتملت المعالجة
    await setStatus({
      processing_status: 'done',
      processed_url: processedUrl,
      thumbnail_url: thumbnailUrl,
      compressed_size: compressedSize,
      file_size: compressedSize,
      duration,
      is_low_quality: isLowQuality,
    });

    // الأرشفة في SharePoint — فقط إن كانت مُهيّأة (وإلا نتجاهلها دون فشل)
    if (isArchivingConfigured()) {
      try {
        const spUrl = await archiveToSharePoint(course.title, course.start_date, originalName, originalBuffer);
        await setStatus({ archive_status: 'archived', sharepoint_url: spUrl });
      } catch {
        await setStatus({ archive_status: 'failed' });
      }
    }
  } catch (e) {
    await setStatus({ processing_status: 'failed' });
    throw e;
  }
}

async function uploadProcessed(supabase: Client, path: string, data: Buffer, contentType: string) {
  const { error } = await supabase.storage
    .from(BUCKET_PROCESSED)
    .upload(path, new Uint8Array(data), { contentType, upsert: true });
  if (error) throw error;
}

function publicHref(supabase: Client, path: string) {
  return supabase.storage.from(BUCKET_PROCESSED).getPublicUrl(path).data.publicUrl;
}
