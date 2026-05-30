import {
  CalibrationControlKey,
  CalibrationControlConfig,
  CalibrationValues,
  CalibrationInfoKey,
  CalibrationInfoContent,
} from "./CalibrationTypes";

export const labelStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "rgba(191, 215, 242, 0.72)",
  fontWeight: 700,
};

export const titleStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#9fb7cf",
  fontWeight: 500,
  lineHeight: 1.45,
  letterSpacing: "-0.01em",
};

export const shellStyle: React.CSSProperties = {
  borderRadius: 18,
  background: "rgba(5, 9, 14, 0.42)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  minHeight: 0,
  overflow: "hidden",
};

export const previewShellStyle: React.CSSProperties = {
  minHeight: 0,
  borderRadius: 24,
  background: "rgba(255,255,255,0.045)",
  overflow: "hidden",
};

export const calibrationGroupTitleStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 650,
  color: "#d9e9fb",
  letterSpacing: "-0.01em",
};

export const calibrationHintTextStyle: React.CSSProperties = {
  fontSize: 10.5,
  lineHeight: 1.45,
  color: "rgba(159, 183, 207, 0.78)",
};

export const calibrationSettingsGridStyle: React.CSSProperties = {
  minHeight: "100%",
  width: "clamp(700px, 86%, 780px)",
  maxWidth: "100%",
  justifySelf: "center",
  marginInline: "auto",
  boxSizing: "border-box",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  columnGap: 22,
  rowGap: 0,
  alignItems: "start",
  alignContent: "center",
  paddingInline: 16,
};

export const calibrationControls: Record<
  CalibrationControlKey,
  CalibrationControlConfig
> = {
  sensitivity: {
    key: "sensitivity",
    label: "Hassasiyet",
    min: 0,
    max: 100,
    step: 5,
    unit: "%",
    initial: 40,
    accentStart: "#38bdf8",
    accentEnd: "#22c55e",
    glow: "rgba(56,189,248,0.30)",
  },
  characters: {
    key: "characters",
    label: "Karakter",
    min: 1,
    max: 20,
    step: 1,
    unit: "adet",
    initial: 5,
    accentStart: "#60a5fa",
    accentEnd: "#818cf8",
    glow: "rgba(96,165,250,0.30)",
  },
  balance: {
    key: "balance",
    label: "Denge",
    min: 1,
    max: 8,
    step: 1,
    unit: "örnek",
    initial: 2,
    accentStart: "#94a3b8",
    accentEnd: "#e2e8f0",
    glow: "rgba(148,163,184,0.24)",
  },
  attempts: {
    key: "attempts",
    label: "Deneme",
    min: 1,
    max: 8,
    step: 1,
    unit: "varyant",
    initial: 4,
    accentStart: "#f59e0b",
    accentEnd: "#facc15",
    glow: "rgba(245,158,11,0.26)",
    dependsOnImageFilters: true,
  },
  match: {
    key: "match",
    label: "Uyum",
    min: 0,
    max: 100,
    step: 2,
    unit: "%",
    initial: 42,
    accentStart: "#a78bfa",
    accentEnd: "#38bdf8",
    glow: "rgba(167,139,250,0.28)",
    dependsOnImageFilters: true,
  },
  claheStriped: {
    key: "claheStriped",
    label: "CLAHE Şeritli",
    min: 1,
    max: 5,
    step: 0.1,
    unit: "seviye",
    initial: 2,
    decimals: 1,
    accentStart: "#8b5cf6",
    accentEnd: "#22d3ee",
    glow: "rgba(139,92,246,0.28)",
    dependsOnImageFilters: true,
  },
  clahePlain: {
    key: "clahePlain",
    label: "CLAHE Şeritsiz",
    min: 1,
    max: 5,
    step: 0.1,
    unit: "seviye",
    initial: 3.5,
    decimals: 1,
    accentStart: "#7c3aed",
    accentEnd: "#60a5fa",
    glow: "rgba(124,58,237,0.27)",
    dependsOnImageFilters: true,
  },
  whiteThreshold: {
    key: "whiteThreshold",
    label: "Beyaz Eşiği",
    min: 0,
    max: 255,
    step: 5,
    unit: "seviye",
    initial: 110,
    accentStart: "#facc15",
    accentEnd: "#fb7185",
    glow: "rgba(250,204,21,0.24)",
    dependsOnImageFilters: true,
  },
  bilateral: {
    key: "bilateral",
    label: "Bilateral",
    min: 1,
    max: 15,
    step: 2,
    unit: "px",
    initial: 9,
    accentStart: "#14b8a6",
    accentEnd: "#38bdf8",
    glow: "rgba(20,184,166,0.26)",
    dependsOnImageFilters: true,
  },
  gaussianC: {
    key: "gaussianC",
    label: "Gaussian C",
    min: 0,
    max: 20,
    step: 1,
    unit: "seviye",
    initial: 8,
    accentStart: "#22c55e",
    accentEnd: "#84cc16",
    glow: "rgba(34,197,94,0.24)",
    dependsOnImageFilters: true,
  },
  meanC: {
    key: "meanC",
    label: "Mean C",
    min: 0,
    max: 20,
    step: 1,
    unit: "seviye",
    initial: 6,
    accentStart: "#10b981",
    accentEnd: "#60a5fa",
    glow: "rgba(16,185,129,0.24)",
    dependsOnImageFilters: true,
  },
};

