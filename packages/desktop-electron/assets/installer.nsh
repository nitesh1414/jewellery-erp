!include "FileFunc.nsh"

/**
 * Jewellery ERP — NSIS installer customization
 *
 * 1. Pre-seed the subscription key at installation time (used mostly for
 *    silent/enterprise installs):
 *
 *      ShriJewellersERP-Setup-1.0.0.exe /S /LICENSEKEY=JERP-XXXXX-XXXXX-XXXXX-XXXXX
 *
 *    The key is written to %APPDATA%\Shri Jewellers ERP\pending-license-key.txt
 *    and the app activates it automatically on first launch.
 *
 * 2. For interactive installs the installer launches the app at the end
 *    ("Run after finish") and the activation screen appears immediately —
 *    that is the normal "activate during installation" flow.
 */
!macro customInstall
  ClearErrors
  ${GetParameters} $R9
  ${GetOptions} $R9 "/LICENSEKEY=" $R8
  ${IfNot} ${Errors}
  ${AndIf} $R8 != ""
    CreateDirectory "$APPDATA\Shri Jewellers ERP"
    FileOpen $R7 "$APPDATA\Shri Jewellers ERP\pending-license-key.txt" w
    FileWrite $R7 "$R8"
    FileClose $R7
    DetailPrint "License key pre-seeded — the app will activate on first launch."
  ${EndIf}
!macroend
