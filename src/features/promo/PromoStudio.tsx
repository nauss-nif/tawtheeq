'use client';

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Images, BadgeCheck, Type, Mic, Music, Wand2, Ratio, Sparkles,
  Play, Pause, Upload, Trash2, Loader2, AlertTriangle, Info, RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { Section, OptionGrid, Segmented, Slider, Toggle, Pill } from './ui';
import { PromoStoryboard } from './Storyboard';
import {
  createPromoAction, generateScriptAction, previewStoryboardAction,
  addPronunciationAction, deletePronunciationAction, suggestPronunciationsAction,
} from './actions';
import { PROMO_STYLE_LIST } from '@/lib/promo/styles';
import { PROMO_VOICES, voicesForStyle } from '@/lib/promo/voices';
import { MUSIC_MOODS, MOOD_LABEL, tracksForMoods } from '@/lib/promo/music';
import { applyStyleDefaults, defaultSettings, validateSettings } from '@/lib/promo/defaults';
import type { StoryboardRow } from '@/lib/promo/timeline';
import type {
  AudioMode, PromoDuration, PromoOrientation, PromoSettings,
  PromoStyleId, RenderOrientation,
} from '@/lib/promo/types';

export interface StudioMedia {
  id: string;
  type: 'image' | 'video';
  thumbnail: string | null;
  caption: string | null;
  isLowQuality: boolean;
  score: number | null;
}

/** مقطع من مكتبة المنصة التي يديرها المدير */
export interface StudioTrack {
  id: string;
  title: string;
  mood: string;
  license: string | null;
  attribution: string | null;
  duration: number | null;
  url: string;
}

export interface StudioLogo {
  id: string;
  url: string;
  name: string;
  /** من مكتبة المنصة (رفعها المدير) لا من رفع المنسق لهذه الدورة */
  official?: boolean;
}

export interface StudioPronunciation {
  id: string;
  term: string;
  phonetic: string;
}

export interface PromoStudioProps {
  courseId: string;
  courseTitle: string;
  courseLocation: string | null;
  courseStartDate: string | null;
  media: StudioMedia[];
  tracks: StudioTrack[];
  logos: StudioLogo[];
  pronunciations: StudioPronunciation[];
  providers: { kind: string; label: string; provider: string | null; configured: boolean; fallback: string }[];
  hasMusicLibrary: boolean;
}

const DURATIONS: { id: string; label: string }[] = [
  { id: '30', label: '٣٠ ثانية' },
  { id: '60', label: '٦٠ ثانية' },
  { id: '90', label: '٩٠ ثانية' },
];

const ORIENTATIONS: { id: PromoOrientation; label: string; description: string }[] = [
  { id: 'horizontal', label: 'أفقي 16:9', description: 'للعرض على الشاشات والمنصات الرسمية.' },
  { id: 'vertical', label: 'عمودي 9:16', description: 'للجوال ووسائل التواصل.' },
  { id: 'both', label: 'النسختان', description: 'قصة واحدة، تكوين مستقل لكل اتجاه.' },
];

const AUDIO_MODES: { id: AudioMode; label: string; description: string }[] = [
  { id: 'music_voice', label: 'موسيقى + تعليق', description: 'تنخفض الموسيقى تلقائيًا أثناء الحديث.' },
  { id: 'music_only', label: 'موسيقى فقط', description: 'بلا تعليق صوتي — النص يظهر على الشاشة.' },
  { id: 'voice_only', label: 'تعليق فقط', description: 'صوت المذيع دون خلفية موسيقية.' },
  { id: 'silent', label: 'بدون صوت', description: 'فيديو صامت جاهز للنشر مع صوت خارجي.' },
];

