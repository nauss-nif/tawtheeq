'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, RotateCw, Crop, Sun, Contrast, Droplets, RefreshCw, Loader2, ZoomIn, ZoomOut, Move, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { IMAGE_FILTERS, feColorMatrixValues, getImageFilter } from '@/lib/media/filters';

interface Rect { x: number; y: number; w: number; h: number } // نسب 0..1

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
const ASPECTS: { label: string; value: number | null }[] = [
  { label: 'حر', value: null },
  { label: '١:١', value: 1 },
  { label: '٤:٣', value: 4 / 3 },
  { label: '١٦:٩', value: 16 / 9 },
  { label: '٣:٤', value: 3 / 4 },
  { label: '٩:١٦', value: 9 / 16 },
];
/** إعدادات المحرّر المحفوظة مع الصورة (media.edit_params) ليُفتح عليها لاحقًا */
interface EditorParams {
  aspect: number | null;
  zoom: number;
  off: { x: number; y: number };
  crop: Rect;
  rotate: number;
  filter: string;
  brightness: number;
  contrast: number;
  saturation: number;
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * محرّر الصورة بعد الرفع: قص، تدوير، فلاتر جاهزة، وضبط السطوع والتباين والتشبّع
 * مع معاينة حيّة مطابقة لما سيُحفظ. التعديل غير تراكمي (يُطبَّق على نسخة الأصل).
 *
 * وضعان للقص:
 * - «حر»: مستطيل قص يُسحب ويُغيَّر حجمه من أركانه.
 * - مقاس محدد: إطار ثابت بالمقاس، والصورة تُكبَّر وتُحرَّك تحته (سحب، عجلة الفأرة، إصبعان).
 */
export function ImageEditor({
  courseId,
  mediaId,
  src,
  onClose,
}: {
  courseId: string;
  mediaId: string;
  src: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const frameRef = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState({ maxW: 560, maxH: 420 });
  const [rot, setRot] = useState(0);
  const [crop, setCrop] = useState<Rect>(FULL);
  const [aspect, setAspect] = useState<number | null>(null);
  // وضع الإطار: تكبير وإزاحة مركز الصورة عن مركز الإطار (بنسبة من أبعاد الإطار)
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [filterId, setFilterId] = useState('none');
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [saturation, setSaturation] = useState(1);
  const [saving, setSaving] = useState(false);
  // صورة المصدر: نسخة الأصل قبل أي تعديل (يحددها الخادم)؛ null أثناء التحميل
  const [source, setSource] = useState<string | null>(null);

  // نفتح على الأصل وآخر إعدادات محفوظة؛ عرض الصورة المعدّلة سابقًا مع تطبيق القص على الأصل
  // كان يُطبّق الإحداثيات على منطقة مختلفة، ويُفقد القص السابق عند الحفظ مجددًا
  useEffect(() => {
    let cancelled = false;
    // مهلة: إن تأخر الخادم نفتح على الصورة الحالية بدل تعليق المحرّر
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    fetch(`/api/courses/${courseId}/media/${mediaId}/edit`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { source: string | null; params: Partial<EditorParams> | null }) => {
        if (cancelled) return;
        const p = d.params;
        if (p) {
          const c = p.crop;
          setRot([0, 90, 180, 270].includes(num(p.rotate, 0)) ? num(p.rotate, 0) : 0);
          setAspect(typeof p.aspect === 'number' && p.aspect > 0 ? p.aspect : null);
          setZoom(clamp(num(p.zoom, 1), MIN_ZOOM, MAX_ZOOM));
          setOff({ x: num(p.off?.x, 0), y: num(p.off?.y, 0) });
          if (c) setCrop({ x: num(c.x, 0), y: num(c.y, 0), w: num(c.w, 1), h: num(c.h, 1) });
          setFilterId(typeof p.filter === 'string' ? getImageFilter(p.filter).id : 'none');
          setBrightness(num(p.brightness, 1));
          setContrast(num(p.contrast, 1));
          setSaturation(num(p.saturation, 1));
        }
        setSource(d.source ?? src);
      })
      .catch(() => {
        if (!cancelled) setSource(src);
      })
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; clearTimeout(timer); ctrl.abort(); };
  }, [courseId, mediaId, src]);