export const initialCalibrationValues = Object.values(
  calibrationControls,
).reduce((values, item) => {
  values[item.key] = item.initial;
  return values;
}, {} as CalibrationValues);

export const calibrationInfoContent: Record<
  CalibrationInfoKey,
  CalibrationInfoContent
> = {
  overview: {
    title: "Gelişmiş Kalibrasyon Asistanı",
    what: "İmlecinizi üzerinde beklettiğiniz herhangi bir ayarın sisteminize tam olarak ne etki ettiğini açıklar.",
    lower: "Çubuğu sola çekmek: Ayarın etkisini yumuşatır ve sistemi esnetir.",
    higher:
      "Çubuğu sağa çekmek: Ayarın etkisini keskinleştirir ve katılaştırır.",
    mode: "Bilgi asistanı açıkken tüm ayarları fare tekerleğiyle hızlıca değiştirebilirsiniz.",
  },
  groupDecision: {
    title: "Algılama Karar Motoru",
    what: "Yapay zekanın ekrandaki karmaşık piksellerin gerçekten bir yazı olup olmadığına karar verme sürecidir.",
    lower:
      "Daha agresif algılama: Çok hızlı sonuç verir ancak bazen alakasız şekilleri metin sanabilir.",
    higher:
      "Daha seçici algılama: Yalnızca kesin emin olduğu metinleri onaylar, kalite artar ama hız düşebilir.",
    mode: "Bu ayar grubu sistemin temel güvenilirlik eşiğini belirler.",
  },
  groupFlow: {
    title: "Veri Akış Yönetimi",
    what: "Görüntülerin hangi filtrelerden geçip çeviri zekasına nasıl besleneceğini organize eder.",
    lower:
      "Hafif Akış: Sistemi yormaz, standart metinlerde çok hızlıdır ancak kötü çözünürlüklerde bocalayabilir.",
    higher:
      "Derin Akış: Görüntüyü defalarca analiz eder. İşlem gücü gerektirir ama mükemmel sonuç verir.",
    mode: "Görüntü filtreleri aktif olduğunda devasa bir etki yaratır.",
  },
  groupScene: {
    title: "Sahne ve Kontrast Zekası",
    what: "Zorlu arka planlarda yazıyı oyunun renk cümbüşünden koparıp almak için zıtlık algısını yönetir.",
    lower:
      "Doğal Sahne: Oyunun renklerine müdahale etmez ancak şeffaf yazıları okumakta zorlanabilir.",
    higher:
      "Keskin Sahne: Yazıyı arka plandan adeta kazıyarak ayırır. Okunabilirlik zirveye çıkar.",
    mode: "Özellikle oyun içi diyalog balonlarında şeritsiz mod ile kullanıldığında hayat kurtarır.",
  },
  groupImage: {
    title: "Görüntü Ön İşleme",
    what: "Kalitesiz veya bozuk oyun görüntülerini analiz zekasına yollamadan önce temizleme işlemidir.",
    lower:
      "Minimal Dokunuş: Pikselleri orijinal haline sadık bırakır. Hafif kirlilikler ekranda kalabilir.",
    higher:
      "Agresif Temizlik: Kumlanmayı ve gürültüyü silip atar. Ancak çok ince fontları biraz yumuşatabilir.",
    mode: "Piksel (Retro) veya bulanık dokulu oyunlarda sistemin en büyük yardımcısıdır.",
  },
  sensitivity: {
    title: "Algı Hassasiyeti",
    what: "Sistemin ekrandaki belirsiz şekillere karşı ne kadar uyanık davranacağını kontrol eder.",
    lower:
      "Esnek Algı: Sistemin refleksleri hızlanır ancak okuma hataları sıklaşabilir.",
    higher:
      "Katı Algı: Sadece jilet gibi net olan yazıları çeviriye yollar. Güvenilirlik maksimize edilir.",
    mode: "Genel tarama başarısını doğrudan etkileyen en temel kalibrasyon değeridir.",
  },
  characters: {
    title: "Minimum Karakter Bariyeri",
    what: "Ekranda beliren anlamsız kısa harf veya sembol kalıntılarının çeviriye sızmasını engeller.",
    lower:
      "Bariyer İner: Kısa seslenişleri kaçırmaz ama ekran çöp okumalarla dolabilir.",
    higher:
      "Bariyer Kalkar: Sadece uzun ve anlamlı kelimelere odaklanır. Kısa kelimeler atlanabilir.",
    mode: "Oyun içi arayüz metinlerini (HP, MP gibi) filtrelemek için mükemmeldir.",
  },
  balance: {
    title: "Görüntü Dengeleyici",
    what: "Oyun içi kameralar hareket ederken yazıların ekranda titremesini ve sürekli yanıp sönmesini engeller.",
    lower:
      "Hızlı Tepki: Yazı ekrana düştüğü an yakalanır ama kamera dönerken çok fazla titreme yapar.",
    higher:
      "Stabil Akış: Yazının ekranda netleşmesini bekler. Pürüzsüz ama bir tık geç bir okuma sunar.",
    mode: "Aksiyonu ve kamera hareketi bol olan 3D oyunlarda şiddetle önerilir.",
  },
  attempts: {
    title: "Analiz Bütçesi (Deneme)",
    what: "Zorlu bir metinle karşılaşıldığında yapay zekanın onu çözmek için ne kadar efor sarf edeceğini belirler.",
    lower:
      "Tasarruf Modu: Sisteme nefes aldırır. İşlemi ilk denemede çözer veya vazgeçer.",
    higher:
      "Zorlayıcı Mod: Anlaşılması güç yazıları bile çözene kadar farklı filtrelerle tekrar tekrar dener.",
    mode: "Sistem donanımınıza (CPU/GPU) doğrudan yük bindiren güçlü bir ayardır.",
  },
  match: {
    title: "Sahne Uyum Eşiği",
    what: "Seçtiğiniz ayar profilinin, o anki ekran görüntüsüyle ne kadar uyuştuğunu denetler.",
    lower:
      "Toleranslı: Sahne çok farklı olsa da okumaya çalışır. Yanlış okuma ihtimali artar.",
    higher:
      "Kesin Uyum: Yalnızca kalibrasyonunuza birebir uyan sahnelerde devreye girer. Taviz vermez.",
    mode: "Otomatik mod geçişlerinin ve sahne ayrımının kilit noktasıdır.",
  },
  claheStriped: {
    title: "Dinamik Kontrast (Şeritli)",
    what: "Diyalog kutuları ve arka plan şeritleri üzerindeki yazıları aydınlatarak gölgelerden kurtarır.",
    lower:
      "Doğal Görünüm: Şeridin orijinal ışığını bozmaz ancak karanlık metinler zor okunur.",
    higher:
      "Aydınlatılmış: Yazıyı adeta spot ışığı altına alır. Kontrast mükemmeldir ancak şerit parlayabilir.",
    mode: "Görsel romanlar (Visual Novel) ve diyalog pencerelerinde harikalar yaratır.",
  },
  clahePlain: {
    title: "Dinamik Kontrast (Şeritsiz)",
    what: "Arkası şeffaf olan serbest oyun metinlerini çevresel ışıklardan ayırarak netleştirir.",
    lower:
      "Ham Görüntü: Atmosferi korur fakat metin çevre dokularına karışıp kaybolabilir.",
    higher:
      "Agresif Ayrım: Metni çevreden kopararak vurgular. Ancak oyunun kendi dokuları da bozulabilir.",
    mode: "Açık dünya oyunlarındaki eşya veya görev yazıları için tasarlanmıştır.",
  },
  whiteThreshold: {
    title: "Işıltı Eşiği (Beyazlık)",
    what: "Sistemin parlak renkli yazıları çevredeki diğer objelerden ayırt etmesini sağlar.",
    lower:
      "Kapsayıcı: Soluk yazıları kabul eder ancak gökyüzü gibi alanları yazı sanabilir.",
    higher:
      "Seçici: Yalnızca en parlak ve net beyaz yazıları hedef alır. Güvenilirdir.",
    mode: "Arkası şeffaf sahnelerde beyaz/parlak metinleri yakalamak için idealdir.",
  },
  bilateral: {
    title: "Doku Pürüzsüzleştirme",
    what: "Oyun içi pikselleri ve kumlanmayı temizlerken harflerin kenarlarını jilet gibi keskin tutar.",
    lower:
      "Keskin Kenarlar: Harflerin detayları korunur ama çevresel kumlanma algıyı zorlaştırabilir.",
    higher:
      "Pürüzsüz Yüzey: Tüm gürültü yağ gibi akıp gider ancak ince harfler eriyip bulanıklaşabilir.",
    mode: "Özellikle eski (Retro/Pixel) oyunlardaki görsel pürüzleri yok etmek için birebirdir.",
  },
  gaussianC: {
    title: "Gölge Ayrıştırma Sertliği",
    what: "Yazıların etrafındaki gölgelendirmeleri ve dış hat (outline) efektlerini filtreleme şiddetidir.",
    lower:
      "Sert Kesim: Dış hatları acımasızca siler. Zayıf fontlar parçalanabilir.",
    higher:
      "Yumuşak Geçiş: Gölgelere tolerans tanır ancak kalın dış hatlar yazıya karışıp hata yaratabilir.",
    mode: "Etrafı siyah çerçeveli fantastik oyun fontları için hayat kurtarır.",
  },
  meanC: {
    title: "Bölgesel Zıtlık Toleransı",
    what: "Ekranın farklı noktalarındaki ışık değişimlerine yapay zekanın nasıl adapte olacağını belirler.",
    lower:
      "Dar Tolerans: Sadece yüksek zıtlığa sahip net yazıları yakalar. Soluk kısımlar okunmaz.",
    higher:
      "Geniş Tolerans: Karanlık köşelerdeki yazıları aydınlatır ama dokuları metin zannedebilir.",
    mode: "Karanlık mağaralar veya aydınlık gökyüzü gibi dengesiz ışıklı sahneler için kusursuzdur.",
  },
};