export function PromoStudio(props: PromoStudioProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [settings, setSettings] = useState<PromoSettings>(() => {
    const base = defaultSettings('cinematic', props.tracks);
    // الوضع الصوتي الافتراضي يراعي ما هو متاح فعلًا: مكتبة الموسيقى ومزوّد
    // التعليق الصوتي. لا نبدأ بإعداد يمنع زرّ الإنشاء.
    const ttsConfigured =
      props.providers.find((p) => p.kind === 'tts')?.configured ?? false;
    if (!ttsConfigured) {
      base.audioMode = props.tracks.length ? 'music_only' : 'silent';
    }
    return base;
  });
  const [openingText, setOpeningText] = useState('');
  const [closingText, setClosingText] = useState('');
  const [narrationText, setNarrationText] = useState('');
  const [touched, setTouched] = useState({ voice: false, music: false });

  const [logos, setLogos] = useState(props.logos);
  const [pronunciations, setPronunciations] = useState(props.pronunciations);
  const [suggestedTerms, setSuggestedTerms] = useState<string[]>([]);

  const [storyboard, setStoryboard] = useState<StoryboardRow[] | null>(null);
  const [rationale, setRationale] = useState<string[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [scriptInfo, setScriptInfo] = useState<{ target: number; actual: number } | null>(null);

  const patch = useCallback((p: Partial<PromoSettings>) => {
    setSettings((s) => ({ ...s, ...p }));
  }, []);

  // اتجاه المعاينة: عند اختيار النسختين نعاين الأفقي أولًا
  const previewOrientation: RenderOrientation =
    settings.orientation === 'vertical' ? 'vertical' : 'horizontal';

  const voices = useMemo(() => voicesForStyle(settings.style), [settings.style]);
  const style = useMemo(
    () => PROMO_STYLE_LIST.find((s) => s.id === settings.style)!,
    [settings.style],
  );

  const suggestedTracks = useMemo(
    () => tracksForMoods(props.tracks, style.musicMoods),
    [props.tracks, style.musicMoods],
  );

  const ttsReady = props.providers.find((p) => p.kind === 'tts')?.configured ?? false;
  const brollReady = props.providers.find((p) => p.kind === 'genvideo')?.configured ?? false;

  const usableMedia = props.media.filter((m) => !m.isLowQuality);
  const errors = validateSettings(settings);

  // ------------------------------------------------------------------ إجراءات

  const changeStyle = (id: PromoStyleId) => {
    setSettings((s) => applyStyleDefaults(s, id, touched, props.tracks));
    setStoryboard(null);
  };

  const generateScript = () => {
    startTransition(async () => {
      const res = await generateScriptAction({
        courseId: props.courseId,
        settings,
        userText: narrationText,
        enhance: Boolean(narrationText.trim()),
        openingText,
        closingText,
      });
      if ('error' in res && res.error) return void toast.error(res.error);
      if ('text' in res && res.text) {
        setNarrationText(res.text);
        setScriptInfo({ target: res.targetWords!, actual: res.actualWords! });
        for (const w of res.warnings ?? []) toast.warning(w);
        toast.success(narrationText.trim() ? 'حُسّنت صياغة النص' : 'كُتب النص من بيانات البرنامج');
      }
    });
  };

  const buildStoryboard = () => {
    setLoadingBoard(true);
    startTransition(async () => {
      const res = await previewStoryboardAction({
        courseId: props.courseId,
        settings,
        orientation: previewOrientation,
        openingText,
        closingText,
      });
      setLoadingBoard(false);
      if ('error' in res && res.error) return void toast.error(res.error);
      if ('rows' in res && res.rows) {
        setStoryboard(res.rows);
        setRationale(res.rationale ?? []);
        toast.success(`${res.rows.length} مشهد — ${res.totalDuration?.toFixed(1)} ثانية`);
      }
    });
  };

  const create = () => {
    if (errors.length) return void toast.error(errors[0]);
    if (!usableMedia.length) {
      return void toast.error('ارفع صورًا أو مقاطع فيديو للبرنامج أولًا.');
    }

    startTransition(async () => {
      const res = await createPromoAction({
        courseId: props.courseId,
        settings,
        openingText,
        closingText,
        narrationText,
      });
      if (res.error) return void toast.error(res.error);
      toast.success(
        settings.skipStoryboard
          ? 'بدأ إنتاج البرومو — تابع التقدّم أدناه'
          : 'بدأ تحليل المواد — ستُعرض لوحة المشاهد للاعتماد',
      );
      router.refresh();
    });
  };

  const uploadLogo = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', 'logo');

    const res = await fetch(`/api/courses/${props.courseId}/promo/assets`, {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    if (!res.ok) return void toast.error(data.error ?? 'تعذّر رفع الشعار');

    const next = { id: data.id, url: data.url, name: file.name };
    setLogos((l) => [...l, next]);
    patch({
      logos: {
        ...settings.logos,
        logos: [
          ...settings.logos.logos,
          { assetId: data.id, url: data.url, scale: 1, order: settings.logos.logos.length },
        ],
      },
    });
    toast.success('أُضيف الشعار');
  };

  const uploadMusic = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', 'music');

    const res = await fetch(`/api/courses/${props.courseId}/promo/assets`, {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    if (!res.ok) return void toast.error(data.error ?? 'تعذّر رفع الملف');

    setTouched((t) => ({ ...t, music: true }));
    patch({ music: { ...settings.music, trackId: 'upload', assetId: data.id } });
    toast.success('استُخدم ملفك الموسيقي');
  };

  // ==================================================================== العرض

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ------------------------------------------------------ أقسام الإعداد */}
      <div className="flex flex-col gap-4">
        <ProviderNotice providers={props.providers} />

        {/* ١ — المحتوى */}
        <Section
          title="المحتوى"
          icon={<Images className="size-4" />}
          hint={`${usableMedia.length} مادة صالحة من أصل ${props.media.length}`}
          badge={
            usableMedia.length ? undefined : <Pill tone="danger">لا توجد مواد</Pill>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-muted">
              يختار النظام أفضل المواد تلقائيًا ويستبعد المكرّر والضعيف. اختر يدويًا فقط
              إذا أردت إلزام النظام بصور بعينها.
            </p>

            {props.media.length > 0 && (
              <MediaPicker
                media={props.media}
                include={settings.includeMediaIds}
                exclude={settings.excludeMediaIds}
                onChange={(include, exclude) =>
                  patch({ includeMediaIds: include, excludeMediaIds: exclude })
                }
              />
            )}

            <Toggle
              label="السماح بتوليد لقطة افتتاحية سينمائية عند الحاجة"
              hint={
                brollReady
                  ? 'تُولَّد لقطة بيئية للموقع فقط (جوية أو معمارية) وتُوسم كمشهد مساند — لا أشخاص ولا أنشطة مُختلقة.'
                  : 'المزوّد غير مُعدّ حاليًا؛ سيُستخدم أفضل ما لديك كلقطة افتتاحية.'
              }
              checked={settings.allowGeneratedBRoll}
              onChange={(v) => patch({ allowGeneratedBRoll: v })}
              disabled={!brollReady}
            />
          </div>
        </Section>

        {/* ٢ — الهوية والشعارات */}
        <Section
          title="الهوية والشعارات"
          icon={<BadgeCheck className="size-4" />}
          hint={`${settings.logos.logos.length} شعار`}
        >
          <LogoManager
            settings={settings}
            logos={logos}
            onPatch={patch}
            onUpload={uploadLogo}
            onRemove={(assetId) => {
              setLogos((l) => l.filter((x) => x.id !== assetId));
              patch({
                logos: {
                  ...settings.logos,
                  logos: settings.logos.logos.filter((x) => x.assetId !== assetId),
                },
              });
            }}
          />
        </Section>

        {/* ٣ — النص */}
        <Section title="النص" icon={<Type className="size-4" />} hint="افتتاحي، ختامي، وتعليق صوتي">
          <div className="flex flex-col gap-5">
            <Textarea
              label="النص الافتتاحي"
              hint="حرّ تمامًا — اكتب ما تريد إظهاره في البداية (اسم البرنامج، المكان، التاريخ، عبارة افتتاحية). كل سطر يظهر منفصلًا."
              rows={3}
              value={openingText}
              onChange={(e) => setOpeningText(e.target.value)}
              placeholder={`${props.courseTitle}\n${props.courseLocation ?? ''}`}
            />

            <Textarea
              label="النص الختامي"
              hint="يظهر قبل بطاقة الشعارات."
              rows={2}
              value={closingText}
              onChange={(e) => setClosingText(e.target.value)}
            />

            <div className="flex flex-col gap-2">
              <Textarea
                label="نص التعليق الصوتي"
                hint="اتركه فارغًا ليكتبه الذكاء الاصطناعي من بيانات البرنامج، أو اكتبه بنفسك وسيُلتزم بمحتواه."
                rows={5}
                value={narrationText}
                onChange={(e) => setNarrationText(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={pending}
                  onClick={generateScript}
                >
                  <Wand2 className="size-4" />
                  {narrationText.trim() ? 'تحسين الصياغة' : 'اكتب النص تلقائيًا'}
                </Button>
                {scriptInfo && (
                  <Pill tone={Math.abs(scriptInfo.actual - scriptInfo.target) > scriptInfo.target * 0.2 ? 'warning' : 'success'}>
                    {scriptInfo.actual} كلمة / المناسب ≈ {scriptInfo.target}
                  </Pill>
                )}
              </div>
              {narrationText.trim() && (
                <Toggle
                  label="اسمح بتحسين صياغة نصي عند الإنتاج"
                  hint="المعنى والمحتوى يبقيان كما كتبتهما."
                  checked={settings.enhanceUserScript}
                  onChange={(v) => patch({ enhanceUserScript: v })}
                />
              )}
            </div>

            <PronunciationDictionary
              courseId={props.courseId}
              items={pronunciations}
              suggested={suggestedTerms}
              onLoadSuggestions={async () => {
                const res = await suggestPronunciationsAction(props.courseId);
                setSuggestedTerms(res.terms);
              }}
              onAdd={async (term, phonetic) => {
                const res = await addPronunciationAction(props.courseId, term, phonetic);
                if (res.error) return void toast.error(res.error);
                setPronunciations((p) => [
                  ...p.filter((x) => x.term !== term),
                  { id: crypto.randomUUID(), term, phonetic },
                ]);
                setSuggestedTerms((s) => s.filter((t) => t !== term));
                toast.success('حُفظ النطق');
              }}
              onRemove={async (id) => {
                await deletePronunciationAction(id, props.courseId);
                setPronunciations((p) => p.filter((x) => x.id !== id));
              }}
            />
          </div>
        </Section>

        {/* ٤ — الصوت */}
        <Section
          title="الصوت"
          icon={<Mic className="size-4" />}
          hint={AUDIO_MODES.find((m) => m.id === settings.audioMode)?.label}
          badge={!ttsReady ? <Pill tone="warning">المزوّد غير مُعدّ</Pill> : undefined}
        >
          <div className="flex flex-col gap-5">
            <OptionGrid
              options={AUDIO_MODES.map((m) => ({
                ...m,
                disabled: !ttsReady && (m.id === 'voice_only' || m.id === 'music_voice'),
                note:
                  !ttsReady && (m.id === 'voice_only' || m.id === 'music_voice')
                    ? 'يتطلّب تهيئة مزوّد التعليق الصوتي'
                    : undefined,
              }))}
              value={settings.audioMode}
              onChange={(id) => patch({ audioMode: id })}
            />

            {(settings.audioMode === 'music_voice' || settings.audioMode === 'voice_only') && (
              <VoicePicker
                settings={settings}
                voices={voices}
                onPatch={(v) => {
                  setTouched((t) => ({ ...t, voice: true }));
                  patch({ voice: { ...settings.voice, ...v } });
                }}
              />
            )}
          </div>
        </Section>

        {/* ٥ — الموسيقى */}
        <Section
          title="الموسيقى"
          icon={<Music className="size-4" />}
          hint={
            settings.music.trackId === 'upload'
              ? 'ملف خاص'
              : props.tracks.find((t) => t.id === settings.music.trackId)?.title ?? 'لم تُختر'
          }
        >
          <MusicPicker
            settings={settings}
            tracks={suggestedTracks}
            moods={style.musicMoods}
            onSelect={(id) => {
              setTouched((t) => ({ ...t, music: true }));
              patch({ music: { ...settings.music, trackId: id, assetId: null } });
            }}
            onVolume={(v) => patch({ music: { ...settings.music, volume: v } })}
            onUpload={uploadMusic}
            disabled={settings.audioMode === 'voice_only' || settings.audioMode === 'silent'}
          />
        </Section>

        {/* ٦ — النمط */}
        <Section title="النمط" icon={<Sparkles className="size-4" />} hint={style.label}>
          <OptionGrid
            options={PROMO_STYLE_LIST.map((s) => ({
              id: s.id,
              label: s.label,
              description: s.description,
            }))}
            value={settings.style}
            onChange={changeStyle}
          />
        </Section>

        {/* ٧ — المدة والاتجاه */}
        <Section
          title="المدة والاتجاه"
          icon={<Ratio className="size-4" />}
          hint={`${settings.duration} ثانية · ${
            ORIENTATIONS.find((o) => o.id === settings.orientation)?.label
          }`}
        >
          <div className="flex flex-col gap-5">
            <Segmented
              label="مدة الفيديو"
              options={DURATIONS}
              value={String(settings.duration)}
              onChange={(v) => {
                patch({ duration: Number(v) as PromoDuration });
                setStoryboard(null);
              }}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-primary">اتجاه الفيديو</span>
              <OptionGrid
                columns={3}
                options={ORIENTATIONS}
                value={settings.orientation}
                onChange={(id) => {
                  patch({ orientation: id });
                  setStoryboard(null);
                }}
              />
              {settings.orientation === 'both' && (
                <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-muted">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  القصة واحدة، لكن التكوين يُبنى من جديد لكل اتجاه: نقطة التركيز، حركة الصور،
                  مواضع النصوص، وأحجام الشعارات. لا اقتصاص ولا أشرطة سوداء.
                </p>
              )}
            </div>
          </div>
        </Section>

        {/* ٨ — لوحة المشاهد */}
        <Section
          title="لوحة المشاهد (Storyboard)"
          icon={<Play className="size-4" />}
          hint="راجع المشاهد قبل الإنتاج، أو تخطَّها"
          defaultOpen={false}
        >
          <div className="flex flex-col gap-4">
            <Toggle
              label="إنشاء مباشر — تخطَّ لوحة المشاهد"
              hint="يبدأ الإنتاج فورًا دون مرحلة مراجعة."
              checked={settings.skipStoryboard}
              onChange={(v) => patch({ skipStoryboard: v })}
            />
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={loadingBoard}
                onClick={buildStoryboard}
              >
                <RefreshCw className="size-4" />
                معاينة لوحة المشاهد
              </Button>
            </div>
            {storyboard && <PromoStoryboard rows={storyboard} rationale={rationale} />}
          </div>
        </Section>
      </div>

      {/* -------------------------------------------------------- لوحة المعاينة */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-soft">
          <h3 className="heading-accent text-lg font-semibold text-primary">المعاينة</h3>

          <PreviewFrame
            orientation={previewOrientation}
            styleLabel={style.label}
            title={openingText.split('\n')[0] || props.courseTitle}
            subtitle={
              openingText.split('\n')[1] ??
              [props.courseLocation, formatDate(props.courseStartDate)].filter(Boolean).join(' — ')
            }
            poster={usableMedia[0]?.thumbnail ?? null}
          />

          <dl className="flex flex-col gap-2 text-sm">
            <SummaryRow label="المدة" value={`${settings.duration} ثانية`} />
            <SummaryRow
              label="الاتجاه"
              value={ORIENTATIONS.find((o) => o.id === settings.orientation)!.label}
            />
            <SummaryRow label="النمط" value={style.label} />
            <SummaryRow
              label="الصوت"
              value={AUDIO_MODES.find((m) => m.id === settings.audioMode)!.label}
            />
            <SummaryRow
              label="الدقة"
              value={previewOrientation === 'vertical' ? '1080×1920' : '1920×1080'}
            />
          </dl>

          {errors.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-xl bg-state-danger/8 p-3">
              {errors.map((e) => (
                <li key={e} className="flex items-start gap-1.5 text-sm text-state-danger">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {e}
                </li>
              ))}
            </ul>
          )}

          <Button
            type="button"
            size="lg"
            loading={pending}
            disabled={errors.length > 0 || !usableMedia.length}
            onClick={create}
            className="w-full"
          >
            <Sparkles className="size-5" />
            إنشاء البرومو
          </Button>

          <p className="text-center text-xs leading-relaxed text-muted">
            يعمل الإنتاج في الخلفية. يمكنك مغادرة الصفحة والعودة لاحقًا.
          </p>
        </div>
      </aside>
    </div>
  );
}

// ==========================================================================
// مكوّنات فرعية
// ==========================================================================

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-muted/12 pb-2 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-primary">{value}</dd>
    </div>
  );
}

/** إطار المعاينة — يتغيّر شكله فورًا مع الاتجاه المختار */
function PreviewFrame({
  orientation,
  styleLabel,
  title,
  subtitle,
  poster,
}: {
  orientation: RenderOrientation;
  styleLabel: string;
  title: string;
  subtitle?: string;
  poster: string | null;
}) {
  return (
    <div className="flex justify-center">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl bg-primary shadow-soft-md transition-all duration-300',
          orientation === 'vertical' ? 'aspect-[9/16] w-44' : 'aspect-video w-full',
        )}
      >
        {poster ? (
          <img src={poster} alt="" className="size-full object-cover opacity-70" />
        ) : (
          <div className="size-full bg-gradient-to-br from-primary to-primary-dark" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-4 text-center">
          <p className="truncate text-sm font-semibold text-white drop-shadow">{title}</p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-white/85">{subtitle}</p>}
          <span className="mx-auto mt-2 block h-0.5 w-10 rounded-full bg-secondary" />
        </div>

        <span className="absolute right-2 top-2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {styleLabel}
        </span>
      </div>
    </div>
  );
}

function ProviderNotice({ providers }: { providers: PromoStudioProps['providers'] }) {
  const missing = providers.filter((p) => !p.configured);
  if (!missing.length) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-state-warning/8 p-4">
      <Info className="mt-0.5 size-4 shrink-0 text-state-warning" />
      <div className="min-w-0 text-sm">
        <p className="font-medium text-primary">بعض الخدمات غير مُهيّأة — البرومو سيُنتَج مع ذلك</p>
        <ul className="mt-1.5 flex flex-col gap-1 text-muted">
          {missing.map((m) => (
            <li key={m.kind}>
              <span className="font-medium text-primary/80">{m.label}:</span> {m.fallback}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MediaPicker({
  media,
  include,
  exclude,
  onChange,
}: {
  media: StudioMedia[];
  include: string[];
  exclude: string[];
  onChange: (include: string[], exclude: string[]) => void;
}) {
  const cycle = (id: string) => {
    // تلقائي ← إلزام ← استبعاد ← تلقائي
    if (include.includes(id)) {
      onChange(include.filter((x) => x !== id), [...exclude, id]);
    } else if (exclude.includes(id)) {
      onChange(include, exclude.filter((x) => x !== id));
    } else {
      onChange([...include, id], exclude);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-full bg-muted/30" /> تلقائي
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-full bg-primary" /> إلزام
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-full bg-state-danger" /> استبعاد
        </span>
      </div>
      <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto rounded-xl bg-background p-2 sm:grid-cols-6">
        {media.map((m) => {
          const inc = include.includes(m.id);
          const exc = exclude.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => cycle(m.id)}
              title={m.caption ?? undefined}
              className={cn(
                'relative aspect-square overflow-hidden rounded-lg border-2 transition-all',
                inc ? 'border-primary' : exc ? 'border-state-danger opacity-40' : 'border-transparent',
              )}
            >
              {m.thumbnail ? (
                <img src={m.thumbnail} alt="" className="size-full object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center bg-muted/15 text-[10px] text-muted">
                  {m.type === 'video' ? 'فيديو' : 'صورة'}
                </span>
              )}
              {m.isLowQuality && (
                <span className="absolute inset-x-0 bottom-0 bg-state-danger/80 py-0.5 text-[9px] text-white">
                  جودة منخفضة
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LogoManager({
  settings,
  logos,
  onPatch,
  onUpload,
  onRemove,
}: {
  settings: PromoSettings;
  logos: StudioLogo[];
  onPatch: (p: Partial<PromoSettings>) => void;
  onUpload: (f: File) => Promise<void>;
  onRemove: (assetId: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const extras = settings.logos.logos.filter((l) => l.assetId !== 'nauss');
  const chosen = new Set(settings.logos.logos.map((l) => l.assetId));
  const availableOfficial = logos.filter((l) => l.official && !chosen.has(l.id));

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm leading-relaxed text-muted">
        شعار جامعة نايف جزء ثابت من هوية البرومو. يمكنك إضافة شعارين إضافيين كحدٍّ أقصى.
        النسب الأصلية محفوظة دائمًا — لا تمديد ولا تشويه.
      </p>

      <div className="flex flex-col gap-3">
        {settings.logos.logos
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((logo, i) => {
            const isNauss = logo.assetId === 'nauss';
            const meta = logos.find((l) => l.id === logo.assetId);
            return (
              <div key={logo.assetId} className="flex items-center gap-3 rounded-xl bg-background p-3">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-primary p-2">
                  <img src={logo.url} alt="" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-primary">
                    {isNauss ? 'جامعة نايف العربية للعلوم الأمنية' : meta?.name ?? 'شعار إضافي'}
                  </p>
                  <Slider
                    label="الحجم النسبي"
                    value={logo.scale}
                    min={0.6}
                    max={1.4}
                    step={0.05}
                    format={(v) => `${Math.round(v * 100)}٪`}
                    onChange={(v) =>
                      onPatch({
                        logos: {
                          ...settings.logos,
                          logos: settings.logos.logos.map((l) =>
                            l.assetId === logo.assetId ? { ...l, scale: v } : l,
                          ),
                        },
                      })
                    }
                  />
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() =>
                      onPatch({
                        logos: {
                          ...settings.logos,
                          logos: settings.logos.logos.map((l) =>
                            l.assetId === logo.assetId
                              ? { ...l, order: l.order - 1 }
                              : l.order === logo.order - 1
                                ? { ...l, order: l.order + 1 }
                                : l,
                          ),
                        },
                      })
                    }
                    className="rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-primary disabled:opacity-30"
                  >
                    ↑ تقديم
                  </button>
                  {!isNauss && (
                    <button
                      type="button"
                      onClick={() => onRemove(logo.assetId)}
                      className="rounded-lg px-2 py-1 text-xs text-state-danger transition-colors hover:bg-state-danger/10"
                    >
                      <Trash2 className="inline size-3.5" /> حذف
                    </button>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {extras.length < 2 && availableOfficial.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-background p-3">
          <span className="text-sm font-medium text-primary">
            شعارات المنصة الرسمية
          </span>
          <div className="flex flex-wrap gap-2">
            {availableOfficial.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() =>
                  onPatch({
                    logos: {
                      ...settings.logos,
                      logos: [
                        ...settings.logos.logos,
                        {
                          assetId: l.id,
                          url: l.url,
                          scale: 1,
                          order: settings.logos.logos.length,
                        },
                      ],
                    },
                  })
                }
                className="flex items-center gap-2 rounded-lg border border-muted/25 bg-surface px-3 py-2 text-sm transition-colors hover:border-primary/40"
              >
                <span className="flex size-8 items-center justify-center rounded bg-primary p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={l.url} alt="" className="max-h-full max-w-full object-contain" />
                </span>
                <span className="text-primary">{l.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {extras.length < 2 && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              await onUpload(f);
              setBusy(false);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" /> رفع شعار خاص بهذه الدورة ({extras.length}/2)
          </Button>
        </div>
      )}

      <Segmented
        label="ظهور الشعارات"
        options={[
          { id: 'start', label: 'في البداية' },
          { id: 'end', label: 'في النهاية' },
          { id: 'both', label: 'كليهما' },
        ]}
        value={settings.logos.placement}
        onChange={(v) =>
          onPatch({ logos: { ...settings.logos, placement: v as 'start' | 'end' | 'both' } })
        }
      />
    </div>
  );
}

function VoicePicker({
  settings,
  voices,
  onPatch,
}: {
  settings: PromoSettings;
  voices: typeof PROMO_VOICES;
  onPatch: (v: Partial<PromoSettings['voice']>) => void;
}) {
  const [gender, setGender] = useState<'male' | 'female'>(
    voices.find((v) => v.id === settings.voice.voiceId)?.gender ?? 'male',
  );
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filtered = voices.filter((v) => v.gender === gender);

  const preview = async (voiceId: string) => {
    if (playing === voiceId) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    setPlaying(voiceId);
    try {
      const res = await fetch('/api/promo/voice-preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ voiceId, settings: settings.voice }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPlaying(null);
        return void toast.error(err.error ?? 'تعذّرت المعاينة الصوتية');
      }
      const blob = await res.blob();
      audioRef.current?.pause();
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => setPlaying(null);
      await audio.play();
    } catch {
      setPlaying(null);
      toast.error('تعذّرت المعاينة الصوتية');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Segmented
        label="الجنس"
        options={[
          { id: 'male', label: 'رجالي' },
          { id: 'female', label: 'نسائي' },
        ]}
        value={gender}
        onChange={(v) => setGender(v as 'male' | 'female')}
      />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-primary">الصوت</span>
        {filtered.map((v) => {
          const active = settings.voice.voiceId === v.id;
          return (
            <div
              key={v.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 transition-all',
                active ? 'border-primary bg-primary/[0.06]' : 'border-muted/25',
              )}
            >
              <button
                type="button"
                onClick={() => onPatch({ voiceId: v.id })}
                className="min-w-0 flex-1 text-right"
              >
                <span className={cn('block font-medium', active ? 'text-primary' : 'text-primary/80')}>
                  {v.label}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted">
                  {v.description}
                </span>
              </button>
              <button
                type="button"
                onClick={() => preview(v.id)}
                aria-label={`معاينة ${v.label}`}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary transition-colors hover:bg-primary/15"
              >
                {playing === v.id ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="سرعة القراءة"
          value={settings.voice.speed}
          min={0.75}
          max={1.25}
          step={0.01}
          format={(v) => `${v.toFixed(2)}×`}
          onChange={(v) => onPatch({ speed: v })}
        />
        <Slider
          label="مستوى الحماس"
          value={settings.voice.energy}
          min={0}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}٪`}
          onChange={(v) => onPatch({ energy: v })}
        />
        <Slider
          label="طول الوقفات"
          value={settings.voice.pauseMs}
          min={200}
          max={700}
          step={20}
          format={(v) => `${v} م.ث`}
          onChange={(v) => onPatch({ pauseMs: v })}
        />
        <Slider
          label="وضوح النطق"
          value={settings.voice.clarity}
          min={0.4}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}٪`}
          hint="الوضوح الأعلى يعطي نطقًا أثبت وأدقّ للأسماء."
          onChange={(v) => onPatch({ clarity: v })}
        />
      </div>

      <Segmented
        label="النبرة"
        options={[
          { id: 'warm', label: 'دافئة' },
          { id: 'neutral', label: 'محايدة' },
          { id: 'serious', label: 'جادّة' },
        ]}
        value={settings.voice.tone}
        onChange={(v) => onPatch({ tone: v as 'warm' | 'neutral' | 'serious' })}
      />
    </div>
  );
}

function MusicPicker({
  settings,
  tracks,
  moods,
  onSelect,
  onVolume,
  onUpload,
  disabled,
}: {
  settings: PromoSettings;
  tracks: StudioTrack[];
  moods: string[];
  onSelect: (id: string) => void;
  onVolume: (v: number) => void;
  onUpload: (f: File) => Promise<void>;
  disabled: boolean;
}) {
  const [mood, setMood] = useState<string>('all');
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const shown = mood === 'all' ? tracks : tracks.filter((t) => t.mood === mood);

  const play = (t: StudioTrack) => {
    if (playing === t.id) {
      audioRef.current?.pause();
      return setPlaying(null);
    }
    audioRef.current?.pause();
    const audio = new Audio(t.url);
    audio.volume = 0.7;
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    audio.onerror = () => {
      setPlaying(null);
      toast.error('تعذّر تشغيل هذا المقطع.');
    };
    void audio.play();
    setPlaying(t.id);
  };

  if (disabled) {
    return (
      <p className="text-sm text-muted">
        الوضع الصوتي الحالي لا يتضمّن موسيقى. غيّره من قسم «الصوت» لتفعيل هذا القسم.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1.5">
        <MoodChip id="all" label="الكل" active={mood === 'all'} onClick={setMood} />
        {MUSIC_MOODS.map((m) => (
          <MoodChip
            key={m.id}
            id={m.id}
            label={m.label}
            active={mood === m.id}
            suggested={moods.includes(m.id)}
            onClick={setMood}
          />
        ))}
      </div>

      {!tracks.length && (
        <p className="rounded-xl bg-state-warning/8 p-4 text-sm leading-relaxed text-primary">
          مكتبة الموسيقى فارغة. يرفع مديرُ المنصة المقاطع المعتمدة من
          «لوحة الإدارة ← مكتبة البرومو»، ثم تظهر هنا للاختيار. يمكنك مؤقتًا رفع ملف
          خاص بهذا البرومو من الأسفل.
        </p>
      )}

      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {shown.map((t) => {
          const active = settings.music.trackId === t.id;
          return (
            <div
              key={t.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 transition-all',
                active ? 'border-primary bg-primary/[0.06]' : 'border-muted/25',
              )}
            >
              <button
                type="button"
                onClick={() => play(t)}
                aria-label={`معاينة ${t.title}`}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary"
              >
                {playing === t.id ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                className="min-w-0 flex-1 text-right"
              >
                <span className={cn('block font-medium', active ? 'text-primary' : 'text-primary/80')}>
                  {t.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {[
                    t.mood ? MOOD_LABEL[t.mood] ?? t.mood : null,
                    t.duration ? `${Math.round(t.duration)} ثانية` : null,
                    t.license ? `ترخيص ${t.license}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-t border-muted/15 pt-4">
        <input
          ref={fileRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/mp4,audio/aac"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            await onUpload(f);
            setBusy(false);
            e.target.value = '';
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" /> رفع ملف موسيقي خاص
          </Button>
          {settings.music.trackId === 'upload' && <Pill tone="primary">يُستخدم ملفك</Pill>}
        </div>
        <p className="text-xs leading-relaxed text-muted">
          مقاطع مكتبة المنصة يرفعها المدير بتراخيص مسجّلة تظهر بجانب كل مقطع. أما الملف
          الذي ترفعه هنا فيخصّ هذا البرومو وحده، وأنت مسؤول عن حقوق استخدامه.
        </p>

        <Slider
          label="مستوى الموسيقى"
          value={settings.music.volume}
          min={0.1}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}٪`}
          hint={
            settings.audioMode === 'music_voice'
              ? 'تنخفض تلقائيًا أثناء التعليق الصوتي وترتفع بين الجمل.'
              : undefined
          }
          onChange={onVolume}
        />
      </div>
    </div>
  );
}

function MoodChip({
  id,
  label,
  active,
  suggested,
  onClick,
}: {
  id: string;
  label: string;
  active: boolean;
  suggested?: boolean;
  onClick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={cn(
        'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-primary text-white' : 'bg-background text-muted hover:text-primary',
        suggested && !active && 'ring-1 ring-secondary/50',
      )}
    >
      {label}
      {suggested && !active && <span className="mr-1 text-secondary">•</span>}
    </button>
  );
}

function PronunciationDictionary({
  courseId,
  items,
  suggested,
  onLoadSuggestions,
  onAdd,
  onRemove,
}: {
  courseId: string;
  items: StudioPronunciation[];
  suggested: string[];
  onLoadSuggestions: () => Promise<void>;
  onAdd: (term: string, phonetic: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [term, setTerm] = useState('');
  const [phonetic, setPhonetic] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-xl bg-background p-4">
      <button
        type="button"
        onClick={async () => {
          setOpen((v) => !v);
          if (!open && !suggested.length) await onLoadSuggestions();
        }}
        className="flex w-full items-center justify-between gap-2 text-right"
      >
        <span className="text-sm font-medium text-primary">
          قاموس النطق {items.length > 0 && <Pill tone="primary">{items.length}</Pill>}
        </span>
        <span className="text-xs text-muted">{open ? 'إخفاء' : 'إظهار'}</span>
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-xs leading-relaxed text-muted">
            حدّد النطق الصحيح للأسماء والمدن والمصطلحات الخاصة. اكتب الكلمة كما تُكتب،
            والنطق كما يجب أن يُقرأ.
          </p>

          {items.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {items.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm"
                >
                  <span className="font-medium text-primary">{p.term}</span>
                  <span className="text-muted">←</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{p.phonetic}</span>
                  <button
                    type="button"
                    onClick={() => onRemove(p.id)}
                    aria-label={`حذف ${p.term}`}
                    className="shrink-0 text-state-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {suggested.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted">مقترحة:</span>
              {suggested.slice(0, 10).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTerm(t)}
                  className="rounded-full bg-secondary/15 px-2 py-0.5 text-xs text-primary"
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              placeholder="الكلمة"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="h-10"
            />
            <Input
              placeholder="النطق"
              value={phonetic}
              onChange={(e) => setPhonetic(e.target.value)}
              className="h-10"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={busy}
              disabled={!term.trim() || !phonetic.trim()}
              onClick={async () => {
                setBusy(true);
                await onAdd(term.trim(), phonetic.trim());
                setTerm('');
                setPhonetic('');
                setBusy(false);
              }}
            >
              إضافة
            </Button>
          </div>
        </div>
      )}
      <input type="hidden" value={courseId} readOnly />
    </div>
  );
}

function formatDate(d: string | null): string {
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(d));
  } catch {
    return '';
  }
}
