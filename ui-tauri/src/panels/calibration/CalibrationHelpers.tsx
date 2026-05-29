import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CalibrationRuntimeValues } from '../../config/calibrationPresets';

import { ValueRail } from '../../components/ValueRail';

export type HoverState = 'up' | 'down' | null;

export interface CalibrationPreviewResult {
  error?: string;
  decision?: 'accepted' | 'rejected';
  rejection_reason?: string | null;
  quality_score?: number;
  detected_text?: string;
  processed_image?: string;
  time_ms?: number;
}

export const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: 'rgba(191, 215, 242, 0.72)',
  fontWeight: 700,
};

export const titleStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#9fb7cf',
  fontWeight: 500,
  lineHeight: 1.45,
  letterSpacing: '-0.01em',
};

export const shellStyle: React.CSSProperties = {
  borderRadius: 18,
  background: 'rgba(5, 9, 14, 0.42)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
  minHeight: 0,
  overflow: 'hidden',
};

export const previewShellStyle: React.CSSProperties = {
  minHeight: 0,
  borderRadius: 24,
  background: 'rgba(255,255,255,0.045)',
  overflow: 'hidden',
};

export const LayerGlyph = ({ path, size = 18 }: { path: string, size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: size, height: size }}>
    <path d={path} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ShiftArrow = ({ direction = 'up', size = 18 }: { direction?: 'up' | 'down', size?: number }) => (
  <LayerGlyph path={direction === 'up' ? 'M8 14.5 12 10.5l4 4' : 'M8 9.5 12 13.5l4-4'} size={size} />
);

export const SkeletonBlock = ({
  label,
  title,
  icon,
  style,
  hideTitle = false,
  sample,
  headerAction,
  interactive = false,
}: {
  label: string;
  title: React.ReactNode;
  icon: string;
  style?: React.CSSProperties;
  hideTitle?: boolean;
  sample?: React.ReactNode;
  headerAction?: React.ReactNode;
  interactive?: boolean;
}) => {
  const [blockHovered, setBlockHovered] = useState(false);
  const glowActive = interactive && blockHovered;
  return (
    <div
      onMouseEnter={interactive ? () => setBlockHovered(true) : undefined}
      onMouseLeave={interactive ? () => setBlockHovered(false) : undefined}
      style={{
        ...shellStyle,
        position: 'relative',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 0,
        boxShadow: glowActive
          ? 'inset 0 0 0 1px rgba(125,211,252,0.28), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 18px rgba(125,211,252,0.06)'
          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
        transition: 'box-shadow 180ms ease',
        ...style,
      }}
    >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 24, minHeight: 24 }}>
      <div style={labelStyle}>{label}</div>
      {!headerAction ? (
        <div style={{ color: 'rgba(172, 214, 255, 0.82)' }}>
          <LayerGlyph path={icon} />
        </div>
      ) : null}
    </div>
    {headerAction ? (
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 16,
          height: 24,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          color: 'rgba(172, 214, 255, 0.82)',
          zIndex: 3,
        }}
      >
        {headerAction}
      </div>
    ) : null}
    {!hideTitle ? <div style={{ ...titleStyle, marginTop: 8 }}>{title}</div> : null}
    {sample ? (
      <div
        style={{
          marginTop: hideTitle ? 0 : 10,
          flex: hideTitle ? 1 : undefined,
          display: hideTitle ? 'flex' : undefined,
          alignItems: hideTitle ? 'center' : undefined,
          justifyContent: hideTitle ? 'center' : undefined,
          minHeight: 0,
          height: hideTitle ? '100%' : undefined,
          width: '100%'
        }}
      >
        {sample}
      </div>
    ) : null}
  </div>
  );
};

export const MiniRailBlock = ({
  label,
  icon,
  previousValue,
  activeValue,
  nextValue,
  onShift,
  hover,
  setHover,
  onDoubleClickActiveValue,
  isEditingValue,
  onRenameSubmit,
  onRenameCancel,
  disabled = false,
}: {
  label: string;
  icon: string;
  previousValue: string | null;
  activeValue: string;
  nextValue: string | null;
  onShift: (dir: -1 | 1) => void;
  hover: HoverState;
  setHover: (value: HoverState) => void;
  onDoubleClickActiveValue?: () => void;
  isEditingValue?: boolean;
  onRenameSubmit?: (newName: string) => void;
  onRenameCancel?: () => void;
  disabled?: boolean;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editVal, setEditVal] = useState(activeValue);

  useEffect(() => {
    if (isEditingValue) {
      setEditVal(activeValue);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 0);
    }
  }, [isEditingValue, activeValue]);

  const handleCommit = () => {
    if (!isEditingValue) return;
    const trimmed = editVal.trim();
    if (trimmed && trimmed !== activeValue) {
      onRenameSubmit?.(trimmed);
    } else {
      onRenameCancel?.();
    }
  };

  return (
    <SkeletonBlock
      label={label}
      title={label}
      icon={icon}
      hideTitle
      interactive={!disabled}
      style={{
        opacity: !disabled ? 1 : 0.48,
        background: !disabled ? shellStyle.background : 'rgba(5, 9, 14, 0.22)',
        transition: 'opacity 280ms ease, background 280ms ease, box-shadow 180ms ease',
      }}
      sample={
        <div
          onWheel={(event) => {
            if (isEditingValue) return;
            event.preventDefault();
            onShift(event.deltaY > 0 ? 1 : -1);
          }}
          style={{
            minHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'stretch',
            userSelect: 'none',
            width: '100%',
            overflow: 'hidden',
          }}
        >
          {isEditingValue ? (
            <input
              ref={inputRef}
              type="text"
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCommit();
                } else if (e.key === 'Escape') {
                  onRenameCancel?.();
                }
              }}
              onBlur={handleCommit}
              maxLength={24}
              style={{
                width: '100%',
                background: 'rgba(5, 9, 14, 0.6)',
                border: '1px solid rgba(125,211,252,0.4)',
                borderRadius: 4,
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                textAlign: 'center',
                padding: '4px 8px',
                outline: 'none',
                boxShadow: '0 0 8px rgba(125,211,252,0.2)',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateRows: '16px minmax(0, auto) 16px',
                alignItems: 'center',
                justifyItems: 'center',
                gap: 2,
                maxHeight: '100%',
              }}
            >
              <button
                type="button"
                onClick={() => onShift(-1)}
                onMouseEnter={() => setHover('up')}
                onMouseLeave={() => setHover(null)}
                aria-label={`${label} yukarı`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: hover === 'up' ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                  cursor: 'pointer',
                  padding: 0,
                  height: 16,
                  width: 22,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                  transform: hover === 'up' ? 'translateY(-1px)' : 'none',
                  opacity: hover === 'up' ? 1 : 0.82,
                }}
              >
                <ShiftArrow direction="up" size={16} />
              </button>
              <div style={{ width: '100%' }} onDoubleClick={() => onDoubleClickActiveValue?.()}>
                <ValueRail size="mini" previousValue={previousValue} activeValue={activeValue} nextValue={nextValue} />
              </div>
              <button
                type="button"
                onClick={() => onShift(1)}
                onMouseEnter={() => setHover('down')}
                onMouseLeave={() => setHover(null)}
                aria-label={`${label} aşağı`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: hover === 'down' ? '#7dd3fc' : 'rgba(159, 183, 207, 0.64)',
                  cursor: 'pointer',
                  padding: 0,
                  height: 16,
                  width: 22,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 160ms ease, transform 160ms ease, opacity 160ms ease',
                  transform: hover === 'down' ? 'translateY(1px)' : 'none',
                  opacity: hover === 'down' ? 1 : 0.82,
                }}
              >
                <ShiftArrow direction="down" size={16} />
              </button>
            </div>
          )}
        </div>
      }
    />
  );
};

