; ---------------------------------------------------------------------------
; Jewellery ERP — NSIS installer customization
;
; electron-builder includes this file at the very top of the generated
; installer script (before MUI2 / LogicLib are pulled in), so every include it
; needs is requested explicitly here. Keep it plain NSIS 3 — no plugins — so it
; compiles with the makensis that ships in the electron-builder cache.
;
; 1. Pre-seed the subscription key at installation time (silent / enterprise
;    installs):
;
;      ShriJewellersERP-Setup-1.0.0.exe /S /LICENSEKEY=JERP-XXXXX-XXXXX-XXXXX-XXXXX
;
;    The key is written to %APPDATA%\Shri Jewellers ERP\pending-license-key.txt
;    (the same folder Electron uses for userData). The app activates it
;    automatically on first launch and then deletes the file.
;
; 2. Interactive installs simply launch the app at the end ("Run after
;    finish") and the activation screen appears — the normal activation flow.
; ---------------------------------------------------------------------------

!include "LogicLib.nsh"   ; ${If} / ${IfNot} / ${AndIf}
!include "FileFunc.nsh"   ; ${GetParameters} / ${GetOptions}

!macro customInstall
  ; --- /LICENSEKEY=… (optional, mainly for silent installs) ----------------
  ${GetParameters} $R9
  ClearErrors
  ${GetOptions} $R9 "/LICENSEKEY=" $R8

  ${IfNot} ${Errors}
    ${If} $R8 != ""
      CreateDirectory "$APPDATA\Shri Jewellers ERP"
      FileOpen $R7 "$APPDATA\Shri Jewellers ERP\pending-license-key.txt" w
      ${IfNot} ${Errors}
        FileWrite $R7 "$R8"
        FileClose $R7
        DetailPrint "License key pre-seeded — the app will activate on first launch."
      ${Else}
        DetailPrint "Warning: could not store the license key (APPDATA not writable)."
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
