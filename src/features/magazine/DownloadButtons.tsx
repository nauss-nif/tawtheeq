import { Download } from 'lucide-react';

/** رمز ملف PDF (ورقة بزاوية مطوية وكلمة PDF) */
export function PdfIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <text x="12" y="17.5" textAnchor="middle" fontSize="6.2" fontWeight="700" fill="currentColor" stroke="none" fontFamily="system-ui, sans-serif">
        PDF
      </text>
    </svg>
  );
}

/**
 * زرّا تنزيل المجلة برمزين فقط: تنزيل (ملف HTML يعمل دون إنترنت) و PDF،
 * مع تلميح نصي عند المرور ووصف لقارئات الشاشة.
 */
export function DownloadButtons({ slug, className = '' }: { slug: string; className?: string }) {
  const btn =
    'inline-flex size-10 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25';
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <a href={`/m/${slug}/offline`} title="تنزيل المجلة للعرض دون اتصال (ملف HTML)" aria-label="تنزيل المجلة للعرض دون اتصال" className={btn}>
        <Download className="size-5" />
      </a>
      <a href={`/m/${slug}/pdf`} title="تنزيل المجلة بصيغة PDF" aria-label="تنزيل المجلة بصيغة PDF" className={btn}>
        <PdfIcon />
      </a>
    </div>
  );
}