export const calibrationGroupTitleStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 650,
  color: '#d9e9fb',
  letterSpacing: '-0.01em',
};

export const calibrationHintTextStyle: React.CSSProperties = {
  fontSize: 10.5,
  lineHeight: 1.45,
  color: 'rgba(159, 183, 207, 0.78)',
};

export type CalibrationControlKey =
  | 'sensitivity'
  | 'characters'
  | 'balance'
  | 'attempts'
  | 'match'
  | 'claheStriped'
  | 'clahePlain'
  | 'whiteThreshold'
  | 'bilateral'
  | 'gaussianC'
  | 'meanC';

export type CalibrationControlConfig = {
  key: CalibrationControlKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  initial: number;
  decimals?: number;
  accentStart: string;
  accentEnd: string;
  glow: string;
  dependsOnImageFilters?: boolean;
};

export type ConceptCalibrationSnapshot = {
  values: CalibrationValues;
  ocrFiltersEnabled: boolean;
};
export type CalibrationValues = Record<CalibrationControlKey, number>;
export type ConceptCalibrationDraftProfile = {
  id: string;
  name: string;
  snapshot: ConceptCalibrationSnapshot;
  savedSnapshot: ConceptCalibrationSnapshot | null;
  dirty: boolean;
  saved: boolean;
};
export type CalibrationInfoKey =
  | CalibrationControlKey
  | 'overview'
  | 'groupDecision'
  | 'groupFlow'
  | 'groupScene'
  | 'groupImage';

export type CalibrationInfoContent = {
  title: string;
  what: string;
  lower: string;
  higher: string;
  mode: string;
};

export const calibrationControls: Record<CalibrationControlKey, CalibrationControlConfig> = {
  sensitivity: {
    key: 'sensitivity',
    label: 'Hassasiyet',
    min: 0,
    max: 100,
    step: 5,
    unit: '%',
    initial: 40,
    accentStart: '#38bdf8',
    accentEnd: '#22c55e',
    glow: 'rgba(56,189,248,0.30)',
  },
  characters: {
    key: 'characters',
    label: 'Karakter',
    min: 1,
    max: 20,
    step: 1,
    unit: 'adet',
    initial: 5,
    accentStart: '#60a5fa',
    accentEnd: '#818cf8',
    glow: 'rgba(96,165,250,0.30)',
  },
  balance: {
    key: 'balance',
    label: 'Denge',
    min: 1,
    max: 8,
    step: 1,
    unit: 'örnek',
    initial: 2,
    accentStart: '#94a3b8',
    accentEnd: '#e2e8f0',
    glow: 'rgba(148,163,184,0.24)',
  },
  attempts: {
    key: 'attempts',
    label: 'Deneme',
    min: 1,
    max: 8,
    step: 1,
    unit: 'varyant',
    initial: 4,
    accentStart: '#f59e0b',
    accentEnd: '#facc15',
    glow: 'rgba(245,158,11,0.26)',
    dependsOnImageFilters: true,
  },
  match: {
    key: 'match',
    label: 'Uyum',
    min: 0,
    max: 100,
    step: 2,
    unit: '%',
    initial: 42,
    accentStart: '#a78bfa',
    accentEnd: '#38bdf8',
    glow: 'rgba(167,139,250,0.28)',
    dependsOnImageFilters: true,
  },
  claheStriped: {
    key: 'claheStriped',
    label: 'CLAHE Şeritli',
    min: 1,
    max: 5,
    step: 0.1,
    unit: 'seviye',
    initial: 2,
    decimals: 1,
    accentStart: '#8b5cf6',
    accentEnd: '#22d3ee',
    glow: 'rgba(139,92,246,0.28)',
    dependsOnImageFilters: true,
  },
  clahePlain: {
    key: 'clahePlain',
    label: 'CLAHE Şeritsiz',
    min: 1,
    max: 5,
    step: 0.1,
    unit: 'seviye',
    initial: 3.5,
    decimals: 1,
    accentStart: '#7c3aed',
    accentEnd: '#60a5fa',
    glow: 'rgba(124,58,237,0.27)',
    dependsOnImageFilters: true,
  },
  whiteThreshold: {
    key: 'whiteThreshold',
    label: 'Beyaz Eşiği',
    min: 0,
    max: 255,
    step: 5,
    unit: 'seviye',
    initial: 110,
    accentStart: '#facc15',
    accentEnd: '#fb7185',
    glow: 'rgba(250,204,21,0.24)',
    dependsOnImageFilters: true,
  },
  bilateral: {
    key: 'bilateral',
    label: 'Bilateral',
    min: 1,
    max: 15,
    step: 2,
    unit: 'px',
    initial: 9,
    accentStart: '#14b8a6',
    accentEnd: '#38bdf8',
    glow: 'rgba(20,184,166,0.26)',
    dependsOnImageFilters: true,
  },
  gaussianC: {
    key: 'gaussianC',
    label: 'Gaussian C',
    min: 0,
    max: 20,
    step: 1,
    unit: 'seviye',
    initial: 8,
    accentStart: '#22c55e',
    accentEnd: '#84cc16',
    glow: 'rgba(34,197,94,0.24)',
    dependsOnImageFilters: true,
  },
  meanC: {
    key: 'meanC',
    label: 'Mean C',
    min: 0,
    max: 20,
    step: 1,
    unit: 'seviye',
    initial: 6,
    accentStart: '#10b981',
    accentEnd: '#60a5fa',
    glow: 'rgba(16,185,129,0.24)',
    dependsOnImageFilters: true,
  },
};

