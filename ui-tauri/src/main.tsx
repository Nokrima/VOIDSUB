import ReactDOM from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import './styles/global.css';

// Kök seviyede global tuş ve arayüz kısıtlamaları
document.addEventListener('keydown', (e) => {
  // F5 (Yenile), Ctrl+R (Yenile) ve Tab (Sekme Gezinmesi) tuşlarını engelle. (F12 Test için açık bırakıldı)
  if (
    e.key === 'F5' || 
    (e.ctrlKey && e.key.toLowerCase() === 'r') || 
    e.key === 'Tab'
  ) {
    e.preventDefault();
  }
});

// İmleç bekleyince açılan (title) can sıkıcı native ipucu kutularını tamamen yok et
document.addEventListener('mouseover', (e) => {
  const target = e.target as HTMLElement;
  if (target && target.hasAttribute && target.hasAttribute('title')) {
    target.removeAttribute('title');
  }
});

// Sağ tık (İçerik Menüsü) penceresini tamamen kapat
// (TEST AMACIYLA SAĞ TIK ŞİMDİLİK AÇIK BIRAKILDI)
// document.addEventListener('contextmenu', (e) => e.preventDefault());

// Orta veya Sağ tık ile butonlara basıldığında oluşan gereksiz 'tıklanma' görsel efektlerini engelle
document.addEventListener('mousedown', (e) => {
  // 0: Sol, 1: Orta, 2: Sağ. Sol tık harici bir tuşa basıldıysa:
  if (e.button !== 0) {
    const target = e.target as HTMLElement;
    // Tıklanan öğe bir buton ise varsayılan basılma (active) eylemini iptal et.
    // (Orta tıklama boş bir alana yapıldığında kaydırma -auto scroll- çalışmaya devam eder)
    if (target.closest('button')) {
      e.preventDefault();
    }
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
