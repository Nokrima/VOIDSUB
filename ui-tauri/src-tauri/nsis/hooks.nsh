!macro preInit
  ; Kurulum baslamadan once arka planda calisan virel-core ve ana uygulamayi zorla kapat
  ExecWait 'taskkill /F /IM voidsub-core.exe /T'
  ExecWait 'taskkill /F /IM VOIDSUB.exe /T'
!macroend

!macro preInstall
  ; Dosyalar kopyalanmadan hemen once tekrar kapatalim
  ExecWait 'taskkill /F /IM voidsub-core.exe /T'
  ExecWait 'taskkill /F /IM VOIDSUB.exe /T'
!macroend

!macro postInstall
  ; Visual C++ Redistributable 2015-2022 kontrolu ve kurulumu
  ; Sistem kaydinda varligi kontrol et (x64)
  ReadRegDword $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" "Installed"
  ${If} $0 != 1
    ; VC++ kurulu degil — sessizce kur
    ExecWait '"$INSTDIR\bin\vc_redist.x64.exe" /install /quiet /norestart'
  ${EndIf}
  ; Firewall izinlerini ekle (Sessizce)
  ExecWait 'netsh advfirewall firewall add rule name="VoidSub Application" dir=in action=allow program="$INSTDIR\VOIDSUB.exe" enable=yes'
  ExecWait 'netsh advfirewall firewall add rule name="VoidSub Python Engine" dir=in action=allow program="$INSTDIR\python_embedded\python.exe" enable=yes'
!macroend

!macro customUnInstall
  ; Kalinti firewall izinlerini temizle
  ExecWait 'netsh advfirewall firewall delete rule name="VoidSub Application"'
  ExecWait 'netsh advfirewall firewall delete rule name="VoidSub Python Engine"'
!macroend