export const initialCalibrationValues = Object.values(calibrationControls).reduce((values, item) => {
  values[item.key] = item.initial;
  return values;
}, {} as CalibrationValues);

export const conceptValuesFromRuntime = (values: Partial<CalibrationRuntimeValues>): CalibrationValues => ({
  sensitivity: Number(values.quality_threshold ?? calibrationControls.sensitivity.initial),
  characters: Number(values.min_text_chars ?? calibrationControls.characters.initial),
  balance: Number(values.stabilizer_min_samples ?? calibrationControls.balance.initial),
  attempts: Number(values.variant_budget ?? calibrationControls.attempts.initial),
  match: Math.round(Number(values.scene_fit_threshold ?? 0.42) * 100),
  claheStriped: Number(values.clahe_clip_striped ?? calibrationControls.claheStriped.initial),
  clahePlain: Number(values.clahe_clip_floating ?? calibrationControls.clahePlain.initial),
  whiteThreshold: Number(values.white_v_min ?? calibrationControls.whiteThreshold.initial),
  bilateral: Number(values.bilateral_d ?? calibrationControls.bilateral.initial),
  gaussianC: Number(values.floating_gaussian_c ?? calibrationControls.gaussianC.initial),
  meanC: Number(values.floating_mean_c ?? calibrationControls.meanC.initial),
});

export const runtimeValuesFromConcept = (
  values: CalibrationValues,
  ocrFiltersEnabled: boolean,
): CalibrationRuntimeValues => ({
  quality_threshold: Number(values.sensitivity),
  min_text_chars: Number(values.characters),
  stabilizer_min_samples: Number(values.balance),
  variant_budget: Number(values.attempts),
  scene_fit_threshold: Number(values.match) / 100,
  clahe_clip_striped: Number(values.claheStriped),
  clahe_clip_floating: Number(values.clahePlain),
  white_v_min: Number(values.whiteThreshold),
  bilateral_d: Number(values.bilateral),
  floating_gaussian_c: Number(values.gaussianC),
  floating_mean_c: Number(values.meanC),
  ocr_filters_enabled: ocrFiltersEnabled,
});

export const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
export const calibrationValuesMatch = (left: CalibrationValues, right: CalibrationValues) =>
  Object.keys(calibrationControls).every((key) => left[key as CalibrationControlKey] === right[key as CalibrationControlKey]);
export const calibrationSnapshotsMatch = (left: ConceptCalibrationSnapshot, right: ConceptCalibrationSnapshot) =>
  left.ocrFiltersEnabled === right.ocrFiltersEnabled && calibrationValuesMatch(left.values, right.values);

export const normalizeCalibrationValue = (rawValue: number, item: CalibrationControlConfig) => {
  const stepped = Math.round((rawValue - item.min) / item.step) * item.step + item.min;
  return Number(clampNumber(stepped, item.min, item.max).toFixed(item.decimals ?? 0));
};

export const formatCalibrationValue = (value: number, item: CalibrationControlConfig) => {
  const displayValue = item.decimals !== undefined ? value.toFixed(item.decimals) : String(value);
  return `${displayValue} ${item.unit}`;
};

