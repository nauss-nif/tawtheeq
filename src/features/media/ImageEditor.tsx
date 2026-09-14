'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, RotateCw, Crop, Sun, Contrast, Droplets, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

interface Rect { x: number; y: number; w: number; h: number } // نسب 0..1

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
const ASPECTS: { label: string; value: number | null }[] = [
  { label: 'حر', value: null },
  { label: '١:١', value: 1 },
  { label: '٤:٣', value: 4 / 3 },
  { label: '١٦:٩', value: 16 / 9 },
  { label: '٣:٤', value: 3 / 4 },
];

/**
 * محرّر الصورة بعد الرفع: قص بالسحب، تدوير، وضبط السطوع والتباين والتشبّع
 * مع معاينة حيّة مطابقة لما سيُحفظ. التعديل غير تراكمي (يُطبَّق على نسخة الأصل).
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
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [saturation, setSaturation] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fit = () =>
      setBox({
        maxW: Math.min(window.innerWidth - 64, 620),
        maxH: Math.max(220, Math.min(window.innerHeight - 330, 460)),
      });
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // أبعاد العرض بعد التدوير
  const rotated = rot === 90 || rot === 270;
  const logicalW = nat ? (rotated ? nat.h : nat.w) : 4;
  const logicalH = nat ? (rotated ? nat.w : nat.h) : 3;
  const scale = Math.min(box.maxW / logicalW, box.maxH / logicalH);
  const dispW = Math.max(80, logicalW * scale);
  const dispH = Math.max(60, logicalH * scale);

  /** سحب مستطيل القص أو أحد أركانه */
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
        let next: Rect;

        if (mode === 'move') {
          next = {
            x: Math.min(Math.max(0, start.x + dx), 1 - start.w),
            y: Math.min(Math.max(0, start.y + dy), 1 - start.h),
            w: start.w,
            h: start.h,
          };
        } else {
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

          if (aspect) {
            // نثبّت النسبة اعتمادًا على العرض (بوحدات البكسل المعروضة)
            const pxW = w * dispW;
            h = Math.min(pxW / aspect / dispH, 1 - y);
            if (mode === 'nw' || mode === 'ne') y = Math.max(0, bottom - h);
          }
          next = { x, y, w, h };
        }
        setCrop(next);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [crop, aspect, dispW, dispH],
  );

  const applyAspect = (a: number | null) => {
    setAspect(a);
    if (!a) return;
    const pxW = crop.w * dispW;
    const h = Math.min(pxW / a / dispH, 1 - crop.y);
    setCrop({ ...crop, h });
  };

  const reset = () => {
    setCrop(FULL);
    setAspect(null);
    setRot(0);
    setBrightness(1);
    setContrast(1);
    setSaturation(1);
  };

  const save = async () => {
    setSaving(true);
    try {
      const isFull = crop.w > 0.995 && crop.h > 0.995 && crop.x < 0.005 && crop.y < 0.005;
      const res = await fetch(`/api/courses/${courseId}/media/${mediaId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crop: isFull ? undefined : crop,
          rotate: rot,
          brightness,
          contrast,
          saturation,
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

  const filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
  const handleCls = 'absolute size-4 rounded-full border-2 border-white bg-secondary shadow ring-1 ring-black/20';
  const pct = (n: number) => `${n * 100}%`;
  const maskPath =
    `polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ` +
    `${pct(crop.x)} ${pct(crop.y)}, ${pct(crop.x)} ${pct(crop.y + crop.h)}, ` +
    `${pct(crop.x + crop.w)} ${pct(crop.y + crop.h)}, ${pct(crop.x + crop.w)} ${pct(crop.y)}, ` +
    `${pct(crop.x)} ${pct(crop.y)})`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3" onPointerDown={onClose}>
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
        <div className="flex justify-center rounded-2xl bg-background p-3">
          <div ref={frameRef} className="relative touch-none select-none" style={{ width: dispW, height: dispH }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: rotated ? dispH : dispW,
                height: rotated ? dispW : dispH,
                transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                filter,
              }}
              className="rounded-lg"
            />

            {/* تعتيم ما خارج مستطيل القص */}
            <div
              className="pointer-events-none absolute inset-0 rounded-lg bg-black/45"
              style={{ clipPath: maskPath }}
            />

            {/* مستطيل القص */}
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
        </div>

        {/* النسب والتدوير */}
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
            onClick={() => { setRot((r) => (r + 90) % 360); setCrop(FULL); }}
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

        {/* منزلقات التحسين */}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Slider icon={<Sun className="size-3.5" />} label="السطوع" value={brightness} onChange={setBrightness} />
          <Slider icon={<Contrast className="size-3.5" />} label="التباين" value={contrast} onChange={setContrast} />
          <Slider icon={<Droplets className="size-3.5" />} label="التشبّع" value={saturation} onChange={setSaturation} min={0} max={2} />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-2xl px-4 py-2 text-sm text-muted hover:bg-muted/10">
            إلغاء
          </button>
          <Button onClick={save} disabled={saving}>
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
