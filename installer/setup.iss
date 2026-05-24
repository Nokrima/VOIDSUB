; Inno Setup Script - Virel V2
[Setup]
AppName=Virel V2
AppVersion=2.0.0
DefaultDirName={autopf}\VirelV2
DefaultGroupName=Virel V2
UninstallDisplayIcon={app}\OCRTranslatorV2.exe
OutputDir=..\dist
OutputBaseFilename=Virel_V2_Setup
Compression=lzma
SolidCompression=yes
; Yönetici izni iste (Program Files'a kurmak ve bellek okuma/hook işlemleri için)
PrivilegesRequired=admin

[Files]
; Ana derlenmiş Python programı
Source: "..\dist\OCRTranslatorV2\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs


[Icons]
Name: "{group}\Virel V2"; Filename: "{app}\OCRTranslatorV2.exe"
Name: "{commondesktop}\Virel V2"; Filename: "{app}\OCRTranslatorV2.exe"

[UninstallDelete]
; Program silinirken programın sonradan oluşturduğu dinamik klasörleri de temizle
Type: filesandordirs; Name: "{app}\logs"
Type: filesandordirs; Name: "{app}\models"

