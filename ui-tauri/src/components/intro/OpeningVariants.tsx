import React from "react";

const palette = {
  border: "rgba(148,163,184,0.14)",
  green: "#2ecb83",
  violet: "#9b8cff",
};

export type OpeningVariantKey = "defaultMode" | "profileMode";

export type OpeningVariant = {
  key: OpeningVariantKey;
  id: number;
  name: string;
  note: string;
  accent: string;
  bg: string;
};

export const openingVariants: OpeningVariant[] = [
  {
    key: "defaultMode",
    id: 1,
    name: "Varsayılan Mod",
    note: "Kullanıcı tüm ayarları varsayılan bıraktığında görülecek teknik açılış.",
    accent: palette.green,
    bg: "linear-gradient(180deg, rgba(12,16,24,0.98), rgba(19,25,37,0.96))",
  },
  {
    key: "profileMode",
    id: 2,
    name: "Kişisel Profil",
    note: "Ayarlar kaydedildikten sonra görülen profil odaklı karşılama.",
    accent: palette.violet,
    bg: "linear-gradient(180deg, rgba(12,16,24,0.98), rgba(27,35,50,0.92))",
  },
];

export const OpeningVariantStyles: React.FC = () => (
  <style>{`
    @keyframes openingDrift {
      0%,100% { transform: translate3d(0,0,0) scale(1); opacity: .72; }
      50% { transform: translate3d(-10px,8px,0) scale(1.04); opacity: 1; }
    }
    @keyframes openingShards {
      0%,100% { transform: translateY(0) rotate(0deg); opacity: .78; }
      50% { transform: translateY(-8px) rotate(4deg); opacity: 1; }
    }
    @keyframes openingPulse {
      0%,100% { transform: scale(.92); opacity: .42; }
      50% { transform: scale(1.04); opacity: .94; }
    }
    @keyframes openingFloat {
      0%,100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-6px) scale(1.03); }
    }
    @keyframes openingSweep {
      0% { transform: translateX(-120%); }
      100% { transform: translateX(320%); }
    }
    @keyframes openingFadeScale {
      0%,100% { transform: translate(-50%, -50%) scale(.985); opacity: .82; }
      50% { transform: translate(-50%, -50%) scale(1.02); opacity: 1; }
    }
    .opening-preview-shell {
      border: 1px solid ${palette.border};
    }
  `}</style>
);