export const calibrationInfoContent: Record<CalibrationInfoKey, CalibrationInfoContent> = {
  overview: {
    title: 'Gelişmiş Kalibrasyon Asistanı',
    what: 'İmlecinizi üzerinde beklettiğiniz herhangi bir ayarın sisteminize tam olarak ne etki ettiğini açıklar.',
    lower: 'Çubuğu sola çekmek: Ayarın etkisini yumuşatır ve sistemi esnetir.',
    higher: 'Çubuğu sağa çekmek: Ayarın etkisini keskinleştirir ve katılaştırır.',
    mode: 'Bilgi asistanı açıkken tüm ayarları fare tekerleğiyle hızlıca değiştirebilirsiniz.',
  },
  groupDecision: {
    title: 'Algılama Karar Motoru',
    what: 'Yapay zekanın ekrandaki karmaşık piksellerin gerçekten bir yazı olup olmadığına karar verme sürecidir.',
    lower: 'Daha agresif algılama: Çok hızlı sonuç verir ancak bazen alakasız şekilleri metin sanabilir.',
    higher: 'Daha seçici algılama: Yalnızca kesin emin olduğu metinleri onaylar, kalite artar ama hız düşebilir.',
    mode: 'Bu ayar grubu sistemin temel güvenilirlik eşiğini belirler.',
  },
  groupFlow: {
    title: 'Veri Akış Yönetimi',
    what: 'Görüntülerin hangi filtrelerden geçip çeviri zekasına nasıl besleneceğini organize eder.',
    lower: 'Hafif Akış: Sistemi yormaz, standart metinlerde çok hızlıdır ancak kötü çözünürlüklerde bocalayabilir.',
    higher: 'Derin Akış: Görüntüyü defalarca analiz eder. İşlem gücü gerektirir ama mükemmel sonuç verir.',
    mode: 'Görüntü filtreleri aktif olduğunda devasa bir etki yaratır.',
  },
  groupScene: {
    title: 'Sahne ve Kontrast Zekası',
    what: 'Zorlu arka planlarda yazıyı oyunun renk cümbüşünden koparıp almak için zıtlık algısını yönetir.',
    lower: 'Doğal Sahne: Oyunun renklerine müdahale etmez ancak şeffaf yazıları okumakta zorlanabilir.',
    higher: 'Keskin Sahne: Yazıyı arka plandan adeta kazıyarak ayırır. Okunabilirlik zirveye çıkar.',
    mode: 'Özellikle oyun içi diyalog balonlarında şeritsiz mod ile kullanıldığında hayat kurtarır.',
  },
  groupImage: {
    title: 'Görüntü Ön İşleme',
    what: 'Kalitesiz veya bozuk oyun görüntülerini analiz zekasına yollamadan önce temizleme işlemidir.',
    lower: 'Minimal Dokunuş: Pikselleri orijinal haline sadık bırakır. Hafif kirlilikler ekranda kalabilir.',
    higher: 'Agresif Temizlik: Kumlanmayı ve gürültüyü silip atar. Ancak çok ince fontları biraz yumuşatabilir.',
    mode: 'Piksel (Retro) veya bulanık dokulu oyunlarda sistemin en büyük yardımcısıdır.',
  },
  sensitivity: {
    title: 'Algı Hassasiyeti',
    what: 'Sistemin ekrandaki belirsiz şekillere karşı ne kadar uyanık davranacağını kontrol eder.',
    lower: 'Esnek Algı: Sistemin refleksleri hızlanır ancak okuma hataları sıklaşabilir.',
    higher: 'Katı Algı: Sadece jilet gibi net olan yazıları çeviriye yollar. Güvenilirlik maksimize edilir.',
    mode: 'Genel tarama başarısını doğrudan etkileyen en temel kalibrasyon değeridir.',
  },
  characters: {
    title: 'Minimum Karakter Bariyeri',
    what: 'Ekranda beliren anlamsız kısa harf veya sembol kalıntılarının çeviriye sızmasını engeller.',
    lower: 'Bariyer İner: Kısa seslenişleri kaçırmaz ama ekran çöp okumalarla dolabilir.',
    higher: 'Bariyer Kalkar: Sadece uzun ve anlamlı kelimelere odaklanır. Kısa kelimeler atlanabilir.',
    mode: 'Oyun içi arayüz metinlerini (HP, MP gibi) filtrelemek için mükemmeldir.',
  },
  balance: {
    title: 'Görüntü Dengeleyici',
    what: 'Oyun içi kameralar hareket ederken yazıların ekranda titremesini ve sürekli yanıp sönmesini engeller.',
    lower: 'Hızlı Tepki: Yazı ekrana düştüğü an yakalanır ama kamera dönerken çok fazla titreme yapar.',
    higher: 'Stabil Akış: Yazının ekranda netleşmesini bekler. Pürüzsüz ama bir tık geç bir okuma sunar.',
    mode: 'Aksiyonu ve kamera hareketi bol olan 3D oyunlarda şiddetle önerilir.',
  },
  attempts: {
    title: 'Analiz Bütçesi (Deneme)',
    what: 'Zorlu bir metinle karşılaşıldığında yapay zekanın onu çözmek için ne kadar efor sarf edeceğini belirler.',
    lower: 'Tasarruf Modu: Sisteme nefes aldırır. İşlemi ilk denemede çözer veya vazgeçer.',
    higher: 'Zorlayıcı Mod: Anlaşılması güç yazıları bile çözene kadar farklı filtrelerle tekrar tekrar dener.',
    mode: 'Sistem donanımınıza (CPU/GPU) doğrudan yük bindiren güçlü bir ayardır.',
  },
  match: {
    title: 'Sahne Uyum Eşiği',
    what: 'Seçtiğiniz ayar profilinin, o anki ekran görüntüsüyle ne kadar uyuştuğunu denetler.',
    lower: 'Toleranslı: Sahne çok farklı olsa da okumaya çalışır. Yanlış okuma ihtimali artar.',
    higher: 'Kesin Uyum: Yalnızca kalibrasyonunuza birebir uyan sahnelerde devreye girer. Taviz vermez.',
    mode: 'Otomatik mod geçişlerinin ve sahne ayrımının kilit noktasıdır.',
  },
  claheStriped: {
    title: 'Dinamik Kontrast (Şeritli)',
    what: 'Diyalog kutuları ve arka plan şeritleri üzerindeki yazıları aydınlatarak gölgelerden kurtarır.',
    lower: 'Doğal Görünüm: Şeridin orijinal ışığını bozmaz ancak karanlık metinler zor okunur.',
    higher: 'Aydınlatılmış: Yazıyı adeta spot ışığı altına alır. Kontrast mükemmeldir ancak şerit parlayabilir.',
    mode: 'Görsel romanlar (Visual Novel) ve diyalog pencerelerinde harikalar yaratır.',
  },
  clahePlain: {
    title: 'Dinamik Kontrast (Şeritsiz)',
    what: 'Arkası şeffaf olan serbest oyun metinlerini çevresel ışıklardan ayırarak netleştirir.',
    lower: 'Ham Görüntü: Atmosferi korur fakat metin çevre dokularına karışıp kaybolabilir.',
    higher: 'Agresif Ayrım: Metni çevreden kopararak vurgular. Ancak oyunun kendi dokuları da bozulabilir.',
    mode: 'Açık dünya oyunlarındaki eşya veya görev yazıları için tasarlanmıştır.',
  },
  whiteThreshold: {
    title: 'Işıltı Eşiği (Beyazlık)',
    what: 'Sistemin parlak renkli yazıları çevredeki diğer objelerden ayırt etmesini sağlar.',
    lower: 'Kapsayıcı: Soluk yazıları kabul eder ancak gökyüzü gibi alanları yazı sanabilir.',
    higher: 'Seçici: Yalnızca en parlak ve net beyaz yazıları hedef alır. Güvenilirdir.',
    mode: 'Arkası şeffaf sahnelerde beyaz/parlak metinleri yakalamak için idealdir.',
  },
  bilateral: {
    title: 'Doku Pürüzsüzleştirme',
    what: 'Oyun içi pikselleri ve kumlanmayı temizlerken harflerin kenarlarını jilet gibi keskin tutar.',
    lower: 'Keskin Kenarlar: Harflerin detayları korunur ama çevresel kumlanma algıyı zorlaştırabilir.',
    higher: 'Pürüzsüz Yüzey: Tüm gürültü yağ gibi akıp gider ancak ince harfler eriyip bulanıklaşabilir.',
    mode: 'Özellikle eski (Retro/Pixel) oyunlardaki görsel pürüzleri yok etmek için birebirdir.',
  },
  gaussianC: {
    title: 'Gölge Ayrıştırma Sertliği',
    what: 'Yazıların etrafındaki gölgelendirmeleri ve dış hat (outline) efektlerini filtreleme şiddetidir.',
    lower: 'Sert Kesim: Dış hatları acımasızca siler. Zayıf fontlar parçalanabilir.',
    higher: 'Yumuşak Geçiş: Gölgelere tolerans tanır ancak kalın dış hatlar yazıya karışıp hata yaratabilir.',
    mode: 'Etrafı siyah çerçeveli fantastik oyun fontları için hayat kurtarır.',
  },
  meanC: {
    title: 'Bölgesel Zıtlık Toleransı',
    what: 'Ekranın farklı noktalarındaki ışık değişimlerine yapay zekanın nasıl adapte olacağını belirler.',
    lower: 'Dar Tolerans: Sadece yüksek zıtlığa sahip net yazıları yakalar. Soluk kısımlar okunmaz.',
    higher: 'Geniş Tolerans: Karanlık köşelerdeki yazıları aydınlatır ama dokuları metin zannedebilir.',
    mode: 'Karanlık mağaralar veya aydınlık gökyüzü gibi dengesiz ışıklı sahneler için kusursuzdur.',
  },
};

