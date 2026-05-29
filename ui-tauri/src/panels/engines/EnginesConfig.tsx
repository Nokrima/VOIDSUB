import type { HardwareResult, AppSettingsPayload, TranslationStatePayload, OcrFrameStatPayload, OfflineModelDetails, OfflineStatusPayload, OfflineModelAction, EngineHardwareInfo, HealthCheckItem, EngineModelItem, PerfEstimateItem, OfflineLangModelItem, MotorDurumuProps, EngineInfoKey } from './EnginesTypes';
import {EngineInfoDock} from './components/EngineInfoDock';
import {MotorDurumu} from './components/MotorDurumu';

export const colors = {
  accent: '#7dd3fc',
  success: '#86efac',
  error: '#f87171',
  warning: '#fcd34d',
  muted: 'rgba(159,183,207,0.6)',
  textPrimary: '#fff',
  bgGlass: 'rgba(255,255,255,0.03)',
  borderGlass: '1px solid rgba(255,255,255,0.05)',
};


export const TS = {
  boxTitle: { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.14em', fontWeight: 700, color: 'rgba(191,215,242,0.72)' },
  pageTitle: { fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.18em', fontWeight: 700, color: 'rgba(125,211,252,0.55)', margin: 0 },
  pageSub: { fontSize: 13, fontWeight: 400, color: 'rgba(159,183,207,0.55)', marginTop: 4 },
  primary: { color: colors.textPrimary, fontWeight: 600, fontSize: 13 },
};


export const G = ({ p, stroke = colors.accent }: { p: string; stroke?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" style={{ width: 18, height: 18 }}>
    <path d={p} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);


export const engineInfoContent: Record<EngineInfoKey, { title: string; desc: string; detail1: string; detail2: string; detail3: string; }> = {
  overview: {
    title: 'Sistem Paneli',
    desc: 'Uygulamanın tüm çeviri ve analiz altyapısını buradan yönetebilirsiniz.',
    detail1: 'İhtiyacınıza uygun metin tarama motorunu sol menüden seçin.',
    detail2: 'İlgili motorun eklentileri ve dil modelleri sağ tarafta listelenir.',
    detail3: 'Canlı performans değerleri (FPS, gecikme, GPU) alt kısımda yer alır.'
  },
  engine_selection: {
    title: 'Görüntü İşleme Motoru',
    desc: 'Ekrandaki yazıları algılayacak çekirdek teknolojiyi belirler.',
    detail1: 'WindowsOCR: Ek bir kurulum gerektirmez, ultra hızlı ve hafiftir.',
    detail2: 'Easy Motoru: Yapay zeka desteklidir, zorlu yazılar için kusursuz bir isabete sahiptir.',
    detail3: 'Seçiminiz anında devreye girerek sisteme entegre olur.'
  },
  engine_models: {
    title: 'Çekirdek Eklentileri',
    desc: 'Seçtiğiniz analiz motorunun gücünü artıran yan bileşenlerdir.',
    detail1: 'Sistem bileşenleri anında çalışmaya hazır şekilde gelir.',
    detail2: 'Bulut ikonuna sahip olanlar, tıklanarak arka planda sessizce kurulabilir.',
    detail3: 'Bu modüller donanımınızın potansiyelini sonuna kadar kullanmanızı sağlar.'
  },
  translation_models: {
    title: 'Yerel Çeviri Modelleri',
    desc: 'İnternet bağlantısı gerektirmeyen gelişmiş yapay zeka çeviri paketleridir.',
    detail1: 'Verileriniz cihaz dışına çıkmaz, %100 yerel ve gizli çalışır.',
    detail2: 'Donanımınıza uygun olanı seçtiğinizde inanılmaz bir hızla çeviri yaparlar.',
    detail3: 'Modüller tek tıkla indirilir ve istendiğinde cihazdan kaldırılabilir.'
  },
  winonly: { title: 'Windows Görsel Tarama', desc: 'Windows yerleşik donanım ivmelendirmesini kullanan standart analiz modülü.', detail1: 'Kusursuz bir şekilde entegredir, harici indirme veya kurulum gerektirmez.', detail2: 'Sistem kaynaklarını minimum düzeyde tüketerek oyun performansını korur.', detail3: 'Standart oyun fontlarında oldukça hızlı sonuç verir.' },
  easy: { title: 'Yapay Zeka Destekli Tarama', desc: 'Ekrandaki karmaşık fontları bile okuyabilen derin öğrenme modülü.', detail1: 'Stilize oyun metinlerinde veya kötü çözünürlüklerde hayat kurtarır.', detail2: 'Donanımınıza (GPU) yük bindirebilir ancak sonuçlar çok daha kesindir.', detail3: 'İleri düzey kullanıcılar ve okuması zor RPG oyunları için tasarlanmıştır.' },
  w1: { title: 'Türkçe Algılama Desteği', desc: 'Windows üzerinden Türkçe karakterlerin hatasız algılanmasını sağlar.', detail1: 'Cihazınızda zaten kuruluysa anında otomatik olarak devreye girer.', detail2: 'Eksikse, doğrudan Windows ayarlarından saniyeler içinde eklenebilir.', detail3: 'Oyun içi metinlerin dil bağımlılıklarını çözer.' },
  w2: { title: 'İngilizce Algılama Desteği', desc: 'Uluslararası oyunların temel dili olan İngilizce paketidir.', detail1: 'Sistemde her zaman aktif bulunması önerilen temel bir modüldür.', detail2: 'Olağanüstü hızlı bir tarama kapasitesi ve sıfır hata toleransı sunar.', detail3: 'Eksiksiz analiz ve çeviri zinciri için gereklidir.' },
  w3: { title: 'Japonca Algılama Desteği', desc: 'Asya menşeili oyunlar için geliştirilmiş karakter algılama paketi.', detail1: 'JRPG tarzı oyunlarda doğru metin analizi için zorunludur.', detail2: 'Gelişmiş Kanji ve Kana tanıma özelliklerini aktif eder.', detail3: 'Etkinleştirildiğinde Asya fontlarında yüksek başarı oranı sağlar.' },
  m1: { title: 'Gelişmiş Görüntü Analizi', desc: 'Ekrandaki metinleri algılayıp dijital verilere dönüştüren ana zeka motorudur.', detail1: 'Görüntü kalitesinden bağımsız olarak üst düzey bir okuma yeteneği sunar.', detail2: 'Tüm görüntü analiz görevlerinin kalbidir.', detail3: 'Tek tıkla indirilir ve arka planda sorunsuzca devreye girer.' },
  m2: { title: 'Donanım Hızlandırma (GPU)', desc: 'Ekran kartınızın gücünü serbest bırakarak analiz işlemlerini uçuşa geçirir.', detail1: 'Sadece uyumlu NVIDIA kartlarıyla tam performans (Süper hızlı) çalışır.', detail2: 'Sistem kaynaklarına nefes aldırır ve gecikmeyi milisaniyelere düşürür.', detail3: 'Eksik olduğunda sistem hız keserek işlemci (CPU) modunu tercih eder.' },
  m3: { title: 'Stilize Metin Modülü', desc: 'El yazısı stiline sahip karmaşık oyun fontlarını çözen ekstra paket.', detail1: 'Geleneksel RPG veya bağımsız (Indie) oyunlarda mükemmel çalışır.', detail2: 'Klasik okuma sistemlerinden daha farklı ve esnek bir algoritma kullanır.', detail3: 'Sadece ihtiyaç duyduğunuzda indirip aktif edebilirsiniz.' },
  opus_mt_en_tr: { title: 'Gelişmiş Çeviri Zekası (Hızlı)', desc: 'İngilizceden Türkçeye anında, kusursuz ve yerel çeviri sağlayan optimize ağ.', detail1: 'Hiçbir uzak sunucuya bağlanmaz, tamamen cihazınızda çalışır.', detail2: 'Yüksek hız ve mantıklı cümle kurulumları ile oyun diyalogları için idealdir.', detail3: 'İnternetiniz kopsa bile kesintisiz bir deneyim yaşatır.' },
  nllb: { title: 'Evrensel Çeviri Zekası (Ağır)', desc: 'Çok sayıda dili aynı anda algılayabilen, devasa bir çeviri beyni.', detail1: 'İngilizce dışındaki diğer küresel dilleri de yüksek başarıyla Türkçeye çevirir.', detail2: 'Dosya boyutu ve donanım gereksinimi diğer modellere kıyasla daha ağırdır.', detail3: 'Size en doğal ve akıcı çeviri deneyimini sunma garantisi verir.' }
};


