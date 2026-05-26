# Virel V2 — Yeni Sürüm (Release) Yayınlama Kılavuzu

Projeye yeni özellikler ekledikten, arayüzü veya arka plan kodlarını değiştirdikten sonra **yeni bir güncelleme** yayınlamak için aşağıdaki adımları sırasıyla, hiçbirini atlamadan uygulamanız gerekmektedir.

---

## ADIM 1: Sürüm Numarasını Güncellemek
Uygulamanızın sürümünü (örneğin v2.5.0'dan v2.6.0'a) artırmak için iki dosyada değişiklik yapın:
1. **`ui-tauri\src-tauri\tauri.conf.json`** dosyasını açın.
   - `"version": "2.5.0"` kısmını yeni sürümünüzle (örn. `"2.6.0"`) değiştirin.
2. *(Opsiyonel)* Eğer arayüzde (SettingsPanel vb.) manuel olarak yazılı bir versiyon numarası varsa onu da güncelleyin.

---

## ADIM 1.5: Değişiklik Tespiti (Nuitka Kararı)
Güncellemeyi derlemeden önce, gereksiz yere 20 dakika beklememek için **hangi dosyalarda değişiklik yaptığınızı** tespit edin.
VS Code terminalinde şu komutu çalıştırarak değişen dosyaları görün:
```powershell
git status
```
- Eğer değişen dosyalar **SADECE** `ui-tauri/` klasörü içindeyse (React, CSS, TSX dosyaları): **ADIM 2'yi (Nuitka) ATLAYIN.** Doğrudan ADIM 3'e geçin.
- Eğer değişen dosyalar içinde `core/` klasörü, `main.py`, `.py` uzantılı dosyalar veya `build-python.ps1` varsa: **ADIM 2'yi ÇALIŞTIRMAK ZORUNDASINIZ.**

---

## ADIM 2: Python Çekirdeğini Derlemek (Nuitka)
> **💡 ÖNEMLİ NOT:** Sadece Python (`.py`) dosyalarında değişiklik yaptıysanız bu adımı çalıştırın. Yeni Python kodlarının "Makine diline çevrilmesi ve şifrelenmesi" işlemi yaklaşık 15-20 dk sürer.

1. VS Code terminalini açın.
2. Aşağıdaki komutu çalıştırın:
   ```powershell
   .\scripts\build-python.ps1
   ```
3. İşlem bittiğinde `virel-core.exe` başarıyla kopyalandı mesajını görmelisiniz.

---

## ADIM 3: Arayüzü ve Kurulum (Setup) Dosyasını Derlemek (Tauri)
Bu adımda hem React arayüzünüz birleştirilir hem de "Updater" (Güncelleyici) için imzalı bir NSIS kurulum `.exe` dosyası üretilir.

1. Terminalde `ui-tauri` klasörüne geçin:
   ```powershell
   cd ui-tauri
   ```
2. Güvenlik ve İmza (Signing) şifrelerinizi sisteme tanıtın ve derlemeyi başlatın. Aşağıdaki kod bloğunu **tek seferde kopyalayıp** terminale yapıştırın:
   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = "dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJXUlRZMEl5eUdrNldlZDBMZWlvV3Q0VnBTdXlqR28yTzFCdEpTWUJjeG42UjY2eFE0OEFBQkFBQUFBQUFBQUFBQUlBQUFBQW9GL3ljQ3JEcXhYbHdtZWhVQWNxeDhPTlFkSnBLSmViUjZiWVpScGZVT1FGUmVzZlJ5NXRCZ1NYaU1mME9WaTh0T2I4aGNkeTJSZTQ2bkRVa2ZVemZUZEE3cmxpODVucUdVU1pnYnczbmYyeDh6NjFOL3I3akV1SzNMYlZRM2tKa1hOb3hCSVhPMzg5Cg=="
   
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "VireL@2026!Key#Secure"
   
   npm run tauri build
   ```
3. İşlem (yaklaşık 2-3 dakika) bittiğinde size şu dosyaları üretecektir:
   - `ui-tauri\src-tauri\target\release\bundle\nsis\Virel V2_x.x.x_x64-setup.exe`
   - `ui-tauri\src-tauri\target\release\bundle\nsis\Virel V2_x.x.x_x64-setup.exe.sig`

---

## ADIM 4: GitHub "virel-updater" Reposuna Yükleme
Bu aşama, kullanıcıların program içinden "Güncellemeleri Denetle" butonuna bastığında yeni sürümü indirip kurabilmesi için gereklidir.

1. İnternet tarayıcınızdan **virel-updater** (Nokrima/virel-updater) reposuna gidin.
2. Sağ taraftan **Releases** sekmesine tıklayıp **"Draft a new release"** (Yeni sürüm oluştur) butonuna basın.
3. Tag kısmına yeni versiyonu yazın (Örn: `v2.6.0`).
4. **Attach binaries by dropping them here** yazan kutuya, 3. adımda üretilen **`Virel V2_x.x.x_x64-setup.exe`** dosyasını sürükleyip bırakın (Yüklenmesini bekleyin).
5. Yükleme bitince yeşil **Publish release** butonuna tıklayıp sürümü yayınlayın.

---

## ADIM 5: Manifest Güncelleme (Publish Script)
Son adım! Kullanıcıların uygulamalarına "Yeni sürüm var!" sinyalini göndermek için `latest.json` dosyasını otomatik olarak güncelleyeceğiz.

1. VS Code terminalinde tekrar ana proje dizinine (Virel klasörüne) dönün:
   ```powershell
   cd ..
   ```
2. Yayınlama scriptini yeni versiyonunuzla birlikte çalıştırın. (Parametre olarak yeni versiyonunuzu ve kısa bir güncelleme notunu yazın):
   ```powershell
   .\scripts\publish-update.ps1 -Version "2.6.0" -Notes "Arayuze yeni panel eklendi ve ceviri hizlandirildi."
   ```
3. Bu script otomatik olarak `.sig` (imza) dosyanızı okuyacak, `latest.json` dosyasını oluşturacak ve `virel-updater` reposuna Push'layacaktır.

**🎉 TEBRİKLER! YENİ GÜNCELLEME TÜM KULLANICILARA GÖNDERİLDİ!**
Eski kullanıcılar uygulamayı açtığında yeni sürüm uyarısı alacak, yeni kuracak kişiler ise doğrudan güncel sürümü indirebilecektir.