export const InfoButton = ({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    data-calibration-action-button="true"
    data-calibration-info-toggle="true"
    aria-pressed={enabled}
    aria-label="Kalibrasyon bilgi modu"
    onClick={(event) => {
      event.stopPropagation();
      onToggle();
    }}
    style={{
      width: 24,
      height: 24,
      border: 'none',
      borderRadius: 0,
      padding: 0,
      background: 'transparent',
      color: enabled ? '#dff8ff' : 'rgba(172,214,255,0.82)',
      boxShadow: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: enabled ? 1 : 0.78,
      filter: enabled ? 'drop-shadow(0 0 8px rgba(56,189,248,0.34))' : 'none',
      transition: 'color 180ms ease, opacity 180ms ease, filter 180ms ease',
    }}
  >
    <LayerGlyph path="M12 17v-6M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </button>
);

export const CalibrationHeaderIconButton = ({
  label,
  icon,
  tone,
  onClick,
}: {
  label: string;
  icon: string;
  tone: string;
  onClick: () => void;
}) => {
  const [hov, setHov] = useState(false);
  const [prs, setPrs] = useState(false);
  return (
    <button
      type="button"
      data-calibration-action-button="true"
      aria-label={label}
      title={label}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setPrs(false); }}
      onMouseDown={() => setPrs(true)}
      onMouseUp={() => setPrs(false)}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{
        width: 24,
        height: 24,
        border: 'none',
        borderRadius: 6,
        padding: 0,
        background: prs ? 'rgba(255,255,255,0.03)' : (hov ? 'rgba(255,255,255,0.06)' : 'transparent'),
        color: tone,
        boxShadow: hov ? 'inset 0 0 0 1px rgba(255,255,255,0.04)' : 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: prs ? 0.6 : (hov ? 1 : 0.82),
        transform: prs ? 'scale(0.90)' : 'scale(1)',
        filter: hov && !prs ? `drop-shadow(0 0 8px ${tone})` : 'none',
        transition: 'all 120ms ease',
      }}
    >
      <LayerGlyph path={icon} />
    </button>
  );
};

export const CalibrationHeaderActions = ({
  profileVisible,
  infoEnabled,
  onSave,
  onDelete,
  onReset,
  onToggleInfo,
}: {
  profileVisible: boolean;
  infoEnabled: boolean;
  onSave: () => void;
  onDelete: () => void;
  onReset: () => void;
  onToggleInfo: () => void;
}) => {
  const [actionsMounted, setActionsMounted] = useState(profileVisible);
  const [actionsVisible, setActionsVisible] = useState(false);

  useEffect(() => {
    if (profileVisible) {
      setActionsMounted(true);
      const frame = window.requestAnimationFrame(() => setActionsVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setActionsVisible(false);
    const timeout = window.setTimeout(() => setActionsMounted(false), 170);
    return () => window.clearTimeout(timeout);
  }, [profileVisible]);

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7, width: 117, minWidth: 117, height: 24 }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          width: 86,
          height: 24,
          maxWidth: 86,
          opacity: actionsVisible ? 1 : 0,
          transform: actionsVisible ? 'translateY(0) scale(1)' : 'translateY(4px) scale(0.985)',
          filter: actionsVisible ? 'blur(0px) saturate(1)' : 'blur(3px) saturate(0.92)',
          clipPath: actionsVisible
            ? 'inset(0% 0% 0% 0% round 999px)'
            : 'inset(10% 8% 10% 8% round 999px)',
          overflow: 'hidden',
          pointerEvents: actionsVisible ? 'auto' : 'none',
          transition: 'opacity 160ms ease, transform 160ms ease, filter 160ms ease, clip-path 160ms ease',
          willChange: 'opacity, transform, filter, clip-path',
        }}
      >
        {actionsMounted ? (
          <>
            <CalibrationHeaderIconButton
              label="Profili Kaydet"
              icon="M5 4.5h10l4 4V19.5A1.5 1.5 0 0 1 17.5 21h-11A1.5 1.5 0 0 1 5 19.5v-15Z M8 4.5v5h6v-5 M9 16h6"
              tone="rgba(134,239,172,0.88)"
              onClick={onSave}
            />
            <CalibrationHeaderIconButton
              label="Varsayılana Dön"
              icon="M4 7v5h5M4.8 12A7.2 7.2 0 1 0 7 6.8"
              tone="rgba(252,211,77,0.90)"
              onClick={onReset}
            />
            <CalibrationHeaderIconButton
              label="Profili Sil"
              icon="M6 7h12M9.5 7V5.5h5V7m-6 3v6m3-6v6m3-6v6M8 7l.7 10.1a1.5 1.5 0 0 0 1.5 1.4h3.6a1.5 1.5 0 0 0 1.5-1.4L16 7"
              tone="rgba(252,165,165,0.88)"
              onClick={onDelete}
            />
          </>
        ) : null}
      </div>
      <InfoButton enabled={infoEnabled} onToggle={onToggleInfo} />
    </div>
  );
};

export type ImprovementMode = 'filters' | 'rawFlow';

