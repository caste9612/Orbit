; Hook dell'installer NSIS di Orbit (tauri.conf.json → bundle.windows.nsis.installerHooks).
;
; Fino alla v0.8.9 Orbit si associava anche agli script (.bat .cmd .ps1 .sh .bash). L'installer di
; Tauri non si limita ad "Apri con": diventa il gestore PREDEFINITO dell'estensione
; (HKCU\Software\Classes\.ext = "Orbit document", il valore precedente in "Orbit document_backup")
; e, dove Windows non ha una scelta utente sopra, il doppio clic su un .bat apriva Orbit invece di
; eseguirlo. Dalla v0.8.10 gli script non sono più associati: qui si ripulisce ciò che una versione
; precedente ha lasciato, SOLO nelle chiavi che Orbit ha toccato (quelle col suo valore di backup).
; Si ripristina il gestore originale se c'era, altrimenti si toglie il valore predefinito, così torna
; a valere quello di sistema (es. batfile). Va tolto anche il valore VUOTO che il vecchio
; disinstallatore lascia (APP_UNASSOCIATE riscrive il backup, "" se non c'era nulla, invece di
; cancellare): un predefinito vuoto in HKCU nasconderebbe quello di sistema.

!macro ORBIT_UNASSOCIATE_LEGACY EXT
  ClearErrors
  ReadRegStr $R7 SHCTX "Software\Classes\.${EXT}" "Orbit document_backup"
  ${IfNot} ${Errors}
    ReadRegStr $R8 SHCTX "Software\Classes\.${EXT}" ""
    ${If} $R8 == "Orbit document"
    ${OrIf} $R8 == ""
      ${If} $R7 == ""
        DeleteRegValue SHCTX "Software\Classes\.${EXT}" ""
      ${Else}
        WriteRegStr SHCTX "Software\Classes\.${EXT}" "" "$R7"
      ${EndIf}
    ${EndIf}
    DeleteRegValue SHCTX "Software\Classes\.${EXT}" "Orbit document_backup"
    DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Push $R7
  Push $R8
  !insertmacro ORBIT_UNASSOCIATE_LEGACY "bat"
  !insertmacro ORBIT_UNASSOCIATE_LEGACY "cmd"
  !insertmacro ORBIT_UNASSOCIATE_LEGACY "ps1"
  !insertmacro ORBIT_UNASSOCIATE_LEGACY "sh"
  !insertmacro ORBIT_UNASSOCIATE_LEGACY "bash"
  Pop $R8
  Pop $R7
  ; avvisa la shell che le associazioni sono cambiate (SHCNE_ASSOCCHANGED)
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
