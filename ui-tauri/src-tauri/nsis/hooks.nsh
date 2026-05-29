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
!macroend

!macro customUnInstall
  ; Temizlenecek baska ozel ayar varsa buraya eklenebilir.
!macroend