export const ImprovementToggleBlock = ({
  filtersEnabled,
  onToggleFilters,
  rawFlowEnabled,
  onToggleRawFlow,
  disabled = false,
}: {
  filtersEnabled: boolean;
  onToggleFilters: () => void;
  rawFlowEnabled: boolean;
  onToggleRawFlow: () => void;
  disabled?: boolean;
}) => {
  const [mode, setMode] = useState<ImprovementMode>('filters');
  const [displayMode, setDisplayMode] = useState<ImprovementMode>('filters');
  const [contentVisible, setContentVisible] = useState(true);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (mode === displayMode) return undefined;
    setContentVisible(false);
    const t = window.setTimeout(() => {
      setDisplayMode(mode);
      window.requestAnimationFrame(() => setContentVisible(true));
    }, 110);
    return () => window.clearTimeout(t);
  }, [mode, displayMode]);

  const toggleCard = () => setMode((current) => (current === 'filters' ? 'rawFlow' : 'filters'));
  const isFiltersMode = displayMode === 'filters';
  const activeEnabled = isFiltersMode ? filtersEnabled : rawFlowEnabled;
  const headerLabel = isFiltersMode ? 'İyileştirme' : 'Ham Akış';
  const headerIcon = isFiltersMode
    ? 'M4 7h16M7 12h10M9 17h6'
    : 'M5 7h14M5 12h14M5 17h14';
  const title = isFiltersMode
    ? (filtersEnabled ? 'Geliştirilmiş Okuma' : 'Doğal Kare Okuması')
    : (rawFlowEnabled ? 'Ham Çeviri Akışı' : 'Filtrelenmiş Çeviri Akışı');
  const subtitle = isFiltersMode
    ? (filtersEnabled ? 'Ön işleme katmanları görüntüyü okumaya hazırlar.' : 'Görüntü doğrudan OCR katmanına gönderilir.')
    : (rawFlowEnabled ? 'Metin, ek filtreler olmadan doğrudan çeviriye gider.' : 'Kalite ve tekrar denetimleri çeviri akışını düzenler.');
  const offIcon = isFiltersMode ? 'M4 7h16M4 12h16M4 17h16' : 'M4 6h16M6 12h12M8 18h8';
  const onIcon = isFiltersMode ? 'M4 7h16M7 12h10M10 17h4' : 'M5 7h14M5 12h14M5 17h14';
  const actionToggle = isFiltersMode ? onToggleFilters : onToggleRawFlow;

  return (
    <div
      onClick={toggleCard}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...shellStyle,
        position: 'relative',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        cursor: 'pointer',
        userSelect: 'none',
        boxShadow: hovered
          ? 'inset 0 0 0 1px rgba(125,211,252,0.28), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 18px rgba(125,211,252,0.06)'
          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
        transition: 'box-shadow 180ms ease, opacity 280ms ease, background 280ms ease',
        opacity: !disabled ? 1 : 0.48,
        background: !disabled ? shellStyle.background : 'rgba(5, 9, 14, 0.22)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 24, minHeight: 24 }}>
        <div style={{ ...labelStyle, opacity: contentVisible ? 1 : 0, transition: 'opacity 160ms ease' }}>
          {headerLabel}
        </div>
        <div
          style={{
            color: 'rgba(172,214,255,0.82)',
            opacity: contentVisible ? 1 : 0,
            filter: hovered ? 'drop-shadow(0 0 6px rgba(125,211,252,0.42))' : 'none',
            transition: 'opacity 160ms ease, filter 180ms ease',
          }}
        >
          <LayerGlyph path={headerIcon} />
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', minHeight: 0 }}>
        <div
          style={{
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible ? 'translateY(0)' : 'translateY(5px)',
            filter: contentVisible ? 'blur(0px)' : 'blur(2px)',
            transition: 'opacity 160ms ease, transform 160ms ease, filter 160ms ease',
            willChange: 'opacity, transform, filter',
            display: 'grid',
            alignContent: 'center',
            gap: 14,
            width: '100%',
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#9fb7cf', fontWeight: 500, lineHeight: 1.45, letterSpacing: '-0.01em' }}>
              {title}
            </span>
            <span style={{ fontSize: 11, fontWeight: 400, lineHeight: 1.45, color: 'rgba(159,183,207,0.48)', maxWidth: 260 }}>
              {subtitle}
            </span>
            <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(169,189,216,0.28) 0%, rgba(169,189,216,0.12) 40%, rgba(169,189,216,0) 100%)' }} />
          </div>

          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr 36px',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => { if (activeEnabled) actionToggle(); }}
              aria-label={`${headerLabel} kapat`}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: activeEnabled ? 'pointer' : 'default',
                width: 36,
                height: 36,
                color: activeEnabled ? 'rgba(159, 183, 207, 0.56)' : '#7dd3fc',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 180ms ease',
              }}
            >
              <LayerGlyph path={offIcon} />
            </button>
            <button
              type="button"
              onClick={actionToggle}
              aria-pressed={activeEnabled}
              aria-label={headerLabel}
              style={{
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                position: 'relative',
                width: '100%',
                height: 28,
                borderRadius: 999,
                background: 'linear-gradient(180deg,rgba(7,11,17,0.88),rgba(4,8,13,0.94))',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03),0 0 0 1px rgba(255,255,255,0.02)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 1.5,
                  bottom: 1.5,
                  left: activeEnabled ? 'calc(50%)' : 2,
                  width: 'calc(50% - 2px)',
                  borderRadius: 999,
                  background: 'linear-gradient(180deg, rgba(125,211,252,0.28), rgba(125,211,252,0.14))',
                  transition: 'left 220ms ease',
                }}
              />
            </button>
            <button
              type="button"
              onClick={() => { if (!activeEnabled) actionToggle(); }}
              aria-label={`${headerLabel} ac`}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: activeEnabled ? 'default' : 'pointer',
                width: 36,
                height: 36,
                color: activeEnabled ? '#7dd3fc' : 'rgba(159, 183, 207, 0.56)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 180ms ease',
              }}
            >
              <LayerGlyph path={onIcon} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── CalibrationAreaBlock ────────────────────────────────────────────────────
export type CalibrationAreaMode = 'status' | 'quality';
export const qualityColor = (s: number) => (s >= 80 ? '#86efac' : s >= 55 ? '#fcd34d' : '#fca5a5');
export const qualityLabel = (s: number) => (s >= 80 ? '\u0130yi' : s >= 55 ? 'Orta' : 'Zay\u0131f');

