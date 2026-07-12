import { z } from 'zod';

// رسائل خطأ عربية موحّدة
const req = 'هذا الحقل مطلوب';

export const registerSchema = z
  .object({
    full_name: z.string().min(3, 'الاسم الكامل مطلوب (3 أحرف على الأقل)'),
    email: z.string().email('البريد الإلكتروني غير صحيح'),
    phone: z
      .string()
      .regex(/^05\d{8}$/, 'رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام'),
    password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirm'],
  });

export const loginSchema = z.object({
  email: z.string().email('البريد الإلكتروني غير صحيح'),
  password: z.string().min(1, req),
});

export const resetSchema = z.object({
  email: z.string().email('البريد الإلكتروني غير صحيح'),
});

export const courseSchema = z.object({
  title: z.string().min(3, 'عنوان الدورة مطلوب'),
  description: z.string().max(2000).optional().or(z.literal('')),
  start_date: z.string().optional().or(z.literal('')),
  end_date: z.string().optional().or(z.literal('')),
  location: z.string().max(200).optional().or(z.literal('')),
  trainer_names: z.array(z.string().min(1)).default([]),
  template_id: z.enum(['classic', 'modern', 'celebratory']).default('classic'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CourseInput = z.infer<typeof courseSchema>;

// حدود الرفع
export const UPLOAD_LIMITS = {
  maxImages: 200,
  maxImageBytes: 10 * 1024 * 1024, // 10MB
  maxVideos: 10,
  maxVideoBytes: 200 * 1024 * 1024, // 200MB
} as const;