  // أبعاد الصورة الأصلية: نقيسها بتحميل مستقل لأن حدث onLoad لعنصر الصورة قد يسبق تهيئة React
  // حين تكون الصورة في ذاكرة المتصفح، فتبقى الأبعاد مجهولة وتُعرض الصورة مشوّهة بنسبة افتراضية
  useEffect(() => {
    if (!source) return;
    const probe = new Image();
    probe.onload = () => setNat({ w: probe.naturalWidth, h: probe.naturalHeight });
    probe.src = source;
    return () => { probe.onload = null; };
  }, [source]);

  useEffect(() => {
    const fit = () =>
      setBox({
        maxW: Math.min(window.innerWidth - 64, 620),
        maxH: Math.max(220, Math.min(window.innerHeight - 420, 440)),
      });
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // أبعاد الصورة المنطقية بعد التدوير
  const rotated = rot === 90 || rot === 270;
  const logicalW = nat ? (rotated ? nat.h : nat.w) : 4;
  const logicalH = nat ? (rotated ? nat.w : nat.h) : 3;

  // ---- وضع «حر»: الصورة كاملة داخل المساحة ----
  const freeScale = Math.min(box.maxW / logicalW, box.maxH / logicalH);
  const dispW = Math.max(80, logicalW * freeScale);
  const dispH = Math.max(60, logicalH * freeScale);

  // ---- وضع الإطار: إطار بالمقاس، والصورة تغطيه كاملًا عند التكبير ١ ----
  const frameW = aspect ? Math.min(box.maxW, box.maxH * aspect) : 0;
  const frameH = aspect ? frameW / aspect : 0;
  const coverScale = aspect ? Math.max(frameW / logicalW, frameH / logicalH) : 1;
  const imgW = logicalW * coverScale * zoom;
  const imgH = logicalH * coverScale * zoom;
  // أقصى إزاحة تُبقي الإطار مغطّى بالصورة
  const maxOffX = aspect ? (imgW - frameW) / 2 / frameW : 0;
  const maxOffY = aspect ? (imgH - frameH) / 2 / frameH : 0;
  const ox = clamp(off.x, -maxOffX, maxOffX) * frameW;
  const oy = clamp(off.y, -maxOffY, maxOffY) * frameH;

  /** مستطيل القص النهائي بنسب من الصورة بعد التدوير */
  const finalCrop = (): Rect => {
    if (!aspect) return crop;
    return {
      x: clamp(((imgW - frameW) / 2 - ox) / imgW, 0, 1),
      y: clamp(((imgH - frameH) / 2 - oy) / imgH, 0, 1),
      w: clamp(frameW / imgW, 0.01, 1),
      h: clamp(frameH / imgH, 0.01, 1),
    };
  };

  /** سحب مستطيل القص أو أحد أركانه (وضع «حر») */
  const startDrag = useCallback(
    (mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      const start = { px: e.clientX, py: e.clientY, ...crop };

      const onMove = (ev: PointerEvent) => {
        const dx = (ev.clientX - start.px) / rect.width;
        const dy = (ev.clientY - start.py) / rect.height;
        if (mode === 'move') {
          setCrop({
            x: Math.min(Math.max(0, start.x + dx), 1 - start.w),
            y: Math.min(Math.max(0, start.y + dy), 1 - start.h),
            w: start.w,
            h: start.h,
          });
          return;
        }
        const right = start.x + start.w;
        const bottom = start.y + start.h;
        let x = start.x;
        let y = start.y;
        let w = start.w;
        let h = start.h;
        if (mode === 'nw' || mode === 'sw') { x = Math.min(Math.max(0, start.x + dx), right - 0.05); w = right - x; }
        if (mode === 'ne' || mode === 'se') { w = Math.min(Math.max(0.05, start.w + dx), 1 - start.x); }
        if (mode === 'nw' || mode === 'ne') { y = Math.min(Math.max(0, start.y + dy), bottom - 0.05); h = bottom - y; }
        if (mode === 'sw' || mode === 'se') { h = Math.min(Math.max(0.05, start.h + dy), 1 - start.y); }
        setCrop({ x, y, w, h });
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [crop],
  );

  // ---- وضع الإطار: سحب للتحريك، وإصبعان للتكبير ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ ox: number; oy: number; zoom: number; dist: number; cx: number; cy: number } | null>(null);

  const beginGesture = () => {
    const pts = [...pointers.current.values()];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { ox: off.x, oy: off.y, zoom, dist, cx, cy };
  };

  const onFramePointerDown = (e: React.PointerEvent) => {
    if (!aspect) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch { /* مؤشر غير نشط (أحداث مصطنعة) */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    beginGesture();
  };
  const onFramePointerMove = (e: React.PointerEvent) => {
    if (!aspect || !pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    let nextZoom = g.zoom;
    if (pts.length > 1 && g.dist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      nextZoom = clamp(g.zoom * (dist / g.dist), MIN_ZOOM, MAX_ZOOM);
      setZoom(nextZoom);
    }
    setOff({ x: g.ox + (cx - g.cx) / frameW, y: g.oy + (cy - g.cy) / frameH });
  };
  const onFramePointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    // نعيد ضبط الإزاحة المحدودة فعليًا حتى لا «تقفز» الصورة في الحركة التالية
    setOff({ x: ox / (frameW || 1), y: oy / (frameH || 1) });
    if (pointers.current.size > 0) beginGesture();
    else gesture.current = null;
  };

  // عجلة الفأرة للتكبير (مستمع غير سلبي لمنع تمرير الصفحة)
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !aspect) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      setZoom((z) => clamp(z * (ev.deltaY < 0 ? 1.08 : 1 / 1.08), MIN_ZOOM, MAX_ZOOM));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [aspect, source, nat]);

  const applyAspect = (a: number | null) => {
    setAspect(a);
    setZoom(1);
    setOff({ x: 0, y: 0 });
    if (!a) setCrop(FULL);
  };

  const rotate = () => {
    setRot((r) => (r + 90) % 360);
    setCrop(FULL);
    setZoom(1);
    setOff({ x: 0, y: 0 });
  };

  const reset = () => {
    setCrop(FULL);
    setAspect(null);
    setRot(0);
    setZoom(1);
    setOff({ x: 0, y: 0 });
    setFilterId('none');
    setBrightness(1);
    setContrast(1);
    setSaturation(1);
  };

  const save = async () => {
    setSaving(true);
    try {
      const c = finalCrop();
      const isFull = c.w > 0.995 && c.h > 0.995 && c.x < 0.005 && c.y < 0.005;
      const res = await fetch(`/api/courses/${courseId}/media/${mediaId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crop: isFull ? undefined : c,
          rotate: rot,
          brightness,
          contrast,
          saturation,
          filter: filterId,
          params: {
            aspect,
            zoom,
            off: { x: ox / (frameW || 1), y: oy / (frameH || 1) },
            crop,
            rotate: rot,
            filter: filterId,
            brightness,
            contrast,
            saturation,
          } satisfies EditorParams,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'تعذّر الحفظ');
      toast.success('تم حفظ التعديل');
      router.refresh();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'تعذّر حفظ التعديل');
    } finally {
      setSaving(false);
    }
  };

  // المعاينة بالترتيب نفسه في الخادم: سطوع وتشبّع ← مصفوفة الفلتر ← تباين
  const fx = getImageFilter(filterId);
  const cssFilter = (f = fx) =>
    `brightness(${brightness * f.brightness}) saturate(${saturation * f.saturation}) url(#fx-${f.id}) contrast(${contrast * f.contrast})`;

  const handleCls = 'absolute size-4 rounded-full border-2 border-white bg-secondary shadow ring-1 ring-black/20';
  const pct = (n: number) => `${n * 100}%`;
  const maskPath =
    `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ` +
    `${pct(crop.x)} ${pct(crop.y)}, ${pct(crop.x)} ${pct(crop.y + crop.h)}, ` +
    `${pct(crop.x + crop.w)} ${pct(crop.y + crop.h)}, ${pct(crop.x + crop.w)} ${pct(crop.y)}, ` +
    `${pct(crop.x)} ${pct(crop.y)})`;

  const imgEl = (w: number, h: number, extra: string, filter: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={source ?? ''}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: rotated ? h : w,
        height: rotated ? w : h,
        maxWidth: 'none',
        transform: `translate(-50%, -50%) ${extra} rotate(${rot}deg)`,
        filter,
      }}
    />
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3" onPointerDown={onClose}>
      {/* مرشّحات SVG للمعاينة: مصفوفة لون لكل فلتر */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        {IMAGE_FILTERS.map((f) => (
          <filter key={f.id} id={`fx-${f.id}`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={feColorMatrixValues(f)} />
          </filter>
        ))}
      </svg>

      <div
        className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-surface p-4 shadow-soft-md sm:p-5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-primary">
            <Crop className="size-4 text-secondary" /> قص الصورة وتحسينها
          </h3>
          <button onClick={onClose} aria-label="إغلاق" className="rounded-xl p-1.5 text-muted hover:bg-muted/10">
            <X className="size-5" />
          </button>
        </div>

        {/* مساحة المعاينة والقص */}
        <div className="flex justify-center rounded-2xl bg-[#1f2422] p-3">
          {!source || !nat ? (
            <div className="flex items-center justify-center gap-2 text-sm text-white/70" style={{ width: box.maxW, height: box.maxH }}>
              <Loader2 className="size-5 animate-spin" /> جارٍ تحميل الصورة الأصلية…
            </div>
          ) : aspect ? (
            /* وضع الإطار: الصورة تُحرَّك وتُكبَّر تحت إطار ثابت بالمقاس */
            <div
              ref={frameRef}
              onPointerDown={onFramePointerDown}
              onPointerMove={onFramePointerMove}
              onPointerUp={onFramePointerUp}
              onPointerCancel={onFramePointerUp}
              onDoubleClick={() => { setZoom(1); setOff({ x: 0, y: 0 }); }}
              className="relative cursor-grab touch-none select-none overflow-hidden rounded-lg active:cursor-grabbing"
              style={{ width: frameW, height: frameH }}
            >
              {imgEl(imgW, imgH, `translate(${ox}px, ${oy}px)`, cssFilter())}
              {/* خطوط الأثلاث للتكوين */}
              <div className="pointer-events-none absolute inset-0 border-2 border-secondary">
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
              </div>
            </div>
          ) : (
            /* وضع «حر»: الصورة كاملة ومستطيل قص بالأركان */
            <div ref={frameRef} className="relative touch-none select-none" style={{ width: dispW, height: dispH }}>
              {imgEl(dispW, dispH, '', cssFilter())}
              <div className="pointer-events-none absolute inset-0 bg-black/45" style={{ clipPath: maskPath }} />
              <div
                onPointerDown={startDrag('move')}
                className="absolute cursor-move border-2 border-secondary"
                style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
              >
                <span onPointerDown={startDrag('nw')} className={`${handleCls} -left-2 -top-2 cursor-nwse-resize`} />
                <span onPointerDown={startDrag('ne')} className={`${handleCls} -right-2 -top-2 cursor-nesw-resize`} />
                <span onPointerDown={startDrag('sw')} className={`${handleCls} -bottom-2 -left-2 cursor-nesw-resize`} />
                <span onPointerDown={startDrag('se')} className={`${handleCls} -bottom-2 -right-2 cursor-nwse-resize`} />
              </div>
            </div>
          )}
        </div>

        {/* التكبير (وضع الإطار) */}
        {aspect ? (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-background px-3 py-2">
            <button onClick={() => setZoom((z) => clamp(z / 1.15, MIN_ZOOM, MAX_ZOOM))} aria-label="تصغير" className="rounded-lg p-1 text-primary hover:bg-muted/10">
              <ZoomOut className="size-4" />
            </button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-secondary"
              aria-label="التكبير"
            />
            <button onClick={() => setZoom((z) => clamp(z * 1.15, MIN_ZOOM, MAX_ZOOM))} aria-label="تكبير" className="rounded-lg p-1 text-primary hover:bg-muted/10">
              <ZoomIn className="size-4" />
            </button>
            <span className="hidden items-center gap-1 text-[11px] text-muted sm:flex">
              <Move className="size-3.5" /> اسحب الصورة لضبط موضعها
            </span>
          </div>
        ) : null}

        {/* المقاسات والتدوير */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {ASPECTS.map((a) => (
            <button
              key={a.label}
              onClick={() => applyAspect(a.value)}
              className={`rounded-xl px-3 py-1.5 text-xs transition ${
                aspect === a.value ? 'bg-primary text-white' : 'bg-muted/10 text-primary hover:bg-muted/20'
              }`}
            >
              {a.label}
            </button>
          ))}
          <button
            onClick={rotate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-muted/10 px-3 py-1.5 text-xs text-primary hover:bg-muted/20"
          >
            <RotateCw className="size-3.5" /> تدوير
          </button>
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-xl bg-muted/10 px-3 py-1.5 text-xs text-primary hover:bg-muted/20"
          >
            <RefreshCw className="size-3.5" /> إعادة ضبط
          </button>
        </div>

        {/* الفلاتر الجاهزة مع معاينة مصغّرة لكل فلتر */}
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
            <Sparkles className="size-3.5 text-secondary" /> فلاتر تحسين الصور
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {source && IMAGE_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterId(f.id)}
                title={f.hint}
                className={`group flex w-[84px] shrink-0 flex-col items-center gap-1 rounded-2xl p-1.5 transition ${
                  filterId === f.id ? 'bg-primary/10 ring-2 ring-secondary' : 'hover:bg-muted/10'
                }`}
              >
                <span className="block size-[72px] overflow-hidden rounded-xl bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={source ?? ''}
                    alt=""
                    draggable={false}
                    className="size-full object-cover"
                    style={{ filter: cssFilter(f), transform: `rotate(${rot}deg)` }}
                  />
                </span>
                <span className={`text-[11px] ${filterId === f.id ? 'font-semibold text-primary' : 'text-muted'}`}>{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* منزلقات الضبط اليدوي (فوق الفلتر) */}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Slider icon={<Sun className="size-3.5" />} label="السطوع" value={brightness} onChange={setBrightness} />
          <Slider icon={<Contrast className="size-3.5" />} label="التباين" value={contrast} onChange={setContrast} />
          <Slider icon={<Droplets className="size-3.5" />} label="التشبّع" value={saturation} onChange={setSaturation} min={0} max={2} />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-2xl px-4 py-2 text-sm text-muted hover:bg-muted/10">
            إلغاء
          </button>
          <Button onClick={save} disabled={saving || !source || !nat}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null} حفظ التعديل
          </Button>
        </div>
      </div>
    </div>
  );
}

function Slider({
  icon,
  label,
  value,
  onChange,
  min = 0.6,
  max = 1.6,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-1 rounded-2xl bg-background p-3">
      <span className="flex items-center justify-between text-xs text-primary">
        <span className="flex items-center gap-1.5">{icon} {label}</span>
        <span className="tabular-nums text-muted">{Math.round(value * 100)}%</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.02}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-secondary"
      />
    </label>
  );
}