export const CalibrationAreaBlock = ({
  translationActive,
  hasCalibrationRegion,
  qualityScore,
  qualityText,
}: {
  translationActive: boolean;
  hasCalibrationRegion: boolean;
  qualityScore: number | null;
  qualityText: string | null;
}) => {
  const [mode, setMode] = useState<CalibrationAreaMode>('status');
  const [displayMode, setDisplayMode] = useState<CalibrationAreaMode>('status');
  const [contentVisible, setContentVisible] = useState(true);
  const [hovered, setHovered] = useState(false);
  const resolvedQualityScore = typeof qualityScore === 'number' ? Math.max(0, Math.min(100, Math.round(qualityScore))) : null;
  const resolvedQualityText = qualityText?.trim() || 'Henüz kalite analizi sonucu oluşmadı.';

  useEffect(() => {
    if (hasCalibrationRegion) {
      const t = window.setTimeout(() => setMode('quality'), 340);
      return () => window.clearTimeout(t);
    } else {
      const t = window.setTimeout(() => setMode('status'), 340);
      return () => window.clearTimeout(t);
    }
  }, [hasCalibrationRegion]);

  useEffect(() => {
    if (mode === displayMode) return undefined;
    setContentVisible(false);
    const t = window.setTimeout(() => {
      setDisplayMode(mode);
      window.requestAnimationFrame(() => setContentVisible(true));
    }, 110);
    return () => window.clearTimeout(t);
  }, [mode, displayMode]);

  const isAreaReady = hasCalibrationRegion;
  const color = qualityColor(resolvedQualityScore ?? 0);
  const qlabel = resolvedQualityScore === null ? 'Bekliyor' : qualityLabel(resolvedQualityScore);
  const toggle = () => setMode((m) => (m === 'status' ? 'quality' : 'status'));

  const headerIcon =
    displayMode === 'status'
      ? 'M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6'
      : 'M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3Z';
  const headerLabel = displayMode === 'status' ? 'Kalibrasyon Alanı' : 'Kalite Analizi';

  return (
    <div
      onClick={toggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...shellStyle,
        position: 'relative',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        cursor: 'pointer',
        userSelect: 'none',
        boxShadow: hovered
          ? 'inset 0 0 0 1px rgba(125,211,252,0.28), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 18px rgba(125,211,252,0.06)'
          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
        transition: 'box-shadow 180ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 24, minHeight: 24 }}>
        <div
          style={{
            ...labelStyle,
            opacity: contentVisible ? 1 : 0,
            transition: 'opacity 160ms ease',
          }}
        >
          {headerLabel}
        </div>
        <div
          style={{
            color: 'rgba(172,214,255,0.82)',
            opacity: contentVisible ? 1 : 0,
            filter: hovered ? 'drop-shadow(0 0 6px rgba(125,211,252,0.42))' : 'none',
            transition: 'opacity 160ms ease, filter 180ms ease',
          }}
        >
          <LayerGlyph path={headerIcon} />
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', minHeight: 0 }}>
        <div
          style={{
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible ? 'translateY(0)' : 'translateY(5px)',
            filter: contentVisible ? 'blur(0px)' : 'blur(2px)',
            transition: 'opacity 160ms ease, transform 160ms ease, filter 160ms ease',
            willChange: 'opacity, transform, filter',
            display: 'grid',
            alignContent: 'center',
            gap: displayMode === 'status' ? 14 : 12,
            width: '100%',
          }}
        >
          {displayMode === 'status' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'grid', gap: 5, flex: 1 }}>
                  <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a9bdd8', fontWeight: 700 }}>
                    Kalibrasyon Alanı
                  </span>
                  <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(169,189,216,0.34) 0%, rgba(169,189,216,0.18) 42%, rgba(169,189,216,0) 100%)' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: isAreaReady ? '#9ae6b4' : '#fca5a5', flexShrink: 0 }}>
                  {isAreaReady ? 'Seçili' : 'Seçilmedi'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'grid', gap: 5, flex: 1 }}>
                  <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a9bdd8', fontWeight: 700 }}>
                    Çeviri Durumu
                  </span>
                  <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(169,189,216,0.34) 0%, rgba(169,189,216,0.18) 42%, rgba(169,189,216,0) 100%)' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: translationActive ? '#7dd3fc' : 'rgba(159,183,207,0.55)', flexShrink: 0 }}>
                  {translationActive ? 'Aktif' : 'Pasif'}
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
                  <svg viewBox="0 0 44 44" style={{ width: 44, height: 44, transform: 'rotate(-90deg)', display: 'block', overflow: 'visible' }}>
                    <circle
                      cx="22" cy="22" r="18" fill="none"
                      stroke={color} strokeWidth="9" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 18}`}
                      strokeDashoffset={`${2 * Math.PI * 18 * (1 - (resolvedQualityScore ?? 0) / 100)}`}
                      opacity="0.18"
                      style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1), stroke 400ms ease, opacity 400ms ease' }}
                    />
                    <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3.5" />
                    <circle
                      cx="22" cy="22" r="18" fill="none"
                      stroke={color} strokeWidth="3.5" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 18}`}
                      strokeDashoffset={`${2 * Math.PI * 18 * (1 - (resolvedQualityScore ?? 0) / 100)}`}
                      style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1), stroke 400ms ease' }}
                    />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1, transition: 'color 400ms ease' }}>{resolvedQualityScore ?? '--'}</span>
                    <span style={{ fontSize: 7.5, fontWeight: 700, color, letterSpacing: '0.04em', textTransform: 'uppercase', transition: 'color 400ms ease', opacity: 0.82 }}>{qlabel}</span>
                  </div>
                </div>
                <div style={{ minWidth: 0, flex: 1, display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#a9bdd8', fontWeight: 700 }}>Metin</span>
                    <span style={{ fontSize: 9.5, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(125,211,252,0.62)', fontWeight: 800 }}>Canlı</span>
                  </div>
                  <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(169,189,216,0.28) 0%, rgba(169,189,216,0.10) 60%, rgba(169,189,216,0) 100%)' }} />
                  <div
                    style={{
                      fontSize: 10.5,
                      lineHeight: 1.52,
                      color: 'rgba(191,215,242,0.75)',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                      display: '-webkit-box',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      maxHeight: '6.1em',
                    }}
                  >
                    {resolvedQualityText}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};


export const CalibrationInfoDock = ({ info, visible }: { info: CalibrationInfoContent; visible: boolean }) => {
  const [displayInfo, setDisplayInfo] = useState(info);
  const [contentVisible, setContentVisible] = useState(true);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [dockHeight, setDockHeight] = useState<number | null>(null);

  useEffect(() => {
    if (info.title === displayInfo.title) return undefined;

    setContentVisible(false);
    const timeout = window.setTimeout(() => {
      setDisplayInfo(info);
      window.requestAnimationFrame(() => setContentVisible(true));
    }, 90);

    return () => window.clearTimeout(timeout);
  }, [displayInfo.title, info]);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return undefined;

    const updateHeight = () => {
      setDockHeight(node.scrollHeight + 24);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [displayInfo]);

  return (
    <div
      data-calibration-info-panel="true"
      style={{
        position: 'absolute',
        right: 18,
        bottom: 34,
        width: 262,
        maxWidth: 'calc(100% - 36px)',
        zIndex: 18,
        borderRadius: 16,
        border: '1px solid rgba(125,211,252,0.20)',
        background: 'linear-gradient(180deg, rgba(10,18,29,0.96), rgba(7,13,21,0.93))',
        boxShadow: '0 22px 54px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.05)',
        padding: '12px 13px',
        pointerEvents: 'auto',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        height: dockHeight ?? undefined,
        overflow: 'hidden',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.985)',
        filter: visible ? 'blur(0px) saturate(1)' : 'blur(3px) saturate(0.92)',
        clipPath: visible
          ? 'inset(0% 0% 0% 0% round 16px)'
          : 'inset(8% 6% 8% 6% round 16px)',
        transition: 'opacity 160ms ease, transform 160ms ease, filter 160ms ease, clip-path 160ms ease, height 180ms ease',
        willChange: 'opacity, transform, filter, clip-path, height',
      }}
    >
      <div
        ref={contentRef}
        style={{
          opacity: contentVisible ? 1 : 0,
          transform: contentVisible ? 'translateY(0)' : 'translateY(4px)',
          filter: contentVisible ? 'blur(0px)' : 'blur(2px)',
          transition: 'opacity 130ms ease, transform 130ms ease, filter 130ms ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 12.5, color: '#e2eefb', fontWeight: 750, letterSpacing: '-0.01em' }}>{displayInfo.title}</div>
          <div style={{ fontSize: 9.5, color: 'rgba(125,211,252,0.78)', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Bilgi
          </div>
        </div>
        <div style={{ marginTop: 8, display: 'grid', gap: 6, fontSize: 11, lineHeight: 1.5, color: 'rgba(191,215,242,0.84)' }}>
          <div><span aria-label="Ne" title="Ne" style={{ color: '#93c5fd', fontWeight: 800 }}>◎</span> {displayInfo.what}</div>
          <div><span aria-label="Düşük" title="Düşük" style={{ color: '#86efac', fontWeight: 800 }}>←</span> {displayInfo.lower}</div>
          <div><span aria-label="Yüksek" title="Yüksek" style={{ color: '#fcd34d', fontWeight: 800 }}>→</span> {displayInfo.higher}</div>
          <div><span aria-label="Mod" title="Mod" style={{ color: '#c4b5fd', fontWeight: 800 }}>✦</span> {displayInfo.mode}</div>
        </div>
      </div>
    </div>
  );
};

export const CalibrationSliderControl = ({
  item,
  value,
  onChange,
  onInfoFocus,
  disabled = false,
}: {
  item: CalibrationControlConfig;
  value: number;
  onChange: (key: CalibrationControlKey, value: number) => void;
  onInfoFocus?: (key: CalibrationInfoKey) => void;
  disabled?: boolean;
}) => {
  const percent = item.max > item.min ? clampNumber(((value - item.min) / (item.max - item.min)) * 100, 0, 100) : 0;
  const setFromClientX = (clientX: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    const ratio = rect.width > 0 ? clampNumber((clientX - rect.left) / rect.width, 0, 1) : 0;
    onChange(item.key, normalizeCalibrationValue(item.min + ratio * (item.max - item.min), item));
  };
  const adjustByStep = (direction: -1 | 1) => {
    onChange(item.key, normalizeCalibrationValue(value + direction * item.step, item));
  };

  return (
    <div
      data-calibration-info-hotspot="true"
      onMouseEnter={() => onInfoFocus?.(item.key)}
      onWheel={(event) => {
        if (disabled) return;
        event.preventDefault();
        onInfoFocus?.(item.key);
        adjustByStep(event.deltaY > 0 ? -1 : 1);
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity: disabled ? 0.42 : 1,
        filter: disabled ? 'saturate(0.62)' : 'saturate(1)',
        transition: 'opacity 180ms ease, filter 180ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#e2eefb', letterSpacing: '-0.01em' }}>{item.label}</div>
        <div style={{ fontSize: 11, fontWeight: 750, color: '#dbeafe', letterSpacing: '0.055em', textTransform: 'uppercase' }}>
          {formatCalibrationValue(value, item)}
        </div>
      </div>
      <div
        role="slider"
        aria-label={item.label}
        aria-valuemin={item.min}
        aria-valuemax={item.max}
        aria-valuenow={value}
        tabIndex={0}
        onFocus={() => onInfoFocus?.(item.key)}
        onKeyDown={(event) => {
          if (disabled) return;
          onInfoFocus?.(item.key);
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault();
            adjustByStep(-1);
          }
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            adjustByStep(1);
          }
        }}
        onMouseDown={(event) => {
          if (disabled) return;
          onInfoFocus?.(item.key);
          const track = event.currentTarget;
          setFromClientX(event.clientX, track);

          const handleMouseMove = (moveEvent: MouseEvent) => {
            setFromClientX(moveEvent.clientX, track);
          };
          const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
          };

          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
        }}
        style={{
          position: 'relative',
          height: 8,
          borderRadius: 999,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.095), rgba(255,255,255,0.055))',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.34), inset 0 0 0 1px rgba(255,255,255,0.045)',
          overflow: 'visible',
          pointerEvents: disabled ? 'none' : 'auto',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: `${percent}%`,
            top: 0,
            bottom: 0,
            borderRadius: 999,
            background: disabled ? 'rgba(148,163,184,0.22)' : `linear-gradient(90deg, ${item.accentStart}, ${item.accentEnd})`,
            boxShadow: disabled ? 'none' : `0 0 18px ${item.glow}`,
            transition: 'width 120ms ease',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${percent}%`,
            top: '50%',
            width: 14,
            height: 14,
            borderRadius: 999,
            transform: 'translate(-50%, -50%)',
            background: disabled ? 'linear-gradient(180deg, #b7c1ce, #748194)' : 'linear-gradient(180deg, #f8fbff, #b9cce3)',
            boxShadow: disabled ? '0 4px 10px rgba(0,0,0,0.22), 0 0 0 3px rgba(15,23,42,0.82)' : `0 5px 14px rgba(0,0,0,0.32), 0 0 0 3px rgba(15,23,42,0.82), 0 0 18px ${item.glow}`,
            transition: 'left 120ms ease',
          }}
        />
      </div>
    </div>
  );
};

export const CalibrationGroupSection = ({
  title,
  description,
  children,
  infoKey,
  onInfoFocus,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  infoKey?: CalibrationInfoKey;
  onInfoFocus?: (key: CalibrationInfoKey) => void;
}) => (
  <div
    data-calibration-info-hotspot={infoKey ? 'true' : undefined}
    onMouseEnter={() => {
      if (infoKey) onInfoFocus?.(infoKey);
    }}
    style={{ minWidth: 0, display: 'grid', alignContent: 'start', gap: 12 }}
  >
    <div style={calibrationGroupTitleStyle}>{title}</div>
    <div style={calibrationHintTextStyle}>{description}</div>
    {children}
  </div>
);

export const calibrationSettingsGridStyle: React.CSSProperties = {
  minHeight: '100%',
  width: 'clamp(700px, 86%, 780px)',
  maxWidth: '100%',
  justifySelf: 'center',
  marginInline: 'auto',
  boxSizing: 'border-box',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  columnGap: 22,
  rowGap: 0,
  alignItems: 'start',
  alignContent: 'center',
  paddingInline: 16,
};

